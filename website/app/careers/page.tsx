"use client";

import Navbar from "@/components/Navbar";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, MapPin, Clock, Briefcase, GraduationCap, Laptop } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export default function CareersPage() {
    return (
        <div className="min-h-screen bg-slate-50 font-sans selection:bg-teal-100 selection:text-teal-900">
            <Navbar />

            {/* Hero Section */}
            <section className="pt-32 pb-20 lg:pt-48 lg:pb-32 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-teal-500/5 rounded-full blur-3xl" />
                <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-3xl" />

                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                    <div className="text-center max-w-3xl mx-auto">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6 }}
                        >
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-50 text-teal-700 text-sm font-bold mb-8 border border-teal-100">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500"></span>
                                </span>
                                We're Hiring
                            </div>
                            <h1 className="text-5xl lg:text-7xl font-bold tracking-tight text-slate-900 mb-6">
                                Build the future of <br />
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-600 to-emerald-600">
                                    personal finance.
                                </span>
                            </h1>
                            <p className="text-xl text-slate-600 leading-relaxed mb-10">
                                Join our mission to help millions of people master their money with privacy-first AI tools.
                            </p>
                        </motion.div>
                    </div>
                </div>
            </section>

            {/* Job Listings */}
            <section className="py-20 bg-white border-t border-slate-100">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="mb-12">
                        <h2 className="text-3xl font-bold text-slate-900 mb-4">Open Positions</h2>
                        <p className="text-slate-500">Come join us and help ship real features used by real users.</p>
                    </div>

                    <div className="space-y-6">
                        <JobCard />
                    </div>
                </div>
            </section>

            {/* Footer Simple */}
            <footer className="bg-slate-50 py-12 border-t border-slate-100 mt-auto">
                <div className="max-w-7xl mx-auto px-4 text-center text-slate-400 text-sm">
                    © {new Date().getFullYear()} Fiinny. All rights reserved.
                </div>
            </footer>
        </div>
    );
}

function JobCard() {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="group bg-white rounded-2xl p-8 border border-slate-200 shadow-sm hover:shadow-lg hover:border-teal-200 transition-all duration-300 relative overflow-hidden"
        >
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6 relative z-10">
                <div className="flex-1">
                    <div className="flex flex-wrap gap-2 mb-4">
                        <span className="px-3 py-1 rounded-full bg-teal-50 text-teal-700 text-xs font-bold uppercase tracking-wider">
                            Internship
                        </span>
                        <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                            <Laptop className="w-3 h-3" /> Remote
                        </span>
                    </div>

                    <h3 className="text-2xl font-bold text-slate-900 mb-2 group-hover:text-teal-600 transition-colors">
                        Founding Engineer Intern (Product + Tech)
                    </h3>
                    <p className="text-slate-500 mb-6 max-w-2xl">
                        Work directly with the founder to ship real features. A unique opportunity for generalists to build across product and engineering.
                    </p>

                    <div className="grid md:grid-cols-2 gap-y-2 gap-x-8 text-sm text-slate-600 mb-8">
                        <div className="flex items-center gap-2">
                            <Briefcase className="w-4 h-4 text-teal-500" />
                            <span>Work on Flutter UI, bug fixes & features</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-teal-500" />
                            <span>Assist with Firebase & backend setup</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <GraduationCap className="w-4 h-4 text-teal-500" />
                            <span>Final-year students or 0-2 yrs exp</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-teal-500" />
                            <span>2-3 months • ₹15k - ₹20k / month</span>
                        </div>
                    </div>
                </div>

                <div className="flex-shrink-0">
                    <a
                        href="https://www.linkedin.com/jobs/view/4328585672/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center px-6 py-3 text-sm font-bold text-white transition-all bg-slate-900 rounded-xl hover:bg-teal-600 hover:shadow-lg hover:-translate-y-0.5"
                    >
                        Apply Now <ArrowRight className="w-4 h-4 ml-2" />
                    </a>
                </div>
            </div>
        </motion.div>
    );
}
