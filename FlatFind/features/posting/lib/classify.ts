import type { ListingTag } from '@/types/listing';

// Mirrors classify() (index (1).html, main IIFE) — the exact same regex
// classification, byte-for-byte. The original had a second, near-identical
// copy (classifyFromSheet(), used by the CSV/Sheet-sync path) with the same
// logic duplicated rather than shared — architecture report §1.11 flags
// this as one of six duplicated-logic instances. This is the single
// canonical version; nothing else in this app should re-implement it.
export function classifyListingTag(description = '', title = ''): ListingTag {
  const text = `${description} ${title}`.toLowerCase();
  if (/broker|brokerage|commission|agent/.test(text)) return 'broker';
  if (/looking for flatmate|need.*flatmate|flatmate.*(needed|wanted|required)|roommate|sharing/.test(text)) return 'flatmate';
  if (/owner|direct|no broker|self|landlord/.test(text)) return 'owner';
  if (/flatmate|room available/.test(text)) return 'flatmate';
  return 'owner';
}

// Mirrors extractPhone() (index (1).html, main IIFE) — pulls a 10-digit
// Indian mobile number out of free text (used as a contact_phone fallback
// when the poster leaves the phone field blank but mentions a number in the
// description).
export function extractPhoneFromText(text = ''): string | null {
  const match = text.match(/(\+?91[\s-]?)?([6-9]\d{9})/);
  return match ? match[2] : null;
}
