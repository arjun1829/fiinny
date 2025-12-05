"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Send, X, Bot, User, ChevronRight } from "lucide-react";
import { ExpenseItem, IncomeItem } from "@/lib/firestore";
import { processQuery } from "@/lib/ai_service";

interface AiAssistantProps {
    expenses: ExpenseItem[];
    incomes: IncomeItem[];
    userName: string;
}

interface Message {
    id: string;
    role: "user" | "assistant";
    text: string;
    timestamp: Date;
}

export default function AiAssistant({ expenses, incomes, userName }: AiAssistantProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [isTyping, setIsTyping] = useState(false);
    const [messages, setMessages] = useState<Message[]>([
        {
            id: "welcome",
            role: "assistant",
            text: `Hi ${userName}! I'm your personal finance assistant. Ask me about your spending, income, or financial habits.`,
            timestamp: new Date()
        }
    ]);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isOpen]);

    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    const handleSend = async () => {
        if (!query.trim()) return;

        const userMsg: Message = {
            id: Date.now().toString(),
            role: "user",
            text: query,
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMsg]);
        setQuery("");
        setIsTyping(true);

        // Process Query
        const responseText = await processQuery(userMsg.text, { expenses, incomes });

        const aiMsg: Message = {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            text: responseText,
            timestamp: new Date()
        };

        setIsTyping(false);
        setMessages(prev => [...prev, aiMsg]);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            handleSend();
        }
    };

    const suggestions = [
        "Highest category spend for Nov month",
        "Total spend this month",
        "Income vs Expense last month",
        "Recent transactions"
    ];

    return (
        <>
            {/* Floating Action Button */}
            <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsOpen(true)}
                className={`fixed bottom-6 right-6 z-50 p-4 rounded-full shadow-lg transition-all duration-300 ${isOpen ? "scale-0 opacity-0" : "scale-100 opacity-100"
                    } bg-gradient-to-r from-teal-500 to-emerald-500 text-white hover:shadow-teal-500/30`}
            >
                <Sparkles className="w-6 h-6" />
            </motion.button>

            {/* Chat Window */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="fixed bottom-6 right-6 z-50 w-[90vw] md:w-[400px] h-[600px] max-h-[80vh] bg-white rounded-3xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden"
                    >
                        {/* Header */}
                        <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-teal-50 to-emerald-50 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm text-teal-600">
                                    <Sparkles className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-800">Fiinny AI</h3>
                                    <p className="text-xs text-slate-500 flex items-center gap-1">
                                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                                        Online
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="p-2 hover:bg-white/50 rounded-full transition-colors text-slate-500"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Messages Area */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
                            {messages.map((msg) => (
                                <motion.div
                                    key={msg.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                                >
                                    <div className={`max-w-[80%] rounded-2xl p-4 ${msg.role === "user"
                                            ? "bg-teal-600 text-white rounded-tr-none"
                                            : "bg-white border border-slate-100 text-slate-700 shadow-sm rounded-tl-none"
                                        }`}>
                                        {msg.role === "assistant" && (
                                            <div className="flex items-center gap-2 mb-2 text-xs font-bold text-teal-600 uppercase tracking-wider">
                                                <Bot className="w-3 h-3" /> Assistant
                                            </div>
                                        )}
                                        <div className="whitespace-pre-wrap leading-relaxed text-sm">
                                            {msg.text.split("**").map((part, i) =>
                                                i % 2 === 1 ? <strong key={i}>{part}</strong> : part
                                            )}
                                        </div>
                                        <div className={`text-[10px] mt-2 ${msg.role === "user" ? "text-teal-100" : "text-slate-400"}`}>
                                            {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>
                                </motion.div>
                            ))}

                            {isTyping && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="flex justify-start"
                                >
                                    <div className="bg-white border border-slate-100 rounded-2xl p-4 rounded-tl-none shadow-sm flex items-center gap-2">
                                        <div className="w-2 h-2 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                                        <div className="w-2 h-2 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                                        <div className="w-2 h-2 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                                    </div>
                                </motion.div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Suggestions (only if few messages) */}
                        {messages.length < 3 && (
                            <div className="px-4 py-2 bg-slate-50/50 overflow-x-auto flex gap-2 no-scrollbar">
                                {suggestions.map((s, i) => (
                                    <button
                                        key={i}
                                        onClick={() => {
                                            setQuery(s);
                                            // Optional: Auto-send or just fill? Let's just fill for now so user can edit
                                            // Actually, better UX to just send it if it's a chip
                                            // But let's fill input for now to be safe
                                            setQuery(s);
                                            inputRef.current?.focus();
                                        }}
                                        className="whitespace-nowrap px-3 py-1.5 bg-white border border-teal-100 text-teal-700 text-xs rounded-full hover:bg-teal-50 transition-colors shadow-sm"
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Input Area */}
                        <div className="p-4 bg-white border-t border-slate-100">
                            <div className="flex items-center gap-2 bg-slate-50 rounded-full px-4 py-2 border border-slate-200 focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-100 transition-all">
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder="Ask about your finances..."
                                    className="flex-1 bg-transparent border-none outline-none text-slate-700 placeholder:text-slate-400 text-sm"
                                />
                                <button
                                    onClick={handleSend}
                                    disabled={!query.trim() || isTyping}
                                    className="p-2 bg-teal-600 text-white rounded-full hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    <Send className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
