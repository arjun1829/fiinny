"use client";

import { useState, useEffect, useRef } from "react";
import { MessageCircle, Send, X, Loader2 } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, Timestamp } from "firebase/firestore";

interface Message {
    id: string;
    text: string;
    isUser: boolean;
    timestamp: Date;
}

interface FiinnyBrainChatProps {
    userPhone: string;
}

export default function FiinnyBrainChat({ userPhone }: FiinnyBrainChatProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Subscribe to messages
    useEffect(() => {
        if (!isOpen || !userPhone) return;

        const messagesRef = collection(db, "users", userPhone, "brain_chat");
        const q = query(messagesRef, orderBy("timestamp", "desc"));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const msgs: Message[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                msgs.push({
                    id: doc.id,
                    text: data.text || "",
                    isUser: data.isUser || false,
                    timestamp: data.timestamp?.toDate() || new Date(),
                });
            });
            setMessages(msgs.reverse());
        });

        return () => unsubscribe();
    }, [isOpen, userPhone]);

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || isProcessing) return;

        const userMessage = input.trim();
        setInput("");
        setIsProcessing(true);

        try {
            // Add user message
            const messagesRef = collection(db, "users", userPhone, "brain_chat");
            await addDoc(messagesRef, {
                text: userMessage,
                isUser: true,
                timestamp: serverTimestamp(),
                status: "sent",
            });

            // Call Cloud Function or API route to process query
            const response = await fetch("/api/fiinny-brain/query", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userPhone, query: userMessage }),
            });

            const data = await response.json();

            // Add AI response
            await addDoc(messagesRef, {
                text: data.response || "I couldn't process that question. Please try again.",
                isUser: false,
                timestamp: serverTimestamp(),
                status: "sent",
            });
        } catch (error) {
            console.error("Error sending message:", error);
            // Add error message
            const messagesRef = collection(db, "users", userPhone, "brain_chat");
            await addDoc(messagesRef, {
                text: "Sorry, I encountered an error. Please try again.",
                isUser: false,
                timestamp: serverTimestamp(),
                status: "sent",
            });
        } finally {
            setIsProcessing(false);
        }
    };

    const suggestions = [
        "How much do I owe?",
        "Show travel expenses",
        "Who should I remind?",
        "Was my flight tracked?",
    ];

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-6 right-6 w-14 h-14 bg-teal-600 text-white rounded-full shadow-lg hover:bg-teal-700 transition-all flex items-center justify-center z-50 hover:scale-110"
                title="Fiinny Brain Chat"
            >
                <MessageCircle className="w-6 h-6" />
            </button>
        );
    }

    return (
        <div className="fixed bottom-6 right-6 w-96 h-[600px] bg-white rounded-2xl shadow-2xl flex flex-col z-50 border border-slate-200">
            {/* Header */}
            <div className="bg-gradient-to-r from-teal-600 to-teal-700 text-white p-4 rounded-t-2xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                        <MessageCircle className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="font-semibold">Fiinny Brain</h3>
                        <p className="text-xs text-teal-100">Ask me anything</p>
                    </div>
                </div>
                <button
                    onClick={() => setIsOpen(false)}
                    className="hover:bg-white/10 p-2 rounded-lg transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Suggestions */}
            {messages.length === 0 && (
                <div className="p-4 border-b border-slate-100">
                    <p className="text-xs text-slate-500 mb-2">Try asking:</p>
                    <div className="flex flex-wrap gap-2">
                        {suggestions.map((suggestion, i) => (
                            <button
                                key={i}
                                onClick={() => {
                                    setInput(suggestion);
                                    handleSend();
                                }}
                                className="text-xs px-3 py-1.5 bg-teal-50 text-teal-700 rounded-full hover:bg-teal-100 transition-colors"
                            >
                                {suggestion}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 ? (
                    <div className="text-center text-slate-400 mt-20">
                        <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p className="text-sm">Start a conversation!</p>
                    </div>
                ) : (
                    messages.map((msg) => (
                        <div
                            key={msg.id}
                            className={`flex ${msg.isUser ? "justify-end" : "justify-start"}`}
                        >
                            <div
                                className={`max-w-[80%] rounded-2xl px-4 py-2 ${msg.isUser
                                        ? "bg-teal-600 text-white"
                                        : "bg-slate-100 text-slate-900"
                                    }`}
                            >
                                <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                            </div>
                        </div>
                    ))
                )}
                {isProcessing && (
                    <div className="flex justify-start">
                        <div className="bg-slate-100 rounded-2xl px-4 py-3 flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
                            <span className="text-sm text-slate-600">Thinking...</span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-slate-100">
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyPress={(e) => e.key === "Enter" && handleSend()}
                        placeholder="Ask me anything..."
                        disabled={isProcessing}
                        className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-full focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all text-sm"
                    />
                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || isProcessing}
                        className="w-10 h-10 bg-teal-600 text-white rounded-full hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                    >
                        {isProcessing ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <Send className="w-5 h-5" />
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
