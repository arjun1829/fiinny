import { Dialog } from "@headlessui/react";
import { X, Calendar, User, Receipt, DollarSign, Trash2, Edit2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ExpenseItem, FriendModel } from "@/lib/firestore";
import { format } from "date-fns";

interface ExpenseDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    expense: ExpenseItem | null;
    currentUserId: string;
    friends: FriendModel[]; // To resolve names
    onDelete: (id: string) => void;
    onEdit: (expense: ExpenseItem) => void;
}

export default function ExpenseDetailsModal({
    isOpen,
    onClose,
    expense,
    currentUserId,
    friends,
    onDelete,
    onEdit
}: ExpenseDetailsModalProps) {
    if (!expense) return null;

    const getFriendName = (id: string) => {
        if (id === currentUserId) return "You";
        const friend = friends.find(f => f.phone === id);
        return friend ? friend.name : id;
    };

    const isPayer = expense.payerId === currentUserId;

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
                    >
                        {/* Header */}
                        <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50/50">
                            <div>
                                <h3 className="text-xl font-bold text-slate-900">{expense.title || expense.label}</h3>
                                <div className="flex items-center text-slate-500 text-sm mt-1">
                                    <Calendar className="w-4 h-4 mr-1" />
                                    {expense.date ? format(new Date(expense.date), "PPP") : "No date"}
                                </div>
                            </div>
                            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                                <X className="w-5 h-5 text-slate-500" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-6 space-y-6 overflow-y-auto">
                            {/* Amount & Payer */}
                            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                                <div className="flex items-center space-x-3">
                                    <div className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center text-teal-600">
                                        <Receipt className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold text-slate-500 uppercase">Total Amount</div>
                                        <div className="text-xl font-bold text-slate-900">₹{expense.amount.toFixed(2)}</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-xs font-bold text-slate-500 uppercase">Paid By</div>
                                    <div className="font-medium text-slate-900">{getFriendName(expense.payerId)}</div>
                                </div>
                            </div>

                            {/* Split Details */}
                            <div>
                                <h4 className="text-sm font-bold text-slate-900 mb-3 flex items-center">
                                    <User className="w-4 h-4 mr-2 text-slate-500" />
                                    Split Details
                                </h4>
                                <div className="space-y-3">
                                    {/* Payer's share (if involved) */}
                                    {/* Logic depends on how we store splits. Assuming customSplits or equal split */}
                                    {expense.customSplits ? (
                                        Object.entries(expense.customSplits).map(([id, amount]) => (
                                            <div key={id} className="flex justify-between items-center text-sm">
                                                <span className="text-slate-600">{getFriendName(id)}</span>
                                                <span className="font-bold text-slate-900">₹{amount.toFixed(2)}</span>
                                            </div>
                                        ))
                                    ) : (
                                        // Fallback for equal split if customSplits is missing (legacy)
                                        [expense.payerId, ...expense.friendIds].map((id) => (
                                            <div key={id} className="flex justify-between items-center text-sm">
                                                <span className="text-slate-600">{getFriendName(id)}</span>
                                                <span className="font-bold text-slate-900">
                                                    ₹{(expense.amount / (expense.friendIds.length + 1)).toFixed(2)}
                                                </span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Footer Actions */}
                        <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex gap-3">
                            <button
                                onClick={() => {
                                    if (confirm("Delete this expense?")) {
                                        onDelete(expense.id);
                                        onClose();
                                    }
                                }}
                                className="flex-1 py-3 rounded-xl font-bold text-red-600 bg-red-50 hover:bg-red-100 transition-colors flex items-center justify-center gap-2"
                            >
                                <Trash2 className="w-4 h-4" />
                                Delete
                            </button>
                            <button
                                onClick={() => {
                                    onEdit(expense);
                                    onClose();
                                }}
                                className="flex-1 py-3 rounded-xl font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
                            >
                                <Edit2 className="w-4 h-4" />
                                Edit
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
