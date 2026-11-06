import { useEffect, useMemo, useRef, useState } from 'react';
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signInWithPopup,
    signInWithPhoneNumber,
    RecaptchaVerifier,
    updateProfile,
    type ConfirmationResult,
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { auth, db, googleProvider } from '../firebase';
import { BRAND } from '../utils/brand';
import { formatINR, readPendingPlan } from '../utils/pendingPlan';
import { usePricingPlansOnce } from '../hooks/usePricingPlans';
import '../styles/ka-marketing.css';

type Mode = 'phone' | 'email';
type PhoneStep = 'number' | 'code';

const RESEND_SECONDS = 30;

/** Turn a Firebase Auth error into a sentence a shop owner can act on. */
function authMessage(err: any): string {
    const code: string = err?.code || '';
    switch (code) {
        case 'auth/invalid-phone-number':
        case 'auth/missing-phone-number':
            return 'Enter a valid 10-digit mobile number.';
        case 'auth/invalid-verification-code':
            return 'That OTP is not correct. Check the SMS and try again.';
        case 'auth/code-expired':
            return 'This OTP has expired. Tap "Resend OTP" to get a new one.';
        case 'auth/too-many-requests':
            return 'Too many attempts from this device. Wait a few minutes and try again.';
        case 'auth/quota-exceeded':
            return 'We could not send an OTP right now. Please try again in a little while, or sign in with email.';
        case 'auth/captcha-check-failed':
        case 'auth/unauthorized-domain':
            return 'Phone sign-in is not available on this address yet. Please use email, or contact support.';
        case 'auth/network-request-failed':
            return 'No internet connection. Check your network and try again.';
        case 'auth/invalid-credential':
        case 'auth/wrong-password':
        case 'auth/user-not-found':
            return 'Wrong email/username or password.';
        case 'auth/email-already-in-use':
            return 'An account with this email already exists. Sign in instead.';
        case 'auth/weak-password':
            return 'Use a password with at least 6 characters.';
        case 'auth/popup-closed-by-user':
        case 'auth/cancelled-popup-request':
            return '';
        default:
            return err?.message && !code ? err.message : 'Something went wrong. Please try again.';
    }
}

export default function LoginPage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const plans = usePricingPlansOnce();

    const wantsSignup = searchParams.get('signup') === 'true';
    const [mode, setMode] = useState<Mode>('phone');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // ── Phone OTP state ────────────────────────────────────────────────────
    const [phone, setPhone] = useState('');
    const [code, setCode] = useState('');
    const [phoneStep, setPhoneStep] = useState<PhoneStep>('number');
    const [resendIn, setResendIn] = useState(0);
    const confirmation = useRef<ConfirmationResult | null>(null);
    const verifier = useRef<RecaptchaVerifier | null>(null);

    // ── Email state ────────────────────────────────────────────────────────
    const [isLogin, setIsLogin] = useState(!wantsSignup);
    const [email, setEmail] = useState('');
    const [fullName, setFullName] = useState('');
    const [password, setPassword] = useState('');

    // A plan picked on the landing page rides along, so we can say what they are
    // signing up for and send them to its checkout afterwards.
    const pending = useMemo(() => readPendingPlan(), []);
    const pendingPlan = pending ? plans.find(p => p.id === pending.plan) : undefined;

    // Post-login target. Internal absolute paths only ("/x", never "//host") so the
    // parameter cannot become an open redirect. With a plan waiting, go to checkout
    // (the router sends a new account through business setup first).
    const rawRedirect = searchParams.get('redirect');
    const redirectTo =
        rawRedirect && rawRedirect.startsWith('/') && !rawRedirect.startsWith('//')
            ? rawRedirect
            : pending ? '/pricing' : '/dashboard';

    useEffect(() => {
        if (resendIn <= 0) return;
        const t = setTimeout(() => setResendIn(s => s - 1), 1000);
        return () => clearTimeout(t);
    }, [resendIn]);

    useEffect(() => () => {
        verifier.current?.clear();
        verifier.current = null;
    }, []);

    const switchMode = (m: Mode) => {
        setMode(m);
        setError('');
    };

    const getVerifier = () => {
        if (!verifier.current) {
            verifier.current = new RecaptchaVerifier(auth, 'ka-recaptcha', { size: 'invisible' });
        }
        return verifier.current;
    };

    const sendOtp = async () => {
        setError('');
        const digits = phone.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
        if (!/^[6-9]\d{9}$/.test(digits)) {
            setError('Enter a valid 10-digit Indian mobile number.');
            return;
        }
        setLoading(true);
        try {
            confirmation.current = await signInWithPhoneNumber(auth, `+91${digits}`, getVerifier());
            setPhone(digits);
            setPhoneStep('code');
            setCode('');
            setResendIn(RESEND_SECONDS);
        } catch (err: any) {
            console.error(err);
            // A used/failed reCAPTCHA cannot be reused; start fresh next time.
            verifier.current?.clear();
            verifier.current = null;
            setError(authMessage(err));
        } finally {
            setLoading(false);
        }
    };

    const verifyOtp = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!confirmation.current) return;
        if (!/^\d{6}$/.test(code)) {
            setError('Enter the 6-digit OTP from the SMS.');
            return;
        }
        setError('');
        setLoading(true);
        try {
            await confirmation.current.confirm(code);
            // AuthContext creates the user record on first sign-in; the router then
            // sends a new account to business setup before checkout.
            navigate(redirectTo);
        } catch (err: any) {
            console.error(err);
            setError(authMessage(err));
        } finally {
            setLoading(false);
        }
    };

    const handleGoogle = async () => {
        setError('');
        setLoading(true);
        try {
            await signInWithPopup(auth, googleProvider);
            navigate(redirectTo);
        } catch (err: any) {
            console.error(err);
            setError(authMessage(err));
        } finally {
            setLoading(false);
        }
    };

    const handleEmail = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        // Staff accounts created inside the ERP sign in with a bare username,
        // stored as <username>@karanarjun.com.
        let finalEmail = email.trim();
        if (!finalEmail.includes('@')) {
            const low = finalEmail.toLowerCase();
            finalEmail = ['arjutanpure', 'arjuntanpure', 'arjun1829', 'karanarjun'].includes(low)
                ? 'arjutanpure@karanarjun.com'
                : `${low}@karanarjun.com`;
        }

        try {
            if (isLogin) {
                await signInWithEmailAndPassword(auth, finalEmail, password);
                navigate(redirectTo);
                return;
            }
            if (!fullName.trim()) throw Object.assign(new Error('Enter your full name.'), { code: '' });
            const { user } = await createUserWithEmailAndPassword(auth, finalEmail, password);
            await updateProfile(user, { displayName: fullName.trim() });
            // Tenantless record; business setup attaches the tenant.
            await setDoc(doc(db, 'users', user.uid), {
                uid: user.uid,
                email: finalEmail,
                name: fullName.trim(),
                phone: null,
                username: !email.includes('@') ? email : null,
                role: 'admin',
                createdAt: new Date().toISOString(),
            }, { merge: true });
            navigate('/client-onboarding');
        } catch (err: any) {
            console.error(err);
            setError(authMessage(err));
        } finally {
            setLoading(false);
        }
    };

    const title = wantsSignup || pending ? 'Create your account' : 'Welcome back';
    const subtitle = wantsSignup || pending
        ? 'Verify your mobile number to start. It takes under a minute.'
        : `Sign in to your ${BRAND.name} account.`;

    return (
        <div className="ka">
            <div className="ka-auth">
                <aside className="ka-auth-side">
                    <Link to="/" className="ka-brand" aria-label={`${BRAND.name} home`}>
                        <img src="/logo.png" alt="" />
                        <span className="ka-brand-name">KaranArjun <span>ERP</span></span>
                    </Link>

                    <div style={{ display: 'grid', gap: 18 }}>
                        <h2>Billing, GST, khata and stock for your agri-input shop.</h2>
                        <p className="ka-auth-extra">
                            One login for your counter, your godown and your accounts. Set up your business
                            once and start billing the same day.
                        </p>
                        {pendingPlan && pending && (
                            <div className="ka-auth-plan">
                                <small>Your plan</small>
                                <b>{pendingPlan.name} · {pending.cycle === 'yearly' ? 'Yearly' : 'Monthly'}</b>
                                <span>
                                    {formatINR(pending.cycle === 'yearly' ? pendingPlan.yearlyPrice : pendingPlan.monthlyPrice)}
                                    {pending.cycle === 'yearly' ? ' per year' : ' per month'} · pay after setting up your business
                                </span>
                            </div>
                        )}
                        <ul className="ka-ticks ka-auth-extra">
                            <li><CheckCircle2 size={18} /> GST invoices and POS bills in seconds</li>
                            <li><CheckCircle2 size={18} /> Udhaar (khata) for every farmer and retailer</li>
                            <li><CheckCircle2 size={18} /> Batch and expiry-wise stock across godowns</li>
                        </ul>
                    </div>

                    <p className="ka-auth-extra" style={{ fontSize: '0.85rem' }}>
                        Need help? Call or WhatsApp {BRAND.supportPhone}
                    </p>
                </aside>

                <main className="ka-auth-main">
                    <div className="ka-auth-card">
                        <div style={{ display: 'grid', gap: 8 }}>
                            <h1>{title}</h1>
                            <p className="ka-sub">{subtitle}</p>
                        </div>

                        <div className="ka-tabs" role="tablist">
                            <button role="tab" aria-selected={mode === 'phone'} className={mode === 'phone' ? 'on' : ''} onClick={() => switchMode('phone')}>
                                Mobile OTP
                            </button>
                            <button role="tab" aria-selected={mode === 'email'} className={mode === 'email' ? 'on' : ''} onClick={() => switchMode('email')}>
                                Email / Username
                            </button>
                        </div>

                        {import.meta.env.VITE_USE_EMULATOR === 'true' && (
                            // Local test build only (never in production bundles): it talks to the
                            // Firebase emulator, so real accounts do not exist and no SMS is sent.
                            <div className="ka-alert" style={{ background: '#fff4d6', color: '#7a5200' }}>
                                <AlertCircle size={18} style={{ flex: 'none', marginTop: 1 }} />
                                <span>
                                    <b>Local test mode.</b> This copy uses a throwaway test database, so your real
                                    login will not work here. OTPs are not sent by SMS: open the emulator at
                                    localhost:4000 → Auth to read them.
                                </span>
                            </div>
                        )}

                        {error && (
                            <div className="ka-alert" role="alert"><AlertCircle size={18} style={{ flex: 'none', marginTop: 1 }} /> {error}</div>
                        )}

                        {mode === 'phone' && phoneStep === 'number' && (
                            <form onSubmit={e => { e.preventDefault(); sendOtp(); }} style={{ display: 'grid', gap: 16 }}>
                                <div className="ka-field">
                                    <label htmlFor="ka-phone">Mobile number</label>
                                    <div className="ka-input-group">
                                        <span>+91</span>
                                        <input
                                            id="ka-phone"
                                            type="tel"
                                            inputMode="numeric"
                                            autoComplete="tel-national"
                                            placeholder="98765 43210"
                                            maxLength={14}
                                            value={phone}
                                            onChange={e => setPhone(e.target.value.replace(/[^\d ]/g, ''))}
                                            autoFocus
                                        />
                                    </div>
                                    <span className="ka-hint">We will send a 6-digit OTP by SMS. New numbers get a new account.</span>
                                </div>
                                <button type="submit" className="ka-btn ka-btn-primary ka-btn-block" disabled={loading}>
                                    {loading ? <><Loader2 size={18} className="ka-spin" /> Sending OTP…</> : 'Send OTP'}
                                </button>
                            </form>
                        )}

                        {mode === 'phone' && phoneStep === 'code' && (
                            <form onSubmit={verifyOtp} style={{ display: 'grid', gap: 16 }}>
                                <div className="ka-alert ok"><ShieldCheck size={18} style={{ flex: 'none' }} /> OTP sent to +91 {phone.slice(0, 5)} {phone.slice(5)}</div>
                                <div className="ka-field">
                                    <label htmlFor="ka-otp">Enter OTP</label>
                                    <input
                                        id="ka-otp"
                                        className="ka-input ka-otp"
                                        type="text"
                                        inputMode="numeric"
                                        autoComplete="one-time-code"
                                        maxLength={6}
                                        placeholder="••••••"
                                        value={code}
                                        onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                        autoFocus
                                    />
                                </div>
                                <button type="submit" className="ka-btn ka-btn-primary ka-btn-block" disabled={loading || code.length !== 6}>
                                    {loading ? <><Loader2 size={18} className="ka-spin" /> Verifying…</> : 'Verify & continue'}
                                </button>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                    <button type="button" className="ka-linkbtn" onClick={() => { setPhoneStep('number'); setError(''); }}>
                                        <ArrowLeft size={14} style={{ verticalAlign: '-2px' }} /> Change number
                                    </button>
                                    {resendIn > 0
                                        ? <span style={{ color: 'var(--ka-muted)' }}>Resend in {resendIn}s</span>
                                        : <button type="button" className="ka-linkbtn" onClick={sendOtp} disabled={loading}>Resend OTP</button>}
                                </div>
                            </form>
                        )}

                        {mode === 'email' && (
                            <form onSubmit={handleEmail} style={{ display: 'grid', gap: 16 }}>
                                {!isLogin && (
                                    <div className="ka-field">
                                        <label htmlFor="ka-name">Full name</label>
                                        <input id="ka-name" className="ka-input" required value={fullName} onChange={e => setFullName(e.target.value)} placeholder="e.g. Ramesh Patil" />
                                    </div>
                                )}
                                <div className="ka-field">
                                    <label htmlFor="ka-email">{isLogin ? 'Email or username' : 'Email'}</label>
                                    <input id="ka-email" className="ka-input" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" placeholder={isLogin ? 'you@example.com or username' : 'you@example.com'} />
                                </div>
                                <div className="ka-field">
                                    <label htmlFor="ka-password">Password</label>
                                    <input id="ka-password" className="ka-input" type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} autoComplete={isLogin ? 'current-password' : 'new-password'} />
                                </div>
                                <button type="submit" className="ka-btn ka-btn-primary ka-btn-block" disabled={loading}>
                                    {loading ? <><Loader2 size={18} className="ka-spin" /> Please wait…</> : isLogin ? 'Sign in' : 'Create account'}
                                </button>
                                <p style={{ textAlign: 'center', fontSize: '0.92rem', color: 'var(--ka-body)' }}>
                                    {isLogin ? 'New here? ' : 'Already have an account? '}
                                    <button type="button" className="ka-linkbtn" onClick={() => { setIsLogin(!isLogin); setError(''); }}>
                                        {isLogin ? 'Create an account' : 'Sign in'}
                                    </button>
                                </p>
                            </form>
                        )}

                        <div className="ka-divider">or</div>
                        <button type="button" className="ka-btn ka-google ka-btn-block" onClick={handleGoogle} disabled={loading}>
                            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                            </svg>
                            Continue with Google
                        </button>

                        <p className="ka-legal">
                            By continuing you agree to our <a href="/terms" target="_blank" rel="noopener noreferrer">Terms</a>,{' '}
                            <a href="/refund-policy" target="_blank" rel="noopener noreferrer">Refund Policy</a> and{' '}
                            <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
                        </p>
                        <div id="ka-recaptcha" />
                    </div>
                </main>
            </div>
        </div>
    );
}
