"use client";

import { Lightbulb, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';

interface SmartInsightCardProps {
    income: number;
    expense: number;
    savings: number;
    totalLoan: number;
    totalAssets: number;
    insightText?: string | null;
}

export default function SmartInsightCard({
    income,
    expense,
    savings,
    totalLoan,
    totalAssets,
    insightText
}: SmartInsightCardProps) {
    // Fallback insight logic if no text provided
    const getInsight = () => {
        if (insightText) return insightText;

        const netWorth = totalAssets - totalLoan;

        if (totalAssets > 0 || totalLoan > 0) {
            if (netWorth > 0) {
                return `Your net worth is ₹${netWorth.toLocaleString('en-IN')}. You're building real wealth! 💰`;
            } else {
                return `Your net worth is negative (₹${netWorth.toLocaleString('en-IN')}). Focus on reducing loans and growing assets! 🔄`;
            }
        } else if (income === 0 && expense === 0) {
            return "Add your first transaction or fetch from Gmail to get insights!";
        } else if (expense > income) {
            return "You're spending more than you earn this month. Be careful!";
        } else if (income > 0 && (savings / income) > 0.3) {
            return "Great! You’ve saved over 30% of your income this month.";
        } else {
            return "Keep tracking your expenses and save more!";
        }
    };

    const text = getInsight();
    const isPositive = !text.includes("negative") && !text.includes("spending more") && !text.includes("careful");

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`rounded-2xl p-6 border ${isPositive
                    ? "bg-gradient-to-br from-emerald-50 to-teal-50 border-teal-100"
                    : "bg-gradient-to-br from-amber-50 to-orange-50 border-orange-100"
                }`}
        >
            <div className="flex items-start gap-4">
                <div className={`p-3 rounded-xl ${isPositive ? "bg-white text-teal-600 shadow-sm" : "bg-white text-orange-600 shadow-sm"
                    }`}>
                    {isPositive ? <Lightbulb className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
                </div>
                <div>
                    <h3 className={`font-bold text-lg mb-1 ${isPositive ? "text-teal-900" : "text-orange-900"
                        }`}>
                        Fiinny Brain Insight
                    </h3>
                    <p className={`${isPositive ? "text-teal-700" : "text-orange-800"
                        } leading-relaxed`}>
                        {text}
                    </p>
                </div>
            </div>
        </motion.div>
    );
}
