import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail, CheckCircle, AlertCircle, Loader2, ShieldCheck, ArrowRight } from 'lucide-react';
import { GmailService } from '@/lib/gmail';

interface GmailLinkModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function GmailLinkModal({ isOpen, onClose, onSuccess }: GmailLinkModalProps) {
    const [status, setStatus] = useState<'idle' | 'connecting' | 'success' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState('');

    const handleConnect = async () => {
        setStatus('connecting');
        setErrorMessage('');
        try {
            const service = GmailService.getInstance();
            const success = await service.connect();
            if (success) {
                setStatus('success');
                setTimeout(() => {
                    onSuccess();
                    onClose();
                }, 1500);
            } else {
                setStatus('error');
                setErrorMessage('Connection failed or cancelled.');
            }
        } catch (e: any) {
            console.error(e);
            setStatus('error');
            setErrorMessage(e.message || 'An unexpected error occurred.');
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        onClick={(e) => e.stopPropagation()}
                        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
                    >
                        {/* Close Button */}
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors z-10"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <div className="p-8 flex flex-col items-center text-center">
                            {/* Icon Animation */}
                            <div className="relative mb-6">
                                <div className="absolute inset-0 bg-red-100 rounded-full scale-150 blur-xl opacity-50" />
                                <div className="relative w-20 h-20 bg-gradient-to-br from-red-50 to-red-100 rounded-2xl flex items-center justify-center shadow-inner border border-red-200">
                                    <Mail className="w-10 h-10 text-red-600" />
                                </div>
                                {status === 'success' && (
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        className="absolute -bottom-2 -right-2 bg-green-500 text-white p-1.5 rounded-full shadow-lg border-2 border-white"
                                    >
                                        <CheckCircle className="w-4 h-4" />
                                    </motion.div>
                                )}
                            </div>

                            <h2 className="text-2xl font-bold text-slate-900 mb-2">
                                Link Gmail Account
                            </h2>
                            <p className="text-slate-500 mb-8 max-w-xs mx-auto leading-relaxed">
                                Automatically track expenses from transaction emails. Secure, read-only access.
                            </p>

                            {/* Features List */}
                            <div className="w-full space-y-3 mb-8 text-left bg-slate-50 p-4 rounded-xl border border-slate-100">
                                <div className="flex items-start gap-3">
                                    <ShieldCheck className="w-5 h-5 text-teal-600 mt-0.5 shrink-0" />
                                    <div>
                                        <h4 className="text-sm font-semibold text-slate-900">Privacy First</h4>
                                        <p className="text-xs text-slate-500 mt-0.5">We only read transaction emails. Your personal data stays private.</p>
                                    </div>
                                </div>
                            </div>

                            {/* Action Button */}
                            <button
                                onClick={handleConnect}
                                disabled={status === 'connecting' || status === 'success'}
                                className={`
                                    w-full py-3.5 px-6 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all
                                    ${status === 'success'
                                        ? 'bg-green-600 hover:bg-green-700 text-white shadow-green-600/20'
                                        : status === 'error'
                                            ? 'bg-red-600 hover:bg-red-700 text-white shadow-red-600/20'
                                            : 'bg-slate-900 hover:bg-slate-800 text-white shadow-slate-900/20'
                                    }
                                    disabled:opacity-70 disabled:cursor-not-allowed shadow-lg active:scale-[0.98]
                                `}
                            >
                                {status === 'connecting' ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        <span>Connecting...</span>
                                    </>
                                ) : status === 'success' ? (
                                    <>
                                        <CheckCircle className="w-5 h-5" />
                                        <span>Connected!</span>
                                    </>
                                ) : (
                                    <>
                                        <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
                                        <span>Continue with Google</span>
                                        <ArrowRight className="w-4 h-4 opacity-50" />
                                    </>
                                )}
                            </button>

                            {/* Error Message */}
                            <AnimatePresence>
                                {status === 'error' && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="mt-4 flex items-center gap-2 text-red-600 text-sm bg-red-50 px-4 py-2 rounded-lg"
                                    >
                                        <AlertCircle className="w-4 h-4" />
                                        <span className="flex-1 text-left">{errorMessage}</span>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            <p className="mt-6 text-xs text-slate-400">
                                This will open a secure Google sign-in popup.
                            </p>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
