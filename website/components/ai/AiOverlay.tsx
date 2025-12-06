"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Send, X, Bot, ChevronUp, ChevronDown, Settings, Cpu, Download, CheckCircle, Camera, Image as ImageIcon, Loader2, Mic, MicOff, Volume2, VolumeX, Maximize2, Minimize2 } from "lucide-react";
import { useAi } from "./AiContext";
import { usePathname } from "next/navigation";
import { recognizeImage, parseReceipt } from "@/lib/ai/vision_service";
// import { transcribeAudio, speak } from "@/lib/ai/voice_service";
import ChartRenderer from "./ChartRenderer";
import ActionCard from "./ActionCard";
import { isValidChartConfig } from "@/lib/ai/chart_service";

export default function AiOverlay() {
    const {
        isOpen, openAi, closeAi, messages, sendMessage, isTyping,
        isPremium, togglePremium,
        isModelLoaded, isModelLoading, modelProgress, loadModel,
        pendingAction, confirmAction, cancelAction, clearChat
    } = useAi();

    const [query, setQuery] = useState("");
    const [showSettings, setShowSettings] = useState(false);
    const [isWidgetMode, setIsWidgetMode] = useState(false);

    // Vision State
    const [isProcessingImage, setIsProcessingImage] = useState(false);
    const [ocrProgress, setOcrProgress] = useState(0);

    // Voice State
    const [isListening, setIsListening] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false); // Toggle for TTS
    const [isProcessingVoice, setIsProcessingVoice] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const pathname = usePathname();

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isOpen, showSettings, isProcessingImage, isProcessingVoice, pendingAction]);

    // Auto-Focus Input
    useEffect(() => {
        if (isOpen && !showSettings && !isProcessingImage && !isListening && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen, showSettings, isProcessingImage, isListening]);

    // Speak Response if Voice Mode is On
    useEffect(() => {
        if (isSpeaking && messages.length > 0) {
            const lastMsg = messages[messages.length - 1];
            if (lastMsg.role === "assistant" && !lastMsg.content.includes("Listening...")) {
                // speak(lastMsg.content);
            }
        }
    }, [messages, isSpeaking]);

    const handleSend = async () => {
        if (!query.trim()) return;
        const text = query;
        setQuery("");
        await sendMessage(text);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            handleSend();
        }
    };

    // --- Vision Handler ---
    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsProcessingImage(true);
        setOcrProgress(0);

        try {
            const text = await recognizeImage(file, (progress) => {
                setOcrProgress(Math.round(progress));
            });
            const result = await parseReceipt(text, isPremium, isModelLoaded);

            setQuery(`I spent $${result.amount} at ${result.merchant} on ${result.category}.`);
            await sendMessage(`I found a receipt from **${result.merchant}** for **$${result.amount}** (${result.category}).\n\nShall I log this expense?`);

        } catch (error) {
            console.error("Vision Error:", error);
            await sendMessage("I tried to read that image, but my vision is a bit blurry. 😵‍💫 Could you type the details instead?");
        } finally {
            setIsProcessingImage(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    // --- Voice Handler ---
    const startListening = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
                setIsProcessingVoice(true);
                try {
                    // const text = await transcribeAudio(audioBlob);
                    const text = ""; // Disabled for now
                    if (text) {
                        setQuery(text);
                        // Optional: Auto-send if confident? For now, let user confirm.
                        // await sendMessage(text); 
                    }
                } catch (error) {
                    console.error("Voice Error:", error);
                } finally {
                    setIsProcessingVoice(false);
                }

                // Stop all tracks to release mic
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            setIsListening(true);
        } catch (error) {
            console.error("Error accessing microphone:", error);
            alert("Could not access microphone. Please check permissions.");
        }
    };

    const stopListening = () => {
        if (mediaRecorderRef.current && isListening) {
            mediaRecorderRef.current.stop();
            setIsListening(false);
        }
    };

    const toggleListening = () => {
        if (isListening) {
            stopListening();
        } else {
            startListening();
        }
    };

    // Contextual Suggestions
    const getSuggestions = () => {
        if (pathname.includes("/dashboard/transactions")) {
            return ["Show recent food expenses", "Total spent this week", "Highest transaction this month"];
        }
        if (pathname === "/dashboard") {
            return ["How am I doing this month?", "Where is my money going?", "Predict my balance for next month"];
        }
        return ["How much did I save last month?", "What's my highest expense category?", "Any unusual spending?"];
    };
    const suggestions = getSuggestions();

    return (
        <>
            {/* Global Floating Action Button */}
            <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={openAi}
                className={`fixed bottom-6 right-6 z-50 p-4 rounded-full shadow-2xl transition-all duration-500 ${isOpen ? "scale-0 opacity-0" : "scale-100 opacity-100"
                    } ${isPremium ? "bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-500 shadow-orange-500/50" : "bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 shadow-purple-500/50"} text-white`}
            >
                <Sparkles className="w-6 h-6 animate-pulse" />
            </motion.button>

            {/* Overlay Backdrop */}
            <AnimatePresence>
                {isOpen && (
                    <>
                        {!isWidgetMode && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={closeAi}
                                className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
                            />
                        )}

                        {/* Main Modal / Widget */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{
                                opacity: 1,
                                scale: 1,
                                y: 0,
                                width: isWidgetMode ? "380px" : "100%",
                                height: isWidgetMode ? "600px" : "auto",
                                position: "fixed",
                                right: isWidgetMode ? "20px" : "0",
                                bottom: isWidgetMode ? "20px" : "0",
                                top: isWidgetMode ? "auto" : "auto", // Handle full screen via class
                                left: isWidgetMode ? "auto" : "0",
                                borderRadius: isWidgetMode ? "24px" : "32px 32px 0 0"
                            }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            transition={{ type: "spring", damping: 25, stiffness: 200 }}
                            className={`z-50 bg-white shadow-2xl overflow-hidden flex flex-col border border-slate-100 ${!isWidgetMode ? "h-[85vh] md:h-[650px] max-h-[90vh]" : ""}`}
                        >
                            {/* Header */}
                            <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-slate-50 bg-gradient-to-b from-white to-slate-50/50">
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shadow-inner ${isPremium ? "bg-gradient-to-tr from-amber-100 to-orange-100 text-amber-600" : "bg-gradient-to-tr from-indigo-100 to-purple-100 text-indigo-600"}`}>
                                        <Sparkles className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-bold text-slate-800 text-lg">Fiinny</h3>
                                            {isPremium ? (
                                                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded-full border border-amber-200 uppercase tracking-wide">Premium</span>
                                            ) : (
                                                <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-bold rounded-full border border-slate-200 uppercase tracking-wide">Free</span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <span className={`w-1.5 h-1.5 rounded-full ${isModelLoaded ? "bg-emerald-500" : "bg-amber-400 animate-pulse"}`}></span>
                                            <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                                                {isModelLoaded ? "Brain Active" : "Simulated"}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={clearChat}
                                        className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-indigo-600 transition-colors"
                                        title="New Chat"
                                    >
                                        <Bot className="w-5 h-5" />
                                        <span className="sr-only">New Chat</span>
                                    </button>

                                    {/* Widget Toggle */}
                                    <button
                                        onClick={() => setIsWidgetMode(!isWidgetMode)}
                                        className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                                        title={isWidgetMode ? "Expand" : "Widget Mode"}
                                    >
                                        {isWidgetMode ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
                                    </button>

                                    {/* Voice Toggle */}
                                    <button
                                        onClick={() => setIsSpeaking(!isSpeaking)}
                                        className={`p-2 rounded-full transition-colors ${isSpeaking ? "bg-indigo-100 text-indigo-600" : "text-slate-400 hover:bg-slate-100"}`}
                                        title={isSpeaking ? "Mute Voice" : "Enable Voice"}
                                    >
                                        {isSpeaking ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                                    </button>

                                    <button
                                        onClick={() => setShowSettings(!showSettings)}
                                        className={`p-2 hover:bg-slate-100 rounded-full transition-colors ${showSettings ? "bg-indigo-50 text-indigo-600" : "text-slate-400 hover:text-slate-600"}`}
                                    >
                                        <Settings className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={closeAi}
                                        className="p-2 hover:bg-red-50 hover:text-red-500 rounded-full text-slate-400 transition-colors"
                                    >
                                        <X className="w-6 h-6" />
                                    </button>
                                </div>
                            </div>

                            {/* Main Content Area (Chat or Settings) */}
                            {showSettings ? (
                                <div className="flex-1 p-6 bg-slate-50/30 overflow-y-auto">
                                    <div className="max-w-md mx-auto space-y-6">
                                        <div className="text-center">
                                            <h2 className="text-xl font-bold text-slate-800">Settings</h2>
                                            <p className="text-sm text-slate-500">Configure your Fiinny experience</p>
                                        </div>

                                        {/* Local Brain Section */}
                                        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
                                            <div className="flex items-center gap-2 text-slate-800 font-semibold">
                                                <Cpu className="w-4 h-4 text-indigo-500" />
                                                <h3>Local Brain (Llama 3)</h3>
                                            </div>
                                            <p className="text-xs text-slate-500">
                                                Run Fiinny entirely on your device.
                                                <b> 100% Private. No Internet required after download.</b>
                                            </p>

                                            {!isModelLoaded && !isModelLoading && (
                                                <button
                                                    onClick={loadModel}
                                                    className="w-full py-3 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-xl font-medium hover:bg-indigo-100 transition-all flex items-center justify-center gap-2"
                                                >
                                                    <Download className="w-4 h-4" />
                                                    Download Brain (~2GB)
                                                </button>
                                            )}

                                            {isModelLoading && (
                                                <div className="space-y-2">
                                                    <div className="flex justify-between text-xs font-medium text-slate-600">
                                                        <span>Downloading...</span>
                                                        <span>{modelProgress.includes("%") ? modelProgress.split(" ").pop() : ""}</span>
                                                    </div>
                                                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                                                        <motion.div
                                                            initial={{ width: 0 }}
                                                            animate={{ width: "100%" }}
                                                            transition={{ duration: 20, repeat: Infinity }}
                                                            className="bg-indigo-500 h-full rounded-full"
                                                        />
                                                    </div>
                                                    <p className="text-[10px] text-slate-400 text-center">{modelProgress}</p>
                                                </div>
                                            )}

                                            {isModelLoaded && (
                                                <div className="flex items-center gap-2 p-3 bg-green-50 text-green-700 rounded-xl border border-green-100 text-sm font-medium">
                                                    <CheckCircle className="w-4 h-4" />
                                                    Brain Active & Ready
                                                </div>
                                            )}
                                        </div>

                                        {/* Premium Toggle */}
                                        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <h3 className="font-semibold text-slate-800">Premium Mode</h3>
                                                    <p className="text-xs text-slate-500">Unlock deep analysis & advice</p>
                                                </div>
                                                <button
                                                    onClick={togglePremium}
                                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${isPremium ? 'bg-amber-500' : 'bg-slate-200'}`}
                                                >
                                                    <span
                                                        className={`${isPremium ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                                                    />
                                                </button>
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => setShowSettings(false)}
                                            className="w-full py-3 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition-all"
                                        >
                                            Save & Return to Chat
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {/* Chat Area */}
                                    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/30">
                                        {messages.map((msg) => (
                                            <motion.div
                                                key={msg.id}
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                                            >
                                                <div className={`max-w-[85%] md:max-w-[70%] rounded-2xl p-5 shadow-sm ${msg.role === "user"
                                                    ? "bg-slate-900 text-white rounded-tr-none"
                                                    : "bg-white border border-slate-100 text-slate-700 rounded-tl-none"
                                                    }`}>
                                                    {msg.role === "assistant" && (
                                                        <div className="flex items-center gap-2 mb-3 text-xs font-bold text-indigo-500 uppercase tracking-wider">
                                                            <Bot className="w-3 h-3" /> Fiinny
                                                        </div>
                                                    )}
                                                    <div className="whitespace-pre-wrap leading-relaxed text-[15px]">
                                                        {msg.content.split("**").map((part, i) =>
                                                            i % 2 === 1 ? <strong key={i} className={msg.role === "assistant" ? "text-slate-900 font-bold" : "font-bold"}>{part}</strong> : part
                                                        )}

                                                        {(() => {
                                                            try {
                                                                // Look for JSON block with chart config
                                                                const match = msg.content.match(/```json\n({[\s\S]*?"type":\s*"(pie|bar|line|area)"[\s\S]*?})\n```/);
                                                                if (match) {
                                                                    const config = JSON.parse(match[1]);
                                                                    if (isValidChartConfig(config)) {
                                                                        return <ChartRenderer config={config} />;
                                                                    }
                                                                }
                                                            } catch (e) {
                                                                return null;
                                                            }
                                                        })()}
                                                    </div>
                                                    <div className={`text-[10px] mt-3 ${msg.role === "user" ? "text-slate-400" : "text-slate-400"}`}>
                                                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                </div>
                                            </motion.div>
                                        ))}

                                        {/* Image Processing Indicator */}
                                        {isProcessingImage && (
                                            <motion.div
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                className="flex justify-start"
                                            >
                                                <div className="bg-white border border-slate-100 rounded-2xl p-5 rounded-tl-none shadow-sm flex items-center gap-3">
                                                    <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                                                    <div className="space-y-1">
                                                        <p className="text-sm font-medium text-slate-700">Scanning Receipt...</p>
                                                        <div className="w-32 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                                            <motion.div
                                                                className="bg-indigo-500 h-full rounded-full"
                                                                initial={{ width: 0 }}
                                                                animate={{ width: `${ocrProgress}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}

                                        {/* Voice Processing Indicator */}
                                        {isProcessingVoice && (
                                            <motion.div
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                className="flex justify-start"
                                            >
                                                <div className="bg-white border border-slate-100 rounded-2xl p-5 rounded-tl-none shadow-sm flex items-center gap-3">
                                                    <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                                                    <p className="text-sm font-medium text-slate-700">Transcribing audio...</p>
                                                </div>
                                            </motion.div>
                                        )}

                                        {/* Action Confirmation Card */}
                                        {pendingAction && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className="mb-4"
                                            >
                                                <ActionCard
                                                    action={pendingAction}
                                                    onConfirm={confirmAction}
                                                    onCancel={cancelAction}
                                                />
                                            </motion.div>
                                        )}

                                        {isTyping && !isProcessingImage && !isProcessingVoice && (
                                            <motion.div
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                className="flex justify-start"
                                            >
                                                <div className="bg-white border border-slate-100 rounded-2xl p-5 rounded-tl-none shadow-sm flex items-center gap-2">
                                                    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                                                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                                                    <div className="w-2 h-2 bg-pink-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                                                </div>
                                            </motion.div>
                                        )}
                                        <div ref={messagesEndRef} />
                                    </div>

                                    {/* Input Area & Suggestions */}
                                    <div className="bg-white border-t border-slate-100 p-4 pb-8 md:pb-4">
                                        {/* Suggestions */}
                                        {messages.length < 3 && (
                                            <div className="flex gap-2 overflow-x-auto pb-4 no-scrollbar mask-linear-fade">
                                                {suggestions.map((s, i) => (
                                                    <button
                                                        key={i}
                                                        onClick={() => sendMessage(s)}
                                                        className="whitespace-nowrap px-4 py-2 bg-slate-50 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 rounded-full text-xs font-medium transition-colors border border-slate-100"
                                                    >
                                                        {s}
                                                    </button>
                                                ))}
                                            </div>
                                        )}

                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => fileInputRef.current?.click()}
                                                className="p-3 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 rounded-full transition-all"
                                                title="Upload Image"
                                            >
                                                <ImageIcon className="w-5 h-5" />
                                            </button>
                                            <input
                                                type="file"
                                                ref={fileInputRef}
                                                className="hidden"
                                                accept="image/*"
                                                onChange={handleImageUpload}
                                            />

                                            <button
                                                onClick={toggleListening}
                                                className={`p-3 rounded-full transition-all ${isListening
                                                    ? "bg-red-100 text-red-500 animate-pulse"
                                                    : "text-slate-400 hover:text-indigo-500 hover:bg-indigo-50"
                                                    }`}
                                                title={isListening ? "Stop Listening" : "Speak"}
                                            >
                                                {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                                            </button>
                                            <div className="flex-1 relative">
                                                <input
                                                    ref={inputRef}
                                                    type="text"
                                                    value={query}
                                                    onChange={(e) => setQuery(e.target.value)}
                                                    onKeyDown={handleKeyDown}
                                                    placeholder={isListening ? "Listening..." : "Ask Fiinny..."}
                                                    className="w-full pl-4 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-slate-400 text-sm text-slate-900"
                                                    disabled={isProcessingImage || isProcessingVoice}
                                                />
                                                <button
                                                    onClick={handleSend}
                                                    disabled={!query.trim() || isTyping}
                                                    className="absolute right-1.5 top-1.5 p-1.5 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 transition-all shadow-sm"
                                                >
                                                    {isTyping ? (
                                                        <Sparkles className="w-4 h-4 animate-spin" />
                                                    ) : (
                                                        <Send className="w-4 h-4" />
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </motion.div>
                    </>
                )}
            </AnimatePresence >
        </>
    );
}
