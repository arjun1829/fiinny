import { FriendModel, ExpenseItem } from "@/lib/firestore";
import { ArrowLeft, Plus, CheckCircle2, Receipt } from "lucide-react";
import Link from "next/link";
import { useState, useMemo } from "react";
import PrimaryButton from "../widgets/PrimaryButton";
import TransactionCard from "../widgets/TransactionCard";
import { motion, AnimatePresence } from "framer-motion";
import AddExpenseModal from "../modals/AddExpenseModal";
import ExpenseDetailsModal from "../modals/ExpenseDetailsModal";
import EditExpenseModal from "../modals/EditExpenseModal";
import SettleUpModal from "../modals/SettleUpModal";
import ChartsTab from "../tabs/ChartsTab";
import ChatTab from "../tabs/ChatTab";
import RecurringExpensesTab from "../tabs/RecurringExpensesTab";
import { ExpenseService } from "@/lib/services/ExpenseService";
import { computePairwiseBreakdown, getPairwiseExpenses } from "@/lib/logic/pairwiseMath";

interface FriendDetailsScreenProps {
    friend: FriendModel;
    expenses: ExpenseItem[];
    currentUserId: string;
    onAddExpense: () => void;
    onSettleUp: () => void;
    isLoading?: boolean;
}

export default function FriendDetailsScreen({
    friend,
    expenses,
    currentUserId,
    onAddExpense,
    onSettleUp,
    isLoading = false
}: FriendDetailsScreenProps) {
    const [activeTab, setActiveTab] = useState<"transactions" | "charts" | "settle" | "chat" | "recurring">("transactions");
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [selectedExpense, setSelectedExpense] = useState<ExpenseItem | null>(null);

    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [expenseToEdit, setExpenseToEdit] = useState<ExpenseItem | null>(null);

    const [isSettleModalOpen, setIsSettleModalOpen] = useState(false);

    // Filter pairwise expenses (robustly)
    const pairwiseExpenses = useMemo(() => {
        return getPairwiseExpenses(currentUserId, friend.phone, expenses);
    }, [currentUserId, friend.phone, expenses]);

    // Calculate Balance using robust logic
    const breakdown = useMemo(() => {
        return computePairwiseBreakdown(currentUserId, friend.phone, pairwiseExpenses);
    }, [currentUserId, friend.phone, pairwiseExpenses]);

    const { net, owe, owed } = breakdown.totals;

    // Chat Channel ID
    const channelId = useMemo(() => {
        // Sort IDs to ensure same thread regardless of who is viewing
        const pId = (friend.phone || '').trim();
        const cId = (currentUserId || '').trim();
        return [cId, pId].sort().join('_');
    }, [friend.phone, currentUserId]);

    const handleAddExpense = async (expense: Partial<ExpenseItem>) => {
        const newExpense = {
            ...expense,
            id: "", // Will be generated or handled by Service
        } as ExpenseItem;

        await ExpenseService.addExpense(currentUserId, newExpense);
        onAddExpense(); // Trigger refresh
    };

    const handleDeleteExpense = async (id: string) => {
        if (confirm("Are you sure you want to delete this expense?")) {
            await ExpenseService.deleteExpense(currentUserId, id);
            onAddExpense(); // Trigger refresh
        }
    };

    const handleEditExpense = async (expense: ExpenseItem) => {
        await ExpenseService.updateExpense(currentUserId, expense);
        onAddExpense(); // Refresh
        setIsEditModalOpen(false);
    };

    const handleSettleUp = async (payment: Partial<ExpenseItem>) => {
        const newPayment = {
            ...payment,
            id: "",
        } as ExpenseItem;
        await ExpenseService.addExpense(currentUserId, newPayment);
        onAddExpense();
        setIsSettleModalOpen(false);
    };

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center space-x-4 mb-6">
                <Link href="/dashboard/friends" className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                    <ArrowLeft className="w-6 h-6 text-slate-600" />
                </Link>
                <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-teal-500 to-teal-300 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-sm">
                        {friend.avatar === "👤" ? friend.name[0] : <img src={friend.avatar} alt={friend.name} className="w-full h-full rounded-full object-cover" />}
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">{friend.name}</h1>
                        <p className="text-slate-500 text-sm">{friend.phone}</p>
                    </div>
                </div>
            </div>

            {/* Balance Card */}
            <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200 relative overflow-hidden">
                <div className="relative z-10">
                    <p className="text-slate-500 font-medium mb-1">
                        {net > 0 ? "Owes you" : net < 0 ? "You owe" : "Settled up"}
                    </p>
                    <h2 className={`text-4xl font-bold ${net > 0 ? "text-green-600" : net < 0 ? "text-red-600" : "text-slate-900"}`}>
                        ₹{Math.abs(net).toLocaleString('en-IN')}
                    </h2>
                    {(net !== 0 || owe > 0 || owed > 0) && (
                        <div className="text-slate-400 text-sm mt-2">
                            {/* Show breakdown if both owe each other */}
                            {owe > 0 && owed > 0 ? (
                                <span>You owe ₹{owe} • They owe ₹{owed}</span>
                            ) : (
                                net > 0 ? "You paid more in shared expenses." : net < 0 ? "They paid more in shared expenses." : "All settled."
                            )}
                        </div>
                    )}
                </div>
                <div className={`absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 opacity-20 ${net > 0 ? "bg-green-500" : net < 0 ? "bg-red-500" : "bg-slate-200"}`} />

                <div className="relative z-10 mt-6 flex gap-3">
                    <PrimaryButton
                        onClick={() => setIsAddModalOpen(true)}
                        icon={<Plus className="w-5 h-5" />}
                        className="!py-2 !px-4"
                    >
                        Add Expense
                    </PrimaryButton>
                    <button
                        onClick={() => setIsSettleModalOpen(true)}
                        className="px-6 py-2 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors flex items-center gap-2"
                    >
                        <CheckCircle2 className="w-5 h-5" />
                        Settle Up
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex space-x-2 border-b border-slate-200">
                <button
                    onClick={() => setActiveTab("transactions")}
                    className={`px-6 py-3 font-medium text-sm transition-all border-b-2 ${activeTab === "transactions" ? "border-teal-600 text-teal-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
                >
                    Transactions
                </button>
                <button
                    onClick={() => setActiveTab("charts")}
                    className={`px-6 py-3 font-medium text-sm transition-all border-b-2 ${activeTab === "charts" ? "border-teal-600 text-teal-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
                >
                    Charts
                </button>
                <button
                    onClick={() => setActiveTab("chat")}
                    className={`px-6 py-3 font-medium text-sm transition-all border-b-2 ${activeTab === "chat" ? "border-teal-600 text-teal-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
                >
                    Chat
                </button>
                <button
                    onClick={() => setActiveTab("recurring")}
                    className={`px-6 py-3 font-medium text-sm transition-all border-b-2 ${activeTab === "recurring" ? "border-teal-600 text-teal-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
                >
                    Recurring
                </button>
                <button
                    onClick={() => setActiveTab("settle")}
                    className={`px-6 py-3 font-medium text-sm transition-all border-b-2 ${activeTab === "settle" ? "border-teal-600 text-teal-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
                >
                    Settle Up History
                </button>
            </div>

            {/* Content */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden min-h-[400px]">
                {isLoading ? (
                    <div className="p-12 text-center">
                        <p className="text-slate-500">Loading transactions...</p>
                    </div>
                ) : activeTab === "charts" ? (
                    <ChartsTab expenses={pairwiseExpenses} currentUserId={currentUserId} friends={[friend]} />
                ) : activeTab === "chat" ? (
                    <ChatTab channelId={channelId} currentUserId={currentUserId} />
                ) : activeTab === "recurring" ? (
                    <RecurringExpensesTab
                        currentUserId={currentUserId}
                        filterType="friend"
                        filterId={friend.phone}
                    />
                ) : activeTab === "transactions" ? (
                    <div className="divide-y divide-slate-100">
                        {pairwiseExpenses.length === 0 ? (
                            <div className="p-12 text-center">
                                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Receipt className="w-8 h-8 text-slate-400" />
                                </div>
                                <h3 className="text-lg font-bold text-slate-900 mb-2">No transactions yet</h3>
                                <p className="text-slate-500 max-w-sm mx-auto">
                                    Add an expense to start tracking balances with {friend.name}.
                                </p>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-100">
                                {pairwiseExpenses.map((expense) => (
                                    <TransactionCard
                                        key={expense.id}
                                        tx={expense}
                                        isSelected={false}
                                        onToggleSelect={() => { }}
                                        onDelete={(id) => handleDeleteExpense(id)}
                                        onEdit={() => setSelectedExpense(expense)}
                                        onViewDetails={() => setSelectedExpense(expense)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {pairwiseExpenses.filter(e => e.category?.toLowerCase() === 'payment' || e.isSettlement).length === 0 ? (
                            <div className="p-12 text-center">
                                <p className="text-slate-500">No settlement history yet.</p>
                            </div>
                        ) : (
                            pairwiseExpenses
                                .filter(e => e.category?.toLowerCase() === 'payment' || e.isSettlement)
                                .map((expense) => (
                                    <TransactionCard
                                        key={expense.id}
                                        tx={expense}
                                        isSelected={false}
                                        onToggleSelect={() => { }}
                                        onDelete={(id) => handleDeleteExpense(id)}
                                        onEdit={() => setSelectedExpense(expense)}
                                        onViewDetails={() => setSelectedExpense(expense)}
                                    />
                                ))
                        )}
                    </div>
                )}
            </div>

            <SettleUpModal
                isOpen={isSettleModalOpen}
                onClose={() => setIsSettleModalOpen(false)}
                onSubmit={handleSettleUp}
                currentUser={{ uid: currentUserId, phoneNumber: currentUserId }}
                friend={friend}
                suggestedAmount={Math.abs(breakdown.totals.net)} // The net amount
                userOwesFriend={breakdown.totals.net < 0} // net < 0 means "You owe"
            />

            <AddExpenseModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                onSubmit={handleAddExpense}
                friends={[friend]}
                currentUser={{ uid: currentUserId, phoneNumber: currentUserId }}
            />

            <EditExpenseModal
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                onSubmit={handleEditExpense}
                expense={expenseToEdit}
                friends={[friend]}
                currentUser={{ uid: currentUserId, phoneNumber: currentUserId }}
            />

            <ExpenseDetailsModal
                isOpen={!!selectedExpense}
                onClose={() => setSelectedExpense(null)}
                expense={selectedExpense}
                currentUserId={currentUserId}
                friends={[friend]}
                onDelete={handleDeleteExpense}
                onEdit={(expense) => {
                    setExpenseToEdit(expense);
                    setSelectedExpense(null);
                    setIsEditModalOpen(true);
                }}
            />
        </div>
    );
}
