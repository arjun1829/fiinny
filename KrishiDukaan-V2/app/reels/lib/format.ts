/**
 * Compact count formatting for like/view badges — 1200 → "1.2K".
 *
 * Deliberately not `Intl.NumberFormat` with `notation: "compact"`: that
 * localises the suffix, so a Hindi or Marathi locale renders "1.2 हज़ार" and
 * breaks the fixed-width stats column in the overlay.
 */
export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
