'use client';

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { clsx } from 'clsx';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Matches the original's per-modal max-width overrides (e.g. .mbox { max-width: 580px }). */
  maxWidthClassName?: string;
}

// Mirrors .overlay / .mbox (index (1).html, DETAIL MODAL block) — fixed
// backdrop with blur, centered box, fadeIn/fadeUp entrance, click-outside to
// close, and a body scroll lock while open. The original toggled
// `style.display` on a handful of always-mounted overlay divs and set
// `document.body.style.overflow`; this replaces that with a single
// state-driven component mounted only while `open` is true.
export function Modal({ open, onClose, children, maxWidthClassName = 'max-w-[580px]' }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-[rgba(28,25,23,0.65)] p-5 backdrop-blur-[6px]"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 18 }}
            transition={{ duration: 0.26, ease: 'easeOut' }}
            className={clsx(
              'max-h-[92vh] w-full overflow-y-auto rounded-r3 bg-white shadow-[0_40px_100px_rgba(28,25,23,0.28)]',
              maxWidthClassName,
            )}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// Mirrors .mclose (the circular × button used in every modal header).
export function ModalCloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Close"
      className="flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-full bg-[#f5f4f2] text-xl transition-colors hover:bg-[#e7e5e0]"
    >
      &times;
    </button>
  );
}
