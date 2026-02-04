'use client';

import React from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import LiveSecurityStatus from './LiveSecurityStatus';
import ComplianceStrip from './ComplianceStrip'; // Imported but rendered in main page to keep hero clean, or can be here.

export default function HeroSection() {
    return (
        <section className="relative min-h-[85vh] flex flex-col justify-center items-center text-center px-4 overflow-hidden bg-slate-50 pt-20">

            {/* Dynamic Background (Aurora) */}
            <div className="absolute inset-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
                <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-teal-200/30 rounded-full blur-[140px] animate-pulse-slow" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-200/30 rounded-full blur-[140px] animate-pulse-slow delay-700" />
                <div className="absolute top-[40%] left-[30%] w-[30%] h-[30%] bg-violet-200/20 rounded-full blur-[100px]" />
            </div>

            <LiveSecurityStatus />

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8 }}
                className="mb-8 relative z-10"
            >
                <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tighter text-slate-900 mb-6 leading-[0.9]">
                    Unbreakable <br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-500 via-blue-600 to-violet-600 animate-gradient-x">
                        Trust.
                    </span>
                </h1>
                <p className="text-xl md:text-2xl text-slate-500 max-w-2xl mx-auto font-medium leading-relaxed">
                    We engineered a fortress.<br className="hidden md:block" />
                    <span className="text-slate-800 font-semibold block mt-1 text-lg md:text-xl">
                        (Your data never leaves your phone. Ever.)
                    </span>
                </p>
            </motion.div>

            {/* Antigravity 3D Asset Container */}
            <motion.div
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 1 }}
                className="relative w-full max-w-5xl mx-auto perspective-1000 group"
            >
                {/* Floating Animation Wrapper */}
                <motion.div
                    animate={{ y: [0, -15, 0] }}
                    transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                    className="relative z-10"
                >
                    {/* Glass Panel */}
                    <div className="relative aspect-[16/9] md:aspect-[21/9] bg-white/40 backdrop-blur-xl rounded-[40px] border border-white/50 shadow-2xl overflow-hidden flex items-center justify-center">

                        {/* Refractive Sheen */}
                        <div className="absolute inset-0 bg-gradient-to-tr from-white/40 to-transparent opacity-50 pointer-events-none" />

                        {/* Main Shield Asset */}
                        <div className="relative w-full h-full flex items-center justify-center p-8 md:p-12">
                            <Image
                                src="/glass-shield.png"
                                alt="Futuristic Glass Shield"
                                width={800}
                                height={450}
                                className="object-contain drop-shadow-2xl transition-transform duration-700 group-hover:scale-105 group-hover:rotate-1"
                                priority
                            />
                        </div>
                    </div>
                </motion.div>

                {/* Shadow Grounding */}
                <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 w-2/3 h-24 bg-teal-900/20 blur-[60px] rounded-full opacity-60 pointer-events-none" />
            </motion.div>

        </section>
    );
}
