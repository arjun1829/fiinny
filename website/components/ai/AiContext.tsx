"use client";

import React, { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { Message } from "@/lib/ai/ai_types";
import { generateResponse } from "@/lib/ai/llm_service";
import { ExpenseItem, IncomeItem } from "@/lib/firestore";
import { initializeWebLLM, isWebLLMLoaded } from "@/lib/ai/providers/webllm_client";
import { PendingAction } from "@/lib/ai/action_service";
import { useAuth } from "../AuthProvider";
import { FinancialProfile, DEFAULT_PROFILE, getUserProfile } from "@/lib/ai/personalization_service";

interface AiContextType {
    isOpen: boolean;
    openAi: () => void;
    closeAi: () => void;
    toggleAi: () => void;
    messages: Message[];
    sendMessage: (text: string) => Promise<void>;
    isTyping: boolean;
    setContextData: (data: { expenses: ExpenseItem[]; incomes: IncomeItem[] }) => void;
    isPremium: boolean;
    togglePremium: () => void;

    // Local Brain State
    isModelLoaded: boolean;
    isModelLoading: boolean;
    modelProgress: string;
    loadModel: () => Promise<void>;

    // Action State
    pendingAction: PendingAction | null;
    setPendingAction: (action: PendingAction | null) => void;
    confirmAction: () => Promise<void>;
    cancelAction: () => void;

    // Personalization
    profile: FinancialProfile;

    // Refresh Trigger for Dashboard
    refreshTrigger: number;
    triggerRefresh: () => void;

    // Chat Management
    clearChat: () => void;
}

const AiContext = createContext<AiContextType | undefined>(undefined);

export const AiProvider = ({ children }: { children: ReactNode }) => {
    const [isOpen, setIsOpen] = useState(false);

    // Initialize messages from localStorage if available, otherwise default welcome
    const [messages, setMessages] = useState<Message[]>([]);

    const DEFAULT_WELCOME_MSG: Message[] = [
        {
            id: "welcome",
            role: "assistant", // Explicitly typed by Message[] annotation
            content: "Hi! I'm **Fiinny**, your financial wellness coach. 🎩\n\nI can help you analyze spending, track habits, and feel good about your money. What's on your mind?",
            timestamp: new Date()
        }
    ];

    useEffect(() => {
        const saved = localStorage.getItem("fiinny_chat_history");
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                // Convert string timestamps back to Date objects
                const hydrated = parsed.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }));
                setMessages(hydrated as Message[]);
            } catch (e) {
                console.error("Failed to parse chat history", e);
                setMessages(DEFAULT_WELCOME_MSG);
            }
        } else {
            setMessages(DEFAULT_WELCOME_MSG);
        }
    }, []);

    // Save messages to localStorage whenever they change
    useEffect(() => {
        if (messages.length > 0) {
            localStorage.setItem("fiinny_chat_history", JSON.stringify(messages));
        }
    }, [messages]);

    const { user } = useAuth();
    const [isTyping, setIsTyping] = useState(false);
    const [contextData, setContextDataState] = useState<{ expenses: ExpenseItem[]; incomes: IncomeItem[] }>({ expenses: [], incomes: [] });
    const [isPremium, setIsPremium] = useState(false); // Default to Free

    // ... (rest of state)

    const clearChat = () => {
        setMessages(DEFAULT_WELCOME_MSG);
        localStorage.removeItem("fiinny_chat_history");
    };


    // Local Brain State
    const [isModelLoaded, setIsModelLoaded] = useState(false);
    const [isModelLoading, setIsModelLoading] = useState(false);
    const [modelProgress, setModelProgress] = useState("");

    // Action State
    const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

    // Personalization State
    const [profile, setProfile] = useState<FinancialProfile>(DEFAULT_PROFILE);

    // Refresh State
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const triggerRefresh = () => setRefreshTrigger(prev => prev + 1);

    // Load Profile on Auth
    useEffect(() => {
        if (user?.uid) {
            getUserProfile(user.uid).then(setProfile);
        }
    }, [user]);

    const openAi = () => setIsOpen(true);
    const closeAi = () => setIsOpen(false);
    const toggleAi = () => setIsOpen(prev => !prev);
    const togglePremium = () => setIsPremium(prev => !prev);

    // Friends Context
    const [friends, setFriends] = useState<any[]>([]);

    useEffect(() => {
        if (user?.uid) {
            import("@/lib/firestore").then(({ getFriends }) => {
                getFriends(user.uid).then(setFriends);
            });
        }
    }, [user, refreshTrigger]);

    const setContextData = (data: { expenses: ExpenseItem[]; incomes: IncomeItem[] }) => {
        setContextDataState(data);
    };

    const loadModel = async () => {
        if (isModelLoaded || isModelLoading) return;

        setIsModelLoading(true);
        setModelProgress("Initializing...");

        try {
            await initializeWebLLM((progress) => {
                setModelProgress(progress);
            });
            setIsModelLoaded(true);
            setModelProgress("Brain Active 🧠");
        } catch (error) {
            console.error("Failed to load model:", error);
            setModelProgress("Error loading brain.");
        } finally {
            setIsModelLoading(false);
        }
    };

    const confirmAction = async () => {
        if (!pendingAction) return;

        setPendingAction(prev => prev ? { ...prev, status: 'EXECUTING' } : null);
        try {
            await pendingAction.config.onConfirm();
            setPendingAction(prev => prev ? { ...prev, status: 'COMPLETED' } : null);

            // Add success message
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: "assistant",
                content: `✅ Done! ${pendingAction.config.title} was successful.`,
                timestamp: new Date()
            }]);

            // Clear action after delay
            setTimeout(() => setPendingAction(null), 2000);
        } catch (error) {
            console.error("Action Failed:", error);
            setPendingAction(prev => prev ? { ...prev, status: 'FAILED' } : null);
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: "assistant",
                content: `❌ Oops, something went wrong while trying to ${pendingAction.config.title.toLowerCase()}.`,
                timestamp: new Date()
            }]);
        }
    };

    const cancelAction = () => {
        if (!pendingAction) return;
        if (pendingAction.config.onCancel) pendingAction.config.onCancel();
        setPendingAction(null);
        setMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: "assistant",
            content: "Cancelled. No changes were made.",
            timestamp: new Date()
        }]);
    };

    const sendMessage = async (text: string) => {
        const userMsg: Message = {
            id: Date.now().toString(),
            role: "user",
            content: text,
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMsg]);
        setIsTyping(true);

        try {
            // Call the LLM Service (Simulated or Local)
            const response = await generateResponse(
                [...messages, userMsg],
                { ...contextData, userId: user?.uid, profile, triggerRefresh, friends }, // Pass friends here
                isPremium,
                isModelLoaded,
                setPendingAction
            );

            setMessages(prev => [...prev, response]);
        } catch (error) {
            console.error("AI Error:", error);
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: "assistant",
                content: "I'm having a little trouble connecting to my brain right now. 😵‍💫 Can you try again?",
                timestamp: new Date()
            }]);
        } finally {
            setIsTyping(false);
        }
    };

    return (
        <AiContext.Provider value={{
            isOpen,
            openAi,
            closeAi,
            toggleAi,
            messages,
            sendMessage,
            isTyping,
            setContextData,
            isPremium,
            togglePremium,
            isModelLoaded,
            isModelLoading,
            modelProgress,
            loadModel,
            pendingAction,
            setPendingAction,
            confirmAction,
            cancelAction,
            profile,
            refreshTrigger,
            triggerRefresh,
            clearChat
        }}>
            {children}
        </AiContext.Provider>
    );
};

export const useAi = () => {
    const context = useContext(AiContext);
    if (context === undefined) {
        throw new Error("useAi must be used within an AiProvider");
    }
    return context;
};
