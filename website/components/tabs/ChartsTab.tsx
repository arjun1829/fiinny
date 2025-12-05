import { useMemo } from "react";
import { ExpenseItem, FriendModel } from "@/lib/firestore";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from "date-fns";

interface ChartsTabProps {
    expenses: ExpenseItem[];
    currentUserId: string;
    friends: FriendModel[];
}

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8", "#82ca9d"];

export default function ChartsTab({ expenses, currentUserId, friends }: ChartsTabProps) {

    // 1. Category Breakdown (Pie Chart)
    const categoryData = useMemo(() => {
        const categories: Record<string, number> = {};
        expenses.forEach(expense => {
            // Use labels as categories, default to "General"
            const category = (expense.labels && expense.labels.length > 0) ? expense.labels[0] : "General";
            categories[category] = (categories[category] || 0) + expense.amount;
        });

        return Object.entries(categories).map(([name, value]) => ({ name, value }));
    }, [expenses]);

    // 2. Daily Spending (Bar Chart) - Last 30 days or current month
    const spendingTrendData = useMemo(() => {
        if (expenses.length === 0) return [];

        // Sort expenses by date
        const sortedExpenses = [...expenses].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // Simple grouping by date
        const dailySpending: Record<string, number> = {};
        sortedExpenses.forEach(expense => {
            const dateKey = format(new Date(expense.date), "MMM dd");
            dailySpending[dateKey] = (dailySpending[dateKey] || 0) + expense.amount;
        });

        return Object.entries(dailySpending).map(([date, amount]) => ({ date, amount }));
    }, [expenses]);

    if (expenses.length === 0) {
        return (
            <div className="p-12 text-center">
                <p className="text-slate-500">No data available for charts yet.</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 p-6">
            {/* Category Pie Chart */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                <h3 className="text-lg font-bold text-slate-900 mb-4">Spending by Category</h3>
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={categoryData}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                outerRadius={100}
                                fill="#8884d8"
                                dataKey="value"
                            >
                                {categoryData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip formatter={(value: number) => `₹${value.toFixed(2)}`} />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Spending Trend Bar Chart */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                <h3 className="text-lg font-bold text-slate-900 mb-4">Spending Trend</h3>
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={spendingTrendData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                            <YAxis tick={{ fontSize: 12 }} />
                            <Tooltip formatter={(value: number) => `₹${value.toFixed(2)}`} />
                            <Bar dataKey="amount" fill="#0d9488" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}
