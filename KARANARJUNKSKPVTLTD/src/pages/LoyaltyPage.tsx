import { useState, useEffect } from 'react';
import { Star, Users, Settings, Loader2, Save, TrendingUp, Gift, Search, Plus, Trash2, AlertTriangle, Download, X, Award, IndianRupee } from 'lucide-react';
import {
  query, orderBy, limit, getDocs, getDoc,
  setDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection, getTenantDoc } from '../utils/tenantPath';
import { useToast } from '../contexts/ToastContext';

interface LoyaltyConfig {
  pointsPerRupee: number;
  pointsValue: number;   // rupee value of 1 point when redeeming
  minRedeemPoints: number;
  tiers: { name: string; minPoints: number; multiplier: number }[];
  enabled: boolean;
}

interface CustomerLoyalty {
  id: string;
  name?: string;
  phone?: string;
  points: number;
  totalSpend: number;
  totalPointsEarned: number;
  totalPointsRedeemed: number;
  tier?: string;
  lastActivity?: any;
  lastTransactionAt?: any;
}

// Normalizes a raw loyalty/{phone} doc into the canonical shape, regardless of
// whether it was written before or after this field standardization. Legacy
// docs only ever had customerName/totalSpend (₹) — they have no historical
// record of totalPointsEarned/totalPointsRedeemed (points), since those weren't
// tracked pre-Phase-2. We do NOT fabricate a points figure from a ₹ figure
// (wrong unit, would mislead); such docs simply show 0 until their next POS
// transaction starts accumulating the canonical fields going forward.
function normalizeCustomerLoyalty(id: string, data: any): CustomerLoyalty {
  return {
    id,
    name: data.name || data.customerName || undefined,
    phone: data.phone || undefined,
    points: Math.max(0, Number(data.points) || 0),
    totalSpend: Math.max(0, Number(data.totalSpend) || 0),
    totalPointsEarned: Math.max(0, Number(data.totalPointsEarned) || 0),
    totalPointsRedeemed: Math.max(0, Number(data.totalPointsRedeemed) || 0),
    tier: data.tier || undefined,
    lastActivity: data.lastActivity,
    lastTransactionAt: data.lastTransactionAt || data.lastActivity,
  };
}

const DEFAULT_CONFIG: LoyaltyConfig = {
  pointsPerRupee: 1,
  pointsValue: 0.25,
  minRedeemPoints: 100,
  tiers: [
    { name: 'Silver', minPoints: 0, multiplier: 1 },
    { name: 'Gold', minPoints: 500, multiplier: 1.5 },
    { name: 'Platinum', minPoints: 2000, multiplier: 2 },
  ],
  enabled: true,
};

function getTier(points: number, tiers: LoyaltyConfig['tiers']) {
  const sorted = [...tiers].sort((a, b) => b.minPoints - a.minPoints);
  return sorted.find(t => points >= t.minPoints)?.name || tiers[0]?.name || 'Silver';
}

const TIER_BADGE_COLORS: Record<string, { bg: string; color: string }> = {
  Silver: { bg: 'hsla(220, 15%, 55%, 0.12)', color: 'var(--text-secondary)' },
  Gold: { bg: 'hsla(45, 93%, 47%, 0.14)', color: 'hsl(38, 92%, 38%)' },
  Platinum: { bg: 'hsla(270, 60%, 55%, 0.14)', color: 'hsl(270, 55%, 45%)' },
};

// "Active" has no dedicated tracking field — there is no per-transaction
// ledger, only a running lastTransactionAt timestamp. We treat a customer as
// active if they've transacted in the last 90 days; this is a heuristic, not
// an exact business rule, and is labelled as such in the UI.
const ACTIVE_WINDOW_DAYS = 90;

function toMillis(value: any): number | null {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function isActiveMember(c: CustomerLoyalty): boolean {
  const ts = toMillis(c.lastTransactionAt);
  if (ts === null) return false;
  return Date.now() - ts <= ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

function csvEscape(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

export default function LoyaltyPage() {
  const { tenantId } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'customers' | 'config'>('customers');
  const [config, setConfig] = useState<LoyaltyConfig>(DEFAULT_CONFIG);
  const [configLoading, setConfigLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [customers, setCustomers] = useState<CustomerLoyalty[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customersError, setCustomersError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [activityFilter, setActivityFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [minPointsFilter, setMinPointsFilter] = useState('');
  const [maxPointsFilter, setMaxPointsFilter] = useState('');

  if (!tenantId) return null;

  // Load config — canonical doc is settings/loyaltyConfig (the one POS actually reads).
  // Falls back to the legacy settings/loyalty doc for tenants who only ever saved there,
  // so existing configuration is not silently lost when this page first loads post-fix.
  // Any failure here is non-fatal — DEFAULT_CONFIG (already the initial state) remains
  // in effect, and the page still renders; it does not block POS checkout either way,
  // since POS reads its own copy of this same document independently.
  useEffect(() => {
    const canonicalRef = getTenantDoc(db, tenantId!, 'settings', 'loyaltyConfig');
    getDoc(canonicalRef).then(async snap => {
      if (snap.exists()) {
        setConfig({ ...DEFAULT_CONFIG, ...snap.data() } as LoyaltyConfig);
        return;
      }
      // No canonical doc yet — check the legacy doc so old admin edits aren't lost.
      const legacyRef = getTenantDoc(db, tenantId!, 'settings', 'loyalty');
      const legacySnap = await getDoc(legacyRef);
      if (legacySnap.exists()) {
        setConfig({ ...DEFAULT_CONFIG, ...legacySnap.data() } as LoyaltyConfig);
      }
    }).catch(() => {
      // Swallow — DEFAULT_CONFIG stays in effect, page remains usable.
    }).finally(() => setConfigLoading(false));
  }, [tenantId]);

  // Load customers
  useEffect(() => {
    if (activeTab !== 'customers') return;
    setCustomersLoading(true);
    setCustomersError(null);
    const col = getTenantCollection(db, tenantId!, 'loyalty');
    getDocs(query(col, orderBy('points', 'desc'), limit(100)))
      .then(snap => setCustomers(snap.docs.map(d => normalizeCustomerLoyalty(d.id, d.data()))))
      .catch(() => setCustomersError('Could not load loyalty customers. Check your connection and try again.'))
      .finally(() => setCustomersLoading(false));
  }, [tenantId, activeTab]);

  // Lightweight, backward-compatible validation — clamps obviously-invalid values
  // to safe defaults instead of rejecting the save outright, so it can never leave
  // POS checkout with a config value that would break its point/discount math.
  function sanitizeConfig(c: LoyaltyConfig): LoyaltyConfig {
    return {
      ...c,
      pointsPerRupee: c.pointsPerRupee > 0 ? c.pointsPerRupee : DEFAULT_CONFIG.pointsPerRupee,
      pointsValue: c.pointsValue > 0 ? c.pointsValue : DEFAULT_CONFIG.pointsValue,
      minRedeemPoints: c.minRedeemPoints >= 0 ? c.minRedeemPoints : DEFAULT_CONFIG.minRedeemPoints,
      tiers: c.tiers.length > 0
        ? c.tiers.map(t => ({
            name: t.name?.trim() || 'Unnamed Tier',
            minPoints: t.minPoints >= 0 ? t.minPoints : 0,
            multiplier: t.multiplier > 0 ? t.multiplier : 1,
          }))
        : DEFAULT_CONFIG.tiers,
    };
  }

  async function saveConfig() {
    setSavingConfig(true);
    try {
      const safeConfig = sanitizeConfig(config);
      const ref = getTenantDoc(db, tenantId!, 'settings', 'loyaltyConfig');
      await setDoc(ref, { ...safeConfig, updatedAt: serverTimestamp() }, { merge: true });
      setConfig(safeConfig);
      showToast('Loyalty config saved', 'success');
    } catch (e: any) {
      showToast('Failed to save: ' + e.message, 'error');
    } finally {
      setSavingConfig(false);
    }
  }

  function updateTier(idx: number, field: keyof LoyaltyConfig['tiers'][0], value: string | number) {
    setConfig(c => ({
      ...c,
      tiers: c.tiers.map((t, i) => i === idx ? { ...t, [field]: field === 'name' ? value : Number(value) } : t),
    }));
  }

  function addTier() {
    setConfig(c => ({ ...c, tiers: [...c.tiers, { name: 'New Tier', minPoints: 0, multiplier: 1 }] }));
  }

  function removeTier(idx: number) {
    setConfig(c => ({ ...c, tiers: c.tiers.filter((_, i) => i !== idx) }));
  }

  const availableTiers = Array.from(new Set(config.tiers.map(t => t.name)));

  const minPoints = minPointsFilter === '' ? null : Number(minPointsFilter);
  const maxPoints = maxPointsFilter === '' ? null : Number(maxPointsFilter);

  const filtered = customers.filter(c => {
    if (searchTerm && !(c.name?.toLowerCase().includes(searchTerm.toLowerCase()) || c.phone?.includes(searchTerm))) return false;
    if (tierFilter !== 'all' && getTier(c.points, config.tiers) !== tierFilter) return false;
    if (activityFilter === 'active' && !isActiveMember(c)) return false;
    if (activityFilter === 'inactive' && isActiveMember(c)) return false;
    if (minPoints !== null && !Number.isNaN(minPoints) && c.points < minPoints) return false;
    if (maxPoints !== null && !Number.isNaN(maxPoints) && c.points > maxPoints) return false;
    return true;
  });

  const hasActiveFilters = !!searchTerm || tierFilter !== 'all' || activityFilter !== 'all' || minPointsFilter !== '' || maxPointsFilter !== '';

  function clearFilters() {
    setSearchTerm('');
    setTierFilter('all');
    setActivityFilter('all');
    setMinPointsFilter('');
    setMaxPointsFilter('');
  }

  function exportCustomersCSV() {
    const headers = ['Name', 'Phone', 'Tier', 'Current Points', 'Total Earned', 'Total Redeemed', 'Lifetime Spend', 'Active'];
    const rows = filtered.map(c => [
      c.name || '', c.phone || c.id, getTier(c.points, config.tiers),
      c.points, c.totalPointsEarned, c.totalPointsRedeemed, c.totalSpend,
      isActiveMember(c) ? 'Yes' : 'No',
    ].map(csvEscape).join(','));
    const csvContent = [headers.map(csvEscape).join(','), ...rows].join('\n');
    const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.setAttribute('href', URL.createObjectURL(blob));
    link.setAttribute('download', `loyalty-customers-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Dashboard aggregates — all derived from the already-loaded customer list
  // (capped at 100 docs, same limitation as the table above; there is no
  // server-side aggregate query backing these numbers yet).
  const totalPoints = customers.reduce((s, c) => s + (c.points || 0), 0);
  const totalCustomers = customers.length;
  const activeMembers = customers.filter(isActiveMember).length;
  const totalPointsIssued = customers.reduce((s, c) => s + (c.totalPointsEarned || 0), 0);
  const totalPointsRedeemedAll = customers.reduce((s, c) => s + (c.totalPointsRedeemed || 0), 0);
  const totalDiscountGiven = totalPointsRedeemedAll * config.pointsValue;
  const tierDistribution = availableTiers.map(name => ({
    name,
    count: customers.filter(c => getTier(c.points, config.tiers) === name).length,
  }));
  const topCustomers = [...customers].sort((a, b) => b.points - a.points).slice(0, 5);

  if (configLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: 'var(--text-tertiary)' }}>
        <Loader2 size={24} className="animate-spin" />
      </div>
    );
  }

  const statCards = [
    { label: 'Total Customers', value: totalCustomers.toLocaleString(), icon: <Users size={18} />, color: 'var(--primary-light)' },
    { label: 'Active Members', value: activeMembers.toLocaleString(), icon: <Award size={18} />, color: 'var(--success)' },
    { label: 'Points Issued', value: totalPointsIssued.toLocaleString(), icon: <TrendingUp size={18} />, color: 'var(--secondary)' },
    { label: 'Points Redeemed', value: totalPointsRedeemedAll.toLocaleString(), icon: <Gift size={18} />, color: 'hsl(270, 55%, 55%)' },
    { label: 'Outstanding Points', value: totalPoints.toLocaleString(), icon: <Star size={18} />, color: 'var(--primary)' },
    { label: 'Discounts Given', value: `₹${totalDiscountGiven.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, icon: <IndianRupee size={18} />, color: '#ff9800' },
  ];

  return (
    <div className="animate-fade-in" style={{ maxWidth: '1100px', margin: '0 auto', padding: '1.5rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Star size={24} className="primary-gradient-text" /> Loyalty & Memberships
          </h1>
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Reward repeat customers with points and tiers
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        {statCards.map(c => (
          <div key={c.label} className="glass-panel" style={{ padding: '1.2rem', borderRadius: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: c.color, marginBottom: '0.5rem' }}>
              {c.icon}
              <span style={{ fontSize: '0.78rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.label}</span>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Tier distribution + top customers */}
      {totalCustomers > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, margin: '0 0 0.9rem' }}>Tier Distribution</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {tierDistribution.map(t => {
                const badge = TIER_BADGE_COLORS[t.name] || TIER_BADGE_COLORS.Silver;
                const pct = totalCustomers > 0 ? Math.round((t.count / totalCustomers) * 100) : 0;
                return (
                  <div key={t.name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.3rem' }}>
                      <span style={{ fontWeight: 600, color: badge.color }}>{t.name}</span>
                      <span style={{ color: 'var(--text-tertiary)' }}>{t.count} ({pct}%)</span>
                    </div>
                    <div style={{ height: '6px', borderRadius: '999px', background: 'var(--surface-raised)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: badge.color, borderRadius: '999px' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, margin: '0 0 0.9rem' }}>Top Customers by Points</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {topCustomers.map((c, i) => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)', minWidth: 0 }}>
                    <span style={{ color: 'var(--text-tertiary)', width: '1rem', flexShrink: 0 }}>{i + 1}.</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name || c.phone || c.id}</span>
                  </span>
                  <span style={{ fontWeight: 700, color: 'var(--primary-light)', flexShrink: 0, marginLeft: '0.5rem' }}>{c.points.toLocaleString()} pts</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--surface-raised)', padding: '0.25rem', borderRadius: '12px', width: 'fit-content', marginBottom: '1.5rem', border: '1px solid var(--surface-border)' }}>
        {(['customers', 'config'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.5rem 1.1rem', borderRadius: '9px', fontSize: '0.875rem', fontWeight: 600,
              border: 'none', cursor: 'pointer', transition: 'all var(--transition-fast)',
              background: activeTab === tab ? 'var(--surface-base)' : 'transparent',
              color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-tertiary)',
              boxShadow: activeTab === tab ? '0 1px 4px hsla(220,45%,10%,0.08)' : 'none',
            }}
          >
            {tab === 'customers' ? <><Users size={15} /> Customers</> : <><Settings size={15} /> Config</>}
          </button>
        ))}
      </div>

      {/* Customers tab */}
      {activeTab === 'customers' && (
        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          {customersError && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.75rem 1rem', marginBottom: '1rem',
              background: 'hsla(0, 84%, 55%, 0.08)', border: '1px solid hsla(0, 84%, 55%, 0.2)', borderRadius: '10px',
              color: 'var(--danger)', fontSize: '0.85rem',
            }}>
              <AlertTriangle size={16} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{customersError}</span>
              <button
                onClick={() => setCustomersError(null)}
                aria-label="Dismiss error"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', display: 'flex', padding: '0.15rem' }}
              >
                <X size={15} />
              </button>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
              <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
              <input
                style={{
                  width: '100%', padding: '0.6rem 0.75rem 0.6rem 2.25rem', fontSize: '0.875rem',
                  border: '1px solid var(--surface-border)', borderRadius: '10px',
                  background: 'var(--surface-base)', color: 'var(--text-primary)', outline: 'none',
                }}
                placeholder="Search by name or phone…"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            <button
              onClick={exportCustomersCSV}
              disabled={filtered.length === 0}
              className="btn btn-secondary"
              style={{ padding: '0.6rem 0.9rem', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.4rem', opacity: filtered.length === 0 ? 0.5 : 1 }}
            >
              <Download size={14} /> Export CSV
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <select
              value={tierFilter}
              onChange={e => setTierFilter(e.target.value)}
              className="input-field"
              style={{ width: 'auto', padding: '0.45rem 0.6rem', fontSize: '0.8rem' }}
            >
              <option value="all">All tiers</option>
              {availableTiers.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select
              value={activityFilter}
              onChange={e => setActivityFilter(e.target.value as any)}
              className="input-field"
              style={{ width: 'auto', padding: '0.45rem 0.6rem', fontSize: '0.8rem' }}
            >
              <option value="all">All customers</option>
              <option value="active">Active (last {ACTIVE_WINDOW_DAYS}d)</option>
              <option value="inactive">Inactive</option>
            </select>
            <input
              type="number" min={0} placeholder="Min pts"
              value={minPointsFilter}
              onChange={e => setMinPointsFilter(e.target.value)}
              className="input-field"
              style={{ width: '6.5rem', padding: '0.45rem 0.6rem', fontSize: '0.8rem' }}
            />
            <input
              type="number" min={0} placeholder="Max pts"
              value={maxPointsFilter}
              onChange={e => setMaxPointsFilter(e.target.value)}
              className="input-field"
              style={{ width: '6.5rem', padding: '0.45rem 0.6rem', fontSize: '0.8rem' }}
            />
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: '0.8rem', textDecoration: 'underline' }}
              >
                Clear filters
              </button>
            )}
            <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', whiteSpace: 'nowrap', marginLeft: 'auto' }}>{filtered.length} of {totalCustomers} customers</span>
          </div>

          {customersLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '3rem 0', color: 'var(--text-tertiary)' }}>
              <Loader2 size={20} className="animate-spin" /> Loading…
            </div>
          ) : filtered.length === 0 && totalCustomers === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-tertiary)' }}>
              <Users size={40} style={{ margin: '0 auto 0.75rem', opacity: 0.3 }} />
              <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>No loyalty customers yet</p>
              <p style={{ fontSize: '0.8rem' }}>Points are automatically added when customers checkout at POS</p>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-tertiary)' }}>
              <Search size={40} style={{ margin: '0 auto 0.75rem', opacity: 0.3 }} />
              <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>No customers match these filters</p>
              <button onClick={clearFilters} className="btn btn-secondary" style={{ marginTop: '0.5rem', padding: '0.4rem 0.9rem', fontSize: '0.8rem' }}>
                Clear filters
              </button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--surface-border)' }}>
                    <th style={{ padding: '0 1rem 0.75rem 0', fontWeight: 600, color: 'var(--text-secondary)' }}>Customer</th>
                    <th style={{ padding: '0 1rem 0.75rem 0', fontWeight: 600, color: 'var(--text-secondary)' }}>Tier</th>
                    <th style={{ padding: '0 1rem 0.75rem 0', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right' }}>Current Points</th>
                    <th style={{ padding: '0 1rem 0.75rem 0', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right' }}>Total Earned</th>
                    <th style={{ padding: '0 0 0.75rem 0', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right' }}>Total Redeemed</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(c => {
                    const tier = getTier(c.points, config.tiers);
                    const badge = TIER_BADGE_COLORS[tier] || TIER_BADGE_COLORS.Silver;
                    return (
                      <tr key={c.id} style={{ borderBottom: '1px solid var(--surface-border)' }}>
                        <td style={{ padding: '0.75rem 1rem 0.75rem 0' }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{c.name || '—'}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{c.phone || c.id}</div>
                        </td>
                        <td style={{ padding: '0.75rem 1rem 0.75rem 0' }}>
                          <span style={{
                            padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700,
                            background: badge.bg, color: badge.color,
                          }}>
                            {tier}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem 1rem 0.75rem 0', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {(c.points || 0).toLocaleString()}
                        </td>
                        <td style={{ padding: '0.75rem 1rem 0.75rem 0', textAlign: 'right', color: 'var(--text-secondary)' }}>
                          {(c.totalPointsEarned || 0).toLocaleString()}
                        </td>
                        <td style={{ padding: '0.75rem 0', textAlign: 'right', color: 'var(--text-secondary)' }}>
                          {(c.totalPointsRedeemed || 0).toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Config tab */}
      {activeTab === 'config' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Earning & Redemption Rules</h3>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Enable Loyalty</span>
                <div
                  onClick={() => setConfig(c => ({ ...c, enabled: !c.enabled }))}
                  role="switch"
                  aria-checked={config.enabled}
                  aria-label="Enable Loyalty"
                  style={{
                    width: '2.25rem', height: '1.25rem', borderRadius: '999px', position: 'relative', cursor: 'pointer',
                    background: config.enabled ? 'var(--primary)' : 'var(--surface-border)',
                    transition: 'background var(--transition-fast)',
                  }}
                >
                  <div style={{
                    position: 'absolute', top: '2px', width: '1rem', height: '1rem', borderRadius: '999px',
                    background: 'white', boxShadow: '0 1px 3px hsla(220,45%,10%,0.3)',
                    transition: 'transform var(--transition-fast)',
                    transform: config.enabled ? 'translateX(1.1rem)' : 'translateX(2px)',
                  }} />
                </div>
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label>Points per ₹1 Spent</label>
                <input
                  type="number" min={0.1} step={0.1}
                  value={config.pointsPerRupee}
                  onChange={e => setConfig(c => ({ ...c, pointsPerRupee: parseFloat(e.target.value) || 1 }))}
                  className="input-field"
                  style={{ padding: '0.6rem 0.75rem' }}
                />
              </div>
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label>₹ Value per Point (Redemption)</label>
                <input
                  type="number" min={0.01} step={0.01}
                  value={config.pointsValue}
                  onChange={e => setConfig(c => ({ ...c, pointsValue: parseFloat(e.target.value) || 0.25 }))}
                  className="input-field"
                  style={{ padding: '0.6rem 0.75rem' }}
                />
              </div>
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label>Min Points to Redeem</label>
                <input
                  type="number" min={1} step={1}
                  value={config.minRedeemPoints}
                  onChange={e => setConfig(c => ({ ...c, minRedeemPoints: parseInt(e.target.value) || 100 }))}
                  className="input-field"
                  style={{ padding: '0.6rem 0.75rem' }}
                />
              </div>
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Membership Tiers</h3>
              <button
                onClick={addTier}
                className="btn btn-secondary"
                style={{ padding: '0.5rem 0.9rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <Plus size={14} /> Add Tier
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {config.tiers.map((tier, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: 'var(--surface-raised)', borderRadius: '10px', flexWrap: 'wrap' }}>
                  <input
                    className="input-field"
                    style={{ flex: 1, minWidth: '140px', padding: '0.5rem 0.65rem', fontSize: '0.85rem' }}
                    placeholder="Tier name"
                    value={tier.name}
                    onChange={e => updateTier(idx, 'name', e.target.value)}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>Min pts:</span>
                    <input
                      type="number" min={0}
                      className="input-field"
                      style={{ width: '5rem', padding: '0.5rem 0.65rem', fontSize: '0.85rem' }}
                      value={tier.minPoints}
                      onChange={e => updateTier(idx, 'minPoints', e.target.value)}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>Multiplier:</span>
                    <input
                      type="number" min={1} step={0.1}
                      className="input-field"
                      style={{ width: '4.5rem', padding: '0.5rem 0.65rem', fontSize: '0.85rem' }}
                      value={tier.multiplier}
                      onChange={e => updateTier(idx, 'multiplier', e.target.value)}
                    />
                  </div>
                  {config.tiers.length > 1 && (
                    <button
                      onClick={() => removeTier(idx)}
                      aria-label={`Remove ${tier.name || 'tier'}`}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', display: 'flex', alignItems: 'center', padding: '0.35rem' }}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={saveConfig}
              disabled={savingConfig}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: savingConfig ? 0.6 : 1 }}
            >
              {savingConfig ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Save Configuration
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
