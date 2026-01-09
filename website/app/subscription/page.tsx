"use client";

import Link from "next/link";
import { ArrowLeft, CheckCircle2, Zap, Star, Rocket } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";

export default function SubscriptionPage() {
    const [cycle, setCycle] = useState<'monthly' | 'yearly'>('yearly');

    const plans = [
        {
            id: 'free',
            name: "Free",
            price: "₹0",
            period: "forever",
            features: [
                "Unlimited Transactions",
                "Smart Parsing (SMS & Gmail)",
                "Group Expenses (Splitwise style)",
                "1 Bank Account / Card manual tracking",
                "Basic Charts"
            ],
            cta: "Start Free",
            href: "/login",
            popular: false
        },
        {
            id: 'premium',
            name: "Premium",
            price: cycle === 'yearly' ? "₹1,499" : "₹199",
            period: cycle === 'yearly' ? "/ year" : "/ mo",
            features: [
                "Everything in Free",
                "Ad-free Experience",
                "AI Insights (Fiinny Brain)",
                "Data Export (CSV/PDF)",
                "Unlimited Manual Accounts",
                "Monthly Spending Analysis",
                "Budget Alerts"
            ],
            cta: "Upgrade",
            href: "/login",
            popular: true,
            icon: <Star className="w-5 h-5 text-amber-400 fill-current" />
        },
        {
            id: 'pro',
            name: "Pro",
            price: cycle === 'yearly' ? "₹2,999" : "₹299",
            period: cycle === 'yearly' ? "/ year" : "/ mo",
            features: [
                "Everything in Premium",
                "Advanced AI Forecasts",
                "Priority Support",
                "Early Access to Features",
                "Multiple Device Sync (Realtime)"
            ],
            cta: "Go Pro",
            href: "/login",
            popular: false,
            icon: <Rocket className="w-5 h-5 text-purple-400 fill-current" />
        }
    ];

    return (
        <div className="min-h-screen bg-slate-900 text-white selection:bg-teal-500/30 overflow-hidden relative">

            {/* Background Effects */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-teal-500/10 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[100px] translate-y-1/2 -translate-x-1/2" />

            {/* Navbar */}
            <nav className="p-6 flex items-center justify-between max-w-7xl mx-auto w-full relative z-10">
                <Link href="/" className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors group">
                    <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                    <span>Back Home</span>
                </Link>
                <div className="text-xl font-black tracking-tighter bg-gradient-to-r from-teal-400 to-emerald-400 bg-clip-text text-transparent">
                    Fiinny
                </div>
            </nav>

            {/* Main Content */}
            <div className="max-w-7xl mx-auto px-4 py-16 lg:py-24 relative z-10 text-center">

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    className="max-w-3xl mx-auto mb-16"
                >
                    <h1 className="text-4xl lg:text-6xl font-bold tracking-tight mb-6">
                        Simple pricing for <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-emerald-400">financial freedom.</span>
                    </h1>
                    <p className="text-xl text-slate-400 mb-8">
                        Start for free. Upgrade to unlock AI-powered insights and powerful tools.
                    </p>

                    {/* Toggle */}
                    <div className="inline-flex items-center bg-slate-800 rounded-full p-1 border border-slate-700">
                        <button
                            onClick={() => setCycle('monthly')}
                            className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${cycle === 'monthly' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
                        >
                            Monthly
                        </button>
                        <button
                            onClick={() => setCycle('yearly')}
                            className={`px-6 py-2 rounded-full text-sm font-bold transition-all flex items-center gap-2 ${cycle === 'yearly' ? 'bg-teal-600 text-white shadow-lg shadow-teal-500/20' : 'text-slate-400 hover:text-white'}`}
                        >
                            Yearly
                            <span className="text-[10px] bg-amber-400 text-slate-900 px-1.5 py-0.5 rounded-full uppercase tracking-wide">Save ~37%</span>
                        </button>
                    </div>
                </motion.div>

                {/* Pricing Grid */}
                <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
                    {plans.map((plan, idx) => (
                        <motion.div
                            key={plan.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: idx * 0.1 }}
                            className={`relative rounded-3xl p-8 border ${plan.popular ? 'bg-slate-800/80 border-teal-500/50 shadow-xl shadow-teal-900/20' : 'bg-slate-900/50 border-slate-800'} backdrop-blur-sm flex flex-col`}
                        >
                            {plan.popular && (
                                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-teal-500 to-emerald-500 text-white text-xs font-bold px-4 py-1 rounded-full uppercase tracking-wider shadow-lg">
                                    Most Popular
                                </div>
                            )}

                            <div className="mb-8 text-left">
                                <div className="flex items-center gap-2 mb-2">
                                    {plan.icon}
                                    <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                                </div>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-4xl font-bold text-white">{plan.price}</span>
                                    <span className="text-slate-400">{plan.period}</span>
                                </div>
                            </div>

                            <ul className="space-y-4 mb-8 flex-1 text-left">
                                {plan.features.map((feature, i) => (
                                    <li key={i} className="flex items-start gap-3 text-sm text-slate-300">
                                        <CheckCircle2 className={`w-5 h-5 flex-shrink-0 ${plan.popular ? 'text-teal-400' : 'text-slate-500'}`} />
                                        {feature}
                                    </li>
                                ))}
                            </ul>

                            <Link
                                href={plan.href}
                                className={`w-full py-4 rounded-xl font-bold transition-all ${plan.popular
                                    ? 'bg-teal-500 hover:bg-teal-400 text-white shadow-lg hover:shadow-teal-500/30'
                                    : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'
                                    }`}
                            >
                                {plan.cta}
                            </Link>

                            {plan.id !== 'free' && (
                                <div className="mt-4 text-xs text-slate-500">
                                    Renews automatically. Cancel anytime.
                                </div>
                            )}
                        </motion.div>
                    ))}
                </div>

                <div className="mt-20">
                    <p className="text-slate-500">
                        Need a custom plan for your team? <a href="mailto:support@fiinny.com" className="text-teal-400 hover:underline">Contact us</a>.
                    </p>
                </div>

            </div>
        </div>
    );
}
