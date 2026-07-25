import { clsx } from 'clsx';
import type { ProStatus } from '@/types/subscription';

// Small "✓ Pro" pill for the header. Profile page's larger status card
// (with expiry date + renew warning) is built directly in app/profile/page.tsx
// since it needs more layout control than a reusable badge should own —
// this component covers just the compact, repeated case.
export function ProBadge({ className }: { className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full bg-brand-light px-3 py-1 text-xs font-extrabold text-brand-2',
        className,
      )}
    >
      ✓ Pro
    </span>
  );
}

/** Expiry warning line for the profile Pro card — yellow at ≤7 days, red at ≤3 days, per the Freemium Model spec. */
export function ProExpiryWarning({ status }: { status: ProStatus }) {
  if (!status.isPro || !status.proExpiry) return null;
  if (!status.isExpiringSoon) return null;

  const daysLeft = Math.max(0, Math.ceil((new Date(status.proExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

  return (
    <div
      className={clsx(
        'mt-2 rounded-lg px-3 py-2 text-xs font-bold',
        status.isExpiringUrgently ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700',
      )}
    >
      {daysLeft} day{daysLeft === 1 ? '' : 's'} left · Renew Now
    </div>
  );
}
