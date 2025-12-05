"use client";

import { Search, Filter, X } from "lucide-react";

interface TransactionFiltersProps {
    searchQuery: string;
    onSearchChange: (query: string) => void;
    typeFilter: "all" | "expense" | "income";
    onTypeFilterChange: (type: "all" | "expense" | "income") => void;
    periodFilter: string;
    onPeriodFilterChange: (period: string) => void;
}

export default function TransactionFilters({
    searchQuery,
    onSearchChange,
    typeFilter,
    onTypeFilterChange,
    periodFilter,
    onPeriodFilterChange
}: TransactionFiltersProps) {
    return (
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4 items-center justify-between">

            {/* Search */}
            <div className="relative w-full md:w-96">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                    type="text"
                    placeholder="Search transactions..."
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all text-slate-900 placeholder:text-slate-400"
                />
                {searchQuery && (
                    <button
                        onClick={() => onSearchChange("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">

                {/* Type Filter */}
                <div className="flex bg-slate-100 p-1 rounded-xl">
                    {(["all", "expense", "income"] as const).map((type) => (
                        <button
                            key={type}
                            onClick={() => onTypeFilterChange(type)}
                            className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-all ${typeFilter === type
                                    ? "bg-white text-slate-900 shadow-sm"
                                    : "text-slate-500 hover:text-slate-700"
                                }`}
                        >
                            {type}
                        </button>
                    ))}
                </div>

                {/* Period Filter */}
                <select
                    value={periodFilter}
                    onChange={(e) => onPeriodFilterChange(e.target.value)}
                    className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:outline-none focus:border-teal-500 cursor-pointer"
                >
                    <option value="ALL">All Time</option>
                    <option value="M">This Month</option>
                    <option value="LM">Last Month</option>
                    <option value="Y">This Year</option>
                </select>
            </div>
        </div>
    );
}
