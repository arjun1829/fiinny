"use client";

import { useAuth } from "@/components/AuthProvider";
import Navbar from "@/components/Navbar";
import BulkActionsBar from "@/components/dashboard/transactions/BulkActionsBar";
import { FilterState } from "@/components/dashboard/transactions/FilterModal";
import TransactionFilterBar from "@/components/dashboard/transactions/TransactionFilterBar";
import UnifiedTransactionList from "@/components/dashboard/transactions/UnifiedTransactionList";
import {
    ExpenseItem,
    IncomeItem,
    deleteExpense,
    deleteIncome,
    getExpenses,
    getIncomes,
    getFriends,
    getGroups
} from "@/lib/firestore";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths, subDays } from "date-fns";

export default function TransactionsPage() {
    const { user, loading } = useAuth();
    const router = useRouter();

    // Data
    const [transactions, setTransactions] = useState<(ExpenseItem | IncomeItem)[]>([]);
    const [friends, setFriends] = useState<{ id: string; name: string }[]>([]);
    const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);

    // Filters State
    const [searchQuery, setSearchQuery] = useState("");
    const [filters, setFilters] = useState<FilterState>({
        type: "all",
        period: "M",
        categories: new Set(),
        merchants: new Set(),
        banks: new Set(),
        friends: new Set(),
        groups: new Set(),
        sortBy: "date",
        sortDir: "desc",
        groupBy: "none"
    });

    // Selection
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (!loading && !user) {
            router.push("/login");
        }
    }, [loading, user, router]);

    useEffect(() => {
        if (user?.phoneNumber) {
            fetchData(user.phoneNumber);
        }
    }, [user]);

    const fetchData = async (phone: string) => {
        setIsLoadingData(true);
        try {
            const [expenses, incomes, friendsList, groupsList] = await Promise.all([
                getExpenses(phone, 500), // Fetch more for client-side filtering
                getIncomes(phone, 500),
                getFriends(phone),
                getGroups(phone)
            ]);

            const all = [...expenses, ...incomes].sort(
                (a, b) => b.date.getTime() - a.date.getTime()
            );

            setTransactions(all);
            setFriends(friendsList.map(f => ({ id: f.phone, name: f.name })));
            setGroups(groupsList.map(g => ({ id: g.id, name: g.name })));
        } catch (error) {
            console.error("Failed to fetch data", error);
        } finally {
            setIsLoadingData(false);
        }
    };

    // Derive Filter Options from Data
    const filterOptions = useMemo(() => {
        const categories = new Set<string>();
        const merchants = new Set<string>();
        const banks = new Set<string>();

        transactions.forEach(tx => {
            if (tx.category) categories.add(tx.category);
            if (tx.counterparty) merchants.add(tx.counterparty);
            if (tx.issuerBank) banks.add(tx.issuerBank);
        });

        return {
            categories: Array.from(categories).sort(),
            merchants: Array.from(merchants).sort(),
            banks: Array.from(banks).sort(),
            friends,
            groups
        };
    }, [transactions, friends, groups]);

    // Filter Logic
    const filteredTransactions = useMemo(() => {
        let result = transactions;

        // 1. Period Filter
        const now = new Date();
        let start: Date | null = null;
        let end: Date | null = null;

        switch (filters.period) {
            case "D": // Today
                start = startOfDay(now);
                end = endOfDay(now);
                break;
            case "W": // This Week
                start = startOfWeek(now);
                end = endOfWeek(now);
                break;
            case "M": // This Month
                start = startOfMonth(now);
                end = endOfMonth(now);
                break;
            case "Y": // This Year
                start = startOfYear(now);
                end = endOfYear(now);
                break;
            // Add more cases as needed (Yesterday, Last Month, etc.)
        }

        if (start && end) {
            result = result.filter(tx => tx.date >= start! && tx.date <= end!);
        }

        // 2. Type Filter
        if (filters.type !== "all") {
            result = result.filter(tx => {
                const isIncome = 'type' in tx && (tx as IncomeItem).type === 'Income';
                return filters.type === "income" ? isIncome : !isIncome;
            });
        }

        // 3. Search Filter
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            result = result.filter(tx => {
                const title = (tx.title || tx.note || "").toLowerCase();
                const category = (tx.category || "").toLowerCase();
                const counterparty = (tx.counterparty || "").toLowerCase();
                const amount = tx.amount.toString();

                return title.includes(query) ||
                    category.includes(query) ||
                    counterparty.includes(query) ||
                    amount.includes(query);
            });
        }

        // 4. Advanced Filters (Sets)
        if (filters.categories.size > 0) {
            result = result.filter(tx => tx.category && filters.categories.has(tx.category));
        }
        if (filters.merchants.size > 0) {
            result = result.filter(tx => tx.counterparty && filters.merchants.has(tx.counterparty));
        }
        if (filters.banks.size > 0) {
            result = result.filter(tx => tx.issuerBank && filters.banks.has(tx.issuerBank));
        }
        // Note: Friends/Groups filtering would require those fields on ExpenseItem/IncomeItem
        // Assuming they exist or will be added. For now, skipping if not present.

        // 5. Sort
        result.sort((a, b) => {
            let valA, valB;
            if (filters.sortBy === "amount") {
                valA = a.amount;
                valB = b.amount;
            } else {
                valA = a.date.getTime();
                valB = b.date.getTime();
            }

            if (filters.sortDir === "asc") {
                return valA > valB ? 1 : -1;
            } else {
                return valA < valB ? 1 : -1;
            }
        });

        return result;
    }, [transactions, filters, searchQuery]);

    // Selection Logic
    const handleToggleSelect = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedIds(newSet);
    };

    const handleClearSelection = () => {
        setSelectedIds(new Set());
    };

    // Delete Logic
    const handleDelete = async (id: string, type: "expense" | "income") => {
        if (!user?.phoneNumber) return;
        if (!confirm("Are you sure you want to delete this transaction?")) return;

        try {
            if (type === "expense") {
                await deleteExpense(user.phoneNumber, id);
            } else {
                await deleteIncome(user.phoneNumber, id);
            }
            // Optimistic update
            setTransactions(prev => prev.filter(tx => tx.id !== id));
            if (selectedIds.has(id)) {
                const newSet = new Set(selectedIds);
                newSet.delete(id);
                setSelectedIds(newSet);
            }
        } catch (error) {
            console.error("Failed to delete", error);
            alert("Failed to delete transaction");
        }
    };

    const handleDeleteSelected = async () => {
        if (!user?.phoneNumber) return;
        if (!confirm(`Delete ${selectedIds.size} selected transactions?`)) return;

        try {
            const promises = Array.from(selectedIds).map(id => {
                const tx = transactions.find(t => t.id === id);
                if (!tx) return Promise.resolve();
                const isIncome = 'type' in tx && (tx as IncomeItem).type === 'Income';
                return isIncome
                    ? deleteIncome(user.phoneNumber!, id)
                    : deleteExpense(user.phoneNumber!, id);
            });

            await Promise.all(promises);

            // Optimistic update
            setTransactions(prev => prev.filter(tx => !selectedIds.has(tx.id)));
            setSelectedIds(new Set());
        } catch (error) {
            console.error("Failed to bulk delete", error);
            alert("Failed to delete some transactions");
        }
    };

    if (!user) return null;

    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
            <Navbar />

            <div className="container mx-auto px-0 md:px-4 py-8 pt-20 md:pt-24">
                <div className="max-w-5xl mx-auto space-y-6">

                    {/* Header */}
                    <div className="px-4 md:px-0">
                        <h1 className="text-3xl font-bold text-slate-900 mb-2">Transactions</h1>
                        <p className="text-slate-600">
                            Manage all your expenses and incomes in one place.
                        </p>
                    </div>

                    {/* Advanced Filter Bar */}
                    <div className="sticky top-16 z-20 -mx-4 md:mx-0">
                        <TransactionFilterBar
                            filters={filters}
                            onFilterChange={setFilters}
                            searchQuery={searchQuery}
                            onSearchChange={setSearchQuery}
                            options={filterOptions}
                        />
                    </div>

                    {/* List */}
                    <div className="px-4 md:px-0 pb-24">
                        {isLoadingData ? (
                            <div className="py-20 text-center">
                                <Loader2 className="w-10 h-10 animate-spin text-teal-600 mx-auto mb-4" />
                                <p className="text-slate-500">Loading transactions...</p>
                            </div>
                        ) : (
                            <UnifiedTransactionList
                                transactions={filteredTransactions}
                                selectedIds={selectedIds}
                                onToggleSelect={handleToggleSelect}
                                onDelete={handleDelete}
                                onEdit={(tx) => console.log("Edit transaction:", tx)}
                                groupBy={filters.groupBy}
                            />
                        )}
                    </div>

                </div>
            </div>

            {/* Bulk Actions */}
            {selectedIds.size > 0 && (
                <BulkActionsBar
                    selectedCount={selectedIds.size}
                    onClearSelection={handleClearSelection}
                    onDeleteSelected={handleDeleteSelected}
                />
            )}
        </div>
    );
}
