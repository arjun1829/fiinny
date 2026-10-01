import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "../../../lib/firebase-admin";
import { requireSection } from "../../../lib/admin-auth";
import {
  REFERRAL_OWNER_TYPES,
  isValidReferralCodeFormat,
  loadReferralStats,
  mapReferralCode,
  normalizeReferralCode,
  type ReferralOwnerType,
} from "../../../lib/referrals";

/** Sales-app accounts a code can be assigned to (role salesExecutive). */
async function loadSalesOwners() {
  const db = getAdminDb();
  const snap = await db.collection("users").where("role", "==", "salesExecutive").get();
  const owners = await Promise.all(
    snap.docs.map(async (d) => {
      const u = d.data();
      // Sales accounts are normally keyed by auth uid; a phone-keyed one is
      // resolved to its uid through uidIndex, which is what the sales app
      // signs in as.
      let uid = u.uid ? String(u.uid) : "";
      if (!uid && !/^\+?\d{10,13}$/.test(d.id)) uid = d.id;
      if (!uid) {
        const idx = await db.collection("uidIndex").where("phone", "==", d.id).limit(1).get();
        uid = idx.empty ? "" : idx.docs[0]!.id;
      }
      return {
        uid,
        name: String(u.name ?? u.displayName ?? ""),
        email: String(u.email ?? ""),
        phone: String(u.phone ?? (/^\+?\d{10,13}$/.test(d.id) ? d.id : "")),
      };
    }),
  );
  return owners.filter((o) => o.uid).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * GET  /api/admin/referral-codes           every code with its funnel stats,
 *                                          plus the sales accounts it can be
 *                                          assigned to.
 * POST /api/admin/referral-codes           create a code.
 */
export async function GET(request: Request) {
  const caller = await requireSection(request, "referrals");
  if (caller instanceof NextResponse) return caller;
  try {
    const snap = await getAdminDb().collection("referralCodes").get();
    const [codes, owners] = await Promise.all([
      Promise.all(
        snap.docs.map(async (d) => {
          const rc = mapReferralCode(d.id, d.data());
          const stats = await loadReferralStats(rc.code);
          return { ...rc, stats };
        }),
      ),
      loadSalesOwners(),
    ]);
    codes.sort((a, b) => b.stats.revenue - a.stats.revenue || a.code.localeCompare(b.code));
    return NextResponse.json({ codes, owners }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[api/admin/referral-codes GET]", e);
    return NextResponse.json({ error: "Failed to load referral codes." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const caller = await requireSection(request, "referrals");
  if (caller instanceof NextResponse) return caller;
  try {
    const body = await request.json().catch(() => ({}));
    const code = normalizeReferralCode(body.code);
    if (!isValidReferralCodeFormat(code)) {
      return NextResponse.json(
        { error: "Code must be 3–20 letters or numbers (no spaces), e.g. RAHUL or PUNE01." },
        { status: 400 },
      );
    }
    const ownerName = String(body.ownerName ?? "").trim();
    if (!ownerName) {
      return NextResponse.json({ error: "Enter the name of the person this code credits." }, { status: 400 });
    }
    const ownerType = (REFERRAL_OWNER_TYPES as string[]).includes(body.ownerType)
      ? (body.ownerType as ReferralOwnerType)
      : "sales";
    const ownerUid = body.ownerUid ? String(body.ownerUid).trim() : null;

    const db = getAdminDb();
    const ref = db.collection("referralCodes").doc(code);
    const now = FieldValue.serverTimestamp();
    const data = {
      code,
      active: body.active !== false,
      ownerName,
      ownerType,
      ownerUid,
      note: String(body.note ?? "").trim().slice(0, 500),
      createdBy: caller.uid,
      createdAt: now,
      updatedAt: now,
    };
    // create() fails if the code already exists — codes are never silently
    // reassigned from one rep to another.
    try {
      await ref.create(data);
    } catch {
      return NextResponse.json({ error: `The code ${code} already exists.` }, { status: 409 });
    }
    await db.collection("adminLogs").add({
      action: "referral_code_create",
      performedBy: caller.uid,
      targetId: `referralCodes/${code}`,
      before: null,
      after: { ...data, createdAt: null, updatedAt: null },
      createdAt: now,
    });
    return NextResponse.json({ success: true, code });
  } catch (e) {
    console.error("[api/admin/referral-codes POST]", e);
    return NextResponse.json({ error: "Failed to create referral code." }, { status: 500 });
  }
}
