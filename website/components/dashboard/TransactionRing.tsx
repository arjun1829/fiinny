"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

interface TransactionRingProps {
    credit: number;
    debit: number;
    period: string;
    onClick?: () => void;
}

export default function TransactionRing({ credit, debit, period, onClick }: TransactionRingProps) {
    const [animatedCredit, setAnimatedCredit] = useState(0);
    const [animatedDebit, setAnimatedDebit] = useState(0);

    const total = credit + debit;
    const creditPercent = total > 0 ? (credit / total) * 100 : 0;
    const debitPercent = total > 0 ? (debit / total) * 100 : 0;

    // Circle properties
    const size = 280;
    const strokeWidth = 24;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;

    // Calculate stroke dash offsets for animation
    const creditDashOffset = circumference - (animatedCredit / 100) * circumference;
    const debitDashOffset = circumference - (animatedDebit / 100) * circumference;

    useEffect(() => {
        // Animate the ring on mount or when values change
        const timer = setTimeout(() => {
            setAnimatedCredit(creditPercent);
            setAnimatedDebit(debitPercent);
        }, 100);
        return () => clearTimeout(timer);
    }, [creditPercent, debitPercent]);

    return (
        <div className="flex flex-col items-center justify-center py-12">
            {/* SVG Ring */}
            <div className="relative" style={{ width: size, height: size }}>
                <svg width={size} height={size} className="transform -rotate-90">
                    {/* Background circle */}
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        fill="none"
                        stroke="#E2E8F0"
                        strokeWidth={strokeWidth}
                    />

                    {/* Credit (Green) arc */}
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        fill="none"
                        stroke="url(#creditGradient)"
                        strokeWidth={strokeWidth}
                        strokeDasharray={circumference}
                        strokeDashoffset={creditDashOffset}
                        strokeLinecap="round"
                        style={{
                            transition: "stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1)",
                        }}
                    />

                    {/* Debit (Red) arc */}
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        fill="none"
                        stroke="url(#debitGradient)"
                        strokeWidth={strokeWidth}
                        strokeDasharray={circumference}
                        strokeDashoffset={debitDashOffset}
                        strokeLinecap="round"
                        style={{
                            transition: "stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1)",
                            transform: `rotate(${(creditPercent / 100) * 360}deg)`,
                            transformOrigin: "center",
                        }}
                    />

                    {/* Gradients */}
                    <defs>
                        <linearGradient id="creditGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#10B981" />
                            <stop offset="100%" stopColor="#14B8A6" />
                        </linearGradient>
                        <linearGradient id="debitGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#EF4444" />
                            <stop offset="100%" stopColor="#F59E0B" />
                        </linearGradient>
                    </defs>
                </svg>

                {/* Center content */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.5, duration: 0.5, type: "spring" }}
                        className="text-center"
                    >
                        <div className="text-sm font-semibold text-slate-500 mb-1">Total</div>
                        <div className="text-3xl font-bold text-slate-900">
                            ₹{total.toLocaleString('en-IN')}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">{period}</div>
                    </motion.div>
                </div>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-8 mt-8">
                <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-gradient-to-br from-green-500 to-teal-500"></div>
                    <div className="text-sm">
                        <div className="font-semibold text-slate-700">Income</div>
                        <div className="text-slate-900 font-bold">₹{credit.toLocaleString('en-IN')}</div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-gradient-to-br from-red-500 to-amber-500"></div>
                    <div className="text-sm">
                        <div className="font-semibold text-slate-700">Expenses</div>
                        <div className="text-slate-900 font-bold">₹{debit.toLocaleString('en-IN')}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
