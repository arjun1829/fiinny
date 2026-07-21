import { type ButtonHTMLAttributes } from 'react';
import { clsx } from 'clsx';

export interface PillProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

// Mirrors .pill / .pill.on (index (1).html, FILTER BAR block) — the toggle
// chips used for city/type/budget/etc. filter selection.
export function Pill({ active = false, className, ...props }: PillProps) {
  return (
    <button
      type="button"
      className={clsx(
        'whitespace-nowrap rounded-full border-[1.5px] px-4 py-[7px] text-[13px] font-semibold transition-all duration-150',
        active
          ? 'border-brand bg-brand text-white'
          : 'border-border bg-white text-ink-2 hover:border-brand hover:text-brand',
        className,
      )}
      aria-pressed={active}
      {...props}
    />
  );
}
