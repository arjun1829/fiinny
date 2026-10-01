import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, useLocation, Link } from 'react-router-dom';
import { useHashTab } from '../hooks/useHashTab';
import { useFeaturePermissions } from '../hooks/useFeaturePermissions';
import DigitalKhataPage from './DigitalKhataPage';
import CustomersPage from './CustomersPage';
import OrderHistoryPage from './OrderHistoryPage';
// 'Link' was only used by the Returns quick-access link, now disabled below (2026-07-03).
// import { Link } from 'react-router-dom';
import {
    Save, Loader2, Printer, ShoppingCart, Plus, Minus, Trash2,
    CreditCard, Banknote, ExternalLink, Target, Pencil,
    Zap, CheckCircle2, ChevronRight, X, Phone, User, QrCode, Package, BookOpen, AlertTriangle,
    // RotateCcw removed — was only used by the Returns quick-access link, now disabled below (2026-07-03).
    Star, PlusCircle, FileText,
} from 'lucide-react';
import UpiQrCode from '../components/UpiQrCode';
import ModuleGate from '../components/ModuleGate';
import {
    query, onSnapshot, addDoc, doc, writeBatch,
    serverTimestamp, updateDoc,
    runTransaction, getDoc, getDocs, limit, orderBy, where, collection, increment,
    type Firestore,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { getTenantCollection, getTenantDoc } from '../utils/tenantPath';
import { prepareStockDeduction, recordStockMovements, formatLowStockAlert } from '../utils/stockDeduction';
import { getInvoiceProductCategories, getAllConfiguredLicenses } from '../utils/invoiceCategories';
import { logAudit } from '../utils/auditLog';
import { PosInvoicePreview, numberToWords, toMonthYear } from '../components/PosInvoicePreview';
import { AGRI_CATEGORIES, INVOICE_CONTACT_LABEL } from '../utils/constants';
import { fetchInvoiceTemplate, fetchInvoiceBranding } from '../services/invoiceTemplateService';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';

interface Product {
    id: string;
    name: string;
    maxRetailPrice: number;
    retailerPrice: number;
    sellingPrice: number;
    purchasePrice?: number;
    boxCapacity: number;
    baseUnit: string;
    unit?: string;
    quantity: number;
    loosePieces: number;
    gstPct?: number;
    imageUrl?: string;
    category?: string;
    type?: string;
    barcode?: string;
    // Current-batch fields, written by the supplier-invoice → inventory posting.
    mfgCompany?: string;
    batchNumber?: string;
    expiryDate?: string;
}

interface CartItem extends Product {
    cartQuantity: number;
    cartTotal: number;
}

interface CustomerState {
    name: string;
    phone: string;
    address: string; // village / atPost
    pin: string;
    taluka?: string;
    district?: string;
    retailerId?: string; // Firestore doc ID in `retailers` — set when a known customer is resolved
}

interface BillTab {
    id: string;
    cart: CartItem[];
    customer: CustomerState;
    // Khata balance the tab's current customer carries in — kept per-tab (like
    // cart/customer) so switching or creating a tab can never leak one
    // customer's outstanding onto another, blank, tab.
    customerOutstanding: number;
}

interface PaymentSplit {
    method: string;
    amount: number;
}

const PAYMENT_METHODS = ['Cash', 'UPI', 'Card', 'Wallet', 'Khata'];
const DENOMINATIONS = [10, 20, 50, 100, 200, 500, 2000];

// Buyer starts blank so the cashier types (or picks) a real farmer. Bills saved
// without a name still fall back to "Walk-in Customer" at checkout.
const defaultCustomer = (): CustomerState => ({
    name: '',
    phone: '',
    address: '',
    pin: '',
});

// Loyalty is "active" only when the module is entitled AND the admin hasn't
// explicitly disabled it. Config predates the enabled flag for some tenants —
// absence of the field (undefined) must still mean "on", matching behavior
// before this switch was wired in.
function isLoyaltyActive(hasLoyaltyModule: boolean, loyaltyConfig: any): boolean {
    return hasLoyaltyModule && loyaltyConfig?.enabled !== false;
}

// Tier multiplier lookup — mirrors LoyaltyPage.tsx's getTier() ordering
// (highest minPoints first) so both pages agree on which tier a given point
// balance belongs to.
function getTierMultiplier(points: number, tiers: { name: string; minPoints: number; multiplier: number }[] | undefined): number {
    if (!Array.isArray(tiers) || tiers.length === 0) return 1;
    const sorted = [...tiers].sort((a, b) => (b.minPoints || 0) - (a.minPoints || 0));
    const match = sorted.find(t => points >= (t.minPoints || 0));
    const multiplier = match?.multiplier;
    return typeof multiplier === 'number' && multiplier > 0 ? multiplier : 1;
}

// Live outstanding lookup — mirrors Digital Khata's own calculation exactly
// (same salesOrders filter, same per-bill total/paid fallback chain, same
// "match by name first, else phone" identity) so "Previous Outstanding (Dr)"
// on the invoice can never diverge from the Khata worklist balance. Reads
// salesOrders directly rather than the cached retailers.outstandingAmount
// counter, which — unlike this — misses manual Khata entries and Khata-
// recorded payments (neither writes back to `retailers`).
async function fetchLiveOutstanding(
    db: Firestore, tenantId: string, name: string, phone: string,
): Promise<number> {
    const nameKey = name.trim().toLowerCase();
    const phoneDigits = phoneKey(phone);
    if (!nameKey && !phoneDigits) return 0;
    try {
        const snap = await getDocs(query(getTenantCollection(db, tenantId, 'salesOrders'), orderBy('createdAt', 'desc'), limit(500)));
        let total = 0;
        for (const d of snap.docs) {
            const e: any = d.data();
            if (e.invoiceType === 'B2B_GST' || e.deleted) continue;
            if (String(e.status || '').toLowerCase() === 'cancelled') continue;
            const eName = String(e.customerName || e.retailerName || '').trim().toLowerCase();
            const ePhone = phoneKey(e.customerPhone || e.phoneNumber);
            // Same identity priority as customerKeyOf in Digital Khata: match by
            // name when this customer has one, else fall back to phone.
            const isMatch = nameKey ? eName === nameKey : ePhone.slice(-10) === phoneDigits.slice(-10);
            if (!isMatch) continue;
            // Net the bill down by any B2C sales returns booked against it
            // (additive returnTotal linkage; absent/0 on non-returned bills, so
            // this is a no-op for them). Never overwrites the original grandTotal.
            const grandBase = Number(e.grandTotal ?? e.netAmount ?? e.totalAmount ?? e.amount ?? 0);
            const grand = Math.max(0, grandBase - Number(e.returnTotal || 0));
            const rawPaid = e.amountPaid ?? e.paidAmount;
            const paid = rawPaid !== undefined && rawPaid !== null
                ? Number(rawPaid) || 0
                : (String(e.paymentStatus || '').toLowerCase() === 'paid' ? grand : 0);
            total += Math.max(0, grand - paid);
        }
        return total;
    } catch (err) {
        console.error('Live outstanding lookup failed:', err);
        return 0;
    }
}

// Bill paper formats offered at the top of the billing screen. A5 was added on
// the accountant's request; both render the same GST-invoice layout and only
// differ in on-screen width and the print @page size.
type BillFormat = 'A4' | 'A5';

// POS bills farmers at the product's **Offer / Selling Price** (`sellingPrice`).
// The retailer/PTR rate (`retailerPrice`) belongs to the B2B invoice only and must
// never leak into a counter bill — falling back to it silently overcharged farmers
// whenever a product had no selling price configured. MRP is the only fallback.
const posSellingRate = (p: { sellingPrice?: number; maxRetailPrice?: number } | undefined): number =>
    Number(p?.sellingPrice) || Number(p?.maxRetailPrice) || 0;

// Phone numbers reach Firestore in inconsistent shapes (numeric type, +91 prefix,
// spaces, dashes) depending on whether the record came from an import, the B2B
// onboarding form or POS itself. An exact string match on `number` therefore
// missed most farmers, so compare digits-only.
const phoneKey = (v: unknown): string => String(v ?? '').replace(/\D/g, '');

// "03/26" or "03/2026" → "2026-03" for Firestore storage; passes through if already YYYY-MM
function fromMonthYear(val: string): string {
    const s = (val || '').trim();
    const short = /^(\d{2})\/(\d{2})$/.exec(s);
    if (short) return `20${short[2]}-${short[1]}`;
    const long = /^(\d{2})\/(\d{4})$/.exec(s);
    if (long) return `${long[2]}-${long[1]}`;
    return s;
}

// Renders the product-search suggestion list in a body-level portal, positioned
// with `fixed` coordinates read from the search input's own bounding rect.
//
// The invoice item table sits inside an `overflow-x: auto` wrapper (needed so the
// wide table can scroll horizontally on narrow screens). Per the CSS spec, once
// either overflow axis on an element is non-`visible`, the *other* axis is also
// computed as `auto` (never `visible`) — so that wrapper clips an absolutely
// positioned dropdown vertically too, once the dropdown from a lower row extends
// past the wrapper's bottom edge. A portal sidesteps this without touching the
// wrapper's overflow (which would reopen the "wide table can't scroll" problem
// the wrapper exists for).
//
// `getBoundingClientRect()` only reflects the input's position at the moment it
// runs — React doesn't re-render on scroll, so a one-time read left the portal
// stuck at its original screen coordinates while the invoice (or the page)
// scrolled underneath it, detaching it from the input. Re-measuring on every
// `scroll` (captured on window so it fires for scroll on ANY ancestor, not just
// window-level scroll) and `resize` event keeps it pinned to the live input
// position without a second/independent positioning system.
function ProductSearchDropdown({ anchorRef, children }: { anchorRef: React.RefObject<HTMLInputElement | null>; children: React.ReactNode }) {
    const [rect, setRect] = useState<DOMRect | null>(null);

    useEffect(() => {
        const measure = () => setRect(anchorRef.current?.getBoundingClientRect() ?? null);
        measure();
        window.addEventListener('scroll', measure, true);
        window.addEventListener('resize', measure);
        return () => {
            window.removeEventListener('scroll', measure, true);
            window.removeEventListener('resize', measure);
        };
    }, [anchorRef]);

    if (!rect) return null;
    return createPortal(
        <div className="pinv-dropdown" style={{ position: 'fixed', top: rect.bottom, left: rect.left, width: rect.width }}>
            {children}
        </div>,
        document.body,
    );
}

// Total visible product rows (filled + search row + blank padding) on a fresh
// bill. Editing an existing bill keeps the prior 6-row total unchanged — only
// a newly created bill grows to this count.
const FRESH_BILL_ROW_COUNT = 10;
const EDIT_BILL_ROW_COUNT = 6;

type PosModuleTab = 'billing' | 'khata' | 'customers' | 'order-history';
const POS_MODULE_TABS: { id: PosModuleTab; label: string }[] = [
    { id: 'billing',       label: 'POS Billing' },
    { id: 'khata',         label: 'Khata (Udhari)' },
    { id: 'customers',     label: 'Customers' },
    { id: 'order-history', label: 'Order History' },
];
const VALID_POS_TABS: readonly PosModuleTab[] = ['billing', 'khata', 'customers', 'order-history'];

// Feature-permission id per sub-tab (Super Admin → Feature Permissions).
const TAB_PERM: Record<PosModuleTab, string> = {
    billing:         'posBilling.billing.view',
    khata:           'posBilling.khata.view',
    customers:       'posBilling.customers.view',
    'order-history': 'posBilling.orderHistory.view',
};

export default function POSPage() {
    const can = useFeaturePermissions();
    const [posModuleTab, setPosModuleTab] = useHashTab<PosModuleTab>(VALID_POS_TABS, 'billing', 'fiinny-tab-pos', tab => can(TAB_PERM[tab]));

    // Only show sub-tabs the current role is permitted to view.
    const visiblePosTabs = POS_MODULE_TABS.filter(tab => can(TAB_PERM[tab.id]));

    // If the active tab is not permitted, fall back to the first visible one so
    // denied content is never shown on load.
    const activeAllowed = visiblePosTabs.some(t => t.id === posModuleTab);
    useEffect(() => {
        if (!activeAllowed && visiblePosTabs.length > 0) setPosModuleTab(visiblePosTabs[0].id);
    }, [activeAllowed, visiblePosTabs, setPosModuleTab]);
    const { t, i18n } = useTranslation();
    const [searchParams] = useSearchParams();
    const location = useLocation();
    const { tenantId, hasModule, currentUser, userName, userRole } = useAuth();
    const { showToast } = useToast();
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);

    // View States

    // ── Keyboard nav & draft refs ────────────────────────────────────────────
    const draftLoadedRef = useRef(false);
    const [highlightedProductIdx, setHighlightedProductIdx] = useState(-1);
    const qtyRefs = useRef<Record<string, HTMLInputElement | null>>({});
    const customerPhoneRef = useRef<HTMLInputElement>(null);
    const customerAddressRef = useRef<HTMLInputElement>(null);
    const customerTalukaRef = useRef<HTMLInputElement>(null);
    const customerDistrictRef = useRef<HTMLInputElement>(null);
    const customerPinRef = useRef<HTMLInputElement>(null);
    const rowSearchRef = useRef<HTMLInputElement>(null);

    // Quick add/edit product — manage inventory inline without leaving the POS
    const [showProductModal, setShowProductModal] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);

    const openAddProduct = () => { setEditingProduct(null); setShowProductModal(true); };
    const openEditProduct = (product: Product) => { setEditingProduct(product); setShowProductModal(true); };

    // ── Multi-bill tabs ─────────────────────────────────────────────────────
    // Tab labels ("Bill 1", "Bill 2", …) are never stored — they're derived
    // live from each tab's position in billTabs at render time (see
    // billTabLabel below). Storing a label as data let it go stale after a
    // deletion (closeTab never renumbered survivors), producing duplicate
    // labels like "Bill 2" + "Bill 2". Position-derived labels can't drift.
    const [billTabs, setBillTabs] = useState<BillTab[]>([{
        id: 'tab1', cart: [], customer: defaultCustomer(), customerOutstanding: 0,
    }]);
    const [activeTabId, setActiveTabId] = useState('tab1');

    const activeTab = billTabs.find(t => t.id === activeTabId) ?? billTabs[0];
    const cart = activeTab.cart;
    const customer = activeTab.customer;
    const customerOutstanding = activeTab.customerOutstanding;
    const billTabLabel = (tabId: string) => `Bill ${Math.max(1, billTabs.findIndex(t => t.id === tabId) + 1)}`;

    const updateActiveTab = useCallback((patch: Partial<Pick<BillTab, 'cart' | 'customer' | 'customerOutstanding'>>) => {
        setBillTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, ...patch } : t));
    }, [activeTabId]);

    const setCart = (updater: CartItem[] | ((prev: CartItem[]) => CartItem[])) => {
        setBillTabs(prev => prev.map(t => {
            if (t.id !== activeTabId) return t;
            const newCart = typeof updater === 'function' ? updater(t.cart) : updater;
            return { ...t, cart: newCart };
        }));
    };

    const setCustomer = (c: CustomerState) => updateActiveTab({ customer: c });
    const setCustomerOutstanding = (amount: number) => updateActiveTab({ customerOutstanding: amount });
    // For async lookups (fetchLiveOutstanding): writes into the tab that was
    // active when the lookup *started*, not whichever tab is active once the
    // promise resolves — so a fast tab-switch mid-lookup can't leak one
    // customer's balance onto a different tab the cashier has since opened.
    const setOutstandingForTab = (tabId: string, amount: number) =>
        setBillTabs(prev => prev.map(t => t.id === tabId ? { ...t, customerOutstanding: amount } : t));

    const addTab = () => {
        if (billTabs.length >= 5) return;
        const newId = `tab${Date.now()}`;
        setBillTabs(prev => [...prev, { id: newId, cart: [], customer: defaultCustomer(), customerOutstanding: 0 }]);
        setActiveTabId(newId);
    };

    const closeTab = (tabId: string) => {
        if (billTabs.length <= 1) return;
        setBillTabs(prev => {
            const next = prev.filter(t => t.id !== tabId);
            if (activeTabId === tabId) setActiveTabId(next[0].id);
            return next;
        });
    };

    // ── POS Settings & Branding ─────────────────────────────────────────────
    const [branding, setBranding] = useState<any>(null);
    const [nextBillNumber, setNextBillNumber] = useState<string>('');
    const [templateFields, setTemplateFields] = useState<any[]>([]);
    const [loyaltyConfig, setLoyaltyConfig] = useState<any>(null);

    // ── B2B-style GST invoice surface (farmer billing) ───────────────────────
    // The POS billing screen now renders as the same GST-invoice form as
    // B2BInvoicePage, but the buyer is a *farmer* (counter customer) instead of a
    // retailer. All checkout/inventory/loyalty logic below is reused unchanged.
    const [billFormat, setBillFormat] = useState<BillFormat>('A5');
    // Language the *printed bill* is rendered in — independent of the app UI
    // language, so the counter can hand a Marathi bill to a farmer while the
    // operator keeps the app in English. All three locales are bundled at init
    // (src/i18n.ts), so `{ lng }` resolves synchronously.
    const [billLang, setBillLang] = useState<string>((i18n.language || 'en').split('-')[0]);
    const L = (key: string): string => t(`pos_bill.${key}`, { lng: billLang }) as string;
    const today = new Date().toISOString().split('T')[0];
    const [invoiceDate, setInvoiceDate] = useState<string>(today);
    // null = auto-detect from cart products; string[] = user's manual selection
    const [invoiceCategories, setInvoiceCategories] = useState<string[] | null>(null);
    // Mode shown on the invoice; also decides which checkout path "Save & Print" takes.
    const [modeOfPayment, setModeOfPayment] = useState<string>('Cash');
    // Farmers (counter customers) — POS saves walk-ins into `retailers` tagged
    // channel:'pos', so we read from the same collection and prefer those records
    // for the name-autofill dropdown (mirrors B2B's retailer dropdown).
    const [farmers, setFarmers] = useState<any[]>([]);
    const [showFarmerDropdown, setShowFarmerDropdown] = useState(false);
    // Keyboard-highlighted row in the Buyer suggestion dropdown — separate from
    // highlightedProductIdx (product-search combobox) so the two never collide.
    const [highlightedFarmerIdx, setHighlightedFarmerIdx] = useState(-1);
    // Phone-based buyer lookup — mirrors the name dropdown so a farmer can be found
    // by their (primary) phone identifier. Its own show/highlight state so the two
    // Buyer dropdowns (name + phone) never collide.
    const [showPhoneDropdown, setShowPhoneDropdown] = useState(false);
    const [highlightedPhoneIdx, setHighlightedPhoneIdx] = useState(-1);
    // Which item row's product-search dropdown is open.
    const [activeRowIndex, setActiveRowIndex] = useState<number | null>(null);
    // Text typed into the "add product" search rows, keyed by visual row index.
    const [rowSearch, setRowSearch] = useState<Record<number, string>>({});
    // Optional per-line batch / expiry (display + print only; not persisted so the
    // checkout schema stays untouched). Keyed by cart item id.
    const [rowMeta, setRowMeta] = useState<Record<string, { batchNo?: string; expDate?: string }>>({});
    // customerOutstanding lives per-tab now (see billTabs/activeTab above) —
    // Khata (credit) balance carried by the matched farmer, populated by the
    // phone lookup / name dropdown, isolated per bill tab.
    // Set when the Khata screen sent us here to correct a bill. Saving then issues
    // a replacement bill and cancels this one (POS has no true in-place edit —
    // checkout always consumes a new number and re-decrements stock).
    const [editingOrder, setEditingOrder] = useState<any>(null);

    // ── Dialog states ────────────────────────────────────────────────────────
    const [showCashTenderDialog, setShowCashTenderDialog] = useState(false);
    const [cashTenderAmount, setCashTenderAmount] = useState<number>(0);

    const [showSplitDialog, setShowSplitDialog] = useState(false);
    const [splits, setSplits] = useState<PaymentSplit[]>([{ method: 'Cash', amount: 0 }]);

    const [showVPayDialog, setShowVPayDialog] = useState(false);
    const [transportCharges, setTransportCharges] = useState(0);
    const [laborCharges, setLaborCharges] = useState(0);
    // Manual bill-level discount (₹) — distinct from the auto loyalty discount.
    const [manualDiscount, setManualDiscount] = useState(0);
    const [creditPaidNow, setCreditPaidNow] = useState(0);
    const [khataNote, setKhataNote] = useState('');
    // Generic bill-level note, persisted with the invoice. Intentionally free-form
    // (the counter can record a physical bill-book / page number here) rather than
    // a dedicated field. Distinct from khataNote, which annotates the Khata ledger.
    const [billNote, setBillNote] = useState('');
    // "Other Options" disclosure — keeps Transport / Labor / Discount / Notes
    // collapsed so the main billing screen stays compact.
    const [showOtherOptions, setShowOtherOptions] = useState(false);

    // ── Loyalty display ──────────────────────────────────────────────────────
    const [customerLoyalty, setCustomerLoyalty] = useState<any>(null);
    const [redeemPoints, setRedeemPoints] = useState(0);

    const [reprintOrder, setReprintOrder] = useState<any>(null);

    useEffect(() => {
        if (!tenantId) return;

        const unsubProducts = onSnapshot(query(getTenantCollection(db, tenantId, 'products')), (snap) => {
            const productsList = snap.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    // Same reason as B2BInvoicePage: filteredProducts runs on every
                    // render, so a doc with no `name` would crash the POS screen.
                    name: String(data.name ?? ''),
                    quantity: data.quantity ?? (data as any).stock ?? 0,
                    baseUnit: data.baseUnit ?? data.unit ?? 'pcs',
                    loosePieces: data.loosePieces ?? 0,
                    type: data.type || '',
                } as Product;
            });
            setProducts(productsList);
        });

        // Farmers / counter customers for the buyer name-autofill dropdown.
        // Same collection POS already writes walk-ins to (channel:'pos').
        const unsubFarmers = onSnapshot(query(getTenantCollection(db, tenantId, 'retailers')), (snap) => {
            setFarmers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        const loadSettings = async () => {
            try {
                const [tmpl, brd] = await Promise.all([
                    fetchInvoiceTemplate(tenantId, 'retailer_customer'),
                    fetchInvoiceBranding(tenantId),
                ]);
                setTemplateFields(tmpl.fields.filter((f: any) => f.show).sort((a: any, b: any) => a.order - b.order));
                setBranding(brd);

                const counterSnap = await getDoc(getTenantDoc(db, tenantId, 'counters', 'posBillCounter'));
                const currentSeq = counterSnap.exists() ? counterSnap.data().lastBillNumber || 0 : 0;
                setNextBillNumber(`KA-${(currentSeq + 1).toString().padStart(4, '0')}`);

                // Load loyalty config if module is enabled
                if (hasModule('loyalty')) {
                    const loyaltySnap = await getDoc(getTenantDoc(db, tenantId, 'settings', 'loyaltyConfig'));
                    if (loyaltySnap.exists()) {
                        const raw = loyaltySnap.data() as any;
                        // Guard against a stray non-positive value already saved to Firestore —
                        // never let it produce Infinity/NaN points or a runaway discount at checkout.
                        setLoyaltyConfig({
                            ...raw,
                            pointsPerRupee: raw.pointsPerRupee > 0 ? raw.pointsPerRupee : 10,
                            pointsValue: raw.pointsValue > 0 ? raw.pointsValue : 0.1,
                            minRedeemPoints: raw.minRedeemPoints >= 0 ? raw.minRedeemPoints : 0,
                        });
                    }
                }
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        loadSettings();

        return () => {
            unsubProducts();
            unsubFarmers();
        };
    }, [tenantId, hasModule]);

    // ── Hand-off from the Khata screen ──────────────────────────────────────
    // ?name/phone/address/pin  → prefill the buyer for a new bill
    // ?reprintOrderId=<id>     → reprint an existing bill
    // ?orderId=<id>            → load a bill for correction
    // Runs once products have loaded so line items can resolve to real products.
    //
    // Keyed on the history entry, NOT a one-shot boolean. The Khata tab renders
    // inside this page, so its Print/Edit buttons only push a new query string —
    // POSPage never remounts. A boolean latched true after the first hand-off and
    // silently swallowed every print after it. location.key is fresh for every
    // navigation, including re-printing the same bill twice.
    const handledParamsRef = useRef<string | null>(null);
    useEffect(() => {
        if (!tenantId || handledParamsRef.current === location.key) return;

        const name = searchParams.get('name');
        const phone = searchParams.get('phone');
        const reprintId = searchParams.get('reprintOrderId');
        const editId = searchParams.get('orderId');

        // Buyer prefill needs nothing else loaded.
        if (!reprintId && !editId && (name || phone)) {
            handledParamsRef.current = location.key;
            setCustomer({
                name: name || '',
                phone: phone || '',
                address: searchParams.get('address') || '',
                pin: searchParams.get('pin') || '',
                taluka: searchParams.get('taluka') || '',
                district: searchParams.get('district') || '',
                retailerId: searchParams.get('retailerId') || undefined,
            });
            // New Bill from Khata prefills the buyer — show the form it filled.
            setPosModuleTab('billing');
            return;
        }

        if (!reprintId && !editId) return;
        // Editing needs the catalog so saved line items map back onto products.
        if (editId && products.length === 0) return;
        handledParamsRef.current = location.key;

        (async () => {
            try {
                const snap = await getDoc(getTenantDoc(db, tenantId, 'salesOrders', (reprintId || editId)!));
                if (!snap.exists()) { showToast('That bill could not be found.', 'error'); return; }
                const order = { id: snap.id, ...snap.data() } as any;

                if (reprintId) { openReprint(order); return; }

                // Edit: restore buyer + items into the active bill tab.
                const items: CartItem[] = (order.lineItems || []).map((li: any) => {
                    const prod = products.find(p => p.id === li.productId);
                    if (!prod) return null;
                    const rate = Number(li.mrp) || posSellingRate(prod);
                    const qty = Number(li.quantity) || 1;
                    return { ...prod, sellingPrice: rate, cartQuantity: qty, cartTotal: qty * rate };
                }).filter(Boolean) as CartItem[];

                if (items.length !== (order.lineItems || []).length) {
                    showToast('Some products on this bill are no longer in inventory and were skipped.', 'error');
                }

                updateActiveTab({
                    cart: items,
                    customer: {
                        name: order.retailerName || '',
                        phone: order.phoneNumber || '',
                        address: order.address || '',
                        pin: order.pin || '',
                    },
                });
                setModeOfPayment(order.paymentMethod === 'Khata' ? 'Credit' : 'Cash');
                // Restore the generic bill note (absent on older bills → blank).
                if (typeof order.notes === 'string') { setBillNote(order.notes); setShowOtherOptions(true); }
                setEditingOrder(order);
                // Edit mode displays and saves under the ORIGINAL invoice number —
                // no new number is generated/consumed until this edit is saved or
                // cancelled (see handleCheckout's editingOrder branch and cancelEdit).
                if (order.orderNumber) setNextBillNumber(order.orderNumber);
                // Khata and Order History are tabs of THIS page, so their Edit
                // buttons only change the query string — without this the bill
                // loads into the billing tab while the user keeps staring at the
                // tab they clicked from, and Edit looks like a dead button.
                setPosModuleTab('billing');
                showToast(`Editing ${order.orderNumber || 'bill'} — saving updates this bill.`, 'success');
            } catch (err) {
                console.error('Failed to load bill from Khata:', err);
                showToast('Could not open that bill.', 'error');
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tenantId, products, searchParams, location.key]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key === 'Enter') handleCheckout('Cash');
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [cart]);

    // Load customer loyalty when phone changes
    useEffect(() => {
        if (!tenantId || !isLoyaltyActive(hasModule('loyalty'), loyaltyConfig) || customer.phone.length < 5) {
            setCustomerLoyalty(null);
            setRedeemPoints(0);
            return;
        }
        getDoc(getTenantDoc(db, tenantId, 'loyalty', customer.phone))
            .then(snap => { if (snap.exists()) setCustomerLoyalty(snap.data()); else setCustomerLoyalty(null); })
            .catch(() => {});
    }, [customer.phone, tenantId, hasModule, loyaltyConfig]);

    // ── Draft persistence (localStorage) ────────────────────────────────────
    // Load saved draft when tenantId first becomes available.
    useEffect(() => {
        if (!tenantId || draftLoadedRef.current) return;
        draftLoadedRef.current = true;
        try {
            const raw = localStorage.getItem(`pos_draft_${tenantId}`);
            if (!raw) return;
            const draft = JSON.parse(raw);
            if (Array.isArray(draft.billTabs) && draft.billTabs.length > 0) {
                // Normalize for drafts saved by an older build (customerOutstanding
                // didn't exist on BillTab yet; label did but is no longer used).
                const restoredTabs: BillTab[] = draft.billTabs.map((t: any) => ({
                    id: t.id, cart: Array.isArray(t.cart) ? t.cart : [],
                    customer: t.customer ?? defaultCustomer(),
                    customerOutstanding: 0, // re-fetched live below, never trusted from a stale draft
                }));
                setBillTabs(restoredTabs);
                // The outstanding balance is a point-in-time snapshot, not
                // authoritative data — refresh it live per tab so a payment or
                // Khata entry recorded since this draft was saved isn't missed.
                if (tenantId) {
                    for (const t of restoredTabs) {
                        if (t.customer.name.trim() || t.customer.phone.trim().length >= 5) {
                            fetchLiveOutstanding(db, tenantId, t.customer.name, t.customer.phone).then(amt => setOutstandingForTab(t.id, amt));
                        }
                    }
                }
            }
            if (draft.activeTabId) setActiveTabId(draft.activeTabId);
            if (draft.modeOfPayment) setModeOfPayment(draft.modeOfPayment);
            // invoiceDate intentionally NOT restored — always defaults to today for new sessions
            if (draft.billFormat === 'A4' || draft.billFormat === 'A5') setBillFormat(draft.billFormat);
            if (draft.billLang) setBillLang(draft.billLang);
            if (typeof draft.transportCharges === 'number') setTransportCharges(draft.transportCharges);
            if (typeof draft.laborCharges === 'number') setLaborCharges(draft.laborCharges);
            if (typeof draft.manualDiscount === 'number') setManualDiscount(draft.manualDiscount);
            if (typeof draft.creditPaidNow === 'number') setCreditPaidNow(draft.creditPaidNow);
            if (typeof draft.khataNote === 'string') setKhataNote(draft.khataNote);
            if (typeof draft.billNote === 'string') setBillNote(draft.billNote);
            if (typeof draft.redeemPoints === 'number') setRedeemPoints(draft.redeemPoints);
            if (draft.rowMeta && typeof draft.rowMeta === 'object') setRowMeta(draft.rowMeta);
            if (Array.isArray(draft.invoiceCategories)) setInvoiceCategories(draft.invoiceCategories);
        } catch { /* ignore parse errors */ }
    }, [tenantId]);

    // Auto-save draft on every meaningful state change (500 ms debounce).
    useEffect(() => {
        if (!tenantId || !draftLoadedRef.current) return;
        const timer = setTimeout(() => {
            try {
                localStorage.setItem(`pos_draft_${tenantId}`, JSON.stringify({
                    billTabs, activeTabId, modeOfPayment, billFormat, billLang,
                    transportCharges, laborCharges, manualDiscount, creditPaidNow, khataNote, billNote, redeemPoints, rowMeta,
                    invoiceCategories,
                }));
            } catch { /* storage quota exceeded — ignore */ }
        }, 500);
        return () => clearTimeout(timer);
    }, [tenantId, billTabs, activeTabId, modeOfPayment, billFormat, billLang,
        transportCharges, laborCharges, manualDiscount, creditPaidNow, khataNote, billNote, redeemPoints, rowMeta,
        invoiceCategories]);

    // Reset dropdown highlight when the active search row changes.
    useEffect(() => { setHighlightedProductIdx(-1); }, [activeRowIndex]);

    // ── Cart operations ─────────────────────────────────────────────────────
    const addToCart = (product: Product) => {
        setCart(prev => {
            const existing = prev.find(item => item.id === product.id);
            if (existing) {
                return prev.map(item => item.id === product.id
                    ? { ...item, cartQuantity: item.cartQuantity + 1, cartTotal: (item.cartQuantity + 1) * posSellingRate(item) }
                    : item,
                );
            }
            const rate = posSellingRate(product);
            // Pin the resolved rate onto the line so the Rate column, the line
            // total and the saved order can never disagree.
            return [...prev, { ...product, sellingPrice: rate, cartQuantity: 1, cartTotal: rate }];
        });
    };

    const updateQty = (id: string, delta: number) => {
        setCart(prev => prev.map(item => {
            if (item.id === id) {
                const newQty = Math.max(0, item.cartQuantity + delta);
                const rate = posSellingRate(item);
                return { ...item, cartQuantity: newQty, cartTotal: newQty * rate };
            }
            return item;
        }).filter(item => item.cartQuantity > 0));
    };

    // ── Invoice-row helpers (used by the B2B-style items table) ──────────────
    // Set an exact quantity (the table uses a numeric input, not +/- steppers).
    const setQty = (id: string, qty: number) => {
        setCart(prev => prev.map(item => {
            if (item.id !== id) return item;
            const rate = posSellingRate(item);
            return { ...item, cartQuantity: Math.max(0, qty), cartTotal: Math.max(0, qty) * rate };
        }));
    };
    // Override the per-line rate (mirrors the sidebar's editable price).
    const setRate = (id: string, rate: number) => {
        setCart(prev => prev.map(item => item.id === id
            ? { ...item, sellingPrice: rate, cartTotal: item.cartQuantity * rate }
            : item));
    };
    const removeCartItem = (id: string) => setCart(prev => prev.filter(item => item.id !== id));

    const cartSubtotal = cart.reduce((sum, item) => sum + item.cartTotal, 0);
    const cartTotalQty = cart.reduce((sum, item) => sum + (item.cartQuantity || 0), 0);

    // Live Stock for a line = on-hand minus the qty currently selected. The single
    // source behind the LIVE STOCK panel, so what's displayed can't diverge from
    // actual on-hand. Reads the live `products` snapshot, not the cart item's own
    // snapshot. Does NOT affect how stock is deducted at checkout (prepareStockDeduction
    // owns that).
    const remainingStockFor = (item: CartItem): number => {
        const liveProduct = products.find(p => p.id === item.id);
        const available = liveProduct
            ? (liveProduct.loosePieces || 0) + (liveProduct.quantity || 0) * (liveProduct.boxCapacity || 1)
            : (item.loosePieces || 0) + (item.quantity || 0) * (item.boxCapacity || 1);
        return available - (item.cartQuantity || 0);
    };
    const loyaltyIsActive = isLoyaltyActive(hasModule('loyalty'), loyaltyConfig);
    // If loyalty was switched off after points were already staged for redemption,
    // the discount must not apply — no partial/stale redemption should reach checkout.
    const effectiveRedeemPoints = loyaltyIsActive ? redeemPoints : 0;
    const loyaltyDiscount = effectiveRedeemPoints * ((loyaltyConfig?.pointsValue) || 0.1);
    const grandTotal = Math.max(0, cartSubtotal + transportCharges + laborCharges - loyaltyDiscount - manualDiscount);

    // Partial credit: how much of this credit bill the customer pays now vs. owes.
    const isCreditBill = modeOfPayment === 'Credit' || modeOfPayment === 'Khata';
    const effectiveCreditPaidNow = isCreditBill ? Math.min(creditPaidNow, grandTotal) : grandTotal;
    const effectiveCreditAmount = isCreditBill ? Math.max(0, grandTotal - effectiveCreditPaidNow) : 0;

    // ── GST summary for the invoice (display + print) ────────────────────────
    // cartTotal is GST-inclusive (same convention as the analytics tax calc and
    // B2BInvoicePage), so back out the taxable value and split CGST/SGST evenly.
    const invLineGst = (i: CartItem) => (typeof i.gstPct === 'number' ? i.gstPct : 5);
    const computedTaxable = cart.reduce((s, i) => s + i.cartTotal / (1 + invLineGst(i) / 100), 0);
    const totalCgst = cart.reduce((s, i) => {
        const g = invLineGst(i);
        return s + (i.cartTotal / (1 + g / 100)) * (g / 2) / 100;
    }, 0);
    const totalSgst = totalCgst;
    const totalTax = totalCgst + totalSgst;
    // NET AMOUNT = Bill Total + Transport + Labor − Discount (loyalty + manual).
    // This is exactly grandTotal — the same figure used for payment and saving.
    // Discount is applied here, BEFORE Net Amount; it is not subtracted again
    // when Previous Outstanding is added to reach Total Payable. No rounding —
    // the POS bill has no Round Off adjustment.
    const invNetAmount = grandTotal;
    const invFmt = (n: number) => (Number.isFinite(n) ? n : 0).toFixed(2);

    // Tracks which phone number (if any) the currently-displayed name/address/pin
    // were auto-populated from, so a lookup miss only clears fields *we* set —
    // never text the cashier typed in manually for a genuine new walk-in.
    const lastMatchedPhoneRef = useRef<string | null>(null);
    const autoFilledBatchesRef = useRef<Set<string>>(new Set());

    const handlePhoneLookup = async () => {
        if (!tenantId) return;
        const key = phoneKey(customer.phone);
        // Only attempt once enough digits are in to identify someone.
        if (key.length < 6) return;
        // Match against the farmers already streamed in for the name dropdown —
        // instant, and tolerant of how the number was stored.
        const matches = farmers.filter(f => {
            const stored = phoneKey(f.number ?? f.phone);
            if (!stored) return false;
            return stored === key || stored.slice(-10) === key.slice(-10);
        });
        // Phone is the primary identifier, but a number can be shared by more than
        // one record — never arbitrarily auto-fill one. Only a single unambiguous
        // match auto-populates; multiple matches are left for the phone dropdown so
        // the cashier picks the right customer.
        const match = matches.length === 1 ? matches[0] : null;
        if (match) {
            lastMatchedPhoneRef.current = customer.phone;
            setCustomer({
                ...customer,
                name: match.name ?? customer.name,
                address: match.atPost ?? customer.address ?? '',
                pin: match.pin ?? customer.pin ?? '',
                taluka: match.taluka ?? customer.taluka ?? '',
                district: match.district ?? customer.district ?? '',
                retailerId: match.id,
            });
            // Live-computed so this can never diverge from the Digital Khata balance
            // (manual Khata entries / Khata-recorded payments never touch the
            // cached retailers.outstandingAmount counter, so that field alone
            // would understate or misstate what the customer actually owes).
            // Written by tab id, not the (possibly since-switched) active tab.
            const lookupTabId = activeTabId;
            fetchLiveOutstanding(db, tenantId, match.name ?? customer.name, customer.phone).then(amt => setOutstandingForTab(lookupTabId, amt));
        } else if (lastMatchedPhoneRef.current !== null && lastMatchedPhoneRef.current !== customer.phone) {
            // The number that produced this auto-fill no longer matches (edited/changed) —
            // revert to a clean walk-in state instead of leaving the stale match displayed.
            lastMatchedPhoneRef.current = null;
            setCustomer({ ...customer, name: '', address: '', pin: '', taluka: '', district: '', retailerId: undefined });
            setCustomerOutstanding(0);
        }
    };

    // Applies a farmer/customer suggestion to the active bill — shared by the
    // Buyer dropdown's mouse click (onMouseDown) and keyboard selection (Enter),
    // for both the A5 and A4 templates, so the four call sites can't drift.
    const selectFarmer = (r: any) => {
        lastMatchedPhoneRef.current = r.number || null;
        setCustomer({ name: r.name || '', phone: r.number || '', address: r.atPost || '', pin: r.pin || '', taluka: r.taluka || '', district: r.district || '', retailerId: r.id });
        // Live-computed so this can never diverge from the Digital Khata balance —
        // written by tab id so a fast tab-switch mid-lookup can't leak in.
        const lookupTabId = activeTabId;
        if (tenantId) fetchLiveOutstanding(db, tenantId, r.name || '', r.number || '').then(amt => setOutstandingForTab(lookupTabId, amt));
        setShowFarmerDropdown(false);
        setHighlightedFarmerIdx(-1);
        setShowPhoneDropdown(false);
        setHighlightedPhoneIdx(-1);
    };

    // Farmers whose stored phone matches the digits typed so far — powers the
    // Buyer phone-lookup dropdown. Partial match on the last-10 digits so the
    // list narrows as the cashier types; reuses the same `farmers` stream and
    // `phoneKey` normalization as the name dropdown and handlePhoneLookup.
    const phoneMatchesFor = (typed: string): any[] => {
        const key = phoneKey(typed);
        if (key.length < 3) return [];
        return farmers
            .filter(f => {
                const stored = phoneKey(f.number ?? f.phone);
                return stored.length > 0 && (stored.includes(key) || stored.slice(-10).includes(key));
            })
            .sort((a, b) => (a.channel === 'pos' ? -1 : 1) - (b.channel === 'pos' ? -1 : 1))
            .slice(0, 10);
    };

    // Real-time auto-lookup: mirrors handlePhoneLookup's onBlur trigger but fires
    // while typing, debounced so a half-typed number doesn't thrash. `farmers` is a
    // dependency so the lookup retries once the farmer list finishes streaming in —
    // otherwise a number typed before that arrived would never resolve.
    useEffect(() => {
        if (!tenantId || phoneKey(customer.phone).length < 6) return;
        const timer = setTimeout(() => { handlePhoneLookup(); }, 300);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [customer.phone, tenantId, farmers]);

    // Auto-fill batch number + expiry date from the FEFO inventory batch when a
    // product is added to the cart. Uses the same FEFO sort as prepareStockDeduction
    // so the pre-filled values match what will actually be deducted.
    useEffect(() => {
        if (!tenantId || cart.length === 0) return;
        for (const item of cart) {
            if (autoFilledBatchesRef.current.has(item.id)) continue;
            autoFilledBatchesRef.current.add(item.id);
            getDocs(
                query(getTenantCollection(db, tenantId, 'inventoryBatches'),
                    where('productId', '==', item.id)),
            ).then(snap => {
                const batches = snap.docs
                    .map(d => ({ id: d.id, ...(d.data() as any) }))
                    .filter((b: any) => (b.quantity ?? 0) > 0)
                    .sort((a: any, b: any) => {
                        if (!a.expiryDate && !b.expiryDate) return 0;
                        if (!a.expiryDate) return 1;
                        if (!b.expiryDate) return -1;
                        return (a.expiryDate as string).localeCompare(b.expiryDate as string);
                    });
                const top = batches[0];
                if (!top) return;
                setRowMeta(prev => {
                    const existing = prev[item.id];
                    if (existing?.batchNo !== undefined || existing?.expDate !== undefined) return prev;
                    return {
                        ...prev,
                        [item.id]: {
                            batchNo: top.batchNumber ?? '',
                            expDate: top.expiryDate ?? '',
                        },
                    };
                });
            }).catch(console.error);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cart, tenantId]);

    const generateBillNumber = async (): Promise<string> => {
        if (!tenantId) return `POS-${Date.now().toString().slice(-6)}`;
        const counterRef = getTenantDoc(db, tenantId, 'counters', 'posBillCounter');
        let newSeq = 1;
        await runTransaction(db, async (transaction) => {
            const docSnap = await transaction.get(counterRef);
            newSeq = docSnap.exists() ? (docSnap.data().lastBillNumber || 0) + 1 : 1;
            transaction.set(counterRef, { lastBillNumber: newSeq }, { merge: true });
        });
        return `KA-${newSeq.toString().padStart(4, '0')}`;
    };

    const handleCheckout = async (
        paymentMethod: string,
        options?: {
            cashReceived?: number;
            splits?: PaymentSplit[];
            loyaltyPointsRedeemed?: number;
        },
    ) => {
        if (!tenantId || cart.length === 0) return;
        setIsProcessing(true);

        try {
            // Editing an existing bill reuses its original invoice number and
            // never touches the counter — only a genuinely new bill consumes one.
            const billNumber = editingOrder ? (editingOrder.orderNumber || editingOrder.id) : await generateBillNumber();
            const orderData: any = {
                orderNumber: billNumber,
                retailerName: customer.name || 'Walk-in Customer',
                phoneNumber: customer.phone,
                address: customer.address,
                pin: customer.pin,
                taluka: customer.taluka || '',
                district: customer.district || '',
                ...(customer.retailerId ? { retailerId: customer.retailerId } : {}),
                lineItems: cart.map(item => ({
                    productId: item.id || '',
                    productName: item.name || 'Unknown Product',
                    mfgCompany: item.mfgCompany || '',
                    batchNo: rowMeta[item.id]?.batchNo ?? item.batchNumber ?? '',
                    expDate: rowMeta[item.id]?.expDate ?? item.expiryDate ?? '',
                    quantity: Number(item.cartQuantity) || 0,
                    unit: item.unit || item.baseUnit || 'pcs',
                    mrp: posSellingRate(item),
                    amount: Number(item.cartTotal) || 0,
                    gstPct: Number(item.gstPct) || 0,
                })),
                subtotal: cartSubtotal,
                transportCharges,
                laborCharges,
                manualDiscount,
                // Total discount shown on the (re)printed bill = loyalty + manual.
                discount: loyaltyDiscount + manualDiscount,
                grandTotal,
                paymentStatus: paymentMethod === 'Khata' && effectiveCreditAmount > 0
                    ? (effectiveCreditPaidNow > 0 ? 'Partial' : 'Pending')
                    : 'Paid',
                paymentMethod,
                paymentSplits: options?.splits ?? [],
                cashReceived: options?.cashReceived ?? null,
                changeGiven: options?.cashReceived ? Math.max(0, options.cashReceived - grandTotal) : 0,
                loyaltyPointsRedeemed: options?.loyaltyPointsRedeemed ?? effectiveRedeemPoints,
                amountPaid: paymentMethod === 'Khata' ? effectiveCreditPaidNow : grandTotal,
                creditAmount: paymentMethod === 'Khata' ? effectiveCreditAmount : 0,
                note: (paymentMethod === 'Khata' && khataNote.trim()) ? khataNote.trim() : null,
                // Generic bill-level note (optional). Stored only when non-empty so
                // existing bills without it are unaffected; older bills simply lack
                // the field and continue to load fine.
                notes: billNote.trim() || null,
                // Balance the customer carried into this bill, and the running total
                // including it — mirrors the B2B invoice's previousBalance/netBalance.
                previousBalance: customerOutstanding,
                netBalance: grandTotal + customerOutstanding,
                status: 'delivered',
                // Preserve the original creation time when editing; only a truly
                // new bill gets a fresh createdAt. updatedAt marks the edit itself.
                ...(editingOrder ? { updatedAt: serverTimestamp() } : { createdAt: serverTimestamp() }),
                invoiceDate: new Date().toISOString().split('T')[0],
            };

            // ── Stock validation + FIFO batch deduction ────────────────────
            // For new bills: validate stock and prepare FIFO batch deductions.
            // For bill corrections (editingOrder): keep the existing net-delta
            // logic so the return path remains simple.
            const saleLines = cart.map(item => ({
                productId: item.id,
                productName: item.name,
                qty: item.cartQuantity,
                batchNo: rowMeta?.[item.id]?.batchNo ?? item.batchNumber ?? '',
            }));

            const deductionResult = !editingOrder
                ? await prepareStockDeduction(tenantId, saleLines, true)
                : { valid: true, errors: [], warnings: [], stockWarnings: [], batchUpdates: [], productUpdates: [], movements: [] };

            if (!deductionResult.valid) {
                // Fatal errors (e.g. product not found) — block the sale
                showToast(deductionResult.errors.join('\n'), 'error');
                setIsProcessing(false);
                return;
            }

            // Persist the bill and deduct stock atomically in one batch — a
            // half-saved sale can never leave inventory inconsistent.
            // Editing updates the ORIGINAL salesOrders document in place (same
            // doc id, same orderNumber) — no replacement document is created.
            const batch = writeBatch(db);
            const soRef = editingOrder
                ? getTenantDoc(db, tenantId, 'salesOrders', editingOrder.id)
                : doc(getTenantCollection(db, tenantId, 'salesOrders'));
            if (editingOrder) batch.update(soRef, orderData);
            else batch.set(soRef, orderData);

            if (!editingOrder) {
                // Apply FIFO batch deductions
                for (const upd of deductionResult.batchUpdates) {
                    batch.update(getTenantDoc(db, tenantId, 'inventoryBatches', upd.batchDocId), {
                        quantity: upd.newQty,
                        updatedAt: serverTimestamp(),
                    });
                }
                // Update product.loosePieces (new model) or box/loose (fallback)
                for (const upd of deductionResult.productUpdates) {
                    const fields: Record<string, unknown> = { loosePieces: upd.newLoosePieces, updatedAt: serverTimestamp() };
                    if (upd.newQuantity !== undefined) fields.quantity = upd.newQuantity;
                    batch.update(getTenantDoc(db, tenantId, 'products', upd.productId), fields);
                }
            } else {
                // Bill correction — net stock delta (original approach)
                const returned = new Map<string, number>();
                for (const li of (editingOrder.lineItems || [])) {
                    if (!li.productId) continue;
                    returned.set(li.productId, (returned.get(li.productId) || 0) + (Number(li.quantity) || 0));
                }
                for (const item of cart) {
                    const giveBack = returned.get(item.id) || 0;
                    returned.delete(item.id);
                    const cap = item.boxCapacity || 1;
                    let newLoose = (item.loosePieces || 0) - item.cartQuantity + giveBack;
                    let newBoxes = item.quantity || 0;
                    while (newLoose < 0 && newBoxes > 0) { newBoxes--; newLoose += cap; }
                    if (cap > 1 && newLoose >= cap) { newBoxes += Math.floor(newLoose / cap); newLoose = newLoose % cap; }
                    batch.update(getTenantDoc(db, tenantId, 'products', item.id), {
                        quantity: Math.max(0, newBoxes), loosePieces: Math.max(0, newLoose), updatedAt: serverTimestamp(),
                    });
                }
                for (const [pid, qty] of returned.entries()) {
                    const prod = products.find(p => p.id === pid);
                    if (!prod || qty <= 0) continue;
                    const cap = prod.boxCapacity || 1;
                    let loose = (prod.loosePieces || 0) + qty;
                    let boxes = prod.quantity || 0;
                    if (cap > 1 && loose >= cap) { boxes += Math.floor(loose / cap); loose = loose % cap; }
                    batch.update(getTenantDoc(db, tenantId, 'products', pid), {
                        quantity: Math.max(0, boxes), loosePieces: Math.max(0, loose), updatedAt: serverTimestamp(),
                    });
                }
            }

            await batch.commit();

            // Bill is saved. If any product went below zero, confirm clearly that
            // the sale went through while inventory is now negative (informational).
            if (deductionResult.stockWarnings.length > 0) {
                alert(formatLowStockAlert(deductionResult.stockWarnings));
            }

            // Record stock movements (best-effort — never blocks the sale)
            if (!editingOrder && deductionResult.movements.length > 0) {
                recordStockMovements(tenantId, deductionResult.movements, {
                    type: 'sale_pos',
                    sourceType: 'POS Billing',
                    sourceId: soRef.id,
                    sourceNumber: billNumber,
                    date: new Date().toISOString().slice(0, 10),
                }).catch(console.error);
            }

            // Remember the walk-in customer for future lookup. Tagged channel:'pos'
            // so B2C counter customers don't pollute the B2B Partner Worklist.
            // A Khata (credit) sale also accrues to their outstanding balance, so the
            // next bill for this phone can show what they already owe.
            //
            // Identity resolution priority (name is the primary key, phone optional):
            //   1. customer.retailerId — already resolved by dropdown selection or the
            //      phone auto-lookup; trust it directly rather than re-searching.
            //   2. Phone match — unchanged behavior for known phone-bearing customers.
            //   3. Normalized-name match (trim + lowercase) against the farmer list
            //      already streamed in for the dropdown — catches a customer created
            //      name-only earlier who's now being billed with a phone added, so
            //      that phone lands on their existing record instead of forking a
            //      second one with a split outstanding balance.
            // A new record is only created when none of the above resolve.
            const customerName = customer.name.trim();
            const customerPhone = customer.phone.trim();
            if (customerPhone.length >= 5 || customerName) {
                let existingDoc: { ref: any; data: any } | null = null;

                if (customer.retailerId) {
                    const snap = await getDoc(getTenantDoc(db, tenantId, 'retailers', customer.retailerId));
                    if (snap.exists()) existingDoc = { ref: snap.ref, data: snap.data() };
                }
                if (!existingDoc && customerPhone.length >= 5) {
                    const q = query(getTenantCollection(db, tenantId, 'retailers'), where('number', '==', customer.phone), limit(1));
                    const snap = await getDocs(q);
                    if (!snap.empty) existingDoc = { ref: snap.docs[0].ref, data: snap.docs[0].data() };
                }
                if (!existingDoc && customerName) {
                    const nameKey = customerName.toLowerCase();
                    const match = farmers.find(f => (f.name || '').trim().toLowerCase() === nameKey);
                    if (match) existingDoc = { ref: getTenantDoc(db, tenantId, 'retailers', match.id), data: match };
                }

                const isCredit = paymentMethod === 'Khata';
                if (!existingDoc) {
                    await addDoc(getTenantCollection(db, tenantId, 'retailers'), {
                        name: customer.name, number: customer.phone, atPost: customer.address,
                        pin: customer.pin, taluka: customer.taluka || '', district: customer.district || '',
                        status: 'active', channel: 'pos',
                        totalSales: grandTotal,
                        outstandingAmount: isCredit ? effectiveCreditAmount : 0,
                        totalPaid: isCredit ? effectiveCreditPaidNow : grandTotal,
                        createdAt: serverTimestamp(),
                        lastOrderedAt: serverTimestamp(),
                    });
                } else {
                    const rData = existingDoc.data;
                    // When correcting a bill, back out the original's contribution
                    // first so the balance reflects the delta, not a double count.
                    const prevTotal = editingOrder ? Number(editingOrder.grandTotal || 0) : 0;
                    const prevWasCredit = editingOrder ? editingOrder.paymentMethod === 'Khata' : false;
                    const prevCreditAmt = editingOrder ? Number(editingOrder.creditAmount || (prevWasCredit ? prevTotal : 0)) : 0;
                    const prevPaidAmt = editingOrder ? Number(editingOrder.amountPaid ?? (prevWasCredit ? 0 : prevTotal)) : 0;
                    await updateDoc(existingDoc.ref, {
                        // Sync any edits the cashier made to the customer's master record.
                        // A phone typed on this bill fills in a previously phone-less
                        // record (or corrects an existing one) rather than being dropped.
                        ...(customer.name ? { name: customer.name } : {}),
                        ...(customerPhone.length >= 5 ? { number: customer.phone } : {}),
                        ...(customer.address ? { atPost: customer.address } : {}),
                        ...(customer.pin ? { pin: customer.pin } : {}),
                        ...(customer.taluka !== undefined ? { taluka: customer.taluka } : {}),
                        ...(customer.district !== undefined ? { district: customer.district } : {}),
                        totalSales: Math.max(0, Number(rData.totalSales || 0) - prevTotal + grandTotal),
                        outstandingAmount: Math.max(0, Number(rData.outstandingAmount || 0)
                            - (prevWasCredit ? prevCreditAmt : 0) + (isCredit ? effectiveCreditAmount : 0)),
                        totalPaid: Math.max(0, Number(rData.totalPaid || 0)
                            - prevPaidAmt + (isCredit ? effectiveCreditPaidNow : grandTotal)),
                        lastOrderedAt: serverTimestamp(),
                    });
                }
            }

            // Loyalty points accumulation — disabled module/config, a missing
            // document, or any error here must never block a sale that has
            // already been committed above; the whole block is best-effort.
            if (isLoyaltyActive(hasModule('loyalty'), loyaltyConfig) && customer.phone.length >= 5 && loyaltyConfig) {
                try {
                    const loyaltyRef = getTenantDoc(db, tenantId, 'loyalty', customer.phone);
                    const pointsPerRupee = loyaltyConfig.pointsPerRupee || 10;
                    const baseBillPoints = Math.max(0, Math.floor(grandTotal / pointsPerRupee));
                    const minRedeem = Math.max(0, loyaltyConfig.minRedeemPoints || 0);
                    // Never redeem more than the balance can cover, and never redeem
                    // below the configured minimum — a stale client-side value or a
                    // config change mid-session should not bypass either rule.
                    const requestedRedeem = Math.max(0, options?.loyaltyPointsRedeemed ?? effectiveRedeemPoints);

                    await runTransaction(db, async (tx) => {
                        const snap = await tx.get(loyaltyRef);
                        const cur: any = snap.exists() ? snap.data() : {};
                        const priorPoints = Math.max(0, cur.points || 0);

                        const redeemed = (requestedRedeem > 0 && requestedRedeem < minRedeem)
                            ? 0
                            : Math.min(requestedRedeem, priorPoints);

                        // Tier is determined from the balance the customer carried
                        // INTO this sale (their standing tier), then its multiplier
                        // scales the points this sale earns — matching LoyaltyPage's
                        // own tier lookup so both pages agree on tier boundaries.
                        const multiplier = getTierMultiplier(priorPoints, loyaltyConfig.tiers);
                        const pointsEarned = Math.max(0, Math.floor(baseBillPoints * multiplier));

                        // Canonical fields going forward, kept alongside the original
                        // customerName/totalSpend fields so any older reader of this
                        // document (if one exists outside this codebase) keeps working.
                        tx.set(loyaltyRef, {
                            phone: customer.phone,
                            customerName: customer.name,
                            name: customer.name || cur.name || null,
                            points: Math.max(0, priorPoints + pointsEarned - redeemed),
                            totalSpend: Math.max(0, (cur.totalSpend || 0) + grandTotal),
                            totalPointsEarned: Math.max(0, (cur.totalPointsEarned || 0) + pointsEarned),
                            totalPointsRedeemed: Math.max(0, (cur.totalPointsRedeemed || 0) + redeemed),
                            lastActivity: serverTimestamp(),
                            lastTransactionAt: serverTimestamp(),
                            updatedAt: serverTimestamp(),
                        }, { merge: true });
                    });
                } catch (loyaltyErr) {
                    // The sale itself already succeeded (batch.commit() above) —
                    // a loyalty failure must not surface as a checkout failure.
                    console.error('Loyalty update failed (sale already completed):', loyaltyErr);
                }
            }

            showToast(`Sale saved · ${billNumber} · ₹${Math.round(grandTotal).toLocaleString('en-IN')}`, 'success');
            if (tenantId && currentUser) {
                logAudit({
                    db, tenantId,
                    userId: currentUser.uid,
                    userName: userName || currentUser.email || 'Unknown',
                    userRole: userRole || 'unknown',
                    module: 'POS Billing',
                    action: editingOrder ? 'Update' : 'Generate Invoice',
                    entityName: customer.name || 'Walk-in Customer',
                    entityId: billNumber,
                    description: editingOrder
                        ? `POS bill ${billNumber} updated`
                        : `POS bill created · ${billNumber}${modeOfPayment === 'Khata' ? ' · Khata/Credit' : ''}`,
                    remarks: `₹${Math.round(grandTotal).toLocaleString('en-IN')} · ${modeOfPayment}`,
                });
            }

            // Reset after save
            setTimeout(() => {
                // Clear the draft immediately so a navigation-then-return doesn't restore it.
                try { localStorage.removeItem(`pos_draft_${tenantId}`); } catch {}
                // Reset the active tab
                setBillTabs(prev => prev.map(t =>
                    t.id === activeTabId
                        // Clear the carried balance with the bill — re-entering the
                        // phone re-fetches the (now updated) outstanding for the next sale.
                        ? { ...t, cart: [], customer: defaultCustomer(), customerOutstanding: 0 }
                        : t,
                ));
                setRedeemPoints(0);
                setInvoiceCategories(null);
                setRowMeta({});
                autoFilledBatchesRef.current.clear();
                setTransportCharges(0);
                setLaborCharges(0);
                setManualDiscount(0);
                setCreditPaidNow(0);
                setKhataNote('');
                setBillNote('');
                setShowOtherOptions(false);
                const wasEditing = !!editingOrder;
                // Edit complete — drop edit mode so the next bill is a fresh one.
                setEditingOrder(null);
                if (wasEditing) {
                    // The edit reused its original number and never touched the
                    // counter, so the next-bill display must be re-read from it
                    // rather than incremented off the (unrelated) number just
                    // saved — incrementing here could regress it if newer bills
                    // were created elsewhere while this one was being edited.
                    getDoc(getTenantDoc(db, tenantId, 'counters', 'posBillCounter')).then(snap => {
                        const seq = snap.exists() ? (snap.data().lastBillNumber || 0) : 0;
                        setNextBillNumber(`KA-${(seq + 1).toString().padStart(4, '0')}`);
                    }).catch(() => {});
                } else {
                    // Advance the displayed bill number. generateBillNumber() already
                    // consumed this one from the counter, so without this the next bill
                    // kept showing the number just used until the page was reloaded.
                    setNextBillNumber(`KA-${(Number(billNumber.replace(/\D/g, '')) + 1).toString().padStart(4, '0')}`);
                }
                setIsProcessing(false);
            }, 300);

        } catch (e) {
            console.error(e);
            showToast('Could not complete the sale. Please try again.', 'error');
            setIsProcessing(false);
        }
    };

    // Split payment helpers
    const splitTotal = splits.reduce((s, sp) => s + (Number(sp.amount) || 0), 0);
    const splitRemaining = grandTotal - splitTotal;

    // Isolate print to the bill portal so the app sidebar/nav never appears.
    //
    // The teardown MUST wait for 'afterprint'. Browsers render the print
    // preview asynchronously, so removing the class on the line after
    // window.print() let the preview capture a page that no longer had the
    // isolation applied — printing the entire app instead of just the bill.
    // A lingering class is harmless if 'afterprint' never fires: every rule
    // that uses it lives inside @media print, so it has no on-screen effect.
    const triggerPrint = (onDone?: () => void) => {
        document.body.classList.add('pos-printing');
        const cleanup = () => {
            window.removeEventListener('afterprint', cleanup);
            document.body.classList.remove('pos-printing');
            onDone?.();
        };
        window.addEventListener('afterprint', cleanup);
        window.print();
    };

    const openReprint = (order: any) => setReprintOrder(order);

    // Print a reprint only once the bill has actually painted into the portal,
    // and clear it only once printing is done.
    //
    // `loading` is the critical gate. While it is true this component returns
    // only a spinner, so the #pos-print-root portal below is never rendered —
    // and body.pos-printing then hides every child of <body> with no print
    // root to reveal, printing a completely blank page. Arriving from Khata
    // (/pos?reprintOrderId=…) always hit that window, because the old code
    // printed on a fixed 100ms timer while the page was still fetching.
    useEffect(() => {
        if (!reprintOrder || loading) return;
        let cancelled = false;
        let inner = 0;
        // Two frames: one to commit the portal, one to let it paint.
        const outer = requestAnimationFrame(() => {
            inner = requestAnimationFrame(() => {
                if (!cancelled) triggerPrint(() => setReprintOrder(null));
            });
        });
        return () => {
            cancelled = true;
            cancelAnimationFrame(outer);
            cancelAnimationFrame(inner);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reprintOrder, loading]);

    // Discards the in-progress edit and returns this tab to a genuinely fresh
    // bill — mirrors the post-checkout reset exactly (same fields cleared),
    // but nothing is saved and no salesOrders document is touched.
    const cancelEdit = () => {
        if (!editingOrder || !tenantId) return;
        try { localStorage.removeItem(`pos_draft_${tenantId}`); } catch {}
        setBillTabs(prev => prev.map(t =>
            t.id === activeTabId
                ? { ...t, cart: [], customer: defaultCustomer(), customerOutstanding: 0 }
                : t,
        ));
        setModeOfPayment('Cash');
        setRedeemPoints(0);
        setInvoiceCategories(null);
        setRowMeta({});
        autoFilledBatchesRef.current.clear();
        setTransportCharges(0);
        setLaborCharges(0);
        setManualDiscount(0);
        setCreditPaidNow(0);
        setKhataNote('');
        setBillNote('');
        setShowOtherOptions(false);
        setEditingOrder(null);
        // Not consumed while editing — restore the real next-in-sequence number.
        getDoc(getTenantDoc(db, tenantId, 'counters', 'posBillCounter')).then(snap => {
            const seq = snap.exists() ? (snap.data().lastBillNumber || 0) : 0;
            setNextBillNumber(`KA-${(seq + 1).toString().padStart(4, '0')}`);
        }).catch(() => {});
        showToast('Edit cancelled', 'success');
    };

    if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-emerald-600" size={48} /></div>;

    return (
        <>
        {/* ── Module Tab Bar (matches the Worklist sub-navbar: breaks out of the
            2rem page padding to sit flush against the main navbar) ── */}
        <div className="no-print" style={{
            position: 'sticky', top: 0, zIndex: 50,
            background: 'var(--surface-base)',
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            display: 'flex', gap: '0.25rem',
            borderBottom: '2px solid var(--surface-border)',
            overflowX: 'auto', scrollbarWidth: 'none',
            marginLeft: '-2rem', marginRight: '-2rem',
            paddingLeft: '2rem', paddingRight: '2rem',
            marginTop: '-2rem', paddingTop: '0.75rem',
            marginBottom: '1.75rem',
        }}>
            {visiblePosTabs.map(tab => {
                const isActive = posModuleTab === tab.id;
                return (
                    <button
                        key={tab.id}
                        onClick={() => setPosModuleTab(tab.id)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            padding: '0.65rem 1.25rem',
                            background: 'transparent', border: 'none',
                            borderBottom: isActive ? '2px solid var(--primary-light)' : '2px solid transparent',
                            marginBottom: '-2px',
                            color: isActive ? 'var(--primary-light)' : 'var(--text-tertiary)',
                            fontWeight: isActive ? 700 : 400,
                            fontSize: '0.9rem', cursor: 'pointer', fontFamily: 'inherit',
                            whiteSpace: 'nowrap', borderRadius: '0',
                            transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)'; }}
                        onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-tertiary)'; }}
                    >
                        {tab.label}
                    </button>
                );
            })}
        </div>

        {/* ── Non-billing sub-pages ── */}
        {activeAllowed && posModuleTab === 'khata'         && <DigitalKhataPage fullWidth />}
        {activeAllowed && posModuleTab === 'customers'     && <CustomersPage fullWidth />}
        {activeAllowed && posModuleTab === 'order-history' && <OrderHistoryPage fullWidth />}

        {/* Bill print portal — rendered directly on <body> so body.pos-printing CSS
            can hide everything else (sidebar, nav, app wrapper) without any className
            gymnastics on the surrounding layout. Both Print and Reprint share this portal;
            reprintOrder controls which content is active at print time.

            Deliberately OUTSIDE the posModuleTab === 'billing' branch. Printing a bill
            from the Khata tab (its Print button routes to /pos?reprintOrderId=…) left
            posModuleTab on 'khata', so this portal was never mounted — and
            body.pos-printing hid every child of <body> with no print root to reveal,
            producing a blank page. It costs nothing to always render: #pos-print-root
            is display:none under @media screen. */}
        {createPortal(
            <div id="pos-print-root">
                {reprintOrder ? (
                    <PosInvoicePreview
                        cart={(reprintOrder.lineItems || []).map((li: any) => ({
                            name: li.productName, cartQuantity: li.quantity, baseUnit: li.unit,
                            sellingPrice: li.mrp, maxRetailPrice: li.mrp, cartTotal: li.amount, gstPct: li.gstPct,
                            mfgCompany: li.mfgCompany, batchNo: li.batchNo, expDate: li.expDate,
                        }))}
                        customer={{ name: reprintOrder.retailerName, phone: reprintOrder.phoneNumber, address: reprintOrder.address, pin: reprintOrder.pin, taluka: reprintOrder.taluka, district: reprintOrder.district }}
                        branding={branding}
                        billNumber={reprintOrder.orderNumber}
                        transportCharges={reprintOrder.transportCharges || 0}
                        laborCharges={reprintOrder.laborCharges || 0}
                        discount={reprintOrder.discount || 0}
                        grandTotal={reprintOrder.grandTotal || 0}
                        billFormat={billFormat}
                        invoiceDate={reprintOrder.invoiceDate || ''}
                        modeOfPayment={reprintOrder.paymentMethod || 'Cash'}
                        L={L}
                    />
                ) : (
                    <PosInvoicePreview
                        cart={cart.map(c => ({ ...c, batchNo: rowMeta[c.id]?.batchNo ?? c.batchNumber, expDate: rowMeta[c.id]?.expDate ?? c.expiryDate }))}
                        customer={customer}
                        branding={branding}
                        billNumber={nextBillNumber}
                        transportCharges={transportCharges}
                        laborCharges={laborCharges}
                        discount={loyaltyDiscount + manualDiscount}
                        grandTotal={grandTotal}
                        creditPaidNow={effectiveCreditPaidNow}
                        creditAmount={effectiveCreditAmount}
                        billFormat={billFormat}
                        invoiceDate={invoiceDate}
                        modeOfPayment={modeOfPayment}
                        previousOutstanding={customerOutstanding}
                        activeCats={invoiceCategories ?? getInvoiceProductCategories(cart)}
                        L={L}
                    />
                )}
            </div>,
            document.body
        )}

        {/* ── POS Billing (existing content) ── */}
        {activeAllowed && posModuleTab === 'billing' && <div style={{ background: 'var(--bg-color)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

            {/* Header */}
            <header className="no-print" style={{ background: 'var(--surface-base)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderBottom: '1px solid var(--surface-border)', padding: '0.75rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ background: 'var(--primary)', color: 'white', padding: '0.5rem', borderRadius: '10px' }}><Zap size={22} /></div>
                    <h1 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>POS Billing</h1>
                </div>

                {/* Returns quick access */}
                {/* TEMPORARILY DISABLED (2026-07-03)
                    Returns & Exchanges module is incomplete.
                    Hidden until the feature is redesigned and rebuilt. */}
                {/* <ModuleGate moduleId="returns_exchanges" moduleName="Returns" paywallVariant="badge">
                    <Link to="/returns" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 1rem', borderRadius: '10px', border: '1px solid var(--surface-border)', background: 'white', color: 'var(--text-secondary)', textDecoration: 'none', fontWeight: 600, fontSize: '0.875rem' }}>
                        <RotateCcw size={16} /> Returns
                    </Link>
                </ModuleGate> */}

                {/* Quick add a product to inventory without leaving billing */}
                <button onClick={openAddProduct} title="Add a new product to inventory"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 1rem', borderRadius: '10px', border: '1px solid var(--surface-border)', background: 'var(--surface-base)', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-secondary)', marginLeft: 'auto', transition: 'all var(--transition-fast)' }}>
                    <PlusCircle size={16} /> New Product
                </button>
            </header>

            {/* Multi-bill tabs bar */}
            <ModuleGate moduleId="multi_bill_tabs" moduleName="Multiple Bills" paywallVariant="badge">
                <div className="no-print" style={{ background: 'var(--surface-base)', borderBottom: '1px solid var(--surface-border)', padding: '0.5rem 1.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center', overflowX: 'auto' }}>
                    {billTabs.map(tab => (
                        <div key={tab.id} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <button
                                onClick={() => setActiveTabId(tab.id)}
                                style={{
                                    padding: '0.35rem 0.9rem', borderRadius: '8px', fontWeight: 600, fontSize: '0.85rem', border: '1px solid',
                                    background: tab.id === activeTabId ? 'var(--primary)' : 'var(--surface-raised)',
                                    color: tab.id === activeTabId ? 'white' : 'var(--text-secondary)',
                                    borderColor: tab.id === activeTabId ? 'var(--primary)' : 'var(--surface-border)',
                                    cursor: 'pointer',
                                    transition: 'all var(--transition-fast)',
                                }}>
                                {billTabLabel(tab.id)} {tab.cart.length > 0 && <span style={{ opacity: 0.7 }}>({tab.cart.length})</span>}
                            </button>
                            {billTabs.length > 1 && (
                                <button onClick={() => closeTab(tab.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-tertiary)', borderRadius: '4px' }}>
                                    <X size={12} />
                                </button>
                            )}
                        </div>
                    ))}
                    {billTabs.length < 5 && (
                        <button onClick={addTab} style={{ padding: '0.35rem 0.75rem', borderRadius: '8px', border: '1px dashed var(--surface-border)', background: 'transparent', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem' }}>
                            <PlusCircle size={14} /> New Bill
                        </button>
                    )}
                </div>
            </ModuleGate>

            <div style={{ display: 'flex', flex: 1 }}>
                {/* ── B2B-style GST invoice surface (farmer billing) ──────────────── */}
                <div className="no-print" style={{ flex: 1, height: 'calc(100vh - 80px)', overflowY: 'auto', background: 'var(--bg-color)', padding: '1.25rem' }}>
                    <style>{`
                        .pinv-table { border-collapse: collapse; width: 100%; }
                        .pinv-table th, .pinv-table td { border: 1px solid #222; padding: 4px 5px; font-size: 0.82rem; }
                        .pinv-table th { background: #f2f2f2; font-weight: 700; text-align: center; color: #000; }
                        .pinv-input { width: 100%; border: none; background: transparent; outline: none; font-family: inherit; color: inherit; font-size: inherit; }
                        /* Keyboard-only focus ring — invisible to mouse clicks (:focus-visible),
                           so Tab/Shift+Tab through the invoice always shows where keyboard focus
                           is, on the dark app chrome as well as the white invoice paper. */
                        .pinv-input:focus-visible { outline: 2px solid #2E7D32; outline-offset: 1px; border-radius: 2px; }
                        .pinv-label { font-weight: 700; font-size: 0.82rem; }
                        .pinv-dropdown { position: absolute; top: 100%; left: 0; min-width: 220px; max-height: 220px; overflow-y: auto; background: #fff; border: 1px solid #ccc; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 1000; }
                        .pinv-dropdown-item { padding: 6px 10px; cursor: pointer; font-size: 0.85rem; border-bottom: 1px solid #eee; text-align: left; color: #000; }
                        .pinv-dropdown-item:hover { background: #e8f5e9; }
                        .pinv-fmt-btn { padding: 0.35rem 0.9rem; border-radius: 8px; font-weight: 700; font-size: 0.82rem; cursor: pointer; border: 1px solid var(--surface-border); background: var(--surface-base); color: var(--text-secondary); }
                        .pinv-fmt-btn.active { background: var(--primary); color: #fff; border-color: var(--primary); }
                        .pinv-fmt-btn:focus-visible { outline: 2px solid #2E7D32; outline-offset: 2px; }
                    `}</style>

                    {/* Edit banner — saving updates this exact bill in place */}
                    {editingOrder && (
                        <div style={{ maxWidth: billFormat === 'A5' ? '960px' : '1040px', margin: '0 auto 0.9rem', padding: '0.7rem 1rem', borderRadius: '10px', background: 'hsla(220,70%,55%,0.1)', border: '1px solid hsla(220,70%,55%,0.3)', display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                            <Pencil size={15} color="#3b82f6" />
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                Editing bill {editingOrder.orderNumber || editingOrder.id?.slice(-6)?.toUpperCase()}
                            </span>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                — saving updates this bill; the invoice number stays the same.
                            </span>
                            <button
                                onClick={cancelEdit}
                                style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.3rem 0.7rem', borderRadius: '8px', border: '1px solid hsla(220,70%,55%,0.4)', background: 'transparent', color: '#3b82f6', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                            >
                                <X size={13} /> Cancel Edit
                            </button>
                        </div>
                    )}

                    {/* Bill-format selector — accountant can print A4 or A5 */}
                    {(() => {
                        const ALL_INVOICE_CATS = ['Fertilizers', 'Pesticides', 'Seeds', 'Others'];
                        const selectedCategories = invoiceCategories ?? getInvoiceProductCategories(cart);
                        const isManualCat = invoiceCategories !== null;
                        const toggleCategory = (cat: string) => {
                            const current = invoiceCategories ?? getInvoiceProductCategories(cart);
                            const next = current.includes(cat) ? current.filter(c => c !== cat) : [...current, cat];
                            setInvoiceCategories(next.length > 0 ? next : current);
                        };
                        return (
                            <div style={{ maxWidth: billFormat === 'A5' ? '960px' : '1040px', margin: '0 auto 0.9rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    <FileText size={16} color="var(--text-secondary)" />
                                    <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{L('bill_format')}:</span>
                                    {(['A4', 'A5'] as BillFormat[]).map(f => (
                                        <button key={f} onClick={() => setBillFormat(f)} className={`pinv-fmt-btn${billFormat === f ? ' active' : ''}`}>
                                            {f}
                                        </button>
                                    ))}
                                    <span style={{ width: '1px', height: '20px', background: 'var(--surface-border)', margin: '0 0.35rem' }} />
                                    <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{L('bill_language')}:</span>
                                    {([['en', 'EN'], ['mr', 'मराठी'], ['hi', 'हिंदी']] as const).map(([code, label]) => (
                                        <button key={code} onClick={() => setBillLang(code)} className={`pinv-fmt-btn${billLang === code ? ' active' : ''}`}>
                                            {label}
                                        </button>
                                    ))}
                                    <span style={{ width: '1px', height: '20px', background: 'var(--surface-border)', margin: '0 0.35rem' }} />
                                    <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Category:</span>
                                    <select
                                        value={isManualCat ? (selectedCategories[0] || '') : ''}
                                        onChange={e => setInvoiceCategories(e.target.value ? [e.target.value] : null)}
                                        style={{ padding: '0.3rem 0.55rem', borderRadius: '8px', border: '1px solid var(--surface-border)', background: 'var(--surface-base)', color: 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', outline: 'none', fontFamily: 'inherit' }}
                                    >
                                        <option value="">Auto</option>
                                        {ALL_INVOICE_CATS.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                    </select>
                                </div>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>{L('bill_no')} #{nextBillNumber}</span>
                            </div>
                        );
                    })()}

                    {/* Invoice card. Live Stock is a POS-only trailing column INSIDE the
                        items table (right of the Delete column) — the whole card is no-print
                        and the printed copy is rendered separately by PosInvoicePreview, so
                        the Live Stock / Delete columns never reach paper. Keeping them as real
                        table columns is what guarantees each value lines up with its row. */}
                    <div className="no-print" style={{ display: 'flex', alignItems: 'flex-start' }}>
                    {/* Invoice card (editable on screen; printed copy is rendered separately) */}
                    <div style={{ flex: 1, maxWidth: billFormat === 'A5' ? '970px' : '1040px', margin: '0 auto', background: '#fff', color: '#000', fontFamily: billFormat === 'A5' ? 'Arial, Helvetica, sans-serif' : "'Times New Roman', serif", boxShadow: '0 4px 24px rgba(0,0,0,0.10)', borderRadius: billFormat === 'A5' ? '3px' : '10px', border: 'none', padding: billFormat === 'A5' ? '0' : '16px 18px' }}>

                        {billFormat === 'A5' ? (
                            // ── A5 LANDSCAPE — Reference Invoice Redesign ────────────────────
                            <div style={{ border: '1.5px solid #333', fontFamily: 'Arial, Helvetica, sans-serif' }}>

                                {/* ══ HEADER ═══════════════════════════════════════════════════ */}
                                {/* License box is its own auto-width column so it never stretches */}
                                {(() => {
                                    const lics = getAllConfiguredLicenses(branding);
                                    return (
                                        <div style={{ display: 'grid', gridTemplateColumns: `${lics.length > 0 ? 'auto ' : ''}1fr 162px`, borderBottom: '1.5px solid #333' }}>

                                            {/* License box — compact, left-most, sized to content */}
                                            {lics.length > 0 && (
                                                <div style={{ borderRight: '1px solid #aaa', padding: '5px 10px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '3px' }}>
                                                    {lics.map(lic => (
                                                        <div key={lic.label} style={{ fontSize: '0.60rem', color: '#333', whiteSpace: 'nowrap' }}>
                                                            <strong>{lic.label}:</strong> {lic.number}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Center: GST INVOICE (primary) + Business info */}
                                            <div style={{ borderRight: '1px solid #aaa', padding: '5px 12px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                                                <div style={{ fontWeight: 900, fontSize: '1.0rem', letterSpacing: '0.10em', textTransform: 'uppercase', color: '#111', textAlign: 'center', lineHeight: 1.1 }}>GST INVOICE</div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '7px', justifyContent: 'center' }}>
                                                    {branding?.logoUrl && <img src={branding.logoUrl} alt="Logo" style={{ height: '22px', objectFit: 'contain' }} />}
                                                    <div style={{ fontWeight: 800, fontSize: '0.88rem', lineHeight: 1.15 }}>{branding?.businessName || 'Your Business Name'}</div>
                                                </div>
                                                {branding?.address && <div style={{ fontSize: '0.68rem', color: '#333', lineHeight: 1.4, textAlign: 'center' }}>{branding.address}</div>}
                                                <div style={{ fontSize: '0.66rem', color: '#333', display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                                                    {branding?.gstin && <span><strong>GSTIN:</strong> {branding.gstin}</span>}
                                                    <span>| <strong>Contact:</strong> {INVOICE_CONTACT_LABEL}</span>
                                                    {branding?.contact && <span>| <strong>Ph:</strong> {branding.contact}</span>}
                                                </div>
                                            </div>

                                            {/* Right col: Bill meta */}
                                            <div style={{ padding: '6px 10px', display: 'flex', flexDirection: 'column', justifyContent: 'center', fontSize: '0.70rem', gap: '4px' }}>
                                                <div><strong>Bill No:</strong> <span style={{ fontWeight: 900 }}>{nextBillNumber}</span></div>
                                                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                                    <strong style={{ whiteSpace: 'nowrap' }}>Date:</strong>
                                                    <input type="date" className="pinv-input" style={{ fontSize: '0.68rem', flex: 1 }} value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
                                                </div>
                                                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                                    <strong style={{ whiteSpace: 'nowrap' }}>Mode:</strong>
                                                    <select className="pinv-input" style={{ fontSize: '0.68rem', flex: 1, fontWeight: 700 }} value={modeOfPayment} onChange={e => setModeOfPayment(e.target.value)}>
                                                        {['Cash', 'Credit'].map(m => <option key={m} value={m}>{m}</option>)}
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* ══ CUSTOMER ROW ═════════════════════════════════════════════ */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.75fr 0.85fr 0.85fr 1.0fr 0.45fr', borderBottom: '1px solid #aaa', fontSize: '0.78rem' }}>
                                    {/* Buyer Name */}
                                    <div style={{ borderRight: '1px solid #ccc', padding: '4px 8px', display: 'flex', gap: '5px', alignItems: 'center', position: 'relative' }}>
                                        <span style={{ fontWeight: 700, color: '#555', whiteSpace: 'nowrap', flexShrink: 0, fontSize: '0.72rem' }}>Buyer:</span>
                                        {(() => {
                                            const farmerMatches = farmers.filter(r => (r.name || '').toLowerCase().includes(customer.name.toLowerCase()) && customer.name.toLowerCase() !== (r.name || '').toLowerCase())
                                                .sort((a, b) => (a.channel === 'pos' ? -1 : 1) - (b.channel === 'pos' ? -1 : 1)).slice(0, 10);
                                            return (<>
                                                <input className="pinv-input" style={{ fontWeight: 700, fontSize: '0.82rem', flex: 1, minWidth: 0 }} placeholder={L('buyer_name_ph')} value={customer.name}
                                                    role="combobox" aria-expanded={showFarmerDropdown} aria-controls="pos-buyer-listbox-a5" aria-autocomplete="list"
                                                    onChange={e => { setCustomer({ ...customer, name: e.target.value }); setShowFarmerDropdown(e.target.value.length > 0); setHighlightedFarmerIdx(-1); }}
                                                    onFocus={() => customer.name.length > 0 && setShowFarmerDropdown(true)}
                                                    onBlur={() => setTimeout(() => { setShowFarmerDropdown(false); setHighlightedFarmerIdx(-1); }, 200)}
                                                    onKeyDown={e => {
                                                        if (showFarmerDropdown && farmerMatches.length > 0) {
                                                            if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightedFarmerIdx(i => Math.min(i + 1, farmerMatches.length - 1)); return; }
                                                            if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightedFarmerIdx(i => Math.max(i - 1, -1)); return; }
                                                            if (e.key === 'Enter' && highlightedFarmerIdx >= 0) { e.preventDefault(); selectFarmer(farmerMatches[highlightedFarmerIdx]); return; }
                                                            if (e.key === 'Escape') { e.preventDefault(); setShowFarmerDropdown(false); setHighlightedFarmerIdx(-1); return; }
                                                        }
                                                        if (e.key === 'Enter' && !showFarmerDropdown) { e.preventDefault(); customerPhoneRef.current?.focus(); }
                                                    }} />
                                                {showFarmerDropdown && farmerMatches.length > 0 && (
                                                    <div id="pos-buyer-listbox-a5" role="listbox" className="pinv-dropdown" style={{ width: '100%' }}>
                                                        {farmerMatches.map((r, ri) => (
                                                            <div key={r.id} role="option" aria-selected={ri === highlightedFarmerIdx} className="pinv-dropdown-item"
                                                                style={{ background: ri === highlightedFarmerIdx ? '#e8f5e9' : undefined }}
                                                                onMouseDown={() => selectFarmer(r)}>
                                                                <div style={{ fontWeight: 600 }}>{r.name}</div>
                                                                <div style={{ fontSize: '0.75rem', color: '#666' }}>
                                                                    {r.number
                                                                        ? <>{r.number}{r.atPost ? ` • ${r.atPost}` : ''}</>
                                                                        : <>{r.atPost ? `${r.atPost} • ` : ''}<span style={{ fontStyle: 'italic' }}>No phone number</span></>}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </>);
                                        })()}
                                    </div>
                                    {/* Phone */}
                                    <div style={{ borderRight: '1px solid #ccc', padding: '4px 8px', display: 'flex', gap: '5px', alignItems: 'center', position: 'relative' }}>
                                        <span style={{ fontWeight: 700, color: '#555', whiteSpace: 'nowrap', flexShrink: 0, fontSize: '0.72rem' }}>Ph:</span>
                                        {(() => {
                                            const phoneMatches = phoneMatchesFor(customer.phone);
                                            return (<>
                                                <input ref={customerPhoneRef} className="pinv-input" style={{ flex: 1, fontSize: '0.8rem', minWidth: 0 }} placeholder="Phone" value={customer.phone}
                                                    inputMode="numeric" maxLength={10}
                                                    role="combobox" aria-expanded={showPhoneDropdown} aria-controls="pos-phone-listbox-a5" aria-autocomplete="list"
                                                    onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 10); setCustomer({ ...customer, phone: v }); setShowPhoneDropdown(v.length > 0); setHighlightedPhoneIdx(-1); }}
                                                    onFocus={() => customer.phone.length > 0 && setShowPhoneDropdown(true)}
                                                    onBlur={() => { setTimeout(() => { setShowPhoneDropdown(false); setHighlightedPhoneIdx(-1); }, 200); handlePhoneLookup(); }}
                                                    onKeyDown={e => {
                                                        if (showPhoneDropdown && phoneMatches.length > 0) {
                                                            if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightedPhoneIdx(i => Math.min(i + 1, phoneMatches.length - 1)); return; }
                                                            if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightedPhoneIdx(i => Math.max(i - 1, -1)); return; }
                                                            if (e.key === 'Enter' && highlightedPhoneIdx >= 0) { e.preventDefault(); selectFarmer(phoneMatches[highlightedPhoneIdx]); return; }
                                                            if (e.key === 'Escape') { e.preventDefault(); setShowPhoneDropdown(false); setHighlightedPhoneIdx(-1); return; }
                                                        }
                                                        if (e.key === 'Enter' && !showPhoneDropdown) { e.preventDefault(); customerAddressRef.current?.focus(); }
                                                    }} />
                                                {showPhoneDropdown && phoneMatches.length > 0 && (
                                                    <div id="pos-phone-listbox-a5" role="listbox" className="pinv-dropdown" style={{ width: '100%' }}>
                                                        {phoneMatches.map((r, ri) => (
                                                            <div key={r.id} role="option" aria-selected={ri === highlightedPhoneIdx} className="pinv-dropdown-item"
                                                                style={{ background: ri === highlightedPhoneIdx ? '#e8f5e9' : undefined }}
                                                                onMouseDown={() => selectFarmer(r)}>
                                                                <div style={{ fontWeight: 600 }}>{r.number || <span style={{ fontStyle: 'italic' }}>No phone number</span>}</div>
                                                                <div style={{ fontSize: '0.75rem', color: '#666' }}>{r.name || 'Unnamed'}{r.atPost ? ` • ${r.atPost}` : ''}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </>);
                                        })()}
                                    </div>
                                    {/* Village */}
                                    <div style={{ borderRight: '1px solid #ccc', padding: '4px 8px', display: 'flex', gap: '5px', alignItems: 'center' }}>
                                        <span style={{ fontWeight: 700, color: '#555', whiteSpace: 'nowrap', flexShrink: 0, fontSize: '0.72rem' }}>Village:</span>
                                        <input ref={customerAddressRef} className="pinv-input" style={{ flex: 1, fontSize: '0.8rem', minWidth: 0 }} placeholder={L('village_ph')} value={customer.address}
                                            onChange={e => setCustomer({ ...customer, address: e.target.value })}
                                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); customerTalukaRef.current?.focus(); } }} />
                                    </div>
                                    {/* Taluka */}
                                    <div style={{ borderRight: '1px solid #ccc', padding: '4px 8px', display: 'flex', gap: '5px', alignItems: 'center' }}>
                                        <span style={{ fontWeight: 700, color: '#555', whiteSpace: 'nowrap', flexShrink: 0, fontSize: '0.72rem' }}>Taluka:</span>
                                        <input ref={customerTalukaRef} className="pinv-input" style={{ flex: 1, fontSize: '0.8rem', minWidth: 0 }} placeholder="Taluka" value={customer.taluka || ''}
                                            onChange={e => setCustomer({ ...customer, taluka: e.target.value })}
                                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); customerDistrictRef.current?.focus(); } }} />
                                    </div>
                                    {/* District */}
                                    <div style={{ borderRight: '1px solid #ccc', padding: '4px 8px', display: 'flex', gap: '5px', alignItems: 'center' }}>
                                        <span style={{ fontWeight: 700, color: '#555', whiteSpace: 'nowrap', flexShrink: 0, fontSize: '0.72rem' }}>District:</span>
                                        <input ref={customerDistrictRef} className="pinv-input" style={{ flex: 1, fontSize: '0.8rem', minWidth: 0 }} placeholder="District" value={customer.district || ''}
                                            onChange={e => setCustomer({ ...customer, district: e.target.value })}
                                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); customerPinRef.current?.focus(); } }} />
                                    </div>
                                    {/* PIN */}
                                    <div style={{ padding: '4px 8px', display: 'flex', gap: '5px', alignItems: 'center' }}>
                                        <span style={{ fontWeight: 700, color: '#555', whiteSpace: 'nowrap', flexShrink: 0, fontSize: '0.72rem' }}>PIN:</span>
                                        <input ref={customerPinRef} className="pinv-input" style={{ flex: 1, fontSize: '0.8rem', minWidth: 0 }} placeholder={L('pin')} value={customer.pin}
                                            onChange={e => setCustomer({ ...customer, pin: e.target.value })}
                                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); rowSearchRef.current?.focus(); } }} />
                                    </div>
                                </div>

                                {/* ══ ITEMS TABLE ══════════════════════════════════════════════ */}
                                <div style={{ overflowX: 'auto' }}>
                                    {/* Column widths in % — mirror the print template exactly so WYSIWYG. */}
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', tableLayout: 'fixed' }}>
                                        <colgroup>
                                            {/* # */}      <col style={{ width: '2.5%' }} />
                                            {/* Product */} <col />
                                            {/* Company */} <col style={{ width: '9%' }} />
                                            {/* Batch */}   <col style={{ width: '9.5%' }} />
                                            {/* Exp */}     <col style={{ width: '8%' }} />
                                            {/* Per */}     <col style={{ width: '4.5%' }} />
                                            {/* Qty */}     <col style={{ width: '5%' }} />
                                            {/* Rate */}    <col style={{ width: '10%' }} />
                                            {/* GST% */}    <col style={{ width: '5%' }} />
                                            {/* Amount */}  <col style={{ width: '12%' }} />
                                            {/* Del (POS-only) */}       <col style={{ width: '2.5%' }} />
                                            {/* Live Stock (POS-only) */} <col style={{ width: '5.5%' }} />
                                        </colgroup>
                                        <thead>
                                            <tr style={{ background: '#f5f5f5', borderBottom: '1.5px solid #333' }}>
                                                {([
                                                    ['#', 'center', '3px 1px'],
                                                    ['Product', 'left', '3px 5px'],
                                                    ['Company', 'center', '3px 2px'],
                                                    ['Batch No.', 'center', '3px 2px'],
                                                    ['Exp', 'center', '3px 1px'],
                                                    ['Per', 'center', '3px 1px'],
                                                    ['Qty', 'center', '3px 1px'],
                                                    ['Rate', 'right', '3px 3px'],
                                                    ['GST%', 'center', '3px 1px'],
                                                    ['Amount', 'right', '3px 3px'],
                                                ] as const).map(([label, align, pad]) => (
                                                    <th key={label} style={{ border: '1px solid #ccc', padding: pad, textAlign: align, fontWeight: 700, fontSize: '0.74rem', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                                        {label}
                                                    </th>
                                                ))}
                                                {/* POS-only columns — Delete + Live Stock. The 2px left border marks
                                                    where the printable bill ends (at Amount); everything to its right
                                                    is on-screen only and never prints (PosInvoicePreview omits it). */}
                                                <th style={{ border: '1px solid #ccc', borderLeft: '2px solid #333' }}></th>
                                                <th style={{ border: '1px solid #ccc', padding: '3px 2px', textAlign: 'center', fontWeight: 700, fontSize: '0.66rem', lineHeight: 1.1, color: '#555', whiteSpace: 'normal' }}>{L('live_stock')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {cart.map((item, idx) => (
                                                <tr key={item.id} style={{ borderBottom: '1px solid #eee' }}>
                                                    <td style={{ border: '1px solid #e8e8e8', padding: '3px 2px', textAlign: 'center', fontSize: '0.72rem' }}>{idx + 1}</td>
                                                    <td style={{ border: '1px solid #e8e8e8', padding: '3px 5px', fontWeight: 600, fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</td>
                                                    <td style={{ border: '1px solid #e8e8e8', padding: '3px 2px', fontSize: '0.72rem', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.mfgCompany || ''}</td>
                                                    <td style={{ border: '1px solid #e8e8e8', padding: '1px 2px' }}>
                                                        <input className="pinv-input" style={{ textAlign: 'center', fontSize: '0.72rem' }} value={rowMeta[item.id]?.batchNo ?? (item.batchNumber || '')}
                                                            onChange={e => setRowMeta(m => ({ ...m, [item.id]: { ...m[item.id], batchNo: e.target.value } }))} />
                                                    </td>
                                                    <td style={{ border: '1px solid #e8e8e8', padding: '1px 2px' }}>
                                                        <input type="text" className="pinv-input" style={{ textAlign: 'center', fontSize: '0.70rem', width: '100%' }} placeholder="MM/YY"
                                                            value={toMonthYear(rowMeta[item.id]?.expDate ?? (item.expiryDate || ''))}
                                                            onChange={e => setRowMeta(m => ({ ...m, [item.id]: { ...m[item.id], expDate: fromMonthYear(e.target.value) } }))} />
                                                    </td>
                                                    <td style={{ border: '1px solid #e8e8e8', padding: '3px 2px', textAlign: 'center', fontSize: '0.72rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.unit || item.baseUnit}</td>
                                                    <td style={{ border: '1px solid #e8e8e8', padding: '1px 2px' }}>
                                                        <input type="number" min="0" className="pinv-input" style={{ textAlign: 'center', fontWeight: 700, fontSize: '0.78rem' }} value={item.cartQuantity}
                                                            ref={el => { qtyRefs.current[item.id] = el; }}
                                                            onChange={e => setQty(item.id, Number(e.target.value))} onWheel={e => e.currentTarget.blur()}
                                                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); rowSearchRef.current?.focus(); } }} />
                                                    </td>
                                                    <td style={{ border: '1px solid #e8e8e8', padding: '1px 2px' }}>
                                                        <input type="number" min="0" className="pinv-input" style={{ textAlign: 'right', paddingRight: '3px', fontSize: '0.78rem' }} value={posSellingRate(item)}
                                                            onChange={e => setRate(item.id, Number(e.target.value))} onWheel={e => e.currentTarget.blur()} />
                                                    </td>
                                                    <td style={{ border: '1px solid #e8e8e8', padding: '1px 2px' }}>
                                                        <input type="number" className="pinv-input" style={{ textAlign: 'center', fontSize: '0.72rem' }} value={item.gstPct ?? 5}
                                                            onChange={e => setCart(prev => prev.map(c => c.id === item.id ? { ...c, gstPct: Number(e.target.value) } : c))}
                                                            onWheel={e => e.currentTarget.blur()} />
                                                    </td>
                                                    <td style={{ border: '1px solid #e8e8e8', padding: '3px 4px', textAlign: 'right', fontWeight: 700, fontSize: '0.78rem' }}>{item.cartTotal ? invFmt(item.cartTotal) : ''}</td>
                                                    <td style={{ border: '1px solid #e8e8e8', borderLeft: '2px solid #333', padding: '1px', textAlign: 'center' }}>
                                                        <button onClick={() => removeCartItem(item.id)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#e53935', padding: '2px' }}>
                                                            <Trash2 size={12} />
                                                        </button>
                                                    </td>
                                                    {(() => { const liveStock = remainingStockFor(item); return (
                                                        <td style={{ border: '1px solid #e8e8e8', padding: '3px 2px', textAlign: 'center', fontWeight: 800, fontSize: '0.82rem', color: liveStock < 0 ? '#c62828' : '#2E7D32' }}>{liveStock}</td>
                                                    ); })()}
                                                </tr>
                                            ))}
                                            {/* Add-product search row */}
                                            <tr>
                                                <td style={{ border: '1px solid #e8e8e8', padding: '2px', textAlign: 'center', color: '#bbb', fontSize: '0.74rem' }}>{cart.length + 1}</td>
                                                <td colSpan={3} style={{ border: '1px solid #e8e8e8', padding: '1px 3px', position: 'relative' }}>
                                                    {(() => {
                                                        const a5Filtered = products.filter(p => (p.name || '').toLowerCase().includes((rowSearch[cart.length] || '').toLowerCase()) || p.barcode === (rowSearch[cart.length] || '')).slice(0, 50);
                                                        return (<>
                                                            <input ref={rowSearchRef} className="pinv-input" placeholder={L('search_product')} value={rowSearch[cart.length] || ''}
                                                                onChange={e => { setRowSearch(s => ({ ...s, [cart.length]: e.target.value })); setActiveRowIndex(e.target.value.length > 0 ? cart.length : null); setHighlightedProductIdx(-1); }}
                                                                onFocus={() => (rowSearch[cart.length] || '').length > 0 && setActiveRowIndex(cart.length)}
                                                                onBlur={() => setTimeout(() => setActiveRowIndex(null), 200)}
                                                                onKeyDown={e => {
                                                                    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightedProductIdx(i => Math.min(i + 1, a5Filtered.length - 1)); }
                                                                    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightedProductIdx(i => Math.max(i - 1, -1)); }
                                                                    else if (e.key === 'Enter') {
                                                                        e.preventDefault();
                                                                        const pick = highlightedProductIdx >= 0 ? a5Filtered[highlightedProductIdx] : a5Filtered.length === 1 ? a5Filtered[0] : null;
                                                                        if (pick) { addToCart(pick); setRowSearch(s => ({ ...s, [cart.length]: '' })); setActiveRowIndex(null); setHighlightedProductIdx(-1); setTimeout(() => qtyRefs.current[pick.id]?.focus(), 50); }
                                                                    }
                                                                }} />
                                                            {activeRowIndex === cart.length && (
                                                                <ProductSearchDropdown anchorRef={rowSearchRef}>
                                                                    {a5Filtered.map((p, pi) => (
                                                                        <div key={p.id} className="pinv-dropdown-item" style={{ background: pi === highlightedProductIdx ? '#e8f5e9' : undefined }}
                                                                            onMouseDown={() => { addToCart(p); setRowSearch(s => ({ ...s, [cart.length]: '' })); setActiveRowIndex(null); setHighlightedProductIdx(-1); setTimeout(() => qtyRefs.current[p.id]?.focus(), 50); }}>
                                                                            {p.name} <span style={{ color: '#888' }}>· ₹{posSellingRate(p)}</span>
                                                                        </div>
                                                                    ))}
                                                                    {products.filter(p => (p.name || '').toLowerCase().includes((rowSearch[cart.length] || '').toLowerCase())).length === 0 && (
                                                                        <div className="pinv-dropdown-item" onMouseDown={openAddProduct} style={{ color: 'var(--primary)' }}>
                                                                            + Add "{rowSearch[cart.length]}" to inventory
                                                                        </div>
                                                                    )}
                                                                </ProductSearchDropdown>
                                                            )}
                                                        </>);
                                                    })()}
                                                </td>
                                                {/* +1 colSpan vs. the bill columns to cover the POS-only Delete + Live Stock cells */}
                                                <td colSpan={8} style={{ border: '1px solid #e8e8e8' }}></td>
                                            </tr>
                                            {/* Empty padding rows */}
                                            {Array.from({ length: Math.max(0, (editingOrder ? EDIT_BILL_ROW_COUNT : FRESH_BILL_ROW_COUNT) - 1 - cart.length) }).map((_, i) => (
                                                <tr key={`pad-${i}`} style={{ height: '26px' }}>
                                                    <td style={{ border: '1px solid #e8e8e8', color: '#ccc', textAlign: 'center', fontSize: '0.74rem', padding: '2px' }}>{cart.length + 2 + i}</td>
                                                    {Array.from({ length: 11 }).map((_, j) => <td key={j} style={{ border: '1px solid #e8e8e8' }}></td>)}
                                                </tr>
                                            ))}
                                            {/* Total row */}
                                            <tr style={{ background: '#f5f5f5', borderTop: '1.5px solid #333' }}>
                                                <td colSpan={6} style={{ border: '1px solid #ccc', padding: '4px 8px', textAlign: 'right', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.78rem' }}>Total</td>
                                                <td style={{ border: '1px solid #ccc', padding: '4px 1px', textAlign: 'center', fontWeight: 900, fontSize: '0.78rem' }}>{cartTotalQty}</td>
                                                <td colSpan={2} style={{ border: '1px solid #ccc' }}></td>
                                                <td style={{ border: '1px solid #ccc', padding: '4px 4px', textAlign: 'right', fontWeight: 900, fontSize: '0.88rem' }}>{invFmt(cartSubtotal)}</td>
                                                <td style={{ border: '1px solid #ccc', borderLeft: '2px solid #333' }}></td>
                                                <td style={{ border: '1px solid #ccc' }}></td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>

                                {/* ══ FOOTER ═══════════════════════════════════════════════════ */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.1fr 1.0fr', borderTop: '1.5px solid #333' }}>

                                    {/* Col 1 – GST Summary + Declaration */}
                                    <div style={{ borderRight: '1px solid #aaa', display: 'flex', flexDirection: 'column' }}>
                                        <div style={{ background: '#f5f5f5', padding: '2px 4px', borderBottom: '1px solid #ccc', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>GST Summary</div>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.68rem' }}>
                                            <thead>
                                                <tr>
                                                    {['Taxable', 'CGST 2.5%', 'SGST 2.5%', 'Total Tax'].map(h => (
                                                        <th key={h} style={{ border: '1px solid #ddd', padding: '2px 2px', textAlign: 'center', background: '#fafafa', fontWeight: 700 }}>{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr>
                                                    {[computedTaxable, totalCgst, totalSgst, totalTax].map((v, vi) => (
                                                        <td key={vi} style={{ border: '1px solid #ddd', padding: '2px 2px', textAlign: 'center' }}>{invFmt(v)}</td>
                                                    ))}
                                                </tr>
                                            </tbody>
                                        </table>
                                        <div style={{ padding: '4px 6px', fontSize: '0.63rem', color: '#555', lineHeight: 1.4, flex: 1 }}>
                                            <strong>{L('declaration')}:</strong> {L('declaration_text')}
                                        </div>
                                    </div>

                                    {/* Col 2 – Net Amount + Words + Categories */}
                                    <div style={{ borderRight: '1px solid #aaa', display: 'flex', flexDirection: 'column' }}>
                                        <div style={{ padding: '5px 8px', flex: 1, fontSize: '0.78rem', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                            {(transportCharges > 0 || laborCharges > 0 || loyaltyDiscount > 0 || manualDiscount > 0) && (
                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{L('bill_total')}</span><span>₹{cartSubtotal.toLocaleString('en-IN')}</span></div>
                                            )}
                                            {transportCharges > 0 && (
                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{L('transport_charges')}</span><span>+{invFmt(transportCharges)}</span></div>
                                            )}
                                            {laborCharges > 0 && (
                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{L('labor_charges')}</span><span>+{invFmt(laborCharges)}</span></div>
                                            )}
                                            {loyaltyDiscount > 0 && (
                                                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#2E7D32' }}>
                                                    <span>{L('discount')} ({effectiveRedeemPoints} pts)</span><span>-₹{invFmt(loyaltyDiscount)}</span>
                                                </div>
                                            )}
                                            {manualDiscount > 0 && (
                                                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#2E7D32' }}>
                                                    <span>{L('discount')}</span><span>-₹{invFmt(manualDiscount)}</span>
                                                </div>
                                            )}
                                            <div style={{ borderTop: '2px solid #333', paddingTop: '3px', display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '0.95rem' }}>
                                                <span>NET AMOUNT</span><span>₹{invNetAmount.toLocaleString('en-IN')}</span>
                                            </div>
                                            {isCreditBill && (<>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#10b981' }}>
                                                    <span>{L('amount_paid')}</span><span>₹{effectiveCreditPaidNow.toLocaleString('en-IN')}</span>
                                                </div>
                                                <div style={{ borderTop: '1px solid #555', paddingTop: '2px', display: 'flex', justifyContent: 'space-between', fontWeight: 900, color: effectiveCreditAmount > 0 ? '#c62828' : '#10b981' }}>
                                                    <span>{L('credit_amount')}</span><span>₹{effectiveCreditAmount.toLocaleString('en-IN')}</span>
                                                </div>
                                            </>)}
                                            {customerOutstanding > 0 && (<>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#c62828' }}>
                                                    <span>{L('previous_outstanding')} (Dr)</span><span>₹{customerOutstanding.toLocaleString('en-IN')}</span>
                                                </div>
                                                <div style={{ borderTop: '1.5px solid #333', paddingTop: '2px', display: 'flex', justifyContent: 'space-between', fontWeight: 900 }}>
                                                    <span>{L('total_payable')}</span><span>₹{(grandTotal + customerOutstanding).toLocaleString('en-IN')}</span>
                                                </div>
                                            </>)}
                                        </div>
                                        <div style={{ borderTop: '1px solid #ddd', padding: '3px 8px', fontSize: '0.66rem' }}>
                                            <strong>Amt in Words:</strong>{' '}
                                            <span style={{ fontStyle: 'italic', fontWeight: 600 }}>INR {numberToWords(grandTotal)}</span>
                                        </div>
                                    </div>

                                    {/* Col 3 – Signatures side by side */}
                                    <div style={{ display: 'flex', flexDirection: 'row' }}>
                                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '6px 10px', alignItems: 'center' }}>
                                            <div style={{ borderTop: '1px solid #555', paddingTop: '3px', fontSize: '0.7rem', fontWeight: 700, textAlign: 'center', width: '100%' }}>Customer Signature</div>
                                        </div>
                                        <div style={{ flex: 1, borderLeft: '1px solid #ccc', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '6px 10px', alignItems: 'center' }}>
                                            {branding?.signatureUrl && (
                                                <img src={branding.signatureUrl} alt="" style={{ height: '44px', maxWidth: '100%', objectFit: 'contain', display: 'block', margin: '0 auto 4px' }} />
                                            )}
                                            <div style={{ borderTop: '1px solid #555', paddingTop: '3px', fontSize: '0.7rem', fontWeight: 700, textAlign: 'center', width: '100%' }}>Authorized Signature</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            // ── A4 PORTRAIT ON-SCREEN LAYOUT (unchanged) ─────────────────────
                            <>
                                {/* TITLE */}
                                <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '1rem', letterSpacing: '0.15em', marginBottom: '2px' }}>{L('gst_invoice')}</div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid #111', paddingBottom: '8px', marginBottom: '10px', flexWrap: 'wrap', gap: '0.5rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        {branding?.logoUrl && <img src={branding.logoUrl} alt="Logo" style={{ height: '44px', objectFit: 'contain' }} />}
                                        <div>
                                            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, letterSpacing: '-0.01em' }}>{branding?.businessName || 'Your Business Name'}</h1>
                                            <div style={{ fontSize: '0.78rem', color: '#444', marginTop: '2px' }}>
                                                {branding?.address || 'Address'}<br />
                                                {branding?.gstin && <><strong>GSTIN:</strong> {branding.gstin} &nbsp;</>}
                                                <strong>Contact:</strong> {INVOICE_CONTACT_LABEL} &nbsp;
                                                {branding?.contact && <>Contact No.: {branding.contact}</>}
                                            </div>
                                            {(() => {
                                                const lics = getAllConfiguredLicenses(branding);
                                                return lics.length > 0 ? (
                                                    <div style={{ fontSize: '0.72rem', color: '#555', marginTop: '2px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                                        {lics.map(lic => <span key={lic.label}><strong>{lic.label}:</strong> {lic.number}</span>)}
                                                    </div>
                                                ) : null;
                                            })()}
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right', fontWeight: 700, fontSize: '0.95rem', color: '#111', border: '2px solid #111', padding: '4px 12px', borderRadius: '6px' }}>
                                        {modeOfPayment === 'Khata' || modeOfPayment === 'Credit' ? L('credit_bill') : L('cash_bill')}
                                    </div>
                                </div>

                                {/* GSTIN BANNER */}
                                {branding?.gstin && (
                                    <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '0.9rem', marginBottom: '10px', letterSpacing: '0.05em' }}>
                                        {L('gstin_no')}: {branding.gstin}
                                    </div>
                                )}

                                {/* BUYER (FARMER) + INVOICE META */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0', marginBottom: '10px', border: '1px solid #222' }}>
                                    <div style={{ borderRight: '1px solid #222', padding: '8px' }}>
                                        <div className="pinv-label" style={{ marginBottom: '4px' }}>{L('buyer_title')}</div>
                                        <div style={{ position: 'relative' }}>
                                            {(() => {
                                                const farmerMatches = farmers
                                                    .filter(r => (r.name || '').toLowerCase().includes(customer.name.toLowerCase()) && customer.name.toLowerCase() !== (r.name || '').toLowerCase())
                                                    .sort((a, b) => (a.channel === 'pos' ? -1 : 1) - (b.channel === 'pos' ? -1 : 1))
                                                    .slice(0, 10);
                                                return (<>
                                                    <input
                                                        className="pinv-input"
                                                        style={{ fontWeight: 700, fontSize: '0.88rem' }}
                                                        placeholder={L('buyer_name_ph')}
                                                        value={customer.name}
                                                        role="combobox" aria-expanded={showFarmerDropdown} aria-controls="pos-buyer-listbox-a4" aria-autocomplete="list"
                                                        onChange={e => { setCustomer({ ...customer, name: e.target.value }); setShowFarmerDropdown(e.target.value.length > 0); setHighlightedFarmerIdx(-1); }}
                                                        onFocus={() => customer.name.length > 0 && setShowFarmerDropdown(true)}
                                                        onBlur={() => setTimeout(() => { setShowFarmerDropdown(false); setHighlightedFarmerIdx(-1); }, 200)}
                                                        onKeyDown={e => {
                                                            if (showFarmerDropdown && farmerMatches.length > 0) {
                                                                if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightedFarmerIdx(i => Math.min(i + 1, farmerMatches.length - 1)); return; }
                                                                if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightedFarmerIdx(i => Math.max(i - 1, -1)); return; }
                                                                if (e.key === 'Enter' && highlightedFarmerIdx >= 0) { e.preventDefault(); selectFarmer(farmerMatches[highlightedFarmerIdx]); return; }
                                                                if (e.key === 'Escape') { e.preventDefault(); setShowFarmerDropdown(false); setHighlightedFarmerIdx(-1); return; }
                                                            }
                                                            if (e.key === 'Enter' && !showFarmerDropdown) { e.preventDefault(); customerPhoneRef.current?.focus(); }
                                                        }}
                                                    />
                                                    {showFarmerDropdown && farmerMatches.length > 0 && (
                                                        <div id="pos-buyer-listbox-a4" role="listbox" className="pinv-dropdown" style={{ width: '100%' }}>
                                                            {farmerMatches.map((r, ri) => (
                                                                <div key={r.id} role="option" aria-selected={ri === highlightedFarmerIdx} className="pinv-dropdown-item"
                                                                    style={{ background: ri === highlightedFarmerIdx ? '#e8f5e9' : undefined }}
                                                                    onMouseDown={() => selectFarmer(r)}>
                                                                    <div style={{ fontWeight: 600 }}>{r.name}</div>
                                                                    <div style={{ fontSize: '0.75rem', color: '#666' }}>
                                                                        {r.number
                                                                            ? <>{r.number}{r.atPost ? ` • ${r.atPost}` : ''}</>
                                                                            : <>{r.atPost ? `${r.atPost} • ` : ''}<span style={{ fontStyle: 'italic' }}>No phone number</span></>}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </>);
                                            })()}
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', marginTop: '4px', position: 'relative' }}>
                                            <span className="pinv-label">{L('contact')} :</span>
                                            {(() => {
                                                const phoneMatches = phoneMatchesFor(customer.phone);
                                                return (<>
                                                    <input ref={customerPhoneRef} className="pinv-input" style={{ flexGrow: 1 }} placeholder="Phone No" value={customer.phone}
                                                        inputMode="numeric" maxLength={10}
                                                        role="combobox" aria-expanded={showPhoneDropdown} aria-controls="pos-phone-listbox-a4" aria-autocomplete="list"
                                                        onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 10); setCustomer({ ...customer, phone: v }); setShowPhoneDropdown(v.length > 0); setHighlightedPhoneIdx(-1); }}
                                                        onFocus={() => customer.phone.length > 0 && setShowPhoneDropdown(true)}
                                                        onBlur={() => { setTimeout(() => { setShowPhoneDropdown(false); setHighlightedPhoneIdx(-1); }, 200); handlePhoneLookup(); }}
                                                        onKeyDown={e => {
                                                            if (showPhoneDropdown && phoneMatches.length > 0) {
                                                                if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightedPhoneIdx(i => Math.min(i + 1, phoneMatches.length - 1)); return; }
                                                                if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightedPhoneIdx(i => Math.max(i - 1, -1)); return; }
                                                                if (e.key === 'Enter' && highlightedPhoneIdx >= 0) { e.preventDefault(); selectFarmer(phoneMatches[highlightedPhoneIdx]); return; }
                                                                if (e.key === 'Escape') { e.preventDefault(); setShowPhoneDropdown(false); setHighlightedPhoneIdx(-1); return; }
                                                            }
                                                            if (e.key === 'Enter' && !showPhoneDropdown) { e.preventDefault(); customerAddressRef.current?.focus(); }
                                                        }} />
                                                    {showPhoneDropdown && phoneMatches.length > 0 && (
                                                        <div id="pos-phone-listbox-a4" role="listbox" className="pinv-dropdown" style={{ width: '100%' }}>
                                                            {phoneMatches.map((r, ri) => (
                                                                <div key={r.id} role="option" aria-selected={ri === highlightedPhoneIdx} className="pinv-dropdown-item"
                                                                    style={{ background: ri === highlightedPhoneIdx ? '#e8f5e9' : undefined }}
                                                                    onMouseDown={() => selectFarmer(r)}>
                                                                    <div style={{ fontWeight: 600 }}>{r.number || <span style={{ fontStyle: 'italic' }}>No phone number</span>}</div>
                                                                    <div style={{ fontSize: '0.75rem', color: '#666' }}>{r.name || 'Unnamed'}{r.atPost ? ` • ${r.atPost}` : ''}</div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </>);
                                            })()}
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                                            <span className="pinv-label">{L('address')} :</span>
                                            <input ref={customerAddressRef} className="pinv-input" style={{ flexGrow: 1 }} placeholder={L('village_ph')} value={customer.address}
                                                onChange={e => setCustomer({ ...customer, address: e.target.value })}
                                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); customerPinRef.current?.focus(); } }} />
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                                            <span className="pinv-label">{L('pin')} :</span>
                                            <input ref={customerPinRef} className="pinv-input" style={{ flexGrow: 1 }} placeholder={L('pin')} value={customer.pin}
                                                onChange={e => setCustomer({ ...customer, pin: e.target.value })}
                                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); rowSearchRef.current?.focus(); } }} />
                                        </div>
                                    </div>
                                    <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '4px', alignItems: 'center' }}>
                                            <span className="pinv-label">{L('bill_no')} :</span>
                                            <span style={{ fontWeight: 700 }}>{nextBillNumber}</span>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '4px', alignItems: 'center' }}>
                                            <span className="pinv-label">{L('bill_date')} :</span>
                                            <input type="date" className="pinv-input" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '4px', alignItems: 'center' }}>
                                            <span className="pinv-label">{L('mode_of_payment')} :</span>
                                            <select className="pinv-input" value={modeOfPayment} onChange={e => setModeOfPayment(e.target.value)}>
                                                {['Cash', 'Credit'].map(m => <option key={m} value={m}>{m}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                {/* ITEMS TABLE */}
                                <div style={{ marginBottom: '10px', overflowX: 'auto' }}>
                                    <table className="pinv-table">
                                        <thead>
                                            <tr>
                                                <th style={{ width: '34px' }}>{L('sno')}</th>
                                                <th style={{ minWidth: '140px' }}>{L('item_description')}</th>
                                                <th style={{ width: '110px' }}>{L('company')}</th>
                                                <th style={{ width: '78px' }}>{L('batch_no')}</th>
                                                <th style={{ width: '62px' }}>{L('exp_date')}</th>
                                                <th style={{ width: '48px' }}>{L('per')}</th>
                                                <th style={{ width: '58px' }}>{L('qty')}</th>
                                                <th style={{ width: '68px' }}>{L('rate')}</th>
                                                <th style={{ width: '46px' }}>{L('gst_pct')}</th>
                                                <th style={{ width: '86px' }}>{L('gross_amount')}</th>
                                                {/* POS-only columns — Delete + Live Stock. The 2px left border marks
                                                    where the printable bill ends (at Amount); both are on-screen only
                                                    and never print (PosInvoicePreview omits them). */}
                                                <th style={{ width: '30px', borderLeft: '2px solid #333' }}></th>
                                                <th style={{ width: '50px', fontSize: '0.68rem', lineHeight: 1.1, whiteSpace: 'normal' }}>{L('live_stock')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {cart.map((item, idx) => (
                                                <tr key={item.id}>
                                                    <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                                                    <td style={{ fontWeight: 600 }}>{item.name}</td>
                                                    <td style={{ fontSize: '0.78rem' }}>{item.mfgCompany || ''}</td>
                                                    <td><input className="pinv-input" style={{ textAlign: 'center' }} value={rowMeta[item.id]?.batchNo ?? (item.batchNumber || '')}
                                                        onChange={e => setRowMeta(m => ({ ...m, [item.id]: { ...m[item.id], batchNo: e.target.value } }))} /></td>
                                                    <td><input type="text" className="pinv-input" style={{ textAlign: 'center', fontSize: '0.72rem', width: '100%' }} placeholder="MM/YY" value={toMonthYear(rowMeta[item.id]?.expDate ?? (item.expiryDate || ''))}
                                                        onChange={e => setRowMeta(m => ({ ...m, [item.id]: { ...m[item.id], expDate: fromMonthYear(e.target.value) } }))} /></td>
                                                    <td style={{ textAlign: 'center' }}>{item.unit || item.baseUnit}</td>
                                                    <td style={{ textAlign: 'center', fontWeight: 600 }}><input type="number" min="0" className="pinv-input" style={{ textAlign: 'center', fontWeight: 600 }} value={item.cartQuantity}
                                                        ref={el => { qtyRefs.current[item.id] = el; }}
                                                        onChange={e => setQty(item.id, Number(e.target.value))}
                                                        onWheel={e => e.currentTarget.blur()}
                                                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); rowSearchRef.current?.focus(); } }} /></td>
                                                    <td style={{ textAlign: 'center' }}><input type="number" min="0" className="pinv-input" style={{ textAlign: 'center' }} value={posSellingRate(item)}
                                                        onChange={e => setRate(item.id, Number(e.target.value))}
                                                        onWheel={e => e.currentTarget.blur()} /></td>
                                                    <td style={{ textAlign: 'center' }}><input type="number" className="pinv-input" style={{ textAlign: 'center' }} value={item.gstPct ?? 5}
                                                        onChange={e => setCart(prev => prev.map(c => c.id === item.id ? { ...c, gstPct: Number(e.target.value) } : c))}
                                                        onWheel={e => e.currentTarget.blur()} /></td>
                                                    <td style={{ textAlign: 'center', fontWeight: 600 }}>{item.cartTotal ? invFmt(item.cartTotal) : ''}</td>
                                                    <td style={{ textAlign: 'center', padding: '2px', borderLeft: '2px solid #333' }}>
                                                        <button onClick={() => removeCartItem(item.id)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#e53935', padding: '2px' }}>
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </td>
                                                    {(() => { const liveStock = remainingStockFor(item); return (
                                                        <td style={{ textAlign: 'center', fontWeight: 800, color: liveStock < 0 ? '#c62828' : '#2E7D32' }}>{liveStock}</td>
                                                    ); })()}
                                                </tr>
                                            ))}
                                            {/* Add-product search row */}
                                            <tr>
                                                <td style={{ textAlign: 'center', color: '#999' }}>{cart.length + 1}</td>
                                                <td colSpan={3} style={{ position: 'relative' }}>
                                                    {(() => {
                                                        const a4Filtered = products.filter(p => (p.name || '').toLowerCase().includes((rowSearch[cart.length] || '').toLowerCase()) || p.barcode === (rowSearch[cart.length] || '')).slice(0, 50);
                                                        return (<>
                                                            <input
                                                                ref={rowSearchRef}
                                                                className="pinv-input"
                                                                placeholder={L('search_product')}
                                                                value={rowSearch[cart.length] || ''}
                                                                onChange={e => { setRowSearch(s => ({ ...s, [cart.length]: e.target.value })); setActiveRowIndex(e.target.value.length > 0 ? cart.length : null); setHighlightedProductIdx(-1); }}
                                                                onFocus={() => (rowSearch[cart.length] || '').length > 0 && setActiveRowIndex(cart.length)}
                                                                onBlur={() => setTimeout(() => setActiveRowIndex(null), 200)}
                                                                onKeyDown={e => {
                                                                    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightedProductIdx(i => Math.min(i + 1, a4Filtered.length - 1)); }
                                                                    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightedProductIdx(i => Math.max(i - 1, -1)); }
                                                                    else if (e.key === 'Enter') {
                                                                        e.preventDefault();
                                                                        const pick = highlightedProductIdx >= 0 ? a4Filtered[highlightedProductIdx] : a4Filtered.length === 1 ? a4Filtered[0] : null;
                                                                        if (pick) { addToCart(pick); setRowSearch(s => ({ ...s, [cart.length]: '' })); setActiveRowIndex(null); setHighlightedProductIdx(-1); setTimeout(() => qtyRefs.current[pick.id]?.focus(), 50); }
                                                                    }
                                                                }}
                                                            />
                                                            {activeRowIndex === cart.length && (
                                                                <ProductSearchDropdown anchorRef={rowSearchRef}>
                                                                    {a4Filtered.map((p, pi) => (
                                                                        <div key={p.id} className="pinv-dropdown-item" style={{ background: pi === highlightedProductIdx ? '#e8f5e9' : undefined }}
                                                                            onMouseDown={() => { addToCart(p); setRowSearch(s => ({ ...s, [cart.length]: '' })); setActiveRowIndex(null); setHighlightedProductIdx(-1); setTimeout(() => qtyRefs.current[p.id]?.focus(), 50); }}>
                                                                            {p.name} <span style={{ color: '#888' }}>· ₹{posSellingRate(p)}</span>
                                                                        </div>
                                                                    ))}
                                                                    {products.filter(p => (p.name || '').toLowerCase().includes((rowSearch[cart.length] || '').toLowerCase())).length === 0 && (
                                                                        <div className="pinv-dropdown-item" onMouseDown={openAddProduct} style={{ color: 'var(--primary)' }}>
                                                                            + Add "{rowSearch[cart.length]}" to inventory
                                                                        </div>
                                                                    )}
                                                                </ProductSearchDropdown>
                                                            )}
                                                        </>);
                                                    })()}
                                                </td>
                                                {/* +1 colSpan vs. the bill columns to cover the POS-only Delete + Live Stock cells */}
                                                <td colSpan={8}></td>
                                            </tr>
                                            {/* Padding rows so the grid reads like a printed invoice */}
                                            {Array.from({ length: Math.max(0, (editingOrder ? EDIT_BILL_ROW_COUNT : FRESH_BILL_ROW_COUNT) - 1 - cart.length) }).map((_, i) => (
                                                <tr key={`pad-${i}`}>
                                                    <td style={{ textAlign: 'center', color: '#bbb' }}>{cart.length + 2 + i}</td>
                                                    <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
                                                </tr>
                                            ))}
                                            {/* TOTAL row */}
                                            <tr style={{ fontWeight: 700, background: '#f9f9f9' }}>
                                                <td colSpan={6} style={{ textAlign: 'right', paddingRight: '8px' }}>{L('total')}</td>
                                                <td style={{ textAlign: 'center' }}>{cartTotalQty}</td>
                                                <td></td>
                                                <td></td>
                                                <td style={{ textAlign: 'center' }}>{invFmt(cartSubtotal)}</td>
                                                <td style={{ borderLeft: '2px solid #333' }}></td>
                                                <td></td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>

                                {/* GST SUMMARY + NET AMOUNT */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0', marginBottom: '10px', border: '1px solid #222' }}>
                                    <div style={{ borderRight: '1px solid #222', padding: '8px' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                            <thead>
                                                <tr>
                                                    {[L('taxable'), `${L('cgst')} %`, L('gross_amount'), `${L('sgst')} %`, L('gross_amount'), L('total_tax')].map((h, hi) => (
                                                        <th key={hi} style={{ border: '1px solid #ccc', padding: '3px 5px', background: '#f2f2f2' }}>{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr>
                                                    <td style={{ border: '1px solid #ccc', padding: '3px 5px', textAlign: 'center' }}>{invFmt(computedTaxable)}</td>
                                                    <td style={{ border: '1px solid #ccc', padding: '3px 5px', textAlign: 'center' }}>2.5%</td>
                                                    <td style={{ border: '1px solid #ccc', padding: '3px 5px', textAlign: 'center' }}>{invFmt(totalCgst)}</td>
                                                    <td style={{ border: '1px solid #ccc', padding: '3px 5px', textAlign: 'center' }}>2.5%</td>
                                                    <td style={{ border: '1px solid #ccc', padding: '3px 5px', textAlign: 'center' }}>{invFmt(totalSgst)}</td>
                                                    <td style={{ border: '1px solid #ccc', padding: '3px 5px', textAlign: 'center' }}>{invFmt(totalTax)}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                    <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '0.82rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{L('output_cgst')}@2.5%</span><span>{invFmt(totalCgst)}</span></div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{L('output_sgst')}@2.5%</span><span>{invFmt(totalSgst)}</span></div>
                                        {(transportCharges > 0 || laborCharges > 0 || loyaltyDiscount > 0 || manualDiscount > 0) && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{L('bill_total')}</span><span>₹{cartSubtotal.toLocaleString('en-IN')}</span></div>
                                        )}
                                        {transportCharges > 0 && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{L('transport_charges')}</span><span>+{invFmt(transportCharges)}</span></div>
                                        )}
                                        {laborCharges > 0 && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{L('labor_charges')}</span><span>+{invFmt(laborCharges)}</span></div>
                                        )}
                                        {loyaltyDiscount > 0 && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#2E7D32' }}><span>{L('discount')} ({effectiveRedeemPoints} pts)</span><span>-₹{invFmt(loyaltyDiscount)}</span></div>
                                        )}
                                        {manualDiscount > 0 && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#2E7D32' }}><span>{L('discount')}</span><span>-₹{invFmt(manualDiscount)}</span></div>
                                        )}
                                        <div style={{ borderTop: '2px solid #111', marginTop: '4px', paddingTop: '4px', display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '1rem' }}>
                                            <span>{L('net_amount')}</span><span>₹{invNetAmount.toLocaleString('en-IN')}</span>
                                        </div>
                                        {isCreditBill && (
                                            <>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#10b981', marginTop: '3px' }}>
                                                    <span>{L('amount_paid')}</span><span>₹{effectiveCreditPaidNow.toLocaleString('en-IN')}</span>
                                                </div>
                                                <div style={{ borderTop: '1px solid #111', paddingTop: '3px', display: 'flex', justifyContent: 'space-between', fontWeight: 900, color: effectiveCreditAmount > 0 ? '#c62828' : '#10b981' }}>
                                                    <span>{L('credit_amount')}</span><span>₹{effectiveCreditAmount.toLocaleString('en-IN')}</span>
                                                </div>
                                            </>
                                        )}
                                        {customerOutstanding > 0 && (<>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#c62828', marginTop: '3px' }}>
                                                <span>{L('previous_outstanding')} (Dr)</span><span>₹{customerOutstanding.toLocaleString('en-IN')}</span>
                                            </div>
                                            <div style={{ borderTop: '1px solid #111', paddingTop: '3px', display: 'flex', justifyContent: 'space-between', fontWeight: 900 }}>
                                                <span>{L('total_payable')}</span><span>₹{(grandTotal + customerOutstanding).toLocaleString('en-IN')}</span>
                                            </div>
                                        </>)}
                                    </div>
                                </div>

                                {/* AMOUNT IN WORDS */}
                                <div style={{ border: '1px solid #222', marginBottom: '10px', display: 'grid', gridTemplateColumns: '100px 1fr', alignItems: 'stretch' }}>
                                    <div style={{ borderRight: '1px solid #222', padding: '6px', fontWeight: 700, display: 'flex', alignItems: 'center', fontSize: '0.82rem' }}>{L('amount_in_words')}</div>
                                    <div style={{ padding: '6px', fontWeight: 600, fontSize: '0.85rem', fontStyle: 'italic' }}>INR {numberToWords(grandTotal)}</div>
                                </div>

                                {/* Category intentionally omitted from printed invoice — tracked internally for analytics only */}

                                {/* DECLARATION + SIGNATURE */}
                                <div style={{ border: '1px solid #222', display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                                    <div style={{ borderRight: '1px solid #222', padding: '8px', fontSize: '0.75rem' }}>
                                        <div className="pinv-label" style={{ marginBottom: '3px' }}>{L('declaration')} :</div>
                                        <div style={{ color: '#444', lineHeight: '1.5' }}>
                                            {L('declaration_text')}
                                        </div>
                                    </div>
                                    <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                                        <div style={{ fontWeight: 700 }}>{L('for_business')} {branding?.businessName || 'Your Business Name'}</div>
                                        {branding?.signatureUrl && (
                                            <img src={branding.signatureUrl} alt="" style={{ height: '42px', maxWidth: '150px', objectFit: 'contain', marginTop: '4px' }} />
                                        )}
                                        <div style={{ borderTop: '1px solid #555', paddingTop: '4px', minWidth: '140px', textAlign: 'center', marginTop: branding?.signatureUrl ? '4px' : '28px' }}>
                                            {branding?.signatureName || L('authorised_signatory')}
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    </div>

                    {/* ── Loyalty redeem + action buttons (no-print) ─────────────────── */}
                    <div style={{ maxWidth: billFormat === 'A5' ? '960px' : '1040px', margin: '1rem auto 2.5rem' }}>
                        {loyaltyIsActive && customerLoyalty && customerLoyalty.points > 0 && (
                            <div style={{ background: 'hsla(45,93%,47%,0.08)', border: '1px solid hsla(45,93%,47%,0.2)', borderRadius: '10px', padding: '0.6rem 1rem', marginBottom: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Star size={16} color="var(--secondary-dark)" />
                                    <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{customerLoyalty.points} loyalty points available</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>Redeem</span>
                                    <input type="number" min={0} max={customerLoyalty.points} value={redeemPoints}
                                        onChange={e => {
                                            const raw = Math.min(Number(e.target.value), customerLoyalty.points);
                                            const minRedeem = loyaltyConfig?.minRedeemPoints || 0;
                                            setRedeemPoints(raw > 0 && raw < minRedeem ? 0 : raw);
                                        }}
                                        onWheel={e => e.currentTarget.blur()}
                                        style={{ width: '70px', border: '1px solid var(--surface-border)', borderRadius: '6px', padding: '0.2rem 0.4rem', fontSize: '0.85rem', background: 'var(--surface-raised)', color: 'var(--text-primary)' }} />
                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>pts</span>
                                </div>
                            </div>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {/* Other Options — Transport / Labor / Discount / Notes kept behind a
                                disclosure so the main billing screen stays compact. A dot marks
                                that at least one optional field is in use while collapsed. */}
                            <div>
                                <button
                                    type="button"
                                    onClick={() => setShowOtherOptions(v => !v)}
                                    aria-expanded={showOtherOptions}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderRadius: '8px', padding: '0.45rem 0.85rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                                    <ChevronRight size={16} style={{ transform: showOtherOptions ? 'rotate(90deg)' : 'none', transition: 'transform var(--transition-fast)' }} />
                                    {L('other_options')}
                                    {!showOtherOptions && (transportCharges > 0 || laborCharges > 0 || manualDiscount > 0 || billNote.trim()) && (
                                        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--primary)', display: 'inline-block' }} />
                                    )}
                                </button>
                            </div>
                            {showOtherOptions && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'var(--surface-base)', border: '1px solid var(--surface-border)', borderRadius: '10px', padding: '0.85rem 1rem' }}>
                                    {/* Transport Charges + Labor Charges + Discount */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <label style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{L('transport_charges')} (₹)</label>
                                            <input
                                                type="number"
                                                min={0}
                                                value={transportCharges || ''}
                                                onChange={e => setTransportCharges(Math.max(0, Number(e.target.value) || 0))}
                                                onWheel={e => e.currentTarget.blur()}
                                                placeholder="0"
                                                style={{ width: '110px', border: '1px solid var(--surface-border)', borderRadius: '8px', padding: '0.4rem 0.6rem', fontSize: '0.9rem', background: 'var(--surface-raised)', color: 'var(--text-primary)' }}
                                            />
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <label style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{L('labor_charges')} (₹)</label>
                                            <input
                                                type="number"
                                                min={0}
                                                value={laborCharges || ''}
                                                onChange={e => setLaborCharges(Math.max(0, Number(e.target.value) || 0))}
                                                onWheel={e => e.currentTarget.blur()}
                                                placeholder="0"
                                                style={{ width: '110px', border: '1px solid var(--surface-border)', borderRadius: '8px', padding: '0.4rem 0.6rem', fontSize: '0.9rem', background: 'var(--surface-raised)', color: 'var(--text-primary)' }}
                                            />
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <label style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{L('discount')} (₹)</label>
                                            <input
                                                type="number"
                                                min={0}
                                                value={manualDiscount || ''}
                                                onChange={e => setManualDiscount(Math.max(0, Number(e.target.value) || 0))}
                                                onWheel={e => e.currentTarget.blur()}
                                                placeholder="0"
                                                style={{ width: '110px', border: '1px solid var(--surface-border)', borderRadius: '8px', padding: '0.4rem 0.6rem', fontSize: '0.9rem', background: 'var(--surface-raised)', color: 'var(--text-primary)' }}
                                            />
                                        </div>
                                    </div>
                                    {/* Bill-level Notes — free-form, persisted with the invoice. */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                        <label style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{L('notes')}</label>
                                        <textarea
                                            value={billNote}
                                            onChange={e => setBillNote(e.target.value)}
                                            placeholder={L('notes_ph')}
                                            rows={2}
                                            style={{ width: '100%', border: '1px solid var(--surface-border)', borderRadius: '8px', padding: '0.5rem 0.7rem', fontSize: '0.9rem', background: 'var(--surface-raised)', color: 'var(--text-primary)', resize: 'vertical', fontFamily: 'inherit' }}
                                        />
                                    </div>
                                </div>
                            )}
                            {/* Partial Credit: Amount Paid Now (only shown for Credit bills) */}
                            {isCreditBill && (
                                <div style={{ background: 'hsla(220,70%,55%,0.07)', border: '1px solid hsla(220,70%,55%,0.2)', borderRadius: '10px', padding: '0.75rem 1rem' }}>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                        Payment Summary
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{L('amount_paid')} (₹)</label>
                                            <input
                                                type="number"
                                                min={0}
                                                max={grandTotal}
                                                value={creditPaidNow || ''}
                                                onChange={e => setCreditPaidNow(Math.max(0, Math.min(grandTotal, Number(e.target.value) || 0)))}
                                                onWheel={e => e.currentTarget.blur()}
                                                placeholder="0"
                                                style={{ width: '120px', border: '1px solid hsla(220,70%,55%,0.4)', borderRadius: '8px', padding: '0.4rem 0.6rem', fontSize: '0.9rem', background: 'var(--surface-raised)', color: 'var(--text-primary)' }}
                                            />
                                        </div>
                                        <div style={{ display: 'flex', gap: '1.25rem', fontSize: '0.88rem' }}>
                                            <span style={{ color: 'var(--text-secondary)' }}>
                                                Bill: <strong>₹{grandTotal.toLocaleString('en-IN')}</strong>
                                            </span>
                                            <span style={{ color: '#10b981' }}>
                                                Paid: <strong>₹{effectiveCreditPaidNow.toLocaleString('en-IN')}</strong>
                                            </span>
                                            <span style={{ color: effectiveCreditAmount > 0 ? '#ef4444' : '#10b981' }}>
                                                {L('credit_amount')}: <strong>₹{effectiveCreditAmount.toLocaleString('en-IN')}</strong>
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}
                            {/* Khata Integration — shown when credit amount > 0 */}
                            {isCreditBill && effectiveCreditAmount > 0 && (
                                <div style={{ background: 'hsla(30,90%,50%,0.07)', border: '1px solid hsla(30,90%,50%,0.25)', borderRadius: '10px', padding: '0.85rem 1rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.65rem' }}>
                                        <BookOpen size={15} style={{ color: '#f59e0b', flexShrink: 0 }} />
                                        <span style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Khata / Udhaari</span>
                                        <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>— outstanding will be added to customer's Khata account</span>
                                    </div>

                                    {/* Customer resolved from bill header */}
                                    {(customer.name || customer.phone) ? (
                                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
                                            <div>
                                                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                    <User size={13} style={{ color: '#f59e0b' }} />
                                                    {customer.name || 'Unnamed Customer'}
                                                    {customer.retailerId && (
                                                        <Link to={`/customers/${customer.retailerId}`} target="_blank"
                                                            style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--primary-light)', textDecoration: 'none', padding: '1px 6px', borderRadius: '8px', background: 'hsla(152,60%,40%,0.1)', border: '1px solid hsla(152,60%,40%,0.2)', whiteSpace: 'nowrap' }}>
                                                            View Profile ↗
                                                        </Link>
                                                    )}
                                                </div>
                                                {customer.phone && (
                                                    <div style={{ fontSize: '0.76rem', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.1rem' }}>
                                                        <Phone size={11} /> {customer.phone}
                                                    </div>
                                                )}
                                                {customerOutstanding > 0 ? (
                                                    <div style={{ fontSize: '0.75rem', color: '#f59e0b', marginTop: '0.2rem', fontWeight: 600 }}>
                                                        Current Khata balance: ₹{customerOutstanding.toLocaleString('en-IN')}
                                                    </div>
                                                ) : (
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '0.2rem' }}>
                                                        {farmers.some(f => {
                                                            const stored = (f.number ?? f.phone ?? '').replace(/\D/g, '');
                                                            const key = customer.phone.replace(/\D/g, '');
                                                            return key.length >= 6 && (stored === key || stored.slice(-10) === key.slice(-10));
                                                        }) ? 'Existing customer · no outstanding balance' : '✦ New customer — Khata account will be created'}
                                                    </div>
                                                )}
                                            </div>
                                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>Adding to Khata</div>
                                                <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#ef4444' }}>+₹{effectiveCreditAmount.toLocaleString('en-IN')}</div>
                                                {customerOutstanding > 0 && (
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                                        New total: ₹{(customerOutstanding + effectiveCreditAmount).toLocaleString('en-IN')}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem', padding: '0.5rem 0.6rem', background: 'hsla(38,92%,50%,0.1)', borderRadius: '8px', fontSize: '0.8rem', color: '#f59e0b', fontWeight: 600 }}>
                                            <AlertTriangle size={14} />
                                            Enter customer name or phone above to link this credit to their Khata account.
                                        </div>
                                    )}

                                    {/* Note — visible in Khata ledger */}
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '0.25rem' }}>Note for Khata record (optional)</label>
                                        <input
                                            className="input-field"
                                            placeholder="e.g. Seeds & fertilizer purchase on credit"
                                            value={khataNote}
                                            onChange={e => setKhataNote(e.target.value)}
                                            style={{ margin: 0, width: '100%', fontSize: '0.85rem' }}
                                        />
                                    </div>
                                </div>
                            )}
                            {/* Save + Print + To Pay */}
                            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                <button
                                    onClick={() => handleCheckout(modeOfPayment === 'Credit' ? 'Khata' : modeOfPayment)}
                                    disabled={isProcessing || cart.length === 0}
                                    className="btn"
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.75rem', fontSize: '1rem', borderRadius: '8px', background: '#1565C0', color: '#fff', border: 'none', cursor: isProcessing ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
                                    {isProcessing ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />} Save
                                </button>
                                <button
                                    onClick={() => {
                                        if (cart.length === 0) { showToast('Add items to the bill before printing.', 'error'); return; }
                                        triggerPrint();
                                    }}
                                    disabled={isProcessing}
                                    className="btn btn-secondary"
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.25rem', fontSize: '1rem', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>
                                    <Printer size={18} /> Print
                                </button>
                                <span style={{ marginLeft: 'auto', fontSize: '1.1rem', fontWeight: 800 }}>To Pay: <span style={{ color: 'var(--primary)' }}>₹{Math.round(grandTotal).toLocaleString('en-IN')}</span></span>
                            </div>
                        </div>
                    </div>
                </div>

            </div>

            {/* ── V-Pay Dialog ──────────────────────────────────────────────────────── */}
            {showVPayDialog && (
                <div style={{ position: 'fixed', inset: 0, background: 'hsla(220, 30%, 4%, 0.72)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', animation: 'fadeIn 0.18s ease-out' }}
                    onClick={() => setShowVPayDialog(false)}>
                    <div className="glass-panel" style={{ padding: '2rem', maxWidth: '340px', width: '100%', textAlign: 'center', borderRadius: '20px', animation: 'scaleUp 0.22s ease-out' }}
                        onClick={e => e.stopPropagation()}>
                        <h3 style={{ marginBottom: '1rem' }}>Scan to Pay</h3>
                        <UpiQrCode
                            upiId={branding?.upiId || ''}
                            payeeName={branding?.businessName || 'Store'}
                            amount={grandTotal}
                            size={200}
                        />
                        <p style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--primary)', margin: '1rem 0 0.5rem' }}>
                            ₹{Math.round(grandTotal).toLocaleString('en-IN')}
                        </p>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', marginBottom: '1.5rem' }}>Bill #{nextBillNumber}</p>
                        <button onClick={() => { setShowVPayDialog(false); handleCheckout('UPI'); }}
                            className="btn" style={{ background: 'var(--primary)', color: 'white', width: '100%', marginBottom: '0.5rem' }}>
                            <CheckCircle2 size={18} /> Mark as Paid
                        </button>
                        <button onClick={() => setShowVPayDialog(false)}
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', width: '100%', padding: '0.5rem' }}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* ── Cash Tender Dialog ────────────────────────────────────────────────── */}
            {showCashTenderDialog && (
                <div style={{ position: 'fixed', inset: 0, background: 'hsla(220, 30%, 4%, 0.72)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', animation: 'fadeIn 0.18s ease-out' }}
                    onClick={() => setShowCashTenderDialog(false)}>
                    <div className="glass-panel" style={{ padding: '2rem', maxWidth: '380px', width: '100%', borderRadius: '20px', animation: 'scaleUp 0.22s ease-out' }}
                        onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <h3 style={{ margin: 0 }}>Cash Tender</h3>
                            <button onClick={() => setShowCashTenderDialog(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}><X size={20} /></button>
                        </div>

                        <div style={{ background: 'var(--surface-raised)', borderRadius: '12px', padding: '1rem', marginBottom: '1rem', textAlign: 'center' }}>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Bill Total</p>
                            <p style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800, color: 'var(--primary)' }}>₹{Math.round(grandTotal).toLocaleString('en-IN')}</p>
                        </div>

                        <p style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Quick denominations</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                            {DENOMINATIONS.map(d => (
                                <button key={d} onClick={() => setCashTenderAmount(d)}
                                    style={{ padding: '0.4rem 0.75rem', borderRadius: '8px', border: '1px solid var(--surface-border)', background: cashTenderAmount === d ? 'var(--primary)' : 'var(--surface-raised)', color: cashTenderAmount === d ? 'white' : 'var(--text-primary)', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', transition: 'all var(--transition-fast)' }}>
                                    ₹{d}
                                </button>
                            ))}
                            <button onClick={() => setCashTenderAmount(grandTotal)}
                                style={{ padding: '0.4rem 0.75rem', borderRadius: '8px', border: '1px solid var(--surface-border)', background: cashTenderAmount === grandTotal ? 'var(--primary)' : 'var(--surface-raised)', color: cashTenderAmount === grandTotal ? 'white' : 'var(--text-primary)', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', transition: 'all var(--transition-fast)' }}>
                                Exact
                            </button>
                        </div>

                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem', display: 'block', color: 'var(--text-secondary)' }}>Cash Received</label>
                            <input
                                type="number"
                                value={cashTenderAmount || ''}
                                onChange={e => setCashTenderAmount(Number(e.target.value))}
                                onWheel={e => e.currentTarget.blur()}
                                placeholder="Enter amount"
                                className="input-field"
                                style={{ fontSize: '1.1rem', fontWeight: 700 }}
                                autoFocus
                            />
                        </div>

                        {cashTenderAmount > 0 && (
                            <div style={{ background: cashTenderAmount >= grandTotal ? 'hsla(142, 60%, 35%, 0.12)' : 'hsla(0, 84%, 55%, 0.12)', borderRadius: '10px', padding: '0.75rem 1rem', marginBottom: '1rem', textAlign: 'center' }}>
                                <p style={{ margin: 0, fontWeight: 700, color: cashTenderAmount >= grandTotal ? 'var(--success)' : 'var(--danger)' }}>
                                    {cashTenderAmount >= grandTotal
                                        ? `Change: ₹${Math.round(cashTenderAmount - grandTotal)}`
                                        : `Short by ₹${Math.round(grandTotal - cashTenderAmount)}`}
                                </p>
                            </div>
                        )}

                        <button
                            onClick={() => { setShowCashTenderDialog(false); handleCheckout('Cash', { cashReceived: cashTenderAmount }); }}
                            disabled={cashTenderAmount < grandTotal || isProcessing}
                            className="btn"
                            style={{ background: 'var(--primary)', color: 'white', width: '100%', opacity: cashTenderAmount < grandTotal ? 0.5 : 1 }}>
                            <CheckCircle2 size={18} /> Complete Sale
                        </button>
                    </div>
                </div>
            )}

            {/* ── Split Payment Dialog ──────────────────────────────────────────────── */}
            {showSplitDialog && (
                <div style={{ position: 'fixed', inset: 0, background: 'hsla(220, 30%, 4%, 0.72)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', animation: 'fadeIn 0.18s ease-out' }}
                    onClick={() => setShowSplitDialog(false)}>
                    <div className="glass-panel" style={{ padding: '2rem', maxWidth: '400px', width: '100%', borderRadius: '20px', animation: 'scaleUp 0.22s ease-out' }}
                        onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <h3 style={{ margin: 0 }}>Split Payment</h3>
                            <button onClick={() => setShowSplitDialog(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}><X size={20} /></button>
                        </div>

                        <div style={{ background: 'var(--surface-raised)', borderRadius: '12px', padding: '0.75rem 1rem', marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Bill Total</span>
                            <span style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '1.15rem' }}>₹{Math.round(grandTotal)}</span>
                        </div>

                        {splits.map((sp, i) => (
                            <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.6rem', alignItems: 'center' }}>
                                <select value={sp.method} onChange={e => setSplits(prev => prev.map((s, idx) => idx === i ? { ...s, method: e.target.value } : s))}
                                    style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--surface-border)', fontSize: '0.9rem', background: 'var(--surface-raised)', color: 'var(--text-primary)' }}>
                                    {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                                <input type="number" value={sp.amount || ''} onChange={e => setSplits(prev => prev.map((s, idx) => idx === i ? { ...s, amount: Number(e.target.value) } : s))}
                                    onWheel={e => e.currentTarget.blur()}
                                    placeholder="₹0"
                                    style={{ width: '90px', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--surface-border)', fontSize: '0.9rem', fontWeight: 700, background: 'var(--surface-raised)', color: 'var(--text-primary)' }} />
                                {splits.length > 1 && (
                                    <button onClick={() => setSplits(prev => prev.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}>
                                        <Trash2 size={16} />
                                    </button>
                                )}
                            </div>
                        ))}

                        {splits.length < 4 && (
                            <button onClick={() => setSplits(prev => [...prev, { method: 'UPI', amount: 0 }])}
                                style={{ background: 'transparent', border: '1px dashed var(--surface-border)', borderRadius: '8px', padding: '0.4rem 1rem', cursor: 'pointer', color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '0.85rem', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                <Plus size={14} /> Add Payment Mode
                            </button>
                        )}

                        <div style={{ background: splitRemaining === 0 ? 'hsla(142, 60%, 35%, 0.12)' : splitRemaining < 0 ? 'hsla(0, 84%, 55%, 0.12)' : 'var(--surface-raised)', borderRadius: '10px', padding: '0.6rem 1rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Remaining</span>
                            <span style={{ fontWeight: 800, color: splitRemaining === 0 ? 'var(--success)' : splitRemaining < 0 ? 'var(--danger)' : 'var(--text-primary)' }}>
                                ₹{Math.round(Math.abs(splitRemaining))} {splitRemaining < 0 ? '(over)' : ''}
                            </span>
                        </div>

                        <button
                            onClick={() => { setShowSplitDialog(false); handleCheckout('Split', { splits }); }}
                            disabled={Math.abs(splitRemaining) > 0.5 || isProcessing}
                            className="btn"
                            style={{ background: 'var(--primary)', color: 'white', width: '100%', opacity: Math.abs(splitRemaining) > 0.5 ? 0.5 : 1 }}>
                            <CheckCircle2 size={18} /> Confirm Payment
                        </button>
                    </div>
                </div>
            )}


            {/* ── Quick Add / Edit Product ─────────────────────────────────────────── */}
            {showProductModal && tenantId && (
                <QuickProductModal
                    tenantId={tenantId}
                    product={editingProduct}
                    defaultName=""
                    products={products}
                    onClose={() => { setShowProductModal(false); setEditingProduct(null); }}
                />
            )}

        </div>} {/* end billing tab */}
        </> /* end module fragment */
    );
}

// ── Quick Add / Edit Product ────────────────────────────────────────────────
// A lightweight inventory form so the counter can add a missing product or fix a
// price without leaving billing. Full pricing (box-level, PTR, image, etc.) stays
// on the Inventory page; this writes the same `products` collection.
interface QuickProductModalProps {
    tenantId: string;
    product: Product | null;
    defaultName: string;
    products: Product[];
    onClose: () => void;
}

function QuickProductModal({ tenantId, product, defaultName, products, onClose }: QuickProductModalProps) {
    const nextSku = () => {
        let max = 0;
        products.forEach(p => {
            const m = /^KA-(\d+)$/i.exec(((p as any).productNumber || '').trim());
            if (m) max = Math.max(max, parseInt(m[1], 10));
        });
        return `KA-${String(max + 1).padStart(3, '0')}`;
    };

    const [form, setForm] = useState({
        name: product?.name ?? defaultName ?? '',
        type: product?.type || '',
        sellingPrice: product?.sellingPrice || product?.maxRetailPrice || 0,
        maxRetailPrice: product?.maxRetailPrice || 0,
        purchasePrice: product?.purchasePrice || 0,
        quantity: product?.quantity || 0,
        loosePieces: product?.loosePieces || 0,
        boxCapacity: product?.boxCapacity || 1,
        baseUnit: (product?.baseUnit as string) || 'pcs',
        gstPct: product?.gstPct ?? 5,
    });
    const [saving, setSaving] = useState(false);
    const set = (patch: Partial<typeof form>) => setForm(prev => ({ ...prev, ...patch }));

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.name.trim()) return;
        setSaving(true);
        try {
            const margin = form.maxRetailPrice > 0
                ? `${Math.round(((form.maxRetailPrice - form.purchasePrice) / form.maxRetailPrice) * 100)}%`
                : 'N/A';
            const data: any = {
                name: form.name.trim(),
                type: form.type,
                sellingPrice: form.sellingPrice,
                maxRetailPrice: form.maxRetailPrice || form.sellingPrice,
                retailerPrice: product?.retailerPrice ?? form.sellingPrice,
                purchasePrice: form.purchasePrice,
                quantity: form.quantity,
                loosePieces: form.loosePieces,
                boxCapacity: form.boxCapacity || 1,
                baseUnit: form.baseUnit,
                gstPct: form.gstPct,
                margin,
                updatedAt: serverTimestamp(),
            };
            if (product) {
                await updateDoc(getTenantDoc(db, tenantId, 'products', product.id), data);
            } else {
                await addDoc(getTenantCollection(db, tenantId, 'products'), {
                    ...data,
                    productNumber: nextSku(),
                    category: 'B2B',
                    createdAt: serverTimestamp(),
                });
            }
            onClose();
        } catch (err) {
            console.error('Failed to save product', err);
            alert('Could not save the product. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const labelStyle: React.CSSProperties = { fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem', display: 'block' };
    const fieldStyle: React.CSSProperties = { width: '100%', padding: '0.5rem 0.6rem', borderRadius: '8px', border: '1px solid var(--surface-border)', fontSize: '0.9rem', boxSizing: 'border-box', background: 'var(--surface-raised)', color: 'var(--text-primary)' };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'hsla(220, 30%, 4%, 0.72)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', animation: 'fadeIn 0.18s ease-out' }}
            onClick={onClose}>
            <form onSubmit={handleSave} onClick={e => e.stopPropagation()} className="glass-panel themed-scroll"
                style={{ padding: '1.5rem', maxWidth: '460px', width: '100%', maxHeight: '90vh', overflowY: 'auto', borderRadius: '18px', animation: 'scaleUp 0.22s ease-out' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {product ? <Pencil size={18} /> : <Plus size={18} />} {product ? 'Edit Product' : 'Add Product'}
                    </h3>
                    <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}><X size={20} /></button>
                </div>

                <div style={{ marginBottom: '0.9rem' }}>
                    <label style={labelStyle}>Product Name *</label>
                    <input required autoFocus value={form.name} onChange={e => set({ name: e.target.value })} placeholder="e.g. Power Plus 5000 ML" style={fieldStyle} />
                </div>

                <div style={{ marginBottom: '0.9rem' }}>
                    <label style={labelStyle}>Category</label>
                    <select value={form.type} onChange={e => set({ type: e.target.value })} style={fieldStyle}>
                        <option value="">— Select category —</option>
                        {AGRI_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.9rem' }}>
                    <div>
                        <label style={labelStyle}>Selling Price (₹) *</label>
                        <input required type="number" min="0" step="0.01" value={form.sellingPrice || ''} onChange={e => set({ sellingPrice: Number(e.target.value) })} onWheel={e => e.currentTarget.blur()} placeholder="0.00" style={fieldStyle} />
                    </div>
                    <div>
                        <label style={labelStyle}>MRP (₹)</label>
                        <input type="number" min="0" step="0.01" value={form.maxRetailPrice || ''} onChange={e => set({ maxRetailPrice: Number(e.target.value) })} onWheel={e => e.currentTarget.blur()} placeholder="0.00" style={fieldStyle} />
                    </div>
                    <div>
                        <label style={labelStyle}>Purchase Rate (₹)</label>
                        <input type="number" min="0" step="0.01" value={form.purchasePrice || ''} onChange={e => set({ purchasePrice: Number(e.target.value) })} onWheel={e => e.currentTarget.blur()} placeholder="0.00" style={fieldStyle} />
                    </div>
                    <div>
                        <label style={labelStyle}>GST %</label>
                        <input type="number" min="0" value={form.gstPct} onChange={e => set({ gstPct: Number(e.target.value) })} onWheel={e => e.currentTarget.blur()} style={fieldStyle} />
                    </div>
                    <div>
                        <label style={labelStyle}>Stock (Boxes)</label>
                        <input type="number" min="0" value={form.quantity} onChange={e => set({ quantity: Number(e.target.value) })} onWheel={e => e.currentTarget.blur()} style={fieldStyle} />
                    </div>
                    <div>
                        <label style={labelStyle}>Loose Pieces</label>
                        <input type="number" min="0" value={form.loosePieces} onChange={e => set({ loosePieces: Number(e.target.value) })} onWheel={e => e.currentTarget.blur()} style={fieldStyle} />
                    </div>
                    <div>
                        <label style={labelStyle}>Pcs / Box</label>
                        <input type="number" min="1" value={form.boxCapacity} onChange={e => set({ boxCapacity: Number(e.target.value) })} onWheel={e => e.currentTarget.blur()} style={fieldStyle} />
                    </div>
                    <div>
                        <label style={labelStyle}>Unit</label>
                        <select value={form.baseUnit} onChange={e => set({ baseUnit: e.target.value })} style={fieldStyle}>
                            <option value="pcs">Pieces (pcs)</option>
                            <option value="ltr">Liters (ltr)</option>
                            <option value="kg">Kilograms (kg)</option>
                            <option value="g">Grams (g)</option>
                            <option value="ml">Milliliters (ml)</option>
                        </select>
                    </div>
                </div>

                <button type="submit" disabled={saving} className="btn" style={{ background: 'var(--primary)', color: 'white', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', opacity: saving ? 0.6 : 1 }}>
                    {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                    {product ? 'Save Changes' : 'Add to Inventory'}
                </button>
            </form>
        </div>
    );
}
