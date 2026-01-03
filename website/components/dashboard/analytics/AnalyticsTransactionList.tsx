"use client";

import { ExpenseItem, IncomeItem } from "@/lib/firestore";
import { format } from "date-fns";
import { ArrowDownRight, ArrowUpRight, Receipt } from "lucide-react";
import { useState } from "react";

interface AnalyticsTransactionListProps {
    expenses: ExpenseItem[];
    incomes: IncomeItem[];
}

type TransactionType = "all" | "income" | "expense";

export default function AnalyticsTransactionList({ expenses, incomes }: AnalyticsTransactionListProps) {
    const [filterType, setFilterType] = useState<TransactionType>("all");

    // Combine and sort transactions
    const allTransactions = [
        ...expenses.map(e => ({ ...e, type: 'expense' as const })),
        ...incomes.map(i => ({ ...i, type: 'income' as const }))
    ].sort((a, b) => b.date.getTime() - a.date.getTime());

    // Filter transactions
    const filteredTransactions = allTransactions.filter(tx => {
        if (filterType === "all") return true;
        return tx.type === filterType;
    }).slice(0, 20); // Show first 20

    // Get category icon
    const getCategoryIcon = (category: string) => {
        const cat = category.toLowerCase();
        if (cat.includes('food')) return '🍔';
        if (cat.includes('travel')) return '✈️';
        if (cat.includes('shopping')) return '🛍️';
        if (cat.includes('health')) return '🏥';
        if (cat.includes('entertainment')) return '🎬';
        if (cat.includes('education')) return '📚';
        if (cat.includes('investment')) return '📈';
        return '💰';
    };

    // Get subcategory
    const getSubcategory = (tx: any): string => {
        if (tx.subcategory) return tx.subcategory;
        if (tx.brainMeta?.subcategory) return tx.brainMeta.subcategory;
        return '';
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Receipt className="w-5 h-5 text-teal-600" />
                        <h2 className="text-lg font-bold text-slate-900">Transactions</h2>
                    </div>
                    <a
                        href="/dashboard/transactions"
                        className="text-sm text-teal-600 hover:text-teal-700 font-medium"
                    >
                        View all →
                    </a>
                </div>

                {/* Filter Tabs */}
                <div className="flex gap-2">
                    {[
                        { value: "all" as TransactionType, label: "All" },
                        { value: "income" as TransactionType, label: "Income" },
                        { value: "expense" as TransactionType, label: "Expense" },
                    ].map(tab => (
                        <button
                            key={tab.value}
                            onClick={() => setFilterType(tab.value)}
                            className={`
                                px-4 py-2 rounded-full text-sm font-medium transition-all
                                ${filterType === tab.value
                                    ? "bg-slate-900 text-white"
                                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                                }
                            `}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Transaction List */}
            <div className="divide-y divide-slate-100">
                {filteredTransactions.length === 0 ? (
                    <div className="py-12 text-center text-slate-500">
                        No transactions found
                    </div>
                ) : (
                    filteredTransactions.map((tx, index) => {
                        const isIncome = tx.type === 'income';
                        const subcategory = getSubcategory(tx);

                        return (
                            <div
                                key={index}
                                className="px-6 py-4 hover:bg-slate-50 transition-colors"
                            >
                                <div className="flex items-center gap-4">
                                    {/* Icon */}
                                    <div className={`
                                        w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0
                                        ${isIncome ? 'bg-green-100' : 'bg-red-100'}
                                    `}>
                                        {isIncome ? (
                                            <ArrowUpRight className="w-5 h-5 text-green-600" />
                                        ) : (
                                            <ArrowDownRight className="w-5 h-5 text-red-600" />
                                        )}
                                    </div>

                                    {/* Details */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className="font-semibold text-slate-900 truncate">
                                                {tx.title || tx.counterparty || 'Transaction'}
                                            </h3>
                                        </div>

                                        <div className="flex items-center gap-2 flex-wrap">
                                            {/* Category */}
                                            {tx.category && (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-teal-100 text-teal-700 rounded-full text-xs font-medium">
                                                    <span>{getCategoryIcon(tx.category)}</span>
                                                    <span>{tx.category}</span>
                                                </span>
                                            )}

                                            {/* Subcategory */}
                                            {subcategory && (
                                                <span className="inline-flex items-center px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full text-xs font-medium">
                                                    {subcategory}
                                                </span>
                                            )}

                                            {/* Date */}
                                            <span className="text-xs text-slate-500">
                                                {format(tx.date, 'MMM d, yyyy')}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Amount */}
                                    <div className="text-right flex-shrink-0">
                                        <p className={`
                                            font-bold text-lg
                                            ${isIncome ? 'text-green-600' : 'text-red-600'}
                                        `}>
                                            {isIncome ? '+' : '-'}₹{tx.amount.toLocaleString('en-IN', {
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 2
                                            })}
                                        </p>
                                        {tx.issuerBank && (
                                            <p className="text-xs text-slate-500 mt-0.5">
                                                {tx.issuerBank}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
