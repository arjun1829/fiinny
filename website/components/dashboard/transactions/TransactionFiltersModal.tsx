"use client";

import { useState, useMemo } from "react";
import { ExpenseItem, IncomeItem, FriendModel, GroupModel } from "@/lib/firestore";
import { X, Check, Calendar, Tag, Store, CreditCard, Users, User } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";

export interface ExpenseFilterConfig {
    periodToken: string;
    customRange: { start: Date; end: Date } | null;
    categories: Set<string>;
    merchants: Set<string>;
    banks: Set<string>;
    friendPhones: Set<string>;
    groupIds: Set<string>;
}

interface TransactionFiltersModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialConfig: ExpenseFilterConfig;
    onApply: (config: ExpenseFilterConfig) => void;
    expenses: ExpenseItem[];
    incomes: IncomeItem[];
    friends: FriendModel[];
    groups: GroupModel[];
}

type FilterSection = "date" | "categories" | "merchant" | "bankCards" | "friends" | "groups";

export default function TransactionFiltersModal({
    isOpen,
    onClose,
    initialConfig,
    onApply,
    expenses,
    incomes,
    friends,
    groups
}: TransactionFiltersModalProps) {
    const [activeSection, setActiveSection] = useState<FilterSection>("date");
    const [config, setConfig] = useState<ExpenseFilterConfig>(initialConfig);

    // --- Derived Data for Options ---

    const categoryOptions = useMemo(() => {
        const cats = new Set<string>();
        [...expenses, ...incomes].forEach(tx => {
            if (tx.category) cats.add(tx.category);
        });
        return Array.from(cats).sort();
    }, [expenses, incomes]);

    const merchantOptions = useMemo(() => {
        const merchants = new Set<string>();
        [...expenses, ...incomes].forEach(tx => {
            if (tx.counterparty) merchants.add(tx.counterparty.toUpperCase());
        });
        return Array.from(merchants).sort();
    }, [expenses, incomes]);

    const bankOptions = useMemo(() => {
        const banks = new Set<string>();
        [...expenses, ...incomes].forEach(tx => {
            if (tx.issuerBank) banks.add(tx.issuerBank.toUpperCase());
            // Also check for cardLast4 to maybe show "HDFC ****1234" if we wanted, 
            // but for now just Bank Name is good for "Bro Filters".
        });
        return Array.from(banks).sort();
    }, [expenses, incomes]);

    // --- Handlers ---

    const handleApply = () => {
        onApply(config);
        onClose();
    };

    const handleReset = () => {
        setConfig({
            periodToken: "Month",
            customRange: null,
            categories: new Set(),
            merchants: new Set(),
            banks: new Set(),
            friendPhones: new Set(),
            groupIds: new Set(),
        });
    };

    const toggleSetItem = (set: Set<string>, item: string) => {
        const newSet = new Set(set);
        if (newSet.has(item)) newSet.delete(item);
        else newSet.add(item);
        return newSet;
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-2xl w-full max-w-4xl h-[80vh] overflow-hidden shadow-2xl flex flex-col"
            >
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-white z-10">
                    <h3 className="text-xl font-bold text-slate-900">Filters</h3>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <X className="w-6 h-6 text-slate-500" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Sidebar */}
                    <div className="w-48 bg-slate-50 border-r border-slate-200 overflow-y-auto py-4">
                        <SidebarItem
                            icon={<Calendar className="w-4 h-4" />}
                            label="Date / Period"
                            isActive={activeSection === "date"}
                            onClick={() => setActiveSection("date")}
                        />
                        <SidebarItem
                            icon={<Tag className="w-4 h-4" />}
                            label="Categories"
                            isActive={activeSection === "categories"}
                            onClick={() => setActiveSection("categories")}
                        />
                        <SidebarItem
                            icon={<Store className="w-4 h-4" />}
                            label="Merchant"
                            isActive={activeSection === "merchant"}
                            onClick={() => setActiveSection("merchant")}
                        />
                        <SidebarItem
                            icon={<CreditCard className="w-4 h-4" />}
                            label="Bank & Cards"
                            isActive={activeSection === "bankCards"}
                            onClick={() => setActiveSection("bankCards")}
                        />
                        <SidebarItem
                            icon={<User className="w-4 h-4" />}
                            label="Friends"
                            isActive={activeSection === "friends"}
                            onClick={() => setActiveSection("friends")}
                        />
                        <SidebarItem
                            icon={<Users className="w-4 h-4" />}
                            label="Groups"
                            isActive={activeSection === "groups"}
                            onClick={() => setActiveSection("groups")}
                        />
                    </div>

                    {/* Main Panel */}
                    <div className="flex-1 overflow-y-auto p-6">
                        {activeSection === "date" && (
                            <div className="space-y-2">
                                <h4 className="font-bold text-lg mb-4">Date Range</h4>
                                {["Today", "Yesterday", "This Week", "This Month", "Last Month", "This Quarter", "This Year", "All Time"].map(period => (
                                    <RadioOption
                                        key={period}
                                        label={period}
                                        selected={config.periodToken === period && config.customRange === null}
                                        onClick={() => setConfig({ ...config, periodToken: period, customRange: null })}
                                    />
                                ))}
                                {/* Custom Range Placeholder */}
                                <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-200 text-slate-500 text-sm text-center">
                                    Custom date range picker coming soon
                                </div>
                            </div>
                        )}

                        {activeSection === "categories" && (
                            <div className="space-y-2">
                                <h4 className="font-bold text-lg mb-4">Categories</h4>
                                <CheckboxOption
                                    label="All Categories"
                                    selected={config.categories.size === 0}
                                    onClick={() => setConfig({ ...config, categories: new Set() })}
                                />
                                <div className="h-px bg-slate-100 my-2" />
                                {categoryOptions.map(cat => (
                                    <CheckboxOption
                                        key={cat}
                                        label={cat}
                                        selected={config.categories.has(cat)}
                                        onClick={() => setConfig({ ...config, categories: toggleSetItem(config.categories, cat) })}
                                    />
                                ))}
                            </div>
                        )}

                        {activeSection === "merchant" && (
                            <div className="space-y-2">
                                <h4 className="font-bold text-lg mb-4">Merchants</h4>
                                <CheckboxOption
                                    label="All Merchants"
                                    selected={config.merchants.size === 0}
                                    onClick={() => setConfig({ ...config, merchants: new Set() })}
                                />
                                <div className="h-px bg-slate-100 my-2" />
                                {merchantOptions.map(m => (
                                    <CheckboxOption
                                        key={m}
                                        label={m}
                                        selected={config.merchants.has(m)}
                                        onClick={() => setConfig({ ...config, merchants: toggleSetItem(config.merchants, m) })}
                                    />
                                ))}
                            </div>
                        )}

                        {activeSection === "bankCards" && (
                            <div className="space-y-2">
                                <h4 className="font-bold text-lg mb-4">Banks & Cards</h4>
                                <CheckboxOption
                                    label="All Banks"
                                    selected={config.banks.size === 0}
                                    onClick={() => setConfig({ ...config, banks: new Set() })}
                                />
                                <div className="h-px bg-slate-100 my-2" />
                                {bankOptions.length > 0 ? bankOptions.map(b => (
                                    <CheckboxOption
                                        key={b}
                                        label={b}
                                        selected={config.banks.has(b)}
                                        onClick={() => setConfig({ ...config, banks: toggleSetItem(config.banks, b) })}
                                    />
                                )) : (
                                    <p className="text-slate-500 text-sm py-4">No bank information found in transactions.</p>
                                )}
                            </div>
                        )}

                        {activeSection === "friends" && (
                            <div className="space-y-2">
                                <h4 className="font-bold text-lg mb-4">Friends</h4>
                                {friends.map(f => (
                                    <CheckboxOption
                                        key={f.phone}
                                        label={f.name || f.phone}
                                        subLabel={f.name ? f.phone : undefined}
                                        selected={config.friendPhones.has(f.phone)}
                                        onClick={() => setConfig({ ...config, friendPhones: toggleSetItem(config.friendPhones, f.phone) })}
                                    />
                                ))}
                            </div>
                        )}

                        {activeSection === "groups" && (
                            <div className="space-y-2">
                                <h4 className="font-bold text-lg mb-4">Groups</h4>
                                {groups.map(g => (
                                    <CheckboxOption
                                        key={g.id}
                                        label={g.name}
                                        selected={config.groupIds.has(g.id)}
                                        onClick={() => setConfig({ ...config, groupIds: toggleSetItem(config.groupIds, g.id) })}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
                    <button
                        onClick={handleReset}
                        className="px-4 py-2 text-slate-600 font-medium hover:text-slate-900 transition-colors"
                    >
                        Reset Filters
                    </button>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-6 py-2 bg-white border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleApply}
                            className="px-6 py-2 bg-slate-900 text-white font-semibold rounded-xl hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/20"
                        >
                            Apply Filters
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}

function SidebarItem({ icon, label, isActive, onClick }: { icon: any, label: string, isActive: boolean, onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors relative ${isActive ? "text-teal-700 bg-teal-50" : "text-slate-600 hover:bg-slate-100"
                }`}
        >
            {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-teal-600" />}
            <span className={isActive ? "text-teal-600" : "text-slate-400"}>{icon}</span>
            {label}
        </button>
    );
}

function RadioOption({ label, selected, onClick }: { label: string, selected: boolean, onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${selected ? "border-teal-500 bg-teal-50 text-teal-800" : "border-slate-200 hover:border-slate-300 text-slate-700"
                }`}
        >
            <span className="font-medium">{label}</span>
            {selected && <Check className="w-5 h-5 text-teal-600" />}
        </button>
    );
}

function CheckboxOption({ label, subLabel, selected, onClick }: { label: string, subLabel?: string, selected: boolean, onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="w-full flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg transition-colors group"
        >
            <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${selected ? "bg-teal-600 border-teal-600" : "border-slate-300 group-hover:border-teal-400"
                }`}>
                {selected && <Check className="w-3.5 h-3.5 text-white" />}
            </div>
            <div className="text-left">
                <div className={`font-medium ${selected ? "text-teal-900" : "text-slate-700"}`}>{label}</div>
                {subLabel && <div className="text-xs text-slate-500">{subLabel}</div>}
            </div>
        </button>
    );
}
