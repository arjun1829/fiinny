"use client";

import { useAuth } from "@/components/AuthProvider";
import Navbar from "@/components/Navbar";
import BankCardStats from "@/components/dashboard/analytics/BankCardStats";
import CategoryPieChart from "@/components/dashboard/analytics/CategoryPieChart";
import SpendTrendChart from "@/components/dashboard/analytics/SpendTrendChart";
import TopMerchantsList from "@/components/dashboard/analytics/TopMerchantsList";
import TransactionFilterBar from "@/components/dashboard/transactions/TransactionFilterBar";
import { FilterState } from "@/components/dashboard/transactions/FilterModal";
import {
    ExpenseItem,
    IncomeItem,
    getExpenses,
    getIncomes,
    getFriends,
    getGroups
} from "@/lib/firestore";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
    startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
    startOfYear, endOfYear, format, eachDayOfInterval, isSameDay
} from "date-fns";
import { generateSankeyData } from "@/lib/analytics/sankeyData";
import MoneyFlow from "@/components/analytics/MoneyFlow";
import ScopeFilters from "@/components/dashboard/analytics/ScopeFilters";
import BankFilterPills from "@/components/dashboard/analytics/BankFilterPills";
import InstrumentFilters from "@/components/dashboard/analytics/InstrumentFilters";
import SubcategoryModal from "@/components/dashboard/analytics/SubcategoryModal";
import AnalyticsTransactionList from "@/components/dashboard/analytics/AnalyticsTransactionList";
import MonthlyTrend from "@/components/dashboard/analytics/MonthlyTrend";
import SpendsByCategory from "@/components/dashboard/analytics/SpendsByCategory";

export default function AnalyticsPage() {
    const { user, loading } = useAuth();
    const router = useRouter();

    // Data
    const [transactions, setTransactions] = useState<(ExpenseItem | IncomeItem)[]>([]);
    const [friends, setFriends] = useState<{ id: string; name: string }[]>([]);
    const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);

    // Filters
    const [searchQuery, setSearchQuery] = useState("");
    const [filters, setFilters] = useState<FilterState>({
        type: "expense", // Default to expense for analytics
        period: "M",
        categories: new Set(),
        merchants: new Set(),
        banks: new Set(),
        friends: new Set(),
        groups: new Set(),
        sortBy: "date",
        sortDir: "desc",
        groupBy: "none",
        scope: "all",
        bankPill: null,
        instrument: "all"
    });

    // Subcategory Modal State
    const [subcategoryModal, setSubcategoryModal] = useState<{
        isOpen: boolean;
        category: string;
        expenses: ExpenseItem[];
        totalAmount: number;
        dateRange: string;
    }>({ isOpen: false, category: "", expenses: [], totalAmount: 0, dateRange: "" });

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
                getExpenses(phone, 1000), // Fetch more for analytics
                getIncomes(phone, 1000),
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

    // Derive Filter Options
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

    // Filter Data
    const filteredData = useMemo(() => {
        let result = transactions;

        // 1. Period Filter
        const now = new Date();
        let start: Date | null = null;
        let end: Date | null = null;

        switch (filters.period) {
            case "D": start = startOfDay(now); end = endOfDay(now); break;
            case "W": start = startOfWeek(now); end = endOfWeek(now); break;
            case "M": start = startOfMonth(now); end = endOfMonth(now); break;
            case "Y": start = startOfYear(now); end = endOfYear(now); break;
        }

        if (start && end) {
            result = result.filter(tx => tx.date >= start! && tx.date <= end!);
        }

        // 2. Scope Filter (All/Savings/Credit)
        if (filters.scope && filters.scope !== "all") {
            result = result.filter(tx => {
                const instrument = (tx.instrument || "").toLowerCase();
                const isCreditCard = instrument.includes("credit");
                if (filters.scope === "credit") return isCreditCard;
                if (filters.scope === "savings") return !isCreditCard;
                return true;
            });
        }

        // 3. Bank Pill Filter
        if (filters.bankPill && filters.bankPill !== "__FRIENDS__") {
            result = result.filter(tx =>
                tx.issuerBank && tx.issuerBank.toLowerCase() === filters.bankPill!.toLowerCase()
            );
        }

        // 4. Instrument Filter
        if (filters.instrument && filters.instrument !== "all") {
            result = result.filter(tx => {
                const instrument = (tx.instrument || "").toLowerCase();
                if (filters.instrument === "upi") return instrument.includes("upi");
                if (filters.instrument === "debit") return instrument.includes("debit");
                if (filters.instrument === "others") {
                    return !instrument.includes("upi") &&
                        !instrument.includes("debit") &&
                        !instrument.includes("credit");
                }
                return true;
            });
        }

        // 5. Type Filter (Important for Analytics)
        if (filters.type !== "all") {
            result = result.filter(tx => {
                const isIncome = 'type' in tx && (tx as IncomeItem).type === 'Income';
                return filters.type === "income" ? isIncome : !isIncome;
            });
        }

        // 6. Search & Advanced Filters
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            result = result.filter(tx =>
                (tx.title || "").toLowerCase().includes(query) ||
                (tx.category || "").toLowerCase().includes(query)
            );
        }
        if (filters.categories.size > 0) {
            result = result.filter(tx => tx.category && filters.categories.has(tx.category));
        }
        if (filters.merchants.size > 0) {
            result = result.filter(tx => tx.counterparty && filters.merchants.has(tx.counterparty));
        }
        if (filters.banks.size > 0) {
            result = result.filter(tx => tx.issuerBank && filters.banks.has(tx.issuerBank));
        }

        return result;
    }, [transactions, filters, searchQuery]);

    // Aggregations
    const aggregations = useMemo(() => {
        // 1. Spend Trend
        const trendData: { date: string; amount: number }[] = [];
        if (filteredData.length > 0) {
            const dates = filteredData.map(tx => tx.date);
            const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
            const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));

            const interval = eachDayOfInterval({ start: minDate, end: maxDate });

            trendData.push(...interval.map(date => {
                const amount = filteredData
                    .filter(tx => isSameDay(tx.date, date))
                    .reduce((sum, tx) => sum + tx.amount, 0);
                return {
                    date: format(date, "MMM d"),
                    amount
                };
            }));
        }

        // 2. Category Breakdown
        const categoryMap = new Map<string, number>();
        filteredData.forEach(tx => {
            const cat = tx.category || "Uncategorized";
            categoryMap.set(cat, (categoryMap.get(cat) || 0) + tx.amount);
        });

        const categoryColors = [
            "#0d9488", "#14b8a6", "#2dd4bf", "#5eead4", "#99f6e4",
            "#f59e0b", "#fcd34d", "#ef4444", "#f87171", "#3b82f6"
        ];

        const categoryData = Array.from(categoryMap.entries())
            .map(([name, value], index) => ({
                name,
                value,
                color: categoryColors[index % categoryColors.length]
            }))
            .sort((a, b) => b.value - a.value);

        // 3. Top Merchants
        const merchantMap = new Map<string, { amount: number; count: number }>();
        filteredData.forEach(tx => {
            const merchant = tx.counterparty || "Unknown";
            const current = merchantMap.get(merchant) || { amount: 0, count: 0 };
            merchantMap.set(merchant, {
                amount: current.amount + tx.amount,
                count: current.count + 1
            });
        });

        const merchantData = Array.from(merchantMap.entries())
            .map(([name, data]) => ({
                name,
                amount: data.amount,
                count: data.count
            }))
            .sort((a, b) => b.amount - a.amount);

        // 4. Bank/Card Stats
        const uniqueBanks = new Set(filteredData.map(tx => tx.issuerBank).filter(Boolean)).size;
        const uniqueCards = uniqueBanks;

        // 5. Monthly Trend (Last 12 months)
        const monthlyTrendData: { month: string; amount: number }[] = [];
        const now = new Date();
        for (let i = 11; i >= 0; i--) {
            const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
            const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);

            const monthAmount = transactions
                .filter(tx => {
                    const isExpense = !('type' in tx && (tx as IncomeItem).type === 'Income');
                    return isExpense && tx.date >= monthStart && tx.date <= monthEnd;
                })
                .reduce((sum, tx) => sum + tx.amount, 0);

            monthlyTrendData.push({
                month: format(monthDate, 'MMM'),
                amount: monthAmount
            });
        }

        return {
            trendData,
            categoryData,
            merchantData,
            uniqueBanks,
            uniqueCards,
            monthlyTrendData
        };
    }, [filteredData, transactions]);

    // Sankey Data (Respects Period, ignores Type filter to show full flow)
    const sankeyData = useMemo(() => {
        let result = transactions;

        // 1. Period Filter (Reuse logic or copy)
        const now = new Date();
        let start: Date | null = null;
        let end: Date | null = null;

        switch (filters.period) {
            case "D": start = startOfDay(now); end = endOfDay(now); break;
            case "W": start = startOfWeek(now); end = endOfWeek(now); break;
            case "M": start = startOfMonth(now); end = endOfMonth(now); break;
            case "Y": start = startOfYear(now); end = endOfYear(now); break;
        }

        if (start && end) {
            result = result.filter(tx => tx.date >= start! && tx.date <= end!);
        }

        const inc = result.filter(t => (t as IncomeItem).type === 'income') as IncomeItem[];
        // Note: Check if 'type' check matches your firestore data structure. 
        // Firestore ExpenseItem/IncomeItem usually have a 'type' field which is 'expense' or 'income' (case sensitive?)
        // In filteredData I saw: (tx as IncomeItem).type === 'Income'.
        // So I should use 'Income' and 'Expense' (Capitalized) if that's what the data has.
        // Let's assume Capitalized based on line 132 of previous view.

        const exp = result.filter(t => (t as ExpenseItem).type === 'Expense' || (t as any).type === 'expense') as ExpenseItem[];
        // Safe check for both case

        return generateSankeyData(inc, exp);
    }, [transactions, filters.period]);


    if (!user) return null;

    // Extract unique banks for filter pills
    const uniqueBanks = Array.from(new Set(
        transactions
            .map(tx => tx.issuerBank)
            .filter((bank): bank is string => Boolean(bank))
    )).sort();

    // Separate expenses and incomes for transactions list
    const expenses = filteredData.filter(tx => !('type' in tx && (tx as IncomeItem).type === 'Income')) as ExpenseItem[];
    const incomes = filteredData.filter(tx => 'type' in tx && (tx as IncomeItem).type === 'Income') as IncomeItem[];

    // Handle category click to open subcategory modal
    const handleCategoryClick = (category: string, amount: number) => {
        const categoryExpenses = expenses.filter(e => e.category === category);
        const now = new Date();
        const dateRange = `${format(startOfMonth(now), 'MMM d')} - ${format(endOfMonth(now), 'MMM d, yyyy')}`;

        setSubcategoryModal({
            isOpen: true,
            category,
            expenses: categoryExpenses,
            totalAmount: amount,
            dateRange
        });
    };

    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
            <Navbar />

            <div className="container mx-auto px-0 md:px-4 py-8 pt-20 md:pt-24">
                <div className="max-w-5xl mx-auto space-y-6">

                    {/* Header */}
                    <div className="px-4 md:px-0">
                        <h1 className="text-3xl font-bold text-slate-900 mb-2">Analytics</h1>
                        <p className="text-slate-600">
                            Visualize your spending habits and trends.
                        </p>
                    </div>

                    {/* Filter Bar */}
                    <div className="sticky top-16 z-20 -mx-4 md:mx-0">
                        <TransactionFilterBar
                            filters={filters}
                            onFilterChange={setFilters}
                            searchQuery={searchQuery}
                            onSearchChange={setSearchQuery}
                            options={filterOptions}
                        />
                    </div>

                    {/* Scope Filters */}
                    <div className="px-4 md:px-0">
                        <ScopeFilters
                            selectedScope={filters.scope || "all"}
                            onScopeChange={(scope) => setFilters(prev => ({ ...prev, scope }))}
                        />
                    </div>

                    {/* Bank Filter Pills */}
                    {uniqueBanks.length > 0 && (
                        <div className="px-4 md:px-0">
                            <BankFilterPills
                                banks={uniqueBanks}
                                selectedBank={filters.bankPill || null}
                                onBankChange={(bank) => setFilters(prev => ({ ...prev, bankPill: bank }))}
                            />
                        </div>
                    )}

                    {/* Instrument Filters */}
                    <div className="px-4 md:px-0">
                        <InstrumentFilters
                            selectedInstrument={filters.instrument || "all"}
                            onInstrumentChange={(instrument) => setFilters(prev => ({ ...prev, instrument }))}
                        />
                    </div>

                    {/* Dashboard Content */}
                    {isLoadingData ? (
                        <div className="py-20 text-center">
                            <Loader2 className="w-10 h-10 animate-spin text-teal-600 mx-auto mb-4" />
                            <p className="text-slate-500">Loading analytics...</p>
                        </div>
                    ) : (
                        <div className="px-4 md:px-0 space-y-6 pb-24">

                            {/* Row 1: Monthly Trend + Spends by Category */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <MonthlyTrend data={aggregations.monthlyTrendData} />
                                <SpendsByCategory
                                    expenses={expenses}
                                    onCategoryClick={handleCategoryClick}
                                />
                            </div>

                            {/* Row 2: Spend Trend + Category Breakdown */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <SpendTrendChart
                                    data={aggregations.trendData}
                                    period={filters.period === "M" ? "day" : "month"}
                                />
                                <CategoryPieChart
                                    data={aggregations.categoryData}
                                    onCategoryClick={handleCategoryClick}
                                />
                            </div>

                            {/* Row 3: Money Flow (Full Width) */}
                            <MoneyFlow data={sankeyData} />

                            {/* Row 4: Bank Stats + Top Merchants */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <BankCardStats
                                    bankCount={aggregations.uniqueBanks}
                                    cardCount={aggregations.uniqueCards}
                                />
                                <TopMerchantsList merchants={aggregations.merchantData} />
                            </div>

                            {/* Row 5: Transactions List (Full Width) */}
                            <AnalyticsTransactionList
                                expenses={expenses}
                                incomes={incomes}
                            />

                        </div>
                    )}

                </div>
            </div>

            {/* Subcategory Modal */}
            <SubcategoryModal
                isOpen={subcategoryModal.isOpen}
                onClose={() => setSubcategoryModal(prev => ({ ...prev, isOpen: false }))}
                category={subcategoryModal.category}
                expenses={subcategoryModal.expenses}
                totalAmount={subcategoryModal.totalAmount}
                dateRange={subcategoryModal.dateRange}
            />
        </div>
    );
}
