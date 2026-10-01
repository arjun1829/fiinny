import { useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { AuthContext, type AuthState } from './useAuth';

const SUPER_ADMIN_EMAIL = 'superadmin@fiinny.com';
const PLATFORM_ROLES = new Set(['admin', 'analyst', 'master']);

/**
 * Resolve whether a signed-in user may view analytics.
 *
 * We reuse the existing authorization model from the finny-erp-uat project
 * rather than inventing a new one. This mirrors `isSuperAdmin()` in that
 * project's firestore.rules, which gates every platform-wide collection:
 * a platform super admin is either the master tenant's admin/analyst
 * (users/{uid} with tenantId == 'master' and an admin-tier role), OR the
 * dedicated superadmin@fiinny.com account. Any user can read their own user
 * doc, so this check succeeds/fails cleanly; the email branch covers the
 * platform account which carries no tenant.
 */
async function resolveAuthorized(user: User): Promise<boolean> {
  if (user.email?.toLowerCase() === SUPER_ADMIN_EMAIL) return true;
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
