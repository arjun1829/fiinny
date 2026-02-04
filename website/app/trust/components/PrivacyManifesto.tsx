'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

const ManifestoItem = ({ title, description, index }: { title: string, description: string, index: number }) => (
    <motion.div
        initial={{ opacity: 0, x: -20 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ delay: index * 0.2, duration: 0.6 }}
        className="flex gap-6 mb-12 last:mb-0"
    >
        <div className="flex-shrink-0 mt-1">
            <div className="w-8 h-8 rounded-full bg-teal-50 flex items-center justify-center border border-teal-200">
                <Check className="w-5 h-5 text-teal-600" />
            </div>
        </div>
        <div>
            <h3 className="text-2xl font-bold text-slate-900 mb-2">{title}</h3>
            <p className="text-slate-600 text-lg leading-relaxed">{description}</p>
        </div>
    </motion.div>
);

export default function PrivacyManifesto() {
    return (
        <section className="bg-white py-24 relative overflow-hidden border-t border-slate-100">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid md:grid-cols-2 gap-16 items-start">

                {/* Sticky Header */}
                <div className="md:sticky md:top-24">
                    <motion.div
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                    >
                        <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6">
                            We Don't <span className="text-rose-500">Sell</span> You. <br />
                            Period.
                        </h2>
                        <p className="text-slate-600 text-lg mb-8 max-w-md">
                            In an industry built on data brokering, we are the anomaly.
                            Our business model is simple: You pay us for a service.
                            We protect your data.
                        </p>

                        <div className="inline-block p-6 rounded-2xl bg-slate-50 border border-slate-200 shadow-sm">
                            <p className="font-serif italic text-slate-700 mb-4">
                                "Your financial footprint is as personal as your fingerprint.
                                It belongs to you, and nobody else."
                            </p>
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-teal-400 to-blue-500 shadow-md" />
                                <div>
                                    <div className="text-slate-900 font-bold">The Founders</div>
                                    <div className="text-slate-500 text-xs">Fiinny, Inc.</div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>

                {/* Scrollable Manifesto */}
                <div className="pt-8">
                    <ManifestoItem
                        index={0}
                        title="No Third-Party Sharing"
                        description="We never share your transaction data with loan agencies, credit bureaus, or marketing firms."
                    />
                    <ManifestoItem
                        index={1}
                        title="Zero Targeted Ads"
                        description="We don't build an ad profile on you. Your spending habits are not products for advertisers."
                    />
                    <ManifestoItem
                        index={2}
                        title="You Hold the Keys"
                        description="Delete your account, and your data is wiped instantly from our servers and your device. No 'soft deletes'."
                    />
                    <ManifestoItem
                        index={3}
                        title="Transparent Revenue"
                        description="We make money from premium subscriptions, not by selling your secrets."
                    />
                </div>

            </div>
        </section>
    );
}
