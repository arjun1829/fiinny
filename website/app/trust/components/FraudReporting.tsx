'use client';

import React from 'react';
import { AlertTriangle, Lock, Shield, Trash2, Phone } from 'lucide-react';

const Step = ({ number, text, icon: Icon }: any) => (
    <div className="flex flex-col items-center text-center gap-2">
        <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-700 font-bold flex items-center justify-center text-sm mb-1">
            {number}
        </div>
        <div className="text-slate-900 font-bold text-sm">{text}</div>
    </div>
);

export default function FraudReporting() {
    return (
        <section className="bg-slate-50 border-t border-slate-200 py-16 px-4">
            <div className="max-w-4xl mx-auto">

                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">

                    <div className="flex flex-col md:flex-row">
                        <div className="bg-rose-50 p-6 md:p-8 flex flex-col justify-center items-center text-center w-full md:w-1/3 min-h-[180px] border-b md:border-b-0 md:border-r border-rose-100">
                            <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 mb-4 animate-pulse">
                                <AlertTriangle size={24} />
                            </div>
                            <h3 className="text-rose-700 font-bold text-lg">Emergency Zone</h3>
                            <p className="text-xs text-rose-500 mt-2 font-medium">Avg Response: &lt; 24 Hrs</p>
                        </div>

                        <div className="p-8 md:p-10 w-full md:w-2/3">
                            <h4 className="text-xl font-bold text-slate-900 mb-2">
                                Lost your phone? Spotted a scam?
                            </h4>
                            <p className="text-slate-600 mb-6 text-sm">
                                Don't panic. Follow these steps to secure your Fiinny account instantly:
                            </p>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                                <Step number="1" text="Lock App" icon={Lock} />
                                <Step number="2" text="Revoke Access" icon={Shield} />
                                <Step number="3" text="Wipe Data" icon={Trash2} />
                                <Step number="4" text="Contact Us" icon={Phone} />
                            </div>

                            <div className="flex flex-col sm:flex-row gap-4">
                                <a href="/contact?urgent=true" className="flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-lg shadow-rose-600/20 active:scale-95 w-full sm:w-auto">
                                    <Lock size={18} />
                                    Lock Account Instantly
                                </a>
                                <a href="mailto:support@fiinny.com" className="flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-6 py-3 rounded-xl font-semibold transition-all w-full sm:w-auto">
                                    Contact Security Team
                                </a>
                            </div>
                        </div>
                    </div>

                </div>

                <div className="mt-12 text-center border-t border-slate-200 pt-8">
                    <h5 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">
                        Regulatory Compliance
                    </h5>
                    <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm text-slate-500">
                        <span>ISO 27001 Aligned</span>
                        <span>DPDP Act 2023 Compliant</span>
                        <span>GDPR Ready</span>
                        <span>AES-256 Standard</span>
                    </div>
                </div>

            </div>
        </section>
    );
}
