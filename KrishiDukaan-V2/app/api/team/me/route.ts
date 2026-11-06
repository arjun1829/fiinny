import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "../../../lib/firebase-admin";
import { cleanPermissions, phoneKey } from "../../../lib/shop-team";
import { getStaffRecord, resolveTeamCaller, setStaffClaim } from "../../../lib/shop-team-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/team/me — a helper opening the shop dashboard (web or app).
 *
 * Returns their permissions and the shop they manage, or { staff: null }.
 * Also keeps staffIndex's copy of the owner's uid/name current (an owner who
 * first logs in after adding a helper gets a uid later) and stamps the
 * member's lastActiveAt at most every 6 hours, and sets the kdStaff sign-in
 * claim (see firestore.rules isStaffToken). Called once per session.
 */

const ACTIVE_STAMP_MS = 6 * 3600 * 1000;

export async function POST(request: Request) {
  const caller = await resolveTeamCaller(request);
  if (!caller) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const rec = caller.phone ? await getStaffRecord(caller.phone) : null;
  if (!rec) {
    // Removed from a team: drop the claim too (access already ended with the record).
    if (caller.hasStaffClaim) await setStaffClaim(caller.uid, false);
    return NextResponse.json({ staff: null });
  }

  const db = getAdminDb();
  const ownerPhone = `+91${phoneKey(rec.ownerPhone)}`;
  const [ownerSnap, memberSnap] = await Promise.all([
    db.collection("users").doc(ownerPhone).get(),
    db.collection("shopTeams").doc(ownerPhone).collection("members").doc(rec.id).get(),
  ]);
  const owner = ownerSnap.data();
  // The shop closed its seller account, or the member doc is gone: no access.
  if (!owner || !["retailer", "manufacturer"].includes(String(owner.role)) || !memberSnap.exists) {
    return NextResponse.json({ staff: null });
  }

  const ownerUid = String(owner.uid ?? "") || "";
  const ownerName = String(owner.shopName || owner.businessName || owner.name || rec.ownerName || "").trim();
  const writes: Promise<unknown>[] = [];
  if (ownerUid !== (rec.ownerUid ?? "") || ownerName !== rec.ownerName || owner.role !== rec.ownerRole) {
    writes.push(db.collection("staffIndex").doc(rec.id).update({ ownerUid, ownerName, ownerRole: owner.role }));
  }
  const last = memberSnap.data()?.lastActiveAt;
  const lastMs = last && typeof last.toMillis === "function" ? last.toMillis() : 0;
  if (Date.now() - lastMs > ACTIVE_STAMP_MS) {
    writes.push(memberSnap.ref.update({ lastActiveAt: FieldValue.serverTimestamp() }));
  }
  await Promise.all(writes).catch((err) => console.warn("[team/me] refresh failed", err));
  // The claim firestore.rules look for. If this token lacks it (first visit,
  // or it was set when the helper was added), the client must refresh its
  // token — even when the account already had the claim.
  const refreshToken = !caller.hasStaffClaim;
  if (refreshToken) await setStaffClaim(caller.uid, true);

  return NextResponse.json({
    staff: {
      ownerPhone,
      ownerUid,
      ownerName,
      ownerRole: owner.role,
      ownerIsPaid: owner.isPaid === true,
      staffName: rec.staffName,
      permissions: cleanPermissions(rec.permissions),
      status: rec.status === "paused" ? "paused" : "active",
    },
    refreshToken,
  });
}
