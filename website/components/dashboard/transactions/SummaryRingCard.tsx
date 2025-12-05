"use client";

import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { motion } from "framer-motion";

interface SummaryRingCardProps {
    income: number;
    expense: number;
    count: number;
    periodLabel: string;
    onPeriodClick?: () => void;
}

export default function SummaryRingCard({ income, expense, count, periodLabel, onPeriodClick }: SummaryRingCardProps) {
    const data = [
        { name: "Expense", value: expense, color: "#ef4444" }, // Red-500
        { name: "Income", value: income, color: "#10b981" },   // Emerald-500
    ];

    // If no data, show a gray ring
    const isEmpty = income === 0 && expense === 0;
    const chartData = isEmpty
        ? [{ name: "Empty", value: 1, color: "#f1f5f9" }]
        : data.filter(d => d.value > 0);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 flex flex-col md:flex-row items-center gap-8"
        >
            {/* Ring Chart */}
            <div className="relative w-32 h-32 flex-shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={chartData}
                            innerRadius={45}
                            outerRadius={60}
                            paddingAngle={isEmpty ? 0 : 5}
                            dataKey="value"
                            stroke="none"
                            startAngle={90}
                            endAngle={-270}
                        >
                            {chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                        </Pie>
                    </PieChart>
                </ResponsiveContainer>
                {/* Center Text */}
                <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
                    <span className="text-xs text-slate-400 font-medium">Net</span>
                    <span className={`text-sm font-bold ${income - expense >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {(income - expense >= 0 ? "+" : "")}₹{Math.abs(income - expense).toLocaleString('en-IN', { notation: "compact" })}
                    </span>
                </div>
            </div>

            {/* Stats */}
            <div className="flex-1 w-full text-center md:text-right space-y-2">
                <button
                    onClick={onPeriodClick}
                    className="inline-flex items-center px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-sm font-semibold hover:bg-slate-200 transition-colors mb-2"
                >
                    {periodLabel}
                </button>

                <div className="flex flex-col gap-1">
                    <div className="flex justify-between md:justify-end gap-4 items-baseline">
                        <span className="text-sm text-slate-500 font-medium">Expense</span>
                        <span className="text-2xl font-bold text-slate-900">₹{expense.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between md:justify-end gap-4 items-baseline">
                        <span className="text-sm text-slate-500 font-medium">Income</span>
                        <span className="text-2xl font-bold text-emerald-600">₹{income.toLocaleString('en-IN')}</span>
                    </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex justify-between md:justify-end gap-6 text-xs text-slate-500 font-medium">
                    <span>{count} Transactions</span>
                    {/* Placeholder for Bank/Card counts if we had them */}
                    {/* <span>2 Banks</span> */}
                </div>
            </div>
        </motion.div>
    );
}
