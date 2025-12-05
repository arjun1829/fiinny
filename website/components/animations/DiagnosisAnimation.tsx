"use client";

import { motion } from "framer-motion";

export default function DiagnosisAnimation() {
    return (
        <div className="relative w-full h-[400px] flex items-center justify-center">
            {/* Background Glow */}
            <div className="absolute inset-0 bg-teal/5 rounded-full blur-3xl" />

            {/* 3D Receipt Card */}
            <motion.div
                className="relative w-64 bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-100"
                initial={{ rotateY: -15, rotateX: 10 }}
                animate={{
                    rotateY: [-15, 15, -15],
                    rotateX: [10, -10, 10],
                    y: [0, -20, 0]
                }}
                transition={{
                    duration: 8,
                    repeat: Infinity,
                    ease: "easeInOut"
                }}
                style={{ transformStyle: "preserve-3d" }}
            >
                {/* Receipt Header */}
                <div className="h-16 bg-slate-50 border-b border-slate-100 flex items-center justify-center">
                    <div className="w-12 h-12 bg-teal/10 rounded-full flex items-center justify-center">
                        <div className="w-6 h-6 bg-teal rounded-full" />
                    </div>
                </div>

                {/* Receipt Lines */}
                <div className="p-6 space-y-4">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="flex justify-between items-center">
                            <div className="h-2 w-24 bg-slate-100 rounded-full" />
                            <div className="h-2 w-12 bg-slate-100 rounded-full" />
                        </div>
                    ))}

                    {/* Hidden Fee Highlight */}
                    <motion.div
                        className="absolute left-0 right-0 h-8 bg-red-500/10 border-y border-red-500/20 flex items-center justify-between px-6"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0, 1, 0] }}
                        transition={{ duration: 3, repeat: Infinity, repeatDelay: 1 }}
                        style={{ top: '140px' }}
                    >
                        <div className="h-2 w-24 bg-red-200 rounded-full" />
                        <div className="h-2 w-12 bg-red-200 rounded-full" />
                    </motion.div>
                </div>

                {/* Scanning Beam */}
                <motion.div
                    className="absolute top-0 left-0 right-0 h-1 bg-teal shadow-[0_0_20px_rgba(20,184,166,0.5)] z-10"
                    animate={{ top: ["0%", "100%", "0%"] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                />
            </motion.div>

            {/* Floating Alert Bubbles */}
            <motion.div
                className="absolute top-20 right-10 bg-white px-4 py-2 rounded-lg shadow-lg border border-red-100 flex items-center gap-2"
                animate={{
                    y: [0, -10, 0],
                    opacity: [0, 1, 0]
                }}
                transition={{ duration: 3, repeat: Infinity, delay: 1.5 }}
            >
                <div className="w-2 h-2 bg-red-500 rounded-full" />
                <span className="text-xs font-bold text-slate-700">Hidden Fee Detected!</span>
            </motion.div>
        </div>
    );
}
