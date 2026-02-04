"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Smartphone, Apple, Play } from "lucide-react";
import { motion } from "framer-motion";

export default function DownloadPage() {
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

            {/* Main Content */}
            <div className="pt-40 pb-24 px-4 sm:px-6 lg:px-8 relative z-10 text-center">

                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    className="max-w-4xl mx-auto mb-16"
                >
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-teal-50 text-teal-700 text-xs font-bold uppercase tracking-[0.2em] mb-8 border border-teal-100">
                        Available everywhere
                    </div>
                    <h1 className="text-5xl lg:text-7xl font-black text-slate-900 mb-8 tracking-tight leading-none">
                        Financial clarity in <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-600 to-emerald-600">your pocket.</span>
                    </h1>
                    <p className="text-xl text-slate-500 leading-relaxed font-medium max-w-2xl mx-auto mb-12">
                        Get the full Fiinny experience on iOS and Android. Auto-parsing, realtime insights, and effortless tracking wherever you go.
                    </p>

                    <div className="flex flex-col md:flex-row items-center justify-center gap-8">

                        {/* iOS Card */}
                        <motion.a
                            href="#"
                            whileHover={{ y: -5 }}
                            className="bg-white p-8 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col items-center gap-6 w-full max-w-xs group transition-all hover:shadow-2xl hover:border-slate-200"
                        >
                            <div className="w-16 h-16 rounded-2xl bg-slate-900 text-white flex items-center justify-center">
                                <Apple className="w-8 h-8 fill-current" />
                            </div>
                            <div className="text-center">
                                <h3 className="text-xl font-bold text-slate-900">App Store</h3>
                                <p className="text-slate-400 font-medium text-sm">Download for iOS</p>
                            </div>
                            <div className="px-6 py-3 rounded-full bg-slate-900 text-white font-bold text-sm w-full group-hover:bg-teal-600 transition-colors">
                                Download
                            </div>
                        </motion.a>

                        {/* Android Card */}
                        <motion.a
                            href="#"
                            whileHover={{ y: -5 }}
                            className="bg-white p-8 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col items-center gap-6 w-full max-w-xs group transition-all hover:shadow-2xl hover:border-slate-200"
                        >
                            <div className="w-16 h-16 rounded-2xl bg-teal-600 text-white flex items-center justify-center">
                                <Smartphone className="w-8 h-8 fill-current" />
                            </div>
                            <div className="text-center">
                                <h3 className="text-xl font-bold text-slate-900">Play Store</h3>
                                <p className="text-slate-400 font-medium text-sm">Download for Android</p>
                            </div>
                            <div className="px-6 py-3 rounded-full bg-slate-900 text-white font-bold text-sm w-full group-hover:bg-teal-600 transition-colors">
                                Download
                            </div>
                        </motion.a>

                    </div>

                </motion.div>

                {/* QR Section */}
                <motion.div
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    className="max-w-md mx-auto bg-white rounded-3xl p-8 border border-slate-100 shadow-lg relative overflow-hidden"
                >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-teal-50 rounded-bl-full -z-0" />

                    <div className="relative z-10 flex flex-col items-center gap-6">
                        <div className="w-48 h-48 bg-slate-900 rounded-2xl flex items-center justify-center text-white/20">
                            {/* Placeholder for actual QR */}
                            <svg className="w-32 h-32" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M3 3h6v6H3V3zm2 2v2h2V5H5zm8-2h6v6h-6V3zm2 2v2h2V5h-2zM3 13h6v6H3v-6zm2 2v2h2v-2H5zm13-2h3v2h-3v-2zm-3 2h3v2h-3v-2zm3 2h3v2h-3v-2zm-3 2h3v2h-3v-2z" />
                            </svg>
                        </div>
                        <p className="text-slate-500 font-medium text-sm">
                            Scan to download instantly on your phone
                        </p>
                    </div>
                </motion.div>

            </div>
        </div>
    );
}
