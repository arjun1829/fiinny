"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Shield, Clock, Zap, Globe, ArrowLeft } from "lucide-react";
import Image from "next/image";

export default function AboutPage() {
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

            {/* Main Content */}
            <main className="pt-40 pb-24">
                <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">

                    {/* Intro */}
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8 }}
                        className="mb-20 text-center md:text-left"
                    >
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-teal-50 text-teal-700 text-xs font-bold uppercase tracking-[0.2em] mb-8 border border-teal-100">
                            Our Story
                        </div>
                        <h1 className="text-4xl lg:text-6xl font-black text-slate-900 mb-8 tracking-tight leading-none">
                            Engineering Financial Clarity. <br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-600 to-emerald-600">Built in Hyderabad.</span>
                        </h1>
                        <p className="text-xl text-slate-500 leading-relaxed font-medium">
                            Fiinny is an institution-grade financial operating system. We combine bank-level security with consumer-grade design to give you absolute control over your net worth.
                            <span className="block mt-4 font-bold text-slate-900">No ads. No data selling. Just pure utility.</span>
                        </p>
                    </motion.div>

                    <div className="w-full h-px bg-slate-200 mb-20" />

                    {/* The Mission */}
                    <section className="mb-24">
                        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6">Our Mission</h2>
                        <div className="prose prose-lg text-slate-600 font-medium">
                            <p className="mb-6">
                                In a market flooded with loan apps disguised as trackers, <span className="text-teal-700 font-bold">Fiinny stands apart</span>. We are not here to sell you credit. We are here to help you build wealth.
                            </p>
                            <p>
                                Born in <strong>Hyderabad</strong>, a global hub of technology, our team engineers solutions that respect your privacy and your intelligence. We believe financial data is personal infrastructure, not a commodity.
                            </p>
                        </div>
                    </section>

                    {/* Principles Grid */}
                    <section className="mb-24">
                        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-8">Our Principles</h2>
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50 hover:shadow-2xl transition-shadow group">
                                <Shield className="w-8 h-8 text-teal-600 mb-6 group-hover:scale-110 transition-transform" />
                                <h3 className="text-xl font-bold text-slate-900 mb-3">Privacy First</h3>
                                <p className="text-slate-500 text-sm leading-relaxed font-medium">
                                    We practice data minimization. Your financial records are encrypted and strictly isolated. We do not monetize your behavior.
                                </p>
                            </div>
                            <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50 hover:shadow-2xl transition-shadow group">
                                <Clock className="w-8 h-8 text-teal-600 mb-6 group-hover:scale-110 transition-transform" />
                                <h3 className="text-xl font-bold text-slate-900 mb-3">Long-Term Reliability</h3>
                                <p className="text-slate-500 text-sm leading-relaxed font-medium">
                                    We ignore short-term trends to build durable infrastructure. This product is designed to manage your finances for decades.
                                </p>
                            </div>
                            <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50 hover:shadow-2xl transition-shadow group">
                                <Zap className="w-8 h-8 text-teal-600 mb-6 group-hover:scale-110 transition-transform" />
                                <h3 className="text-xl font-bold text-slate-900 mb-3">Speed & Utility</h3>
                                <p className="text-slate-500 text-sm leading-relaxed font-medium">
                                    Latency is a bug. Every interaction is engineered to be instant. We respect the limited time you have to manage your money.
                                </p>
                            </div>
                            <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50 hover:shadow-2xl transition-shadow group">
                                <Globe className="w-8 h-8 text-teal-600 mb-6 group-hover:scale-110 transition-transform" />
                                <h3 className="text-xl font-bold text-slate-900 mb-3">Global Neutrality</h3>
                                <p className="text-slate-500 text-sm leading-relaxed font-medium">
                                    Fiinny works in 190+ countries and supports any currency. We are not tied to a single banking system or region.
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* Closing */}
                    <section className="bg-slate-900 text-white p-12 rounded-[2.5rem] text-center relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

                        <div className="relative z-10">
                            <h3 className="text-2xl font-bold mb-4">A standard of care.</h3>
                            <p className="text-slate-400 mb-8 max-w-lg mx-auto font-medium">
                                We are continuously refining Fiinny to be the most reliable financial tool on the market. Thank you for trusting us with your journey.
                            </p>
                            <p className="text-sm font-mono text-teal-400/80">
                                Built with care in Hyderabad.
                            </p>
                        </div>
                    </section>

                </div>
            </main>
        </div>
    );
}
