"use client";

import { Mail, RefreshCw, Loader2 } from 'lucide-react';
import Link from 'next/link';

interface GmailBackfillBannerProps {
    isLinked: boolean;
    onRetry?: () => void;
    onConnect?: () => void;
    connecting?: boolean;
}

export default function GmailBackfillBanner({ isLinked, onRetry, onConnect, connecting = false }: GmailBackfillBannerProps) {
    if (isLinked) return null;

    return (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-full -translate-y-1/2 translate-x-1/2 transition-transform group-hover:scale-110" />

            <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                    <div className="p-3 bg-blue-100 text-blue-600 rounded-xl">
                        <Mail className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-900">Auto-track expenses</h3>
                        <p className="text-slate-500 text-sm mt-1 max-w-md">
                            Link your Gmail to automatically fetch bank transactions and bills. No manual entry needed!
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                    {onRetry && (
                        <button
                            onClick={onRetry}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Check status"
                        >
                            <RefreshCw className="w-5 h-5" />
                        </button>
                    )}
                    <button
                        onClick={onConnect}
                        disabled={connecting}
                        className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold rounded-xl transition-colors shadow-sm shadow-blue-200 flex items-center justify-center gap-2"
                    >
                        {connecting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Connecting...
                            </>
                        ) : (
                            "Connect Gmail"
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
