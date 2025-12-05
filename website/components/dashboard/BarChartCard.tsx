"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Loader2 } from 'lucide-react';

interface BarChartCardProps {
    title: string;
    data: number[];
    labels?: string[];
    period: string;
    color: string;
    loading?: boolean;
    onViewAll?: () => void;
    onFilterTap?: () => void;
}

export default function BarChartCard({
    title,
    data,
    labels,
    period,
    color,
    loading = false,
    onViewAll,
    onFilterTap
}: BarChartCardProps) {
    // Transform data for Recharts
    const chartData = data.map((value, index) => ({
        name: labels ? labels[index] : index.toString(),
        value: value,
    }));

    const totalValue = data.reduce((a, b) => a + b, 0);

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 h-full flex flex-col">
            <div className="flex justify-between items-start mb-6">
                <div>
                    <h3 className="text-slate-500 text-sm font-semibold uppercase tracking-wider">{title}</h3>
                    <div className="text-2xl font-bold text-slate-900 mt-1">
                        {title.includes("Amount") ? "₹" : ""}{totalValue.toLocaleString('en-IN')}
                    </div>
                </div>
                <button
                    onClick={onFilterTap}
                    className="px-3 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-bold text-slate-600 transition-colors"
                >
                    {period}
                </button>
            </div>

            <div className="flex-1 min-h-[120px]">
                {loading ? (
                    <div className="h-full flex items-center justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
                    </div>
                ) : data.every(v => v === 0) ? (
                    <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                        No data for this period
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                            <XAxis
                                dataKey="name"
                                hide
                            />
                            <Tooltip
                                cursor={{ fill: 'transparent' }}
                                contentStyle={{
                                    borderRadius: '12px',
                                    border: 'none',
                                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                                    backgroundColor: '#1e293b',
                                    color: '#fff'
                                }}
                                itemStyle={{ color: '#fff' }}
                                formatter={(value: number) => [
                                    `${title.includes("Amount") ? "₹" : ""}${value.toLocaleString('en-IN')}`,
                                    title
                                ]}
                                labelStyle={{ display: 'none' }}
                            />
                            <Bar dataKey="value" radius={[4, 4, 4, 4]}>
                                {chartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={color} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </div>

            {onViewAll && (
                <button
                    onClick={onViewAll}
                    className="w-full mt-4 py-2 text-sm font-semibold text-slate-500 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                >
                    View Details
                </button>
            )}
        </div>
    );
}
