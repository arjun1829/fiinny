import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Phone, MapPin, Calendar, MessageCircle, FileText, CheckSquare, ShoppingCart, Loader2, Trash2, Mic, TrendingUp, X, AlertTriangle, FilePen, Printer, PlusCircle, Square, Wallet, Pencil } from 'lucide-react';
import { RadialBarChart, RadialBar, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { useTranslation } from 'react-i18next';
import { getDoc, query, orderBy, onSnapshot, addDoc, serverTimestamp, deleteDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantDoc, getTenantCollection } from '../utils/tenantPath';
import { useSchema } from '../contexts/SchemaContext';
import DynamicForm from '../components/DynamicForm';
import OutstandingInvoice from '../components/OutstandingInvoice';


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
    amount: number;
    notes?: string;
    orderId?: string;
    orderNumber?: string;
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

    const [activeTab, setActiveTab] = useState<'overview' | 'tasks' | 'notes' | 'orders' | 'payments'>('orders');
    const [tasks, setTasks] = useState<Task[]>([]);
    const [notes, setNoteData] = useState<Note[]>([]);
    const [orders, setOrders] = useState<Order[]>([]);
    const [salesOrders, setSalesOrders] = useState<any[]>([]);
    const [payments, setPayments] = useState<Payment[]>([]);


    // Financial Modal States
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [paymentAmount, setPaymentAmount] = useState<number>(0);
    const [paymentNotes, setPaymentNotes] = useState('');
    const [isRecordingPayment, setIsRecordingPayment] = useState(false);

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
    const [isSavingOrderPayment, setIsSavingOrderPayment] = useState(false);

    // Edit an existing payment/credit entry
    const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
    const [editPayAmount, setEditPayAmount] = useState<number>(0);
    const [editPayNote, setEditPayNote] = useState('');
    const [editPayDate, setEditPayDate] = useState(''); // yyyy-mm-dd
    const [savingEditPayment, setSavingEditPayment] = useState(false);

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
                type SODoc = { id: string; createdAt?: { seconds?: number }; [key: string]: unknown };
                const docs: SODoc[] = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as SODoc));
                docs.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
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

    const handleWhatsApp = () => {
        if (!retailer?.number) return;
        const phone = retailer.number.replace(/\D/g, ''); // Strip non-digits
        const msg = encodeURIComponent(`Hello ${retailer.name}, this is from KaranArjun Krushi Seva Kendra.`);
        window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
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
                // log payment entry
                await addDoc(getTenantCollection(db, tenantId, 'retailers', id, 'payments'), {
                    amount: newlyPaid,
                    notes: `Quick mark Paid — Order ${so.orderNumber || soId.slice(-6)}`,
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

    const handleSelectAllSOs = () => setSelectedSoIds(new Set(salesOrders.map((so: any) => so.id)));
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

            // Log payment entry
            await addDoc(getTenantCollection(db, tenantId!, 'retailers', id, 'payments'), {
                amount: amount,
                notes: `Quick Payment for Order ${quickPaidOrder.id.substring(0, 5)}: ${quickPaidRemark}`,
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
        if (!id || paymentAmount <= 0) return;
        setIsRecordingPayment(true);

        try {
            // Log the payment in a subcollection
            await addDoc(getTenantCollection(db, tenantId!, 'retailers', id, 'payments'), {
                amount: paymentAmount,
                notes: paymentNotes,
                createdAt: serverTimestamp()
            });

            // Update retailer totals
            const currentPaid = Number(retailer?.totalPaid || 0);
            const currentOutstanding = Number(retailer?.outstandingAmount || 0);

            await updateDoc(getTenantDoc(db, tenantId!, 'retailers', id), {
                totalPaid: currentPaid + paymentAmount,
                outstandingAmount: Math.max(0, currentOutstanding - paymentAmount)
            });

            // Re-fetch retailer
            const updatedSnap = await getDoc(getTenantDoc(db, tenantId!, 'retailers', id));
            setRetailer({ id: updatedSnap.id, ...updatedSnap.data() } as Retailer);

            setShowPaymentModal(false);
            setPaymentAmount(0);
            setPaymentNotes('');
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
            await addDoc(getTenantCollection(db, tenantId, 'retailers', id, 'payments'), {
                amount: applied,
                orderId: payOrder.id,
                orderNumber: orderLabel,
                notes: payOrderNote,
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
        const d = p.createdAt?.toDate ? p.createdAt.toDate() : null;
        setEditPayDate(d ? d.toISOString().slice(0, 10) : '');
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

            const update: Record<string, any> = { amount: newAmount, notes: editPayNote };
            if (editPayDate) update.createdAt = new Date(editPayDate);

            await updateDoc(getTenantDoc(db, tenantId, 'retailers', id, 'payments', editingPayment.id), update);
            setEditingPayment(null);
        } catch (error) {
            console.error("Error updating payment:", error);
            alert(t('worklist_details.update_error') + ': ' + ((error as { message?: string })?.message || String(error)));
        } finally {
            setSavingEditPayment(false);
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

            {/* Financial Overview Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                <div className="glass-panel" style={{ padding: '1.5rem', borderLeft: '4px solid var(--secondary)' }}>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>Total Sales</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>₹{Number(retailer.totalSales || 0).toLocaleString()}</div>
                </div>
                <div className="glass-panel" style={{ padding: '1.5rem', borderLeft: '4px solid var(--primary)' }}>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>{t('worklist_details.amount_paid')}</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--primary-light)' }}>₹{Number(retailer.totalPaid || 0).toLocaleString()}</div>
                </div>
                <div className="glass-panel" style={{ padding: '1.5rem', borderLeft: '4px solid var(--danger)', background: Number(retailer.outstandingAmount || 0) > 0 ? 'hsla(0, 84%, 60%, 0.05)' : 'transparent' }}>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>{t('worklist_details.outstanding_dues')}</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: Number(retailer.outstandingAmount || 0) > 0 ? 'var(--danger)' : 'var(--text-primary)' }}>₹{Number(retailer.outstandingAmount || 0).toLocaleString()}</div>
                </div>
            </div>

            {/* ── Partner Analytics ── */}
            {salesOrders.length > 0 && (() => {
                const totalSales = Number(retailer.totalSales || 0);
                const totalPaid  = Number(retailer.totalPaid  || 0);
                const outstanding = Number(retailer.outstandingAmount || 0);
                const paidPct = totalSales > 0 ? Math.round((totalPaid / totalSales) * 100) : 0;

                const radialData = [
                    { name: 'Paid', value: paidPct, fill: '#10b981' },
                    { name: 'Outstanding', value: 100 - paidPct, fill: '#ef4444' },
                ];

                // Order trend: group salesOrders by month
                const monthMap: Record<string, number> = {};
                salesOrders.forEach((so: any) => {
                    const d = so.createdAt?.toDate ? so.createdAt.toDate() : null;
                    if (!d) return;
                    const key = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
                    monthMap[key] = (monthMap[key] || 0) + Number(so.grandTotal || so.netAmount || 0);
                });
                const trendData = Object.entries(monthMap)
                    .map(([month, value]) => ({ month, value }))
                    .slice(-6); // last 6 months

                return (
                    <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '1.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Partner Analytics</h3>
                        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>

                            {/* Radial payment circle */}
                            <div style={{ flexShrink: 0, textAlign: 'center', minWidth: 140 }}>
                                <div style={{ position: 'relative', width: 130, height: 130, margin: '0 auto' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <RadialBarChart cx="50%" cy="50%" innerRadius="65%" outerRadius="90%"
                                            startAngle={90} endAngle={-270} data={radialData} barSize={14}>
                                            <RadialBar dataKey="value" cornerRadius={8} />
                                        </RadialBarChart>
                                    </ResponsiveContainer>
                                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                        <span style={{ fontSize: '1.4rem', fontWeight: 800, color: '#10b981' }}>{paidPct}%</span>
                                        <span style={{ fontSize: '0.6rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>PAID</span>
                                    </div>
                                </div>
                                <div style={{ marginTop: '0.5rem', fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
                                    <span style={{ color: '#10b981', fontWeight: 600 }}>₹{totalPaid.toLocaleString()}</span> paid · <span style={{ color: '#ef4444', fontWeight: 600 }}>₹{outstanding.toLocaleString()}</span> due
                                </div>
                            </div>

                            {/* Vertical divider (hidden on mobile) */}
                            <div style={{ width: '1px', background: 'var(--surface-border)', alignSelf: 'stretch', minHeight: 80 }} />

                            {/* Bar trend chart */}
                            <div style={{ flex: 1, minWidth: 200, minHeight: 120 }}>
                                <p style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Order Value Trend</p>
                                {trendData.length > 0 ? (
                                    <ResponsiveContainer width="100%" height={110}>
                                        <BarChart data={trendData} barSize={22}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="hsla(0,0%,100%,0.05)" />
                                            <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
                                            <YAxis hide />
                                            <Tooltip
                                                contentStyle={{ background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderRadius: 8, fontSize: '0.78rem' }}
                                                formatter={(v: any) => [`₹${Number(v).toLocaleString()}`, 'Order Value']}
                                            />
                                            <Bar dataKey="value" fill="var(--primary-light)" radius={[4,4,0,0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : <p style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>Not enough data for trend.</p>}
                            </div>

                            {/* Quick stats column */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', minWidth: 120 }}>
                                {[
                                    { label: 'Total Orders', value: salesOrders.length },
                                    { label: 'Avg Order', value: `₹${salesOrders.length > 0 ? Math.round(totalSales / salesOrders.length).toLocaleString() : 0}` },
                                    { label: 'Paid Orders', value: salesOrders.filter((s: any) => s.paymentStatus === 'Paid').length },
                                    { label: 'Delivered', value: salesOrders.filter((s: any) => s.status === 'delivered').length },
                                ].map(stat => (
                                    <div key={stat.label} style={{ background: 'var(--surface-raised)', borderRadius: '10px', padding: '0.5rem 0.85rem' }}>
                                        <div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{stat.label}</div>
                                        <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)' }}>{stat.value}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Tabs Navigation */}
            <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--surface-border)', marginBottom: '2rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
                {[
                    { id: 'orders', label: 'B2B Orders', icon: ShoppingCart, count: salesOrders.length },
                    { id: 'payments', label: 'Payments', icon: Wallet, count: payments.length },
                    { id: 'overview', label: 'Overview', icon: User },
                    { id: 'tasks', label: t('worklist_details.tasks'), icon: CheckSquare, count: tasks.length },
                    { id: 'notes', label: t('worklist_details.notes'), icon: FileText, count: notes.length }
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
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
                            <div>
                                <h3 style={{ fontSize: '1.15rem', margin: 0 }}>Payments &amp; Credits ({payments.length})</h3>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                                    Total received: <b style={{ color: '#10b981' }}>₹{payments.reduce((s, p) => s + (Number(p.amount) || 0), 0).toLocaleString()}</b>
                                </span>
                            </div>
                            {!isSales && (
                                <button onClick={() => setShowPaymentModal(true)} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
                                    <PlusCircle size={16} /> Add Credit / Payment
                                </button>
                            )}
                        </div>

                        {payments.length === 0 ? (
                            <div className="glass-panel" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                                <Wallet size={40} color="var(--surface-border)" style={{ margin: '0 auto 1rem', display: 'block' }} />
                                <p style={{ margin: 0 }}>No payments recorded yet.</p>
                                <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>Use “Add Credit / Payment”, or “Add Payment” on any invoice.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {payments.map(p => {
                                    const d = p.createdAt?.toDate ? p.createdAt.toDate() : (p.createdAt?.seconds ? new Date(p.createdAt.seconds * 1000) : null);
                                    return (
                                        <div key={p.id} className="glass-panel" style={{ padding: '1rem 1.25rem', borderLeft: '4px solid #10b981', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: 0 }}>
                                                <div style={{ fontWeight: 800, fontSize: '1.15rem', color: '#10b981', whiteSpace: 'nowrap' }}>₹{Number(p.amount || 0).toLocaleString()}</div>
                                                <div style={{ minWidth: 0 }}>
                                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                                        {p.orderNumber && <span style={{ background: '#8b5cf622', color: '#8b5cf6', padding: '0.1rem 0.5rem', borderRadius: '99px', fontSize: '0.7rem', fontWeight: 600 }}>Invoice {p.orderNumber}</span>}
                                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</span>
                                                    </div>
                                                    {p.notes && <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.2rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.notes}</div>}
                                                </div>
                                            </div>
                                            {!isSales && (
                                                <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                                                    <button onClick={() => openEditPayment(p)} title="Edit" className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}>
                                                        <Pencil size={13} /> Edit
                                                    </button>
                                                    <button onClick={() => handleDeletePayment(p)} title="Delete" className="btn" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.35rem 0.75rem', fontSize: '0.78rem', background: 'hsla(0, 84%, 60%, 0.1)', color: 'var(--danger)', border: '1px solid hsla(0, 84%, 60%, 0.3)' }}>
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
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
                                <h3 style={{ fontSize: '1.15rem', margin: 0 }}>Sales Orders ({salesOrders.length})</h3>
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
                                            Select All ({salesOrders.length})
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

                            {salesOrders.length === 0 ? (
                                <div className="glass-panel" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                                    <ShoppingCart size={40} color="var(--surface-border)" style={{ margin: '0 auto 1rem', display: 'block' }} />
                                    <p style={{ margin: 0 }}>No sales orders yet for this partner.</p>
                                    <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>Use the buttons above to create one.</p>
                                </div>
                            ) : salesOrders.map((so: any) => {
                                const statusColor: Record<string, string> = { confirmed: '#10b981', draft: '#f59e0b', dispatched: '#38bdf8', cancelled: '#ef4444' };
                                const color = statusColor[so.status?.toLowerCase()] || '#94a3b8';
                                const date = so.createdAt?.toDate ? new Date(so.createdAt.toDate()).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'2-digit' }) : '—';
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
                                                    title="Record a payment (partial or full) against this invoice"
                                                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 1rem', fontSize: '0.82rem' }}>
                                                    <PlusCircle size={14} /> Add Payment
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
                                            <button className="btn btn-secondary" onClick={() => navigate(`/b2b-invoice?orderId=${so.id}&retailerId=${id}`)}
                                                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 1rem', fontSize: '0.82rem' }}>
                                                <Printer size={14} /> View / Print Invoice
                                            </button>
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

                {/* Payment Modal */}
                {showPaymentModal && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
                        <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', padding: '2rem', position: 'relative' }}>
                            <button onClick={() => setShowPaymentModal(false)} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}><X size={24} /></button>
                            <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <TrendingUp size={24} color="var(--primary-light)" /> {t('worklist_details.record_payment')}
                            </h2>
                            <form onSubmit={handleRecordPayment} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                <div>
                                    <label className="input-label">{t('worklist_details.amount_paid')} (₹)</label>
                                    <input required type="number" className="input-field" value={paymentAmount} onChange={e => setPaymentAmount(Number(e.target.value))} autoFocus />
                                </div>
                                <div>
                                    <label className="input-label">{t('common.notes')} ({t('common.optional')})</label>
                                    <textarea className="input-field" style={{ minHeight: '80px', paddingTop: '0.75rem' }} value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} placeholder={t('worklist_details.payment_notes_placeholder')} />
                                </div>
                                <div style={{ marginTop: '1rem' }}>
                                    <button type="submit" className="btn btn-primary" disabled={isRecordingPayment || paymentAmount <= 0} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                        {isRecordingPayment ? <Loader2 className="animate-spin" size={18} /> : t('worklist_details.confirm_payment')}
                                    </button>
                                </div>
                            </form>
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
                        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
                            <div className="glass-panel" style={{ width: '100%', maxWidth: '420px', padding: '2rem', position: 'relative' }}>
                                <button onClick={() => !isSavingOrderPayment && setPayOrder(null)} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}><X size={24} /></button>
                                <h2 style={{ marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem' }}>
                                    <PlusCircle size={22} color="var(--primary-light)" /> Add Payment
                                </h2>
                                <p style={{ margin: '0 0 1.25rem', fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>Invoice {orderLabel}</p>

                                {/* Order money summary */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', background: 'var(--surface-raised)', borderRadius: '10px', padding: '0.75rem 1rem', marginBottom: '1.25rem' }}>
                                    <div><div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Total</div><div style={{ fontWeight: 700 }}>₹{grandTotal.toLocaleString()}</div></div>
                                    <div><div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Paid</div><div style={{ fontWeight: 700, color: '#10b981' }}>₹{alreadyPaid.toLocaleString()}</div></div>
                                    <div><div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Outstanding</div><div style={{ fontWeight: 700, color: '#ef4444' }}>₹{remaining.toLocaleString()}</div></div>
                                </div>

                                <form onSubmit={handleAddOrderPayment} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <div>
                                        <label className="input-label">Payment Amount (₹)</label>
                                        <input required type="number" min={1} max={remaining} step="0.01" className="input-field" value={payOrderAmount || ''} onChange={e => setPayOrderAmount(Number(e.target.value))} autoFocus />
                                        <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                                            <button type="button" onClick={() => setPayOrderAmount(Math.round(remaining / 2))} style={{ fontSize: '0.72rem', padding: '0.2rem 0.6rem', borderRadius: '6px', border: '1px solid var(--surface-border)', background: 'var(--surface-raised)', color: 'var(--text-secondary)', cursor: 'pointer' }}>Half</button>
                                            <button type="button" onClick={() => setPayOrderAmount(remaining)} style={{ fontSize: '0.72rem', padding: '0.2rem 0.6rem', borderRadius: '6px', border: '1px solid var(--surface-border)', background: 'var(--surface-raised)', color: 'var(--text-secondary)', cursor: 'pointer' }}>Full (₹{remaining.toLocaleString()})</button>
                                        </div>
                                        {over && <div style={{ fontSize: '0.72rem', color: '#f59e0b', marginTop: '0.4rem' }}>Only ₹{remaining.toLocaleString()} is outstanding — the extra will be ignored.</div>}
                                    </div>
                                    <div>
                                        <label className="input-label">{t('common.notes')} ({t('common.optional')})</label>
                                        <input type="text" className="input-field" value={payOrderNote} onChange={e => setPayOrderNote(e.target.value)} placeholder={t('worklist_details.payment_notes_placeholder')} />
                                    </div>
                                    <button type="submit" className="btn btn-primary" disabled={isSavingOrderPayment || amt <= 0} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                        {isSavingOrderPayment ? <Loader2 className="animate-spin" size={18} /> : `Record ₹${Math.min(amt, remaining).toLocaleString()}`}
                                    </button>
                                </form>
                            </div>
                        </div>
                    );
                })()}

                {/* Edit Payment Modal */}
                {editingPayment && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
                        <div className="glass-panel" style={{ width: '100%', maxWidth: '420px', padding: '2rem', position: 'relative' }}>
                            <button onClick={() => !savingEditPayment && setEditingPayment(null)} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}><X size={24} /></button>
                            <h2 style={{ marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem' }}>
                                <Pencil size={20} color="var(--primary-light)" /> Edit Payment
                            </h2>
                            {editingPayment.orderNumber && <p style={{ margin: '0 0 1.25rem', fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>Invoice {editingPayment.orderNumber} — totals adjust automatically</p>}
                            <form onSubmit={handleUpdatePayment} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div>
                                    <label className="input-label">Amount (₹)</label>
                                    <input required type="number" min={1} step="0.01" className="input-field" value={editPayAmount || ''} onChange={e => setEditPayAmount(Number(e.target.value))} autoFocus />
                                </div>
                                <div>
                                    <label className="input-label">Date</label>
                                    <input type="date" className="input-field" value={editPayDate} onChange={e => setEditPayDate(e.target.value)} />
                                </div>
                                <div>
                                    <label className="input-label">{t('common.notes')} ({t('common.optional')})</label>
                                    <input type="text" className="input-field" value={editPayNote} onChange={e => setEditPayNote(e.target.value)} placeholder={t('worklist_details.payment_notes_placeholder')} />
                                </div>
                                <button type="submit" className="btn btn-primary" disabled={savingEditPayment || editPayAmount <= 0} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                    {savingEditPayment ? <Loader2 className="animate-spin" size={18} /> : 'Save Changes'}
                                </button>
                            </form>
                        </div>
                    </div>
                )}

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
    );
}
