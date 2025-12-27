"use client";

import React from "react";
import Link from "next/link";
import { Mail, ChevronRight, AlertCircle, FileText, Download, Trash2, Smartphone, Bell, Zap, HelpCircle } from "lucide-react";
import Navbar from "@/components/Navbar";

export default function SupportPage() {
    return (
        <div className="min-h-screen bg-white font-sans text-slate-900">
            <Navbar />

            <main className="pt-24 pb-16 px-6 container mx-auto max-w-4xl">
                {/* Header */}
                <header className="mb-16 text-center">
                    <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-teal-600 to-emerald-500 bg-clip-text text-transparent">
                        Fiinny Support
                    </h1>
                    <p className="text-xl text-slate-600">
                        The easiest way to get help with Fiinny.
                    </p>
                    <div className="mt-8 flex justify-center">
                        <a
                            href="mailto:support@fiinny.com"
                            className="inline-flex items-center space-x-2 bg-slate-900 text-white px-6 py-3 rounded-full font-medium hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/10"
                        >
                            <Mail className="w-5 h-5" />
                            <span>Contact: support@fiinny.com</span>
                        </a>
                    </div>
                </header>

                {/* FAQs */}
                <section className="mb-16">
                    <div className="flex items-center space-x-2 mb-8">
                        <HelpCircle className="w-6 h-6 text-teal-600" />
                        <h2 className="text-2xl font-bold text-slate-900">FAQs</h2>
                    </div>

                    <div className="grid gap-6 md:grid-cols-2">
                        <FaqItem
                            question="How do I add an expense/income?"
                            answer="Open Expenses → + → enter amount, type and note → Save."
                        />
                        <FaqItem
                            question="How do I split with friends?"
                            answer="Go to Friends → choose friend/group → Add split → select items → Settle Up."
                        />
                        <FaqItem
                            question="Bank alerts parsing is optional—how do I enable it?"
                            answer="Open Settings › Notifications → enable Allow Notifications. Fiinny works without it."
                        />
                        <FaqItem
                            question="Why do I see large numbers? (₹)"
                            answer="We show rupee values; change format in Settings › Preferences."
                        />
                        <FaqItem
                            question="Where are subscriptions/bills?"
                            answer="Dashboard → Subscriptions & Bills card → + Add."
                        />
                        <FaqItem
                            question="I found a bug / feature request"
                            answer="Email us with steps + screenshots."
                        />
                    </div>
                </section>

                {/* Troubleshooting */}
                <section className="mb-16">
                    <div className="flex items-center space-x-2 mb-8">
                        <Zap className="w-6 h-6 text-amber-500" />
                        <h2 className="text-2xl font-bold text-slate-900">Troubleshooting</h2>
                    </div>

                    <div className="space-y-4">
                        <TroubleshootItem
                            title="App crashed on first launch"
                            description="Update to the latest version; reopen."
                        />
                        <TroubleshootItem
                            title="No notifications parsed"
                            description="Ensure notification permission is ON; reopen the app."
                        />
                        <TroubleshootItem
                            title="Permission prompts didn’t appear"
                            description="Settings › Notifications → enable; relaunch."
                        />
                        <TroubleshootItem
                            title="Slow performance"
                            description="Close background apps; keep at least 500 MB free."
                        />
                    </div>
                </section>

                {/* Data & Privacy */}
                <section className="mb-16">
                    <div className="flex items-center space-x-2 mb-8">
                        <FileText className="w-6 h-6 text-indigo-600" />
                        <h2 className="text-2xl font-bold text-slate-900">Data & Privacy</h2>
                    </div>

                    <div className="grid gap-6 md:grid-cols-2 mb-8">
                        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                            <div className="flex items-center space-x-3 mb-4 text-emerald-600">
                                <Download className="w-6 h-6" />
                                <h3 className="font-bold text-lg text-slate-900">Data Export</h3>
                            </div>
                            <p className="text-slate-600 mb-2">Export your data anytime.</p>
                            <div className="text-sm font-mono bg-white/50 p-2 rounded text-slate-500">
                                Profile › Data & Privacy › Export Data (JSON)
                            </div>
                        </div>

                        <div className="bg-rose-50 p-6 rounded-2xl border border-rose-100">
                            <div className="flex items-center space-x-3 mb-4 text-rose-600">
                                <Trash2 className="w-6 h-6" />
                                <h3 className="font-bold text-lg text-slate-900">Account Deletion</h3>
                            </div>
                            <p className="text-slate-600 mb-2">Irreversible account deletion.</p>
                            <div className="text-sm font-mono bg-white/50 p-2 rounded text-slate-500">
                                Profile › Data & Privacy › Delete Account
                            </div>
                        </div>
                    </div>

                    <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100">
                        <h3 className="font-bold text-lg text-slate-900 mb-2">Privacy</h3>
                        <p className="text-slate-700 mb-4">
                            We collect only what’s needed for core features. You can export or delete your data in-app anytime.
                        </p>
                        <Link href="/privacy" className="inline-flex items-center text-blue-600 font-medium hover:underline">
                            Read Privacy Policy <ChevronRight className="w-4 h-4 ml-1" />
                        </Link>
                    </div>
                </section>

                {/* Contact Footer */}
                <section className="text-center bg-slate-50 rounded-3xl p-8 md:p-12 mb-8">
                    <h2 className="text-2xl font-bold text-slate-900 mb-4">Still need help?</h2>

                    <div className="space-y-2 mb-6 text-slate-600">
                        <p>Typical response: 1–2 business days</p>
                        <p className="text-sm">Include: app version (Profile › About), device model, iOS version, steps to reproduce.</p>
                    </div>

                    <a
                        href="mailto:support@fiinny.com"
                        className="inline-flex items-center space-x-2 bg-gradient-to-r from-teal-500 to-emerald-500 text-white px-8 py-4 rounded-full font-bold hover:shadow-lg hover:scale-105 transition-all"
                    >
                        <Mail className="w-5 h-5" />
                        <span>Email Support</span>
                    </a>
                </section>
            </main>
        </div>
    );
}

function FaqItem({ question, answer }: { question: string, answer: string }) {
    return (
        <div className="bg-slate-50 p-6 rounded-2xl hover:bg-slate-100 transition-colors border border-slate-100/50">
            <h3 className="font-bold text-slate-900 mb-2">{question}</h3>
            <p className="text-slate-600 text-sm leading-relaxed">{answer}</p>
        </div>
    );
}

function TroubleshootItem({ title, description }: { title: string, description: string }) {
    return (
        <div className="flex items-start space-x-4 p-4 rounded-xl border border-slate-100 hover:border-slate-200 transition-colors">
            <AlertCircle className="w-5 h-5 text-slate-400 mt-0.5 flex-shrink-0" />
            <div>
                <h4 className="font-bold text-slate-900 text-sm">{title}</h4>
                <p className="text-slate-600 text-sm">{description}</p>
            </div>
        </div>
    );
}
