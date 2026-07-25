import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { clsx } from 'clsx';

type ButtonVariant = 'brand' | 'ghost' | 'warn' | 'outline' | 'pro';
type ButtonSize = 'md' | 'sm' | 'xs';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

// Mirrors the original SPA's .btn / .btn-brand / .btn-ghost2 / .btn-warn /
// .btn-outline / .btn-pro / .btn-sm / .btn-xs classes (index (1).html, BUTTONS
// block). Padding, radius, and font-size values are ported 1:1.
const variantClasses: Record<ButtonVariant, string> = {
  brand: 'bg-brand text-white hover:bg-brand-2 hover:-translate-y-px hover:shadow-[0_4px_14px_rgba(28,69,50,0.3)]',
  ghost: 'bg-brand-light text-brand-2 hover:bg-[#bbf7d0]',
  warn: 'bg-accent-light text-accent hover:bg-[#fed7aa]',
  outline: 'bg-white text-ink border border-border-2 hover:border-brand hover:text-brand',
  pro: 'bg-brand-light text-brand-2',
};

const sizeClasses: Record<ButtonSize, string> = {
  md: 'rounded-xl px-5 py-[9px] text-[13.5px]',
  sm: 'rounded-[10px] px-[15px] py-[7px] text-[13px]',
  xs: 'rounded-lg px-3 py-[5px] text-xs',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'brand', size = 'md', className, ...props }, ref) => (
    <button
      ref={ref}
      className={clsx(
        'inline-flex items-center justify-center gap-2 font-bold leading-none transition-all duration-[180ms]',
        'disabled:pointer-events-none disabled:opacity-50',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
