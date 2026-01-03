"use client";

import { X, Check, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface FilterState {
    type: "all" | "expense" | "income";
    period: string;
    customRange?: { from: Date; to: Date };
    categories: Set<string>;
    merchants: Set<string>;
    banks: Set<string>;
    friends: Set<string>;
    groups: Set<string>;
    amountRange?: { min: number; max: number };
    sortBy: "date" | "amount";
    sortDir: "asc" | "desc";
    groupBy: "none" | "day" | "week" | "month" | "category";
    // New analytics filters
    scope?: "all" | "savings" | "credit";
    bankPill?: string | null;
    instrument?: "all" | "upi" | "debit" | "others";
}

interface FilterModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentFilters: FilterState;
    onApply: (filters: FilterState) => void;
    options: {
        categories: string[];
        merchants: string[];
        banks: string[];
        friends: { id: string; name: string }[];
        groups: { id: string; name: string }[];
    };
}

export default function FilterModal({
    isOpen,
    onClose,
    currentFilters,
    onApply,
    options
}: FilterModalProps) {
    const [filters, setFilters] = useState<FilterState>(currentFilters);
    const [expandedSection, setExpandedSection] = useState<string | null>("categories");

    const toggleSection = (section: string) => {
        setExpandedSection(expandedSection === section ? null : section);
    };

    const toggleSetItem = (key: keyof FilterState, item: string) => {
        setFilters(prev => {
            const newSet = new Set(prev[key] as Set<string>);
            if (newSet.has(item)) {
                newSet.delete(item);
            } else {
                newSet.add(item);
            }
            return { ...prev, [key]: newSet };
        });
    };

    const Section = ({ title, id, children }: { title: string; id: string; children: React.ReactNode }) => (
        <div className="border-b border-slate-100 last:border-0">
            <button
                onClick={() => toggleSection(id)}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
            >
                <span className="font-semibold text-slate-700">{title}</span>
                {expandedSection === id ? (
                    <ChevronUp className="w-5 h-5 text-slate-400" />
                ) : (
                    <ChevronDown className="w-5 h-5 text-slate-400" />
                )}
            </button>
            <AnimatePresence>
                {expandedSection === id && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="p-4 pt-0">{children}</div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );

    const ChipGrid = ({
        items,
        selected,
        onToggle,
        renderLabel
    }: {
        items: string[];
        selected: Set<string>;
        onToggle: (item: string) => void;
        renderLabel?: (item: string) => string;
    }) => (
        <div className="flex flex-wrap gap-2">
            {items.map(item => {
                const isSelected = selected.has(item);
                return (
                    <button
                        key={item}
                        onClick={() => onToggle(item)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all border ${isSelected
                            ? "bg-teal-50 border-teal-200 text-teal-700"
                            : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                            }`}
                    >
                        {renderLabel ? renderLabel(item) : item}
                    </button>
                );
            })}
        </div>
    );

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm p-0 md:p-4">
            <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                className="bg-white w-full md:max-w-lg md:rounded-2xl rounded-t-2xl shadow-xl max-h-[90vh] flex flex-col"
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-100">
                    <h2 className="text-lg font-bold text-slate-900">Filters</h2>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full">
                        <X className="w-5 h-5 text-slate-500" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto">
                    <Section title="Categories" id="categories">
                        <ChipGrid
                            items={options.categories}
                            selected={filters.categories}
                            onToggle={(item) => toggleSetItem("categories", item)}
                        />
                    </Section>

                    <Section title="Merchants" id="merchants">
                        <ChipGrid
                            items={options.merchants}
                            selected={filters.merchants}
                            onToggle={(item) => toggleSetItem("merchants", item)}
                        />
                    </Section>

                    <Section title="Banks & Cards" id="banks">
                        <ChipGrid
                            items={options.banks}
                            selected={filters.banks}
                            onToggle={(item) => toggleSetItem("banks", item)}
                        />
                    </Section>

                    <Section title="Friends" id="friends">
                        <ChipGrid
                            items={options.friends.map(f => f.id)}
                            selected={filters.friends}
                            onToggle={(item) => toggleSetItem("friends", item)}
                            renderLabel={(id) => options.friends.find(f => f.id === id)?.name || id}
                        />
                    </Section>

                    <Section title="Groups" id="groups">
                        <ChipGrid
                            items={options.groups.map(g => g.id)}
                            selected={filters.groups}
                            onToggle={(item) => toggleSetItem("groups", item)}
                            renderLabel={(id) => options.groups.find(g => g.id === id)?.name || id}
                        />
                    </Section>

                    <Section title="Sort & Grouping" id="sort">
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-semibold text-slate-500 uppercase mb-2 block">Sort By</label>
                                <div className="flex gap-2">
                                    {(["date", "amount"] as const).map(opt => (
                                        <button
                                            key={opt}
                                            onClick={() => setFilters(prev => ({ ...prev, sortBy: opt }))}
                                            className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${filters.sortBy === opt
                                                ? "bg-teal-50 border-teal-200 text-teal-700"
                                                : "bg-white border-slate-200 text-slate-600"
                                                }`}
                                        >
                                            {opt.charAt(0).toUpperCase() + opt.slice(1)}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500 uppercase mb-2 block">Group By</label>
                                <div className="flex flex-wrap gap-2">
                                    {(["none", "day", "week", "month", "category"] as const).map(opt => (
                                        <button
                                            key={opt}
                                            onClick={() => setFilters(prev => ({ ...prev, groupBy: opt }))}
                                            className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${filters.groupBy === opt
                                                ? "bg-teal-50 border-teal-200 text-teal-700"
                                                : "bg-white border-slate-200 text-slate-600"
                                                }`}
                                        >
                                            {opt.charAt(0).toUpperCase() + opt.slice(1)}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </Section>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-100 flex gap-3">
                    <button
                        onClick={() => {
                            setFilters({
                                type: "all",
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
                        }}
                        className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                        Reset
                    </button>
                    <button
                        onClick={() => onApply(filters)}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
                    >
                        <Check className="w-4 h-4" />
                        Apply Filters
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
