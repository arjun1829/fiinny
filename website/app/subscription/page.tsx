"use client";

import Link from "next/link";
import { ArrowLeft, CheckCircle2, Zap } from "lucide-react";
import { motion } from "framer-motion";

export default function SubscriptionPage() {
    return (
        <div className="min-h-screen bg-slate-900 text-white selection:bg-teal-500/30 overflow-hidden relative">

            {/* Background Effects */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-teal-500/20 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[100px] translate-y-1/2 -translate-x-1/2" />

            {/* Navbar */}
            <nav className="p-6 flex items-center justify-between max-w-7xl mx-auto w-full relative z-10">
                <Link href="/" className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors group">
                    <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                    <span>Back Home</span>
                </Link>
                <div className="text-xl font-black tracking-tighter bg-gradient-to-r from-teal-400 to-emerald-400 bg-clip-text text-transparent">
                    Fiinny
                </div>
            </nav>

            {/* Main Content */}
            <div className="max-w-7xl mx-auto px-4 py-20 lg:py-32 relative z-10">
                <div className="text-center max-w-4xl mx-auto">

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                    >
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-teal-500/10 text-teal-300 text-sm font-bold mb-8 border border-teal-500/20">
                            <Zap className="w-4 h-4" /> No Credit Card Required
                        </div>

                        <h1 className="text-7xl lg:text-[7rem] font-bold tracking-tighter mb-8 leading-none">
                            Pricing? <br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-emerald-400">It's Free.</span>
                        </h1>

                        <p className="text-2xl text-slate-400 mb-12 leading-relaxed max-w-2xl mx-auto">
                            We believe financial clarity shouldn't come with a price tag.
                            Track expenses, split bills, and master your money without paying a dime.
                        </p>

                        <motion.div
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className="inline-block"
                        >
                            <Link href="/login" className="bg-white text-slate-900 px-10 py-5 rounded-full text-xl font-bold shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)] hover:shadow-[0_0_60px_-15px_rgba(20,184,166,0.5)] transition-shadow">
                                Start for ₹0
                            </Link>
                        </motion.div>
                    </motion.div>

                    {/* Features Grid */}
                    <motion.div
                        initial={{ opacity: 0, y: 40 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 0.2 }}
                        className="grid md:grid-cols-3 gap-6 mt-24 text-left"
                    >
                        {[
                            { title: "Unlimited Tracking", desc: "Track as many expenses, incomes, and transfers as you want." },
                            { title: "Smart Parsing", desc: "Auto-detect transactions from SMS and Gmail. No manual entry." },
                            { title: "Group Expenses", desc: "Split bills with friends, roommates, and trips easily." },
                        ].map((item, i) => (
                            <div key={i} className="bg-slate-800/50 border border-slate-700 p-8 rounded-3xl backdrop-blur-sm hover:bg-slate-800 transition-colors">
                                <CheckCircle2 className="w-8 h-8 text-teal-400 mb-4" />
                                <h3 className="text-xl font-bold mb-2 text-white">{item.title}</h3>
                                <p className="text-slate-400">{item.desc}</p>
                            </div>
                        ))}
                    </motion.div>

                    <div className="mt-20 text-slate-500 font-medium text-sm">
                        * Premium features for teams and businesses coming soon. <br />
                        Personal accounts will remain free forever.
                    </div>

                </div>
            </div>
        </div>
    );
}
