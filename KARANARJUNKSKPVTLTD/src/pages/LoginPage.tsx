import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, Mail, AlertCircle, CheckCircle2, User, Phone } from 'lucide-react';
import { updateProfile } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

export default function LoginPage() {
    const { t } = useTranslation();
    const [searchParams] = useSearchParams();
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [fullName, setFullName] = useState('');
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const navigate = useNavigate();

    // Post-login redirect target (e.g. /login?redirect=/pricing), used so a visitor
    // who chose a plan while logged out returns to continue it. Restricted to internal
    // absolute paths ("/x", not "//host") to prevent open-redirect abuse; falls back
    // to /dashboard. AuthContext still applies its own onboarding/subscription gates.
    const rawRedirect = searchParams.get('redirect');
    const redirectTo =
        rawRedirect && rawRedirect.startsWith('/') && !rawRedirect.startsWith('//')
            ? rawRedirect
            : '/dashboard';

    // Pre-select signup mode if ?signup=true in URL
    useEffect(() => {
        if (searchParams.get('signup') === 'true') {
            setIsLogin(false);
        }
    }, [searchParams]);

    const handleGoogleSignIn = async () => {
        setError('');
        setLoading(true);
        try {
            await signInWithPopup(auth, googleProvider);
            // AuthContext will handle redirect — if no tenantId → /client-onboarding
            navigate(redirectTo);
        } catch (err: any) {
            console.error(err);
            setError(t('auth.error_google'));
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        let finalEmail = email.trim();
        // Standardize username to email format
        if (!finalEmail.includes('@')) {
            const lowEmail = finalEmail.toLowerCase();
            // Handle existing admin shortcuts
            if (lowEmail === 'arjutanpure' || lowEmail === 'arjuntanpure' || lowEmail === 'arjun1829' || lowEmail === 'karanarjun') {
                finalEmail = 'arjutanpure@karanarjun.com';
            } else {
                finalEmail = `${lowEmail}@karanarjun.com`;
            }
        }

        try {
            if (isLogin) {
                try {
                    await signInWithEmailAndPassword(auth, finalEmail, password);
                } catch (err: any) {
                    const defaultAdminEmail = 'arjutanpure@karanarjun.com';
                    if (
                        finalEmail === defaultAdminEmail &&
                        password === '1829203' &&
                        (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential')
                    ) {
                        await createUserWithEmailAndPassword(auth, finalEmail, password);
                    } else {
                        throw err;
                    }
                }
                navigate(redirectTo);
            } else {
                // Sign up -> Name is required
                if (!fullName.trim()) {
                    throw new Error('Full Name is required for signup');
                }

                // Sign up -> go to onboarding
                const userCredential = await createUserWithEmailAndPassword(auth, finalEmail, password);
                const user = userCredential.user;

                // Update Profile
                await updateProfile(user, { displayName: fullName });

                // Create User records in Firestore for recovery & meta
                await setDoc(doc(db, 'users', user.uid), {
                    uid: user.uid,
                    email: finalEmail,
                    name: fullName,
                    phone: phone || null,
                    username: !email.includes('@') ? email : null,
                    role: 'admin',
                    createdAt: new Date().toISOString()
                });

                navigate('/client-onboarding');
            }
        } catch (err: any) {
            console.error(err);
            if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
                setError(t('auth.error_invalid'));
            } else if (err.code === 'auth/email-already-in-use') {
                setError(t('auth.error_exists'));
            } else if (err.code === 'auth/weak-password') {
                setError(t('auth.error_weak'));
            } else {
                setError(t('auth.error_generic'));
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '440px', padding: '2.5rem 2rem' }}>

                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <h1 className="primary-gradient-text" style={{ fontSize: '1.75rem', marginBottom: '0.4rem' }}>
                        {isLogin ? 'Welcome back' : 'Create your free account'}
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                        {isLogin
                            ? 'Sign in to your Fiinny Business console'
                            : 'Join retailers across India — GST invoices, payments & more'}
                    </p>
                </div>

                {/* Prominent Tab Switcher */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    background: 'var(--surface-base)',
                    borderRadius: '12px',
                    padding: '4px',
                    marginBottom: '1.75rem',
                    border: '1px solid var(--surface-border)',
                }}>
                    {[
                        { label: 'Sign In', value: true },
                        { label: 'Sign Up — Free', value: false },
                    ].map((tab) => (
                        <button
                            key={String(tab.value)}
                            onClick={() => { setIsLogin(tab.value); setError(''); }}
                            style={{
                                padding: '0.6rem 0.5rem',
                                borderRadius: '9px',
                                border: 'none',
                                cursor: 'pointer',
                                fontWeight: 700,
                                fontSize: '0.88rem',
                                font: 'inherit',
                                background: isLogin === tab.value ? 'var(--primary)' : 'transparent',
                                color: isLogin === tab.value ? 'white' : 'var(--text-tertiary)',
                                transition: 'all 0.2s',
                            }}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Signup value prop */}
                {!isLogin && (
                    <div style={{
                        background: 'hsla(152, 60%, 40%, 0.08)',
                        border: '1px solid hsla(152, 60%, 40%, 0.2)',
                        borderRadius: '10px',
                        padding: '0.875rem 1rem',
                        marginBottom: '1.5rem',
                    }}>
                        {[
                            'GST-compliant invoices in seconds',
                            'Online payments via Razorpay / UPI',
                            'Inventory, analytics & AI advisor',
                        ].map((item) => (
                            <div key={item} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', fontSize: '0.82rem', color: 'var(--primary-light)', fontWeight: 600 }}>
                                <CheckCircle2 size={13} /> {item}
                            </div>
                        ))}
                    </div>
                )}

                {error && (
                    <div style={{ padding: '0.75rem', background: 'hsla(0, 84%, 60%, 0.1)', color: 'var(--danger)', borderRadius: '8px', marginBottom: '1.25rem', display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.875rem' }}>
                        <AlertCircle size={16} /> {error}
                    </div>
                )}

                {/* Google button */}
                <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    className="btn btn-secondary"
                    style={{ width: '100%', marginBottom: '1.25rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', background: 'white', color: '#333' }}
                    disabled={loading}
                >
                    <svg width="18" height="18" viewBox="0 0 48 48">
                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                        <path fill="none" d="M0 0h48v48H0z" />
                    </svg>
                    {isLogin ? t('auth.google_signin') : 'Continue with Google — Free'}
                </button>

                <div style={{ display: 'flex', alignItems: 'center', margin: '1.25rem 0' }}>
                    <div style={{ flex: 1, height: '1px', background: 'var(--surface-border)' }} />
                    <span style={{ padding: '0 1rem', color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>{t('auth.or')}</span>
                    <div style={{ flex: 1, height: '1px', background: 'var(--surface-border)' }} />
                </div>

                <form onSubmit={handleSubmit}>
                    {!isLogin && (
                        <>
                            <div className="input-group">
                                <label htmlFor="fullName">Full Name</label>
                                <div style={{ position: 'relative' }}>
                                    <User size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                                    <input
                                        required
                                        type="text"
                                        id="fullName"
                                        className="input-field"
                                        style={{ paddingLeft: '2.75rem' }}
                                        placeholder="e.g. Arjun Tanpure"
                                        value={fullName}
                                        onChange={(e) => setFullName(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="input-group">
                                <label htmlFor="phone">Phone Number (For account recovery)</label>
                                <div style={{ position: 'relative' }}>
                                    <Phone size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                                    <input
                                        required
                                        type="tel"
                                        id="phone"
                                        className="input-field"
                                        style={{ paddingLeft: '2.75rem' }}
                                        placeholder="e.g. 9876543210"
                                        pattern="[0-9]{10}"
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value)}
                                    />
                                </div>
                            </div>
                        </>
                    )}

                    <div className="input-group">
                        <label htmlFor="email">{t('auth.email_user_label')}</label>
                        <div style={{ position: 'relative' }}>
                            <Mail size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                            <input
                                required
                                type="text"
                                id="email"
                                className="input-field"
                                style={{ paddingLeft: '2.75rem' }}
                                placeholder={t('auth.email_user_placeholder')}
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="input-group" style={{ marginBottom: '1.75rem' }}>
                        <label htmlFor="password">{t('auth.password')}</label>
                        <div style={{ position: 'relative' }}>
                            <Lock size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                            <input
                                required
                                type="password"
                                id="password"
                                className="input-field"
                                style={{ paddingLeft: '2.75rem' }}
                                placeholder={t('auth.password_placeholder')}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary animate-pulse"
                        style={{ width: '100%', marginBottom: '1rem' }}
                        disabled={loading}
                    >
                        {loading ? t('auth.authenticating') : (isLogin ? t('auth.signin_button') : 'Create Free Account →')}
                    </button>
                </form>

                {/* Legal */}
                <div style={{ textAlign: 'center', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--surface-border)', fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                    By signing in, you agree to our{' '}
                    <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary-light)', textDecoration: 'none', fontWeight: 600 }}>Terms of Service</a>
                    {' '}and{' '}
                    <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary-light)', textDecoration: 'none', fontWeight: 600 }}>Privacy Policy</a>
                </div>
            </div>
        </div>
    );
}
