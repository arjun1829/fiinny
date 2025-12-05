"use client";

import { motion } from "framer-motion";
import { Mail, MessageSquare, MapPin } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export default function ContactPage() {
    const [formData, setFormData] = useState({ name: "", email: "", message: "" });
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // In a real app, send to backend
        setSubmitted(true);
        setTimeout(() => setSubmitted(false), 3000);
    };

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
                    className="text-5xl font-bold bg-gradient-to-r from-teal to-tiffany bg-clip-text text-transparent mb-6"
                >
                    Get in Touch
                </motion.h1>
                <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="text-xl text-gray-600 max-w-2xl mx-auto"
                >
                    Have questions? We'd love to hear from you.
                </motion.p>
            </section>

            {/* Contact Info + Form */}
            <section className="container mx-auto px-6 py-16">
                <div className="grid md:grid-cols-2 gap-12 max-w-5xl mx-auto">
                    {/* Contact Info */}
                    <div className="space-y-8">
                        <div>
                            <h2 className="text-2xl font-bold text-teal mb-6">Contact Information</h2>
                            <div className="space-y-4">
                                <div className="flex items-start space-x-4">
                                    <div className="w-12 h-12 bg-mint/30 rounded-xl flex items-center justify-center flex-shrink-0">
                                        <Mail className="w-6 h-6 text-teal" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-teal">Email</h3>
                                        <p className="text-gray-600">support@fiinny.com</p>
                                    </div>
                                </div>

                                <div className="flex items-start space-x-4">
                                    <div className="w-12 h-12 bg-mint/30 rounded-xl flex items-center justify-center flex-shrink-0">
                                        <MessageSquare className="w-6 h-6 text-teal" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-teal">Live Chat</h3>
                                        <p className="text-gray-600">Available Mon-Fri, 9am-6pm IST</p>
                                    </div>
                                </div>

                                <div className="flex items-start space-x-4">
                                    <div className="w-12 h-12 bg-mint/30 rounded-xl flex items-center justify-center flex-shrink-0">
                                        <MapPin className="w-6 h-6 text-teal" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-teal">Office</h3>
                                        <p className="text-gray-600">Bangalore, India</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Contact Form */}
                    <div className="bg-gradient-to-br from-mint/10 to-tiffany/10 p-8 rounded-3xl">
                        <h2 className="text-2xl font-bold text-teal mb-6">Send us a Message</h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-teal mb-2">Name</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20"
                                    placeholder="Your name"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-teal mb-2">Email</label>
                                <input
                                    type="email"
                                    required
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20"
                                    placeholder="your@email.com"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-teal mb-2">Message</label>
                                <textarea
                                    required
                                    value={formData.message}
                                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                                    rows={5}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20 resize-none"
                                    placeholder="How can we help?"
                                />
                            </div>

                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                type="submit"
                                className="w-full bg-gradient-to-r from-teal to-tiffany text-white px-6 py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transition"
                            >
                                {submitted ? "Message Sent! ✓" : "Send Message"}
                            </motion.button>
                        </form>
                    </div>
                </div>
            </section>
        </div>
    );
}
