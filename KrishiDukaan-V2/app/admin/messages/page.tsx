"use client";

import { useEffect, useState } from "react";
import { Trash2, RefreshCw, Search, Mail, User, Clock, Inbox, MessageSquare, Phone, Tag } from "lucide-react";
import { fetchContactMessages, deleteContactMessage, ContactMessage } from "../../firebase";

export default function AdminMessagesPage() {
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetchContactMessages()
      .then(setMessages)
      .catch((err) => console.error("Error loading messages:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this message?")) return;
    setDeletingId(id);
    try {
      await deleteContactMessage(id);
      setMessages((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      console.error("Failed to delete message:", err);
      alert("Failed to delete message. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = messages.filter((m) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      m.name?.toLowerCase().includes(q) ||
      m.email?.toLowerCase().includes(q) ||
      m.message?.toLowerCase().includes(q)
    );
  });

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "—";
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleString();
    } catch {
      return "—";
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-on-surface flex items-center gap-2">
            <MessageSquare className="h-6 w-6 text-primary" /> Contact Messages
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            View and manage feedback or support requests submitted from the About page.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-outline-variant bg-white px-4 py-2.5 text-sm font-semibold text-on-surface transition-all hover:bg-surface-container-low hover:shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-primary" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Toolbar / Search */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-white rounded-3xl p-4 shadow-sm border border-surface-container">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant opacity-60" />
          <input
            type="text"
            placeholder="Search by sender, email, or message content..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-2xl bg-surface-container-low border border-outline-variant pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="text-xs font-semibold text-on-surface-variant px-2">
          Total messages: <span className="text-primary font-bold">{filtered.length}</span>
        </div>
      </div>

      {/* Content Section */}
      {loading ? (
        <div className="flex min-h-[300px] items-center justify-center bg-white rounded-3xl border border-surface-container shadow-sm">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium text-on-surface-variant">Loading messages...</p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex min-h-[300px] flex-col items-center justify-center rounded-3xl border border-dashed border-outline-variant bg-white p-8 text-center shadow-sm">
          <div className="rounded-full bg-primary/5 p-4 text-primary mb-4">
            <Inbox className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-bold text-on-surface">No messages found</h3>
          <p className="mt-1 text-sm text-on-surface-variant max-w-sm">
            {search ? "No messages match your search criteria." : "All caught up! No contact messages have been submitted yet."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filtered.map((msg) => (
            <div
              key={msg.id}
              className="bg-white rounded-3xl p-6 shadow-sm border border-surface-container hover:shadow-md transition-shadow flex flex-col md:flex-row justify-between gap-6"
            >
              <div className="space-y-3 flex-1">
                {/* Sender Info */}
                <div className="flex flex-wrap gap-x-4 gap-y-2 items-center text-sm">
                  <span className="flex items-center gap-1.5 font-bold text-on-surface">
                    <User className="h-4 w-4 text-primary shrink-0" />
                    {msg.name || "Anonymous"}
                  </span>
                  <span className="hidden sm:inline text-on-surface-variant/40">|</span>
                  <a
                    href={`mailto:${msg.email}`}
                    className="flex items-center gap-1.5 font-medium text-primary hover:underline"
                  >
                    <Mail className="h-4 w-4 shrink-0" />
                    {msg.email}
                  </a>
                  {msg.phone && (
                    <>
                      <span className="hidden sm:inline text-on-surface-variant/40">|</span>
                      <a href={`tel:${msg.phone}`} className="flex items-center gap-1.5 font-medium text-on-surface hover:text-primary">
                        <Phone className="h-3.5 w-3.5 shrink-0" />
                        {msg.phone}
                      </a>
                    </>
                  )}
                  {msg.subject && (
                    <>
                      <span className="hidden sm:inline text-on-surface-variant/40">|</span>
                      <span className="flex items-center gap-1.5 text-xs font-semibold rounded-full bg-primary/10 text-primary px-2.5 py-0.5">
                        <Tag className="h-3 w-3 shrink-0" />
                        {msg.subject}
                      </span>
                    </>
                  )}
                  <span className="hidden sm:inline text-on-surface-variant/40">|</span>
                  <span className="flex items-center gap-1.5 text-on-surface-variant text-xs">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    {formatDate(msg.createdAt)}
                  </span>
                </div>

                {/* Message Body */}
                <div className="bg-surface-container-lowest/50 rounded-2xl p-4 border border-outline-variant/10 text-on-surface text-sm leading-relaxed whitespace-pre-wrap">
                  {msg.message}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-start justify-end shrink-0">
                <button
                  type="button"
                  onClick={() => handleDelete(msg.id)}
                  disabled={deletingId === msg.id}
                  aria-label="Delete message"
                  className="p-3 rounded-xl text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors border border-outline-variant/10 hover:border-red-200 disabled:opacity-50"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
