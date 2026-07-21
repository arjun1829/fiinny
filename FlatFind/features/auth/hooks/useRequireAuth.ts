'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/providers/auth-provider';

// Mirrors requireLogin(msg, callback) (index (1).html, head script) — the
// original's pattern for gating an action behind login: if already logged
// in, run the callback immediately; otherwise show the login modal with a
// contextual message and run the callback after successful sign-in
// (_pendingLoginCallback). Every component that needs this (save button,
// post listing, saved/history tab guards) calls the returned `requireAuth`
// function instead of duplicating the "check isLoggedIn(), else open modal"
// logic inline, the way the original did it ad hoc from ~10 different call
// sites with a single shared module-global callback slot.
//
// The pending callback fires when `user` transitions from signed-out to
// signed-in while the modal is open — not on modal close, since closing via
// the × button/backdrop (user gave up) must NOT run the callback, only a
// successful sign-in should. Watching the auth-state transition itself
// (rather than guessing intent from how the modal closed) is what makes
// that distinction reliable.
export function useRequireAuth() {
  const { user } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMessage, setModalMessage] = useState<string | undefined>();
  const pendingCallback = useRef<(() => void) | null>(null);
  const wasLoggedOutWhenOpened = useRef(false);

  const requireAuth = useCallback(
    (message: string, callback?: () => void) => {
      if (user) {
        callback?.();
        return;
      }
      pendingCallback.current = callback ?? null;
      wasLoggedOutWhenOpened.current = true;
      setModalMessage(message);
      setModalOpen(true);
    },
    [user],
  );

  useEffect(() => {
    if (user && wasLoggedOutWhenOpened.current && modalOpen) {
      wasLoggedOutWhenOpened.current = false;
      setModalOpen(false);
      const callback = pendingCallback.current;
      pendingCallback.current = null;
      callback?.();
    }
  }, [user, modalOpen]);

  const closeModal = useCallback(() => {
    wasLoggedOutWhenOpened.current = false;
    pendingCallback.current = null;
    setModalOpen(false);
  }, []);

  return { requireAuth, modalOpen, modalMessage, closeModal };
}
