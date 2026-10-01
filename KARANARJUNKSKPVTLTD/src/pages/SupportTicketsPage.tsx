import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
    LifeBuoy, Plus, RefreshCw, Loader2, X, Send, Paperclip, ArrowLeft, Calendar, MessageSquare,
} from 'lucide-react';
import { collection, addDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
    SUPPORT_TICKETS_COLLECTION,
    TICKET_CATEGORIES,
    TICKET_PRIORITY_OPTIONS,
    type SupportTicket,
    type TicketPriority,
    type TicketStatus,
} from '../types/support';

// Compact colour map for a ticket's lifecycle status badge.
const STATUS_BADGE: Record<TicketStatus, { bg: string; fg: string; label: string }> = {
    open:        { bg: 'hsla(210,100%,50%,0.15)', fg: 'hsl(210,90%,55%)',      label: 'Open' },
    in_progress: { bg: 'hsla(38,92%,50%,0.15)',   fg: 'hsl(38,80%,45%)',       label: 'In Progress' },
    resolved:    { bg: 'hsla(152,60%,40%,0.15)',  fg: 'hsl(152,55%,38%)',      label: 'Resolved' },
    closed:      { bg: 'var(--surface-border)',   fg: 'var(--text-secondary)', label: 'Closed' },
};

const PRIORITY_BADGE: Record<TicketPriority, { bg: string; fg: string; label: string }> = {
    low:    { bg: 'var(--surface-border)',   fg: 'var(--text-secondary)', label: 'Low' },
    medium: { bg: 'hsla(210,100%,50%,0.15)', fg: 'hsl(210,90%,55%)',      label: 'Medium' },
    high:   { bg: 'hsla(38,92%,50%,0.15)',   fg: 'hsl(38,80%,45%)',       label: 'High' },
    urgent: { bg: 'hsla(0,75%,55%,0.15)',    fg: 'hsl(0,70%,55%)',        label: 'Urgent' },
};

// Firestore Timestamp | Date | millis → readable date, or an em-dash when absent.
const formatDate = (ts: unknown): string => {
    if (!ts) return '—';
    try {
        const d = typeof ts === 'object' && ts !== null && 'toDate' in ts
            ? (ts as { toDate: () => Date }).toDate()
            : new Date(ts as string | number);
        if (isNaN(d.getTime())) return '—';
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
        return '—';
    }
};

const tsToMillis = (ts: unknown): number => {
    if (!ts) return 0;
    try {
        const d = typeof ts === 'object' && ts !== null && 'toDate' in ts
            ? (ts as { toDate: () => Date }).toDate()
            : new Date(ts as string | number);
        const m = d.getTime();
        return isNaN(m) ? 0 : m;
    } catch {
        return 0;
    }
};

const badgeBase: React.CSSProperties = {
    fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.55rem', borderRadius: '999px', whiteSpace: 'nowrap',
};

const fieldLabel: React.CSSProperties = {
    display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem', color: 'var(--text-secondary)',
};

// Attachments are capped so a stray large upload can't bloat the bucket.
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5 MB

interface FormState {
    subject: string;
    category: string;
    description: string;
    priority: TicketPriority;
}

const EMPTY_FORM: FormState = {
    subject: '', category: TICKET_CATEGORIES[0], description: '', priority: 'medium',
};

export default function SupportTicketsPage() {
    const { currentUser, userName, tenantId, tenantData } = useAuth();
    const { showToast } = useToast();

    const [tickets, setTickets] = useState<SupportTicket[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [creating, setCreating] = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [selected, setSelected] = useState<SupportTicket | null>(null);

    // Load this tenant's tickets. Rules restrict reads to the caller's own tenant,
    // so a simple tenantId equality query is provably safe. Sorted client-side
    // (newest first) to avoid needing a composite index.
    const loadTickets = useCallback(async () => {
        if (!tenantId) return;
        setLoading(true);
        setError(false);
        try {
            const snap = await getDocs(query(
                collection(db, SUPPORT_TICKETS_COLLECTION),
                where('tenantId', '==', tenantId),
            ));
            const rows = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<SupportTicket, 'id'>) }));
            rows.sort((a, b) => tsToMillis(b.createdAt) - tsToMillis(a.createdAt));
            setTickets(rows);
        } catch {
            setError(true);
            showToast('Failed to load your support tickets.', 'error');
        } finally {
            setLoading(false);
        }
    }, [tenantId, showToast]);

    useEffect(() => { loadTickets(); }, [loadTickets]);

    // Create a ticket. All identity fields are captured from AuthContext here and
    // enforced immutable in firestore.rules — the form never exposes them.
    const createTicket = async (form: FormState, file: File | null) => {
        if (!currentUser || !tenantId) {
            showToast('You must be signed in to raise a ticket.', 'error');
            return;
        }
        setCreating(true);
        try {
            let attachmentUrl: string | undefined;
            let attachmentName: string | undefined;
            if (file) {
                const safeName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
                const path = `tenants/${tenantId}/supportTickets/${Date.now()}_${safeName}`;
                const snap = await uploadBytes(storageRef(storage, path), file);
                attachmentUrl = await getDownloadURL(snap.ref);
                attachmentName = file.name;
            }
            const payload = {
                subject: form.subject.trim(),
                category: form.category,
                description: form.description.trim(),
                priority: form.priority,
                status: 'open' as const,
                // Auto-captured identity — not user-editable.
                tenantId,
                businessName: tenantData?.businessName || tenantId,
                userId: currentUser.uid,
                userName: userName || currentUser.displayName || currentUser.email?.split('@')[0] || 'Member',
                userEmail: currentUser.email || '',
                ...(attachmentUrl ? { attachmentUrl, attachmentName } : {}),
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            };
            await addDoc(collection(db, SUPPORT_TICKETS_COLLECTION), payload);
            showToast('Support ticket submitted. Our team will get back to you.', 'success');
            setCreating(false);
            await loadTickets();
            return true;
        } catch {
            showToast('Failed to submit your ticket. Please try again.', 'error');
            setCreating(false);
            return false;
        }
    };

    return (
        <div style={{ maxWidth: '960px', margin: '0 auto', padding: '2rem 1.25rem 4rem' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                <div>
                    <Link to="/help" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', color: 'var(--text-tertiary)', textDecoration: 'none', marginBottom: '0.5rem' }}>
                        <ArrowLeft size={14} /> Back to Help Center
                    </Link>
                    <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                        <LifeBuoy size={24} style={{ color: 'var(--primary-light)' }} /> Support Tickets
                    </h1>
                    <p style={{ margin: '0.3rem 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                        Raise an issue or request with the Fiinny team and track its progress.
                    </p>
                </div>
                <button onClick={() => setShowCreate(true)} className="btn btn-primary"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}>
                    <Plus size={16} /> Create Support Ticket
                </button>
            </div>

            {/* List */}
            <div className="glass-panel" style={{ overflowX: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0.6rem 1rem 0' }}>
                    <button onClick={loadTickets} disabled={loading} className="btn btn-secondary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refresh
                    </button>
                </div>
                {loading ? (
                    <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                        <Loader2 size={22} className="animate-spin" style={{ marginBottom: '0.5rem' }} />
                        <div>Loading your tickets…</div>
                    </div>
                ) : error ? (
                    <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--danger)' }}>
                        Couldn't load your tickets.{' '}
                        <button onClick={loadTickets} className="btn btn-secondary" style={{ marginLeft: '0.5rem', fontSize: '0.82rem' }}>Retry</button>
                    </div>
                ) : tickets.length === 0 ? (
                    <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                        <MessageSquare size={34} style={{ marginBottom: '0.75rem', opacity: 0.4 }} />
                        <p style={{ margin: 0 }}>No support tickets yet. Click “Create Support Ticket” to raise one.</p>
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem', minWidth: '640px' }}>
                        <thead>
                            <tr style={{ textAlign: 'left', color: 'var(--text-tertiary)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                <th style={thStyle}>Subject</th>
                                <th style={thStyle}>Category</th>
                                <th style={thStyle}>Priority</th>
                                <th style={thStyle}>Status</th>
                                <th style={thStyle}>Created</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tickets.map(tk => {
                                const st = STATUS_BADGE[tk.status] ?? STATUS_BADGE.open;
                                const pr = PRIORITY_BADGE[tk.priority] ?? PRIORITY_BADGE.medium;
                                return (
                                    <tr key={tk.id} onClick={() => setSelected(tk)}
                                        style={{ borderTop: '1px solid var(--surface-border)', cursor: 'pointer' }}>
                                        <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--text-primary)' }}>
                                            {tk.subject}
                                            {tk.adminResponse && (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', marginLeft: '0.5rem', fontSize: '0.7rem', color: 'var(--primary-light)' }}>
                                                    <MessageSquare size={11} /> Reply
                                                </span>
                                            )}
                                        </td>
                                        <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>{tk.category}</td>
                                        <td style={tdStyle}><span style={{ ...badgeBase, background: pr.bg, color: pr.fg }}>{pr.label}</span></td>
                                        <td style={tdStyle}><span style={{ ...badgeBase, background: st.bg, color: st.fg }}>{st.label}</span></td>
                                        <td style={{ ...tdStyle, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                                <Calendar size={13} style={{ color: 'var(--text-tertiary)' }} />
                                                {formatDate(tk.createdAt)}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Create modal */}
            {showCreate && (
                <CreateTicketModal
                    saving={creating}
                    maxBytes={MAX_ATTACHMENT_BYTES}
                    onSubmit={async (form, file) => {
                        const ok = await createTicket(form, file);
                        if (ok) setShowCreate(false);
                    }}
                    onClose={() => setShowCreate(false)}
                />
            )}

            {/* Detail modal (existing ticket) */}
            {selected && (
                <TicketDetailModal ticket={selected} onClose={() => setSelected(null)} />
            )}
        </div>
    );
}

const thStyle: React.CSSProperties = { padding: '0.7rem 1.1rem', fontWeight: 600 };
const tdStyle: React.CSSProperties = { padding: '0.75rem 1.1rem', verticalAlign: 'middle' };

// ─── Create ticket modal ──────────────────────────────────────────────────────
function CreateTicketModal({
    saving, maxBytes, onSubmit, onClose,
}: {
    saving: boolean;
    maxBytes: number;
    onSubmit: (form: FormState, file: File | null) => void;
    onClose: () => void;
}) {
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [file, setFile] = useState<File | null>(null);
    const [fileError, setFileError] = useState<string | null>(null);
    const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm(prev => ({ ...prev, [k]: v }));

    const validate = (): string | null => {
        if (!form.subject.trim()) return 'Subject is required.';
        if (!form.category.trim()) return 'Category is required.';
        if (!form.description.trim()) return 'Description is required.';
        return null;
    };
    const validationError = validate();

    const onPickFile = (f: File | null) => {
        setFileError(null);
        if (f && f.size > maxBytes) {
            setFileError(`Attachment must be under ${Math.round(maxBytes / (1024 * 1024))} MB.`);
            return;
        }
        setFile(f);
    };

    return (
        <div onClick={onClose} style={overlayStyle}>
            <div onClick={e => e.stopPropagation()} className="glass-panel" style={{ width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                    <div>
                        <h2 style={{ fontSize: '1.15rem', margin: '0 0 0.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <LifeBuoy size={18} /> Create Support Ticket
                        </h2>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            Describe your issue or request. Your business and account details are attached automatically.
                        </div>
                    </div>
                    <button onClick={onClose} aria-label="Close" style={closeBtnStyle}><X size={20} /></button>
                </div>

                <label style={fieldLabel}>Subject *</label>
                <input className="input-field" style={{ width: '100%', marginBottom: '1rem' }} value={form.subject}
                    placeholder="e.g. GST invoice total is calculating wrong" onChange={e => set('subject', e.target.value)} />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                    <div>
                        <label style={fieldLabel}>Category *</label>
                        <select className="input-field" style={{ width: '100%' }} value={form.category} onChange={e => set('category', e.target.value)}>
                            {TICKET_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={fieldLabel}>Priority *</label>
                        <select className="input-field" style={{ width: '100%' }} value={form.priority} onChange={e => set('priority', e.target.value as TicketPriority)}>
                            {TICKET_PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </div>
                </div>

                <label style={fieldLabel}>Description *</label>
                <textarea className="input-field" style={{ width: '100%', minHeight: '120px', resize: 'vertical', marginBottom: '1rem' }} value={form.description}
                    placeholder="Explain what happened, what you expected, and any steps to reproduce." onChange={e => set('description', e.target.value)} />

                <label style={fieldLabel}>Attachment (optional)</label>
                <label className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                    <Paperclip size={15} /> {file ? 'Change file' : 'Attach a file'}
                    <input type="file" style={{ display: 'none' }} onChange={e => onPickFile(e.target.files?.[0] ?? null)} />
                </label>
                {file && (
                    <span style={{ marginLeft: '0.6rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                        {file.name}
                        <button onClick={() => setFile(null)} aria-label="Remove attachment" style={{ ...closeBtnStyle, marginLeft: '0.35rem', verticalAlign: 'middle' }}><X size={14} /></button>
                    </span>
                )}
                {fileError && <div style={{ fontSize: '0.78rem', color: 'var(--danger)', marginTop: '0.4rem' }}>{fileError}</div>}

                {validationError && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--danger)', margin: '1rem 0 0' }}>{validationError}</div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '1.5rem' }}>
                    <button onClick={onClose} className="btn btn-secondary" style={{ fontSize: '0.85rem' }}>Cancel</button>
                    <button
                        onClick={() => { if (!validationError && !fileError) onSubmit(form, file); }}
                        disabled={saving || !!validationError || !!fileError}
                        className="btn btn-primary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', opacity: (saving || validationError || fileError) ? 0.55 : 1, cursor: (saving || validationError || fileError) ? 'not-allowed' : 'pointer' }}
                    >
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Submit Ticket
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Ticket detail modal (read-only for the business user) ────────────────────
function TicketDetailModal({ ticket, onClose }: { ticket: SupportTicket; onClose: () => void }) {
    const st = STATUS_BADGE[ticket.status] ?? STATUS_BADGE.open;
    const pr = PRIORITY_BADGE[ticket.priority] ?? PRIORITY_BADGE.medium;
    return (
        <div onClick={onClose} style={overlayStyle}>
            <div onClick={e => e.stopPropagation()} className="glass-panel" style={{ width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                    <div>
                        <h2 style={{ fontSize: '1.15rem', margin: '0 0 0.35rem' }}>{ticket.subject}</h2>
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                            <span style={{ ...badgeBase, background: st.bg, color: st.fg }}>{st.label}</span>
                            <span style={{ ...badgeBase, background: pr.bg, color: pr.fg }}>{pr.label} priority</span>
                            <span style={{ ...badgeBase, background: 'var(--surface-border)', color: 'var(--text-secondary)' }}>{ticket.category}</span>
                        </div>
                    </div>
                    <button onClick={onClose} aria-label="Close" style={closeBtnStyle}><X size={20} /></button>
                </div>

                <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginBottom: '1rem' }}>
                    Raised {formatDate(ticket.createdAt)}
                </div>

                <div style={{ marginBottom: '1.25rem' }}>
                    <div style={fieldLabel}>Description</div>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{ticket.description}</p>
                </div>

                {ticket.attachmentUrl && (
                    <div style={{ marginBottom: '1.25rem' }}>
                        <div style={fieldLabel}>Attachment</div>
                        <a href={ticket.attachmentUrl} target="_blank" rel="noopener noreferrer"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--primary-light)', textDecoration: 'none' }}>
                            <Paperclip size={14} /> {ticket.attachmentName || 'View attachment'}
                        </a>
                    </div>
                )}

                {ticket.adminResponse ? (
                    <div style={{ padding: '0.9rem 1rem', borderRadius: '10px', background: 'hsla(152,60%,40%,0.08)', border: '1px solid hsla(152,60%,40%,0.25)' }}>
                        <div style={{ ...fieldLabel, color: 'var(--primary-light)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <MessageSquare size={14} /> Response from Fiinny Support
                        </div>
                        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{ticket.adminResponse}</p>
                    </div>
                ) : (
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                        No response yet. Our team will reply here.
                    </div>
                )}
            </div>
        </div>
    );
}

const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem',
};
const closeBtnStyle: React.CSSProperties = {
    background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: '0.2rem',
};
