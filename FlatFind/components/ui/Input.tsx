import { type InputHTMLAttributes, type TextareaHTMLAttributes, forwardRef } from 'react';
import { clsx } from 'clsx';

// Mirrors .finp (index (1).html, POST MODAL block) — used for every text/
// number/tel input across the login, post-listing, and profile forms.
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={clsx(
        'w-full rounded-xl border-[1.5px] border-border bg-white px-[14px] py-[10px] text-sm text-ink outline-none transition-colors focus:border-brand',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

// Mirrors .fta — the multiline description field on the post-listing form.
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={clsx(
        'min-h-[82px] w-full resize-y rounded-xl border-[1.5px] border-border bg-white px-[14px] py-[10px] text-sm text-ink outline-none transition-colors focus:border-brand',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';

// Mirrors .flbl — the small uppercase field label used above every form input.
export function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-[5px] block text-[11px] font-extrabold tracking-[0.1em] text-[#a8a29e]">{children}</label>
  );
}
