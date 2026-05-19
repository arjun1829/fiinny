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

    const inviteLink = inviteCode 
      ? buildSignupInviteUrl(inviteCode) 
      : `${process.env.NEXT_PUBLIC_BASE_URL || 'https://krishidukan-e8315.web.app'}/?view=login`;
      
    const { html, text } = buildInviteEmail({ shopName, inviteCode, inviteLink, manufacturerName });

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
