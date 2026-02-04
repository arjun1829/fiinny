'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Calendar, Globe, FileText, Hash } from 'lucide-react';
import Link from 'next/link';

export default function AuditBadge() {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-4xl mx-auto mb-16"
        >
            <div className="relative bg-white rounded-3xl p-1 border border-slate-200 shadow-xl overflow-hidden group">

                {/* Shimmer Border Effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-teal-500/20 to-transparent -translate-x-full group-hover:animate-shimmer" />

                <div className="bg-slate-50/50 rounded-[22px] p-8 md:p-10 backdrop-blur-sm relative z-10">
                    <div className="flex flex-col md:flex-row items-center gap-8 justify-between">

                        {/* Left: Badge Visual */}
                        <div className="flex-shrink-0">
                            <div className="w-24 h-24 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center relative">
                                <ShieldCheck className="w-12 h-12 text-teal-600" />
                                <div className="absolute -bottom-3 px-3 py-1 bg-teal-600 text-white text-[10px] font-bold tracking-wider rounded-full uppercase">
                                    Verified
                                </div>
                            </div>
                        </div>

                        {/* Middle: Content */}
                        <div className="text-center md:text-left flex-grow">
                            <h3 className="text-xl md:text-2xl font-bold text-slate-900 mb-2">
                                Independently Audited & Certified
                            </h3>
                            <p className="text-slate-600 mb-4 max-w-lg mx-auto md:mx-0">
                                Our systems undergo rigorous VAPT (Vulnerability Assessment & Penetration Testing) by
                                <strong> TAC Security</strong>, a global leader in cyber security.
                            </p>

                            <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-xs font-medium text-slate-500">
                                <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-full border border-slate-200" title="Next Audit: Jan 2026">
                                    <Calendar size={14} className="text-teal-500" />
                                    <span>Next Audit: Jan 2026</span>
                                </div>
                                <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-full border border-slate-200 font-mono">
                                    <Hash size={14} className="text-teal-500" />
                                    <span>ID: TAC-FIINNY-25</span>
                                </div>
                                <Link href="#" className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-full border border-slate-200 hover:text-teal-600 hover:border-teal-200 transition-colors">
                                    <FileText size={14} className="text-teal-500" />
                                    <span>View Audit Summary (PDF)</span>
                                </Link>
                            </div>
                        </div>

                        {/* Right: Partner Logo (Placeholder for TAC) */}
                        <div className="flex-shrink-0 opacity-60 grayscale hover:grayscale-0 transition-all duration-500">
                            {/* Visual Placeholder for TAC Security Logo */}
                            <div className="text-2xl font-black tracking-tighter text-slate-800 border-l-4 border-teal-500 pl-3">
                                TAC<br /><span className="font-light text-base text-slate-500">SECURITY</span>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </motion.div>
    );
}
