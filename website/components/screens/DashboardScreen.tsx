import { useState, useMemo, useEffect } from "react";
import { ExpenseItem, IncomeItem, deleteExpense, deleteIncome, UserProfile, FriendModel, GroupModel } from "@/lib/firestore";
import { db } from "@/lib/firebase";
import UnifiedTransactionList from "../dashboard/transactions/UnifiedTransactionList";
import TransactionFiltersModal, { ExpenseFilterConfig } from "../dashboard/transactions/TransactionFiltersModal";
import SummaryRingCard from "../dashboard/transactions/SummaryRingCard";
import TransactionCharts from "../dashboard/transactions/TransactionCharts";
import BulkEditModal, { BulkEditSpec } from "../dashboard/transactions/BulkEditModal";
import SplitExpenseModal from "../dashboard/transactions/SplitExpenseModal";
import TransactionDetailsModal from "../dashboard/transactions/TransactionDetailsModal";
import TransactionModal from "../dashboard/transactions/TransactionModal";
import FiinnyBrainChat from "../FiinnyBrainChat";
import { Plus, Search, Filter, Download, X, Save, Trash2, Tag, Check, Edit2, RefreshCw, Layers } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { doc, setDoc, collection, Timestamp, writeBatch } from "firebase/firestore";
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, isWithinInterval, format } from "date-fns";
import { GmailService } from "@/lib/gmail";
import GmailLinkModal from "../dashboard/transactions/GmailLinkModal";

const kExpenseCategories = [
    'General', 'Food', 'Groceries', 'Travel', 'Shopping', 'Bills', 'Entertainment',
    'Health', 'Fuel', 'Subscriptions', 'Education', 'Recharge', 'Loan EMI',
    'Fees/Charges', 'Rent', 'Utilities', 'Other'
];

const kIncomeCategories = [
    'General', 'Salary', 'Freelance', 'Gift', 'Investment', 'Other'
];

interface TransactionsViewProps {
    expenses: ExpenseItem[];
    incomes: IncomeItem[];
    userProfile: UserProfile | null;
    onRefresh: () => void;
    friends?: FriendModel[];
    groups?: GroupModel[];
}

export default function DashboardScreen({ expenses, incomes, userProfile, onRefresh, friends = [], groups = [] }: TransactionsViewProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [filterType, setFilterType] = useState<"all" | "expense" | "income">("all");
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
    const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
    const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
    const [editingTx, setEditingTx] = useState<ExpenseItem | IncomeItem | null>(null);
    const [splitTx, setSplitTx] = useState<ExpenseItem | null>(null);
    const [viewingTx, setViewingTx] = useState<ExpenseItem | IncomeItem | null>(null);
    const [isGmailLinkOpen, setIsGmailLinkOpen] = useState(false);

    // Filter Config State
    const [filterConfig, setFilterConfig] = useState<ExpenseFilterConfig>({
        periodToken: "Month",
        customRange: null,
        categories: new Set(),
        merchants: new Set(),
        banks: new Set(),
        friendPhones: new Set(),
        groupIds: new Set(),
    });

    // --- Derived Data ---

    const dateRange = useMemo(() => {
        const now = new Date();
        if (filterConfig.customRange) return filterConfig.customRange;

        switch (filterConfig.periodToken) {
            case "Today": return { start: startOfDay(now), end: endOfDay(now) };
            case "Yesterday": {
                const y = new Date(now);
                y.setDate(y.getDate() - 1);
                return { start: startOfDay(y), end: endOfDay(y) };
            }
            case "This Week": return { start: startOfWeek(now), end: endOfWeek(now) };
            case "This Month": return { start: startOfMonth(now), end: endOfMonth(now) };
            case "Last Month": {
                const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                return { start: startOfMonth(last), end: endOfMonth(last) };
            }
            case "This Quarter": return { start: startOfQuarter(now), end: endOfQuarter(now) };
            case "This Year": return { start: startOfYear(now), end: endOfYear(now) };
            case "All Time": return { start: new Date(0), end: new Date(3000, 0, 1) };
            default: return { start: startOfMonth(now), end: endOfMonth(now) }; // Default to Month
        }
    }, [filterConfig.periodToken, filterConfig.customRange]);

    const allTransactions = useMemo(() => {
        // Tag items with their source collection type to avoid ambiguity
        const taggedExpenses = expenses.map(e => ({ ...e, kind: 'expense' as const }));
        const taggedIncomes = incomes.map(i => ({ ...i, kind: 'income' as const }));

        const combined = [...taggedExpenses, ...taggedIncomes];
        // Deduplicate by ID to prevent key collisions
        const unique = Array.from(new Map(combined.map(item => [item.id, item])).values());
        return unique.sort((a, b) => b.date.getTime() - a.date.getTime());
    }, [expenses, incomes]);

    const filteredTransactions = useMemo(() => {
        return allTransactions.filter(tx => {
            // 1. Search
            const matchesSearch = (tx.note || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
                (tx.amount.toString().includes(searchQuery)) ||
                (tx.category || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
                (tx.counterparty || "").toLowerCase().includes(searchQuery.toLowerCase());
            if (!matchesSearch) return false;

            // 2. Type
            // Use the tagged 'kind' property
            const isIncome = (tx as any).kind === 'income';

            const matchesType = filterType === "all" || (filterType === "income" ? isIncome : !isIncome);
            if (!matchesType) return false;

            // 3. Date Range
            if (!isWithinInterval(tx.date, dateRange)) return false;

            // 4. Categories
            if (filterConfig.categories.size > 0 && (!tx.category || !filterConfig.categories.has(tx.category))) return false;

            // 5. Merchants (Counterparty)
            if (filterConfig.merchants.size > 0) {
                const merchant = (tx.counterparty || "").toUpperCase();
                if (!merchant || !filterConfig.merchants.has(merchant)) return false;
            }

            // 6. Banks (Issuer Bank)
            if (filterConfig.banks.size > 0) {
                const bank = (tx.issuerBank || "").toUpperCase();
                if (!bank || !filterConfig.banks.has(bank)) return false;
            }

            // 7. Friends (check if friendIds contains any of the selected phones)
            if (filterConfig.friendPhones.size > 0) {
                const txFriendIds = (tx as ExpenseItem).friendIds || [];
                if (!txFriendIds.some(id => filterConfig.friendPhones.has(id))) return false;
            }

            // 8. Groups
            if (filterConfig.groupIds.size > 0) {
                const txGroupId = (tx as ExpenseItem).groupId;
                if (!txGroupId || !filterConfig.groupIds.has(txGroupId)) return false;
            }

            return true;
        });
    }, [allTransactions, searchQuery, filterType, dateRange, filterConfig]);

    // --- Stats for Summary Ring ---
    const summaryStats = useMemo(() => {
        let income = 0;
        let expense = 0;
        filteredTransactions.forEach(tx => {
            const isIncome = (tx as any).kind === 'income';
            if (isIncome) income += tx.amount;
            else expense += tx.amount;
        });
        return { income, expense, count: filteredTransactions.length };
    }, [filteredTransactions]);

    // --- Stats for Charts ---
    const chartData = useMemo(() => {
        const data: Record<string, number> = {};
        filteredTransactions.forEach(tx => {
            const isIncome = (tx as any).kind === 'income';
            // Only chart the active type if filtered, or expenses if "All"
            if (filterType === "income" && !isIncome) return;
            if (filterType === "expense" && isIncome) return;
            if (filterType === "all" && isIncome) return; // Default to showing expenses breakdown for "All"

            let cat = (tx.category || "Uncategorized").trim();
            if (!cat) cat = "Uncategorized";
            // Capitalize first letter for consistency
            cat = cat.charAt(0).toUpperCase() + cat.slice(1);
            data[cat] = (data[cat] || 0) + tx.amount;
        });
        console.log("DashboardScreen: Chart Data Categories:", Object.keys(data));
        return Object.entries(data).map(([name, value]) => ({ name, value }));
    }, [filteredTransactions, filterType]);


    // --- Handlers ---

    const handleDelete = async (id: string, type: "expense" | "income") => {
        console.log("DashboardScreen: handleDelete called", { id, type, userPhone: userProfile?.phoneNumber });
        if (!userProfile?.phoneNumber) {
            console.error("DashboardScreen: No user phone number");
            return;
        }
        if (!confirm("Are you sure you want to delete this transaction?")) {
            console.log("DashboardScreen: Delete cancelled by user");
            return;
        }

        try {
            if (type === "expense") {
                console.log("DashboardScreen: Deleting expense...");
                await deleteExpense(userProfile.phoneNumber, id);
            } else {
                console.log("DashboardScreen: Deleting income...");
                await deleteIncome(userProfile.phoneNumber, id);
            }
            console.log("DashboardScreen: Delete successful, refreshing...");
            onRefresh();
        } catch (error) {
            console.error("Error deleting transaction:", error);
            alert("Failed to delete transaction.");
        }
    };

    const handleBulkDelete = async () => {
        if (!userProfile?.phoneNumber) return;
        if (!confirm(`Delete ${selectedIds.size} transactions? This cannot be undone.`)) return;

        try {
            const promises = Array.from(selectedIds).map(id => {
                const tx = allTransactions.find(t => t.id === id);
                if (!tx) return Promise.resolve();
                const isIncome = (tx as any).kind === 'income';
                return isIncome
                    ? deleteIncome(userProfile!.phoneNumber, id)
                    : deleteExpense(userProfile!.phoneNumber, id);
            });
            await Promise.all(promises);
            setSelectedIds(new Set());
            onRefresh();
        } catch (error) {
            console.error("Error bulk deleting:", error);
            alert("Failed to delete some transactions.");
        }
    };

    const handleBulkEdit = async (spec: BulkEditSpec) => {
        if (!userProfile?.phoneNumber) return;

        try {
            const batch = writeBatch(db);

            selectedIds.forEach(id => {
                const tx = allTransactions.find(t => t.id === id);
                if (!tx) return;

                const isIncome = (tx as any).kind === 'income';
                const collectionName = isIncome ? "incomes" : "expenses";
                const ref = doc(db, "users", userProfile.phoneNumber, collectionName, id);

                const updates: any = {};
                if (spec.title) updates.title = spec.title;
                if (spec.comments) updates.comments = spec.comments;
                if (spec.category) updates.category = spec.category;
                if (spec.date) updates.date = Timestamp.fromDate(spec.date);

                if (spec.addLabels.length > 0 || spec.removeLabels.length > 0) {
                    const currentLabels = new Set(tx.labels || []);
                    spec.addLabels.forEach(l => currentLabels.add(l));
                    spec.removeLabels.forEach(l => currentLabels.delete(l));
                    updates.labels = Array.from(currentLabels);
                }

                batch.update(ref, updates);
            });

            await batch.commit();
            setSelectedIds(new Set());
            setIsBulkEditOpen(false);
            onRefresh();
            alert("Bulk edit applied successfully!");
        } catch (error) {
            console.error("Error applying bulk edit:", error);
            alert("Failed to apply bulk edit.");
        }
    };

    const handleSaveTransaction = async (data: any) => {
        if (!userProfile?.phoneNumber) return;

        try {
            const isExpense = data.type === "expense";
            const collectionName = isExpense ? "expenses" : "incomes";
            const id = editingTx?.id || doc(collection(db, "users", userProfile.phoneNumber, collectionName)).id;

            const docRef = doc(db, "users", userProfile.phoneNumber, collectionName, id);

            const payload = {
                ...data,
                id,
                date: Timestamp.fromDate(new Date(data.date)),
                amount: parseFloat(data.amount),
                payerId: userProfile.phoneNumber, // Default to self
            };

            // Clean up UI-only fields
            delete payload.type;

            await setDoc(docRef, payload, { merge: true });

            setIsAddModalOpen(false);
            setEditingTx(null);
            onRefresh();
        } catch (error) {
            console.error("Error saving transaction:", error);
            alert("Failed to save transaction.");
        }
    };

    const handleSplitSave = async (expenseId: string, friendIds: string[]) => {
        if (!userProfile?.phoneNumber) return;
        try {
            const ref = doc(db, "users", userProfile.phoneNumber, "expenses", expenseId);
            await setDoc(ref, { friendIds }, { merge: true });
            setIsSplitModalOpen(false);
            setSplitTx(null);
            onRefresh();
        } catch (error) {
            console.error("Error saving split:", error);
            alert("Failed to save split.");
        }
    };

    const [isSyncing, setIsSyncing] = useState(false);

    const handleSync = async () => {
        const service = GmailService.getInstance();

        // If not connected, show link modal
        if (!service.hasToken()) {
            setIsGmailLinkOpen(true);
            return;
        }

        setIsSyncing(true);
        try {
            if (userProfile?.phoneNumber) {
                const count = await service.fetchAndStoreTransactions(userProfile.phoneNumber, 30);
                if (count > 0) {
                    alert(`Synced ${count} new transactions!`);
                    onRefresh();
                } else {
                    alert("No new transactions found.");
                }
            }
        } catch (e: any) {
            console.error(e);
            if (e.message?.includes("Expired")) {
                setIsGmailLinkOpen(true); // Re-link
            } else {
                alert("Sync failed: " + e.message);
            }
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <div className="space-y-6 max-w-full overflow-x-hidden">
            {/* Header & Actions */}
            <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900">Transactions</h2>
                    <p className="text-slate-500">Manage your income and expenses</p>
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                    <button
                        onClick={handleSync}
                        disabled={isSyncing}
                        className="p-2 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors flex items-center gap-2 border border-slate-200"
                        title="Sync from Gmail"
                    >
                        <RefreshCw className={`w-5 h-5 ${isSyncing ? 'animate-spin' : ''}`} />
                        <span className="hidden md:inline text-sm font-medium">Sync</span>
                    </button>
                    <button
                        onClick={() => { setEditingTx(null); setIsAddModalOpen(true); }}
                        className="hidden md:flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors font-medium shadow-sm shadow-teal-600/20"
                    >
                        <Plus className="w-5 h-5" />
                        <span>Add New</span>
                    </button>
                    <button className="p-2 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors border border-slate-200">
                        <Download className="w-5 h-5" />
                    </button>
                </div>
            </div>
            <SummaryRingCard
                income={summaryStats.income}
                expense={summaryStats.expense}
                count={summaryStats.count}
                periodLabel={filterConfig.periodToken === "Custom" ? "Custom Range" : filterConfig.periodToken}
                onPeriodClick={() => setIsFilterModalOpen(true)}
            />

            {/* Filters Bar */}
            <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search transactions..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
                    />
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0">
                    <button
                        onClick={() => setIsFilterModalOpen(true)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium whitespace-nowrap transition-colors ${isFilterModalOpen ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                    >
                        <Filter className="w-4 h-4" />
                        Filters
                    </button>
                    <div className="w-px bg-slate-200 mx-1" />
                    <button
                        onClick={() => setFilterType("all")}
                        className={`px-4 py-2 rounded-xl font-medium whitespace-nowrap transition-colors ${filterType === "all" ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                    >
                        All
                    </button>
                    <button
                        onClick={() => setFilterType("expense")}
                        className={`px-4 py-2 rounded-xl font-medium whitespace-nowrap transition-colors ${filterType === "expense" ? "bg-red-100 text-red-700 border border-red-200" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                    >
                        Expenses
                    </button>
                    <button
                        onClick={() => setFilterType("income")}
                        className={`px-4 py-2 rounded-xl font-medium whitespace-nowrap transition-colors ${filterType === "income" ? "bg-green-100 text-green-700 border border-green-200" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                    >
                        Income
                    </button>
                </div>
            </div>

            {/* Bulk Actions Bar */}
            <AnimatePresence>
                {selectedIds.size > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="bg-slate-900 text-white rounded-xl p-3 flex items-center justify-between shadow-lg"
                    >
                        <span className="font-semibold px-2">{selectedIds.size} selected</span>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setIsBulkEditOpen(true)}
                                className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/10 rounded-lg transition-colors"
                            >
                                <Edit2 className="w-4 h-4" />
                                Edit
                            </button>
                            <button
                                onClick={handleBulkDelete}
                                className="flex items-center gap-2 px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                            >
                                <Trash2 className="w-4 h-4" />
                                Delete
                            </button>
                            <button
                                onClick={() => setSelectedIds(new Set())}
                                className="p-1.5 hover:bg-white/10 rounded-lg transition-colors ml-2"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Active Filters Chips */}
            {
                filterConfig.categories.size > 0 || filterConfig.merchants.size > 0 || filterConfig.friendPhones.size > 0 || filterConfig.groupIds.size > 0 || filterConfig.banks.size > 0 ? (
                    <div className="flex flex-wrap gap-2">
                        {Array.from(filterConfig.categories).map(cat => (
                            <div key={cat} className="flex items-center gap-1 px-3 py-1 bg-teal-50 text-teal-700 rounded-full text-sm font-medium border border-teal-100">
                                <span>{cat}</span>
                                <button onClick={() => {
                                    const newSet = new Set(filterConfig.categories);
                                    newSet.delete(cat);
                                    setFilterConfig({ ...filterConfig, categories: newSet });
                                }} className="hover:text-teal-900"><X className="w-3 h-3" /></button>
                            </div>
                        ))}
                        {Array.from(filterConfig.merchants).map(m => (
                            <div key={m} className="flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm font-medium border border-blue-100">
                                <span>{m}</span>
                                <button onClick={() => {
                                    const newSet = new Set(filterConfig.merchants);
                                    newSet.delete(m);
                                    setFilterConfig({ ...filterConfig, merchants: newSet });
                                }} className="hover:text-blue-900"><X className="w-3 h-3" /></button>
                            </div>
                        ))}
                        {Array.from(filterConfig.banks).map(b => (
                            <div key={b} className="flex items-center gap-1 px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-sm font-medium border border-indigo-100">
                                <span>{b}</span>
                                <button onClick={() => {
                                    const newSet = new Set(filterConfig.banks);
                                    newSet.delete(b);
                                    setFilterConfig({ ...filterConfig, banks: newSet });
                                }} className="hover:text-indigo-900"><X className="w-3 h-3" /></button>
                            </div>
                        ))}
                        <button
                            onClick={() => setFilterConfig({
                                periodToken: filterConfig.periodToken,
                                customRange: filterConfig.customRange,
                                categories: new Set(),
                                merchants: new Set(),
                                banks: new Set(),
                                friendPhones: new Set(),
                                groupIds: new Set(),
                            })}
                            className="text-sm text-slate-500 hover:text-slate-700 underline px-2"
                        >
                            Clear all
                        </button>
                    </div>
                ) : null
            }

            {/* Charts (Only show if we have data) */}
            {
                filteredTransactions.length > 0 && (
                    <TransactionCharts
                        data={chartData}
                        type={filterType === "income" ? "income" : "expense"}
                    />
                )
            }

            {/* List */}
            <div className="max-w-4xl mx-auto">
                <UnifiedTransactionList
                    transactions={filteredTransactions}
                    selectedIds={selectedIds}
                    onToggleSelect={(id) => {
                        const newSet = new Set(selectedIds);
                        if (newSet.has(id)) newSet.delete(id);
                        else newSet.add(id);
                        setSelectedIds(newSet);
                    }}
                    onDelete={handleDelete}
                    onEdit={(tx) => { setEditingTx(tx); setIsAddModalOpen(true); }}
                    onSplit={(tx) => { setSplitTx(tx as ExpenseItem); setIsSplitModalOpen(true); }}
                    onViewDetails={(tx) => setViewingTx(tx)}
                    groupBy="day"
                />
            </div>

            {/* Floating Action Button for Add Transaction */}
            <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => { setEditingTx(null); setIsAddModalOpen(true); }}
                className="fixed bottom-8 right-8 w-14 h-14 bg-teal-600 text-white rounded-full shadow-lg shadow-teal-600/30 flex items-center justify-center z-40 md:hidden"
            >
                <Plus className="w-7 h-7" />
            </motion.button>

            {/* Modals */}
            <AnimatePresence>
                {isGmailLinkOpen && (
                    <GmailLinkModal
                        isOpen={isGmailLinkOpen}
                        onClose={() => setIsGmailLinkOpen(false)}
                        onSuccess={() => {
                            setIsGmailLinkOpen(false);
                            handleSync(); // Auto-start sync after linking
                        }}
                    />
                )}
                {isAddModalOpen && (
                    <TransactionModal
                        isOpen={isAddModalOpen}
                        onClose={() => { setIsAddModalOpen(false); setEditingTx(null); }}
                        initialData={editingTx}
                        onSave={handleSaveTransaction}
                        friends={friends}
                        groups={groups}
                    />
                )}
                {isFilterModalOpen && (
                    <TransactionFiltersModal
                        isOpen={isFilterModalOpen}
                        onClose={() => setIsFilterModalOpen(false)}
                        initialConfig={filterConfig}
                        onApply={setFilterConfig}
                        expenses={expenses}
                        incomes={incomes}
                        friends={friends}
                        groups={groups}
                    />
                )}
                {isBulkEditOpen && (
                    <BulkEditModal
                        isOpen={isBulkEditOpen}
                        onClose={() => setIsBulkEditOpen(false)}
                        onApply={handleBulkEdit}
                        categories={kExpenseCategories}
                    />
                )}
                {isSplitModalOpen && splitTx && (
                    <SplitExpenseModal
                        isOpen={isSplitModalOpen}
                        onClose={() => { setIsSplitModalOpen(false); setSplitTx(null); }}
                        expense={splitTx}
                        friends={friends}
                        onSave={handleSplitSave}
                    />
                )}
                {viewingTx && (
                    <TransactionDetailsModal
                        isOpen={!!viewingTx}
                        onClose={() => setViewingTx(null)}
                        transaction={viewingTx}
                        onEdit={(tx) => { setViewingTx(null); setEditingTx(tx); setIsAddModalOpen(true); }}
                        onDelete={handleDelete}
                    />
                )}
            </AnimatePresence>

            {/* Fiinny Brain Chat */}
            {userProfile?.phoneNumber && (
                <FiinnyBrainChat userPhone={userProfile.phoneNumber} />
            )}
        </div >
    );
}
