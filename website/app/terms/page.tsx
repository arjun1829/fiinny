"use client";

import { motion } from "framer-motion";
import Link from "next/link";

export default function TermsPage() {
    return (
        <div className="min-h-screen bg-white">
            {/* Simple Nav */}
            <nav className="container mx-auto px-6 py-6 flex justify-between items-center border-b">
                <Link href="/" className="flex items-center space-x-2">
                    <div className="w-8 h-8 bg-gradient-to-br from-teal to-tiffany rounded-lg flex items-center justify-center text-white font-bold">
                        F
                    </div>
                    <span className="text-xl font-bold text-teal">Fiinny</span>
                </Link>
                <Link href="/" className="text-teal hover:text-tiffany">← Back to Home</Link>
            </nav>

            {/* Content */}
            <div className="container mx-auto px-6 py-16 max-w-4xl">
                <motion.h1
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-4xl font-bold text-teal mb-4"
                >
                    Terms of Service
                </motion.h1>
                <p className="text-gray-500 mb-8">Last updated: November 24, 2025</p>

                <div className="prose prose-lg max-w-none space-y-8">
                    <section>
                        <h2 className="text-2xl font-bold text-teal mb-4">1. Acceptance of Terms</h2>
                        <p className="text-gray-600 leading-relaxed">
                            By accessing and using Fiinny, you accept and agree to be bound by the terms and provision of this agreement.
                            If you do not agree to these terms, please do not use our service.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-teal mb-4">2. Use of Service</h2>
                        <p className="text-gray-600 leading-relaxed">
                            You agree to use Fiinny only for lawful purposes and in accordance with these Terms. You agree not to:
                        </p>
                        <ul className="list-disc pl-6 text-gray-600 space-y-2">
                            <li>Use the service in any way that violates applicable laws or regulations</li>
                            <li>Attempt to gain unauthorized access to any portion of the service</li>
                            <li>Interfere with or disrupt the service or servers</li>
                            <li>Impersonate or attempt to impersonate Fiinny or another user</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-teal mb-4">3. User Accounts</h2>
                        <p className="text-gray-600 leading-relaxed">
                            When you create an account with us, you must provide accurate and complete information.
                            You are responsible for safeguarding your account and for all activities that occur under your account.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-teal mb-4">4. Financial Information</h2>
                        <p className="text-gray-600 leading-relaxed">
                            Fiinny is a tool for tracking and managing expenses. We are not a financial institution and do not:
                        </p>
                        <ul className="list-disc pl-6 text-gray-600 space-y-2">
                            <li>Hold or transfer actual funds</li>
                            <li>Provide financial, investment, or legal advice</li>
                            <li>Guarantee the accuracy of third-party financial data</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-teal mb-4">5. Intellectual Property</h2>
                        <p className="text-gray-600 leading-relaxed">
                            The service and its original content, features, and functionality are owned by Fiinny and are protected
                            by international copyright, trademark, and other intellectual property laws.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-teal mb-4">6. Limitation of Liability</h2>
                        <p className="text-gray-600 leading-relaxed">
                            Fiinny shall not be liable for any indirect, incidental, special, consequential, or punitive damages
                            resulting from your use or inability to use the service.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-teal mb-4">7. Termination</h2>
                        <p className="text-gray-600 leading-relaxed">
                            We may terminate or suspend your account immediately, without prior notice, for any reason, including
                            breach of these Terms.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-teal mb-4">8. Changes to Terms</h2>
                        <p className="text-gray-600 leading-relaxed">
                            We reserve the right to modify these terms at any time. We will notify users of any material changes
                            via email or through the service.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-teal mb-4">9. Contact Us</h2>
                        <p className="text-gray-600 leading-relaxed">
                            If you have any questions about these Terms, please contact us at:
                            <br />
                            <a href="mailto:legal@fiinny.com" className="text-tiffany hover:underline">legal@fiinny.com</a>
                        </p>
                    </section>
                </div>
            </div>
        </div>
    );
}
