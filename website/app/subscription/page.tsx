"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, CheckCircle2, Zap, Star, Rocket, Info, ChevronDown } from "lucide-react";
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
            popular: false,
            // Hover styles
            hoverBg: "hover:bg-slate-900",
            buttonHover: "group-hover:bg-white group-hover:text-slate-900",
            iconColor: "text-slate-400 group-hover:text-white"
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
            icon: <Star className="w-5 h-5 text-amber-400 fill-current group-hover:text-white" />,
            // Hover styles
            hoverBg: "hover:bg-teal-600 hover:border-teal-600",
            buttonHover: "group-hover:bg-white group-hover:text-teal-700",
            iconColor: "text-amber-400 group-hover:text-white"
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
            icon: <Rocket className="w-5 h-5 text-purple-600 fill-current group-hover:text-white" />,
            // Hover styles
            hoverBg: "hover:bg-violet-600 hover:border-violet-600",
            buttonHover: "group-hover:bg-white group-hover:text-violet-700",
            iconColor: "text-purple-600 group-hover:text-white"
        }
    ];

    return (
        <div className="min-h-screen bg-slate-50 font-sans selection:bg-teal-100 selection:text-teal-900 overflow-x-hidden">

            {/* Premium Split Island Navigation */}
            <nav className="fixed top-6 left-0 right-0 z-50 flex justify-between items-center px-4 md:px-8 pointer-events-none">
                {/* Left Island: Back to Home */}
                <div className="pointer-events-auto bg-white/80 backdrop-blur-xl rounded-full border border-white/40 shadow-xl shadow-slate-200/40 px-6 py-3 flex items-center hover:bg-white transition-colors">
                    <Link href="/" className="flex items-center gap-2 text-slate-600 hover:text-teal-700 transition-colors font-bold text-sm group">
                        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform stroke-[3px]" />
                        Back to Home
                    </Link>
                </div>

                {/* Right Island: Brand */}
                <div className="pointer-events-auto bg-white/80 backdrop-blur-xl rounded-full border border-white/40 shadow-xl shadow-slate-200/40 px-6 py-3 flex items-center hover:bg-white transition-colors">
                    <Link href="/" className="flex items-center gap-2 group">
                        <div className="relative w-7 h-7 rounded-full overflow-hidden">
                            <Image src="/assets/images/logo_icon.png" alt="Fiinny" fill className="object-cover" />
                        </div>
                        <span className="text-xl font-black text-teal-950 tracking-tight group-hover:text-teal-700 transition-colors">Fiinny</span>
                    </Link>
                </div>
            </nav>

            {/* Background Effects */}
            <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-teal-500/10 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/2 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-indigo-500/5 rounded-full blur-[120px] translate-y-1/2 -translate-x-1/2 pointer-events-none" />

            {/* Main Content */}
            <div className="pt-40 pb-24 px-4 sm:px-6 lg:px-8 relative z-10 text-center">

                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    className="max-w-3xl mx-auto mb-16"
                >
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-teal-50 text-teal-700 text-xs font-bold uppercase tracking-[0.2em] mb-8 border border-teal-100">
                        Invest in yourself
                    </div>
                    <h1 className="text-5xl lg:text-7xl font-black text-slate-900 mb-8 tracking-tight leading-none">
                        Simple pricing for <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-600 to-emerald-600">financial freedom.</span>
                    </h1>
                    <p className="text-xl text-slate-500 leading-relaxed font-medium max-w-2xl mx-auto mb-10">
                        Start for free. Upgrade to unlock AI-powered insights and powerful tools that pay for themselves.
                    </p>

                    {/* Toggle */}
                    <div className="inline-flex items-center bg-white rounded-full p-1.5 border border-slate-200 shadow-lg shadow-slate-200/50">
                        <button
                            onClick={() => setCycle('monthly')}
                            className={`px-6 py-2.5 rounded-full text-sm font-bold transition-all duration-300 ${cycle === 'monthly' ? 'bg-slate-100 text-slate-900 shadow-inner' : 'text-slate-500 hover:text-slate-900'}`}
                        >
                            Monthly
                        </button>
                        <button
                            onClick={() => setCycle('yearly')}
                            className={`px-6 py-2.5 rounded-full text-sm font-bold transition-all duration-300 flex items-center gap-2 ${cycle === 'yearly' ? 'bg-teal-600 text-white shadow-xl shadow-teal-500/30' : 'text-slate-500 hover:text-slate-900'}`}
                        >
                            Yearly
                            <span className="text-[10px] bg-amber-300 text-slate-900 px-1.5 py-0.5 rounded-full uppercase tracking-wide font-black ml-1">-37%</span>
                        </button>
                    </div>
                </motion.div>

                {/* Pricing Grid */}
                <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto items-start">
                    {plans.map((plan, idx) => (
                        <motion.div
                            key={plan.id}
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: idx * 0.15 }}
                            className={`relative rounded-[2.5rem] p-8 border hover:-translate-y-2 transition-all duration-500 flex flex-col text-left group overflow-hidden ${plan.hoverBg}
                                ${plan.popular
                                    ? 'bg-white border-teal-200 shadow-2xl shadow-teal-900/10 ring-4 ring-teal-50/50 z-10 scale-105 md:scale-110'
                                    : 'bg-white border-slate-100 shadow-xl shadow-slate-200/50'
                                }`
                            }
                        >
                            {plan.popular && (
                                <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-teal-400 to-emerald-500 group-hover:opacity-0 transition-opacity" />
                            )}

                            {plan.popular && (
                                <div className="absolute top-6 right-6 inline-flex items-center gap-1 bg-teal-50 group-hover:bg-white/20 text-teal-700 group-hover:text-white text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full border border-teal-100 group-hover:border-white/20 transition-colors">
                                    <Star className="w-3 h-3 fill-teal-700 group-hover:fill-white transition-colors" /> Popular
                                </div>
                            )}

                            <div className="mb-8">
                                <h3 className={`text-xl font-bold mb-2 group-hover:text-white transition-colors ${plan.popular ? 'text-teal-700' : 'text-slate-900'}`}>{plan.name}</h3>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-4xl lg:text-5xl font-black text-slate-900 group-hover:text-white transition-colors tracking-tight">{plan.price}</span>
                                    <span className="text-slate-400 font-medium text-sm group-hover:text-white/80 transition-colors">{plan.period}</span>
                                </div>
                                <p className="text-slate-400 text-xs mt-2 font-medium group-hover:text-white/60 transition-colors">
                                    {plan.id === 'free' ? 'No credit card required' : 'Billed ' + cycle}
                                </p>
                            </div>

                            <div className="w-full h-px bg-slate-100 mb-8 group-hover:bg-white/20 transition-colors" />

                            <ul className="space-y-4 mb-8 flex-1">
                                {plan.features.map((feature, i) => (
                                    <li key={i} className="flex items-start gap-3 text-sm text-slate-600 group-hover:text-slate-100 font-medium leading-relaxed transition-colors">
                                        <CheckCircle2 className={`w-5 h-5 flex-shrink-0 group-hover:text-white transition-colors ${plan.popular ? 'text-teal-500' : 'text-slate-300'}`} />
                                        {feature}
                                    </li>
                                ))}
                            </ul>

                            <Link
                                href={plan.href}
                                className={`w-full py-4 rounded-2xl font-bold text-center transition-all duration-300 flex items-center justify-center gap-2 group/btn relative overflow-hidden
                                    ${plan.buttonHover}
                                    ${plan.popular
                                        ? 'bg-slate-900 text-white shadow-xl'
                                        : 'bg-slate-50 text-slate-900 border border-slate-200'
                                    }`}
                            >
                                <span className="relative z-10">{plan.cta}</span>
                                {plan.popular && <ArrowLeft className="w-4 h-4 rotate-180 group-hover/btn:translate-x-1 transition-transform relative z-10" />}
                            </Link>

                        </motion.div>
                    ))}
                </div>

                <div className="mt-24">
                    <p className="text-slate-400 font-medium flex items-center justify-center gap-2">
                        <Info className="w-4 h-4" />
                        Need a custom plan for your team? <a href="mailto:support@fiinny.com" className="text-teal-600 font-bold hover:underline">Contact us</a>.
                    </p>
                </div>
            </div>
        </div>
    );
}
