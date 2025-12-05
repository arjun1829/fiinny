"use client";

import { motion } from "framer-motion";

export default function GoalsAnimation() {
    return (
        <div className="relative w-full h-[400px] flex items-center justify-center">
            {/* Celebration Burst */}
            <div className="absolute inset-0 flex items-center justify-center">
                {[...Array(12)].map((_, i) => (
                    <motion.div
                        key={i}
                        className="absolute w-2 h-12 bg-yellow-400 rounded-full origin-bottom"
                        style={{ rotate: i * 30 }}
                        animate={{
                            scaleY: [0, 1, 0],
                            opacity: [0, 1, 0],
                            y: [0, -100]
                        }}
                        transition={{
                            duration: 2,
                            repeat: Infinity,
                            delay: Math.random() * 2,
                            ease: "easeOut"
                        }}
                    />
                ))}
            </div>

            {/* 3D Trophy */}
            <motion.div
                className="relative w-48 h-64 preserve-3d"
                animate={{ rotateY: [0, 360] }}
                transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                style={{ transformStyle: "preserve-3d" }}
            >
                {/* Trophy Cup Base */}
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-32 h-8 bg-amber-700 rounded-full" />
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-24 h-4 bg-amber-600 rounded-full" />

                {/* Trophy Stem */}
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-8 h-24 bg-gradient-to-b from-yellow-300 to-amber-600" />

                {/* Trophy Cup Body */}
                <div className="absolute top-10 left-1/2 -translate-x-1/2 w-40 h-40 bg-gradient-to-br from-yellow-300 via-yellow-400 to-amber-500 rounded-b-full shadow-xl flex items-center justify-center overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-tr from-white/40 to-transparent" />
                    <span className="text-6xl">🏆</span>
                </div>

                {/* Handles */}
                <div className="absolute top-16 left-0 w-12 h-24 border-8 border-yellow-500 rounded-l-3xl -translate-x-4" />
                <div className="absolute top-16 right-0 w-12 h-24 border-8 border-yellow-500 rounded-r-3xl translate-x-4" />
            </motion.div>

            {/* Floating Goal Cards */}
            <FloatingGoal label="Travel" icon="✈️" x={-120} y={-50} delay={0} />
            <FloatingGoal label="Home" icon="🏠" x={120} y={20} delay={1} />
            <FloatingGoal label="Car" icon="🚗" x={-100} y={80} delay={2} />
        </div>
    );
}

function FloatingGoal({ label, icon, x, y, delay }: any) {
    return (
        <motion.div
            className="absolute bg-white px-4 py-2 rounded-xl shadow-lg flex items-center gap-2 border border-yellow-100"
            initial={{ opacity: 0, scale: 0 }}
            animate={{
                opacity: 1,
                scale: 1,
                y: [y, y - 10, y]
            }}
            transition={{
                opacity: { duration: 0.5, delay },
                scale: { duration: 0.5, delay },
                y: { duration: 3, repeat: Infinity, ease: "easeInOut", delay }
            }}
            style={{ left: '50%', top: '50%', marginLeft: x, marginTop: y }}
        >
            <span className="text-xl">{icon}</span>
            <span className="font-bold text-slate-700">{label}</span>
        </motion.div>
    );
}
