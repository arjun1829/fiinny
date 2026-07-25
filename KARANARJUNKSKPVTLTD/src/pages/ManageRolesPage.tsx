import { useState, useEffect } from 'react';
import { Save, ShieldCheck, Info } from 'lucide-react';
import { setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth, defaultPermissions } from '../contexts/AuthContext';
import type { AppScreen, UserRole, RolePermissions } from '../contexts/AuthContext';
import { getTenantDoc } from '../utils/tenantPath';
import { useToast } from '../contexts/ToastContext';

export default function ManageRolesPage() {
    const { tenantId, userRole, permissions: activePermissions } = useAuth();
    const { showToast } = useToast();

    // Local state for editing the matrix
    const [matrix, setMatrix] = useState<RolePermissions>(activePermissions || defaultPermissions);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (activePermissions) {
            setMatrix(activePermissions);
        }
    }, [activePermissions]);

    const roles: UserRole[] = ['admin', 'analyst', 'retailer', 'manufacturer', 'customer'];

        const screens: { key: AppScreen, label: string }[] = [
            { key: 'dashboard', label: 'B2B Dashboard' },
            { key: 'b2c_dashboard', label: 'B2C Dashboard' },
            { key: 'online_dashboard', label: 'Online Dashboard' },
            { key: 'analytics', label: 'Master Analytics' },
            { key: 'retailers', label: 'Retailers List' },
            { key: 'worklist', label: 'Worklist' },
            { key: 'khata', label: 'Khata (Udhari)' },
            { key: 'dispatch', label: 'Dispatch Board' },
            { key: 'pos', label: 'POS Billing' },
            { key: 'loyalty', label: 'Loyalty & Memberships' },
            { key: 'inventory', label: 'Inventory (Rates)' },
            { key: 'order_history', label: 'Order History' },
            { key: 'online_orders', label: 'Online Orders' },
            { key: 'manage_retailers', label: 'Manage Retailers' },
            { key: 'manufacturers', label: 'Manufacturers' },
            { key: 'invoice_templates', label: 'Invoice Templates' },
            { key: 'invoice_settings', label: 'Invoice Branding' },
            { key: 'schema_builder', label: 'UI Schema' },
            { key: 'manage_store', label: 'Manage Store' },
            { key: 'admin', label: 'Admin (Master)' },
            { key: 'settings', label: 'Settings' }
        ];

    const handleToggle = (role: UserRole, screen: AppScreen) => {
        // Prevent admin from disabling their own access to the admin screen, just to be safe
        if (role === 'admin' && screen === 'admin') {
            showToast("Cannot revoke Admin access to User Management.", 'error');
            return;
        }

        setMatrix(prev => ({
            ...prev,
            [role]: {
                ...prev[role],
                [screen]: !prev[role][screen]
            }
        }));
    };

    const handleSave = async () => {
        if (!tenantId) return;
        setSaving(true);
        try {
            const permDocRef = getTenantDoc(db, tenantId, 'settings', 'rolePermissions');
            await setDoc(permDocRef, {
                ...matrix,
                updatedAt: serverTimestamp()
            });
            showToast("Role permissions updated successfully. Changes will take effect immediately.", 'success');
        } catch (error) {
            console.error("Failed to save permissions", error);
            showToast("Failed to save permissions", 'error');
        } finally {
            setSaving(false);
        }
    };

    if (userRole !== 'admin') {
        return <div className="p-8 text-center text-red-500">Access Denied. Only Admins can modify role matrices.</div>;
    }

    return (
        <div className="animate-fade-in" style={{ maxWidth: '1000px', margin: '0 auto', padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1 className="primary-gradient-text" style={{ fontSize: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                        <ShieldCheck size={32} /> Role Matrix
                    </h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Configure granular screen access for each user role.</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="btn btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                    <Save size={18} /> {saving ? 'Saving...' : 'Save Configuration'}
                </button>
            </div>

            <div className="glass-panel" style={{ padding: '1rem', marginBottom: '2rem', display: 'flex', gap: '1rem', alignItems: 'flex-start', background: 'hsla(210, 100%, 50%, 0.05)', border: '1px solid hsla(210, 100%, 50%, 0.2)' }}>
                <Info size={24} style={{ color: 'var(--primary-light)', flexShrink: 0 }} />
                <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Modifying this matrix actively controls which navigation items and screens each role can access.
                    Changes are saved globally and will reflect instantly for active users across the application.
                </p>
            </div>

            <div className="glass-panel" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ background: 'var(--surface-raised)' }}>
                            <th style={{ padding: '1.25rem 1rem', fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '2px solid var(--surface-border)' }}>Screen / Module</th>
                            {roles.map(role => (
                                <th key={role} style={{ padding: '1.25rem 1rem', fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '2px solid var(--surface-border)', textAlign: 'center', textTransform: 'capitalize' }}>
                                    {role}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {screens.map((screen, index) => (
                            <tr key={screen.key} style={{ borderBottom: '1px solid var(--surface-border)', background: index % 2 === 0 ? 'transparent' : 'hsla(0,0%,100%,0.02)' }}>
                                <td style={{ padding: '1rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                                    {screen.label}
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.2rem', fontFamily: 'monospace' }}>{screen.key}</div>
                                </td>
                                {roles.map(role => (
                                    <td key={role} style={{ padding: '1rem', textAlign: 'center' }}>
                                        <label style={{ display: 'inline-flex', cursor: 'pointer', alignItems: 'center', justifyContent: 'center' }}>
                                            <input
                                                type="checkbox"
                                                checked={matrix[role]?.[screen.key] || false}
                                                onChange={() => handleToggle(role, screen.key)}
                                                style={{ width: '1.2rem', height: '1.2rem', cursor: 'pointer', accentColor: 'var(--primary-light)' }}
                                            />
                                        </label>
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
