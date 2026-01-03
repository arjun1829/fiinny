"use client";

import { useAuth } from "@/components/AuthProvider";
import { generateInsights, Insight } from "@/lib/ai/insight_engine";


import { GmailService } from "@/lib/gmail";
import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
    TrendingUp,
    Users,
    Share2,
    CreditCard,
    Target,
    PieChart,
    User,
    LogOut,
    Loader2,
    Flag,
    Diamond,
    Play,
    AlertCircle
} from "lucide-react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import TransactionRing from "@/components/dashboard/TransactionRing";
import PeriodFilterBar from "@/components/dashboard/PeriodFilterBar";
import StatsCards from "@/components/dashboard/StatsCards";
import BarChartCard from "@/components/dashboard/BarChartCard";
import SmartInsightCard from "@/components/dashboard/SmartInsightCard";
import CrisisAlertBanner from "@/components/dashboard/CrisisAlertBanner";
import GmailBackfillBanner from "@/components/dashboard/GmailBackfillBanner";
import GmailLinkModal from "@/components/dashboard/transactions/GmailLinkModal";

import { FxService } from "@/lib/fx_service";
import DashboardScreen from "@/components/screens/DashboardScreen";
import { useAi } from "@/components/ai/AiContext";
import ProfileScreen from "@/components/screens/ProfileScreen";
import GoalsScreen from "@/components/screens/GoalsScreen";
import LoansScreen from "@/components/screens/LoansScreen";

import AnalyticsScreen from "@/components/screens/AnalyticsScreen";
import BankCard from "@/components/finance/BankCard";
import AddCardModal from "@/components/finance/AddCardModal";
import BankDetailsModal from "@/components/finance/BankDetailsModal";
import { aggregateBanksFromTransactions, BankGroup, InferredCard } from "@/lib/utils/bankUtils";
import MagicInput from "@/components/dashboard/MagicInput";

// Transaction Management Imports
import TransactionModal from "@/components/dashboard/transactions/TransactionModal";
import SplitExpenseModal from "@/components/dashboard/transactions/SplitExpenseModal";
import TransactionDetailsModal from "@/components/dashboard/transactions/TransactionDetailsModal";
import {
    getExpenses,
    getIncomes,
    getGoals,
    getLoans,
    getAssets,
    getGroups,
    getFriends,
    getUserProfile,
    ExpenseItem,
    IncomeItem,
    GoalModel,
    LoanModel,
    AssetModel,
    GroupModel,
    FriendModel,
    UserProfile,
    deleteExpense,
    deleteIncome
} from "@/lib/firestore";
import { doc, setDoc, collection, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
// import AiAssistant from "@/components/dashboard/AiAssistant";

export default function Dashboard() {
    const { user, loading } = useAuth();
    const router = useRouter();

    // Data states
    const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
    const [incomes, setIncomes] = useState<IncomeItem[]>([]);
    const [goals, setGoals] = useState<GoalModel[]>([]);
    const [loans, setLoans] = useState<LoanModel[]>([]);
    const [assets, setAssets] = useState<AssetModel[]>([]);
    const [groups, setGroups] = useState<GroupModel[]>([]);
    const [friends, setFriends] = useState<FriendModel[]>([]);
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [userName, setUserName] = useState<string>("there");
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [insights, setInsights] = useState<Insight[]>([]);

    // UI states
    const [activeTab, setActiveTab] = useState("overview");
    const [activePeriod, setActivePeriod] = useState("M"); // Month by default
    const [dataLoading, setDataLoading] = useState(true);
    const [gmailConnecting, setGmailConnecting] = useState(false);
    const [showAddCard, setShowAddCard] = useState(false);
    const [isGmailLinkOpen, setIsGmailLinkOpen] = useState(false);
    const [selectedBankGroup, setSelectedBankGroup] = useState<BankGroup | null>(null);
    const [manualCards, setManualCards] = useState<any[]>([]);

    const [filteredExpensesState, setFilteredExpensesState] = useState<ExpenseItem[]>([]);
    const [filteredIncomesState, setFilteredIncomesState] = useState<IncomeItem[]>([]);


    // Transaction Management State
    const [isAddTxModalOpen, setIsAddTxModalOpen] = useState(false);
    const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
    const [editingTx, setEditingTx] = useState<ExpenseItem | IncomeItem | null>(null);
    const [splitTx, setSplitTx] = useState<ExpenseItem | null>(null);
    const [viewingTx, setViewingTx] = useState<ExpenseItem | IncomeItem | null>(null);

    const handleSaveTransaction = async (data: any) => {
        if (!user || (!user.phoneNumber && !user.uid)) return;
        const userId = user.phoneNumber || user.uid;

        try {
            const isExpense = data.type === "expense";
            const collectionName = isExpense ? "expenses" : "incomes";
            const id = editingTx?.id || doc(collection(db, "users", userId, collectionName)).id;
            const docRef = doc(db, "users", userId, collectionName, id);

            const payload = {
                ...data,
                id,
                date: Timestamp.fromDate(new Date(data.date)),
                amount: parseFloat(data.amount),
                payerId: userId,
            };
            delete payload.type;

            await setDoc(docRef, payload, { merge: true });

            setIsAddTxModalOpen(false);
            setEditingTx(null);
            loadDashboardData(userId); // Refresh data
        } catch (error) {
            console.error("Error saving transaction:", error);
            alert("Failed to save transaction.");
        }
    };

    const handleDeleteTransaction = async (id: string, type: "expense" | "income") => {
        if (!user || (!user.phoneNumber && !user.uid)) return;
        const userId = user.phoneNumber || user.uid;

        if (!confirm("Are you sure?")) return;

        try {
            if (type === "expense") await deleteExpense(userId, id);
            else await deleteIncome(userId, id);

            loadDashboardData(userId);
            if (viewingTx?.id === id) setViewingTx(null);
        } catch (error) {
            console.error("Error deleting:", error);
            alert("Failed to delete transaction.");
        }
    };

    const handleSplitSave = async (expenseId: string, friendIds: string[]) => {
        if (!user || (!user.phoneNumber && !user.uid)) return;
        const userId = user.phoneNumber || user.uid;
        try {
            const ref = doc(db, "users", userId, "expenses", expenseId);
            await setDoc(ref, { friendIds }, { merge: true });
            setIsSplitModalOpen(false);
            setSplitTx(null);
            loadDashboardData(userId);
        } catch (error) {
            console.error("Error saving split:", error);
            alert("Failed to save split.");
        }
    };

    // Derived filtered data logic moved up here to be shared if needed


    useEffect(() => {
        if (!loading && !user) {
            router.push("/login");
        }
    }, [loading, user, router]);

    useEffect(() => {
        if (!loading) {
            const userId = user?.phoneNumber || user?.uid;
            if (userId) {
                loadDashboardData(userId);
            } else if (user) {
                console.warn("User loaded but no ID found.");
                setDataLoading(false);
            }
        }
    }, [user, loading]);

    const { setContextData, refreshTrigger } = useAi();

    // Listen to AI refresh trigger
    useEffect(() => {
        const userId = user?.phoneNumber || user?.uid;
        if (userId && !loading) {
            loadDashboardData(userId);
        }
    }, [refreshTrigger]);

    const loadDashboardData = async (userId: string) => {
        setDataLoading(true);
        try {
            const [
                expensesData,
                incomesData,
                goalsData,
                loansData,
                assetsData,
                groupsData,
                friendsData,
                profileData
            ] = await Promise.all([
                getExpenses(userId),
                getIncomes(userId),
                getGoals(userId),
                getLoans(userId),
                getAssets(userId),
                getGroups(userId),
                getFriends(userId),
                getUserProfile(userId)
            ]);

            // Initialize FX Service
            await FxService.getInstance().init();
            const targetCurrency = profileData?.currency || 'INR';

            // GENERATE INSIGHTS 🧠
            try {
                if (Array.isArray(expensesData) && Array.isArray(incomesData)) {
                    const generatedInsights = generateInsights(
                        expensesData,
                        incomesData,
                        Array.isArray(goalsData) ? goalsData : [],
                        Array.isArray(loansData) ? loansData : []
                    );
                    setInsights(generatedInsights);
                }
            } catch (err) {
                console.error("Failed to generate insights:", err);
            }
            // Convert Expenses
            const convertedExpenses = expensesData.map(e => {
                const itemCurrency = e.fx?.currency || 'INR';
                if (itemCurrency !== targetCurrency) {
                    return {
                        ...e,
                        amount: FxService.getInstance().convert(e.amount, itemCurrency, targetCurrency),
                        // We could store original if needed, but for dashboard aggregation, converted is king.
                    };
                }
                return e;
            });

            // Convert Incomes
            const convertedIncomes = incomesData.map(i => {
                const itemCurrency = i.fx?.currency || 'INR';
                if (itemCurrency !== targetCurrency) {
                    return {
                        ...i,
                        amount: FxService.getInstance().convert(i.amount, itemCurrency, targetCurrency)
                    };
                }
                return i;
            });

            setExpenses(convertedExpenses);
            setIncomes(convertedIncomes);
            setGoals(goalsData);
            setLoans(loansData);
            setAssets(assetsData);
            setGroups(groupsData);
            setFriends(friendsData);
            setUserProfile(profileData);
            setUserName(profileData?.displayName || "there");
            // @ts-ignore
            setUserEmail(profileData?.email || null);

            setContextData({ expenses: convertedExpenses, incomes: convertedIncomes });
        } catch (error) {
            console.error("Error loading dashboard data:", error);
        } finally {
            setDataLoading(false);
        }
    };

    const handleAddCard = (card: any) => {
        setManualCards([...manualCards, card]);
    };

    const handleGmailConnect = async () => {
        const userId = user?.phoneNumber || user?.uid;
        if (!userId) return;

        const service = GmailService.getInstance();

        if (!service.hasToken()) {
            setIsGmailLinkOpen(true);
            return;
        }

        setGmailConnecting(true);
        try {
            console.log("Gmail connected, starting sync...");
            const count = await service.fetchAndStoreTransactions(userId, 30);
            console.log(`Synced ${count} transactions from Gmail`);

            if (count > 0) {
                await loadDashboardData(userId);
                alert(`Successfully synced ${count} transactions from Gmail!`);
            } else {
                alert("No new transactions found.");
            }
        } catch (error: any) {
            console.error("Gmail sync error:", error);
            if (error.message?.includes("Expired")) {
                setIsGmailLinkOpen(true);
            } else {
                alert("Sync failed: " + error.message);
            }
        } finally {
            setGmailConnecting(false);
        }
    };

    // --- Logic Ported from Flutter ---

    const getPeriodRange = (period: string) => {
        const now = new Date();
        const start = new Date();
        const end = new Date();

        switch (period) {
            case "D": // Today
                start.setHours(0, 0, 0, 0);
                end.setHours(23, 59, 59, 999);
                break;
            case "W": // This Week
                const day = now.getDay() || 7; // Get current day number, converting Sun. to 7
                if (day !== 1) start.setHours(-24 * (day - 1)); // Set to Monday
                start.setHours(0, 0, 0, 0);
                end.setHours(23, 59, 59, 999);
                break;
            case "M": // This Month
                start.setDate(1);
                start.setHours(0, 0, 0, 0);
                end.setMonth(now.getMonth() + 1, 0); // Last day of month
                end.setHours(23, 59, 59, 999);
                break;
            case "Q": // This Quarter
                const currentQuarter = Math.floor(now.getMonth() / 3);
                start.setMonth(currentQuarter * 3, 1);
                start.setHours(0, 0, 0, 0);
                end.setMonth((currentQuarter + 1) * 3, 0);
                end.setHours(23, 59, 59, 999);
                break;
            case "Y": // This Year
                start.setMonth(0, 1);
                start.setHours(0, 0, 0, 0);
                end.setMonth(11, 31);
                end.setHours(23, 59, 59, 999);
                break;
            case "ALL":
                start.setTime(0); // Epoch
                end.setFullYear(now.getFullYear() + 100); // Far future
                break;
        }
        return { start, end };
    };

    const { filteredExpenses, filteredIncomes } = useMemo(() => {
        const { start, end } = getPeriodRange(activePeriod);
        return {
            filteredExpenses: expenses.filter(e => e.date >= start && e.date <= end),
            filteredIncomes: incomes.filter(i => i.date >= start && i.date <= end)
        };
    }, [expenses, incomes, activePeriod]);

    // Group Banks based on FILTERED data
    const bankGroups = useMemo(() => {
        return aggregateBanksFromTransactions(filteredExpenses, filteredIncomes);
    }, [filteredExpenses, filteredIncomes]);

    const totalIncome = filteredIncomes.reduce((sum, i) => sum + i.amount, 0);
    const totalExpense = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
    const savings = totalIncome - totalExpense;
    const savingsRate = totalIncome > 0 ? (savings / totalIncome) * 100 : 0;

    const totalLoans = loans.filter(l => !l.isClosed).reduce((sum, l) => sum + (l.amount || 0), 0);
    const totalAssets = assets.reduce((sum, a) => sum + (a.value || 0), 0);
    const netWorth = totalAssets - totalLoans;
    const goalsProgress = goals.length > 0
        ? goals.reduce((sum, g) => sum + (g.savedAmount / g.targetAmount) * 100, 0) / goals.length
        : 0;

    const getPeriodLabel = () => {
        const labels: Record<string, string> = {
            D: "Today",
            W: "This Week",
            M: "This Month",
            Q: "This Quarter",
            Y: "This Year",
            ALL: "All Time"
        };
        return labels[activePeriod] || "This Month";
    };

    // Bar Chart Data Logic
    const getBarChartData = () => {
        const { start } = getPeriodRange(activePeriod);
        let data: number[] = [];
        let labels: string[] = [];

        if (activePeriod === "D") {
            // Hourly (0-23)
            data = new Array(24).fill(0);
            labels = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0') + ":00");
            filteredExpenses.forEach(e => data[e.date.getHours()] += e.amount);
        } else if (activePeriod === "W") {
            // Daily (Mon-Sun)
            data = new Array(7).fill(0);
            labels = ["M", "T", "W", "T", "F", "S", "S"];
            filteredExpenses.forEach(e => {
                const day = e.date.getDay() || 7;
                data[day - 1] += e.amount;
            });
        } else if (activePeriod === "M") {
            // Daily (1-31)
            const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
            data = new Array(daysInMonth).fill(0);
            labels = Array.from({ length: daysInMonth }, (_, i) => (i + 1).toString());
            filteredExpenses.forEach(e => data[e.date.getDate() - 1] += e.amount);
        } else if (activePeriod === "Q") {
            // Weekly (approx 13 weeks)
            // Simplified: Just show 3 months
            data = new Array(3).fill(0);
            const startMonth = start.getMonth();
            labels = Array.from({ length: 3 }, (_, i) => {
                const d = new Date(start.getFullYear(), startMonth + i, 1);
                return d.toLocaleString('default', { month: 'short' });
            });
            filteredExpenses.forEach(e => {
                const monthIndex = e.date.getMonth() - startMonth;
                if (monthIndex >= 0 && monthIndex < 3) data[monthIndex] += e.amount;
            });
        } else if (activePeriod === "Y") {
            // Monthly (Jan-Dec)
            data = new Array(12).fill(0);
            labels = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
            filteredExpenses.forEach(e => data[e.date.getMonth()] += e.amount);
        } else if (activePeriod === "ALL") {
            // Yearly (last 5 years?)
            const currentYear = new Date().getFullYear();
            data = new Array(5).fill(0);
            labels = Array.from({ length: 5 }, (_, i) => (currentYear - 4 + i).toString());
            filteredExpenses.forEach(e => {
                const yearIndex = e.date.getFullYear() - (currentYear - 4);
                if (yearIndex >= 0 && yearIndex < 5) data[yearIndex] += e.amount;
            });
        }

        return { data, labels };
    };

    const getCountChartData = () => {
        const { start } = getPeriodRange(activePeriod);
        let data: number[] = [];

        if (activePeriod === "D") {
            data = new Array(24).fill(0);
            filteredExpenses.forEach(e => data[e.date.getHours()] += 1);
            filteredIncomes.forEach(i => data[i.date.getHours()] += 1);
        } else if (activePeriod === "W") {
            data = new Array(7).fill(0);
            filteredExpenses.forEach(e => {
                const day = e.date.getDay() || 7;
                data[day - 1] += 1;
            });
            filteredIncomes.forEach(i => {
                const day = i.date.getDay() || 7;
                data[day - 1] += 1;
            });
        } else if (activePeriod === "M") {
            const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
            data = new Array(daysInMonth).fill(0);
            filteredExpenses.forEach(e => data[e.date.getDate() - 1] += 1);
            filteredIncomes.forEach(i => data[i.date.getDate() - 1] += 1);
        } else if (activePeriod === "Q") {
            data = new Array(3).fill(0);
            const startMonth = start.getMonth();
            filteredExpenses.forEach(e => {
                const monthIndex = e.date.getMonth() - startMonth;
                if (monthIndex >= 0 && monthIndex < 3) data[monthIndex] += 1;
            });
            filteredIncomes.forEach(i => {
                const monthIndex = i.date.getMonth() - startMonth;
                if (monthIndex >= 0 && monthIndex < 3) data[monthIndex] += 1;
            });
        } else if (activePeriod === "Y") {
            data = new Array(12).fill(0);
            filteredExpenses.forEach(e => data[e.date.getMonth()] += 1);
            filteredIncomes.forEach(i => data[i.date.getMonth()] += 1);
        } else if (activePeriod === "ALL") {
            const currentYear = new Date().getFullYear();
            data = new Array(5).fill(0);
            filteredExpenses.forEach(e => {
                const yearIndex = e.date.getFullYear() - (currentYear - 4);
                if (yearIndex >= 0 && yearIndex < 5) data[yearIndex] += 1;
            });
            filteredIncomes.forEach(i => {
                const yearIndex = i.date.getFullYear() - (currentYear - 4);
                if (yearIndex >= 0 && yearIndex < 5) data[yearIndex] += 1;
            });
        }
        return data;
    };

    const amountChartData = getBarChartData();
    const countChartData = getCountChartData();

    if (!user) return null;

    if (dataLoading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="w-12 h-12 animate-spin text-teal-600 mx-auto mb-4" />
                    <p className="text-slate-600">Loading your dashboard...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
            <Navbar />

            <div className="container mx-auto px-4 py-8 pt-32">
                <div className="flex flex-col lg:flex-row gap-8">

                    {/* Sidebar / Tabs */}
                    <div className="w-full lg:w-64 flex-shrink-0">
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sticky top-32">
                            <div className="space-y-2">
                                <button
                                    onClick={() => setActiveTab("overview")}
                                    className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-colors ${activeTab === "overview" ? "bg-teal-50 text-teal-700 font-bold" : "text-slate-600 hover:bg-slate-50"}`}
                                >
                                    <TrendingUp className="w-5 h-5" />
                                    <span>Overview</span>
                                </button>
                                <button
                                    onClick={() => setActiveTab("transactions")}
                                    className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-colors ${activeTab === "transactions" ? "bg-teal-50 text-teal-700 font-bold" : "text-slate-600 hover:bg-slate-50"}`}
                                >
                                    <CreditCard className="w-5 h-5" />
                                    <span>Transactions</span>
                                </button>
                                <button
                                    onClick={() => setActiveTab("goals")}
                                    className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-colors ${activeTab === "goals" ? "bg-teal-50 text-teal-700 font-bold" : "text-slate-600 hover:bg-slate-50"}`}
                                >
                                    <Target className="w-5 h-5" />
                                    <span>Goals</span>
                                </button>
                                <button
                                    onClick={() => setActiveTab("portfolio")}
                                    className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-colors ${activeTab === "portfolio" ? "bg-teal-50 text-teal-700 font-bold" : "text-slate-600 hover:bg-slate-50"}`}
                                >
                                    <PieChart className="w-5 h-5" />
                                    <span>Portfolio</span>
                                </button>
                                <button
                                    onClick={() => setActiveTab("loans")}
                                    className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-colors ${activeTab === "loans" ? "bg-teal-50 text-teal-700 font-bold" : "text-slate-600 hover:bg-slate-50"}`}
                                >
                                    <CreditCard className="w-5 h-5" />
                                    <span>Loans</span>
                                </button>
                                <Link href="/dashboard/friends">
                                    <button className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors">
                                        <Users className="w-5 h-5" />
                                        <span>Friends</span>
                                    </button>
                                </Link>
                                <Link href="/dashboard/sharing">
                                    <button className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors">
                                        <Share2 className="w-5 h-5" />
                                        <span>Partner Sharing</span>
                                    </button>
                                </Link>
                                <button
                                    onClick={() => setActiveTab("profile")}
                                    className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-colors ${activeTab === "profile" ? "bg-teal-50 text-teal-700 font-bold" : "text-slate-600 hover:bg-slate-50"}`}
                                >
                                    <User className="w-5 h-5" />
                                    <span>Profile</span>
                                </button>

                                <div className="pt-4 mt-4 border-t border-slate-100">
                                    <Link href="/subscription">
                                        <div className="w-full bg-slate-900 rounded-xl p-4 cursor-pointer hover:shadow-lg transition-all group relative overflow-hidden">
                                            <div className="absolute top-0 right-0 w-24 h-24 bg-teal-500/20 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
                                            <div className="relative z-10">
                                                <div className="flex items-center gap-2 text-teal-400 mb-2">
                                                    <Play className="w-4 h-4 fill-current" />
                                                    <span className="text-xs font-bold tracking-wider">ACTIVE SUBS</span>
                                                </div>
                                                <div className="flex items-baseline gap-1 text-white mb-1">
                                                    <span className="text-2xl font-bold">₹898</span>
                                                    <span className="text-xs text-slate-400">/mo</span>
                                                </div>
                                                <p className="text-xs text-slate-400">Netflix, Spotify +1</p>
                                            </div>
                                        </div>
                                    </Link>

                                    {/* Mock Hidden Charge Alert */}
                                    <div className="mt-3 bg-red-50 border border-red-100 rounded-xl p-3 flex items-start gap-3">
                                        <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                                        <div>
                                            <p className="text-xs font-bold text-red-700">Hidden Fee Detected</p>
                                            <p className="text-[10px] text-red-600 leading-tight">Forex Markup of ₹45 on recent transaction.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Main Content */}
                    <div className="flex-1 space-y-8">
                        {activeTab === "transactions" ? (
                            <DashboardScreen
                                expenses={expenses}
                                incomes={incomes}
                                userProfile={userProfile}
                                userId={user?.phoneNumber || user?.uid || ""}
                                onRefresh={() => {
                                    const userId = user?.phoneNumber || user?.uid;
                                    if (userId) loadDashboardData(userId);
                                }}
                                friends={friends}
                                groups={groups}
                            />
                        ) : activeTab === "profile" ? (
                            <ProfileScreen
                                userProfile={userProfile}
                                userPhone={user?.phoneNumber || ""}
                                onSignOut={() => router.push('/login')}
                            />
                        ) : activeTab === "goals" ? (
                            <GoalsScreen
                                goals={goals}
                                loading={dataLoading}
                            />
                        ) : activeTab === "loans" ? (
                            <LoansScreen
                                loans={loans}
                                loading={dataLoading}
                            />
                        ) : activeTab === "portfolio" ? (
                            <AnalyticsScreen
                                expenses={expenses}
                                incomes={incomes}
                                friends={friends.map(f => ({ id: f.phone, name: f.name }))}
                                groups={groups.map(g => ({ id: g.id, name: g.name }))}
                                isLoading={dataLoading}
                            />
                        ) : (
                            <>
                                {/* Welcome Header */}
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200 relative overflow-hidden"
                                >
                                    <div className="relative z-10">
                                        <h1 className="text-4xl font-bold text-slate-900 mb-2">
                                            Welcome back, {userName}! 👋
                                        </h1>
                                        <p className="text-lg text-slate-700 leading-loose">
                                            Here's your financial overview for {getPeriodLabel().toLowerCase()}.
                                        </p>
                                    </div>
                                    <div className="relative z-10 mt-6 flex gap-3">
                                        <button
                                            onClick={handleGmailConnect}
                                            disabled={gmailConnecting}
                                            className="px-4 py-2 bg-slate-900 text-white rounded-xl shadow-lg shadow-slate-900/10 hover:bg-slate-800 transition-all flex items-center gap-2 text-sm font-medium"
                                        >
                                            {gmailConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <div className="w-4 h-4 bg-white rounded-full flex items-center justify-center text-[8px] text-slate-900 font-bold">G</div>}
                                            <span>Sync Gmail</span>
                                        </button>
                                    </div>
                                    <div className="absolute top-0 right-0 w-64 h-64 bg-teal-50/50 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                                </motion.div>

                                {/* Magic Input (Kept at top) */}
                                <div className="mt-8 mb-6">
                                    <MagicInput onAdd={handleSaveTransaction} />
                                </div>



                                <BankDetailsModal
                                    isOpen={!!selectedBankGroup}
                                    onClose={() => setSelectedBankGroup(null)}
                                    bankName={selectedBankGroup?.bankName || ''}
                                    cards={selectedBankGroup?.cards || []}
                                    userName={userName}
                                    expenses={filteredExpenses}
                                    incomes={filteredIncomes}
                                    onDeleteTransaction={handleDeleteTransaction}
                                    onEditTransaction={(tx) => { setEditingTx(tx); setIsAddTxModalOpen(true); }}
                                    onSplitTransaction={(tx) => { setSplitTx(tx as ExpenseItem); setIsSplitModalOpen(true); }}
                                    onViewTransactionDetails={(tx) => setViewingTx(tx)}
                                />

                                {/* Shared Transaction Modals */}
                                {isAddTxModalOpen && (
                                    <TransactionModal
                                        isOpen={isAddTxModalOpen}
                                        onClose={() => { setIsAddTxModalOpen(false); setEditingTx(null); }}
                                        initialData={editingTx}
                                        onSave={handleSaveTransaction}
                                        friends={friends}
                                        groups={groups}
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
                                        onEdit={(tx) => { setViewingTx(null); setEditingTx(tx); setIsAddTxModalOpen(true); }}
                                        onDelete={handleDeleteTransaction}
                                    />
                                )}



                                <AddCardModal
                                    isOpen={showAddCard}
                                    onClose={() => setShowAddCard(false)}
                                    onAdd={handleAddCard}
                                />

                                {/* Period Filter */}
                                <PeriodFilterBar
                                    activePeriod={activePeriod}
                                    onPeriodChange={setActivePeriod}
                                />

                                {/* Transaction Ring */}
                                <div
                                    className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
                                    onClick={() => setActiveTab("transactions")}
                                >
                                    <TransactionRing
                                        credit={totalIncome}
                                        debit={totalExpense}
                                        period={getPeriodLabel()}
                                        onClick={() => setActiveTab("transactions")}
                                    />
                                </div>

                                {/* Bar Charts Row */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="h-[300px]">
                                        <BarChartCard
                                            title="Transaction Count"
                                            data={countChartData}
                                            labels={amountChartData.labels} // Reuse labels
                                            period={activePeriod}
                                            color="#0f172a" // Slate-900
                                            onViewAll={() => setActiveTab("transactions")}
                                        />
                                    </div>
                                    <div className="h-[300px]">
                                        <BarChartCard
                                            title="Transaction Amount"
                                            data={amountChartData.data}
                                            labels={amountChartData.labels}
                                            period={activePeriod}
                                            color="#0d9488" // Teal-600
                                            onViewAll={() => setActiveTab("transactions")}
                                        />
                                    </div>
                                </div>

                                {/* My Cards Section (Show Full Width) */}
                                <div className="mt-8">
                                    <div className="flex items-center justify-between mb-4 px-1">
                                        <h2 className="text-xl font-bold text-slate-900">My Cards</h2>
                                        <button
                                            onClick={() => setShowAddCard(true)}
                                            className="text-sm font-semibold text-teal-600 hover:text-teal-700 bg-teal-50 hover:bg-teal-100 px-3 py-1.5 rounded-lg transition-colors"
                                        >
                                            + Add Card
                                        </button>
                                    </div>
                                    <div className="flex gap-6 overflow-x-auto pb-6 scrollbar-hide snap-x max-w-[72rem]">
                                        {bankGroups.length === 0 ? (
                                            <div
                                                onClick={() => setShowAddCard(true)}
                                                className="w-80 h-48 rounded-2xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center cursor-pointer hover:border-teal-400 hover:bg-teal-50/50 transition-all group shrink-0"
                                            >
                                                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3 group-hover:bg-teal-100 group-hover:text-teal-600 transition-colors">
                                                    <CreditCard className="w-6 h-6 text-slate-400 group-hover:text-teal-600" />
                                                </div>
                                                <p className="font-semibold text-slate-600 group-hover:text-teal-700">Add your first card</p>
                                            </div>
                                        ) : (
                                            bankGroups.map((group, i) => (
                                                <BankCard
                                                    key={i}
                                                    bankName={group.bankName}
                                                    cardType={group.cards.length > 1 ? `${group.cards.length} Cards` : group.cards[0]?.cardType || 'Card'}
                                                    last4={group.cards.length > 1 ? '••••' : group.cards[0]?.last4 || 'XXXX'}
                                                    name={userName}
                                                    colorTheme={i % 2 === 0 ? 'black' : 'blue'}
                                                    logoUrl={group.logoUrl}
                                                    stats={group.stats}
                                                    onClick={() => setSelectedBankGroup(group)}
                                                />
                                            ))
                                        )}
                                    </div>
                                </div>


                                {/* Banners & Insights */}
                                <div className="space-y-4">
                                    <GmailBackfillBanner
                                        isLinked={!!userEmail}
                                        onRetry={() => {
                                            const userId = user?.phoneNumber || user?.uid;
                                            if (userId) loadDashboardData(userId);
                                        }}
                                        onConnect={handleGmailConnect}
                                        connecting={gmailConnecting}
                                    />

                                    <CrisisAlertBanner
                                        totalIncome={totalIncome}
                                        totalExpense={totalExpense}
                                    />

                                    <SmartInsightCard
                                        insights={insights}
                                    />
                                </div>

                                {/* Goals & Net Worth Tiles (Layout Builder equivalent) */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => setActiveTab("goals")}>
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="p-3 bg-amber-100 text-amber-600 rounded-xl">
                                                <Target className="w-6 h-6" />
                                            </div>
                                            <span className="text-2xl font-bold text-slate-900">{goals.length}</span>
                                        </div>
                                        <h3 className="font-bold text-slate-900">Active Goals</h3>
                                        <p className="text-slate-500 text-sm">
                                            Total Target: ₹{goals.reduce((sum, g) => sum + g.targetAmount, 0).toLocaleString('en-IN')}
                                        </p>
                                    </div>

                                    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => setActiveTab("portfolio")}>
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="p-3 bg-indigo-100 text-indigo-600 rounded-xl">
                                                <Flag className="w-6 h-6" />
                                            </div>
                                            <span className="text-2xl font-bold text-slate-900">₹{netWorth.toLocaleString('en-IN')}</span>
                                        </div>
                                        <h3 className="font-bold text-slate-900">Net Worth</h3>
                                        <p className="text-slate-500 text-sm">
                                            Assets - Loans
                                        </p>
                                    </div>
                                </div>



                            </>
                        )}
                    </div>

                </div>
            </div>
            {isGmailLinkOpen && (
                <GmailLinkModal
                    isOpen={isGmailLinkOpen}
                    onClose={() => setIsGmailLinkOpen(false)}
                    onSuccess={() => {
                        setIsGmailLinkOpen(false);
                        handleGmailConnect();
                    }}
                />
            )}
            {/* Old AI Assistant removed - using FiinnyBrainChat instead */}
            {/* <AiAssistant /> */}
        </div >
    );
}
