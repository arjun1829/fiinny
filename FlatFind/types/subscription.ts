import type { UserProfile } from './user';

// Phase 15 (Freemium/Razorpay). Shared types for the contact-reveal cap and
// Pro-status derivation — kept separate from types/user.ts because these
// are computed/derived shapes, not Firestore document shapes (contrast
// UserProfile, which mirrors users/{uid} field-for-field).

/** users/{uid}/reveals/{listingId} — existence of the doc IS the signal; the field is only for display ("revealed 3 days ago"), never read to gate access. */
export interface RevealDoc {
  revealedAt: string; // ISO timestamp
}

export interface ProStatus {
  isPro: boolean;
  proExpiry: string | null; // ISO timestamp, null when never subscribed
  /** proExpiry is set and in the future, but within EXPIRY_WARNING_DAYS. */
  isExpiringSoon: boolean;
  /** proExpiry is set and within EXPIRY_URGENT_DAYS — a tighter warning than isExpiringSoon, per the spec's "≤3 days: red urgent warning". */
  isExpiringUrgently: boolean;
}

const EXPIRY_WARNING_DAYS = 7;
const EXPIRY_URGENT_DAYS = 3;

/**
 * Derives live Pro status from a profile document. Centralizing this check
 * (rather than components reading profile.isPro directly) is what makes
 * "Pro active" always mean "isPro AND not expired" everywhere in the app —
 * profile.isPro alone is never cleared when proExpiry passes, so any
 * call site that skipped the expiry half of this check would keep granting
 * Pro access forever after a subscription lapses.
 */
export function getProStatus(profile: Pick<UserProfile, 'isPro' | 'proExpiry'> | null | undefined): ProStatus {
  const proExpiry = profile?.proExpiry ?? null;
  const notExpired = proExpiry != null && new Date(proExpiry).getTime() > Date.now();
  const isPro = Boolean(profile?.isPro) && notExpired;

  if (!isPro || proExpiry == null) {
    return { isPro, proExpiry, isExpiringSoon: false, isExpiringUrgently: false };
  }

  const daysLeft = (new Date(proExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return {
    isPro,
    proExpiry,
    isExpiringSoon: daysLeft <= EXPIRY_WARNING_DAYS,
    isExpiringUrgently: daysLeft <= EXPIRY_URGENT_DAYS,
  };
}
