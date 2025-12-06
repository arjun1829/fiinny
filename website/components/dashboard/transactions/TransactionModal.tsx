
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, Save } from "lucide-react";
import { FriendModel, GroupModel } from "@/lib/firestore";

const kExpenseCategories = [
    'General', 'Food', 'Groceries', 'Travel', 'Shopping', 'Bills', 'Entertainment',
    'Health', 'Fuel', 'Subscriptions', 'Education', 'Recharge', 'Loan EMI',
    'Fees/Charges', 'Rent', 'Utilities', 'Other'
];

const kIncomeCategories = [
    'General', 'Salary', 'Freelance', 'Gift', 'Investment', 'Other'
];

interface TransactionModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialData: any;
    onSave: (data: any) => Promise<void>;
    friends?: FriendModel[];
    groups?: GroupModel[];
}

export default function TransactionModal({ isOpen, onClose, initialData, onSave, friends = [], groups = [] }: TransactionModalProps) {
    const isIncome = initialData && 'source' in initialData; // Better check

    const [formData, setFormData] = useState({
        type: isIncome ? "income" : "expense",
        amount: initialData?.amount || "",
        note: initialData?.note || "",
        category: initialData?.category || "",
        date: initialData?.date ? new Date(initialData.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        friendIds: new Set(initialData?.friendIds || []),
    });

    // Reset form when initialData changes
    useEffect(() => {
        const isInc = initialData && ('source' in initialData || initialData.type === 'Income');
        setFormData({
            type: isInc ? "income" : "expense",
            amount: initialData?.amount || "",
            note: initialData?.note || "",
            category: initialData?.category || "",
            date: initialData?.date ? new Date(initialData.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
            friendIds: new Set(initialData?.friendIds || []),
        });
    }, [initialData]);

    const toggleFriend = (phone: string) => {
        const newSet = new Set(formData.friendIds);
        if (newSet.has(phone)) newSet.delete(phone);
        else newSet.add(phone);
        setFormData({ ...formData, friendIds: newSet });
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-xl max-h-[90vh] flex flex-col"
            >
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center flex-shrink-0">
                    <h3 className="text-lg font-bold text-slate-900">
                        {initialData ? "Edit Transaction" : "New Transaction"}
                    </h3>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <X className="w-5 h-5 text-slate-500" />
                    </button>
                </div>

                <div className="p-6 space-y-4 overflow-y-auto flex-1">
                    {/* Type Toggle */}
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                        <button
                            onClick={() => setFormData({ ...formData, type: "expense" })}
                            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${formData.type === "expense" ? "bg-white shadow text-red-600" : "text-slate-500 hover:text-slate-700"}`}
                        >
                            Expense
                        </button>
                        <button
                            onClick={() => setFormData({ ...formData, type: "income" })}
                            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${formData.type === "income" ? "bg-white shadow text-green-600" : "text-slate-500 hover:text-slate-700"}`}
                        >
                            Income
                        </button>
                    </div>

                    {/* Amount */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Amount</label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                            <input
                                type="number"
                                value={formData.amount}
                                onChange={e => setFormData({ ...formData, amount: e.target.value })}
                                className="w-full pl-8 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 font-bold text-lg"
                                placeholder="0.00"
                                autoFocus
                            />
                        </div>
                    </div>

                    {/* Note */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Note / Title</label>
                        <input
                            type="text"
                            value={formData.note}
                            onChange={e => setFormData({ ...formData, note: e.target.value })}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                            placeholder="What was this for?"
                        />
                    </div>

                    {/* Category */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                        <select
                            value={formData.category}
                            onChange={e => setFormData({ ...formData, category: e.target.value })}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 appearance-none"
                        >
                            <option value="">Select Category</option>
                            {(formData.type === "expense" ? kExpenseCategories : kIncomeCategories).map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                    </div>

                    {/* Date */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                        <input
                            type="date"
                            value={formData.date}
                            onChange={e => setFormData({ ...formData, date: e.target.value })}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                        />
                    </div>

                    {/* Split Section (Only for Expenses) */}
                    {formData.type === "expense" && friends.length > 0 && (
                        <div className="pt-4 border-t border-slate-100">
                            <label className="block text-sm font-medium text-slate-700 mb-2">Split with Friends</label>
                            <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                                {friends.map((friend: FriendModel) => (
                                    <button
                                        key={friend.phone}
                                        onClick={() => toggleFriend(friend.phone)}
                                        className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors ${formData.friendIds.has(friend.phone) ? "bg-teal-50 border border-teal-200" : "hover:bg-slate-50 border border-transparent"}`}
                                    >
                                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${formData.friendIds.has(friend.phone) ? "bg-teal-600 border-teal-600" : "border-slate-300"}`}>
                                            {formData.friendIds.has(friend.phone) && <Check className="w-3.5 h-3.5 text-white" />}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs">
                                                {friend.avatar && friend.avatar !== "👤" ? (
                                                    <img src={friend.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                                                ) : (
                                                    friend.name[0]
                                                )}
                                            </div>
                                            <span className={`text-sm ${formData.friendIds.has(friend.phone) ? "text-teal-900 font-medium" : "text-slate-600"}`}>
                                                {friend.name}
                                            </span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 flex-shrink-0">
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 text-slate-600 font-semibold hover:bg-slate-200 rounded-xl transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onSave({ ...formData, friendIds: Array.from(formData.friendIds) })}
                        className="px-5 py-2.5 bg-teal-600 text-white font-semibold rounded-xl hover:bg-teal-700 transition-colors flex items-center gap-2"
                    >
                        <Save className="w-4 h-4" />
                        Save Transaction
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
