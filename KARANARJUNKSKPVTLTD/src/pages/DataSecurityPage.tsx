import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query, where, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection } from '../utils/tenantPath';
import { useToast } from '../contexts/ToastContext';
import {
    Lock, MapPin, Search, Users, ShieldAlert, Loader2,
    ArrowLeft, CheckCircle2, XCircle,
} from 'lucide-react';

interface SalesUser {
    id: string;
    name: string;
    email: string;
    role: string;
    assignedDistricts: string[];
}

export default function DataSecurityPage() {
    const { tenantId, userRole } = useAuth();
    const { showToast } = useToast();

    const [salesUsers, setSalesUsers] = useState<SalesUser[]>([]);
    const [allDistricts, setAllDistricts] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    const [editingUser, setEditingUser] = useState<SalesUser | null>(null);
    const [selectedDistricts, setSelectedDistricts] = useState<Set<string>>(new Set());
    const [districtSearch, setDistrictSearch] = useState('');
    const [saving, setSaving] = useState(false);

    // ── Data loading ──────────────────────────────────────────────────────────
    useEffect(() => {
        if (!tenantId) return;
        const load = async () => {
            try {
                const usersSnap = tenantId === 'master'
                    ? await getDocs(collection(db, 'users'))
                    : await getDocs(query(collection(db, 'users'), where('tenantId', '==', tenantId)));

                setSalesUsers(
                    usersSnap.docs
                        .map(d => ({ id: d.id, ...d.data() } as SalesUser))
                        .filter(u => u.role === 'sales')
                );

                // Normalize + deduplicate district names from retailers
                const retailersSnap = await getDocs(getTenantCollection(db, tenantId, 'retailers'));

                const normalize = (raw: string): string =>
                    raw
                        .trim()
                        .replace(/\s+\d[\d\s]*$/, '') // strip trailing postal codes
                        .replace(/\s+/g, ' ')
                        .trim()
                        .replace(/\b\w/g, c => c.toUpperCase()); // Title Case

                const seenLower = new Set<string>();
                const districts = retailersSnap.docs
                    .map(d => normalize((d.data().district as string | undefined) || ''))
                    .filter(d => {
                        if (!d) return false;
                        const key = d.toLowerCase();
                        if (seenLower.has(key)) return false;
                        seenLower.add(key);
                        return true;
                    })
                    .sort((a, b) => a.localeCompare(b));

                setAllDistricts(districts);
            } catch (e) {
                console.error('DataSecurity fetch error:', e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [tenantId]);

    // ── Handlers ──────────────────────────────────────────────────────────────
    const openEdit = (user: SalesUser) => {
        setEditingUser(user);
        setSelectedDistricts(new Set(user.assignedDistricts || []));
        setDistrictSearch('');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const cancelEdit = () => {
        setEditingUser(null);
        setDistrictSearch('');
    };

    const toggleDistrict = (d: string) => {
        setSelectedDistricts(prev => {
            const next = new Set(prev);
            if (next.has(d)) next.delete(d); else next.add(d);
            return next;
        });
    };

    const handleSave = async () => {
        if (!editingUser) return;
        setSaving(true);
        try {
            const districts = Array.from(selectedDistricts);
            await updateDoc(doc(db, 'users', editingUser.id), { assignedDistricts: districts });
            setSalesUsers(prev =>
                prev.map(u => u.id === editingUser.id ? { ...u, assignedDistricts: districts } : u)
            );
            showToast(`Access updated for ${editingUser.name}`, 'success');
            setEditingUser(null);
        } catch {
            showToast('Failed to save. Please try again.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const filteredDistricts = useMemo(
        () => allDistricts.filter(d => d.toLowerCase().includes(districtSearch.toLowerCase())),
        [allDistricts, districtSearch]
    );

    // ── Access guard ──────────────────────────────────────────────────────────
    if (userRole !== 'admin') {
        return (
            <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--danger)' }}>
                <ShieldAlert size={48} style={{ margin: '0 auto 1rem auto', display: 'block' }} />
                <h2>Access Denied</h2>
                <p>Only administrators can manage data security settings.</p>
            </div>
        );
    }

    const configured = salesUsers.filter(u => (u.assignedDistricts || []).length > 0).length;

    const th: React.CSSProperties = {
        padding: '0.75rem 1rem',
        textAlign: 'left',
        fontSize: '0.68rem',
        fontWeight: 700,
        color: 'var(--text-tertiary)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        whiteSpace: 'nowrap',
        background: 'var(--surface-raised)',
        borderBottom: '2px solid var(--surface-border)',
    };

    const td: React.CSSProperties = {
        padding: '0.9rem 1rem',
        verticalAlign: 'middle',
        fontSize: '0.88rem',
    };

    return (
        <div className="animate-fade-in" style={{ maxWidth: '1100px', margin: '0 auto' }}>

            {/* ── Page header ── */}
            <div style={{ marginBottom: '2rem' }}>
                <h1 className="primary-gradient-text" style={{ fontSize: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
                    <Lock size={28} /> Data Security — User Groups
                </h1>
                <p style={{ color: 'var(--text-secondary)' }}>
                    Configure district-level data access for sales users. A sales user only sees retailers and orders from their assigned districts.
                </p>
            </div>

            {/* ── KPI strip (always visible) ── */}
            {!loading && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                    {[
                        { label: 'Sales Users',   value: salesUsers.length,              color: '#6366f1' },
                        { label: 'Configured',    value: configured,                     color: '#10b981' },
                        { label: 'No Access Set', value: salesUsers.length - configured, color: '#ef4444' },
                        { label: 'Total Districts', value: allDistricts.length,          color: '#f59e0b' },
                    ].map(s => (
                        <div key={s.label} style={{ background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderLeft: `4px solid ${s.color}`, borderRadius: '12px', padding: '1rem 1.25rem' }}>
                            <p style={{ fontSize: '0.67rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 0.2rem' }}>{s.label}</p>
                            <h2 style={{ margin: 0, fontSize: '1.7rem', fontWeight: 800, color: s.color }}>{s.value}</h2>
                        </div>
                    ))}
                </div>
            )}

            {/* ════════════════════════════════════════════════════════════════
                VIEW 1 — User table (shown when not editing)
            ════════════════════════════════════════════════════════════════ */}
            {!editingUser && (
                loading ? (
                    <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
                        <Loader2 className="animate-spin" size={32} style={{ margin: '0 auto', display: 'block' }} />
                    </div>
                ) : salesUsers.length === 0 ? (
                    <div className="glass-panel" style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-secondary)' }}>
                        <Users size={48} color="var(--surface-border)" style={{ margin: '0 auto 1rem', display: 'block' }} />
                        <h3>No Sales Users Found</h3>
                        <p style={{ fontSize: '0.9rem' }}>
                            Go to <strong>Manage Users</strong> and create users with the <strong>Sales</strong> role,
                            then come back here to assign district access.
                        </p>
                    </div>
                ) : (
                    <div className="glass-panel" style={{ overflow: 'hidden', padding: 0 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    {['Name', 'Email', 'Assigned Districts', 'Status', 'Action'].map(h => (
                                        <th key={h} style={th}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {salesUsers.map((user, idx) => {
                                    const districts = user.assignedDistricts || [];
                                    const isConfigured = districts.length > 0;
                                    const rowBg = idx % 2 === 0 ? 'transparent' : 'hsla(0,0%,100%,0.018)';
                                    return (
                                        <tr
                                            key={user.id}
                                            style={{ background: rowBg, transition: 'background 0.12s' }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
                                            onMouseLeave={e => e.currentTarget.style.background = rowBg}
                                        >
                                            <td style={{ ...td, fontWeight: 600 }}>{user.name || '—'}</td>
                                            <td style={{ ...td, color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{user.email}</td>
                                            <td style={td}>
                                                {districts.length === 0 ? (
                                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>None assigned</span>
                                                ) : (
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                                                        {districts.slice(0, 4).map(d => (
                                                            <span key={d} style={{ fontSize: '0.71rem', padding: '0.18rem 0.55rem', borderRadius: '10px', background: 'hsla(152,60%,40%,0.1)', color: 'var(--primary-light)', fontWeight: 600, border: '1px solid hsla(152,60%,40%,0.25)' }}>{d}</span>
                                                        ))}
                                                        {districts.length > 4 && (
                                                            <span style={{ fontSize: '0.71rem', padding: '0.18rem 0.55rem', borderRadius: '10px', background: 'var(--surface-raised)', color: 'var(--text-secondary)', border: '1px solid var(--surface-border)' }}>+{districts.length - 4} more</span>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                            <td style={td}>
                                                <span style={{
                                                    fontSize: '0.72rem', fontWeight: 700,
                                                    padding: '0.2rem 0.6rem', borderRadius: '8px',
                                                    background: isConfigured ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                                                    color: isConfigured ? '#10b981' : '#ef4444',
                                                    border: `1px solid ${isConfigured ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                                                    whiteSpace: 'nowrap',
                                                }}>
                                                    {isConfigured ? `${districts.length} district${districts.length !== 1 ? 's' : ''}` : 'No Access'}
                                                </span>
                                            </td>
                                            <td style={td}>
                                                <button
                                                    onClick={() => openEdit(user)}
                                                    className="btn btn-secondary"
                                                    style={{ fontSize: '0.8rem', padding: '0.35rem 0.9rem' }}
                                                >
                                                    Configure
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )
            )}

            {/* ════════════════════════════════════════════════════════════════
                VIEW 2 — Inline district chip editor (replaces table)
            ════════════════════════════════════════════════════════════════ */}
            {editingUser && (
                <div className="animate-fade-in">

                    {/* ── Breadcrumb / back bar ── */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem', padding: '1rem 1.25rem', background: 'var(--surface-raised)', borderRadius: '12px', border: '1px solid var(--surface-border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <button
                                onClick={cancelEdit}
                                disabled={saving}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontFamily: 'inherit', fontSize: '0.85rem', padding: '0.3rem 0.5rem', borderRadius: '6px' }}
                            >
                                <ArrowLeft size={16} /> Back to Users
                            </button>
                            <span style={{ color: 'var(--surface-border)' }}>|</span>
                            <div>
                                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{editingUser.name}</span>
                                <span style={{ color: 'var(--text-tertiary)', fontSize: '0.82rem', marginLeft: '0.5rem' }}>{editingUser.email}</span>
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{
                                fontSize: '0.82rem', fontWeight: 600,
                                color: selectedDistricts.size === 0 ? '#ef4444' : '#10b981',
                                display: 'flex', alignItems: 'center', gap: '0.3rem',
                            }}>
                                {selectedDistricts.size === 0
                                    ? <><XCircle size={14} /> No access — select at least one district</>
                                    : <><CheckCircle2 size={14} /> {selectedDistricts.size} district{selectedDistricts.size !== 1 ? 's' : ''} selected</>
                                }
                            </span>
                        </div>
                    </div>

                    {/* ── Controls row: search + select-all / clear ── */}
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1.25rem' }}>
                        {/* Search */}
                        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: '180px' }}>
                            <Search size={15} style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                            <input
                                type="text"
                                placeholder="Search districts…"
                                className="input-field"
                                style={{ paddingLeft: '2.3rem', margin: 0, height: '38px', fontSize: '0.88rem' }}
                                value={districtSearch}
                                onChange={e => setDistrictSearch(e.target.value)}
                                autoFocus
                            />
                        </div>

                        {/* Quick-action buttons */}
                        <button
                            onClick={() => setSelectedDistricts(new Set(filteredDistricts))}
                            style={{ fontSize: '0.8rem', padding: '0.45rem 1rem', borderRadius: '8px', border: '1px solid var(--surface-border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                        >
                            {districtSearch ? 'Select Filtered' : 'Select All'}
                        </button>
                        <button
                            onClick={() => setSelectedDistricts(new Set())}
                            style={{ fontSize: '0.8rem', padding: '0.45rem 1rem', borderRadius: '8px', border: '1px solid var(--surface-border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                        >
                            Clear All
                        </button>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                            {filteredDistricts.length} of {allDistricts.length} shown
                        </span>
                    </div>

                    {/* ── Chip grid ── */}
                    {filteredDistricts.length === 0 ? (
                        <div className="glass-panel" style={{ textAlign: 'center', padding: '3rem 2rem', color: 'var(--text-secondary)' }}>
                            <MapPin size={36} color="var(--surface-border)" style={{ margin: '0 auto 0.75rem', display: 'block' }} />
                            <p style={{ margin: 0, fontSize: '0.9rem' }}>
                                {allDistricts.length === 0
                                    ? 'No districts found. Add retailers with district information first.'
                                    : 'No districts match your search.'}
                            </p>
                        </div>
                    ) : (
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                            gap: '0.65rem',
                            marginBottom: '2rem',
                        }}>
                            {filteredDistricts.map(d => {
                                const selected = selectedDistricts.has(d);
                                return (
                                    <button
                                        key={d}
                                        onClick={() => toggleDistrict(d)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.45rem',
                                            padding: '0.7rem 0.9rem',
                                            borderRadius: '10px',
                                            border: `2px solid ${selected ? '#10b981' : 'var(--surface-border)'}`,
                                            background: selected
                                                ? 'rgba(16, 185, 129, 0.1)'
                                                : 'var(--surface-raised)',
                                            color: selected ? '#10b981' : 'var(--text-secondary)',
                                            fontWeight: selected ? 700 : 400,
                                            fontSize: '0.88rem',
                                            cursor: 'pointer',
                                            fontFamily: 'inherit',
                                            textAlign: 'left',
                                            transition: 'border-color 0.15s, background 0.15s, color 0.15s',
                                            boxShadow: selected ? '0 0 0 3px rgba(16,185,129,0.12)' : 'none',
                                        }}
                                        onMouseEnter={e => {
                                            if (!selected) {
                                                e.currentTarget.style.borderColor = 'var(--primary-light)';
                                                e.currentTarget.style.color = 'var(--text-primary)';
                                            }
                                        }}
                                        onMouseLeave={e => {
                                            if (!selected) {
                                                e.currentTarget.style.borderColor = 'var(--surface-border)';
                                                e.currentTarget.style.color = 'var(--text-secondary)';
                                            }
                                        }}
                                    >
                                        {selected
                                            ? <CheckCircle2 size={15} style={{ flexShrink: 0 }} />
                                            : <MapPin size={14} style={{ flexShrink: 0, opacity: 0.5 }} />
                                        }
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {d}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* ── Save / Cancel ── */}
                    <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', paddingTop: '1rem', borderTop: '1px solid var(--surface-border)', flexWrap: 'wrap' }}>
                        {selectedDistricts.size === 0 && (
                            <span style={{ alignSelf: 'center', fontSize: '0.8rem', color: '#ef4444', fontWeight: 600, marginRight: 'auto' }}>
                                ⚠ Saving with no districts will remove all access for this user.
                            </span>
                        )}
                        <button
                            onClick={cancelEdit}
                            disabled={saving}
                            className="btn btn-secondary"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="btn btn-primary"
                            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: '140px', justifyContent: 'center' }}
                        >
                            {saving
                                ? <Loader2 size={15} className="animate-spin" />
                                : <><CheckCircle2 size={15} /> Save {selectedDistricts.size} District{selectedDistricts.size !== 1 ? 's' : ''}</>
                            }
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
