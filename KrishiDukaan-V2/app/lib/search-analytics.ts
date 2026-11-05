/**
 * Client side of Admin > Search insights (app/api/analytics/search).
 *
 * A search is logged only once it has SETTLED (no new term for SETTLE_MS), so
 * typing "u", "ur", "urea" records just "urea"; each term and category is
 * logged at most once per browser session. Fire-and-forget with keepalive, so
 * it never blocks the UI and survives navigating to a product right away.
 *
 * Each event also carries the shopper's last real location, rounded to ~1 km
 * (the server turns it into a state + district and keeps only counts), and a
 * search carries the main category of its results.
 */

import { getLastKnownCoords } from "../utils/geolocation";

const SETTLE_MS = 1500;
const SESSION_KEY = "kd_logged_searches";

let pending: ReturnType<typeof setTimeout> | null = null;
let logged: Set<string> | null = null;

function loggedSet(): Set<string> {
  if (logged) return logged;
  try {
    logged = new Set(JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "[]"));
  } catch {
    logged = new Set();
  }
  return logged;
}

function markLogged(key: string): boolean {
  const set = loggedSet();
  if (set.has(key)) return false;
  set.add(key);
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(Array.from(set).slice(-100)));
  } catch {
    /* private mode — the in-memory set still dedupes this tab */
  }
  return true;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function send(body: Record<string, unknown>): void {
  try {
    const at = getLastKnownCoords();
    void fetch("/api/analytics/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...body,
        source: "web",
        ...(at ? { lat: round2(at.lat), lng: round2(at.lng) } : {}),
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* analytics must never break search */
  }
}

const GENERIC_CATEGORIES = new Set(["", "all", "general", "other", "others"]);

/** The category most of these results belong to ("urea" -> Fertilizers), or "". */
export function mainCategory(products: readonly { category?: string | null }[]): string {
  const counts = new Map<string, { label: string; n: number }>();
  for (const p of products.slice(0, 30)) {
    const label = String(p.category ?? "").trim();
    const key = label.toLowerCase();
    if (GENERIC_CATEGORIES.has(key)) continue;
    const c = counts.get(key) ?? { label, n: 0 };
    c.n += 1;
    counts.set(key, c);
  }
  let best = "";
  let bestN = 0;
  counts.forEach(({ label, n }) => {
    if (n > bestN) { best = label; bestN = n; }
  });
  return best;
}

/** Call when the first page of results for [query] has loaded. */
export function scheduleSearchLog(query: string, results: number, category = ""): void {
  if (pending) clearTimeout(pending);
  const q = query.trim().toLowerCase();
  if (q.length < 2) return;
  pending = setTimeout(() => {
    pending = null;
    if (markLogged(`q:${q}`)) send({ kind: "search", q, results, ...(category ? { category } : {}) });
  }, SETTLE_MS);
}

/** Call when the shopper picks a category to browse. */
export function logCategoryBrowse(category: string): void {
  const c = category.trim();
  if (!c || c.toLowerCase() === "all") return;
  if (markLogged(`c:${c.toLowerCase()}`)) send({ kind: "category", category: c });
}
