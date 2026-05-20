import { NextResponse } from "next/server";
import { sendEmail } from "../../../lib/email/mailer";
import { buildSubscriptionConfirmationEmail } from "../../../lib/email/templates";

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      userEmail: string;
      userName: string;
      seatsPurchased: number;
      amountPaid: number;
      planName?: string;
      startDate: string;
      expiryDate: string;
      razorpayPaymentId: string;
      razorpayOrderId: string;
    };

    if (!body.userEmail) {
      return NextResponse.json({ ok: false, error: "No email provided." }, { status: 400 });
    }

    const { html, text } = buildSubscriptionConfirmationEmail({
      userName: body.userName,
      userEmail: body.userEmail,
      seatsPurchased: body.seatsPurchased,
      amountPaid: body.amountPaid,
      planName: body.planName ?? "Standard",
      startDate: body.startDate,
      expiryDate: body.expiryDate,
      razorpayPaymentId: body.razorpayPaymentId,
      razorpayOrderId: body.razorpayOrderId,
    });

    await sendEmail({
      to: body.userEmail,
      subject: `KrishiDukan — Subscription Confirmed (${body.seatsPurchased} seat${body.seatsPurchased !== 1 ? "s" : ""})`,
      html,
      text,
    });

    return NextResponse.json({ ok: true, sentTo: body.userEmail });
  } catch (error) {
    console.error("[email/subscription-confirmation]", error);
    return NextResponse.json({ ok: false, error: "Failed to send email." }, { status: 500 });
  }
}
