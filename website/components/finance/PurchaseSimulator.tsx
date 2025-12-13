"use client";

import React, { useState } from "react";
import { analyzeAffordability, AffordabilityResult } from "@/lib/finance/simulator";
import { motion } from "framer-motion";
import { Calculator, AlertTriangle, CheckCircle, Clock } from "lucide-react";

interface PurchaseSimulatorProps {
    currentSavings: number; // calculated from income - expense
    avgMonthlySavings: number; // calculated from last 3 months
}

export default function PurchaseSimulator({ currentSavings, avgMonthlySavings }: PurchaseSimulatorProps) {
    const [itemName, setItemName] = useState("");
    const [cost, setCost] = useState<string>("");
    const [result, setResult] = useState<AffordabilityResult | null>(null);

    const handleSimulate = () => {
        const costNum = parseFloat(cost.replace(/,/g, ''));
        if (!itemName || isNaN(costNum) || costNum <= 0) return;

        const res = analyzeAffordability(costNum, currentSavings, avgMonthlySavings);
        setResult(res);
    };

    return (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <div className="flex items-center gap-3 mb-6">
                <div className="bg-indigo-100 p-2 rounded-lg">
                    <Calculator className="w-6 h-6 text-indigo-600" />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-slate-900">Purchase Simulator</h2>
                    <p className="text-sm text-slate-500">Can I afford it? Let's check the time machine.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Inputs */}
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">I want to buy...</label>
                        <input
                            type="text"
                            className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 outline-none focus:border-indigo-500 transition-colors font-medium text-slate-800"
                            placeholder="e.g. MacBook Pro, Trip to Bali"
                            value={itemName}
                            onChange={(e) => setItemName(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">It costs...</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                            <input
                                type="number"
                                className="w-full pl-8 p-3 bg-slate-50 rounded-xl border border-slate-200 outline-none focus:border-indigo-500 transition-colors font-bold text-slate-800"
                                placeholder="50000"
                                value={cost}
                                onChange={(e) => setCost(e.target.value)}
                            />
                        </div>
                    </div>

                    <button
                        onClick={handleSimulate}
                        disabled={!itemName || !cost}
                        className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-bold transition-all shadow-lg shadow-indigo-200"
                    >
                        Simulate Purchase 🔮
                    </button>

                    <div className="text-xs text-slate-400 text-center">
                        Based on your avg monthly savings of ₹{avgMonthlySavings.toLocaleString()}
                    </div>
                </div>

                {/* Result Area */}
                <div className="bg-slate-50 rounded-xl border border-slate-100 p-6 flex flex-col justify-center items-center text-center min-h-[200px]">
                    {!result ? (
                        <div className="text-slate-400">
                            <Calculator className="w-12 h-12 mx-auto mb-3 opacity-20" />
                            <p>Enter details to see your financial future.</p>
                        </div>
                    ) : (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="w-full"
                        >
                            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${result.canAffordNow ? 'bg-emerald-100 text-emerald-600' :
                                    result.riskLevel === 'safe' ? 'bg-blue-100 text-blue-600' :
                                        result.riskLevel === 'moderate' ? 'bg-amber-100 text-amber-600' : 'bg-rose-100 text-rose-600'
                                }`}>
                                {result.canAffordNow ? <CheckCircle className="w-8 h-8" /> :
                                    result.riskLevel === 'high' ? <AlertTriangle className="w-8 h-8" /> : <Clock className="w-8 h-8" />}
                            </div>

                            <h3 className="text-lg font-bold text-slate-800 mb-2">
                                {result.canAffordNow ? "Yes, go for it!" :
                                    result.monthsToAfford === Infinity ? "Not affordable right now" :
                                        `Wait until ${result.projectedDate.toLocaleString('default', { month: 'short', year: 'numeric' })}`}
                            </h3>

                            {!result.canAffordNow && result.monthsToAfford !== Infinity && (
                                <div className="text-3xl font-black text-indigo-600 mb-2">
                                    {result.monthsToAfford} <span className="text-base font-medium text-slate-400">months</span>
                                </div>
                            )}

                            <p className="text-sm text-slate-600 bg-white p-3 rounded-lg border border-slate-100 shadow-sm">
                                {result.recommendation}
                            </p>
                        </motion.div>
                    )}
                </div>
            </div>
        </div>
    );
}
