"use client";

import { CreditCard, Landmark } from "lucide-react";

interface BankCardStatsProps {
    bankCount: number;
    cardCount: number;
}

export default function BankCardStats({ bankCount, cardCount }: BankCardStatsProps) {
    return (
        <div className="grid grid-cols-2 gap-4">
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                    <Landmark className="w-5 h-5" />
                </div>
                <div>
                    <div className="text-2xl font-bold text-slate-900">{bankCount}</div>
                    <div className="text-xs text-slate-500 font-medium">Banks Used</div>
                </div>
            </div>

            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center text-purple-600">
                    <CreditCard className="w-5 h-5" />
                </div>
                <div>
                    <div className="text-2xl font-bold text-slate-900">{cardCount}</div>
                    <div className="text-xs text-slate-500 font-medium">Cards Used</div>
                </div>
            </div>
        </div>
    );
}
