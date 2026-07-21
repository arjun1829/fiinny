'use client';

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

type ToastType = 'success' | 'error';

interface ToastState {
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 3400;

// Mirrors #toast (index (1).html, TOAST block) — fixed bottom-right, dark
// background, brand-colored left border, 3.4s auto-dismiss. The original's
// `toast(msg)` global function becomes a React context so any component can
// call `useToast().toast(...)` without prop-drilling.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ToastState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setState({ message, type });
    timerRef.current = setTimeout(() => setState(null), AUTO_DISMISS_MS);
  }, []);

  return (
    <ToastContext.Provider value={{ toast: showToast }}>
      {children}
      <div className="pointer-events-none fixed bottom-7 right-7 z-[9999]">
        <AnimatePresence>
          {state && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className={
                'pointer-events-auto max-w-[340px] rounded-2xl border-l-4 bg-ink px-5 py-[13px] text-sm font-semibold text-white shadow-card-lg ' +
                (state.type === 'error' ? 'border-red-500' : 'border-brand')
              }
              role="status"
            >
              {state.message}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
