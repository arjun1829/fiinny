"use client";

import { motion } from "framer-motion";
import Link from "next/link";

export default function PrivacyPage() {
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
                    Privacy Policy
                </motion.h1>
                <p className="text-gray-500 mb-8">Last updated: November 24, 2025</p>

                <div className="prose prose-lg max-w-none space-y-8">
                    <section>
                        <h2 className="text-2xl font-bold text-teal mb-4">1. Information We Collect</h2>
                        <p className="text-gray-600 leading-relaxed">
                            We collect information you provide directly to us, including:
                        </p>
                        <ul className="list-disc pl-6 text-gray-600 space-y-2">
                            <li>Phone number (for authentication)</li>
                            <li>Transaction data (expenses, incomes, categories)</li>
                            <li>Profile information (name, avatar)</li>
                            <li>Device information (for security and analytics)</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-teal mb-4">2. How We Use Your Information</h2>
                        <p className="text-gray-600 leading-relaxed">
                            We use the information we collect to:
                        </p>
                        <ul className="list-disc pl-6 text-gray-600 space-y-2">
                            <li>Provide, maintain, and improve our services</li>
                            <li>Process transactions and send related information</li>
                            <li>Send technical notices and support messages</li>
                            <li>Detect and prevent fraud and abuse</li>
                            <li>Personalize your experience</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-teal mb-4">3. Data Security</h2>
                        <p className="text-gray-600 leading-relaxed">
                            We implement industry-standard security measures to protect your data:
                        </p>
                        <ul className="list-disc pl-6 text-gray-600 space-y-2">
                            <li>End-to-end encryption for sensitive data</li>
                            <li>Secure Firebase authentication</li>
                            <li>Regular security audits</li>
                            <li>Compliance with GDPR and data protection regulations</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-teal mb-4">4. Data Sharing</h2>
                        <p className="text-gray-600 leading-relaxed">
                            We do not sell your personal information. We may share your information only in the following circumstances:
                        </p>
                        <ul className="list-disc pl-6 text-gray-600 space-y-2">
                            <li>With your explicit consent</li>
                            <li>With service providers who assist our operations</li>
                            <li>To comply with legal obligations</li>
                            <li>To protect our rights and prevent fraud</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-teal mb-4">5. Your Rights</h2>
                        <p className="text-gray-600 leading-relaxed">
                            You have the right to:
                        </p>
                        <ul className="list-disc pl-6 text-gray-600 space-y-2">
                            <li>Access your personal data</li>
                            <li>Correct inaccurate data</li>
                            <li>Request deletion of your data</li>
                            <li>Export your data</li>
                            <li>Opt-out of marketing communications</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-teal mb-4">6. Contact Us</h2>
                        <p className="text-gray-600 leading-relaxed">
                            If you have questions about this Privacy Policy, please contact us at:
                            <br />
                            <a href="mailto:privacy@fiinny.com" className="text-tiffany hover:underline">privacy@fiinny.com</a>
                        </p>
                    </section>
                </div>
            </div>
        </div>
    );
}
