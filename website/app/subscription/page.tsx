"use client";

"use client";

import Link from "next/link";
import Image from "next/image";
import { Zap, ArrowLeft, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";

export default function SubscriptionPage() {
    return (
        <div className="min-h-screen bg-black text-white selection:bg-teal-500/30">

            {/* Navbar Placeholder / Back Button */}
            <nav className="p-6 flex items-center justify-between max-w-7xl mx-auto w-full">
                <Link href="/dashboard" className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors">
                    <ArrowLeft className="w-5 h-5" />
                    <span>Back to Dashboard</span>
                </Link>
                <div className="text-xl font-bold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-cyan-500">
                    SMART TRACKER
                </div>
            </nav>

            <div className="max-w-4xl mx-auto px-4 py-12">
                <div className="grid gap-8">

                    {/* HIDDEN CHARGES ALERT */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-red-500/10 border border-red-500/20 rounded-3xl p-6"
                    >
                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-red-500/20 rounded-full">
                                <AlertCircle className="w-6 h-6 text-red-500" />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-red-200 mb-1">Hidden Charges Detected</h3>
                                <p className="text-red-200/60 text-sm mb-4">We found 2 sneaky fees in your recent transactions. You might want to dispute these.</p>

                                <div className="space-y-3">
                                    <div className="flex justify-between items-center bg-black/20 p-3 rounded-xl border border-red-500/10">
                                        <span className="text-red-100 font-medium">Forex Markup Fee</span>
                                        <span className="text-red-400 font-bold">-₹45.00</span>
                                    </div>
                                    <div className="flex justify-between items-center bg-black/20 p-3 rounded-xl border border-red-500/10">
                                        <span className="text-red-100 font-medium">ATM Surcharge</span>
                                        <span className="text-red-400 font-bold">-₹20.00</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>

                    {/* SUBSCRIPTION LIST */}
                    <div>
                        <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                            <Zap className="w-6 h-6 text-teal-400" />
                            Active Subscriptions
                        </h2>

                        <div className="space-y-4">
                            {/* Item 1 */}
                            <motion.div
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.1 }}
                                className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 flex items-center justify-between hover:border-teal-500/30 transition-colors group"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-zinc-800 rounded-2xl flex items-center justify-center text-red-500 font-bold text-xl">N</div>
                                    <div>
                                        <h4 className="font-bold text-lg group-hover:text-teal-400 transition-colors">Netflix</h4>
                                        <p className="text-zinc-500 text-sm">Due in 5 days</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-xl font-bold">₹649</div>
                                    <div className="text-zinc-600 text-xs">/month</div>
                                </div>
                            </motion.div>

                            {/* Item 2 */}
                            <motion.div
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.2 }}
                                className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 flex items-center justify-between hover:border-teal-500/30 transition-colors group"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-zinc-800 rounded-2xl flex items-center justify-center text-green-500 font-bold text-xl">S</div>
                                    <div>
                                        <h4 className="font-bold text-lg group-hover:text-teal-400 transition-colors">Spotify</h4>
                                        <p className="text-zinc-500 text-sm">Due in 12 days</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-xl font-bold">₹119</div>
                                    <div className="text-zinc-600 text-xs">/month</div>
                                </div>
                            </motion.div>

                            {/* Item 3 */}
                            <motion.div
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.3 }}
                                className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 flex items-center justify-between hover:border-teal-500/30 transition-colors group"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-zinc-800 rounded-2xl flex items-center justify-center text-blue-500 font-bold text-xl">G</div>
                                    <div>
                                        <h4 className="font-bold text-lg group-hover:text-teal-400 transition-colors">Google One</h4>
                                        <p className="text-orange-400 text-sm font-medium">Due Tomorrow!</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-xl font-bold">₹130</div>
                                    <div className="text-zinc-600 text-xs">/month</div>
                                </div>
                            </motion.div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Helper components not needed as we inlined list items for specific styling
