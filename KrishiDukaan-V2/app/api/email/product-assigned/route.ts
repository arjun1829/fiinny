import { NextResponse } from "next/server";
import { sendEmail } from "../../../lib/email/mailer";
import { buildProductAssignedEmail } from "../../../lib/email/templates";

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

    const base = process.env.NEXT_PUBLIC_BASE_URL || 'https://krishidukan-e8315.web.app';
    // For new (invited) retailers: magic link pre-fills their invite code on the signup page.
    // For existing (active) retailers: go to inventory with inviteCode for auto-acceptance.
    const actionLink = (inviteCode && retailerStatus === "invited")
      ? `${base}/?view=signup&inviteCode=${encodeURIComponent(inviteCode)}`
      : inviteCode 
        ? `${base}/dashboard/inventory?inviteCode=${encodeURIComponent(inviteCode)}`
        : `${base}/dashboard/inventory`;

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
