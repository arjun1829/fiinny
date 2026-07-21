import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/firebase/client';
import type { UserProfile } from '@/types/user';

const USERS_COLLECTION = 'users';

export interface ProfileEditInput {
  fullName: string;
  email: string;
  alternatePhone: string; // raw digits or empty — normalized/validated by the caller (ProfileEditForm) before this is called
  profilePhotoURL?: string; // omitted when the photo isn't being changed in this save
}

/** True once both required fields (fullName, email) are present and non-blank. */
export function isProfileComplete(input: Pick<ProfileEditInput, 'fullName' | 'email'>): boolean {
  return input.fullName.trim().length > 0 && input.email.trim().length > 0;
}

/**
 * Writes the editable profile fields to the user's existing users/{uid}
 * document — reuses the same document createUserProfile() created on first
 * sign-in (auth-firestore.ts), never a new one. Uses updateDoc rather than
 * setDoc so a save here structurally cannot create a users/{uid} doc that
 * doesn't already exist (it would throw instead) — this function is only
 * ever reachable from a signed-in session, and the profile document is
 * guaranteed to already exist by that point (AuthProvider creates it on
 * first sign-in before any UI that could call this is even reachable).
 *
 * `profileCompleted` is computed here, not trusted from the caller — same
 * reasoning as every other derived-server-truth field in this app (e.g.
 * Listing.tag being classified server-side-equivalent in posting-firestore.ts
 * rather than trusting a client-supplied value).
 */
export async function updateUserProfile(uid: string, input: ProfileEditInput): Promise<void> {
  const fullName = input.fullName.trim();
  const email = input.email.trim();
  const alternatePhone = input.alternatePhone.trim();

  const patch: Record<string, unknown> = {
    fullName,
    email,
    alternatePhone: alternatePhone || null,
    profileCompleted: isProfileComplete({ fullName, email }),
    updatedAt: serverTimestamp(),
  };
  if (input.profilePhotoURL !== undefined) {
    patch.profilePhotoURL = input.profilePhotoURL;
  }

  await updateDoc(doc(db, USERS_COLLECTION, uid), patch);
}

/** Clears just the photo URL — used by "Remove Photo" without touching any other field. */
export async function clearProfilePhoto(uid: string): Promise<void> {
  await updateDoc(doc(db, USERS_COLLECTION, uid), {
    profilePhotoURL: null,
    updatedAt: serverTimestamp(),
  } satisfies Partial<Record<keyof UserProfile, unknown>>);
}
