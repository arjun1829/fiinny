"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Shield, Clock, Zap, Globe } from "lucide-react";
import Image from "next/image";

export default function AboutPage() {
    return (
        <div className="min-h-screen bg-slate-50 font-sans selection:bg-teal-100 selection:text-teal-900">
            {/* Header / Nav */}
            <nav className="fixed w-full bg-white/95 backdrop-blur-lg z-50 border-b border-slate-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-20">
                        <Link href="/" className="flex items-center gap-2">
                            <Image src="/assets/images/logo_icon.png" alt="Fiinny" width={24} height={24} className="w-6 h-6" />
                            <span className="text-xl font-bold text-slate-900">Fiinny</span>
                        </Link>
                        <Link href="/" className="text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors">
                            Close
                        </Link>
                    </div>
                </div>
            </nav>

            {/* Main Content */}
            <main className="pt-32 pb-24">
                <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">

                    {/* Intro */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                        className="mb-20"
                    >
                        <h1 className="text-4xl lg:text-5xl font-bold text-slate-900 mb-8 tracking-tight leading-tight">
                            Engineering Financial Clarity. <br />
                            <span className="text-slate-400">Built in Hyderabad for the World.</span>
                        </h1>
                        <p className="text-xl text-slate-600 leading-relaxed">
                            Fiinny is an institution-grade financial operating system. We combine bank-level security with consumer-grade design to give you absolute control over your net worth.
                            <span className="block mt-4 font-semibold text-slate-900">No ads. No data selling. Just pure utility.</span>
                        </p>
                    </motion.div>

                    <div className="w-full h-px bg-slate-200 mb-20" />

                    {/* The Mission */}
                    <section className="mb-24">
                        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6">Our Mission</h2>
                        <div className="prose prose-lg text-slate-600">
                            <p className="mb-6">
                                In a market flooded with loan apps disguised as trackers, Fiinny stands apart. We are not here to sell you credit. We are here to help you build wealth.
                            </p>
                            <p>
                                Born in <strong>Hyderabad</strong>, a global hub of technology, our team engineers solutions that respect your privacy and your intelligence. We believe financial data is personal infrastructure, not a commodity.
                            </p>
                        </div>
                    </section>

                    {/* Principles Grid */}
                    <section className="mb-24">
                        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-8">Our Principles</h2>
                        <div className="grid md:grid-cols-2 gap-8">
                            <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm">
                                <Shield className="w-6 h-6 text-teal-600 mb-4" />
                                <h3 className="text-lg font-bold text-slate-900 mb-2">Privacy First</h3>
                                <p className="text-slate-500 text-sm leading-relaxed">
                                    We practice data minimization. Your financial records are encrypted and strictly isolated. We do not monetize your behavior.
                                </p>
                            </div>
                            <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm">
                                <Clock className="w-6 h-6 text-teal-600 mb-4" />
                                <h3 className="text-lg font-bold text-slate-900 mb-2">Long-Term Reliability</h3>
                                <p className="text-slate-500 text-sm leading-relaxed">
                                    We ignore short-term trends to build durable infrastructure. This product is designed to manage your finances for decades, not months.
                                </p>
                            </div>
                            <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm">
                                <Zap className="w-6 h-6 text-teal-600 mb-4" />
                                <h3 className="text-lg font-bold text-slate-900 mb-2">Speed & Utility</h3>
                                <p className="text-slate-500 text-sm leading-relaxed">
                                    Latency is a bug. Every interaction is engineered to be instant. We respect the limited time you have to manage your money.
                                </p>
                            </div>
                            <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm">
                                <Globe className="w-6 h-6 text-teal-600 mb-4" />
                                <h3 className="text-lg font-bold text-slate-900 mb-2">Global Neutrality</h3>
                                <p className="text-slate-500 text-sm leading-relaxed">
                                    Fiinny works in 190+ countries and supports any currency. We are not tied to a single banking system or region.
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* Closing */}
                    <section className="bg-slate-900 text-white p-10 rounded-3xl text-center">
                        <h3 className="text-xl font-bold mb-4">A standard of care.</h3>
                        <p className="text-slate-400 mb-8 max-w-lg mx-auto">
                            We are continuously refining Fiinny to be the most reliable financial tool on the market. Thank you for trusting us with your journey.
                        </p>
                        <p className="text-sm font-mono text-slate-500">
                            Built with care in Hyderabad.
                        </p>
                    </section>

                </div>
            </main>
        </div>
    );
}
