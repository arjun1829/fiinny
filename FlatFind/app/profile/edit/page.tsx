'use client';

import { useEffect } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useRequireAuth } from '@/features/auth/hooks/useRequireAuth';
import { LoginModal } from '@/features/auth/components/LoginModal';
import { ProfileEditForm } from '@/features/profile/components/ProfileEditForm';
import { formatPrimaryPhone } from '@/features/profile/lib/format-phone';

// New in Phase 14 (User Profile Management) — reachable from the "Complete
// Profile" CTA and every "Edit Profile" link on /profile. Auth-gated the
// same way every other protected route in this app is (/post, /edit/[id]):
// useRequireAuth() opens the login modal if signed out, form only renders
// once both `user` (Firebase Auth) and `profile` (Firestore) are loaded —
// the second check matters here specifically because ProfileEditForm needs
// profile.fullName/email/etc. to pre-fill from, not just a signed-in uid.
export default function ProfileEditPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const { requireAuth, modalOpen, modalMessage, closeModal } = useRequireAuth();

  useEffect(() => {
    if (!authLoading && !user) {
      requireAuth('Login to edit your profile.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  if (authLoading) {
    return <div className="py-20 text-center text-muted">Loading…</div>;
  }

  if (!user) {
    return <LoginModal open={modalOpen} onClose={closeModal} message={modalMessage} />;
  }

  if (!profile) {
    return <div className="py-20 text-center text-muted">Loading profile…</div>;
  }

  const { masked, avatarGlyph } = formatPrimaryPhone(user.phoneNumber);

  return <ProfileEditForm profile={profile} maskedPhone={masked} avatarGlyph={avatarGlyph} />;
}
