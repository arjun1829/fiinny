"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { Zap, Users, PieChart, ArrowLeft, ChevronDown } from "lucide-react";

export default function HowItWorks() {
    return (
        <div className="min-h-screen bg-slate-50 font-sans selection:bg-teal-100 selection:text-teal-900 overflow-x-hidden">
            {/* Premium Split Island Navigation */}
            <nav className="fixed top-6 left-0 right-0 z-50 flex justify-between items-center px-4 md:px-8 pointer-events-none">
                {/* Left Island: Back to Home */}
                <div className="pointer-events-auto bg-white/80 backdrop-blur-xl rounded-full border border-white/40 shadow-xl shadow-slate-200/40 px-6 py-3 flex items-center hover:bg-white transition-colors">
                    <Link href="/" className="flex items-center gap-2 text-slate-600 hover:text-teal-700 transition-colors font-bold text-sm group">
                        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform stroke-[3px]" />
                        Back to Home
                    </Link>
                </div>

                {/* Right Island: Brand */}
                <div className="pointer-events-auto bg-white/80 backdrop-blur-xl rounded-full border border-white/40 shadow-xl shadow-slate-200/40 px-6 py-3 flex items-center hover:bg-white transition-colors">
                    <Link href="/" className="flex items-center gap-2 group">
                        <div className="relative w-7 h-7 rounded-full overflow-hidden">
                            <Image src="/assets/images/logo_icon.png" alt="Fiinny" fill className="object-cover" />
                        </div>
                        <span className="text-xl font-black text-teal-950 tracking-tight group-hover:text-teal-700 transition-colors">Fiinny</span>
                    </Link>
                </div>
            </nav>

            <main className="pt-32 pb-32">
                {/* Hero Section */}
                <section className="relative px-4 sm:px-6 lg:px-8 mb-32 text-center">
                    {/* Light Mode Glows */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-teal-500/10 rounded-full blur-[120px] pointer-events-none" />

                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8 }}
                        className="relative z-10 max-w-4xl mx-auto"
                    >
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-teal-50 text-teal-700 text-xs font-bold uppercase tracking-[0.2em] mb-8 border border-teal-100">
                            <Zap className="w-4 h-4" />
                            How It Works
                        </div>
                        <h1 className="text-5xl lg:text-7xl font-black text-slate-900 mb-8 tracking-tight leading-none">
                            Managing money shouldn&apos;t <br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-600 to-emerald-600">
                                feel like work.
                            </span>
                        </h1>
                        <p className="text-xl text-slate-500 leading-relaxed font-medium max-w-2xl mx-auto">
                            Fiinny removes the clutter. We built a system that fits naturally into your life, not the other way around. Same powerful tools, just effortless.
                        </p>
                    </motion.div>
                </section>

                {/* The Process Pipeline (Vertical Layout + Original Cards) */}
                <section className="max-w-5xl mx-auto px-4 relative">
                    {/* Central Connector Line */}
                    <div className="absolute left-6 md:left-1/2 top-0 bottom-0 w-0.5 bg-gradient-to-b from-teal-500/20 via-slate-300 to-transparent -translate-x-1/2 md:translate-x-0 hidden md:block" />

                    <div className="space-y-24 relative">
                        {[
                            {
                                step: "01",
                                title: "Smart Context",
                                desc: "Auto-syncs transactions instantly. We organize your expenses with context, making patterns easy to understand.",
                                icon: <Zap className="w-6 h-6 text-white" />,
                                color: "from-amber-400 to-orange-500",
                                shadow: "shadow-orange-200",
                                align: "left"
                            },
                            {
                                step: "02",
                                title: "Split Instantly",
                                desc: "Swipe right to split any expense. No re-adding, no switching screens. Personal and shared finances in one place.",
                                icon: <Users className="w-6 h-6 text-white" />,
                                color: "from-teal-400 to-emerald-500",
                                shadow: "shadow-emerald-200",
                                align: "right"
                            },
                            {
                                step: "03",
                                title: "Real Insights",
                                desc: "See your broader financial picture—loans, assets, and net worth. No monthly blind spots, just clarity.",
                                icon: <PieChart className="w-6 h-6 text-white" />,
                                color: "from-blue-400 to-indigo-500",
                                shadow: "shadow-indigo-200",
                                align: "left"
                            }
                        ].map((item, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 40 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, margin: "-100px" }}
                                transition={{ duration: 0.7 }}
                                className={`relative flex flex-col md:flex-row items-center gap-12 ${item.align === 'right' ? 'md:flex-row-reverse' : ''}`}
                            >
                                {/* The Card (Restored Original Design) */}
                                <div className="flex-1 w-full">
                                    <div className="w-full bg-white rounded-[2rem] p-8 border border-slate-100 shadow-xl shadow-slate-200/40 hover:shadow-2xl hover:shadow-teal-900/5 transition-all duration-300 relative overflow-hidden group">

                                        {/* Decorative Number (Background) */}
                                        <div className="absolute -top-6 -right-6 text-9xl font-black text-slate-50 opacity-0 group-hover:opacity-100 transition-all duration-500 select-none z-0">
                                            {item.step}
                                        </div>

                                        <div className="relative z-10 flex flex-col md:flex-row gap-6 items-start">
                                            {/* Icon Box */}
                                            <div className={`w-16 h-16 shrink-0 rounded-2xl bg-gradient-to-br ${item.color} flex items-center justify-center shadow-lg ${item.shadow} transform group-hover:scale-110 group-hover:rotate-3 transition-all duration-300`}>
                                                {item.icon}
                                            </div>

                                            {/* Text Content */}
                                            <div className="text-left">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Step {item.step}</span>
                                                </div>
                                                <h3 className="text-xl font-bold text-slate-900 mb-3 group-hover:text-teal-700 transition-colors">
                                                    {item.title}
                                                </h3>
                                                <p className="text-slate-500 leading-relaxed text-sm font-medium">
                                                    {item.desc}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Bottom Color Bar */}
                                        <div className={`absolute bottom-0 left-0 w-full h-1.5 bg-gradient-to-r ${item.color} transform scale-x-0 group-hover:scale-x-100 transition-transform duration-500`} />
                                    </div>
                                </div>

                                {/* Center Connector Node */}
                                <div className="relative z-10 hidden md:flex items-center justify-center w-12 h-12 rounded-full bg-white border-4 border-slate-50 shadow-lg">
                                    <div className={`w-3 h-3 rounded-full bg-gradient-to-r ${item.color}`} />
                                </div>

                                {/* Empty Spacer for layout balance */}
                                <div className="flex-1 hidden md:block" />
                            </motion.div>
                        ))}
                    </div>
                </section>

                {/* Final CTA */}
                <section className="text-center mt-32 px-4">
                    <p className="text-slate-400 text-sm font-bold uppercase tracking-widest mb-8">Ready to start?</p>
                    <Link href="/login" className="inline-flex items-center gap-2 text-slate-900 font-bold text-lg hover:text-teal-600 transition-colors group">
                        Get Started <ChevronDown className="w-5 h-5 -rotate-90 group-hover:translate-x-1 transition-transform" />
                    </Link>
                </section>
            </main>
        </div>
    );
}
