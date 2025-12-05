"use client";

import { motion } from "framer-motion";

export default function PartnerAnimation() {
    return (
        <div className="relative w-full h-[400px] flex items-center justify-center">
            {/* Shared Space Glow */}
            <div className="absolute inset-0 bg-rose-500/5 rounded-full blur-3xl" />

            <div className="relative flex items-center gap-8">
                {/* Partner 1 Device */}
                <PhoneCard color="bg-slate-900" delay={0} x={-20} />

                {/* Sync Stream */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-20 flex items-center justify-center z-0">
                    {[...Array(5)].map((_, i) => (
                        <motion.div
                            key={i}
                            className="absolute h-1 w-2 bg-rose-400 rounded-full"
                            animate={{
                                x: [-40, 40],
                                opacity: [0, 1, 0],
                                scale: [0.5, 1, 0.5]
                            }}
                            transition={{
                                duration: 2,
                                repeat: Infinity,
                                delay: i * 0.4,
                                ease: "linear"
                            }}
                        />
                    ))}
                </div>

                {/* Privacy Shield Icon */}
                <motion.div
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center z-20 border-2 border-rose-100"
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                >
                    <div className="w-6 h-6 border-2 border-rose-500 rounded-lg flex items-center justify-center">
                        <div className="w-2 h-2 bg-rose-500 rounded-full" />
                    </div>
                </motion.div>

                {/* Partner 2 Device */}
                <PhoneCard color="bg-white" delay={1} x={20} inverse />
            </div>
        </div>
    );
}

function PhoneCard({ color, delay, x, inverse = false }: any) {
    return (
        <motion.div
            className={`relative w-40 h-64 rounded-3xl shadow-2xl ${color} border-4 border-slate-200 overflow-hidden z-10`}
            initial={{ y: 20, rotateY: inverse ? -15 : 15 }}
            animate={{
                y: [0, -15, 0],
                rotateY: inverse ? [-15, -5, -15] : [15, 5, 15]
            }}
            transition={{
                duration: 6,
                repeat: Infinity,
                ease: "easeInOut",
                delay
            }}
        >
            {/* Screen Content */}
            <div className="p-4 space-y-3">
                <div className="w-12 h-12 rounded-full bg-slate-100 mb-4" />
                <div className="h-2 w-20 bg-slate-100 rounded-full" />
                <div className="h-2 w-12 bg-slate-100 rounded-full" />

                {/* Shared Goal Progress */}
                <div className="mt-8 p-2 bg-rose-50 rounded-lg">
                    <div className="flex justify-between mb-1">
                        <div className="h-1 w-8 bg-rose-200 rounded-full" />
                        <div className="h-1 w-4 bg-rose-200 rounded-full" />
                    </div>
                    <div className="h-1.5 w-full bg-rose-100 rounded-full overflow-hidden">
                        <motion.div
                            className="h-full bg-rose-500"
                            animate={{ width: ["30%", "60%", "30%"] }}
                            transition={{ duration: 4, repeat: Infinity }}
                        />
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
