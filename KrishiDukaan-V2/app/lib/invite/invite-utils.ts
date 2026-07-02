const SITE_URL = "https://krishidukan.com";

/**
 * Public site URL (no trailing slash).
 */
export function getPublicBaseUrl(): string {
  return SITE_URL;
}

/**
 * Retailer signup URL with invite (existing app shell: ?view=signup).
 * Always returns a fully-qualified URL.
 */
export function buildSignupInviteUrl(inviteCode: string): string {
  return `${SITE_URL}/?view=signup&inviteCode=${encodeURIComponent(inviteCode.trim())}`;
}

export function buildWhatsAppShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function buildMailtoInviteUrl(params: {
  to: string;
  subject: string;
  body: string;
}): string {
  const q = new URLSearchParams({
    subject: params.subject,
    body: params.body,
  });
  return `mailto:${params.to}?${q.toString()}`;
}

export function buildInviteShareMessage(inviteLink: string): string {
  return `You're invited to join our network on KrishiDukan as a retailer.\n\nCreate your account using this link:\n${inviteLink}`;
}
