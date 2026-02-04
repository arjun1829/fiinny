'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Activity } from 'lucide-react';

export default function LiveSecurityStatus() {
    return (
        <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1, duration: 0.8 }}
            className="hidden md:flex items-center gap-6 px-4 py-2 bg-white/80 backdrop-blur-md rounded-full border border-slate-200 shadow-sm text-xs font-mono text-teal-700 mb-8"
        >
            <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500"></span>
                </span>
                <span className="tracking-wider font-semibold">SYSTEM OPERATIONAL</span>
            </div>

            <div className="h-4 w-px bg-slate-200" />

            <div className="flex items-center gap-2">
                <ShieldCheck className="w-3 h-3 text-teal-600" />
                <span className="font-medium">AES-256 ENCRYPTION ACTIVE</span>
            </div>

            <div className="h-4 w-px bg-slate-200" />

            <div className="flex items-center gap-2">
                <Activity className="w-3 h-3 text-teal-600" />
                <span className="font-medium">THREAT MONITORING: LIVE</span>
            </div>
        </motion.div>
    );
}
