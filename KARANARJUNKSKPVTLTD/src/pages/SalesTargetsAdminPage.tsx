/**
 * Admin-only Sales Target management page.
 *
 * - Targets are stored per-user per-month: salesTargets/{userId}_{YYYY-MM}
 * - Read-only by default; Edit → Save / Cancel per row prevents accidental changes.
 * - Carry-forward: when no doc exists for the selected month, the previous
 *   month's values are shown as a default (marked "carried"). Saving creates a
 *   new doc for that month only — prior months are never touched.
 */
import { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, setDoc, serverTimestamp, getDocs, query, where } from 'firebase/firestore';
import { collection as fsCollection } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Loader2, Save, X, Edit2, Target, ChevronLeft, ChevronRight, ArrowUpCircle } from 'lucide-react';
import { logAudit } from '../utils/auditLog';

// ── Date helpers ─────────────────────────────────────────────────────────────

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
function ymToDisplay(ym: string): string {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
}
function ymToShort(ym: string): string {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'short', year: '2-digit' });
}
function fyLabel(ym: string): string {
    const [y, m] = ym.split('-').map(Number);
    return m >= 4 ? `FY ${y}-${String(y + 1).slice(2)}` : `FY ${y - 1}-${String(y).slice(2)}`;
}
function fmtINR(n: number): string {
    return '₹' + n.toLocaleString('en-IN');
}

// ── Types ────────────────────────────────────────────────────────────────────

interface SalesUser {
    id: string;
    name: string;
    email: string;
    assignedDistricts?: string[];
}

interface UserTarget {
    invoice: string;
    payment: string;
    hasDoc: boolean;         // a doc exists for this exact month
    carriedFrom: string;     // if !hasDoc, which month supplied the default
}

// ── Component ────────────────────────────────────────────────────────────────

export default function SalesTargetsAdminPage() {
    const { tenantId, currentUser, userName, userRole } = useAuth();
    const { showToast } = useToast();

    const [targetMonth, setTargetMonth] = useState(currentYM());
    const [salesUsers, setSalesUsers] = useState<SalesUser[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(true);
    const [targetData, setTargetData] = useState<Record<string, UserTarget>>({});
    const [loadingTargets, setLoadingTargets] = useState(false);

    // Per-row edit state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [draft, setDraft] = useState({ invoice: '', payment: '' });
    const [saving, setSaving] = useState(false);

    // ── Load sales users ────────────────────────────────────────────────────
    useEffect(() => {
        if (!tenantId) return;
        (async () => {
            setLoadingUsers(true);
            try {
                const snap = await getDocs(query(fsCollection(db, 'users'), where('tenantId', '==', tenantId)));
                const all = snap.docs
                    .map(d => ({ id: d.id, ...(d.data() as any) }))
                    .filter((u: any) => u.role === 'sales') as SalesUser[];
                setSalesUsers(all);
            } catch (e) {
                console.error('Failed to load users:', e);
            } finally {
                setLoadingUsers(false);
            }
        })();
    }, [tenantId]);

    // ── Load targets for the selected month (with carry-forward) ────────────
    const loadTargets = useCallback(async () => {
        if (!tenantId || salesUsers.length === 0) return;
        setLoadingTargets(true);
        const prev = prevYM(targetMonth);
        const result: Record<string, UserTarget> = {};

        await Promise.all(salesUsers.map(async u => {
            const thisRef = doc(db, 'tenants', tenantId, 'salesTargets', `${u.id}_${targetMonth}`);
            const thisSnap = await getDoc(thisRef);
            if (thisSnap.exists()) {
                const d = thisSnap.data();
                result[u.id] = {
                    invoice: String(d.invoiceTarget ?? ''),
                    payment: String(d.paymentTarget ?? ''),
                    hasDoc: true,
                    carriedFrom: '',
                };
            } else {
                // Try previous month for carry-forward
                const prevRef = doc(db, 'tenants', tenantId, 'salesTargets', `${u.id}_${prev}`);
                const prevSnap = await getDoc(prevRef);
                if (prevSnap.exists()) {
                    const d = prevSnap.data();
                    result[u.id] = {
                        invoice: String(d.invoiceTarget ?? ''),
                        payment: String(d.paymentTarget ?? ''),
                        hasDoc: false,
                        carriedFrom: prev,
                    };
                } else {
                    result[u.id] = { invoice: '', payment: '', hasDoc: false, carriedFrom: '' };
                }
            }
        }));

        setTargetData(result);
        setLoadingTargets(false);
        // Cancel any in-progress edit when month changes
        setEditingId(null);
    }, [tenantId, targetMonth, salesUsers]);

    useEffect(() => { loadTargets(); }, [loadTargets]);

    // ── Edit helpers ────────────────────────────────────────────────────────
    const startEdit = (userId: string) => {
        const t = targetData[userId];
        setDraft({ invoice: t?.invoice || '', payment: t?.payment || '' });
        setEditingId(userId);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setDraft({ invoice: '', payment: '' });
    };

    const saveTarget = async (user: SalesUser) => {
        if (!tenantId) return;
        setSaving(true);
        try {
            const docId = `${user.id}_${targetMonth}`;
            const invVal = parseFloat(draft.invoice) || 0;
            const pmtVal = parseFloat(draft.payment) || 0;
            await setDoc(doc(db, 'tenants', tenantId, 'salesTargets', docId), {
                userId: user.id,
                userName: user.name || user.email,
                month: targetMonth,
                financialYear: fyLabel(targetMonth),
                invoiceTarget: invVal,
                paymentTarget: pmtVal,
                updatedAt: serverTimestamp(),
            }, { merge: true });

            // Update local state without re-fetching
            setTargetData(prev => ({
                ...prev,
                [user.id]: { invoice: String(invVal), payment: String(pmtVal), hasDoc: true, carriedFrom: '' },
            }));

            logAudit({
                db, tenantId,
                userId: currentUser?.uid || '',
                userName: userName || currentUser?.email || 'Admin',
                userRole: userRole || 'admin',
                module: 'Worklist',
                action: 'Update',
                entityName: user.name || user.email,
                description: `Sales target set for ${ymToDisplay(targetMonth)} · Invoice: ${fmtINR(invVal)} · Payment: ${fmtINR(pmtVal)}`,
            });

            showToast(`Target saved for ${user.name || user.email} — ${ymToDisplay(targetMonth)}`, 'success');
            setEditingId(null);
        } catch (e) {
            showToast('Failed to save target. Please try again.', 'error');
        } finally {
            setSaving(false);
        }
    };

    // ── UI ──────────────────────────────────────────────────────────────────

    if (loadingUsers) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
                <Loader2 size={28} className="animate-spin" style={{ color: 'var(--text-tertiary)' }} />
            </div>
        );
    }

    return (
        <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 1rem' }}>

            {/* ── Header ── */}
            <div style={{ marginBottom: '1.75rem' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 0.25rem' }}>
                    <Target size={22} color="var(--primary-light)" /> Sales Targets
                </h1>
                <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.875rem' }}>
                    Set monthly invoice and payment targets per salesperson. Historical targets are preserved — editing one month never affects others.
                </p>
            </div>

            {/* ── Month navigator ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.75rem' }}>
                <button
                    onClick={() => setTargetMonth(prevYM(targetMonth))}
                    style={{ background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderRadius: '8px', padding: '0.4rem 0.7rem', cursor: 'pointer', color: 'var(--text-primary)', display: 'flex', alignItems: 'center' }}
                >
                    <ChevronLeft size={16} />
                </button>
                <div style={{ textAlign: 'center', minWidth: '180px' }}>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{ymToDisplay(targetMonth)}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '1px' }}>{fyLabel(targetMonth)}</div>
                </div>
                <button
                    onClick={() => setTargetMonth(nextYM(targetMonth))}
                    style={{ background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderRadius: '8px', padding: '0.4rem 0.7rem', cursor: 'pointer', color: 'var(--text-primary)', display: 'flex', alignItems: 'center' }}
                >
                    <ChevronRight size={16} />
                </button>
                <button
                    onClick={() => setTargetMonth(currentYM())}
                    style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem', borderRadius: '8px', border: '1px solid var(--surface-border)', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)', fontFamily: 'inherit' }}
                >
                    This Month
                </button>
            </div>

            {/* ── Content ── */}
            {salesUsers.length === 0 ? (
                <div className="glass-panel" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    <Target size={32} style={{ marginBottom: '0.75rem', opacity: 0.4 }} />
                    <div style={{ fontWeight: 600 }}>No sales users found</div>
                    <div style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>
                        Create a user with the <strong>Sales</strong> role in Manage Users first.
                    </div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

                    {/* Column header */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '0.75rem 1rem', padding: '0 1rem', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)' }}>
                        <div>Sales User</div>
                        <div>Invoice Target</div>
                        <div>Payment Target</div>
                        <div style={{ minWidth: '100px' }}></div>
                    </div>

                    {loadingTargets ? (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                            <Loader2 size={22} className="animate-spin" style={{ color: 'var(--text-tertiary)' }} />
                        </div>
                    ) : (
                        salesUsers.map(user => {
                            const t = targetData[user.id];
                            const isEditing = editingId === user.id;
                            const isCarried = !!(t && !t.hasDoc && t.carriedFrom && (t.invoice || t.payment));
                            const hasValue = !!(t?.invoice || t?.payment);

                            return (
                                <div key={user.id} className="glass-panel" style={{ borderRadius: '12px', padding: '0.9rem 1rem', border: isEditing ? '1px solid var(--primary-light)' : '1px solid var(--surface-border)' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '0.75rem 1rem', alignItems: 'center' }}>

                                        {/* User info */}
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{user.name || '—'}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{user.email}</div>
                                            {Array.isArray(user.assignedDistricts) && user.assignedDistricts.length > 0 && (
                                                <div style={{ fontSize: '0.70rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                                                    {user.assignedDistricts.join(', ')}
                                                </div>
                                            )}
                                        </div>

                                        {/* Invoice Target */}
                                        <div>
                                            {isEditing ? (
                                                <input
                                                    type="number"
                                                    className="input-field"
                                                    value={draft.invoice}
                                                    onChange={e => setDraft(d => ({ ...d, invoice: e.target.value }))}
                                                    style={{ margin: 0, padding: '0.45rem 0.6rem', fontSize: '0.875rem', width: '100%' }}
                                                    placeholder="0"
                                                    autoFocus
                                                />
                                            ) : (
                                                <div style={{ fontSize: '0.95rem', fontWeight: hasValue ? 700 : 400, color: hasValue ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                                                    {t?.invoice ? fmtINR(parseFloat(t.invoice) || 0) : '—'}
                                                    {isCarried && (
                                                        <span title={`Carried forward from ${ymToDisplay(t.carriedFrom)}`} style={{ marginLeft: '6px', display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '0.68rem', color: 'var(--text-tertiary)', fontWeight: 400, background: 'var(--surface-raised)', padding: '1px 5px', borderRadius: '4px' }}>
                                                            <ArrowUpCircle size={10} /> {ymToShort(t.carriedFrom)}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Payment Target */}
                                        <div>
                                            {isEditing ? (
                                                <input
                                                    type="number"
                                                    className="input-field"
                                                    value={draft.payment}
                                                    onChange={e => setDraft(d => ({ ...d, payment: e.target.value }))}
                                                    style={{ margin: 0, padding: '0.45rem 0.6rem', fontSize: '0.875rem', width: '100%' }}
                                                    placeholder="0"
                                                />
                                            ) : (
                                                <div style={{ fontSize: '0.95rem', fontWeight: hasValue ? 700 : 400, color: hasValue ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                                                    {t?.payment ? fmtINR(parseFloat(t.payment) || 0) : '—'}
                                                    {isCarried && t?.payment && (
                                                        <span title={`Carried forward from ${ymToDisplay(t.carriedFrom)}`} style={{ marginLeft: '6px', display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '0.68rem', color: 'var(--text-tertiary)', fontWeight: 400, background: 'var(--surface-raised)', padding: '1px 5px', borderRadius: '4px' }}>
                                                            <ArrowUpCircle size={10} /> {ymToShort(t.carriedFrom)}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Actions */}
                                        <div style={{ display: 'flex', gap: '0.4rem', minWidth: '100px', justifyContent: 'flex-end' }}>
                                            {isEditing ? (
                                                <>
                                                    <button
                                                        onClick={() => saveTarget(user)}
                                                        disabled={saving}
                                                        className="btn btn-primary"
                                                        style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                                                    >
                                                        {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save
                                                    </button>
                                                    <button
                                                        onClick={cancelEdit}
                                                        disabled={saving}
                                                        className="btn btn-secondary"
                                                        style={{ padding: '0.4rem 0.55rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center' }}
                                                        title="Cancel"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </>
                                            ) : (
                                                <button
                                                    onClick={() => startEdit(user.id)}
                                                    disabled={!!editingId}
                                                    className="btn btn-secondary"
                                                    style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem', opacity: editingId && editingId !== user.id ? 0.4 : 1 }}
                                                >
                                                    <Edit2 size={13} /> Edit
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Carry-forward notice (full-width, only on edit) */}
                                    {isEditing && isCarried && (
                                        <div style={{ marginTop: '0.6rem', padding: '0.4rem 0.7rem', borderRadius: '6px', background: 'hsla(220,80%,60%,0.07)', border: '1px solid hsla(220,80%,60%,0.15)', fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            <ArrowUpCircle size={14} style={{ flexShrink: 0, color: 'var(--primary-light)' }} />
                                            Values pre-filled from <strong>{ymToDisplay(t!.carriedFrom)}</strong>. Saving will create a new target for <strong>{ymToDisplay(targetMonth)}</strong> only.
                                        </div>
                                    )}

                                    {/* Not-set notice */}
                                    {isEditing && !isCarried && !t?.hasDoc && (
                                        <div style={{ marginTop: '0.6rem', padding: '0.4rem 0.7rem', borderRadius: '6px', background: 'hsla(245,80%,60%,0.06)', border: '1px solid hsla(245,80%,60%,0.15)', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                            No target has been set for {ymToDisplay(targetMonth)} yet. Enter values and Save.
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            )}
        </div>
    );
}
