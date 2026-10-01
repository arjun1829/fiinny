import { useState, useMemo, useEffect, useRef } from 'react';
import { Save, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { getTenantCollection } from '../utils/tenantPath';
import { LOCATION_DATA, STATES } from '../utils/locationData';
import { checkContactNumber } from '../utils/phoneValidator';

const INITIAL_FORM = {
    name: '',
    number: '',
    email: '',
    country: 'India',
    state: 'Maharashtra',
    district: '',
    taluka: '',
    atPost: '',
    fullAddress: '',
    gstin: '',
    licenseNumber: '',
    portfolioSize: 'Small',
};

export default function OnboardingPage() {
    const [formData, setFormData] = useState({ ...INITIAL_FORM });

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [numberError, setNumberError] = useState<string | null>(null);
    const { t } = useTranslation();

    const navigate = useNavigate();
    const { showToast } = useToast();
    const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
    const pendingHref = useRef<string | null>(null);

    const isDirty = useMemo(() => {
        const keys = Object.keys(formData) as (keyof typeof INITIAL_FORM)[];
        return keys.some(k => formData[k] !== INITIAL_FORM[k]);
    }, [formData]);

    // Keep a ref so the capture listener always sees the latest dirty state without
    // needing to re-subscribe on every form change.
    const isDirtyRef = useRef(false);
    isDirtyRef.current = isDirty;

    // Intercept sidebar / nav link clicks while the form has unsaved data.
    // Runs once; uses isDirtyRef to avoid stale closures.
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (!isDirtyRef.current) return;
            const anchor = (e.target as Element).closest('a[href]');
            if (!anchor) return;
            const href = anchor.getAttribute('href');
            if (!href || /^(https?:|mailto:|#)/.test(href)) return;
            e.preventDefault();
            e.stopPropagation();
            pendingHref.current = href;
            setShowDiscardConfirm(true);
        };
        document.addEventListener('click', handleClick, true);
        return () => document.removeEventListener('click', handleClick, true);
    }, []);

    // Block browser-level refresh / tab close
    useEffect(() => {
        const handler = (e: BeforeUnloadEvent) => { if (isDirty) e.preventDefault(); };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [isDirty]);

    const handleDiscard = () => {
        setShowDiscardConfirm(false);
        if (pendingHref.current) {
            navigate(pendingHref.current);
            pendingHref.current = null;
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (name === 'number' && numberError) setNumberError(null);
    };

    const { tenantId } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!tenantId) return;

        const numberCheck = checkContactNumber(formData.number);
        if (!numberCheck.valid) {
            setNumberError(numberCheck.error || 'Enter a valid contact number');
            return;
        }
        setNumberError(null);

        setIsSubmitting(true);
        setSubmitStatus('idle');

        try {
            await addDoc(getTenantCollection(db, tenantId, 'retailers'), {
                ...formData,
                location: `${formData.atPost}, ${formData.taluka}, ${formData.district}`, // For backward compatibility
                createdAt: serverTimestamp(),
                totalSales: 0,
                totalPaid: 0,
                outstandingAmount: 0
            });
            setSubmitStatus('success');
            // Reset the form BEFORE navigating so the unsaved-changes guard stays quiet.
            setFormData({ ...INITIAL_FORM });
            // Surface the confirmation via the shared top-right toast, then land the
            // user back on the Worklist where the new partner now appears.
            showToast(t('onboarding.register_success'), 'success');
            navigate('/worklist');
        } catch (err) {
            console.error("Error adding document: ", err);
            setSubmitStatus('error');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <>
        <div className="animate-fade-in" style={{ maxWidth: '600px', margin: '0 auto' }}>
            <div style={{ marginBottom: '2rem' }}>
                <h1 className="primary-gradient-text" style={{ fontSize: '2rem' }}>{t('onboarding.onboarding_title')}</h1>
                <p style={{ color: 'var(--text-secondary)' }}>{t('onboarding.onboarding_desc')}</p>
            </div>

            <div className="glass-panel" style={{ padding: '2rem' }}>
                <form onSubmit={handleSubmit}>

                    <div className="input-group animate-slide-in delay-100" style={{ animationFillMode: 'forwards' }}>
                        <label htmlFor="name">{t('onboarding.business_name_label')}</label>
                        <input
                            required
                            type="text"
                            id="name"
                            name="name"
                            className="input-field"
                            placeholder={t('onboarding.placeholder_business_name')}
                            value={formData.name}
                            onChange={handleChange}
                        />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div className="input-group animate-slide-in delay-200" style={{ animationFillMode: 'forwards' }}>
                            <label htmlFor="number">{t('onboarding.contact_number')}</label>
                            <input
                                required
                                type="tel"
                                id="number"
                                name="number"
                                className="input-field"
                                placeholder="+91..."
                                value={formData.number}
                                onChange={handleChange}
                                aria-invalid={!!numberError}
                            />
                            {numberError && (
                                <span style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: '0.25rem', display: 'block' }}>
                                    {numberError}
                                </span>
                            )}
                        </div>

                        <div className="input-group animate-slide-in delay-200" style={{ animationFillMode: 'forwards' }}>
                            <label htmlFor="email">{t('auth.email')} ({t('common.optional')})</label>
                            <input
                                type="email"
                                id="email"
                                name="email"
                                className="input-field"
                                placeholder="email@example.com"
                                value={formData.email}
                                onChange={handleChange}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div className="input-group">
                            <label htmlFor="country">{t('onboarding.country')}</label>
                            <input readOnly type="text" id="country" name="country" className="input-field" value={formData.country} style={{ opacity: 0.6, cursor: 'not-allowed' }} />
                        </div>
                        <div className="input-group">
                            <label htmlFor="state">{t('onboarding.state')}</label>
                            <select
                                id="state"
                                name="state"
                                className="input-field"
                                value={formData.state}
                                onChange={e => setFormData(prev => ({ ...prev, state: e.target.value, district: '' }))}
                                style={{ cursor: 'pointer', appearance: 'auto' }}
                            >
                                <option value="">{t('onboarding.select_state')}</option>
                                {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div className="input-group">
                            <label htmlFor="district">{t('onboarding.district')}</label>
                            <select
                                required
                                id="district"
                                name="district"
                                className="input-field"
                                value={formData.district}
                                onChange={handleChange}
                                style={{ cursor: 'pointer', appearance: 'auto' }}
                            >
                                <option value="">{t('onboarding.select_district')}</option>
                                {(LOCATION_DATA[formData.state] ?? []).map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                        </div>
                        <div className="input-group">
                            <label htmlFor="taluka">{t('onboarding.taluka')}</label>
                            <input type="text" id="taluka" name="taluka" className="input-field" placeholder={t('onboarding.placeholder_taluka')} value={formData.taluka} onChange={handleChange} />
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div className="input-group">
                            <label htmlFor="atPost">{t('onboarding.village')}</label>
                            <input type="text" id="atPost" name="atPost" className="input-field" placeholder={t('onboarding.placeholder_village')} value={formData.atPost} onChange={handleChange} />
                        </div>
                    </div>

                    <div className="input-group">
                        <label htmlFor="fullAddress">{t('onboarding.full_address')}</label>
                        <textarea
                            id="fullAddress"
                            name="fullAddress"
                            className="input-field"
                            placeholder={t('onboarding.placeholder_full_address')}
                            value={formData.fullAddress}
                            onChange={e => setFormData(prev => ({ ...prev, fullAddress: e.target.value }))}
                            rows={2}
                            style={{ resize: 'vertical' }}
                        />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div className="input-group">
                            <label htmlFor="gstin">{t('onboarding.gstin_optional')}</label>
                            <input type="text" id="gstin" name="gstin" className="input-field" placeholder={t('onboarding.placeholder_gstin')} value={formData.gstin} onChange={handleChange} />
                        </div>
                        <div className="input-group">
                            <label htmlFor="licenseNumber">{t('onboarding.license_number_optional')}</label>
                            <input type="text" id="licenseNumber" name="licenseNumber" className="input-field" placeholder={t('onboarding.placeholder_license')} value={formData.licenseNumber} onChange={handleChange} />
                        </div>
                    </div>

                    <div className="input-group animate-slide-in delay-400" style={{ marginBottom: '2rem', animationFillMode: 'forwards' }}>
                        <label htmlFor="portfolioSize">{t('onboarding.portfolio_size')}</label>
                        <select
                            id="portfolioSize"
                            name="portfolioSize"
                            className="input-field"
                            value={formData.portfolioSize}
                            onChange={handleChange}
                            style={{ cursor: 'pointer', appearance: 'auto' }}
                        >
                            <option value="Small">{t('onboarding.small_retailer')}</option>
                            <option value="Medium">{t('onboarding.medium_retailer')}</option>
                            <option value="Big">{t('onboarding.big_distributor')}</option>
                        </select>
                    </div>

                    {submitStatus === 'error' && (
                        <div style={{ padding: '1rem', background: 'hsla(0, 84%, 60%, 0.1)', color: 'var(--danger)', borderRadius: '8px', marginBottom: '1.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <AlertCircle size={18} /> {t('onboarding.register_error')}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="btn btn-primary animate-pulse"
                        style={{ width: '100%', marginTop: '1rem' }}
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? t('onboarding.saving') : <><Save size={20} /> {t('onboarding.register_retailer')}</>}
                    </button>

                </form>
            </div>
        </div>

        {showDiscardConfirm && (
            <div
                style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', background: 'hsla(220, 30%, 4%, 0.72)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
                role="alertdialog"
                aria-modal="true"
                aria-label="Discard changes confirmation"
            >
                <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '14px', maxWidth: '380px', width: '100%' }}>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.5rem' }}>Discard changes?</h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                        You have unsaved changes. Are you sure you want to discard them?
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                        <button className="btn btn-secondary" onClick={() => setShowDiscardConfirm(false)}>Keep Editing</button>
                        <button
                            className="btn btn-primary"
                            onClick={handleDiscard}
                            style={{ background: 'hsla(0,72%,51%,0.85)', borderColor: 'hsla(0,72%,51%,0.5)' }}
                        >
                            Discard
                        </button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
}
