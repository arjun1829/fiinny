import { useState, useEffect, useCallback, useRef } from 'react';
import {
    ShieldCheck, Save, Layers, Building2, RefreshCw, Check, Info, ArrowLeft, Loader2, LayoutDashboard,
    LayoutGrid, Pencil, X, Calendar, CreditCard, Plus, Trash2, Tag, Eye, ArrowRight,
    Search, ArrowDown, ArrowUp, Filter, Briefcase, ExternalLink, LifeBuoy, MessageSquare, Paperclip, Mail,
    ChevronDown, ChevronRight, Percent, Power, ScrollText,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, doc, setDoc, addDoc, deleteDoc, serverTimestamp, query, orderBy, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
    DEFAULT_PLAN_CATALOGUE,
    DEFAULT_PLAN_PRICING,
    PRICING_TIER_TO_PLAN_ID,
    ALWAYS_ALLOWED_SCREENS,
    computeSavingsPct,
    type Plan,
    type PlanId,
    type PlanPricing,
    type SubscriptionStatus,
    type TenantSubscription,
} from '../utils/subscriptionPlans';
import {
    SUBSCRIPTION_MODULES,
    buildPlanEntitlement,
    derivePlanEditorState,
} from '../utils/subscriptionCatalog';
import {
    PRICING_TIERS,
    PRICING_TIER_BY_CATALOG,
    PUBLIC_PLANS_COLLECTION,
    buildPricingPlan,
    type PricingPlan,
} from '../hooks/usePricingPlans';
import PricingPlanCard from '../components/pricing/PricingPlanCard';
import { home } from '../components/landing/home/tokens';
import {
    JOB_OPENINGS_COLLECTION,
    EMPLOYMENT_TYPES,
    JOB_STATUS_OPTIONS,
    type JobOpening,
    type JobStatus,
} from '../types/careers';
import {
    SUPPORT_TICKETS_COLLECTION,
    TICKET_STATUS_OPTIONS,
    TICKET_PRIORITY_OPTIONS,
    type SupportTicket,
    type TicketStatus,
    type TicketPriority,
} from '../types/support';
import {
    PLAN_PROMOTIONS_COLLECTION,
    PROMO_TIER_OPTIONS,
    PROMO_CYCLE_OPTIONS,
    validatePromotion,
    isPromotionLive,
    discountedRupees,
    formatRupees,
    type PlanPromotion,
    type PromoBillingCycle,
    type PromoTier,
} from '../utils/planPromotions';
import { logPlatformAudit } from '../utils/platformAuditLog';
import AuditLogsSection from '../components/AuditLogsSection';

// Plans shown in the catalogue, in tier order. Derived from the shared pricing
// catalogue (single source of truth) so ordering never drifts from /pricing.
const PLAN_ORDER: PlanId[] = PRICING_TIERS.map(t => t.catalogId);

// Stable signature of the editor's state — used to detect unsaved edits.
const serializeEditor = (keys: Set<string>, sections: Set<string>, landing: string) =>
    JSON.stringify({ k: [...keys].sort(), s: [...sections].sort(), l: landing });

// A blank pricing block, used when neither the plan doc nor the seed defaults
// carry pricing (e.g. a future custom plan id).
const EMPTY_PRICING: PlanPricing = {
    displayName: '', tagline: '', monthlyPrice: 0, yearlyPrice: 0,
    badge: '', badgeVisible: false, features: [], limits: [],
};

// Resolve the pricing to edit: the plan doc's own pricing, else the seed default
// for this plan id, else a blank block. Cloned so edits never mutate the source.
const resolvePricing = (planId: string, existing?: Plan): PlanPricing => {
    const src = existing?.pricing
        ?? DEFAULT_PLAN_PRICING[planId as keyof typeof DEFAULT_PLAN_PRICING]
        ?? EMPTY_PRICING;
    return {
        displayName: src.displayName ?? '',
        tagline: src.tagline ?? '',
        description: src.description ?? '',
        monthlyPrice: src.monthlyPrice ?? 0,
        yearlyPrice: src.yearlyPrice ?? 0,
        savingsLabel: src.savingsLabel ?? '',
        badge: src.badge ?? '',
        badgeVisible: src.badgeVisible ?? !!src.badge,
        features: [...(src.features ?? [])],
        limits: [...(src.limits ?? [])],
    };
};

// Validate the pricing block. Returns a user-facing error string, or null when OK.
const validatePricing = (p: PlanPricing): string | null => {
    if (!p.displayName.trim()) return 'Plan name is required.';
    if (!Number.isFinite(p.monthlyPrice) || p.monthlyPrice < 0) return 'Monthly price must be a non-negative number.';
    if (!Number.isFinite(p.yearlyPrice) || p.yearlyPrice < 0) return 'Yearly price must be a non-negative number.';
    if (p.monthlyPrice <= 0) return 'Monthly price must be greater than 0.';
    if (p.yearlyPrice <= 0) return 'Yearly price must be greater than 0.';
    const feats = p.features.map(f => f.trim()).filter(Boolean);
    if (feats.length === 0) return 'Add at least one feature.';
    if (p.badgeVisible && !p.badge?.trim()) return 'Badge text is required when the badge is visible.';
    return null;
};

// Strip empty entries and undefined-y fields so the stored doc stays clean.
const cleanPricing = (p: PlanPricing): PlanPricing => ({
    displayName: p.displayName.trim(),
    ...(p.tagline?.trim() ? { tagline: p.tagline.trim() } : {}),
    ...(p.description?.trim() ? { description: p.description.trim() } : {}),
    monthlyPrice: Math.round(p.monthlyPrice),
    yearlyPrice: Math.round(p.yearlyPrice),
    ...(p.savingsLabel?.trim() ? { savingsLabel: p.savingsLabel.trim() } : {}),
    ...(p.badge?.trim() ? { badge: p.badge.trim() } : {}),
    badgeVisible: !!p.badgeVisible && !!p.badge?.trim(),
    features: p.features.map(f => f.trim()).filter(Boolean),
    limits: p.limits.map(l => l.trim()).filter(Boolean),
});

// Selectable landing pages per plan. Keyed by the SUBSCRIPTION_MODULES key that
// must be enabled in the plan for this path to appear in the dropdown.
const PLAN_LANDING_OPTIONS: { path: string; label: string; moduleKey: string }[] = [
    { path: '/dashboard',     label: 'B2B Dashboard',    moduleKey: 'dashboard' },
    { path: '/b2c-dashboard', label: 'B2C Dashboard',    moduleKey: 'b2cDashboard' },
    { path: '/pos',           label: 'POS Billing',      moduleKey: 'pos' },
    { path: '/worklist',      label: 'Worklist',         moduleKey: 'worklist' },
    { path: '/reports',       label: 'Reports',          moduleKey: 'reports' },
    { path: '/analytics',     label: 'Analytics',        moduleKey: 'analytics' },
    { path: '/rates',         label: 'Inventory',        moduleKey: 'inventory' },
    { path: '/expenses',      label: 'Expenses',         moduleKey: 'expenses' },
];

const STATUS_OPTIONS: { value: SubscriptionStatus; label: string }[] = [
    { value: 'active',    label: 'Active' },
    { value: 'trial',     label: 'Trial' },
    { value: 'past_due',  label: 'Past due (grace)' },
    { value: 'suspended', label: 'Suspended' },
    { value: 'cancelled', label: 'Cancelled' },
];

// Compact colour map for the subscription status badge.
const STATUS_BADGE: Record<SubscriptionStatus, { bg: string; fg: string; label: string }> = {
    active:    { bg: 'hsla(152,60%,40%,0.15)',  fg: 'hsl(152,55%,38%)',  label: 'Active' },
    trial:     { bg: 'hsla(210,100%,50%,0.15)', fg: 'hsl(210,90%,55%)',  label: 'Trial' },
    past_due:  { bg: 'hsla(38,92%,50%,0.15)',   fg: 'hsl(38,80%,45%)',   label: 'Past due' },
    suspended: { bg: 'hsla(25,90%,52%,0.15)',   fg: 'hsl(25,80%,50%)',   label: 'Suspended' },
    cancelled: { bg: 'hsla(0,75%,55%,0.15)',    fg: 'hsl(0,70%,55%)',    label: 'Cancelled' },
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

// Firestore Timestamp | Date | millis → epoch millis, or 0 when absent/invalid.
// Used to sort the Businesses table by Created date.
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

interface TenantRow {
    tenantId: string;
    businessName: string;
    createdAt: unknown;  // tenant document creation timestamp (actual business creation date)
    subscription: TenantSubscription | null;
}

// Subscription filter options for the Businesses table. Plan ids map to a tenant's
// subscription.planId; 'none' matches tenants without any subscription.
const SUB_FILTER_OPTIONS: { value: string; label: string }[] = [
    { value: 'manufacturer', label: 'Manufacturer' },
    { value: 'retailer',     label: 'Retailer' },
    { value: 'distributor',  label: 'Distributor' },
    { value: 'none',         label: 'No Subscription' },
];

// A business's creation date: the tenant document's own createdAt, falling back
// to its subscription start date when the tenant doc carries no timestamp. Used
// for both the Created column display and its sort.
const businessCreatedAt = (row: TenantRow): unknown => row.createdAt ?? row.subscription?.startedAt ?? null;

// Row shape mirrors exactly the fields written by verifySaaSPayment (functions/src/payments.ts).
// No field is read that the ledger does not store; razorpay_signature is never persisted.
interface SaasPaymentRow {
    razorpayPaymentId: string;
    razorpayOrderId?: string;
    tenantId?: string;
    planId?: string;
    cycle?: string;
    amount?: number;       // stored in paise
    currency?: string;
    status?: string;
    createdAt?: unknown;
}

type Section = 'overview' | 'businesses' | 'plans' | 'promotions' | 'payments' | 'careers' | 'support' | 'audit-logs';

// Every section is addressable via a stable hash (/super-admin#<id>). Adding a
// future section only requires appending an entry here.
const SIDEBAR_SECTIONS: { id: Section; label: string; icon: typeof LayoutGrid }[] = [
    { id: 'overview',   label: 'Overview',   icon: LayoutGrid },
    { id: 'businesses', label: 'Businesses', icon: Building2 },
    { id: 'plans',      label: 'Plans',      icon: Layers },
    { id: 'promotions', label: 'Promotions', icon: Percent },
    { id: 'payments',   label: 'Payments',   icon: CreditCard },
    { id: 'careers',    label: 'Careers',    icon: Briefcase },
    { id: 'support',    label: 'Support',    icon: LifeBuoy },
    { id: 'audit-logs', label: 'Audit Logs', icon: ScrollText },
];

// Compact colour map for a support ticket's lifecycle status badge.
const TICKET_STATUS_BADGE: Record<TicketStatus, { bg: string; fg: string; label: string }> = {
    open:        { bg: 'hsla(210,100%,50%,0.15)', fg: 'hsl(210,90%,55%)',      label: 'Open' },
    in_progress: { bg: 'hsla(38,92%,50%,0.15)',   fg: 'hsl(38,80%,45%)',       label: 'In Progress' },
    resolved:    { bg: 'hsla(152,60%,40%,0.15)',  fg: 'hsl(152,55%,38%)',      label: 'Resolved' },
    closed:      { bg: 'var(--surface-border)',   fg: 'var(--text-secondary)', label: 'Closed' },
};

const TICKET_PRIORITY_BADGE: Record<TicketPriority, { bg: string; fg: string; label: string }> = {
    low:    { bg: 'var(--surface-border)',   fg: 'var(--text-secondary)', label: 'Low' },
    medium: { bg: 'hsla(210,100%,50%,0.15)', fg: 'hsl(210,90%,55%)',      label: 'Medium' },
    high:   { bg: 'hsla(38,92%,50%,0.15)',   fg: 'hsl(38,80%,45%)',       label: 'High' },
    urgent: { bg: 'hsla(0,75%,55%,0.15)',    fg: 'hsl(0,70%,55%)',        label: 'Urgent' },
};

// Status filter options for the Support table (plus an implicit "all").
const TICKET_FILTER_OPTIONS: { value: TicketStatus | 'all'; label: string }[] = [
    { value: 'all',         label: 'All' },
    { value: 'open',        label: 'Open' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'resolved',    label: 'Resolved' },
    { value: 'closed',      label: 'Closed' },
];

// Compact colour map for a job opening's lifecycle status badge.
const JOB_STATUS_BADGE: Record<JobStatus, { bg: string; fg: string; label: string }> = {
    published: { bg: 'hsla(152,60%,40%,0.15)', fg: 'hsl(152,55%,38%)',      label: 'Published' },
    draft:     { bg: 'hsla(38,92%,50%,0.15)',  fg: 'hsl(38,80%,45%)',       label: 'Draft' },
    closed:    { bg: 'var(--surface-border)',  fg: 'var(--text-secondary)', label: 'Closed' },
};

// Local editor form shape. `requirementsText` is a textarea (one requirement per
// line); it is split into the stored string[] on save.
interface JobFormState {
    title: string;
    department: string;
    location: string;
    employmentType: string;
    description: string;
    requirementsText: string;
    status: JobStatus;
}

const EMPTY_JOB_FORM: JobFormState = {
    title: '', department: '', location: '', employmentType: 'Full-time',
    description: '', requirementsText: '', status: 'draft',
};

// ── Promotions ──
// Local editor form. Discount is kept as a string so the number field can be
// cleared while typing; it is coerced to a number on validate/save.
interface PromoFormState {
    label: string;
    tiers: PromoTier[];
    discountPct: string;
    billingCycle: PromoBillingCycle;
    startDate: string;
    endDate: string;
    isActive: boolean;
}

// Today (UTC) as 'YYYY-MM-DD' — the default start date for a new promotion.
const todayISO = (): string => new Date().toISOString().slice(0, 10);

const EMPTY_PROMO_FORM: PromoFormState = {
    label: '', tiers: [], discountPct: '10', billingCycle: 'both',
    startDate: todayISO(), endDate: todayISO(), isActive: true,
};

// A promotion's live-state badge: Active-and-live, Scheduled (future), Expired,
// or Inactive (disabled). Drives the Status column colour + label.
const promoStateBadge = (p: PlanPromotion): { bg: string; fg: string; label: string } => {
    if (!p.isActive) return { bg: 'var(--surface-border)', fg: 'var(--text-secondary)', label: 'Inactive' };
    if (isPromotionLive(p)) return { bg: 'hsla(152,60%,40%,0.15)', fg: 'hsl(152,55%,38%)', label: 'Live' };
    const startMs = Date.parse(`${p.startDate}T00:00:00Z`);
    if (!Number.isNaN(startMs) && Date.now() < startMs) {
        return { bg: 'hsla(210,100%,50%,0.15)', fg: 'hsl(210,90%,55%)', label: 'Scheduled' };
    }
    return { bg: 'hsla(0,75%,55%,0.15)', fg: 'hsl(0,70%,55%)', label: 'Expired' };
};

// Compact "Starter, Pro" style summary of a promotion's targeted tiers.
const promoTierLabels = (tiers: PromoTier[]): string =>
    tiers.map(t => PROMO_TIER_OPTIONS.find(o => o.value === t)?.label ?? t).join(', ') || '—';

const promoCycleLabel = (c: PromoBillingCycle): string =>
    PROMO_CYCLE_OPTIONS.find(o => o.value === c)?.label ?? c;

const SECTION_IDS: Section[] = SIDEBAR_SECTIONS.map(s => s.id);

// URL hash → active section; unknown/empty hash falls back to the default Overview.
const readHashSection = (): Section => {
    const h = window.location.hash.slice(1) as Section;
    return SECTION_IDS.includes(h) ? h : 'overview';
};

// Format a paise amount stored in saasPayments as a readable currency string.
const formatAmount = (paise?: number, currency = 'INR'): string => {
    if (typeof paise !== 'number' || isNaN(paise)) return '—';
    try {
        return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(paise / 100);
    } catch {
        return `${(paise / 100).toFixed(2)} ${currency}`;
    }
};

export default function SuperAdminSubscriptionsPage() {
    const { isSuperAdmin, currentUser, userRole, enterTenantView } = useAuth();
    const { showToast } = useToast();
    const navigate = useNavigate();

    // Verified actor for audit entries. actorUid is checked against the auth token
    // in firestore.rules, so this identity cannot be forged from the client.
    const auditActor = {
        uid: currentUser?.uid || '',
        email: currentUser?.email || '',
        role: userRole || (isSuperAdmin ? 'superadmin' : 'unknown'),
    };

    // Record a single Super Admin sign-in security event per browser session.
    // Guarded by sessionStorage so token refreshes / remounts don't duplicate it.
    useEffect(() => {
        if (!isSuperAdmin || !currentUser?.uid) return;
        const flag = `platformAuditLogin:${currentUser.uid}`;
        if (sessionStorage.getItem(flag)) return;
        sessionStorage.setItem(flag, '1');
        logPlatformAudit({
            actor: { uid: currentUser.uid, email: currentUser.email || '', role: userRole || 'superadmin' },
            category: 'security', action: 'login',
            resourceType: 'session', resourceName: currentUser.email || currentUser.uid,
            description: `Super Admin signed in to the platform console`,
        });
    }, [isSuperAdmin, currentUser?.uid, currentUser?.email, userRole]);

    // Open a tenant's normal ERP dashboard with full Super Admin access.
    const openTenantDashboard = (row: TenantRow) => {
        enterTenantView(row.tenantId, row.businessName);
        navigate('/dashboard');
    };

    // Active section is driven by the URL hash so refresh/back/forward all work and
    // the section is deep-linkable (e.g. /super-admin#businesses).
    const [section, setSectionState] = useState<Section>(readHashSection);
    const goToSection = (id: Section) => {
        setSelectedPlan(null);
        if (window.location.hash.slice(1) !== id) {
            window.location.hash = id; // pushes history + fires hashchange
        }
        setSectionState(id);
    };

    // ── Plan catalogue state ──
    const [plans, setPlans] = useState<Record<string, Plan>>({});
    const [plansLoading, setPlansLoading] = useState(true);
    const [selectedPlan, setSelectedPlan] = useState<PlanId | null>(null);
    // Enabled top-level modules + enabled sub-sections (checkbox state).
    const [editKeys, setEditKeys] = useState<Set<string>>(new Set());
    const [editSections, setEditSections] = useState<Set<string>>(new Set());
    const [editDefaultLanding, setEditDefaultLanding] = useState('');
    // Customer-facing pricing/marketing content for the selected plan.
    const [editPricing, setEditPricing] = useState<PlanPricing>(EMPTY_PRICING);
    // Signature of the plan as loaded; Save enables only when the editor differs.
    const [planBaseline, setPlanBaseline] = useState('');
    const [pricingBaseline, setPricingBaseline] = useState('');
    const [savingPlan, setSavingPlan] = useState(false);
    const [seeding, setSeeding] = useState(false);

    // ── Tenant assignment state ──
    const [tenants, setTenants] = useState<TenantRow[]>([]);
    const [tenantsLoading, setTenantsLoading] = useState(false);
    const [tenantsError, setTenantsError] = useState(false);
    const [savingTenant, setSavingTenant] = useState<string | null>(null);
    // Business whose subscription is being edited in the modal (null = closed).
    const [editingTenant, setEditingTenant] = useState<TenantRow | null>(null);
    // Businesses table controls: name search, subscription filter (empty = all),
    // and Created sort direction (default newest-first).
    const [businessSearch, setBusinessSearch] = useState('');
    const [subFilter, setSubFilter] = useState<Set<string>>(new Set());
    const [createdSort, setCreatedSort] = useState<'desc' | 'asc'>('desc');

    // ── Careers state ──
    const [jobs, setJobs] = useState<JobOpening[]>([]);
    const [jobsLoading, setJobsLoading] = useState(false);
    const [jobsError, setJobsError] = useState(false);
    // Editor modal: null = closed, an object = open (a job = edit, EMPTY = create).
    const [editingJob, setEditingJob] = useState<JobOpening | 'new' | null>(null);
    const [savingJob, setSavingJob] = useState(false);
    const [deletingJob, setDeletingJob] = useState<string | null>(null);

    // ── Support tickets state ──
    const [tickets, setTickets] = useState<SupportTicket[]>([]);
    const [ticketsLoading, setTicketsLoading] = useState(false);
    const [ticketsError, setTicketsError] = useState(false);
    const [ticketFilter, setTicketFilter] = useState<TicketStatus | 'all'>('all');
    const [ticketSearch, setTicketSearch] = useState('');
    // Ticket open in the detail modal (null = closed).
    const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
    const [savingTicket, setSavingTicket] = useState(false);

    // ── SaaS payments ledger state ──
    const [payments, setPayments] = useState<SaasPaymentRow[]>([]);
    const [paymentsLoading, setPaymentsLoading] = useState(false);
    const [paymentsError, setPaymentsError] = useState(false);

    // ── Promotions state ──
    const [promotions, setPromotions] = useState<PlanPromotion[]>([]);
    const [promotionsLoading, setPromotionsLoading] = useState(false);
    const [promotionsError, setPromotionsError] = useState(false);
    // Editor modal: null = closed, 'new' = create, a promotion = edit.
    const [editingPromo, setEditingPromo] = useState<PlanPromotion | 'new' | null>(null);
    const [savingPromo, setSavingPromo] = useState(false);
    // Per-row busy marker (activate/deactivate/delete) keyed by promotion id.
    const [busyPromo, setBusyPromo] = useState<string | null>(null);

    // Plan detail: both sections are collapsible and collapsed by default; the
    // Super Admin expands whichever they need to edit.
    const [pricingContentOpen, setPricingContentOpen] = useState(false);
    const [moduleAccessOpen, setModuleAccessOpen] = useState(false);

    // isSuperAdmin comes directly from AuthContext (superadmin@fiinny.com identity check).

    // ── Loaders ──────────────────────────────────────────────────────────────
    const loadPlans = useCallback(async () => {
        setPlansLoading(true);
        try {
            const snap = await getDocs(collection(db, 'plans'));
            const map: Record<string, Plan> = {};
            snap.docs.forEach(d => { map[d.id] = { id: d.id, ...(d.data() as Omit<Plan, 'id'>) }; });
            setPlans(map);
        } catch {
            showToast('Failed to load plans.', 'error');
        } finally {
            setPlansLoading(false);
        }
    }, [showToast]);

    const loadTenants = useCallback(async () => {
        setTenantsLoading(true);
        setTenantsError(false);
        try {
            const [tenantsSnap, subsSnap] = await Promise.all([
                getDocs(collection(db, 'tenants')),
                getDocs(collection(db, 'tenantSubscriptions')),
            ]);
            const subs: Record<string, TenantSubscription> = {};
            subsSnap.docs.forEach(d => { subs[d.id] = d.data() as TenantSubscription; });

            const rows: TenantRow[] = tenantsSnap.docs.map(d => {
                const data = d.data() as { businessName?: string; createdAt?: unknown };
                return {
                    tenantId: d.id,
                    businessName: data.businessName || d.id,
                    createdAt: data.createdAt ?? null,
                    subscription: subs[d.id] || null,
                };
            });

            // The master tenant uses root-level collections and may have no
            // /tenants/master doc — surface it explicitly so it can be assigned a
            // plan like every other tenant.
            if (!rows.some(r => r.tenantId === 'master')) {
                rows.unshift({ tenantId: 'master', businessName: 'KaranArjun (Master)', createdAt: null, subscription: subs['master'] || null });
            }
            setTenants(rows.sort((a, b) => (a.tenantId === 'master' ? -1 : a.businessName.localeCompare(b.businessName))));
        } catch {
            setTenantsError(true);
            showToast('Failed to load businesses.', 'error');
        } finally {
            setTenantsLoading(false);
        }
    }, [showToast]);

    const loadPayments = useCallback(async () => {
        setPaymentsLoading(true);
        setPaymentsError(false);
        try {
            // Ordered newest-first by the ledger's own createdAt server timestamp.
            const snap = await getDocs(query(collection(db, 'saasPayments'), orderBy('createdAt', 'desc')));
            setPayments(snap.docs.map(d => ({
                razorpayPaymentId: d.id,
                ...(d.data() as Omit<SaasPaymentRow, 'razorpayPaymentId'>),
            })));
        } catch {
            setPaymentsError(true);
            showToast('Failed to load payments.', 'error');
        } finally {
            setPaymentsLoading(false);
        }
    }, [showToast]);

    // Super admin reads the full openings collection (drafts + published + closed),
    // newest-first. Single-field orderBy needs no composite index.
    const loadJobs = useCallback(async () => {
        setJobsLoading(true);
        setJobsError(false);
        try {
            const snap = await getDocs(query(collection(db, JOB_OPENINGS_COLLECTION), orderBy('createdAt', 'desc')));
            setJobs(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<JobOpening, 'id'>) })));
        } catch {
            setJobsError(true);
            showToast('Failed to load job openings.', 'error');
        } finally {
            setJobsLoading(false);
        }
    }, [showToast]);

    // Super admin reads every ticket across all tenants, newest-first. Single-field
    // orderBy needs no composite index.
    const loadTickets = useCallback(async () => {
        setTicketsLoading(true);
        setTicketsError(false);
        try {
            const snap = await getDocs(query(collection(db, SUPPORT_TICKETS_COLLECTION), orderBy('createdAt', 'desc')));
            setTickets(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<SupportTicket, 'id'>) })));
        } catch {
            setTicketsError(true);
            showToast('Failed to load support tickets.', 'error');
        } finally {
            setTicketsLoading(false);
        }
    }, [showToast]);

    // Super admin reads every promotion (active + inactive), newest-first.
    // Single-field orderBy needs no composite index.
    const loadPromotions = useCallback(async () => {
        setPromotionsLoading(true);
        setPromotionsError(false);
        try {
            const snap = await getDocs(query(collection(db, PLAN_PROMOTIONS_COLLECTION), orderBy('createdAt', 'desc')));
            setPromotions(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<PlanPromotion, 'id'>) })));
        } catch {
            setPromotionsError(true);
            showToast('Failed to load promotions.', 'error');
        } finally {
            setPromotionsLoading(false);
        }
    }, [showToast]);

    // Keep the active section in sync with the URL hash (back/forward + refresh).
    useEffect(() => {
        const onHashChange = () => setSectionState(readHashSection());
        window.addEventListener('hashchange', onHashChange);
        return () => window.removeEventListener('hashchange', onHashChange);
    }, []);

    useEffect(() => { if (isSuperAdmin) loadPlans(); }, [isSuperAdmin, loadPlans]);
    // Businesses are needed by the Overview summary, the Businesses table, and to
    // resolve tenant display names in the Payments table.
    useEffect(() => {
        if (isSuperAdmin && (section === 'businesses' || section === 'overview' || section === 'payments')) loadTenants();
    }, [isSuperAdmin, section, loadTenants]);
    useEffect(() => {
        if (isSuperAdmin && section === 'payments') loadPayments();
    }, [isSuperAdmin, section, loadPayments]);
    useEffect(() => {
        if (isSuperAdmin && section === 'careers') loadJobs();
    }, [isSuperAdmin, section, loadJobs]);
    useEffect(() => {
        if (isSuperAdmin && section === 'support') loadTickets();
    }, [isSuperAdmin, section, loadTickets]);
    useEffect(() => {
        if (isSuperAdmin && section === 'promotions') loadPromotions();
    }, [isSuperAdmin, section, loadPromotions]);

    // Initialise the editor when a plan is opened (fall back to seed defaults).
    useEffect(() => {
        if (!selectedPlan) return;
        const existing = plans[selectedPlan];
        const seed = DEFAULT_PLAN_CATALOGUE[selectedPlan as keyof typeof DEFAULT_PLAN_CATALOGUE];
        const { enabledKeys, includedSections } = derivePlanEditorState(
            existing?.screens ?? seed?.screens ?? [],
            existing?.features ?? seed?.features ?? [],
        );
        const landing = existing?.defaultLandingPath ?? '';
        const pricing = resolvePricing(selectedPlan, existing);
        setEditKeys(enabledKeys);
        setEditSections(includedSections);
        setEditDefaultLanding(landing);
        setEditPricing(pricing);
        setPlanBaseline(serializeEditor(enabledKeys, includedSections, landing));
        setPricingBaseline(JSON.stringify(pricing));
    }, [selectedPlan, plans]);

    if (!isSuperAdmin) {
        return (
            <div style={{ padding: '2rem', color: 'var(--danger)', textAlign: 'center', width: '100%' }}>
                Access Denied. Only the platform Super Admin can manage subscriptions.
            </div>
        );
    }

    // ── Plan actions ───────────────────────────────────────────────────────────
    const toggleModule = (key: string) => {
        setEditKeys(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    };

    const toggleSection = (id: string) => {
        setEditSections(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const savePlan = async () => {
        if (!selectedPlan) return;
        // Validate customer-facing pricing before writing — blocks invalid/negative
        // prices, missing name, empty features and inconsistent badge state.
        const pricingError = validatePricing(editPricing);
        if (pricingError) { showToast(pricingError, 'error'); return; }
        setSavingPlan(true);
        try {
            const seed = DEFAULT_PLAN_CATALOGUE[selectedPlan as keyof typeof DEFAULT_PLAN_CATALOGUE];
            const existing = plans[selectedPlan];
            const { screens: moduleScreens, features } = buildPlanEntitlement({ enabledKeys: editKeys, includedSections: editSections });
            // Always-allowed screens (Settings) are stored so the set is complete.
            const screens = Array.from(new Set([...moduleScreens, ...ALWAYS_ALLOWED_SCREENS]));
            const pricing = cleanPricing(editPricing);
            const payload: Plan = {
                id: selectedPlan,
                name: existing?.name ?? seed?.name ?? selectedPlan,
                description: existing?.description ?? seed?.description ?? '',
                tier: existing?.tier ?? seed?.tier ?? 1,
                isActive: existing?.isActive ?? true,
                screens,
                features,
                modules: existing?.modules ?? seed?.modules ?? [],
                pricing,
                ...(editDefaultLanding ? { defaultLandingPath: editDefaultLanding } : {}),
                createdAt: existing?.createdAt ?? serverTimestamp(),
                updatedAt: serverTimestamp(),
            };
            // Write the authoritative plan doc AND its public pricing projection in
            // one atomic batch, so the landing page / logged-out /pricing always show
            // the same prices as authenticated users. The projection carries ONLY the
            // customer-facing `pricing` subset — never entitlement config.
            const batch = writeBatch(db);
            batch.set(doc(db, 'plans', selectedPlan), payload, { merge: true });
            batch.set(doc(db, PUBLIC_PLANS_COLLECTION, selectedPlan), { pricing, updatedAt: serverTimestamp() }, { merge: true });
            await batch.commit();
            setPlans(prev => ({ ...prev, [selectedPlan]: payload }));
            showToast(`Plan "${payload.name}" saved.`, 'success');
            logPlatformAudit({
                actor: auditActor, category: 'plan', action: existing ? 'update' : 'create',
                resourceType: 'plan', resourceId: selectedPlan, resourceName: payload.name,
                description: `Plan "${payload.name}" ${existing ? 'updated' : 'created'}`,
                before: existing ? { isActive: existing.isActive, screens: existing.screens?.length, pricing: existing.pricing } : undefined,
                after: { isActive: payload.isActive, screens: payload.screens.length, pricing: payload.pricing },
            });
        } catch {
            showToast('Failed to save plan.', 'error');
        } finally {
            setSavingPlan(false);
        }
    };

    const seedDefaults = async () => {
        setSeeding(true);
        try {
            const seeded: string[] = [];
            for (const id of PLAN_ORDER) {
                // Seed the authoritative doc only when missing (never overwrite an edit).
                if (!plans[id]) {
                    const seed = DEFAULT_PLAN_CATALOGUE[id as keyof typeof DEFAULT_PLAN_CATALOGUE];
                    await setDoc(doc(db, 'plans', id), {
                        ...seed,
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                    }, { merge: true });
                    seeded.push(id);
                }
                // (Re)publish the public pricing projection for EVERY plan — from the
                // existing plan's live pricing when present, else the seed defaults.
                // This backfills projections for plans that predate the projection.
                const projectionPricing = resolvePricing(id, plans[id]);
                await setDoc(
                    doc(db, PUBLIC_PLANS_COLLECTION, id),
                    { pricing: projectionPricing, updatedAt: serverTimestamp() },
                    { merge: true },
                );
            }
            await loadPlans();
            showToast('Plans seeded and public pricing published.', 'success');
            if (seeded.length) {
                logPlatformAudit({
                    actor: auditActor, category: 'plan', action: 'seed',
                    resourceType: 'plan', resourceName: 'Plan catalogue defaults',
                    description: `Seeded default plan(s): ${seeded.join(', ')}`,
                    after: { seeded },
                });
            }
        } catch {
            showToast('Failed to seed plans.', 'error');
        } finally {
            setSeeding(false);
        }
    };

    // ── Tenant actions ─────────────────────────────────────────────────────────
    const assignTenant = async (row: TenantRow, planId: PlanId, status: SubscriptionStatus) => {
        setSavingTenant(row.tenantId);
        try {
            const existing = row.subscription;
            const payload: TenantSubscription = {
                tenantId: row.tenantId,
                planId,
                status,
                assignedBy: currentUser?.email || currentUser?.uid || 'superadmin',
                startedAt: existing?.startedAt ?? serverTimestamp(),
                updatedAt: serverTimestamp(),
                ...(existing?.overrides ? { overrides: existing.overrides } : {}),
            };
            await setDoc(doc(db, 'tenantSubscriptions', row.tenantId), payload, { merge: true });
            setTenants(prev => prev.map(t => t.tenantId === row.tenantId ? { ...t, subscription: payload } : t));
            showToast(`${row.businessName} → ${plans[planId]?.name || planId} (${status}).`, 'success');
            const prevStatus = existing?.status;
            const action = status === 'suspended'
                ? 'suspend'
                : (prevStatus === 'suspended' ? 'activate' : 'update');
            logPlatformAudit({
                actor: auditActor, category: 'business', action,
                resourceType: 'subscription', resourceId: row.tenantId, resourceName: row.businessName,
                tenantId: row.tenantId, tenantName: row.businessName,
                description: `Subscription set to ${plans[planId]?.name || planId} · status ${status}`,
                before: existing ? { planId: existing.planId, status: existing.status } : undefined,
                after: { planId, status },
            });
            setEditingTenant(null);
        } catch {
            showToast('Failed to update subscription.', 'error');
        } finally {
            setSavingTenant(null);
        }
    };

    // ── Careers actions ─────────────────────────────────────────────────────────
    // Create a new opening or update an existing one from the editor form.
    const saveJob = async (form: JobFormState, existing: JobOpening | null) => {
        setSavingJob(true);
        try {
            const requirements = form.requirementsText
                .split('\n')
                .map(l => l.trim())
                .filter(Boolean);
            const base = {
                title: form.title.trim(),
                department: form.department.trim(),
                location: form.location.trim(),
                employmentType: form.employmentType,
                description: form.description.trim(),
                requirements,
                status: form.status,
                updatedAt: serverTimestamp(),
            };
            let resourceId = existing?.id;
            if (existing) {
                await setDoc(doc(db, JOB_OPENINGS_COLLECTION, existing.id), base, { merge: true });
                showToast(`"${base.title}" updated.`, 'success');
            } else {
                const ref = await addDoc(collection(db, JOB_OPENINGS_COLLECTION), { ...base, createdAt: serverTimestamp() });
                resourceId = ref.id;
                showToast(`"${base.title}" created.`, 'success');
            }
            logPlatformAudit({
                actor: auditActor, category: 'career', action: existing ? 'update' : 'create',
                resourceType: 'jobOpening', resourceId, resourceName: base.title,
                description: `Job opening "${base.title}" ${existing ? 'updated' : 'created'} · status ${base.status}`,
                before: existing ? { title: existing.title, status: existing.status, department: existing.department } : undefined,
                after: { title: base.title, status: base.status, department: base.department, location: base.location },
            });
            setEditingJob(null);
            await loadJobs();
        } catch {
            showToast('Failed to save job opening.', 'error');
        } finally {
            setSavingJob(false);
        }
    };

    // Publish / close / re-draft an opening inline from the table.
    const setJobStatus = async (job: JobOpening, status: JobStatus) => {
        setDeletingJob(job.id); // reuse the per-row busy marker to disable actions
        try {
            await setDoc(doc(db, JOB_OPENINGS_COLLECTION, job.id), { status, updatedAt: serverTimestamp() }, { merge: true });
            setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status } : j));
            const verb = status === 'published' ? 'published' : status === 'closed' ? 'closed' : 'moved to draft';
            showToast(`"${job.title}" ${verb}.`, 'success');
            logPlatformAudit({
                actor: auditActor, category: 'career',
                action: status === 'published' ? 'publish' : status === 'closed' ? 'close' : 'status_change',
                resourceType: 'jobOpening', resourceId: job.id, resourceName: job.title,
                description: `Job opening "${job.title}" ${verb}`,
                before: { status: job.status }, after: { status },
            });
        } catch {
            showToast('Failed to update status.', 'error');
        } finally {
            setDeletingJob(null);
        }
    };

    const deleteJob = async (job: JobOpening) => {
        if (!window.confirm(`Delete "${job.title}"? This cannot be undone.`)) return;
        setDeletingJob(job.id);
        try {
            await deleteDoc(doc(db, JOB_OPENINGS_COLLECTION, job.id));
            setJobs(prev => prev.filter(j => j.id !== job.id));
            showToast(`"${job.title}" deleted.`, 'success');
            logPlatformAudit({
                actor: auditActor, category: 'career', action: 'delete',
                resourceType: 'jobOpening', resourceId: job.id, resourceName: job.title,
                description: `Job opening "${job.title}" deleted`,
                before: { title: job.title, status: job.status, department: job.department },
            });
        } catch {
            showToast('Failed to delete job opening.', 'error');
        } finally {
            setDeletingJob(null);
        }
    };

    // Open the real public careers page in a new tab, deep-linked to this opening.
    const previewJob = (job: JobOpening) => {
        window.open(`/careers?job=${encodeURIComponent(job.id)}`, '_blank', 'noopener');
    };

    // ── Support ticket actions ───────────────────────────────────────────────────
    // Update the admin-managed fields of a ticket (status, priority, response).
    // Identity/content fields are never touched.
    const updateTicket = async (
        ticket: SupportTicket,
        changes: { status: TicketStatus; priority: TicketPriority; adminResponse: string },
    ) => {
        setSavingTicket(true);
        try {
            const payload = {
                status: changes.status,
                priority: changes.priority,
                adminResponse: changes.adminResponse.trim(),
                updatedAt: serverTimestamp(),
            };
            await setDoc(doc(db, SUPPORT_TICKETS_COLLECTION, ticket.id), payload, { merge: true });
            setTickets(prev => prev.map(t => t.id === ticket.id ? { ...t, ...payload } : t));
            setSelectedTicket(null);
            showToast('Ticket updated.', 'success');
            logPlatformAudit({
                actor: auditActor, category: 'support',
                action: changes.status !== ticket.status ? 'status_change' : 'update',
                resourceType: 'ticket', resourceId: ticket.id, resourceName: ticket.subject,
                tenantId: ticket.tenantId, tenantName: ticket.businessName,
                description: `Ticket "${ticket.subject}" updated · status ${changes.status} · priority ${changes.priority}`,
                before: { status: ticket.status, priority: ticket.priority, hasResponse: !!ticket.adminResponse },
                after: { status: changes.status, priority: changes.priority, hasResponse: !!changes.adminResponse.trim() },
            });
        } catch {
            showToast('Failed to update ticket.', 'error');
        } finally {
            setSavingTicket(false);
        }
    };

    // ── Promotion actions ────────────────────────────────────────────────────────
    // Create a new promotion or update an existing one from the editor form.
    const savePromotion = async (form: PromoFormState, existing: PlanPromotion | null) => {
        const pct = Number(form.discountPct);
        const err = validatePromotion({
            label: form.label, tiers: form.tiers, discountPct: pct,
            startDate: form.startDate, endDate: form.endDate,
        });
        if (err) { showToast(err, 'error'); return; }
        setSavingPromo(true);
        try {
            const base = {
                label: form.label.trim(),
                tiers: form.tiers,
                discountPct: pct,
                billingCycle: form.billingCycle,
                startDate: form.startDate,
                endDate: form.endDate,
                isActive: form.isActive,
                updatedAt: serverTimestamp(),
            };
            let resourceId = existing?.id;
            if (existing) {
                await setDoc(doc(db, PLAN_PROMOTIONS_COLLECTION, existing.id), base, { merge: true });
                showToast(`Promotion "${base.label}" updated.`, 'success');
            } else {
                const ref = await addDoc(collection(db, PLAN_PROMOTIONS_COLLECTION), {
                    ...base,
                    createdBy: currentUser?.email || currentUser?.uid || 'superadmin',
                    createdAt: serverTimestamp(),
                });
                resourceId = ref.id;
                showToast(`Promotion "${base.label}" created.`, 'success');
            }
            logPlatformAudit({
                actor: auditActor, category: 'promotion', action: existing ? 'update' : 'create',
                resourceType: 'promotion', resourceId, resourceName: base.label,
                description: `Promotion "${base.label}" ${existing ? 'updated' : 'created'} · ${base.discountPct}% off`,
                before: existing ? { discountPct: existing.discountPct, tiers: existing.tiers, billingCycle: existing.billingCycle, isActive: existing.isActive, startDate: existing.startDate, endDate: existing.endDate } : undefined,
                after: { discountPct: base.discountPct, tiers: base.tiers, billingCycle: base.billingCycle, isActive: base.isActive, startDate: base.startDate, endDate: base.endDate },
            });
            setEditingPromo(null);
            await loadPromotions();
        } catch {
            showToast('Failed to save promotion.', 'error');
        } finally {
            setSavingPromo(false);
        }
    };

    // Activate / deactivate a promotion inline from the table.
    const togglePromotionActive = async (promo: PlanPromotion) => {
        setBusyPromo(promo.id);
        try {
            const next = !promo.isActive;
            await setDoc(doc(db, PLAN_PROMOTIONS_COLLECTION, promo.id), { isActive: next, updatedAt: serverTimestamp() }, { merge: true });
            setPromotions(prev => prev.map(p => p.id === promo.id ? { ...p, isActive: next } : p));
            showToast(`Promotion "${promo.label}" ${next ? 'activated' : 'deactivated'}.`, 'success');
            logPlatformAudit({
                actor: auditActor, category: 'promotion', action: next ? 'activate' : 'deactivate',
                resourceType: 'promotion', resourceId: promo.id, resourceName: promo.label,
                description: `Promotion "${promo.label}" ${next ? 'activated' : 'deactivated'}`,
                before: { isActive: promo.isActive }, after: { isActive: next },
            });
        } catch {
            showToast('Failed to update promotion.', 'error');
        } finally {
            setBusyPromo(null);
        }
    };

    const deletePromotion = async (promo: PlanPromotion) => {
        if (!window.confirm(`Delete promotion "${promo.label}"? This cannot be undone.`)) return;
        setBusyPromo(promo.id);
        try {
            await deleteDoc(doc(db, PLAN_PROMOTIONS_COLLECTION, promo.id));
            setPromotions(prev => prev.filter(p => p.id !== promo.id));
            showToast(`Promotion "${promo.label}" deleted.`, 'success');
            logPlatformAudit({
                actor: auditActor, category: 'promotion', action: 'delete',
                resourceType: 'promotion', resourceId: promo.id, resourceName: promo.label,
                description: `Promotion "${promo.label}" deleted`,
                before: { discountPct: promo.discountPct, tiers: promo.tiers, isActive: promo.isActive },
            });
        } catch {
            showToast('Failed to delete promotion.', 'error');
        } finally {
            setBusyPromo(null);
        }
    };

    // Save enables only when the editor differs from the plan as loaded (either the
    // module/landing entitlements or the customer-facing pricing content).
    const planDirty =
        serializeEditor(editKeys, editSections, editDefaultLanding) !== planBaseline ||
        JSON.stringify(editPricing) !== pricingBaseline;

    const toggleSubFilter = (value: string) => {
        setSubFilter(prev => {
            const next = new Set(prev);
            if (next.has(value)) next.delete(value); else next.add(value);
            return next;
        });
    };

    // Businesses table: apply name search + subscription filter, then sort by
    // Created date in the chosen direction. The underlying `tenants` list is left
    // untouched so Overview/Payments keep using it.
    const visibleTenants = (() => {
        const q = businessSearch.trim().toLowerCase();
        const filtered = tenants.filter(row => {
            if (q && !row.businessName.toLowerCase().includes(q)) return false;
            if (subFilter.size > 0) {
                const key = row.subscription ? row.subscription.planId : 'none';
                if (!subFilter.has(key)) return false;
            }
            return true;
        });
        return [...filtered].sort((a, b) => {
            const diff = tsToMillis(businessCreatedAt(a)) - tsToMillis(businessCreatedAt(b));
            return createdSort === 'desc' ? -diff : diff;
        });
    })();

    // Support table: apply status filter + free-text search across subject,
    // business, user name and email. Already newest-first from the loader.
    const visibleTickets = (() => {
        const q = ticketSearch.trim().toLowerCase();
        return tickets.filter(tk => {
            if (ticketFilter !== 'all' && tk.status !== ticketFilter) return false;
            if (q) {
                const hay = `${tk.subject} ${tk.businessName} ${tk.userName} ${tk.userEmail} ${tk.category}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
    })();

    // Overview metrics
    const activeCount = tenants.filter(t => t.subscription && ['active', 'trial', 'past_due'].includes(t.subscription.status)).length;
    const noSubCount = tenants.filter(t => !t.subscription).length;
    const plansConfigured = PLAN_ORDER.filter(id => plans[id]).length;

    // ── Render ───────────────────────────────────────────────────────────────
    return (
        <div style={{ display: 'flex', width: '100%', minHeight: 'calc(100vh - 66px)' }}>
            {/* Persistent admin sidebar */}
            <aside style={{
                width: '220px', flexShrink: 0, borderRight: '1px solid var(--surface-border)',
                background: 'var(--surface-raised)', padding: '1.25rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.25rem',
            }}>
                {SIDEBAR_SECTIONS.map(({ id, label, icon: Icon }) => {
                    const active = section === id;
                    return (
                        <button
                            key={id}
                            onClick={() => goToSection(id)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '0.7rem', width: '100%', textAlign: 'left',
                                padding: '0.6rem 0.85rem', borderRadius: '10px', cursor: 'pointer', font: 'inherit', fontSize: '0.9rem',
                                border: 'none', transition: 'background 0.15s',
                                fontWeight: active ? 600 : 500,
                                color: active ? '#fff' : 'var(--text-secondary)',
                                background: active ? 'var(--primary)' : 'transparent',
                            }}
                        >
                            <Icon size={18} /> {label}
                        </button>
                    );
                })}
            </aside>

            {/* Main content area */}
            <div style={{ flex: 1, minWidth: 0, padding: '1.75rem 2rem', overflow: 'auto' }}>
                {section === 'overview' && (
                    <OverviewSection
                        loading={tenantsLoading}
                        total={tenants.length}
                        active={activeCount}
                        noSub={noSubCount}
                        plansConfigured={plansConfigured}
                    />
                )}

                {section === 'businesses' && (
                    <>
                        <SectionHeader
                            title="Businesses"
                            subtitle="Every tenant on the platform. Open a business dashboard or adjust its subscription."
                            actions={
                                <button onClick={loadTenants} disabled={tenantsLoading} className="btn btn-secondary"
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                                    {tenantsLoading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Refresh
                                </button>
                            }
                        />

                        {/* Business-name search */}
                        <div className="glass-panel" style={{ padding: '1rem 1.25rem', marginBottom: '1.25rem' }}>
                            <div style={{ position: 'relative', maxWidth: '360px' }}>
                                <Search size={16} style={{ position: 'absolute', left: '0.7rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                                <input
                                    className="input-field"
                                    type="text"
                                    value={businessSearch}
                                    onChange={e => setBusinessSearch(e.target.value)}
                                    placeholder="Search by business name…"
                                    style={{ width: '100%', paddingLeft: '2.1rem' }}
                                />
                            </div>
                        </div>

                        {/* overflow visible so the Subscription filter popover in the table
                            header is never clipped by the panel's rounded bounds. */}
                        <div className="glass-panel" style={{ overflow: 'visible' }}>
                            {tenantsLoading ? (
                                <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                                    <Loader2 size={22} className="animate-spin" style={{ marginBottom: '0.5rem' }} />
                                    <div>Loading businesses…</div>
                                </div>
                            ) : tenantsError ? (
                                <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--danger)' }}>
                                    Couldn't load businesses.{' '}
                                    <button onClick={loadTenants} className="btn btn-secondary" style={{ marginLeft: '0.5rem', fontSize: '0.82rem' }}>Retry</button>
                                </div>
                            ) : tenants.length === 0 ? (
                                <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>No businesses found.</div>
                            ) : visibleTenants.length === 0 ? (
                                <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>No businesses match the current search or filters.</div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                                    <thead>
                                        <tr style={{ textAlign: 'left', color: 'var(--text-tertiary)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                            <th style={thStyle}>Business Name</th>
                                            <th style={thStyle}>
                                                <SubscriptionFilterHeader selected={subFilter} onToggle={toggleSubFilter} />
                                            </th>
                                            <th style={thStyle}>
                                                <CreatedSortHeader dir={createdSort} onToggle={() => setCreatedSort(prev => (prev === 'desc' ? 'asc' : 'desc'))} />
                                            </th>
                                            <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {visibleTenants.map(row => (
                                            <tr key={row.tenantId} style={{ borderTop: '1px solid var(--surface-border)' }}>
                                                <td style={tdStyle}>
                                                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{row.businessName}</div>
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{row.tenantId}</div>
                                                </td>
                                                <td style={tdStyle}>
                                                    <SubscriptionCell subscription={row.subscription} planName={row.subscription ? (plans[row.subscription.planId]?.name || row.subscription.planId) : null} />
                                                </td>
                                                <td style={{ ...tdStyle, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                                        <Calendar size={13} style={{ color: 'var(--text-tertiary)' }} />
                                                        {formatDate(businessCreatedAt(row))}
                                                    </span>
                                                </td>
                                                <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                    <div style={{ display: 'inline-flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                                                        <button
                                                            onClick={() => openTenantDashboard(row)}
                                                            title={`Open ${row.businessName}'s dashboard as Super Admin`}
                                                            className="btn btn-secondary"
                                                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', padding: '0.35rem 0.7rem' }}
                                                        >
                                                            <LayoutDashboard size={14} /> Dashboard
                                                        </button>
                                                        <button
                                                            onClick={() => setEditingTenant(row)}
                                                            title={`Edit ${row.businessName}'s subscription`}
                                                            className="btn btn-primary"
                                                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', padding: '0.35rem 0.7rem' }}
                                                        >
                                                            <Pencil size={14} /> Edit Subscription
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </>
                )}

                {section === 'payments' && (
                    <>
                        <SectionHeader
                            title="Payments"
                            subtitle="SaaS subscription payments received via Razorpay. Each row is a verified, captured payment from the server-side ledger."
                            actions={
                                <button onClick={loadPayments} disabled={paymentsLoading} className="btn btn-secondary"
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                                    {paymentsLoading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Refresh
                                </button>
                            }
                        />

                        <div className="glass-panel" style={{ overflowX: 'auto' }}>
                            {paymentsLoading ? (
                                <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                                    <Loader2 size={22} className="animate-spin" style={{ marginBottom: '0.5rem' }} />
                                    <div>Loading payments…</div>
                                </div>
                            ) : paymentsError ? (
                                <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--danger)' }}>
                                    Couldn't load payments.{' '}
                                    <button onClick={loadPayments} className="btn btn-secondary" style={{ marginLeft: '0.5rem', fontSize: '0.82rem' }}>Retry</button>
                                </div>
                            ) : payments.length === 0 ? (
                                <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>No SaaS payments recorded yet.</div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', minWidth: '900px' }}>
                                    <thead>
                                        <tr style={{ textAlign: 'left', color: 'var(--text-tertiary)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                            <th style={thStyle}>Business / Tenant</th>
                                            <th style={thStyle}>Plan</th>
                                            <th style={thStyle}>Cycle</th>
                                            <th style={{ ...thStyle, textAlign: 'right' }}>Amount</th>
                                            <th style={thStyle}>Status</th>
                                            <th style={thStyle}>Date</th>
                                            <th style={thStyle}>Payment ID</th>
                                            <th style={thStyle}>Order ID</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {payments.map(p => {
                                            const businessName = p.tenantId
                                                ? (tenants.find(t => t.tenantId === p.tenantId)?.businessName || p.tenantId)
                                                : '—';
                                            const planName = p.planId ? (plans[p.planId]?.name || p.planId) : '—';
                                            const badge = p.status ? PAYMENT_STATUS_BADGE(p.status) : null;
                                            return (
                                                <tr key={p.razorpayPaymentId} style={{ borderTop: '1px solid var(--surface-border)' }}>
                                                    <td style={tdStyle}>
                                                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{businessName}</div>
                                                        {p.tenantId && <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{p.tenantId}</div>}
                                                    </td>
                                                    <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>{planName}</td>
                                                    <td style={{ ...tdStyle, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{p.cycle || '—'}</td>
                                                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>{formatAmount(p.amount, p.currency)}</td>
                                                    <td style={tdStyle}>
                                                        {badge
                                                            ? <span style={{ ...badgeBase, background: badge.bg, color: badge.fg }}>{badge.label}</span>
                                                            : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                                                    </td>
                                                    <td style={{ ...tdStyle, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                                            <Calendar size={13} style={{ color: 'var(--text-tertiary)' }} />
                                                            {formatDate(p.createdAt)}
                                                        </span>
                                                    </td>
                                                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '0.76rem', color: 'var(--text-secondary)' }}>{p.razorpayPaymentId}</td>
                                                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '0.76rem', color: 'var(--text-secondary)' }}>{p.razorpayOrderId || '—'}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </>
                )}

                {section === 'plans' && !selectedPlan && (
                    <>
                        <SectionHeader
                            title="Plans"
                            subtitle="Configure the plan catalogue. A plan defines the maximum set of screens a tenant can access."
                            actions={
                                <button onClick={seedDefaults} disabled={seeding} title="Seed any missing plans from defaults and (re)publish the public pricing that the landing page and logged-out /pricing read." className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                                    {seeding ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Seed &amp; publish pricing
                                </button>
                            }
                        />

                        <div className="glass-panel" style={{ padding: '0.75rem 1rem', marginBottom: '1.25rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start', background: 'hsla(210,100%,50%,0.05)', border: '1px solid hsla(210,100%,50%,0.2)' }}>
                            <Info size={18} style={{ color: 'var(--primary-light)', flexShrink: 0, marginTop: '2px' }} />
                            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                Select a plan to enable/disable the ERP modules it unlocks. Settings is always on so
                                a tenant is never fully locked out. Seed the defaults first if the catalogue is empty.
                            </p>
                        </div>

                        <div className="glass-panel" style={{ overflow: 'hidden' }}>
                            {plansLoading ? (
                                <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading plans…</div>
                            ) : PLAN_ORDER.map(id => {
                                const p = plans[id];
                                const seed = DEFAULT_PLAN_CATALOGUE[id as keyof typeof DEFAULT_PLAN_CATALOGUE];
                                const pr = resolvePricing(id, p);
                                return (
                                    <div key={id} onClick={() => setSelectedPlan(id)}
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.9rem 1.25rem', cursor: 'pointer', borderBottom: '1px solid var(--surface-border)' }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                {pr.displayName || p?.name || seed?.name}
                                                {pr.badge && pr.badgeVisible && (
                                                    <span style={{ ...badgeBase, background: 'hsla(38,92%,50%,0.15)', color: 'hsl(38,80%,45%)' }}>{pr.badge}</span>
                                                )}
                                            </div>
                                            <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>{pr.tagline || p?.description || seed?.description}</div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>₹{pr.monthlyPrice.toLocaleString('en-IN')}<span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontWeight: 400 }}>/mo</span></div>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
                                                {p ? `${derivePlanEditorState(p.screens, p.features).enabledKeys.size} modules` : 'not seeded'}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}

                {section === 'plans' && selectedPlan && (
                    <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                            <button onClick={() => setSelectedPlan(null)} className="btn btn-secondary" style={{ fontSize: '0.85rem', padding: '0.35rem 0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                                <ArrowLeft size={15} /> Back to Plans
                            </button>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                {planDirty && !savingPlan && (
                                    <span style={{ fontSize: '0.75rem', color: 'var(--secondary-dark)' }}>Unsaved changes</span>
                                )}
                                <button onClick={savePlan} disabled={savingPlan || !planDirty} className="btn btn-primary"
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', opacity: (savingPlan || !planDirty) ? 0.55 : 1, cursor: (savingPlan || !planDirty) ? 'not-allowed' : 'pointer' }}>
                                    <Save size={16} /> {savingPlan ? 'Saving…' : 'Save Plan'}
                                </button>
                            </div>
                        </div>

                        <h2 style={{ fontSize: '1.3rem', margin: '0 0 0.25rem' }}>
                            {plans[selectedPlan]?.name || DEFAULT_PLAN_CATALOGUE[selectedPlan as keyof typeof DEFAULT_PLAN_CATALOGUE]?.name}
                        </h2>
                        <p style={{ margin: '0 0 1.25rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            Expand <strong>Pricing &amp; Content</strong> to edit the customer-facing plan shown on
                            /pricing, and <strong>Module Access</strong> to configure the ERP modules this plan unlocks.
                            The base price here stays the authoritative price — promotions are applied on top in the
                            Promotions section.
                        </p>

                        {/* ── Pricing & Content (collapsible) ────────────────────────────
                            Customer-facing content shown on /pricing and used to price the
                            Razorpay order server-side. Single source of truth. The editor and
                            a live /pricing preview sit side by side. Collapsed by default. */}
                        <button
                            onClick={() => setPricingContentOpen(o => !o)}
                            aria-expanded={pricingContentOpen}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', textAlign: 'left',
                                margin: '0 0 0.75rem', padding: '0.75rem 1rem', borderRadius: '10px', cursor: 'pointer',
                                font: 'inherit', border: '1px solid var(--surface-border)', background: 'var(--surface-raised)',
                            }}
                        >
                            {pricingContentOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                            <CreditCard size={17} style={{ color: 'var(--primary-light)' }} />
                            <span style={{ fontSize: '1rem', fontWeight: 600 }}>Pricing &amp; Content</span>
                            <span style={{ marginLeft: 'auto', fontSize: '0.76rem', color: 'var(--text-tertiary)' }}>
                                ₹{editPricing.monthlyPrice.toLocaleString('en-IN')}/mo
                            </span>
                        </button>

                        {pricingContentOpen && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(300px, 360px)', gap: '1.25rem', alignItems: 'start' }}>
                            <PricingEditor value={editPricing} onChange={setEditPricing} />
                            <div style={{ position: 'sticky', top: '1rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.6rem', color: 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: 600 }}>
                                    <Eye size={15} /> Live preview · /pricing
                                </div>
                                <PricingPreviewCard value={editPricing} planId={selectedPlan} />
                            </div>
                        </div>
                        )}

                        {/* ── Module Access (collapsible) ────────────────────────────────
                            Whole-module toggles mirroring the ERP Main Navbar; enabling a
                            module grants the whole module and the Business Admin controls who
                            can do what inside it. Collapsed by default to keep Pricing primary. */}
                        <button
                            onClick={() => setModuleAccessOpen(o => !o)}
                            aria-expanded={moduleAccessOpen}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', textAlign: 'left',
                                margin: '1.75rem 0 0.75rem', padding: '0.75rem 1rem', borderRadius: '10px', cursor: 'pointer',
                                font: 'inherit', border: '1px solid var(--surface-border)', background: 'var(--surface-raised)',
                            }}
                        >
                            {moduleAccessOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                            <Layers size={17} style={{ color: 'var(--primary-light)' }} />
                            <span style={{ fontSize: '1rem', fontWeight: 600 }}>Module Access</span>
                            <span style={{ marginLeft: 'auto', fontSize: '0.76rem', color: 'var(--text-tertiary)' }}>
                                {editKeys.size} module{editKeys.size === 1 ? '' : 's'} enabled
                            </span>
                        </button>

                        {moduleAccessOpen && (<>
                        <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            Where a module has sub-sections you can narrow the subscription further (e.g. Worklist on,
                            Payment Reminders off). View/Add/Edit/Delete stay with the Business Admin.
                        </p>

                        <div className="glass-panel" style={{ overflow: 'hidden' }}>
                            {SUBSCRIPTION_MODULES.map(mod => {
                                const on = editKeys.has(mod.key);
                                return (
                                    <div key={mod.key} style={{ borderBottom: '1px solid var(--surface-border)' }}>
                                        {/* Module row (top-level toggle) */}
                                        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.7rem', padding: '0.7rem 1.25rem', cursor: 'pointer', background: on ? 'hsla(152,60%,40%,0.05)' : 'transparent' }}>
                                            <input type="checkbox" checked={on}
                                                onChange={() => toggleModule(mod.key)}
                                                style={{ width: '1.15rem', height: '1.15rem', accentColor: 'var(--primary-light)', marginTop: '2px' }} />
                                            <span style={{ flex: 1 }}>
                                                <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>{mod.label}</span>
                                                {mod.note && (
                                                    <span style={{ display: 'block', fontSize: '0.74rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>{mod.note}</span>
                                                )}
                                            </span>
                                            {mod.sections.length > 0 && (
                                                <span style={{ fontSize: '0.7rem', color: on ? 'var(--primary-light)' : 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                                                    {mod.sections.filter(s => editSections.has(s.id)).length}/{mod.sections.length} sub-sections
                                                </span>
                                            )}
                                        </label>

                                        {/* Sub-sections (no actions). Shown only when the module is on. */}
                                        {on && mod.sections.length > 0 && (
                                            <div style={{ padding: '0 1.25rem 0.6rem 2.85rem', display: 'flex', flexWrap: 'wrap', gap: '0.45rem 1.5rem' }}>
                                                {mod.sections.map(s => (
                                                    <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', cursor: 'pointer', fontSize: '0.83rem', color: 'var(--text-secondary)' }}>
                                                        <input type="checkbox" checked={editSections.has(s.id)}
                                                            onChange={() => toggleSection(s.id)}
                                                            style={{ width: '0.95rem', height: '0.95rem', accentColor: 'var(--primary-light)' }} />
                                                        {s.label}
                                                    </label>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Default landing page — only screens enabled in this plan are selectable */}
                        <div className="glass-panel" style={{ padding: '1rem 1.25rem', marginTop: '1rem' }}>
                            <div style={{ fontWeight: 600, fontSize: '0.92rem', marginBottom: '0.35rem' }}>Default Landing Page</div>
                            <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                Where admin/analyst users land after login when no role-specific page is configured.
                                Only pages included in this plan's modules are selectable.
                            </p>
                            <select
                                className="input-field"
                                value={editDefaultLanding}
                                onChange={e => setEditDefaultLanding(e.target.value)}
                                style={{ maxWidth: '280px' }}
                            >
                                <option value="">— Use role default —</option>
                                {PLAN_LANDING_OPTIONS
                                    .filter(opt => editKeys.has(opt.moduleKey))
                                    .map(opt => (
                                        <option key={opt.path} value={opt.path}>{opt.label} ({opt.path})</option>
                                    ))
                                }
                            </select>
                        </div>
                        </>)}
                    </>
                )}

                {section === 'promotions' && (
                    <>
                        <SectionHeader
                            title="Promotions"
                            subtitle="Time-boxed % discounts applied on top of a plan's base price. The base price is never overwritten — promotions are stored separately and applied dynamically on /pricing and at Razorpay checkout."
                            actions={
                                <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                                    <button onClick={loadPromotions} disabled={promotionsLoading} className="btn btn-secondary"
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                                        {promotionsLoading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Refresh
                                    </button>
                                    <button onClick={() => setEditingPromo('new')} className="btn btn-primary"
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                                        <Plus size={15} /> Add Promotion
                                    </button>
                                </div>
                            }
                        />

                        <div className="glass-panel" style={{ overflowX: 'auto' }}>
                            {promotionsLoading ? (
                                <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                                    <Loader2 size={22} className="animate-spin" style={{ marginBottom: '0.5rem' }} />
                                    <div>Loading promotions…</div>
                                </div>
                            ) : promotionsError ? (
                                <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--danger)' }}>
                                    Couldn't load promotions.{' '}
                                    <button onClick={loadPromotions} className="btn btn-secondary" style={{ marginLeft: '0.5rem', fontSize: '0.82rem' }}>Retry</button>
                                </div>
                            ) : promotions.length === 0 ? (
                                <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                                    No promotions yet. Click “Add Promotion” to create one.
                                </div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem', minWidth: '900px' }}>
                                    <thead>
                                        <tr style={{ textAlign: 'left', color: 'var(--text-tertiary)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                            <th style={thStyle}>Promotion</th>
                                            <th style={thStyle}>Applies To</th>
                                            <th style={thStyle}>Discount</th>
                                            <th style={thStyle}>Cycle</th>
                                            <th style={thStyle}>Window</th>
                                            <th style={thStyle}>Status</th>
                                            <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {promotions.map(promo => {
                                            const badge = promoStateBadge(promo);
                                            const busy = busyPromo === promo.id;
                                            return (
                                                <tr key={promo.id} style={{ borderTop: '1px solid var(--surface-border)', opacity: busy ? 0.55 : 1 }}>
                                                    <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--text-primary)' }}>{promo.label}</td>
                                                    <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>{promoTierLabels(promo.tiers)}</td>
                                                    <td style={{ ...tdStyle, fontWeight: 700, whiteSpace: 'nowrap' }}>{promo.discountPct}% OFF</td>
                                                    <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>{promoCycleLabel(promo.billingCycle)}</td>
                                                    <td style={{ ...tdStyle, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                                            <Calendar size={13} style={{ color: 'var(--text-tertiary)' }} />
                                                            {formatDate(promo.startDate)} – {formatDate(promo.endDate)}
                                                        </span>
                                                    </td>
                                                    <td style={tdStyle}>
                                                        <span style={{ ...badgeBase, background: badge.bg, color: badge.fg }}>{badge.label}</span>
                                                    </td>
                                                    <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                        <div style={{ display: 'inline-flex', gap: '0.35rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                                            <button
                                                                onClick={() => togglePromotionActive(promo)}
                                                                disabled={busy}
                                                                title={promo.isActive ? 'Deactivate' : 'Activate'}
                                                                className="btn btn-secondary"
                                                                style={jobActionBtn}
                                                            >
                                                                <Power size={14} /> {promo.isActive ? 'Deactivate' : 'Activate'}
                                                            </button>
                                                            <button
                                                                onClick={() => setEditingPromo(promo)}
                                                                title="Edit promotion"
                                                                className="btn btn-primary"
                                                                style={jobActionBtn}
                                                            >
                                                                <Pencil size={14} /> Edit
                                                            </button>
                                                            <button
                                                                onClick={() => deletePromotion(promo)}
                                                                disabled={busy}
                                                                title="Delete promotion"
                                                                className="btn btn-secondary"
                                                                style={jobActionBtn}
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </>
                )}

                {section === 'careers' && (
                    <>
                        <SectionHeader
                            title="Careers"
                            subtitle="Manage the job openings shown on the public /careers page. Only Published openings are visible to the public."
                            actions={
                                <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                                    <button onClick={loadJobs} disabled={jobsLoading} className="btn btn-secondary"
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                                        {jobsLoading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Refresh
                                    </button>
                                    <button onClick={() => setEditingJob('new')} className="btn btn-primary"
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                                        <Plus size={15} /> Add Job Opening
                                    </button>
                                </div>
                            }
                        />

                        <div className="glass-panel" style={{ overflowX: 'auto' }}>
                            {jobsLoading ? (
                                <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                                    <Loader2 size={22} className="animate-spin" style={{ marginBottom: '0.5rem' }} />
                                    <div>Loading job openings…</div>
                                </div>
                            ) : jobsError ? (
                                <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--danger)' }}>
                                    Couldn't load job openings.{' '}
                                    <button onClick={loadJobs} className="btn btn-secondary" style={{ marginLeft: '0.5rem', fontSize: '0.82rem' }}>Retry</button>
                                </div>
                            ) : jobs.length === 0 ? (
                                <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                                    No job openings yet. Click “Add Job Opening” to create one.
                                </div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem', minWidth: '820px' }}>
                                    <thead>
                                        <tr style={{ textAlign: 'left', color: 'var(--text-tertiary)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                            <th style={thStyle}>Job Title</th>
                                            <th style={thStyle}>Department</th>
                                            <th style={thStyle}>Location</th>
                                            <th style={thStyle}>Status</th>
                                            <th style={thStyle}>Created</th>
                                            <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {jobs.map(job => {
                                            const badge = JOB_STATUS_BADGE[job.status] ?? JOB_STATUS_BADGE.draft;
                                            const busy = deletingJob === job.id;
                                            return (
                                                <tr key={job.id} style={{ borderTop: '1px solid var(--surface-border)', opacity: busy ? 0.55 : 1 }}>
                                                    <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--text-primary)' }}>{job.title}</td>
                                                    <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>{job.department}</td>
                                                    <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>{job.location}</td>
                                                    <td style={tdStyle}>
                                                        <span style={{ ...badgeBase, background: badge.bg, color: badge.fg }}>{badge.label}</span>
                                                    </td>
                                                    <td style={{ ...tdStyle, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                                            <Calendar size={13} style={{ color: 'var(--text-tertiary)' }} />
                                                            {formatDate(job.createdAt)}
                                                        </span>
                                                    </td>
                                                    <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                        <div style={{ display: 'inline-flex', gap: '0.35rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                                            <button
                                                                onClick={() => previewJob(job)}
                                                                title="Preview on the public careers page (new tab)"
                                                                className="btn btn-secondary"
                                                                style={jobActionBtn}
                                                            >
                                                                <ExternalLink size={14} /> View
                                                            </button>
                                                            {job.status !== 'published' ? (
                                                                <button
                                                                    onClick={() => setJobStatus(job, 'published')}
                                                                    disabled={busy}
                                                                    title="Publish — make visible on /careers"
                                                                    className="btn btn-secondary"
                                                                    style={jobActionBtn}
                                                                >
                                                                    <Check size={14} /> Publish
                                                                </button>
                                                            ) : (
                                                                <button
                                                                    onClick={() => setJobStatus(job, 'closed')}
                                                                    disabled={busy}
                                                                    title="Close — remove from /careers"
                                                                    className="btn btn-secondary"
                                                                    style={jobActionBtn}
                                                                >
                                                                    <X size={14} /> Close
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={() => setEditingJob(job)}
                                                                title="Edit opening"
                                                                className="btn btn-primary"
                                                                style={jobActionBtn}
                                                            >
                                                                <Pencil size={14} /> Edit
                                                            </button>
                                                            <button
                                                                onClick={() => deleteJob(job)}
                                                                disabled={busy}
                                                                title="Delete opening"
                                                                className="btn btn-secondary"
                                                                style={jobActionBtn}
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </>
                )}
                {section === 'support' && (
                    <>
                        <SectionHeader
                            title="Support Tickets"
                            subtitle="Every support ticket raised by businesses across the platform. Open a ticket to view details, change status/priority, and reply."
                            actions={
                                <button onClick={loadTickets} disabled={ticketsLoading} className="btn btn-secondary"
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                                    {ticketsLoading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Refresh
                                </button>
                            }
                        />

                        {/* Filters: status tabs + free-text search */}
                        <div className="glass-panel" style={{ padding: '0.9rem 1.1rem', marginBottom: '1.25rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <div style={{ display: 'inline-flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                {TICKET_FILTER_OPTIONS.map(opt => {
                                    const active = ticketFilter === opt.value;
                                    const count = opt.value === 'all'
                                        ? tickets.length
                                        : tickets.filter(t => t.status === opt.value).length;
                                    return (
                                        <button
                                            key={opt.value}
                                            onClick={() => setTicketFilter(opt.value)}
                                            style={{
                                                padding: '0.35rem 0.8rem', borderRadius: '999px', cursor: 'pointer', font: 'inherit',
                                                fontSize: '0.8rem', fontWeight: active ? 600 : 500, border: '1px solid var(--surface-border)',
                                                background: active ? 'var(--primary)' : 'transparent',
                                                color: active ? '#fff' : 'var(--text-secondary)',
                                            }}
                                        >
                                            {opt.label} ({count})
                                        </button>
                                    );
                                })}
                            </div>
                            <div style={{ position: 'relative', flex: 1, minWidth: '220px', maxWidth: '340px', marginLeft: 'auto' }}>
                                <Search size={16} style={{ position: 'absolute', left: '0.7rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                                <input
                                    className="input-field"
                                    type="text"
                                    value={ticketSearch}
                                    onChange={e => setTicketSearch(e.target.value)}
                                    placeholder="Search subject, business, user…"
                                    style={{ width: '100%', paddingLeft: '2.1rem' }}
                                />
                            </div>
                        </div>

                        <div className="glass-panel" style={{ overflowX: 'auto' }}>
                            {ticketsLoading ? (
                                <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                                    <Loader2 size={22} className="animate-spin" style={{ marginBottom: '0.5rem' }} />
                                    <div>Loading support tickets…</div>
                                </div>
                            ) : ticketsError ? (
                                <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--danger)' }}>
                                    Couldn't load support tickets.{' '}
                                    <button onClick={loadTickets} className="btn btn-secondary" style={{ marginLeft: '0.5rem', fontSize: '0.82rem' }}>Retry</button>
                                </div>
                            ) : tickets.length === 0 ? (
                                <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>No support tickets raised yet.</div>
                            ) : visibleTickets.length === 0 ? (
                                <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>No tickets match the current filter or search.</div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem', minWidth: '940px' }}>
                                    <thead>
                                        <tr style={{ textAlign: 'left', color: 'var(--text-tertiary)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                            <th style={thStyle}>Subject</th>
                                            <th style={thStyle}>Business</th>
                                            <th style={thStyle}>User</th>
                                            <th style={thStyle}>Priority</th>
                                            <th style={thStyle}>Status</th>
                                            <th style={thStyle}>Created</th>
                                            <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {visibleTickets.map(tk => {
                                            const st = TICKET_STATUS_BADGE[tk.status] ?? TICKET_STATUS_BADGE.open;
                                            const pr = TICKET_PRIORITY_BADGE[tk.priority] ?? TICKET_PRIORITY_BADGE.medium;
                                            return (
                                                <tr key={tk.id} style={{ borderTop: '1px solid var(--surface-border)' }}>
                                                    <td style={{ ...tdStyle, maxWidth: '260px' }}>
                                                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                            {tk.subject}
                                                            {tk.adminResponse && <MessageSquare size={12} style={{ color: 'var(--primary-light)', flexShrink: 0 }} />}
                                                            {tk.attachmentUrl && <Paperclip size={12} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />}
                                                        </div>
                                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>{tk.category}</div>
                                                    </td>
                                                    <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>
                                                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{tk.businessName}</div>
                                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{tk.tenantId}</div>
                                                    </td>
                                                    <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>
                                                        <div>{tk.userName}</div>
                                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>{tk.userEmail}</div>
                                                    </td>
                                                    <td style={tdStyle}><span style={{ ...badgeBase, background: pr.bg, color: pr.fg }}>{pr.label}</span></td>
                                                    <td style={tdStyle}><span style={{ ...badgeBase, background: st.bg, color: st.fg }}>{st.label}</span></td>
                                                    <td style={{ ...tdStyle, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                                            <Calendar size={13} style={{ color: 'var(--text-tertiary)' }} />
                                                            {formatDate(tk.createdAt)}
                                                        </span>
                                                    </td>
                                                    <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                        <button
                                                            onClick={() => setSelectedTicket(tk)}
                                                            title="View & manage ticket"
                                                            className="btn btn-primary"
                                                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', padding: '0.35rem 0.7rem' }}
                                                        >
                                                            <Pencil size={14} /> Manage
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </>
                )}

                {section === 'audit-logs' && <AuditLogsSection />}
            </div>

            {/* Support ticket detail / management modal */}
            {selectedTicket && (
                <SupportTicketModal
                    ticket={selectedTicket}
                    saving={savingTicket}
                    onSave={updateTicket}
                    onClose={() => setSelectedTicket(null)}
                />
            )}

            {/* Promotion editor — create (editingPromo === 'new') or edit an existing one */}
            {editingPromo && (
                <PromotionModal
                    promo={editingPromo === 'new' ? null : editingPromo}
                    plans={plans}
                    saving={savingPromo}
                    onSave={savePromotion}
                    onClose={() => setEditingPromo(null)}
                />
            )}

            {/* Job opening editor — create (editingJob === 'new') or edit an existing one */}
            {editingJob && (
                <JobOpeningModal
                    job={editingJob === 'new' ? null : editingJob}
                    saving={savingJob}
                    onSave={saveJob}
                    onClose={() => setEditingJob(null)}
                />
            )}

            {/* Edit Subscription modal — reuses assignTenant + the plan/status selectors */}
            {editingTenant && (
                <EditSubscriptionModal
                    row={editingTenant}
                    plans={plans}
                    saving={savingTenant === editingTenant.tenantId}
                    planExists={(id: PlanId) => !!plans[id]}
                    onSave={assignTenant}
                    onClose={() => setEditingTenant(null)}
                />
            )}
        </div>
    );
}

// ─── Shared bits ──────────────────────────────────────────────────────────────
const thStyle: React.CSSProperties = { padding: '0.7rem 1.1rem', fontWeight: 600 };
const tdStyle: React.CSSProperties = { padding: '0.75rem 1.1rem', verticalAlign: 'middle' };

function SectionHeader({ title, subtitle, actions }: { title: string; subtitle: string; actions?: React.ReactNode }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            <div>
                <h1 className="primary-gradient-text" style={{ fontSize: '1.6rem', display: 'flex', alignItems: 'center', gap: '0.55rem', margin: '0 0 0.3rem' }}>
                    <ShieldCheck size={24} /> {title}
                </h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', margin: 0, maxWidth: '640px' }}>{subtitle}</p>
            </div>
            {actions && <div style={{ flexShrink: 0 }}>{actions}</div>}
        </div>
    );
}

// SUBSCRIPTION header with an inline multi-select filter popover. Selecting plan
// ids / "No Subscription" drives the visibleTenants filter in the parent.
function SubscriptionFilterHeader({ selected, onToggle }: { selected: Set<string>; onToggle: (value: string) => void }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const active = selected.size > 0;

    useEffect(() => {
        if (!open) return;
        const onDocClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, [open]);

    return (
        <div ref={ref} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            Subscription
            <button
                onClick={() => setOpen(o => !o)}
                aria-label="Filter by subscription"
                title="Filter by subscription"
                style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0.2rem',
                    border: 'none', borderRadius: '6px', cursor: 'pointer',
                    background: active ? 'var(--primary)' : 'transparent',
                    color: active ? '#fff' : 'var(--text-tertiary)',
                }}
            >
                <Filter size={13} />
            </button>
            {open && (
                <div className="glass-panel" style={{
                    position: 'absolute', top: 'calc(100% + 0.45rem)', left: 0, zIndex: 50, padding: '0.6rem 0.75rem',
                    minWidth: '180px', display: 'flex', flexDirection: 'column', gap: '0.45rem',
                    textTransform: 'none', letterSpacing: 'normal',
                }}>
                    {SUB_FILTER_OPTIONS.map(opt => (
                        <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.84rem', fontWeight: 500, color: 'var(--text-secondary)' }}>
                            <input
                                type="checkbox"
                                checked={selected.has(opt.value)}
                                onChange={() => onToggle(opt.value)}
                                style={{ width: '1rem', height: '1rem', accentColor: 'var(--primary-light)' }}
                            />
                            {opt.label}
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
}

// CREATED header with a sort-direction toggle (newest ⇄ oldest first).
function CreatedSortHeader({ dir, onToggle }: { dir: 'desc' | 'asc'; onToggle: () => void }) {
    return (
        <button
            onClick={onToggle}
            title={dir === 'desc' ? 'Sorted newest first — click for oldest first' : 'Sorted oldest first — click for newest first'}
            style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: 0,
                background: 'transparent', border: 'none', cursor: 'pointer', font: 'inherit',
                color: 'inherit', textTransform: 'inherit', letterSpacing: 'inherit',
            }}
        >
            Created {dir === 'desc' ? <ArrowDown size={13} /> : <ArrowUp size={13} />}
        </button>
    );
}

function SubscriptionCell({ subscription, planName }: { subscription: TenantSubscription | null; planName: string | null }) {
    if (!subscription) {
        return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ ...badgeBase, background: 'var(--surface-border)', color: 'var(--text-tertiary)' }}>No subscription</span>
            </span>
        );
    }
    const badge = STATUS_BADGE[subscription.status];
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{planName}</span>
            <span style={{ ...badgeBase, background: badge.bg, color: badge.fg }}>{badge.label}</span>
        </span>
    );
}

const badgeBase: React.CSSProperties = {
    fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.55rem', borderRadius: '999px', whiteSpace: 'nowrap',
};

// Compact button used for each Careers table row action.
const jobActionBtn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', padding: '0.35rem 0.7rem',
};

// Colour map for the Razorpay payment status stored in saasPayments (currently
// 'captured'; other Razorpay statuses are handled gracefully with a neutral badge).
function PAYMENT_STATUS_BADGE(status: string): { bg: string; fg: string; label: string } {
    const label = status.charAt(0).toUpperCase() + status.slice(1);
    switch (status) {
        case 'captured':
        case 'authorized':
            return { bg: 'hsla(152,60%,40%,0.15)', fg: 'hsl(152,55%,38%)', label };
        case 'created':
        case 'pending':
            return { bg: 'hsla(38,92%,50%,0.15)', fg: 'hsl(38,80%,45%)', label };
        case 'failed':
        case 'refunded':
            return { bg: 'hsla(0,75%,55%,0.15)', fg: 'hsl(0,70%,55%)', label };
        default:
            return { bg: 'var(--surface-border)', fg: 'var(--text-secondary)', label };
    }
}

function OverviewSection({
    loading, total, active, noSub, plansConfigured,
}: {
    loading: boolean; total: number; active: number; noSub: number; plansConfigured: number;
}) {
    const cards = [
        { label: 'Total businesses', value: total, icon: Building2 },
        { label: 'Active subscriptions', value: active, icon: Check },
        { label: 'Without subscription', value: noSub, icon: Info },
        { label: 'Plans configured', value: `${plansConfigured}/${PLAN_ORDER.length}`, icon: Layers },
    ];
    return (
        <>
            <SectionHeader title="Overview" subtitle="Platform snapshot across all tenants and plans." />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                {cards.map(({ label, value, icon: Icon }) => (
                    <div key={label} className="glass-panel" style={{ padding: '1.1rem 1.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-tertiary)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                            <Icon size={16} /> {label}
                        </div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {loading ? '…' : value}
                        </div>
                    </div>
                ))}
            </div>
        </>
    );
}

// ─── Edit Subscription modal ──────────────────────────────────────────────────
function EditSubscriptionModal({
    row, plans, saving, planExists, onSave, onClose,
}: {
    row: TenantRow;
    plans: Record<string, Plan>;
    saving: boolean;
    planExists: (id: PlanId) => boolean;
    onSave: (row: TenantRow, planId: PlanId, status: SubscriptionStatus) => void;
    onClose: () => void;
}) {
    const [planId, setPlanId] = useState<PlanId>((row.subscription?.planId as PlanId) || 'retailer');
    const [status, setStatus] = useState<SubscriptionStatus>(row.subscription?.status || 'active');

    const dirty = planId !== row.subscription?.planId || status !== row.subscription?.status;
    const current = row.subscription;

    return (
        <div
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}
        >
            <div onClick={e => e.stopPropagation()} className="glass-panel" style={{ width: '100%', maxWidth: '440px', padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                    <div>
                        <h2 style={{ fontSize: '1.15rem', margin: '0 0 0.2rem' }}>Edit Subscription</h2>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{row.businessName}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{row.tenantId}</div>
                    </div>
                    <button onClick={onClose} aria-label="Close" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: '0.2rem' }}>
                        <X size={20} />
                    </button>
                </div>

                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem', color: 'var(--text-secondary)' }}>Plan</label>
                <select className="input-field" style={{ width: '100%', marginBottom: '1rem' }} value={planId} onChange={e => setPlanId(e.target.value as PlanId)}>
                    {PLAN_ORDER.map(id => (
                        <option key={id} value={id} disabled={!planExists(id)}>
                            {plans[id]?.name || (id.charAt(0).toUpperCase() + id.slice(1))}{planExists(id) ? '' : ' (not seeded)'}
                        </option>
                    ))}
                </select>

                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem', color: 'var(--text-secondary)' }}>Status</label>
                <select className="input-field" style={{ width: '100%', marginBottom: '1.5rem' }} value={status} onChange={e => setStatus(e.target.value as SubscriptionStatus)}>
                    {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
                    <button onClick={onClose} className="btn btn-secondary" style={{ fontSize: '0.85rem' }}>Cancel</button>
                    <button
                        onClick={() => onSave(row, planId, status)}
                        disabled={saving || !dirty || !planExists(planId)}
                        className="btn btn-primary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', opacity: (saving || !dirty || !planExists(planId)) ? 0.55 : 1 }}
                    >
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} {current ? 'Update' : 'Assign'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Job Opening editor modal ─────────────────────────────────────────────────
// Create (job === null) or edit an existing opening. Requirements are entered one
// per line and stored as string[]. The Save button writes with the currently
// selected status; convenience buttons set status = draft / published then save.
const jobFieldLabel: React.CSSProperties = {
    display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem', color: 'var(--text-secondary)',
};

function JobOpeningModal({
    job, saving, onSave, onClose,
}: {
    job: JobOpening | null;
    saving: boolean;
    onSave: (form: JobFormState, existing: JobOpening | null) => void;
    onClose: () => void;
}) {
    const [form, setForm] = useState<JobFormState>(
        job
            ? {
                title: job.title ?? '',
                department: job.department ?? '',
                location: job.location ?? '',
                employmentType: job.employmentType || 'Full-time',
                description: job.description ?? '',
                requirementsText: (job.requirements ?? []).join('\n'),
                status: job.status ?? 'draft',
            }
            : EMPTY_JOB_FORM,
    );
    const set = <K extends keyof JobFormState>(k: K, v: JobFormState[K]) => setForm(prev => ({ ...prev, [k]: v }));

    // Validation — returns a user-facing message or null when the form is valid.
    const validate = (): string | null => {
        if (!form.title.trim()) return 'Job title is required.';
        if (!form.department.trim()) return 'Department is required.';
        if (!form.location.trim()) return 'Location is required.';
        if (!form.employmentType.trim()) return 'Employment type is required.';
        if (!form.description.trim()) return 'Description is required.';
        return null;
    };
    const validationError = validate();

    // Save with the currently selected status (dropdown is the source of truth).
    const submit = () => {
        if (validationError) return;
        onSave(form, job);
    };

    // Primary button label reflects the chosen status so Draft/Publish/Close are explicit.
    const saveLabel = form.status === 'published' ? 'Publish'
        : form.status === 'closed' ? 'Save as Closed'
        : 'Save as Draft';

    return (
        <div
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}
        >
            <div onClick={e => e.stopPropagation()} className="glass-panel" style={{ width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                    <div>
                        <h2 style={{ fontSize: '1.15rem', margin: '0 0 0.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Briefcase size={18} /> {job ? 'Edit Job Opening' : 'Add Job Opening'}
                        </h2>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            {job ? 'Update this opening. Changes go live immediately for published roles.' : 'Create a new opening for the public Careers page.'}
                        </div>
                    </div>
                    <button onClick={onClose} aria-label="Close" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: '0.2rem' }}>
                        <X size={20} />
                    </button>
                </div>

                <label style={jobFieldLabel}>Job Title *</label>
                <input className="input-field" style={{ width: '100%', marginBottom: '1rem' }} value={form.title}
                    placeholder="e.g. Senior Frontend Engineer" onChange={e => set('title', e.target.value)} />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                    <div>
                        <label style={jobFieldLabel}>Department *</label>
                        <input className="input-field" style={{ width: '100%' }} value={form.department}
                            placeholder="e.g. Engineering" onChange={e => set('department', e.target.value)} />
                    </div>
                    <div>
                        <label style={jobFieldLabel}>Location *</label>
                        <input className="input-field" style={{ width: '100%' }} value={form.location}
                            placeholder="e.g. Bengaluru · Hybrid" onChange={e => set('location', e.target.value)} />
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                    <div>
                        <label style={jobFieldLabel}>Employment Type *</label>
                        <select className="input-field" style={{ width: '100%' }} value={form.employmentType} onChange={e => set('employmentType', e.target.value)}>
                            {EMPLOYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={jobFieldLabel}>Status</label>
                        <select className="input-field" style={{ width: '100%' }} value={form.status} onChange={e => set('status', e.target.value as JobStatus)}>
                            {JOB_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </div>
                </div>

                <label style={jobFieldLabel}>Description *</label>
                <textarea className="input-field" style={{ width: '100%', minHeight: '96px', resize: 'vertical', marginBottom: '1rem' }} value={form.description}
                    placeholder="What the role is about and what the person will own." onChange={e => set('description', e.target.value)} />

                <label style={jobFieldLabel}>Requirements</label>
                <textarea className="input-field" style={{ width: '100%', minHeight: '96px', resize: 'vertical', marginBottom: '0.35rem' }} value={form.requirementsText}
                    placeholder={'One requirement per line, e.g.\n5+ years with React & TypeScript\nStrong eye for UI detail'} onChange={e => set('requirementsText', e.target.value)} />
                <div style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', marginBottom: '1.25rem' }}>One requirement per line.</div>

                {validationError && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--danger)', marginBottom: '1rem' }}>{validationError}</div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', flexWrap: 'wrap' }}>
                    <button onClick={onClose} className="btn btn-secondary" style={{ fontSize: '0.85rem' }}>Cancel</button>
                    <button
                        onClick={submit}
                        disabled={saving || !!validationError}
                        className="btn btn-primary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', opacity: (saving || validationError) ? 0.55 : 1, cursor: (saving || validationError) ? 'not-allowed' : 'pointer' }}
                    >
                        {saving ? <Loader2 size={14} className="animate-spin" /> : form.status === 'published' ? <Check size={14} /> : <Save size={14} />} {saveLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Promotion editor modal ───────────────────────────────────────────────────
// Create (promo === null) or edit an existing promotion. Targets one or more
// pricing tiers (each shown with its business-category label), a discount %, a
// billing cycle, a start/end date window and an active flag. A live preview shows
// the effective discounted price per selected tier using the real base prices.
function PromotionModal({
    promo, plans, saving, onSave, onClose,
}: {
    promo: PlanPromotion | null;
    plans: Record<string, Plan>;
    saving: boolean;
    onSave: (form: PromoFormState, existing: PlanPromotion | null) => void;
    onClose: () => void;
}) {
    const [form, setForm] = useState<PromoFormState>(
        promo
            ? {
                label: promo.label ?? '',
                tiers: [...(promo.tiers ?? [])],
                discountPct: String(promo.discountPct ?? ''),
                billingCycle: promo.billingCycle ?? 'both',
                startDate: promo.startDate ?? todayISO(),
                endDate: promo.endDate ?? todayISO(),
                isActive: promo.isActive ?? true,
            }
            : EMPTY_PROMO_FORM,
    );
    const set = <K extends keyof PromoFormState>(k: K, v: PromoFormState[K]) => setForm(prev => ({ ...prev, [k]: v }));
    const toggleTier = (tier: PromoTier) => setForm(prev => ({
        ...prev,
        tiers: prev.tiers.includes(tier) ? prev.tiers.filter(t => t !== tier) : [...prev.tiers, tier],
    }));

    const pct = Number(form.discountPct);
    const validationError = validatePromotion({
        label: form.label, tiers: form.tiers, discountPct: pct,
        startDate: form.startDate, endDate: form.endDate,
    });

    // Base price for a tier: the live plan doc's pricing, else the seed default.
    const basePricing = (tier: PromoTier) => {
        const catalogId = PRICING_TIER_TO_PLAN_ID[tier] as keyof typeof DEFAULT_PLAN_PRICING;
        return plans[catalogId]?.pricing ?? DEFAULT_PLAN_PRICING[catalogId];
    };

    return (
        <div
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}
        >
            <div onClick={e => e.stopPropagation()} className="glass-panel" style={{ width: '100%', maxWidth: '580px', maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                    <div>
                        <h2 style={{ fontSize: '1.15rem', margin: '0 0 0.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Percent size={18} /> {promo ? 'Edit Promotion' : 'Add Promotion'}
                        </h2>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            Applied on top of the base price. The base price is never changed.
                        </div>
                    </div>
                    <button onClick={onClose} aria-label="Close" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: '0.2rem' }}>
                        <X size={20} />
                    </button>
                </div>

                <label style={jobFieldLabel}>Promotion Name *</label>
                <input className="input-field" style={{ width: '100%', marginBottom: '1rem' }} value={form.label}
                    placeholder="e.g. Diwali Sale" onChange={e => set('label', e.target.value)} />

                <label style={jobFieldLabel}>Applicable Plans *</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1rem' }}>
                    {PROMO_TIER_OPTIONS.map(opt => (
                        <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', cursor: 'pointer', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                            <input type="checkbox" checked={form.tiers.includes(opt.value)}
                                onChange={() => toggleTier(opt.value)}
                                style={{ width: '1.05rem', height: '1.05rem', accentColor: 'var(--primary-light)' }} />
                            {opt.label}
                        </label>
                    ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                    <div>
                        <label style={jobFieldLabel}>Discount % *</label>
                        <input className="input-field" type="number" min={1} max={100} step="any" style={{ width: '100%' }}
                            value={form.discountPct}
                            placeholder="e.g. 10"
                            onChange={e => set('discountPct', e.target.value)} />
                    </div>
                    <div>
                        <label style={jobFieldLabel}>Billing Cycle *</label>
                        <select className="input-field" style={{ width: '100%' }} value={form.billingCycle}
                            onChange={e => set('billingCycle', e.target.value as PromoBillingCycle)}>
                            {PROMO_CYCLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                    <div>
                        <label style={jobFieldLabel}>Start Date *</label>
                        <input className="input-field" type="date" style={{ width: '100%' }} value={form.startDate}
                            onChange={e => set('startDate', e.target.value)} />
                    </div>
                    <div>
                        <label style={jobFieldLabel}>End Date *</label>
                        <input className="input-field" type="date" style={{ width: '100%' }} value={form.endDate}
                            min={form.startDate || undefined}
                            onChange={e => set('endDate', e.target.value)} />
                    </div>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', fontSize: '0.88rem', cursor: 'pointer', marginBottom: '1.25rem' }}>
                    <input type="checkbox" checked={form.isActive}
                        onChange={e => set('isActive', e.target.checked)}
                        style={{ width: '1.1rem', height: '1.1rem', accentColor: 'var(--primary-light)' }} />
                    Active (uncheck to save as a disabled/draft promotion)
                </label>

                {/* Effective-price preview for each selected tier */}
                {form.tiers.length > 0 && Number.isFinite(pct) && pct > 0 && pct <= 100 && (
                    <div style={{ padding: '0.9rem 1rem', borderRadius: '10px', background: 'var(--surface)', marginBottom: '1.25rem' }}>
                        <div style={{ ...jobFieldLabel, marginBottom: '0.5rem' }}>Effective price preview ({pct}% off)</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            {form.tiers.map(tier => {
                                const bp = basePricing(tier);
                                const label = PROMO_TIER_OPTIONS.find(o => o.value === tier)?.label ?? tier;
                                const showMonthly = form.billingCycle !== 'yearly';
                                const showYearly = form.billingCycle !== 'monthly';
                                return (
                                    <div key={tier} style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{label}: </span>
                                        {showMonthly && (
                                            <span>
                                                <span style={{ textDecoration: 'line-through', color: 'var(--text-tertiary)' }}>₹{bp.monthlyPrice.toLocaleString('en-IN')}</span>
                                                {' → '}<strong>₹{formatRupees(discountedRupees(bp.monthlyPrice, pct))}</strong>/mo
                                            </span>
                                        )}
                                        {showMonthly && showYearly && <span> · </span>}
                                        {showYearly && (
                                            <span>
                                                <span style={{ textDecoration: 'line-through', color: 'var(--text-tertiary)' }}>₹{bp.yearlyPrice.toLocaleString('en-IN')}</span>
                                                {' → '}<strong>₹{formatRupees(discountedRupees(bp.yearlyPrice, pct))}</strong>/yr
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {validationError && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--danger)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Info size={14} /> {validationError}
                    </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
                    <button onClick={onClose} className="btn btn-secondary" style={{ fontSize: '0.85rem' }}>Cancel</button>
                    <button
                        onClick={() => { if (!validationError) onSave(form, promo); }}
                        disabled={saving || !!validationError}
                        className="btn btn-primary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', opacity: (saving || validationError) ? 0.55 : 1, cursor: (saving || validationError) ? 'not-allowed' : 'pointer' }}
                    >
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {promo ? 'Update Promotion' : 'Create Promotion'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Pricing & content editor ─────────────────────────────────────────────────
// Edits the customer-facing PlanPricing block: name, tagline, description,
// monthly/yearly price, savings label, badge (+ visibility) and the feature /
// limit lists. This is the SAME data /pricing renders and Razorpay prices from.
const fieldLabel: React.CSSProperties = {
    display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.3rem', color: 'var(--text-secondary)',
};

function PricingEditor({ value, onChange }: { value: PlanPricing; onChange: (p: PlanPricing) => void }) {
    const set = <K extends keyof PlanPricing>(k: K, v: PlanPricing[K]) => onChange({ ...value, [k]: v });
    const savingsPct = computeSavingsPct(value.monthlyPrice, value.yearlyPrice);
    const priceError = validatePricing(value);

    return (
        <div className="glass-panel" style={{ padding: '1.25rem 1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '1rem' }}>
                <Tag size={17} style={{ color: 'var(--primary-light)' }} />
                <h3 style={{ fontSize: '1.02rem', margin: 0 }}>Pricing &amp; Content</h3>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
                    Shown on the customer /pricing page
                </span>
            </div>

            {/* Name + tagline */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                    <label style={fieldLabel}>Plan Name (customer-facing) *</label>
                    <input className="input-field" style={{ width: '100%' }} value={value.displayName}
                        placeholder="e.g. Starter"
                        onChange={e => set('displayName', e.target.value)} />
                </div>
                <div>
                    <label style={fieldLabel}>Tagline</label>
                    <input className="input-field" style={{ width: '100%' }} value={value.tagline ?? ''}
                        placeholder="e.g. Perfect for small retailers"
                        onChange={e => set('tagline', e.target.value)} />
                </div>
            </div>

            {/* Description */}
            <div style={{ marginBottom: '1rem' }}>
                <label style={fieldLabel}>Description</label>
                <textarea className="input-field" style={{ width: '100%', minHeight: '52px', resize: 'vertical' }}
                    value={value.description ?? ''}
                    placeholder="Optional longer description"
                    onChange={e => set('description', e.target.value)} />
            </div>

            {/* Prices */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                    <label style={fieldLabel}>Monthly Price (₹) *</label>
                    <input className="input-field" type="number" min={0} step={1} style={{ width: '100%' }}
                        value={Number.isFinite(value.monthlyPrice) ? value.monthlyPrice : 0}
                        onChange={e => set('monthlyPrice', Number(e.target.value))} />
                </div>
                <div>
                    <label style={fieldLabel}>Yearly Price (₹) *</label>
                    <input className="input-field" type="number" min={0} step={1} style={{ width: '100%' }}
                        value={Number.isFinite(value.yearlyPrice) ? value.yearlyPrice : 0}
                        onChange={e => set('yearlyPrice', Number(e.target.value))} />
                </div>
                <div>
                    <label style={fieldLabel}>Savings Label</label>
                    <input className="input-field" style={{ width: '100%' }} value={value.savingsLabel ?? ''}
                        placeholder={savingsPct > 0 ? `Auto: Save ${savingsPct}%` : 'e.g. Save 17%'}
                        onChange={e => set('savingsLabel', e.target.value)} />
                    {savingsPct > 0 && !value.savingsLabel && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '0.25rem' }}>
                            Auto-computed: Save {savingsPct}% vs monthly
                        </div>
                    )}
                </div>
            </div>

            {/* Badge */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '1rem', alignItems: 'end', marginBottom: '1.25rem' }}>
                <div>
                    <label style={fieldLabel}>Badge Text</label>
                    <input className="input-field" style={{ width: '100%' }} value={value.badge ?? ''}
                        placeholder="e.g. Most Popular"
                        onChange={e => set('badge', e.target.value)} />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer', paddingBottom: '0.6rem', whiteSpace: 'nowrap' }}>
                    <input type="checkbox" checked={!!value.badgeVisible}
                        onChange={e => set('badgeVisible', e.target.checked)}
                        style={{ width: '1.1rem', height: '1.1rem', accentColor: 'var(--primary-light)' }} />
                    Show badge
                </label>
            </div>

            {/* Features */}
            <StringListEditor
                title="Features *"
                items={value.features}
                placeholder="e.g. GST Invoice & POS Billing"
                onChange={items => set('features', items)}
            />

            {/* Limits */}
            <div style={{ marginTop: '1.25rem' }}>
                <StringListEditor
                    title="Plan Limits"
                    items={value.limits}
                    placeholder="e.g. 1 Warehouse"
                    onChange={items => set('limits', items)}
                />
            </div>

            {priceError && (
                <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Info size={14} /> {priceError}
                </div>
            )}
        </div>
    );
}

// ─── Live /pricing preview card ───────────────────────────────────────────────
// A faithful, read-only replica of the customer /pricing card — it renders the
// exact same shared <PricingPlanCard> component, driven by the editor's
// in-progress PlanPricing, so the Super Admin sees precisely what a customer will
// see before saving. Has its own monthly/yearly toggle; the CTA is inert (preview).
function PricingPreviewCard({ value, planId }: { value: PlanPricing; planId: string | null }) {
    const [cycle, setCycle] = useState<'monthly' | 'yearly'>('yearly');

    // Build through the SAME catalogue model /pricing uses. Blank feature/limit
    // rows (common mid-edit) are stripped so the preview mirrors the real card.
    const tier = PRICING_TIER_BY_CATALOG[planId ?? ''] ?? PRICING_TIERS[0];
    const plan: PricingPlan = {
        ...buildPricingPlan(tier, value),
        features: value.features.map(f => f.trim()).filter(Boolean),
        limits: value.limits.map(l => l.trim()).filter(Boolean),
    };
    const featured = plan.featured;

    return (
        <div>
            {/* Billing toggle — mirrors the /pricing page-level toggle. */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.85rem' }}>
                <div style={{ display: 'inline-flex', background: home.color.surface, border: `1px solid ${home.color.line}`, borderRadius: home.radius.pill, padding: '3px', gap: '3px', boxShadow: home.shadow.card }}>
                    {(['monthly', 'yearly'] as const).map(c => (
                        <button key={c} onClick={() => setCycle(c)} style={{
                            padding: '0.35rem 1rem', borderRadius: home.radius.pill, border: 'none', cursor: 'pointer',
                            fontWeight: c === cycle ? 700 : 500, fontSize: '0.78rem', font: 'inherit', fontFamily: home.font.body,
                            background: c === cycle ? home.color.forest : 'transparent',
                            color: c === cycle ? '#fff' : home.color.body,
                        }}>{c === 'monthly' ? 'Monthly' : 'Yearly'}</button>
                    ))}
                </div>
            </div>

            <PricingPlanCard plan={plan} cycle={cycle}>
                {/* Inert CTA styled exactly like /pricing's subscribe button. */}
                <div style={{
                    width: '100%', padding: '0.95rem', borderRadius: home.radius.sm,
                    fontWeight: 700, fontSize: '0.98rem', fontFamily: home.font.body,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                    border: featured ? 'none' : `1px solid ${home.color.forest}`,
                    background: featured ? home.color.gold : 'transparent',
                    color: featured ? home.color.forestInk : home.color.forest,
                    cursor: 'default', userSelect: 'none',
                }}>
                    Get {plan.name || 'Plan'} <ArrowRight size={16} />
                </div>
            </PricingPlanCard>
        </div>
    );
}

// ─── Support ticket detail / management modal ─────────────────────────────────
// Shows the full ticket (read-only user content + business/user info) and lets the
// Super Admin change status, priority and add an internal/admin response. Identity
// and user-supplied content fields are never editable here.
function SupportTicketModal({
    ticket, saving, onSave, onClose,
}: {
    ticket: SupportTicket;
    saving: boolean;
    onSave: (ticket: SupportTicket, changes: { status: TicketStatus; priority: TicketPriority; adminResponse: string }) => void;
    onClose: () => void;
}) {
    const [status, setStatus] = useState<TicketStatus>(ticket.status);
    const [priority, setPriority] = useState<TicketPriority>(ticket.priority);
    const [adminResponse, setAdminResponse] = useState(ticket.adminResponse ?? '');

    const dirty =
        status !== ticket.status ||
        priority !== ticket.priority ||
        adminResponse.trim() !== (ticket.adminResponse ?? '').trim();

    return (
        <div
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}
        >
            <div onClick={e => e.stopPropagation()} className="glass-panel" style={{ width: '100%', maxWidth: '620px', maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                    <div>
                        <h2 style={{ fontSize: '1.15rem', margin: '0 0 0.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <LifeBuoy size={18} /> {ticket.subject}
                        </h2>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                            {ticket.category} · Raised {formatDate(ticket.createdAt)}
                        </div>
                    </div>
                    <button onClick={onClose} aria-label="Close" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: '0.2rem' }}>
                        <X size={20} />
                    </button>
                </div>

                {/* Business & user info */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem 1rem', padding: '0.9rem 1rem', borderRadius: '10px', background: 'var(--surface)', marginBottom: '1.25rem' }}>
                    <div>
                        <div style={jobFieldLabel}>Business</div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>{ticket.businessName}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{ticket.tenantId}</div>
                    </div>
                    <div>
                        <div style={jobFieldLabel}>Raised by</div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>{ticket.userName}</div>
                        <a href={`mailto:${ticket.userEmail}`} style={{ fontSize: '0.78rem', color: 'var(--primary-light)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                            <Mail size={12} /> {ticket.userEmail}
                        </a>
                    </div>
                </div>

                {/* User-supplied query (read-only) */}
                <div style={{ marginBottom: '1.25rem' }}>
                    <div style={jobFieldLabel}>Description</div>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{ticket.description}</p>
                </div>

                {ticket.attachmentUrl && (
                    <div style={{ marginBottom: '1.25rem' }}>
                        <div style={jobFieldLabel}>Attachment</div>
                        <a href={ticket.attachmentUrl} target="_blank" rel="noopener noreferrer"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--primary-light)', textDecoration: 'none' }}>
                            <Paperclip size={14} /> {ticket.attachmentName || 'View attachment'}
                        </a>
                    </div>
                )}

                {/* Admin-managed fields */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                    <div>
                        <label style={jobFieldLabel}>Status</label>
                        <select className="input-field" style={{ width: '100%' }} value={status} onChange={e => setStatus(e.target.value as TicketStatus)}>
                            {TICKET_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={jobFieldLabel}>Priority</label>
                        <select className="input-field" style={{ width: '100%' }} value={priority} onChange={e => setPriority(e.target.value as TicketPriority)}>
                            {TICKET_PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </div>
                </div>

                <label style={jobFieldLabel}>Response to customer</label>
                <textarea className="input-field" style={{ width: '100%', minHeight: '110px', resize: 'vertical', marginBottom: '0.35rem' }}
                    value={adminResponse}
                    placeholder="Write a reply — this is shown to the business user on their Support Tickets page."
                    onChange={e => setAdminResponse(e.target.value)} />
                <div style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', marginBottom: '1.25rem' }}>
                    Visible to the customer who raised this ticket.
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
                    <button onClick={onClose} className="btn btn-secondary" style={{ fontSize: '0.85rem' }}>Cancel</button>
                    <button
                        onClick={() => onSave(ticket, { status, priority, adminResponse })}
                        disabled={saving || !dirty}
                        className="btn btn-primary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', opacity: (saving || !dirty) ? 0.55 : 1, cursor: (saving || !dirty) ? 'not-allowed' : 'pointer' }}
                    >
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save Changes
                    </button>
                </div>
            </div>
        </div>
    );
}

// A small add/edit/delete list editor for a string[] (features or limits).
function StringListEditor({
    title, items, placeholder, onChange,
}: {
    title: string; items: string[]; placeholder: string; onChange: (items: string[]) => void;
}) {
    const update = (i: number, v: string) => onChange(items.map((it, idx) => idx === i ? v : it));
    const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
    const add = () => onChange([...items, '']);

    return (
        <div>
            <label style={fieldLabel}>{title}</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {items.length === 0 && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>No items yet.</div>
                )}
                {items.map((item, i) => (
                    <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <input className="input-field" style={{ flex: 1 }} value={item}
                            placeholder={placeholder}
                            onChange={e => update(i, e.target.value)} />
                        <button type="button" onClick={() => remove(i)} aria-label="Remove"
                            className="btn btn-secondary"
                            style={{ padding: '0.45rem 0.6rem', display: 'inline-flex', alignItems: 'center', color: 'var(--danger)' }}>
                            <Trash2 size={15} />
                        </button>
                    </div>
                ))}
            </div>
            <button type="button" onClick={add} className="btn btn-secondary"
                style={{ marginTop: '0.6rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem' }}>
                <Plus size={15} /> Add
            </button>
        </div>
    );
}
