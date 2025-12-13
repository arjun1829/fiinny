"use client";

import { useState, useEffect } from 'react';
import { Lightbulb, TrendingUp, TrendingDown, AlertCircle, ChevronRight, ChevronLeft, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Insight } from '@/lib/ai/insight_engine';

interface SmartInsightCardProps {
    insights: Insight[];
}

export default function SmartInsightCard({
    insights
}: SmartInsightCardProps) {
    const [currentIndex, setCurrentIndex] = useState(0);

    // Auto-rotate insights every 8 seconds if there are multiple
    useEffect(() => {
        if (insights.length <= 1) return;
        const interval = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % insights.length);
        }, 8000);
        return () => clearInterval(interval);
    }, [insights.length]);

    if (!insights || insights.length === 0) return null;

    const currentInsight = insights[currentIndex];

    // Styling map based on severity
    const styles = {
        success: {
            bg: "bg-gradient-to-br from-emerald-50 to-teal-50 border-teal-100",
            iconBg: "bg-emerald-100 text-emerald-600",
            title: "text-emerald-900",
            text: "text-emerald-700",
            icon: CheckCircle
        },
        warning: {
            bg: "bg-gradient-to-br from-amber-50 to-orange-50 border-orange-100",
            iconBg: "bg-orange-100 text-orange-600",
            title: "text-orange-900",
            text: "text-orange-800",
            icon: AlertCircle
        },
        critical: {
            bg: "bg-gradient-to-br from-rose-50 to-red-50 border-rose-100",
            iconBg: "bg-rose-100 text-rose-600",
            title: "text-rose-900",
            text: "text-rose-800",
            icon: TrendingDown
        },
        info: {
            bg: "bg-gradient-to-br from-blue-50 to-indigo-50 border-indigo-100",
            iconBg: "bg-blue-100 text-blue-600",
            title: "text-blue-900",
            text: "text-blue-700",
            icon: Lightbulb
        }
    };

    const style = styles[currentInsight.severity] || styles.info;
    const Icon = style.icon;

    const nextInsight = () => setCurrentIndex((prev) => (prev + 1) % insights.length);
    const prevInsight = () => setCurrentIndex((prev) => (prev - 1 + insights.length) % insights.length);

    return (
        <div className={`relative rounded-2xl p-6 border transition-colors duration-500 shadow-sm ${style.bg}`}>
            <AnimatePresence mode='wait'>
                <motion.div
                    key={currentInsight.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                    className="flex items-start gap-4"
                >
                    <div className={`p-3 rounded-xl shadow-sm ${style.iconBg}`}>
                        <Icon className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                        <div className="flex justify-between items-start">
                            <h3 className={`font-bold text-lg mb-1 leading-tight ${style.title}`}>
                                {currentInsight.message}
                            </h3>
                            {insights.length > 1 && (
                                <div className="flex gap-1 ml-2">
                                    <button onClick={prevInsight} className={`p-1 hover:bg-black/5 rounded-full ${style.text}`}><ChevronLeft className="w-4 h-4" /></button>
                                    <button onClick={nextInsight} className={`p-1 hover:bg-black/5 rounded-full ${style.text}`}><ChevronRight className="w-4 h-4" /></button>
                                </div>
                            )}
                        </div>
                        <p className={`text-sm leading-relaxed opacity-90 ${style.text}`}>
                            {currentInsight.description}
                        </p>

                        {/* Pagination Dots */}
                        {insights.length > 1 && (
                            <div className="flex gap-1.5 mt-3">
                                {insights.map((_, i) => (
                                    <div
                                        key={i}
                                        className={`w-1.5 h-1.5 rounded-full transition-all ${i === currentIndex
                                                ? `w-4 ${style.title.replace('text-', 'bg-')}`
                                                : `${style.text.replace('text-', 'bg-')} opacity-30`
                                            }`}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
