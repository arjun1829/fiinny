"use client";

import React, { useState, useEffect } from "react";
import { Sparkles, ArrowRight, X } from "lucide-react";
import { SmartParser } from "@/lib/smart_parser";
import { motion, AnimatePresence } from "framer-motion";

interface MagicInputProps {
    onAdd: (transaction: any) => void;
}

export default function MagicInput({ onAdd }: MagicInputProps) {
    const [text, setText] = useState("");
    const [preview, setPreview] = useState<any>(null);
    const [isListening, setIsListening] = useState(false);

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            if (text.length > 5) { // Minimum chars to start guessing
                const guess = SmartParser.parseNaturalLanguage(text);
                setPreview(guess);
            } else {
                setPreview(null);
            }
        }, 150); // Debounce

        return () => clearTimeout(timeoutId);
    }, [text]);

    const handleVoiceToggle = () => {
        if (isListening) {
            setIsListening(false);
            return;
        }

        // Check browser support
        if (!('webkitSpeechRecognition' in window)) {
            alert("Voice input is not supported in this browser. Try Chrome!");
            return;
        }

        const recognition = new (window as any).webkitSpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US'; // Default to English

        recognition.onstart = () => {
            setIsListening(true);
        };

        recognition.onresult = (event: any) => {
            const transcript = event.results[0][0].transcript;
            setText(prev => prev ? `${prev} ${transcript}` : transcript);
            setIsListening(false);
        };

        recognition.onerror = (event: any) => {
            console.error("Speech recognition error", event.error);
            setIsListening(false);
        };

        recognition.onend = () => {
            setIsListening(false);
        };

        recognition.start();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && preview) {
            e.preventDefault();
            handleSubmit();
        }
    };

    const handleSubmit = () => {
        if (!preview) return;

        // Construct standard transaction object
        const tx = {
            amount: preview.amount,
            category: preview.category,
            type: preview.type, // 'expense' or 'income'
            description: preview.description,
            date: preview.date || new Date().toISOString()
        };

        onAdd(tx);
        setText("");
        setPreview(null);
    };

    return (
        <div className="relative mb-6">
            <div className={`relative bg-white rounded-2xl border transition-all duration-300 ${preview ? 'border-teal-400 shadow-[0_0_20px_rgba(45,212,191,0.2)]' : isListening ? 'border-rose-400 shadow-[0_0_20px_rgba(251,113,133,0.3)]' : 'border-slate-200'}`}>
                {/* Input Area */}
                <div className="flex items-center px-4 py-3 gap-3">
                    <Sparkles className={`w-5 h-5 transition-colors ${preview ? 'text-teal-500' : 'text-slate-400'}`} />
                    <input
                        type="text"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={isListening ? "Listening..." : "Type 'Coffee 250' or 'Salary 50k'..."}
                        className="flex-1 bg-transparent border-none outline-none text-slate-800 placeholder-slate-400 font-medium"
                    />

                    {/* Voice Button */}
                    <button
                        onClick={handleVoiceToggle}
                        className={`p-2 rounded-full transition-all ${isListening ? 'bg-rose-100 text-rose-600 animate-pulse' : 'hover:bg-slate-100 text-slate-400'}`}
                        title="Voice Input"
                    >
                        {isListening ? (
                            <div className="w-2 h-2 bg-rose-600 rounded-full animate-ping" />
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" x2="12" y1="19" y2="22" /></svg>
                        )}
                    </button>

                    {text && (
                        <button
                            onClick={() => { setText(''); setPreview(null); }}
                            className="p-1 hover:bg-slate-100 rounded-full text-slate-400"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {/* Live Preview Card */}
                <AnimatePresence>
                    {preview && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="border-t border-slate-100 bg-teal-50/30 rounded-b-2xl overflow-hidden"
                        >
                            <div className="px-4 py-3 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${preview.type === 'income' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                                        <span className="text-lg font-bold">
                                            {preview.type === 'income' ? '+' : '-'}
                                        </span>
                                    </div>
                                    <div>
                                        <p className="font-bold text-slate-900 flex items-center gap-2">
                                            {preview.description}
                                            <span className="text-xs font-normal text-slate-500 px-2 py-0.5 bg-white rounded-full border border-slate-200">
                                                {preview.category}
                                            </span>
                                        </p>
                                        <div className="flex items-center gap-2 text-sm text-slate-500">
                                            <span>{preview.type === 'income' ? 'Income' : 'Expense'}</span>
                                            {preview.date && (
                                                <span className="text-slate-400 border-l border-slate-200 pl-2">
                                                    {new Date(preview.date).toLocaleDateString()}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <button
                                    onClick={handleSubmit}
                                    className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
                                >
                                    <span>Add ₹{preview.amount.toLocaleString()}</span>
                                    <ArrowRight className="w-4 h-4" />
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Hint text */}
            {!preview && !text && !isListening && (
                <div className="absolute right-12 top-1/2 -translate-y-1/2 text-xs text-slate-400 bg-slate-50 px-2 py-1 rounded-md border border-slate-100 pointer-events-none">
                    ✨ Magic Add (or tap Mic)
                </div>
            )}
        </div>
    );
}
