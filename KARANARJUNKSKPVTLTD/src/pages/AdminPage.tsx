import { useState, useEffect } from 'react';
import { collection, getDocs, doc, getDoc, updateDoc, setDoc, deleteDoc, serverTimestamp, query, orderBy, where } from 'firebase/firestore';
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { firebaseConfig, db } from '../firebase';
import { getTenantCollection } from '../utils/tenantPath';
import { Shield, ShieldAlert, UserCog, UserPlus, Loader2, Mail, Lock, User as UserIcon, Edit2, Trash2, X, Save, Store, Factory, Target } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useTranslation } from 'react-i18next';

function ymToDisplay(ym: string): string {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'short', year: 'numeric' });
}
function currentYM(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function prevYM(ym: string): string {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function nextYM(ym: string): string {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function fyLabel(ym: string): string {
    const [y, m] = ym.split('-').map(Number);
    return m >= 4 ? `FY ${y}-${String(y + 1).slice(2)}` : `FY ${y - 1}-${String(y).slice(2)}`;
}

export default function AdminPage() {
    const { t } = useTranslation();
    const { userRole, currentUser, tenantId } = useAuth();
    const { showToast } = useToast();
    const [activeSection, setActiveSection] = useState<'staff' | 'retailer' | 'manufacturer' | 'targets'>('staff');
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [updatingId, setUpdatingId] = useState<string | null>(null);

    // Create User States
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [newName, setNewName] = useState('');
    const [newEmail, setNewEmail] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newRole, setNewRole] = useState<'admin' | 'analyst' | 'retailer' | 'manufacturer' | 'customer' | 'sales'>('analyst');
    const [newDistricts, setNewDistricts] = useState<string[]>([]);
    const [districtInput, setDistrictInput] = useState('');
    const [createLoading, setCreateLoading] = useState(false);
    const [createError, setCreateError] = useState('');

    // Edit Districts (for existing sales users)
    const [editingDistrictsFor, setEditingDistrictsFor] = useState<string | null>(null);
    const [editDistrictTags, setEditDistrictTags] = useState<string[]>([]);
    const [editDistrictInput, setEditDistrictInput] = useState('');
    const [savingDistricts, setSavingDistricts] = useState(false);

    // Invite Retailer States
    const [retailers, setRetailers] = useState<any[]>([]);
    const [inviteRetailerEmail, setInviteRetailerEmail] = useState('');
    const [inviteRetailerPassword, setInviteRetailerPassword] = useState('');
    const [inviteRetailerId, setInviteRetailerId] = useState('');
    const [inviteRetailerLoading, setInviteRetailerLoading] = useState(false);

    // Invite Manufacturer States
    const [manufacturers, setManufacturers] = useState<any[]>([]);
    const [inviteMfgEmail, setInviteMfgEmail] = useState('');
    const [inviteMfgPassword, setInviteMfgPassword] = useState('');
    const [inviteMfgId, setInviteMfgId] = useState('');
    const [inviteMfgLoading, setInviteMfgLoading] = useState(false);

    // Edit User States
    const [editUserForm, setEditUserForm] = useState<{ id: string, name: string, email: string } | null>(null);
    const [updateLoading, setUpdateLoading] = useState(false);

    // Sales Targets States
    const [targetMonth, setTargetMonth] = useState(currentYM());
    const [targetData, setTargetData] = useState<Record<string, { invoice: string; payment: string }>>({});
    const [loadingTargets, setLoadingTargets] = useState(false);
    const [savingTargetFor, setSavingTargetFor] = useState<string | null>(null);

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                let q;
                if (tenantId === 'master') {
                    q = collection(db, 'users');
                } else {
                    q = query(collection(db, 'users'), where('tenantId', '==', tenantId));
                }
                const querySnapshot = await getDocs(q);
                const usersData = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setUsers(usersData);
            } catch (error) {
                console.error("Error fetching users: ", error);
            } finally {
                setLoading(false);
            }
        };

        const fetchLinked = async () => {
            if (!tenantId) return;
            try {
                const rSnap = await getDocs(query(getTenantCollection(db, tenantId, 'retailers'), orderBy('name')));
                setRetailers(rSnap.docs.map(d => ({ id: d.id, ...d.data() })));
                const mSnap = await getDocs(query(getTenantCollection(db, tenantId, 'manufacturers'), orderBy('name')));
                setManufacturers(mSnap.docs.map(d => ({ id: d.id, ...d.data() })));
            } catch (e) { console.error(e); }
        };

        if (userRole === 'admin') {
            fetchUsers();
            fetchLinked();
        } else {
            setLoading(false);
        }
    }, [userRole, tenantId]);

    // Load targets for all sales users whenever the targets tab month changes
    useEffect(() => {
        if (activeSection !== 'targets' || !tenantId) return;
        const salesUsers = users.filter(u => u.role === 'sales');
        if (salesUsers.length === 0) return;
        let cancelled = false;
        setLoadingTargets(true);
        (async () => {
            const entries: Record<string, { invoice: string; payment: string }> = {};
            await Promise.all(salesUsers.map(async u => {
                const snap = await getDoc(doc(db, 'tenants', tenantId, 'salesTargets', `${u.id}_${targetMonth}`));
                if (snap.exists()) {
                    const d = snap.data();
                    entries[u.id] = { invoice: String(d.invoiceTarget ?? ''), payment: String(d.paymentTarget ?? '') };
                } else {
                    entries[u.id] = { invoice: '', payment: '' };
                }
            }));
            if (!cancelled) setTargetData(entries);
            if (!cancelled) setLoadingTargets(false);
        })();
        return () => { cancelled = true; };
    }, [activeSection, targetMonth, users, tenantId]);

    const handleSaveTarget = async (userId: string, userName: string) => {
        if (!tenantId) return;
        setSavingTargetFor(userId);
        try {
            const docId = `${userId}_${targetMonth}`;
            await setDoc(doc(db, 'tenants', tenantId, 'salesTargets', docId), {
                userId,
                userName,
                month: targetMonth,
                financialYear: fyLabel(targetMonth),
                invoiceTarget: parseFloat(targetData[userId]?.invoice || '0') || 0,
                paymentTarget: parseFloat(targetData[userId]?.payment || '0') || 0,
                updatedAt: serverTimestamp(),
            }, { merge: true });
            showToast(`Target saved for ${userName} — ${ymToDisplay(targetMonth)}`, 'success');
        } catch (e) {
            showToast('Failed to save target', 'error');
        } finally {
            setSavingTargetFor(null);
        }
    };

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreateLoading(true);
        setCreateError('');

        try {
            // Note: In a real production app, you'd use Firebase Admin SDK or a Cloud Function
            // to create users without signing out the current admin.
            // For this project, we'll use a secondary Firebase app instance to create the user.
            const secondaryApp = initializeApp(firebaseConfig, 'Secondary');
            const secondaryAuth = getAuth(secondaryApp);

            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newEmail, newPassword);
            const newUser = userCredential.user;

            // Create the user document in Firestore
            await setDoc(doc(db, 'users', newUser.uid), {
                name: newName,
                email: newEmail,
                role: newRole,
                tenantId: tenantId || 'master',
                assignedDistricts: newRole === 'sales' ? newDistricts : [],
                createdAt: serverTimestamp()
            });

            // Refresh user list
            const querySnapshot = await getDocs(collection(db, 'users'));
            setUsers(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

            // Reset form
            setNewName('');
            setNewEmail('');
            setNewPassword('');
            setNewRole('analyst');
            setNewDistricts([]);
            setDistrictInput('');
            setShowCreateForm(false);
            alert(t('admin.create_success', { name: newName }));

            // Clean up secondary app
            await deleteApp(secondaryApp);
        } catch (error: any) {
            console.error("Error creating user:", error);
            setCreateError(error.message || t('admin.create_error'));
        } finally {
            setCreateLoading(false);
        }
    };

    const handleInviteRetailer = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inviteRetailerId || !inviteRetailerEmail || !inviteRetailerPassword) return;
        setInviteRetailerLoading(true);
        try {
            const secondaryApp = initializeApp(firebaseConfig, 'SecondaryR_' + Date.now());
            const secondaryAuth = getAuth(secondaryApp);
            const cred = await createUserWithEmailAndPassword(secondaryAuth, inviteRetailerEmail, inviteRetailerPassword);
            await setDoc(doc(db, 'users', cred.user.uid), {
                email: inviteRetailerEmail,
                name: retailers.find(r => r.id === inviteRetailerId)?.name || 'Retailer',
                role: 'retailer',
                tenantId: tenantId || 'master',
                linkedId: inviteRetailerId,
                assignedRetailers: [inviteRetailerId],
                createdAt: serverTimestamp()
            });
            await deleteApp(secondaryApp);
            showToast('Retailer portal access created!', 'success');
            setInviteRetailerEmail(''); setInviteRetailerPassword(''); setInviteRetailerId('');
        } catch (err: any) {
            showToast(err.message || 'Failed to create access.', 'error');
        } finally { setInviteRetailerLoading(false); }
    };

    const handleInviteManufacturer = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inviteMfgId || !inviteMfgEmail || !inviteMfgPassword) return;
        setInviteMfgLoading(true);
        try {
            const secondaryApp = initializeApp(firebaseConfig, 'SecondaryM_' + Date.now());
            const secondaryAuth = getAuth(secondaryApp);
            const cred = await createUserWithEmailAndPassword(secondaryAuth, inviteMfgEmail, inviteMfgPassword);
            await setDoc(doc(db, 'users', cred.user.uid), {
                email: inviteMfgEmail,
                name: manufacturers.find(m => m.id === inviteMfgId)?.name || 'Manufacturer',
                role: 'manufacturer',
                tenantId: tenantId || 'master',
                linkedId: inviteMfgId,
                createdAt: serverTimestamp()
            });
            await deleteApp(secondaryApp);
            showToast('Manufacturer portal access created!', 'success');
            setInviteMfgEmail(''); setInviteMfgPassword(''); setInviteMfgId('');
        } catch (err: any) {
            showToast(err.message || 'Failed to create access.', 'error');
        } finally { setInviteMfgLoading(false); }
    };

    const handleRoleChange = async (userId: string, newRole: 'admin' | 'analyst' | 'retailer' | 'manufacturer' | 'customer' | 'sales') => {
        setUpdatingId(userId);
        try {
            await updateDoc(doc(db, 'users', userId), {
                role: newRole
            });
            setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
        } catch (error) {
            console.error("Error updating role:", error);
            alert(t('admin.update_error'));
        } finally {
            setUpdatingId(null);
        }
    };

    const handleUpdateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editUserForm) return;

        setUpdateLoading(true);
        try {
            await updateDoc(doc(db, 'users', editUserForm.id), {
                name: editUserForm.name,
                email: editUserForm.email
            });
            setUsers(users.map(u => u.id === editUserForm.id ? { ...u, name: editUserForm.name, email: editUserForm.email } : u));
            setEditUserForm(null);
            alert(t('admin.update_success'));
        } catch (error) {
            console.error("Error updating user:", error);
            alert(t('admin.update_error'));
        } finally {
            setUpdateLoading(false);
        }
    };

    const handleSaveDistricts = async (userId: string) => {
        setSavingDistricts(true);
        try {
            await updateDoc(doc(db, 'users', userId), { assignedDistricts: editDistrictTags });
            setUsers(users.map(u => u.id === userId ? { ...u, assignedDistricts: editDistrictTags } : u));
            setEditingDistrictsFor(null);
        } catch {
            alert('Failed to save districts.');
        } finally {
            setSavingDistricts(false);
        }
    };

    const handleDeleteUser = async (userId: string) => {
        if (userId === currentUser?.uid) {
            alert(t('admin.delete_mine_error'));
            return;
        }
        if (!window.confirm(t('admin.delete_confirm'))) return;

        setUpdatingId(userId);
        try {
            await deleteDoc(doc(db, 'users', userId));
            setUsers(users.filter(u => u.id !== userId));
        } catch (error) {
            console.error("Error deleting user:", error);
            alert(t('admin.delete_error'));
        } finally {
            setUpdatingId(null);
        }
    };

    if (userRole !== 'admin') {
        return (
            <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--danger)' }}>
                <ShieldAlert size={48} style={{ margin: '0 auto 1rem auto' }} />
                <h2>{t('admin.access_denied')}</h2>
                <p>{t('admin.admin_only')}</p>
            </div>
        );
    }

    return (
        <div className="animate-fade-in" style={{ maxWidth: '1000px', margin: '0 auto' }}>
            <div style={{ marginBottom: '2rem' }}>
                <h1 className="primary-gradient-text" style={{ fontSize: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Shield size={28} /> {t('admin.title')}
                </h1>
                <p style={{ color: 'var(--text-secondary)' }}>{t('admin.description')}</p>
            </div>

            {/* Section Tabs */}
            <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--surface-border)', marginBottom: '2rem', flexWrap: 'wrap' }}>
                {([['staff', <UserCog size={16} />, 'Staff Users'], ['retailer', <Store size={16} />, 'Invite Retailer'], ['manufacturer', <Factory size={16} />, 'Invite Manufacturer'], ['targets', <Target size={16} />, 'Sales Targets']] as const).map(([id, icon, label]) => (
                    <button key={id} onClick={() => setActiveSection(id as any)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.7rem 1.1rem', background: activeSection === id ? 'var(--surface-raised)' : 'transparent', color: activeSection === id ? 'var(--text-primary)' : 'var(--text-tertiary)', border: '1px solid', borderColor: activeSection === id ? 'var(--surface-border)' : 'transparent', borderRadius: '10px', cursor: 'pointer', fontWeight: activeSection === id ? 600 : 400, font: 'inherit', marginBottom: '-1px' }}>
                        {icon}{label}
                    </button>
                ))}
            </div>

            {activeSection === 'staff' && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
                    <button onClick={() => setShowCreateForm(!showCreateForm)} className="btn btn-primary animate-pulse" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <UserPlus size={18} /> {showCreateForm ? t('admin.cancel') : t('admin.create_user_button')}
                    </button>
                </div>)}


            {showCreateForm && (
                <div className="glass-panel animate-fade-in" style={{ padding: '2rem', marginBottom: '2rem', border: '1px solid var(--primary-light)' }}>
                    <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <UserPlus size={20} color="var(--primary-light)" /> {t('admin.create_title')}
                    </h2>

                    {createError && (
                        <div style={{ padding: '0.75rem', background: 'hsla(0, 84%, 60%, 0.1)', color: 'var(--danger)', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
                            {createError}
                        </div>
                    )}

                    <form onSubmit={handleCreateUser} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
                        <div className="input-group" style={{ marginBottom: 0 }}>
                            <label>{t('admin.full_name')}</label>
                            <div style={{ position: 'relative' }}>
                                <UserIcon size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                                <input required type="text" className="input-field" style={{ paddingLeft: '2.75rem' }} placeholder="John Doe" value={newName} onChange={e => setNewName(e.target.value)} />
                            </div>
                        </div>
                        <div className="input-group" style={{ marginBottom: 0 }}>
                            <label>{t('admin.email_address')}</label>
                            <div style={{ position: 'relative' }}>
                                <Mail size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                                <input required type="email" className="input-field" style={{ paddingLeft: '2.75rem' }} placeholder="john@example.com" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
                            </div>
                        </div>
                        <div className="input-group" style={{ marginBottom: 0 }}>
                            <label>{t('admin.password')}</label>
                            <div style={{ position: 'relative' }}>
                                <Lock size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                                <input required type="password" minLength={6} className="input-field" style={{ paddingLeft: '2.75rem' }} placeholder="••••••••" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                            </div>
                        </div>
                        <div className="input-group" style={{ marginBottom: 0 }}>
                            <label>{t('admin.assign_role')}</label>
                            <select className="input-field" value={newRole} onChange={e => { setNewRole(e.target.value as any); setNewDistricts([]); setDistrictInput(''); }}>
                                <option value="analyst">{t('admin.role_analyst')}</option>
                                <option value="admin">{t('admin.role_admin')}</option>
                                <option value="sales">Sales</option>
                                <option value="retailer">Retailer</option>
                                <option value="manufacturer">Manufacturer</option>
                                <option value="customer">Customer</option>
                            </select>
                        </div>

                        {/* District assignment — only shown for sales role */}
                        {newRole === 'sales' && (
                            <div className="input-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                                <label>Assign Districts <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(press Enter or comma to add)</span></label>
                                {newDistricts.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.5rem' }}>
                                        {newDistricts.map(d => (
                                            <span key={d} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.2rem 0.6rem', borderRadius: '10px', background: 'hsla(152,60%,40%,0.12)', color: 'var(--primary-light)', border: '1px solid hsla(152,60%,40%,0.3)', fontSize: '0.8rem', fontWeight: 600 }}>
                                                {d}
                                                <button type="button" onClick={() => setNewDistricts(p => p.filter(x => x !== d))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, lineHeight: 1 }}>×</button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                                <input
                                    type="text"
                                    className="input-field"
                                    placeholder="e.g. Nashik, Pune"
                                    value={districtInput}
                                    onChange={e => setDistrictInput(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' || e.key === ',') {
                                            e.preventDefault();
                                            const val = districtInput.trim().replace(/,+$/, '');
                                            if (val && !newDistricts.includes(val)) setNewDistricts(p => [...p, val]);
                                            setDistrictInput('');
                                        }
                                    }}
                                    onBlur={() => {
                                        const val = districtInput.trim().replace(/,+$/, '');
                                        if (val && !newDistricts.includes(val)) setNewDistricts(p => [...p, val]);
                                        setDistrictInput('');
                                    }}
                                />
                            </div>
                        )}

                        <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                            <button type="submit" className="btn btn-primary" disabled={createLoading} style={{ minWidth: '150px' }}>
                                {createLoading ? <Loader2 size={18} className="animate-spin" /> : t('admin.create_button')}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Invite Retailer Section */}
            {activeSection === 'retailer' && (
                <div className="glass-panel animate-fade-in" style={{ padding: '2rem', marginBottom: '2rem' }}>
                    <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Store size={20} color="var(--primary-light)" /> Invite Retailer to Portal</h2>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>Create login credentials for a retailer so they can view their own orders and invoices.</p>
                    <form onSubmit={handleInviteRetailer} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                        <div className="input-group" style={{ marginBottom: 0 }}>
                            <label>Select Retailer *</label>
                            <select required className="input-field" value={inviteRetailerId} onChange={e => setInviteRetailerId(e.target.value)} style={{ appearance: 'auto' }}>
                                <option value="">-- Choose Retailer --</option>
                                {retailers.map(r => <option key={r.id} value={r.id}>{r.name} — {r.atPost || r.location}</option>)}
                            </select>
                        </div>
                        <div className="input-group" style={{ marginBottom: 0 }}>
                            <label>Login Email *</label>
                            <input required type="email" className="input-field" placeholder="retailer@shop.com" value={inviteRetailerEmail} onChange={e => setInviteRetailerEmail(e.target.value)} />
                        </div>
                        <div className="input-group" style={{ marginBottom: 0 }}>
                            <label>Temporary Password *</label>
                            <input required type="password" minLength={6} className="input-field" placeholder="Min 6 characters" value={inviteRetailerPassword} onChange={e => setInviteRetailerPassword(e.target.value)} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                            <button type="submit" className="btn btn-primary" disabled={inviteRetailerLoading} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                {inviteRetailerLoading ? <Loader2 size={16} className="animate-spin" /> : <><UserPlus size={16} /> Create Access</>}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Invite Manufacturer Section */}
            {activeSection === 'manufacturer' && (
                <div className="glass-panel animate-fade-in" style={{ padding: '2rem', marginBottom: '2rem' }}>
                    <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Factory size={20} color="var(--primary-light)" /> Invite Manufacturer to Portal</h2>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>Create login credentials for a manufacturer so they can see their dispatch queue.</p>
                    <form onSubmit={handleInviteManufacturer} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                        <div className="input-group" style={{ marginBottom: 0 }}>
                            <label>Select Manufacturer *</label>
                            <select required className="input-field" value={inviteMfgId} onChange={e => setInviteMfgId(e.target.value)} style={{ appearance: 'auto' }}>
                                <option value="">-- Choose Manufacturer --</option>
                                {manufacturers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                            </select>
                        </div>
                        <div className="input-group" style={{ marginBottom: 0 }}>
                            <label>Login Email *</label>
                            <input required type="email" className="input-field" placeholder="contact@manufacturer.com" value={inviteMfgEmail} onChange={e => setInviteMfgEmail(e.target.value)} />
                        </div>
                        <div className="input-group" style={{ marginBottom: 0 }}>
                            <label>Temporary Password *</label>
                            <input required type="password" minLength={6} className="input-field" placeholder="Min 6 characters" value={inviteMfgPassword} onChange={e => setInviteMfgPassword(e.target.value)} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                            <button type="submit" className="btn btn-primary" disabled={inviteMfgLoading} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                {inviteMfgLoading ? <Loader2 size={16} className="animate-spin" /> : <><UserPlus size={16} /> Create Access</>}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Only show user list on staff tab */}
            {activeSection !== 'staff' && null}

            {/* Edit User Modal */}
            {editUserForm && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
                    <div className="glass-panel" style={{ width: '100%', maxWidth: '500px', padding: '2rem', position: 'relative' }}>
                        <button onClick={() => setEditUserForm(null)} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}><X size={24} /></button>
                        <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Edit2 size={24} color="var(--primary-light)" /> {t('admin.edit_title')}
                        </h2>

                        <form onSubmit={handleUpdateUser} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div className="input-group" style={{ marginBottom: 0 }}>
                                <label>{t('admin.full_name')}</label>
                                <div style={{ position: 'relative' }}>
                                    <UserIcon size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                                    <input required type="text" className="input-field" style={{ paddingLeft: '2.75rem' }} value={editUserForm.name} onChange={e => setEditUserForm({ ...editUserForm, name: e.target.value })} />
                                </div>
                            </div>
                            <div className="input-group" style={{ marginBottom: 0 }}>
                                <label>{t('admin.email_address')}</label>
                                <div style={{ position: 'relative' }}>
                                    <Mail size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                                    <input required type="email" className="input-field" style={{ paddingLeft: '2.75rem' }} value={editUserForm.email} onChange={e => setEditUserForm({ ...editUserForm, email: e.target.value })} />
                                </div>
                            </div>

                            <button type="submit" className="btn btn-primary" disabled={updateLoading} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                                {updateLoading ? <Loader2 size={18} className="animate-spin" /> : <><Save size={18} /> {t('admin.update_button')}</>}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {activeSection === 'staff' && <div className="glass-panel" style={{ padding: '2rem' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>{t('admin.loading_users')}</div>
                ) : users.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>{t('admin.no_users')}</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {users.map((user, i) => (
                            <div key={user.id} className={`animate-fade-in delay-${(i % 5)}00`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem', background: 'var(--surface-base)', border: '1px solid var(--surface-border)', borderRadius: '10px' }}>
                                <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center' }}>
                                    <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--surface-raised)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary-light)' }}>
                                        <UserCog size={24} />
                                    </div>
                                    <div>
                                        <h3 style={{ margin: '0 0 0.25rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            {user.name}
                                            {user.id === currentUser?.uid && <span style={{ fontSize: '0.75rem', background: 'var(--surface-raised)', padding: '2px 6px', borderRadius: '4px', color: 'var(--text-secondary)', fontWeight: 'normal' }}>({t('admin.you')})</span>}
                                        </h3>
                                        <p style={{ margin: 0, color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>{user.email}</p>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-end' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{t('admin.current_role')}</span>
                                    <select
                                        value={user.role}
                                        onChange={(e) => handleRoleChange(user.id, e.target.value as any)}
                                        disabled={updatingId === user.id}
                                        style={{
                                            padding: '0.5rem 1rem',
                                            borderRadius: '8px',
                                            background: user.role === 'admin' ? 'hsla(152, 60%, 40%, 0.1)' : 'var(--surface-raised)',
                                            color: user.role === 'admin' ? 'var(--primary-light)' : 'var(--text-primary)',
                                            border: '1px solid',
                                            borderColor: user.role === 'admin' ? 'var(--primary)' : 'var(--surface-border)',
                                            outline: 'none',
                                            fontWeight: 600,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <option value="analyst">{t('common.analyst')}</option>
                                        <option value="admin">{t('common.admin')}</option>
                                        <option value="sales">Sales</option>
                                        <option value="retailer">Retailer</option>
                                        <option value="manufacturer">Manufacturer</option>
                                        <option value="customer">Customer</option>
                                    </select>

                                    <button
                                        onClick={() => setEditUserForm({ id: user.id, name: user.name, email: user.email })}
                                        className="btn btn-secondary"
                                        style={{ padding: '0.5rem' }}
                                        title={t('admin.edit_user')}
                                    >
                                        <Edit2 size={16} />
                                    </button>
                                    <button
                                        onClick={() => handleDeleteUser(user.id)}
                                        className="btn"
                                        style={{ padding: '0.5rem', background: 'hsla(0, 84%, 60%, 0.1)', color: 'var(--danger)', border: '1px solid hsla(0, 84%, 60%, 0.3)' }}
                                        title={t('admin.delete_user')}
                                    >
                                        <Trash2 size={16} />
                                    </button>

                                    {updatingId === user.id && (
                                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{t('admin.processing')}</span>
                                    )}
                                  </div>

                                  {/* District display + inline editor for sales users */}
                                  {user.role === 'sales' && editingDistrictsFor !== user.id && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                      <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Districts:</span>
                                      {(user.assignedDistricts || []).length === 0
                                        ? <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>None assigned</span>
                                        : (user.assignedDistricts as string[]).map((d: string) => (
                                          <span key={d} style={{ fontSize: '0.72rem', padding: '0.15rem 0.5rem', borderRadius: '8px', background: 'hsla(152,60%,40%,0.1)', color: 'var(--primary-light)', fontWeight: 600, border: '1px solid hsla(152,60%,40%,0.25)' }}>{d}</span>
                                        ))
                                      }
                                      <button
                                        onClick={() => { setEditingDistrictsFor(user.id); setEditDistrictTags(user.assignedDistricts || []); setEditDistrictInput(''); }}
                                        style={{ fontSize: '0.72rem', padding: '0.15rem 0.55rem', borderRadius: '6px', border: '1px solid var(--surface-border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}
                                      >Edit</button>
                                    </div>
                                  )}

                                  {/* Inline district editor */}
                                  {user.role === 'sales' && editingDistrictsFor === user.id && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'flex-end', minWidth: '280px' }}>
                                      {editDistrictTags.length > 0 && (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', justifyContent: 'flex-end' }}>
                                          {editDistrictTags.map(d => (
                                            <span key={d} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.72rem', padding: '0.15rem 0.5rem', borderRadius: '8px', background: 'hsla(152,60%,40%,0.1)', color: 'var(--primary-light)', fontWeight: 600, border: '1px solid hsla(152,60%,40%,0.25)' }}>
                                              {d}
                                              <button type="button" onClick={() => setEditDistrictTags(p => p.filter(x => x !== d))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, lineHeight: 1 }}>×</button>
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                      <input
                                        type="text"
                                        className="input-field"
                                        placeholder="Type district, press Enter"
                                        value={editDistrictInput}
                                        style={{ width: '100%', height: '32px', fontSize: '0.82rem' }}
                                        onChange={e => setEditDistrictInput(e.target.value)}
                                        onKeyDown={e => {
                                          if (e.key === 'Enter' || e.key === ',') {
                                            e.preventDefault();
                                            const val = editDistrictInput.trim().replace(/,+$/, '');
                                            if (val && !editDistrictTags.includes(val)) setEditDistrictTags(p => [...p, val]);
                                            setEditDistrictInput('');
                                          }
                                        }}
                                      />
                                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                                        <button onClick={() => setEditingDistrictsFor(null)} style={{ fontSize: '0.78rem', padding: '0.3rem 0.75rem', borderRadius: '6px', border: '1px solid var(--surface-border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                                        <button onClick={() => handleSaveDistricts(user.id)} disabled={savingDistricts} style={{ fontSize: '0.78rem', padding: '0.3rem 0.75rem', borderRadius: '6px', border: 'none', background: 'var(--primary-light)', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                                          {savingDistricts ? '…' : 'Save'}
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>}

            {/* ── Sales Targets section ──────────────────────────────────── */}
            {activeSection === 'targets' && (
                <div>
                    {/* Month navigator */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.75rem', flexWrap: 'wrap' }}>
                        <button onClick={() => setTargetMonth(prevYM(targetMonth))} style={{ background: 'var(--surface-raised)', border: 'none', borderRadius: '8px', padding: '0.4rem 0.7rem', cursor: 'pointer', color: 'var(--text-primary)', fontSize: '1rem', lineHeight: 1 }}>‹</button>
                        <div style={{ fontSize: '1.05rem', fontWeight: 700, minWidth: '160px', textAlign: 'center' }}>{ymToDisplay(targetMonth)}</div>
                        <button onClick={() => setTargetMonth(nextYM(targetMonth))} style={{ background: 'var(--surface-raised)', border: 'none', borderRadius: '8px', padding: '0.4rem 0.7rem', cursor: 'pointer', color: 'var(--text-primary)', fontSize: '1rem', lineHeight: 1 }}>›</button>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginLeft: '0.25rem' }}>{fyLabel(targetMonth)}</span>
                    </div>

                    {loadingTargets && (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
                            <Loader2 size={28} className="animate-spin" style={{ color: 'var(--text-tertiary)' }} />
                        </div>
                    )}

                    {!loadingTargets && (() => {
                        const salesUsers = users.filter(u => u.role === 'sales');
                        if (salesUsers.length === 0) {
                            return (
                                <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                    No sales users found. Create a user with the <strong>Sales</strong> role first.
                                </div>
                            );
                        }
                        return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {/* Header row */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px 180px 100px', gap: '0.75rem', padding: '0.5rem 1rem', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '0.06em' }}>
                                    <div>Sales User</div>
                                    <div>Invoice Target (₹)</div>
                                    <div>Payment Target (₹)</div>
                                    <div></div>
                                </div>
                                {salesUsers.map(user => (
                                    <div key={user.id} className="glass-panel" style={{ display: 'grid', gridTemplateColumns: '1fr 180px 180px 100px', gap: '0.75rem', alignItems: 'center', padding: '0.9rem 1rem', borderRadius: '12px' }}>
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{user.name || '—'}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{user.email}</div>
                                            {Array.isArray(user.assignedDistricts) && user.assignedDistricts.length > 0 && (
                                                <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '0.15rem' }}>
                                                    Districts: {user.assignedDistricts.join(', ')}
                                                </div>
                                            )}
                                        </div>
                                        <input
                                            type="number"
                                            className="input-field"
                                            placeholder="e.g. 500000"
                                            value={targetData[user.id]?.invoice ?? ''}
                                            onChange={e => setTargetData(prev => ({ ...prev, [user.id]: { ...prev[user.id], invoice: e.target.value } }))}
                                            style={{ margin: 0, padding: '0.45rem 0.6rem', fontSize: '0.875rem', width: '100%' }}
                                        />
                                        <input
                                            type="number"
                                            className="input-field"
                                            placeholder="e.g. 300000"
                                            value={targetData[user.id]?.payment ?? ''}
                                            onChange={e => setTargetData(prev => ({ ...prev, [user.id]: { ...prev[user.id], payment: e.target.value } }))}
                                            style={{ margin: 0, padding: '0.45rem 0.6rem', fontSize: '0.875rem', width: '100%' }}
                                        />
                                        <button
                                            onClick={() => handleSaveTarget(user.id, user.name || user.email)}
                                            disabled={savingTargetFor === user.id}
                                            className="btn btn-primary"
                                            style={{ padding: '0.45rem 0.75rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'center', width: '100%' }}
                                        >
                                            {savingTargetFor === user.id
                                                ? <Loader2 size={14} className="animate-spin" />
                                                : <><Save size={13} /> Save</>
                                            }
                                        </button>
                                    </div>
                                ))}
                            </div>
                        );
                    })()}
                </div>
            )}
        </div>
    );
}
