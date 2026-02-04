'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Check, Info, ShieldCheck } from 'lucide-react';

const CheckItem = ({ text }: { text: string }) => (
    <li className="flex items-start gap-3">
        <div className="mt-1 w-5 h-5 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0 text-teal-700">
            <Check size={12} strokeWidth={3} />
        </div>
        <span className="text-slate-700 font-medium text-sm">{text}</span>
    </li>
);

export default function SMSTransparency() {
    return (
        <section className="max-w-4xl mx-auto px-4 py-12">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden relative"
            >
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-teal-400 to-blue-500" />

                <div className="p-8 md:p-10 flex flex-col md:flex-row gap-8 md:items-center">

                    {/* Left: Icon & Title */}
                    <div className="md:w-1/3">
                        <div className="w-14 h-14 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center mb-6">
                            <ShieldCheck size={32} />
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 mb-2">SMS Permission</h3>
                        <div className="inline-block bg-teal-100 text-teal-800 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide mb-4">
                            Strictly Optional
                        </div>
                        <p className="text-slate-500 text-sm leading-relaxed">
                            We prefer transparency over access. You don't need to give us permission to use Fiinny.
                        </p>
                    </div>

                    {/* Right: Checklist */}
                    <div className="md:w-2/3 bg-slate-50 rounded-2xl p-6 border border-slate-100">
                        <ul className="grid sm:grid-cols-2 gap-4">
                            <CheckItem text="Read-only access" />
                            <CheckItem text="On-device processing ONLY" />
                            <CheckItem text="We NEVER read OTPs" />
                            <CheckItem text="We NEVER read personal texts" />
                            <CheckItem text="Revoke permission anytime" />
                            <CheckItem text="App works fully with manual entry" />
                        </ul>

                        <div className="mt-6 flex items-start gap-3 p-4 bg-blue-50/50 rounded-xl border border-blue-100">
                            <Info size={18} className="text-blue-600 mt-0.5" />
                            <p className="text-xs text-blue-800 leading-relaxed">
                                <strong>Why we ask?</strong> If allowed, our AI simply reads transaction alerts from your bank (e.g., "Spent Rs 500") to automate your expense tracking.
                            </p>
                        </div>
                    </div>

                </div>
            </motion.div>
        </section>
    );
}
