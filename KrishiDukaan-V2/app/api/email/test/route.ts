import { NextResponse } from "next/server";
import { createTransport } from "../../../lib/email/mailer";

// GET /api/email/test?to=you@example.com
// Verifies SMTP credentials and optionally sends a test email.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const to = searchParams.get("to");

  const config = {
    SMTP_HOST: process.env.SMTP_HOST || "(not set)",
    SMTP_PORT: process.env.SMTP_PORT || "(not set)",
    SMTP_SECURE: process.env.SMTP_SECURE || "(not set)",
    SMTP_USER: process.env.SMTP_USER || "(not set)",
    SMTP_PASS: process.env.SMTP_PASS ? `(set, ${process.env.SMTP_PASS.length} chars)` : "(not set)",
    SMTP_FROM: process.env.SMTP_FROM || "(not set)",
  };

  const missing = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"].filter((k) => !process.env[k as keyof NodeJS.ProcessEnv]);
  if (missing.length > 0) {
    return NextResponse.json({ ok: false, reason: "SMTP not configured", missing, config }, { status: 500 });
  }

  try {
    const transport = createTransport();
    await transport.verify();

    if (to) {
      await transport.sendMail({
        from: process.env.SMTP_FROM ?? `KrishiDukan <${process.env.SMTP_USER}>`,
        to,
        subject: "KrishiDukan SMTP test",
        text: "If you're reading this, SMTP is configured correctly.",
        html: "<p>If you're reading this, <strong>SMTP is configured correctly</strong>.</p>",
      });
      return NextResponse.json({ ok: true, verified: true, sent: true, to, config });
    }

    return NextResponse.json({ ok: true, verified: true, sent: false, config });
  } catch (err) {
    return NextResponse.json(
      { ok: false, reason: String(err), config },
      { status: 500 },
    );
  }
}
