import { useState, useEffect } from 'react';
import { Save, ChevronDown, ChevronRight, ShieldCheck, Info, Plus, Trash2, X, ArrowLeft } from 'lucide-react';
import { setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth, defaultPermissions } from '../contexts/AuthContext';
import type { UserRole, BuiltInRole } from '../contexts/AuthContext';
import {
    PERMISSION_MODULES,
    DEFAULT_FEATURE_PERMISSIONS,
    collectSectionActions,
    type FeaturePermissions,
    type FeaturePermissionMap,
    type PermissionSection,
} from '../utils/featurePermissions';
import { getTenantDoc } from '../utils/tenantPath';
import { useToast } from '../contexts/ToastContext';

// Admin is intentionally NOT editable here — it is a privileged system role that
// always has full access (see useFeaturePermissions). These are the built-in roles
// whose feature permissions can be configured, and which can seed custom roles.
const EDITABLE_ROLES: { key: BuiltInRole; label: string }[] = [
    { key: 'analyst',      label: 'Analyst' },
    { key: 'sales',        label: 'Sales' },
    { key: 'retailer',     label: 'Retailer' },
    { key: 'shopkeeper',   label: 'Shopkeeper' },
    { key: 'manufacturer', label: 'Manufacturer' },
    { key: 'customer',     label: 'Customer' },
];

// Ids that a tenant admin may never claim for a custom role.
const RESERVED_ROLE_IDS = new Set<string>([
    'admin', 'superadmin', 'super_admin', 'super-admin', 'owner',
    ...EDITABLE_ROLES.map(r => r.key),
]);

// Pages an admin can pick as a role's landing page after login. '' = automatic
// (use the built-in per-role default).
const LANDING_OPTIONS: { path: string; label: string }[] = [
    { path: '',                  label: 'Automatic (default)' },
    { path: '/dashboard',        label: 'B2B Dashboard' },
    { path: '/b2c-dashboard',    label: 'B2C Dashboard' },
    { path: '/reports',          label: 'Reports' },
    { path: '/analytics',        label: 'Analytics' },
    { path: '/worklist',         label: 'Worklist' },
    { path: '/pos',              label: 'POS Billing' },
    { path: '/inventory',        label: 'Inventory' },
    { path: '/team-performance', label: 'Team Performance' },
    { path: '/supplier-ledger',  label: 'Supplier Ledger' },
    { path: '/sales-targets',    label: 'Sales Targets' },
    { path: '/expenses',         label: 'Expenses' },
];

// ─── Recursive section renderer ───────────────────────────────────────────────

interface SectionProps {
    section: PermissionSection;
    roleMap: FeaturePermissionMap;
    expanded: Set<string>;
    onToggleExpand: (id: string) => void;
    onToggleAction: (permId: string) => void;
    onToggleSection: (sectionId: string, value: boolean) => void;
    depth?: number;
}

function SectionRow({ section, roleMap, expanded, onToggleExpand, onToggleAction, onToggleSection, depth = 0 }: SectionProps) {
    const isExpanded = expanded.has(section.id);
    const allActions = collectSectionActions(section);
    const totalActions = allActions.length;
    const enabledCount = allActions.filter(a => roleMap[a.id]).length;
    const allEnabled = enabledCount === totalActions && totalActions > 0;
    const someEnabled = enabledCount > 0 && !allEnabled;
    const indentPx = 20 + depth * 20;

    return (
        <>
            {/* Section header */}
            <div
                onClick={() => onToggleExpand(section.id)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: `0.65rem 1.25rem 0.65rem ${indentPx}px`,
                    cursor: 'pointer',
                    userSelect: 'none',
                    borderBottom: '1px solid var(--surface-border)',
                    background: depth > 0 ? 'hsla(0,0%,100%,0.02)' : 'transparent',
                }}
            >
                <span style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}>
                    {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                </span>
                <input
                    type="checkbox"
                    checked={allEnabled}
                    ref={el => { if (el) el.indeterminate = someEnabled; }}
                    onChange={e => { e.stopPropagation(); onToggleSection(section.id, e.target.checked); }}
                    onClick={e => e.stopPropagation()}
                    style={{ width: '1.05rem', height: '1.05rem', cursor: 'pointer', accentColor: 'var(--primary-light)', flexShrink: 0 }}
                />
                <span style={{ fontWeight: depth === 0 ? 600 : 500, fontSize: depth === 0 ? '0.9rem' : '0.85rem', flex: 1 }}>
                    {section.label}
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
                    {enabledCount}/{totalActions}
                </span>
            </div>

            {/* Expanded: own actions then child sections */}
            {isExpanded && (
                <>
                    {(section.actions ?? []).map(action => (
                        <label
                            key={action.id}
                            onClick={e => e.stopPropagation()}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.6rem',
                                cursor: 'pointer',
                                padding: `0.3rem 1.25rem 0.3rem ${indentPx + 36}px`,
                                borderBottom: '1px solid var(--surface-border)',
                                background: 'hsla(0,0%,100%,0.015)',
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={roleMap[action.id] ?? false}
                                onChange={() => onToggleAction(action.id)}
                                style={{ width: '1rem', height: '1rem', cursor: 'pointer', accentColor: 'var(--primary-light)' }}
                            />
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', flex: 1 }}>{action.label}</span>
                            <span style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: 'var(--text-tertiary)' }}>{action.id}</span>
                        </label>
                    ))}

                    {(section.children ?? []).map(child => (
                        <SectionRow
                            key={child.id}
                            section={child}
                            roleMap={roleMap}
                            expanded={expanded}
                            onToggleExpand={onToggleExpand}
                            onToggleAction={onToggleAction}
                            onToggleSection={onToggleSection}
                            depth={depth + 1}
                        />
                    ))}
                </>
            )}
        </>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SuperAdminPermissionsPage() {
    const { tenantId, userRole, featurePermissions, customRoles, permissions, roleLandingPages } = useAuth();
    const { showToast } = useToast();

    // null = show the lightweight role list. A role key = show that role's detail
    // view (its permission tree is only rendered/edited once the role is opened).
    const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
    const [matrix, setMatrix] = useState<FeaturePermissions>(featurePermissions || DEFAULT_FEATURE_PERMISSIONS);
    const [landingMap, setLandingMap] = useState<Record<string, string>>(roleLandingPages || {});
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
    const [saving, setSaving] = useState(false);

    // Create-role UI state
    const [showCreate, setShowCreate] = useState(false);
    const [newRoleName, setNewRoleName] = useState('');
    const [newRoleTemplate, setNewRoleTemplate] = useState<BuiltInRole>('analyst');
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        if (featurePermissions) setMatrix(featurePermissions);
    }, [featurePermissions]);

    useEffect(() => {
        setLandingMap(roleLandingPages || {});
    }, [roleLandingPages]);

    if (userRole !== 'admin') {
        return <div style={{ padding: '2rem', color: 'var(--danger)', textAlign: 'center' }}>Access Denied. Only Admins can manage feature permissions.</div>;
    }

    // Built-in editable roles + this tenant's custom roles.
    const roleTabs: { key: UserRole; label: string; custom?: boolean }[] = [
        ...EDITABLE_ROLES,
        ...customRoles.map(r => ({ key: r.id, label: r.label, custom: true })),
    ];

    const createCustomRole = async () => {
        if (!tenantId) return;
        const label = newRoleName.trim();
        if (!label) { showToast('Enter a role name.', 'error'); return; }
        const id = 'role_' + Date.now();
        // Guard: never allow a reserved id or a duplicate label/id (case-insensitive).
        const normalized = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        if (RESERVED_ROLE_IDS.has(normalized)) {
            showToast('That role name is reserved. Choose another.', 'error');
            return;
        }
        if (customRoles.some(r => r.label.toLowerCase() === label.toLowerCase())) {
            showToast('A role with that name already exists.', 'error');
            return;
        }
        setCreating(true);
        try {
            // Clone the template's feature + module permissions into the new role id.
            const templateFeatureMap = (matrix[newRoleTemplate] ?? DEFAULT_FEATURE_PERMISSIONS[newRoleTemplate] ?? {});
            const templateModuleMap = (permissions[newRoleTemplate] ?? defaultPermissions[newRoleTemplate] ?? {});

            const rolesDocRef = getTenantDoc(db, tenantId, 'settings', 'customRoles');
            const nextRoles = [...customRoles, { id, label, template: newRoleTemplate, createdAt: Date.now() }];
            await setDoc(rolesDocRef, { roles: nextRoles, updatedAt: serverTimestamp() }, { merge: true });

            await setDoc(getTenantDoc(db, tenantId, 'settings', 'featurePermissions'),
                { [id]: { ...templateFeatureMap } }, { merge: true });
            await setDoc(getTenantDoc(db, tenantId, 'settings', 'rolePermissions'),
                { [id]: { ...templateModuleMap } }, { merge: true });

            setNewRoleName('');
            setShowCreate(false);
            setSelectedRole(id);
            showToast(`Role "${label}" created. Configure its permissions below.`, 'success');
        } catch {
            showToast('Failed to create role.', 'error');
        } finally {
            setCreating(false);
        }
    };

    const deleteCustomRole = async (id: string, label: string) => {
        if (!tenantId) return;
        if (!window.confirm(`Delete the role "${label}"? Users still assigned to it will keep the name until you reassign them.`)) return;
        try {
            const rolesDocRef = getTenantDoc(db, tenantId, 'settings', 'customRoles');
            await setDoc(rolesDocRef, { roles: customRoles.filter(r => r.id !== id), updatedAt: serverTimestamp() }, { merge: true });
            if (selectedRole === id) setSelectedRole(null);
            showToast(`Role "${label}" deleted.`, 'success');
        } catch {
            showToast('Failed to delete role.', 'error');
        }
    };

    const roleMap: FeaturePermissionMap = selectedRole ? (matrix[selectedRole] ?? {}) : {};

    const toggleAction = (permId: string) => {
        if (!selectedRole) return;
        const role = selectedRole;
        setMatrix(prev => ({
            ...prev,
            [role]: { ...(prev[role] ?? {}), [permId]: !(prev[role]?.[permId] ?? false) },
        }));
    };

    const toggleSection = (sectionId: string, value: boolean) => {
        if (!selectedRole) return;
        const role = selectedRole;
        // Find the section anywhere in the tree and toggle all its actions.
        const allSections = PERMISSION_MODULES.flatMap(m => m.sections).flatMap(flattenSections);
        const target = allSections.find(s => s.id === sectionId);
        if (!target) return;
        const updates: FeaturePermissionMap = {};
        for (const action of collectSectionActions(target)) updates[action.id] = value;
        setMatrix(prev => ({
            ...prev,
            [role]: { ...(prev[role] ?? {}), ...updates },
        }));
    };

    const toggleExpand = (id: string) => {
        setExpandedSections(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const handleSave = async () => {
        if (!tenantId) return;
        setSaving(true);
        try {
            const ref = getTenantDoc(db, tenantId, 'settings', 'featurePermissions');
            await setDoc(ref, { ...matrix, updatedAt: serverTimestamp() });
            // Persist per-role landing pages alongside (separate doc).
            await setDoc(getTenantDoc(db, tenantId, 'settings', 'roleLandingPages'),
                { ...landingMap, updatedAt: serverTimestamp() }, { merge: true });
            showToast('Feature permissions saved. Changes apply immediately.', 'success');
        } catch {
            showToast('Failed to save feature permissions.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const selectedRoleLabel = roleTabs.find(r => r.key === selectedRole)?.label ?? selectedRole;

    // ── Role list view ────────────────────────────────────────────────────────
    // Opened first. Only lightweight role metadata is shown — a role's full
    // permission tree is not rendered until the admin opens that role.
    if (!selectedRole) {
        return (
            <div className="animate-fade-in" style={{ maxWidth: '860px', margin: '0 auto', padding: '1rem' }}>
                {/* Header */}
                <div style={{ marginBottom: '1.5rem' }}>
                    <h1 className="primary-gradient-text" style={{ fontSize: '1.75rem', display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.3rem' }}>
                        <ShieldCheck size={28} /> Feature Permissions
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
                        Granular action-level access control per role. Select a role to view and edit its
                        permissions. Create custom roles for your business here. Module-level access is
                        managed in Role Matrix.
                    </p>
                </div>

                {/* Info banner */}
                <div className="glass-panel" style={{ padding: '0.75rem 1rem', marginBottom: '1.5rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start', background: 'hsla(210,100%,50%,0.05)', border: '1px solid hsla(210,100%,50%,0.2)' }}>
                    <Info size={18} style={{ color: 'var(--primary-light)', flexShrink: 0, marginTop: '2px' }} />
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        Changes here control which tabs, buttons, and actions each role can see and use.
                        The <strong>Admin</strong> role always has full access regardless of these settings.
                    </p>
                </div>

                {/* Role list */}
                <div className="glass-panel" style={{ marginBottom: '1.5rem', overflow: 'hidden' }}>
                    {roleTabs.map(r => (
                        <div
                            key={r.key}
                            onClick={() => setSelectedRole(r.key)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem',
                                padding: '0.9rem 1.25rem',
                                cursor: 'pointer',
                                userSelect: 'none',
                                borderBottom: '1px solid var(--surface-border)',
                            }}
                        >
                            <span style={{ fontWeight: 600, fontSize: '0.95rem', flex: 1 }}>{r.label}</span>
                            {r.custom && (
                                <>
                                    <span style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', border: '1px solid var(--surface-border)', borderRadius: '999px', padding: '0.1rem 0.5rem' }}>
                                        Custom
                                    </span>
                                    <Trash2
                                        size={15}
                                        onClick={(e) => { e.stopPropagation(); deleteCustomRole(r.key, r.label); }}
                                        style={{ opacity: 0.7, cursor: 'pointer', color: 'var(--text-tertiary)' }}
                                        role="button"
                                        aria-label={`Delete role ${r.label}`}
                                    />
                                </>
                            )}
                            <ChevronRight size={18} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                        </div>
                    ))}
                </div>

                {/* New role */}
                <button
                    onClick={() => setShowCreate(v => !v)}
                    className="btn btn-secondary"
                    style={{ fontSize: '0.85rem', padding: '0.4rem 0.9rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1.5rem' }}
                >
                    {showCreate ? <X size={15} /> : <Plus size={15} />} {showCreate ? 'Cancel' : 'New Role'}
                </button>

                {/* Create custom role */}
                {showCreate && (
                    <div className="glass-panel" style={{ padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <div className="input-group" style={{ marginBottom: 0, flex: '1 1 220px' }}>
                            <label style={{ fontSize: '0.8rem' }}>Role name</label>
                            <input
                                type="text"
                                className="input-field"
                                placeholder="e.g. Store Manager"
                                value={newRoleName}
                                onChange={e => setNewRoleName(e.target.value)}
                                maxLength={40}
                            />
                        </div>
                        <div className="input-group" style={{ marginBottom: 0, flex: '0 1 200px' }}>
                            <label style={{ fontSize: '0.8rem' }}>Copy permissions from</label>
                            <select className="input-field" value={newRoleTemplate} onChange={e => setNewRoleTemplate(e.target.value as BuiltInRole)}>
                                {EDITABLE_ROLES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                            </select>
                        </div>
                        <button onClick={createCustomRole} disabled={creating} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <Plus size={16} /> {creating ? 'Creating…' : 'Create Role'}
                        </button>
                    </div>
                )}
            </div>
        );
    }

    // Save enables only when the matrix or landing pages differ from what is
    // stored (featurePermissions / roleLandingPages come from Firestore via
    // AuthContext, so after a save they match again and Save re-disables).
    const dirty =
        JSON.stringify(matrix) !== JSON.stringify(featurePermissions) ||
        JSON.stringify(landingMap) !== JSON.stringify(roleLandingPages);

    // ── Role detail view ──────────────────────────────────────────────────────
    // Opened on demand when a role is selected. Renders that role's full
    // permission tree; edits stay in local state until Save is pressed.
    return (
        <div className="animate-fade-in" style={{ maxWidth: '860px', margin: '0 auto', padding: '1rem' }}>
            {/* Back to roles */}
            <button
                onClick={() => setSelectedRole(null)}
                className="btn btn-secondary"
                style={{ fontSize: '0.85rem', padding: '0.35rem 0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1rem' }}
            >
                <ArrowLeft size={15} /> Back to Roles
            </button>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 className="primary-gradient-text" style={{ fontSize: '1.75rem', display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.3rem' }}>
                        <ShieldCheck size={28} /> {selectedRoleLabel}
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
                        Configure which tabs, buttons, and actions this role can see and use.
                        Changes apply after you press Save.
                    </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {dirty && !saving && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--secondary-dark)' }}>Unsaved changes</span>
                    )}
                    <button onClick={handleSave} disabled={saving || !dirty} className="btn btn-primary"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: (saving || !dirty) ? 0.55 : 1, cursor: (saving || !dirty) ? 'not-allowed' : 'pointer' }}>
                        <Save size={16} /> {saving ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </div>

            {/* Landing page after login — per selected role */}
            <div className="glass-panel" style={{ padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.15rem' }}>Landing page after login</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                        Where a <strong>{selectedRoleLabel}</strong> user lands after signing in. Saved with the button above.
                    </div>
                </div>
                <select
                    className="input-field"
                    style={{ flex: '0 1 240px' }}
                    value={landingMap[selectedRole] ?? ''}
                    onChange={e => setLandingMap(prev => ({ ...prev, [selectedRole]: e.target.value }))}
                >
                    {LANDING_OPTIONS.map(o => <option key={o.path || 'auto'} value={o.path}>{o.label}</option>)}
                </select>
            </div>

            {/* Permission tree */}
            {PERMISSION_MODULES.map(mod => (
                <div key={mod.id} className="glass-panel" style={{ marginBottom: '1rem', overflow: 'hidden' }}>
                    <div style={{ padding: '0.85rem 1.25rem', fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', background: 'var(--surface-raised)', borderBottom: '1px solid var(--surface-border)' }}>
                        {mod.label}
                    </div>
                    {mod.sections.length === 0 ? (
                        <div style={{ padding: '0.85rem 1.25rem', fontSize: '0.82rem', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                            Sub-tabs coming soon.
                        </div>
                    ) : mod.sections.map(section => (
                        <SectionRow
                            key={section.id}
                            section={section}
                            roleMap={roleMap}
                            expanded={expandedSections}
                            onToggleExpand={toggleExpand}
                            onToggleAction={toggleAction}
                            onToggleSection={toggleSection}
                        />
                    ))}
                </div>
            ))}
        </div>
    );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function flattenSections(section: PermissionSection): PermissionSection[] {
    return [section, ...(section.children ?? []).flatMap(flattenSections)];
}
