import React from 'react';
import { motion } from 'framer-motion';

interface WeeklyPartnerRingsProps {
    dailyCredits: number[];
    dailyDebits: number[];
    dateLabels?: string[];
    onRingTap?: (index: number) => void;
    ringSize?: number;
    strokeWidth?: number;
}

const MiniSplitRing = ({
    incomePercent,
    expensePercent,
    size,
    strokeWidth,
}: {
    incomePercent: number;
    expensePercent: number;
    size: number;
    strokeWidth: number;
}) => {
    const radius = (size - strokeWidth) / 2;
    const center = size / 2;
    const circumference = 2 * Math.PI * radius;

    const incomeOffset = circumference - (incomePercent * circumference);
    const expenseOffset = circumference - (expensePercent * circumference);

    const incomeRotation = -90;
    const expenseRotation = -90 + (incomePercent * 360);

    return (
        <div style={{ width: size, height: size }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <circle
                    cx={center}
                    cy={center}
                    r={radius}
                    fill="none"
                    stroke="#DDDDDD"
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                />
                {incomePercent > 0 && (
                    <motion.circle
                        initial={{ strokeDashoffset: circumference }}
                        animate={{ strokeDashoffset: incomeOffset }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                        cx={center}
                        cy={center}
                        r={radius}
                        fill="none"
                        stroke="#22c55e"
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        transform={`rotate(${incomeRotation} ${center} ${center})`}
                    />
                )}
                {expensePercent > 0 && (
                    <motion.circle
                        initial={{ strokeDashoffset: circumference }}
                        animate={{ strokeDashoffset: expenseOffset }}
                        transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
                        cx={center}
                        cy={center}
                        r={radius}
                        fill="none"
                        stroke="#ef4444"
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        transform={`rotate(${expenseRotation} ${center} ${center})`}
                    />
                )}
            </svg>
        </div>
    );
};

export const WeeklyPartnerRings: React.FC<WeeklyPartnerRingsProps> = ({
    dailyCredits,
    dailyDebits,
    dateLabels,
    onRingTap,
    ringSize = 34,
    strokeWidth = 4,
}) => {
    return (
        <div className="flex justify-center items-end gap-1 sm:gap-2 overflow-x-auto pb-2">
            {dailyCredits.map((credit, i) => {
                const debit = dailyDebits[i] || 0;
                const total = credit + debit;
                const incomePercent = total > 0 ? Math.min(credit / total, 1) : 0;
                const expensePercent = total > 0 ? Math.min(debit / total, 1) : 0;

                return (
                    <button
                        key={i}
                        onClick={() => onRingTap?.(i)}
                        className="flex flex-col items-center gap-1 group"
                    >
                        <div className="relative p-1 rounded-full group-hover:bg-slate-50 transition-colors">
                            <MiniSplitRing
                                incomePercent={incomePercent}
                                expensePercent={expensePercent}
                                size={ringSize}
                                strokeWidth={strokeWidth}
                            />
                        </div>
                        {dateLabels && dateLabels[i] && (
                            <span className="text-[10px] text-slate-500 font-medium">
                                {dateLabels[i]}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
};
