import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query, where, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection } from '../utils/tenantPath';
import { useToast } from '../contexts/ToastContext';
import {
    Lock, MapPin, Search, Users, ShieldAlert, Loader2,
    ArrowLeft, CheckCircle2, XCircle, Store,
} from 'lucide-react';

interface SalesUser {
    id: string;
    name: string;
    email: string;
    role: string;
    assignedDistricts: string[];
    assignedRetailers: string[];
}

interface RetailerEntry {
    id: string;
    name: string;
    district?: string;
}

export default function DataSecurityPage() {
    const { tenantId, userRole } = useAuth();
    const { showToast } = useToast();

    const [salesUsers, setSalesUsers] = useState<SalesUser[]>([]);
    const [allDistricts, setAllDistricts] = useState<string[]>([]);
    const [allRetailers, setAllRetailers] = useState<RetailerEntry[]>([]);
    const [loading, setLoading] = useState(true);

    const [editingUser, setEditingUser] = useState<SalesUser | null>(null);
    const [selectedDistricts, setSelectedDistricts] = useState<Set<string>>(new Set());
    const [selectedRetailers, setSelectedRetailers] = useState<Set<string>>(new Set());
    const [districtSearch, setDistrictSearch] = useState('');
    const [retailerSearch, setRetailerSearch] = useState('');
    const [saving, setSaving] = useState(false);

    // ── Data loading ──────────────────────────────────────────────────────────
    useEffect(() => {
        if (!tenantId) return;
        const load = async () => {
            try {
                const [usersSnap, retailersSnap] = await Promise.all([
                    getDocs(query(collection(db, 'users'), where('tenantId', '==', tenantId))),
                    getDocs(getTenantCollection(db, tenantId, 'retailers')),
                ]);

                setSalesUsers(
                    usersSnap.docs
                        .map(d => ({
                            id: d.id,
                            ...d.data(),
                            assignedDistricts: d.data().assignedDistricts || [],
                            assignedRetailers: d.data().assignedRetailers || [],
                        } as SalesUser))
                        .filter(u => u.role === 'sales')
                );

                const normalize = (raw: string): string =>
                    raw.trim().replace(/\s+\d[\d\s]*$/, '').replace(/\s+/g, ' ').trim()
                        .replace(/\b\w/g, c => c.toUpperCase());

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

                const retailers: RetailerEntry[] = retailersSnap.docs
                    .filter(d => (d.data() as { channel?: string }).channel !== 'pos')
                    .map(d => ({
                        id: d.id,
                        name: (d.data().name as string | undefined) || '—',
                        district: (d.data().district as string | undefined) || '',
                    }))
                    .sort((a, b) => a.name.localeCompare(b.name));

                setAllDistricts(districts);
                setAllRetailers(retailers);
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
        setSelectedRetailers(new Set(user.assignedRetailers || []));
        setDistrictSearch('');
        setRetailerSearch('');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const cancelEdit = () => {
        setEditingUser(null);
        setDistrictSearch('');
        setRetailerSearch('');
    };

    const toggleDistrict = (d: string) =>
        setSelectedDistricts(prev => { const n = new Set(prev); n.has(d) ? n.delete(d) : n.add(d); return n; });

    const toggleRetailer = (id: string) =>
        setSelectedRetailers(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

    const handleSave = async () => {
        if (!editingUser) return;
        setSaving(true);
        try {
            const districts = Array.from(selectedDistricts);
            const retailers = Array.from(selectedRetailers);
            await updateDoc(doc(db, 'users', editingUser.id), {
                assignedDistricts: districts,
                assignedRetailers: retailers,
            });
            setSalesUsers(prev =>
                prev.map(u => u.id === editingUser.id
                    ? { ...u, assignedDistricts: districts, assignedRetailers: retailers }
                    : u)
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

    const filteredRetailers = useMemo(
        () => allRetailers.filter(r =>
            r.name.toLowerCase().includes(retailerSearch.toLowerCase()) ||
            (r.district || '').toLowerCase().includes(retailerSearch.toLowerCase())
        ),
        [allRetailers, retailerSearch]
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

    const configured = salesUsers.filter(u =>
        (u.assignedDistricts || []).length > 0 || (u.assignedRetailers || []).length > 0
    ).length;

    const totalSelected = selectedDistricts.size + selectedRetailers.size;

    const th: React.CSSProperties = {
        padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.68rem', fontWeight: 700,
        color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em',
        whiteSpace: 'nowrap', background: 'var(--surface-raised)', borderBottom: '2px solid var(--surface-border)',
    };
    const td: React.CSSProperties = { padding: '0.9rem 1rem', verticalAlign: 'middle', fontSize: '0.88rem' };

    return (
        <div className="animate-fade-in" style={{ maxWidth: '1100px', margin: '0 auto' }}>

            {/* ── Page header ── */}
            <div style={{ marginBottom: '2rem' }}>
                <h1 className="primary-gradient-text" style={{ fontSize: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
                    <Lock size={28} /> Data Security — User Groups
                </h1>
                <p style={{ color: 'var(--text-secondary)' }}>
                    Configure data access for sales users — by district, by specific retailers, or both.
                </p>
            </div>

            {/* ── KPI strip ── */}
            {!loading && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                    {[
                        { label: 'Sales Users',    value: salesUsers.length,              color: '#6366f1' },
                        { label: 'Configured',     value: configured,                     color: '#10b981' },
                        { label: 'No Access Set',  value: salesUsers.length - configured, color: '#ef4444' },
                        { label: 'Districts',      value: allDistricts.length,            color: '#f59e0b' },
                        { label: 'Total Retailers',value: allRetailers.length,            color: '#38bdf8' },
                    ].map(s => (
                        <div key={s.label} style={{ background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderLeft: `4px solid ${s.color}`, borderRadius: '12px', padding: '1rem 1.25rem' }}>
                            <p style={{ fontSize: '0.67rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 0.2rem' }}>{s.label}</p>
                            <h2 style={{ margin: 0, fontSize: '1.7rem', fontWeight: 800, color: s.color }}>{s.value}</h2>
                        </div>
                    ))}
                </div>
            )}

            {/* ════════════════ VIEW 1 — User table ════════════════ */}
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
                            then come back here to assign access.
                        </p>
                    </div>
                ) : (
                    <div className="glass-panel" style={{ overflow: 'hidden', padding: 0 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    {['Name', 'Email', 'Districts', 'Retailers', 'Status', 'Action'].map(h => (
                                        <th key={h} style={th}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {salesUsers.map((user, idx) => {
                                    const districts = user.assignedDistricts || [];
                                    const retailers = user.assignedRetailers || [];
                                    const isConfigured = districts.length > 0 || retailers.length > 0;
                                    const rowBg = idx % 2 === 0 ? 'transparent' : 'hsla(0,0%,100%,0.018)';
                                    return (
                                        <tr key={user.id} style={{ background: rowBg, transition: 'background 0.12s' }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
                                            onMouseLeave={e => e.currentTarget.style.background = rowBg}>
                                            <td style={{ ...td, fontWeight: 600 }}>{user.name || '—'}</td>
                                            <td style={{ ...td, color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{user.email}</td>
                                            <td style={td}>
                                                {districts.length === 0 ? (
                                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>None</span>
                                                ) : (
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                                                        {districts.slice(0, 3).map(d => (
                                                            <span key={d} style={{ fontSize: '0.71rem', padding: '0.18rem 0.55rem', borderRadius: '10px', background: 'hsla(152,60%,40%,0.1)', color: 'var(--primary-light)', fontWeight: 600, border: '1px solid hsla(152,60%,40%,0.25)' }}>{d}</span>
                                                        ))}
                                                        {districts.length > 3 && <span style={{ fontSize: '0.71rem', padding: '0.18rem 0.55rem', borderRadius: '10px', background: 'var(--surface-raised)', color: 'var(--text-secondary)', border: '1px solid var(--surface-border)' }}>+{districts.length - 3}</span>}
                                                    </div>
                                                )}
                                            </td>
                                            <td style={td}>
                                                {retailers.length === 0 ? (
                                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>None</span>
                                                ) : (
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                                                        {retailers.slice(0, 2).map(rId => {
                                                            const r = allRetailers.find(x => x.id === rId);
                                                            return r ? (
                                                                <span key={rId} style={{ fontSize: '0.71rem', padding: '0.18rem 0.55rem', borderRadius: '10px', background: 'hsla(56,91%,60%,0.1)', color: '#d97706', fontWeight: 600, border: '1px solid hsla(56,91%,60%,0.25)' }}>{r.name}</span>
                                                            ) : null;
                                                        })}
                                                        {retailers.length > 2 && <span style={{ fontSize: '0.71rem', padding: '0.18rem 0.55rem', borderRadius: '10px', background: 'var(--surface-raised)', color: 'var(--text-secondary)', border: '1px solid var(--surface-border)' }}>+{retailers.length - 2}</span>}
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
                                                    {isConfigured
                                                        ? [districts.length > 0 && `${districts.length}d`, retailers.length > 0 && `${retailers.length}r`].filter(Boolean).join(' + ')
                                                        : 'No Access'}
                                                </span>
                                            </td>
                                            <td style={td}>
                                                <button onClick={() => openEdit(user)} className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.35rem 0.9rem' }}>
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

            {/* ════════════════ VIEW 2 — Edit access ════════════════ */}
            {editingUser && (
                <div className="animate-fade-in">

                    {/* Breadcrumb / back bar */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem', padding: '1rem 1.25rem', background: 'var(--surface-raised)', borderRadius: '12px', border: '1px solid var(--surface-border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <button onClick={cancelEdit} disabled={saving}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontFamily: 'inherit', fontSize: '0.85rem', padding: '0.3rem 0.5rem', borderRadius: '6px' }}>
                                <ArrowLeft size={16} /> Back to Users
                            </button>
                            <span style={{ color: 'var(--surface-border)' }}>|</span>
                            <div>
                                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{editingUser.name}</span>
                                <span style={{ color: 'var(--text-tertiary)', fontSize: '0.82rem', marginLeft: '0.5rem' }}>{editingUser.email}</span>
                            </div>
                        </div>
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: totalSelected === 0 ? '#ef4444' : '#10b981', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            {totalSelected === 0
                                ? <><XCircle size={14} /> No access — select at least one district or retailer</>
                                : <><CheckCircle2 size={14} /> {[selectedDistricts.size > 0 && `${selectedDistricts.size} district${selectedDistricts.size !== 1 ? 's' : ''}`, selectedRetailers.size > 0 && `${selectedRetailers.size} retailer${selectedRetailers.size !== 1 ? 's' : ''}`].filter(Boolean).join(' + ')} selected</>
                            }
                        </span>
                    </div>

                    {/* ── Section 1: Assigned Districts ── */}
                    <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.1rem' }}>
                            <MapPin size={18} color="var(--primary-light)" />
                            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>Assigned Districts</h3>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
                                {selectedDistricts.size} of {allDistricts.length} selected
                            </span>
                        </div>

                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
                            <div style={{ position: 'relative', flex: '1 1 200px', minWidth: '160px' }}>
                                <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                                <input type="text" placeholder="Search districts…" className="input-field"
                                    style={{ paddingLeft: '2.1rem', margin: 0, height: '36px', fontSize: '0.85rem' }}
                                    value={districtSearch} onChange={e => setDistrictSearch(e.target.value)} autoFocus />
                            </div>
                            <button onClick={() => setSelectedDistricts(new Set(filteredDistricts))}
                                style={{ fontSize: '0.78rem', padding: '0.38rem 0.9rem', borderRadius: '8px', border: '1px solid var(--surface-border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                                {districtSearch ? 'Select Filtered' : 'Select All'}
                            </button>
                            <button onClick={() => setSelectedDistricts(new Set())}
                                style={{ fontSize: '0.78rem', padding: '0.38rem 0.9rem', borderRadius: '8px', border: '1px solid var(--surface-border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}>
                                Clear
                            </button>
                        </div>

                        {filteredDistricts.length === 0 ? (
                            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem', margin: 0 }}>
                                {allDistricts.length === 0 ? 'No districts found — add retailers with district info first.' : 'No districts match.'}
                            </p>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.55rem' }}>
                                {filteredDistricts.map(d => {
                                    const sel = selectedDistricts.has(d);
                                    return (
                                        <button key={d} onClick={() => toggleDistrict(d)}
                                            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 0.85rem', borderRadius: '10px', border: `2px solid ${sel ? '#10b981' : 'var(--surface-border)'}`, background: sel ? 'rgba(16,185,129,0.1)' : 'var(--surface-raised)', color: sel ? '#10b981' : 'var(--text-secondary)', fontWeight: sel ? 700 : 400, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', transition: 'border-color 0.15s, background 0.15s', boxShadow: sel ? '0 0 0 3px rgba(16,185,129,0.12)' : 'none' }}
                                            onMouseEnter={e => { if (!sel) { e.currentTarget.style.borderColor = 'var(--primary-light)'; e.currentTarget.style.color = 'var(--text-primary)'; } }}
                                            onMouseLeave={e => { if (!sel) { e.currentTarget.style.borderColor = 'var(--surface-border)'; e.currentTarget.style.color = 'var(--text-secondary)'; } }}>
                                            {sel ? <CheckCircle2 size={14} style={{ flexShrink: 0 }} /> : <MapPin size={13} style={{ flexShrink: 0, opacity: 0.45 }} />}
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* ── Section 2: Assigned Retailers ── */}
                    <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.1rem' }}>
                            <Store size={18} color="#d97706" />
                            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>Assigned Retailers</h3>
                            <span style={{ fontSize: '0.73rem', color: 'var(--text-tertiary)', background: 'var(--surface-raised)', padding: '0.15rem 0.5rem', borderRadius: '8px', border: '1px solid var(--surface-border)' }}>
                                overrides district filter for specific partners
                            </span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
                                {selectedRetailers.size} of {allRetailers.length} selected
                            </span>
                        </div>

                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
                            <div style={{ position: 'relative', flex: '1 1 240px', minWidth: '180px' }}>
                                <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                                <input type="text" placeholder="Search by name or district…" className="input-field"
                                    style={{ paddingLeft: '2.1rem', margin: 0, height: '36px', fontSize: '0.85rem' }}
                                    value={retailerSearch} onChange={e => setRetailerSearch(e.target.value)} />
                            </div>
                            <button onClick={() => setSelectedRetailers(prev => { const n = new Set(prev); filteredRetailers.forEach(r => n.add(r.id)); return n; })}
                                style={{ fontSize: '0.78rem', padding: '0.38rem 0.9rem', borderRadius: '8px', border: '1px solid var(--surface-border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                                {retailerSearch ? 'Select Filtered' : 'Select All'}
                            </button>
                            <button onClick={() => setSelectedRetailers(new Set())}
                                style={{ fontSize: '0.78rem', padding: '0.38rem 0.9rem', borderRadius: '8px', border: '1px solid var(--surface-border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}>
                                Clear
                            </button>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                                {filteredRetailers.length} shown
                            </span>
                        </div>

                        {filteredRetailers.length === 0 ? (
                            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem', margin: 0 }}>
                                {allRetailers.length === 0 ? 'No retailers found.' : 'No retailers match your search.'}
                            </p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: '320px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                                {filteredRetailers.map(r => {
                                    const sel = selectedRetailers.has(r.id);
                                    return (
                                        <button key={r.id} onClick={() => toggleRetailer(r.id)}
                                            style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.9rem', borderRadius: '8px', border: `1.5px solid ${sel ? '#d97706' : 'var(--surface-border)'}`, background: sel ? 'hsla(38,92%,50%,0.07)' : 'var(--surface-raised)', color: 'var(--text-primary)', fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', transition: 'border-color 0.12s, background 0.12s', width: '100%', boxShadow: sel ? '0 0 0 3px hsla(38,92%,50%,0.12)' : 'none' }}
                                            onMouseEnter={e => { if (!sel) e.currentTarget.style.borderColor = 'var(--primary-light)'; }}
                                            onMouseLeave={e => { if (!sel) e.currentTarget.style.borderColor = 'var(--surface-border)'; }}>
                                            <div style={{ width: 18, height: 18, flexShrink: 0, borderRadius: '4px', border: `2px solid ${sel ? '#d97706' : 'var(--surface-border)'}`, background: sel ? '#d97706' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'border-color 0.12s, background 0.12s' }}>
                                                {sel && <CheckCircle2 size={12} color="#fff" strokeWidth={3} />}
                                            </div>
                                            <span style={{ fontWeight: sel ? 600 : 400, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                                            {r.district && (
                                                <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', whiteSpace: 'nowrap', flexShrink: 0 }}>{r.district}</span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* ── Save / Cancel ── */}
                    <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', paddingTop: '1rem', borderTop: '1px solid var(--surface-border)', flexWrap: 'wrap' }}>
                        {totalSelected === 0 && (
                            <span style={{ alignSelf: 'center', fontSize: '0.8rem', color: '#ef4444', fontWeight: 600, marginRight: 'auto' }}>
                                ⚠ Saving with no selection removes all access for this user.
                            </span>
                        )}
                        <button onClick={cancelEdit} disabled={saving} className="btn btn-secondary">Cancel</button>
                        <button onClick={handleSave} disabled={saving} className="btn btn-primary"
                            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: '160px', justifyContent: 'center' }}>
                            {saving
                                ? <Loader2 size={15} className="animate-spin" />
                                : <><CheckCircle2 size={15} /> Save Access</>
                            }
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
