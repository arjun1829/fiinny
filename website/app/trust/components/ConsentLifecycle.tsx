'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Fingerprint, Lock, Trash2 } from 'lucide-react';

const Step = ({ icon: Icon, title, description, stepNum }: any) => (
    <div className="flex-1 relative">
        <div className="flex flex-col items-center text-center z-10 relative">
            <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-teal-600 mb-6 group hover:scale-110 transition-transform duration-500">
                <Icon size={32} />
            </div>
            <div className="mb-2 text-xs font-bold text-teal-500 uppercase tracking-widest">Step 0{stepNum}</div>
            <h4 className="text-lg font-bold text-slate-900 mb-2">{title}</h4>
            <p className="text-sm text-slate-600 leading-relaxed max-w-xs">{description}</p>
        </div>
    </div>
);

export default function ConsentLifecycle() {
    return (
        <section className="max-w-6xl mx-auto py-24 px-4 border-t border-slate-100">
            <div className="text-center mb-16">
                <h2 className="text-3xl font-bold text-slate-900 mb-4">You Are The Captain</h2>
                <p className="text-slate-600">Our consent lifecycle is designed to give you absolute control at every stage.</p>
            </div>

            <div className="relative flex flex-col md:flex-row gap-12 md:gap-0 justify-between items-center">

                {/* Connecting Line (Desktop) */}
                <div className="hidden md:block absolute top-[2rem] left-0 w-full h-px bg-slate-200 -z-0">
                    <div className="absolute top-0 left-0 h-full w-1/3 bg-gradient-to-r from-transparent via-teal-400 to-transparent opacity-20" />
                </div>

                <Step
                    icon={Fingerprint}
                    stepNum={1}
                    title="Explicit Opt-In"
                    description="We ask for permission before accessing anything. No hidden background processes."
                />

                <div className="hidden md:flex text-slate-300">
                    <ArrowRight />
                </div>

                <Step
                    icon={Lock}
                    stepNum={2}
                    title="Local Processing"
                    description="Data runs through our ML engine on your phone. It doesn't leave your device."
                />

                <div className="hidden md:flex text-slate-300">
                    <ArrowRight />
                </div>

                <Step
                    icon={Trash2}
                    stepNum={3}
                    title="Revoke Anytime"
                    description="Changed your mind? Revoke permission or delete your account instantly."
                />

            </div>
        </section>
    );
}
