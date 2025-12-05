"use client";

import { useAuth } from "@/components/AuthProvider";
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
    UserProfile
} from "@/lib/firestore";
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
    Flag
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

import { FxService } from "@/lib/fx_service";
import DashboardScreen from "@/components/screens/DashboardScreen";
import { useAi } from "@/components/ai/AiContext";
import ProfileScreen from "@/components/screens/ProfileScreen";
import GoalsScreen from "@/components/screens/GoalsScreen";
import LoansScreen from "@/components/screens/LoansScreen";

import AnalyticsScreen from "@/components/screens/AnalyticsScreen";

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

    // UI states
    const [activeTab, setActiveTab] = useState("overview");
    const [activePeriod, setActivePeriod] = useState("M"); // Month by default
    const [dataLoading, setDataLoading] = useState(true);
    const [gmailConnecting, setGmailConnecting] = useState(false);

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

    const handleGmailConnect = async () => {
        const userId = user?.phoneNumber || user?.uid;
        if (!userId) return;

        setGmailConnecting(true);
        try {
            const service = GmailService.getInstance();
            const connected = await service.connect();

            if (connected) {
                console.log("Gmail connected, starting sync...");
                const count = await service.fetchAndStoreTransactions(userId);
                console.log(`Synced ${count} transactions from Gmail`);

                await loadDashboardData(userId);
                alert(`Successfully synced ${count} transactions from Gmail!`);
            }
        } catch (error) {
            console.error("Gmail sync error:", error);
            alert("An error occurred during Gmail sync.");
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
                                    <div className="absolute top-0 right-0 w-64 h-64 bg-teal-50/50 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                                </motion.div>

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

                                {/* Stats Cards (Summary) */}
                                <StatsCards
                                    totalIncome={totalIncome}
                                    totalExpense={totalExpense}
                                    savings={savings}
                                    savingsRate={savingsRate}
                                    goalsProgress={goalsProgress}
                                    totalLoans={totalLoans}
                                    totalAssets={totalAssets}
                                    netWorth={netWorth}
                                    onTabChange={setActiveTab}
                                />

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
                                        income={totalIncome}
                                        expense={totalExpense}
                                        savings={savings}
                                        totalLoan={totalLoans}
                                        totalAssets={totalAssets}
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
        </div >
    );
}
