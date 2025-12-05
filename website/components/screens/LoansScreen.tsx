"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, HandCoins, Calendar, Trash2, User, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { LoanModel, LoanType } from "@/lib/models/LoanModel";
import { format } from "date-fns";
import PrimaryButton from "@/components/widgets/PrimaryButton";
import CustomTextField from "@/components/widgets/CustomTextField";
import { deleteLoan, addLoan } from "@/lib/firestore";
import { useAuth } from "@/components/AuthProvider";

interface LoansScreenProps {
    loans: LoanModel[];
    loading: boolean;
}

export default function LoansScreen({ loans, loading }: LoansScreenProps) {
    const { user } = useAuth();
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [newLoan, setNewLoan] = useState<Partial<LoanModel>>({
        title: "",
        totalAmount: 0,
        paidAmount: 0,
        dueDate: new Date(),
        type: "given",
        personName: ""
    });

    const handleAddLoan = async () => {
        const userId = user?.phoneNumber || user?.uid;
        if (!userId || !newLoan.title || !newLoan.totalAmount) return;

        try {
            const loan: LoanModel = {
                id: Date.now().toString(),
                title: newLoan.title,
                totalAmount: Number(newLoan.totalAmount),
                paidAmount: Number(newLoan.paidAmount || 0),
                dueDate: new Date(newLoan.dueDate || Date.now()),
                type: newLoan.type as LoanType || "given",
                personName: newLoan.personName || "Unknown",
                interestRate: 0,
                createdAt: new Date()
            };

            await addLoan(userId, loan);
            setIsAddModalOpen(false);
            setNewLoan({
                title: "",
                totalAmount: 0,
                paidAmount: 0,
                dueDate: new Date(),
                type: "given",
                personName: ""
            });
        } catch (error) {
            console.error("Error adding loan:", error);
            alert("Failed to add loan");
        }
    };

    const handleDelete = async (id: string) => {
        const userId = user?.phoneNumber || user?.uid;
        if (!userId || !confirm("Delete this loan?")) return;
        try {
            await deleteLoan(userId, id);
        } catch (error) {
            console.error("Error deleting loan:", error);
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Loans & Debts</h1>
                    <p className="text-slate-500 mt-1">Manage money you owe or are owed</p>
                </div>
                <PrimaryButton
                    onClick={() => setIsAddModalOpen(true)}
                    icon={<Plus className="w-5 h-5" />}
                >
                    New Loan
                </PrimaryButton>
            </div>

            {/* Loans Grid */}
            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-48 bg-slate-100 rounded-3xl animate-pulse" />
                    ))}
                </div>
            ) : loans.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-200">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <HandCoins className="w-8 h-8 text-slate-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900">No loans yet</h3>
                    <p className="text-slate-500 max-w-sm mx-auto mt-2">
                        Keep track of borrowed and lent money easily.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {loans.map((loan) => {
                        const isGiven = loan.type === "given";
                        const remaining = (loan.totalAmount || loan.amount || 0) - (loan.paidAmount || 0);
                        const isSettled = remaining <= 0;

                        return (
                            <motion.div
                                key={loan.id}
                                layout
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 relative overflow-hidden group"
                            >
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isGiven ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"}`}>
                                            {isGiven ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownLeft className="w-5 h-5" />}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-slate-900">{loan.title}</h3>
                                            <div className="flex items-center gap-1 text-xs text-slate-500">
                                                <User className="w-3 h-3" />
                                                <span>{loan.personName}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleDelete(loan.id)}
                                        className="text-slate-300 hover:text-red-500 transition-colors p-1"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex justify-between items-center py-3 border-b border-slate-50">
                                        <div>
                                            <p className="text-xs text-slate-400">Total Amount</p>
                                            <p className="font-bold text-slate-900 text-lg">₹{(loan.totalAmount || loan.amount || 0).toLocaleString()}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs text-slate-400">Remaining</p>
                                            <p className={`font-bold text-lg ${isSettled ? "text-slate-400 line-through" : isGiven ? "text-emerald-600" : "text-rose-600"}`}>
                                                ₹{remaining.toLocaleString()}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between text-xs text-slate-400">
                                        <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg">
                                            <Calendar className="w-3 h-3" />
                                            <span>Due: {loan.dueDate ? format(loan.dueDate, "MMM d, yyyy") : "No due date"}</span>
                                        </div>
                                        <span className={`px-2 py-1 rounded-full font-medium ${isGiven ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
                                            {isGiven ? "You Lent" : "You Borrowed"}
                                        </span>
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            )}

            {/* Add Loan Modal */}
            <AnimatePresence>
                {isAddModalOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsAddModalOpen(false)}
                            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="fixed inset-0 m-auto max-w-md h-fit bg-white rounded-3xl shadow-2xl z-50 p-6 overflow-hidden"
                        >
                            <h2 className="text-xl font-bold text-slate-900 mb-6">New Loan Record</h2>
                            <div className="space-y-4">
                                <div className="flex gap-2 p-1 bg-slate-100 rounded-xl mb-4">
                                    <button
                                        onClick={() => setNewLoan({ ...newLoan, type: "given" })}
                                        className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${newLoan.type === "given" ? "bg-white shadow text-emerald-600" : "text-slate-500"}`}
                                    >
                                        I Lent Money
                                    </button>
                                    <button
                                        onClick={() => setNewLoan({ ...newLoan, type: "taken" })}
                                        className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${newLoan.type === "taken" ? "bg-white shadow text-rose-600" : "text-slate-500"}`}
                                    >
                                        I Borrowed Money
                                    </button>
                                </div>

                                <CustomTextField
                                    label="Title / Reason"
                                    value={newLoan.title || ""}
                                    onChange={(e) => setNewLoan({ ...newLoan, title: e.target.value })}
                                    placeholder="e.g. Dinner Bill Split"
                                />
                                <CustomTextField
                                    label="Person Name"
                                    value={newLoan.personName || ""}
                                    onChange={(e) => setNewLoan({ ...newLoan, personName: e.target.value })}
                                    placeholder="e.g. John Doe"
                                />
                                <div className="grid grid-cols-2 gap-4">
                                    <CustomTextField
                                        label="Total Amount"
                                        type="number"
                                        value={newLoan.totalAmount?.toString() || ""}
                                        onChange={(e) => setNewLoan({ ...newLoan, totalAmount: Number(e.target.value) })}
                                        placeholder="0"
                                    />
                                    <CustomTextField
                                        label="Paid Back"
                                        type="number"
                                        value={newLoan.paidAmount?.toString() || ""}
                                        onChange={(e) => setNewLoan({ ...newLoan, paidAmount: Number(e.target.value) })}
                                        placeholder="0"
                                    />
                                </div>
                                <CustomTextField
                                    label="Due Date"
                                    type="date"
                                    value={newLoan.dueDate ? format(newLoan.dueDate, "yyyy-MM-dd") : ""}
                                    onChange={(e) => setNewLoan({ ...newLoan, dueDate: new Date(e.target.value) })}
                                />
                                <div className="pt-4 flex gap-3">
                                    <button
                                        onClick={() => setIsAddModalOpen(false)}
                                        className="flex-1 py-3 text-slate-600 font-medium hover:bg-slate-50 rounded-xl transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <div className="flex-1">
                                        <PrimaryButton onClick={handleAddLoan} className="w-full">
                                            Save Record
                                        </PrimaryButton>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
