"use client";

import { motion } from "framer-motion";

interface PeriodFilterBarProps {
    activePeriod: string;
    onPeriodChange: (period: string) => void;
}

const periods = [
    { id: "D", label: "Today" },
    { id: "W", label: "Week" },
    { id: "M", label: "Month" },
    { id: "Q", label: "Quarter" },
    { id: "Y", label: "Year" },
    { id: "ALL", label: "All Time" },
];

export default function PeriodFilterBar({ activePeriod, onPeriodChange }: PeriodFilterBarProps) {
    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-2">
            <div className="flex items-center gap-2">
                {periods.map((period) => (
                    <button
                        key={period.id}
                        onClick={() => onPeriodChange(period.id)}
                        className={`relative flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${activePeriod === period.id
                                ? "text-white"
                                : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                            }`}
                    >
                        {activePeriod === period.id && (
                            <motion.div
                                layoutId="activeTab"
                                className="absolute inset-0 bg-gradient-to-r from-teal-500 to-emerald-600 rounded-xl"
                                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                            />
                        )}
                        <span className="relative z-10">{period.label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
