import { NextResponse } from "next/server";
import { sendEmail } from "../../../lib/email/mailer";
import { buildSupportNotificationEmail } from "../../../lib/email/templates";

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      userName: string;
      phone: string;
      role: string;
      subject: string;
      message: string;
      submittedAt: string;
    };

    // SUPPORT_EMAIL is the dedicated inbox for incoming support messages.
    // Falls back to SMTP_USER (the sending account) if not set.
    const adminEmail = process.env.SUPPORT_EMAIL || process.env.SMTP_USER;
    if (!adminEmail) {
      console.warn("[email/support-message] Neither SUPPORT_EMAIL nor SMTP_USER is set — skipping support notification.");
      return NextResponse.json({ ok: false, error: "No admin email configured." }, { status: 500 });
    }

    const { html, text } = buildSupportNotificationEmail({
      userName: body.userName,
      phone: body.phone,
      role: body.role,
      subject: body.subject,
      message: body.message,
      submittedAt: body.submittedAt,
    });

    await sendEmail({
      to: adminEmail,
      subject: `[KrishiDukan Support] ${body.subject || "New Message"} — ${body.userName || body.phone}`,
      html,
      text,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[email/support-message]", error);
    return NextResponse.json({ ok: false, error: "Failed to send support notification." }, { status: 500 });
  }
}
