import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
// 'Link' was only used by the Returns quick-access link, now disabled below (2026-07-03).
// import { Link } from 'react-router-dom';
import {
    Save, Loader2, Printer, Search, ShoppingCart, Plus, Minus, Trash2,
    CreditCard, Banknote, History, ExternalLink, Target, Pencil,
    Zap, CheckCircle2, ChevronRight, X, Phone, User, QrCode, Package,
    // RotateCcw removed — was only used by the Returns quick-access link, now disabled below (2026-07-03).
    Star, Smartphone, Columns, PlusCircle, FileText,
} from 'lucide-react';
import UpiQrCode from '../components/UpiQrCode';
import ModuleGate from '../components/ModuleGate';
import {
    query, onSnapshot, addDoc, doc, writeBatch,
    serverTimestamp, updateDoc,
    runTransaction, getDoc, getDocs, limit, orderBy, where, collection, increment,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { getTenantCollection, getTenantDoc } from '../utils/tenantPath';
import { resolveDateRange, DATE_RANGE_PERIODS, type DateRangePeriod } from '../utils/dateRanges';
import { AGRI_CATEGORIES } from '../utils/constants';
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
    address: string;
    pin: string;
}

interface BillTab {
    id: string;
    label: string;
    cart: CartItem[];
    customer: CustomerState;
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

// salesOrders is shared by several modules (B2B Invoice, Quotations, Sales
// Order, Retailer Portal self-serve, POS). Only POS's generateBillNumber()
// (and the legacy pre-writeBatch POS form it replaced) ever produces the
// "KA-####" orderNumber format — every other writer uses its own counter and
// prefix (SIPL/…, SO-YYYY-####, ORD-######). This is the one reliable,
// already-existing signal for "this salesOrders doc came from POS Billing."
function isPosOrder(order: any): boolean {
    return typeof order?.orderNumber === 'string' && /^KA-\d+$/i.test(order.orderNumber.trim());
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

// Number to Words (Indian system) — ported from B2BInvoicePage so the POS
// GST invoice can print "Amount in Words" identically to the B2B invoice.
function numberToWords(num: number): string {
    if (!num || num < 0) return 'Zero only';
    if (num === 0) return 'Zero only';
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
        'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
        'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const convert = (n: number): string => {
        if (n < 20) return ones[n];
        if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
        if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + convert(n % 100) : '');
        if (n < 100000) return convert(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + convert(n % 1000) : '');
        if (n < 10000000) return convert(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + convert(n % 100000) : '');
        return convert(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + convert(n % 10000000) : '');
    };
    const intPart = Math.floor(num);
    const decPart = Math.round((num - intPart) * 100);
    let result = convert(intPart);
    if (decPart > 0) result += ' and ' + convert(decPart) + ' Paise';
    return result + ' only';
}

export default function POSPage() {
    const { t, i18n } = useTranslation();
    const [searchParams] = useSearchParams();
    const { tenantId, hasModule } = useAuth();
    const { showToast } = useToast();
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);

    // View States
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');
    const searchRef = useRef<HTMLInputElement>(null);

    // Quick add/edit product — manage inventory inline without leaving the POS
    const [showProductModal, setShowProductModal] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);

    const openAddProduct = () => { setEditingProduct(null); setShowProductModal(true); };
    const openEditProduct = (product: Product) => { setEditingProduct(product); setShowProductModal(true); };

    // ── Multi-bill tabs ─────────────────────────────────────────────────────
    const [billTabs, setBillTabs] = useState<BillTab[]>([{
        id: 'tab1', label: 'Bill 1', cart: [], customer: defaultCustomer(),
    }]);
    const [activeTabId, setActiveTabId] = useState('tab1');

    const activeTab = billTabs.find(t => t.id === activeTabId) ?? billTabs[0];
    const cart = activeTab.cart;
    const customer = activeTab.customer;

    const updateActiveTab = useCallback((patch: Partial<Pick<BillTab, 'cart' | 'customer'>>) => {
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

    const addTab = () => {
        if (billTabs.length >= 5) return;
        const newId = `tab${Date.now()}`;
        setBillTabs(prev => [...prev, { id: newId, label: `Bill ${prev.length + 1}`, cart: [], customer: defaultCustomer() }]);
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
    const [billFormat, setBillFormat] = useState<BillFormat>('A4');
    // Language the *printed bill* is rendered in — independent of the app UI
    // language, so the counter can hand a Marathi bill to a farmer while the
    // operator keeps the app in English. All three locales are bundled at init
    // (src/i18n.ts), so `{ lng }` resolves synchronously.
    const [billLang, setBillLang] = useState<string>((i18n.language || 'en').split('-')[0]);
    const L = (key: string): string => t(`pos_bill.${key}`, { lng: billLang }) as string;
    const today = new Date().toISOString().split('T')[0];
    const [invoiceDate, setInvoiceDate] = useState<string>(today);
    // Mode shown on the invoice; also decides which checkout path "Save & Print" takes.
    const [modeOfPayment, setModeOfPayment] = useState<string>('Cash');
    // Farmers (counter customers) — POS saves walk-ins into `retailers` tagged
    // channel:'pos', so we read from the same collection and prefer those records
    // for the name-autofill dropdown (mirrors B2B's retailer dropdown).
    const [farmers, setFarmers] = useState<any[]>([]);
    const [showFarmerDropdown, setShowFarmerDropdown] = useState(false);
    // Which item row's product-search dropdown is open.
    const [activeRowIndex, setActiveRowIndex] = useState<number | null>(null);
    // Text typed into the "add product" search rows, keyed by visual row index.
    const [rowSearch, setRowSearch] = useState<Record<number, string>>({});
    // Optional per-line batch / expiry (display + print only; not persisted so the
    // checkout schema stays untouched). Keyed by cart item id.
    const [rowMeta, setRowMeta] = useState<Record<string, { batchNo?: string; expDate?: string }>>({});
    // Khata (credit) balance carried by the matched farmer, so this bill can show
    // what they already owe. Populated by the phone lookup / name dropdown.
    const [customerOutstanding, setCustomerOutstanding] = useState(0);
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

    // ── V-Checkout pending sessions ──────────────────────────────────────────
    const [vcheckoutSessions, setVcheckoutSessions] = useState<any[]>([]);
    const [showVCheckoutPanel, setShowVCheckoutPanel] = useState(false);
    const [vCheckoutSessionUrl, setVCheckoutSessionUrl] = useState('');
    const [showVCheckoutQr, setShowVCheckoutQr] = useState(false);

    // ── Loyalty display ──────────────────────────────────────────────────────
    const [customerLoyalty, setCustomerLoyalty] = useState<any>(null);
    const [redeemPoints, setRedeemPoints] = useState(0);

    // ── Insights panel (read-only; does not affect billing/checkout) ────────
    const [showInsightsPanel, setShowInsightsPanel] = useState(false);
    const [insightsTab, setInsightsTab] = useState<'bills' | 'customer' | 'today'>('bills');
    const [recentOrders, setRecentOrders] = useState<any[]>([]);
    const [customerRetailerDoc, setCustomerRetailerDoc] = useState<any>(null);
    const [reprintOrder, setReprintOrder] = useState<any>(null);

    // Operations Analytics ("Today" tab) — period selector + the orders it resolves to.
    const [analyticsPeriod, setAnalyticsPeriod] = useState<DateRangePeriod>('today');
    const [analyticsCustomDate, setAnalyticsCustomDate] = useState('');
    const [analyticsCustomFrom, setAnalyticsCustomFrom] = useState('');
    const [analyticsCustomTo, setAnalyticsCustomTo] = useState('');
    const [periodOrders, setPeriodOrders] = useState<any[]>([]);

    useEffect(() => {
        if (!tenantId) return;

        const unsubProducts = onSnapshot(query(getTenantCollection(db, tenantId, 'products')), (snap) => {
            const productsList = snap.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
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

        // V-Checkout pending sessions
        let unsubVCheckout: (() => void) | undefined;
        if (hasModule('vcheckout')) {
            unsubVCheckout = onSnapshot(
                query(
                    getTenantCollection(db, tenantId, 'vcheckoutSessions'),
                    where('status', '==', 'submitted'),
                    orderBy('createdAt', 'desc'),
                ),
                (snap) => setVcheckoutSessions(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
            );
        }

        return () => {
            unsubProducts();
            unsubFarmers();
            if (unsubVCheckout) unsubVCheckout();
        };
    }, [tenantId, hasModule]);

    // ── Hand-off from the Khata screen ──────────────────────────────────────
    // ?name/phone/address/pin  → prefill the buyer for a new bill
    // ?reprintOrderId=<id>     → reprint an existing bill
    // ?orderId=<id>            → load a bill for correction
    // Runs once products have loaded so line items can resolve to real products.
    const handledParamsRef = useRef(false);
    useEffect(() => {
        if (!tenantId || handledParamsRef.current) return;

        const name = searchParams.get('name');
        const phone = searchParams.get('phone');
        const reprintId = searchParams.get('reprintOrderId');
        const editId = searchParams.get('orderId');

        // Buyer prefill needs nothing else loaded.
        if (!reprintId && !editId && (name || phone)) {
            handledParamsRef.current = true;
            setCustomer({
                name: name || '',
                phone: phone || '',
                address: searchParams.get('address') || '',
                pin: searchParams.get('pin') || '',
            });
            return;
        }

        if (!reprintId && !editId) return;
        // Editing needs the catalog so saved line items map back onto products.
        if (editId && products.length === 0) return;
        handledParamsRef.current = true;

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
                setEditingOrder(order);
            } catch (err) {
                console.error('Failed to load bill from Khata:', err);
                showToast('Could not open that bill.', 'error');
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tenantId, products, searchParams]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'F2' || e.key === '/') {
                e.preventDefault();
                searchRef.current?.focus();
            }
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

    // ── Insights panel data — read-only listeners, isolated from checkout ───
    // Recent Bills: latest 50 orders, reused for both the bill list and (client-
    // filtered) the selected customer's purchase history/favourites.
    useEffect(() => {
        if (!tenantId || !showInsightsPanel) return;
        const unsub = onSnapshot(
            query(getTenantCollection(db, tenantId, 'salesOrders'), orderBy('createdAt', 'desc'), limit(50)),
            (snap) => setRecentOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(isPosOrder)),
            () => setRecentOrders([]),
        );
        return () => unsub();
    }, [tenantId, showInsightsPanel]);

    // Operations Analytics ("Today" tab): date-scoped query so totals stay
    // accurate even past the 50-doc window the Recent Bills list uses. Scope
    // follows the selected period (defaults to today, preserving prior behavior).
    useEffect(() => {
        if (!tenantId || !showInsightsPanel) return;
        const { start, end } = resolveDateRange(analyticsPeriod, analyticsCustomDate, analyticsCustomFrom, analyticsCustomTo);
        const col = getTenantCollection(db, tenantId, 'salesOrders');
        const q = start
            ? query(col, where('createdAt', '>=', start), where('createdAt', '<=', end))
            : query(col, where('createdAt', '<=', end));
        const unsub = onSnapshot(
            q,
            (snap) => setPeriodOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(isPosOrder)),
            () => setPeriodOrders([]),
        );
        return () => unsub();
    }, [tenantId, showInsightsPanel, analyticsPeriod, analyticsCustomDate, analyticsCustomFrom, analyticsCustomTo]);

    // Selected customer's retailer record (outstanding balance) for the panel only —
    // independent of handlePhoneLookup, which drives autofill at checkout time.
    useEffect(() => {
        if (!tenantId || !showInsightsPanel || customer.phone.length < 5) {
            setCustomerRetailerDoc(null);
            return;
        }
        let cancelled = false;
        getDocs(query(getTenantCollection(db, tenantId, 'retailers'), where('number', '==', customer.phone), limit(1)))
            .then(snap => { if (!cancelled) setCustomerRetailerDoc(snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() }); })
            .catch(() => { if (!cancelled) setCustomerRetailerDoc(null); });
        return () => { cancelled = true; };
    }, [tenantId, showInsightsPanel, customer.phone]);

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
    const loyaltyIsActive = isLoyaltyActive(hasModule('loyalty'), loyaltyConfig);
    // If loyalty was switched off after points were already staged for redemption,
    // the discount must not apply — no partial/stale redemption should reach checkout.
    const effectiveRedeemPoints = loyaltyIsActive ? redeemPoints : 0;
    const loyaltyDiscount = effectiveRedeemPoints * ((loyaltyConfig?.pointsValue) || 0.1);
    const grandTotal = Math.max(0, cartSubtotal - loyaltyDiscount);

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
    const invNetAmount = Math.round(computedTaxable + totalTax - loyaltyDiscount);
    const invFmt = (n: number) => (Number.isFinite(n) ? n : 0).toFixed(2);

    // Tracks which phone number (if any) the currently-displayed name/address/pin
    // were auto-populated from, so a lookup miss only clears fields *we* set —
    // never text the cashier typed in manually for a genuine new walk-in.
    const lastMatchedPhoneRef = useRef<string | null>(null);

    const handlePhoneLookup = async () => {
        if (!tenantId) return;
        const key = phoneKey(customer.phone);
        // Only attempt once enough digits are in to identify someone.
        if (key.length < 6) return;
        // Match against the farmers already streamed in for the name dropdown —
        // instant, and tolerant of how the number was stored.
        const match = farmers.find(f => {
            const stored = phoneKey(f.number ?? f.phone);
            if (!stored) return false;
            return stored === key || stored.slice(-10) === key.slice(-10);
        });
        if (match) {
            lastMatchedPhoneRef.current = customer.phone;
            setCustomer({
                ...customer,
                name: match.name ?? customer.name,
                address: match.atPost ?? customer.address ?? '',
                pin: match.pin ?? customer.pin ?? '',
            });
            setCustomerOutstanding(Number(match.outstandingAmount) || 0);
        } else if (lastMatchedPhoneRef.current !== null && lastMatchedPhoneRef.current !== customer.phone) {
            // The number that produced this auto-fill no longer matches (edited/changed) —
            // revert to a clean walk-in state instead of leaving the stale match displayed.
            lastMatchedPhoneRef.current = null;
            setCustomer({ ...customer, name: '', address: '', pin: '' });
            setCustomerOutstanding(0);
        }
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
            const billNumber = await generateBillNumber();
            const orderData: any = {
                orderNumber: billNumber,
                retailerName: customer.name || 'Walk-in Customer',
                phoneNumber: customer.phone,
                address: customer.address,
                pin: customer.pin,
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
                discount: loyaltyDiscount,
                grandTotal,
                paymentStatus: paymentMethod === 'Khata' ? 'Pending' : 'Paid',
                paymentMethod,
                paymentSplits: options?.splits ?? [],
                cashReceived: options?.cashReceived ?? null,
                changeGiven: options?.cashReceived ? Math.max(0, options.cashReceived - grandTotal) : 0,
                loyaltyPointsRedeemed: options?.loyaltyPointsRedeemed ?? effectiveRedeemPoints,
                amountPaid: paymentMethod === 'Khata' ? 0 : grandTotal,
                // Balance the customer carried into this bill, and the running total
                // including it — mirrors the B2B invoice's previousBalance/netBalance.
                previousBalance: customerOutstanding,
                netBalance: grandTotal + customerOutstanding,
                status: 'delivered',
                createdAt: serverTimestamp(),
                invoiceDate: new Date().toISOString().split('T')[0],
            };

            // Persist the bill and deduct stock atomically in one batch — a
            // half-saved sale can never leave inventory inconsistent.
            const batch = writeBatch(db);
            const soRef = doc(getTenantCollection(db, tenantId, 'salesOrders'));
            batch.set(soRef, orderData);

            // Correcting a bill returns the original's stock in this same batch, so
            // the net movement is (new bill − old bill) rather than a second full
            // decrement. Netted per product first: two updates to the same doc in
            // one batch would silently drop the earlier one.
            const returned = new Map<string, number>();
            if (editingOrder) {
                for (const li of (editingOrder.lineItems || [])) {
                    if (!li.productId) continue;
                    returned.set(li.productId, (returned.get(li.productId) || 0) + (Number(li.quantity) || 0));
                }
            }

            for (const item of cart) {
                const giveBack = returned.get(item.id) || 0;
                returned.delete(item.id);
                const cap = item.boxCapacity || 1;
                let newLoose = (item.loosePieces || 0) - item.cartQuantity + giveBack;
                let newBoxes = item.quantity || 0;
                while (newLoose < 0 && newBoxes > 0) {
                    newBoxes -= 1;
                    newLoose += cap;
                }
                // Roll any surplus loose pieces back up into whole boxes.
                if (cap > 1 && newLoose >= cap) {
                    newBoxes += Math.floor(newLoose / cap);
                    newLoose = newLoose % cap;
                }
                // Never write negative stock — you can't sell what isn't there.
                batch.update(getTenantDoc(db, tenantId, 'products', item.id), {
                    quantity: Math.max(0, newBoxes),
                    loosePieces: Math.max(0, newLoose),
                    updatedAt: serverTimestamp(),
                });
            }

            // Anything on the original bill that isn't on the corrected one goes
            // straight back to stock.
            for (const [pid, qty] of returned.entries()) {
                const prod = products.find(p => p.id === pid);
                if (!prod || qty <= 0) continue;
                const cap = prod.boxCapacity || 1;
                let loose = (prod.loosePieces || 0) + qty;
                let boxes = prod.quantity || 0;
                if (cap > 1 && loose >= cap) {
                    boxes += Math.floor(loose / cap);
                    loose = loose % cap;
                }
                batch.update(getTenantDoc(db, tenantId, 'products', pid), {
                    quantity: Math.max(0, boxes),
                    loosePieces: Math.max(0, loose),
                    updatedAt: serverTimestamp(),
                });
            }

            // Retire the bill being corrected, pointing at its replacement.
            if (editingOrder) {
                batch.update(getTenantDoc(db, tenantId, 'salesOrders', editingOrder.id), {
                    status: 'cancelled',
                    cancelledAt: serverTimestamp(),
                    supersededBy: soRef.id,
                });
            }

            await batch.commit();

            // Remember the walk-in customer for future lookup. Tagged channel:'pos'
            // so B2C counter customers don't pollute the B2B Partner Worklist.
            // A Khata (credit) sale also accrues to their outstanding balance, so the
            // next bill for this phone can show what they already owe.
            if (customer.phone.length >= 5) {
                const q = query(getTenantCollection(db, tenantId, 'retailers'), where('number', '==', customer.phone), limit(1));
                const snap = await getDocs(q);
                const isCredit = paymentMethod === 'Khata';
                if (snap.empty) {
                    await addDoc(getTenantCollection(db, tenantId, 'retailers'), {
                        name: customer.name, number: customer.phone, atPost: customer.address,
                        pin: customer.pin, status: 'active', channel: 'pos',
                        totalSales: grandTotal,
                        outstandingAmount: isCredit ? grandTotal : 0,
                        totalPaid: isCredit ? 0 : grandTotal,
                        createdAt: serverTimestamp(),
                        lastOrderedAt: serverTimestamp(),
                    });
                } else {
                    const rDoc = snap.docs[0];
                    const rData = rDoc.data() as any;
                    // When correcting a bill, back out the original's contribution
                    // first so the balance reflects the delta, not a double count.
                    const prevTotal = editingOrder ? Number(editingOrder.grandTotal || 0) : 0;
                    const prevWasCredit = editingOrder ? editingOrder.paymentMethod === 'Khata' : false;
                    await updateDoc(rDoc.ref, {
                        totalSales: Math.max(0, Number(rData.totalSales || 0) - prevTotal + grandTotal),
                        outstandingAmount: Math.max(0, Number(rData.outstandingAmount || 0)
                            - (prevWasCredit ? prevTotal : 0) + (isCredit ? grandTotal : 0)),
                        totalPaid: Math.max(0, Number(rData.totalPaid || 0)
                            - (prevWasCredit ? 0 : prevTotal) + (isCredit ? 0 : grandTotal)),
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

            // Print and reset
            setTimeout(() => {
                window.print();
                // Reset the active tab
                setBillTabs(prev => prev.map(t =>
                    t.id === activeTabId
                        ? { ...t, cart: [], customer: defaultCustomer() }
                        : t,
                ));
                setRedeemPoints(0);
                // Clear the carried balance with the bill — re-entering the phone
                // re-fetches the (now updated) outstanding for the next sale.
                setCustomerOutstanding(0);
                setRowMeta({});
                // Correction complete — drop edit mode so the next bill is a fresh one.
                setEditingOrder(null);
                // Advance the displayed bill number. generateBillNumber() already
                // consumed this one from the counter, so without this the next bill
                // kept showing the number just used until the page was reloaded.
                setNextBillNumber(`KA-${(Number(billNumber.replace(/\D/g, '')) + 1).toString().padStart(4, '0')}`);
                setIsProcessing(false);
            }, 500);

        } catch (e) {
            console.error(e);
            showToast('Could not complete the sale. Please try again.', 'error');
            setIsProcessing(false);
        }
    };

    // Accept a V-Checkout session into the active tab
    const acceptVCheckoutSession = async (session: any) => {
        if (!tenantId) return;
        // Load session cart items as CartItem[]
        const items: CartItem[] = (session.cart || []).map((ci: any) => {
            const prod = products.find(p => p.id === ci.productId);
            if (!prod) return null;
            const rate = Number(ci.price) || posSellingRate(prod);
            return { ...prod, sellingPrice: rate, cartQuantity: ci.quantity, cartTotal: ci.quantity * rate };
        }).filter(Boolean);

        updateActiveTab({ cart: items });
        setShowVCheckoutPanel(false);

        // Mark session as confirmed
        await updateDoc(getTenantDoc(db, tenantId, 'vcheckoutSessions', session.id), {
            status: 'confirmed', updatedAt: serverTimestamp(),
        });
    };

    // Create a V-Checkout session QR
    const handleCreateVCheckoutSession = async () => {
        if (!tenantId) return;
        const token = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
        await addDoc(getTenantCollection(db, tenantId, 'vcheckoutSessions'), {
            tenantId, status: 'open', cart: [], qrToken: token,
            createdAt: serverTimestamp(),
            expiresAt,
        });
        setVCheckoutSessionUrl(`${window.location.origin}/v-checkout/${tenantId}/${token}`);
        setShowVCheckoutQr(true);
    };

    const realProductsExist = products.some(p => p.purchasePrice !== 0 || !(p as any).sku?.startsWith('SKU-'));
    const filteredProducts = products.filter(p => {
        const isDummy = p.purchasePrice === 0 && (p as any).sku?.startsWith('SKU-');
        if (realProductsExist && isDummy) return false;
        return (selectedCategory === 'All' || (p.type || '').toLowerCase() === selectedCategory.toLowerCase()) &&
            (p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.barcode === searchQuery);
    });

    // Category tabs are data-driven: only show categories that actually exist in
    // inventory (plus All), so there are never empty dead tabs.
    const categories = ['All', ...Array.from(new Set(products.map(p => (p.type || '').trim()).filter(Boolean))).sort()];

    // Split payment helpers
    const splitTotal = splits.reduce((s, sp) => s + (Number(sp.amount) || 0), 0);
    const splitRemaining = grandTotal - splitTotal;

    // ── Insights panel — derived values (read-only, no writes except Duplicate,
    // which only stages a new bill tab the same way V-Checkout accept does) ──
    const customerOrders = customer.phone.length >= 5
        ? recentOrders.filter(o => o.phoneNumber === customer.phone)
        : [];
    const lastOrder = customerOrders[0]; // recentOrders is already createdAt desc
    const favouriteProducts = (() => {
        const counts = new Map<string, { name: string; qty: number }>();
        customerOrders.forEach(o => (o.lineItems || []).forEach((li: any) => {
            const key = li.productId || li.productName;
            if (!key) return;
            const cur = counts.get(key) || { name: li.productName || 'Unknown', qty: 0 };
            cur.qty += Number(li.quantity) || 0;
            counts.set(key, cur);
        }));
        return Array.from(counts.values()).sort((a, b) => b.qty - a.qty).slice(0, 3);
    })();

    // Every KPI below is derived from this single filtered dataset (periodOrders,
    // already POS-only via isPosOrder and date-scoped by the effect above), so
    // changing the period recomputes every card from the exact same records.
    const periodSummary = (() => {
        const validOrders = periodOrders.filter(o => o.status !== 'cancelled');
        const cancelledCount = periodOrders.filter(o => o.status === 'cancelled').length;
        const totalSales = validOrders.reduce((s, o) => s + (Number(o.grandTotal) || 0), 0);
        const billCount = validOrders.length;
        const sumByMethod = (method: string) => validOrders
            .filter(o => (o.paymentMethod || '') === method)
            .reduce((s, o) => s + (Number(o.amountPaid ?? o.grandTotal) || 0), 0);
        // Split-payment bills contribute their per-method portions instead of the whole total.
        const splitContribution = (method: string) => validOrders
            .filter(o => o.paymentMethod === 'Split')
            .reduce((s, o) => s + (Array.isArray(o.paymentSplits) ? o.paymentSplits
                .filter((sp: any) => sp.method === method)
                .reduce((s2: number, sp: any) => s2 + (Number(sp.amount) || 0), 0) : 0), 0);
        const splitOrders = validOrders.filter(o => o.paymentMethod === 'Split');
        const cashChangeOrders = validOrders.filter(o => Number(o.changeGiven) > 0);

        const allLineItems = validOrders.flatMap(o => Array.isArray(o.lineItems) ? o.lineItems : []);
        const totalItemsSold = allLineItems.reduce((s, li: any) => s + (Number(li.quantity) || 0), 0);
        const taxCollected = allLineItems.reduce((s, li: any) => {
            const amount = Number(li.amount) || 0;
            const gstPct = Number(li.gstPct) || 0;
            // amount is GST-inclusive line total; back out the tax portion.
            return s + (gstPct > 0 ? amount - (amount / (1 + gstPct / 100)) : 0);
        }, 0);

        // Most Sold Product / Top Selling Category — category comes from a live
        // join against the already-loaded `products` list (no extra query); a
        // product no longer in inventory simply won't contribute a category.
        const productQty = new Map<string, { name: string; qty: number }>();
        const categoryQty = new Map<string, number>();
        allLineItems.forEach((li: any) => {
            const key = li.productId || li.productName;
            if (key) {
                const cur = productQty.get(key) || { name: li.productName || 'Unknown', qty: 0 };
                cur.qty += Number(li.quantity) || 0;
                productQty.set(key, cur);
            }
            const prod = products.find(p => p.id === li.productId);
            const cat = (prod?.type || '').trim();
            if (cat) categoryQty.set(cat, (categoryQty.get(cat) || 0) + (Number(li.quantity) || 0));
        });
        const mostSoldProduct = Array.from(productQty.values()).sort((a, b) => b.qty - a.qty)[0]?.name || null;
        const topCategory = Array.from(categoryQty.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

        // Peak Billing Hour — hour (0-23) with the most bills.
        const hourCounts = new Map<number, number>();
        validOrders.forEach(o => {
            const d = o.createdAt?.toDate?.();
            if (!d) return;
            hourCounts.set(d.getHours(), (hourCounts.get(d.getHours()) || 0) + 1);
        });
        const peakHourEntry = Array.from(hourCounts.entries()).sort((a, b) => b[1] - a[1])[0];
        const peakHour = peakHourEntry
            ? new Date(2000, 0, 1, peakHourEntry[0]).toLocaleTimeString('en-IN', { hour: 'numeric', hour12: true })
            : null;

        const billTotals = validOrders.map(o => Number(o.grandTotal) || 0);

        return {
            totalSales,
            billCount,
            avgBillValue: billCount > 0 ? totalSales / billCount : 0,
            cashCollection: sumByMethod('Cash') + splitContribution('Cash'),
            upiCollection: sumByMethod('UPI') + splitContribution('UPI'),
            khataCollection: validOrders.filter(o => o.paymentMethod === 'Khata').reduce((s, o) => s + (Number(o.grandTotal) || 0), 0),
            cancelledCount,
            cashChangeCollection: cashChangeOrders.reduce((s, o) => s + (Number(o.changeGiven) || 0), 0),
            splitPaymentCollection: splitOrders.reduce((s, o) => s + (Number(o.grandTotal) || 0), 0),
            loyaltyRedemptions: validOrders.reduce((s, o) => s + (Number(o.loyaltyPointsRedeemed) || 0), 0),
            discountGiven: validOrders.reduce((s, o) => s + (Number(o.discount) || 0), 0),
            taxCollected,
            avgItemsPerBill: billCount > 0 ? totalItemsSold / billCount : 0,
            highestBill: billTotals.length > 0 ? Math.max(...billTotals) : 0,
            lowestBill: billTotals.length > 0 ? Math.min(...billTotals) : 0,
            peakHour,
            mostSoldProduct,
            topCategory,
        };
    })();

    const openReprint = (order: any) => {
        setReprintOrder(order);
        setTimeout(() => { window.print(); setReprintOrder(null); }, 100);
    };

    const duplicateBill = (order: any) => {
        if (billTabs.length >= 5) { showToast('Close a bill tab first — max 5 open at once.', 'error'); return; }
        const items: CartItem[] = (order.lineItems || []).map((li: any) => {
            const prod = products.find(p => p.id === li.productId);
            if (!prod) return null;
            const rate = Number(li.mrp) || posSellingRate(prod);
            const qty = Number(li.quantity) || 1;
            return { ...prod, sellingPrice: rate, cartQuantity: qty, cartTotal: qty * rate };
        }).filter(Boolean) as CartItem[];
        if (items.length === 0) { showToast('Could not duplicate — none of these products are in inventory anymore.', 'error'); return; }
        const newId = `tab${Date.now()}`;
        setBillTabs(prev => [...prev, {
            id: newId, label: `Bill ${prev.length + 1}`, cart: items,
            customer: { name: order.retailerName || 'Walk-in Customer', phone: order.phoneNumber || '', address: order.address || '', pin: order.pin || '' },
        }]);
        setActiveTabId(newId);
        setShowInsightsPanel(false);
        showToast('Bill duplicated into a new tab', 'success');
    };

    if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-emerald-600" size={48} /></div>;

    return (
        <div style={{ background: 'var(--bg-color)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

            {/* Header */}
            <header className="no-print" style={{ background: 'var(--surface-base)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderBottom: '1px solid var(--surface-border)', padding: '0.75rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ background: 'var(--primary)', color: 'white', padding: '0.5rem', borderRadius: '10px' }}><Zap size={22} /></div>
                    <h1 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>POS Billing</h1>
                </div>

                <div style={{ flex: 1, position: 'relative', minWidth: '180px' }}>
                    <Search style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} size={18} />
                    <input
                        ref={searchRef}
                        type="text"
                        placeholder="Scan barcode or type product name, then Enter to add…"
                        className="input-field"
                        style={{ paddingLeft: '2.75rem', borderRadius: '12px', fontSize: '0.9rem' }}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                            // Preserve the counter's scan-to-add workflow now that the product
                            // grid is gone: Enter adds the barcode/name match to the invoice.
                            if (e.key !== 'Enter') return;
                            const q = searchQuery.trim();
                            if (!q) return;
                            const match = products.find(p => p.barcode === q)
                                || products.find(p => p.name.toLowerCase() === q.toLowerCase())
                                || products.find(p => p.name.toLowerCase().includes(q.toLowerCase()));
                            if (match) { addToCart(match); setSearchQuery(''); }
                            else showToast(`No product matches "${q}"`, 'error');
                        }}
                    />
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

                {/* V-Checkout session QR */}
                <ModuleGate moduleId="vcheckout" moduleName="V-Checkout" paywallVariant="badge">
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <button onClick={handleCreateVCheckoutSession} title="Generate customer self-scan QR"
                            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 1rem', borderRadius: '10px', border: '1px solid var(--surface-border)', background: 'var(--surface-base)', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-secondary)', transition: 'all var(--transition-fast)' }}>
                            <Smartphone size={16} /> V-Checkout
                        </button>
                        {vcheckoutSessions.length > 0 && (
                            <button onClick={() => setShowVCheckoutPanel(true)}
                                style={{ position: 'relative', padding: '0.45rem 0.75rem', borderRadius: '10px', background: 'var(--primary)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                                <Smartphone size={16} />
                                <span style={{ position: 'absolute', top: '-6px', right: '-6px', background: 'var(--danger)', color: 'white', borderRadius: '50%', width: '18px', height: '18px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
                                    {vcheckoutSessions.length}
                                </span>
                            </button>
                        )}
                    </div>
                </ModuleGate>

                {/* Quick add a product to inventory without leaving billing */}
                <button onClick={openAddProduct} title="Add a new product to inventory"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 1rem', borderRadius: '10px', border: '1px solid var(--surface-border)', background: 'var(--surface-base)', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-secondary)', transition: 'all var(--transition-fast)' }}>
                    <PlusCircle size={16} /> New Product
                </button>

                {/* Insights panel — recent bills, customer snapshot, today's summary */}
                <button onClick={() => setShowInsightsPanel(v => !v)} title="POS Insights"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 1rem', borderRadius: '10px', border: '1px solid var(--surface-border)', background: showInsightsPanel ? 'var(--primary)' : 'var(--surface-base)', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', color: showInsightsPanel ? 'white' : 'var(--text-secondary)', transition: 'all var(--transition-fast)' }}>
                    <History size={16} /> Insights
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
                                {tab.label} {tab.cart.length > 0 && <span style={{ opacity: 0.7 }}>({tab.cart.length})</span>}
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
                        .pinv-label { font-weight: 700; font-size: 0.82rem; }
                        .pinv-dropdown { position: absolute; top: 100%; left: 0; min-width: 220px; max-height: 220px; overflow-y: auto; background: #fff; border: 1px solid #ccc; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 1000; }
                        .pinv-dropdown-item { padding: 6px 10px; cursor: pointer; font-size: 0.85rem; border-bottom: 1px solid #eee; text-align: left; color: #000; }
                        .pinv-dropdown-item:hover { background: #e8f5e9; }
                        .pinv-fmt-btn { padding: 0.35rem 0.9rem; border-radius: 8px; font-weight: 700; font-size: 0.82rem; cursor: pointer; border: 1px solid var(--surface-border); background: var(--surface-base); color: var(--text-secondary); }
                        .pinv-fmt-btn.active { background: var(--primary); color: #fff; border-color: var(--primary); }
                    `}</style>

                    {/* Correction banner — this bill replaces an existing one */}
                    {editingOrder && (
                        <div style={{ maxWidth: billFormat === 'A5' ? '640px' : '1040px', margin: '0 auto 0.9rem', padding: '0.7rem 1rem', borderRadius: '10px', background: 'hsla(220,70%,55%,0.1)', border: '1px solid hsla(220,70%,55%,0.3)', display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                            <Pencil size={15} color="#3b82f6" />
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                Correcting bill {editingOrder.orderNumber || editingOrder.id?.slice(-6)?.toUpperCase()}
                            </span>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                — saving issues a new bill, cancels this one, and returns its stock.
                            </span>
                        </div>
                    )}

                    {/* Bill-format selector — accountant can print A4 or A5 */}
                    <div style={{ maxWidth: billFormat === 'A5' ? '640px' : '1040px', margin: '0 auto 0.9rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
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
                        </div>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>{L('bill_no')} #{nextBillNumber}</span>
                    </div>

                    {/* Invoice card (editable on screen; printed copy is rendered separately) */}
                    <div style={{ maxWidth: billFormat === 'A5' ? '640px' : '1040px', margin: '0 auto', background: '#fff', color: '#000', fontFamily: "'Times New Roman', serif", boxShadow: '0 8px 30px rgba(0,0,0,0.08)', borderRadius: '10px', border: '1px solid #ddd', padding: '18px 20px' }}>

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
                                        {branding?.contact && <>Contact No.: {branding.contact}</>}
                                    </div>
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
                            {/* Farmer box */}
                            <div style={{ borderRight: '1px solid #222', padding: '8px' }}>
                                <div className="pinv-label" style={{ marginBottom: '4px' }}>{L('buyer_title')}</div>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        className="pinv-input"
                                        style={{ fontWeight: 700, fontSize: '0.88rem' }}
                                        placeholder={L('buyer_name_ph')}
                                        value={customer.name}
                                        onChange={e => { setCustomer({ ...customer, name: e.target.value }); setShowFarmerDropdown(e.target.value.length > 0); }}
                                        onFocus={() => customer.name.length > 0 && setShowFarmerDropdown(true)}
                                        onBlur={() => setTimeout(() => setShowFarmerDropdown(false), 200)}
                                    />
                                    {showFarmerDropdown && (
                                        <div className="pinv-dropdown" style={{ width: '100%' }}>
                                            {farmers
                                                .filter(r => (r.name || '').toLowerCase().includes(customer.name.toLowerCase()) && customer.name.toLowerCase() !== (r.name || '').toLowerCase())
                                                .sort((a, b) => (a.channel === 'pos' ? -1 : 1) - (b.channel === 'pos' ? -1 : 1))
                                                .slice(0, 10)
                                                .map(r => (
                                                    <div key={r.id} className="pinv-dropdown-item"
                                                        onMouseDown={() => {
                                                            lastMatchedPhoneRef.current = r.number || null;
                                                            setCustomer({ name: r.name || '', phone: r.number || '', address: r.atPost || '', pin: r.pin || '' });
                                                            setCustomerOutstanding(Number(r.outstandingAmount) || 0);
                                                            setShowFarmerDropdown(false);
                                                        }}>
                                                        <div style={{ fontWeight: 600 }}>{r.name}</div>
                                                        <div style={{ fontSize: '0.75rem', color: '#666' }}>{r.number} {r.atPost ? `• ${r.atPost}` : ''}</div>
                                                    </div>
                                                ))}
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                                    <span className="pinv-label">{L('contact')} :</span>
                                    <input className="pinv-input" style={{ flexGrow: 1 }} placeholder="Phone No" value={customer.phone}
                                        onChange={e => setCustomer({ ...customer, phone: e.target.value })} onBlur={handlePhoneLookup} />
                                </div>
                                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                                    <span className="pinv-label">{L('address')} :</span>
                                    <input className="pinv-input" style={{ flexGrow: 1 }} placeholder={L('village_ph')} value={customer.address}
                                        onChange={e => setCustomer({ ...customer, address: e.target.value })} />
                                </div>
                                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                                    <span className="pinv-label">{L('pin')} :</span>
                                    <input className="pinv-input" style={{ flexGrow: 1 }} placeholder={L('pin')} value={customer.pin}
                                        onChange={e => setCustomer({ ...customer, pin: e.target.value })} />
                                </div>
                            </div>
                            {/* Invoice meta */}
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
                                    {/* Counter bills are settled either now (Cash — includes
                                        UPI/card, all treated as paid) or on udhar (Credit). */}
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
                                        <th style={{ width: '78px' }}>{L('exp_date')}</th>
                                        <th style={{ width: '46px' }}>{L('gst_pct')}</th>
                                        <th style={{ width: '48px' }}>{L('per')}</th>
                                        <th style={{ width: '58px' }}>{L('qty')}</th>
                                        <th style={{ width: '68px' }}>{L('rate')}</th>
                                        <th style={{ width: '86px' }}>{L('gross_amount')}</th>
                                        <th style={{ width: '30px' }}></th>
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
                                            <td><input type="month" className="pinv-input" style={{ textAlign: 'center', fontSize: '0.74rem' }} value={rowMeta[item.id]?.expDate ?? (item.expiryDate || '')}
                                                onChange={e => setRowMeta(m => ({ ...m, [item.id]: { ...m[item.id], expDate: e.target.value } }))} /></td>
                                            <td style={{ textAlign: 'center' }}><input type="number" className="pinv-input" style={{ textAlign: 'center' }} value={item.gstPct ?? 5}
                                                onChange={e => setCart(prev => prev.map(c => c.id === item.id ? { ...c, gstPct: Number(e.target.value) } : c))} /></td>
                                            <td style={{ textAlign: 'center' }}>{item.unit || item.baseUnit}</td>
                                            <td style={{ textAlign: 'center', fontWeight: 600 }}><input type="number" min="0" className="pinv-input" style={{ textAlign: 'center', fontWeight: 600 }} value={item.cartQuantity}
                                                onChange={e => setQty(item.id, Number(e.target.value))} /></td>
                                            <td style={{ textAlign: 'center' }}><input type="number" min="0" className="pinv-input" style={{ textAlign: 'center' }} value={posSellingRate(item)}
                                                onChange={e => setRate(item.id, Number(e.target.value))} /></td>
                                            <td style={{ textAlign: 'center', fontWeight: 600 }}>{item.cartTotal ? invFmt(item.cartTotal) : ''}</td>
                                            <td style={{ textAlign: 'center', padding: '2px' }}>
                                                <button onClick={() => removeCartItem(item.id)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#e53935', padding: '2px' }}>
                                                    <Trash2 size={14} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {/* Add-product search row */}
                                    <tr>
                                        <td style={{ textAlign: 'center', color: '#999' }}>{cart.length + 1}</td>
                                        <td colSpan={3} style={{ position: 'relative' }}>
                                            <input
                                                className="pinv-input"
                                                placeholder={L('search_product')}
                                                value={rowSearch[cart.length] || ''}
                                                onChange={e => { setRowSearch(s => ({ ...s, [cart.length]: e.target.value })); setActiveRowIndex(e.target.value.length > 0 ? cart.length : null); }}
                                                onFocus={() => (rowSearch[cart.length] || '').length > 0 && setActiveRowIndex(cart.length)}
                                                onBlur={() => setTimeout(() => setActiveRowIndex(null), 200)}
                                            />
                                            {activeRowIndex === cart.length && (
                                                <div className="pinv-dropdown">
                                                    {products
                                                        .filter(p => p.name.toLowerCase().includes((rowSearch[cart.length] || '').toLowerCase()) || p.barcode === (rowSearch[cart.length] || ''))
                                                        .slice(0, 50)
                                                        .map(p => (
                                                            <div key={p.id} className="pinv-dropdown-item"
                                                                onMouseDown={() => { addToCart(p); setRowSearch(s => ({ ...s, [cart.length]: '' })); setActiveRowIndex(null); }}>
                                                                {p.name} <span style={{ color: '#888' }}>· ₹{posSellingRate(p)}</span>
                                                            </div>
                                                        ))}
                                                    {products.filter(p => p.name.toLowerCase().includes((rowSearch[cart.length] || '').toLowerCase())).length === 0 && (
                                                        <div className="pinv-dropdown-item" onMouseDown={openAddProduct} style={{ color: 'var(--primary)' }}>
                                                            + Add "{rowSearch[cart.length]}" to inventory
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                        <td colSpan={7}></td>
                                    </tr>
                                    {/* Padding rows so the grid reads like a printed invoice */}
                                    {Array.from({ length: Math.max(0, 5 - cart.length) }).map((_, i) => (
                                        <tr key={`pad-${i}`}>
                                            <td style={{ textAlign: 'center', color: '#bbb' }}>{cart.length + 2 + i}</td>
                                            <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
                                        </tr>
                                    ))}
                                    {/* TOTAL row */}
                                    <tr style={{ fontWeight: 700, background: '#f9f9f9' }}>
                                        <td colSpan={9} style={{ textAlign: 'right', paddingRight: '8px' }}>{L('total')}</td>
                                        <td style={{ textAlign: 'center' }}>{invFmt(cartSubtotal)}</td>
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
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{L('round_off')}</span><span>{invFmt(invNetAmount - (computedTaxable + totalTax - loyaltyDiscount))}</span></div>
                                {loyaltyDiscount > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#2E7D32' }}><span>{L('discount')} ({effectiveRedeemPoints} pts)</span><span>-{invFmt(loyaltyDiscount)}</span></div>
                                )}
                                <div style={{ borderTop: '2px solid #111', marginTop: '4px', paddingTop: '4px', display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '1rem' }}>
                                    <span>{L('net_amount')}</span><span>₹{invNetAmount.toLocaleString('en-IN')}</span>
                                </div>
                                {customerOutstanding > 0 && (
                                    <>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#c62828', marginTop: '3px' }}>
                                            <span>{L('previous_outstanding')} (Dr)</span><span>₹{customerOutstanding.toLocaleString('en-IN')}</span>
                                        </div>
                                        <div style={{ borderTop: '1px solid #111', paddingTop: '3px', display: 'flex', justifyContent: 'space-between', fontWeight: 900 }}>
                                            <span>{L('total_payable')}</span><span>₹{(invNetAmount + customerOutstanding).toLocaleString('en-IN')}</span>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* AMOUNT IN WORDS */}
                        <div style={{ border: '1px solid #222', marginBottom: '10px', display: 'grid', gridTemplateColumns: '100px 1fr', alignItems: 'stretch' }}>
                            <div style={{ borderRight: '1px solid #222', padding: '6px', fontWeight: 700, display: 'flex', alignItems: 'center', fontSize: '0.82rem' }}>{L('amount_in_words')}</div>
                            <div style={{ padding: '6px', fontWeight: 600, fontSize: '0.85rem', fontStyle: 'italic' }}>INR {numberToWords(invNetAmount)}</div>
                        </div>

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
                    </div>

                    {/* ── Loyalty redeem + action buttons (no-print) ─────────────────── */}
                    <div style={{ maxWidth: billFormat === 'A5' ? '640px' : '1040px', margin: '1rem auto 2.5rem' }}>
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
                                        style={{ width: '70px', border: '1px solid var(--surface-border)', borderRadius: '6px', padding: '0.2rem 0.4rem', fontSize: '0.85rem', background: 'var(--surface-raised)', color: 'var(--text-primary)' }} />
                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>pts</span>
                                </div>
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            <button
                                onClick={() => handleCheckout(modeOfPayment === 'Credit' ? 'Khata' : modeOfPayment)}
                                disabled={isProcessing || cart.length === 0}
                                className="btn"
                                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.75rem', fontSize: '1rem', borderRadius: '8px', background: '#1565C0', color: '#fff', border: 'none', cursor: isProcessing ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
                                {isProcessing ? <Loader2 className="animate-spin" size={18} /> : <Printer size={18} />} Save &amp; Print
                            </button>
                            <ModuleGate moduleId="cash_tender" moduleName="Cash Tender" paywallVariant="badge">
                                <button onClick={() => { setCashTenderAmount(grandTotal); setShowCashTenderDialog(true); }} disabled={isProcessing || cart.length === 0} className="btn" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.75rem 1.25rem', borderRadius: '8px', background: '#16a34a', color: 'white', border: 'none', fontWeight: 700, cursor: 'pointer' }}>
                                    <Banknote size={18} /> Cash+Change
                                </button>
                            </ModuleGate>
                            <ModuleGate moduleId="vpay" moduleName="V Pay" paywallVariant="badge">
                                <button onClick={() => setShowVPayDialog(true)} disabled={isProcessing || cart.length === 0} className="btn" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.75rem 1.25rem', borderRadius: '8px', background: '#0055ff', color: 'white', border: 'none', fontWeight: 700, cursor: 'pointer' }}>
                                    <QrCode size={18} /> V Pay
                                </button>
                            </ModuleGate>
                            <ModuleGate moduleId="multiple_payment_modes" moduleName="Split Payment" paywallVariant="badge">
                                <button onClick={() => { setSplits([{ method: 'Cash', amount: grandTotal }]); setShowSplitDialog(true); }} disabled={isProcessing || cart.length === 0} className="btn" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.75rem 1.25rem', borderRadius: '8px', background: '#7c3aed', color: 'white', border: 'none', fontWeight: 700, cursor: 'pointer' }}>
                                    <CreditCard size={18} /> Split
                                </button>
                            </ModuleGate>
                            <button onClick={() => handleCheckout('Khata')} disabled={isProcessing || cart.length === 0} className="btn" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.75rem 1.25rem', borderRadius: '8px', background: 'var(--secondary)', color: 'var(--secondary-dark)', border: 'none', fontWeight: 700, cursor: 'pointer' }}>
                                Credit / Khata <ChevronRight size={18} />
                            </button>
                            <span style={{ marginLeft: 'auto', fontSize: '1.1rem', fontWeight: 800 }}>To Pay: <span style={{ color: 'var(--primary)' }}>₹{Math.round(grandTotal).toLocaleString('en-IN')}</span></span>
                        </div>
                    </div>
                </div>

            </div>

            {/* ── POS Insights Panel — read-only, does not touch billing state ────────── */}
            {showInsightsPanel && (
                <div className="no-print" style={{ position: 'fixed', inset: 0, background: 'hsla(220, 30%, 4%, 0.5)', zIndex: 900, display: 'flex', justifyContent: 'flex-end', animation: 'fadeIn 0.18s ease-out' }}
                    onClick={() => setShowInsightsPanel(false)}>
                    <div className="themed-scroll" style={{ width: '420px', maxWidth: '100%', background: 'var(--surface-base)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderLeft: '1px solid var(--surface-border)', height: '100%', overflowY: 'auto', padding: '1.5rem', animation: 'slideInRight 0.22s ease-out' }}
                        onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <h3 style={{ margin: 0, display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <History size={20} /> POS Insights
                            </h3>
                            <button onClick={() => setShowInsightsPanel(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}><X size={20} /></button>
                        </div>

                        {/* Tabs */}
                        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1.25rem' }}>
                            {([['bills', 'Recent Bills'], ['customer', 'Customer'], ['today', 'Analytics']] as const).map(([key, label]) => (
                                <button key={key} onClick={() => setInsightsTab(key)}
                                    style={{ flex: 1, padding: '0.4rem 0.5rem', borderRadius: '8px', fontWeight: 600, fontSize: '0.8rem', border: '1px solid', cursor: 'pointer',
                                        background: insightsTab === key ? 'var(--primary)' : 'var(--surface-raised)',
                                        color: insightsTab === key ? 'white' : 'var(--text-secondary)',
                                        borderColor: insightsTab === key ? 'var(--primary)' : 'var(--surface-border)' }}>
                                    {label}
                                </button>
                            ))}
                        </div>

                        {/* ── Recent Bills ─────────────────────────────────────────────── */}
                        {insightsTab === 'bills' && (
                            recentOrders.length === 0
                                ? <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: '2rem 0' }}>No bills yet today or recently.</p>
                                : recentOrders.map(order => (
                                    <div key={order.id} style={{ background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderRadius: '12px', padding: '0.9rem', marginBottom: '0.75rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.4rem' }}>
                                            <div>
                                                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{order.orderNumber || 'N/A'}</span>
                                                <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginLeft: '0.5rem' }}>{order.retailerName || 'Walk-in Customer'}</span>
                                            </div>
                                            <span style={{ fontWeight: 800, color: 'var(--primary)' }}>₹{Math.round(order.grandTotal || 0).toLocaleString('en-IN')}</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginBottom: '0.6rem' }}>
                                            <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '99px', background: order.paymentStatus === 'Pending' ? 'hsla(38,92%,50%,0.15)' : 'hsla(142,60%,40%,0.15)', color: order.paymentStatus === 'Pending' ? '#f59e0b' : '#22c55e', fontWeight: 700 }}>
                                                {order.paymentStatus || '—'}
                                            </span>
                                            <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>{order.paymentMethod || '—'}</span>
                                            {order.status === 'cancelled' && (
                                                <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '99px', background: 'hsla(0,84%,55%,0.15)', color: '#ef4444', fontWeight: 700 }}>Cancelled</span>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                            <button onClick={() => openReprint(order)} title="Reprint this bill"
                                                style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.3rem 0.6rem', background: 'hsla(152,60%,40%,0.12)', color: 'var(--primary)', border: '1px solid hsla(152,60%,40%,0.25)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>
                                                <Printer size={12} /> Reprint
                                            </button>
                                            <button onClick={() => duplicateBill(order)} title="Duplicate into a new bill tab"
                                                style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.3rem 0.6rem', background: 'hsla(220,70%,55%,0.12)', color: '#3b82f6', border: '1px solid hsla(220,70%,55%,0.25)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>
                                                <Columns size={12} /> Duplicate
                                            </button>
                                            {/* Refund — temporarily disabled system-wide (Returns module is unfinished).
                                                Re-enable this button once Returns/Refund is ready; logic below is untouched.
                                            <button onClick={() => showToast('Refunds are handled from the Returns module.', 'info')} title="Refund"
                                                style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.3rem 0.6rem', background: 'hsla(0,84%,55%,0.1)', color: '#f87171', border: '1px solid hsla(0,84%,55%,0.2)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>
                                                <ExternalLink size={12} /> Refund
                                            </button>
                                            */}
                                        </div>
                                    </div>
                                ))
                        )}

                        {/* ── Customer Experience ──────────────────────────────────────── */}
                        {insightsTab === 'customer' && (
                            customer.phone.length < 5 ? (
                                <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: '2rem 0' }}>
                                    <User size={32} style={{ margin: '0 auto 0.75rem', opacity: 0.2, display: 'block' }} />
                                    Enter a customer phone number on the bill to see their history here.
                                </p>
                            ) : (
                                <div>
                                    <h4 style={{ margin: '0 0 1rem', color: 'var(--text-primary)' }}>{customer.name || 'Customer'}</h4>

                                    <div className="glass-panel" style={{ padding: '0.875rem', marginBottom: '0.9rem' }}>
                                        <p style={{ margin: '0 0 0.3rem', fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>Last Purchase</p>
                                        <p style={{ margin: 0, fontWeight: 700, color: 'var(--text-primary)' }}>
                                            {lastOrder ? `₹${Math.round(lastOrder.grandTotal || 0).toLocaleString('en-IN')} · ${lastOrder.orderNumber || ''}` : 'No prior purchases found'}
                                        </p>
                                        {lastOrder?.createdAt?.toDate && (
                                            <p style={{ margin: '0.2rem 0 0', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                                                Last visit: {lastOrder.createdAt.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                            </p>
                                        )}
                                    </div>

                                    {customerRetailerDoc && Number(customerRetailerDoc.outstandingAmount) > 0 && (
                                        <div className="glass-panel" style={{ padding: '0.875rem', marginBottom: '0.9rem', borderColor: 'hsla(0,84%,55%,0.3)' }}>
                                            <p style={{ margin: '0 0 0.3rem', fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>Outstanding Amount</p>
                                            <p style={{ margin: 0, fontWeight: 800, color: '#ef4444', fontSize: '1.1rem' }}>
                                                ₹{Math.round(customerRetailerDoc.outstandingAmount).toLocaleString('en-IN')}
                                            </p>
                                        </div>
                                    )}

                                    {loyaltyIsActive && (
                                        <div className="glass-panel" style={{ padding: '0.875rem', marginBottom: '0.9rem' }}>
                                            <p style={{ margin: '0 0 0.3rem', fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>Loyalty Status</p>
                                            {customerLoyalty ? (
                                                <p style={{ margin: 0, fontWeight: 700, color: 'var(--secondary-dark)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                    <Star size={15} /> {customerLoyalty.points || 0} points
                                                </p>
                                            ) : (
                                                <p style={{ margin: 0, color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>Not enrolled yet</p>
                                            )}
                                        </div>
                                    )}

                                    <div className="glass-panel" style={{ padding: '0.875rem' }}>
                                        <p style={{ margin: '0 0 0.5rem', fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>Favourite Products</p>
                                        {favouriteProducts.length === 0 ? (
                                            <p style={{ margin: 0, color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>Not enough purchase history yet</p>
                                        ) : favouriteProducts.map((fp, i) => (
                                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '0.25rem 0', color: 'var(--text-primary)' }}>
                                                <span>{fp.name}</span>
                                                <span style={{ color: 'var(--text-tertiary)' }}>×{fp.qty}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <p style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '0.75rem' }}>
                                        Based on the last {recentOrders.length} bills recorded for this store.
                                    </p>
                                </div>
                            )
                        )}

                        {/* ── POS Operations Analytics (default: Today) ───────────────────── */}
                        {insightsTab === 'today' && (
                            <div>
                                {/* Period selector */}
                                <select
                                    value={analyticsPeriod}
                                    onChange={e => setAnalyticsPeriod(e.target.value as DateRangePeriod)}
                                    style={{ width: '100%', padding: '0.5rem 0.6rem', borderRadius: '8px', border: '1px solid var(--surface-border)', background: 'var(--surface-raised)', color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.75rem' }}>
                                    {DATE_RANGE_PERIODS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                                </select>

                                {analyticsPeriod === 'customDate' && (
                                    <input type="date" value={analyticsCustomDate} onChange={e => setAnalyticsCustomDate(e.target.value)}
                                        className="input-field" style={{ width: '100%', marginBottom: '0.75rem', fontSize: '0.85rem' }} />
                                )}
                                {analyticsPeriod === 'customRange' && (
                                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                        <input type="date" value={analyticsCustomFrom} onChange={e => setAnalyticsCustomFrom(e.target.value)}
                                            className="input-field" style={{ flex: 1, fontSize: '0.85rem' }} placeholder="From" />
                                        <input type="date" value={analyticsCustomTo} onChange={e => setAnalyticsCustomTo(e.target.value)}
                                            className="input-field" style={{ flex: 1, fontSize: '0.85rem' }} placeholder="To" />
                                    </div>
                                )}

                                {/* Core KPIs */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                    {[
                                        ['Total Sales', `₹${Math.round(periodSummary.totalSales).toLocaleString('en-IN')}`],
                                        ['Total Bills', periodSummary.billCount.toString()],
                                        ['Avg Bill Value', `₹${Math.round(periodSummary.avgBillValue).toLocaleString('en-IN')}`],
                                        ['Cash Collection', `₹${Math.round(periodSummary.cashCollection).toLocaleString('en-IN')}`],
                                        ['UPI Collection', `₹${Math.round(periodSummary.upiCollection).toLocaleString('en-IN')}`],
                                        ['Khata Collection', `₹${Math.round(periodSummary.khataCollection).toLocaleString('en-IN')}`],
                                        ['Cancelled Bills', periodSummary.cancelledCount.toString()],
                                    ].map(([label, value]) => (
                                        <div key={label} className="glass-panel" style={{ padding: '0.9rem' }}>
                                            <p style={{ margin: '0 0 0.3rem', fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>{label}</p>
                                            <p style={{ margin: 0, fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-primary)' }}>{value}</p>
                                        </div>
                                    ))}
                                </div>

                                {/* Additional operational KPIs — only shown when there's data to back them */}
                                {periodSummary.billCount > 0 && (
                                    <>
                                        <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '1.1rem 0 0.6rem' }}>
                                            More Details
                                        </p>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                            {([
                                                ['Cash+Change Collection', periodSummary.cashChangeCollection > 0 ? `₹${Math.round(periodSummary.cashChangeCollection).toLocaleString('en-IN')}` : null],
                                                ['Split Payment Collection', periodSummary.splitPaymentCollection > 0 ? `₹${Math.round(periodSummary.splitPaymentCollection).toLocaleString('en-IN')}` : null],
                                                ['Loyalty Redemptions', periodSummary.loyaltyRedemptions > 0 ? `${periodSummary.loyaltyRedemptions.toLocaleString('en-IN')} pts` : null],
                                                ['Discount Given', periodSummary.discountGiven > 0 ? `₹${Math.round(periodSummary.discountGiven).toLocaleString('en-IN')}` : null],
                                                ['Tax Collected', periodSummary.taxCollected > 0 ? `₹${Math.round(periodSummary.taxCollected).toLocaleString('en-IN')}` : null],
                                                ['Avg Items / Bill', periodSummary.avgItemsPerBill.toFixed(1)],
                                                ['Highest Bill', `₹${Math.round(periodSummary.highestBill).toLocaleString('en-IN')}`],
                                                ['Lowest Bill', `₹${Math.round(periodSummary.lowestBill).toLocaleString('en-IN')}`],
                                                ['Peak Billing Hour', periodSummary.peakHour],
                                                ['Most Sold Product', periodSummary.mostSoldProduct],
                                                ['Top Selling Category', periodSummary.topCategory],
                                            ] as [string, string | null][]).filter(([, value]) => value !== null).map(([label, value]) => (
                                                <div key={label} className="glass-panel" style={{ padding: '0.9rem' }}>
                                                    <p style={{ margin: '0 0 0.3rem', fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>{label}</p>
                                                    <p style={{ margin: 0, fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Hidden reprint layout — separate from the live checkout print layout below */}
            {reprintOrder && (
                <div className="print-only">
                    <TraditionalPrintLayout
                        cart={(reprintOrder.lineItems || []).map((li: any) => ({
                            name: li.productName, cartQuantity: li.quantity, baseUnit: li.unit,
                            sellingPrice: li.mrp, maxRetailPrice: li.mrp, cartTotal: li.amount, gstPct: li.gstPct,
                            mfgCompany: li.mfgCompany, batchNo: li.batchNo, expDate: li.expDate,
                        }))}
                        customer={{ name: reprintOrder.retailerName, phone: reprintOrder.phoneNumber, address: reprintOrder.address, pin: reprintOrder.pin }}
                        branding={branding}
                        billNumber={reprintOrder.orderNumber}
                        subtotal={reprintOrder.subtotal || 0}
                        discount={reprintOrder.discount || 0}
                        grandTotal={reprintOrder.grandTotal || 0}
                        billFormat={billFormat}
                        invoiceDate={reprintOrder.invoiceDate || ''}
                        modeOfPayment={reprintOrder.paymentMethod || 'Cash'}
                        L={L}
                    />
                </div>
            )}

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

            {/* ── V-Checkout Pending Sessions Panel ────────────────────────────────── */}
            {showVCheckoutPanel && (
                <div style={{ position: 'fixed', inset: 0, background: 'hsla(220, 30%, 4%, 0.72)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end', animation: 'fadeIn 0.18s ease-out' }}
                    onClick={() => setShowVCheckoutPanel(false)}>
                    <div className="themed-scroll" style={{ width: '380px', background: 'var(--surface-base)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderLeft: '1px solid var(--surface-border)', height: '100%', overflowY: 'auto', padding: '1.5rem', animation: 'slideInRight 0.22s ease-out' }}
                        onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                            <h3 style={{ margin: 0, display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <Smartphone size={20} /> Pending V-Checkouts
                            </h3>
                            <button onClick={() => setShowVCheckoutPanel(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}><X size={20} /></button>
                        </div>
                        {vcheckoutSessions.length === 0
                            ? <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: '2rem 0' }}>No pending sessions</p>
                            : vcheckoutSessions.map(session => (
                                <div key={session.id} style={{ background: 'var(--surface-raised)', borderRadius: '12px', padding: '1rem', marginBottom: '0.75rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                        <span style={{ fontWeight: 600 }}>{session.cart?.length || 0} items</span>
                                        <span style={{ fontWeight: 700, color: 'var(--primary)' }}>₹{Math.round(session.grandTotal || 0)}</span>
                                    </div>
                                    {session.cart?.slice(0, 3).map((ci: any, i: number) => (
                                        <p key={i} style={{ margin: '0 0 2px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                            {ci.productName} × {ci.quantity}
                                        </p>
                                    ))}
                                    {(session.cart?.length || 0) > 3 && <p style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', margin: 0 }}>+{session.cart.length - 3} more</p>}
                                    <button onClick={() => acceptVCheckoutSession(session)}
                                        style={{ marginTop: '0.75rem', width: '100%', padding: '0.4rem', borderRadius: '8px', background: 'var(--primary)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                                        Accept → Load to Bill
                                    </button>
                                </div>
                            ))
                        }
                    </div>
                </div>
            )}

            {/* ── V-Checkout QR Dialog ─────────────────────────────────────────────── */}
            {showVCheckoutQr && (
                <div style={{ position: 'fixed', inset: 0, background: 'hsla(220, 30%, 4%, 0.72)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', animation: 'fadeIn 0.18s ease-out' }}
                    onClick={() => setShowVCheckoutQr(false)}>
                    <div className="glass-panel" style={{ padding: '2rem', maxWidth: '340px', width: '100%', textAlign: 'center', borderRadius: '20px', animation: 'scaleUp 0.22s ease-out' }}
                        onClick={e => e.stopPropagation()}>
                        <h3 style={{ marginBottom: '0.5rem' }}>Customer Self-Scan</h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                            Customer scans this QR to browse and add items from their phone
                        </p>
                        <UpiQrCode upiId={vCheckoutSessionUrl} payeeName="" amount={0} size={200} />
                        <p style={{ fontSize: '0.7rem', wordBreak: 'break-all', color: 'var(--text-tertiary)', margin: '0.75rem 0' }}>{vCheckoutSessionUrl}</p>
                        <button onClick={() => setShowVCheckoutQr(false)} className="btn" style={{ background: 'var(--primary)', color: 'white', width: '100%' }}>
                            Done
                        </button>
                    </div>
                </div>
            )}

            {/* ── Quick Add / Edit Product ─────────────────────────────────────────── */}
            {showProductModal && tenantId && (
                <QuickProductModal
                    tenantId={tenantId}
                    product={editingProduct}
                    defaultName={editingProduct ? '' : searchQuery}
                    products={products}
                    onClose={() => { setShowProductModal(false); setEditingProduct(null); }}
                />
            )}

            {/* Hidden print layout — suppressed while a reprint (below) is in flight,
                so window.print() never renders both layouts at once. */}
            {!reprintOrder && (
                <div className="print-only">
                    <TraditionalPrintLayout
                        cart={cart.map(c => ({ ...c, batchNo: rowMeta[c.id]?.batchNo ?? c.batchNumber, expDate: rowMeta[c.id]?.expDate ?? c.expiryDate }))}
                        customer={customer}
                        branding={branding}
                        billNumber={nextBillNumber}
                        subtotal={cartSubtotal}
                        discount={loyaltyDiscount}
                        grandTotal={grandTotal}
                        billFormat={billFormat}
                        invoiceDate={invoiceDate}
                        modeOfPayment={modeOfPayment}
                        previousOutstanding={customerOutstanding}
                        L={L}
                    />
                </div>
            )}
        </div>
    );
}

// Printed GST invoice — mirrors B2BInvoicePage's layout so the POS (farmer) bill
// looks identical to the B2B one. `billFormat` drives the print @page size (A4/A5).
function TraditionalPrintLayout({ cart, customer, branding, billNumber, discount, grandTotal, billFormat = 'A4', invoiceDate, modeOfPayment = 'Cash', previousOutstanding = 0, L = (k: string) => k }: any) {
    const fmt = (n: number) => (Number.isFinite(n) ? n : 0).toFixed(2);
    const lineGst = (i: any) => (typeof i.gstPct === 'number' ? i.gstPct : 5);
    const taxable = cart.reduce((s: number, i: any) => s + (i.cartTotal || 0) / (1 + lineGst(i) / 100), 0);
    const cgst = cart.reduce((s: number, i: any) => { const g = lineGst(i); return s + ((i.cartTotal || 0) / (1 + g / 100)) * (g / 2) / 100; }, 0);
    const sgst = cgst;
    const tax = cgst + sgst;
    const net = Math.round(grandTotal || 0);
    const roundOff = net - (taxable + tax - (discount || 0));
    const sellerName = branding?.businessName || 'Your Business Name';
    const isA5 = billFormat === 'A5';
    const baseFont = isA5 ? '0.72rem' : '0.82rem';
    const dateLabel = invoiceDate || new Date().toISOString().split('T')[0];

    return (
        <div style={{ padding: isA5 ? '8mm' : '12mm', fontFamily: "'Times New Roman', serif", background: '#fff', color: '#000', fontSize: baseFont }}>
            <style>{`
                @media print { @page { size: ${billFormat}; margin: ${isA5 ? '6mm' : '10mm'}; } }
                .kaprint-table { border-collapse: collapse; width: 100%; }
                .kaprint-table th, .kaprint-table td { border: 1px solid #222; padding: ${isA5 ? '2px 3px' : '3px 5px'}; font-size: ${baseFont}; }
                .kaprint-table th { background: #f2f2f2; font-weight: 700; text-align: center; }
                * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            `}</style>

            {/* TITLE + SELLER */}
            <div style={{ textAlign: 'center', fontWeight: 700, letterSpacing: '0.15em', marginBottom: '2px' }}>{L('gst_invoice')}</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid #111', paddingBottom: '6px', marginBottom: '8px', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {branding?.logoUrl && <img src={branding.logoUrl} alt="Logo" style={{ height: isA5 ? '34px' : '44px', objectFit: 'contain' }} />}
                    <div>
                        <h1 style={{ margin: 0, fontSize: isA5 ? '1.1rem' : '1.5rem', fontWeight: 900 }}>{sellerName}</h1>
                        <div style={{ fontSize: isA5 ? '0.66rem' : '0.78rem', color: '#333', marginTop: '2px' }}>
                            {branding?.address || ''}<br />
                            {branding?.gstin && <><strong>GSTIN:</strong> {branding.gstin} &nbsp;</>}
                            {branding?.contact && <>Contact: {branding.contact}</>}
                        </div>
                    </div>
                </div>
                <div style={{ textAlign: 'right', fontWeight: 700, border: '2px solid #111', padding: '3px 10px', borderRadius: '6px', whiteSpace: 'nowrap' }}>
                    {modeOfPayment === 'Khata' || modeOfPayment === 'Credit' ? L('credit_bill') : L('cash_bill')}
                </div>
            </div>

            {/* BUYER + META */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid #222', marginBottom: '8px' }}>
                <div style={{ borderRight: '1px solid #222', padding: '6px' }}>
                    <div style={{ fontWeight: 700, marginBottom: '3px' }}>{L('buyer_title')}</div>
                    <div style={{ fontWeight: 700 }}>{customer.name}</div>
                    {customer.address && <div>{customer.address}{customer.pin ? ` - ${customer.pin}` : ''}</div>}
                    {customer.phone && <div>{L('contact')}: {customer.phone}</div>}
                </div>
                <div style={{ padding: '6px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><strong>{L('bill_no')} :</strong><span>{billNumber}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><strong>{L('bill_date')} :</strong><span>{dateLabel}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><strong>{L('mode_of_payment')} :</strong><span>{modeOfPayment}</span></div>
                </div>
            </div>

            {/* ITEMS */}
            <table className="kaprint-table" style={{ marginBottom: '8px' }}>
                <thead>
                    <tr>
                        <th style={{ width: '30px' }}>{L('sno')}</th>
                        <th style={{ textAlign: 'left' }}>{L('item_description')}</th>
                        <th>{L('company')}</th>
                        <th>{L('batch_no')}</th>
                        <th>{L('exp_date')}</th>
                        <th>{L('gst_pct')}</th>
                        <th>{L('per')}</th>
                        <th>{L('qty')}</th>
                        <th>{L('rate')}</th>
                        <th>{L('gross_amount')}</th>
                    </tr>
                </thead>
                <tbody>
                    {cart.map((item: any, i: number) => (
                        <tr key={i}>
                            <td style={{ textAlign: 'center' }}>{i + 1}</td>
                            <td>{item.name}</td>
                            <td>{item.mfgCompany || ''}</td>
                            <td style={{ textAlign: 'center' }}>{item.batchNo || ''}</td>
                            <td style={{ textAlign: 'center' }}>{item.expDate || ''}</td>
                            <td style={{ textAlign: 'center' }}>{lineGst(item)}</td>
                            <td style={{ textAlign: 'center' }}>{item.unit || item.baseUnit || ''}</td>
                            <td style={{ textAlign: 'center' }}>{item.cartQuantity}</td>
                            <td style={{ textAlign: 'center' }}>{posSellingRate(item)}</td>
                            <td style={{ textAlign: 'center' }}>{fmt(item.cartTotal)}</td>
                        </tr>
                    ))}
                    {Array.from({ length: Math.max(0, (isA5 ? 4 : 6) - cart.length) }).map((_: any, i: number) => (
                        <tr key={`e-${i}`} style={{ height: '20px' }}>
                            <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
                        </tr>
                    ))}
                    <tr style={{ fontWeight: 700, background: '#f9f9f9' }}>
                        <td colSpan={9} style={{ textAlign: 'right', paddingRight: '8px' }}>{L('total')}</td>
                        <td style={{ textAlign: 'center' }}>{fmt(taxable + tax)}</td>
                    </tr>
                </tbody>
            </table>

            {/* GST SUMMARY + NET */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid #222', marginBottom: '8px' }}>
                <div style={{ borderRight: '1px solid #222', padding: '6px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: isA5 ? '0.66rem' : '0.78rem' }}>
                        <thead>
                            <tr>{[L('taxable'), `${L('cgst')}%`, L('gross_amount'), `${L('sgst')}%`, L('gross_amount'), L('total_tax')].map((h, hi) => <th key={hi} style={{ border: '1px solid #ccc', padding: '2px 4px', background: '#f2f2f2' }}>{h}</th>)}</tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style={{ border: '1px solid #ccc', padding: '2px 4px', textAlign: 'center' }}>{fmt(taxable)}</td>
                                <td style={{ border: '1px solid #ccc', padding: '2px 4px', textAlign: 'center' }}>2.5%</td>
                                <td style={{ border: '1px solid #ccc', padding: '2px 4px', textAlign: 'center' }}>{fmt(cgst)}</td>
                                <td style={{ border: '1px solid #ccc', padding: '2px 4px', textAlign: 'center' }}>2.5%</td>
                                <td style={{ border: '1px solid #ccc', padding: '2px 4px', textAlign: 'center' }}>{fmt(sgst)}</td>
                                <td style={{ border: '1px solid #ccc', padding: '2px 4px', textAlign: 'center' }}>{fmt(tax)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div style={{ padding: '6px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{L('output_cgst')}@2.5%</span><span>{fmt(cgst)}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{L('output_sgst')}@2.5%</span><span>{fmt(sgst)}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{L('round_off')}</span><span>{fmt(roundOff)}</span></div>
                    {discount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: '#2E7D32' }}><span>{L('discount')}</span><span>-{fmt(discount)}</span></div>}
                    <div style={{ borderTop: '2px solid #111', marginTop: '3px', paddingTop: '3px', display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: isA5 ? '0.85rem' : '1rem' }}>
                        <span>{L('net_amount')}</span><span>₹{net.toLocaleString('en-IN')}</span>
                    </div>
                    {previousOutstanding > 0 && (
                        <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                                <span>{L('previous_outstanding')} (Dr)</span><span>₹{Number(previousOutstanding).toLocaleString('en-IN')}</span>
                            </div>
                            <div style={{ borderTop: '1px solid #111', paddingTop: '2px', display: 'flex', justifyContent: 'space-between', fontWeight: 900 }}>
                                <span>{L('total_payable')}</span><span>₹{(net + Number(previousOutstanding)).toLocaleString('en-IN')}</span>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* AMOUNT IN WORDS */}
            <div style={{ border: '1px solid #222', marginBottom: '8px', display: 'grid', gridTemplateColumns: '90px 1fr' }}>
                <div style={{ borderRight: '1px solid #222', padding: '5px', fontWeight: 700, display: 'flex', alignItems: 'center' }}>{L('amount_in_words')}</div>
                <div style={{ padding: '5px', fontWeight: 600, fontStyle: 'italic' }}>INR {numberToWords(net)}</div>
            </div>

            {/* DECLARATION + SIGNATURE + QR */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '10px', marginTop: '6px' }}>
                <div style={{ fontSize: isA5 ? '0.62rem' : '0.72rem', color: '#444', maxWidth: '60%' }}>
                    <strong>{L('declaration')} :</strong> {L('declaration_text')}
                </div>
                {branding?.upiId && (
                    <div style={{ textAlign: 'center' }}>
                        <UpiQrCode upiId={branding.upiId} payeeName={sellerName} amount={net} transactionNote={billNumber} size={isA5 ? 64 : 80} />
                        <div style={{ fontSize: '9px' }}>{L('scan_to_pay')}</div>
                    </div>
                )}
                <div style={{ textAlign: 'center', minWidth: '130px' }}>
                    <div style={{ fontWeight: 700 }}>{L('for_business')} {sellerName}</div>
                    {branding?.signatureUrl ? (
                        <img src={branding.signatureUrl} alt="" style={{ height: isA5 ? '34px' : '46px', maxWidth: '150px', objectFit: 'contain', margin: '2px auto' }} />
                    ) : (
                        <div style={{ height: isA5 ? '20px' : '30px' }} />
                    )}
                    <div style={{ borderTop: '1px solid #555', paddingTop: '3px' }}>{branding?.signatureName || L('authorised_signatory')}</div>
                </div>
            </div>
        </div>
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
                        <input required type="number" min="0" step="0.01" value={form.sellingPrice || ''} onChange={e => set({ sellingPrice: Number(e.target.value) })} placeholder="0.00" style={fieldStyle} />
                    </div>
                    <div>
                        <label style={labelStyle}>MRP (₹)</label>
                        <input type="number" min="0" step="0.01" value={form.maxRetailPrice || ''} onChange={e => set({ maxRetailPrice: Number(e.target.value) })} placeholder="0.00" style={fieldStyle} />
                    </div>
                    <div>
                        <label style={labelStyle}>Purchase Rate (₹)</label>
                        <input type="number" min="0" step="0.01" value={form.purchasePrice || ''} onChange={e => set({ purchasePrice: Number(e.target.value) })} placeholder="0.00" style={fieldStyle} />
                    </div>
                    <div>
                        <label style={labelStyle}>GST %</label>
                        <input type="number" min="0" value={form.gstPct} onChange={e => set({ gstPct: Number(e.target.value) })} style={fieldStyle} />
                    </div>
                    <div>
                        <label style={labelStyle}>Stock (Boxes)</label>
                        <input type="number" min="0" value={form.quantity} onChange={e => set({ quantity: Number(e.target.value) })} style={fieldStyle} />
                    </div>
                    <div>
                        <label style={labelStyle}>Loose Pieces</label>
                        <input type="number" min="0" value={form.loosePieces} onChange={e => set({ loosePieces: Number(e.target.value) })} style={fieldStyle} />
                    </div>
                    <div>
                        <label style={labelStyle}>Pcs / Box</label>
                        <input type="number" min="1" value={form.boxCapacity} onChange={e => set({ boxCapacity: Number(e.target.value) })} style={fieldStyle} />
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
