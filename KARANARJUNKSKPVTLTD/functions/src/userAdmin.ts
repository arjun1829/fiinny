import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import corsLib from 'cors';
import type { Request, Response } from 'express';

/**
 * resetTenantUserPassword — Business Admin password reset, tenant-scoped.
 *
 * Exposed as an `onRequest` HTTP function invoked through a Firebase Hosting
 * rewrite (`/api/users/reset-password`), NOT as a public callable. Hosting
 * invokes same-project functions via its own service identity, so the function
 * never needs an `allUsers` invoker binding — this is required because the org
 * policy (Domain Restricted Sharing) forbids `allUsers`. This mirrors the
 * payments.ts endpoints.
 *
 * Security model (all enforced server-side; nothing from the client is trusted):
 *  1. Caller must present a valid Firebase ID token (Authorization: Bearer …).
 *  2. Caller's role + tenant are read from `users/{callerUid}` in Firestore —
 *     NOT taken from the request payload.
 *  3. Caller must be a Business Admin (role === 'admin') of a real tenant.
 *  4. The target user's tenant is read from `users/{targetUid}` and must equal
 *     the caller's tenant. A caller can never reset a user in another tenant.
 *  5. The new password is validated, applied via the Admin SDK, and NEVER
 *     written to Firestore or logged.
 */

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'https://finny-erp-uat.web.app',
  'https://karanarjun-pvt-ltd.web.app',
  'https://fiinny.com',
];

const cors = corsLib({ origin: ALLOWED_ORIGINS, methods: ['POST', 'OPTIONS'] });

// The dedicated platform super admin identity. It never belongs to any tenant
// and must never be a target of business-user provisioning (see createBusinessUser).
const SUPER_ADMIN_EMAIL = 'superadmin@fiinny.com';

// A minimal, permissive email shape check. The authoritative validation is the
// Admin SDK createUser call, which rejects malformed addresses itself.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Verify the Firebase ID token from the Authorization header. */
async function authenticate(req: Request): Promise<admin.auth.DecodedIdToken> {
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Bearer ')) throw new HttpError(401, 'Missing or malformed Authorization header');
  try {
    return await admin.auth().verifyIdToken(header.slice(7));
  } catch {
    throw new HttpError(401, 'Invalid or expired ID token');
  }
}

export const resetTenantUserPassword = functions
  .region('asia-south1')
  .https.onRequest((req: Request, res: Response) => {
    cors(req, res, async () => {
      try {
        if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

        const decoded = await authenticate(req);
        const callerUid = decoded.uid;
        const { targetUid, newPassword } = req.body as {
          targetUid?: string;
          newPassword?: string;
        };

        if (!targetUid || typeof targetUid !== 'string') throw new HttpError(400, 'Missing target user');
        if (typeof newPassword !== 'string' || newPassword.length < 6) {
          throw new HttpError(400, 'Password must be at least 6 characters');
        }
        if (newPassword.length > 4096) throw new HttpError(400, 'Password is too long');

        const db = admin.firestore();

        // ── Resolve caller identity from the server, never from the client ──────
        const callerSnap = await db.doc(`users/${callerUid}`).get();
        const caller = callerSnap.data();
        const callerTenantId = caller?.tenantId;
        if (!caller || caller.role !== 'admin' || !callerTenantId) {
          throw new HttpError(403, 'Only a business admin can reset passwords');
        }

        // ── Verify the target belongs to the caller's tenant ───────────────────
        const targetSnap = await db.doc(`users/${targetUid}`).get();
        const target = targetSnap.data();
        if (!target) throw new HttpError(404, 'Target user not found');
        if (target.tenantId !== callerTenantId) {
          // Do not leak whether the user exists in another tenant.
          throw new HttpError(403, 'You can only reset passwords for users in your own business');
        }

        // ── Resolve the canonical Firebase Auth account for this user ───────────
        // The users/{doc} id is normally the Auth UID (staff are created via
        // setDoc(doc(db,'users', credential.user.uid))), but we deliberately do
        // NOT trust that. If a record's id ever diverges from the real Auth UID,
        // updating by the doc id would silently target the wrong account — or a
        // non-existent one — while still returning success, which is exactly the
        // "HTTP 200 but the old password still works" failure this endpoint had.
        // We resolve the account by the doc's email (the reliable bridge to Auth)
        // and update THAT uid, so the change always lands on the account the user
        // actually signs in with — in the same Firebase project this function runs
        // in (admin.initializeApp() binds to the function's own project, which is
        // the application's project).
        const targetEmail = typeof target.email === 'string' ? target.email.trim() : '';
        if (!targetEmail) {
          throw new HttpError(422, 'Target user has no email on record; cannot reset password');
        }

        let authUser: admin.auth.UserRecord;
        try {
          authUser = await admin.auth().getUserByEmail(targetEmail);
        } catch {
          throw new HttpError(404, 'No Firebase Auth account exists for this user');
        }

        // Defense-in-depth: if the resolved Auth UID differs from the doc id, the
        // resolved account must still belong to the caller's tenant per its own
        // Firestore record (guards against an email reassigned to another tenant).
        if (authUser.uid !== targetUid) {
          const resolvedSnap = await db.doc(`users/${authUser.uid}`).get();
          const resolved = resolvedSnap.data();
          if (!resolved || resolved.tenantId !== callerTenantId) {
            throw new HttpError(403, 'You can only reset passwords for users in your own business');
          }
        }

        // ── Apply the new password via the Admin SDK. Never stored/logged. ─────
        // Success is returned ONLY after updateUser resolves; any failure throws.
        try {
          await admin.auth().updateUser(authUser.uid, { password: newPassword });
        } catch (err: any) {
          functions.logger.error('[userAdmin] Password reset failed', {
            callerUid, targetUid, resolvedUid: authUser.uid, tenantId: callerTenantId, code: err?.code,
          });
          throw new HttpError(500, 'Could not reset password');
        }

        functions.logger.info('[userAdmin] Password reset', {
          callerUid, targetUid, resolvedUid: authUser.uid, tenantId: callerTenantId,
        });

        res.json({ success: true });
      } catch (err) {
        if (err instanceof HttpError) {
          res.status(err.status).json({ error: err.message });
        } else {
          functions.logger.error('[userAdmin] Unhandled error', err);
          res.status(500).json({ error: 'Internal server error' });
        }
      }
    });
  });

/**
 * createBusinessUser — Super Admin provisions a new Business Admin account.
 *
 * Exposed as an `onRequest` HTTP function (invoked directly over HTTPS and/or via
 * the Hosting rewrite `/api/admin/create-business-user`), mirroring
 * resetTenantUserPassword above.
 *
 * Why this must be a trusted backend and not the frontend:
 *   - The client SDK's createUserWithEmailAndPassword would sign the NEW user in,
 *     replacing the Super Admin's own session. The Admin SDK creates the account
 *     without ever signing anyone in.
 *   - firestore.rules only lets a user create their OWN tenantless users/{uid}
 *     doc, or an admin/analyst create one inside their own tenant. A Super Admin
 *     has no client-side write access to another user's doc, so the link must be
 *     written here with the Admin SDK.
 *
 * Security model (all server-side; nothing from the client is trusted):
 *   1. Caller must present a valid Firebase ID token carrying the `superAdmin`
 *      custom claim — the SAME source firestore.rules isSuperAdmin() reads. The
 *      email alone is never sufficient.
 *   2. The target email may NOT be the platform super admin, and the resulting
 *      account must never carry the superAdmin claim (createUser never sets it).
 *   3. The business is provisioned together with its admin, atomically:
 *        - tenants/tenant_<uid>  — the business record, with ownerId = uid and
 *          setupCompleted = false. This makes the business appear in Super Admin →
 *          Businesses IMMEDIATELY, before onboarding, and is the UID→business link
 *          the firestore.rules (isClaimingOwnNewTenant / isTenantMember) read.
 *        - users/<uid>           — role 'admin', tenantId = tenant_<uid> (pre-linked),
 *          onboardingComplete = false. The deterministic tenant id means a repeated
 *          login can never create a second business.
 *      On first login the admin is routed to /client-onboarding (gated on the
 *      tenant's setupCompleted flag, see App.tsx) to finish the business profile,
 *      after which they reach the dashboard. The Super Admin assigns the plan from
 *      the Businesses table.
 *   4. The password is applied via the Admin SDK and NEVER written to Firestore
 *      or logged.
 *   5. If the Firestore provisioning write fails after the Auth account is created,
 *      the Auth account is deleted (rollback) so no orphaned login is left behind.
 */
export const createBusinessUser = functions
  .region('asia-south1')
  .https.onRequest((req: Request, res: Response) => {
    cors(req, res, async () => {
      try {
        if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

        const decoded = await authenticate(req);
        // Authoritative super-admin gate: the token's custom claim, not the email.
        if (decoded['superAdmin'] !== true) {
          throw new HttpError(403, 'Only the platform super admin can create businesses');
        }

        const { email, password, name, businessName } = req.body as {
          email?: string;
          password?: string;
          name?: string;
          businessName?: string;
        };

        const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
        if (!cleanEmail || !EMAIL_RE.test(cleanEmail)) throw new HttpError(400, 'A valid email is required');
        if (typeof password !== 'string' || password.length < 6) {
          throw new HttpError(400, 'Password must be at least 6 characters');
        }
        if (password.length > 4096) throw new HttpError(400, 'Password is too long');

        // Never provision (or clobber) the platform super admin via this flow.
        if (cleanEmail === SUPER_ADMIN_EMAIL) {
          throw new HttpError(403, 'This email cannot be used for a business account');
        }

        const cleanName = typeof name === 'string' ? name.trim() : '';
        // The business display name shown in Super Admin → Businesses. Falls back to
        // the admin name, then the email local-part, so the row is never blank.
        const cleanBusinessName =
          (typeof businessName === 'string' && businessName.trim()) ||
          cleanName ||
          cleanEmail.split('@')[0];

        // ── Create the Firebase Auth account (no sign-in) ──────────────────────
        let authUser: admin.auth.UserRecord;
        try {
          authUser = await admin.auth().createUser({
            email: cleanEmail,
            password,
            displayName: cleanName || undefined,
          });
        } catch (err: any) {
          if (err?.code === 'auth/email-already-exists') {
            throw new HttpError(409, 'A Firebase account with this email already exists');
          }
          if (err?.code === 'auth/invalid-email') {
            throw new HttpError(400, 'A valid email is required');
          }
          if (err?.code === 'auth/invalid-password') {
            throw new HttpError(400, 'Password does not meet the minimum requirements');
          }
          functions.logger.error('[userAdmin] createBusinessUser auth create failed', {
            callerUid: decoded.uid, email: cleanEmail, code: err?.code,
          });
          throw new HttpError(500, 'Could not create the account');
        }

        const uid = authUser.uid;
        const db = admin.firestore();
        // Deterministic tenant id, identical to the one /client-onboarding uses
        // (tenant_<uid>). Because it is derived from the uid, a repeated login or a
        // retried provisioning can never fork a second business for this admin.
        const tenantId = `tenant_${uid}`;

        // ── Provision business + admin atomically. Password is NEVER stored. ────
        // Both docs are written in a single batch so the business and its admin
        // link always exist together. If the write fails, the Auth account AND any
        // docs are rolled back, so a partial failure can never leave an orphaned
        // login or a half-created business.
        const now = admin.firestore.FieldValue.serverTimestamp();
        try {
          const batch = db.batch();
          // The business record — visible in Super Admin → Businesses immediately,
          // before onboarding. setupCompleted:false routes the admin to onboarding
          // on first login; ownerId is the UID→business link the rules authorise on.
          batch.set(db.doc(`tenants/${tenantId}`), {
            businessName: cleanBusinessName,
            ownerId: uid,
            setupCompleted: false,
            createdBySuperAdmin: decoded.uid,
            createdAt: now,
            updatedAt: now,
          });
          // The admin identity, pre-linked to the business with the Business Admin role.
          batch.set(db.doc(`users/${uid}`), {
            uid,
            email: cleanEmail,
            name: cleanName || cleanEmail.split('@')[0],
            role: 'admin',
            tenantId,
            linkedId: null,
            onboardingComplete: false,
            createdBySuperAdmin: decoded.uid,
            createdAt: now,
            updatedAt: now,
          });
          await batch.commit();
        } catch (err: any) {
          functions.logger.error('[userAdmin] createBusinessUser provisioning write failed; rolling back', {
            callerUid: decoded.uid, uid, tenantId, email: cleanEmail, code: err?.code,
          });
          // Roll back everything so a retry starts clean (no orphaned Auth account,
          // no half-created business). Each delete is best-effort and logged.
          try { await db.doc(`users/${uid}`).delete(); } catch { /* ignore */ }
          try { await db.doc(`tenants/${tenantId}`).delete(); } catch { /* ignore */ }
          try {
            await admin.auth().deleteUser(uid);
          } catch (delErr: any) {
            functions.logger.error('[userAdmin] createBusinessUser rollback deleteUser failed', {
              uid, code: delErr?.code,
            });
          }
          throw new HttpError(500, 'Could not finish creating the business');
        }

        functions.logger.info('[userAdmin] Business + admin provisioned', {
          callerUid: decoded.uid, uid, tenantId, email: cleanEmail,
        });

        res.json({ success: true, uid, email: cleanEmail, tenantId, businessName: cleanBusinessName });
      } catch (err) {
        if (err instanceof HttpError) {
          res.status(err.status).json({ error: err.message });
        } else {
          functions.logger.error('[userAdmin] createBusinessUser unhandled error', err);
          res.status(500).json({ error: 'Internal server error' });
        }
      }
    });
  });
