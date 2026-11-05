"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, documentId, getDocs, query, where } from "firebase/firestore";
import { Search, RefreshCw, Download, SearchX, LayoutGrid, MapPin, Package } from "lucide-react";
import { db } from "../../firebase";

/**
 * Admin > Search insights: what shoppers search for and browse, from the
 * daily aggregate docs searchStats/{YYYY-MM-DD} written by
 * /api/analytics/search. One read per day in range (≤ 90). Picking a state
 * re-slices the same docs (no extra reads).
 */

type Nested = Record<string, Record<string, number>>;

type DayDoc = {
  date: string;
  total?: number;
  zeroTotal?: number;
  categoryTotal?: number;
  sources?: Record<string, number>;
  terms?: Record<string, number>;
  zeroResults?: Record<string, number>;
  categories?: Record<string, number>;
  /** Main product category of each search's results. */
  termCategories?: Record<string, number>;
  /** Searches whose shopper's location was known. */
  locatedTotal?: number;
  states?: Record<string, number>;
  stateTerms?: Nested;
  stateZero?: Nested;
  stateCategories?: Nested;
  stateDistricts?: Nested;
  stateBrowse?: Nested;
};

const ALL = "";

const RANGES = [7, 30, 90] as const;
const TOP_N = 25;

function istDayKey(offsetDays = 0): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000 - offsetDays * 86400 * 1000).toISOString().slice(0, 10);
}

function addInto(target: Map<string, number>, src: Record<string, number> | undefined) {
  if (!src) return;
  for (const [k, v] of Object.entries(src)) target.set(k, (target.get(k) ?? 0) + (Number(v) || 0));
}

function addNested(target: Map<string, Map<string, number>>, src: Nested | undefined) {
  if (!src) return;
  for (const [outer, inner] of Object.entries(src)) {
    const m = target.get(outer) ?? new Map<string, number>();
    addInto(m, inner);
    target.set(outer, m);
  }
}

const EMPTY = new Map<string, number>();

function top(map: Map<string, number>, n = TOP_N): [string, number][] {
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, n);
}

function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5">
      <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant">{label}</p>
      <p className="mt-1 text-3xl font-black text-on-surface">{value}</p>
      {hint && <p className="mt-1 text-xs text-on-surface-variant">{hint}</p>}
    </div>
  );
}

function RankedList({ title, icon: Icon, rows, empty, note, onSelect, extra }: {
  title: string;
  icon: typeof Search;
  rows: [string, number][];
  empty: string;
  note?: string;
  /** Makes each row a button (e.g. pick that state). */
  onSelect?: (key: string) => void;
  /** Small text under a row's name (e.g. a state's top product). */
  extra?: (key: string) => string | undefined;
}) {
  const max = rows[0]?.[1] ?? 1;
  return (
    <section className="rounded-3xl border border-outline-variant/30 bg-surface-container-lowest p-5">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-black text-on-surface">{title}</h2>
      </div>
      {note && <p className="text-xs text-on-surface-variant mb-3">{note}</p>}
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-on-surface-variant">{empty}</p>
      ) : (
        <ol className="space-y-1.5 mt-3">
          {rows.map(([term, count], i) => {
            const sub = extra?.(term);
            const row = (
              <>
                <span className="text-xs text-on-surface-variant tabular-nums">{i + 1}</span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-on-surface">{term}</span>
                  {sub && <span className="block truncate text-[11px] text-on-surface-variant">{sub}</span>}
                </span>
                <span className="h-2 rounded-r bg-surface-container">
                  <span className="block h-2 rounded-r bg-primary" style={{ width: `${Math.max(4, (count / max) * 100)}%` }} />
                </span>
                <span className="text-right tabular-nums text-on-surface-variant">{count.toLocaleString("en-IN")}</span>
              </>
            );
            const grid = "grid grid-cols-[1.5rem_minmax(0,9rem)_1fr_3rem] items-center gap-2 text-sm";
            return (
              <li key={term} title={`${term}: ${count}`}>
                {onSelect ? (
                  <button type="button" onClick={() => onSelect(term)}
                    className={`${grid} w-full text-left rounded-lg px-1 -mx-1 py-0.5 hover:bg-surface-container`}>
                    {row}
                  </button>
                ) : (
                  <div className={grid}>{row}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

export default function AdminSearchInsightsPage() {
  const [range, setRange] = useState<(typeof RANGES)[number]>(30);
  const [region, setRegion] = useState<string>(ALL);
  const [days, setDays] = useState<DayDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    const q = query(
      collection(db, "searchStats"),
      where(documentId(), ">=", istDayKey(range - 1)),
      where(documentId(), "<=", istDayKey(0)),
    );
    getDocs(q)
      .then(snap => setDays(snap.docs.map(d => ({ date: d.id, ...(d.data() as Omit<DayDoc, "date">) }))))
      .catch(err => {
        console.error(err);
        setError("Could not load search data. Check that you have the Analytics permission.");
      })
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [range]);

  // All of India, summed over the range.
  const agg = useMemo(() => {
    const terms = new Map<string, number>();
    const zero = new Map<string, number>();
    const cats = new Map<string, number>();
    const termCats = new Map<string, number>();
    const sources = new Map<string, number>();
    const states = new Map<string, number>();
    const stateTerms = new Map<string, Map<string, number>>();
    const stateZero = new Map<string, Map<string, number>>();
    const stateCats = new Map<string, Map<string, number>>();
    const stateDistricts = new Map<string, Map<string, number>>();
    const stateBrowse = new Map<string, Map<string, number>>();
    let total = 0, zeroTotal = 0, categoryTotal = 0, locatedTotal = 0;
    for (const d of days) {
      total += d.total ?? 0;
      zeroTotal += d.zeroTotal ?? 0;
      categoryTotal += d.categoryTotal ?? 0;
      locatedTotal += d.locatedTotal ?? 0;
      addInto(terms, d.terms);
      addInto(zero, d.zeroResults);
      addInto(cats, d.categories);
      addInto(termCats, d.termCategories);
      addInto(sources, d.sources);
      addInto(states, d.states);
      addNested(stateTerms, d.stateTerms);
      addNested(stateZero, d.stateZero);
      addNested(stateCats, d.stateCategories);
      addNested(stateDistricts, d.stateDistricts);
      addNested(stateBrowse, d.stateBrowse);
    }
    return {
      terms, zero, cats, termCats, sources, states, stateTerms, stateZero, stateCats, stateDistricts, stateBrowse,
      total, zeroTotal, categoryTotal, locatedTotal,
    };
  }, [days]);

  // What the lists show: all of India, or the picked state.
  const view = useMemo(() => {
    const sum = (m: Map<string, number>) => Array.from(m.values()).reduce((a, b) => a + b, 0);
    const perDay = (d: DayDoc) => (region ? d.states?.[region] ?? 0 : d.total ?? 0);
    const byDay = new Map(days.map(d => [d.date, perDay(d)]));
    const daily = Array.from({ length: range }, (_, i) => {
      const key = istDayKey(range - 1 - i);
      return { day: key, count: byDay.get(key) ?? 0 };
    });
    if (!region) {
      return {
        terms: agg.terms, zero: agg.zero, termCats: agg.termCats, browse: agg.cats,
        total: agg.total, zeroTotal: agg.zeroTotal, browseTotal: agg.categoryTotal, daily,
      };
    }
    const zero = agg.stateZero.get(region) ?? EMPTY;
    const browse = agg.stateBrowse.get(region) ?? EMPTY;
    return {
      terms: agg.stateTerms.get(region) ?? EMPTY,
      zero,
      termCats: agg.stateCats.get(region) ?? EMPTY,
      browse,
      total: agg.states.get(region) ?? 0,
      zeroTotal: sum(zero),
      browseTotal: sum(browse),
      daily,
    };
  }, [agg, days, range, region]);

  const stateRows = top(agg.states, 40);
  const topOf = (m: Map<string, number> | undefined) => (m ? top(m, 1)[0]?.[0] : undefined);
  const topTerms = top(view.terms);
  const topZero = top(view.zero);
  const topTermCats = top(view.termCats, 15);
  const topBrowse = top(view.browse, 15);
  const topDistricts = region ? top(agg.stateDistricts.get(region) ?? EMPTY, 30) : [];
  const dailyMax = Math.max(1, ...view.daily.map(d => d.count));
  const pct = (n: number, of = agg.total) => (of ? `${Math.round((n / of) * 100)}%` : "—");
  const place = region || "India";

  const exportCsv = () => {
    const rows: (string | number)[][] = [["region", "term", "searches", "searches_with_no_results"]];
    const add = (label: string, terms: Map<string, number>, zero: Map<string, number>) => {
      for (const [t, c] of Array.from(terms.entries()).sort((a, b) => b[1] - a[1])) rows.push([label, t, c, zero.get(t) ?? 0]);
    };
    if (region) {
      add(region, view.terms, view.zero);
    } else {
      add("All India", agg.terms, agg.zero);
      for (const [st] of stateRows) add(st, agg.stateTerms.get(st) ?? EMPTY, agg.stateZero.get(st) ?? EMPTY);
    }
    downloadCsv(`search-terms-${region ? region.replace(/\W+/g, "-").toLowerCase() + "-" : ""}${range}d.csv`, rows);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Search className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-black text-on-surface">Search insights</h1>
          </div>
          <p className="text-sm text-on-surface-variant ml-9">
            What farmers and shoppers search for and browse on the website and app, and where they are. A search counts once it settles, once per visitor session.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex rounded-xl border border-outline-variant p-1">
            {RANGES.map(r => (
              <button key={r} onClick={() => setRange(r)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${range === r ? "bg-primary text-white" : "text-on-surface-variant hover:bg-surface-container"}`}>
                {r} days
              </button>
            ))}
          </div>
          <select value={region} onChange={e => setRegion(e.target.value)} aria-label="Region"
            className="rounded-xl border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm font-bold text-on-surface max-w-[11rem]">
            <option value={ALL}>All India</option>
            {/* Keep a picked state listed even if the new range has none. */}
            {(region && !agg.states.has(region) ? [[region, 0] as [string, number], ...stateRows] : stateRows).map(([st, n]) => (
              <option key={st} value={st}>{st} ({n.toLocaleString("en-IN")})</option>
            ))}
          </select>
          <button onClick={load} disabled={loading} title="Refresh"
            className="p-2.5 rounded-xl border border-outline-variant hover:bg-surface-container disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={exportCsv}
            disabled={view.terms.size === 0}
            className="flex items-center gap-2 border border-outline-variant text-sm font-bold px-3 py-2 rounded-xl hover:bg-surface-container disabled:opacity-50">
            <Download className="h-4 w-4" /> CSV
          </button>
        </div>
      </div>

      {error && <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-sm font-semibold">{error}</div>}

      {loading ? (
        <div className="flex h-60 items-center justify-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {region ? (
              <Tile label={`Searches · ${region}`} value={view.total.toLocaleString("en-IN")}
                hint={`${pct(view.total, agg.locatedTotal)} of searches with a known location`} />
            ) : (
              <Tile label="Searches" value={agg.total.toLocaleString("en-IN")}
                hint={`Web ${pct(agg.sources.get("web") ?? 0)} · App ${pct(agg.sources.get("app") ?? 0)}`} />
            )}
            <Tile label="Unique terms" value={view.terms.size.toLocaleString("en-IN")} />
            <Tile label="No results" value={view.zeroTotal.toLocaleString("en-IN")}
              hint={`${pct(view.zeroTotal, view.total)} of searches found nothing`} />
            {region ? (
              <Tile label="Districts" value={topDistricts.length.toLocaleString("en-IN")}
                hint={topDistricts[0] ? `Most searches: ${topDistricts[0][0]}` : undefined} />
            ) : (
              <Tile label="Location known" value={pct(agg.locatedTotal)}
                hint={`${agg.locatedTotal.toLocaleString("en-IN")} searches from ${agg.states.size} states`} />
            )}
          </div>

          <section className="rounded-3xl border border-outline-variant/30 bg-surface-container-lowest p-5">
            <h2 className="text-sm font-black text-on-surface mb-4">Searches per day{region ? ` · ${region}` : ""}</h2>
            <div className="flex items-end gap-[2px] h-32" role="img" aria-label="Searches per day">
              {view.daily.map(d => (
                <div key={d.day} className="group relative flex-1 h-full flex items-end">
                  <div className="w-full rounded-t bg-primary/80 group-hover:bg-primary" style={{ height: `${(d.count / dailyMax) * 100}%`, minHeight: d.count ? 2 : 0 }} />
                  <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block whitespace-nowrap rounded-lg bg-on-surface px-2 py-1 text-[11px] font-bold text-white">
                    {d.day}: {d.count}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-on-surface-variant">
              <span>{view.daily[0]?.day}</span>
              <span>{view.daily[view.daily.length - 1]?.day}</span>
            </div>
          </section>

          {region ? (
            <RankedList title={`Districts in ${region}`} icon={MapPin} rows={topDistricts}
              note="Districts use 2011 census boundaries, so a newer district shows under the one it was carved from."
              empty="No district recorded yet." />
          ) : (
            <RankedList title="Searches by state" icon={MapPin} rows={stateRows}
              note="Where shoppers search from — only those who allowed location (web or app). Tap a state to see its searches."
              onSelect={setRegion}
              extra={st => {
                const term = topOf(agg.stateTerms.get(st));
                const cat = topOf(agg.stateCats.get(st));
                return [term && `Top: ${term}`, cat].filter(Boolean).join(" · ") || undefined;
              }}
              empty="No locations recorded yet. Locations are recorded from this update onwards." />
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <RankedList title={`Top searches · ${place}`} icon={Search} rows={topTerms}
              empty="No searches recorded in this period yet." />
            <RankedList title={`Searches with no results · ${place}`} icon={SearchX} rows={topZero}
              note="Products people want that the marketplace doesn't list yet — good candidates to source or onboard."
              empty="Every search found something." />
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <RankedList title={`Product categories searched · ${place}`} icon={Package} rows={topTermCats}
              note="The main category of what each search found, e.g. “urea” counts as Fertilizers."
              empty="No categorised searches yet. Recorded from this update onwards." />
            <RankedList title={`Categories browsed · ${place}`} icon={LayoutGrid} rows={topBrowse}
              note={region ? "Category taps from shoppers in this state." : undefined}
              empty="No category browsing recorded in this period yet." />
          </div>
        </>
      )}
    </div>
  );
}
