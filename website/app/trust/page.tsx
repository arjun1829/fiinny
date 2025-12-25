"use client";

import React from "react";
import Link from "next/link";
import { Shield, Lock, EyeOff, Server, AlertTriangle, CheckCircle, ArrowRight } from "lucide-react";


// Since page.tsx has the Navbar inside it, we'll create a standalone layout for this page 
// or simpler: just the content if the layout handles nav. 
// Checking layout.tsx suggests it renders children. page.tsx has its own Navbar. 
// We should probably replicate the Navbar or eventually extract it. 
// For now, I will include a simplified header or back button if I can't easily reuse the Navbar component from page.tsx (which isn't exported).
// Actually, I will create a full page with a consistent header style.

export default function TrustPage() {
    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-teal-100 selection:text-teal-900">

            {/* Navigation (Simplified for this page or matching main site) */}
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
                        <Link href="/contact" className="text-sm font-medium text-slate-600 hover:text-teal-600">Contact</Link>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <div className="bg-white border-b border-slate-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28 text-center">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-50 border border-teal-100 text-teal-700 text-xs font-semibold uppercase tracking-wider mb-6">
                        <Shield className="w-4 h-4" />
                        Trust & Safety
                    </div>
                    <h1 className="text-4xl lg:text-5xl font-bold text-slate-900 mb-6 tracking-tight">
                        Your Security, <span className="text-teal-600">Our Priority.</span>
                    </h1>
                    <p className="text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
                        We believe your financial data belongs to you. That's why we've built Fiinny with a
                        <span className="font-semibold text-slate-900"> Privacy-First</span> architecture ensuring your data never leaves your device without your explicit consent.
                    </p>
                </div>
            </div>

            {/* Main Content */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">

                {/* Security Pillars */}
                <div className="grid md:grid-cols-3 gap-8 mb-20">
                    {/* Pillar 1 */}
                    <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                        <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mb-6">
                            <EyeOff className="w-6 h-6 text-blue-600" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 mb-3">On-Device Processing</h3>
                        <p className="text-slate-600 leading-relaxed">
                            Unlike other apps, we process your SMS and financial data directly on your phone. Your raw transaction data is not uploaded to our servers for categorization.
                        </p>
                    </div>

                    {/* Pillar 2 */}
                    <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                        <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center mb-6">
                            <Lock className="w-6 h-6 text-emerald-600" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 mb-3">Bank-Grade Encryption</h3>
                        <p className="text-slate-600 leading-relaxed">
                            Any data that is synced (like profile settings) is transmitted using 256-bit AES encryption and TLS 1.3 standards.
                        </p>
                    </div>

                    {/* Pillar 3 */}
                    <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                        <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center mb-6">
                            <Server className="w-6 h-6 text-purple-600" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 mb-3">ISO Compliant Practices</h3>
                        <p className="text-slate-600 leading-relaxed">
                            We adhere to international information security standards to ensure our infrastructure is resilient against threats.
                        </p>
                    </div>
                </div>

                {/* Detailed Sections */}
                <div className="grid md:grid-cols-2 gap-12 items-center mb-20">
                    <div>
                        <h2 className="text-3xl font-bold text-slate-900 mb-6">We Don't Sell Your Data. Period.</h2>
                        <div className="space-y-4">
                            <div className="flex items-start gap-3">
                                <CheckCircle className="w-5 h-5 text-teal-600 mt-1 flex-shrink-0" />
                                <p className="text-slate-600">No sharing with third-party loan agencies.</p>
                            </div>
                            <div className="flex items-start gap-3">
                                <CheckCircle className="w-5 h-5 text-teal-600 mt-1 flex-shrink-0" />
                                <p className="text-slate-600">No targeted advertising based on your spend.</p>
                            </div>
                            <div className="flex items-start gap-3">
                                <CheckCircle className="w-5 h-5 text-teal-600 mt-1 flex-shrink-0" />
                                <p className="text-slate-600">Your financial footprint remains yours alone.</p>
                            </div>
                        </div>
                    </div>
                    <div className="relative h-64 md:h-80 bg-slate-100 rounded-2xl overflow-hidden flex items-center justify-center">
                        <div className="text-center">
                            <Lock className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                            <p className="text-slate-400 font-medium">Secure Data Vault</p>
                        </div>
                    </div>
                </div>

                {/* Reporting Section */}
                <div className="bg-slate-900 rounded-3xl p-8 md:p-12 text-center md:text-left flex flex-col md:flex-row items-center justify-between gap-8">
                    <div>
                        <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">Report a Security Concern</h2>
                        <p className="text-slate-400 max-w-xl">
                            Found a vulnerability or noticed suspicious activity? Our security team is ready to investigate immediately.
                        </p>
                    </div>
                    <Link href="/contact" className="inline-flex items-center gap-2 bg-white text-slate-900 px-6 py-3 rounded-xl font-semibold hover:bg-teal-50 transition-colors">
                        <AlertTriangle className="w-4 h-4" />
                        Report Incident
                    </Link>
                </div>

            </div>

            {/* Footer Simple */}
            <footer className="bg-white border-t border-slate-200 py-12">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-slate-500 text-sm">
                    &copy; {new Date().getFullYear()} Fiinny. Built with care in Hyderabad.
                </div>
            </footer>

        </div>
    );
}
