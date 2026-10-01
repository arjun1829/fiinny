import { useState, useEffect } from 'react';
import { Users, Edit2, Trash2, Search, MapPin, Phone, Mail, X, Save, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { query, onSnapshot, updateDoc } from 'firebase/firestore';
import { softDelete } from '../utils/softDelete';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection, getTenantDoc } from '../utils/tenantPath';
import { logAudit } from '../utils/auditLog';
import { LOCATION_DATA, STATES } from '../utils/locationData';
import { checkContactNumber } from '../utils/phoneValidator';

interface Retailer {
    id: string;
    name: string;
    number: string;
    email?: string;
    atPost?: string;
    taluka?: string;
    district?: string;
    state?: string;
    country?: string;
    fullAddress?: string;
    gstin?: string;
    licenseNumber?: string;
    portfolioSize: string;
    outstandingAmount?: number;
}

export default function ManageRetailersPage() {
    const { userRole, tenantId, currentUser, userName } = useAuth();
    const { t } = useTranslation();
    const [retailers, setRetailers] = useState<Retailer[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [editingRetailer, setEditingRetailer] = useState<Retailer | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [numberError, setNumberError] = useState<string | null>(null);

    // Form State for Editing
    const [formData, setFormData] = useState({
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
        portfolioSize: ''
    });

    useEffect(() => {
        if (!tenantId) return;
        const q = query(getTenantCollection(db, tenantId, 'retailers'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter((r: any) => !r.deleted) as Retailer[];
            setRetailers(data);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleEditClick = (retailer: Retailer) => {
        setEditingRetailer(retailer);
        setFormData({
            name: retailer.name || '',
            number: retailer.number || '',
            email: retailer.email || '',
            country: retailer.country || 'India',
            state: retailer.state || 'Maharashtra',
            district: retailer.district || '',
            taluka: retailer.taluka || '',
            atPost: retailer.atPost || '',
            fullAddress: retailer.fullAddress || '',
            gstin: retailer.gstin || '',
            licenseNumber: retailer.licenseNumber || '',
            portfolioSize: retailer.portfolioSize || 'Small'
        });
        setNumberError(null);
        setIsModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingRetailer) return;

        const numberCheck = checkContactNumber(formData.number);
        if (!numberCheck.valid) {
            setNumberError(numberCheck.error || 'Enter a valid contact number');
            return;
        }
        setNumberError(null);

        setIsSaving(true);

        try {
            const docRef = getTenantDoc(db, tenantId!, 'retailers', editingRetailer.id);
            const before = { name: editingRetailer.name, number: editingRetailer.number, district: editingRetailer.district, portfolioSize: editingRetailer.portfolioSize };
            const after  = { name: formData.name, number: formData.number, district: formData.district, portfolioSize: formData.portfolioSize };
            await updateDoc(docRef, {
                ...formData,
                location: `${formData.atPost}, ${formData.taluka}, ${formData.district}`
            });
            logAudit({ db, tenantId: tenantId!, userId: currentUser?.uid || '', userName: userName || currentUser?.email || 'Unknown', userRole: userRole || 'unknown', module: 'Manage Retailers', action: 'Update', entityName: formData.name, entityId: editingRetailer.id, description: `Retailer profile updated`, before, after });
            setIsModalOpen(false);
            setEditingRetailer(null);
            alert(t('manage_retailers.update_success'));
        } catch (error) {
            console.error("Error updating retailer:", error);
            alert(t('manage_retailers.update_error'));
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!tenantId || !window.confirm(t('manage_retailers.delete_confirm'))) return;
        const retailer = retailers.find(r => r.id === id);
        try {
            await softDelete({
                db, tenantId,
                collectionName: 'retailers',
                docId: id,
                userId: currentUser?.uid || '',
                userName: userName || currentUser?.email || 'Unknown',
                userRole: userRole || 'unknown',
                module: 'Manage Retailers',
                entityName: retailer?.name || id,
            });
        } catch (error) {
            console.error("Error deleting retailer:", error);
            alert(t('manage_retailers.delete_error'));
        }
    };

    const q = searchTerm.toLowerCase();
    const filteredRetailers = retailers.filter(r =>
        (r.name ?? '').toLowerCase().includes(q) ||
        (r.district ?? '').toLowerCase().includes(q) ||
        (r.number ?? '').toLowerCase().includes(q) ||
        (r.email ?? '').toLowerCase().includes(q)
    );

    if (userRole !== 'admin') {
        return <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>{t('manage_retailers.unauthorized')}</div>;
    }

    if (loading) {
        return <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}><Loader2 className="animate-spin" style={{ margin: '0 auto', marginBottom: '1rem' }} /> {t('manage_retailers.loading_retailers')}</div>;
    }

    return (
        <div className="animate-fade-in" style={{ maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 className="primary-gradient-text" style={{ fontSize: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <Users size={32} /> {t('common.manage_retailers')}
                    </h1>
                    <p style={{ color: 'var(--text-secondary)' }}>{t('manage_retailers.manage_retailers_desc')}</p>
                </div>
                <div style={{ position: 'relative', minWidth: '380px' }}>
                    <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                    <input
                        type="text"
                        placeholder={t('manage_retailers.search_placeholder')}
                        className="input-field"
                        style={{ paddingLeft: '3rem' }}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="glass-panel" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--surface-border)', color: 'var(--text-secondary)' }}>
                            <th style={{ padding: '1rem', fontWeight: 600 }}>{t('manage_retailers.table_retailer_name')}</th>
                            <th style={{ padding: '1rem', fontWeight: 600 }}>{t('manage_retailers.table_contact_info')}</th>
                            <th style={{ padding: '1rem', fontWeight: 600 }}>{t('manage_retailers.table_location')}</th>
                            <th style={{ padding: '1rem', fontWeight: 600, textAlign: 'center'  }}>{t('dashboard.outstanding')}</th>
                            <th style={{ padding: '1rem', fontWeight: 600, textAlign: 'center' }}>{t('common.actions')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredRetailers.map((retailer, i) => (
                            <tr
                                key={retailer.id}
                                className={`animate-fade-in delay-${(i % 5)}00`}
                                style={{ borderBottom: '1px solid var(--surface-border)', transition: 'background-color 0.2s', animationFillMode: 'forwards' }}
                                onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--surface-raised)'}
                                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                <td style={{ padding: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                    {retailer.name}
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 400 }}>{t('manage_retailers.retailer_type', { type: retailer.portfolioSize === 'Big' ? t('dashboard.portfolio_big') : retailer.portfolioSize === 'Medium' ? t('dashboard.portfolio_medium') : t('dashboard.portfolio_small') })}</div>
                                </td>
                                <td style={{ padding: '1rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                                        <Phone size={14} /> {retailer.number}
                                    </div>
                                    {retailer.email && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>
                                            <Mail size={12} /> {retailer.email}
                                        </div>
                                    )}
                                </td>
                                <td style={{ padding: '1rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                                        <MapPin size={14} /> {retailer.taluka}, {retailer.district}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginLeft: '1.4rem' }}>{retailer.atPost}</div>
                                </td>
                                <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 700, color: (retailer.outstandingAmount || 0) > 0 ? 'var(--danger)' : 'var(--primary-light)' }}>
                                    ₹{(retailer.outstandingAmount || 0).toLocaleString()}
                                </td>
                                <td style={{ padding: '1rem', textAlign: 'center' }}>
                                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                                        <button onClick={() => handleEditClick(retailer)} className="btn btn-secondary" style={{ padding: '0.4rem' }} title={t('manage_retailers.edit_details')}><Edit2 size={14} /></button>
                                        <button onClick={() => handleDelete(retailer.id)} className="btn" style={{ padding: '0.4rem', background: 'hsla(0, 84%, 60%, 0.1)', color: 'var(--danger)', border: '1px solid hsla(0, 84%, 60%, 0.2)' }} title={t('manage_retailers.delete_retailer')}><Trash2 size={14} /></button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Edit Modal */}
            {isModalOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
                    <div className="glass-panel" style={{ width: '100%', maxWidth: '600px', padding: '2rem', position: 'relative', maxHeight: '90vh', overflowY: 'auto' }}>
                        <button onClick={() => setIsModalOpen(false)} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}><X size={24} /></button>
                        <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Edit2 size={24} color="var(--primary-light)" /> {t('manage_retailers.edit_details_title')}
                        </h2>

                        <form onSubmit={handleSave} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                            <div style={{ gridColumn: 'span 2' }}>
                                <label className="input-label">{t('onboarding.business_name')}</label>
                                <input required className="input-field" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                            </div>

                            <div>
                                <label className="input-label">{t('onboarding.contact_number')}</label>
                                <input
                                    required
                                    className="input-field"
                                    value={formData.number}
                                    onChange={e => { setFormData({ ...formData, number: e.target.value }); if (numberError) setNumberError(null); }}
                                    aria-invalid={!!numberError}
                                />
                                {numberError && (
                                    <span style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: '0.25rem', display: 'block' }}>
                                        {numberError}
                                    </span>
                                )}
                            </div>
                            <div>
                                <label className="input-label">{t('auth.email')}</label>
                                <input className="input-field" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                            </div>

                            <div>
                                <label className="input-label">{t('onboarding.country')}</label>
                                <input readOnly className="input-field" value={formData.country} style={{ opacity: 0.6, cursor: 'not-allowed' }} />
                            </div>
                            <div>
                                <label className="input-label">{t('onboarding.state')}</label>
                                <select
                                    className="input-field"
                                    value={formData.state}
                                    onChange={e => setFormData({ ...formData, state: e.target.value, district: '' })}
                                    style={{ cursor: 'pointer', appearance: 'auto' }}
                                >
                                    <option value="">{t('onboarding.select_state')}</option>
                                    {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="input-label">{t('onboarding.district')}</label>
                                <select
                                    className="input-field"
                                    value={formData.district}
                                    onChange={e => setFormData({ ...formData, district: e.target.value })}
                                    style={{ cursor: 'pointer', appearance: 'auto' }}
                                >
                                    <option value="">{t('onboarding.select_district')}</option>
                                    {(LOCATION_DATA[formData.state] ?? []).map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="input-label">{t('onboarding.taluka')}</label>
                                <input className="input-field" value={formData.taluka} onChange={e => setFormData({ ...formData, taluka: e.target.value })} />
                            </div>

                            <div>
                                <label className="input-label">{t('onboarding.village')}</label>
                                <input className="input-field" value={formData.atPost} onChange={e => setFormData({ ...formData, atPost: e.target.value })} />
                            </div>

                            <div style={{ gridColumn: 'span 2' }}>
                                <label className="input-label">{t('onboarding.full_address')}</label>
                                <textarea
                                    className="input-field"
                                    placeholder={t('onboarding.placeholder_full_address')}
                                    value={formData.fullAddress}
                                    onChange={e => setFormData({ ...formData, fullAddress: e.target.value })}
                                    rows={2}
                                    style={{ resize: 'vertical' }}
                                />
                            </div>

                            <div>
                                <label className="input-label">{t('onboarding.gstin_optional')}</label>
                                <input className="input-field" value={formData.gstin} onChange={e => setFormData({ ...formData, gstin: e.target.value })} />
                            </div>
                            <div>
                                <label className="input-label">{t('onboarding.license_number_optional')}</label>
                                <input className="input-field" value={formData.licenseNumber} onChange={e => setFormData({ ...formData, licenseNumber: e.target.value })} />
                            </div>

                            <div style={{ gridColumn: 'span 2' }}>
                                <label className="input-label">{t('onboarding.portfolio_size')}</label>
                                <select className="input-field" value={formData.portfolioSize} onChange={e => setFormData({ ...formData, portfolioSize: e.target.value })}>
                                    <option value="Small">{t('manage_retailers.retailer_type_small')}</option>
                                    <option value="Medium">{t('manage_retailers.retailer_type_medium')}</option>
                                    <option value="Big">{t('manage_retailers.retailer_type_big')}</option>
                                </select>
                            </div>

                            <div style={{ gridColumn: 'span 2', marginTop: '1rem' }}>
                                <button type="submit" className="btn btn-primary" disabled={isSaving} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                    {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />} {t('manage_retailers.update_retailer')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
