import { useState, useEffect } from "react";
import { Dialog } from "@headlessui/react";
import { X, Check, DollarSign, Users, Calendar } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import PrimaryButton from "../widgets/PrimaryButton";
import CustomTextField from "../widgets/CustomTextField";
import { FriendModel, ExpenseItem } from "@/lib/firestore";
import { useAuth } from "../AuthProvider";

interface AddExpenseModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (expense: Partial<ExpenseItem>) => Promise<void>;
    friends: FriendModel[]; // Participants (excluding current user)
    currentUser: { uid: string; displayName?: string; photoURL?: string; phoneNumber?: string };
    defaultGroupId?: string;
}

export default function AddExpenseModal({
    isOpen,
    onClose,
    onSubmit,
    friends,
    currentUser,
    defaultGroupId
}: AddExpenseModalProps) {
    const [title, setTitle] = useState("");
    const [amount, setAmount] = useState("");
    const [payerId, setPayerId] = useState(currentUser.phoneNumber || currentUser.uid);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // For now, simple split: Split equally among all selected
    const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>(friends.map(f => f.phone));

    // Reset form when opening
    useEffect(() => {
        if (isOpen) {
            setTitle("");
            setAmount("");
            setPayerId(currentUser.phoneNumber || currentUser.uid);
            setSelectedFriendIds(friends.map(f => f.phone));
        }
    }, [isOpen, friends, currentUser]);

    const handleSubmit = async () => {
        if (!title || !amount) return;
        setIsSubmitting(true);
        try {
            const numAmount = parseFloat(amount);
            const allParticipantIds = [currentUser.phoneNumber || currentUser.uid, ...selectedFriendIds];

            // Simple equal split logic
            const splitAmount = numAmount / allParticipantIds.length;
            const customSplits: Record<string, number> = {};
            allParticipantIds.forEach(id => {
                customSplits[id] = splitAmount;
            });

            const newExpense: Partial<ExpenseItem> = {
                title, // mapped to label/note
                label: title,
                amount: numAmount,
                date: new Date(),
                payerId,
                friendIds: selectedFriendIds,
                groupId: defaultGroupId,
                customSplits,
                settledFriendIds: [],
                isBill: false,
                labels: [],
                attachments: []
            };

            await onSubmit(newExpense);
            onClose();
        } catch (error) {
            console.error("Error adding expense:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const toggleFriendSelection = (phone: string) => {
        if (selectedFriendIds.includes(phone)) {
            setSelectedFriendIds(selectedFriendIds.filter(id => id !== phone));
        } else {
            setSelectedFriendIds([...selectedFriendIds, phone]);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
                    >
                        {/* Header */}
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <h3 className="text-xl font-bold text-slate-900">Add Expense</h3>
                            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                                <X className="w-5 h-5 text-slate-500" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-6 space-y-6 overflow-y-auto">
                            {/* Amount & Title */}
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Amount</label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-lg">₹</span>
                                        <input
                                            type="number"
                                            value={amount}
                                            onChange={(e) => setAmount(e.target.value)}
                                            placeholder="0.00"
                                            className="w-full pl-10 pr-4 py-3 bg-slate-50 border-none rounded-xl text-2xl font-bold text-slate-900 focus:ring-2 focus:ring-teal-500 placeholder:text-slate-300"
                                            autoFocus
                                        />
                                    </div>
                                </div>
                                <CustomTextField
                                    label="Description"
                                    placeholder="What was this for?"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                />
                            </div>

                            {/* Payer Selection */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Paid By</label>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        onClick={() => setPayerId(currentUser.phoneNumber || currentUser.uid)}
                                        className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${payerId === (currentUser.phoneNumber || currentUser.uid) ? "bg-teal-100 text-teal-700 ring-2 ring-teal-500" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                                    >
                                        You
                                    </button>
                                    {friends.map(friend => (
                                        <button
                                            key={friend.phone}
                                            onClick={() => setPayerId(friend.phone)}
                                            className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${payerId === friend.phone ? "bg-teal-100 text-teal-700 ring-2 ring-teal-500" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                                        >
                                            {friend.name}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Split Selection (For Groups) */}
                            {friends.length > 1 && (
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Split With</label>
                                    <div className="border border-slate-200 rounded-xl overflow-hidden max-h-40 overflow-y-auto">
                                        {friends.map(friend => (
                                            <div
                                                key={friend.phone}
                                                onClick={() => toggleFriendSelection(friend.phone)}
                                                className={`p-3 flex items-center justify-between cursor-pointer transition-colors ${selectedFriendIds.includes(friend.phone) ? "bg-teal-50" : "hover:bg-slate-50"}`}
                                            >
                                                <div className="flex items-center space-x-3">
                                                    <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center text-xs font-bold">
                                                        {friend.name[0]}
                                                    </div>
                                                    <span className="font-medium text-slate-900">{friend.name}</span>
                                                </div>
                                                {selectedFriendIds.includes(friend.phone) && <Check className="w-4 h-4 text-teal-600" />}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex gap-3">
                            <button
                                onClick={onClose}
                                className="flex-1 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                            >
                                Cancel
                            </button>
                            <PrimaryButton
                                onClick={handleSubmit}
                                loading={isSubmitting}
                                disabled={!title || !amount}
                                className="flex-1"
                            >
                                Save Expense
                            </PrimaryButton>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
