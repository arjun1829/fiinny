"use client";

import { AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';

interface CrisisAlertBannerProps {
    totalIncome: number;
    totalExpense: number;
}

export default function CrisisAlertBanner({ totalIncome, totalExpense }: CrisisAlertBannerProps) {
    if (totalExpense <= totalIncome || totalIncome === 0) return null;

    const deficit = totalExpense - totalIncome;

    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-red-50 border border-red-100 rounded-2xl p-4 flex items-start gap-4"
        >
            <div className="p-2 bg-red-100 rounded-lg text-red-600">
                <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
                <h4 className="font-bold text-red-900">Spending Alert</h4>
                <p className="text-sm text-red-700 mt-1">
                    You've spent <span className="font-bold">₹{deficit.toLocaleString('en-IN')}</span> more than you've earned this period.
                    Review your expenses to stay on track.
                </p>
            </div>
        </motion.div>
    );
}
