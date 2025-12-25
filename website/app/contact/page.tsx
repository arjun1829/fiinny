"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Mail, MapPin, MessageSquare, ArrowRight, CheckCircle, Loader2 } from "lucide-react";

export default function ContactPage() {
    const [formData, setFormData] = useState({ name: "", email: "", message: "" });
    const [submitted, setSubmitted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        // Simulate network request
        await new Promise(resolve => setTimeout(resolve, 1500));
        setSubmitted(true);
        setIsSubmitting(false);
        setFormData({ name: "", email: "", message: "" });
        setTimeout(() => setSubmitted(false), 5000);
    };

    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-teal-100 selection:text-teal-900">

            {/* Navigation */}
            <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-2 group">
                        <div className="relative flex items-center justify-center w-8 h-8 rounded-xl bg-teal-600 text-white font-bold text-lg shadow-lg shadow-teal-600/20 transition-transform group-hover:scale-105">
                            F
                        </div>
                        <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-800 to-slate-600">
                            Fiinny
                        </span>
                    </Link>
                    <div className="hidden md:flex items-center gap-6">
                        <Link href="/" className="text-sm font-medium text-slate-600 hover:text-teal-600">Home</Link>
                        <Link href="/about" className="text-sm font-medium text-slate-600 hover:text-teal-600">About</Link>
                        <Link href="/contact" className="text-sm font-medium text-teal-600">Contact</Link>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <div className="bg-white border-b border-slate-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-24 text-center">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-50 border border-teal-100 text-teal-700 text-xs font-semibold uppercase tracking-wider mb-6">
                        <MessageSquare className="w-4 h-4" />
                        Support & Inquiries
                    </div>
                    <h1 className="text-4xl lg:text-5xl font-bold text-slate-900 mb-6 tracking-tight">
                        Contact our <span className="text-teal-600">Engineering Team.</span>
                    </h1>
                    <p className="text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
                        We build specifically for you. If you have feature requests, specialized needs, or technical feedback, we review every message directly.
                    </p>
                </div>
            </div>

            {/* Main Content */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
                <div className="grid lg:grid-cols-2 gap-16">

                    {/* Contact Info */}
                    <div>
                        <h2 className="text-2xl font-bold text-slate-900 mb-8">Direct Channels</h2>
                        <div className="space-y-8">
                            <div className="flex items-start gap-5">
                                <div className="w-12 h-12 bg-white border border-slate-200 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm">
                                    <Mail className="w-6 h-6 text-teal-600" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-900 mb-1">Email Support</h3>
                                    <p className="text-slate-600 mb-2">For general inquiries and account assistance.</p>
                                    <a href="mailto:support@fiinny.com" className="text-teal-600 font-semibold hover:text-teal-700 flex items-center gap-1 group">
                                        support@fiinny.com
                                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                    </a>
                                </div>
                            </div>

                            <div className="flex items-start gap-5">
                                <div className="w-12 h-12 bg-white border border-slate-200 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm">
                                    <MapPin className="w-6 h-6 text-teal-600" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-900 mb-1">Global Headquarters</h3>
                                    <p className="text-slate-600 mb-2">Our engineering and design center.</p>
                                    <address className="not-italic text-slate-500 text-sm">
                                        Hitech City, Hyderabad<br />
                                        Telangana, India 500081
                                    </address>
                                </div>
                            </div>
                        </div>

                        <div className="mt-12 p-8 bg-slate-100 rounded-2xl border border-slate-200">
                            <h3 className="font-bold text-slate-900 mb-2">Response Time Commitment</h3>
                            <p className="text-slate-600 text-sm leading-relaxed">
                                We are a dedicated team. For technical issues, we aim to respond within 24 hours. Enterprise inquiries are prioritized.
                            </p>
                        </div>
                    </div>

                    {/* Contact Form */}
                    <div className="bg-white p-8 md:p-10 rounded-3xl border border-slate-200 shadow-sm">
                        <h2 className="text-2xl font-bold text-slate-900 mb-6">Send us a message</h2>
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="grid md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Name</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-teal-500/10 transition-all text-slate-900 placeholder:text-slate-400"
                                        placeholder="John Doe"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Email</label>
                                    <input
                                        type="email"
                                        required
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-teal-500/10 transition-all text-slate-900 placeholder:text-slate-400"
                                        placeholder="john@example.com"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">Message</label>
                                <textarea
                                    required
                                    value={formData.message}
                                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                                    rows={5}
                                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-teal-500/10 transition-all text-slate-900 placeholder:text-slate-400 resize-none"
                                    placeholder="Tell us how we can help..."
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={isSubmitting || submitted}
                                className="w-full bg-slate-900 text-white px-6 py-4 rounded-xl font-bold hover:bg-slate-800 transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Sending...
                                    </>
                                ) : submitted ? (
                                    <>
                                        <CheckCircle className="w-5 h-5 text-teal-400" />
                                        Message Sent
                                    </>
                                ) : (
                                    "Send Message"
                                )}
                            </button>
                        </form>
                    </div>

                </div>
            </div>

            {/* Footer Simple */}
            <footer className="bg-white border-t border-slate-200 py-12 mt-12">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-slate-500 text-sm">
                    &copy; {new Date().getFullYear()} Fiinny. Built with care in Hyderabad.
                </div>
            </footer>

        </div>
    );
}
