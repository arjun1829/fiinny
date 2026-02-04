'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Check, X, Smartphone, Globe, User, MessageSquare } from 'lucide-react';

const DataRow = ({ icon: Icon, title, reason, access, noAccess, delay }: any) => (
    <motion.div
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay }}
        className="grid grid-cols-1 md:grid-cols-12 gap-4 py-6 border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors px-4 rounded-xl items-start"
    >
        <div className="md:col-span-3 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                <Icon size={20} />
            </div>
            <span className="font-semibold text-slate-900">{title}</span>
        </div>

        {/* Why Column - NEW */}
        <div className="md:col-span-3 text-sm text-slate-600">
            <span className="md:hidden font-bold text-xs uppercase text-slate-400 block mb-1">Why:</span>
            {reason}
        </div>

        <div className="md:col-span-3 flex items-start gap-3 text-sm text-slate-600">
            <span className="md:hidden font-bold text-xs uppercase text-teal-600 block mb-1 shrink-0">Access:</span>
            <div className="mt-0.5 w-5 h-5 rounded-full bg-teal-50 flex items-center justify-center flex-shrink-0 text-teal-600 hidden md:flex">
                <Check size={12} strokeWidth={3} />
            </div>
            <span>{access}</span>
        </div>

        <div className="md:col-span-3 flex items-start gap-3 text-sm text-slate-400">
            <span className="md:hidden font-bold text-xs uppercase text-rose-500 block mb-1 shrink-0">Never:</span>
            <div className="mt-0.5 w-5 h-5 rounded-full bg-rose-50 flex items-center justify-center flex-shrink-0 text-rose-500 hidden md:flex">
                <X size={12} strokeWidth={3} />
            </div>
            <span className="line-through decoration-rose-200">{noAccess}</span>
        </div>
    </motion.div>
);

export default function DataTransparencyTable() {
    return (
        <section className="max-w-6xl mx-auto py-24 px-4">
            <div className="text-center mb-16">
                <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                    Radical Transparency
                </h2>
                <p className="text-slate-600 max-w-2xl mx-auto">
                    We believe you should know exactly what we touch, why we need it, and what is off-limits.
                </p>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
                {/* Header */}
                <div className="hidden md:grid grid-cols-12 gap-4 bg-slate-50/80 backdrop-blur border-b border-slate-200 px-8 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <div className="col-span-3">Data Type</div>
                    <div className="col-span-3 text-slate-700">Why We Need It</div>
                    <div className="col-span-3 text-teal-700">What We Access</div>
                    <div className="col-span-3 text-rose-600">What We NEVER Touch</div>
                </div>

                <div className="p-4 md:p-4">
                    <DataRow
                        icon={MessageSquare}
                        title="SMS Data"
                        reason="To automate expense tracking"
                        access="Read LOCALLY for transaction alerts."
                        noAccess="Personal texts, OTPs, or chats."
                        delay={0.1}
                    />
                    <DataRow
                        icon={User}
                        title="Contacts"
                        reason="Not needed"
                        access="Nothing. We don't ask for permission."
                        noAccess="Your contact list, friends, family."
                        delay={0.2}
                    />
                    <DataRow
                        icon={Globe}
                        title="Web History"
                        reason="Not needed"
                        access="Nothing."
                        noAccess="Browser history, cookies, trackers."
                        delay={0.3}
                    />
                    <DataRow
                        icon={Smartphone}
                        title="Device Info"
                        reason="Performance optimization"
                        access="Basic device model name."
                        noAccess="IMEI, Serial Number, or Hardware IDs."
                        delay={0.4}
                    />
                </div>
            </div>
        </section>
    );
}
