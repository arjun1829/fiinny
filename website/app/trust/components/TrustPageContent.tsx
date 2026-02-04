"use client";

import React from "react";
import Link from "next/link";
import HeroSection from "./HeroSection";
import BentoGrid from "./BentoGrid";
import AuditBadge from "./AuditBadge";
import DataTransparencyTable from "./DataTransparencyTable";
import ConsentLifecycle from "./ConsentLifecycle";
import FAQSection from "./FAQSection";
import FraudReporting from "./FraudReporting";
import ComplianceStrip from "./ComplianceStrip";
import SMSTransparency from "./SMSTransparency";

// Navigation Component
const TrustNavbar = () => (
    <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/50 supports-[backdrop-filter]:bg-white/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 group">
                <div className="relative flex items-center justify-center w-8 h-8 rounded-xl bg-teal-600 text-white font-bold text-lg shadow-lg shadow-teal-600/20 transition-transform group-hover:scale-110 duration-500">
                    F
                </div>
                <span className="text-xl font-bold text-slate-900 tracking-tight">
                    Fiinny
                </span>
            </Link>
            <div className="hidden md:flex items-center gap-8">
                <Link href="/" className="text-sm font-medium text-slate-600 hover:text-teal-600 transition-colors">Home</Link>
                <Link href="/about" className="text-sm font-medium text-slate-600 hover:text-teal-600 transition-colors">Security</Link>
                <Link href="/contact" className="text-sm font-medium text-slate-600 hover:text-teal-600 transition-colors">Help</Link>
            </div>
        </div>
    </nav>
);

export default function TrustPageContent() {
    return (
        <div className="min-h-screen bg-white font-sans text-slate-900 selection:bg-teal-100 selection:text-teal-900">

            <TrustNavbar />

            <main className="pt-16">
                {/* 1. The Antigravity Intro & Compliance */}
                <HeroSection />
                <ComplianceStrip />

                <div className="h-24" /> {/* Spacing */}

                {/* 2. The Credibility Anchor */}
                <AuditBadge />

                {/* 3. The Features (Glassmorphism) */}
                <BentoGrid />

                <div className="my-24 font-bold text-center text-slate-300 text-sm uppercase tracking-widest">
                    • • •
                </div>

                {/* 4. The Compliance Flow & SMS Transparency */}
                <ConsentLifecycle />

                {/* Dedicated Play Store Compliance Section */}
                <SMSTransparency />

                <DataTransparencyTable />

                {/* 5. The Anxiety Killers (PhonePe Inspired) */}
                <div className="bg-slate-50/50 border-t border-slate-100 mt-24">
                    <FAQSection />
                </div>

                {/* 6. Emergency Action */}
                <FraudReporting />
            </main>

            {/* Footer */}
            <footer className="bg-white border-t border-slate-200 py-12">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center">
                    <p className="text-slate-400 text-sm mb-4">
                        &copy; {new Date().getFullYear()} Fiinny Financial Inc.
                    </p>
                    <div className="flex gap-6 text-xs text-slate-400">
                        <span className="hover:text-slate-600 cursor-pointer">Privacy Policy</span>
                        <span className="hover:text-slate-600 cursor-pointer">Terms of Service</span>
                        <span className="hover:text-slate-600 cursor-pointer">Security Whitepaper</span>
                    </div>
                </div>
            </footer>
        </div>
    );
}
