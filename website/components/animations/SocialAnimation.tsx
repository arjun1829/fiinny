"use client";

import { motion } from "framer-motion";

export default function SocialAnimation() {
    return (
        <div className="relative w-full h-[400px] flex items-center justify-center perspective-1000">
            <div className="relative w-64 h-64 preserve-3d animate-spin-slow">
                {/* Central Hub */}
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-20 h-20 bg-purple-600 rounded-full flex items-center justify-center shadow-lg shadow-purple-500/50 z-10">
                    <span className="text-2xl font-bold text-white">₹</span>
                </div>

                {/* Orbiting Friends */}
                {[0, 1, 2, 3].map((i) => {
                    const angle = (i * 90) * (Math.PI / 180);
                    const x = Math.cos(angle) * 120;
                    const y = Math.sin(angle) * 120;

                    return (
                        <motion.div
                            key={i}
                            className="absolute top-1/2 left-1/2 w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center border-2 border-purple-100"
                            style={{
                                x: x - 24,
                                y: y - 24,
                            }}
                            animate={{
                                scale: [1, 1.1, 1],
                                boxShadow: [
                                    "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                                    "0 10px 15px -3px rgba(147, 51, 234, 0.3)",
                                    "0 4px 6px -1px rgba(0, 0, 0, 0.1)"
                                ]
                            }}
                            transition={{
                                duration: 2,
                                repeat: Infinity,
                                delay: i * 0.5,
                            }}
                        >
                            <div className={`w-8 h-8 rounded-full bg-purple-${(i + 2) * 100} opacity-80`} />

                            {/* Connecting Line */}
                            <motion.div
                                className="absolute top-1/2 left-1/2 h-0.5 bg-purple-200 origin-left -z-10"
                                style={{
                                    width: '120px',
                                    transform: `rotate(${angle + 180}rad)`,
                                    left: '50%',
                                    top: '50%'
                                }}
                            />
                        </motion.div>
                    );
                })}

                {/* Floating Bill Split */}
                <motion.div
                    className="absolute -top-10 right-0 bg-white px-3 py-1 rounded-full shadow-md text-xs font-bold text-purple-600"
                    animate={{ y: [0, -10, 0] }}
                    transition={{ duration: 2, repeat: Infinity }}
                >
                    You owe ₹450
                </motion.div>
            </div>
        </div>
    );
}
