import React, { useState, useEffect, useRef } from 'react';
import { db } from '@/lib/firebase';
import { collection, doc, query, orderBy, limit, onSnapshot, addDoc, serverTimestamp, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { Loader2, Send, Image as ImageIcon, Smile, MoreVertical, Edit2, Trash2, Copy } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface PartnerChatTabProps {
    partnerUserId: string;
    currentUserId: string;
}

interface Message {
    id: string;
    from: string;
    message: string;
    timestamp: any;
    type: 'text' | 'image' | 'sticker' | 'file';
    fileUrl?: string;
    fileName?: string;
    edited?: boolean;
}

export const PartnerChatTab: React.FC<PartnerChatTabProps> = ({ partnerUserId, currentUserId }) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputText, setInputText] = useState('');
    const [loading, setLoading] = useState(true);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Thread ID logic same as Flutter: sort IDs alphabetically (trimmed)
    // Safeguard against undefined IDs (runtime error protection)
    const pId = (partnerUserId || '').toString().trim();
    const cId = (currentUserId || '').toString().trim();
    const threadId = [cId, pId].sort().join('_');

    console.log(`Chat Thread: ${threadId} ('${currentUserId}' + '${partnerUserId}')`);

    useEffect(() => {
        const q = query(
            collection(db, 'chats', threadId, 'messages'),
            orderBy('timestamp', 'desc'),
            limit(50)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const msgs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Message));
            setMessages(msgs);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [threadId]);

    const sendMessage = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!inputText.trim()) return;

        const text = inputText.trim();
        setInputText('');

        if (!cId || !pId) {
            console.error("Cannot send message: missing user IDs");
            return;
        }

        try {
            // Update thread metadata
            const threadRef = doc(db, 'chats', threadId);
            await setDoc(threadRef, {
                participants: [cId, pId],
                lastMessage: text,
                lastFrom: cId,
                lastAt: serverTimestamp(),
                lastType: 'text'
            }, { merge: true });

            // Add message
            await addDoc(collection(db, 'chats', threadId, 'messages'), {
                from: cId,
                to: pId,
                message: text,
                timestamp: serverTimestamp(),
                type: 'text',
                edited: false
            });

            // Scroll to bottom (optional, but good UX)
            scrollRef.current?.scrollIntoView({ behavior: 'smooth' });

        } catch (error) {
            console.error("Error sending message:", error);
        }
    };

    const formatTime = (timestamp: any) => {
        if (!timestamp) return '';
        const date = timestamp.toDate();
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const isMe = (msg: Message) => msg.from === currentUserId;

    if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-teal-600" /></div>;

    return (
        <div className="flex flex-col h-full bg-slate-50 rounded-xl overflow-hidden border border-slate-200">
            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 flex flex-col-reverse">
                <div ref={scrollRef} />
                {messages.length === 0 && (
                    <div className="text-center text-slate-400 py-10 text-sm">
                        No messages yet. Say hi! 👋
                    </div>
                )}
                {messages.map((msg) => (
                    <div
                        key={msg.id}
                        className={`flex w-full ${isMe(msg) ? 'justify-end' : 'justify-start'}`}
                    >
                        <div
                            className={`max-w-[80%] rounded-2xl px-4 py-2.5 relative group ${isMe(msg)
                                ? 'bg-teal-100 text-teal-900 rounded-tr-none'
                                : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none'
                                }`}
                        >
                            {msg.type === 'text' && (
                                <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                            )}
                            {msg.type === 'image' && (
                                <div>
                                    <img src={msg.fileUrl} alt="Shared" className="rounded-lg max-w-full h-auto" />
                                </div>
                            )}

                            <div className={`text-[10px] mt-1 flex items-center gap-1 ${isMe(msg) ? 'text-teal-700/70' : 'text-slate-400'}`}>
                                {formatTime(msg.timestamp)}
                                {msg.edited && <span>(edited)</span>}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Input Area */}
            <form onSubmit={sendMessage} className="p-3 bg-white border-t border-slate-200 flex items-center gap-2">
                <button
                    type="button"
                    className="p-2 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-full transition-colors"
                >
                    <ImageIcon className="w-5 h-5" />
                </button>
                <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 bg-slate-100 border-none rounded-full px-4 py-2 text-sm focus:ring-1 focus:ring-teal-500 outline-none"
                />
                <button
                    type="submit"
                    disabled={!inputText.trim()}
                    className="p-2 bg-teal-600 text-white rounded-full hover:bg-teal-700 disabled:opacity-50 disabled:hover:bg-teal-600 transition-colors"
                >
                    <Send className="w-4 h-4" />
                </button>
            </form>
        </div>
    );
};
