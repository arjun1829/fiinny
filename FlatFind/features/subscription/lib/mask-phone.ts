// Masks a verified E.164 Indian mobile number for guest/unrevealed display,
// per the Freemium Model spec's exact format: "+91 98•••••210" — first 2
// digits and last 3 digits visible, 5 dots between. Returns a fallback
// placeholder for null/malformed numbers rather than throwing, since
// listing.contact_phone is nullable (types/listing.ts) and some listings
// legitimately have no phone (fb_url-only source listings).
export function maskPhone(phone: string | null): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '').slice(-10); // last 10 digits, ignoring +91/leading zeros
  if (digits.length !== 10) return phone; // unexpected shape — show as-is rather than mangle it
  return `+91 ${digits.slice(0, 2)}•••••${digits.slice(7)}`;
}
