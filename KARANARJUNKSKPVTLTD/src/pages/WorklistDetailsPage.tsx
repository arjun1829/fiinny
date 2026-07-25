import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Phone, MapPin, Calendar, MessageCircle, FileText, CheckSquare, ShoppingCart, Loader2, Trash2, Mic, TrendingUp, X, AlertTriangle, FilePen, Printer, PlusCircle, Square, Wallet, Pencil, Paperclip, Link2, Download, Package, Search } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import { useTranslation } from 'react-i18next';
import { getDoc, getDocs, query, orderBy, onSnapshot, addDoc, serverTimestamp, deleteDoc, updateDoc, where, writeBatch, arrayUnion, arrayRemove, doc as fsDoc, collection } from 'firebase/firestore';
import { generateRetailerStatement } from '../utils/statementGenerator';
import { generatePaymentId } from '../utils/paymentIdGenerator';
import { uploadPaymentProof } from '../utils/uploadPaymentProof';
import PaymentAttachmentField from '../components/PaymentAttachmentField';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantDoc, getTenantCollection } from '../utils/tenantPath';
import { useSchema } from '../contexts/SchemaContext';
import DynamicForm from '../components/DynamicForm';
import OutstandingInvoice from '../components/OutstandingInvoice';
import DatePeriodFilter from '../components/DatePeriodFilter';
import { type FinancialPeriod, getFinancialDateRange } from '../utils/financialPeriod';
import { printB2BInvoice } from '../utils/printB2BInvoice';


interface Retailer {
    id: string;
    name: string;
    number: string;
    email?: string;
    atPost?: string;
    taluka?: string;
    district?: string;
    state?: string;
    country?: string;
    gstin?: string;
    licenseNumber?: string;
    portfolioSize: string;
    location: string;
    totalSales?: number;
    totalPaid?: number;
    outstandingAmount?: number;
    lastCalledAt?: any;
    lastOrderedAt?: any;
    lastTalkedTo?: string;
    createdAt?: any;
}

interface Order {
    id: string;
    productId: string;
    productName: string;
    quantity: number;
    unit: string;
    amount: number;
    notes?: string;
    talkedTo?: string;
    paymentStatus: 'Paid' | 'Unpaid';
    isDelivered?: boolean;
    createdAt: any;
}

interface Task {
    id: string;
    title: string;
    status: string;
    dueDate?: string;
    talkedTo?: string;
    createdAt: any;
}

/** B2B sales order doc — only the fields this page reads for delete/reversal. */
interface SalesOrder {
    id: string;
    orderNumber?: string;
    invoiceNumber?: string;
    grandTotal?: number;
    netAmount?: number;
    totalAmount?: number;
    amountPaid?: number;
    paymentStatus?: string;
    [key: string]: unknown;
}

interface Note {
    id: string;
    content: string;
    talkedTo?: string;
    createdAt: any;
}

/** A recorded payment / credit against this retailer (optionally tied to an invoice). */
interface Payment {
    id: string;
    paymentId?: string;
    amount: number;
    paymentDate?: string;
    paymentMethod?: string;
    accountDetails?: { accountName?: string; transactionRef?: string };
    notes?: string;
    orderId?: string;
    orderNumber?: string;
    linkedOrderIds?: string[];
    unallocatedAmount?: number;
    attachmentUrl?: string;
    attachmentName?: string;
    attachmentType?: string;
    createdAt?: any;
}

export default function WorklistDetailsPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { userRole, tenantId } = useAuth();
    const isSales = userRole === 'sales';
    const { t } = useTranslation();
    const { getSchema: _getSchema } = useSchema(); // kept for schema referencing

    const [retailer, setRetailer] = useState<Retailer | null>(null);
    const [loading, setLoading] = useState(true);

    const [activeTab, setActiveTab] = useState<'overview' | 'tasks' | 'notes' | 'orders' | 'payments' | 'productSales'>('orders');
    const [payChartView, setPayChartView] = useState<'circle' | 'bar'>(
        () => (localStorage.getItem('partnerPayChartView') as 'circle' | 'bar') || 'circle'
    );
    const [tasks, setTasks] = useState<Task[]>([]);
    const [notes, setNoteData] = useState<Note[]>([]);
    const [orders, setOrders] = useState<Order[]>([]);
    const [salesOrders, setSalesOrders] = useState<any[]>([]);
    const [payments, setPayments] = useState<Payment[]>([]);


    // Financial Modal States
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [paymentAmount, setPaymentAmount] = useState<number>(0);
    const [paymentNotes, setPaymentNotes] = useState('');
    const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [paymentMethod, setPaymentMethod] = useState('Cash');
    const [paymentAccountName, setPaymentAccountName] = useState('');
    const [paymentTransactionRef, setPaymentTransactionRef] = useState('');
    const [isRecordingPayment, setIsRecordingPayment] = useState(false);

    // Statement download modal
    const [showStatementModal, setShowStatementModal] = useState(false);
    const [stmtFromDate, setStmtFromDate] = useState('');
    const [stmtToDate, setStmtToDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [generatingStatement, setGeneratingStatement] = useState(false);

    // Shared date period filter — drives B2B Orders, Payments, and Product Sales
    const [profilePeriod, setProfilePeriod] = useState<FinancialPeriod>('all');
    const [profileCustomFrom, setProfileCustomFrom] = useState('');
    const [profileCustomTo, setProfileCustomTo] = useState('');

    // Payments tab filters
    const [pmtStatusFilter, setPmtStatusFilter] = useState<'all' | 'available' | 'partial' | 'allocated'>('all');
    const [pmtSearch, setPmtSearch] = useState('');

    // Product Sales tab state (sort + search remain tab-specific)
    const [psSort, setPsSort] = useState<'qty_desc' | 'qty_asc' | 'recent' | 'name'>('qty_desc');
    const [psSearch, setPsSearch] = useState('');

    // Sales Order delete confirmation
    const [soToDelete, setSoToDelete] = useState<SalesOrder | null>(null);
    const [deletingSO, setDeletingSO] = useState(false);

    // Multi-select state for Sales Orders
    const [selectedSoIds, setSelectedSoIds] = useState<Set<string>>(new Set());
    const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
    const [bulkDeleting, setBulkDeleting] = useState(false);

    // Quick Paid Modal
    const [quickPaidOrder, setQuickPaidOrder] = useState<Order | null>(null);
    // Outstanding Invoice Modal
    const [showOutstandingModal, setShowOutstandingModal] = useState(false);
    const [quickPaidRemark, setQuickPaidRemark] = useState('');

    // Per-invoice payment (supports partial) — records an amount against a
    // specific sales order, updates its paid/outstanding, and logs a ledger entry.
    const [payOrder, setPayOrder] = useState<any | null>(null);
    const [payOrderAmount, setPayOrderAmount] = useState<number>(0);
    const [payOrderNote, setPayOrderNote] = useState('');
    const [payOrderDate, setPayOrderDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [payOrderMethod, setPayOrderMethod] = useState('Cash');
    const [payOrderAccountName, setPayOrderAccountName] = useState('');
    const [payOrderTransactionRef, setPayOrderTransactionRef] = useState('');
    const [isSavingOrderPayment, setIsSavingOrderPayment] = useState(false);

    // Edit an existing payment/credit entry
    const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
    const [editPayAmount, setEditPayAmount] = useState<number>(0);
    const [editPayNote, setEditPayNote] = useState('');
    const [editPayDate, setEditPayDate] = useState(''); // yyyy-mm-dd
    const [editPayMethod, setEditPayMethod] = useState('Cash');
    const [savingEditPayment, setSavingEditPayment] = useState(false);

    // Link payment to order state
    const [linkPaymentOrder, setLinkPaymentOrder] = useState<any | null>(null);
    const [linkAllocations, setLinkAllocations] = useState<Record<string, number>>({});
    const [savingLinkPayment, setSavingLinkPayment] = useState(false);

    // Unlink payment modal
    const [unlinkOrder, setUnlinkOrder] = useState<any | null>(null);
    const [unlinkAllocations, setUnlinkAllocations] = useState<any[]>([]);
    const [loadingUnlinkAllocations, setLoadingUnlinkAllocations] = useState(false);
    const [unlinkingPmtId, setUnlinkingPmtId] = useState<string | null>(null);

    // Delete payment with linked allocations
    const [deletePaymentTarget, setDeletePaymentTarget] = useState<Payment | null>(null);
    const [deletingLinkedPayment, setDeletingLinkedPayment] = useState(false);

    // Proof attachment state for each payment modal
    const [pmtProofFile, setPmtProofFile] = useState<File | null>(null);
    const [pmtProofCleared, setPmtProofCleared] = useState(false);
    const [orderPmtProofFile, setOrderPmtProofFile] = useState<File | null>(null);
    const [orderPmtProofCleared, setOrderPmtProofCleared] = useState(false);
    const [editProofFile, setEditProofFile] = useState<File | null>(null);
    const [editProofCleared, setEditProofCleared] = useState(false);

    // Form States
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [newNoteContent, setNewNoteContent] = useState('');

    // Advanced Order Form States
    const [dbProducts, setDbProducts] = useState<any[]>([]);

    // Quick-update inline payment notes per order
    const [orderNotes, setOrderNotes] = useState<Record<string, string>>({});
    const [orderPayDates, setOrderPayDates] = useState<Record<string, string>>({});

    // New Note Form States
    const [newNoteTalkedTo, setNewNoteTalkedTo] = useState('');

    useEffect(() => {
        if (!id || !tenantId) return;
        const tid = tenantId!; // For easier use in listeners

        // Retailer data — real-time listener so the financial cards & Partner
        // Analytics reflect writes (e.g. Record Payment) the instant they land,
        // instead of relying on manual re-fetches that can read stale data.
        const unsubRetailer = onSnapshot(
            getTenantDoc(db, tid, 'retailers', id),
            (docSnap) => {
                if (docSnap.exists()) {
                    setRetailer({ id: docSnap.id, ...docSnap.data() } as Retailer);
                }
                setLoading(false);
            },
            (error) => {
                console.error("Error fetching retailer: ", error);
                setLoading(false);
            }
        );

        // Fetch Products
        const unsubProducts = onSnapshot(
            getTenantCollection(db, tenantId!, 'products'),
            (snap) => { setDbProducts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))); },
            (err) => console.error('Products listener error:', err)
        );

        // Real-time listeners for subcollections
        const tasksQuery = query(getTenantCollection(db, tenantId!, 'retailers', id, 'tasks'), orderBy('createdAt', 'desc'));
        const unsubTasks = onSnapshot(
            tasksQuery,
            (snap) => { setTasks(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task))); },
            (err) => console.error('Tasks listener error:', err)
        );

        const notesQuery = query(getTenantCollection(db, tenantId!, 'retailers', id, 'notes'), orderBy('createdAt', 'desc'));
        const unsubNotes = onSnapshot(
            notesQuery,
            (snap) => { setNoteData(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Note))); },
            (err) => console.error('Notes listener error:', err)
        );

        // Payments / credits ledger (sorted client-side to avoid an index requirement)
        const unsubPayments = onSnapshot(
            getTenantCollection(db, tenantId!, 'retailers', id, 'payments'),
            (snap) => {
                const docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment));
                docs.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
                setPayments(docs);
            },
            (err) => console.error('Payments listener error:', err)
        );

        // orderBy removed — composite index not available; sort client-side instead
        const ordersQuery = query(
            getTenantCollection(db, tid, 'orders'),
            where('retailerId', '==', id)
        );
        const unsubOrders = onSnapshot(
            ordersQuery,
            (snap) => {
                const docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
                docs.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
                setOrders(docs);
            },
            (err) => console.error('Orders listener error:', err)
        );

        const salesOrdersQuery = query(
            getTenantCollection(db, tid, 'salesOrders'),
            where('retailerId', '==', id)
        );
        const unsubSalesOrders = onSnapshot(
            salesOrdersQuery,
            (snap) => {
                type SODoc = { id: string; invoiceDate?: string; createdAt?: { seconds?: number }; [key: string]: unknown };
                const docs: SODoc[] = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as SODoc));
                docs.sort((a, b) => {
                    // Primary: invoiceDate (yyyy-mm-dd string); fallback to createdAt timestamp
                    const aVal = a.invoiceDate ? a.invoiceDate : '';
                    const bVal = b.invoiceDate ? b.invoiceDate : '';
                    if (aVal && bVal) return bVal.localeCompare(aVal);
                    if (aVal) return -1;
                    if (bVal) return 1;
                    return (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0);
                });
                setSalesOrders(docs);
            },
            (err) => console.error('SalesOrders listener error:', err)
        );

        return () => {
            unsubRetailer();
            unsubTasks();
            unsubNotes();
            unsubPayments();
            unsubOrders();
            unsubSalesOrders();
            unsubProducts();
        };
    }, [id, tenantId]);

    // ─── Shared date-filter derived views (used by Orders, Payments, Product Sales) ──
    const profileRange = getFinancialDateRange(profilePeriod, profileCustomFrom, profileCustomTo);
    const profileFrom  = profileRange?.[0] ?? '';
    const profileTo    = profileRange?.[1] ?? '';

    const displaySalesOrders: any[] = profileRange
        ? salesOrders.filter((so: any) => {
            const d = so.invoiceDate || '';
            return (!profileFrom || d >= profileFrom) && (!profileTo || d <= profileTo);
        })
        : salesOrders;

    const displayPayments: Payment[] = profileRange
        ? payments.filter((p: Payment) => {
            const d = p.paymentDate || '';
            return (!profileFrom || d >= profileFrom) && (!profileTo || d <= profileTo);
        })
        : payments;

    const filteredDisplayPayments: Payment[] = displayPayments.filter(p => {
        const unallocated = Number(p.unallocatedAmount) || 0;
        const linkedCount = p.linkedOrderIds?.length ?? (p.orderId ? 1 : 0);
        // Status filter
        if (pmtStatusFilter === 'available' && unallocated <= 0) return false;
        if (pmtStatusFilter === 'partial' && !(unallocated > 0 && linkedCount > 0)) return false;
        if (pmtStatusFilter === 'allocated' && unallocated > 0) return false;
        // Search filter
        if (pmtSearch.trim()) {
            const q = pmtSearch.trim().toLowerCase();
            const refId = (p.paymentId || `#${p.id.slice(-6).toUpperCase()}`).toLowerCase();
            if (
                !refId.includes(q) &&
                !(p.notes || '').toLowerCase().includes(q) &&
                !(p.orderNumber || '').toLowerCase().includes(q) &&
                !String(Number(p.amount) || 0).includes(q)
            ) return false;
        }
        return true;
    });

    const handleWhatsApp = () => {
        if (!retailer?.number) return;
        const phone = retailer.number.replace(/\D/g, ''); // Strip non-digits
        const msg = encodeURIComponent(`Hello ${retailer.name}, this is from KaranArjun Krushi Seva Kendra.`);
        window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
    };

    const handleDownloadStatement = async () => {
        if (!tenantId || !retailer) return;
        setGeneratingStatement(true);
        try {
            // Fetch invoice branding from Firestore
            const brdSnap = await getDoc(fsDoc(collection(db, `tenants/${tenantId}/settings`), 'invoiceBranding'));
            const brd = brdSnap.exists() ? brdSnap.data() : {};

            generateRetailerStatement({
                retailer,
                salesOrders,
                payments,
                branding: {
                    businessName: brd.businessName || 'Business',
                    address: brd.address || '',
                    gstin: brd.gstin || '',
                },
                fromDate: stmtFromDate ? new Date(stmtFromDate) : null,
                toDate: stmtToDate ? new Date(stmtToDate) : null,
            });
            setShowStatementModal(false);
        } catch (e) {
            console.error('Statement generation failed:', e);
            alert('Failed to generate statement. Please try again.');
        } finally {
            setGeneratingStatement(false);
        }
    };

    const handleDeleteRetailer = async () => {
        if (!id || !tenantId) return;
        const confirmDelete = window.confirm(t('worklist.delete_confirm'));
        if (!confirmDelete) return;

        try {
            await deleteDoc(getTenantDoc(db, tenantId!, 'retailers', id));
            navigate('/worklist');
        } catch (error) {
            console.error('Error deleting retailer:', error);
            alert(t('manage_retailers.delete_error'));
        }
    };

    const handleAddTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!id || !tenantId || !newTaskTitle.trim()) return;
        try {
            await addDoc(getTenantCollection(db, tenantId!, 'retailers', id, 'tasks'), {
                title: newTaskTitle,
                status: 'Pending',
                createdAt: serverTimestamp()
            });
            setNewTaskTitle('');
        } catch (error) {
            console.error(error);
        }
    };

    const handleAddNote = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!id || !tenantId || !newNoteContent.trim()) return;
        try {
            await addDoc(getTenantCollection(db, tenantId!, 'retailers', id, 'notes'), {
                content: newNoteContent,
                talkedTo: newNoteTalkedTo,
                createdAt: serverTimestamp()
            });
            await updateDoc(getTenantDoc(db, tenantId!, 'retailers', id), {
                lastCalledAt: serverTimestamp(),
                lastTalkedTo: newNoteTalkedTo
            });
            setNewNoteContent('');
            setNewNoteTalkedTo('');
        } catch (error) {
            console.error(error);
        }
    };

    // handleAddOrder & handleEditOrder removed for legacy items

    // ─── Quick status update for B2B sales orders ───
    const updateOrderStatus = async (soId: string, field: 'status' | 'paymentStatus' | 'modeOfPayment', value: string, so: any) => {
        if (!tenantId || !id) return;
        const update: Record<string, any> = { [field]: value };

        // When marking payment as done, adjust retailer outstanding / paid
        if (field === 'paymentStatus') {
            const grandTotal = Number(so.grandTotal || so.netAmount || 0);
            const alreadyPaid = Number(so.amountPaid || 0);
            const newlyPaid = grandTotal - alreadyPaid;

            if (value === 'Paid' && so.paymentStatus !== 'Paid' && newlyPaid > 0) {
                update.amountPaid = grandTotal;
                // update retailer financials
                await updateDoc(getTenantDoc(db, tenantId, 'retailers', id), {
                    totalPaid: (Number(retailer?.totalPaid) || 0) + newlyPaid,
                    outstandingAmount: Math.max(0, (Number(retailer?.outstandingAmount) || 0) - newlyPaid),
                });
                // log payment entry — include allocation fields so it is never
                // treated as unallocated in the Link Payment modal.
                await addDoc(getTenantCollection(db, tenantId, 'retailers', id, 'payments'), {
                    amount: newlyPaid,
                    notes: `Quick mark Paid — Order ${so.orderNumber || soId.slice(-6)}`,
                    orderId: soId,
                    linkedOrderIds: [soId],
                    unallocatedAmount: 0,
                    createdAt: serverTimestamp(),
                });
            }
            if (value === 'Pending' && so.paymentStatus === 'Paid') {
                const revert = Number(so.amountPaid || so.grandTotal || 0);
                update.amountPaid = 0;
                await updateDoc(getTenantDoc(db, tenantId, 'retailers', id), {
                    totalPaid: Math.max(0, (Number(retailer?.totalPaid) || 0) - revert),
                    outstandingAmount: (Number(retailer?.outstandingAmount) || 0) + revert,
                });
            }
        }

        await updateDoc(getTenantDoc(db, tenantId, 'salesOrders', soId), update);
        // Retailer card will auto-refresh via onSnapshot
        const updatedSnap = await getDoc(getTenantDoc(db, tenantId, 'retailers', id));
        setRetailer({ id: updatedSnap.id, ...updatedSnap.data() } as Retailer);
    };

    const handleDeleteOrder = async (order: Order) => {
        if (!id || !tenantId || !window.confirm(t('worklist_details.delete_confirm'))) return;

        try {
            // Revert stock precisely with piece counting
            const p = dbProducts.find(x => x.id === order.productId);
            if (p && p.quantity !== undefined) {
                const cap = p.boxCapacity || 1;
                const stockPiecesToRevert = order.unit === 'Boxes' ? order.quantity * cap : order.quantity;

                const currentTotalPieces = (p.quantity || 0) * cap + (p.loosePieces || 0);
                const newTotalPieces = currentTotalPieces + stockPiecesToRevert;

                const newBoxes = Math.floor(newTotalPieces / cap);
                const newLoose = newTotalPieces % cap;

                await updateDoc(getTenantDoc(db, tenantId!, 'products', p.id), {
                    quantity: newBoxes >= 0 ? newBoxes : 0,
                    loosePieces: newBoxes >= 0 ? newLoose : 0
                });
            }

            // Adjust totals
            const salesSub = order.amount || 0;
            const outstandingSub = order.paymentStatus === 'Unpaid' ? salesSub : 0;

            await updateDoc(getTenantDoc(db, tenantId!, 'retailers', id), {
                totalSales: (Number(retailer?.totalSales) || 0) - salesSub,
                outstandingAmount: Math.max(0, (Number(retailer?.outstandingAmount) || 0) - outstandingSub)
            });

            // Delete doc from unified tenant-level collection
            await deleteDoc(getTenantDoc(db, tenantId!, 'orders', order.id));
            alert(t('worklist_details.stock_reverted'));

            const updatedSnap = await getDoc(getTenantDoc(db, tenantId, 'retailers', id));
            setRetailer({ id: updatedSnap.id, ...updatedSnap.data() } as Retailer);
        } catch (error) {
            console.error("Error deleting order:", error);
            alert(t('worklist_details.order_error'));
        }
    };

    // ─── Delete a B2B Sales Order (with denormalized-total reversal) ───
    // Mirrors the financial bookkeeping applied when the order was created/paid:
    // reverse its contribution to retailer totalSales / totalPaid / outstandingAmount.
    const handleDeleteSalesOrder = async (so: SalesOrder) => {
        if (!id || !tenantId || !so) return;
        setDeletingSO(true);
        try {
            const salesSub = Number(so.grandTotal ?? so.netAmount ?? so.totalAmount ?? 0);
            const paidSub = Number(so.amountPaid ?? (so.paymentStatus === 'Paid' ? salesSub : 0));
            const outstandingSub = Math.max(0, salesSub - paidSub);

            await updateDoc(getTenantDoc(db, tenantId, 'retailers', id), {
                totalSales: Math.max(0, (Number(retailer?.totalSales) || 0) - salesSub),
                totalPaid: Math.max(0, (Number(retailer?.totalPaid) || 0) - paidSub),
                outstandingAmount: Math.max(0, (Number(retailer?.outstandingAmount) || 0) - outstandingSub),
            });

            // Delete the order doc (the salesOrders listener removes the card automatically).
            await deleteDoc(getTenantDoc(db, tenantId, 'salesOrders', so.id));

            // Refresh retailer totals into state (same idiom used across this page).
            const updatedSnap = await getDoc(getTenantDoc(db, tenantId, 'retailers', id));
            setRetailer({ id: updatedSnap.id, ...updatedSnap.data() } as Retailer);

            setSoToDelete(null);
        } catch (error) {
            console.error('Error deleting sales order:', error);
            alert(t('worklist_details.order_error'));
        } finally {
            setDeletingSO(false);
        }
    };

    // ─── Multi-select helpers ───
    const toggleSoSelection = (soId: string) => {
        setSelectedSoIds(prev => {
            const next = new Set(prev);
            if (next.has(soId)) next.delete(soId); else next.add(soId);
            return next;
        });
    };

    const handleSelectAllSOs = () => setSelectedSoIds(new Set(displaySalesOrders.map((so: any) => so.id)));
    const handleClearSoSelection = () => setSelectedSoIds(new Set());

    // Bulk delete: sequentially apply the same financial reversal as single delete
    const handleBulkDeleteConfirm = async () => {
        if (!id || !tenantId) return;
        setBulkDeleting(true);
        try {
            const selected = salesOrders.filter((so: any) => selectedSoIds.has(so.id));

            // Compute aggregate financial reversal
            let totalSalesReversal = 0;
            let totalPaidReversal = 0;
            let totalOutstandingReversal = 0;

            for (const so of selected) {
                const salesSub = Number(so.grandTotal ?? so.netAmount ?? so.totalAmount ?? 0);
                const paidSub = Number(so.amountPaid ?? (so.paymentStatus === 'Paid' ? salesSub : 0));
                const outstandingSub = Math.max(0, salesSub - paidSub);
                totalSalesReversal += salesSub;
                totalPaidReversal += paidSub;
                totalOutstandingReversal += outstandingSub;
            }

            // Apply the aggregate reversal to the retailer doc in one write
            await updateDoc(getTenantDoc(db, tenantId, 'retailers', id), {
                totalSales: Math.max(0, (Number(retailer?.totalSales) || 0) - totalSalesReversal),
                totalPaid: Math.max(0, (Number(retailer?.totalPaid) || 0) - totalPaidReversal),
                outstandingAmount: Math.max(0, (Number(retailer?.outstandingAmount) || 0) - totalOutstandingReversal),
            });

            // Delete all selected order docs
            await Promise.all(
                selected.map((so: any) => deleteDoc(getTenantDoc(db, tenantId, 'salesOrders', so.id)))
            );

            // Re-fetch retailer to sync state (same idiom as single delete)
            const updatedSnap = await getDoc(getTenantDoc(db, tenantId, 'retailers', id));
            setRetailer({ id: updatedSnap.id, ...updatedSnap.data() } as Retailer);

            setSelectedSoIds(new Set());
            setShowBulkDeleteModal(false);
        } catch (error) {
            console.error('Error bulk-deleting sales orders:', error);
            alert('Error deleting orders. Please try again.');
        } finally {
            setBulkDeleting(false);
        }
    };

    const handleQuickPaid = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!id || !tenantId || !quickPaidOrder) return;

        try {
            const amount = quickPaidOrder.amount || 0;
            const remark = quickPaidRemark ? ` | Paid: ${quickPaidRemark}` : ' | Paid via Quick Mark';

            await updateDoc(getTenantDoc(db, tenantId!, 'orders', quickPaidOrder.id), {
                paymentStatus: 'Paid',
                notes: (quickPaidOrder.notes || '') + remark
            });

            // Log payment entry — include allocation fields so it is never
            // treated as unallocated in the Link Payment modal.
            await addDoc(getTenantCollection(db, tenantId!, 'retailers', id, 'payments'), {
                amount: amount,
                notes: `Quick Payment for Order ${quickPaidOrder.id.substring(0, 5)}: ${quickPaidRemark}`,
                orderId: quickPaidOrder.id,
                linkedOrderIds: [],
                unallocatedAmount: 0,
                createdAt: serverTimestamp()
            });

            // Update retailer
            await updateDoc(getTenantDoc(db, tenantId!, 'retailers', id), {
                totalPaid: (Number(retailer?.totalPaid) || 0) + amount,
                outstandingAmount: Math.max(0, (Number(retailer?.outstandingAmount) || 0) - amount)
            });

            setQuickPaidOrder(null);
            setQuickPaidRemark('');
            alert(t('worklist_details.mark_as_paid'));

            const updatedSnap = await getDoc(getTenantDoc(db, tenantId!, 'retailers', id));
            setRetailer({ id: updatedSnap.id, ...updatedSnap.data() } as Retailer);
        } catch (error) {
            console.error("Quick Paid error:", error);
            alert(t('worklist_details.update_error'));
        }
    };

    // handleToggleDelivered removed

    const handleRecordPayment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!id || !tenantId || paymentAmount <= 0) return;
        setIsRecordingPayment(true);

        try {
            const pmtId = await generatePaymentId(tenantId);
            const accountDetails = { accountName: paymentAccountName.trim(), transactionRef: paymentTransactionRef.trim() };
            const proofData: Record<string, string> = {};
            if (pmtProofFile) {
                const meta = await uploadPaymentProof(tenantId, pmtId, pmtProofFile);
                proofData.attachmentUrl = meta.url;
                proofData.attachmentName = meta.name;
                proofData.attachmentType = meta.type;
            }

            await addDoc(getTenantCollection(db, tenantId, 'retailers', id, 'payments'), {
                paymentId: pmtId,
                amount: paymentAmount,
                paymentDate,
                paymentMethod,
                accountDetails,
                notes: paymentNotes,
                linkedOrderIds: [],
                unallocatedAmount: paymentAmount,
                ...proofData,
                createdAt: serverTimestamp(),
            });

            const currentPaid = Number(retailer?.totalPaid || 0);
            const currentOutstanding = Number(retailer?.outstandingAmount || 0);

            await updateDoc(getTenantDoc(db, tenantId, 'retailers', id), {
                totalPaid: currentPaid + paymentAmount,
                outstandingAmount: Math.max(0, currentOutstanding - paymentAmount),
            });

            const updatedSnap = await getDoc(getTenantDoc(db, tenantId, 'retailers', id));
            setRetailer({ id: updatedSnap.id, ...updatedSnap.data() } as Retailer);

            setShowPaymentModal(false);
            setPaymentAmount(0);
            setPaymentNotes('');
            setPaymentDate(new Date().toISOString().slice(0, 10));
            setPaymentMethod('Cash');
            setPaymentAccountName('');
            setPaymentTransactionRef('');
            setPmtProofFile(null);
            setPmtProofCleared(false);
            alert(t('worklist_details.payment_success'));
        } catch (error) {
            console.error("Error recording payment:", error);
            alert(t('worklist_details.update_error') + ': ' + ((error as { message?: string })?.message || String(error)));
        } finally {
            setIsRecordingPayment(false);
        }
    };

    // ─── Record a payment against a single sales order (partial or full) ───
    // Applies the amount to that order's amountPaid, recomputes its paymentStatus
    // (Paid when fully settled, else Partial), logs a ledger entry under the
    // retailer's payments subcollection, and rolls the amount up to retailer totals.
    const handleAddOrderPayment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!id || !tenantId || !payOrder) return;

        const grandTotal = Number(payOrder.grandTotal ?? payOrder.netAmount ?? payOrder.totalAmount ?? 0);
        const alreadyPaid = Number(payOrder.amountPaid ?? 0);
        const remaining = Math.max(0, grandTotal - alreadyPaid);
        // Never over-apply beyond what's outstanding on this invoice.
        const applied = Math.min(Number(payOrderAmount) || 0, remaining);
        if (applied <= 0) return;

        setIsSavingOrderPayment(true);
        try {
            const newPaid = alreadyPaid + applied;
            const newStatus = newPaid >= grandTotal ? 'Paid' : 'Partial';
            const orderLabel = payOrder.orderNumber || payOrder.invoiceNumber || payOrder.id.slice(-6);

            // 1. Update the sales order's paid amount + status
            await updateDoc(getTenantDoc(db, tenantId, 'salesOrders', payOrder.id), {
                amountPaid: newPaid,
                paymentStatus: newStatus,
            });

            // 2. Log a ledger entry (the "credit entry") tied to this invoice
            const pmtId = await generatePaymentId(tenantId);
            const orderProofData: Record<string, string> = {};
            if (orderPmtProofFile) {
                const meta = await uploadPaymentProof(tenantId, pmtId, orderPmtProofFile);
                orderProofData.attachmentUrl = meta.url;
                orderProofData.attachmentName = meta.name;
                orderProofData.attachmentType = meta.type;
            }
            await addDoc(getTenantCollection(db, tenantId, 'retailers', id, 'payments'), {
                paymentId: pmtId,
                amount: applied,
                paymentDate: payOrderDate,
                paymentMethod: payOrderMethod,
                accountDetails: { accountName: payOrderAccountName.trim(), transactionRef: payOrderTransactionRef.trim() },
                notes: payOrderNote,
                orderId: payOrder.id,
                orderNumber: orderLabel,
                linkedOrderIds: [payOrder.id],
                unallocatedAmount: 0,
                ...orderProofData,
                createdAt: serverTimestamp(),
            });

            // 3. Roll up to retailer totals (cards refresh via the retailer listener)
            await updateDoc(getTenantDoc(db, tenantId, 'retailers', id), {
                totalPaid: (Number(retailer?.totalPaid) || 0) + applied,
                outstandingAmount: Math.max(0, (Number(retailer?.outstandingAmount) || 0) - applied),
            });

            setPayOrder(null);
            setPayOrderAmount(0);
            setPayOrderNote('');
            setPayOrderDate(new Date().toISOString().slice(0, 10));
            setPayOrderMethod('Cash');
            setPayOrderAccountName('');
            setPayOrderTransactionRef('');
            setOrderPmtProofFile(null);
            setOrderPmtProofCleared(false);
            alert(`₹${applied.toLocaleString()} recorded against ${orderLabel}` + (newStatus === 'Paid' ? ' — fully paid.' : ' — partially paid.'));
        } catch (error) {
            console.error("Error recording invoice payment:", error);
            alert(t('worklist_details.update_error') + ': ' + ((error as { message?: string })?.message || String(error)));
        } finally {
            setIsSavingOrderPayment(false);
        }
    };

    // Apply a change of `delta` in paid-amount to the retailer totals and, if the
    // payment was tied to an invoice, to that invoice's amountPaid + status.
    // delta > 0 means more was paid; delta < 0 means a payment shrank / was removed.
    const applyPaymentDelta = async (delta: number, orderId?: string) => {
        if (!id || !tenantId || delta === 0) return;

        await updateDoc(getTenantDoc(db, tenantId, 'retailers', id), {
            totalPaid: Math.max(0, (Number(retailer?.totalPaid) || 0) + delta),
            outstandingAmount: Math.max(0, (Number(retailer?.outstandingAmount) || 0) - delta),
        });

        if (orderId) {
            const so = salesOrders.find((o: any) => o.id === orderId);
            if (so) {
                const grandTotal = Number(so.grandTotal ?? so.netAmount ?? so.totalAmount ?? 0);
                const newPaid = Math.min(grandTotal, Math.max(0, (Number(so.amountPaid) || 0) + delta));
                const newStatus = newPaid <= 0 ? 'Pending' : (newPaid >= grandTotal ? 'Paid' : 'Partial');
                await updateDoc(getTenantDoc(db, tenantId, 'salesOrders', orderId), {
                    amountPaid: newPaid,
                    paymentStatus: newStatus,
                });
            }
        }
    };

    const handleDeletePayment = async (p: Payment) => {
        if (!id || !tenantId) return;

        // If payment has linked order allocations, route through the confirmation modal
        if ((p.linkedOrderIds?.length ?? 0) > 0) {
            setDeletePaymentTarget(p);
            return;
        }

        if (!window.confirm(`Delete this payment of ₹${Number(p.amount || 0).toLocaleString()}? Totals will be adjusted.`)) return;
        try {
            // Reverse its effect (delta = -amount), then remove the ledger entry.
            await applyPaymentDelta(-(Number(p.amount) || 0), p.orderId);
            await deleteDoc(getTenantDoc(db, tenantId, 'retailers', id, 'payments', p.id));
        } catch (error) {
            console.error("Error deleting payment:", error);
            alert(t('worklist_details.update_error') + ': ' + ((error as { message?: string })?.message || String(error)));
        }
    };

    const openEditPayment = (p: Payment) => {
        setEditingPayment(p);
        setEditPayAmount(Number(p.amount) || 0);
        setEditPayNote(p.notes || '');
        setEditPayMethod(p.paymentMethod || 'Cash');
        setEditProofFile(null);
        setEditProofCleared(false);
        if (p.paymentDate) {
            setEditPayDate(p.paymentDate);
        } else {
            const d = p.createdAt?.toDate ? p.createdAt.toDate() : null;
            setEditPayDate(d ? d.toISOString().slice(0, 10) : '');
        }
    };

    const handleUpdatePayment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!id || !tenantId || !editingPayment) return;
        const newAmount = Number(editPayAmount) || 0;
        if (newAmount <= 0) return;
        setSavingEditPayment(true);
        try {
            const delta = newAmount - (Number(editingPayment.amount) || 0);
            if (delta !== 0) await applyPaymentDelta(delta, editingPayment.orderId);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const update: Record<string, any> = { amount: newAmount, notes: editPayNote, paymentMethod: editPayMethod };
            if (editPayDate) { update.paymentDate = editPayDate; update.createdAt = new Date(editPayDate); }
            if (editProofFile) {
                const meta = await uploadPaymentProof(tenantId, editingPayment.id, editProofFile);
                update.attachmentUrl = meta.url;
                update.attachmentName = meta.name;
                update.attachmentType = meta.type;
            } else if (editProofCleared) {
                update.attachmentUrl = null;
                update.attachmentName = null;
                update.attachmentType = null;
            }

            await updateDoc(getTenantDoc(db, tenantId, 'retailers', id, 'payments', editingPayment.id), update);
            setEditingPayment(null);
            setEditProofFile(null);
            setEditProofCleared(false);
        } catch (error) {
            console.error("Error updating payment:", error);
            alert(t('worklist_details.update_error') + ': ' + ((error as { message?: string })?.message || String(error)));
        } finally {
            setSavingEditPayment(false);
        }
    };


    // Payments with remaining unallocated balance — used for Link Payment modal.
    // Old payments (recorded before unallocatedAmount was introduced) don't have the field.
    // A payment without orderId was a general Record-Payment entry — treat its full amount as unallocated.
    // A payment with orderId was already applied directly to one invoice — treat as 0.
    const getEffectiveUnallocated = (p: Payment): number => {
        if (p.unallocatedAmount !== undefined) return Number(p.unallocatedAmount) || 0;
        return p.orderId ? 0 : Number(p.amount) || 0;
    };
    const availablePayments = payments.filter(p => getEffectiveUnallocated(p) > 0);

    // Derived financials
    // Total Sales = sum of all B2B sales order amounts
    // Amount Paid = sum of ALL received payments (linked or unlinked)
    // Outstanding  = Total Sales − Amount Paid
    const computedTotalSales = salesOrders.reduce((s: number, so: any) =>
        s + Number(so.grandTotal ?? so.netAmount ?? so.totalAmount ?? 0), 0);
    const computedTotalPaid = payments.reduce((s: number, p: Payment) =>
        s + Number(p.amount ?? 0), 0);
    const computedOutstanding = Math.max(0, computedTotalSales - computedTotalPaid);

    // Product Sales aggregation — derived from displaySalesOrders (shared date filter)
    const productSalesData = (() => {
        const filtered = displaySalesOrders;

        const map: Record<string, { productName: string; totalQty: number; paidQty: number; unpaidQty: number; invoiceCount: number; lastInvoiceDate: string; firstInvoiceDate: string }> = {};

        for (const so of filtered) {
            const invDate: string = so.invoiceDate || '';
            const isPaid = (so.paymentStatus || '').toLowerCase() === 'paid';
            const items: any[] = so.lineItems || so.items || [];
            for (const item of items) {
                const name: string = (item.productName || item.itemDescription || '').trim();
                if (!name) continue;
                const qty = Number(item.qty ?? item.quantity ?? 0);
                if (!map[name]) {
                    map[name] = { productName: name, totalQty: 0, paidQty: 0, unpaidQty: 0, invoiceCount: 0, lastInvoiceDate: '', firstInvoiceDate: '' };
                }
                map[name].totalQty += qty;
                if (isPaid) { map[name].paidQty += qty; } else { map[name].unpaidQty += qty; }
                map[name].invoiceCount += 1;
                if (invDate) {
                    if (!map[name].lastInvoiceDate || invDate > map[name].lastInvoiceDate) map[name].lastInvoiceDate = invDate;
                    if (!map[name].firstInvoiceDate || invDate < map[name].firstInvoiceDate) map[name].firstInvoiceDate = invDate;
                }
            }
        }

        let rows = Object.values(map);
        if (psSearch.trim()) {
            const q = psSearch.trim().toLowerCase();
            rows = rows.filter(r => r.productName.toLowerCase().includes(q));
        }
        if (psSort === 'qty_desc') rows.sort((a, b) => b.totalQty - a.totalQty);
        else if (psSort === 'qty_asc') rows.sort((a, b) => a.totalQty - b.totalQty);
        else if (psSort === 'recent') rows.sort((a, b) => b.lastInvoiceDate.localeCompare(a.lastInvoiceDate));
        else rows.sort((a, b) => a.productName.localeCompare(b.productName));
        return rows;
    })();

    // Link an existing unallocated payment to a sales order
    const handleLinkPayments = async () => {
        if (!linkPaymentOrder || !tenantId || !id) return;

        const grandTotal = Number(linkPaymentOrder.grandTotal ?? linkPaymentOrder.netAmount ?? linkPaymentOrder.totalAmount ?? 0);
        const alreadyPaid = Number(linkPaymentOrder.amountPaid ?? 0);
        const remaining = Math.max(0, grandTotal - alreadyPaid);

        const entries = Object.entries(linkAllocations)
            .map(([pmtId, amt]) => {
                const pmt = availablePayments.find(p => p.id === pmtId);
                // Use getEffectiveUnallocated so old payments without the
                // unallocatedAmount field are handled correctly (they carry their
                // full amount as available rather than being silently capped to 0).
                return { pmtId, amt: Math.min(Number(amt) || 0, pmt ? getEffectiveUnallocated(pmt) : 0) };
            })
            .filter(({ amt }) => amt > 0);

        if (entries.length === 0) return;

        const totalToAllocate = entries.reduce((s, { amt }) => s + amt, 0);
        if (totalToAllocate > remaining + 0.01) {
            alert(`Total allocation (₹${totalToAllocate.toLocaleString()}) exceeds outstanding (₹${remaining.toLocaleString()}).`);
            return;
        }

        setSavingLinkPayment(true);
        try {
            const batch = writeBatch(db);
            const linkedPmtIds: string[] = [];

            for (const { pmtId, amt } of entries) {
                const pmt = payments.find(p => p.id === pmtId);
                if (!pmt) continue;

                // Allocation record
                const allocColRef = getTenantCollection(db, tenantId, 'retailers', id, 'paymentAllocations');
                const allocRef = fsDoc(allocColRef);
                batch.set(allocRef, {
                    orderId: linkPaymentOrder.id,
                    orderNumber: linkPaymentOrder.orderNumber || linkPaymentOrder.invoiceNumber || linkPaymentOrder.id.slice(-6),
                    paymentId: pmt.id,
                    paymentIdDisplay: pmt.paymentId || `#${pmt.id.slice(-6).toUpperCase()}`,
                    allocatedAmount: amt,
                    allocatedAt: serverTimestamp(),
                });

                // Reduce payment's unallocated balance (handle old payments that lack the field)
                const pmtRef = getTenantDoc(db, tenantId, 'retailers', id, 'payments', pmtId);
                batch.update(pmtRef, {
                    unallocatedAmount: Math.max(0, getEffectiveUnallocated(pmt) - amt),
                    linkedOrderIds: arrayUnion(linkPaymentOrder.id),
                });

                linkedPmtIds.push(pmtId);
            }

            // Update order amountPaid + status
            const newPaid = alreadyPaid + totalToAllocate;
            const newOutstanding = Math.max(0, grandTotal - newPaid);
            const newStatus = newOutstanding <= 0 ? 'Paid' : newPaid > 0 ? 'Partial' : 'Pending';

            const orderRef = getTenantDoc(db, tenantId, 'salesOrders', linkPaymentOrder.id);
            batch.update(orderRef, {
                amountPaid: newPaid,
                paymentStatus: newStatus,
                linkedPaymentIds: arrayUnion(...linkedPmtIds),
            });

            await batch.commit();

            setLinkPaymentOrder(null);
            setLinkAllocations({});
            alert(`₹${totalToAllocate.toLocaleString()} linked — ${newStatus === 'Paid' ? 'Order fully paid! ✅' : `₹${newOutstanding.toLocaleString()} still outstanding.`}`);
        } catch (error) {
            console.error('Error linking payment:', error);
            alert('Error linking payment. Please try again.');
        } finally {
            setSavingLinkPayment(false);
        }
    };

    // ─── Open Unlink Payments modal for a sales order ───
    const handleOpenUnlinkModal = async (so: any) => {
        if (!tenantId || !id) return;
        setUnlinkOrder(so);
        setLoadingUnlinkAllocations(true);
        try {
            const allocQuery = query(
                getTenantCollection(db, tenantId, 'retailers', id, 'paymentAllocations'),
                where('orderId', '==', so.id)
            );
            const snap = await getDocs(allocQuery);
            setUnlinkAllocations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) {
            console.error('Error fetching allocations:', e);
        } finally {
            setLoadingUnlinkAllocations(false);
        }
    };

    // ─── Unlink a single payment allocation from a sales order ───
    const handleUnlinkPayment = async (allocation: any) => {
        if (!tenantId || !id || !unlinkOrder) return;
        setUnlinkingPmtId(allocation.id);
        try {
            const batch = writeBatch(db);

            // Delete the allocation record
            const allocRef = getTenantDoc(db, tenantId, 'retailers', id, 'paymentAllocations', allocation.id);
            batch.delete(allocRef);

            // Restore payment's unallocated balance
            const pmtRef = getTenantDoc(db, tenantId, 'retailers', id, 'payments', allocation.paymentId);
            const pmtSnap = await getDoc(pmtRef);
            if (pmtSnap.exists()) {
                batch.update(pmtRef, {
                    unallocatedAmount: (Number(pmtSnap.data().unallocatedAmount) || 0) + allocation.allocatedAmount,
                    linkedOrderIds: arrayRemove(unlinkOrder.id),
                });
            }

            // Reverse allocation on the sales order
            const grandTotal = Number(unlinkOrder.grandTotal ?? unlinkOrder.netAmount ?? unlinkOrder.totalAmount ?? 0);
            const newPaid = Math.max(0, (Number(unlinkOrder.amountPaid) || 0) - allocation.allocatedAmount);
            const newStatus = newPaid <= 0 ? 'Pending' : (newPaid >= grandTotal ? 'Paid' : 'Partial');
            const orderRef = getTenantDoc(db, tenantId, 'salesOrders', unlinkOrder.id);
            batch.update(orderRef, {
                amountPaid: newPaid,
                paymentStatus: newStatus,
                linkedPaymentIds: arrayRemove(allocation.paymentId),
            });

            await batch.commit();

            // Update local modal state so changes are visible immediately
            setUnlinkAllocations(prev => prev.filter(a => a.id !== allocation.id));
            setUnlinkOrder((prev: any) => ({ ...prev, amountPaid: newPaid, paymentStatus: newStatus }));
        } catch (e) {
            console.error('Error unlinking payment:', e);
            alert('Error unlinking payment. Please try again.');
        } finally {
            setUnlinkingPmtId(null);
        }
    };

    // ─── Delete a payment that has linked order allocations ───
    // Reverses every allocation, then deletes the payment and adjusts retailer totals.
    const handleDeletePaymentConfirmed = async () => {
        if (!id || !tenantId || !deletePaymentTarget) return;
        const p = deletePaymentTarget;
        setDeletingLinkedPayment(true);
        try {
            const allocQuery = query(
                getTenantCollection(db, tenantId, 'retailers', id, 'paymentAllocations'),
                where('paymentId', '==', p.id)
            );
            const allocSnap = await getDocs(allocQuery);

            const batch = writeBatch(db);

            for (const allocDoc of allocSnap.docs) {
                const alloc = allocDoc.data();
                // Reverse amountPaid on each affected sales order
                const orderRef = getTenantDoc(db, tenantId, 'salesOrders', alloc.orderId);
                const orderSnap = await getDoc(orderRef);
                if (orderSnap.exists()) {
                    const od = orderSnap.data();
                    const gt = Number(od.grandTotal ?? od.netAmount ?? od.totalAmount ?? 0);
                    const np = Math.max(0, (Number(od.amountPaid) || 0) - alloc.allocatedAmount);
                    const ns = np <= 0 ? 'Pending' : (np >= gt ? 'Paid' : 'Partial');
                    batch.update(orderRef, { amountPaid: np, paymentStatus: ns, linkedPaymentIds: arrayRemove(p.id) });
                }
                batch.delete(allocDoc.ref);
            }

            // Delete the payment doc
            batch.delete(getTenantDoc(db, tenantId, 'retailers', id, 'payments', p.id));

            await batch.commit();

            // Adjust retailer-level totals for the payment amount
            await applyPaymentDelta(-(Number(p.amount) || 0), undefined);

            setDeletePaymentTarget(null);
        } catch (e) {
            console.error('Error deleting linked payment:', e);
            alert(t('worklist_details.update_error'));
        } finally {
            setDeletingLinkedPayment(false);
        }
    };

    // Invoice helpers using new engine removed for legacy orders



    const [isListening, setIsListening] = useState(false);

    const toggleListen = () => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert(t('common.voice_typing_unsupported'));
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = 'en-IN';
        recognition.continuous = false;
        recognition.interimResults = false;

        recognition.onstart = () => setIsListening(true);
        recognition.onresult = (event: any) => {
            const transcript = event.results[0][0].transcript;
            setNewNoteContent((prev) => prev ? `${prev} ${transcript}` : transcript);
        };
        recognition.onerror = (event: any) => {
            console.error("Speech recognition error", event.error);
            setIsListening(false);
        };
        recognition.onend = () => setIsListening(false);

        recognition.start();
    };

    if (loading) {
        return <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}><Loader2 className="animate-spin" style={{ margin: '0 auto', marginBottom: '1rem' }} /> {t('common.loading')}</div>;
    }

    if (!retailer) {
        return <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>{t('manage_retailers.not_found')}</div>;
    }

    return (
        <>
        <div className="animate-fade-in" style={{ maxWidth: '1000px', margin: '0 auto' }}>
            <button
                className="btn btn-secondary"
                style={{ padding: '0.5rem 1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}
                onClick={() => navigate('/worklist')}
            >
                <ArrowLeft size={16} /> {t('worklist_details.back_to_worklist')}
            </button>

            {/* View-only notice for sales users */}
            {isSales && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.6rem 1rem', marginBottom: '1rem', background: 'hsla(45,93%,47%,0.08)', border: '1px solid hsla(45,93%,47%,0.25)', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--secondary-dark)' }}>
                    👁 View-only mode — you can inspect all data but cannot modify orders, payments or notes.
                </div>
            )}

            {/* Header Profile Card */}
            <div className="glass-panel" style={{ padding: '2rem', marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                    <div style={{ width: '80px', height: '80px', borderRadius: '20px', background: 'linear-gradient(135deg, var(--primary-dark), var(--primary))', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--neon-glow)' }}>
                        <User size={40} color="white" />
                    </div>
                    <div>
                        <h1 style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>{retailer.name}</h1>
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            {t(`onboarding.portfolio_${retailer.portfolioSize?.split(' ')[0].toLowerCase()}`)} {t('manage_retailers.retailer_type').split(':')[0]}
                        </div>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                            <MapPin size={14} /> {retailer.atPost || ''} {retailer.taluka ? `| ${retailer.taluka}` : ''} {retailer.district ? `| ${retailer.district}` : ''}
                        </span>
                        <button
                            onClick={() => setShowStatementModal(true)}
                            style={{ marginTop: '0.6rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.9rem', background: 'hsla(152,60%,40%,0.1)', border: '1px solid hsla(152,60%,40%,0.3)', borderRadius: '8px', color: 'var(--primary-light)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                        >
                            <Download size={14} /> Download Statement
                        </button>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                        {retailer.gstin && <span>GSTIN: {retailer.gstin}</span>}
                        {retailer.licenseNumber && <span>Lic: {retailer.licenseNumber}</span>}
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    {!isSales && (
                        <button onClick={() => setShowPaymentModal(true)} className="btn btn-primary animate-pulse" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', fontSize: '0.875rem' }}>
                            ₹ {t('worklist_details.record_payment')}
                        </button>
                    )}
                    {retailer?.number && (
                        <a href={`tel:${retailer.number}`} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', fontSize: '0.875rem', textDecoration: 'none' }}>
                            <Phone size={16} /> {t('worklist_details.call')}
                        </a>
                    )}
                    <button onClick={handleWhatsApp} className="btn" style={{ background: '#25D366', color: 'white', padding: '0.5rem 1rem', fontSize: '0.875rem' }}>
                        <MessageCircle size={16} /> {t('worklist_details.whatsapp')}
                    </button>
                    {userRole === 'admin' && (
                        <button onClick={handleDeleteRetailer} className="btn" style={{ background: 'hsla(0, 84%, 60%, 0.1)', color: 'var(--danger)', padding: '0.5rem 1rem', fontSize: '0.875rem', border: '1px solid hsla(0, 84%, 60%, 0.2)' }}>
                            <Trash2 size={16} /> {t('worklist_details.delete')}
                        </button>
                    )}
                </div>
            </div>

            {/* Financial Overview Cards — derived from live snapshots */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                <div className="glass-panel" style={{ padding: '1.5rem', borderLeft: '4px solid var(--secondary)' }}>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>Total Sales</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>₹{computedTotalSales.toLocaleString()}</div>
                </div>
                <div className="glass-panel" style={{ padding: '1.5rem', borderLeft: '4px solid var(--primary)' }}>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>{t('worklist_details.amount_paid')}</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--primary-light)' }}>₹{computedTotalPaid.toLocaleString()}</div>
                </div>
                <div className="glass-panel" style={{ padding: '1.5rem', borderLeft: `4px solid ${computedOutstanding > 0 ? 'var(--danger)' : '#10b981'}`, background: computedOutstanding > 0 ? 'hsla(0, 84%, 60%, 0.05)' : 'transparent' }}>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>{t('worklist_details.outstanding_dues')}</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: computedOutstanding > 0 ? 'var(--danger)' : '#10b981' }}>
                        ₹{computedOutstanding.toLocaleString()}
                        {computedOutstanding <= 0 && computedTotalSales > 0 && <span style={{ fontSize: '0.9rem', marginLeft: '0.4rem' }}>✅</span>}
                    </div>
                </div>
            </div>

            {/* ── Partner Analytics ── */}
            {salesOrders.length > 0 && (() => {
                const paidPct = computedTotalSales > 0
                    ? Math.min(100, Math.round((computedTotalPaid / computedTotalSales) * 100))
                    : 0;
                const pctColor = paidPct >= 100 ? '#10b981' : paidPct >= 60 ? '#f59e0b' : '#ef4444';
                const pieData = [
                    { name: 'Paid', value: computedTotalPaid > 0 ? computedTotalPaid : 0 },
                    { name: 'Outstanding', value: computedOutstanding > 0 ? computedOutstanding : 0 },
                ];
                const hasPieData = pieData[0].value + pieData[1].value > 0;

                // Order trend: group salesOrders by month (last 6)
                const monthMap: Record<string, number> = {};
                salesOrders.forEach((so: any) => {
                    const d = so.createdAt?.toDate ? so.createdAt.toDate() : null;
                    if (!d) return;
                    const key = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
                    monthMap[key] = (monthMap[key] || 0) + Number(so.grandTotal ?? so.netAmount ?? so.totalAmount ?? 0);
                });
                const trendData = Object.entries(monthMap)
                    .map(([month, value]) => ({ month, value }))
                    .slice(-6);

                return (
                    <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
                        {/* Header + view switcher */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                            <h3 style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>Partner Analytics</h3>
                            <div style={{ display: 'flex', gap: '0.2rem', background: 'var(--surface-base)', borderRadius: '8px', padding: '0.2rem', border: '1px solid var(--surface-border)' }}>
                                {([['circle', '◉ Circular'], ['bar', '▬ Progress Bar']] as const).map(([val, label]) => (
                                    <button
                                        key={val}
                                        onClick={() => { setPayChartView(val); localStorage.setItem('partnerPayChartView', val); }}
                                        style={{ padding: '0.28rem 0.75rem', borderRadius: '6px', border: 'none', background: payChartView === val ? 'var(--primary-light)' : 'transparent', color: payChartView === val ? '#fff' : 'var(--text-tertiary)', fontWeight: payChartView === val ? 700 : 500, fontSize: '0.71rem', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', whiteSpace: 'nowrap' }}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* ── Circular / Doughnut View ── */}
                        {payChartView === 'circle' && (
                            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1.5rem' }}>
                                {/* Doughnut chart with centre label */}
                                <div style={{ position: 'relative', width: 164, height: 164, flexShrink: 0 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={hasPieData ? pieData : [{ name: 'empty', value: 1 }]}
                                                cx="50%" cy="50%"
                                                innerRadius={52} outerRadius={74}
                                                startAngle={90} endAngle={-270}
                                                dataKey="value"
                                                strokeWidth={0}
                                                paddingAngle={hasPieData && pieData[0].value > 0 && pieData[1].value > 0 ? 2 : 0}
                                            >
                                                {hasPieData ? (
                                                    <>
                                                        <Cell fill="#10b981" />
                                                        <Cell fill={paidPct >= 100 ? '#10b98133' : '#ef4444'} />
                                                    </>
                                                ) : (
                                                    <Cell fill="var(--surface-border)" />
                                                )}
                                            </Pie>
                                        </PieChart>
                                    </ResponsiveContainer>
                                    {/* Centre text overlay */}
                                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', pointerEvents: 'none' }}>
                                        <div style={{ fontWeight: 800, fontSize: '1.55rem', color: pctColor, lineHeight: 1 }}>{paidPct}%</div>
                                        <div style={{ fontSize: '0.58rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: '0.2rem' }}>Paid</div>
                                    </div>
                                </div>

                                {/* Metric rows */}
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.85rem', minWidth: 160 }}>
                                    {[
                                        { label: 'Total Sales',    value: `₹${computedTotalSales.toLocaleString()}`,   dot: 'var(--secondary)',                                        bold: false },
                                        { label: 'Amount Paid',    value: `₹${computedTotalPaid.toLocaleString()}`,    dot: '#10b981',                                                 bold: true  },
                                        { label: 'Outstanding',    value: `₹${computedOutstanding.toLocaleString()}`,  dot: computedOutstanding > 0 ? '#ef4444' : '#10b981',           bold: true  },
                                        { label: 'Completion',     value: `${paidPct}%`,                               dot: pctColor,                                                  bold: true  },
                                    ].map(m => (
                                        <div key={m.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.dot, flexShrink: 0, display: 'inline-block' }} />
                                                {m.label}
                                            </span>
                                            <span style={{ fontWeight: m.bold ? 700 : 500, fontSize: '0.88rem', color: m.dot }}>{m.value}</span>
                                        </div>
                                    ))}
                                    {paidPct >= 100 && computedTotalSales > 0 && (
                                        <div style={{ fontSize: '0.78rem', color: '#10b981', fontWeight: 600, marginTop: '0.1rem' }}>Fully settled ✅</div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ── Progress Bar View ── */}
                        {payChartView === 'bar' && (
                            <div style={{ marginBottom: '1.5rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' }}>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Payment Completion</span>
                                    <span style={{ fontSize: '1.1rem', fontWeight: 800, color: pctColor }}>{paidPct}% Paid</span>
                                </div>
                                <div style={{ height: '10px', borderRadius: '999px', background: 'var(--surface-raised)', overflow: 'hidden', border: '1px solid var(--surface-border)' }}>
                                    <div style={{ height: '100%', width: `${paidPct}%`, minWidth: paidPct > 0 ? '4px' : '0', borderRadius: '999px', background: pctColor, transition: 'width 0.5s ease' }} />
                                </div>
                                <div style={{ display: 'flex', gap: '1.25rem', marginTop: '0.45rem', fontSize: '0.75rem' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                                        <span style={{ color: '#10b981', fontWeight: 600 }}>₹{computedTotalPaid.toLocaleString()} paid</span>
                                    </span>
                                    {computedOutstanding > 0
                                        ? <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
                                            <span style={{ color: '#ef4444', fontWeight: 600 }}>₹{computedOutstanding.toLocaleString()} outstanding</span>
                                          </span>
                                        : <span style={{ color: '#10b981', fontWeight: 600 }}>Fully settled ✅</span>
                                    }
                                </div>
                                {/* Metric chips below the bar */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.6rem', marginTop: '1.1rem' }}>
                                    {[
                                        { label: 'Total Sales',  value: `₹${computedTotalSales.toLocaleString()}`,   color: 'var(--text-primary)' },
                                        { label: 'Amount Paid',  value: `₹${computedTotalPaid.toLocaleString()}`,    color: '#10b981' },
                                        { label: 'Outstanding',  value: `₹${computedOutstanding.toLocaleString()}`,  color: computedOutstanding > 0 ? '#ef4444' : 'var(--text-tertiary)' },
                                        { label: 'Completion',   value: `${paidPct}%`,                               color: pctColor },
                                    ].map(m => (
                                        <div key={m.label} style={{ background: 'var(--surface-raised)', borderRadius: '10px', padding: '0.55rem 0.75rem' }}>
                                            <div style={{ fontSize: '0.62rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.15rem' }}>{m.label}</div>
                                            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: m.color }}>{m.value}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Stats grid (always visible) */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(105px, 1fr))', gap: '0.6rem', marginBottom: trendData.length > 0 ? '1.5rem' : 0 }}>
                            {[
                                { label: 'Total Orders',    value: String(salesOrders.length),                                                                                                          color: 'var(--text-primary)' },
                                { label: 'Avg Order Value', value: `₹${salesOrders.length > 0 ? Math.round(computedTotalSales / salesOrders.length).toLocaleString() : 0}`,                             color: 'var(--secondary)' },
                                { label: 'Paid Amount',     value: `₹${computedTotalPaid.toLocaleString()}`,                                                                                            color: '#10b981' },
                                { label: 'Outstanding',     value: `₹${computedOutstanding.toLocaleString()}`,                                                                                          color: computedOutstanding > 0 ? '#ef4444' : 'var(--text-tertiary)' },
                                { label: 'Paid Orders',     value: String(salesOrders.filter((s: any) => s.paymentStatus === 'Paid').length),                                                           color: '#10b981' },
                            ].map(stat => (
                                <div key={stat.label} style={{ background: 'var(--surface-raised)', borderRadius: '10px', padding: '0.55rem 0.75rem' }}>
                                    <div style={{ fontSize: '0.62rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.15rem' }}>{stat.label}</div>
                                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: stat.color }}>{stat.value}</div>
                                </div>
                            ))}
                        </div>

                        {/* Order value trend bar chart */}
                        {trendData.length > 0 && (
                            <div>
                                <p style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Order Value Trend</p>
                                <ResponsiveContainer width="100%" height={90}>
                                    <BarChart data={trendData} barSize={22}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="hsla(0,0%,100%,0.05)" />
                                        <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
                                        <YAxis hide />
                                        <Tooltip contentStyle={{ background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderRadius: 8, fontSize: '0.78rem' }} formatter={(v: any) => [`₹${Number(v).toLocaleString()}`, 'Order Value']} />
                                        <Bar dataKey="value" fill="var(--primary-light)" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>
                );
            })()}

            {/* ── Shared Date Period Filter ── */}
            <div style={{ marginBottom: '1.25rem', padding: '0.65rem 1rem', background: 'var(--surface-raised)', borderRadius: '10px', border: '1px solid var(--surface-border)', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <DatePeriodFilter
                    period={profilePeriod}
                    customFrom={profileCustomFrom}
                    customTo={profileCustomTo}
                    onPeriodChange={setProfilePeriod}
                    onCustomFromChange={setProfileCustomFrom}
                    onCustomToChange={setProfileCustomTo}
                />
                {profilePeriod !== 'all' && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
                        Applies to: B2B Orders · Payments · Product Sales
                    </span>
                )}
            </div>

            {/* Tabs Navigation */}
            <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--surface-border)', marginBottom: '2rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
                {[
                    { id: 'orders', label: 'B2B Orders', icon: ShoppingCart, count: displaySalesOrders.length },
                    { id: 'payments', label: 'Payments', icon: Wallet, count: displayPayments.length },
                    { id: 'productSales', label: 'Product Sales', icon: Package },
                    { id: 'overview', label: 'Overview', icon: User },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            padding: '0.75rem 1.25rem',
                            background: activeTab === tab.id ? 'var(--surface-raised)' : 'transparent',
                            color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-tertiary)',
                            border: '1px solid',
                            borderColor: activeTab === tab.id ? 'var(--surface-border)' : 'transparent',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            fontWeight: activeTab === tab.id ? 600 : 500,
                            transition: 'all 0.2s',
                            font: 'inherit'
                        }}
                    >
                        <tab.icon size={18} color={activeTab === tab.id ? 'var(--primary-light)' : 'currentColor'} />
                        {tab.label}
                        {tab.count !== undefined && (
                            <span style={{ background: activeTab === tab.id ? 'var(--primary)' : 'var(--surface-border)', color: activeTab === tab.id ? 'white' : 'inherit', padding: '2px 8px', borderRadius: '10px', fontSize: '0.75rem' }}>
                                {tab.count}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Tab Contents */}
            <div className="glass-panel" style={{ padding: '2rem' }}>

                {activeTab === 'overview' && (
                    <div className="animate-fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '2rem' }}>
                        <div style={{ gridColumn: '1 / -1', background: 'var(--surface-raised)', padding: '1.5rem', borderRadius: '12px' }}>
                            <h3 style={{ fontSize: '1.125rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>Retailer Configurable Profile</h3>
                            <DynamicForm moduleId="retailers" initialData={retailer} readOnly={true} onSubmit={async () => { }} />
                        </div>

                        <div>
                            <h3 style={{ fontSize: '1.125rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>{t('worklist_details.business_tracking')}</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <div style={{ padding: '0.75rem', background: 'var(--surface-raised)', borderRadius: '10px' }}><Calendar size={20} color="var(--primary-light)" /></div>
                                    <div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{t('worklist_details.last_contact')}</div>
                                        <div style={{ fontWeight: 500, fontSize: '1.125rem' }}>
                                            {retailer.lastCalledAt ? new Date(retailer.lastCalledAt.seconds * 1000).toLocaleDateString() : t('common.not_available')}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <div style={{ padding: '0.75rem', background: 'var(--surface-raised)', borderRadius: '10px' }}><ShoppingCart size={20} color="var(--primary-light)" /></div>
                                    <div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{t('worklist_details.last_order')}</div>
                                        <div style={{ fontWeight: 500, fontSize: '1.125rem' }}>
                                            {retailer.lastOrderedAt ? new Date(retailer.lastOrderedAt.seconds * 1000).toLocaleDateString() : t('common.not_available')}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <div style={{ padding: '0.75rem', background: 'var(--surface-raised)', borderRadius: '10px' }}><User size={20} color="var(--primary-light)" /></div>
                                    <div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{t('worklist_details.last_person_contacted')}</div>
                                        <div style={{ fontWeight: 500, fontSize: '1.125rem' }}>{retailer.lastTalkedTo || t('common.not_available')}</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div>
                            <h3 style={{ fontSize: '1.125rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>{t('worklist_details.financial_analytics')}</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <div style={{ padding: '0.75rem', background: 'var(--surface-raised)', borderRadius: '10px' }}><TrendingUp size={20} color="var(--secondary-light)" /></div>
                                    <div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{t('dashboard.gross_revenue')}</div>
                                        <div style={{ fontWeight: 500, fontSize: '1.125rem' }}>
                                            ₹{orders.reduce((sum, order) => sum + (Number(order.amount) || 0), 0).toLocaleString()}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <div style={{ padding: '0.75rem', background: 'var(--surface-raised)', borderRadius: '10px' }}><FileText size={20} color="var(--secondary-light)" /></div>
                                    <div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{t('worklist_details.average_order_value')}</div>
                                        <div style={{ fontWeight: 500, fontSize: '1.125rem' }}>
                                            ₹{orders.length > 0 ? (orders.reduce((sum, order) => sum + (Number(order.amount) || 0), 0) / orders.length).toLocaleString() : 0}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'tasks' && (
                    <div className="animate-fade-in">
                        {!isSales && (
                            <form onSubmit={handleAddTask} style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
                                <input
                                    required type="text" placeholder={t('worklist_details.add_task_placeholder')}
                                    className="input-field" value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)}
                                />
                                <button type="submit" className="btn btn-primary" style={{ whiteSpace: 'nowrap' }}>+ {t('common.add_new')}</button>
                            </form>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {tasks.length === 0 ? <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: '2rem' }}>{t('worklist_details.no_tasks')}</p> :
                                tasks.map(task => (
                                    <div key={task.id} style={{ padding: '1.25rem', background: 'var(--surface-base)', border: '1px solid var(--surface-border)', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <h4 style={{ margin: 0, fontSize: '1rem' }}>{task.title}</h4>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                                                {task.createdAt ? new Date(task.createdAt.seconds * 1000).toLocaleString() : ''}
                                            </span>
                                        </div>
                                        <span className="status-badge small" style={{ background: 'hsla(38, 92%, 50%, 0.1)', color: 'var(--warning)', borderColor: 'hsla(38, 92%, 50%, 0.3)' }}>{t(`common.status_${task.status?.toLowerCase()}`)}</span>
                                    </div>
                                ))
                            }
                        </div>
                    </div>
                )}

                {activeTab === 'notes' && (
                    <div className="animate-fade-in">
                        {!isSales && <form onSubmit={handleAddNote} style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '2rem', alignItems: 'flex-start' }}>
                            <div style={{ flex: '1 1 300px', position: 'relative' }}>
                                <textarea
                                    required placeholder={t('worklist_details.add_note_placeholder')}
                                    className="input-field" style={{ minHeight: '100px', resize: 'vertical' }}
                                    value={newNoteContent} onChange={e => setNewNoteContent(e.target.value)}
                                />
                                <button
                                    type="button"
                                    onClick={toggleListen}
                                    style={{
                                        position: 'absolute', right: '1rem', bottom: '1rem',
                                        background: isListening ? 'var(--danger)' : 'var(--surface-raised)',
                                        color: isListening ? 'white' : 'var(--text-tertiary)',
                                        border: 'none', borderRadius: '50%', width: '40px', height: '40px',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        cursor: 'pointer', transition: 'all 0.2s', boxShadow: isListening ? '0 0 10px var(--danger)' : 'none'
                                    }}
                                    title={t('common.voice_typing')}
                                >
                                    <Mic size={20} className={isListening ? "animate-pulse" : ""} />
                                </button>
                            </div>
                            <div style={{ flex: '0 0 200px' }}>
                                <input
                                    type="text" placeholder={t('worklist_details.talked_to_placeholder')}
                                    className="input-field" value={newNoteTalkedTo} onChange={e => setNewNoteTalkedTo(e.target.value)}
                                />
                                <button type="submit" className="btn btn-secondary" style={{ width: '100%', marginTop: '0.5rem' }}>{t('common.save')}</button>
                            </div>
                        </form>}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {notes.length === 0 ? <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: '2rem' }}>{t('worklist_details.no_notes')}</p> :
                                notes.map(note => (
                                    <div key={note.id} style={{ padding: '1.25rem', background: 'var(--surface-base)', border: '1px solid var(--surface-border)', borderRadius: '10px', borderLeft: '4px solid var(--primary)' }}>
                                        <p style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)' }}>{note.content}</p>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                                                {note.createdAt ? new Date(note.createdAt.seconds * 1000).toLocaleString() : ''}
                                            </span>
                                            {note.talkedTo && <span style={{ fontSize: '0.75rem', color: 'var(--primary-light)', fontWeight: 500 }}>{t('worklist_details.talked_to')}: {note.talkedTo}</span>}
                                        </div>
                                    </div>
                                ))
                            }
                        </div>
                    </div>
                )}

                {activeTab === 'payments' && (
                    <div className="animate-fade-in">
                        {/* Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                            <div>
                                <h3 style={{ fontSize: '1.15rem', margin: 0 }}>
                                    Payments &amp; Credits ({filteredDisplayPayments.length}{filteredDisplayPayments.length !== payments.length ? ` of ${payments.length}` : ''})
                                </h3>
                                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                                        Total received: <b style={{ color: '#10b981' }}>₹{filteredDisplayPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0).toLocaleString()}</b>
                                    </span>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                                        Total available: <b style={{ color: '#f59e0b' }}>₹{filteredDisplayPayments.reduce((s, p) => s + (Number(p.unallocatedAmount) || 0), 0).toLocaleString()}</b>
                                    </span>
                                </div>
                            </div>
                            {!isSales && (
                                <button onClick={() => setShowPaymentModal(true)} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
                                    <PlusCircle size={16} /> Add Payment
                                </button>
                            )}
                        </div>

                        {/* Filter bar */}
                        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem', padding: '0.65rem 0.75rem', background: 'var(--surface-raised)', borderRadius: '10px', border: '1px solid var(--surface-border)' }}>
                            {/* Status chips */}
                            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>Status:</span>
                            {([
                                ['all',       'All',                '#64748b', 'rgba(100,116,139,0.1)'],
                                ['available', 'Available',          '#f59e0b', 'rgba(245,158,11,0.12)'],
                                ['partial',   'Partially Allocated','#8b5cf6', 'rgba(139,92,246,0.12)'],
                                ['allocated', 'Fully Allocated',    '#10b981', 'rgba(16,185,129,0.1)'],
                            ] as [string, string, string, string][]).map(([val, label, color, bg]) => (
                                <button
                                    key={val}
                                    onClick={() => setPmtStatusFilter(val as any)}
                                    style={{
                                        padding: '0.22rem 0.65rem',
                                        borderRadius: '999px',
                                        border: `1px solid ${pmtStatusFilter === val ? color : 'var(--surface-border)'}`,
                                        background: pmtStatusFilter === val ? bg : 'transparent',
                                        color: pmtStatusFilter === val ? color : 'var(--text-secondary)',
                                        fontSize: '0.75rem',
                                        fontWeight: pmtStatusFilter === val ? 700 : 400,
                                        cursor: 'pointer',
                                        fontFamily: 'inherit',
                                        whiteSpace: 'nowrap',
                                        transition: 'all 0.15s',
                                    }}
                                >
                                    {label}
                                </button>
                            ))}
                            {/* Divider */}
                            <div style={{ width: '1px', height: '20px', background: 'var(--surface-border)', margin: '0 0.15rem', flexShrink: 0 }} />
                            {/* Search */}
                            <div style={{ position: 'relative', flex: '1 1 200px', minWidth: '160px' }}>
                                <Search size={13} style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', pointerEvents: 'none' }} />
                                <input
                                    type="text"
                                    placeholder="Search ref, notes, amount…"
                                    value={pmtSearch}
                                    onChange={e => setPmtSearch(e.target.value)}
                                    className="input-field"
                                    style={{ paddingLeft: '1.8rem', paddingRight: pmtSearch ? '1.8rem' : '0.6rem', height: '30px', fontSize: '0.8rem', margin: 0 }}
                                />
                                {pmtSearch && (
                                    <button onClick={() => setPmtSearch('')} style={{ position: 'absolute', right: '0.4rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', padding: 0 }}>
                                        <X size={13} />
                                    </button>
                                )}
                            </div>
                            {/* Active filter count */}
                            {(pmtStatusFilter !== 'all' || pmtSearch || profilePeriod !== 'all') && (
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                                    {filteredDisplayPayments.length} result{filteredDisplayPayments.length !== 1 ? 's' : ''}
                                </span>
                            )}
                        </div>

                        {filteredDisplayPayments.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                                <Wallet size={40} color="var(--surface-border)" style={{ margin: '0 auto 1rem', display: 'block' }} />
                                <p style={{ margin: 0 }}>
                                    {payments.length === 0
                                        ? 'No payments recorded yet.'
                                        : 'No payments match the current filters.'}
                                </p>
                                <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>
                                    {payments.length === 0
                                        ? 'Use "Add Payment" above, or "Add Payment" on any invoice.'
                                        : 'Try adjusting the status filter, search, or date range.'}
                                </p>
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--surface-border)', color: 'var(--text-tertiary)', textAlign: 'left' }}>
                                            <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600, whiteSpace: 'nowrap' }}>Payment ID</th>
                                            <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600, whiteSpace: 'nowrap' }}>Payment Date</th>
                                            <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>Amount</th>
                                            <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600, whiteSpace: 'nowrap' }}>Method</th>
                                            <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>Notes</th>
                                            <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600, whiteSpace: 'nowrap' }}>Status</th>
                                            {!isSales && <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}></th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredDisplayPayments.map(p => {
                                            const displayDate = p.paymentDate
                                                ? new Date(p.paymentDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                                                : '—';
                                            const paymentIdDisplay = p.paymentId || `#${p.id.slice(-6).toUpperCase()}`;
                                            const linkedCount = p.linkedOrderIds?.length ?? (p.orderId ? 1 : 0);
                                            const unallocated = Number(p.unallocatedAmount) || 0;
                                            const isLinked = linkedCount > 0;
                                            const isAvailable = unallocated > 0;
                                            const isPartial = isLinked && isAvailable;
                                            return (
                                                <tr key={p.id} style={{ borderBottom: '1px solid var(--surface-border)', transition: 'background 0.12s' }}
                                                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-raised)')}
                                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                                    <td style={{ padding: '0.7rem 0.75rem', whiteSpace: 'nowrap' }}>
                                                        <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--primary-light)', fontWeight: 600 }}>{paymentIdDisplay}</span>
                                                    </td>
                                                    <td style={{ padding: '0.7rem 0.75rem', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                            <Calendar size={12} color="var(--text-tertiary)" />
                                                            {displayDate}
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '0.7rem 0.75rem', textAlign: 'right', fontWeight: 800, color: '#10b981', whiteSpace: 'nowrap' }}>
                                                        ₹{Number(p.amount || 0).toLocaleString()}
                                                    </td>
                                                    <td style={{ padding: '0.7rem 0.75rem', whiteSpace: 'nowrap' }}>
                                                        {p.paymentMethod ? (
                                                            <span style={{ background: '#10b98122', color: '#10b981', padding: '0.15rem 0.55rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700 }}>
                                                                {p.paymentMethod}
                                                            </span>
                                                        ) : '—'}
                                                    </td>
                                                    <td style={{ padding: '0.7rem 0.75rem', color: 'var(--text-tertiary)', maxWidth: '200px' }}>
                                                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {p.notes || (p.orderNumber ? `Invoice ${p.orderNumber}` : '—')}
                                                        </div>
                                                        {p.attachmentUrl && (
                                                            <a href={p.attachmentUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.72rem', color: 'var(--primary-light)', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.2rem', textDecoration: 'none' }}>
                                                                <Paperclip size={11} /> View proof
                                                            </a>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '0.7rem 0.75rem' }}>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', alignItems: 'flex-start' }}>
                                                            {isPartial ? (
                                                                <>
                                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: '#8b5cf622', color: '#8b5cf6', padding: '0.15rem 0.55rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                                                        🔗 {linkedCount} order{linkedCount !== 1 ? 's' : ''} linked
                                                                    </span>
                                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: '#f59e0b22', color: '#f59e0b', padding: '0.15rem 0.55rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                                                        🟡 ₹{unallocated.toLocaleString()} still available
                                                                    </span>
                                                                </>
                                                            ) : isAvailable ? (
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: '#f59e0b22', color: '#f59e0b', padding: '0.15rem 0.55rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                                                    🟡 ₹{unallocated.toLocaleString()} Available
                                                                </span>
                                                            ) : isLinked ? (
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: '#10b98122', color: '#10b981', padding: '0.15rem 0.55rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                                                    ✓ Fully Allocated
                                                                </span>
                                                            ) : (
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: '#10b98122', color: '#10b981', padding: '0.15rem 0.55rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                                                    ✓ Fully Allocated
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    {!isSales && (
                                                        <td style={{ padding: '0.7rem 0.75rem', whiteSpace: 'nowrap' }}>
                                                            <div style={{ display: 'flex', gap: '0.3rem' }}>
                                                                <button onClick={() => openEditPayment(p)} title="Edit" className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}>
                                                                    <Pencil size={12} /> Edit
                                                                </button>
                                                                <button onClick={() => handleDeletePayment(p)} title="Delete" className="btn" style={{ display: 'flex', alignItems: 'center', padding: '0.3rem 0.55rem', fontSize: '0.75rem', background: 'hsla(0, 84%, 60%, 0.1)', color: 'var(--danger)', border: '1px solid hsla(0, 84%, 60%, 0.3)' }}>
                                                                    <Trash2 size={12} />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    )}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                    <tfoot>
                                        <tr style={{ borderTop: '2px solid var(--surface-border)', background: 'var(--surface-raised)' }}>
                                            <td colSpan={2} style={{ padding: '0.6rem 0.75rem', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                                                Total ({filteredDisplayPayments.length} payment{filteredDisplayPayments.length !== 1 ? 's' : ''})
                                            </td>
                                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontWeight: 800, color: '#10b981' }}>
                                                ₹{filteredDisplayPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0).toLocaleString()}
                                            </td>
                                            <td colSpan={2} />
                                            <td style={{ padding: '0.6rem 0.75rem' }}>
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: '#f59e0b22', color: '#f59e0b', padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                                    🟡 ₹{filteredDisplayPayments.reduce((s, p) => s + (Number(p.unallocatedAmount) || 0), 0).toLocaleString()} available
                                                </span>
                                            </td>
                                            {!isSales && <td />}
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'productSales' && (
                    <div className="animate-fade-in">
                        {/* Filters — date range is driven by the shared period filter above the tabs */}
                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1.25rem' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                <label style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sort By</label>
                                <select
                                    className="input-field"
                                    style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem', appearance: 'auto' }}
                                    value={psSort}
                                    onChange={e => setPsSort(e.target.value as any)}
                                >
                                    <option value="qty_desc">Qty: High → Low</option>
                                    <option value="qty_asc">Qty: Low → High</option>
                                    <option value="recent">Recently Sold</option>
                                    <option value="name">Product Name</option>
                                </select>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', flex: '1 1 180px' }}>
                                <label style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Search Product</label>
                                <input
                                    type="text"
                                    className="input-field"
                                    style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                                    placeholder="Search by product name..."
                                    value={psSearch}
                                    onChange={e => setPsSearch(e.target.value)}
                                />
                            </div>
                            {psSearch && (
                                <button
                                    onClick={() => setPsSearch('')}
                                    style={{ padding: '0.4rem 0.9rem', background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-secondary)', fontFamily: 'inherit', alignSelf: 'flex-end' }}
                                >
                                    Clear
                                </button>
                            )}
                        </div>

                        {/* Summary */}
                        {productSalesData.length > 0 && (
                            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                                <div style={{ background: 'var(--surface-raised)', borderRadius: '10px', padding: '0.5rem 1rem', fontSize: '0.82rem' }}>
                                    <span style={{ color: 'var(--text-tertiary)' }}>Products: </span>
                                    <span style={{ fontWeight: 700 }}>{productSalesData.length}</span>
                                </div>
                                <div style={{ background: 'var(--surface-raised)', borderRadius: '10px', padding: '0.5rem 1rem', fontSize: '0.82rem' }}>
                                    <span style={{ color: 'var(--text-tertiary)' }}>Total Qty Sold: </span>
                                    <span style={{ fontWeight: 700, color: 'var(--primary-light)' }}>{productSalesData.reduce((s, r) => s + r.totalQty, 0).toLocaleString()}</span>
                                </div>
                                <div style={{ background: 'rgba(16,185,129,0.08)', borderRadius: '10px', padding: '0.5rem 1rem', fontSize: '0.82rem', border: '1px solid rgba(16,185,129,0.2)' }}>
                                    <span style={{ color: 'var(--text-tertiary)' }}>Paid Qty: </span>
                                    <span style={{ fontWeight: 700, color: '#10b981' }}>{productSalesData.reduce((s, r) => s + r.paidQty, 0).toLocaleString()}</span>
                                </div>
                                <div style={{ background: 'rgba(239,68,68,0.07)', borderRadius: '10px', padding: '0.5rem 1rem', fontSize: '0.82rem', border: '1px solid rgba(239,68,68,0.15)' }}>
                                    <span style={{ color: 'var(--text-tertiary)' }}>Unpaid Qty: </span>
                                    <span style={{ fontWeight: 700, color: '#ef4444' }}>{productSalesData.reduce((s, r) => s + r.unpaidQty, 0).toLocaleString()}</span>
                                </div>
                            </div>
                        )}

                        {/* Table */}
                        {productSalesData.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                                <Package size={40} color="var(--surface-border)" style={{ margin: '0 auto 1rem', display: 'block' }} />
                                <p style={{ margin: 0 }}>{psSearch || profilePeriod !== 'all' ? 'No products match the current filters.' : 'No invoice data available yet.'}</p>
                                <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>Product sales are derived from B2B invoices created for this partner.</p>
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '2px solid var(--surface-border)', color: 'var(--text-tertiary)', textAlign: 'left' }}>
                                            <th style={{ padding: '0.6rem 0.75rem', fontWeight: 600 }}>#</th>
                                            <th style={{ padding: '0.6rem 0.75rem', fontWeight: 600 }}>Product</th>
                                            <th style={{ padding: '0.6rem 0.75rem', fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>Total Qty</th>
                                            <th style={{ padding: '0.6rem 0.75rem', fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>Paid Qty</th>
                                            <th style={{ padding: '0.6rem 0.75rem', fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>Unpaid Qty</th>
                                            <th style={{ padding: '0.6rem 0.75rem', fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>Invoice Count</th>
                                            <th style={{ padding: '0.6rem 0.75rem', fontWeight: 600, whiteSpace: 'nowrap' }}>Last Sold Date</th>
                                            <th style={{ padding: '0.6rem 0.75rem', fontWeight: 600, whiteSpace: 'nowrap' }}>First Sold Date</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {productSalesData.map((row, idx) => {
                                            const pct = row.totalQty > 0 ? Math.round((row.paidQty / row.totalQty) * 100) : 0;
                                            return (
                                            <tr
                                                key={row.productName}
                                                style={{ borderBottom: '1px solid var(--surface-border)', transition: 'background 0.12s' }}
                                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-raised)')}
                                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                            >
                                                <td style={{ padding: '0.7rem 0.75rem', color: 'var(--text-tertiary)', fontSize: '0.78rem' }}>{idx + 1}</td>
                                                <td style={{ padding: '0.7rem 0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>{row.productName}</td>
                                                <td style={{ padding: '0.7rem 0.75rem', textAlign: 'right', fontWeight: 800, color: 'var(--primary-light)', fontSize: '1rem' }}>{row.totalQty.toLocaleString()}</td>
                                                <td style={{ padding: '0.7rem 0.75rem', textAlign: 'right' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.2rem' }}>
                                                        <span style={{ fontWeight: 700, color: '#10b981' }}>{row.paidQty.toLocaleString()}</span>
                                                        {row.totalQty > 0 && <span style={{ fontSize: '0.68rem', color: '#10b981', opacity: 0.75 }}>{pct}%</span>}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '0.7rem 0.75rem', textAlign: 'right', fontWeight: 700, color: row.unpaidQty > 0 ? '#ef4444' : 'var(--text-tertiary)' }}>
                                                    {row.unpaidQty > 0 ? row.unpaidQty.toLocaleString() : '—'}
                                                </td>
                                                <td style={{ padding: '0.7rem 0.75rem', textAlign: 'right', color: 'var(--text-secondary)' }}>{row.invoiceCount}</td>
                                                <td style={{ padding: '0.7rem 0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                                    {row.lastInvoiceDate ? new Date(row.lastInvoiceDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                                                </td>
                                                <td style={{ padding: '0.7rem 0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                                    {row.firstInvoiceDate ? new Date(row.firstInvoiceDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
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

                {activeTab === 'orders' && (
                    <div className="animate-fade-in">
                        {/* Action toolbar */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            <button
                                className="btn"
                                onClick={() => setShowOutstandingModal(true)}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'hsla(0,84%,60%,0.08)', color: 'var(--danger)', border: '1px solid hsla(0,84%,60%,0.3)', fontSize: '0.875rem', padding: '0.5rem 1.25rem' }}
                            >
                                <AlertTriangle size={16} /> Outstanding Statement
                            </button>
                            {!isSales && (
                                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                                    <button
                                        className="btn btn-secondary"
                                        onClick={() => navigate(`/sales-order/new?retailerId=${id}`)}
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', padding: '0.55rem 1.25rem' }}
                                    >
                                        <PlusCircle size={16} /> + New Sales Order
                                    </button>
                                    <button
                                        className="btn btn-primary animate-pulse"
                                        onClick={() => navigate(`/b2b-invoice?retailerId=${id}`)}
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', padding: '0.55rem 1.25rem' }}
                                    >
                                        <FilePen size={16} /> + New B2B GST Invoice
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Outstanding Invoice Modal */}
                        {showOutstandingModal && retailer && (
                            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                                <div className="glass-panel" style={{ maxWidth: '700px', width: '100%', maxHeight: '90vh', overflowY: 'auto', borderRadius: '16px' }}>
                                    <OutstandingInvoice retailer={retailer} onClose={() => setShowOutstandingModal(false)} />
                                </div>
                            </div>
                        )}

                        {/* Sales Orders Table */}
                        <div style={{ marginBottom: '3rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                                <h3 style={{ fontSize: '1.15rem', margin: 0 }}>Sales Orders ({displaySalesOrders.length}{profileRange && displaySalesOrders.length !== salesOrders.length ? ` of ${salesOrders.length}` : ''})</h3>
                                <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>Edit status &amp; payment inline → Save remarks</span>
                            </div>

                            {/* Bulk Action Toolbar — visible when ≥1 Sales Order is selected */}
                            {selectedSoIds.size > 0 && (
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap',
                                    padding: '0.6rem 1rem', marginBottom: '0.75rem',
                                    background: 'var(--primary-light)', borderRadius: '8px',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                                }}>
                                    <CheckSquare size={16} color="#fff" />
                                    <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.88rem' }}>
                                        {selectedSoIds.size} Sales Order{selectedSoIds.size !== 1 ? 's' : ''} Selected
                                    </span>
                                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                                        <button
                                            onClick={handleSelectAllSOs}
                                            style={{ padding: '0.28rem 0.75rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.5)', background: 'transparent', color: '#fff', fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit' }}
                                        >
                                            Select All ({displaySalesOrders.length})
                                        </button>
                                        <button
                                            onClick={handleClearSoSelection}
                                            style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.28rem 0.75rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.5)', background: 'transparent', color: '#fff', fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit' }}
                                        >
                                            <X size={12} /> Clear
                                        </button>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.4rem', marginLeft: 'auto' }}>
                                        {userRole === 'admin' && (
                                            <button
                                                onClick={() => setShowBulkDeleteModal(true)}
                                                style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.32rem 0.9rem', borderRadius: '6px', border: '1px solid rgba(255,100,100,0.7)', background: 'rgba(239,68,68,0.2)', color: '#fff', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit' }}
                                            >
                                                <Trash2 size={14} /> Delete Selected
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {displaySalesOrders.length === 0 ? (
                                <div className="glass-panel" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                                    <ShoppingCart size={40} color="var(--surface-border)" style={{ margin: '0 auto 1rem', display: 'block' }} />
                                    <p style={{ margin: 0 }}>{salesOrders.length === 0 ? 'No sales orders yet for this partner.' : 'No orders match the selected period.'}</p>
                                    <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>{salesOrders.length === 0 ? 'Use the buttons above to create one.' : 'Change the date filter above to see more orders.'}</p>
                                </div>
                            ) : displaySalesOrders.map((so: any) => {
                                const statusColor: Record<string, string> = { confirmed: '#10b981', draft: '#f59e0b', dispatched: '#38bdf8', cancelled: '#ef4444' };
                                const color = statusColor[so.status?.toLowerCase()] || '#94a3b8';
                                const date = so.invoiceDate
                                    ? new Date(so.invoiceDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
                                    : (so.createdAt?.toDate ? new Date(so.createdAt.toDate()).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'2-digit' }) : '—');
                                // Use the same total-field fallback as everything else (GST invoices
                                // store the total in netAmount/totalAmount, not grandTotal) so outstanding
                                // can't wrongly compute to 0 and show a false "Fully Paid".
                                const invoiceTotal = Number(so.grandTotal ?? so.netAmount ?? so.totalAmount ?? 0);
                                const amountPaid = Number(so.amountPaid) || 0;
                                const outstanding = Math.max(0, invoiceTotal - amountPaid);
                                const fullyPaid = invoiceTotal > 0 && outstanding === 0 && amountPaid > 0;
                                const isSelected = selectedSoIds.has(so.id);
                                return (
                                    <div key={so.id} className="glass-panel" style={{ padding: '1.25rem', borderLeft: `4px solid ${isSelected ? 'var(--primary-light)' : color}`, transition: 'box-shadow 0.15s', outline: isSelected ? '2px solid var(--primary-light)' : 'none', outlineOffset: '-2px' }}
                                        onMouseOver={e => e.currentTarget.style.boxShadow = `0 4px 20px ${color}22`}
                                        onMouseOut={e => e.currentTarget.style.boxShadow = 'none'}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                                            {/* Left: checkbox + order info */}
                                            <div style={{ flex: 1 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.4rem' }}>
                                                    {/* Selection checkbox — hidden in sales view-only mode */}
                                                    {!isSales && (
                                                        <button
                                                            onClick={() => toggleSoSelection(so.id)}
                                                            title={isSelected ? 'Deselect order' : 'Select order'}
                                                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0, color: isSelected ? 'var(--primary-light)' : 'var(--text-tertiary)', display: 'flex', alignItems: 'center' }}
                                                        >
                                                            {isSelected ? <CheckSquare size={17} /> : <Square size={17} />}
                                                        </button>
                                                    )}
                                                    <span style={{ fontWeight: 700, color: 'var(--primary-light)', fontSize: '1rem' }}>{so.orderNumber || so.invoiceNumber || so.id.slice(-8).toUpperCase()}</span>
                                                    <span style={{ background: `${color}22`, color, padding: '0.15rem 0.6rem', borderRadius: '99px', fontSize: '0.72rem', fontWeight: 700 }}>
                                                        {so.status?.toUpperCase() || 'DRAFT'}
                                                    </span>
                                                    {so.invoiceType === 'B2B_GST' && (
                                                        <span style={{ background: '#8b5cf622', color: '#8b5cf6', padding: '0.15rem 0.5rem', borderRadius: '99px', fontSize: '0.7rem', fontWeight: 600 }}>GST Invoice</span>
                                                    )}
                                                </div>
                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                                    <span>📅 {date}</span>
                                                    <span>📦 {so.lineItems?.length || (so.items?.length) || 0} items</span>
                                                    {so.paymentStatus && <span>💳 {so.paymentStatus}</span>}
                                                </div>
                                            </div>
                                            {/* Right: amounts */}
                                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                <div style={{ fontWeight: 800, fontSize: '1.15rem', color: 'var(--secondary)' }}>₹{invoiceTotal.toLocaleString()}</div>
                                                {amountPaid > 0 && outstanding > 0 && (
                                                    <div style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 600 }}>Paid: ₹{amountPaid.toLocaleString()}</div>
                                                )}
                                                {outstanding > 0 && (
                                                    <div style={{ fontSize: '0.78rem', color: '#ef4444', fontWeight: 600 }}>Outstanding: ₹{outstanding.toLocaleString()}</div>
                                                )}
                                                {fullyPaid && (
                                                    <div style={{ fontSize: '0.78rem', color: '#10b981', fontWeight: 600 }}>✅ Fully Paid</div>
                                                )}
                                                {(so.linkedPaymentIds?.length ?? 0) > 0 && (
                                                    <div style={{ fontSize: '0.7rem', color: '#8b5cf6', fontWeight: 600, marginTop: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.25rem', justifyContent: 'flex-end' }}>
                                                        <Link2 size={10} /> {so.linkedPaymentIds.length} linked
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        {/* Order status — interactive for editors, read-only for sales */}
                                        {isSales ? (
                                            <div style={{ marginTop: '0.65rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                                {so.status && (
                                                    <span style={{ fontSize: '0.72rem', padding: '0.2rem 0.55rem', borderRadius: '8px', background: 'var(--surface-raised)', color: 'var(--text-secondary)', border: '1px solid var(--surface-border)', fontWeight: 600 }}>
                                                        📦 {so.status.charAt(0).toUpperCase() + so.status.slice(1)}
                                                    </span>
                                                )}
                                                {so.paymentStatus && (
                                                    <span style={{ fontSize: '0.72rem', padding: '0.2rem 0.55rem', borderRadius: '8px', background: so.paymentStatus === 'Paid' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.08)', color: so.paymentStatus === 'Paid' ? '#10b981' : '#ef4444', border: `1px solid ${so.paymentStatus === 'Paid' ? '#10b98140' : '#ef444440'}`, fontWeight: 600 }}>
                                                        💳 {so.paymentStatus}
                                                    </span>
                                                )}
                                                {so.modeOfPayment && (
                                                    <span style={{ fontSize: '0.72rem', padding: '0.2rem 0.55rem', borderRadius: '8px', background: 'var(--surface-raised)', color: 'var(--text-secondary)', border: '1px solid var(--surface-border)' }}>
                                                        {so.modeOfPayment}
                                                    </span>
                                                )}
                                                {so.paymentNotes && (
                                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>{so.paymentNotes}</span>
                                                )}
                                            </div>
                                        ) : (
                                            <div style={{ marginTop: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                                    <label style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontWeight: 600, whiteSpace: 'nowrap' }}>Quick update:</label>
                                                    <select value={so.status || 'pending'} onChange={e => updateOrderStatus(so.id, 'status', e.target.value, so)}
                                                        style={{ fontSize: '0.78rem', padding: '0.25rem 0.5rem', borderRadius: '8px', border: '1px solid var(--surface-border)', background: 'var(--surface-raised)', color: 'var(--text-primary)', cursor: 'pointer' }}>
                                                        <option value="draft">📋 Draft</option>
                                                        <option value="confirmed">✅ Confirmed</option>
                                                        <option value="in_transit">🚛 In Transit</option>
                                                        <option value="dispatched">📦 Dispatched</option>
                                                        <option value="delivered">🏠 Delivered</option>
                                                        <option value="cancelled">❌ Cancelled</option>
                                                        <option value="pending">⏳ Pending</option>
                                                    </select>
                                                    <select value={so.paymentStatus || 'Pending'} onChange={e => updateOrderStatus(so.id, 'paymentStatus', e.target.value, so)}
                                                        style={{ fontSize: '0.78rem', padding: '0.25rem 0.5rem', borderRadius: '8px', border: '1px solid var(--surface-border)', background: so.paymentStatus === 'Paid' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.08)', color: so.paymentStatus === 'Paid' ? '#10b981' : '#ef4444', cursor: 'pointer' }}>
                                                        <option value="Pending">💳 Payment Pending</option>
                                                        <option value="Paid">✅ Payment Done</option>
                                                        <option value="Partial">🔶 Partial</option>
                                                    </select>
                                                    <select value={so.modeOfPayment || ''} onChange={e => updateOrderStatus(so.id, 'modeOfPayment', e.target.value, so)}
                                                        style={{ fontSize: '0.78rem', padding: '0.25rem 0.5rem', borderRadius: '8px', border: '1px solid var(--surface-border)', background: 'var(--surface-raised)', color: 'var(--text-primary)', cursor: 'pointer' }}>
                                                        <option value="">-- Mode --</option>
                                                        <option value="Cash">💵 Cash</option>
                                                        <option value="UPI">📱 UPI</option>
                                                        <option value="Cheque">🏦 Cheque</option>
                                                        <option value="15 Days">⏱ 15 Days</option>
                                                        <option value="30 Days">⏱ 30 Days</option>
                                                        <option value="45 Days">⏱ 45 Days</option>
                                                        <option value="Credit">💳 Credit</option>
                                                    </select>
                                                    {/* Payment Date */}
                                                    <input type="date" value={orderPayDates[so.id] ?? (so.paymentDate || '')}
                                                        onChange={e => setOrderPayDates(prev => ({ ...prev, [so.id]: e.target.value }))}
                                                        title="Payment Date"
                                                        style={{ fontSize: '0.78rem', padding: '0.25rem 0.5rem', borderRadius: '8px', border: '1px solid var(--surface-border)', background: 'var(--surface-raised)', color: 'var(--text-primary)', cursor: 'pointer' }} />
                                                </div>
                                                {/* Notes */}
                                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                    <input type="text" placeholder="Payment notes / remarks…" value={orderNotes[so.id] ?? (so.paymentNotes || '')}
                                                        onChange={e => setOrderNotes(prev => ({ ...prev, [so.id]: e.target.value }))}
                                                        style={{ flex: 1, fontSize: '0.78rem', padding: '0.3rem 0.6rem', borderRadius: '8px', border: '1px solid var(--surface-border)', background: 'var(--surface-raised)', color: 'var(--text-primary)' }} />
                                                    <button className="btn btn-secondary"
                                                        style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem', whiteSpace: 'nowrap' }}
                                                        onClick={async () => {
                                                            await updateDoc(getTenantDoc(db, tenantId!, 'salesOrders', so.id), {
                                                                paymentDate: orderPayDates[so.id] ?? so.paymentDate ?? '',
                                                                paymentNotes: orderNotes[so.id] ?? so.paymentNotes ?? '',
                                                            });
                                                        }}>💾 Save</button>
                                                </div>
                                            </div>
                                        )}
                                        {/* Action buttons */}
                                        <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--surface-border)', flexWrap: 'wrap' }}>
                                            {!isSales && outstanding > 0 && (
                                                <button className="btn btn-primary"
                                                    onClick={() => { setPayOrder(so); setPayOrderAmount(outstanding); setPayOrderNote(''); }}
                                                    title="Record a new payment against this invoice"
                                                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 1rem', fontSize: '0.82rem' }}>
                                                    <PlusCircle size={14} /> Add Payment
                                                </button>
                                            )}
                                            {!isSales && outstanding > 0 && availablePayments.length > 0 && (
                                                <button className="btn btn-secondary"
                                                    onClick={() => { setLinkPaymentOrder(so); setLinkAllocations({}); }}
                                                    title="Link an existing unallocated payment to this invoice"
                                                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 1rem', fontSize: '0.82rem' }}>
                                                    <Link2 size={14} /> Link Payment
                                                </button>
                                            )}
                                            {!isSales && (
                                                <button className="btn btn-secondary"
                                                    onClick={() => so.invoiceType === 'B2B_GST'
                                                        ? navigate(`/b2b-invoice?orderId=${so.id}&retailerId=${id}`)
                                                        : navigate(`/sales-order/${so.id}`)}
                                                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 1rem', fontSize: '0.82rem' }}>
                                                    <FilePen size={14} /> Edit Order
                                                </button>
                                            )}
                                            {isSales ? (
                                                <button className="btn btn-secondary"
                                                    onClick={() => tenantId && printB2BInvoice(so.id, tenantId)}
                                                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 1rem', fontSize: '0.82rem' }}>
                                                    <Printer size={14} /> Print Invoice
                                                </button>
                                            ) : (
                                                <button className="btn btn-secondary"
                                                    onClick={() => navigate(`/b2b-invoice?orderId=${so.id}&retailerId=${id}`)}
                                                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 1rem', fontSize: '0.82rem' }}>
                                                    <Printer size={14} /> View / Edit Invoice
                                                </button>
                                            )}
                                            {!isSales && (so.linkedPaymentIds?.length ?? 0) > 0 && (
                                                <button className="btn btn-secondary"
                                                    onClick={() => handleOpenUnlinkModal(so)}
                                                    title="View and unlink payments from this order"
                                                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 1rem', fontSize: '0.82rem' }}>
                                                    <Link2 size={14} /> Unlink Payments ({so.linkedPaymentIds.length})
                                                </button>
                                            )}
                                            {userRole === 'admin' && (
                                                <button className="btn" onClick={() => setSoToDelete(so)}
                                                    title="Delete this sales order"
                                                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 1rem', fontSize: '0.82rem', background: 'hsla(0, 84%, 60%, 0.1)', color: 'var(--danger)', border: '1px solid hsla(0, 84%, 60%, 0.3)' }}>
                                                    <Trash2 size={14} /> Delete
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Legacy Orders */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <h3 style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', borderBottom: '1px solid var(--surface-border)', paddingBottom: '0.5rem' }}>Legacy Single-Item Orders</h3>
                            {orders.length === 0 ? <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: '2rem' }}>{t('worklist_details.no_orders')}</p> :
                                orders.map(order => (
                                    <div key={order.id} style={{ padding: '1rem', background: 'hsla(45, 93%, 47%, 0.05)', border: '1px solid var(--surface-border)', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                                            <div style={{ display: 'flex', gap: '1rem' }}>
                                                <div>
                                                    <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1rem' }}>{order.productName}</h4>
                                                    <div style={{ display: 'flex', gap: '1rem', color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>
                                                        <span>{order.quantity || 1} {t(`common.${(order.unit || 'Boxes').toLowerCase()}`)}</span>
                                                        <span>•</span>
                                                        <span>{order.createdAt ? new Date(order.createdAt.seconds * 1000).toLocaleString() : ''}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontWeight: 600, fontSize: '1.1rem', color: 'var(--secondary-light)', marginBottom: '0.25rem' }}>
                                                    ₹{order.amount.toLocaleString()}
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-end' }}>
                                                    <span className={`status-badge small`} style={{ background: order.paymentStatus === 'Paid' ? 'hsla(152, 60%, 40%, 0.1)' : 'hsla(0, 84%, 60%, 0.1)', color: order.paymentStatus === 'Paid' ? 'var(--primary-light)' : 'var(--danger)', borderColor: order.paymentStatus === 'Paid' ? 'hsla(152, 60%, 40%, 0.3)' : 'hsla(0, 84%, 60%, 0.3)' }}>
                                                        {t(`common.${(order.paymentStatus || 'Unpaid').toLowerCase()}`)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid var(--surface-border)', paddingTop: '0.75rem', flexWrap: 'wrap' }}>
                                            {userRole === 'admin' && (
                                                <button
                                                    onClick={() => handleDeleteOrder(order)}
                                                    className="btn"
                                                    style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', background: 'hsla(0, 84%, 60%, 0.1)', color: 'var(--danger)', border: '1px solid hsla(0, 84%, 60%, 0.3)' }}
                                                >
                                                    {t('worklist_details.delete')}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))
                            }
                        </div>
                    </div>
                )}

                {/* Record Payment Modal */}
                {showPaymentModal && (
                    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, overflowY: 'auto', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
                        <div style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem 1rem' }}>
                            <div className="glass-panel" style={{ width: '100%', maxWidth: '480px', padding: '2rem', position: 'relative', borderRadius: '16px' }}>
                                <button onClick={() => !isRecordingPayment && setShowPaymentModal(false)} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}><X size={22} /></button>
                                <h2 style={{ marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem' }}>
                                    <TrendingUp size={22} color="var(--primary-light)" /> Record Payment
                                </h2>
                                <p style={{ margin: '0 0 1.5rem', fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>
                                    For: <strong style={{ color: 'var(--text-primary)' }}>{retailer.name}</strong>
                                    {' · '}Outstanding: <strong style={{ color: computedOutstanding > 0 ? '#ef4444' : '#10b981' }}>₹{computedOutstanding.toLocaleString()}</strong>
                                </p>
                                <form onSubmit={handleRecordPayment} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        <div>
                                            <label className="input-label">Amount (₹) *</label>
                                            <input required type="number" min={1} step="0.01" className="input-field" value={paymentAmount || ''} onChange={e => setPaymentAmount(Number(e.target.value))} autoFocus />
                                        </div>
                                        <div>
                                            <label className="input-label">Payment Date *</label>
                                            <input type="date" className="input-field" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="input-label">Payment Method</label>
                                        <select className="input-field" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                                            {['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Other'].map(m => <option key={m}>{m}</option>)}
                                        </select>
                                    </div>
                                    {['UPI', 'Bank Transfer', 'Other'].includes(paymentMethod) && (
                                        <>
                                            <div>
                                                <label className="input-label">Account Name</label>
                                                <input type="text" className="input-field" placeholder="e.g. HDFC Bank, Google Pay" value={paymentAccountName} onChange={e => setPaymentAccountName(e.target.value)} />
                                            </div>
                                            <div>
                                                <label className="input-label">Transaction Reference Number</label>
                                                <input type="text" className="input-field" placeholder="UTR / Transaction ID" value={paymentTransactionRef} onChange={e => setPaymentTransactionRef(e.target.value)} />
                                            </div>
                                        </>
                                    )}
                                    <div>
                                        <label className="input-label">Notes (optional)</label>
                                        <textarea className="input-field" style={{ minHeight: '70px', paddingTop: '0.75rem', resize: 'vertical' }} value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} placeholder="Optional remarks" />
                                    </div>
                                    <PaymentAttachmentField
                                        pendingFile={pmtProofFile}
                                        attachmentCleared={pmtProofCleared}
                                        onFileSelect={setPmtProofFile}
                                        onClear={() => { setPmtProofFile(null); setPmtProofCleared(true); }}
                                    />
                                    <button type="submit" className="btn btn-primary" disabled={isRecordingPayment || paymentAmount <= 0} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                                        {isRecordingPayment ? <Loader2 className="animate-spin" size={18} /> : 'Record Payment'}
                                    </button>
                                </form>
                            </div>
                        </div>
                    </div>
                )}

                {/* Per-Invoice Add Payment Modal (partial supported) */}
                {payOrder && (() => {
                    const grandTotal = Number(payOrder.grandTotal ?? payOrder.netAmount ?? payOrder.totalAmount ?? 0);
                    const alreadyPaid = Number(payOrder.amountPaid ?? 0);
                    const remaining = Math.max(0, grandTotal - alreadyPaid);
                    const orderLabel = payOrder.orderNumber || payOrder.invoiceNumber || payOrder.id.slice(-6);
                    const amt = Number(payOrderAmount) || 0;
                    const over = amt > remaining;
                    return (
                        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, overflowY: 'auto', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
                            <div style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem 1rem' }}>
                                <div className="glass-panel" style={{ width: '100%', maxWidth: '480px', padding: '2rem', position: 'relative', borderRadius: '16px' }}>
                                    <button onClick={() => !isSavingOrderPayment && setPayOrder(null)} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}><X size={22} /></button>
                                    <h2 style={{ marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem' }}>
                                        <PlusCircle size={22} color="var(--primary-light)" /> Add Payment
                                    </h2>
                                    <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>Invoice {orderLabel}</p>

                                    {/* Order money summary */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', background: 'var(--surface-raised)', borderRadius: '10px', padding: '0.75rem 1rem', marginBottom: '1.25rem' }}>
                                        <div><div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Total</div><div style={{ fontWeight: 700 }}>₹{grandTotal.toLocaleString()}</div></div>
                                        <div><div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Paid</div><div style={{ fontWeight: 700, color: '#10b981' }}>₹{alreadyPaid.toLocaleString()}</div></div>
                                        <div><div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Outstanding</div><div style={{ fontWeight: 700, color: '#ef4444' }}>₹{remaining.toLocaleString()}</div></div>
                                    </div>

                                    <form onSubmit={handleAddOrderPayment} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                            <div>
                                                <label className="input-label">Amount (₹) *</label>
                                                <input required type="number" min={1} max={remaining} step="0.01" className="input-field" value={payOrderAmount || ''} onChange={e => setPayOrderAmount(Number(e.target.value))} autoFocus />
                                                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                                                    <button type="button" onClick={() => setPayOrderAmount(Math.round(remaining / 2))} style={{ fontSize: '0.7rem', padding: '0.15rem 0.55rem', borderRadius: '6px', border: '1px solid var(--surface-border)', background: 'var(--surface-raised)', color: 'var(--text-secondary)', cursor: 'pointer' }}>Half</button>
                                                    <button type="button" onClick={() => setPayOrderAmount(remaining)} style={{ fontSize: '0.7rem', padding: '0.15rem 0.55rem', borderRadius: '6px', border: '1px solid var(--surface-border)', background: 'var(--surface-raised)', color: 'var(--text-secondary)', cursor: 'pointer' }}>Full</button>
                                                </div>
                                                {over && <div style={{ fontSize: '0.72rem', color: '#f59e0b', marginTop: '0.4rem' }}>Max outstanding is ₹{remaining.toLocaleString()} — extra will be ignored.</div>}
                                            </div>
                                            <div>
                                                <label className="input-label">Payment Date *</label>
                                                <input type="date" className="input-field" value={payOrderDate} onChange={e => setPayOrderDate(e.target.value)} />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="input-label">Payment Method</label>
                                            <select className="input-field" value={payOrderMethod} onChange={e => setPayOrderMethod(e.target.value)}>
                                                {['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Other'].map(m => <option key={m}>{m}</option>)}
                                            </select>
                                        </div>
                                        {['UPI', 'Bank Transfer', 'Other'].includes(payOrderMethod) && (
                                            <>
                                                <div>
                                                    <label className="input-label">Account Name</label>
                                                    <input type="text" className="input-field" placeholder="e.g. HDFC Bank, Google Pay" value={payOrderAccountName} onChange={e => setPayOrderAccountName(e.target.value)} />
                                                </div>
                                                <div>
                                                    <label className="input-label">Transaction Reference Number</label>
                                                    <input type="text" className="input-field" placeholder="UTR / Transaction ID" value={payOrderTransactionRef} onChange={e => setPayOrderTransactionRef(e.target.value)} />
                                                </div>
                                            </>
                                        )}
                                        <div>
                                            <label className="input-label">Notes (optional)</label>
                                            <input type="text" className="input-field" value={payOrderNote} onChange={e => setPayOrderNote(e.target.value)} placeholder="Optional remarks" />
                                        </div>
                                        <PaymentAttachmentField
                                            pendingFile={orderPmtProofFile}
                                            attachmentCleared={orderPmtProofCleared}
                                            onFileSelect={setOrderPmtProofFile}
                                            onClear={() => { setOrderPmtProofFile(null); setOrderPmtProofCleared(true); }}
                                        />
                                        <button type="submit" className="btn btn-primary" disabled={isSavingOrderPayment || amt <= 0} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                            {isSavingOrderPayment ? <Loader2 className="animate-spin" size={18} /> : `Record ₹${Math.min(amt, remaining).toLocaleString()}`}
                                        </button>
                                    </form>
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {/* Edit Payment Modal */}
                {editingPayment && (
                    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, overflowY: 'auto', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
                        <div style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem 1rem' }}>
                            <div className="glass-panel" style={{ width: '100%', maxWidth: '480px', padding: '2rem', position: 'relative', borderRadius: '16px' }}>
                                <button onClick={() => !savingEditPayment && setEditingPayment(null)} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}><X size={22} /></button>
                                <h2 style={{ marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem' }}>
                                    <Pencil size={20} color="var(--primary-light)" /> Edit Payment
                                </h2>
                                {editingPayment.paymentId && <p style={{ margin: '0 0 0.2rem', fontSize: '0.78rem', color: 'var(--primary-light)', fontFamily: 'monospace', fontWeight: 600 }}>{editingPayment.paymentId}</p>}
                                {editingPayment.orderNumber && <p style={{ margin: '0 0 1.25rem', fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>Invoice {editingPayment.orderNumber} — totals adjust automatically</p>}
                                {!editingPayment.orderNumber && <div style={{ marginBottom: '1.25rem' }} />}
                                <form onSubmit={handleUpdatePayment} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        <div>
                                            <label className="input-label">Amount (₹) *</label>
                                            <input required type="number" min={1} step="0.01" className="input-field" value={editPayAmount || ''} onChange={e => setEditPayAmount(Number(e.target.value))} autoFocus />
                                        </div>
                                        <div>
                                            <label className="input-label">Payment Date</label>
                                            <input type="date" className="input-field" value={editPayDate} onChange={e => setEditPayDate(e.target.value)} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="input-label">Payment Method</label>
                                        <select className="input-field" value={editPayMethod} onChange={e => setEditPayMethod(e.target.value)}>
                                            {['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Other'].map(m => <option key={m}>{m}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="input-label">Notes (optional)</label>
                                        <input type="text" className="input-field" value={editPayNote} onChange={e => setEditPayNote(e.target.value)} placeholder="Optional remarks" />
                                    </div>
                                    <PaymentAttachmentField
                                        pendingFile={editProofFile}
                                        existingAttachment={editingPayment.attachmentUrl ? { url: editingPayment.attachmentUrl, name: editingPayment.attachmentName || '', type: editingPayment.attachmentType || '' } : null}
                                        attachmentCleared={editProofCleared}
                                        onFileSelect={setEditProofFile}
                                        onClear={() => { setEditProofFile(null); setEditProofCleared(true); }}
                                    />
                                    <button type="submit" className="btn btn-primary" disabled={savingEditPayment || editPayAmount <= 0} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                        {savingEditPayment ? <Loader2 className="animate-spin" size={18} /> : 'Save Changes'}
                                    </button>
                                </form>
                            </div>
                        </div>
                    </div>
                )}

                {/* Link Payment Modal — moved to portal at bottom of component */}

                {/* Bulk Delete Confirmation Modal */}
                {showBulkDeleteModal && (() => {
                    const selectedOrders = salesOrders.filter((so: any) => selectedSoIds.has(so.id));
                    const totalAmount = selectedOrders.reduce((sum: number, so: any) =>
                        sum + Number(so.grandTotal ?? so.netAmount ?? so.totalAmount ?? 0), 0);
                    return (
                        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
                            <div className="glass-panel" style={{ width: '100%', maxWidth: '500px', padding: '2rem', position: 'relative', maxHeight: '85vh', overflowY: 'auto' }}>
                                <button onClick={() => !bulkDeleting && setShowBulkDeleteModal(false)} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}><X size={24} /></button>
                                <h2 style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--danger)' }}>
                                    <AlertTriangle size={22} /> Delete {selectedOrders.length} Sales Order{selectedOrders.length !== 1 ? 's' : ''}?
                                </h2>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '0.85rem' }}>
                                    The following orders will be permanently deleted:
                                </p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1rem', maxHeight: '200px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                                    {selectedOrders.map((so: any) => (
                                        <div key={so.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.45rem 0.75rem', background: 'var(--surface-raised)', borderRadius: '8px', fontSize: '0.82rem' }}>
                                            <span style={{ fontWeight: 600, color: 'var(--primary-light)' }}>{so.orderNumber || so.invoiceNumber || so.id.slice(-8).toUpperCase()}</span>
                                            <span style={{ color: 'var(--secondary)', fontWeight: 700 }}>₹{Number(so.grandTotal ?? so.netAmount ?? so.totalAmount ?? 0).toLocaleString()}</span>
                                        </div>
                                    ))}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.75rem', background: 'hsla(0,84%,60%,0.08)', borderRadius: '8px', marginBottom: '0.85rem', fontSize: '0.88rem' }}>
                                    <span style={{ color: 'var(--text-secondary)' }}>Total amount being removed:</span>
                                    <span style={{ fontWeight: 800, color: 'var(--danger)', fontSize: '1rem' }}>₹{totalAmount.toLocaleString()}</span>
                                </div>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.83rem', marginBottom: '0.5rem' }}>
                                    The following will be updated automatically:
                                </p>
                                <ul style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem', margin: '0 0 0.85rem', paddingLeft: '1.25rem', lineHeight: 1.7 }}>
                                    <li>Total Sales, Amount Paid &amp; Outstanding Dues</li>
                                    <li>Partner Analytics &amp; order counts</li>
                                    <li>Outstanding Statement</li>
                                </ul>
                                <p style={{ color: 'var(--danger)', fontSize: '0.82rem', fontWeight: 600, marginBottom: '1.25rem' }}>This action cannot be undone.</p>
                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <button type="button" className="btn btn-secondary" onClick={() => setShowBulkDeleteModal(false)} disabled={bulkDeleting} style={{ flex: 1 }}>
                                        Cancel
                                    </button>
                                    <button type="button" className="btn" onClick={handleBulkDeleteConfirm} disabled={bulkDeleting}
                                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', background: 'var(--danger)', color: 'white', border: 'none', cursor: bulkDeleting ? 'not-allowed' : 'pointer' }}>
                                        {bulkDeleting ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
                                        {bulkDeleting ? 'Deleting…' : `Delete ${selectedOrders.length} Order${selectedOrders.length !== 1 ? 's' : ''}`}
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {/* Delete Sales Order Confirmation Modal */}
                {soToDelete && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
                        <div className="glass-panel" style={{ width: '100%', maxWidth: '440px', padding: '2rem', position: 'relative' }}>
                            <button onClick={() => !deletingSO && setSoToDelete(null)} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}><X size={24} /></button>
                            <h2 style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--danger)' }}>
                                <AlertTriangle size={22} /> Delete Sales Order?
                            </h2>
                            <p style={{ color: 'var(--text-secondary)', marginBottom: '0.75rem', fontSize: '0.9rem' }}>
                                Invoice: <strong style={{ color: 'var(--text-primary)' }}>{soToDelete.orderNumber || soToDelete.invoiceNumber || soToDelete.id.slice(-8).toUpperCase()}</strong>
                                {' · '}
                                <strong style={{ color: 'var(--secondary)' }}>₹{Number(soToDelete.grandTotal || soToDelete.netAmount || soToDelete.totalAmount || 0).toLocaleString()}</strong>
                            </p>
                            <p style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                                This will permanently delete this Sales Order. The following will be updated automatically:
                            </p>
                            <ul style={{ color: 'var(--text-tertiary)', fontSize: '0.82rem', margin: '0 0 1rem', paddingLeft: '1.25rem', lineHeight: 1.7 }}>
                                <li>Total Sales, Amount Paid &amp; Outstanding Dues</li>
                                <li>Partner Analytics &amp; order counts</li>
                                <li>Outstanding Statement</li>
                            </ul>
                            <p style={{ color: 'var(--danger)', fontSize: '0.82rem', fontWeight: 600, marginBottom: '1.25rem' }}>This action cannot be undone.</p>
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setSoToDelete(null)} disabled={deletingSO} style={{ flex: 1 }}>
                                    {t('common.cancel')}
                                </button>
                                <button type="button" className="btn" onClick={() => handleDeleteSalesOrder(soToDelete)} disabled={deletingSO}
                                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', background: 'var(--danger)', color: 'white', border: 'none', cursor: deletingSO ? 'not-allowed' : 'pointer' }}>
                                    {deletingSO ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />} Delete Sales Order
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Unlink Payments Modal */}
                {unlinkOrder && (
                    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
                            <div className="glass-panel" style={{ width: '100%', maxWidth: '560px', padding: '2rem', position: 'relative', borderRadius: '16px', maxHeight: '90vh', overflowY: 'auto' }}>
                                <button onClick={() => { setUnlinkOrder(null); setUnlinkAllocations([]); }} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}><X size={22} /></button>
                                <h2 style={{ marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem' }}>
                                    <Link2 size={22} color="var(--primary-light)" /> Linked Payments
                                </h2>
                                <p style={{ margin: '0 0 1.25rem', fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>
                                    Order: <strong style={{ color: 'var(--primary-light)' }}>{unlinkOrder.orderNumber || unlinkOrder.invoiceNumber || unlinkOrder.id.slice(-8).toUpperCase()}</strong>
                                </p>

                                {loadingUnlinkAllocations ? (
                                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-tertiary)' }}>
                                        <Loader2 className="animate-spin" size={24} style={{ margin: '0 auto', display: 'block' }} />
                                    </div>
                                ) : unlinkAllocations.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-tertiary)' }}>
                                        <p style={{ margin: 0 }}>No linked payment allocations found.</p>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                        {unlinkAllocations.map(alloc => {
                                            const pmt = payments.find(p => p.id === alloc.paymentId);
                                            const pmtDisplay = alloc.paymentIdDisplay || (pmt?.paymentId) || `#${alloc.paymentId?.slice(-6).toUpperCase()}`;
                                            return (
                                                <div key={alloc.id} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', padding: '0.75rem 1rem', background: 'var(--surface-raised)', borderRadius: '10px', border: '1px solid var(--surface-border)', flexWrap: 'wrap' }}>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: 'var(--primary-light)', fontWeight: 700, marginBottom: '0.2rem' }}>{pmtDisplay}</div>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                            Allocated: <strong style={{ color: '#10b981' }}>₹{Number(alloc.allocatedAmount || 0).toLocaleString()}</strong>
                                                            {pmt?.paymentMethod && <span style={{ marginLeft: '0.5rem', background: '#10b98122', color: '#10b981', padding: '0.1rem 0.4rem', borderRadius: '99px', fontSize: '0.7rem', fontWeight: 600 }}>{pmt.paymentMethod}</span>}
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => handleUnlinkPayment(alloc)}
                                                        disabled={unlinkingPmtId === alloc.id}
                                                        className="btn"
                                                        style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.35rem 0.75rem', fontSize: '0.78rem', background: 'hsla(38,92%,50%,0.1)', color: 'var(--warning)', border: '1px solid hsla(38,92%,50%,0.3)', flexShrink: 0 }}
                                                    >
                                                        {unlinkingPmtId === alloc.id ? <Loader2 className="animate-spin" size={12} /> : <X size={12} />}
                                                        Unlink
                                                    </button>
                                                </div>
                                            );
                                        })}
                                        <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', margin: '0.25rem 0 0' }}>
                                            Unlinking restores the payment's available balance and reduces the order's paid amount.
                                        </p>
                                    </div>
                                )}
                            </div>
                    </div>
                )}

                {/* Delete Payment with Linked Allocations — Confirmation Modal */}
                {deletePaymentTarget && (
                    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', backdropFilter: 'blur(4px)' }}>
                        <div className="glass-panel" style={{ width: '100%', maxWidth: '460px', padding: '2rem', position: 'relative', borderRadius: '16px' }}>
                            <button onClick={() => !deletingLinkedPayment && setDeletePaymentTarget(null)} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}><X size={22} /></button>
                            <h2 style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--danger)', fontSize: '1.15rem' }}>
                                <AlertTriangle size={22} /> Delete Payment?
                            </h2>
                            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: '1rem', lineHeight: 1.6 }}>
                                This payment (<strong style={{ color: 'var(--primary-light)' }}>{deletePaymentTarget.paymentId || `#${deletePaymentTarget.id.slice(-6).toUpperCase()}`}</strong> — <strong style={{ color: '#10b981' }}>₹{Number(deletePaymentTarget.amount || 0).toLocaleString()}</strong>) is linked with <strong>{deletePaymentTarget.linkedOrderIds?.length}</strong> sales order{(deletePaymentTarget.linkedOrderIds?.length ?? 0) !== 1 ? 's' : ''}.
                                <br /><br />
                                Deleting it will first unlink all allocations and then permanently delete the payment.
                            </p>
                            <ul style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', margin: '0 0 1.25rem', paddingLeft: '1.25rem', lineHeight: 1.7 }}>
                                <li>All linked payment allocations removed</li>
                                <li>Affected order balances recalculated</li>
                                <li>Retailer totals adjusted</li>
                            </ul>
                            <p style={{ color: 'var(--danger)', fontSize: '0.82rem', fontWeight: 600, marginBottom: '1.25rem' }}>This action cannot be undone.</p>
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setDeletePaymentTarget(null)} disabled={deletingLinkedPayment} style={{ flex: 1 }}>Cancel</button>
                                <button type="button" className="btn" onClick={handleDeletePaymentConfirmed} disabled={deletingLinkedPayment}
                                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', background: 'var(--danger)', color: 'white', border: 'none' }}>
                                    {deletingLinkedPayment ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
                                    {deletingLinkedPayment ? 'Deleting…' : 'Delete Payment'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Quick Paid Modal */}
                {quickPaidOrder && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
                        <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', padding: '2rem', position: 'relative' }}>
                            <button onClick={() => setQuickPaidOrder(null)} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}><X size={24} /></button>
                            <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <CheckSquare size={24} color="var(--primary-light)" /> {t('worklist_details.mark_as_paid')}
                            </h2>
                            <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                                {t('worklist_details.confirm_payment_of')} <strong>₹{quickPaidOrder.amount.toLocaleString()}</strong> {t('common.for')} {quickPaidOrder.productName}.
                            </p>
                            <form onSubmit={handleQuickPaid} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                <div>
                                    <label className="input-label">{t('worklist_details.payment_remark')} ({t('common.optional')})</label>
                                    <input className="input-field" value={quickPaidRemark} onChange={e => setQuickPaidRemark(e.target.value)} placeholder={t('worklist_details.payment_notes_placeholder')} autoFocus />
                                </div>
                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>{t('common.confirm')}</button>
                                    <button type="button" className="btn btn-secondary" onClick={() => setQuickPaidOrder(null)} style={{ flex: 1 }}>{t('common.cancel')}</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

            </div>
        </div>

        {/* ── Link Payment Modal — portalled to body ── */}
        {linkPaymentOrder && createPortal((() => {
            const grandTotal = Number(linkPaymentOrder.grandTotal ?? linkPaymentOrder.netAmount ?? linkPaymentOrder.totalAmount ?? 0);
            const alreadyPaid = Number(linkPaymentOrder.amountPaid ?? 0);
            const remaining = Math.max(0, grandTotal - alreadyPaid);
            const orderLabel = linkPaymentOrder.orderNumber || linkPaymentOrder.invoiceNumber || linkPaymentOrder.id.slice(-8).toUpperCase();
            const totalAllocated = Object.values(linkAllocations).reduce((s, v) => s + (Number(v) || 0), 0);
            const outstandingAfter = Math.max(0, remaining - totalAllocated);
            const over = totalAllocated > remaining + 0.01;
            return (
                <div style={{ position: 'fixed', inset: 0, zIndex: 9999, overflowY: 'auto', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
                    <div style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem 1rem' }}>
                        <div className="glass-panel" style={{ width: '100%', maxWidth: '560px', padding: '2rem', position: 'relative', borderRadius: '16px' }}>
                            <button onClick={() => !savingLinkPayment && setLinkPaymentOrder(null)} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}><X size={22} /></button>

                            <h2 style={{ marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem' }}>
                                <Link2 size={22} color="var(--primary-light)" /> Link Payment
                            </h2>
                            <p style={{ margin: '0 0 1.25rem', fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>
                                Order: <strong style={{ color: 'var(--primary-light)' }}>{orderLabel}</strong>
                            </p>

                            {/* Order summary */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', background: 'var(--surface-raised)', borderRadius: '10px', padding: '0.75rem 1rem', marginBottom: '1.25rem' }}>
                                <div><div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Order Total</div><div style={{ fontWeight: 700 }}>₹{grandTotal.toLocaleString()}</div></div>
                                <div><div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Already Paid</div><div style={{ fontWeight: 700, color: '#10b981' }}>₹{alreadyPaid.toLocaleString()}</div></div>
                                <div><div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Outstanding</div><div style={{ fontWeight: 700, color: '#ef4444' }}>₹{remaining.toLocaleString()}</div></div>
                            </div>

                            {availablePayments.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-tertiary)' }}>
                                    <Wallet size={32} color="var(--surface-border)" style={{ margin: '0 auto 0.75rem', display: 'block' }} />
                                    <p style={{ margin: 0 }}>No unallocated payments available.</p>
                                    <p style={{ margin: '0.5rem 0 0', fontSize: '0.82rem' }}>Record a payment first, then link it here.</p>
                                </div>
                            ) : (
                                <>
                                    <div style={{ marginBottom: '0.75rem', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                        Available payments — enter amount to allocate:
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
                                        {availablePayments.map(pmt => {
                                            const alloc = Number(linkAllocations[pmt.id] ?? 0);
                                            const maxAlloc = Math.min(getEffectiveUnallocated(pmt), remaining);
                                            const pmtDate = pmt.paymentDate || (pmt.createdAt?.toDate ? pmt.createdAt.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—');
                                            return (
                                                <div key={pmt.id} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', padding: '0.65rem 0.85rem', background: alloc > 0 ? 'hsla(142,69%,58%,0.07)' : 'var(--surface-raised)', borderRadius: '8px', border: `1px solid ${alloc > 0 ? '#10b98130' : 'var(--surface-border)'}`, flexWrap: 'wrap', transition: 'all 0.15s' }}>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                            <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--primary-light)', fontWeight: 700 }}>{pmt.paymentId || `#${pmt.id.slice(-6).toUpperCase()}`}</span>
                                                            {pmt.paymentMethod && <span style={{ background: '#10b98122', color: '#10b981', padding: '0.1rem 0.4rem', borderRadius: '99px', fontSize: '0.7rem', fontWeight: 600 }}>{pmt.paymentMethod}</span>}
                                                            <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>{pmtDate}</span>
                                                        </div>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                                                            Total: ₹{Number(pmt.amount || 0).toLocaleString()} · Remaining: <strong style={{ color: '#10b981' }}>₹{getEffectiveUnallocated(pmt).toLocaleString()}</strong>
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                                                        <input
                                                            type="number" min={0} max={maxAlloc} step="0.01"
                                                            value={alloc || ''}
                                                            placeholder="0.00"
                                                            onChange={e => setLinkAllocations(prev => ({ ...prev, [pmt.id]: Math.min(Number(e.target.value) || 0, maxAlloc) }))}
                                                            style={{ width: '110px', padding: '0.3rem 0.5rem', borderRadius: '6px', border: '1px solid var(--surface-border)', background: 'var(--surface-base)', color: 'var(--text-primary)', fontSize: '0.85rem', textAlign: 'right' }}
                                                        />
                                                        <button type="button"
                                                            onClick={() => setLinkAllocations(prev => ({ ...prev, [pmt.id]: maxAlloc }))}
                                                            style={{ fontSize: '0.7rem', padding: '0.25rem 0.5rem', borderRadius: '6px', border: '1px solid var(--surface-border)', background: 'var(--surface-raised)', color: 'var(--text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>
                                                            Max
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Allocation summary */}
                                    <div style={{ background: over ? 'hsla(0,84%,60%,0.08)' : 'var(--surface-raised)', borderRadius: '10px', padding: '0.75rem 1rem', marginBottom: '1.25rem', border: `1px solid ${over ? 'hsla(0,84%,60%,0.3)' : 'var(--surface-border)'}` }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                            <span style={{ color: 'var(--text-secondary)' }}>Total linking:</span>
                                            <span style={{ fontWeight: 700, color: over ? '#ef4444' : '#10b981' }}>₹{totalAllocated.toLocaleString()}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginTop: '0.3rem' }}>
                                            <span style={{ color: 'var(--text-secondary)' }}>Outstanding after:</span>
                                            <span style={{ fontWeight: 700, color: outstandingAfter <= 0 ? '#10b981' : '#f59e0b' }}>
                                                ₹{outstandingAfter.toLocaleString()}{outstandingAfter <= 0 ? ' ✅' : ''}
                                            </span>
                                        </div>
                                        {over && <div style={{ fontSize: '0.72rem', color: '#ef4444', marginTop: '0.4rem' }}>Allocation exceeds outstanding — reduce amounts.</div>}
                                    </div>

                                    <div style={{ display: 'flex', gap: '1rem' }}>
                                        <button type="button" className="btn btn-secondary" onClick={() => setLinkPaymentOrder(null)} disabled={savingLinkPayment} style={{ flex: 1 }}>Cancel</button>
                                        <button type="button" className="btn btn-primary" onClick={handleLinkPayments}
                                            disabled={savingLinkPayment || totalAllocated <= 0 || over}
                                            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                            {savingLinkPayment ? <Loader2 className="animate-spin" size={16} /> : <><Link2 size={15} /> Link Payments</>}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            );
        })(), document.body)}

        {/* ── Statement Download Modal — portalled to body to escape fixed-position traps ── */}
        {showStatementModal && createPortal(
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(4px)' }}>
                <div className="glass-panel" style={{ width: '100%', maxWidth: '420px', padding: '2rem', position: 'relative' }}>
                    <button onClick={() => setShowStatementModal(false)} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}>
                        <X size={22} />
                    </button>
                    <h2 style={{ marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem' }}>
                        <Download size={20} color="var(--primary-light)" /> Download Statement
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                        Ledger statement for <strong>{retailer.name}</strong>. Leave dates blank for all transactions.
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div>
                            <label className="input-label">From Date <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(optional)</span></label>
                            <input
                                type="date"
                                className="input-field"
                                value={stmtFromDate}
                                onChange={e => setStmtFromDate(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="input-label">To Date <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(optional)</span></label>
                            <input
                                type="date"
                                className="input-field"
                                value={stmtToDate}
                                onChange={e => setStmtToDate(e.target.value)}
                            />
                        </div>

                        <div style={{ padding: '0.75rem', background: 'hsla(152,60%,40%,0.07)', borderRadius: '8px', border: '1px solid hsla(152,60%,40%,0.2)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            <div style={{ fontWeight: 600, marginBottom: '0.25rem', color: 'var(--primary-light)' }}>Will include:</div>
                            <div>• {salesOrders.length} invoice{salesOrders.length !== 1 ? 's' : ''} (Debit)</div>
                            <div>• {payments.length} payment{payments.length !== 1 ? 's' : ''} (Credit)</div>
                        </div>

                        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
                            <button
                                className="btn btn-primary"
                                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                                onClick={handleDownloadStatement}
                                disabled={generatingStatement}
                            >
                                {generatingStatement
                                    ? <><Loader2 size={15} className="animate-spin" /> Generating…</>
                                    : <><Download size={15} /> Download PDF</>
                                }
                            </button>
                            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowStatementModal(false)}>
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            </div>,
            document.body
        )}
        </>
    );
}
