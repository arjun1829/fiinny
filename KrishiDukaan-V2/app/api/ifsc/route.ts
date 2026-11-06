import { NextRequest, NextResponse } from "next/server";
import { IFSC_RE, type IfscInfo } from "../../lib/kyc";

/**
 * GET /api/ifsc?code=SBIN0001234 → { bank, branch, city, state }
 *
 * Fills in the bank and branch on the KYC form (website and app) so the seller
 * types only the IFSC. Looked up in Razorpay's free IFSC directory; the answer
 * for a code almost never changes, so it is cached for a day at the CDN and in
 * Next's fetch cache. 404 when the code does not exist. A lookup failure is
 * not fatal on the form: the seller can type the bank and branch themselves.
 */
export async function GET(req: NextRequest) {
  const code = (req.nextUrl.searchParams.get("code") ?? "").trim().toUpperCase();
  if (!IFSC_RE.test(code)) {
    return NextResponse.json({ error: "IFSC should look like SBIN0001234." }, { status: 400 });
  }
  try {
    const res = await fetch(`https://ifsc.razorpay.com/${code}`, { next: { revalidate: 86_400 } });
    if (res.status === 404) {
      return NextResponse.json(
        { error: "No bank branch has this IFSC. Please check it." },
        { status: 404, headers: { "Cache-Control": "public, s-maxage=86400" } },
      );
    }
    if (!res.ok) return NextResponse.json({ error: "Lookup unavailable" }, { status: 502 });
    const d = (await res.json()) as Record<string, unknown>;
    const info: IfscInfo = {
      bank: String(d.BANK ?? ""),
      branch: String(d.BRANCH ?? ""),
      city: String(d.CITY ?? d.DISTRICT ?? ""),
      state: String(d.STATE ?? ""),
    };
    return NextResponse.json(info, { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } });
  } catch {
    return NextResponse.json({ error: "Lookup unavailable" }, { status: 502 });
  }
}
