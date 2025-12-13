"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";
import { getExpenses, getIncomes, ExpenseItem, IncomeItem } from "@/lib/firestore";
import PurchaseSimulator from "@/components/finance/PurchaseSimulator";
import Navbar from "@/components/Navbar";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function SimulatorPage() {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ currentSavings: 0, avgMonthlySavings: 0 });

    useEffect(() => {
        if (!user) return;

        const fetchData = async () => {
            const [expenses, incomes] = await Promise.all([
                getExpenses(user.uid),
                getIncomes(user.uid)
            ]);

            // 1. Calculate Current Savings (Total Income - Total Expense)
            // Ideally this should be balance, but for now Total Savings is fine
            const totalIncome = incomes.reduce((sum, i) => sum + i.amount, 0);
            const totalExpense = expenses.reduce((sum, e) => sum + e.amount, 0);
            const currentSavings = totalIncome - totalExpense;

            // 2. Calculate Avg Monthly Savings (Last 3 Months)
            const now = new Date();
            const threeMonthsAgo = new Date();
            threeMonthsAgo.setMonth(now.getMonth() - 3);

            const recentExpenses = expenses.filter(e => new Date(e.date) >= threeMonthsAgo);
            const recentIncomes = incomes.filter(i => new Date(i.date) >= threeMonthsAgo);

            const recentIncomeTotal = recentIncomes.reduce((sum, i) => sum + i.amount, 0);
            const recentExpenseTotal = recentExpenses.reduce((sum, e) => sum + e.amount, 0);

            // Simple average: Total / 3
            const avgMonthlySavings = (recentIncomeTotal - recentExpenseTotal) / 3;

            setStats({
                currentSavings: Math.max(0, currentSavings), // Don't show negative savings as available
                avgMonthlySavings: Math.max(0, avgMonthlySavings) // Assume 0 if negative for projection safety
            });
            setLoading(false);
        };

        fetchData();
    }, [user]);

    return (
        <div className="min-h-screen bg-slate-50 font-outfit">
            <Navbar />
            <div className="max-w-4xl mx-auto px-4 py-8">
                <Link href="/dashboard" className="inline-flex items-center text-slate-500 hover:text-indigo-600 mb-6 transition-colors">
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    Back to Dashboard
                </Link>

                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-slate-900 mb-2">Financial Time Machine 🔮</h1>
                    <p className="text-slate-600">Simulate major purchases and see how they impact your future.</p>
                </div>

                {loading ? (
                    <div className="h-64 flex items-center justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                    </div>
                ) : (
                    <PurchaseSimulator
                        currentSavings={stats.currentSavings}
                        avgMonthlySavings={stats.avgMonthlySavings}
                    />
                )}
            </div>
        </div>
    );
}
