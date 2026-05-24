import { NextResponse } from "next/server";
import { sendEmail } from "../../../lib/email/mailer";
import { buildInviteEmail } from "../../../lib/email/templates";
import { buildSignupInviteUrl } from "../../../lib/invite/invite-utils";

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      retailerEmail?: string;
      shopName?: string;
      inviteCode?: string;
      manufacturerName?: string;
    };

    const { retailerEmail, shopName = "", inviteCode = "", manufacturerName = "Your manufacturer" } = body;

    if (!retailerEmail) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const base = process.env.NEXT_PUBLIC_BASE_URL || 'https://krishidukan-e8315.web.app';
    const inviteLink = inviteCode 
      ? buildSignupInviteUrl(inviteCode) 
      : `${base}/dashboard/inventory`;
    
    // If it's an existing retailer but we have an invite code (e.g. from linkExistingRetailerToNetwork),
    // ensure the link includes it so the dashboard can auto-sync.
    const finalLink = (inviteCode && inviteLink.includes('/dashboard/inventory'))
      ? `${inviteLink}?inviteCode=${encodeURIComponent(inviteCode)}`
      : inviteLink;
      
    const { html, text } = buildInviteEmail({ shopName, inviteCode, inviteLink: finalLink, manufacturerName });

    await sendEmail({
      to: retailerEmail,
      subject: `You're invited to join ${manufacturerName} on KrishiDukan`,
      html,
      text,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[email/invite] Failed:", error);
    return NextResponse.json({ ok: false, error: "Email delivery failed." }, { status: 500 });
  }
}
