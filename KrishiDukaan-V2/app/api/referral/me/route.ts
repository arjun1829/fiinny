import { NextResponse } from "next/server";
import { getAdminDb } from "../../../lib/firebase-admin";
import { requireAuthed } from "../../../lib/admin-auth";
import { loadReferralStats, mapReferralCode } from "../../../lib/referrals";

/**
 * GET /api/referral/me — the sales app's Referrals screen.
 *
 * Returns only codes assigned to the caller (referralCodes.ownerUid == their
 * uid), each with its funnel stats and follow-up leads (name + phone of people
 * from their link who did not finish paying — owner's decision). A caller with
 * no assigned code gets an empty list, not an error.
 */
export async function GET(request: Request) {
  const caller = await requireAuthed(request);
  if (caller instanceof NextResponse) return caller;

  try {
    const snap = await getAdminDb()
      .collection("referralCodes")
      .where("ownerUid", "==", caller.uid)
      .get();
    const codes = await Promise.all(
      snap.docs.map(async (d) => {
        const rc = mapReferralCode(d.id, d.data());
        return {
          code: rc.code,
          active: rc.active,
          ownerName: rc.ownerName,
          stats: await loadReferralStats(rc.code),
        };
      }),
    );
    codes.sort((a, b) => Number(b.active) - Number(a.active) || a.code.localeCompare(b.code));
    return NextResponse.json({ codes }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[api/referral/me]", e);
    return NextResponse.json({ error: "Could not load your referral stats." }, { status: 500 });
  }
}
