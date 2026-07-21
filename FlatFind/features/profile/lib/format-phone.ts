/**
 * Derives the masked-phone display string and the two-digit avatar-fallback
 * glyph from a Firebase Auth phoneNumber (E.164, e.g. "+919876543210").
 * Extracted from app/profile/page.tsx (Phase 14) so ProfileEditForm and
 * ProfileInfoCard can share the exact same derivation instead of each
 * re-implementing the same slice/replace logic slightly differently.
 */
export function formatPrimaryPhone(phoneNumber: string | null | undefined): { masked: string; avatarGlyph: string } {
  const phone = phoneNumber?.replace('+91', '') ?? '';
  const masked = phone.length === 10 ? `+91 ${phone.slice(0, 2)}••••••${phone.slice(-2)}` : phoneNumber ?? '';
  return { masked, avatarGlyph: phone.slice(-2) };
}
