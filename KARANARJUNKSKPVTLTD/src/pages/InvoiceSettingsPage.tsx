import { useState, useEffect, useRef } from 'react';
import { getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { FileText, Save, Loader2, ShieldAlert, Building2, MapPin, Hash, ShieldCheck, Image as ImageIcon, CreditCard, PenLine, QrCode, KeyRound, Upload, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { getTenantDoc } from '../utils/tenantPath';
import { useToast } from '../contexts/ToastContext';

export default function InvoiceSettingsPage() {
    const { t } = useTranslation();
    const { userRole, tenantId, tenantData } = useAuth();
    const { showToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [settings, setSettings] = useState({
        businessName: tenantData?.businessName || '',
        address: tenantData?.location || '',
        gstin: '',
        licenseNumbers: '',
        logoUrl: tenantData?.logoUrl || '',
        bankDetails: '',
        signatureName: '',
        signatureUrl: '',
        upiId: '',
        razorpayKeyId: '',
        terms: '1. Goods once sold will not be taken back.\n2. Payment should be made within 30 days.'
    });
    const [uploadingSig, setUploadingSig] = useState(false);
    const sigInputRef = useRef<HTMLInputElement>(null);

    const handleSignatureUpload = async (file: File) => {
        if (!tenantId || !file) return;
        setUploadingSig(true);
        try {
            const sref = storageRef(storage, `tenants/${tenantId}/branding/signature_${Date.now()}_${file.name}`);
            const snap = await uploadBytes(sref, file);
            const url = await getDownloadURL(snap.ref);
            setSettings(s => ({ ...s, signatureUrl: url }));
            showToast('Signature uploaded. Remember to Save.', 'success');
        } catch (err) {
            console.error('Signature upload failed', err);
            showToast('Could not upload the signature. Please try again.', 'error');
        } finally {
            setUploadingSig(false);
        }
    };

    useEffect(() => {
        const fetchSettings = async () => {
            if (!tenantId) return;
            try {
                const docRef = getTenantDoc(db, tenantId, 'settings', 'invoice');
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    setSettings(docSnap.data() as any);
                }
            } catch (error) {
                console.error("Error fetching invoice settings:", error);
            } finally {
                setLoading(false);
            }
        };

        if (userRole === 'admin') {
            fetchSettings();
        } else {
            setLoading(false);
        }
    }, [userRole]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!tenantId) return;
        setSaving(true);
        try {
            await setDoc(getTenantDoc(db, tenantId, 'settings', 'invoice'), {
                ...settings,
                updatedAt: serverTimestamp()
            });
            showToast('Invoice branding saved successfully!', 'success');
        } catch (error) {
            console.error("Error saving settings:", error);
            showToast('Failed to save. Please try again.', 'error');
        } finally {
            setSaving(false);
        }
    };

    if (userRole !== 'admin') {
        return (
            <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--danger)' }}>
                <ShieldAlert size={48} style={{ margin: '0 auto 1rem auto' }} />
                <h2>{t('invoice_settings.access_denied')}</h2>
                <p>{t('invoice_settings.admin_only')}</p>
            </div>
        );
    }

    if (loading) {
        return (
            <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
                <Loader2 className="animate-spin" style={{ margin: '0 auto' }} /> {t('common.loading')}
            </div>
        );
    }

    return (
        <div className="animate-fade-in" style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ marginBottom: '2rem' }}>
                <h1 className="primary-gradient-text" style={{ fontSize: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <FileText size={32} /> {t('invoice_settings.title')}
                </h1>
                <p style={{ color: 'var(--text-secondary)' }}>{t('invoice_settings.description')}</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '2rem' }}>
                <form onSubmit={handleSave} className="glass-panel" style={{ padding: '2rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div className="input-group animate-slide-in delay-100">
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Building2 size={16} /> {t('invoice_settings.business_name')}
                            </label>
                            <input
                                required
                                className="input-field"
                                value={settings.businessName}
                                onChange={e => setSettings({ ...settings, businessName: e.target.value })}
                            />
                        </div>

                        <div className="input-group">
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <MapPin size={16} /> {t('invoice_settings.address')}
                            </label>
                            <textarea
                                required
                                className="input-field"
                                style={{ minHeight: '80px', paddingTop: '0.75rem' }}
                                value={settings.address}
                                onChange={e => setSettings({ ...settings, address: e.target.value })}
                            />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div className="input-group">
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Hash size={16} /> {t('invoice_settings.gstin')}
                                </label>
                                <input
                                    className="input-field"
                                    placeholder={t('common.optional')}
                                    value={settings.gstin}
                                    onChange={e => setSettings({ ...settings, gstin: e.target.value })}
                                />
                            </div>
                            <div className="input-group">
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <ShieldCheck size={16} /> {t('invoice_settings.license_num')}
                                </label>
                                <input
                                    className="input-field"
                                    placeholder="Seeds/Fertilizer Lic."
                                    value={settings.licenseNumbers}
                                    onChange={e => setSettings({ ...settings, licenseNumbers: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="input-group">
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <ImageIcon size={16} /> {t('invoice_settings.logo_url')}
                            </label>
                            <input
                                className="input-field"
                                placeholder="https://example.com/logo.png"
                                value={settings.logoUrl}
                                onChange={e => setSettings({ ...settings, logoUrl: e.target.value })}
                            />
                        </div>

                        <div className="input-group">
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <CreditCard size={16} /> Bank Details (for invoice footer)
                            </label>
                            <textarea
                                className="input-field"
                                style={{ minHeight: '70px', paddingTop: '0.75rem' }}
                                placeholder="Bank Name: XYZ Bank&#10;A/C No: 1234567890&#10;IFSC: XYZB0001234"
                                value={settings.bankDetails}
                                onChange={e => setSettings({ ...settings, bankDetails: e.target.value })}
                            />
                        </div>

                        <div className="input-group">
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <PenLine size={16} /> Authorised Signatory Name
                            </label>
                            <input
                                className="input-field"
                                placeholder="e.g. Karan Patil"
                                value={settings.signatureName}
                                onChange={e => setSettings({ ...settings, signatureName: e.target.value })}
                            />
                        </div>

                        {/* Signature image — optional. When set it prints above the
                            signatory name on POS, B2B and supplier invoices. */}
                        <div className="input-group">
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <PenLine size={16} /> Signature Image <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(optional)</span>
                            </label>
                            <input
                                ref={sigInputRef}
                                type="file"
                                accept="image/*"
                                style={{ display: 'none' }}
                                onChange={e => { const f = e.target.files?.[0]; if (f) handleSignatureUpload(f); e.target.value = ''; }}
                            />
                            {settings.signatureUrl ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                                    <img
                                        src={settings.signatureUrl}
                                        alt="Signature"
                                        style={{ height: '54px', maxWidth: '200px', objectFit: 'contain', background: '#fff', border: '1px solid var(--surface-border)', borderRadius: '6px', padding: '4px' }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => sigInputRef.current?.click()}
                                        disabled={uploadingSig}
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.9rem', borderRadius: '8px', border: '1px solid var(--surface-border)', background: 'var(--surface-raised)', color: 'var(--text-secondary)', cursor: 'pointer', font: 'inherit', fontSize: '0.85rem' }}>
                                        {uploadingSig ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Replace
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setSettings(s => ({ ...s, signatureUrl: '' }))}
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.9rem', borderRadius: '8px', border: '1px solid var(--surface-border)', background: 'transparent', color: '#ef4444', cursor: 'pointer', font: 'inherit', fontSize: '0.85rem' }}>
                                        <X size={14} /> Remove
                                    </button>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => sigInputRef.current?.click()}
                                    disabled={uploadingSig}
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1rem', borderRadius: '8px', border: '1px dashed var(--surface-border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', font: 'inherit', fontSize: '0.875rem' }}>
                                    {uploadingSig ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                                    {uploadingSig ? 'Uploading…' : 'Upload signature image'}
                                </button>
                            )}
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.35rem' }}>
                                Leave empty to print only the signatory name.
                            </p>
                        </div>

                        {/* UPI + Razorpay section */}
                        <div style={{ borderTop: '1px solid var(--surface-border)', paddingTop: '1.25rem' }}>
                            <p style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.75rem', color: 'var(--primary-light)' }}>💳 Payment Settings</p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div className="input-group">
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <QrCode size={16} /> UPI ID (for QR codes on printed bills)
                                    </label>
                                    <input
                                        className="input-field"
                                        placeholder="e.g. 9307199040@paytm or yourname@upi"
                                        value={(settings as any).upiId || ''}
                                        onChange={e => setSettings({ ...settings, upiId: e.target.value } as any)}
                                    />
                                </div>
                                <div className="input-group">
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <KeyRound size={16} /> Razorpay Public Key (for online payment links)
                                    </label>
                                    <input
                                        className="input-field"
                                        placeholder="rzp_live_xxxxxxxxxxxxxxxx"
                                        value={(settings as any).razorpayKeyId || ''}
                                        onChange={e => setSettings({ ...settings, razorpayKeyId: e.target.value } as any)}
                                    />
                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.25rem' }}>Only your public key (starts with rzp_live_...). Never enter your secret key here.</p>
                                </div>
                            </div>
                        </div>

                        <div className="input-group">
                            <label>{t('invoice_settings.terms_label')}</label>
                            <textarea
                                className="input-field"
                                style={{ minHeight: '100px', paddingTop: '0.75rem' }}
                                value={settings.terms}
                                onChange={e => setSettings({ ...settings, terms: e.target.value })}
                            />
                        </div>

                        <button type="submit" className="btn btn-primary animate-pulse" disabled={saving} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                            {saving ? <Loader2 className="animate-spin" size={20} /> : <><Save size={20} /> {t('common.save')}</>}
                        </button>
                    </div>
                </form>

                <div className="glass-panel" style={{ padding: '2rem', height: 'fit-content', border: '1px dashed var(--surface-border)' }}>
                    <h3 style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('invoice_settings.preview_title')}</h3>

                    <div style={{ background: 'white', color: '#111', padding: '1.5rem', borderRadius: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '0.75rem' }}>
                        <div style={{ textAlign: 'center', borderBottom: '1px solid #eee', paddingBottom: '1rem', marginBottom: '1rem' }}>
                            {settings.logoUrl && <img src={settings.logoUrl} alt="Logo" style={{ maxHeight: '40px', marginBottom: '0.5rem' }} />}
                            <h2 style={{ fontSize: '1.1rem', margin: '0 0 0.25rem 0' }}>{settings.businessName}</h2>
                            <p style={{ margin: 0, color: '#666' }}>{settings.address}</p>
                            <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'center', gap: '1rem', fontWeight: 600 }}>
                                {settings.gstin && <span>{t('invoice_settings.gstin')}: {settings.gstin}</span>}
                                {settings.licenseNumbers && <span>{t('invoice_settings.license_num')}: {settings.licenseNumbers}</span>}
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                            <div>
                                <div style={{ color: '#888' }}>{t('invoice_settings.bill_to')}:</div>
                                <div style={{ fontWeight: 600 }}>{t('invoice_settings.retailer_name_placeholder')}</div>
                                <div style={{ color: '#666' }}>{t('invoice_settings.retailer_address_placeholder')}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ color: '#888' }}>{t('invoice_settings.invoice_no')}:</div>
                                <div style={{ fontWeight: 600 }}>#INV-001</div>
                                <div style={{ color: '#888' }}>{t('invoice_settings.date')}:</div>
                                <div>04/03/2026</div>
                            </div>
                        </div>

                        <div style={{ borderTop: '2px solid #333', borderBottom: '1px solid #333', padding: '0.5rem 0', marginBottom: '1rem', fontWeight: 600, display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr' }}>
                            <span>{t('invoice_settings.item')}</span>
                            <span style={{ textAlign: 'right' }}>{t('invoice_settings.qty')}</span>
                            <span style={{ textAlign: 'right' }}>{t('invoice_settings.rate')}</span>
                            <span style={{ textAlign: 'right' }}>{t('invoice_settings.amount')}</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', marginBottom: '0.5rem' }}>
                            <span>Sample Product...</span>
                            <span style={{ textAlign: 'right' }}>10</span>
                            <span style={{ textAlign: 'right' }}>₹100</span>
                            <span style={{ textAlign: 'right' }}>₹1000</span>
                        </div>

                        <div style={{ marginTop: '1.5rem', paddingTop: '0.5rem', borderTop: '2px solid #333', textAlign: 'right' }}>
                            <div style={{ fontSize: '1rem', fontWeight: 700 }}>{t('invoice_settings.total')}: ₹1,000</div>
                        </div>

                        <div style={{ marginTop: '2rem', fontSize: '0.65rem', color: '#888' }}>
                            <div style={{ fontWeight: 600, color: '#555', marginBottom: '0.25rem' }}>{t('invoice_settings.terms')}:</div>
                            {settings.terms.split('\n').map((line, i) => <div key={i}>{line}</div>)}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
