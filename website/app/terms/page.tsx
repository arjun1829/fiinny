"use client";

import { motion } from "framer-motion";
import Link from "next/link";

export default function TermsPage() {
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
                    Terms and Conditions
                </motion.h1>
                <p className="text-gray-500 mb-8">Effective date: 18 Dec 2025</p>

                <div className="prose prose-lg max-w-none space-y-8 text-gray-600">
                    <p>
                        Welcome to Fiinny. By accessing or using our mobile application ("App") and website, you agree to be bound by these Terms and Conditions ("Terms"). If you disagree with any part of these terms, you may not access the Service.
                    </p>

                    <section>
                        <h2 className="text-2xl font-bold text-teal-600 mb-4">1. Use of Service</h2>
                        <ul className="list-disc pl-6 space-y-2">
                            <li><strong>Eligibility:</strong> You must be at least 13 years old to use this App.</li>
                            <li><strong>Account Security:</strong> You are responsible for maintaining the confidentiality of your account login and are fully responsible for all activities that occur under your account.</li>
                            <li><strong>License:</strong> Fiinny grants you a personal, non-transferable, non-exclusive license to use the App for personal finance usage.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-teal-600 mb-4">2. User Data & Privacy</h2>
                        <p>
                            Your privacy is important to us. Our collection and use of personal information are governed by our <Link href="/privacy" className="text-teal-600 hover:underline">Privacy Policy</Link>. By using the App, you consent to such processing and you warrant that all data provided by you is accurate.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-teal-600 mb-4">3. Prohibited Activities</h2>
                        <p>You agree not to:</p>
                        <ul className="list-disc pl-6 space-y-2 mt-2">
                            <li>Use the App for any illegal purpose or in violation of any local, state, national, or international law.</li>
                            <li>Reverse engineer, decompile, or attempt to extract the source code of the App.</li>
                            <li>Interfere with or disrupt the integrity or performance of the App.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-teal-600 mb-4">4. Intellectual Property</h2>
                        <p>
                            The App and its original content, features, and functionality are and will remain the exclusive property of Fiinny and its licensors. The Service is protected by copyright, trademark, and other laws.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-teal-600 mb-4">5. Disclaimer of Warranties</h2>
                        <p>
                            The App is provided on an "AS IS" and "AS AVAILABLE" basis. Fiinny makes no representations or warranties of any kind, express or implied, regarding the operation of the App or the information, content, or materials included.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-teal-600 mb-4">6. Limitation of Liability</h2>
                        <p>
                            In no event shall Fiinny, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-teal-600 mb-4">7. SMS Parsing (Android)</h2>
                        <p>
                            We provide features to parse SMS messages for transaction tracking. This uses local device processing where possible. We are not responsible for errors in parsing or missing transactions due to changes in bank SMS formats.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-teal-600 mb-4">8. Changes to Terms</h2>
                        <p>
                            We reserve the right, at our sole discretion, to modify or replace these Terms at any time. We will provide notice of any material changes via the App or website.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-teal-600 mb-4">9. Contact Us</h2>
                        <p>
                            If you have any questions about these Terms, please contact us at: <a href="mailto:arjuntanpureproduction11@gmail.com" className="text-teal-600 hover:underline">arjuntanpureproduction11@gmail.com</a>
                        </p>
                    </section>

                    <div className="mt-12 pt-8 border-t text-sm text-gray-500">
                        Fiinny - Your personal finance companion.
                    </div>
                </div>
            </div>
        </div>
    );
}
