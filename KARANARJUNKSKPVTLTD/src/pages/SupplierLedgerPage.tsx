import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2, Plus, Loader2,
  IndianRupee, Package, Truck, ChevronRight, ChevronDown, Link2, Search, X, Bell, FileText,
  BarChart3,
} from 'lucide-react';
import { useHashTab } from '../hooks/useHashTab';
import { getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useFeaturePermissions } from '../hooks/useFeaturePermissions';
import { getTenantCollection } from '../utils/tenantPath';
import SupplierFormModal from '../components/SupplierFormModal';

interface InvoiceHit {
  invoiceId: string;
  supplierId: string;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string;
  matchedProducts: string[];
}

interface UpcomingReminder {
  id: string;
  supplierId: string;
  supplierName: string;
  commitmentDate?: string;
  reminderDate: string;
  amount: number;
  title: string;
  status: 'open' | 'completed';
}

interface Supplier {
  id: string;
  name: string;
  address?: string;
  email?: string;
  phone?: string;
  supplierType?: string;
  outstandingBalance: number;
  totalInvoiced?: number;
  totalPaid?: number;
}

type SupplierTab = 'suppliers' | 'payments' | 'reminders' | 'reports';
const VALID_SUPPLIER_TABS: readonly SupplierTab[] = ['suppliers', 'payments', 'reminders', 'reports'];

const SUPPLIER_MODULE_TABS: { id: SupplierTab; label: string; icon: React.ReactNode }[] = [
  { id: 'suppliers', label: 'Suppliers',         icon: <Building2 size={16} /> },
  { id: 'payments',  label: 'Invoices',           icon: <FileText size={16} /> },
  { id: 'reminders', label: 'Payment Reminders',  icon: <Bell size={16} /> },
  { id: 'reports',   label: 'Reports',            icon: <BarChart3 size={16} /> },
];

// Feature-permission id per sub-tab (Super Admin → Feature Permissions).
const TAB_PERM: Record<SupplierTab, string> = {
  suppliers: 'supplierLedger.suppliers.view',
  payments:  'supplierLedger.payments.view',
  reminders: 'supplierLedger.reminders.view',
  reports:   'supplierLedger.reports.view',
};

type PartyFilter = 'all' | 'suppliers' | 'transporters';
type SortCol = 'name' | 'invoiced' | 'paid' | 'outstanding' | 'nextPayment';

const fmtInr = (n: number) => `₹${(n || 0).toLocaleString('en-IN')}`;
const fmtDate = (d: string) => {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function SupplierLedgerPage() {
  const { tenantId } = useAuth();
  const navigate = useNavigate();
  const can = useFeaturePermissions();

  const [activeTab, setActiveTab] = useHashTab<SupplierTab>(
    VALID_SUPPLIER_TABS, 'suppliers', 'fiinny-tab-supplier-ledger',
    tab => can(TAB_PERM[tab]),
  );

  // Only show tabs the role is permitted to view.
  const visibleTabs = SUPPLIER_MODULE_TABS.filter(tab => can(TAB_PERM[tab.id]));
  const activeAllowed = visibleTabs.some(t => t.id === activeTab);

  useEffect(() => {
    if (!activeAllowed && visibleTabs.length > 0) setActiveTab(visibleTabs[0].id);
  }, [activeAllowed, visibleTabs, setActiveTab]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [search, setSearch] = useState('');
  const [partyFilter, setPartyFilter] = useState<PartyFilter>('all');
  const [upcomingReminders, setUpcomingReminders] = useState<UpcomingReminder[]>([]);
  const [remindersExpanded, setRemindersExpanded] = useState(false);
  const [sortBy, setSortBy] = useState<SortCol>('outstanding');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const loadSuppliers = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const snap = await getDocs(getTenantCollection(db, tenantId, 'suppliers'));
      const list: Supplier[] = snap.docs.map(d => ({ id: d.id, outstandingBalance: 0, ...d.data() } as Supplier));
      setSuppliers(list);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const loadUpcomingReminders = async () => {
    if (!tenantId) return;
    try {
      const snap = await getDocs(getTenantCollection(db, tenantId, 'supplierPaymentReminders'));
      const todayStr = new Date().toISOString().slice(0, 10);
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as UpcomingReminder))
        .filter(r => r.status !== 'completed')
        .sort((a, b) => a.reminderDate.localeCompare(b.reminderDate));
      const overdue = list.filter(r => r.reminderDate < todayStr);
      const upcoming = list.filter(r => r.reminderDate >= todayStr);
      setUpcomingReminders([...overdue, ...upcoming]);
    } catch (e) { console.error(e); }
  };

  // All supplier invoices loaded once for product/invoice-number search
  const [allInvoices, setAllInvoices] = useState<any[]>([]);
  const loadAllInvoices = async () => {
    if (!tenantId) return;
    try {
      const snap = await getDocs(getTenantCollection(db, tenantId, 'supplierInvoices'));
      setAllInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error('Invoice search load error:', e); }
  };

  useEffect(() => { loadSuppliers(); loadUpcomingReminders(); loadAllInvoices(); }, [tenantId]);

  const handleCreated = (openId?: string) => {
    setShowAddSupplier(false);
    if (openId) navigate(`/supplier-ledger/${openId}`);
    else loadSuppliers();
  };

  // Group active reminders by supplierId (upcomingReminders already date-sorted)
  const remindersBySupplierId = useMemo(() => {
    const map = new Map<string, UpcomingReminder[]>();
    for (const r of upcomingReminders) {
      const arr = map.get(r.supplierId) ?? [];
      arr.push(r);
      map.set(r.supplierId, arr);
    }
    return map;
  }, [upcomingReminders]);

  const totalOutstanding = suppliers.reduce((s, sup) => s + (sup.outstandingBalance || 0), 0);
  const totalInvoiced = suppliers.reduce((s, sup) => s + (sup.totalInvoiced || 0), 0);

  const q = search.trim().toLowerCase();
  const partyFiltered = partyFilter === 'all'
    ? suppliers
    : suppliers.filter(sup => (sup.supplierType === 'Transporter') === (partyFilter === 'transporters'));
  const filtered = q
    ? partyFiltered.filter(sup =>
        (sup.name || '').toLowerCase().includes(q) ||
        (sup.phone || '').toLowerCase().includes(q) ||
        (sup.email || '').toLowerCase().includes(q) ||
        (sup.address || '').toLowerCase().includes(q))
    : partyFiltered;

  const handleSort = (col: SortCol) => {
    if (sortBy === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir(col === 'name' ? 'asc' : 'desc');
    }
  };

  const sortedSuppliers = useMemo(() => {
    const arr = [...filtered];
    const todayStr = new Date().toISOString().slice(0, 10);
    arr.sort((a, b) => {
      let diff = 0;
      switch (sortBy) {
        case 'name':
          diff = (a.name || '').localeCompare(b.name || '');
          break;
        case 'invoiced':
          diff = (a.totalInvoiced ?? 0) - (b.totalInvoiced ?? 0);
          break;
        case 'paid':
          diff = (a.totalPaid ?? 0) - (b.totalPaid ?? 0);
          break;
        case 'outstanding':
          diff = a.outstandingBalance - b.outstandingBalance;
          break;
        case 'nextPayment': {
          const aDate = remindersBySupplierId.get(a.id)?.[0]?.reminderDate ?? '9999-12-31';
          const bDate = remindersBySupplierId.get(b.id)?.[0]?.reminderDate ?? '9999-12-31';
          diff = aDate.localeCompare(bDate);
          break;
        }
      }
      return sortDir === 'asc' ? diff : -diff;
    });
    return arr;
  }, [filtered, sortBy, sortDir, remindersBySupplierId]);

  // Product / invoice-number hits — only computed when the query doesn't already
  // match a supplier name/phone/email (avoids duplicate results).
  const productHits = useMemo<InvoiceHit[]>(() => {
    if (q.length < 2) return [];
    // If any supplier name/phone/email matches, show normal supplier results only.
    const supplierMatch = suppliers.some(s =>
      (s.name || '').toLowerCase().includes(q) ||
      (s.phone || '').toLowerCase().includes(q) ||
      (s.email || '').toLowerCase().includes(q),
    );
    if (supplierMatch) return [];

    const hits: InvoiceHit[] = [];
    for (const inv of allInvoices) {
      const invNum = (inv.supplierInvoiceNumber || inv.internalPurchaseId || '').toLowerCase();
      const lines: any[] = inv.lines || [];
      const matchedProducts = lines
        .filter((l: any) =>
          (l.productName || '').toLowerCase().includes(q) ||
          (l.batchNumber || '').toLowerCase().includes(q),
        )
        .map((l: any) => l.productName);

      if (invNum.includes(q) || matchedProducts.length > 0) {
        hits.push({
          invoiceId: inv.id,
          supplierId: inv.supplierId || '',
          supplierName: inv.supplierName || '—',
          invoiceNumber: inv.supplierInvoiceNumber || inv.internalPurchaseId || inv.id.slice(0, 8).toUpperCase(),
          invoiceDate: inv.invoiceDate || '',
          matchedProducts: [...new Set(matchedProducts)],
        });
      }
    }
    // Sort by date descending
    hits.sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate));

    // Group by supplier: keep all hits but deduplicate products per supplier for the summary
    return hits;
  }, [q, allInvoices, suppliers]);

  // Group product hits by supplier for the summary display
  const productHitsBySupplier = useMemo(() => {
    const map = new Map<string, { supplierName: string; supplierId: string; invoices: InvoiceHit[] }>();
    for (const h of productHits) {
      const key = h.supplierId || h.supplierName;
      if (!map.has(key)) map.set(key, { supplierName: h.supplierName, supplierId: h.supplierId, invoices: [] });
      map.get(key)!.invoices.push(h);
    }
    return [...map.values()];
  }, [productHits]);

  const sortIndicator = (col: SortCol) =>
    sortBy === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  const thStyle = (col: SortCol, align: 'left' | 'right' | 'center' = 'right'): React.CSSProperties => ({
    padding: '0.6rem 0.75rem',
    fontWeight: 700,
    fontSize: '0.71rem',
    color: sortBy === col ? 'var(--primary-light)' : 'var(--text-tertiary)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    whiteSpace: 'nowrap' as const,
    cursor: 'pointer',
    textAlign: align,
    userSelect: 'none' as const,
    background: 'var(--surface-raised)',
    borderBottom: '2px solid var(--surface-border)',
  });

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="animate-fade-in" style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Truck size={24} className="primary-gradient-text" /> Supplier Ledger
          </h1>
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Track what you owe to each supplier
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={() => navigate('/careoff-sync')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Link2 size={16} /> Sync Care-Off → AR
          </button>
          <button className="btn btn-primary" onClick={() => setShowAddSupplier(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Plus size={16} /> Add Supplier
          </button>
        </div>
      </div>

      {/* Summary cards — always visible */}

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
        {[
          { label: 'Total Suppliers', value: suppliers.length, icon: <Building2 size={18} />, color: 'var(--primary-light)' },
          { label: 'Total Outstanding', value: fmtInr(totalOutstanding), icon: <IndianRupee size={18} />, color: '#ff4d4f' },
          { label: 'Total Invoiced', value: fmtInr(totalInvoiced), icon: <Package size={18} />, color: '#ff9800' },
        ].map(c => (
          <div key={c.label} className="glass-panel" style={{ padding: '1.2rem', borderRadius: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: c.color, marginBottom: '0.5rem' }}>
              {c.icon}
              <span style={{ fontSize: '0.78rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.label}</span>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Module Tab Bar */}
      <div style={{
        display: 'flex', gap: '0.25rem',
        borderBottom: '2px solid var(--surface-border)',
        overflowX: 'auto', scrollbarWidth: 'none',
        marginBottom: '1.5rem',
        paddingBottom: 0,
      }}>
        {visibleTabs.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.65rem 1.25rem',
                background: 'transparent', border: 'none',
                borderBottom: isActive ? '2px solid var(--primary-light)' : '2px solid transparent',
                marginBottom: '-2px',
                color: isActive ? 'var(--primary-light)' : 'var(--text-tertiary)',
                fontWeight: isActive ? 700 : 400,
                fontSize: '0.9rem', cursor: 'pointer', fontFamily: 'inherit',
                whiteSpace: 'nowrap',
                transition: 'color 0.15s ease, border-color 0.15s ease',
                flexShrink: 0,
              }}
              onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)'; }}
              onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-tertiary)'; }}
            >
              <span style={{ opacity: isActive ? 1 : 0.6, display: 'flex' }}>{tab.icon}</span>
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Suppliers Tab ── */}
      {activeAllowed && activeTab === 'suppliers' && <>

      {/* Upcoming Payment Reminders dashboard card */}
      {upcomingReminders.length > 0 && (
        <div className="glass-panel" style={{ borderRadius: '12px', padding: '0.85rem 1.25rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: remindersExpanded || upcomingReminders.length <= 3 ? '0.65rem' : 0, flexWrap: 'wrap' }}>
            <Bell size={15} style={{ color: '#f59e0b', flexShrink: 0 }} />
            <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)' }}>Upcoming Payment Reminders</span>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)' }}>({upcomingReminders.length} pending)</span>
            {upcomingReminders.length > 3 && (
              <button
                onClick={() => setRemindersExpanded(e => !e)}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary-light)', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.78rem', fontWeight: 600 }}
              >
                {remindersExpanded ? <><ChevronDown size={13} /> Collapse</> : <><ChevronRight size={13} /> Show all</>}
              </button>
            )}
          </div>
          {(remindersExpanded || upcomingReminders.length > 0) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {(remindersExpanded ? upcomingReminders : upcomingReminders.slice(0, 3)).map(r => {
                const isOverdue = r.reminderDate < todayStr;
                const sc = isOverdue ? '#ef4444' : '#3b82f6';
                return (
                  <button
                    key={r.id}
                    onClick={() => navigate(`/supplier-ledger/${r.supplierId}?tab=reminders&reminderId=${r.id}`)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.5rem 0.85rem',
                      borderRadius: '8px', background: 'var(--surface-raised)', border: 'none',
                      cursor: 'pointer', textAlign: 'left', borderLeft: `3px solid ${sc}`,
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-border)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'var(--surface-raised)')}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        {r.supplierName}
                        {isOverdue && <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem', borderRadius: '999px', background: '#ef444422', color: '#ef4444', fontWeight: 700 }}>OVERDUE</span>}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '0.05rem' }}>{r.title}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: '0.68rem', color: '#f59e0b', fontWeight: 600, marginBottom: '0.05rem' }}>
                        Remind: {fmtDate(r.reminderDate)}
                      </div>
                      {r.commitmentDate && r.commitmentDate !== r.reminderDate && (
                        <div style={{ fontSize: '0.68rem', color: '#10b981', fontWeight: 600, marginBottom: '0.05rem' }}>
                          Pay by: {fmtDate(r.commitmentDate)}
                        </div>
                      )}
                      {r.amount > 0 && <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{fmtInr(r.amount)}</div>}
                    </div>
                    <ChevronRight size={13} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Controls row: party filter + search + count */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '0.3rem' }}>
          {([
            { key: 'all', label: 'All' },
            { key: 'suppliers', label: 'Suppliers' },
            { key: 'transporters', label: 'Transporters' },
          ] as const).map(f => (
            <button
              key={f.key}
              onClick={() => setPartyFilter(f.key)}
              className={partyFilter === f.key ? 'btn btn-primary' : 'btn btn-secondary'}
              style={{ padding: '0.3rem 0.85rem', fontSize: '0.78rem' }}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: '380px' }}>
          <Search size={14} style={{ position: 'absolute', left: '0.7rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', pointerEvents: 'none' }} />
          <input
            className="input-field"
            placeholder="Search by name, phone, email, product, invoice no, batch…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: '2.1rem', paddingRight: search ? '2rem' : undefined, margin: 0, height: '36px', fontSize: '0.85rem' }}
          />
          {search && (
            <button onClick={() => setSearch('')}
              style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex' }}>
              <X size={14} />
            </button>
          )}
        </div>

        <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
          {sortedSuppliers.length}{q ? ` of ${suppliers.length}` : ''} supplier{sortedSuppliers.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Product / invoice-number search results */}
      {productHits.length > 0 && (
        <div className="glass-panel" style={{ borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '1rem', border: '1px solid hsla(220,70%,55%,0.25)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <Package size={15} color="#4f8ef7" />
            <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
              Product Search Results
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
              — "{search}" found in {productHits.length} invoice{productHits.length !== 1 ? 's' : ''} across {productHitsBySupplier.length} supplier{productHitsBySupplier.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {productHitsBySupplier.map(group => (
              <div key={group.supplierId || group.supplierName} style={{ background: 'var(--surface-raised)', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--surface-border)' }}>
                {/* Supplier header row */}
                <button
                  onClick={() => group.supplierId && navigate(`/supplier-ledger/${group.supplierId}`)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 0.85rem', background: 'none', border: 'none', cursor: group.supplierId ? 'pointer' : 'default', textAlign: 'left' }}
                >
                  <Building2 size={13} color="var(--primary-light)" />
                  <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{group.supplierName}</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>{group.invoices.length} invoice{group.invoices.length !== 1 ? 's' : ''}</span>
                  {group.supplierId && <ChevronRight size={13} style={{ marginLeft: 'auto', color: 'var(--text-tertiary)' }} />}
                </button>
                {/* Individual invoice rows */}
                <div style={{ borderTop: '1px solid var(--surface-border)' }}>
                  {group.invoices.map(hit => (
                    <button
                      key={hit.invoiceId}
                      onClick={() => navigate(hit.supplierId ? `/supplier-ledger/${hit.supplierId}?tab=invoices` : `/supplier-invoice?id=${hit.invoiceId}`)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.45rem 0.85rem 0.45rem 1.75rem', background: 'none', border: 'none', borderTop: '1px solid var(--surface-border)', cursor: 'pointer', textAlign: 'left', transition: 'background 0.12s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'hsla(220,70%,55%,0.06)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <FileText size={12} color="#4f8ef7" style={{ flexShrink: 0 }} />
                      <span style={{ fontWeight: 600, fontSize: '0.8rem', color: '#4f8ef7', whiteSpace: 'nowrap' }}>
                        {hit.invoiceNumber}
                      </span>
                      {hit.invoiceDate && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                          {fmtDate(hit.invoiceDate)}
                        </span>
                      )}
                      {hit.matchedProducts.length > 0 && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          · {hit.matchedProducts.join(', ')}
                        </span>
                      )}
                      <ChevronRight size={12} style={{ marginLeft: 'auto', color: 'var(--text-tertiary)', flexShrink: 0 }} />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-tertiary)' }}>
          <Loader2 size={24} className="animate-spin" style={{ marginBottom: '0.5rem' }} />
          <div>Loading suppliers…</div>
        </div>
      ) : sortedSuppliers.length === 0 ? (
        <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-tertiary)', borderRadius: '12px' }}>
          <Building2 size={40} style={{ margin: '0 auto 0.75rem', opacity: 0.25 }} />
          {suppliers.length === 0 ? (
            <>
              <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>No suppliers yet</div>
              <div style={{ fontSize: '0.82rem' }}>Add your first supplier to get started.</div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>No suppliers match "{search}"</div>
              <div style={{ fontSize: '0.82rem' }}>Try a different name, phone, email, product or invoice number.</div>
            </>
          )}
        </div>
      ) : (
        <div className="glass-panel" style={{ borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle('name', 'left'), paddingLeft: '1rem' }} onClick={() => handleSort('name')}>
                    Company{sortIndicator('name')}
                  </th>
                  <th style={thStyle('invoiced')} onClick={() => handleSort('invoiced')}>
                    Total Invoiced{sortIndicator('invoiced')}
                  </th>
                  <th style={thStyle('paid')} onClick={() => handleSort('paid')}>
                    Total Paid{sortIndicator('paid')}
                  </th>
                  <th style={thStyle('outstanding')} onClick={() => handleSort('outstanding')}>
                    Outstanding{sortIndicator('outstanding')}
                  </th>
                  <th style={thStyle('nextPayment')} onClick={() => handleSort('nextPayment')}>
                    Next Payment{sortIndicator('nextPayment')}
                  </th>
                  <th style={{ ...thStyle('name', 'left'), cursor: 'default', color: 'var(--text-tertiary)' }}>
                    Reminders
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedSuppliers.map((sup, i) => {
                  const reminders = remindersBySupplierId.get(sup.id) ?? [];
                  const nextReminder = reminders[0];
                  const isOverdue = nextReminder && nextReminder.reminderDate < todayStr;
                  const dateColor = isOverdue ? '#ef4444' : '#3b82f6';
                  const rowBg = i % 2 === 0 ? 'transparent' : 'var(--surface-raised)';

                  return (
                    <tr
                      key={sup.id}
                      onClick={() => navigate(`/supplier-ledger/${sup.id}`)}
                      style={{ borderTop: '1px solid var(--surface-border)', background: rowBg, transition: 'background 0.1s', cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'hsla(152,60%,40%,0.06)')}
                      onMouseLeave={e => (e.currentTarget.style.background = rowBg)}
                    >
                      {/* Company */}
                      <td style={{ padding: '0.6rem 0.75rem 0.6rem 1rem' }}>
                        <button
                          onClick={() => navigate(`/supplier-ledger/${sup.id}`)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, display: 'flex', alignItems: 'center', gap: '0.45rem' }}
                        >
                          <Building2 size={14} style={{ color: 'var(--primary-light)', flexShrink: 0 }} />
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{sup.name}</span>
                          {sup.supplierType === 'Transporter' && (
                            <span style={{ fontSize: '0.63rem', padding: '0.1rem 0.35rem', borderRadius: '999px', background: 'hsla(220,70%,55%,0.12)', color: '#4f8ef7', fontWeight: 700, flexShrink: 0 }}>
                              TRANSPORT
                            </span>
                          )}
                        </button>
                      </td>

                      {/* Total Invoiced */}
                      <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 500 }}>
                        {fmtInr(sup.totalInvoiced ?? 0)}
                      </td>

                      {/* Total Paid */}
                      <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', color: '#10b981', fontWeight: 600 }}>
                        {fmtInr(sup.totalPaid ?? 0)}
                      </td>

                      {/* Outstanding */}
                      <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right' }}>
                        <span style={{ fontWeight: 700, color: sup.outstandingBalance > 0 ? '#ff4d4f' : '#10b981' }}>
                          {fmtInr(sup.outstandingBalance)}
                        </span>
                      </td>

                      {/* Next Payment Date */}
                      <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {nextReminder ? (
                          <span style={{ color: dateColor, fontSize: '0.82rem', fontWeight: 600 }}>
                            {fmtDate(nextReminder.reminderDate)}
                            {isOverdue && (
                              <span style={{ marginLeft: '0.35rem', fontSize: '0.63rem', padding: '0.05rem 0.3rem', borderRadius: '999px', background: '#ef444422', color: '#ef4444', fontWeight: 700 }}>
                                overdue
                              </span>
                            )}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                        )}
                      </td>

                      {/* Payment Reminder */}
                      <td style={{ padding: '0.6rem 0.75rem' }}>
                        {reminders.length > 0 ? (
                          <button
                            onClick={() => navigate(`/supplier-ledger/${sup.id}?tab=reminders`)}
                            style={{
                              background: 'hsla(220,70%,55%,0.1)', border: '1px solid hsla(220,70%,55%,0.25)',
                              borderRadius: '999px', cursor: 'pointer', padding: '0.2rem 0.6rem',
                              display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                              color: '#4f8ef7', fontWeight: 600, fontSize: '0.76rem',
                            }}
                          >
                            <Bell size={11} />
                            {reminders.length} Upcoming
                          </button>
                        ) : (
                          <span style={{ color: 'var(--text-tertiary)', fontSize: '0.78rem' }}>No Active</span>
                        )}
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      </> /* end Suppliers tab */}

      {/* ── Payments Tab (supplier invoices list) ── */}
      {activeAllowed && activeTab === 'payments' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Supplier Invoices</h2>
            <button className="btn btn-primary" onClick={() => navigate('/supplier-invoice')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
              <Plus size={15} /> Record Invoice
            </button>
          </div>
          {allInvoices.length === 0 ? (
            <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-tertiary)', borderRadius: '12px' }}>
              <FileText size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.25 }} />
              <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>No invoices recorded yet</div>
              <div style={{ fontSize: '0.82rem' }}>Record a supplier invoice to get started.</div>
            </div>
          ) : (
            <div className="glass-panel" style={{ borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      {['Invoice #', 'Supplier', 'Date', 'Amount', ''].map(h => (
                        <th key={h} style={{ padding: '0.6rem 0.75rem', fontWeight: 700, fontSize: '0.71rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: h === 'Amount' ? 'right' : 'left', background: 'var(--surface-raised)', borderBottom: '2px solid var(--surface-border)', whiteSpace: 'nowrap' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...allInvoices].sort((a, b) => (b.invoiceDate || '').localeCompare(a.invoiceDate || '')).map((inv, i) => {
                      const rowBg = i % 2 === 0 ? 'transparent' : 'var(--surface-raised)';
                      const invNum = inv.supplierInvoiceNumber || inv.internalPurchaseId || inv.id.slice(0, 8).toUpperCase();
                      const totalAmt = inv.lines?.reduce((s: number, l: any) => s + (Number(l.finalAmount) || Number(l.amount) || 0), 0) || inv.grandTotal || 0;
                      return (
                        <tr key={inv.id} style={{ borderTop: '1px solid var(--surface-border)', background: rowBg, cursor: 'pointer', transition: 'background 0.1s' }}
                          onClick={() => navigate(inv.supplierId ? `/supplier-ledger/${inv.supplierId}?tab=invoices` : `/supplier-invoice?id=${inv.id}`)}
                          onMouseEnter={e => (e.currentTarget.style.background = 'hsla(152,60%,40%,0.06)')}
                          onMouseLeave={e => (e.currentTarget.style.background = rowBg)}>
                          <td style={{ padding: '0.6rem 0.75rem', fontWeight: 600, color: 'var(--primary-light)' }}>{invNum}</td>
                          <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text-primary)' }}>{inv.supplierName || '—'}</td>
                          <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{inv.invoiceDate ? fmtDate(inv.invoiceDate) : '—'}</td>
                          <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontWeight: 600 }}>{fmtInr(totalAmt)}</td>
                          <td style={{ padding: '0.6rem 0.75rem' }}><ChevronRight size={14} style={{ color: 'var(--text-tertiary)' }} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Reminders Tab ── */}
      {activeAllowed && activeTab === 'reminders' && (
        <div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 1rem' }}>Payment Reminders</h2>
          {upcomingReminders.length === 0 ? (
            <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-tertiary)', borderRadius: '12px' }}>
              <Bell size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.25 }} />
              <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>No active reminders</div>
              <div style={{ fontSize: '0.82rem' }}>Open a supplier's detail page to set a payment reminder.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {upcomingReminders.map(r => {
                const isOverdue = r.reminderDate < todayStr;
                const sc = isOverdue ? '#ef4444' : '#3b82f6';
                return (
                  <button
                    key={r.id}
                    onClick={() => navigate(`/supplier-ledger/${r.supplierId}?tab=reminders&reminderId=${r.id}`)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 1rem',
                      borderRadius: '10px', background: 'var(--surface-raised)', border: '1px solid var(--surface-border)',
                      cursor: 'pointer', textAlign: 'left', borderLeft: `4px solid ${sc}`,
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-border)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'var(--surface-raised)')}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        {r.supplierName}
                        {isOverdue && <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '999px', background: '#ef444422', color: '#ef4444', fontWeight: 700 }}>OVERDUE</span>}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginTop: '0.15rem' }}>{r.title}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: '0.72rem', color: '#f59e0b', fontWeight: 600, marginBottom: '0.1rem' }}>Remind: {fmtDate(r.reminderDate)}</div>
                      {r.commitmentDate && r.commitmentDate !== r.reminderDate && (
                        <div style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 600, marginBottom: '0.1rem' }}>Pay by: {fmtDate(r.commitmentDate)}</div>
                      )}
                      {r.amount > 0 && <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{fmtInr(r.amount)}</div>}
                    </div>
                    <ChevronRight size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Reports Tab ── */}
      {activeAllowed && activeTab === 'reports' && (
        <div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 1rem' }}>Supplier Reports</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            {[
              { label: 'Total Suppliers', value: suppliers.filter(s => s.supplierType !== 'Transporter').length, color: 'var(--primary-light)', icon: <Building2 size={18} /> },
              { label: 'Transporters', value: suppliers.filter(s => s.supplierType === 'Transporter').length, color: '#8b5cf6', icon: <Truck size={18} /> },
              { label: 'Overdue Reminders', value: upcomingReminders.filter(r => r.reminderDate < todayStr).length, color: '#ef4444', icon: <Bell size={18} /> },
              { label: 'Total Invoices', value: allInvoices.length, color: '#f59e0b', icon: <FileText size={18} /> },
            ].map(c => (
              <div key={c.label} className="glass-panel" style={{ padding: '1.2rem', borderRadius: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: c.color, marginBottom: '0.5rem' }}>
                  {c.icon}
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.label}</span>
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: 700, color: c.color }}>{c.value}</div>
              </div>
            ))}
          </div>
          <div className="glass-panel" style={{ borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--surface-border)', fontWeight: 700, fontSize: '0.9rem' }}>Top Suppliers by Outstanding</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <tbody>
                  {[...suppliers].sort((a, b) => b.outstandingBalance - a.outstandingBalance).slice(0, 10).map((sup, i) => (
                    <tr key={sup.id} style={{ borderTop: i > 0 ? '1px solid var(--surface-border)' : undefined, cursor: 'pointer' }}
                      onClick={() => navigate(`/supplier-ledger/${sup.id}`)}
                      onMouseEnter={e => (e.currentTarget.style.background = 'hsla(152,60%,40%,0.06)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{ padding: '0.6rem 0.75rem' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{sup.name}</div>
                        {sup.supplierType === 'Transporter' && <div style={{ fontSize: '0.7rem', color: '#8b5cf6' }}>Transporter</div>}
                      </td>
                      <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', color: 'var(--text-secondary)' }}>Invoiced: {fmtInr(sup.totalInvoiced ?? 0)}</td>
                      <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', color: '#10b981' }}>Paid: {fmtInr(sup.totalPaid ?? 0)}</td>
                      <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontWeight: 700, color: sup.outstandingBalance > 0 ? '#ff4d4f' : '#10b981' }}>{fmtInr(sup.outstandingBalance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Add Supplier Modal */}
      {showAddSupplier && (
        <SupplierFormModal
          mode="create"
          onClose={() => setShowAddSupplier(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
