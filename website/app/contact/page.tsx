'use client';

import React from 'react';
import Link from 'next/link';
import { Mail, MapPin, MessageSquare, Clock } from 'lucide-react';

// Navbar Component (Duplicate from Trust Page for consistency if not global, 
// using a simplified version here or assuming Layout handles it. 
// Adding a simple internal nav for standalone look matching screenshot)
const ContactNavbar = () => (
    <nav className="w-full bg-white border-b border-slate-100 py-4 px-6 md:px-12 flex justify-between items-center">
        <Link href="/" className="flex items-center gap-2 group">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-teal-600 text-white font-bold text-lg">F</div>
            <span className="text-xl font-bold text-slate-900 tracking-tight">Fiinny</span>
        </Link>
        <div className="hidden md:flex gap-8 text-sm font-medium text-slate-600">
            <Link href="/" className="hover:text-teal-600">Home</Link>
            <Link href="/about" className="hover:text-teal-600">About</Link>
            <Link href="/contact" className="text-teal-600">Contact</Link>
        </div>
    </nav>
);

export default function ContactPage() {
    return (
        <div className="min-h-screen bg-white text-slate-900 font-sans">
            <ContactNavbar />

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">

                {/* Header Section */}
                <div className="text-center max-w-3xl mx-auto mb-20 animate-fade-in-up">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-50 border border-teal-100 text-teal-600 text-xs font-bold uppercase tracking-wider mb-6">
                        <MessageSquare size={12} />
                        <span>Support & Inquiries</span>
                    </div>
                    <h1 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900 mb-6">
                        Contact our <span className="text-teal-600">Engineering Team.</span>
                    </h1>
                    <p className="text-lg text-slate-600 leading-relaxed">
                        We build specifically for you. If you have feature requests, specialized needs, or
                        technical feedback, we review every message directly.
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">

                    {/* Left Column: Direct Channels */}
                    <div className="lg:col-span-5 space-y-8">
                        <h3 className="text-xl font-bold text-slate-900 mb-6">Direct Channels</h3>

                        {/* Email Card */}
                        <div className="flex gap-4 items-start p-6 rounded-2xl bg-slate-50 border border-slate-100 hover:border-teal-100 transition-colors">
                            <div className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-teal-600 shrink-0">
                                <Mail size={20} />
                            </div>
                            <div>
                                <h4 className="font-bold text-slate-900">Email Support</h4>
                                <p className="text-sm text-slate-500 mb-2">For general inquiries and account assistance.</p>
                                <a href="mailto:support@fiinny.com" className="text-teal-600 font-semibold hover:underline">
                                    support@fiinny.com &rarr;
                                </a>
                            </div>
                        </div>

                        {/* HQ Card */}
                        <div className="flex gap-4 items-start p-6 rounded-2xl bg-slate-50 border border-slate-100 hover:border-teal-100 transition-colors">
                            <div className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-teal-600 shrink-0">
                                <MapPin size={20} />
                            </div>
                            <div>
                                <h4 className="font-bold text-slate-900">Global Headquarters</h4>
                                <p className="text-sm text-slate-500 mb-2">Our engineering and design center.</p>
                                <address className="not-italic text-slate-700 text-sm font-medium leading-relaxed">
                                    Hitech City, Hyderabad<br />
                                    Telangana, India 500081
                                </address>
                            </div>
                        </div>

                        {/* Response Commitment */}
                        <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                            <div className="flex items-center gap-2 mb-3">
                                <Clock size={16} className="text-slate-400" />
                                <span className="font-bold text-slate-700 text-sm">Response Time Commitment</span>
                            </div>
                            <p className="text-xs text-slate-500 leading-relaxed">
                                We are a dedicated team. For technical issues, we aim to respond within
                                <strong> 24 hours</strong>. Enterprise inquiries are prioritized.
                            </p>
                        </div>
                    </div>

                    {/* Right Column: Contact Form */}
                    <div className="lg:col-span-7">
                        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/40 p-8 md:p-10">
                            <h3 className="text-xl font-bold text-slate-900 mb-8">Send us a message</h3>

                            <form className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold uppercase text-slate-500 tracking-wider">Name</label>
                                        <input
                                            type="text"
                                            placeholder="John Doe"
                                            className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-200 outline-none transition-all placeholder:text-slate-400"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold uppercase text-slate-500 tracking-wider">Email</label>
                                        <input
                                            type="email"
                                            placeholder="john@example.com"
                                            className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-200 outline-none transition-all placeholder:text-slate-400"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold uppercase text-slate-500 tracking-wider">Message</label>
                                    <textarea
                                        rows={6}
                                        placeholder="Tell us how we can help..."
                                        className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-200 outline-none transition-all placeholder:text-slate-400 resize-none"
                                    />
                                </div>

                                <button
                                    type="button"
                                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-slate-900/10"
                                >
                                    Send Message
                                </button>
                            </form>
                        </div>
                    </div>

                </div>
            </main>

            <footer className="py-8 text-center border-t border-slate-100">
                <p className="text-sm text-slate-400">
                    &copy; 2026 Fiinny. Built with care in Hyderabad.
                </p>
            </footer>
        </div>
    );
}
