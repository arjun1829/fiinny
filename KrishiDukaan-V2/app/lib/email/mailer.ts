import nodemailer from "nodemailer";

export function createTransport() {
  // Gmail App Passwords are displayed with spaces (xxxx xxxx xxxx xxxx) but
  // SMTP auth is more reliable without them — strip just in case.
  const pass = (process.env.SMTP_PASS ?? "").replace(/\s/g, "");
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass,
    },
    tls: {
      // Prevent cert errors in some Node.js / Cloud Run environments
      rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== "false",
    },
  });
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const missing = (["SMTP_HOST", "SMTP_USER", "SMTP_PASS"] as const).filter(
    (k) => !process.env[k],
  );
  if (missing.length > 0) {
    console.warn("[email] SMTP not configured — missing env vars:", missing.join(", "), "— skipping email to", params.to);
    return;
  }
  const transport = createTransport();
  await transport.sendMail({
    from: process.env.SMTP_FROM ?? `KrishiDukan <${process.env.SMTP_USER}>`,
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
  });
}
