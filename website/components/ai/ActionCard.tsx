"use client";

import { motion } from "framer-motion";
import { AlertTriangle, Check, X, Mail, Trash2, ExternalLink } from "lucide-react";
import { PendingAction } from "@/lib/ai/action_service";

interface ActionCardProps {
    action: PendingAction;
    onConfirm: () => void;
    onCancel: () => void;
}

export default function ActionCard({ action, onConfirm, onCancel }: ActionCardProps) {
    const { config, status } = action;
    const isDestructive = config.type === 'DESTRUCTIVE';
    const isExternal = config.type === 'EXTERNAL';

    const getIcon = () => {
        if (isDestructive) return <Trash2 className="w-5 h-5 text-red-500" />;
        if (isExternal) return <Mail className="w-5 h-5 text-blue-500" />;
        return <ExternalLink className="w-5 h-5 text-indigo-500" />;
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className={`w-full max-w-sm mx-auto mt-4 overflow-hidden rounded-2xl border shadow-lg ${isDestructive ? "bg-red-50 border-red-100" : "bg-white border-slate-100"
                }`}
        >
            <div className="p-5">
                <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-full ${isDestructive ? "bg-red-100" : "bg-indigo-50"}`}>
                        {getIcon()}
                    </div>
                    <div className="flex-1">
                        <h3 className={`font-bold text-sm ${isDestructive ? "text-red-900" : "text-slate-900"}`}>
                            {config.title}
                        </h3>
                        <p className={`mt-1 text-xs leading-relaxed ${isDestructive ? "text-red-700" : "text-slate-500"}`}>
                            {config.description}
                        </p>
                    </div>
                </div>

                <div className="mt-5 flex gap-3">
                    <button
                        onClick={onCancel}
                        disabled={status === 'EXECUTING'}
                        className="flex-1 py-2.5 px-4 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
                    >
                        {config.cancelLabel}
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={status === 'EXECUTING'}
                        className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold text-white shadow-sm flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-70 ${isDestructive
                                ? "bg-red-500 hover:bg-red-600 shadow-red-200"
                                : "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200"
                            }`}
                    >
                        {status === 'EXECUTING' ? (
                            <span className="animate-pulse">Processing...</span>
                        ) : (
                            <>
                                {isDestructive ? <Trash2 className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                                {config.confirmLabel}
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Progress Bar for Executing State */}
            {status === 'EXECUTING' && (
                <div className="h-1 w-full bg-slate-100 overflow-hidden">
                    <motion.div
                        initial={{ width: "0%" }}
                        animate={{ width: "100%" }}
                        transition={{ duration: 1.5, ease: "easeInOut" }}
                        className={`h-full ${isDestructive ? "bg-red-500" : "bg-indigo-500"}`}
                    />
                </div>
            )}
        </motion.div>
    );
}
