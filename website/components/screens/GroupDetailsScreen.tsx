import { GroupModel, ExpenseItem, FriendModel } from "@/lib/firestore";
import { ArrowLeft, Plus, Users, Receipt, Settings } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import PrimaryButton from "../widgets/PrimaryButton";
import TransactionCard from "../widgets/TransactionCard";
import AddExpenseModal from "../modals/AddExpenseModal";
import ExpenseDetailsModal from "../modals/ExpenseDetailsModal";
import ChartsTab from "../tabs/ChartsTab";
import { ExpenseService } from "@/lib/services/ExpenseService";

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
    const [activeTab, setActiveTab] = useState<"expenses" | "charts" | "balances" | "members">("expenses");
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [selectedExpense, setSelectedExpense] = useState<ExpenseItem | null>(null);

    const handleAddExpense = async (expense: Partial<ExpenseItem>) => {
        const newExpense = {
            ...expense,
            id: "",
            groupId: group.id,
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
                <button className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500">
                    <Settings className="w-6 h-6" />
                </button>
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
                        <p className="text-slate-500">Balances feature coming soon!</p>
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

            <ExpenseDetailsModal
                isOpen={!!selectedExpense}
                onClose={() => setSelectedExpense(null)}
                expense={selectedExpense}
                currentUserId={currentUserId}
                friends={members}
                onDelete={handleDeleteExpense}
                onEdit={(expense) => {
                    // TODO: Implement Edit Modal
                    console.log("Edit expense:", expense);
                    setSelectedExpense(null);
                }}
            />
        </div>
    );
}
