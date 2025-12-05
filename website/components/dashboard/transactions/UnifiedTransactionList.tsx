"use client";

import { ExpenseItem, IncomeItem } from "@/lib/firestore";
import { format, isSameDay, isSameMonth, isSameWeek, startOfDay, startOfMonth, startOfWeek } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import {
    ArrowDownLeft,
    ArrowUpRight,
    Check,
    Search,
    Tag,
    Trash2,
    Calendar,
    CreditCard,
    ShoppingBag,
    Edit2
} from "lucide-react";
import TransactionCard from "@/components/widgets/TransactionCard";

interface UnifiedTransactionListProps {
    transactions: (ExpenseItem | IncomeItem)[];
    selectedIds: Set<string>;
    onToggleSelect: (id: string) => void;
    onDelete: (id: string, type: "expense" | "income") => void;
    onEdit: (tx: ExpenseItem | IncomeItem) => void;
    onSplit?: (tx: ExpenseItem | IncomeItem) => void;
    onViewDetails?: (tx: ExpenseItem | IncomeItem) => void;
    groupBy: "none" | "day" | "week" | "month" | "category";
}

export default function UnifiedTransactionList({
    transactions,
    selectedIds,
    onToggleSelect,
    onDelete,
    onEdit,
    onSplit,
    onViewDetails,
    groupBy
}: UnifiedTransactionListProps) {

    const getIcon = (tx: ExpenseItem | IncomeItem) => {
        if ('type' in tx && (tx as IncomeItem).type === 'Income') {
            return <ArrowDownLeft className="w-5 h-5 text-green-600" />;
        }
        return <ArrowUpRight className="w-5 h-5 text-red-600" />;
    };

    const isIncome = (tx: ExpenseItem | IncomeItem) => {
        return 'type' in tx && (tx as IncomeItem).type === 'Income';
    };

    // Grouping Logic
    const groupedTransactions = () => {
        if (groupBy === "none") return { "All Transactions": transactions };

        const groups: Record<string, (ExpenseItem | IncomeItem)[]> = {};

        transactions.forEach(tx => {
            let key = "";
            const date = tx.date;

            switch (groupBy) {
                case "day":
                    key = format(date, "EEEE, MMM d, yyyy");
                    break;
                case "week":
                    key = `Week of ${format(startOfWeek(date), "MMM d")}`;
                    break;
                case "month":
                    key = format(date, "MMMM yyyy");
                    break;
                case "category":
                    key = tx.category || "Uncategorized";
                    break;
            }

            if (!groups[key]) groups[key] = [];
            groups[key].push(tx);
        });

        return groups;
    };

    const groups = groupedTransactions();

    // Render a single transaction row
    const TransactionRow = ({ tx }: { tx: ExpenseItem | IncomeItem }) => {
        const isSelected = selectedIds.has(tx.id);

        return (
            <TransactionCard
                tx={tx}
                isSelected={isSelected}
                onToggleSelect={onToggleSelect}
                onDelete={onDelete}
                onEdit={onEdit}
                onSplit={onSplit}
                onViewDetails={onViewDetails}
            />
        );
    };

    return (
        <div className="space-y-6">
            <AnimatePresence>
                {Object.entries(groups).map(([groupTitle, groupTxs]) => (
                    <motion.div
                        key={groupTitle}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden"
                    >
                        {/* Group Header */}
                        {groupBy !== "none" && (
                            <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex flex-col md:flex-row md:justify-between md:items-center gap-2">
                                <h3 className="font-semibold text-slate-700 text-sm">{groupTitle}</h3>
                                <div className="flex items-center gap-3 text-xs font-medium">
                                    <span className="text-slate-500">
                                        {groupTxs.length} txns
                                    </span>
                                    {(() => {
                                        const inc = groupTxs.filter(t => t.type === 'Income' || t.type === 'Email Credit' || (t.type && t.type.toLowerCase().includes('credit')));
                                        const exp = groupTxs.filter(t => !(t.type === 'Income' || t.type === 'Email Credit' || (t.type && t.type.toLowerCase().includes('credit'))));
                                        const incSum = inc.reduce((sum, t) => sum + t.amount, 0);
                                        const expSum = exp.reduce((sum, t) => sum + t.amount, 0);
                                        return (
                                            <>
                                                {inc.length > 0 && <span className="text-green-600">+{inc.length} (₹{incSum.toLocaleString('en-IN')})</span>}
                                                {exp.length > 0 && <span className="text-red-600">-{exp.length} (₹{expSum.toLocaleString('en-IN')})</span>}
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>
                        )}

                        {/* Transactions List */}
                        <div className="divide-y divide-slate-100">
                            {groupTxs.map(tx => (
                                <TransactionRow key={tx.id} tx={tx} />
                            ))}
                        </div>
                    </motion.div>
                ))}
            </AnimatePresence>

            {transactions.length === 0 && (
                <div className="p-12 text-center text-slate-500 bg-white rounded-2xl border border-slate-200 border-dashed">
                    <div className="flex flex-col items-center justify-center">
                        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                            <Search className="w-8 h-8 text-slate-400" />
                        </div>
                        <p className="text-lg font-medium text-slate-900">No transactions found</p>
                        <p className="text-sm">Try adjusting your filters or search terms.</p>
                    </div>
                </div>
            )}
        </div>
    );
}
