import { useEffect, useMemo, useState } from 'react';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { signOut, updateProfile } from 'firebase/auth';
import { Link } from 'react-router-dom';
import { AlertCircle, Building2, Loader2, LogOut, Store, Warehouse } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { auth, db } from '../firebase';
import { BRAND } from '../utils/brand';
import { formatINR, readPendingPlan } from '../utils/pendingPlan';
import { usePricingPlansOnce } from '../hooks/usePricingPlans';
import { STATES } from '../utils/locationData';
import '../styles/ka-marketing.css';

// KaranArjun ERP is sold only to agri-input retailers, so the one question is
// how the shop is set up. Stored on the tenant as `purpose` (as before) plus
// `businessCategory: 'agri_input_retail'`.
const BUSINESS_TYPES = [
    { value: 'agri_retailer', label: 'One shop counter', hint: 'Seeds, fertilizer, pesticides', icon: Store },
    { value: 'agri_retailer_godown', label: 'Shop + godown', hint: 'Separate godown stock, staff', icon: Warehouse },
    { value: 'agri_retailer_multi', label: 'Several shops', hint: 'Branches in more than one place', icon: Building2 },
] as const;

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export default function ClientOnboardingPage() {
    const { currentUser } = useAuth();
    const plans = usePricingPlansOnce();
    const pending = useMemo(() => readPendingPlan(), []);
    const pendingPlan = pending ? plans.find(p => p.id === pending.plan) : undefined;

    const [form, setForm] = useState({
        ownerName: currentUser?.displayName || '',
        businessName: '',
        city: '',
        state: 'Maharashtra',
        purpose: 'agri_retailer',
        phone: (currentUser?.phoneNumber || '').replace(/^\+91/, ''),
        gstin: '',
        referredBy: '',
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    // Prefill from the user record (email sign-ups typed a phone there).
    useEffect(() => {
        if (!currentUser) return;
        getDoc(doc(db, 'users', currentUser.uid)).then(snap => {
            const d = snap.data();
            if (!d) return;
            setForm(f => ({
                ...f,
                ownerName: f.ownerName || (d.name && d.name !== 'Member' ? d.name : ''),
                phone: f.phone || String(d.phone || '').replace(/^\+91/, ''),
            }));
        }).catch(() => { /* prefill is best-effort */ });
    }, [currentUser]);

    const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        setForm(f => ({ ...f, [k]: e.target.value }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentUser) return;
        setError('');

        const gstin = form.gstin.trim().toUpperCase();
        const phone = form.phone.replace(/\D/g, '');
        if (!form.ownerName.trim() || !form.businessName.trim() || !form.city.trim()) {
            setError('Please fill in your name, business name and city.');
            return;
        }
        if (!/^[6-9]\d{9}$/.test(phone)) {
            setError('Enter a valid 10-digit mobile number for the business.');
            return;
        }
        if (gstin && !GSTIN_RE.test(gstin)) {
            setError('That GSTIN does not look right. Leave it empty if you do not have one yet.');
            return;
        }

        setSaving(true);
        try {
            const tenantId = `tenant_${currentUser.uid}`;
            const location = `${form.city.trim()}, ${form.state}`;

            const userRef = doc(db, 'users', currentUser.uid);
            const tenantRef = doc(db, 'tenants', tenantId);
            const business = {
                businessName: form.businessName.trim(),
                ownerName: form.ownerName.trim(),
                location,
                city: form.city.trim(),
                state: form.state,
                purpose: form.purpose,
                businessCategory: 'agri_input_retail',
                phone: `+91${phone}`,
                gstin: gstin || null,
                referredBy: form.referredBy.trim() || null,
                updatedAt: serverTimestamp(),
            };

            // 0. The user record is normally created by AuthContext on first sign-in.
            //    If that write was lost (flaky network), create it tenantless here,
            //    because the claim in step 2 is an update and needs the doc to exist.
            const userSnap = await getDoc(userRef);
            if (!userSnap.exists()) {
                await setDoc(userRef, {
                    email: currentUser.email || null,
                    phone: currentUser.phoneNumber || `+91${phone}`,
                    name: form.ownerName.trim(),
                    role: 'admin',
                    tenantId: null,
                    linkedId: null,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                });
            }

            // 1. The business (tenant). Field names match what the rest of the ERP
            //    already reads (businessName, location, purpose, phone, hardware).
            //    Rules allow creating only tenants/tenant_<own uid> and only once, so
            //    a denied create means an earlier attempt already made it: carry on
            //    and refresh its details after the claim below.
            let tenantExisted = false;
            try {
                await setDoc(tenantRef, {
                    ...business,
                    hardware: { hasPrinter: true, hasScanner: false, useGST: true },
                    ownerId: currentUser.uid,
                    setupCompleted: true,
                    createdAt: serverTimestamp(),
                });
            } catch (err: any) {
                if (err?.code !== 'permission-denied') throw err;
                tenantExisted = true;
            }

            // 2. Make this user the admin of that business (allowed by the rules
            //    only for tenants/tenant_<own uid> whose ownerId is this user).
            await updateDoc(userRef, {
                tenantId,
                role: 'admin',
                linkedId: null,
                name: form.ownerName.trim(),
                phone: `+91${phone}`,
                updatedAt: serverTimestamp(),
            });
            if (tenantExisted) {
                await updateDoc(tenantRef, { ...business, setupCompleted: true });
            }
            if (!currentUser.displayName) {
                await updateProfile(currentUser, { displayName: form.ownerName.trim() }).catch(() => undefined);
            }

            // 3. Full reload so AuthContext picks up the tenant, then the checkout
            //    resumes the plan chosen on the landing page.
            window.location.href = '/pricing';
        } catch (err) {
            console.error('Business setup failed:', err);
            setError('We could not save your business. Check your internet connection and try again.');
            setSaving(false);
        }
    };

    return (
        <div className="ka">
            <div className="ka-auth">
                <aside className="ka-auth-side">
                    <Link to="/" className="ka-brand">
                        <img src="/logo.png" alt="" />
                        <span className="ka-brand-name">KaranArjun <span>ERP</span></span>
                    </Link>
                    <div style={{ display: 'grid', gap: 18 }}>
                        <div className="ka-progress" style={{ color: '#9fbfae' }}>
                            <i className="done" style={{ color: '#fff' }}><b>✓</b> Account</i>
                            <i className="now" style={{ color: '#fff' }}><b>2</b> Business</i>
                            <i style={{ color: '#9fbfae' }}><b>3</b> Payment</i>
                        </div>
                        <h2>Tell us about your business.</h2>
                        <p className="ka-auth-extra">
                            This appears on your invoices and bills. You can change any of it later in Settings.
                        </p>
                        {pendingPlan && pending && (
                            <div className="ka-auth-plan">
                                <small>Next: payment</small>
                                <b>{pendingPlan.name} · {pending.cycle === 'yearly' ? 'Yearly' : 'Monthly'}</b>
                                <span>
                                    {formatINR(pending.cycle === 'yearly' ? pendingPlan.yearlyPrice : pendingPlan.monthlyPrice)}
                                    {pending.cycle === 'yearly' ? ' per year' : ' per month'}
                                </span>
                            </div>
                        )}
                    </div>
                    <p className="ka-auth-extra" style={{ fontSize: '0.85rem' }}>
                        Stuck? Call or WhatsApp {BRAND.supportPhone}
                    </p>
                </aside>

                <main className="ka-auth-main">
                    <form className="ka-auth-card" onSubmit={handleSubmit} style={{ maxWidth: 520 }}>
                        <div style={{ display: 'grid', gap: 8 }}>
                            <h1>Business details</h1>
                            <p className="ka-sub">Takes about a minute.</p>
                        </div>

                        {error && <div className="ka-alert" role="alert"><AlertCircle size={18} style={{ flex: 'none', marginTop: 1 }} /> {error}</div>}

                        <div className="ka-field">
                            <label>How is your agri-input shop set up?</label>
                            <div className="ka-choice">
                                {BUSINESS_TYPES.map(bt => (
                                    <button
                                        type="button"
                                        key={bt.value}
                                        className={form.purpose === bt.value ? 'on' : ''}
                                        onClick={() => setForm(f => ({ ...f, purpose: bt.value }))}
                                        aria-pressed={form.purpose === bt.value}
                                    >
                                        <bt.icon size={22} />
                                        <span>{bt.label}<br /><small style={{ fontWeight: 500, color: 'var(--ka-muted)' }}>{bt.hint}</small></span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="ka-row-2">
                            <div className="ka-field">
                                <label htmlFor="ob-owner">Your name</label>
                                <input id="ob-owner" className="ka-input" value={form.ownerName} onChange={set('ownerName')} placeholder="e.g. Ramesh Patil" required />
                            </div>
                            <div className="ka-field">
                                <label htmlFor="ob-phone">Business mobile</label>
                                <div className="ka-input-group">
                                    <span>+91</span>
                                    <input id="ob-phone" type="tel" inputMode="numeric" maxLength={10} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '') }))} placeholder="98765 43210" required />
                                </div>
                            </div>
                        </div>

                        <div className="ka-field">
                            <label htmlFor="ob-biz">Shop name (as on your licence)</label>
                            <input id="ob-biz" className="ka-input" value={form.businessName} onChange={set('businessName')} placeholder="e.g. Patil Krishi Seva Kendra" required />
                        </div>

                        <div className="ka-row-2">
                            <div className="ka-field">
                                <label htmlFor="ob-city">City / taluka</label>
                                <input id="ob-city" className="ka-input" value={form.city} onChange={set('city')} placeholder="e.g. Baramati" required />
                            </div>
                            <div className="ka-field">
                                <label htmlFor="ob-state">State</label>
                                <select id="ob-state" className="ka-input" value={form.state} onChange={set('state')}>
                                    {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="ka-row-2">
                            <div className="ka-field">
                                <label htmlFor="ob-gstin">GSTIN <span style={{ fontWeight: 500, color: 'var(--ka-muted)' }}>(optional)</span></label>
                                <input id="ob-gstin" className="ka-input" value={form.gstin} onChange={e => setForm(f => ({ ...f, gstin: e.target.value.toUpperCase() }))} maxLength={15} placeholder="27ABCDE1234F1Z5" />
                            </div>
                            <div className="ka-field">
                                <label htmlFor="ob-ref">Referred by <span style={{ fontWeight: 500, color: 'var(--ka-muted)' }}>(optional)</span></label>
                                <input id="ob-ref" className="ka-input" value={form.referredBy} onChange={set('referredBy')} placeholder="Name or phone" />
                            </div>
                        </div>

                        <button type="submit" className="ka-btn ka-btn-primary ka-btn-block" disabled={saving}>
                            {saving ? <><Loader2 size={18} className="ka-spin" /> Saving…</> : pending ? 'Save & continue to payment' : 'Save & choose a plan'}
                        </button>

                        <button
                            type="button"
                            className="ka-linkbtn"
                            style={{ justifySelf: 'center', textDecoration: 'none', color: 'var(--ka-muted)', fontWeight: 600, display: 'inline-flex', gap: 6, alignItems: 'center' }}
                            onClick={() => signOut(auth).then(() => { window.location.href = '/'; })}
                        >
                            <LogOut size={14} /> Sign out
                        </button>
                    </form>
                </main>
            </div>
        </div>
    );
}
