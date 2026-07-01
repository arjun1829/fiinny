import { NextResponse } from "next/server";
import { sendEmail } from "../../../lib/email/mailer";
import { buildProductAssignedEmail } from "../../../lib/email/templates";
import { buildSignupInviteUrl } from "../../../lib/invite/invite-utils";

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      retailerEmail?: string;
      shopName?: string;
      productName?: string;
      manufacturerName?: string;
      inviteCode?: string;
      retailerStatus?: string;
    };

    const {
      retailerEmail,
      shopName = "",
      productName = "a new product",
      manufacturerName = "Your manufacturer",
      inviteCode = "",
      retailerStatus = "active",
    } = body;

    if (!retailerEmail) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    // For new (invited) retailers: magic link pre-fills their invite code on the signup page.
    // For existing (active) retailers: go to inventory with inviteCode for auto-acceptance.
    const actionLink = (inviteCode && retailerStatus === "invited")
      ? buildSignupInviteUrl(inviteCode)
      : inviteCode
        ? `https://krishidukan.com/dashboard/inventory?inviteCode=${encodeURIComponent(inviteCode)}`
        : `https://krishidukan.com/dashboard/inventory`;

    const { html, text } = buildProductAssignedEmail({ shopName, productName, manufacturerName, actionLink, inviteCode, retailerStatus });

    await sendEmail({
      to: retailerEmail,
      subject: `${manufacturerName} assigned a new product to you on KrishiDukan`,
      html,
      text,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[email/product-assigned] Failed:", error);
    return NextResponse.json({ ok: false, error: "Email delivery failed." }, { status: 500 });
  }
}
