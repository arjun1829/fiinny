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
                        {JOBS.map((job, index) => (
                            <JobCard key={index} job={job} />
                        ))}
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

const JOBS = [
    {
        title: "Founding Engineer Intern (Product + Tech)",
        tags: ["Internship", "Remote"],
        description: "Work directly with the founder to ship real features. A unique opportunity for generalists to build across product and engineering.",
        points: [
            { icon: Briefcase, text: "Work on Flutter UI, bug fixes & features" },
            { icon: CheckCircle2, text: "Assist with Firebase & backend setup" },
            { icon: GraduationCap, text: "Final-year students or 0-2 yrs exp" },
            { icon: Clock, text: "2-3 months • ₹15k - ₹20k / month" },
        ],
        link: "https://www.linkedin.com/jobs/view/4328585672/",
    },
    {
        title: "UI/UX Designer (Intern / Contract)",
        tags: ["Internship", "Remote"],
        description: "Design mobile app screens for Android and iOS. Improve existing UI for usability, clarity, and visual consistency.",
        points: [
            { icon: Briefcase, text: "Design mobile app screens for Android & iOS" },
            { icon: CheckCircle2, text: "Create wireframes, flows & prototypes in Figma" },
            { icon: GraduationCap, text: "Students or early-career (0-2 years exp)" },
            { icon: Clock, text: "3 months • ₹12,000 / month" },
        ],
        link: "https://www.linkedin.com/jobs/view/4358147854/",
    }
];

function JobCard({ job }: { job: typeof JOBS[0] }) {
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
                        {job.tags.map((tag, i) => (
                            <span key={i} className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${tag === 'Remote' ? 'bg-slate-100 text-slate-600 flex items-center gap-1' : 'bg-teal-50 text-teal-700'}`}>
                                {tag === 'Remote' && <Laptop className="w-3 h-3" />}
                                {tag}
                            </span>
                        ))}
                    </div>

                    <h3 className="text-2xl font-bold text-slate-900 mb-2 group-hover:text-teal-600 transition-colors">
                        {job.title}
                    </h3>
                    <p className="text-slate-500 mb-6 max-w-2xl">
                        {job.description}
                    </p>

                    <div className="grid md:grid-cols-2 gap-y-2 gap-x-8 text-sm text-slate-600 mb-8">
                        {job.points.map((point, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <point.icon className="w-4 h-4 text-teal-500" />
                                <span>{point.text}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex-shrink-0">
                    <a
                        href={job.link}
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
