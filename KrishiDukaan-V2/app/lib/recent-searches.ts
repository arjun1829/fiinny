"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * The shopper's own recent searches on this browser — the website's version
 * of the app's recentSearchesProvider (mobile/lib/core/providers/
 * recent_searches_provider.dart): last 8, newest first, case-insensitive
 * de-duplication, saved only for a search the shopper commits (Enter or a tap
 * on a recent one), never for every keystroke.
 *
 * Kept in localStorage like the app keeps it on the phone. Storage can be
 * unavailable (private mode, blocked site data), so every access is guarded
 * and the box simply shows no history then.
 */

const STORAGE_KEY = "kd_recent_searches";
const MAX_RECENT = 8;
const CHANGED = "kd-recent-searches-changed";

function read(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string").slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function save(list: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable: history just isn't kept */
  }
  // Both search boxes (desktop and mobile) stay in step.
  window.dispatchEvent(new Event(CHANGED));
}

export function useRecentSearches() {
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    setRecent(read());
    const sync = () => setRecent(read());
    window.addEventListener(CHANGED, sync);
    window.addEventListener("storage", sync); // another tab
    return () => {
      window.removeEventListener(CHANGED, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const addSearch = useCallback((query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();
    save([trimmed, ...read().filter((s) => s.toLowerCase() !== lower)].slice(0, MAX_RECENT));
  }, []);

  const clearAll = useCallback(() => save([]), []);

  return { recent, addSearch, clearAll };
}
