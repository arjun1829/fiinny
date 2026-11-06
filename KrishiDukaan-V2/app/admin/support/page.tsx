"use client";

import { useEffect, useRef, useState } from "react";
import {
  HeadphonesIcon,
  Send,
  Loader2,
  ArrowLeft,
  MessageCircle,
  User,
  Clock,
  Building2,
} from "lucide-react";
import {
  db,
  sendSupportMessage,
  subscribeSupportMessages,
  subscribeSupportConversations,
  markSupportConversationReadByAdmin,
  type SupportMessage,
  type SupportConversation,
} from "../../firebase";
import { useAdminAuth } from "../_context/admin-auth-context";

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

function formatRelative(ts: any): string {
  if (!ts) return "";
  try {
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    const now = Date.now();
    const diff = now - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return formatTime(ts);
  } catch {
    return "";
  }
}

type ConvWithId = SupportConversation & { id: string };

function ConversationView({
  conv,
  adminUid,
  onBack,
}: {
  conv: ConvWithId;
  adminUid: string;
  onBack: () => void;
}) {
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeSupportMessages(conv.id, (msgs) => {
      setMessages(msgs);
      setLoading(false);
    });
    return () => unsub();
  }, [conv.id]);

  // Mark as read when opened
  useEffect(() => {
    if (conv.unreadByAdmin > 0) {
      markSupportConversationReadByAdmin(conv.id).catch(() => {});
    }
  }, [conv.id, conv.unreadByAdmin]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    setSendError("");
    const draft = text.trim();
    setText("");
    try {
      await sendSupportMessage(conv.id, adminUid, "admin", draft);
    } catch (err) {
      setSendError("Failed to send reply. Please try again.");
      setText(draft);
      console.error("[admin-support] sendSupportMessage error:", err);
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
    <div className="flex h-[calc(100vh-180px)] flex-col rounded-3xl border border-outline-variant/30 bg-white shadow-sm overflow-hidden">
      {/* Conversation header */}
      <div className="flex items-center gap-3 border-b border-outline-variant/20 px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container transition-colors"
          aria-label="Back to inbox"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm shrink-0">
          {conv.userName ? conv.userName[0].toUpperCase() : <User className="h-4 w-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-on-surface truncate">
            {conv.userName || "Unknown user"}
          </p>
          {conv.userEmail && (
            <p className="text-xs text-on-surface-variant truncate">
              {conv.userEmail}
            </p>
          )}
          {conv.businessName && (
            <p className="text-xs text-on-surface-variant truncate flex items-center gap-1">
              <Building2 className="h-3 w-3 shrink-0" /> {conv.businessName}
            </p>
          )}
        </div>
        <p className="text-xs text-on-surface-variant shrink-0">{formatRelative(conv.lastMessageAt)}</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-surface-container-lowest/40">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center gap-2">
            <MessageCircle className="h-8 w-8 text-on-surface-variant/30" />
            <p className="text-sm text-on-surface-variant">No messages in this conversation.</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isAdmin = msg.senderRole === "admin";
            return (
              <div
                key={msg.id}
                className={`flex ${isAdmin ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2.5 shadow-sm ${
                    isAdmin
                      ? "rounded-br-sm bg-primary text-white"
                      : "rounded-bl-sm bg-white text-on-surface border border-outline-variant/20"
                  }`}
                >
                  {!isAdmin && (
                    <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                      {conv.userName || "User"}
                    </p>
                  )}
                  <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                    {msg.message}
                  </p>
                  <p
                    className={`mt-1 text-right text-[10px] ${
                      isAdmin ? "text-white/60" : "text-on-surface-variant"
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

      {sendError && (
        <div className="mx-4 mb-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs font-medium text-red-700">
          {sendError}
        </div>
      )}

      {/* Reply input */}
      <div className="border-t border-outline-variant/20 bg-white px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Reply… (Enter to send, Shift+Enter for new line)"
            rows={1}
            className="flex-1 resize-none rounded-2xl border border-outline-variant bg-surface-container-low px-4 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            style={{ maxHeight: "120px", overflowY: "auto" }}
            disabled={sending}
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!text.trim() || sending}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-sm transition-all hover:bg-primary/90 disabled:opacity-40"
            aria-label="Send reply"
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

export default function AdminSupportPage() {
  const identity = useAdminAuth();
  const [conversations, setConversations] = useState<ConvWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ConvWithId | null>(null);

  useEffect(() => {
    const unsub = subscribeSupportConversations((convs) => {
      setConversations(convs);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const totalUnread = conversations.reduce((n, c) => n + (c.unreadByAdmin || 0), 0);

  const handleOpen = (conv: ConvWithId) => {
    setSelected(conv);
  };

  if (selected) {
    // Keep selected state in sync with live updates
    const live = conversations.find((c) => c.id === selected.id) ?? selected;
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-black text-on-surface flex items-center gap-2">
            <HeadphonesIcon className="h-6 w-6 text-primary" /> Support Inbox
          </h1>
        </div>
        <ConversationView
          conv={live}
          adminUid={identity.uid}
          onBack={() => setSelected(null)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-on-surface flex items-center gap-2">
            <HeadphonesIcon className="h-6 w-6 text-primary" /> Support Inbox
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Authenticated user support conversations.
          </p>
        </div>
        {totalUnread > 0 && (
          <div className="flex items-center gap-2 rounded-2xl bg-primary/10 px-4 py-2 text-sm font-bold text-primary">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-black text-white">
              {totalUnread > 99 ? "99+" : totalUnread}
            </span>
            unread {totalUnread === 1 ? "conversation" : "conversations"}
          </div>
        )}
      </div>

      {/* Conversation list */}
      {loading ? (
        <div className="flex min-h-[300px] items-center justify-center rounded-3xl border border-surface-container bg-white shadow-sm">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : conversations.length === 0 ? (
        <div className="flex min-h-[300px] flex-col items-center justify-center rounded-3xl border border-dashed border-outline-variant bg-white p-8 text-center shadow-sm">
          <div className="rounded-full bg-primary/5 p-4 text-primary mb-4">
            <MessageCircle className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-bold text-on-surface">No conversations yet</h3>
          <p className="mt-1 text-sm text-on-surface-variant max-w-sm">
            When users send support messages from their dashboard, they will appear here.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {conversations.map((conv) => (
            <button
              key={conv.id}
              type="button"
              onClick={() => handleOpen(conv)}
              className="flex w-full items-center gap-4 rounded-2xl border border-outline-variant/20 bg-white px-5 py-4 text-left shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
            >
              {/* Avatar */}
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-base">
                {conv.userName ? conv.userName[0].toUpperCase() : <User className="h-5 w-5" />}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-on-surface truncate">
                    {conv.userName || "Unknown user"}
                  </p>
                  {conv.unreadByAdmin > 0 && (
                    <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-black text-white">
                      {conv.unreadByAdmin > 99 ? "99+" : conv.unreadByAdmin}
                    </span>
                  )}
                </div>
                {conv.businessName && (
                  <p className="text-xs text-on-surface-variant flex items-center gap-1 mb-0.5">
                    <Building2 className="h-3 w-3 shrink-0" /> {conv.businessName}
                  </p>
                )}
                <p className="text-xs text-on-surface-variant truncate">
                  {conv.lastMessage || "—"}
                </p>
              </div>

              {/* Timestamp */}
              <div className="shrink-0 text-right">
                <p className="text-[11px] text-on-surface-variant flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatRelative(conv.lastMessageAt)}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
