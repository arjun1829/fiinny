import { useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { AuthContext, type AuthState } from './useAuth';

const PLATFORM_ROLES = new Set(['admin', 'analyst', 'master']);

/**
 * Emails allowed to view analytics WITHOUT being ERP super admins. Keep this in
 * sync with the `analytics/{document=**}` rule in
 * ../../KARANARJUNKSKPVTLTD/firestore.rules — that rule is the real gate; this
 * list only controls what the UI renders. Lowercase.
 */
const ANALYTICS_ALLOWLIST = new Set([
  'superadmin@fiinny.com',
  'arjun.tanpure@fiinny.com',
]);

/**
 * Resolve whether a signed-in user may view analytics. A user is allowed if
 * their email is on the analytics allowlist, OR they are a platform super admin
 * in finny-erp-uat (users/{uid} with tenantId == 'master' and an admin-tier
 * role) — mirroring `isSuperAdmin()` in that project's firestore.rules.
 */
async function resolveAuthorized(user: User): Promise<boolean> {
  if (user.email && ANALYTICS_ALLOWLIST.has(user.email.toLowerCase())) return true;
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (!snap.exists()) return false;
    return snap.get('tenantId') === 'master' && PLATFORM_ROLES.has(snap.get('role'));
  } catch {
    // Permission denied / offline → treat as not authorized.
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    ready: false,
    user: null,
    authorized: null,
  });

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setState({ ready: true, user: null, authorized: null });
        return;
      }
      setState({ ready: true, user, authorized: null });
      const authorized = await resolveAuthorized(user);
      // Guard against a later auth change racing this resolution.
      setState((prev) =>
        prev.user?.uid === user.uid ? { ...prev, authorized } : prev,
      );
    });
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
