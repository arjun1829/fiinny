import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "./firebase-admin";

export type AdminCaller = { uid: string; phone: string | null };

/**
 * Verifies the request's Firebase ID token AND that the resulting user is a
 * full admin (role === 'admin'). Combines the two existing-but-separate
 * patterns in the codebase: ID-token verification (create-cart-order/route.ts)
 * and the uid→uidIndex→phone admin-role resolution
 * (api/admin/create-user/route.ts) — the latter previously trusted a
 * client-supplied uid instead of a verified token.
 *
 * Team accounts (role === 'team') are deliberately NOT accepted here — plan/
 * subscription mutations touch pricing and entitlements directly, so this
 * bar is stricter than the read-only 'subscriptions' admin section team
 * members can already have.
 */
/**
 * Verifies the request carries a valid Firebase ID token, without requiring any
 * particular role.
 *
 * For endpoints that act for a signed-in user rather than an admin — chiefly the
 * transactional email routes, which take the RECIPIENT from the request body.
 * Unauthenticated, those were an open relay: anyone could make the platform's
 * SMTP identity send mail to any address, which is how a sending domain ends up
 * on a blocklist.
 */
export async function requireAuthed(request: Request): Promise<AdminCaller | NextResponse> {
  const authHeader = request.headers.get("Authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) {
    return NextResponse.json({ error: "Missing authorization token." }, { status: 401 });
  }
  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    return { uid: decoded.uid, phone: (decoded.phone_number as string) ?? null };
  } catch {
    return NextResponse.json({ error: "Invalid or expired authorization token." }, { status: 401 });
  }
}

export async function requireAdmin(request: Request): Promise<AdminCaller | NextResponse> {
  const authHeader = request.headers.get("Authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) {
    return NextResponse.json({ error: "Missing authorization token." }, { status: 401 });
  }

  let uid: string;
  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid or expired authorization token." }, { status: 401 });
  }

  // Firestore reads are wrapped so an infrastructure failure (e.g. the local
  // Firebase Admin credentials can't reach the configured project) surfaces as a
  // clear 500 JSON instead of an unhandled throw. Without this, callers that
  // await requireAdmin outside their own try/catch return a bodyless 500, which
  // is indistinguishable from a real "not admin" and impossible to diagnose.
  let isAdmin: boolean;
  let phone: string | null;
  try {
    const adminDb = getAdminDb();
    const [callerDoc, idxDoc] = await Promise.all([
      adminDb.collection("users").doc(uid).get(),
      adminDb.collection("uidIndex").doc(uid).get(),
    ]);

    isAdmin = callerDoc.exists && callerDoc.data()?.role === "admin";
    phone = idxDoc.exists ? String(idxDoc.data()?.phone ?? "") || null : null;

    if (!isAdmin && phone) {
      const phoneDoc = await adminDb.collection("users").doc(phone).get();
      isAdmin = phoneDoc.exists && phoneDoc.data()?.role === "admin";
    }
  } catch (e) {
    console.error("[requireAdmin] admin-role lookup failed:", e);
    const devHint =
      process.env.NODE_ENV !== "production"
        ? " To fix locally, run: gcloud auth application-default login " +
          "— then restart the dev server (Ctrl+C, then npm run dev)."
        : "";
    return NextResponse.json(
      {
        error:
          "Server could not verify admin access (backend datastore unreachable). " +
          "Check Firebase Admin credentials / project configuration." +
          devHint,
      },
      { status: 500 },
    );
  }

  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden — admin only." }, { status: 403 });
  }

  return { uid, phone };
}

/**
 * Admin, or a team account granted [section] (users/{uid}.role === "team" with
 * the section in adminSections — the same grant the admin sidebar uses). For
 * routes behind a section a team member can be given, so granting the section
 * actually works instead of showing the page and failing every request.
 */
export async function requireSection(
  request: Request,
  section: string,
): Promise<AdminCaller | NextResponse> {
  const authed = await requireAuthed(request);
  if (authed instanceof NextResponse) return authed;
  try {
    const adminDb = getAdminDb();
    const idx = await adminDb.collection("uidIndex").doc(authed.uid).get();
    const phone = idx.exists ? String(idx.data()?.phone ?? "") || null : null;
    const docs = await Promise.all([
      adminDb.collection("users").doc(authed.uid).get(),
      ...(phone ? [adminDb.collection("users").doc(phone).get()] : []),
    ]);
    for (const d of docs) {
      const u = d.exists ? d.data() ?? {} : {};
      if (u.role === "admin") return { uid: authed.uid, phone };
      if (u.role === "team" && Array.isArray(u.adminSections) && u.adminSections.includes(section)) {
        return { uid: authed.uid, phone };
      }
    }
  } catch (e) {
    console.error("[requireSection] lookup failed:", e);
    return NextResponse.json({ error: "Server could not verify access." }, { status: 500 });
  }
  return NextResponse.json({ error: "Forbidden — you don't have access to this section." }, { status: 403 });
}
