import { type HTMLAttributes } from 'react';
import { clsx } from 'clsx';

type BadgeVariant = 'new' | 'hot' | 'viewed' | 'owner' | 'broker' | 'flatmate';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant: BadgeVariant;
}

// Mirrors .badge / .b-new / .b-hot / .b-viewed (card corner badges) and
// .tag-chip with owner/broker/flatmate coloring (index (1).html, Card badges
// + TCFG object). Same visual language, one component for both use cases.
const variantClasses: Record<BadgeVariant, string> = {
  new: 'bg-brand text-white',
  hot: 'bg-[#fef3c7] text-[#92400e]',
  viewed: 'bg-[#f5f5f5] text-[#aaaaaa]',
  owner: 'bg-owner-bg text-owner-text',
  broker: 'bg-broker-bg text-broker-text',
  flatmate: 'bg-flatmate-bg text-flatmate-text',
};

const dotClasses: Record<BadgeVariant, string | null> = {
  new: null,
  hot: null,
  viewed: null,
  owner: 'bg-owner-dot',
  broker: 'bg-broker-dot',
  flatmate: 'bg-flatmate-dot',
};

export function Badge({ variant, className, children, ...props }: BadgeProps) {
  const dot = dotClasses[variant];
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-[9px] py-[3px] text-[10px] font-extrabold tracking-[0.04em]',
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {dot && <span className={clsx('inline-block h-[5px] w-[5px] flex-shrink-0 rounded-full', dot)} />}
      {children}
    </span>
  );
}
