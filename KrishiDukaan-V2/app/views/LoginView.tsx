import { useState } from 'react';
import { ICONS } from '../constants';
import { motion } from 'framer-motion';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, getUserProfile } from '../firebase';
import { useI18n } from '../i18n/I18nContext';

interface LoginViewProps {
  onBack: () => void;
  onNavigateToSignup: () => void;
  onSuccess: (user: any, profile: any) => void;
}

export default function LoginView({ onBack, onNavigateToSignup, onSuccess }: LoginViewProps) {
  const { t } = useI18n();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizePhone = (value: string) => value.replace(/\D/g, "");
  const customerAuthEmailFromPhone = (value: string) => `customer.${normalizePhone(value)}@krishidukan.local`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    try {
      const trimmed = identifier.trim().toLowerCase();
      const authEmail = trimmed.includes('@') ? trimmed : customerAuthEmailFromPhone(trimmed);
      const userCredential = await signInWithEmailAndPassword(auth, authEmail, password);
      const user = userCredential.user;
      
      const profile = await getUserProfile(user.uid);
      if (profile) {
        onSuccess(user, profile);
      } else {
        // Fallback if profile doesn't exist for some reason
        onSuccess(user, { name: user.displayName || 'User', email: user.email, role: 'customer' });
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.message || 'Failed to sign in. Please check your credentials.');
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
        <div className="flex flex-col items-center mb-8">
          <img 
            src="/images/krishidukan icon.webp" 
            alt="KrishiDukan" 
            className="w-20 h-20 object-contain mb-2"
          />
          <span className="font-black text-2xl text-primary">
            Krishi<span className="text-secondary">Dukan</span>
          </span>
        </div>

        <button onClick={onBack} className="mb-6 flex items-center gap-2 text-primary font-bold hover:translate-x-1 transition-transform text-sm">
          <ICONS.ChevronRight className="w-4 h-4 rotate-180" /> {t('backToStore')}
        </button>

        <h1 className="text-3xl font-bold text-on-surface mb-2">{t('welcomeBack')}</h1>
        <p className="text-on-surface-variant mb-8 font-medium">{t('loginSubtitle')}</p>

        {error && (
          <div className="bg-red-50 text-red-700 p-4 rounded-2xl border border-red-100 mb-6 text-sm font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-black uppercase tracking-widest text-on-surface-variant ml-1">
              Mobile / Email
            </label>
            <input 
              type="text"
              required
              disabled={loading}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="Mobile number or email"
              className="w-full bg-surface-container-low border border-outline-variant rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:opacity-50"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-black uppercase tracking-widest text-on-surface-variant ml-1">{t('password')}</label>
            <input 
              type="password" 
              required
              disabled={loading}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-surface-container-low border border-outline-variant rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:opacity-50"
            />
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-white font-black uppercase tracking-widest py-4 rounded-2xl shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all mt-4 disabled:opacity-70 disabled:scale-100"
          >
            {loading ? t('signingIn') : t('signIn')}
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-sm text-on-surface-variant font-medium">
            {t('noAccount')} 
            <button onClick={onNavigateToSignup} className="text-primary font-bold ml-1 hover:underline">{t('createAccount')}</button>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
