'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Shield, Lock, FileCheck, Globe } from 'lucide-react';

const Badge = ({ icon: Icon, text, subtext }: any) => (
    <div className="flex items-center gap-3 bg-white/60 backdrop-blur-sm px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
        <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
            <Icon size={16} />
        </div>
        <div className="flex flex-col">
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">{text}</span>
            <span className="text-[10px] text-slate-500 font-medium">{subtext}</span>
        </div>
    </div>
);

export default function ComplianceStrip() {
    return (
        <div className="w-full border-b border-slate-100 bg-slate-50/50">
            <div className="max-w-7xl mx-auto px-4 py-3">
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="flex flex-wrap justify-center md:justify-between items-center gap-4"
                >
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest hidden md:block">
                        Global Compliance Standards
                    </span>

                    <div className="flex flex-wrap justify-center gap-3 md:gap-6">
                        <Badge icon={FileCheck} text="DPDP Act" subtext="2023 Compliant" />
                        <Badge icon={Globe} text="GDPR" subtext="Principles Ready" />
                        <Badge icon={Shield} text="ISO 27001" subtext="Aligned Practices" />
                        <Badge icon={Lock} text="AES-256" subtext="Encryption Standard" />
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
