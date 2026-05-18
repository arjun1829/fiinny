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
      signupLink?: string;
    };

    const {
      retailerEmail,
      shopName = "",
      productName = "a new product",
      manufacturerName = "Your manufacturer",
      signupLink = process.env.NEXT_PUBLIC_BASE_URL ?? "/",
    } = body;

    if (!retailerEmail) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const { html, text } = buildProductAssignedEmail({ shopName, productName, manufacturerName, signupLink });

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
