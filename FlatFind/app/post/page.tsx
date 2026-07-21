'use client';

import { useEffect } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useRequireAuth } from '@/features/auth/hooks/useRequireAuth';
import { LoginModal } from '@/features/auth/components/LoginModal';
import { PostListingForm } from '@/features/posting/components/PostListingForm';

// Mirrors openPost() (index (1).html, head script): `if(!isLoggedIn()){
// requireLogin('Login to post a listing.',...); return; }`. The original
// showed the login modal over whatever tab was active when "+ Post" was
// clicked; here the same gate is expressed as a route guard — visiting
// /post while signed out shows the login prompt, and the form only renders
// once authenticated.
//
// requireAuth() is called from a useEffect, not directly during render —
// calling it inline in the component body would trigger a state update
// (setModalOpen) synchronously while React is still rendering this
// component, which is invalid. The effect runs once auth's loading state
// resolves and re-runs only if `user` changes, matching requireLogin's
// original one-shot-per-attempt behavior without violating React's
// render-purity rules.
export default function PostPage() {
  const { user, loading } = useAuth();
  const { requireAuth, modalOpen, modalMessage, closeModal } = useRequireAuth();

  useEffect(() => {
    if (!loading && !user) {
      requireAuth('Login to post a listing.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- requireAuth is stable per user identity; re-including it would re-fire on every render
  }, [loading, user]);

  if (loading) {
    return <div className="py-20 text-center text-muted">Loading…</div>;
  }

  if (!user) {
    return <LoginModal open={modalOpen} onClose={closeModal} message={modalMessage} />;
  }

  return <PostListingForm />;
}
