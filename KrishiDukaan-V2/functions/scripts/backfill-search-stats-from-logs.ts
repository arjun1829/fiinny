/**
 * Backfills searchStats/{YYYY-MM-DD} (Admin > Search insights) for the days
 * before live search logging, from the website's request logs.
 *
 * Live logging (POST /api/analytics/search) only exists from the website and
 * app releases that carry it. Before that, nothing stored searches; the only
 * record is Cloud Run's request log of GET /api/marketplace/products?search=…,
 * which Cloud Logging keeps for 30 days. Export it first (see
 * KrishiDukaan-V2/docs or the session notes) into a JSON array of
 *   { t: ISO time, q: search text, more: true for "load more" pages,
 *     v: one-way hash of IP + user agent, bot: boolean }
 *
 * What it can and cannot recover:
 *   - Website searches only. The app reads products straight from Firestore,
 *     so its searches never reached the server.
 *   - Search terms and counts. NOT whether a search found results, nor where
 *     the shopper was: those fields stay empty rather than guessed.
 *   - The old website asked the server while the shopper typed ("po", "pow",
 *     "power pl"), and behind Hosting one shopper's IP can change between
 *     requests. A search is dropped when the same visitor replaced or extended
 *     it within 60s, or anyone did within 20s; a leftover partial word is
 *     credited to the full word searched soon after (same visitor within 30
 *     minutes, anyone within 2); a 2-3 letter term that starts a longer search
 *     that day is dropped unless it is a whole word in a product name ("dap").
 *     Live logging only records a search once it settles, so this matches it.
 *
 * Writes only days that have no live data: a day doc is (re)written only when
 * it does not exist or was itself written by this script (backfilled: true),
 * and never on or after --until (default: the first day with live data, else
 * today, IST). Safe to re-run.
 *
 *   npx tsx scripts/backfill-search-stats-from-logs.ts --project krishidukan-e8315 --input <file.json>           # preview
 *   npx tsx scripts/backfill-search-stats-from-logs.ts --project krishidukan-e8315 --input <file.json> --write   # apply
 */
import * as admin from "firebase-admin";
import { readFileSync } from "fs";

type LogRow = { t: string; q: string; more?: boolean; v: string; bot?: boolean };

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const project = arg("--project");
const input = arg("--input");
const write = args.includes("--write");
if (!project || !input) {
  console.error("Usage: --project <id> --input <extract.json> [--until YYYY-MM-DD] [--write]");
  process.exit(1);
}

admin.initializeApp({ projectId: project });
const db = admin.firestore();

// Same normalisation as app/api/analytics/search/route.ts (normalizeTerm).
const MAX_TERM = 60;
const NOT_TERM_CHAR = new RegExp("[^\\p{L}\\p{M}\\p{N}\\s]+", "gu");
function normalizeTerm(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFC")
    .replace(/[.'’]/g, "")
    .replace(NOT_TERM_CHAR, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TERM)
    .trim();
}

const istDay = (ms: number) => new Date(ms + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const REPLACED_WITHIN_MS = 60_000;
const COMPLETED_WITHIN_MS = 30 * 60_000;

/** True when `next` is a continuation or correction of `cur` (typing on, fixing a typo). */
function continues(cur: string, next: string): boolean {
  if (next === cur) return true;
  if (next.startsWith(cur) || cur.startsWith(next)) return true;
  // A typo fixed mid-word: same first three letters, similar length.
  return cur.length >= 3 && next.slice(0, 3) === cur.slice(0, 3) && Math.abs(next.length - cur.length) <= 3;
}

const ANYONE_REPLACED_WITHIN_MS = 20_000;
const ANYONE_COMPLETED_WITHIN_MS = 2 * 60_000;

type Search = { ms: number; term: string; v: string };

function settledSearches(rows: LogRow[], catalogWords: Set<string>): { day: string; term: string }[] {
  const all: Search[] = [];
  for (const r of rows) {
    if (r.more || r.bot) continue;
    const term = normalizeTerm(String(r.q ?? ""));
    if (term.length < 2) continue;
    all.push({ ms: Date.parse(r.t), term, v: r.v });
  }
  all.sort((a, b) => a.ms - b.ms);

  // 1. Drop what was typed on or corrected soon after.
  const kept = all.filter((cur, i) => {
    for (let k = i + 1; k < all.length && all[k].ms - cur.ms <= REPLACED_WITHIN_MS; k++) {
      const next = all[k];
      const window = next.v === cur.v ? REPLACED_WITHIN_MS : ANYONE_REPLACED_WITHIN_MS;
      if (next.ms - cur.ms <= window && next.term !== cur.term && continues(cur.term, next.term)) return false;
      if (next.v === cur.v && next.term === cur.term) return false;
    }
    return true;
  });

  // 2. Credit a partial word to the full word searched soon after.
  const credited = kept.map((cur) => {
    const full = kept.find((o) =>
      o !== cur && o.ms >= cur.ms && o.term.length > cur.term.length && o.term.startsWith(cur.term) &&
      o.ms - cur.ms <= (o.v === cur.v ? COMPLETED_WITHIN_MS : ANYONE_COMPLETED_WITHIN_MS));
    return { ms: cur.ms, term: full ? full.term : cur.term };
  });

  // 3. Short fragments that start a longer search that day.
  const longerByDay = new Map<string, string[]>();
  for (const c of credited) {
    const day = istDay(c.ms);
    const list = longerByDay.get(day) ?? [];
    list.push(c.term);
    longerByDay.set(day, list);
  }
  return credited
    .filter((c) => {
      if (c.term.length > 3 || catalogWords.has(c.term)) return true;
      const day = longerByDay.get(istDay(c.ms)) ?? [];
      return !day.some((t) => t.length > c.term.length && t.startsWith(c.term));
    })
    .map((c) => ({ day: istDay(c.ms), term: c.term }));
}

/** Every word in a product name, from the marketplace cards. */
async function loadCatalogWords(): Promise<Set<string>> {
  const snap = await db.collection("marketplaceCards").select("nameKey").get();
  const words = new Set<string>();
  for (const d of snap.docs) {
    for (const w of normalizeTerm(String(d.get("nameKey") ?? "")).split(" ")) if (w.length >= 2) words.add(w);
  }
  return words;
}

(async () => {
  const rows = JSON.parse(readFileSync(input, "utf8")) as LogRow[];
  const searches = settledSearches(rows, await loadCatalogWords());

  const existing = await db.collection("searchStats").get();
  const liveDays = existing.docs.filter((d) => d.get("backfilled") !== true).map((d) => d.id).sort();
  const until = arg("--until") ?? liveDays[0] ?? istDay(Date.now());

  const days = new Map<string, Map<string, number>>();
  for (const s of searches) {
    if (s.day >= until) continue;
    const terms = days.get(s.day) ?? new Map<string, number>();
    terms.set(s.term, (terms.get(s.term) ?? 0) + 1);
    days.set(s.day, terms);
  }

  const blocked = new Set(liveDays);
  const plan = [...days.entries()].filter(([day]) => !blocked.has(day)).sort(([a], [b]) => a.localeCompare(b));
  const total = plan.reduce((n, [, t]) => n + [...t.values()].reduce((a, b) => a + b, 0), 0);
  console.log(`${write ? "Writing" : "Preview (dry run)"} for ${project}: log requests ${rows.length}, settled searches ${searches.length}, days ${plan.length} (before ${until}), searches written ${total}`);
  for (const [day, terms] of plan) {
    const top = [...terms.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t, n]) => `${t} ${n}`).join(", ");
    console.log(`  ${day}  ${[...terms.values()].reduce((a, b) => a + b, 0)} searches  | ${top}`);
  }
  if (!write) {
    console.log("Re-run with --write to apply.");
    return;
  }
  for (let i = 0; i < plan.length; i += 400) {
    const batch = db.batch();
    for (const [day, terms] of plan.slice(i, i + 400)) {
      const count = [...terms.values()].reduce((a, b) => a + b, 0);
      batch.set(db.collection("searchStats").doc(day), {
        date: day,
        total: count,
        sources: { web: count },
        terms: Object.fromEntries(terms),
        backfilled: true,
        backfillSource: "cloud-run-request-logs",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }
  console.log(`Wrote ${plan.length} day docs.`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
