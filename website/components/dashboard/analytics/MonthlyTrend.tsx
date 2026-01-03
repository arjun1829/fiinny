"use client";

import { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { TrendingUp } from "lucide-react";

interface MonthlyTrendProps {
    data: { month: string; amount: number }[];
}

export default function MonthlyTrend({ data }: MonthlyTrendProps) {
    const [view, setView] = useState<"trend" | "breakdown">("trend");

    const maxAmount = useMemo(() => {
        return Math.max(...data.map(d => d.amount), 100);
    }, [data]);

    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-slate-900 text-white p-2 rounded-lg shadow-xl text-xs">
                    <span className="font-semibold">{payload[0].payload.month}</span>
                    <span className="ml-2 text-teal-400 font-bold">
                        ₹{payload[0].value.toLocaleString('en-IN')}
                    </span>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-teal-600" />
                    <h3 className="font-bold text-slate-900">Monthly Trend</h3>
                </div>

                {/* View Toggle */}
                <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
                    <button
                        onClick={() => setView("trend")}
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${view === "trend"
                                ? "bg-white text-slate-900 shadow-sm"
                                : "text-slate-600 hover:text-slate-900"
                            }`}
                    >
                        Trend
                    </button>
                    <button
                        onClick={() => setView("breakdown")}
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${view === "breakdown"
                                ? "bg-white text-slate-900 shadow-sm"
                                : "text-slate-600 hover:text-slate-900"
                            }`}
                    >
                        Breakdown
                    </button>
                </div>
            </div>

            {/* Chart */}
            <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data}>
                        <XAxis
                            dataKey="month"
                            tick={{ fontSize: 11, fill: "#64748b" }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <YAxis
                            tick={{ fontSize: 11, fill: "#64748b" }}
                            axisLine={false}
                            tickLine={false}
                            width={60}
                        />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(148, 163, 184, 0.1)" }} />
                        <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                            {data.map((entry, index) => (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={view === "trend" ? "#0d9488" : `hsl(${index * 30}, 70%, 50%)`}
                                />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
