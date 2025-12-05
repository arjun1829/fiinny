"use client";

import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Target, AlertCircle, Wallet, PiggyBank } from "lucide-react";

interface StatsCardsProps {
    totalIncome: number;
    totalExpense: number;
    savings: number;
    savingsRate: number;
    goalsProgress: number;
    totalLoans: number;
    totalAssets: number;
    netWorth: number;
    onTabChange: (tab: string) => void;
}

export default function StatsCards({
    totalIncome,
    totalExpense,
    savings,
    savingsRate,
    goalsProgress,
    totalLoans,
    totalAssets,
    netWorth,
    onTabChange,
}: StatsCardsProps) {
    const cards = [
        {
            title: "Net Worth",
            value: `₹${netWorth.toLocaleString('en-IN')}`,
            subtitle: `Assets ₹${totalAssets.toLocaleString('en-IN')} - Loans ₹${totalLoans.toLocaleString('en-IN')}`,
            icon: Wallet,
            color: "from-teal-500 to-emerald-600",
            bgColor: "bg-teal-50",
            textColor: "text-teal-700",
            targetTab: "portfolio",
        },
        {
            title: "Savings",
            value: `₹${savings.toLocaleString('en-IN')}`,
            subtitle: `${savingsRate.toFixed(1)}% savings rate`,
            icon: PiggyBank,
            color: "from-green-500 to-emerald-500",
            bgColor: "bg-green-50",
            textColor: "text-green-700",
            trend: savings > 0 ? "up" : "down",
            targetTab: "transactions",
        },
        {
            title: "Goals Progress",
            value: `${goalsProgress.toFixed(0)}%`,
            subtitle: "Average completion",
            icon: Target,
            color: "from-blue-500 to-indigo-600",
            bgColor: "bg-blue-50",
            textColor: "text-blue-700",
            targetTab: "goals",
        },
        {
            title: "Outstanding Loans",
            value: `₹${totalLoans.toLocaleString('en-IN')}`,
            subtitle: totalLoans > 0 ? "Needs attention" : "All clear!",
            icon: AlertCircle,
            color: "from-amber-500 to-orange-600",
            bgColor: "bg-amber-50",
            textColor: "text-amber-700",
            targetTab: "portfolio",
        },
    ];

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {cards.map((card, index) => (
                <motion.div
                    key={card.title}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                    onClick={() => onTabChange(card.targetTab)}
                    className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow cursor-pointer"
                >
                    <div className="flex items-start justify-between mb-4">
                        <div className={`p-3 rounded-xl ${card.bgColor}`}>
                            <card.icon className={`w-6 h-6 ${card.textColor}`} />
                        </div>
                        {card.trend && (
                            <div className={`flex items-center gap-1 text-sm font-semibold ${card.trend === "up" ? "text-green-600" : "text-red-600"
                                }`}>
                                {card.trend === "up" ? (
                                    <TrendingUp className="w-4 h-4" />
                                ) : (
                                    <TrendingDown className="w-4 h-4" />
                                )}
                            </div>
                        )}
                    </div>
                    <div className="text-sm font-semibold text-slate-500 mb-1">{card.title}</div>
                    <div className="text-2xl font-bold text-slate-900 mb-1">{card.value}</div>
                    <div className="text-xs text-slate-500">{card.subtitle}</div>
                </motion.div>
            ))}
        </div>
    );
}
