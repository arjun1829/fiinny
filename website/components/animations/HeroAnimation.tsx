"use client";

import React from "react";
import { motion } from "framer-motion";
import { CreditCard, Smartphone, Receipt, TrendingUp, ShieldCheck, Wallet, Banknote } from "lucide-react";

const HeroAnimation = () => {
    return (
        <div className="relative w-full h-[600px] flex items-center justify-center perspective-[1000px]">

            {/* Central Sphere (The "Ball") */}
            <motion.div
                className="relative z-20 w-48 h-48 rounded-full bg-gradient-to-br from-teal-400 to-emerald-600 shadow-[0_0_60px_-15px_rgba(20,184,166,0.5)] flex items-center justify-center"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.8, ease: "backOut" }}
            >
                <div className="absolute inset-0 rounded-full bg-white/20 backdrop-blur-sm" />
                <div className="absolute -top-4 -left-4 w-24 h-24 bg-white/30 rounded-full blur-2xl" />

                {/* Central Logo/Icon */}
                <div className="relative z-30 flex flex-col items-center text-white">
                    <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-lg mb-2">
                        <span className="text-4xl font-black text-teal-600">F</span>
                    </div>
                    <span className="font-bold text-lg tracking-wide">Fiinny</span>
                </div>
            </motion.div>

            {/* Orbit Ring 1 - Tilted */}
            <motion.div
                className="absolute z-10 w-[400px] h-[400px] border-2 border-teal-500/20 rounded-full"
                style={{ rotateX: "60deg", rotateY: "-10deg" }}
                animate={{ rotateZ: 360 }}
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            >
                {/* Satellite 1: UPI */}
                <motion.div
                    className="absolute -top-8 left-1/2 transform -translate-x-1/2"
                    animate={{ rotateZ: -360 }}
                    transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                >
                    <div
                        className="bg-white px-5 py-3 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border-2 border-slate-100 flex items-center gap-3 hover:scale-110 transition-transform"
                        style={{ transform: "rotateY(10deg) rotateX(-60deg)" }}
                    >
                        <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center text-green-600 shadow-sm">
                            <Smartphone className="w-5 h-5" />
                        </div>
                        <div className="flex flex-col">
                            <span className="font-black text-slate-800 text-base leading-none">UPI</span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Auto-Pay</span>
                        </div>
                    </div>
                </motion.div>

                {/* Satellite 2: Credit Cards */}
                <motion.div
                    className="absolute -bottom-8 left-1/2 transform -translate-x-1/2"
                    animate={{ rotateZ: -360 }}
                    transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                >
                    <div
                        className="bg-white px-5 py-3 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border-2 border-slate-100 flex items-center gap-3 hover:scale-110 transition-transform"
                        style={{ transform: "rotateY(10deg) rotateX(-60deg)" }}
                    >
                        <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center text-purple-600 shadow-sm">
                            <CreditCard className="w-5 h-5" />
                        </div>
                        <div className="flex flex-col">
                            <span className="font-black text-slate-800 text-base leading-none">Cards</span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Tracked</span>
                        </div>
                    </div>
                </motion.div>
            </motion.div>

            {/* Orbit Ring 2 - Tilted Opposite */}
            <motion.div
                className="absolute z-10 w-[550px] h-[550px] border-2 border-emerald-500/20 rounded-full"
                style={{ rotateX: "70deg", rotateY: "20deg" }}
                animate={{ rotateZ: -360 }}
                transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
            >
                {/* Satellite 3: Track */}
                <motion.div
                    className="absolute top-1/2 -right-8 transform -translate-y-1/2"
                    animate={{ rotateZ: 360 }}
                    transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
                >
                    <div
                        className="bg-white px-5 py-3 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border-2 border-slate-100 flex items-center gap-3 hover:scale-110 transition-transform"
                        style={{ transform: "rotateY(-20deg) rotateX(-70deg)" }}
                    >
                        <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 shadow-sm">
                            <TrendingUp className="w-5 h-5" />
                        </div>
                        <div className="flex flex-col">
                            <span className="font-black text-slate-800 text-base leading-none">Track</span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Real-time</span>
                        </div>
                    </div>
                </motion.div>

                {/* Satellite 4: Charges */}
                <motion.div
                    className="absolute top-1/2 -left-8 transform -translate-y-1/2"
                    animate={{ rotateZ: 360 }}
                    transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
                >
                    <div
                        className="bg-white px-5 py-3 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border-2 border-slate-100 flex items-center gap-3 hover:scale-110 transition-transform"
                        style={{ transform: "rotateY(-20deg) rotateX(-70deg)" }}
                    >
                        <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center text-red-600 shadow-sm">
                            <Receipt className="w-5 h-5" />
                        </div>
                        <div className="flex flex-col">
                            <span className="font-black text-slate-800 text-base leading-none">Fees</span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Detected</span>
                        </div>
                    </div>
                </motion.div>
            </motion.div>

            {/* Orbit Ring 3 - Vertical/Large */}
            <motion.div
                className="absolute z-0 w-[650px] h-[650px] border-2 border-slate-200/50 rounded-full border-dashed"
                animate={{ rotate: 360 }}
                transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
            >
                {/* Floating Money */}
                <motion.div
                    className="absolute top-0 left-1/2"
                    animate={{ rotate: -360 }}
                    transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
                >
                    <div className="bg-green-50 p-3 rounded-2xl shadow-lg transform rotate-12 border border-green-100">
                        <Banknote className="w-8 h-8 text-green-600" />
                    </div>
                </motion.div>
            </motion.div>

            {/* Floating Particles (Background) */}
            {[...Array(8)].map((_, i) => (
                <motion.div
                    key={i}
                    className="absolute w-3 h-3 bg-teal-400/30 rounded-full blur-sm"
                    initial={{ x: 0, y: 0, opacity: 0 }}
                    animate={{
                        x: Math.random() * 600 - 300,
                        y: Math.random() * 600 - 300,
                        opacity: [0, 1, 0],
                        scale: [0, 1.5, 0],
                    }}
                    transition={{
                        duration: 4 + Math.random() * 3,
                        repeat: Infinity,
                        delay: Math.random() * 2,
                    }}
                />
            ))}
        </div>
    );
};

export default HeroAnimation;
