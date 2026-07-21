'use client';

import { useAuth } from '@/providers/auth-provider';

// Replaces checkAdminPass()/lockAdmin() (index (1).html, ADMIN block) — a
// plaintext password prompt whose backing functions were never defined
// anywhere in the source file (architecture report §1.10), meaning the
// admin gate was already non-functional before this rebuild started. This
// checks the signed-in user's real Firestore role field instead
// (users/{uid}.role — Phase 12, types/user.ts), enforced both here (so the
// UI doesn't render admin content to a non-admin) and independently by
// firestore.rules' isAdmin() (so a non-admin can't read admin data even by
// bypassing this client check entirely).
export function useAdminGuard() {
  const { user, profile, loading } = useAuth();
  const isAdmin = profile?.role === 'admin';
  return { isAdmin, checking: loading || (!!user && !profile), user };
}
