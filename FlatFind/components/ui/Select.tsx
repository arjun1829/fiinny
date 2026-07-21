import { type SelectHTMLAttributes, forwardRef } from 'react';
import { clsx } from 'clsx';

// Mirrors .fsel / #sort-select (index (1).html) — the plain native <select>
// used for city/type dropdowns in the post form and the sort control.
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      className={clsx(
        'w-full cursor-pointer rounded-xl border-[1.5px] border-border bg-white px-[14px] py-[10px] text-sm font-semibold text-ink outline-none transition-colors focus:border-brand',
        className,
      )}
      {...props}
    />
  ),
);
Select.displayName = 'Select';
