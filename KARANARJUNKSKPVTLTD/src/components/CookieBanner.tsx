import { useState, useEffect } from 'react';
import { Link2 } from 'lucide-react';

const COOKIE_KEY = 'ka_cookie_consent';

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Show only if user hasn't consented yet
    if (!localStorage.getItem(COOKIE_KEY)) {
      // Small delay so it doesn't flash on first paint
      const t = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(t);
    }
  }, []);

  const accept = () => {
    localStorage.setItem(COOKIE_KEY, 'accepted');
    setVisible(false);
  };

  const decline = () => {
    localStorage.setItem(COOKIE_KEY, 'declined');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      style={{
        position: 'fixed',
        bottom: '1.5rem',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'min(560px, calc(100vw - 2rem))',
        background: 'var(--surface-raised)',
        border: '1px solid var(--surface-border)',
        borderRadius: '16px',
        padding: '1.25rem 1.5rem',
        boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        flexWrap: 'wrap',
        zIndex: 9999,
        animation: 'slideUp 0.3s ease',
      }}
    >
      <div style={{ flex: 1, minWidth: '200px' }}>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          🍪 We use cookies to keep you signed in. Our public pages may also load Google measurement and ads.{' '}
          <a href="/privacy" target="_blank" style={{ color: 'var(--primary-light)', textDecoration: 'none', fontWeight: 600 }}>
            Privacy Policy <Link2 size={10} style={{ display: 'inline' }} />
          </a>
        </p>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
        <button
          onClick={decline}
          style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px solid var(--surface-border)', borderRadius: '8px', cursor: 'pointer', font: 'inherit', fontSize: '0.82rem', color: 'var(--text-secondary)' }}
        >
          Decline
        </button>
        <button
          onClick={accept}
          style={{ padding: '0.5rem 1.25rem', background: 'var(--primary-light)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', font: 'inherit', fontSize: '0.82rem', fontWeight: 700 }}
        >
          Accept
        </button>
      </div>
      <style>{`@keyframes slideUp { from { opacity:0; transform:translateX(-50%) translateY(20px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }`}</style>
    </div>
  );
}
