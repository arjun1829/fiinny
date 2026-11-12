import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { KeyRound, X } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

// One-time "Do you want to reset your password?" prompt for a Business Admin whose
// account was provisioned by the Super Admin (createBusinessUser sets
// `createdBySuperAdmin` on users/{uid}). Because such accounts are tenantless until
// they finish /client-onboarding, gating on a resolved tenantId naturally defers
// this prompt until AFTER onboarding — the point at which the user is a full admin
// of their own tenant and the Admin → reset-password flow authorizes a self-reset.
//
// "Yes" routes to /admin (Manage Users, where the reset-password point lives);
// "No" simply dismisses. Either choice stamps `passwordPromptDone: true` on the
// user doc so it never nags again. `passwordPromptDone` is not a privileged field,
// so firestore.rules permits this self-update.
export default function PasswordResetPrompt() {
    const { currentUser, tenantId, userRole, isSuperAdmin, isImpersonating } = useAuth();
    const navigate = useNavigate();
    const [show, setShow] = useState(false);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let cancelled = false;
        // Only a real (non-impersonated) tenant admin can see this.
        if (!currentUser || !tenantId || isSuperAdmin || isImpersonating || userRole !== 'admin') {
            setShow(false);
            return;
        }
        (async () => {
            try {
                const snap = await getDoc(doc(db, 'users', currentUser.uid));
                if (cancelled || !snap.exists()) return;
                const data = snap.data();
                if (data.createdBySuperAdmin && !data.passwordPromptDone) setShow(true);
            } catch {
                // Non-blocking convenience prompt — stay silent on read failure.
            }
        })();
        return () => { cancelled = true; };
    }, [currentUser, tenantId, userRole, isSuperAdmin, isImpersonating]);

    const stamp = async () => {
        if (!currentUser) return;
        try {
            await updateDoc(doc(db, 'users', currentUser.uid), { passwordPromptDone: true });
        } catch {
            // If the stamp fails the prompt may reappear next login — acceptable.
        }
    };

    const onYes = async () => {
        setBusy(true);
        await stamp();
        setShow(false);
        navigate('/admin');
    };

    const onNo = async () => {
        setBusy(true);
        await stamp();
        setShow(false);
        setBusy(false);
    };

    if (!show) return null;

    return (
        <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '1rem' }}
        >
            <div className="glass-panel" style={{ width: '100%', maxWidth: '420px', padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <KeyRound size={22} style={{ color: 'var(--primary-light)' }} />
                        <h2 style={{ fontSize: '1.15rem', margin: 0 }}>Reset your password?</h2>
                    </div>
                    <button onClick={onNo} aria-label="Dismiss" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: '0.2rem' }}>
                        <X size={20} />
                    </button>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', margin: '0 0 1.5rem' }}>
                    Your account was set up with a password chosen by the administrator. Would you like to set your own password now?
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
                    <button onClick={onNo} disabled={busy} className="btn btn-secondary" style={{ fontSize: '0.85rem' }}>No, keep it</button>
                    <button onClick={onYes} disabled={busy} className="btn btn-primary" style={{ fontSize: '0.85rem' }}>Yes, reset</button>
                </div>
            </div>
        </div>
    );
}
