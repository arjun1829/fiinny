"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPage() {
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
                        Privacy Policy
                    </h1>
                    <p className="text-lg text-slate-500 font-medium">
                        Last Updated: September 11, 2025
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
                            Fiinny (“we”, “our”, “the App”) helps you track personal finances. We respect your privacy and explain here what we collect, why, and how you control it.
                        </p>

                        <section className="mt-12">
                            <h2 className="text-2xl font-bold flex items-center gap-3">
                                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-teal-100 text-teal-700 text-sm">1</span>
                                Information we collect
                            </h2>
                            <ul className="list-disc pl-6 space-y-2 mt-6">
                                <li><strong>Account & profile (optional):</strong> phone/email, display name.</li>
                                <li><strong>Financial data you add:</strong> expenses, income, assets, goals, notes.</li>
                                <li><strong>Device & diagnostics:</strong> device model, OS version, app version, crash logs, approximate IP (for security/abuse prevention).</li>
                            </ul>
                            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 mt-6">
                                <p className="font-bold text-slate-900 mb-2">Permissions-based data (optional):</p>
                                <ul className="list-disc pl-6 space-y-2">
                                    <li><strong>SMS (Android):</strong> access to read SMS solely to detect bank/NBFC transaction alerts (credits/debits/UPI/IMPS/NEFT). OTPs, personal chats, and promotions are ignored.</li>
                                    <li><strong>Contacts (optional):</strong> if you choose to pick a contact (e.g., to tag a payer/split), we access only the selected contact; we do not upload your address book.</li>
                                    <li><strong>Notifications (optional):</strong> to show reminders/updates.</li>
                                    <li><strong>Storage/Media read (optional):</strong> to let you attach or import an image (e.g., bill/receipt) on supported Android versions.</li>
                                </ul>
                            </div>
                            <p className="mt-4 text-sm text-slate-500 font-medium">We do not collect precise location.</p>
                        </section>

                        <section className="mt-12">
                            <h2 className="text-2xl font-bold flex items-center gap-3">
                                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-teal-100 text-teal-700 text-sm">2</span>
                                How we use data
                            </h2>
                            <ul className="list-disc pl-6 space-y-2 mt-6">
                                <li>Create and categorize transactions, show insights and goal progress.</li>
                                <li>Sync your data to your account if signed in.</li>
                                <li>Improve reliability and security (analytics/crash reports).</li>
                                <li>Send optional notifications you enable.</li>
                            </ul>
                        </section>

                        <section className="mt-12">
                            <h2 className="text-2xl font-bold flex items-center gap-3">
                                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-teal-100 text-teal-700 text-sm">3</span>
                                SMS usage details (Android)
                            </h2>
                            <ul className="list-disc pl-6 space-y-2 mt-6">
                                <li><strong>Purpose:</strong> automatically add/categorize transactions from bank alert SMS.</li>
                                <li><strong>Scope:</strong> we parse only relevant fields (amount, date/time, bank/sender, masked account/card last-4 when present). We do not use SMS for ads, and we do not sell SMS data.</li>
                                <li><strong>Control:</strong> you can deny or revoke SMS permission anytime in Device Settings → Apps → Fiinny → Permissions → SMS. The app remains usable; you can add entries manually.</li>
                            </ul>
                        </section>

                        <section className="mt-12">
                            <h2 className="text-2xl font-bold flex items-center gap-3">
                                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-teal-100 text-teal-700 text-sm">4</span>
                                Data storage & sharing
                            </h2>
                            <ul className="list-disc pl-6 space-y-2 mt-6">
                                <li><strong>Storage:</strong> on your device and, if you sign in, in our cloud (e.g., Google Firebase/Firestore/Storage).</li>
                                <li><strong>Security:</strong> encryption in transit (HTTPS/TLS) and access controls.</li>
                                <li><strong>Sharing:</strong> we do not sell your data. We may share with service providers (e.g., Firebase, crash reporting) only to operate the App under confidentiality and data-processing terms, and with authorities when required by law.</li>
                            </ul>
                        </section>

                        <section className="mt-12">
                            <h2 className="text-2xl font-bold flex items-center gap-3">
                                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-teal-100 text-teal-700 text-sm">5</span>
                                Your choices & rights
                            </h2>
                            <ul className="list-disc pl-6 space-y-2 mt-6">
                                <li><strong>Permissions:</strong> grant/deny at any time in device settings.</li>
                                <li><strong>Access/Deletion:</strong> email <a href="mailto:arjuntanpureproduction11@gmail.com">arjuntanpureproduction11@gmail.com</a> to get a copy or request deletion of your account data. You can also uninstall the App to stop collection on device.</li>
                                <li><strong>Children:</strong> we don’t knowingly collect data from children under 13.</li>
                            </ul>
                        </section>

                        <section className="mt-12">
                            <h2 className="text-2xl font-bold flex items-center gap-3">
                                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-teal-100 text-teal-700 text-sm">6</span>
                                Retention & Changes
                            </h2>
                            <p className="mt-6">We keep data for as long as your account is active or as needed to provide the service. We may update this policy and will change the “Effective date” above.</p>
                        </section>

                        <div className="mt-16 pt-8 border-t border-slate-100">
                            <p className="text-slate-500 text-sm font-medium">
                                Contact for privacy concerns: <a href="mailto:arjuntanpureproduction11@gmail.com" className="font-bold text-teal-600 hover:underline">arjuntanpureproduction11@gmail.com</a>
                            </p>
                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
