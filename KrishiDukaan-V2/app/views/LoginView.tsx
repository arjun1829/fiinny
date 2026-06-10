import { useEffect, useRef, useState } from 'react';
import { ICONS } from '../constants';
import { motion } from 'framer-motion';
import {
  signInWithPhoneNumber,
  RecaptchaVerifier,
  type ConfirmationResult,
} from 'firebase/auth';
import { Phone } from 'lucide-react';
import { auth, getUserProfile } from '../firebase';
import { useI18n } from '../i18n/I18nContext';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

interface LoginViewProps {
  onBack: () => void;
  onNavigateToSignup: () => void;
  onSuccess: (user: any, profile: any) => void;
}

export default function LoginView({ onBack, onNavigateToSignup, onSuccess }: LoginViewProps) {
  const { t } = useI18n();

  // Phone OTP state
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const confirmationRef = useRef<ConfirmationResult | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

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
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) { setError('Enter a valid 10-digit mobile number.'); return; }
    if (!recaptchaRef.current) { setError('reCAPTCHA not ready. Please refresh and try again.'); return; }
    setLoading(true);
    try {
      const result = await signInWithPhoneNumber(auth, toE164(digits), recaptchaRef.current);
      confirmationRef.current = result;
      setStep('otp');
    } catch (err: any) {
      console.error('OTP send error:', err);
      setError(err.message || 'Failed to send OTP. Try again.');
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
        console.warn('[Login] No profile found for UID:', user.uid, '| Phone:', user.phoneNumber);
        setError('No account found for this number. Please contact support or ask your administrator to create your account.');
        setStep('phone');
        setOtp('');
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

        <button
          onClick={onBack}
          className="mb-6 flex items-center gap-2 text-primary font-bold hover:translate-x-1 transition-transform text-sm"
        >
          <ICONS.ChevronRight className="w-4 h-4 rotate-180" /> {t('backToStore')}
        </button>

        <h1 className="text-3xl font-bold text-on-surface mb-2">{t('welcomeBack')}</h1>
        <p className="text-on-surface-variant mb-6 font-medium">Sign in to your KrishiDukan account.</p>

        {error && (
          <div className="bg-red-50 text-red-700 p-4 rounded-2xl border border-red-100 mb-6 text-sm font-medium">
            {error}
          </div>
        )}

        {/* ── Phone OTP flow ── */}
        {step === 'phone' ? (
          <form onSubmit={handleSendOtp} className="space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-widest text-on-surface-variant ml-1">
                Mobile Number
              </label>
              <div className="flex items-center gap-2 bg-surface-container-low border border-outline-variant rounded-2xl px-5 py-4">
                <span className="text-sm font-bold text-on-surface-variant">+91</span>
                <input
                  type="tel"
                  required
                  disabled={loading}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="10-digit mobile number"
                  className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-on-surface"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-white font-black uppercase tracking-widest py-4 rounded-2xl shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all mt-4 disabled:opacity-70 disabled:scale-100"
            >
              {loading ? 'Sending OTP…' : 'Send OTP'}
            </button>
          </form>
        ) : (
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
              {loading ? 'Verifying…' : 'Verify & Sign In'}
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

        <div className="mt-8 text-center">
          <p className="text-sm text-on-surface-variant font-medium">
            {t('noAccount')}
            <button onClick={onNavigateToSignup} className="text-primary font-bold ml-1 hover:underline">
              {t('createAccount')}
            </button>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
