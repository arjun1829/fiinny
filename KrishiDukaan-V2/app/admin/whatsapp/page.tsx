"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
  updateDoc,
  setDoc,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
// Note: orderBy is still used for waConversations/{phone}/messages and notes sub-listeners
import {
  db,
  auth,
  resolveWaUserByPhone,
  type WaIncomingMessage,
  type WaResolvedUser,
  type WaConvMeta,
  type WaOutMessage,
  type WaNote,
} from "../../firebase";
import {
  MessageSquare,
  Search,
  RefreshCw,
  ChevronLeft,
  User,
  Phone,
  Send,
  StickyNote,
  CheckCircle,
  RotateCcw,
  AlertCircle,
  Check,
  CheckCheck,
} from "lucide-react";
import { cn } from "../../dashboard/_lib/cn";

// ── Role display ───────────────────────────────────────────────────────────────

const ROLE_LABEL: Record<string, string> = {
  retailer: "Retailer",
  manufacturer: "Manufacturer",
  salesExecutive: "Sales Exec",
  farmer: "Farmer",
  admin: "Admin",
  customer: "Customer",
  unknown: "Unknown",
};

const ROLE_BADGE: Record<string, string> = {
  retailer: "bg-green-100 text-green-700 border-green-200",
  manufacturer: "bg-blue-100 text-blue-700 border-blue-200",
  salesExecutive: "bg-purple-100 text-purple-700 border-purple-200",
  farmer: "bg-teal-100 text-teal-700 border-teal-200",
  admin: "bg-red-100 text-red-700 border-red-200",
  customer: "bg-gray-100 text-gray-600 border-gray-200",
  unknown: "bg-amber-50 text-amber-700 border-amber-200",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getTs(msg: { timestamp?: any; receivedAt?: any }): any {
  return msg.timestamp ?? msg.receivedAt ?? null;
}

function tsMillis(ts: any): number {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis() as number;
  if (typeof ts.seconds === "number") return ts.seconds * 1000;
  return 0;
}

function fmtListTime(ts: any): string {
  if (!ts) return "";
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const diffDays = Math.floor((Date.now() - d.getTime()) / 86_400_000);
    if (diffDays === 0) return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return d.toLocaleDateString("en-IN", { weekday: "short" });
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  } catch { return ""; }
}

function fmtMsgTime(ts: any): string {
  if (!ts) return "";
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  } catch { return ""; }
}

function fmtDateDivider(ts: any): string {
  if (!ts) return "";
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const diffDays = Math.floor((Date.now() - d.getTime()) / 86_400_000);
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
  } catch { return ""; }
}

function dateKey(ts: any): string {
  if (!ts) return "";
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toISOString().slice(0, 10);
  } catch { return ""; }
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatMsg {
  id: string;
  direction: "incoming" | "outgoing";
  text: string | null;
  messageType: string;
  timestamp: any;
  status?: string | null;
}

interface ConvRow {
  phone: string;
  user: WaResolvedUser | null;
  lastIncoming: WaIncomingMessage;
  lastActivityTs: any;
  lastActivityMs: number;
  unreadCount: number;
  status: "open" | "resolved";
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function WhatsAppInboxPage() {
  // ── Data
  const [incoming, setIncoming] = useState<WaIncomingMessage[]>([]);
  const [metas, setMetas] = useState<Record<string, WaConvMeta>>({});
  const [outgoing, setOutgoing] = useState<WaOutMessage[]>([]);
  const [notes, setNotes] = useState<WaNote[]>([]);
  const [userCache, setUserCache] = useState<Record<string, WaResolvedUser | null>>({});

  // ── UI
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("all");
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [loadingIncoming, setLoadingIncoming] = useState(true);
  const [loadingChat, setLoadingChat] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [sending, setSending] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [draftNote, setDraftNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  const chatBottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Listeners ────────────────────────────────────────────────────────────────

  // All incoming messages (for conversation list + chat).
  // No orderBy here — Firestore silently drops documents that lack the ordered
  // field, so any doc written without receivedAt would never appear. We fetch
  // all docs and sort client-side instead.
  useEffect(() => {
    console.log("[WA Inbox] Subscribing to waIncomingMessages…");
    return onSnapshot(
      collection(db, "waIncomingMessages"),
      (snap) => {
        console.log(`[WA Inbox] waIncomingMessages snapshot: ${snap.size} doc(s)`);
        if (snap.size > 0) {
          const first = snap.docs[0]!;
          console.log("[WA Inbox] First doc id:", first.id, "data:", JSON.stringify(first.data(), null, 2));
        }
        setIncoming(snap.docs.map((d) => ({ id: d.id, ...d.data() } as WaIncomingMessage)));
        setLoadingIncoming(false);
      },
      (err) => {
        console.error("[WA Inbox] waIncomingMessages listener error:", err.code, err.message);
        setLoadingIncoming(false);
      }
    );
  }, []);

  // Conversation metadata (unread counts, status)
  useEffect(() => {
    console.log("[WA Inbox] Subscribing to waConversations…");
    return onSnapshot(
      collection(db, "waConversations"),
      (snap) => {
        console.log(`[WA Inbox] waConversations snapshot: ${snap.size} doc(s)`);
        const map: Record<string, WaConvMeta> = {};
        snap.docs.forEach((d) => { map[d.id] = d.data() as WaConvMeta; });
        setMetas(map);
      },
      (err) => {
        console.error("[WA Inbox] waConversations listener error:", err.code, err.message);
      }
    );
  }, []);

  // Outgoing messages + notes for selected conversation
  useEffect(() => {
    if (!selectedPhone) {
      setOutgoing([]);
      setNotes([]);
      return;
    }

    setLoadingChat(true);

    const unsubMsgs = onSnapshot(
      query(
        collection(db, "waConversations", selectedPhone, "messages"),
        orderBy("timestamp", "asc")
      ),
      (snap) => {
        setOutgoing(snap.docs.map((d) => ({ id: d.id, ...d.data() } as WaOutMessage)));
        setLoadingChat(false);
      },
      () => setLoadingChat(false)
    );

    const unsubNotes = onSnapshot(
      query(
        collection(db, "waConversations", selectedPhone, "notes"),
        orderBy("createdAt", "asc")
      ),
      (snap) => {
        setNotes(snap.docs.map((d) => ({ id: d.id, ...d.data() } as WaNote)));
      }
    );

    return () => {
      unsubMsgs();
      unsubNotes();
    };
  }, [selectedPhone]);

  // Resolve user identity for new phones
  useEffect(() => {
    const phones = Array.from(new Set(incoming.map((m) => m.phone).filter(Boolean)));
    const pending = phones.filter((p) => !(p in userCache));
    if (!pending.length) return;
    Promise.all(pending.map(async (p) => [p, await resolveWaUserByPhone(p)] as const)).then(
      (results) =>
        setUserCache((prev) => {
          const next = { ...prev };
          results.forEach(([p, u]) => { next[p] = u; });
          return next;
        })
    );
  }, [incoming]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to bottom when chat changes
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedPhone, outgoing.length, incoming.length]);

  // ── Derived state ────────────────────────────────────────────────────────────

  const conversationList = useMemo<ConvRow[]>(() => {
    const phoneMap = new Map<string, WaIncomingMessage[]>();
    for (const msg of incoming) {
      const p = msg.phone || msg.waId;
      if (!p) continue;
      if (!phoneMap.has(p)) phoneMap.set(p, []);
      phoneMap.get(p)!.push(msg);
    }

    const rows: ConvRow[] = [];
    for (const [phone, msgs] of Array.from(phoneMap.entries())) {
      const sorted = [...msgs].sort((a, b) => tsMillis(getTs(a)) - tsMillis(getTs(b)));
      const lastIncoming = sorted[sorted.length - 1]!;
      const meta = metas[phone];

      const inMs = tsMillis(getTs(lastIncoming));
      const outMs = tsMillis(meta?.lastOutgoingAt);
      const lastActivityMs = Math.max(inMs, outMs);
      const lastActivityTs = inMs >= outMs ? getTs(lastIncoming) : (meta?.lastOutgoingAt ?? null);

      rows.push({
        phone,
        user: userCache[phone] ?? null,
        lastIncoming,
        lastActivityTs,
        lastActivityMs,
        unreadCount: meta?.unreadCount ?? 0,
        status: meta?.status ?? "open",
      });
    }

    return rows.sort((a, b) => b.lastActivityMs - a.lastActivityMs);
  }, [incoming, metas, userCache]);

  const filteredConvs = useMemo(() => {
    let list = conversationList;
    if (filter !== "all") list = list.filter((c) => c.status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.phone.includes(q) ||
          c.user?.name.toLowerCase().includes(q) ||
          c.user?.businessName.toLowerCase().includes(q) ||
          c.lastIncoming.messageText?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [conversationList, filter, search]);

  const selectedConv = useMemo(
    () => conversationList.find((c) => c.phone === selectedPhone) ?? null,
    [conversationList, selectedPhone]
  );

  // Unified chat timeline: incoming from waIncomingMessages + outgoing from waConversations
  const chatMessages = useMemo<ChatMsg[]>(() => {
    if (!selectedPhone) return [];

    const inMsgs: ChatMsg[] = incoming
      .filter((m) => (m.phone || m.waId) === selectedPhone)
      .map((m) => ({
        id: m.id,
        direction: "incoming",
        text: m.messageText,
        messageType: m.messageType,
        timestamp: m.timestamp, // use Meta send timestamp for ordering
        status: null,
      }));

    const outMsgs: ChatMsg[] = outgoing.map((m) => ({
      id: m.id,
      direction: "outgoing",
      text: m.text,
      messageType: m.messageType,
      timestamp: m.timestamp,
      status: m.status,
    }));

    return [...inMsgs, ...outMsgs].sort((a, b) => tsMillis(a.timestamp) - tsMillis(b.timestamp));
  }, [incoming, selectedPhone, outgoing]);

  // 24-hour service window
  const { canReply, windowLabel } = useMemo(() => {
    if (!selectedPhone) return { canReply: false, windowLabel: "" };
    const lastIn = incoming
      .filter((m) => (m.phone || m.waId) === selectedPhone)
      .reduce<WaIncomingMessage | null>((best, m) => {
        if (!best) return m;
        return tsMillis(getTs(m)) > tsMillis(getTs(best)) ? m : best;
      }, null);
    if (!lastIn) return { canReply: false, windowLabel: "" };
    const ts = getTs(lastIn);
    const ageMs = Date.now() - tsMillis(ts);
    const windowMs = 24 * 60 * 60 * 1000;
    if (ageMs >= windowMs) return { canReply: false, windowLabel: "" };
    const remainMs = windowMs - ageMs;
    const hrs = Math.floor(remainMs / 3_600_000);
    const mins = Math.floor((remainMs % 3_600_000) / 60_000);
    return {
      canReply: true,
      windowLabel: hrs > 0 ? `${hrs}h ${mins}m left` : `${mins}m left`,
    };
  }, [incoming, selectedPhone]);

  const isResolved = selectedPhone ? (metas[selectedPhone]?.status === "resolved") : false;

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleSelect = useCallback((phone: string) => {
    setSelectedPhone(phone);
    setMobileChatOpen(true);
    setNotesOpen(false);
    setDraftText("");
    // Reset unread count when admin opens the conversation
    setDoc(doc(db, "waConversations", phone), { unreadCount: 0 }, { merge: true }).catch(() => {});
  }, []);

  async function handleSend() {
    if (!selectedPhone || !draftText.trim() || sending || !canReply) return;
    const text = draftText.trim();
    setDraftText("");
    setSending(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error("Not authenticated");
      const res = await fetch("/api/wa/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ phone: selectedPhone, text }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
      }
    } catch (err) {
      setDraftText(text); // restore on failure
      alert(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  async function handleToggleResolve() {
    if (!selectedPhone) return;
    const newStatus: "open" | "resolved" = isResolved ? "open" : "resolved";
    try {
      await updateDoc(doc(db, "waConversations", selectedPhone), {
        status: newStatus,
        ...(newStatus === "resolved"
          ? { resolvedAt: serverTimestamp() }
          : { resolvedAt: null }),
        updatedAt: serverTimestamp(),
      });
    } catch {
      // doc might not exist yet — create it
      await setDoc(
        doc(db, "waConversations", selectedPhone),
        { phone: selectedPhone, status: newStatus, updatedAt: serverTimestamp() },
        { merge: true }
      );
    }
  }

  async function handleAddNote() {
    if (!selectedPhone || !draftNote.trim() || addingNote) return;
    const text = draftNote.trim();
    setDraftNote("");
    setAddingNote(true);
    try {
      await addDoc(collection(db, "waConversations", selectedPhone, "notes"), {
        text,
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser?.uid ?? "admin",
      });
    } catch {
      setDraftNote(text);
    } finally {
      setAddingNote(false);
    }
  }

  // ── Display helpers ───────────────────────────────────────────────────────────

  function displayName(conv: ConvRow): string {
    const u = conv.user;
    return u?.businessName || u?.name || conv.phone;
  }

  function ownerName(conv: ConvRow): string {
    const u = conv.user;
    if (!u) return "";
    if (u.businessName && u.name) return u.name;
    return "";
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-3">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-on-surface">
            <MessageSquare className="h-6 w-6 text-primary" />
            WhatsApp Support Inbox
          </h1>
          <p className="mt-0.5 text-sm text-on-surface-variant">
            Real-time customer conversations via WhatsApp Business
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-on-surface-variant">
          {loadingIncoming && <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />}
          <span className="font-medium">
            {conversationList.length}{" "}
            conversation{conversationList.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="flex h-[calc(100dvh-220px)] min-h-[520px] overflow-hidden rounded-3xl border border-outline-variant/30 bg-white shadow-sm md:h-[calc(100dvh-175px)]">

        {/* ── LEFT PANEL — conversation list ──────────────────────────────────── */}
        <div
          className={cn(
            "flex w-full flex-col border-r border-outline-variant/20 md:w-80 md:shrink-0",
            mobileChatOpen ? "hidden md:flex" : "flex"
          )}
        >
          {/* Search */}
          <div className="border-b border-outline-variant/10 p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant/50" />
              <input
                type="text"
                placeholder="Search name, phone, message…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-transparent bg-surface-container-low py-2 pl-9 pr-3 text-sm placeholder:text-on-surface-variant/40 focus:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex border-b border-outline-variant/10">
            {(["all", "open", "resolved"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  "flex-1 py-2 text-xs font-semibold uppercase tracking-wide transition-colors",
                  filter === f
                    ? "border-b-2 border-primary text-primary"
                    : "text-on-surface-variant/50 hover:text-on-surface-variant"
                )}
              >
                {f}
              </button>
            ))}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loadingIncoming ? (
              <div className="flex h-full items-center justify-center">
                <RefreshCw className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : filteredConvs.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-on-surface-variant">
                <MessageSquare className="h-8 w-8 opacity-20" />
                <p className="text-sm font-medium">
                  {search
                    ? "No results"
                    : filter !== "all"
                    ? `No ${filter} conversations`
                    : "No conversations yet"}
                </p>
              </div>
            ) : (
              filteredConvs.map((conv) => {
                const active = conv.phone === selectedPhone;
                const role = conv.user?.role ?? "unknown";
                return (
                  <button
                    key={conv.phone}
                    type="button"
                    onClick={() => handleSelect(conv.phone)}
                    className={cn(
                      "relative w-full border-b border-outline-variant/10 px-3 py-3 text-left transition-colors last:border-0",
                      active
                        ? "border-l-[3px] border-l-primary bg-primary/[0.07] pl-[9px]"
                        : "hover:bg-surface-container-low"
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      {/* Avatar */}
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold uppercase text-primary">
                        {conv.user?.businessName?.[0] || conv.user?.name?.[0] || (
                          <User className="h-4 w-4 opacity-60" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-1">
                          <span className="truncate text-sm font-semibold leading-tight text-on-surface">
                            {displayName(conv)}
                          </span>
                          <div className="flex shrink-0 flex-col items-end gap-0.5">
                            <span className="whitespace-nowrap text-[10px] text-on-surface-variant/60">
                              {fmtListTime(conv.lastActivityTs)}
                            </span>
                            {conv.unreadCount > 0 && (
                              <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-white">
                                {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="mt-0.5 flex flex-wrap items-center gap-1">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full border px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide",
                              ROLE_BADGE[role] ?? ROLE_BADGE.unknown
                            )}
                          >
                            {ROLE_LABEL[role] ?? role}
                          </span>
                          {conv.status === "resolved" && (
                            <span className="inline-flex items-center gap-0.5 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-px text-[9px] font-semibold text-emerald-700">
                              <CheckCircle className="h-2.5 w-2.5" />
                              Resolved
                            </span>
                          )}
                        </div>

                        <p className="mt-1 truncate text-xs leading-snug text-on-surface-variant/60">
                          {conv.lastIncoming.messageText || `[${conv.lastIncoming.messageType}]`}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL — chat window ────────────────────────────────────────── */}
        <div
          className={cn(
            "flex min-w-0 flex-1 flex-col",
            mobileChatOpen ? "flex" : "hidden md:flex"
          )}
        >
          {selectedConv ? (
            <>
              {/* Chat header */}
              <div className="flex shrink-0 items-center gap-2.5 border-b border-outline-variant/20 bg-surface-container-lowest px-4 py-3">
                {/* Back (mobile) */}
                <button
                  type="button"
                  onClick={() => setMobileChatOpen(false)}
                  className="shrink-0 rounded-lg p-1 text-on-surface-variant hover:bg-surface-container md:hidden"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>

                {/* Avatar */}
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold uppercase text-primary">
                  {selectedConv.user?.businessName?.[0] || selectedConv.user?.name?.[0] || (
                    <User className="h-4 w-4 opacity-60" />
                  )}
                </div>

                {/* Identity */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-sm font-bold leading-tight text-on-surface">
                      {displayName(selectedConv)}
                    </p>

                    {selectedConv.user && (
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide",
                          ROLE_BADGE[selectedConv.user.role] ?? ROLE_BADGE.unknown
                        )}
                      >
                        {ROLE_LABEL[selectedConv.user.role] ?? selectedConv.user.role}
                      </span>
                    )}

                    {/* 24-hour service window badge */}
                    {canReply ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-px text-[9px] font-semibold text-emerald-700">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                        Window open · {windowLabel}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-px text-[9px] font-semibold text-red-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                        Window closed
                      </span>
                    )}
                  </div>

                  <div className="mt-0.5 flex items-center gap-1.5">
                    <Phone className="h-3 w-3 text-on-surface-variant/50" />
                    <span className="text-xs text-on-surface-variant/60">
                      {selectedConv.phone}
                    </span>
                    {ownerName(selectedConv) && (
                      <>
                        <span className="text-on-surface-variant/30">·</span>
                        <span className="truncate text-xs text-on-surface-variant/60">
                          {ownerName(selectedConv)}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setNotesOpen((v) => !v)}
                    title="Internal notes"
                    className={cn(
                      "flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition-colors",
                      notesOpen
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : "border-outline-variant/30 text-on-surface-variant hover:bg-surface-container"
                    )}
                  >
                    <StickyNote className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Notes</span>
                    {notes.length > 0 && (
                      <span className="ml-0.5 rounded-full border border-amber-200 bg-amber-100 px-1 text-[9px] font-bold text-amber-700">
                        {notes.length}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleToggleResolve}
                    className={cn(
                      "flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition-colors",
                      isResolved
                        ? "border-outline-variant/30 text-on-surface-variant hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    )}
                  >
                    {isResolved ? (
                      <>
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Reopen</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Resolve</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Internal notes panel */}
              {notesOpen && (
                <div className="max-h-44 shrink-0 overflow-y-auto border-b border-outline-variant/20 bg-amber-50/50">
                  <div className="space-y-2 p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-700/70">
                      Internal notes — not visible to customer
                    </p>
                    {notes.length === 0 ? (
                      <p className="text-xs text-on-surface-variant/50">No notes yet.</p>
                    ) : (
                      notes.map((n) => (
                        <div
                          key={n.id}
                          className="rounded-lg border border-amber-200/60 bg-white p-2.5 text-xs text-on-surface"
                        >
                          <p className="leading-relaxed">{n.text}</p>
                          <p className="mt-1 text-[10px] text-on-surface-variant/50">
                            {fmtMsgTime(n.createdAt)}
                          </p>
                        </div>
                      ))
                    )}
                    <div className="flex gap-1.5 pt-1">
                      <input
                        type="text"
                        placeholder="Add internal note…"
                        value={draftNote}
                        onChange={(e) => setDraftNote(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") void handleAddNote(); }}
                        className="flex-1 rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-xs focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-300"
                      />
                      <button
                        type="button"
                        onClick={handleAddNote}
                        disabled={!draftNote.trim() || addingNote}
                        className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
                      >
                        {addingNote ? "…" : "Add"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Messages area */}
              <div className="flex-1 overflow-y-auto bg-[#efeae2] p-4">
                {loadingChat ? (
                  <div className="flex h-full items-center justify-center">
                    <RefreshCw className="h-5 w-5 animate-spin text-on-surface-variant/40" />
                  </div>
                ) : (
                  <div className="space-y-1">
                    {(() => {
                      const els: React.ReactNode[] = [];
                      let lastDate = "";
                      for (const msg of chatMessages) {
                        const dk = dateKey(msg.timestamp);
                        if (dk && dk !== lastDate) {
                          lastDate = dk;
                          els.push(
                            <div key={`d-${dk}`} className="my-3 flex justify-center">
                              <span className="rounded-full bg-white/80 px-3 py-0.5 text-[10px] font-medium text-on-surface-variant shadow-sm">
                                {fmtDateDivider(msg.timestamp)}
                              </span>
                            </div>
                          );
                        }
                        const isOut = msg.direction === "outgoing";
                        els.push(
                          <div key={msg.id} className={cn("flex", isOut ? "justify-end" : "justify-start")}>
                            <div
                              className={cn(
                                "max-w-[72%] rounded-2xl px-3.5 py-2 shadow-sm",
                                isOut ? "rounded-tr-sm bg-[#dcf8c6]" : "rounded-tl-sm bg-white"
                              )}
                            >
                              {!isOut && msg.messageType !== "text" && (
                                <p className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-on-surface-variant/60">
                                  [{msg.messageType}]
                                </p>
                              )}
                              <p className="break-words text-sm leading-relaxed text-on-surface">
                                {msg.text || "(empty)"}
                              </p>
                              <div className="mt-0.5 flex items-center justify-end gap-1">
                                <span className="text-[10px] text-on-surface-variant/60">
                                  {fmtMsgTime(msg.timestamp)}
                                </span>
                                {isOut && (
                                  <>
                                    {msg.status === "read" ? (
                                      <CheckCheck className="h-3 w-3 text-blue-500" />
                                    ) : msg.status === "delivered" ? (
                                      <CheckCheck className="h-3 w-3 text-on-surface-variant/60" />
                                    ) : (
                                      <Check className="h-3 w-3 text-on-surface-variant/60" />
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return els;
                    })()}
                    <div ref={chatBottomRef} />
                  </div>
                )}
              </div>

              {/* Composer */}
              <div className="shrink-0 border-t border-outline-variant/20 bg-surface-container-lowest p-3">
                {canReply ? (
                  <div className="flex items-end gap-2">
                    <textarea
                      ref={textareaRef}
                      rows={1}
                      placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
                      value={draftText}
                      onChange={(e) => setDraftText(e.target.value)}
                      onKeyDown={handleKeyDown}
                      onInput={(e) => {
                        const el = e.currentTarget;
                        el.style.height = "auto";
                        el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
                      }}
                      className="min-h-[40px] max-h-28 flex-1 resize-none rounded-2xl border border-outline-variant/30 bg-white px-3.5 py-2.5 text-sm focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
                    />
                    <button
                      type="button"
                      onClick={handleSend}
                      disabled={!draftText.trim() || sending}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-sm transition-all hover:bg-primary/90 disabled:opacity-40"
                    >
                      {sending ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2 py-1 text-center">
                    <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                    <p className="text-xs text-on-surface-variant">
                      <span className="font-semibold text-red-600">Service window closed.</span>{" "}
                      No incoming message in the last 24 hours. Use WhatsApp templates to re-engage.
                    </p>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Empty state */
            <div className="flex h-full flex-col items-center justify-center bg-[#f0f2f5] p-8 text-center">
              <div className="mb-4 rounded-full bg-white p-5 shadow-sm">
                <MessageSquare className="h-10 w-10 text-primary/40" />
              </div>
              <h3 className="text-base font-bold text-on-surface">WhatsApp Support Inbox</h3>
              <p className="mt-1 max-w-xs text-sm text-on-surface-variant/70">
                Select a conversation from the left panel to view messages and reply
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
