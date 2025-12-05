"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

interface CategoryPieChartProps {
    data: { name: string; value: number; color: string }[];
}

export default function CategoryPieChart({ data }: CategoryPieChartProps) {
    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            return (
                <div className="bg-slate-900 text-white p-2 rounded-lg shadow-xl text-xs">
                    <span className="font-semibold">{data.name}</span>
                    <span className="ml-2 text-teal-400 font-bold">
                        ₹{data.value.toLocaleString('en-IN')}
                    </span>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col">
            <h3 className="font-bold text-slate-900 mb-6">Category Breakdown</h3>

            <div className="flex-1 min-h-[200px] relative">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={data}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={2}
                            dataKey="value"
                        >
                            {data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} strokeWidth={0} />
                            ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                </ResponsiveContainer>

                {/* Center Text */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center">
                        <div className="text-xs text-slate-500 font-medium">Total</div>
                        <div className="text-lg font-bold text-slate-900">
                            ₹{data.reduce((sum, item) => sum + item.value, 0).toLocaleString('en-IN')}
                        </div>
                    </div>
                </div>
            </div>

            {/* Legend */}
            <div className="mt-6 space-y-3 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                {data.map((item) => (
                    <div key={item.name} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                            <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: item.color }}
                            />
                            <span className="text-slate-600 truncate max-w-[120px]">{item.name}</span>
                        </div>
                        <span className="font-semibold text-slate-900">
                            ₹{item.value.toLocaleString('en-IN')}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
