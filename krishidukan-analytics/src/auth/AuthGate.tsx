import { type ReactNode } from 'react';
import { signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { useAuth } from './useAuth';

/**
 * Renders `children` only for an authenticated AND authorized user. Everyone
 * else gets a sign-in / access-denied screen. This is a UX gate only — real
 * enforcement is in Firestore security rules on the `analytics/**` namespace.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { ready, user, authorized } = useAuth();

  if (!ready) {
    return <Centered>Loading…</Centered>;
  }

  if (!user) {
    return (
      <Centered>
        <h1>KrishiDukan Analytics</h1>
        <p>Sign in with your authorized FinERP account to continue.</p>
        <button onClick={() => void signInWithPopup(auth, googleProvider)}>
          Sign in with Google
        </button>
      </Centered>
    );
  }

  if (authorized === null) {
    return <Centered>Checking access…</Centered>;
  }

  if (!authorized) {
    return (
      <Centered>
        <h1>Access denied</h1>
        <p>
          {user.email ?? 'This account'} is not authorized to view KrishiDukan
          Analytics. Contact an administrator.
        </p>
        <button onClick={() => void signOut(auth)}>Sign out</button>
      </Centered>
    );
  }

  return <>{children}</>;
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.75rem',
        textAlign: 'center',
        padding: '2rem',
      }}
    >
      {children}
    </div>
  );
}
