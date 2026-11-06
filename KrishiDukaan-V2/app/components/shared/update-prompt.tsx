"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { useI18n } from "../../i18n/I18nContext";

const CURRENT = process.env.NEXT_PUBLIC_BUILD_ID ?? "";
const MIN_GAP_MS = 5 * 60 * 1000; // between checks triggered by tab focus
const POLL_MS = 30 * 60 * 1000; // while a tab stays visible
const CHUNK_RELOAD_KEY = "kd_chunk_reload";

/** Newer build ids are larger timestamps (see next.config.js). */
function isNewer(remote: string): boolean {
  const r = Number(remote);
  const c = Number(CURRENT);
  return Number.isFinite(r) && Number.isFinite(c) && r > c;
}

async function fetchRemoteBuild(): Promise<string | null> {
  try {
    const res = await fetch("/api/version", { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { buildId?: string };
    return body.buildId || null;
  } catch {
    return null;
  }
}

/**
 * Tells a tab that has been open across a deploy that a newer build is live,
 * and recovers from the chunk-load failures such tabs hit when they navigate
 * to a page whose JS was replaced by the deploy.
 */
export function UpdatePrompt() {
  const { t } = useI18n();
  const [available, setAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const lastCheck = useRef(0);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !CURRENT) return;

    let stopped = false;
    const check = async (force = false) => {
      if (stopped || document.visibilityState !== "visible") return;
      const now = Date.now();
      if (!force && now - lastCheck.current < MIN_GAP_MS) return;
      lastCheck.current = now;
      const remote = await fetchRemoteBuild();
      if (!stopped && remote && isNewer(remote)) setAvailable(true);
    };

    // The page was rendered by this build moments ago — nothing to check yet.
    lastCheck.current = Date.now();
    const onVisible = () => void check();
    const timer = window.setInterval(() => void check(true), POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    // A deploy removes the old build's chunks; a stale tab that navigates
    // then fails to load them. Reload once onto the new build.
    const onChunkError = (e: ErrorEvent | PromiseRejectionEvent) => {
      const reason = "reason" in e ? e.reason : e.error;
      const msg = String(reason?.name ?? "") + String(reason?.message ?? e);
      if (!/ChunkLoadError|Loading chunk [\w-]+ failed|Loading CSS chunk/i.test(msg)) return;
      try {
        if (sessionStorage.getItem(CHUNK_RELOAD_KEY) === CURRENT) return;
        sessionStorage.setItem(CHUNK_RELOAD_KEY, CURRENT);
      } catch {
        return; // can't guard against a reload loop — leave it to the prompt
      }
      window.location.reload();
    };
    window.addEventListener("error", onChunkError);
    window.addEventListener("unhandledrejection", onChunkError);

    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("error", onChunkError);
      window.removeEventListener("unhandledrejection", onChunkError);
    };
  }, []);

  if (!available || dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-4 bottom-4 z-[300] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-primary/20 bg-white px-4 py-3 text-sm shadow-xl sm:left-auto sm:right-6 sm:mx-0"
    >
      <RefreshCw className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <span className="flex-1 font-medium text-gray-800">{t("newVersionAvailable")}</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-white hover:opacity-90"
      >
        {t("reloadToUpdate")}
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="rounded-lg p-1 text-gray-400 hover:text-gray-600"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
