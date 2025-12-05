"use client";

import { ShoppingBag } from "lucide-react";

interface TopMerchantsListProps {
    merchants: { name: string; amount: number; count: number }[];
}

export default function TopMerchantsList({ merchants }: TopMerchantsListProps) {
    return (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h3 className="font-bold text-slate-900 mb-6">Top Merchants</h3>

            <div className="space-y-4">
                {merchants.slice(0, 5).map((merchant, index) => (
                    <div key={merchant.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 text-xs font-bold">
                                {index + 1}
                            </div>
                            <div>
                                <div className="font-semibold text-slate-900 text-sm">{merchant.name}</div>
                                <div className="text-xs text-slate-500">{merchant.count} transactions</div>
                            </div>
                        </div>
                        <div className="font-bold text-slate-900 text-sm">
                            ₹{merchant.amount.toLocaleString('en-IN')}
                        </div>
                    </div>
                ))}

                {merchants.length === 0 && (
                    <div className="text-center py-8 text-slate-500 text-sm">
                        No merchant data available
                    </div>
                )}
            </div>
        </div>
    );
}
