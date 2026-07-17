import { useEffect, useRef, useState } from 'react';
import { ICONS } from '../constants';
import { motion } from 'framer-motion';
import {
  signInWithPhoneNumber,
  RecaptchaVerifier,
  type ConfirmationResult,
  type User,
} from 'firebase/auth';
import { Tractor, Store, Factory, CheckCircle2 } from 'lucide-react';
import { auth, getUserProfile, saveUserProfile } from '../firebase';
import { useI18n } from '../i18n/I18nContext';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

interface LoginViewProps {
  onBack: () => void;
  onSuccess: (user: any, profile: any) => void;
}

/**
 * Unified sign-in / sign-up (mirrors the mobile app's onboarding):
 *
 *   phone → OTP → profile exists?  → yes: straight in
 *                                  → no:  continue into onboarding
 *                                         (role + name) — NO "account not
 *                                         found" error, no separate signup.
 *
 * New sellers are then routed to the subscription paywall by the caller's
 * onSuccess handler (same as an unpaid seller logging in).
 */
export default function LoginView({ onBack, onSuccess }: LoginViewProps) {
  const { t } = useI18n();

  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp' | 'onboarding'>('phone');
  const confirmationRef = useRef<ConfirmationResult | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

  // Set when OTP verified but no profile exists — carried into onboarding.
  const [pendingUser, setPendingUser] = useState<User | null>(null);

  // Onboarding fields (new users only)
  const [name, setName] = useState('');
  const [role, setRole] = useState<'customer' | 'retailer' | 'manufacturer'>('customer');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toE164 = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (digits.startsWith('91') && digits.length === 12) return `+${digits}`;
    if (digits.length === 10) return `+91${digits}`;
    return `+${digits}`;
  };

  useEffect(() => {
    let div = document.getElementById('recaptcha-container-login');
    if (!div) {
      div = document.createElement('div');
      div.id = 'recaptcha-container-login';
      document.body.appendChild(div);
    }
    const verifier = new RecaptchaVerifier(auth, div, { size: 'invisible' });
    recaptchaRef.current = verifier;
    return () => {
      try { verifier.clear(); } catch { /* ignore */ }
      recaptchaRef.current = null;
    };
  }, []);

  // ── Phone OTP handlers ──────────────────────────────────────────────────────

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const digits = phone; // already stripped to digits by the onChange handler
    if (digits.length !== 10) { setError('Enter a valid 10-digit mobile number.'); return; }
    if (!recaptchaRef.current) { setError('reCAPTCHA not ready. Please refresh and try again.'); return; }
    setLoading(true);
    try {
      const result = await signInWithPhoneNumber(auth, toE164(digits), recaptchaRef.current);
      confirmationRef.current = result;
      setStep('otp');
    } catch (err: any) {
      console.error('OTP send error:', err);
      const code = err?.code ?? '';
      if (code === 'auth/too-many-requests') {
        setError('Too many attempts. Please wait a few minutes and try again.');
      } else if (code === 'auth/invalid-phone-number') {
        setError('Please enter a valid 10-digit mobile number.');
      } else if (code === 'auth/quota-exceeded') {
        setError('Daily SMS limit reached. Please try again tomorrow or contact support.');
      } else {
        // Surface the raw code — a generic message hides the real cause
        // (quota, captcha, blocked region…) and makes support impossible.
        setError(`Could not send OTP. Please try again.${code ? ` (${code})` : ''}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmationRef.current) return;
    setError(null);
    setLoading(true);
    try {
      const result = await confirmationRef.current.confirm(otp.trim());
      const user = result.user;

      console.log('[Login] OTP verified — UID:', user.uid, '| Phone:', user.phoneNumber);

      let profile = await getUserProfile(user.uid);
      console.log('[Login] getUserProfile result:', profile ? 'found via uidIndex' : 'not found');

      // Fallback for admin-pre-created accounts: no uidIndex exists yet, but
      // users/{phone} was written by the admin. Firebase phone auth sets
      // user.phoneNumber in E.164 format — the same format used as the doc ID.
      if (!profile && user.phoneNumber) {
        console.log('[Login] Fallback: looking up users/', user.phoneNumber);
        try {
          const phoneSnap = await getDoc(doc(db, 'users', user.phoneNumber));
          console.log('[Login] User doc exists:', phoneSnap.exists());

          if (phoneSnap.exists()) {
            profile = phoneSnap.data() as any;
            console.log('[Login] Admin-pre-created account found — bootstrapping uidIndex');

            // Bootstrap the uidIndex so all future getUserProfile calls work.
            // Write uidIndex first (rules only check request.auth.uid == uid,
            // no myPhone() resolution needed) then update the user doc.
            const now = serverTimestamp();
            await setDoc(doc(db, 'uidIndex', user.uid), {
              phone: user.phoneNumber,
              createdAt: now,
            });
            console.log('[Login] uidIndex created successfully');

            // Link the real Auth UID to the pre-created doc. After uidIndex is
            // written, myPhone() resolves correctly, so the update rule passes.
            try {
              await updateDoc(doc(db, 'users', user.phoneNumber), {
                uid: user.uid,
                updatedAt: now,
              });
              console.log('[Login] users/{phone}.uid linked successfully');
            } catch (linkErr) {
              // Non-fatal: the uidIndex already bootstraps the lookup path.
              console.warn('[Login] users/{phone}.uid link failed (non-fatal):', linkErr);
            }
          }
        } catch (fallbackErr) {
          // If this throws it is almost certainly a Firestore permissions error.
          // Log it so the issue is visible in the browser console.
          console.error('[Login] Fallback users/{phone} read failed:', fallbackErr);
        }
      }

      if (!profile) {
        // New user — no error, continue straight into account creation
        // (mirrors mobile's onboarding flow).
        console.log('[Login] No existing account — continuing to onboarding');
        setPendingUser(user);
        setStep('onboarding');
        return;
      }

      console.log('[Login] Login successful — role:', (profile as any)?.role);

      onSuccess(user, profile);
    } catch (err: any) {
      console.error('OTP verify error:', err);
      setError(
        err.message?.includes('invalid-verification-code') || err.code === 'auth/invalid-verification-code'
          ? 'Incorrect OTP. Please check and try again.'
          : err.message || 'Verification failed. Try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  // ── Onboarding (new users) ──────────────────────────────────────────────────

  const handleCompleteOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingUser) { setError('Session expired. Please sign in again.'); setStep('phone'); return; }
    if (!name.trim()) { setError('Please enter your name.'); return; }
    setError(null);
    setLoading(true);
    try {
      const normalizedPhone =
        (pendingUser.phoneNumber || `+91${phone}`).replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
      const profile = {
        name: name.trim(),
        email: `${normalizedPhone}@krishidukan.local`,
        role,
        phone: normalizedPhone,
        phoneNormalized: normalizedPhone,
      };
      await saveUserProfile(pendingUser.uid, profile);
      // onSuccess routes sellers (unpaid) to the subscription page and
      // consumers home — same paths as an existing account.
      onSuccess(pendingUser, profile);
    } catch (err: any) {
      console.error('[Login] Onboarding save failed:', err);
      setError('Could not create your account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Role picker (onboarding step) ───────────────────────────────────────────

  const rolePicker = (
    <div className="mb-2">
      <p className="mb-3 ml-1 text-xs font-black uppercase tracking-widest text-on-surface-variant">I am a…</p>
      <div className="grid grid-cols-3 gap-3">
        {([
          { value: 'customer' as const, icon: Tractor, label: 'Farmer', sub: 'Buy products online', activeBg: 'bg-green-600' },
          { value: 'retailer' as const, icon: Store, label: 'Retailer', sub: 'Run an agri shop', activeBg: 'bg-blue-600' },
          { value: 'manufacturer' as const, icon: Factory, label: 'Manufacturer', sub: 'Supply & distribute', activeBg: 'bg-orange-600' },
        ]).map(({ value, icon: Icon, label, sub, activeBg }) => {
          const active = role === value;
          return (
            <button
              key={value}
              type="button"
              disabled={loading}
              onClick={() => setRole(value)}
              className={`relative flex flex-col items-center gap-2 rounded-2xl border-2 px-2 py-4 text-center transition-all disabled:opacity-50 ${
                active
                  ? 'border-primary bg-primary/5 shadow-sm'
                  : 'border-outline-variant/40 bg-surface-container-low hover:border-outline-variant hover:bg-surface-container'
              }`}
            >
              {active && <CheckCircle2 className="absolute right-2 top-2 h-3.5 w-3.5 text-primary" />}
              <span className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${active ? `${activeBg} text-white` : 'bg-surface-container text-on-surface-variant'}`}>
                <Icon className="h-5 w-5" />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className={`text-xs font-black leading-tight ${active ? 'text-primary' : 'text-on-surface'}`}>{label}</span>
                <span className="text-[10px] leading-tight text-on-surface-variant">{sub}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white p-8 rounded-3xl shadow-ambient w-full max-w-md border border-surface-container"
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <img src="/images/krishidukan icon.webp" alt="KrishiDukan" className="w-20 h-20 object-contain mb-2" />
          <span className="font-black text-2xl text-primary">Krishi<span className="text-secondary">Dukan</span></span>
        </div>

        {step !== 'onboarding' && (
          <button
            onClick={onBack}
            className="mb-6 flex items-center gap-2 text-primary font-bold hover:translate-x-1 transition-transform text-sm"
          >
            <ICONS.ChevronRight className="w-4 h-4 rotate-180" /> {t('backToStore')}
          </button>
        )}

        {step === 'onboarding' ? (
          <>
            <h1 className="text-3xl font-bold text-on-surface mb-2">Welcome to KrishiDukan!</h1>
            <p className="text-on-surface-variant mb-6 font-medium">
              Let&apos;s set up your account — just a couple of details.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-bold text-on-surface mb-2">Sign in or create account</h1>
            <p className="text-on-surface-variant mb-6 font-medium">
              Enter your mobile number — we&apos;ll sign you in, or set up a new account if you&apos;re new.
            </p>
          </>
        )}

        {error && (
          <div className="bg-red-50 text-red-700 p-4 rounded-2xl border border-red-100 mb-6 text-sm font-medium">
            {error}
          </div>
        )}

        {/* ── Phone step ── */}
        {step === 'phone' && (
          <form onSubmit={handleSendOtp} className="space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-widest text-on-surface-variant ml-1">
                Mobile Number
              </label>
              <div className="flex items-center gap-2 bg-surface-container-low border border-outline-variant rounded-2xl px-5 py-4">
                <span className="text-sm font-bold text-on-surface-variant">+91</span>
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  required
                  disabled={loading}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="10-digit mobile number"
                  className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-on-surface"
                />
              </div>
              {phone.length > 0 && phone.length < 10 && (
                <p className="ml-1 text-xs text-red-600">Enter exactly 10 digits ({phone.length}/10)</p>
              )}
            </div>
            <button
              type="submit"
              disabled={loading || phone.length !== 10}
              className="w-full bg-primary text-white font-black uppercase tracking-widest py-4 rounded-2xl shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all mt-4 disabled:opacity-70 disabled:scale-100"
            >
              {loading ? 'Sending OTP…' : 'Continue'}
            </button>
          </form>
        )}

        {/* ── OTP step ── */}
        {step === 'otp' && (
          <form onSubmit={handleVerifyOtp} className="space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-widest text-on-surface-variant ml-1">
                Enter OTP
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                required
                disabled={loading}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6-digit OTP"
                className="w-full bg-surface-container-low border border-outline-variant rounded-2xl px-5 py-4 text-sm text-center tracking-widest text-lg font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:opacity-50"
                autoFocus
              />
              <p className="text-xs text-on-surface-variant ml-1">OTP sent to +91 {phone.replace(/\D/g, '')}</p>
            </div>
            <button
              type="submit"
              disabled={loading || otp.length < 6}
              className="w-full bg-primary text-white font-black uppercase tracking-widest py-4 rounded-2xl shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all mt-4 disabled:opacity-70 disabled:scale-100"
            >
              {loading ? 'Verifying…' : 'Verify & Continue'}
            </button>
            <button
              type="button"
              onClick={() => { setStep('phone'); setOtp(''); setError(null); }}
              className="w-full text-sm text-on-surface-variant font-medium hover:text-primary transition-colors"
            >
              Change number / Resend OTP
            </button>
          </form>
        )}

        {/* ── Onboarding step (new users) ── */}
        {step === 'onboarding' && (
          <form onSubmit={handleCompleteOnboarding} className="space-y-5">
            {rolePicker}

            <div className="space-y-2">
              <label className="ml-1 text-xs font-black uppercase tracking-widest text-on-surface-variant">
                {t('fullName')}
              </label>
              <input
                type="text"
                required
                disabled={loading}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
                autoFocus
                className="w-full rounded-2xl border border-outline-variant bg-surface-container-low px-5 py-4 text-sm transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
              />
            </div>

            <p className="ml-1 text-xs text-on-surface-variant">
              Creating account for <span className="font-bold text-on-surface">+91 {phone.replace(/\D/g, '')}</span>
            </p>

            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="mt-2 w-full rounded-2xl bg-primary py-4 font-black uppercase tracking-widest text-white shadow-xl shadow-primary/20 transition-all hover:scale-[1.02] active:scale-95 disabled:scale-100 disabled:opacity-70"
            >
              {loading ? 'Creating account…' : 'Create My Account'}
            </button>
          </form>
        )}
      </motion.div>
    </div>
  );
}
