"use client";

import { ExpenseItem } from "@/lib/firestore";
import { X, TrendingDown } from "lucide-react";
import { useState, useMemo } from "react";

interface SubcategoryBucket {
    name: string;
    amount: number;
    count: number;
    percentage: number;
}

interface SubcategoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    category: string;
    expenses: ExpenseItem[];
    totalAmount: number;
    dateRange: string;
}

type SortOption = "amount-desc" | "amount-asc" | "alpha-asc" | "alpha-desc";

export default function SubcategoryModal({
    isOpen,
    onClose,
    category,
    expenses,
    totalAmount,
    dateRange
}: SubcategoryModalProps) {
    const [sortBy, setSortBy] = useState<SortOption>("amount-desc");

    // Extract subcategory from expense
    const getSubcategory = (expense: ExpenseItem): string => {
        // Try direct subcategory field
        if ((expense as any).subcategory) {
            return (expense as any).subcategory;
        }

        // Try brainMeta
        if (expense.brainMeta?.subcategory) {
            return expense.brainMeta.subcategory;
        }

        return "Uncategorized";
    };

    // Group by subcategory
    const subcategoryBuckets = useMemo(() => {
        const map = new Map<string, { amount: number; count: number }>();

        expenses.forEach(exp => {
            const sub = getSubcategory(exp);
            const current = map.get(sub) || { amount: 0, count: 0 };
            map.set(sub, {
                amount: current.amount + exp.amount,
                count: current.count + 1
            });
        });

        const buckets: SubcategoryBucket[] = Array.from(map.entries()).map(([name, data]) => ({
            name,
            amount: data.amount,
            count: data.count,
            percentage: totalAmount > 0 ? (data.amount / totalAmount) * 100 : 0
        }));

        // Sort
        buckets.sort((a, b) => {
            switch (sortBy) {
                case "amount-asc":
                    return a.amount - b.amount;
                case "alpha-asc":
                    return a.name.localeCompare(b.name);
                case "alpha-desc":
                    return b.name.localeCompare(a.name);
                case "amount-desc":
                default:
                    return b.amount - a.amount;
            }
        });

        return buckets;
    }, [expenses, totalAmount, sortBy]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
                {/* Handle bar (mobile) */}
                <div className="sm:hidden flex justify-center pt-3 pb-2">
                    <div className="w-10 h-1 bg-slate-300 rounded-full" />
                </div>

                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-200">
                    <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-xl bg-teal-100 flex items-center justify-center">
                                <TrendingDown className="w-6 h-6 text-teal-700" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-slate-900">{category}</h2>
                                <p className="text-sm text-slate-600">{dateRange}</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                            <X className="w-5 h-5 text-slate-600" />
                        </button>
                    </div>

                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-2xl font-bold text-slate-900">
                                ₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                            <p className="text-sm text-slate-600">{subcategoryBuckets.length} subcategories</p>
                        </div>
                    </div>

                    {/* Sort Options */}
                    <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-2">
                        <span className="text-sm font-medium text-slate-700 flex-shrink-0">Sort:</span>
                        {[
                            { value: "amount-desc" as SortOption, label: "Amount ↓" },
                            { value: "amount-asc" as SortOption, label: "Amount ↑" },
                            { value: "alpha-asc" as SortOption, label: "A-Z" },
                            { value: "alpha-desc" as SortOption, label: "Z-A" },
                        ].map(option => (
                            <button
                                key={option.value}
                                onClick={() => setSortBy(option.value)}
                                className={`
                                    flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all
                                    ${sortBy === option.value
                                        ? "bg-teal-600 text-white"
                                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                                    }
                                `}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Subcategory List */}
                <div className="flex-1 overflow-y-auto">
                    {subcategoryBuckets.length === 0 ? (
                        <div className="py-12 text-center text-slate-500">
                            No subcategories found
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {subcategoryBuckets.map((bucket, index) => (
                                <div
                                    key={index}
                                    className="px-6 py-4 hover:bg-slate-50 transition-colors cursor-pointer"
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-semibold text-slate-900 truncate">
                                                {bucket.name}
                                            </h3>
                                            <p className="text-sm text-slate-600 mt-0.5">
                                                {bucket.count} transaction{bucket.count !== 1 ? 's' : ''} • {bucket.percentage.toFixed(1)}%
                                            </p>
                                        </div>
                                        <div className="ml-4 text-right">
                                            <p className="font-bold text-slate-900">
                                                ₹{bucket.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
