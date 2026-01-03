import { ExpenseItem, IncomeItem } from "@/lib/firestore";
import { format } from "date-fns";
import { motion } from "framer-motion";
import {
    ArrowDownLeft,
    ArrowUpRight,
    Check,
    Tag,
    Trash2,
    Edit2
} from "lucide-react";

interface TransactionCardProps {
    tx: ExpenseItem | IncomeItem;
    isSelected: boolean;
    onToggleSelect: (id: string) => void;
    onDelete: (id: string, type: "expense" | "income") => void;
    onEdit: (tx: ExpenseItem | IncomeItem) => void;
    onSplit?: (tx: ExpenseItem | IncomeItem) => void;
}

export default function TransactionCard({
    tx,
    isSelected,
    onToggleSelect,
    onDelete,
    onEdit,
    onSplit,
    onViewDetails
}: TransactionCardProps & { onViewDetails?: (tx: ExpenseItem | IncomeItem) => void }) {
    // Standardized check: use tagged 'kind' property
    const isIncome = (tx as any).kind === 'income';

    const getIcon = () => {
        if (isIncome) {
            return <ArrowDownLeft className="w-5 h-5 text-green-600" />;
        }
        return <ArrowUpRight className="w-5 h-5 text-red-600" />;
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`group flex items-center gap-3 md:gap-4 p-3 md:p-4 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0 cursor-pointer max-w-full ${isSelected ? "bg-teal-50/50" : ""
                }`}
            onClick={() => onViewDetails?.(tx)}
        >
            {/* Checkbox */}
            <div
                className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${isSelected
                    ? "bg-teal-600 border-teal-600 text-white"
                    : "border-slate-300 group-hover:border-teal-400"
                    }`}
                onClick={(e) => {
                    e.stopPropagation();
                    onToggleSelect(tx.id);
                }}
            >
                {isSelected && <Check className="w-3.5 h-3.5" />}
            </div>

            {/* Icon */}
            <div className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center ${isIncome ? "bg-green-100" : "bg-red-100"
                }`}>
                {getIcon()}
            </div>

            {/* Details */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-900 truncate pr-2">
                        {tx.title || tx.note || (isIncome ? "Income" : "Expense")}
                    </h3>
                    <span className={`font-bold whitespace-nowrap ${isIncome ? "text-green-600" : "text-slate-900"
                        }`}>
                        {isIncome ? "+" : "-"}₹{tx.amount.toLocaleString('en-IN')}
                    </span>
                </div>

                <div className="flex items-center justify-between mt-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        {/* Category Badge with Icon */}
                        {tx.category && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-teal-100 text-teal-700 rounded-full text-xs font-medium">
                                <span>{(() => {
                                    const cat = tx.category.toLowerCase();
                                    if (cat.includes('food')) return '🍔';
                                    if (cat.includes('travel')) return '✈️';
                                    if (cat.includes('shopping')) return '🛍️';
                                    if (cat.includes('health')) return '🏥';
                                    if (cat.includes('entertainment')) return '🎬';
                                    if (cat.includes('education')) return '📚';
                                    if (cat.includes('investment')) return '📈';
                                    return '💰';
                                })()}</span>
                                <span>{tx.category}</span>
                            </span>
                        )}

                        {/* Subcategory Badge */}
                        {(() => {
                            const subcategory = (tx as any).subcategory || tx.brainMeta?.subcategory;
                            if (subcategory) {
                                return (
                                    <span className="inline-flex items-center px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full text-xs font-medium">
                                        {subcategory}
                                    </span>
                                );
                            }
                            return null;
                        })()}

                        {/* Time */}
                        <span className="text-xs text-slate-500">
                            {format(tx.date, "h:mm a")}
                        </span>

                        {/* Counterparty */}
                        {tx.counterparty && (
                            <>
                                <span className="text-xs text-slate-400">•</span>
                                <span className="text-xs text-slate-500">{tx.counterparty}</span>
                            </>
                        )}
                    </div>

                    {/* Actions (Always visible for better UX) */}
                    <div className="flex items-center gap-1">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onEdit(tx);
                            }}
                            className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-full transition-colors"
                            title="Edit"
                        >
                            <Edit2 className="w-4 h-4" />
                        </button>
                        {/* Split Button (only for expenses) */}
                        {!isIncome && onSplit && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onSplit(tx);
                                }}
                                className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-full transition-colors"
                                title="Split Transaction"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-split"><path d="M16 3h5v5" /><path d="M8 3H3v5" /><path d="M12 22v-8.3a4 4 0 0 0-1.172-2.87l-4.243-4.243a2 2 0 0 1-.585-1.414V3" /><path d="m20 21-9-9" /><path d="M9 9 3 3" /></svg>
                            </button>
                        )}

                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete(tx.id, isIncome ? "income" : "expense");
                            }}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                            title="Delete"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
