"use client";

import { motion } from "framer-motion";
import { Users, Target, Heart, Zap } from "lucide-react";
import Link from "next/link";

export default function AboutPage() {
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

            {/* Hero */}
            <section className="container mx-auto px-6 py-20 text-center">
                <motion.h1
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-teal to-tiffany bg-clip-text text-transparent mb-6"
                >
                    About Fiinny
                </motion.h1>
                <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="text-xl text-gray-600 max-w-3xl mx-auto"
                >
                    We're on a mission to make personal finance social, simple, and stress-free for everyone.
                </motion.p>
            </section>

            {/* Story */}
            <section className="container mx-auto px-6 py-16">
                <div className="max-w-4xl mx-auto">
                    <h2 className="text-3xl font-bold text-teal mb-6">Our Story</h2>
                    <div className="prose prose-lg text-gray-600 space-y-4">
                        <p>
                            Fiinny was born from a simple frustration: splitting bills with friends shouldn't be complicated.
                            Whether it's a group dinner, a weekend trip, or shared household expenses, managing money with
                            others should be as easy as sending a message.
                        </p>
                        <p>
                            We built Fiinny to bridge the gap between traditional finance apps and the way people actually
                            live their lives—together. By combining powerful expense tracking with social features, we've
                            created a platform that makes managing money feel natural and even enjoyable.
                        </p>
                        <p>
                            Today, over 10,000 users trust Fiinny to manage their shared finances, track expenses, and
                            achieve their financial goals together.
                        </p>
                    </div>
                </div>
            </section>

            {/* Values */}
            <section className="bg-gradient-to-b from-mint/10 to-white py-20">
                <div className="container mx-auto px-6">
                    <h2 className="text-3xl font-bold text-center text-teal mb-12">Our Values</h2>
                    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
                        {[
                            { icon: Users, title: "Community First", desc: "We build for people, not profits." },
                            { icon: Target, title: "Simplicity", desc: "Finance should be simple and accessible." },
                            { icon: Heart, title: "Trust", desc: "Your data and money are sacred to us." },
                            { icon: Zap, title: "Innovation", desc: "We constantly push boundaries." },
                        ].map((value, idx) => {
                            const Icon = value.icon;
                            return (
                                <motion.div
                                    key={idx}
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: idx * 0.1 }}
                                    className="text-center"
                                >
                                    <div className="w-16 h-16 bg-gradient-to-br from-teal to-tiffany rounded-2xl flex items-center justify-center mx-auto mb-4">
                                        <Icon className="w-8 h-8 text-white" />
                                    </div>
                                    <h3 className="font-bold text-teal mb-2">{value.title}</h3>
                                    <p className="text-gray-600 text-sm">{value.desc}</p>
                                </motion.div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* CTA */}
            <section className="container mx-auto px-6 py-20 text-center">
                <h2 className="text-3xl font-bold text-teal mb-6">Join Us</h2>
                <p className="text-gray-600 mb-8 max-w-2xl mx-auto">
                    Be part of a community that's redefining how we think about money and relationships.
                </p>
                <Link href="/login">
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="bg-gradient-to-r from-teal to-tiffany text-white px-8 py-4 rounded-full font-bold text-lg shadow-xl"
                    >
                        Get Started Free
                    </motion.button>
                </Link>
            </section>
        </div>
    );
}
