// The authenticated-user profile — created once in Firestore on first
// successful sign-in (features/auth/lib/auth-firestore.ts). Distinct from
// Firebase Auth's own User object (which only carries uid/phoneNumber/etc.
// — this is where app-specific profile data lives, matching the
// architecture doc's §3.6 design: "A users/{uid} profile document is
// created/read exactly once per session."
//
// `role` added in Phase 12 — the admin dashboard needs a way to
// distinguish admins from regular users. Replaces the original's plaintext
// password prompt (checkAdminPass(), index (1).html) — which called a
// function never defined anywhere in the source file (architecture report
// §1.10) — with a real Firestore-backed role check, consistent with the
// same pattern this app already uses for every other permission boundary
// (firestore.rules checking request.auth against a document field, not a
// client-side secret). `role` defaults to 'user' for everyone; only an
// admin manually flips a specific uid to 'admin' via the Firebase Console
// — never a client-writable field, see firestore.rules.
export type UserRole = 'user' | 'admin';

export interface UserProfile {
  uid: string;
  /**
   * E.164, from Firebase Auth's phoneNumber — the verified sign-in number.
   * Renamed from `phone` (Phase 14, User Profile Management) to
   * `primaryPhone` to read unambiguously alongside the new, optional
   * `alternatePhone` — nothing in the app read the old field name back off
   * a profile document (the Profile page has always read
   * `user.phoneNumber` from Firebase Auth directly instead), so this rename
   * has no other call sites to update. Auth-derived and never user-editable
   * — see ProfileEditForm, which has no field for this.
   */
  primaryPhone: string;
  createdAt: string; // ISO timestamp, set once on first sign-in, never overwritten
  /**
   * ISO timestamp, updated on every successful sign-in (auth-provider.tsx)
   * — distinct from `createdAt`, which is write-once. New in Phase 14.
   */
  lastLoginAt: string;
  /** ISO timestamp, updated whenever the profile document itself is edited (profile-firestore.ts's updateUserProfile). New in Phase 14. */
  updatedAt: string;
  role: UserRole;

  // --- Profile Management fields (Phase 14) — all optional until the user
  // fills them in via /profile/edit; profileCompleted tracks whether the
  // two required fields (fullName, email) have both been provided.
  fullName?: string;
  email?: string;
  /** Optional second contact number, distinct from the Auth-verified primaryPhone — NOT verified via OTP, just a free-text E.164-normalized number. */
  alternatePhone?: string;
  /** Firebase Storage download URL for the user's uploaded profile photo — the Storage object path itself is derivable from `uid` (see profile-storage.ts), so only the URL is persisted here. */
  profilePhotoURL?: string;
  /** True once fullName and email are both non-empty. Computed and stored by profile-firestore.ts's updateUserProfile on every write, rather than recomputed ad hoc by every reader — see isProfileComplete(). */
  profileCompleted: boolean;

  // --- Pro Subscription fields (Phase 15 — Freemium/Razorpay). All optional
  // — absent entirely for every free user, never defaulted to false/null on
  // write. Field names match firestore.rules' subscriptionFieldsUnchanged()
  // guard exactly; renaming any of these requires updating that rule too.
  // Written client-side by subscription-firestore.ts's
  // activateProAfterPayment(), but only ever called after
  // app/api/razorpay/verify/route.ts has confirmed the Razorpay signature
  // server-side — see that file's header comment for the full trust chain.
  /** True once a payment has been verified; NOT sufficient on its own to gate a feature — always pair with a proExpiry check (see isProActive() in types/subscription.ts), since this flag is never cleared on expiry. */
  isPro?: boolean;
  /** ISO timestamp, 30 days from the verified payment. Pro is active iff isPro && proExpiry is in the future. */
  proExpiry?: string;
  razorpayPaymentId?: string;
  razorpayOrderId?: string;
  /** ISO timestamp of the most recent verified payment — distinct from proExpiry (when access ends) and updatedAt (touched by unrelated profile edits too). */
  lastPaymentAt?: string;
}
