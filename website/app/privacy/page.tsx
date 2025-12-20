"use client";

import { motion } from "framer-motion";
import Link from "next/link";

export default function PrivacyPage() {
    return (
        <div className="min-h-screen bg-white">
            {/* Simple Nav */}
            <nav className="container mx-auto px-6 py-6 flex justify-between items-center border-b">
                <Link href="/" className="flex items-center space-x-2">
                    <div className="w-8 h-8 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-lg flex items-center justify-center text-white font-bold">
                        F
                    </div>
                    <span className="text-xl font-bold text-teal-600">Fiinny</span>
                </Link>
                <Link href="/" className="text-teal-600 hover:text-emerald-700">← Back to Home</Link>
            </nav>

            {/* Content */}
            <div className="container mx-auto px-6 py-16 max-w-4xl">
                <motion.h1
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-4xl font-bold text-teal-600 mb-4"
                >
                    Privacy Policy
                </motion.h1>
                <div className="text-gray-500 mb-8 space-y-1">
                    <p>Effective date: 11 Sep 2025</p>
                    <p>Contact: <a href="mailto:arjuntanpureproduction11@gmail.com" className="text-teal-600 hover:underline">arjuntanpureproduction11@gmail.com</a></p>
                </div>

                <div className="prose prose-lg max-w-none space-y-8 text-gray-600">
                    <p>
                        Fiinny (“we”, “our”, “the App”) helps you track personal finances. We respect your privacy and explain here what we collect, why, and how you control it.
                    </p>

                    <section>
                        <h2 className="text-2xl font-bold text-teal-600 mb-4">1) Information we collect</h2>
                        <ul className="list-disc pl-6 space-y-2">
                            <li><strong>Account & profile (optional):</strong> phone/email, display name.</li>
                            <li><strong>Financial data you add:</strong> expenses, income, assets, goals, notes.</li>
                            <li><strong>Device & diagnostics:</strong> device model, OS version, app version, crash logs, approximate IP (for security/abuse prevention).</li>
                        </ul>
                        <p className="mt-4 font-semibold">Permissions-based data (optional):</p>
                        <ul className="list-disc pl-6 space-y-2 mt-2">
                            <li><strong>SMS (Android):</strong> access to read SMS solely to detect bank/NBFC transaction alerts (credits/debits/UPI/IMPS/NEFT). OTPs, personal chats, and promotions are ignored.</li>
                            <li><strong>Contacts (optional):</strong> if you choose to pick a contact (e.g., to tag a payer/split), we access only the selected contact; we do not upload your address book.</li>
                            <li><strong>Notifications (optional):</strong> to show reminders/updates.</li>
                            <li><strong>Storage/Media read (optional):</strong> to let you attach or import an image (e.g., bill/receipt) on supported Android versions.</li>
                        </ul>
                        <p className="mt-4">We do not collect precise location.</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-teal-600 mb-4">2) How we use data</h2>
                        <ul className="list-disc pl-6 space-y-2">
                            <li>Create and categorize transactions, show insights and goal progress.</li>
                            <li>Sync your data to your account if signed in.</li>
                            <li>Improve reliability and security (analytics/crash reports).</li>
                            <li>Send optional notifications you enable.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-teal-600 mb-4">3) SMS usage details (Android)</h2>
                        <ul className="list-disc pl-6 space-y-2">
                            <li><strong>Purpose:</strong> automatically add/categorize transactions from bank alert SMS.</li>
                            <li><strong>Scope:</strong> we parse only relevant fields (amount, date/time, bank/sender, masked account/card last-4 when present). We do not use SMS for ads, and we do not sell SMS data.</li>
                            <li><strong>Control:</strong> you can deny or revoke SMS permission anytime in Device Settings → Apps → Fiinny → Permissions → SMS. The app remains usable; you can add entries manually.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-teal-600 mb-4">4) Data storage & sharing</h2>
                        <ul className="list-disc pl-6 space-y-2">
                            <li><strong>Storage:</strong> on your device and, if you sign in, in our cloud (e.g., Google Firebase/Firestore/Storage).</li>
                            <li><strong>Security:</strong> encryption in transit (HTTPS/TLS) and access controls.</li>
                            <li><strong>Sharing:</strong> we do not sell your data. We may share with service providers (e.g., Firebase, crash reporting) only to operate the App under confidentiality and data-processing terms, and with authorities when required by law.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-teal-600 mb-4">5) Your choices & rights</h2>
                        <ul className="list-disc pl-6 space-y-2">
                            <li><strong>Permissions:</strong> grant/deny at any time in device settings.</li>
                            <li><strong>Access/Deletion:</strong> email <a href="mailto:arjuntanpureproduction11@gmail.com" className="text-teal-600 hover:underline">arjuntanpureproduction11@gmail.com</a> to get a copy or request deletion of your account data. You can also uninstall the App to stop collection on device.</li>
                            <li><strong>Children:</strong> we don’t knowingly collect data from children under 13.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-teal-600 mb-4">6) Retention</h2>
                        <p>We keep data for as long as your account is active or as needed to provide the service. Upon deletion requests, we delete or anonymize subject to legal obligations and backup safety windows.</p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-teal-600 mb-4">7) Changes</h2>
                        <p>We may update this policy and will change the “Effective date” above. Material changes will be highlighted in-app or on this page.</p>
                    </section>

                    <div className="mt-12 pt-8 border-t">
                        <p className="text-gray-500">
                            Contact: <a href="mailto:arjuntanpureproduction11@gmail.com" className="text-teal-600 hover:underline">arjuntanpureproduction11@gmail.com</a>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
