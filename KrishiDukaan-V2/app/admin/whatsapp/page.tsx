"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  limit,
  where,
  doc,
  getDoc,
  updateDoc,
  setDoc,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
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
  ImageOff,
  Paperclip,
  FileText,
  X,
  Download,
} from "lucide-react";
import { cn } from "../../dashboard/_lib/cn";
import { WaSubNav } from "./_components/wa-sub-nav";

// ── Authenticated image proxy component ──────────────────────────────────────

function WaImageMsg({ mediaId, caption }: { mediaId: string; caption?: string | null }): JSX.Element {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;

    async function load() {
      try {
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch(`/api/wa/media/${mediaId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) { setState("error"); return; }
        const blob = await res.blob();
        if (revoked) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
        setState("ok");
      } catch {
        if (!revoked) setState("error");
      }
    }

    void load();
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [mediaId]);

  return (
    <div className="space-y-1">
      {state === "loading" && (
        <div className="flex h-36 w-56 items-center justify-center rounded-xl bg-black/5">
          <RefreshCw className="h-5 w-5 animate-spin text-on-surface-variant/40" />
        </div>
      )}
      {state === "error" && (
        <div className="flex h-36 w-56 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-on-surface-variant/20 bg-black/5 text-on-surface-variant/50">
          <ImageOff className="h-5 w-5" />
          <span className="text-[10px] font-medium">Image unavailable</span>
        </div>
      )}
      {state === "ok" && blobUrl && (
        <img
          src={blobUrl}
          alt={caption ?? "image"}
          className="max-h-64 max-w-[280px] cursor-pointer rounded-xl object-cover shadow-sm"
          onClick={() => window.open(blobUrl, "_blank")}
        />
      )}
      {caption && (
        <p className="text-xs leading-snug text-on-surface/80">{caption}</p>
      )}
    </div>
  );
}

// ── Document message component ────────────────────────────────────────────────

function WaDocMsg({
  fileName,
  fileSize,
  mediaId,
  caption,
}: {
  fileName: string;
  fileSize: number | null;
  mediaId: string | null;
  caption?: string | null;
}): JSX.Element {
  function fmtBytes(b: number) {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function handleDownload() {
    if (!mediaId) return;
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/wa/media/${mediaId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) { alert("Could not download file — it may have expired."); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Download failed.");
    }
  }

  return (
    <div className="space-y-1 min-w-[180px]">
      <div className="flex items-center gap-2.5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <FileText className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-tight text-on-surface">{fileName}</p>
          {fileSize != null && (
            <p className="text-[10px] text-on-surface-variant/60">{fmtBytes(fileSize)}</p>
          )}
        </div>
        {mediaId && (
          <button
            type="button"
            onClick={handleDownload}
            title="Download"
            className="shrink-0 rounded-full p-1.5 hover:bg-black/5 text-on-surface-variant/60 hover:text-primary transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {caption && <p className="text-xs leading-snug text-on-surface/80 pt-0.5">{caption}</p>}
    </div>
  );
}

// ── Role display ───────────────────────────────────────────────────────────────

const ROLE_LABEL: Record<string, string> = {
  retailer:       "Retailer",
  manufacturer:   "Manufacturer",
  salesExecutive: "Sales Exec",
  farmer:         "Farmer",
  admin:          "Admin",
  customer:       "Customer",
  consumer:       "Customer",   // mobile-app alias — normalised server-side but kept as safety net
  unknown:        "Unknown",
};

const ROLE_BADGE: Record<string, string> = {
  retailer:       "bg-green-100 text-green-700 border-green-200",
  manufacturer:   "bg-blue-100 text-blue-700 border-blue-200",
  salesExecutive: "bg-purple-100 text-purple-700 border-purple-200",
  farmer:         "bg-teal-100 text-teal-700 border-teal-200",
  admin:          "bg-red-100 text-red-700 border-red-200",
  customer:       "bg-gray-100 text-gray-600 border-gray-200",
  consumer:       "bg-gray-100 text-gray-600 border-gray-200",
  unknown:        "bg-amber-50 text-amber-700 border-amber-200",
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
  mediaId?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  /** For messageType === "reaction": the emoji, or "" when the reaction was removed. */
  emoji?: string | null;
}

interface ConvRow {
  phone: string;
  user: WaResolvedUser | null;
  /** Last incoming message text, or "[image]" etc. for media without a caption. */
  lastIncomingText: string;
  lastActivityTs: any;
  lastActivityMs: number;
  unreadCount: number;
  status: "open" | "resolved";
}

// Conversations per page, and messages per open chat (each "load" adds this many).
const CONV_PAGE = 50;
const MSG_PAGE = 100;

/** "919876543210" for a 10-digit Indian number or any 11+ digit number typed in search. */
function searchedWaPhone(term: string): string | null {
  const digits = term.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  return digits.length >= 11 ? digits : null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function WhatsAppInboxPage() {
  // ── Data
  // Newest conversations (live), CONV_PAGE more per "Load more".
  const [convDocs, setConvDocs] = useState<WaConvMeta[]>([]);
  const [convLimit, setConvLimit] = useState(CONV_PAGE);
  const [hasMoreConvs, setHasMoreConvs] = useState(false);
  // A conversation found by typing its number in search, outside the loaded pages.
  const [searchedConv, setSearchedConv] = useState<WaConvMeta | null>(null);
  // The open conversation: its metadata and its newest messages (live).
  const [selectedMeta, setSelectedMeta] = useState<WaConvMeta | null>(null);
  const [incoming, setIncoming] = useState<WaIncomingMessage[]>([]);
  const [msgLimit, setMsgLimit] = useState(MSG_PAGE);
  const [outgoing, setOutgoing] = useState<WaOutMessage[]>([]);
  const [notes, setNotes] = useState<WaNote[]>([]);
  const [userCache, setUserCache] = useState<Record<string, WaResolvedUser | null>>({});

  // ── UI
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("open");
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [loadingIncoming, setLoadingIncoming] = useState(true);
  const [loadingChat, setLoadingChat] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [sending, setSending] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [draftNote, setDraftNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [sendingDoc, setSendingDoc] = useState(false);

  const chatBottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Listeners ────────────────────────────────────────────────────────────────

  // Newest conversations that have an incoming message, CONV_PAGE at a time.
  // Every writer sets lastMessageAt (older docs: scripts/backfill-wa-inbox.ts).
  useEffect(() => {
    setLoadingIncoming(true);
    const base = collection(db, "waConversations");
    const q = filter === "all"
      ? query(base, where("hasIncoming", "==", true), orderBy("lastMessageAt", "desc"), limit(convLimit))
      : query(base, where("hasIncoming", "==", true), where("status", "==", filter), orderBy("lastMessageAt", "desc"), limit(convLimit));
    return onSnapshot(
      q,
      (snap) => {
        setConvDocs(snap.docs.map((d) => ({ ...(d.data() as WaConvMeta), phone: d.id })));
        setHasMoreConvs(snap.size >= convLimit);
        setLoadingIncoming(false);
      },
      (err) => {
        console.error("[WA Inbox] conversations listener error:", err.code);
        setLoadingIncoming(false);
      }
    );
  }, [filter, convLimit]);

  // Typing a phone number finds that conversation even if it isn't loaded (1 read).
  useEffect(() => {
    setSearchedConv(null);
    const phone = searchedWaPhone(search);
    if (!phone || convDocs.some((c) => c.phone === phone)) return;
    let cancelled = false;
    const t = setTimeout(() => {
      getDoc(doc(db, "waConversations", phone))
        .then((snap) => {
          if (!cancelled && snap.exists() && snap.get("hasIncoming") === true) {
            setSearchedConv({ ...(snap.data() as WaConvMeta), phone: snap.id });
          }
        })
        .catch(() => {});
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [search, convDocs]);

  // The open conversation's metadata (status, unread, last times), live.
  useEffect(() => {
    if (!selectedPhone) { setSelectedMeta(null); return; }
    return onSnapshot(
      doc(db, "waConversations", selectedPhone),
      (snap) => setSelectedMeta(snap.exists() ? ({ ...(snap.data() as WaConvMeta), phone: snap.id }) : null),
      () => setSelectedMeta(null)
    );
  }, [selectedPhone]);

  // Incoming messages of the open conversation only, newest first.
  useEffect(() => {
    if (!selectedPhone) { setIncoming([]); return; }
    return onSnapshot(
      query(
        collection(db, "waIncomingMessages"),
        where("phone", "==", selectedPhone),
        orderBy("timestamp", "desc"),
        limit(msgLimit)
      ),
      (snap) => setIncoming(snap.docs.map((d) => ({ id: d.id, ...d.data() } as WaIncomingMessage))),
      (err) => console.error("[WA Inbox] messages listener error:", err.code)
    );
  }, [selectedPhone, msgLimit]);

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
        orderBy("timestamp", "desc"),
        limit(msgLimit)
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
  }, [selectedPhone, msgLimit]);

  // Resolve user identity for listed phones, once per phone per visit (a miss
  // is not retried on every snapshot: each try costs up to 15 reads).
  const resolveTried = useRef<Set<string>>(new Set());
  useEffect(() => {
    const phones = [...convDocs, ...(searchedConv ? [searchedConv] : [])].map((c) => c.phone);
    const pending = Array.from(new Set(phones)).filter((p) => p && !resolveTried.current.has(p));
    if (!pending.length) return;
    pending.forEach((p) => resolveTried.current.add(p));
    Promise.all(pending.map(async (p) => [p, await resolveWaUserByPhone(p).catch(() => null)] as const)).then(
      (results) =>
        setUserCache((prev) => {
          const next = { ...prev };
          results.forEach(([p, u]) => { next[p] = u; });
          return next;
        })
    );
  }, [convDocs, searchedConv]);

  // Scroll to bottom when chat changes
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedPhone, outgoing.length, incoming.length]);

  // ── Derived state ────────────────────────────────────────────────────────────

  const toRow = useCallback((meta: WaConvMeta): ConvRow => {
    const inMs = tsMillis(meta.lastIncomingAt);
    const outMs = tsMillis(meta.lastOutgoingAt);
    return {
      phone: meta.phone,
      user: userCache[meta.phone] ?? null,
      lastIncomingText: meta.lastIncomingText ?? "",
      lastActivityTs: inMs >= outMs ? (meta.lastIncomingAt ?? null) : (meta.lastOutgoingAt ?? null),
      lastActivityMs: Math.max(inMs, outMs),
      unreadCount: meta.unreadCount ?? 0,
      status: meta.status ?? "open",
    };
  }, [userCache]);

  // Already newest first (lastMessageAt desc).
  const conversationList = useMemo<ConvRow[]>(() => convDocs.map(toRow), [convDocs, toRow]);

  // Search filters the loaded conversations; a typed phone number is also
  // looked up directly (searchedConv).
  const filteredConvs = useMemo(() => {
    if (!search.trim()) return conversationList;
    const q = search.toLowerCase();
    const list = conversationList.filter(
      (c) =>
        c.phone.includes(q) ||
        c.user?.name.toLowerCase().includes(q) ||
        c.user?.businessName.toLowerCase().includes(q) ||
        c.lastIncomingText.toLowerCase().includes(q)
    );
    if (searchedConv && (filter === "all" || (searchedConv.status ?? "open") === filter)) {
      list.unshift(toRow(searchedConv));
    }
    return list;
  }, [conversationList, search, searchedConv, filter, toRow]);

  const selectedConv = useMemo(
    () => (selectedMeta ? toRow(selectedMeta) : null),
    [selectedMeta, toRow]
  );

  // More messages exist when either side filled its window.
  const hasEarlierMessages = incoming.length >= msgLimit || outgoing.length >= msgLimit;

  // Unified chat timeline: incoming from waIncomingMessages + outgoing from waConversations
  const chatMessages = useMemo<ChatMsg[]>(() => {
    if (!selectedPhone) return [];

    const inMsgs: ChatMsg[] = incoming
      .map((m) => ({
        id: m.id,
        direction: "incoming",
        text: m.messageText,
        messageType: m.messageType,
        timestamp: m.timestamp,
        status: null,
        // mediaId may come from the explicit field (new docs) or rawPayload (legacy)
        mediaId: m.mediaId ?? (m.rawPayload?.image as any)?.id ?? null,
        mimeType: m.mimeType ?? (m.rawPayload?.image as any)?.mime_type ?? null,
        // Reactions carry the emoji in rawPayload.reaction.emoji ("" = removed).
        emoji: m.messageType === "reaction"
          ? String((m.rawPayload?.reaction as any)?.emoji ?? "")
          : null,
      }));

    const outMsgs: ChatMsg[] = outgoing.map((m) => ({
      id: m.id,
      mediaId: m.mediaId ?? null,
      mimeType: m.mimeType ?? null,
      fileName: m.fileName ?? null,
      fileSize: m.fileSize ?? null,
      direction: "outgoing",
      text: m.text,
      messageType: m.messageType,
      timestamp: m.timestamp,
      status: m.status,
    }));

    // Each side holds its newest msgLimit messages. When a side is full, hide
    // anything older than its oldest message so the other side's older
    // messages don't show without their replies.
    const oldestMs = (msgs: ChatMsg[]) => Math.min(...msgs.map((m) => tsMillis(m.timestamp) || Infinity));
    const cutoff = Math.max(
      inMsgs.length >= msgLimit ? oldestMs(inMsgs) : 0,
      outMsgs.length >= msgLimit ? oldestMs(outMsgs) : 0,
    );
    return [...inMsgs, ...outMsgs]
      .filter((m) => !cutoff || !tsMillis(m.timestamp) || tsMillis(m.timestamp) >= cutoff)
      .sort((a, b) => tsMillis(a.timestamp) - tsMillis(b.timestamp));
  }, [incoming, selectedPhone, outgoing, msgLimit]);

  // 24-hour service window
  const { canReply, windowLabel } = useMemo(() => {
    if (!selectedPhone) return { canReply: false, windowLabel: "" };
    const lastInMs = Math.max(
      tsMillis(selectedMeta?.lastIncomingAt),
      ...incoming.map((m) => tsMillis(getTs(m))),
    );
    if (!lastInMs) return { canReply: false, windowLabel: "" };
    const ageMs = Date.now() - lastInMs;
    const windowMs = 24 * 60 * 60 * 1000;
    if (ageMs >= windowMs) return { canReply: false, windowLabel: "" };
    const remainMs = windowMs - ageMs;
    const hrs = Math.floor(remainMs / 3_600_000);
    const mins = Math.floor((remainMs % 3_600_000) / 60_000);
    return {
      canReply: true,
      windowLabel: hrs > 0 ? `${hrs}h ${mins}m left` : `${mins}m left`,
    };
  }, [incoming, selectedPhone, selectedMeta]);

  const isResolved = selectedMeta?.status === "resolved";

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleSelect = useCallback((phone: string) => {
    setSelectedPhone(phone);
    setMsgLimit(MSG_PAGE);
    setMobileChatOpen(true);
    setNotesOpen(false);
    setDraftText("");
    setPendingFile(null);
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
      if (pendingFile) void handleSendDocument();
      else void handleSend();
    }
  }

  async function handleSendDocument() {
    if (!selectedPhone || !pendingFile || sendingDoc || !canReply) return;
    const file = pendingFile;
    setPendingFile(null);
    const caption = draftText.trim();
    setDraftText("");
    setSendingDoc(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error("Not authenticated");

      const form = new FormData();
      form.append("phone", selectedPhone);
      form.append("file", file);
      if (caption) form.append("caption", caption);

      const res = await fetch("/api/wa/send-document", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
        body: form,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
      }
    } catch (err) {
      setPendingFile(file); // restore file on failure
      setDraftText(caption);
      alert(err instanceof Error ? err.message : "Failed to send document");
    } finally {
      setSendingDoc(false);
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

  function fmtFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function displayName(conv: ConvRow): string {
    const u = conv.user;
    return u?.businessName || u?.name || conv.phone;
  }

  function fmtPhone(raw: string): string {
    // "919876543210" → "+91 98765 43210"
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 12 && digits.startsWith("91")) {
      const local = digits.slice(2);
      return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
    }
    return `+${digits}`;
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-3">
      {/* Page header */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black text-on-surface">
          <MessageSquare className="h-6 w-6 text-primary" />
          WhatsApp
        </h1>
        <p className="mt-0.5 text-sm text-on-surface-variant">
          Customer conversations &amp; template messaging via WhatsApp Business
        </p>
      </div>
      <WaSubNav />
      <div className="flex items-center justify-end gap-2 text-xs text-on-surface-variant">
        {loadingIncoming && <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />}
        <span className="font-medium">
          {conversationList.length}{hasMoreConvs ? "+" : ""}{" "}
          conversation{conversationList.length !== 1 ? "s" : ""}
        </span>
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
                onClick={() => { setFilter(f); setConvLimit(CONV_PAGE); }}
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
                          <div className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold leading-tight text-on-surface">
                              {conv.user?.businessName || conv.user?.name || conv.phone}
                            </span>
                            {conv.user?.businessName && conv.user?.name && (
                              <span className="block truncate text-[10px] leading-tight text-on-surface-variant/60">
                                {conv.user.name}
                              </span>
                            )}
                          </div>
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
                          {conv.lastIncomingText === "[image]" ? "📷 Image" : conv.lastIncomingText}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
            {!loadingIncoming && hasMoreConvs && (
              <button
                type="button"
                onClick={() => setConvLimit((n) => n + CONV_PAGE)}
                className="w-full border-t border-outline-variant/10 py-3 text-xs font-semibold text-primary hover:bg-surface-container-low"
              >
                {search.trim() ? "Search older conversations" : "Load more conversations"}
              </button>
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
                  {(() => {
                    const u = selectedConv.user;
                    const business = u?.businessName || "";
                    const person   = u?.name || "";
                    return (
                      <>
                        {/* Business name — prominent when present */}
                        {business ? (
                          <p className="truncate text-sm font-bold leading-tight text-on-surface">
                            {business}
                          </p>
                        ) : null}

                        {/* Personal name — bold when no business, secondary otherwise */}
                        {person ? (
                          <p className={cn(
                            "truncate leading-tight",
                            business
                              ? "text-xs text-on-surface-variant/80"
                              : "text-sm font-bold text-on-surface"
                          )}>
                            {person}
                          </p>
                        ) : !business ? (
                          <p className="truncate text-sm font-bold text-on-surface">
                            {selectedConv.phone}
                          </p>
                        ) : null}

                        {/* Role + window badges */}
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          {u && (
                            <span className={cn(
                              "inline-flex items-center rounded-full border px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide",
                              ROLE_BADGE[u.role] ?? ROLE_BADGE.unknown
                            )}>
                              {ROLE_LABEL[u.role] ?? u.role}
                            </span>
                          )}

                          {/* Phone */}
                          <span className="flex items-center gap-1 text-[10px] text-on-surface-variant/60">
                            <Phone className="h-2.5 w-2.5" />
                            {fmtPhone(selectedConv.phone)}
                          </span>

                          {/* 24-hour window */}
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
                      </>
                    );
                  })()}
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
                    {hasEarlierMessages && (
                      <div className="mb-2 flex justify-center">
                        <button
                          type="button"
                          onClick={() => setMsgLimit((n) => n + MSG_PAGE)}
                          className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold text-primary shadow-sm hover:bg-white"
                        >
                          Load earlier messages
                        </button>
                      </div>
                    )}
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
                        const isImage = !isOut && msg.messageType === "image" && msg.mediaId;
                        const isDoc = msg.messageType === "document" && msg.fileName;
                        els.push(
                          <div key={msg.id} className={cn("flex", isOut ? "justify-end" : "justify-start")}>
                            <div
                              className={cn(
                                "max-w-[72%] rounded-2xl shadow-sm",
                                isImage ? "overflow-hidden p-1.5 pb-0" : "px-3.5 py-2",
                                isOut ? "rounded-tr-sm bg-[#dcf8c6]" : "rounded-tl-sm bg-white"
                              )}
                            >
                              {isImage ? (
                                <div className="pb-1.5">
                                  <WaImageMsg mediaId={msg.mediaId!} caption={msg.text} />
                                </div>
                              ) : isDoc ? (
                                <WaDocMsg
                                  fileName={msg.fileName!}
                                  fileSize={msg.fileSize ?? null}
                                  mediaId={msg.mediaId ?? null}
                                  caption={msg.text}
                                />
                              ) : msg.messageType === "reaction" ? (
                                <p className="flex items-center gap-1.5 text-sm leading-relaxed text-on-surface-variant">
                                  {msg.emoji ? (
                                    <>
                                      <span className="text-base">{msg.emoji}</span>
                                      <span className="text-xs italic">reacted to a message</span>
                                    </>
                                  ) : (
                                    <span className="text-xs italic">removed their reaction</span>
                                  )}
                                </p>
                              ) : (
                                <>
                                  {!isOut && msg.messageType !== "text" && (
                                    <p className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-on-surface-variant/60">
                                      [{msg.messageType}]
                                    </p>
                                  )}
                                  <p className="break-words text-sm leading-relaxed text-on-surface">
                                    {msg.text || "(empty)"}
                                  </p>
                                </>
                              )}
                              <div className={cn("flex items-center justify-end gap-1", isImage ? "px-2 pb-1" : "mt-0.5")}>
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
                  <div className="space-y-2">
                    {/* File chip */}
                    {pendingFile && (
                      <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2">
                        <FileText className="h-4 w-4 shrink-0 text-primary" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-on-surface">{pendingFile.name}</p>
                          <p className="text-[10px] text-on-surface-variant/60">{fmtFileSize(pendingFile.size)}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => { setPendingFile(null); setDraftText(""); }}
                          className="shrink-0 rounded-full p-0.5 text-on-surface-variant/50 hover:bg-red-100 hover:text-red-600 transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}

                    {/* Input row */}
                    <div className="flex items-end gap-2">
                      {/* Hidden file input */}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0] ?? null;
                          setPendingFile(f);
                          e.target.value = "";
                        }}
                      />

                      {/* Attachment button */}
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        title="Attach file"
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors",
                          pendingFile
                            ? "border-primary/30 bg-primary/10 text-primary"
                            : "border-outline-variant/30 bg-white text-on-surface-variant hover:bg-surface-container"
                        )}
                      >
                        <Paperclip className="h-4 w-4" />
                      </button>

                      <textarea
                        ref={textareaRef}
                        rows={1}
                        placeholder={pendingFile ? "Add a caption… (optional)" : "Type a message… (Enter to send, Shift+Enter for newline)"}
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
                        onClick={pendingFile ? handleSendDocument : handleSend}
                        disabled={pendingFile ? sendingDoc : (!draftText.trim() || sending)}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-sm transition-all hover:bg-primary/90 disabled:opacity-40"
                      >
                        {(sending || sendingDoc) ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </button>
                    </div>
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
