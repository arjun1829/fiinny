"use client";

import { useState, useEffect, useRef } from "react";
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, increment, getDocs, where, limit } from "firebase/firestore";
import { db, auth, fetchStores } from "../firebase";
import { X, Send, Loader2 } from "lucide-react";
import { onAuthStateChanged, User } from "firebase/auth";

type TagCandidate = { id: string; name: string; role: "user" | "seller" };

export default function ReelComments({ reelId, onClose }: { reelId: string; onClose: () => void }) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Tagging state — typing "@" inline in the comment box triggers suggestions.
  const [showTagMenu, setShowTagMenu] = useState(false);
  const [tagQuery, setTagQuery] = useState("");
  const [taggedUser, setTaggedUser] = useState<{ id: string; name: string } | null>(null);
  const [allCandidates, setAllCandidates] = useState<TagCandidate[] | null>(null);
  const [candidatesLoading, setCandidatesLoading] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "reels", reelId, "reel_comments"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setComments(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, [reelId]);

  // Every shop, once (lazily, the first time the tag menu opens), from the
  // store directory: 1–2 reads instead of the whole users and retailers
  // collections. Filtering then happens client-side on every keystroke.
  const loadCandidates = async () => {
    if (allCandidates || candidatesLoading) return;
    setCandidatesLoading(true);
    try {
      const stores = await fetchStores();
      setAllCandidates(
        stores.map((s) => ({ id: s.phone || s.id, name: s.name || "Seller", role: "seller" as const })),
      );
    } catch {
      setAllCandidates([]);
    } finally {
      setCandidatesLoading(false);
    }
  };

  // People are matched by a bounded name search (at most 10 docs), never by
  // downloading every user. Only sellers may query users, and only other
  // seller accounts (firestore.rules keeps farmers' records private), so the
  // query filters on role; after the first refusal it stops for the session.
  const [userMatches, setUserMatches] = useState<TagCandidate[]>([]);
  const usersSearchDenied = useRef(false);
  useEffect(() => {
    const q = tagQuery.trim();
    if (q.length < 2 || usersSearchDenied.current) {
      setUserMatches([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const prefixes = Array.from(new Set([q, q.charAt(0).toUpperCase() + q.slice(1)]));
      try {
        const snaps = await Promise.all(prefixes.map((p) =>
          getDocs(query(collection(db, "users"), where("role", "in", ["retailer", "manufacturer"]), where("name", ">=", p), where("name", "<=", `${p}`), limit(5)))));
        if (cancelled) return;
        setUserMatches(snaps.flatMap((s) => s.docs.map((d) => ({ id: d.id, name: String(d.data().name || "User"), role: "user" as const }))));
      } catch (err) {
        if ((err as { code?: string })?.code === "permission-denied") usersSearchDenied.current = true;
        if (!cancelled) setUserMatches([]);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [tagQuery]);

  const sellerMatches = (allCandidates ?? []).filter(
    (c) => tagQuery.length > 0 && c.name.toLowerCase().includes(tagQuery.toLowerCase()),
  );
  const tagResults = [...sellerMatches, ...userMatches]
    .filter((c, i, all) => all.findIndex((o) => o.id === c.id) === i)
    .slice(0, 8);

  // Detects "@partial-name" right before the caret so suggestions appear
  // while the user is actively typing a mention, Instagram/Twitter-style.
  const handleTextChange = (value: string, caret: number) => {
    setText(value);
    const uptoCaret = value.slice(0, caret);
    const match = uptoCaret.match(/@([^\s@]*)$/);
    if (match) {
      setShowTagMenu(true);
      setTagQuery(match[1]);
      loadCandidates();
    } else {
      setShowTagMenu(false);
      setTagQuery("");
    }
  };

  const pickTag = (c: TagCandidate) => {
    // Strip the in-progress "@partial" trigger text back out — the tag
    // itself is shown separately (the bold "@name" prefix rendered from
    // taggedUserName below), so leaving "@Name " in the free-text comment
    // too made every tagged comment show the name twice.
    const caret = inputRef.current?.selectionStart ?? text.length;
    const uptoCaret = text.slice(0, caret);
    const stripped = uptoCaret.replace(/@([^\s@]*)$/, "");
    setText(stripped + text.slice(caret));
    setTaggedUser({ id: c.id, name: c.name });
    setShowTagMenu(false);
    setTagQuery("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !user) return;
    if (!user.phoneNumber) {
      setError("Your account has no phone number on file — please re-login to comment.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await addDoc(collection(db, "reels", reelId, "reel_comments"), {
        // Must match the phone-keyed identity Firestore rules check
        // (myPhone() / auth token phone_number) — the Auth UID is not it.
        userId: user.phoneNumber,
        userName: user.displayName || user.phoneNumber || "User",
        text: text.trim(),
        createdAt: serverTimestamp(),
        ...(taggedUser ? { taggedUserId: taggedUser.id, taggedUserName: taggedUser.name } : {}),
      });
      await updateDoc(doc(db, "reels", reelId), { commentsCount: increment(1) });
      setText("");
      setTaggedUser(null);
    } catch (err) {
      console.error(err);
      setError("Could not post comment. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-black/60 backdrop-blur-sm sm:items-center sm:justify-end">
      <div className="flex h-[75vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white sm:h-[600px] sm:w-[400px] sm:rounded-2xl sm:mb-4 relative">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-lg font-bold">Comments</h3>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {loading ? (
             <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
          ) : comments.length === 0 ? (
             <p className="text-center text-gray-500 py-8 text-sm">No comments yet.</p>
          ) : (
            comments.map(c => (
              <div key={c.id} className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 font-bold text-sm">
                  {(c.userName?.[0] || '?').toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="font-bold text-sm text-gray-900">{c.userName}</div>
                  <div className="text-sm text-gray-800">
                    {c.taggedUserName && <span className="font-bold text-blue-600 mr-1">@{c.taggedUserName}</span>}
                    {c.text}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="border-t p-3 relative">
          {error && <p className="mb-2 text-xs font-semibold text-red-600">{error}</p>}

          {showTagMenu && (
            <div className="absolute bottom-full left-0 w-full bg-white border shadow-lg max-h-48 overflow-y-auto z-10 text-sm">
              {candidatesLoading ? (
                <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-gray-400" /></div>
              ) : tagResults.length === 0 ? (
                <p className="px-3 py-3 text-xs text-gray-500">No matches for &quot;{tagQuery}&quot;</p>
              ) : (
                tagResults.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => pickTag(r)}
                    className="flex w-full text-left items-center gap-2 px-3 py-2 hover:bg-gray-100 border-b"
                  >
                    <div className="font-bold">{r.name}</div>
                    <div className="text-[10px] text-gray-500 uppercase">{r.role}</div>
                  </button>
                ))
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex items-center gap-2 relative">
            <input
              ref={inputRef}
              type="text"
              value={text}
              onChange={(e) => handleTextChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
              placeholder={user ? "Add a comment... (type @ to tag someone)" : "Login to comment"}
              disabled={!user || submitting}
              className="flex-1 rounded-full border border-gray-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 disabled:bg-gray-50 disabled:cursor-not-allowed"
            />
            <button
              type="submit"
              disabled={!text.trim() || !user || submitting}
              className="rounded-full bg-emerald-600 p-2 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
