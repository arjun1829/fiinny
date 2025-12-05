import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, User } from "lucide-react";
import { ExpenseItem, FriendModel } from "@/lib/firestore";

interface SplitExpenseModalProps {
    isOpen: boolean;
    onClose: () => void;
    expense: ExpenseItem | null;
    friends: FriendModel[];
    onSave: (expenseId: string, friendIds: string[]) => void;
}

export default function SplitExpenseModal({ isOpen, onClose, expense, friends, onSave }: SplitExpenseModalProps) {
    const [selectedFriendIds, setSelectedFriendIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (isOpen && expense) {
            setSelectedFriendIds(new Set(expense.friendIds || []));
        } else {
            setSelectedFriendIds(new Set());
        }
    }, [isOpen, expense]);

    const toggleFriend = (phone: string) => {
        const newSet = new Set(selectedFriendIds);
        if (newSet.has(phone)) newSet.delete(phone);
        else newSet.add(phone);
        setSelectedFriendIds(newSet);
    };

    const handleSave = () => {
        if (expense) {
            onSave(expense.id, Array.from(selectedFriendIds));
        }
        onClose();
    };

    if (!isOpen || !expense) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-xl max-h-[90vh] flex flex-col"
            >
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h3 className="text-lg font-bold text-slate-900">Split Expense</h3>
                        <p className="text-sm text-slate-500 truncate max-w-[200px]">
                            {expense.note || expense.category || "Untitled"}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <X className="w-5 h-5 text-slate-500" />
                    </button>
                </div>

                <div className="p-4 overflow-y-auto flex-1">
                    <div className="space-y-2">
                        {friends.map(friend => {
                            const isSelected = selectedFriendIds.has(friend.phone);
                            return (
                                <button
                                    key={friend.phone}
                                    onClick={() => toggleFriend(friend.phone)}
                                    className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all border ${isSelected ? "bg-teal-50 border-teal-200 shadow-sm" : "bg-white border-slate-100 hover:bg-slate-50"}`}
                                >
                                    <div className={`w-6 h-6 rounded-full border flex items-center justify-center transition-colors ${isSelected ? "bg-teal-600 border-teal-600" : "border-slate-300 bg-white"}`}>
                                        {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                                    </div>

                                    <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                                        {friend.avatar && friend.avatar !== "👤" ? (
                                            <img src={friend.avatar} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <span className="text-lg">{friend.name[0]}</span>
                                        )}
                                    </div>

                                    <div className="text-left">
                                        <p className={`font-medium ${isSelected ? "text-teal-900" : "text-slate-700"}`}>{friend.name}</p>
                                        <p className="text-xs text-slate-500">{friend.phone}</p>
                                    </div>
                                </button>
                            );
                        })}
                        {friends.length === 0 && (
                            <div className="text-center py-8 text-slate-500">
                                <User className="w-12 h-12 mx-auto mb-2 opacity-20" />
                                <p>No friends found.</p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 text-slate-600 font-semibold hover:bg-slate-200 rounded-xl transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-5 py-2.5 bg-teal-600 text-white font-semibold rounded-xl hover:bg-teal-700 transition-colors shadow-lg shadow-teal-600/20"
                    >
                        Save Split
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
