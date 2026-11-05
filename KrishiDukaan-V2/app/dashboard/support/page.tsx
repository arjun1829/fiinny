"use client";

import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { HeadphonesIcon, Send, Loader2, MessageCircle } from "lucide-react";
import {
  auth,
  getUserProfile,
  sendSupportMessage,
  subscribeSupportMessages,
  subscribeSupportConversation,
  markSupportConversationReadByUser,
  type SupportMessage,
  type SupportConversation,
} from "../../firebase";

function formatTime(ts: any): string {
  if (!ts) return "";
  try {
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "";
  }
}

export default function SupportPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [conversation, setConversation] = useState<SupportConversation | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Resolve auth UID and user profile
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      setUid(user.uid);
      try {
        const profile = await getUserProfile(user.uid);
        setUserName(
          (profile as any)?.ownerName ||
          (profile as any)?.name ||
          (profile as any)?.businessName ||
          "",
        );
        setBusinessName((profile as any)?.businessName || (profile as any)?.shopName || "");
      } catch {
        // proceed without profile info
      }
    });
    return () => unsub();
  }, []);

  // Subscribe to messages and conversation once uid is known
  useEffect(() => {
    if (!uid) return;
    setLoading(true);

    const unsubMessages = subscribeSupportMessages(uid, (msgs) => {
      setMessages(msgs);
      setLoading(false);
    });

    const unsubConv = subscribeSupportConversation(uid, (conv) => {
      setConversation(conv);
    });

    return () => {
      unsubMessages();
      unsubConv();
    };
  }, [uid]);

  // Mark unread-by-user as 0 when the page is opened and there are unread messages
  useEffect(() => {
    if (!uid || !conversation) return;
    if (conversation.unreadByUser > 0) {
      markSupportConversationReadByUser(uid).catch(() => {});
    }
  }, [uid, conversation]);

  // Scroll to bottom when messages update
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!uid || !text.trim() || sending) return;
    setSending(true);
    setSendError("");
    const draft = text.trim();
    setText("");
    try {
      await sendSupportMessage(uid, uid, "user", draft, {
        userName: userName || undefined,
        businessName: businessName || undefined,
      });
    } catch (err) {
      setSendError("Failed to send message. Please try again.");
      setText(draft);
      console.error("[support] sendSupportMessage error:", err);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <div className="flex h-[calc(100vh-128px)] md:h-[calc(100vh-80px)] flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-outline-variant/30 bg-surface-container-lowest px-4 py-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
          <HeadphonesIcon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-sm font-bold text-on-surface">KrishiDukan Support</p>
          <p className="text-xs text-on-surface-variant">We typically reply within a few hours</p>
        </div>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center gap-3">
            <div className="rounded-full bg-primary/5 p-5">
              <MessageCircle className="h-10 w-10 text-primary/40" />
            </div>
            <p className="font-semibold text-on-surface">No messages yet</p>
            <p className="text-sm text-on-surface-variant max-w-xs">
              Send us a message and our team will get back to you as soon as possible.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.senderRole === "user";
            return (
              <div
                key={msg.id}
                className={`flex ${isUser ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2.5 shadow-sm ${
                    isUser
                      ? "rounded-br-sm bg-primary text-white"
                      : "rounded-bl-sm bg-surface-container-low text-on-surface border border-outline-variant/20"
                  }`}
                >
                  {!isUser && (
                    <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                      Support Team
                    </p>
                  )}
                  <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                    {msg.message}
                  </p>
                  <p
                    className={`mt-1 text-right text-[10px] ${
                      isUser ? "text-white/60" : "text-on-surface-variant"
                    }`}
                  >
                    {formatTime(msg.createdAt)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Error banner */}
      {sendError && (
        <div className="mx-4 mb-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs font-medium text-red-700">
          {sendError}
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-outline-variant/30 bg-surface-container-lowest px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
            rows={1}
            className="flex-1 resize-none rounded-2xl border border-outline-variant bg-surface-container-low px-4 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            style={{ maxHeight: "120px", overflowY: "auto" }}
            disabled={sending || !uid}
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!text.trim() || sending || !uid}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-sm transition-all hover:bg-primary/90 disabled:opacity-40"
            aria-label="Send message"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
