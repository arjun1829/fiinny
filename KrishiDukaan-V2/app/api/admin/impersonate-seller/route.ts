import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../lib/firebase-admin";

/**
 * POST /api/admin/impersonate-seller
 *
 * Mints a Firebase custom sign-in token for a seller's account, for the case
 * where a seller has real pending details to fill in (bank/KYC) but admin has
 * no way to get them a login OTP — e.g. the owner handed over a business to
 * someone else, or nobody has the physical SIM for the number on file.
 *
 * This is NOT the phone-auth "test numbers" mechanism (that only works for
 * numbers that have never been registered — Firebase itself refuses to
 * convert a real, already-registered account into one, which is why this
 * route exists at all). A custom token is a normal, supported Firebase
 * mechanism: minted server-side with the Admin SDK, exchanged client-side via
 * signInWithCustomToken, valid for 1 hour, and it does not touch the
 * account's phone-auth configuration or any other user's session.
 *
 * Every mint is written to `adminImpersonationLog` — who did it, for which
 * account, when — because this is real access to a seller's account and
 * needs to be auditable, not just possible.
 */

type AdminAuthResult =
  | { ok: true; uid: string; response?: undefined }
  | { ok: false; uid?: undefined; response: NextResponse };

async function requireAdmin(req: NextRequest): Promise<AdminAuthResult> {
  const header = req.headers.get("Authorization") ?? "";
  const idToken = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!idToken) {
    return { ok: false, response: NextResponse.json({ error: "Missing authorization token" }, { status: 401 }) };
  }
  let uid: string;
  try {
    uid = (await getAdminAuth().verifyIdToken(idToken)).uid;
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Invalid authorization token" }, { status: 401 }) };
  }

  const db = getAdminDb();
  const [byUid, idx] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("uidIndex").doc(uid).get(),
  ]);
  let isAdmin = byUid.exists && byUid.data()?.role === "admin";
  if (!isAdmin && idx.exists) {
    const phone = idx.data()?.phone;
    if (phone) {
      const byPhone = await db.collection("users").doc(String(phone)).get();
      isAdmin = byPhone.exists && byPhone.data()?.role === "admin";
    }
  }
  if (!isAdmin) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true, uid };
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const { phone } = (await req.json()) as { phone?: string };
    if (!phone || !phone.trim()) {
      return NextResponse.json({ error: "phone is required" }, { status: 400 });
    }

    const adminAuth = getAdminAuth();
    let targetUid: string;
    try {
      const user = await adminAuth.getUserByPhoneNumber(phone.trim());
      targetUid = user.uid;
    } catch {
      return NextResponse.json(
        { error: `No Firebase Auth account found for ${phone}. They may not have signed in yet.` },
        { status: 404 },
      );
    }

    const token = await adminAuth.createCustomToken(targetUid);

    await getAdminDb().collection("adminImpersonationLog").add({
      adminUid: auth.uid,
      targetUid,
      targetPhone: phone.trim(),
      createdAt: new Date(),
    });

    return NextResponse.json({ token, uid: targetUid });
  } catch (error) {
    console.error("[impersonate-seller] failed:", error);
    return NextResponse.json({ error: "Could not create a login token." }, { status: 500 });
  }
}
