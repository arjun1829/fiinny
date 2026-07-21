import { useState, useEffect, useMemo } from 'react';
import { getDocs, query, orderBy, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection, getTenantDoc } from '../utils/tenantPath';
import { useSalesFilter, fetchSalesOrdersByRetailerIds } from '../hooks/useSalesFilter';
import { fmtINR } from '../utils/gstCalculator';
import { Bell, Send, CheckCircle2, Clock, AlertTriangle, Loader2, RefreshCw, MessageSquare } from 'lucide-react';

interface Invoice {
  id: string;
  orderNumber: string;
  invoiceDate: string;
  dueDate?: string;
  retailerName: string;
  buyerContact: string;
  netAmount: number;
  status: string;
  paymentStatus?: string;
  modeOfPayment?: string;
  retailerId?: string;
}

// Days since invoice date (positive = overdue)
function daysDiff(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

// Remaining days from today to due date (negative = overdue)
function dueDateDiff(dueDateStr: string): number {
  const due = new Date(dueDateStr);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function dueBadge(diff: number): { label: string; color: string } {
  if (diff < 0) return { label: `Overdue ${Math.abs(diff)}d`, color: '#ef4444' };
  if (diff === 0) return { label: 'Due Today', color: '#f59e0b' };
  if (diff <= 7) return { label: `Due in ${diff}d`, color: '#f59e0b' };
  return { label: `Due in ${diff}d`, color: '#10b981' };
}

function buildWhatsAppMsg(inv: Invoice, businessName: string): string {
  const days = daysDiff(inv.invoiceDate);
  return encodeURIComponent(
    `Dear ${inv.retailerName},\n\n` +
    `This is a payment reminder from ${businessName}.\n\n` +
    `Invoice: ${inv.orderNumber}\n` +
    `Invoice Date: ${inv.invoiceDate}\n` +
    `Amount: Rs. ${fmtINR(inv.netAmount)}\n` +
    (days > 0 ? `Overdue by ${days} days.\n\n` : '\n') +
    `Please process the payment at your earliest convenience.\n\n` +
    `For any queries, please contact us.\n\nThank you.`
  );
}

export default function PaymentRemindersPage() {
  const { tenantId, tenantData, userRole } = useAuth();
  const isSales = userRole === 'sales';
  const isViewOnly = isSales || userRole === 'retailer';
  const { allowedRetailerIds, filterLoading } = useSalesFilter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [remindedSet, setRemindedSet] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | 'overdue' | 'week'>('overdue');

  const businessName = (tenantData as any)?.businessName || 'Your Business Name';

  const fetchInvoices = async () => {
    if (!tenantId || filterLoading) return;
    setLoading(true);
    try {
      let docs;
      if (allowedRetailerIds === null) {
        // Admin/analyst: fetch all
        const snap = await getDocs(query(getTenantCollection(db, tenantId, 'salesOrders'), orderBy('createdAt', 'desc')));
        docs = snap.docs;
      } else {
        // Sales user: fetch only for allowed retailers
        docs = await fetchSalesOrdersByRetailerIds(tenantId, allowedRetailerIds);
      }
      const all = docs.map(d => ({
        id: d.id,
        ...d.data(),
        netAmount: Number((d.data() as any).netAmount) || 0,
      } as Invoice));
      setInvoices(all.filter(o => o.status !== 'paid' && o.modeOfPayment !== 'Cash'));
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { fetchInvoices(); }, [tenantId, filterLoading, allowedRetailerIds === null ? 'all' : Array.from(allowedRetailerIds).sort().join(',')]);

  const filtered = useMemo(() => {
    return invoices.filter(inv => {
      const days = daysDiff(inv.invoiceDate);
      if (filter === 'overdue') return days > 0;
      if (filter === 'week') return days > 7;
      return true;
    }).sort((a, b) => daysDiff(b.invoiceDate) - daysDiff(a.invoiceDate));
  }, [invoices, filter]);

  const totalOutstanding = filtered.reduce((s, inv) => s + (Number(inv.netAmount) || 0), 0);
  const overdueCount = invoices.filter(inv => daysDiff(inv.invoiceDate) > 0).length;
  const highRisk = invoices.filter(inv => daysDiff(inv.invoiceDate) > 30).length;

  const sendReminder = (inv: Invoice) => {
    const num = (inv.buyerContact || '').replace(/\D/g, '');
    if (!num || num.length < 10) { alert('No valid contact number for this customer.'); return; }
    const msg = buildWhatsAppMsg(inv, businessName);
    window.open(`https://wa.me/91${num}?text=${msg}`, '_blank');
    setRemindedSet(prev => new Set([...prev, inv.id]));
  };

  const sendBulkReminders = () => {
    const overdue = filtered.filter(inv => daysDiff(inv.invoiceDate) > 0 && inv.buyerContact);
    if (overdue.length === 0) { alert('No overdue invoices with contact numbers.'); return; }
    const inv = overdue[0];
    const num = (inv.buyerContact || '').replace(/\D/g, '');
    const msg = buildWhatsAppMsg(inv, businessName);
    window.open(`https://wa.me/91${num}?text=${msg}`, '_blank');
    setRemindedSet(prev => new Set([...prev, ...overdue.map(i => i.id)]));
  };

  const markPaid = async (inv: Invoice) => {
    if (!tenantId) return;
    await updateDoc(getTenantDoc(db, tenantId, 'salesOrders', inv.id) as any, { status: 'paid' });
    fetchInvoices();
  };

  const filterBtn = (f: typeof filter) => ({
    padding: '0.4rem 1rem',
    borderRadius: '20px',
    border: `1px solid ${filter === f ? 'var(--primary-light)' : 'var(--surface-border)'}`,
    background: filter === f ? 'var(--primary-light)' : 'transparent',
    color: filter === f ? '#fff' : 'var(--text-secondary)',
    fontWeight: filter === f ? 600 : 400,
    cursor: 'pointer' as const,
    font: 'inherit',
    fontSize: '0.82rem',
  });

  const th: React.CSSProperties = {
    padding: '0.6rem 0.85rem',
    textAlign: 'left',
    fontSize: '0.66rem',
    fontWeight: 700,
    color: 'var(--text-tertiary)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    borderBottom: '2px solid var(--surface-border)',
    background: 'var(--surface-raised)',
    whiteSpace: 'nowrap',
  };

  const td: React.CSSProperties = {
    padding: '0.6rem 0.85rem',
    borderBottom: '1px solid var(--surface-border)',
    verticalAlign: 'middle',
    fontSize: '0.84rem',
  };

  return (
    <div className="animate-fade-in" style={{ maxWidth: '1200px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="primary-gradient-text" style={{ fontSize: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <Bell size={28} /> Payment Reminders
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>Track overdue payments and send WhatsApp reminders</p>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <button
            onClick={fetchInvoices}
            style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.55rem 1rem', background: 'transparent', border: '1px solid var(--surface-border)', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-secondary)', font: 'inherit', fontSize: '0.85rem' }}
          >
            <RefreshCw size={15} /> Refresh
          </button>
          {!isViewOnly && (
            <button
              onClick={sendBulkReminders}
              style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.55rem 1.1rem', background: '#25D366', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, font: 'inherit', fontSize: '0.85rem' }}
            >
              <Send size={15} /> Remind All Overdue
            </button>
          )}
        </div>
      </div>

      {/* KPI Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Total Pending', value: invoices.length, color: '#6366f1', icon: <Bell size={17} /> },
          { label: 'Overdue', value: overdueCount, color: '#f59e0b', icon: <AlertTriangle size={17} /> },
          { label: '30+ Days Overdue', value: highRisk, color: '#ef4444', icon: <AlertTriangle size={17} /> },
          { label: 'Outstanding Amount', value: `₹${fmtINR(totalOutstanding)}`, color: '#ef4444', icon: <CheckCircle2 size={17} /> },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderLeft: `4px solid ${s.color}`, borderRadius: '12px', padding: '1.1rem 1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: s.color, marginBottom: '0.35rem', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {s.icon} {s.label}
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filter Bar */}
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1.1rem', flexWrap: 'wrap' }}>
        <button style={filterBtn('all')} onClick={() => setFilter('all')}>All Pending ({invoices.length})</button>
        <button style={filterBtn('overdue')} onClick={() => setFilter('overdue')}>Overdue ({overdueCount})</button>
        <button style={filterBtn('week')} onClick={() => setFilter('week')}>7+ Days ({invoices.filter(i => daysDiff(i.invoiceDate) > 7).length})</button>
        <span style={{ marginLeft: 'auto', color: 'var(--text-tertiary)', fontSize: '0.8rem', alignSelf: 'center' }}>{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
          <Loader2 className="animate-spin" size={32} style={{ margin: '0 auto' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem 2rem', background: 'var(--surface-raised)', borderRadius: '12px', border: '1px solid var(--surface-border)', color: 'var(--text-secondary)' }}>
          <CheckCircle2 size={44} style={{ color: '#10b981', margin: '0 auto 1rem', display: 'block', opacity: 0.7 }} />
          <h3 style={{ margin: '0 0 0.4rem' }}>All Clear</h3>
          <p style={{ margin: 0, fontSize: '0.88rem' }}>No invoices match the current filter.</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid var(--surface-border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '860px' }}>
            <thead>
              <tr>
                {(['Order ID', 'Retailer / Vendor', 'Amount', 'Invoice Date', 'Due Date / Overdue', 'Payment Status', 'Actions'] as const).map(h => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv, idx) => {
                const invoiceOverdueDays = daysDiff(inv.invoiceDate);
                const reminded = remindedSet.has(inv.id);

                // Due date column: prefer dueDate field, else fall back to invoice-date overdue
                let dueCellBadge: { label: string; color: string } | null = null;
                let dueCellDate: string | null = null;
                if (inv.dueDate) {
                  const diff = dueDateDiff(inv.dueDate);
                  dueCellDate = new Date(inv.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
                  dueCellBadge = dueBadge(diff);
                } else if (invoiceOverdueDays > 0) {
                  dueCellBadge = { label: `${invoiceOverdueDays}d overdue`, color: invoiceOverdueDays > 30 ? '#ef4444' : '#f59e0b' };
                }

                const payStatus = inv.paymentStatus || inv.status || 'Pending';
                const payColor = payStatus.toLowerCase() === 'paid' ? '#10b981' : payStatus.toLowerCase() === 'partial' ? '#f59e0b' : '#ef4444';

                const rowBg = idx % 2 === 0 ? 'transparent' : 'hsla(0,0%,100%,0.018)';

                return (
                  <tr
                    key={inv.id}
                    style={{ background: rowBg, transition: 'background 0.12s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-raised)')}
                    onMouseLeave={e => (e.currentTarget.style.background = rowBg)}
                  >
                    {/* Order ID */}
                    <td style={td}>
                      <span style={{ fontWeight: 700, color: 'var(--primary-light)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                        {inv.orderNumber || inv.id.slice(-8).toUpperCase()}
                      </span>
                      {reminded && (
                        <span style={{ display: 'block', fontSize: '0.67rem', color: '#25D366', fontWeight: 600, marginTop: '0.15rem' }}>Reminded</span>
                      )}
                    </td>

                    {/* Retailer */}
                    <td style={td}>
                      <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{inv.retailerName || '—'}</span>
                      {inv.buyerContact && (
                        <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '0.1rem' }}>{inv.buyerContact}</span>
                      )}
                    </td>

                    {/* Amount */}
                    <td style={{ ...td, whiteSpace: 'nowrap', fontWeight: 700, fontSize: '0.9rem' }}>
                      ₹{fmtINR(inv.netAmount)}
                    </td>

                    {/* Invoice Date */}
                    <td style={{ ...td, color: 'var(--text-tertiary)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                      {inv.invoiceDate || '—'}
                    </td>

                    {/* Due Date / Overdue */}
                    <td style={{ ...td, minWidth: '130px' }}>
                      {dueCellDate && (
                        <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.15rem' }}>
                          {dueCellDate}
                        </span>
                      )}
                      {dueCellBadge ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.72rem', fontWeight: 700, padding: '0.18rem 0.55rem', borderRadius: '8px', background: `${dueCellBadge.color}18`, color: dueCellBadge.color, border: `1px solid ${dueCellBadge.color}44`, whiteSpace: 'nowrap' }}>
                          {dueCellBadge.color === '#10b981' ? <Clock size={11} /> : <AlertTriangle size={11} />}
                          {dueCellBadge.label}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-tertiary)', fontSize: '0.78rem' }}>—</span>
                      )}
                    </td>

                    {/* Payment Status */}
                    <td style={td}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.6rem', borderRadius: '8px', background: `${payColor}18`, color: payColor, border: `1px solid ${payColor}44`, whiteSpace: 'nowrap' }}>
                        {payStatus}
                      </span>
                      {inv.modeOfPayment && (
                        <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '0.2rem' }}>{inv.modeOfPayment}</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                        {!isViewOnly && (
                          <button
                            onClick={() => sendReminder(inv)}
                            disabled={!inv.buyerContact}
                            title={!inv.buyerContact ? 'No contact number' : 'Send WhatsApp reminder'}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.3rem 0.65rem', background: inv.buyerContact ? '#25D366' : 'var(--surface-border)', color: '#fff', border: 'none', borderRadius: '6px', cursor: inv.buyerContact ? 'pointer' : 'not-allowed', fontWeight: 600, font: 'inherit', fontSize: '0.76rem' }}
                          >
                            <MessageSquare size={12} /> Remind
                          </button>
                        )}
                        {!isViewOnly && (
                          <button
                            onClick={() => markPaid(inv)}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.3rem 0.65rem', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, font: 'inherit', fontSize: '0.76rem' }}
                          >
                            <CheckCircle2 size={12} /> Paid
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer tip */}
      <div style={{ marginTop: '1.25rem', padding: '0.85rem 1rem', background: 'hsla(134,61%,41%,0.07)', borderRadius: '8px', border: '1px solid hsla(134,61%,41%,0.18)', fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
        <MessageSquare size={16} style={{ color: '#25D366', flexShrink: 0 }} />
        <span>WhatsApp reminders open with a pre-filled message. Add contact numbers in Retailer Management to enable bulk reminders.</span>
      </div>
    </div>
  );
}
