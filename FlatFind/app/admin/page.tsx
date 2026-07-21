'use client';

import { useEffect } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useRequireAuth } from '@/features/auth/hooks/useRequireAuth';
import { useAdminGuard } from '@/features/admin/hooks/useAdminGuard';
import { LoginModal } from '@/features/auth/components/LoginModal';
import { AdminStats } from '@/features/admin/components/AdminStats';
import { ModerationQueue } from '@/features/admin/components/ModerationQueue';

// Mirrors #admin-gate / #admin-panel (index (1).html, ADMIN block) — same
// two-state shape (locked gate vs. unlocked dashboard), same "Bulk import
// listings, manage data, view analytics. Not visible to customers." copy
// under the heading. What's real now, replacing what was dead code:
//
//  - The gate itself: useAdminGuard() checks a real Firestore role field
//    (Phase 12) instead of calling checkAdminPass(), a function that was
//    never defined anywhere in the source (architecture report §1.10) —
//    the original's "Unlock Admin" button did nothing at all.
//  - The dashboard body: AdminStats (a real port of renderAdminStats())
//    plus ModerationQueue (genuinely new — the original's bulk-upload
//    dropzone and results table had no corresponding DOM elements to
//    render into, so there was no working admin content here beyond the
//    stat cards).
//
// "Lock Admin" (the original's lockAdmin(), also never defined) has no
// equivalent here — there's nothing to "lock" once admin status is a real,
// server-verified role rather than a session flag toggled by a password
// prompt. Signing out (via /profile) is the real equivalent.
export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, checking } = useAdminGuard();
  const { requireAuth, modalOpen, modalMessage, closeModal } = useRequireAuth();

  useEffect(() => {
    if (!authLoading && !user) {
      requireAuth('Login to access the admin area.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  if (authLoading || checking) {
    return <div className="py-20 text-center text-muted">Loading…</div>;
  }

  if (!user) {
    return <LoginModal open={modalOpen} onClose={closeModal} message={modalMessage} />;
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="w-full max-w-[420px] rounded-r3 border-[1.5px] border-border bg-white p-11 text-center shadow-card-lg">
          <div className="mx-auto mb-[18px] flex h-[60px] w-[60px] items-center justify-center rounded-2xl bg-brand text-[26px]">
            🔒
          </div>
          <h2 className="mb-[6px] font-display text-2xl font-black tracking-tight">Admin Access</h2>
          <p className="text-sm text-muted">This area is restricted to administrators only.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-[5px] flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[30px] font-black tracking-tight">Admin Dashboard</h1>
      </div>
      <p className="mb-7 text-[14.5px] text-muted">Bulk import listings, manage data, view analytics. Not visible to customers.</p>

      <AdminStats />

      <div className="mb-4 font-display text-lg font-bold">Pending Listings</div>
      <ModerationQueue />
    </div>
  );
}
