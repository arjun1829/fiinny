"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, GitCommit, Sparkles, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";

export default function ChangelogPage() {
    const changes = [
        {
            version: "v2.0.0",
            date: "February 2026",
            title: "The Intelligence Update",
            type: "major",
            items: [
                "Launched Fiinny Brain: AI-powered financial insights.",
                "New 'How It Works' flow with vertical dashboard visualization.",
                "Added 'Smart Split' for group expense management.",
                "Performance: 50% faster transaction parsing."
            ]
        },
        {
            version: "v1.2.0",
            date: "January 2026",
            title: "Privacy First",
            type: "feature",
            items: [
                "Enforced 100% on-device processing for sensitive SMS data.",
                "Added granular permissions control in Settings.",
                "Implemented 'Incognito Mode' for private viewing.",
                "Fixed: Minor layout bugs on smaller iPhone screens."
            ]
        },
        {
            version: "v1.0.0",
            date: "December 2025",
            title: "Global Launch",
            type: "major",
            items: [
                "Initial release on iOS and Android.",
                "Core Features: SMS Parsing, Gmail Sync, Manual Tracking.",
                "Basic Category Analytics and Monthly Reports.",
                "Dark Mode support."
            ]
        }
    ];

    return (
        <div className="min-h-screen bg-slate-50 font-sans selection:bg-teal-100 selection:text-teal-900 overflow-x-hidden">

            {/* Premium Split Island Navigation */}
            <nav className="fixed top-6 left-0 right-0 z-50 flex justify-between items-center px-4 md:px-8 pointer-events-none">
                <div className="pointer-events-auto bg-white/80 backdrop-blur-xl rounded-full border border-white/40 shadow-xl shadow-slate-200/40 px-6 py-3 flex items-center hover:bg-white transition-colors">
                    <Link href="/" className="flex items-center gap-2 text-slate-600 hover:text-teal-700 transition-colors font-bold text-sm group">
                        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform stroke-[3px]" />
                        Back to Home
                    </Link>
                </div>
                <div className="pointer-events-auto bg-white/80 backdrop-blur-xl rounded-full border border-white/40 shadow-xl shadow-slate-200/40 px-6 py-3 flex items-center hover:bg-white transition-colors">
                    <Link href="/" className="flex items-center gap-2 group">
                        <div className="relative w-7 h-7 rounded-full overflow-hidden">
                            <Image src="/assets/images/logo_icon.png" alt="Fiinny" fill className="object-cover" />
                        </div>
                        <span className="text-xl font-black text-teal-950 tracking-tight group-hover:text-teal-700 transition-colors">Fiinny</span>
                    </Link>
                </div>
            </nav>

            {/* Content */}
            <div className="pt-40 pb-24 px-4 sm:px-6 lg:px-8 relative z-10 max-w-3xl mx-auto">

                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    className="text-center mb-20"
                >
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-teal-50 text-teal-700 text-xs font-bold uppercase tracking-[0.2em] mb-8 border border-teal-100">
                        What's New
                    </div>
                    <h1 className="text-5xl lg:text-7xl font-black text-slate-900 mb-6 tracking-tight">
                        Changelog
                    </h1>
                    <p className="text-xl text-slate-500 font-medium">
                        Track our journey to financial clarity, one update at a time.
                    </p>
                </motion.div>

                <div className="relative border-l-2 border-slate-200 ml-4 lg:ml-0 space-y-16">
                    {changes.map((change, idx) => (
                        <motion.div
                            key={change.version}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.2, duration: 0.5 }}
                            className="relative pl-12 lg:pl-16"
                        >
                            {/* Dot */}
                            <div className={`absolute left-[-9px] top-0 w-4 h-4 rounded-full border-4 border-slate-50 ${change.type === 'major' ? 'bg-teal-500 scale-125' : 'bg-slate-300'}`} />

                            <div className="flex flex-col sm:flex-row sm:items-baseline gap-4 mb-6">
                                <h2 className="text-3xl font-bold text-slate-900 tracking-tight">
                                    {change.version}
                                </h2>
                                <span className="text-sm font-bold text-slate-400 uppercase tracking-widest bg-slate-100 px-3 py-1 rounded-full">
                                    {change.date}
                                </span>
                            </div>

                            <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/40 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300">
                                <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                                    {change.type === 'major' && <Sparkles className="w-5 h-5 text-amber-500 fill-current" />}
                                    {change.title}
                                </h3>
                                <ul className="space-y-4">
                                    {change.items.map((item, i) => (
                                        <li key={i} className="flex items-start gap-3 text-slate-600 font-medium leading-relaxed">
                                            <GitCommit className="w-5 h-5 text-teal-500 flex-shrink-0 mt-0.5" />
                                            {item}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </motion.div>
                    ))}
                </div>

            </div>

        </div>
    );
}
