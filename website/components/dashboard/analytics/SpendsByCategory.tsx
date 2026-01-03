"use client";

import { ExpenseItem } from "@/lib/firestore";
import { useMemo, useState } from "react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { Layers } from "lucide-react";

interface SpendsByCategoryProps {
    expenses: ExpenseItem[];
    onCategoryClick?: (category: string, amount: number) => void;
}

export default function SpendsByCategory({ expenses, onCategoryClick }: SpendsByCategoryProps) {
    const [selectedMonth, setSelectedMonth] = useState(new Date());

    // Generate last 12 months
    const months = useMemo(() => {
        const result = [];
        for (let i = 11; i >= 0; i--) {
            result.push(subMonths(new Date(), i));
        }
        return result;
    }, []);

    // Calculate category totals for selected month
    const categoryData = useMemo(() => {
        const start = startOfMonth(selectedMonth);
        const end = endOfMonth(selectedMonth);

        const categoryMap = new Map<string, number>();

        expenses.forEach(exp => {
            if (exp.date >= start && exp.date <= end) {
                const category = exp.category || "Uncategorized";
                categoryMap.set(category, (categoryMap.get(category) || 0) + exp.amount);
            }
        });

        const entries = Array.from(categoryMap.entries())
            .map(([name, amount]) => ({ name, amount }))
            .sort((a, b) => b.amount - a.amount);

        const total = entries.reduce((sum, e) => sum + e.amount, 0);

        return { entries, total };
    }, [expenses, selectedMonth]);

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

    return (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            {/* Header */}
            <div className="flex items-center gap-2 mb-4">
                <Layers className="w-5 h-5 text-teal-600" />
                <h3 className="font-bold text-slate-900">Spends by Category</h3>
            </div>

            {/* Month Selector */}
            <div className="mb-4 overflow-x-auto scrollbar-hide">
                <div className="flex gap-2 pb-2">
                    {months.map((month) => {
                        const isSelected =
                            month.getMonth() === selectedMonth.getMonth() &&
                            month.getFullYear() === selectedMonth.getFullYear();

                        return (
                            <button
                                key={month.toISOString()}
                                onClick={() => setSelectedMonth(month)}
                                className={`
                                    flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all
                                    ${isSelected
                                        ? "bg-slate-900 text-white shadow-md"
                                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                                    }
                                `}
                            >
                                {format(month, 'MMM')}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Total */}
            <div className="mb-4 text-center py-3 bg-slate-50 rounded-lg">
                <div className="text-xs text-slate-600 mb-1">
                    {format(selectedMonth, 'MMMM yyyy')} spends
                </div>
                <div className="text-2xl font-bold text-slate-900">
                    ₹{categoryData.total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
            </div>

            {/* Category List */}
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {categoryData.entries.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 text-sm">
                        No spends for this month
                    </div>
                ) : (
                    categoryData.entries.map((item) => (
                        <button
                            key={item.name}
                            onClick={() => onCategoryClick?.(item.name, item.amount)}
                            className="w-full flex items-center justify-between p-3 hover:bg-slate-50 rounded-lg transition-colors group"
                        >
                            <div className="flex items-center gap-3">
                                <span className="text-xl">{getCategoryIcon(item.name)}</span>
                                <span className="text-sm font-medium text-slate-900 group-hover:text-teal-600">
                                    {item.name}
                                </span>
                            </div>
                            <span className="text-sm font-bold text-slate-900">
                                ₹{item.amount.toLocaleString('en-IN')}
                            </span>
                        </button>
                    ))
                )}
            </div>
        </div>
    );
}
