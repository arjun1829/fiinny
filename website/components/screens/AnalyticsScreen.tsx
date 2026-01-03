import {
    ExpenseItem,
    IncomeItem,
} from "@/lib/firestore";
import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
    startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
    startOfYear, endOfYear, format, eachDayOfInterval, isSameDay
} from "date-fns";
import BankCardStats from "../dashboard/analytics/BankCardStats";
import { aggregateBanksFromTransactions } from "@/lib/utils/bankUtils";
import CategoryPieChart from "../dashboard/analytics/CategoryPieChart";
import SpendTrendChart from "../dashboard/analytics/SpendTrendChart";
import TopMerchantsList from "../dashboard/analytics/TopMerchantsList";
import TransactionFilterBar from "../dashboard/transactions/TransactionFilterBar";
import { FilterState } from "../dashboard/transactions/FilterModal";
import BankCard from "../finance/BankCard";
import AddCardModal from "../finance/AddCardModal";
import { CreditCard, Plus } from "lucide-react";
import ScopeFilters from "../dashboard/analytics/ScopeFilters";
import BankFilterPills from "../dashboard/analytics/BankFilterPills";
import InstrumentFilters from "../dashboard/analytics/InstrumentFilters";
import SubcategoryModal from "../dashboard/analytics/SubcategoryModal";
import AnalyticsTransactionList from "../dashboard/analytics/AnalyticsTransactionList";
import MonthlyTrend from "../dashboard/analytics/MonthlyTrend";
import SpendsByCategory from "../dashboard/analytics/SpendsByCategory";

interface AnalyticsScreenProps {
    expenses: ExpenseItem[];
    incomes: IncomeItem[];
    friends: { id: string; name: string }[];
    groups: { id: string; name: string }[];
    isLoading?: boolean;
}

export default function AnalyticsScreen({
    expenses,
    incomes,
    friends,
    groups,
    isLoading = false
}: AnalyticsScreenProps) {
    // Filters
    const [searchQuery, setSearchQuery] = useState("");
    const [filters, setFilters] = useState<FilterState>({
        type: "expense",
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

    const [showAddCard, setShowAddCard] = useState(false);
    const [myCards, setMyCards] = useState<any[]>([]);

    // Subcategory Modal State
    const [subcategoryModal, setSubcategoryModal] = useState<{
        isOpen: boolean;
        category: string;
        expenses: ExpenseItem[];
        totalAmount: number;
        dateRange: string;
    }>({ isOpen: false, category: "", expenses: [], totalAmount: 0, dateRange: "" });

    // Combine transactions for filtering
    const transactions = useMemo(() => {
        return [...expenses, ...incomes].sort(
            (a, b) => b.date.getTime() - a.date.getTime()
        );
    }, [expenses, incomes]);

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

        // 2. Scope Filter
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

        // 5. Type Filter
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

    if (isLoading) {
        return (
            <div className="py-20 text-center">
                <Loader2 className="w-10 h-10 animate-spin text-teal-600 mx-auto mb-4" />
                <p className="text-slate-500">Loading analytics...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="px-4 md:px-0">
                <h1 className="text-3xl font-bold text-slate-900 mb-2">Analytics</h1>
                <p className="text-slate-600">
                    Visualize your spending habits and trends.
                </p>
            </div>

            {/* Filter Bar */}
            <div className="sticky top-0 z-20 -mx-4 md:mx-0 bg-slate-50 pt-4 pb-2">
                <TransactionFilterBar
                    filters={filters}
                    onFilterChange={setFilters}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    options={filterOptions}
                />
            </div>

            {/* Dashboard Content */}

            {/* New Filter Components */}
            <div className="space-y-4">
                {/* Scope Filters */}
                <div className="px-4 md:px-0">
                    <ScopeFilters
                        selectedScope={filters.scope || "all"}
                        onScopeChange={(scope) => setFilters(prev => ({ ...prev, scope }))}
                    />
                </div>

                {/* Bank Filter Pills */}
                {Array.from(new Set(transactions.map(tx => tx.issuerBank).filter(Boolean))).length > 0 && (
                    <div className="px-4 md:px-0">
                        <BankFilterPills
                            banks={Array.from(new Set(transactions.map(tx => tx.issuerBank).filter((b): b is string => Boolean(b)))).sort()}
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
            </div>

            {/* My Cards Horizontal Section */}
            <div className="px-4 md:px-0 mb-8">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-slate-900">My Cards</h2>
                    <button
                        onClick={() => setShowAddCard(true)}
                        className="flex items-center gap-1 text-sm font-semibold text-teal-600 hover:text-teal-700 bg-teal-50 hover:bg-teal-100 px-3 py-1.5 rounded-lg transition-colors"
                    >
                        <Plus size={16} /> Add Card
                    </button>
                </div>
                <div className="flex gap-6 overflow-x-auto pb-4 scrollbar-hide">
                    {aggregateBanksFromTransactions(filteredData.filter(t => 'type' in t && t.type !== 'Income'), filteredData.filter(t => 'type' in t && t.type === 'Income'))
                        .map((group, i) => (
                            <div key={i} className="flex-shrink-0">
                                <BankCard
                                    bankName={group.bankName}
                                    cardType={group.cards[0]?.cardType || 'Card'}
                                    last4={group.cards[0]?.last4 || 'XXXX'}
                                    name={"User"}
                                    colorTheme={i % 2 === 0 ? 'black' : 'blue'}
                                    logoUrl={group.logoUrl}
                                    stats={group.stats}
                                />
                            </div>
                        ))}

                    {myCards.map((card, i) => (
                        <div key={`manual-${i}`} className="flex-shrink-0">
                            <BankCard
                                bankName={card.bank}
                                cardType={card.cardType || 'Visa'}
                                last4={card.last4}
                                name={card.name}
                                expiry={card.expiry}
                                colorTheme={'purple'}
                            />
                        </div>
                    ))}

                    {(aggregateBanksFromTransactions(filteredData.filter(t => 'type' in t && t.type !== 'Income'), filteredData.filter(t => 'type' in t && t.type === 'Income')).length === 0 && myCards.length === 0) && (
                        <div
                            onClick={() => setShowAddCard(true)}
                            className="w-80 h-48 flex-shrink-0 rounded-2xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center cursor-pointer hover:border-teal-400 hover:bg-teal-50/50 transition-all group"
                        >
                            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3 group-hover:bg-teal-100 group-hover:text-teal-600 transition-colors">
                                <CreditCard className="w-6 h-6 text-slate-400 group-hover:text-teal-600" />
                            </div>
                            <p className="font-semibold text-slate-600 group-hover:text-teal-700">Add your first card</p>
                        </div>
                    )}
                </div>
            </div>

            <AddCardModal
                isOpen={showAddCard}
                onClose={() => setShowAddCard(false)}
                onAdd={(card) => setMyCards([...myCards, card])}
            />

            {/* Analytics Charts and Lists */}
            <div className="px-4 md:px-0 space-y-6 pb-24">
                {/* Row 1: Monthly Trend + Spends by Category */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <MonthlyTrend data={aggregations.monthlyTrendData} />
                    <SpendsByCategory
                        expenses={filteredData.filter(tx => !('type' in tx && (tx as IncomeItem).type === 'Income')) as ExpenseItem[]}
                        onCategoryClick={(category, amount) => {
                            const categoryExpenses = filteredData.filter(tx => {
                                const isExpense = !('type' in tx && (tx as IncomeItem).type === 'Income');
                                return isExpense && tx.category === category;
                            }) as ExpenseItem[];
                            const now = new Date();
                            const dateRange = `${format(startOfMonth(now), 'MMM d')} - ${format(endOfMonth(now), 'MMM d, yyyy')}`;
                            setSubcategoryModal({
                                isOpen: true,
                                category,
                                expenses: categoryExpenses,
                                totalAmount: amount,
                                dateRange
                            });
                        }}
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
                        onCategoryClick={(category, amount) => {
                            const categoryExpenses = filteredData.filter(tx => {
                                const isExpense = !('type' in tx && (tx as IncomeItem).type === 'Income');
                                return isExpense && tx.category === category;
                            }) as ExpenseItem[];
                            const now = new Date();
                            const dateRange = `${format(startOfMonth(now), 'MMM d')} - ${format(endOfMonth(now), 'MMM d, yyyy')}`;
                            setSubcategoryModal({
                                isOpen: true,
                                category,
                                expenses: categoryExpenses,
                                totalAmount: amount,
                                dateRange
                            });
                        }}
                    />
                </div>

                {/* Row 3: Bank Stats + Top Merchants */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <BankCardStats
                        bankCount={aggregations.uniqueBanks}
                        cardCount={aggregations.uniqueCards}
                    />
                    <TopMerchantsList merchants={aggregations.merchantData} />
                </div>

                {/* Row 4: Transactions List */}
                <AnalyticsTransactionList
                    expenses={filteredData.filter(tx => !('type' in tx && (tx as IncomeItem).type === 'Income')) as ExpenseItem[]}
                    incomes={filteredData.filter(tx => 'type' in tx && (tx as IncomeItem).type === 'Income') as IncomeItem[]}
                />
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
