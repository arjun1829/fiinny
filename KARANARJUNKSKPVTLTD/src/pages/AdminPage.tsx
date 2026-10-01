import { useState, useEffect } from 'react';
import { collection, getDocs, doc, getDoc, updateDoc, setDoc, deleteDoc, serverTimestamp, query, orderBy, where } from 'firebase/firestore';
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { firebaseConfig, db } from '../firebase';
import { getTenantCollection } from '../utils/tenantPath';
import { functionUrl } from '../utils/functionsUrl';
import { logAudit } from '../utils/auditLog';
import { Shield, ShieldAlert, UserCog, UserPlus, Loader2, Mail, Lock, User as UserIcon, Edit2, Trash2, X, Save, Store, Factory, Trash, KeyRound } from 'lucide-react';
import RecentlyDeletedPage from './RecentlyDeletedPage';
import { useAuth } from '../contexts/AuthContext';
import type { UserRole } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useTranslation } from 'react-i18next';


export default function AdminPage() {
    const { t } = useTranslation();
    const { userRole, currentUser, tenantId, userName, customRoles, permissions } = useAuth();
    const { showToast } = useToast();
    const [activeSection, setActiveSection] = useState<'staff' | 'retailer' | 'manufacturer' | 'trash'>('staff');
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [updatingId, setUpdatingId] = useState<string | null>(null);

    // Create User States
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [newName, setNewName] = useState('');
    const [newEmail, setNewEmail] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newRole, setNewRole] = useState<UserRole>('analyst');
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

    // Reset Password States (within Edit User modal)
    const [resetPassword, setResetPassword] = useState('');
    const [resetPasswordConfirm, setResetPasswordConfirm] = useState('');
    const [resetPasswordLoading, setResetPasswordLoading] = useState(false);
    const [resetPasswordError, setResetPasswordError] = useState('');


    // Tenant-scoped user list query — always filter by the caller's tenantId.
    // The master tenant has tenantId == 'master', so master admins see only
    // master users. No special-casing; no cross-tenant reads.
    const tenantUsersQuery = () => {
        if (!tenantId) return null;
        return query(collection(db, 'users'), where('tenantId', '==', tenantId));
    };

    useEffect(() => {
        const fetchUsers = async () => {
            const q = tenantUsersQuery();
            if (!q) { setLoading(false); return; }
            try {
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

        const hasAccess = userRole === 'admin' || (userRole !== null && permissions[userRole]?.['admin'] === true);
        if (hasAccess) {
            fetchUsers();
            fetchLinked();
        } else {
            setLoading(false);
        }
    }, [userRole, tenantId]); // eslint-disable-line react-hooks/exhaustive-deps


    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreateLoading(true);
        setCreateError('');

        // Unique app name prevents "duplicate-app" errors from a leaked previous instance.
        const secondaryApp = initializeApp(firebaseConfig, 'StaffCreate_' + Date.now());
        let createdAuthUser: { delete: () => Promise<void> } | null = null;

        try {
            const secondaryAuth = getAuth(secondaryApp);

            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newEmail, newPassword);
            createdAuthUser = userCredential.user;

            if (!tenantId) throw new Error('No tenant assigned to the current admin — cannot create user.');

            try {
                await setDoc(doc(db, 'users', userCredential.user.uid), {
                    name: newName,
                    email: newEmail,
                    role: newRole,
                    tenantId,
                    assignedDistricts: newRole === 'sales' ? newDistricts : [],
                    createdAt: serverTimestamp()
                });
            } catch (firestoreError) {
                // Roll back the Auth account so it doesn't become orphaned.
                await createdAuthUser.delete().catch((delErr: any) =>
                    console.error('Rollback delete failed — Auth account may be orphaned:', delErr)
                );
                throw firestoreError;
            }

            // Refresh user list — scoped to this tenant only
            const refreshQ = tenantUsersQuery();
            if (refreshQ) {
                const querySnapshot = await getDocs(refreshQ);
                setUsers(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            }

            if (tenantId && currentUser) {
                logAudit({ db, tenantId, userId: currentUser.uid, userName: userName || currentUser.email || 'Admin', userRole: userRole || 'admin', module: 'Manage Users', action: 'Create', entityName: newName, entityId: userCredential.user.uid, remarks: `Role: ${newRole} · Email: ${newEmail}` });
            }

            // Reset form
            setNewName('');
            setNewEmail('');
            setNewPassword('');
            setNewRole('analyst');
            setNewDistricts([]);
            setDistrictInput('');
            setShowCreateForm(false);
            alert(t('admin.create_success', { name: newName }));

        } catch (error: any) {
            console.error("Error creating user:", error);

            if (error.code === 'auth/email-already-in-use') {
                // Distinguish orphaned Auth account (no Firestore doc) from a genuine duplicate.
                const dupQ = query(collection(db, 'users'), where('email', '==', newEmail), where('tenantId', '==', tenantId));
                const dupSnap = await getDocs(dupQ).catch(() => null);
                if (!dupSnap || dupSnap.empty) {
                    setCreateError(
                        'This email already has a Firebase Auth account but no matching user record in this tenant. ' +
                        'A previous creation attempt may have failed mid-way. ' +
                        'Please contact support to clear the orphaned account before retrying.'
                    );
                } else {
                    setCreateError('A user with this email already exists in your tenant.');
                }
            } else {
                setCreateError(error.message || t('admin.create_error'));
            }
        } finally {
            setCreateLoading(false);
            // Always clean up the secondary app, even on failure.
            await deleteApp(secondaryApp).catch(() => {});
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
            if (!tenantId) throw new Error('No tenant assigned — cannot invite retailer.');
            await setDoc(doc(db, 'users', cred.user.uid), {
                email: inviteRetailerEmail,
                name: retailers.find(r => r.id === inviteRetailerId)?.name || 'Retailer',
                role: 'retailer',
                tenantId,
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
            if (!tenantId) throw new Error('No tenant assigned — cannot invite manufacturer.');
            await setDoc(doc(db, 'users', cred.user.uid), {
                email: inviteMfgEmail,
                name: manufacturers.find(m => m.id === inviteMfgId)?.name || 'Manufacturer',
                role: 'manufacturer',
                tenantId,
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

    const handleRoleChange = async (userId: string, newRole: UserRole) => {
        setUpdatingId(userId);
        try {
            await updateDoc(doc(db, 'users', userId), {
                role: newRole
            });
            setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
            const targetUser = users.find(u => u.id === userId);
            if (tenantId && currentUser && targetUser) {
                logAudit({ db, tenantId, userId: currentUser.uid, userName: userName || currentUser.email || 'Admin', userRole: userRole || 'admin', module: 'Manage Users', action: 'Update', entityName: targetUser.name || targetUser.email || userId, entityId: userId, remarks: `Role changed to: ${newRole}` });
            }
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
            closeEditUser();
            alert(t('admin.update_success'));
        } catch (error) {
            console.error("Error updating user:", error);
            alert(t('admin.update_error'));
        } finally {
            setUpdateLoading(false);
        }
    };

    // Close the edit modal and clear the reset-password sub-form.
    const closeEditUser = () => {
        setEditUserForm(null);
        setResetPassword('');
        setResetPasswordConfirm('');
        setResetPasswordError('');
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editUserForm) return;

        setResetPasswordError('');
        if (resetPassword.length < 6) {
            setResetPasswordError(t('admin.password_min_length'));
            return;
        }
        if (resetPassword !== resetPasswordConfirm) {
            setResetPasswordError(t('admin.password_mismatch'));
            return;
        }

        setResetPasswordLoading(true);
        try {
            if (!currentUser) throw new Error('Not signed in');
            // Deployed 1st-gen HTTP function called directly over HTTPS
            // (functionUrl derives the URL from the active Firebase project +
            // region). The server verifies the caller is a business admin of the
            // target's tenant and applies the password via the Admin SDK — the
            // password never touches Firestore and is not logged.
            const idToken = await currentUser.getIdToken();
            const res = await fetch(functionUrl('resetTenantUserPassword'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                body: JSON.stringify({ targetUid: editUserForm.id, newPassword: resetPassword }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);

            if (tenantId && currentUser) {
                logAudit({ db, tenantId, userId: currentUser.uid, userName: userName || currentUser.email || 'Admin', userRole: userRole || 'admin', module: 'Manage Users', action: 'Update', entityName: editUserForm.name || editUserForm.email || editUserForm.id, entityId: editUserForm.id, remarks: 'Password reset' });
            }

            showToast(t('admin.reset_password_success'), 'success');
            // Auto-close the reset-password form/modal and return to the user view.
            closeEditUser();
        } catch (error: any) {
            console.error('Error resetting password:', error);
            setResetPasswordError(error?.message || t('admin.reset_password_error'));
        } finally {
            setResetPasswordLoading(false);
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
        const targetUser = users.find(u => u.id === userId);
        try {
            await deleteDoc(doc(db, 'users', userId));
            setUsers(users.filter(u => u.id !== userId));
            if (tenantId && currentUser && targetUser) {
                logAudit({ db, tenantId, userId: currentUser.uid, userName: userName || currentUser.email || 'Admin', userRole: userRole || 'admin', module: 'Manage Users', action: 'Delete', entityName: targetUser.name || targetUser.email || userId, entityId: userId, remarks: `Role was: ${targetUser.role}` });
            }
        } catch (error) {
            console.error("Error deleting user:", error);
            alert(t('admin.delete_error'));
        } finally {
            setUpdatingId(null);
        }
    };

    // Admit the admin role (plan-gated upstream; admin bypasses role matrix) plus any
    // role the business admin has explicitly granted 'admin' screen access in the Role Matrix.
    const canManageUsers = userRole === 'admin' || (userRole !== null && permissions[userRole]?.['admin'] === true);
    if (!canManageUsers) {
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
                {([['staff', <UserCog size={16} />, 'Staff Users'], ['retailer', <Store size={16} />, 'Invite Retailer'], ['manufacturer', <Factory size={16} />, 'Invite Manufacturer'], ['trash', <Trash size={16} />, 'Recently Deleted']] as const).map(([id, icon, label]) => (
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
                                {customRoles.length > 0 && (
                                    <optgroup label="Custom Roles">
                                        {customRoles.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                                    </optgroup>
                                )}
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
                        <button onClick={closeEditUser} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}><X size={24} /></button>
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

                        {/* Reset Password — tenant-scoped, verified server-side */}
                        <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--surface-border)' }}>
                            <h3 style={{ fontSize: '1rem', margin: '0 0 0.35rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <KeyRound size={18} color="var(--primary-light)" /> {t('admin.reset_password')}
                            </h3>
                            <p style={{ margin: '0 0 1rem 0', color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>{t('admin.reset_password_hint')}</p>

                            {resetPasswordError && (
                                <div style={{ padding: '0.6rem 0.75rem', background: 'hsla(0, 84%, 60%, 0.1)', color: 'var(--danger)', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem' }}>
                                    {resetPasswordError}
                                </div>
                            )}

                            <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div className="input-group" style={{ marginBottom: 0 }}>
                                    <label>{t('admin.new_password')}</label>
                                    <div style={{ position: 'relative' }}>
                                        <Lock size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                                        <input required type="password" minLength={6} autoComplete="new-password" className="input-field" style={{ paddingLeft: '2.75rem' }} placeholder="••••••••" value={resetPassword} onChange={e => setResetPassword(e.target.value)} />
                                    </div>
                                </div>
                                <div className="input-group" style={{ marginBottom: 0 }}>
                                    <label>{t('admin.confirm_password')}</label>
                                    <div style={{ position: 'relative' }}>
                                        <Lock size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                                        <input required type="password" minLength={6} autoComplete="new-password" className="input-field" style={{ paddingLeft: '2.75rem' }} placeholder="••••••••" value={resetPasswordConfirm} onChange={e => setResetPasswordConfirm(e.target.value)} />
                                    </div>
                                </div>
                                <button type="submit" className="btn btn-secondary" disabled={resetPasswordLoading} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                    {resetPasswordLoading ? <Loader2 size={18} className="animate-spin" /> : <><KeyRound size={18} /> {t('admin.reset_password_button')}</>}
                                </button>
                            </form>
                        </div>
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
                            <div key={user.id} className={`animate-fade-in delay-${(i % 5)}00`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem', background: 'var(--surface-base)', border: '1px solid var(--surface-border)', borderRadius: '10px', animationFillMode: 'forwards' }}>
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
                                        {customRoles.length > 0 && (
                                            <optgroup label="Custom Roles">
                                                {customRoles.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                                            </optgroup>
                                        )}
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

            {activeSection === 'trash' && <RecentlyDeletedPage />}
        </div>
    );
}
