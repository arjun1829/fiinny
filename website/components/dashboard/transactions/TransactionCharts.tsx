"use client";

import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";
import { motion } from "framer-motion";
import { PieChart as PieChartIcon, BarChart as BarChartIcon } from "lucide-react";

interface TransactionChartsProps {
    data: { name: string; value: number }[];
    type: "expense" | "income";
}

const COLORS = [
    "#ef4444", "#f97316", "#f59e0b", "#10b981", "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6", "#d946ef", "#f43f5e"
];

export default function TransactionCharts({ data, type }: TransactionChartsProps) {
    const [chartType, setChartType] = useState<"pie" | "bar">("pie");

    if (data.length === 0) return null;

    // Sort data by value desc
    const sortedData = [...data].sort((a, b) => b.value - a.value);

    // Take top 6 for pie, group rest as "Other"
    const pieData = sortedData.slice(0, 6);
    const otherValue = sortedData.slice(6).reduce((sum, d) => sum + d.value, 0);
    if (otherValue > 0) {
        pieData.push({ name: "Other", value: otherValue });
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200"
        >
            <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-slate-900">
                    {type === "expense" ? "Expense Breakdown" : "Income Breakdown"}
                </h3>
                <div className="flex bg-slate-100 rounded-lg p-1">
                    <button
                        onClick={() => setChartType("pie")}
                        className={`p-1.5 rounded-md transition-all ${chartType === "pie" ? "bg-white shadow text-slate-900" : "text-slate-400 hover:text-slate-600"}`}
                    >
                        <PieChartIcon className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setChartType("bar")}
                        className={`p-1.5 rounded-md transition-all ${chartType === "bar" ? "bg-white shadow text-slate-900" : "text-slate-400 hover:text-slate-600"}`}
                    >
                        <BarChartIcon className="w-4 h-4" />
                    </button>
                </div>
            </div>

            <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    {chartType === "pie" ? (
                        <PieChart>
                            <Pie
                                data={pieData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={5}
                                dataKey="value"
                            >
                                {pieData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip
                                formatter={(value: number) => `₹${value.toLocaleString('en-IN')}`}
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            />
                        </PieChart>
                    ) : (
                        <BarChart data={sortedData.slice(0, 8)} layout="vertical" margin={{ left: 40 }}>
                            <XAxis type="number" hide />
                            <YAxis
                                dataKey="name"
                                type="category"
                                width={100}
                                tick={{ fontSize: 12, fill: '#64748b' }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <Tooltip
                                formatter={(value: number) => `₹${value.toLocaleString('en-IN')}`}
                                cursor={{ fill: '#f1f5f9' }}
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            />
                            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                {sortedData.slice(0, 8).map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Bar>
                        </BarChart>
                    )}
                </ResponsiveContainer>
            </div>

            {/* Legend for Pie */}
            {chartType === "pie" && (
                <div className="flex flex-wrap justify-center gap-4 mt-6">
                    {pieData.map((entry, index) => (
                        <div key={index} className="flex items-center gap-2 text-xs font-medium text-slate-600">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                            <span>{entry.name}</span>
                            <span className="text-slate-400">{(entry.value / data.reduce((s, d) => s + d.value, 0) * 100).toFixed(0)}%</span>
                        </div>
                    ))}
                </div>
            )}
        </motion.div>
    );
}
