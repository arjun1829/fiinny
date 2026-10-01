import { createContext, useContext } from 'react';
import type { User } from 'firebase/auth';

export type AuthState = {
  /** Firebase auth has finished its initial check. */
  ready: boolean;
  /** Signed-in Firebase user, or null. */
  user: User | null;
  /**
   * Whether `user` is allowed to view analytics. null while still resolving.
   * Authorization = platform super admin on the FinERP UAT project
   * (finny-erp-uat), matching that project's Firestore `isSuperAdmin()` rule.
   */
  authorized: boolean | null;
};

export const AuthContext = createContext<AuthState>({
  ready: false,
  user: null,
  authorized: null,
});

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
