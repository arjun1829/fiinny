import { NextResponse } from "next/server";
import { isValidReferralCodeFormat, normalizeReferralCode, resolveActiveReferralCode } from "../../../lib/referrals";

/**
 * GET /api/referral/validate?code=RAHUL
 *
 * Public check used by the web and app checkouts before a typed or linked
 * referral code is shown as applied. referralCodes/ is not client-readable,
 * so this is the only thing a buyer learns about a code: whether it is active,
 * and whose it is ("Referred by …"). create-order re-checks it regardless.
 */
export async function GET(request: Request) {
  const code = normalizeReferralCode(new URL(request.url).searchParams.get("code"));
  if (!isValidReferralCodeFormat(code)) {
    return NextResponse.json({ valid: false, error: "Enter a valid referral code." });
  }
  const rc = await resolveActiveReferralCode(code);
  if (!rc) {
    return NextResponse.json({ valid: false, error: "This referral code is not valid or no longer active." });
  }
  return NextResponse.json(
    { valid: true, code: rc.code, ownerName: rc.ownerName },
    { headers: { "Cache-Control": "no-store" } },
  );
}
