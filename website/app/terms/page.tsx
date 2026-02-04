"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";

export default function TermsPage() {
    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-teal-100 selection:text-teal-900 overflow-x-hidden">

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
            <div className="pt-40 pb-24 px-4 sm:px-6 container mx-auto max-w-4xl relative z-10">

                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    className="text-center mb-16"
                >
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-teal-50 text-teal-700 text-xs font-bold uppercase tracking-[0.2em] mb-8 border border-teal-100">
                        Legal
                    </div>
                    <h1 className="text-4xl md:text-6xl font-black mb-6 tracking-tight text-slate-900">
                        Terms of Service
                    </h1>
                    <p className="text-lg text-slate-500 font-medium">
                        Last Updated: December 18, 2025
                    </p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.8 }}
                    className="bg-white p-8 md:p-12 rounded-[2.5rem] border border-slate-100 shadow-2xl shadow-slate-200/50"
                >
                    <div className="prose prose-lg max-w-none prose-slate prose-headings:font-bold prose-headings:text-slate-900 prose-p:text-slate-600 prose-li:text-slate-600 prose-a:text-teal-600 hover:prose-a:text-teal-700">
                        <p className="lead font-medium text-slate-700">
                            Welcome to Fiinny. By accessing or using our mobile application ("App") and website, you agree to be bound by these Terms and Conditions ("Terms").
                        </p>

                        <section className="mt-12">
                            <h2 className="text-2xl font-bold flex items-center gap-3">
                                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-teal-100 text-teal-700 text-sm">1</span>
                                Use of Service
                            </h2>
                            <ul className="list-disc pl-6 space-y-2 mt-6">
                                <li><strong>Eligibility:</strong> You must be at least 13 years old to use this App.</li>
                                <li><strong>Account Security:</strong> You are responsible for maintaining the confidentiality of your account login and are fully responsible for all activities that occur under your account.</li>
                                <li><strong>License:</strong> Fiinny grants you a personal, non-transferable, non-exclusive license to use the App for personal finance usage.</li>
                            </ul>
                        </section>

                        <section className="mt-12">
                            <h2 className="text-2xl font-bold flex items-center gap-3">
                                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-teal-100 text-teal-700 text-sm">2</span>
                                User Data & Privacy
                            </h2>
                            <p className="mt-6">
                                Your privacy is important to us. Our collection and use of personal information are governed by our <Link href="/privacy" className="font-bold underline">Privacy Policy</Link>. By using the App, you consent to such processing.
                            </p>
                        </section>

                        <section className="mt-12">
                            <h2 className="text-2xl font-bold flex items-center gap-3">
                                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-teal-100 text-teal-700 text-sm">3</span>
                                Prohibited Activities
                            </h2>
                            <p className="mt-6">You agree not to:</p>
                            <ul className="list-disc pl-6 space-y-2 mt-4">
                                <li>Use the App for any illegal purpose or in violation of any local, state, national, or international law.</li>
                                <li>Reverse engineer, decompile, or attempt to extract the source code of the App.</li>
                                <li>Interfere with or disrupt the integrity or performance of the App.</li>
                            </ul>
                        </section>

                        <section className="mt-12">
                            <h2 className="text-2xl font-bold flex items-center gap-3">
                                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-teal-100 text-teal-700 text-sm">4</span>
                                Intellectual Property
                            </h2>
                            <p className="mt-6">
                                The App and its original content, features, and functionality are and will remain the exclusive property of Fiinny and its licensors.
                            </p>
                        </section>

                        <section className="mt-12">
                            <h2 className="text-2xl font-bold flex items-center gap-3">
                                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-teal-100 text-teal-700 text-sm">5</span>
                                Disclaimers & Liability
                            </h2>
                            <p className="mt-6">
                                The App is provided "AS IS". Fiinny makes no warranties regarding the operation of the App. In no event shall Fiinny be liable for any indirect or consequential damages.
                            </p>
                        </section>

                        <section className="mt-12">
                            <h2 className="text-2xl font-bold flex items-center gap-3">
                                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-teal-100 text-teal-700 text-sm">6</span>
                                SMS Parsing (Android)
                            </h2>
                            <p className="mt-6">
                                We provide features to parse SMS messages for transaction tracking using local device processing. We are not responsible for errors in parsing due to changes in bank SMS formats.
                            </p>
                        </section>

                        <div className="mt-16 pt-8 border-t border-slate-100">
                            <p className="text-slate-500 text-sm font-medium">
                                Contact: <a href="mailto:arjuntanpureproduction11@gmail.com" className="font-bold text-teal-600 hover:underline">arjuntanpureproduction11@gmail.com</a>
                            </p>
                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
