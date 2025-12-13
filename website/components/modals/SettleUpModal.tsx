import { useState, useEffect } from "react";
import { Dialog } from "@headlessui/react";
import { X, ArrowRight, DollarSign } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import PrimaryButton from "../widgets/PrimaryButton";
import { FriendModel, ExpenseItem } from "@/lib/firestore";

interface SettleUpModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (payment: Partial<ExpenseItem>) => Promise<void>;
    currentUser: { uid: string; displayName?: string; phoneNumber?: string };
    friend: FriendModel; // The other person in 1:1 context
    suggestedAmount?: number; // How much owed?
    userOwesFriend?: boolean; // Direction
}

export default function SettleUpModal({
    isOpen,
    onClose,
    onSubmit,
    currentUser,
    friend,
    suggestedAmount = 0,
    userOwesFriend = true
}: SettleUpModalProps) {
    const [amount, setAmount] = useState("");
    const [payerId, setPayerId] = useState("");
    const [receiverId, setReceiverId] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const currentId = currentUser.phoneNumber || currentUser.uid;

    useEffect(() => {
        if (isOpen) {
            setAmount(suggestedAmount > 0 ? suggestedAmount.toString() : "");
            // Default direction based on who owes
            if (userOwesFriend) {
                setPayerId(currentId);
                setReceiverId(friend.phone);
            } else {
                setPayerId(friend.phone);
                setReceiverId(currentId);
            }
        }
    }, [isOpen, suggestedAmount, userOwesFriend, currentId, friend.phone]);

    const handleSubmit = async () => {
        if (!amount || !payerId || !receiverId) return;
        setIsSubmitting(true);
        try {
            const numAmount = parseFloat(amount);

            const newPayment: Partial<ExpenseItem> = {
                title: "Settlement",
                label: "Settlement",
                category: "Settlement",
                amount: numAmount,
                date: new Date(),
                payerId,
                friendIds: [receiverId], // The receiver is the 'participant' in a settlement usually? 
                // In generic expense: payer paid, friendIds shared.
                // For settlement: Payer gives money to Receiver.
                // Receiver 'benefits' (gets money), Payer 'pays'.
                // If we treat it as 100% split to Receiver? 
                // Flutter logic: Settlement treated as transfer.
                // We'll trust the Flutter logic checks `friendIds` for "others".

                customSplits: {}, // No split usually, simpler to just say "User paid Friend"
                settledFriendIds: [],
                isBill: false, // In flutter can be true/false but typically false for P2P
            };

            await onSubmit(newPayment);
            onClose();
        } catch (error) {
            console.error("Error settling up:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const swapDirection = () => {
        setPayerId(receiverId);
        setReceiverId(payerId);
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col"
                    >
                        {/* Header */}
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <h3 className="text-xl font-bold text-slate-900">Settle Up</h3>
                            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                                <X className="w-5 h-5 text-slate-500" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-8 space-y-8">

                            {/* Visual Direction */}
                            <div className="flex items-center justify-between">
                                <div className="flex flex-col items-center gap-2 w-24">
                                    <div className="w-12 h-12 bg-slate-200 rounded-full flex items-center justify-center font-bold text-slate-600">
                                        {payerId === currentId ? "You" : friend.name[0]}
                                    </div>
                                    <span className="text-sm font-bold text-slate-900 text-center leading-tight">
                                        {payerId === currentId ? "You" : friend.name}
                                    </span>
                                    <span className="text-xs text-slate-500 font-bold uppercase">Payer</span>
                                </div>

                                <button
                                    onClick={swapDirection}
                                    className="p-3 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors"
                                >
                                    <ArrowRight className="w-5 h-5 text-slate-600" />
                                </button>

                                <div className="flex flex-col items-center gap-2 w-24">
                                    <div className="w-12 h-12 bg-slate-200 rounded-full flex items-center justify-center font-bold text-slate-600">
                                        {receiverId === currentId ? "You" : friend.name[0]}
                                    </div>
                                    <span className="text-sm font-bold text-slate-900 text-center leading-tight">
                                        {receiverId === currentId ? "You" : friend.name}
                                    </span>
                                    <span className="text-xs text-slate-500 font-bold uppercase">Recipient</span>
                                </div>
                            </div>

                            {/* Amount Input */}
                            <div className="text-center">
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Amount</label>
                                <div className="relative inline-block">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-2xl">₹</span>
                                    <input
                                        type="number"
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        placeholder="0.00"
                                        className="w-48 pl-10 pr-4 py-3 bg-slate-50 border-none rounded-xl text-3xl font-bold text-slate-900 focus:ring-2 focus:ring-teal-500 placeholder:text-slate-300 text-center"
                                        autoFocus
                                    />
                                </div>
                            </div>

                            <p className="text-center text-slate-500 text-sm">
                                recording a cash payment
                            </p>

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
                                disabled={!amount || !payerId || !receiverId}
                                className="flex-1"
                            >
                                Record Payment
                            </PrimaryButton>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
