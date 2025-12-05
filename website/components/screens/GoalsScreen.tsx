"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Target, Calendar, TrendingUp, Trash2, CheckCircle2, Circle } from "lucide-react";
import { GoalModel, GoalStatus, GoalType } from "@/lib/models/GoalModel";
import { format } from "date-fns";
import PrimaryButton from "@/components/widgets/PrimaryButton";
import CustomTextField from "@/components/widgets/CustomTextField";
import { deleteGoal, addGoal } from "@/lib/firestore";
import { useAuth } from "@/components/AuthProvider";

interface GoalsScreenProps {
    goals: GoalModel[];
    loading: boolean;
}

export default function GoalsScreen({ goals, loading }: GoalsScreenProps) {
    const { user } = useAuth();
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [newGoal, setNewGoal] = useState<Partial<GoalModel>>({
        title: "",
        targetAmount: 0,
        savedAmount: 0,
        targetDate: new Date(),
        status: "active",
        type: "savings",
        color: "#10b981"
    });

    const handleAddGoal = async () => {
        const userId = user?.phoneNumber || user?.uid;
        if (!userId || !newGoal.title || !newGoal.targetAmount) return;

        try {
            const goal: GoalModel = {
                id: Date.now().toString(),
                title: newGoal.title,
                targetAmount: Number(newGoal.targetAmount),
                savedAmount: Number(newGoal.savedAmount || 0),
                targetDate: new Date(newGoal.targetDate || Date.now()),
                status: "active",
                goalType: "oneTime",
                type: newGoal.type || "savings",
                color: newGoal.color || "#10b981",
                icon: "target",
                archived: false,
                createdAt: new Date()
            };

            await addGoal(userId, goal);
            setIsAddModalOpen(false);
            setNewGoal({
                title: "",
                targetAmount: 0,
                savedAmount: 0,
                targetDate: new Date(),
                status: "active",
                type: "savings",
                color: "#10b981"
            });
        } catch (error) {
            console.error("Error adding goal:", error);
            alert("Failed to add goal");
        }
    };

    const handleDelete = async (id: string) => {
        const userId = user?.phoneNumber || user?.uid;
        if (!userId || !confirm("Delete this goal?")) return;
        try {
            await deleteGoal(userId, id);
        } catch (error) {
            console.error("Error deleting goal:", error);
        }
    };

    const getProgress = (saved: number, target: number) => {
        if (target === 0) return 0;
        return Math.min(100, (saved / target) * 100);
    };

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Financial Goals</h1>
                    <p className="text-slate-500 mt-1">Track your savings and targets</p>
                </div>
                <PrimaryButton
                    onClick={() => setIsAddModalOpen(true)}
                    icon={<Plus className="w-5 h-5" />}
                >
                    New Goal
                </PrimaryButton>
            </div>

            {/* Goals Grid */}
            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-48 bg-slate-100 rounded-3xl animate-pulse" />
                    ))}
                </div>
            ) : goals.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-200">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Target className="w-8 h-8 text-slate-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900">No goals yet</h3>
                    <p className="text-slate-500 max-w-sm mx-auto mt-2">
                        Set a financial target to stay motivated and track your progress.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {goals.map((goal) => {
                        const progress = getProgress(goal.savedAmount, goal.targetAmount);
                        const isCompleted = progress >= 100;

                        return (
                            <motion.div
                                key={goal.id}
                                layout
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 relative overflow-hidden group"
                            >
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isCompleted ? "bg-green-100 text-green-600" : "bg-indigo-50 text-indigo-600"}`}>
                                            <Target className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-slate-900">{goal.title}</h3>
                                            <p className="text-xs text-slate-500 capitalize">{goal.type}</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleDelete(goal.id)}
                                        className="text-slate-300 hover:text-red-500 transition-colors p-1"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <div className="flex justify-between text-sm mb-2">
                                            <span className="text-slate-500">Progress</span>
                                            <span className="font-bold text-slate-900">{progress.toFixed(0)}%</span>
                                        </div>
                                        <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{ width: `${progress}%` }}
                                                className={`h-full rounded-full ${isCompleted ? "bg-green-500" : "bg-indigo-500"}`}
                                            />
                                        </div>
                                    </div>

                                    <div className="flex justify-between items-center pt-2 border-t border-slate-50">
                                        <div>
                                            <p className="text-xs text-slate-400">Saved</p>
                                            <p className="font-bold text-slate-900">₹{goal.savedAmount.toLocaleString()}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs text-slate-400">Target</p>
                                            <p className="font-bold text-slate-900">₹{goal.targetAmount.toLocaleString()}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-50 p-2 rounded-lg">
                                        <Calendar className="w-3 h-3" />
                                        <span>Target: {format(goal.targetDate, "MMM d, yyyy")}</span>
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            )}

            {/* Add Goal Modal */}
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
                            <h2 className="text-xl font-bold text-slate-900 mb-6">New Goal</h2>
                            <div className="space-y-4">
                                <CustomTextField
                                    label="Goal Title"
                                    value={newGoal.title || ""}
                                    onChange={(e) => setNewGoal({ ...newGoal, title: e.target.value })}
                                    placeholder="e.g. New Laptop"
                                />
                                <div className="grid grid-cols-2 gap-4">
                                    <CustomTextField
                                        label="Target Amount"
                                        type="number"
                                        value={newGoal.targetAmount?.toString() || ""}
                                        onChange={(e) => setNewGoal({ ...newGoal, targetAmount: Number(e.target.value) })}
                                        placeholder="0"
                                    />
                                    <CustomTextField
                                        label="Saved So Far"
                                        type="number"
                                        value={newGoal.savedAmount?.toString() || ""}
                                        onChange={(e) => setNewGoal({ ...newGoal, savedAmount: Number(e.target.value) })}
                                        placeholder="0"
                                    />
                                </div>
                                <CustomTextField
                                    label="Target Date"
                                    type="date"
                                    value={newGoal.targetDate ? format(newGoal.targetDate, "yyyy-MM-dd") : ""}
                                    onChange={(e) => setNewGoal({ ...newGoal, targetDate: new Date(e.target.value) })}
                                />
                                <div className="pt-4 flex gap-3">
                                    <button
                                        onClick={() => setIsAddModalOpen(false)}
                                        className="flex-1 py-3 text-slate-600 font-medium hover:bg-slate-50 rounded-xl transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <div className="flex-1">
                                        <PrimaryButton onClick={handleAddGoal} className="w-full">
                                            Create Goal
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
