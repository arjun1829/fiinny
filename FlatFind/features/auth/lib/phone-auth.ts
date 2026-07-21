import { RecaptchaVerifier, signInWithPhoneNumber, type ConfirmationResult } from 'firebase/auth';
import { auth } from '@/firebase/client';

// Replaces the original's entirely client-side OTP scheme (sendOTP()/
// verifyOTP(), index (1).html head script) — the app never generates,
// holds, or compares a code itself. Firebase Auth issues and verifies the
// OTP server-side; the client only ever sees a `ConfirmationResult` handle,
// never the code. This is the single most important fix identified in the
// architecture report (§1.3): the original's OTP was a random 6-digit
// number generated with Math.random(), echoed into the DOM and
// console.log, and compared against itself client-side — anyone with
// devtools could read or bypass it entirely.
//
// India-only 10-digit mobile numbers (matches the original's exact
// validation: `phone.length!==10||!/^[6-9]/.test(phone)`) are normalized to
// E.164 (+91XXXXXXXXXX) before being handed to Firebase, which requires
// E.164 format.
const INDIA_MOBILE_REGEX = /^[6-9]\d{9}$/;

export function isValidIndianMobile(phone: string): boolean {
  return INDIA_MOBILE_REGEX.test(phone.trim());
}

export function toE164(phone: string): string {
  return `+91${phone.trim()}`;
}

let recaptchaVerifier: RecaptchaVerifier | null = null;

/**
 * Lazily creates (or reuses) the invisible reCAPTCHA verifier Firebase
 * requires before sending an SMS. Must be called with a container element
 * already mounted in the DOM (see LoginModal's hidden div).
 */
function getRecaptchaVerifier(containerId: string): RecaptchaVerifier {
  if (!recaptchaVerifier) {
    recaptchaVerifier = new RecaptchaVerifier(auth, containerId, { size: 'invisible' });
  }
  return recaptchaVerifier;
}

/** Sends an OTP SMS via Firebase Auth. Returns a ConfirmationResult to pass to confirmOtp(). */
export async function sendPhoneOtp(phone: string, recaptchaContainerId: string): Promise<ConfirmationResult> {
  const verifier = getRecaptchaVerifier(recaptchaContainerId);
  return signInWithPhoneNumber(auth, toE164(phone), verifier);
}

/** Confirms the OTP the user entered, completing sign-in. Throws on an incorrect/expired code. */
export async function confirmPhoneOtp(confirmationResult: ConfirmationResult, code: string) {
  return confirmationResult.confirm(code);
}

/** Resets the cached reCAPTCHA verifier — call after a failed send so the next attempt gets a fresh challenge. */
export function resetRecaptcha(): void {
  recaptchaVerifier?.clear();
  recaptchaVerifier = null;
}
