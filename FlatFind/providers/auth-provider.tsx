'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { onAuthStateChanged, signOut as firebaseSignOut, type User } from 'firebase/auth';
import { auth } from '@/firebase/client';
import { getUserProfile, createUserProfile, recordLogin } from '@/features/auth/lib/auth-firestore';
import type { UserProfile } from '@/types/user';

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  /** True until the initial onAuthStateChanged callback has fired at least once. */
  loading: boolean;
  signOut: () => Promise<void>;
  /**
   * Re-fetches the current user's Firestore profile and updates context.
   * New in Phase 14 (Profile Management) — `profile` was previously only
   * ever set once per sign-in (inside the onAuthStateChanged callback
   * below), so a save on /profile/edit had no way to update what the rest
   * of the app sees without this. Does nothing if signed out.
   */
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Replaces isLoggedIn()'s `!!localStorage.getItem('ff_phone')` (index (1).html
// head script) — "logged in" is now defined by Firebase Auth's own session
// state, not a string in localStorage a user could set themselves via
// devtools. This is a top-level provider (wired into app/layout.tsx) so any
// component can call useAuth() instead of each protected surface
// independently re-implementing a login check, unlike the original where
// isLoggedIn()/requireLogin() were called ad hoc from a dozen different
// places with no shared state container.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        let userProfile = await getUserProfile(firebaseUser.uid);
        if (!userProfile) {
          // First sign-in — create the Firestore profile once (architecture
          // doc §3.6). Phone comes from Firebase Auth itself, not user input,
          // since the number is already verified by this point.
          await createUserProfile(firebaseUser.uid, firebaseUser.phoneNumber ?? '');
          userProfile = await getUserProfile(firebaseUser.uid);
        } else {
          // Every sign-in after the first — record it (Phase 14) without
          // touching createdAt or any user-entered profile field, then
          // re-read so `lastLoginAt` in context reflects this session
          // rather than staying one login behind. Passing phoneNumber
          // through re-asserts primaryPhone from the live Auth session on
          // every sign-in — required by firestore.rules' updated update
          // rule, and what self-heals a pre-Phase-14 document that still
          // has the old `phone` field name instead of `primaryPhone` (see
          // recordLogin()'s own comment in auth-firestore.ts).
          await recordLogin(firebaseUser.uid, firebaseUser.phoneNumber ?? '');
          userProfile = await getUserProfile(firebaseUser.uid);
        }
        setProfile(userProfile);
      } else {
        setProfile(null);
      }

      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  const refreshProfile = useCallback(async () => {
    if (!auth.currentUser) return;
    const userProfile = await getUserProfile(auth.currentUser.uid);
    setProfile(userProfile);
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut, refreshProfile }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
