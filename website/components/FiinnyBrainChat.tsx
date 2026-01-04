"use client";

import { useState, useEffect, useRef } from "react";
import { MessageCircle, Send, X, Loader2, Maximize2, Minimize2, Mic, Plus, Trash2, DollarSign, BarChart3 } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, query, orderBy, limit, onSnapshot, addDoc, serverTimestamp, Timestamp, getDocs, writeBatch, doc, setDoc } from "firebase/firestore";

interface Message {
    id: string;
    text: string;
    isUser: boolean;
    timestamp: Date;
}

interface ChatSession {
    id: string;
    title: string;
    lastMessage: string;
    lastUpdated: Date;
    messageCount: number;
}

interface FiinnyBrainChatProps {
    userPhone: string;
}

export default function FiinnyBrainChat({ userPhone }: FiinnyBrainChatProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [size, setSize] = useState<"small" | "half" | "full">("small");
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(true);
    const [dailySuggestions, setDailySuggestions] = useState<string[]>([]);
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [showSessionList, setShowSessionList] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Speech Recognition Setup
    const startListening = () => {
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            const recognition = new SpeechRecognition();
            recognition.continuous = false;
            recognition.lang = 'en-US';

            recognition.onstart = () => setIsListening(true);
            recognition.onend = () => setIsListening(false);
            recognition.onresult = (event: any) => {
                const transcript = event.results[0][0].transcript;
                setInput(prev => prev + (prev ? " " : "") + transcript);
            };

            recognition.start();
        } else {
            alert("Speech recognition isn't supported in this browser. Try Chrome.");
        }
    };

    const handleExpand = () => {
        if (size === "small") setSize("half");
        else if (size === "half") setSize("full");
    };

    const handleMinimize = () => {
        if (size === "full") setSize("half");
        else if (size === "half") setSize("small");
    };

    // Load sessions list
    useEffect(() => {
        if (!isOpen || !userPhone) return;

        const sessionsRef = collection(db, "users", userPhone, "chat_sessions");
        const q = query(sessionsRef, orderBy("lastUpdated", "desc"), limit(10));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const sessionsList: ChatSession[] = [];
            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                sessionsList.push({
                    id: docSnap.id,
                    title: data.title || "Untitled Chat",
                    lastMessage: data.lastMessage || "",
                    lastUpdated: data.lastUpdated?.toDate() || new Date(),
                    messageCount: data.messageCount || 0,
                });
            });
            setSessions(sessionsList);

            // Auto-select first session or create new one
            if (sessionsList.length > 0 && !currentSessionId) {
                setCurrentSessionId(sessionsList[0].id);
            } else if (sessionsList.length === 0 && !currentSessionId) {
                createNewSession();
            }
        });

        return () => unsubscribe();
    }, [isOpen, userPhone]);

    // Subscribe to messages with pagination and caching
    useEffect(() => {
        if (!isOpen || !userPhone || !currentSessionId) return;

        // Try to load from cache first
        const cacheKey = `fiinny_chat_${userPhone}_${currentSessionId}`;
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            try {
                const cachedMessages = JSON.parse(cached);
                setMessages(cachedMessages.map((m: any) => ({
                    ...m,
                    timestamp: new Date(m.timestamp)
                })));
            } catch (e) {
                console.error('Cache parse error:', e);
            }
        }

        const messagesRef = collection(db, "users", userPhone, "chat_sessions", currentSessionId, "messages");
        // Limit to last 20 messages for cost optimization
        const q = query(messagesRef, orderBy("timestamp", "desc"), limit(20));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const msgs: Message[] = [];
            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                msgs.push({
                    id: docSnap.id,
                    text: data.text || "",
                    isUser: data.isUser || false,
                    timestamp: data.timestamp?.toDate() || new Date(),
                });
            });
            const sortedMsgs = msgs.reverse();
            setMessages(sortedMsgs);

            // Cache messages (store only last 20)
            localStorage.setItem(cacheKey, JSON.stringify(sortedMsgs));
        }, (error) => {
            console.error("Chat snapshot error:", error);
        });

        return () => unsubscribe();
    }, [isOpen, userPhone, currentSessionId]);

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Strip markdown formatting from text
    const stripMarkdown = (text: string): string => {
        return text
            .replace(/#{1,6}\s/g, '') // Remove headers
            .replace(/\*\*(.+?)\*\*/g, '$1') // Remove bold
            .replace(/\*(.+?)\*/g, '$1') // Remove italic
            .replace(/`(.+?)`/g, '$1') // Remove inline code
            .replace(/\[(.+?)\]\(.+?\)/g, '$1') // Remove links
            .replace(/^[->\s]/gm, '') // Remove list markers
            .trim();
    };

    // Create new chat session
    const createNewSession = async () => {
        try {
            const sessionId = `session_${Date.now()}`;
            const sessionsRef = doc(db, "users", userPhone, "chat_sessions", sessionId);

            await setDoc(sessionsRef, {
                title: "New Chat",
                lastMessage: "",
                lastUpdated: serverTimestamp(),
                messageCount: 0,
                createdAt: serverTimestamp()
            });

            setCurrentSessionId(sessionId);
            setMessages([]);
            setShowSuggestions(true);
            console.log(`Created new session: ${sessionId}`);
        } catch (error) {
            console.error('Error creating session:', error);
        }
    };

    const handleSend = async () => {
        if (!input.trim() || isProcessing || !currentSessionId) return;

        const userMessage = input.trim();
        setInput("");
        setIsProcessing(true);

        try {
            // Add user message to session
            const messagesRef = collection(db, "users", userPhone, "chat_sessions", currentSessionId, "messages");
            await addDoc(messagesRef, {
                text: userMessage,
                isUser: true,
                timestamp: serverTimestamp(),
                status: "sent",
            });

            // Call Cloud Function
            const response = await fetch("https://us-central1-lifemap-72b21.cloudfunctions.net/fiinnyBrainQuery", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userPhone, query: userMessage }),
            });

            const data = await response.json();

            // Add AI response with markdown stripped
            const cleanResponse = stripMarkdown(data.response || "I couldn't process that question. Please try again.");
            await addDoc(messagesRef, {
                text: cleanResponse,
                isUser: false,
                timestamp: serverTimestamp(),
                status: "sent",
            });

            // Update session metadata
            const sessionRef = doc(db, "users", userPhone, "chat_sessions", currentSessionId);
            await setDoc(sessionRef, {
                lastMessage: cleanResponse.substring(0, 100),
                lastUpdated: serverTimestamp(),
                messageCount: messages.length + 2,
                title: messages.length === 0 ? userMessage.substring(0, 30) : undefined
            }, { merge: true });
        } catch (error) {
            console.error("Error sending message:", error);
            // Add error message to session
            if (currentSessionId) {
                const messagesRef = collection(db, "users", userPhone, "chat_sessions", currentSessionId, "messages");
                await addDoc(messagesRef, {
                    text: "Sorry, I encountered an error. Please try again.",
                    isUser: false,
                    timestamp: serverTimestamp(),
                    status: "sent",
                });
            }
        } finally {
            setIsProcessing(false);
        }
    };

    // Generate daily suggestions based on context
    useEffect(() => {
        const today = new Date().toDateString();
        const lastSuggestionDate = localStorage.getItem('lastSuggestionDate');

        if (lastSuggestionDate !== today) {
            const allSuggestions = [
                "How much did I spend this week?",
                "Show my food expenses this month",
                "Is my spending increasing?",
                "What did I spend on travel?",
                "Check my expenses for today",
                "Who owes me money?",
            ];

            // Rotate suggestions daily
            const dayIndex = new Date().getDay();
            const selected = allSuggestions.slice(dayIndex % 3, (dayIndex % 3) + 3);
            setDailySuggestions(selected);
            localStorage.setItem('lastSuggestionDate', today);
        } else {
            const stored = localStorage.getItem('dailySuggestions');
            if (stored) {
                setDailySuggestions(JSON.parse(stored));
            }
        }
    }, []);

    // New Chat handler - creates new session
    const handleNewChat = () => {
        createNewSession();
        setShowSessionList(false);
    };

    // Delete Chat handler with Firestore batch delete
    const handleDeleteChat = async () => {
        if (!currentSessionId) return;

        if (confirm('Delete this chat? This cannot be undone.')) {
            try {
                const messagesRef = collection(db, "users", userPhone, "chat_sessions", currentSessionId, "messages");
                const snapshot = await getDocs(messagesRef);

                // Batch delete for efficiency
                const batch = writeBatch(db);
                snapshot.docs.forEach((document) => {
                    batch.delete(document.ref);
                });

                // Delete session document
                const sessionRef = doc(db, "users", userPhone, "chat_sessions", currentSessionId);
                batch.delete(sessionRef);

                await batch.commit();

                // Clear cache
                localStorage.removeItem(`fiinny_chat_${userPhone}_${currentSessionId}`);

                // Create new session
                await createNewSession();

                console.log(`Deleted session ${currentSessionId}`);
            } catch (error) {
                console.error('Error deleting chat:', error);
                alert('Failed to delete chat. Please try again.');
            }
        }
    };

    const handleSuggestionClick = (suggestion: string) => {
        setInput(suggestion);
        setShowSuggestions(false);
    };

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-6 right-6 w-14 h-14 bg-teal-600 text-white rounded-full shadow-lg hover:bg-teal-700 transition-all flex items-center justify-center z-[100] hover:scale-110"
                title="Fiinny AI"
            >
                <MessageCircle className="w-6 h-6" />
            </button>
        );
    }

    const sizeClasses = {
        small: "w-96 h-[500px]",
        half: "w-[600px] h-[700px]",
        full: "w-screen h-screen",
    };

    return (
        <div
            className={`fixed ${size === "full" ? "inset-0" : "bottom-6 right-6"} ${sizeClasses[size]} bg-white rounded-2xl shadow-2xl flex flex-col z-[100] transition-all duration-300`}
        >
            {/* Header */}
            <div className="flex-shrink-0">
                <div className="flex items-center justify-between p-4 bg-teal-600 text-white rounded-t-2xl">
                    <div className="flex items-center gap-3">
                        <MessageCircle className="w-6 h-6" />
                        <div>
                            <h3 className="font-semibold">Fiinny AI</h3>
                            <p className="text-xs opacity-90">Your AI assistant</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleNewChat}
                            className="hover:bg-white/10 p-2 rounded-lg transition-colors"
                            title="New Chat"
                        >
                            <Plus className="w-5 h-5" />
                        </button>
                        <button
                            onClick={handleDeleteChat}
                            className="hover:bg-white/10 p-2 rounded-lg transition-colors"
                            title="Delete Chat"
                        >
                            <Trash2 className="w-5 h-5" />
                        </button>
                        <button
                            onClick={handleExpand}
                            className="hover:bg-white/10 p-2 rounded-lg transition-colors"
                            title="Expand"
                        >
                            {size === "full" ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
                        </button>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="hover:bg-white/10 p-2 rounded-lg transition-colors"
                            title="Close"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Daily Suggestions */}
            {showSuggestions && messages.length === 0 && dailySuggestions.length > 0 && (
                <div className="p-4 border-b border-slate-100">
                    <p className="text-xs text-slate-500 mb-2">💡 Try asking:</p>
                    <div className="flex flex-wrap gap-2">
                        {dailySuggestions.map((suggestion: string, i: number) => (
                            <button
                                key={i}
                                onClick={() => handleSuggestionClick(suggestion)}
                                className="px-3 py-1.5 bg-teal-50 text-teal-700 rounded-full text-xs hover:bg-teal-100 transition-colors"
                            >
                                {suggestion}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Quick Actions */}
            {messages.length > 0 && (
                <div className="px-4 py-2 border-b border-slate-100 flex gap-2 overflow-x-auto">
                    <button
                        onClick={() => setInput("Add expense for ")}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-teal-500 to-teal-600 text-white rounded-full text-xs hover:from-teal-600 hover:to-teal-700 transition-all shadow-sm hover:shadow-md whitespace-nowrap"
                    >
                        <DollarSign className="w-3.5 h-3.5" />
                        Add Expense
                    </button>
                    <button
                        onClick={() => setInput("Show my spending summary for this month")}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-full text-xs hover:from-purple-600 hover:to-purple-700 transition-all shadow-sm hover:shadow-md whitespace-nowrap"
                    >
                        <BarChart3 className="w-3.5 h-3.5" />
                        View Summary
                    </button>
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
                            className={`flex flex-col ${msg.isUser ? "items-end" : "items-start"}`}
                        >
                            <div
                                className={`max-w-[80%] rounded-2xl px-4 py-2 ${msg.isUser
                                    ? "bg-teal-600 text-white"
                                    : "bg-slate-100 text-slate-900"
                                    }`}
                            >
                                <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                            </div>
                            <span className="text-xs text-slate-400 mt-1 px-2">
                                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                    ))
                )}
                {isProcessing && (
                    <div className="flex justify-start">
                        <div className="bg-slate-100 rounded-2xl px-4 py-3 flex items-center gap-2">
                            <div className="flex gap-1">
                                <div className="w-2 h-2 bg-teal-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                <div className="w-2 h-2 bg-teal-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                <div className="w-2 h-2 bg-teal-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                            </div>
                            <span className="text-sm text-slate-600">Generating...</span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="flex-shrink-0 p-4 border-t border-slate-100">
                <div className="flex gap-2">
                    <button
                        onClick={startListening}
                        className={`p-3 rounded-full transition-colors ${isListening ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                        title="Voice Input"
                    >
                        <Mic className="w-5 h-5" />
                    </button>
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyPress={(e) => e.key === "Enter" && handleSend()}
                        placeholder="Ask me anything..."
                        className="flex-1 px-4 py-3 bg-slate-100 rounded-full focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || isProcessing}
                        className="p-3 bg-teal-600 text-white rounded-full hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        title="Send"
                    >
                        <Send className="w-5 h-5" />
                    </button>
                </div>
            </div>
        </div>
    );
}
