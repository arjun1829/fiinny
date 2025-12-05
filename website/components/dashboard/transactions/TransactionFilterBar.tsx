"use client";

import { Filter, Search, X, ChevronDown } from "lucide-react";
import { useState } from "react";
import FilterModal, { FilterState } from "./FilterModal";

interface TransactionFilterBarProps {
    filters: FilterState;
    onFilterChange: (filters: FilterState) => void;
    onSearchChange: (query: string) => void;
    searchQuery: string;
    options: {
        categories: string[];
        merchants: string[];
        banks: string[];
        friends: { id: string; name: string }[];
        groups: { id: string; name: string }[];
    };
}

export default function TransactionFilterBar({
    filters,
    onFilterChange,
    onSearchChange,
    searchQuery,
    options
}: TransactionFilterBarProps) {
    const [isModalOpen, setIsModalOpen] = useState(false);

    const periods = [
        { label: "Today", value: "D" },
        { label: "Week", value: "W" },
        { label: "Month", value: "M" },
        { label: "Year", value: "Y" },
        { label: "All", value: "ALL" },
    ];

    const types = [
        { label: "All", value: "all" },
        { label: "Expense", value: "expense" },
        { label: "Income", value: "income" },
    ];

    const activeFilterCount =
        filters.categories.size +
        filters.merchants.size +
        filters.banks.size +
        filters.friends.size +
        filters.groups.size;

    return (
        <div className="bg-white border-b border-slate-200 sticky top-16 z-30">
            <div className="max-w-7xl mx-auto px-4 py-3 space-y-3">

                {/* Top Row: Search + Filter Button */}
                <div className="flex items-center gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search transactions..."
                            value={searchQuery}
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => onSearchChange("")}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>

                    <button
                        onClick={() => setIsModalOpen(true)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${activeFilterCount > 0
                                ? "bg-teal-50 text-teal-700 border border-teal-200"
                                : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
                            }`}
                    >
                        <Filter className="w-4 h-4" />
                        <span>Filters</span>
                        {activeFilterCount > 0 && (
                            <span className="bg-teal-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                                {activeFilterCount}
                            </span>
                        )}
                    </button>
                </div>

                {/* Bottom Row: Horizontal Scrollable Chips */}
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                    {/* Type Toggle */}
                    <div className="flex bg-slate-100 p-1 rounded-lg flex-shrink-0">
                        {types.map((type) => (
                            <button
                                key={type.value}
                                onClick={() => onFilterChange({ ...filters, type: type.value as any })}
                                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${filters.type === type.value
                                        ? "bg-white text-slate-900 shadow-sm"
                                        : "text-slate-500 hover:text-slate-700"
                                    }`}
                            >
                                {type.label}
                            </button>
                        ))}
                    </div>

                    <div className="w-px h-6 bg-slate-200 flex-shrink-0 mx-1" />

                    {/* Period Chips */}
                    {periods.map((period) => (
                        <button
                            key={period.value}
                            onClick={() => onFilterChange({ ...filters, period: period.value })}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium border flex-shrink-0 transition-colors ${filters.period === period.value
                                    ? "bg-slate-900 text-white border-slate-900"
                                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                                }`}
                        >
                            {period.label}
                        </button>
                    ))}
                </div>
            </div>

            <FilterModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                currentFilters={filters}
                onApply={(newFilters) => {
                    onFilterChange(newFilters);
                    setIsModalOpen(false);
                }}
                options={options}
            />
        </div>
    );
}
