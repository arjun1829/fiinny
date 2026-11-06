/**
 * Bridge between KrishiDukan (krishidukan-e8315) and the KaranArjun ERP
 * (karanarjun-pvt-ltd). These are two separate Firebase projects, so Auth does
 * not cross between them: a retailer signed in here has no identity there.
 *
 * Two jobs:
 *   1. When a retailer's subscription goes active, provision them a tenant,
 *      an ERP login and a basic-plan module entitlement in the ERP project.
 *   2. Hand that session over on demand, without a second login, using a
 *      single-use code that is exchanged for a Firebase custom token.
 *
 * DEPLOY PREREQUISITE — these functions reach into another project, so the
 * runtime service account of krishidukan-e8315 must be granted, ON the
 * karanarjun-pvt-ltd project:
 *     roles/datastore.user           (read/write tenant + user docs)
 *     roles/firebaseauth.admin       (look up / create users, mint tokens)
 * Without those grants every call here fails with PERMISSION_DENIED.
 */

import * as admin from "firebase-admin";
import * as crypto from "crypto";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";

// Firestore rules let a signed-in user create their own subscription document,
// and nothing verifies payment server-side. Provisioning therefore cannot trust
// the document — it re-checks the payment with Razorpay before granting an ERP
// tenant, so a hand-written subscription buys nothing.
const RAZORPAY_KEY_ID = defineSecret("RAZORPAY_KEY_ID");
const RAZORPAY_KEY_SECRET = defineSecret("RAZORPAY_KEY_SECRET");

const ERP_PROJECT_ID = "karanarjun-pvt-ltd";
const ERP_BASE_URL = "https://erp.krishidukan.com";
const ERP_BASIC_MODULE_ID = "erp_basic";
const ERP_BASIC_PLAN = "retailer_basic";

/** Codes live just long enough to survive a redirect. */
const HANDOFF_TTL_SECONDS = 90;

/**
 * Roles that already exist in the ERP and must never be overwritten by
 * provisioning. The owner's own phone number could appear on a subscription
 * document; demoting them to 'shopkeeper' would move their tenantId off
 * 'master' and cut them off from the company's real books.
 */
const PROTECTED_ERP_ROLES = ["admin", "analyst", "sales"];

let erpAppSingleton: admin.app.App | null = null;

/** Second Admin app, pointed at the ERP project. Created lazily and reused. */
function erpApp(): admin.app.App {
  if (!erpAppSingleton) {
    erpAppSingleton = admin.initializeApp(
      {
        projectId: ERP_PROJECT_ID,
        credential: admin.credential.applicationDefault(),
      },
      "erp"
    );
  }
  return erpAppSingleton;
}

/** Default (KrishiDukan) Firestore. Lazy so import order cannot beat initializeApp(). */
function kdDb(): admin.firestore.Firestore {
  return admin.firestore();
}

/**
 * Digits only. KrishiDukan stores phones as '+919370109484'; the ERP tenant id
 * has to be a stable, URL-safe string derived from the same number, because
 * phone is the only identifier the two projects share.
 */
function normalizePhone(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (typeof c !== "string" && typeof c !== "number") continue;
    const digits = String(c).replace(/\D/g, "");
    if (digits.length >= 10) return digits;
  }
  return null;
}

function tenantIdForPhone(digits: string): string {
  return `tenant_${digits}`;
}

/** E.164 for Firebase Auth. Bare 10-digit numbers are assumed Indian. */
function toE164(digits: string): string {
  return digits.length === 10 ? `+91${digits}` : `+${digits}`;
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/**
 * Finds the ERP Auth user for a phone number, creating one if absent.
 * Returns the ERP-side uid, which is what ERP `users/{uid}` docs are keyed by.
 */
async function ensureErpAuthUser(digits: string): Promise<string> {
  const auth = erpApp().auth();
  const e164 = toE164(digits);

  try {
    const existing = await auth.getUserByPhoneNumber(e164);
    return existing.uid;
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code !== "auth/user-not-found") throw err;
  }

  const created = await auth.createUser({ phoneNumber: e164 });
  logger.info(`[erp-bridge] Created ERP auth user ${created.uid} for ${e164}`);
  return created.uid;
}

/**
 * Creates (or refreshes) the tenant, the basic-plan entitlement and the ERP
 * user document. Safe to run repeatedly — a renewal simply extends expiresAt.
 */
async function provisionErpTenant(
  digits: string,
  expiresAt: admin.firestore.Timestamp,
  shopName: string
): Promise<{ tenantId: string; erpUid: string }> {
  const db = erpApp().firestore();
  const tenantId = tenantIdForPhone(digits);
  const erpUid = await ensureErpAuthUser(digits);
  const now = admin.firestore.FieldValue.serverTimestamp();

  await db.doc(`tenants/${tenantId}`).set(
    {
      businessName: shopName || `Shop ${digits.slice(-10)}`,
      phone: digits,
      plan: ERP_BASIC_PLAN,
      source: "krishidukan",
      updatedAt: now,
      createdAt: now,
    },
    { merge: true }
  );

  // Rules make this collection function-writable only, which is what makes the
  // entitlement trustworthy — a shopkeeper cannot grant themselves a module.
  await db.doc(`tenants/${tenantId}/modules/${ERP_BASIC_MODULE_ID}`).set(
    {
      status: "active",
      expiresAt,
      grantedBy: "krishidukan",
      updatedAt: now,
    },
    { merge: true }
  );

  const userRef = db.doc(`users/${erpUid}`);
  const userSnap = await userRef.get();
  const existingRole = userSnap.exists ? String(userSnap.data()?.role ?? "") : "";

  if (PROTECTED_ERP_ROLES.indexOf(existingRole) !== -1) {
    // Someone who already works in the ERP bought a KrishiDukan subscription.
    // Give them the entitlement but leave their role and tenant alone.
    logger.warn(
      `[erp-bridge] ${digits} already holds ERP role '${existingRole}' — ` +
        `left untouched, tenant ${tenantId} still provisioned.`
    );
    return { tenantId, erpUid };
  }

  await userRef.set(
    {
      phone: digits,
      role: "shopkeeper",
      tenantId,
      updatedAt: now,
      ...(userSnap.exists ? {} : { createdAt: now }),
    },
    { merge: true }
  );

  logger.info(`[erp-bridge] Provisioned ${tenantId} (uid ${erpUid}) for ${digits}`);
  return { tenantId, erpUid };
}

/**
 * Asks Razorpay whether this payment id really exists and really took money.
 * Returns false on any doubt — a failed lookup must never grant access.
 */
async function paymentIsGenuine(paymentId: string): Promise<boolean> {
  try {
    const basic = Buffer.from(
      `${RAZORPAY_KEY_ID.value()}:${RAZORPAY_KEY_SECRET.value()}`
    ).toString("base64");

    const res = await fetch(
      `https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`,
      { headers: { Authorization: `Basic ${basic}` } }
    );

    if (!res.ok) {
      logger.warn(`[erp-bridge] Razorpay lookup for ${paymentId} returned ${res.status}`);
      return false;
    }

    const payment = (await res.json()) as { status?: string };
    return payment.status === "captured" || payment.status === "authorized";
  } catch (err) {
    logger.error(`[erp-bridge] Razorpay lookup failed for ${paymentId}`, err);
    return false;
  }
}

/**
 * Retailer subscriptions unlock the ERP. Manufacturers stay on their existing
 * KrishiDukan-only plan and are deliberately skipped.
 *
 * Subscriptions activated by an admin carry no real Razorpay payment, so they
 * are skipped here and provisioned deliberately via provisionErpTenantByAdmin.
 */
export const provisionErpTenantOnSubscription = onDocumentCreated(
  {
    region: "asia-south1",
    document: "subscriptions/{subscriptionId}",
    secrets: [RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET],
  },
  async (event) => {
    const d = event.data?.data() as Record<string, unknown> | undefined;
    if (!d) return;
    if (String(d.subscriptionStatus ?? "") !== "active") return;
    if (String(d.ownerType ?? "") !== "retailer") return;

    const paymentId = String(d.razorpayPaymentId ?? "");
    if (!paymentId || !(await paymentIsGenuine(paymentId))) {
      logger.warn(
        `[erp-bridge] subscription ${event.params.subscriptionId} has no verifiable ` +
          `Razorpay payment — no ERP tenant granted. Use provisionErpTenantByAdmin ` +
          `if this was activated manually.`
      );
      return;
    }

    const digits = normalizePhone(d.ownerPhone, d.ownerId);
    if (!digits) {
      logger.warn(
        `[erp-bridge] subscription ${event.params.subscriptionId} has no usable phone — skipped`
      );
      return;
    }

    const expiresAt =
      d.expiryDate instanceof admin.firestore.Timestamp
        ? d.expiryDate
        : admin.firestore.Timestamp.fromMillis(Date.now() + 365 * 24 * 60 * 60 * 1000);

    try {
      await provisionErpTenant(digits, expiresAt, String(d.shopName ?? ""));
    } catch (err) {
      // Never fail the subscription because the ERP side had a problem; the
      // retailer still owns a valid KrishiDukan subscription either way.
      logger.error(`[erp-bridge] Provisioning failed for ${digits}`, err);
    }
  }
);

/** Resolves the caller's phone: auth token first, then the uidIndex mapping. */
async function phoneForCaller(uid: string, tokenPhone?: string): Promise<string | null> {
  const fromToken = normalizePhone(tokenPhone);
  if (fromToken) return fromToken;

  const idx = await kdDb().doc(`uidIndex/${uid}`).get();
  if (idx.exists) {
    const mapped = normalizePhone(idx.data()?.phone);
    if (mapped) return mapped;
  }

  const legacy = await kdDb().doc(`users/${uid}`).get();
  return legacy.exists ? normalizePhone(legacy.data()?.phone) : null;
}

/** True when the phone holds a retailer subscription that is active and unexpired. */
async function hasActiveRetailerSubscription(digits: string): Promise<boolean> {
  const now = admin.firestore.Timestamp.now();
  const snap = await kdDb()
    .collection("subscriptions")
    .where("ownerPhone", "==", `+${digits}`)
    .where("subscriptionStatus", "==", "active")
    .get();

  const alt = snap.empty
    ? await kdDb()
        .collection("subscriptions")
        .where("ownerPhone", "==", digits)
        .where("subscriptionStatus", "==", "active")
        .get()
    : snap;

  return alt.docs.some((doc) => {
    const d = doc.data();
    if (String(d.ownerType ?? "") !== "retailer") return false;
    const exp = d.expiryDate;
    return !(exp instanceof admin.firestore.Timestamp) || exp.toMillis() > now.toMillis();
  });
}

/** Mirrors the isAdmin() rule: an admin doc sits at users/{uid} or users/{phone}. */
async function callerIsAdmin(uid: string, tokenPhone?: string): Promise<boolean> {
  const direct = await kdDb().doc(`users/${uid}`).get();
  if (direct.exists && String(direct.data()?.role ?? "") === "admin") return true;

  const digits = await phoneForCaller(uid, tokenPhone);
  if (!digits) return false;

  for (const key of [`+${digits}`, digits]) {
    const snap = await kdDb().doc(`users/${key}`).get();
    if (snap.exists && String(snap.data()?.role ?? "") === "admin") return true;
  }
  return false;
}

/**
 * Grants an ERP tenant with no Razorpay payment behind it. This is the escape
 * hatch for subscriptions your team activates by hand, which the trigger
 * deliberately refuses to honour because that path has no verifiable payment.
 */
export const provisionErpTenantByAdmin = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");

  const isAdminCaller = await callerIsAdmin(
    uid,
    request.auth?.token?.phone_number as string | undefined
  );
  if (!isAdminCaller) throw new HttpsError("permission-denied", "Admins only.");

  const digits = normalizePhone(request.data?.phone);
  if (!digits) throw new HttpsError("invalid-argument", "A valid phone number is required.");

  const months = Number(request.data?.months) || 12;
  const expiresAt = admin.firestore.Timestamp.fromMillis(
    Date.now() + months * 30 * 24 * 60 * 60 * 1000
  );

  const result = await provisionErpTenant(digits, expiresAt, String(request.data?.shopName ?? ""));
  logger.info(`[erp-bridge] ${uid} manually provisioned ${result.tenantId}`);
  return result;
});

/**
 * Step one of the handoff. The caller is an authenticated KrishiDukan user; we
 * return a URL carrying a single-use code. Only the code's hash is stored, so
 * read access to Firestore does not yield a usable credential.
 */
export const createErpHandoffCode = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");

  const digits = await phoneForCaller(uid, request.auth?.token?.phone_number as string | undefined);
  if (!digits) {
    throw new HttpsError("failed-precondition", "No phone number on this account.");
  }

  if (!(await hasActiveRetailerSubscription(digits))) {
    throw new HttpsError("permission-denied", "No active retailer subscription.");
  }

  const code = crypto.randomBytes(32).toString("hex");
  const expiresAt = admin.firestore.Timestamp.fromMillis(
    Date.now() + HANDOFF_TTL_SECONDS * 1000
  );

  await kdDb().doc(`erpHandoffCodes/${sha256(code)}`).set({
    phone: digits,
    krishidukanUid: uid,
    used: false,
    expiresAt,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { url: `${ERP_BASE_URL}/auth/handoff?c=${code}`, expiresInSeconds: HANDOFF_TTL_SECONDS };
});

/**
 * Step two, called by the ERP, which has no session yet — so this is
 * deliberately unauthenticated. The code itself is the credential: single-use,
 * short-lived, and burnt inside a transaction so two tabs cannot both redeem it.
 */
export const redeemErpHandoffCode = onCall(async (request) => {
  const code = String(request.data?.code ?? "");
  if (!code) throw new HttpsError("invalid-argument", "Missing code.");

  const ref = kdDb().doc(`erpHandoffCodes/${sha256(code)}`);

  const phone = await kdDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "This link is not valid.");

    const d = snap.data() as Record<string, unknown>;
    if (d.used === true) throw new HttpsError("permission-denied", "This link was already used.");

    const exp = d.expiresAt;
    if (exp instanceof admin.firestore.Timestamp && exp.toMillis() < Date.now()) {
      throw new HttpsError("deadline-exceeded", "This link has expired.");
    }

    tx.update(ref, { used: true, usedAt: admin.firestore.FieldValue.serverTimestamp() });
    return String(d.phone ?? "");
  });

  const digits = normalizePhone(phone);
  if (!digits) throw new HttpsError("internal", "Handoff record is missing a phone number.");

  const tenantId = tenantIdForPhone(digits);
  const erpUid = await ensureErpAuthUser(digits);

  // Claims mirror the Firestore user doc the ERP reads on boot. They are not the
  // source of truth for permissions, but they let Firestore rules tighten later
  // without another round trip.
  const token = await erpApp().auth().createCustomToken(erpUid, {
    tenantId,
    role: "shopkeeper",
    source: "krishidukan",
  });

  logger.info(`[erp-bridge] Handoff redeemed for ${tenantId}`);
  return { token };
});
