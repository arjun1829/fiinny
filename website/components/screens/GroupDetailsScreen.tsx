import { GroupModel, ExpenseItem, FriendModel } from "@/lib/firestore";
import { ArrowLeft, Plus, Users, Receipt, Settings, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useState, useMemo } from "react";
import PrimaryButton from "../widgets/PrimaryButton";
import TransactionCard from "../widgets/TransactionCard";
import AddExpenseModal from "../modals/AddExpenseModal";
import ExpenseDetailsModal from "../modals/ExpenseDetailsModal";
import EditExpenseModal from "../modals/EditExpenseModal";
import SettleUpModal from "../modals/SettleUpModal";
import ChartsTab from "../tabs/ChartsTab";
import ChatTab from "../tabs/ChatTab";
import RecurringExpensesTab from "../tabs/RecurringExpensesTab";
import { ExpenseService } from "@/lib/services/ExpenseService";
import { computeNetByMember } from "@/lib/logic/balanceMath";

interface GroupDetailsScreenProps {
    group: GroupModel;
    members: FriendModel[];
    expenses: ExpenseItem[];
    currentUserId: string;
    onAddExpense: () => void;
    isLoading?: boolean;
}

export default function GroupDetailsScreen({
    group,
    members,
    expenses,
    currentUserId,
    onAddExpense,
    isLoading = false
}: GroupDetailsScreenProps) {
    const [activeTab, setActiveTab] = useState<"expenses" | "charts" | "balances" | "members" | "chat" | "recurring">("expenses");
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [selectedExpense, setSelectedExpense] = useState<ExpenseItem | null>(null);

    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [expenseToEdit, setExpenseToEdit] = useState<ExpenseItem | null>(null);

    const [isSettleModalOpen, setIsSettleModalOpen] = useState(false);
    const [settleFriend, setSettleFriend] = useState<FriendModel | null>(null);

    const memberBalances = useMemo(() => {
        return computeNetByMember(expenses);
    }, [expenses]);


    const handleAddExpense = async (expense: Partial<ExpenseItem>) => {
        const newExpense = {
            ...expense,
            id: "",
            groupId: group.id,
        } as ExpenseItem;

        await ExpenseService.addExpense(currentUserId, newExpense);
        onAddExpense(); // Trigger refresh
    };

    const handleEditExpense = async (expense: ExpenseItem) => {
        await ExpenseService.updateExpense(currentUserId, expense);
        onAddExpense(); // Trigger refresh
        setIsEditModalOpen(false);
    };

    const handleDeleteExpense = async (id: string) => {
        if (confirm("Are you sure you want to delete this expense?")) {
            await ExpenseService.deleteExpense(currentUserId, id);
            onAddExpense(); // Trigger refresh
        }
    };

    const handleSettleUp = async (payment: Partial<ExpenseItem>) => {
        const newPayment = {
            ...payment,
            id: "",
            groupId: group.id, // Settle up in group context usually logged in group
        } as ExpenseItem;
        await ExpenseService.addExpense(currentUserId, newPayment);
        onAddExpense();
        setIsSettleModalOpen(false);
        setSettleFriend(null);
    };

    const openSettleModal = (friend: FriendModel) => {
        setSettleFriend(friend);
        setIsSettleModalOpen(true);
    };

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-4">
                    <Link href="/dashboard/friends" className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <ArrowLeft className="w-6 h-6 text-slate-600" />
                    </Link>
                    <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-sm">
                            {group.avatarUrl ? <img src={group.avatarUrl} alt={group.name} className="w-full h-full rounded-full object-cover" /> : <Users className="w-6 h-6" />}
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900">{group.name}</h1>
                            <p className="text-slate-500 text-sm">{members.length} members</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex space-x-2 border-b border-slate-200">
                <button
                    onClick={() => setActiveTab("expenses")}
                    className={`px-6 py-3 font-medium text-sm transition-all border-b-2 ${activeTab === "expenses" ? "border-teal-600 text-teal-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
                >
                    Expenses
                </button>
                <button
                    onClick={() => setActiveTab("charts")}
                    className={`px-6 py-3 font-medium text-sm transition-all border-b-2 ${activeTab === "charts" ? "border-teal-600 text-teal-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
                >
                    Charts
                </button>
                <button
                    onClick={() => setActiveTab("balances")}
                    className={`px-6 py-3 font-medium text-sm transition-all border-b-2 ${activeTab === "balances" ? "border-teal-600 text-teal-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
                >
                    Balances
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
                    onClick={() => setActiveTab("members")}
                    className={`px-6 py-3 font-medium text-sm transition-all border-b-2 ${activeTab === "members" ? "border-teal-600 text-teal-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
                >
                    Members
                </button>
            </div>

            {/* Content */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden min-h-[400px]">
                {isLoading ? (
                    <div className="p-12 text-center">
                        <p className="text-slate-500">Loading group data...</p>
                    </div>
                ) : activeTab === "expenses" ? (
                    <>
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                            <h2 className="text-xl font-bold text-slate-900">Group Expenses</h2>
                            <PrimaryButton
                                onClick={() => setIsAddModalOpen(true)}
                                icon={<Plus className="w-5 h-5" />}
                                className="!py-2 !px-4"
                            >
                                Add Expense
                            </PrimaryButton>
                        </div>
                        {expenses.length === 0 ? (
                            <div className="p-12 text-center">
                                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Receipt className="w-8 h-8 text-slate-400" />
                                </div>
                                <h3 className="text-lg font-bold text-slate-900 mb-2">No expenses yet</h3>
                                <p className="text-slate-500 max-w-sm mx-auto">
                                    Add an expense to split it with the group.
                                </p>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-100">
                                {expenses.map((expense) => (
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
                    </>
                ) : activeTab === "charts" ? (
                    <ChartsTab expenses={expenses} currentUserId={currentUserId} friends={members} />
                ) : activeTab === "chat" ? (
                    <ChatTab channelId={group.id} currentUserId={currentUserId} />
                ) : activeTab === "recurring" ? (
                    <RecurringExpensesTab
                        currentUserId={currentUserId}
                        filterType="group"
                        filterId={group.id}
                    />
                ) : activeTab === "balances" ? (
                    <div className="divide-y divide-slate-100">
                        {members.map(m => {
                            const net = memberBalances[m.phone] || 0;
                            const myNet = memberBalances[currentUserId] || 0;
                            const showSettle = m.phone !== currentUserId && Math.abs(net) > 0.1;

                            return (
                                <div key={m.phone} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                    <div className="flex items-center space-x-4">
                                        <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center text-slate-600 font-bold">
                                            {m.avatar === "👤" ? m.name[0] : <img src={m.avatar} alt={m.name} className="w-full h-full rounded-full object-cover" />}
                                        </div>
                                        <div>
                                            <div className="font-bold text-slate-900">
                                                {m.phone === currentUserId ? "You" : m.name}
                                            </div>
                                            <div className="text-xs text-slate-500">{m.phone}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className={`font-bold ${net > 0 ? "text-green-600" : net < 0 ? "text-red-600" : "text-slate-400"}`}>
                                            {net > 0 ? `gets back ₹${net.toFixed(2)}` : net < 0 ? `owes ₹${Math.abs(net).toFixed(2)}` : "settled"}
                                        </div>
                                        {showSettle && (
                                            <button
                                                onClick={() => openSettleModal(m)}
                                                className="px-3 py-1 rounded-full text-xs font-bold border border-slate-300 text-slate-600 hover:bg-slate-100 transition-colors"
                                            >
                                                Settle
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : activeTab === "members" ? (
                    <div className="divide-y divide-slate-100">
                        {members.map((member) => (
                            <div key={member.phone} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                <div className="flex items-center space-x-4">
                                    <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center text-slate-600 font-bold">
                                        {member.avatar === "👤" ? member.name[0] : <img src={member.avatar} alt={member.name} className="w-full h-full rounded-full object-cover" />}
                                    </div>
                                    <div>
                                        <div className="font-bold text-slate-900">{member.name}</div>
                                        <div className="text-xs text-slate-500">{member.phone}</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="p-12 text-center">
                        <p className="text-slate-500">Feature coming soon!</p>
                    </div>
                )}
            </div>

            <AddExpenseModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                onSubmit={handleAddExpense}
                friends={members}
                currentUser={{ uid: currentUserId, phoneNumber: currentUserId }}
                defaultGroupId={group.id}
            />

            <EditExpenseModal
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                onSubmit={handleEditExpense}
                expense={expenseToEdit}
                friends={members}
                currentUser={{ uid: currentUserId, phoneNumber: currentUserId }}
            />

            {settleFriend && (
                <SettleUpModal
                    isOpen={isSettleModalOpen}
                    onClose={() => { setIsSettleModalOpen(false); setSettleFriend(null); }}
                    onSubmit={handleSettleUp}
                    currentUser={{ uid: currentUserId, phoneNumber: currentUserId }}
                    friend={settleFriend}
                    suggestedAmount={0}
                    userOwesFriend={true}
                />
            )}

            <ExpenseDetailsModal
                isOpen={!!selectedExpense}
                onClose={() => setSelectedExpense(null)}
                expense={selectedExpense}
                currentUserId={currentUserId}
                friends={members}
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
