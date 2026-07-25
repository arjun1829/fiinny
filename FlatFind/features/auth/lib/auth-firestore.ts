import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/firebase/client';
import type { UserProfile } from '@/types/user';

const USERS_COLLECTION = 'users';

// Duck-typed rather than `instanceof Timestamp` — see listings-firestore.ts's
// isTimestampLike() for the full rationale (this codebase is client-SDK
// only now, so the original cross-SDK Timestamp mismatch this guarded
// against can no longer happen, but the check is harmless and consistent
// with the same helper elsewhere).
function isTimestampLike(value: unknown): value is { toDate: () => Date } {
  return typeof value === 'object' && value !== null && typeof (value as { toDate?: unknown }).toDate === 'function';
}

/**
 * Fetches the Firestore profile for a signed-in Firebase Auth user, or null
 * if this is their first sign-in and no profile exists yet.
 *
 * `createdAt`/`lastLoginAt`/`updatedAt` are all stored as Firestore
 * Timestamps (written via serverTimestamp()) but UserProfile declares them
 * as ISO strings, matching every other date field in this app (Listing.created
 * uses the same convention). Converted here — the same pattern
 * listings-firestore.ts's fromFirestoreDoc() already uses — rather than
 * casting straight to UserProfile and letting a raw Timestamp object leak
 * into components expecting a string (ProfilePage's
 * `new Date(profile.createdAt)` would otherwise receive a Timestamp
 * instance, not a date-parseable value, and silently produce an Invalid
 * Date).
 *
 * `primaryPhone` falls back to the legacy `phone` field (`data.phone`) when
 * `data.primaryPhone` is absent — a document written before Phase 14's
 * `phone` → `primaryPhone` rename has the old field name, not the new one.
 * This makes a legacy document read correctly THIS session, before
 * recordLogin()'s next write physically renames the field in Firestore —
 * without this fallback, `profile.primaryPhone` would silently be
 * `undefined` for any pre-rename user until their next sign-in completed.
 */
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, USERS_COLLECTION, uid));
  if (!snap.exists()) return null;
  const data = snap.data();
  const toIso = (value: unknown) => (isTimestampLike(value) ? value.toDate().toISOString() : value);
  return {
    ...(data as Omit<UserProfile, 'createdAt' | 'lastLoginAt' | 'updatedAt' | 'primaryPhone'>),
    primaryPhone: (data.primaryPhone ?? data.phone ?? '') as string,
    createdAt: toIso(data.createdAt) as string,
    lastLoginAt: toIso(data.lastLoginAt) as string,
    updatedAt: toIso(data.updatedAt) as string,
  };
}

/**
 * Creates the users/{uid} profile document on first sign-in only — the
 * caller (auth-provider.tsx) already checks getUserProfile() returns null
 * before calling this, so `createdAt` is never overwritten on subsequent
 * logins. `lastLoginAt` starts equal to `createdAt` (this IS their first
 * login); every later sign-in updates it via recordLogin() below instead of
 * calling this function again.
 */
export async function createUserProfile(uid: string, primaryPhone: string): Promise<void> {
  await setDoc(doc(db, USERS_COLLECTION, uid), {
    uid,
    primaryPhone,
    createdAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    role: 'user',
    profileCompleted: false,
  });
}

/**
 * Updates `lastLoginAt` on every sign-in AFTER the first (auth-provider.tsx
 * calls this instead of createUserProfile once a profile already exists).
 * Never touches `createdAt` or any user-editable profile field (fullName/
 * email/etc.), so signing in can never clobber profile data a user entered
 * on a different device/session.
 *
 * Also re-asserts `primaryPhone` on every call, always from the live
 * Firebase Auth session (never from whatever the document already had) —
 * this is what firestore.rules' updated `users/{userId}` update rule now
 * requires (request.resource.data.primaryPhone ==
 * request.auth.token.phone_number, see that file's comment for the full
 * why), and it's also what self-heals any users/{uid} document written
 * before the `phone` → `primaryPhone` rename: that document has no
 * `primaryPhone` key at all until the next sign-in writes one here.
 */
export async function recordLogin(uid: string, primaryPhone: string): Promise<void> {
  await setDoc(doc(db, USERS_COLLECTION, uid), { primaryPhone, lastLoginAt: serverTimestamp() }, { merge: true });
}
