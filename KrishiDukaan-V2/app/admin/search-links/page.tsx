"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { collection, doc, documentId, getDoc, getDocs, query, where } from "firebase/firestore";
import { Link2, Link2Off, RefreshCw, Search, SearchX, EyeOff, Eye, Plus, X, Package } from "lucide-react";
import { auth, db } from "../../firebase";
import {
  IGNORED_DOC,
  LINKS_COLLECTION,
  LINK_SETTINGS_COLLECTION,
  groupSimilarSearches,
  linkSearches,
  looksLikeProduct,
  normalizeSearchTerm,
  setIgnored,
  unlinkSearches,
  type SearchLink,
  type SimilarGroup,
  type TermStat,
} from "../../lib/search-links";

/**
 * Admin > Search links: tie what farmers type to the product they mean, so
 * the same search finds it next time on the website and the app.
 *
 * "Not linked yet" groups the searches from searchStats (same daily docs as
 * Search insights) by similar spelling, with the products today's search
 * finds for them. "Linked" lists each product's linked searches plus similar
 * searches not linked to it yet.
 */

type ProductHit = { id: string; name: string; category: string; image: string };

const RANGES = [30, 90] as const;

function istDayKey(offsetDays = 0): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000 - offsetDays * 86400 * 1000).toISOString().slice(0, 10);
}

async function findProducts(q: string, pageSize = 5): Promise<ProductHit[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const res = await fetch(`/api/marketplace/products?suggest=1&pageSize=${pageSize}&search=${encodeURIComponent(term)}`);
  if (!res.ok) return [];
  const body = await res.json();
  return ((body.products ?? []) as Array<Record<string, unknown>>).map((p) => ({
    id: String(p.id ?? ""),
    name: String(p.name ?? ""),
    category: String(p.category ?? ""),
    image: String((Array.isArray(p.images) && p.images[0]) || p.image || ""),
  })).filter((p) => p.name);
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

function Chip({ term, count, onRemove, onAdd, muted, checked, onToggle }: {
  term: string;
  count?: number;
  onRemove?: () => void;
  onAdd?: () => void;
  muted?: boolean;
  checked?: boolean;
  onToggle?: () => void;
}) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${
      muted ? "border-outline-variant/50 text-on-surface-variant" : "border-primary/30 bg-primary/5 text-on-surface"
    } ${onToggle && !checked ? "opacity-50 line-through" : ""}`}>
      {onToggle ? (
        <button type="button" onClick={onToggle} title={checked ? "Leave this one out" : "Include this one"}>{term}</button>
      ) : term}
      {count !== undefined && <span className="tabular-nums text-on-surface-variant">· {count}</span>}
      {onAdd && (
        <button type="button" onClick={onAdd} title="Link this search too" className="ml-0.5 rounded-full hover:bg-primary/10">
          <Plus className="h-3.5 w-3.5" />
        </button>
      )}
      {onRemove && (
        <button type="button" onClick={onRemove} title="Unlink this search" className="ml-0.5 rounded-full hover:bg-red-100">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </span>
  );
}

/** Pick a product for some searches: today's search results first, or search for one. */
function ProductPicker({ terms, initialQuery, onPick, onClose }: {
  terms: string[];
  initialQuery: string;
  onPick: (productName: string) => Promise<void>;
  onClose: () => void;
}) {
  const [q, setQ] = useState(initialQuery);
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    const t = setTimeout(() => {
      findProducts(q, 10).then((h) => { if (live) setHits(h); }).finally(() => { if (live) setLoading(false); });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [q]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-3xl bg-surface-container-lowest p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-black text-on-surface">Link to a product</h2>
            <p className="mt-0.5 text-xs text-on-surface-variant truncate">
              {terms.length === 1 ? `“${terms[0]}”` : `${terms.length} searches: ${terms.slice(0, 4).join(", ")}${terms.length > 4 ? "…" : ""}`}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-container" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-outline-variant px-3 py-2">
          <Search className="h-4 w-4 text-on-surface-variant" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a product by name"
            className="w-full bg-transparent text-sm outline-none" />
        </div>
        <ul className="mt-3 max-h-80 overflow-y-auto divide-y divide-outline-variant/30">
          {loading && hits.length === 0 && <li className="py-6 text-center text-sm text-on-surface-variant">Searching…</li>}
          {!loading && hits.length === 0 && (
            <li className="py-6 text-center text-sm text-on-surface-variant">No product found. Try its name or brand.</li>
          )}
          {hits.map((p) => (
            <li key={p.id}>
              <button type="button" disabled={saving !== null}
                onClick={async () => { setSaving(p.name); try { await onPick(p.name); } finally { setSaving(null); } }}
                className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-surface-container rounded-lg px-1 disabled:opacity-60">
                {p.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image} alt="" className="h-10 w-10 rounded-lg object-cover bg-surface-container" />
                ) : (
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-container"><Package className="h-4 w-4" /></span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-on-surface">{p.name}</span>
                  <span className="block truncate text-xs text-on-surface-variant">{p.category}</span>
                </span>
                <span className="text-xs font-bold text-primary">{saving === p.name ? "Linking…" : "Link"}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** One group of similar unlinked searches. */
function GroupRow({ group, onLink, onIgnore }: {
  group: SimilarGroup;
  onLink: (terms: string[], productName?: string) => void;
  onIgnore: (terms: string[]) => void;
}) {
  const [left, setLeft] = useState<Set<string>>(new Set());
  const [found, setFound] = useState<ProductHit[] | null>(null);
  const chosen = group.members.map((m) => m.term).filter((t) => !left.has(t));

  useEffect(() => {
    let live = true;
    findProducts(group.head, 3).then((h) => { if (live) setFound(h); }).catch(() => { if (live) setFound([]); });
    return () => { live = false; };
  }, [group.head]);

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-black text-on-surface">{group.head}</p>
        <p className="text-xs text-on-surface-variant tabular-nums">
          {group.searches.toLocaleString("en-IN")} searches
          {group.noResults > 0 && <span className="text-red-700"> · {group.noResults.toLocaleString("en-IN")} found nothing</span>}
        </p>
      </div>
      {group.members.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {group.members.map((m) => (
            <Chip key={m.term} term={m.term} count={m.searches} checked={!left.has(m.term)}
              onToggle={() => setLeft((s) => { const n = new Set(s); if (n.has(m.term)) n.delete(m.term); else n.add(m.term); return n; })} />
          ))}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-on-surface-variant">Search shows now:</span>
        {found === null ? (
          <span className="text-xs text-on-surface-variant">…</span>
        ) : found.length === 0 ? (
          <span className="text-xs font-semibold text-red-700">nothing</span>
        ) : (
          found.map((p) => (
            <button key={p.id} type="button" disabled={chosen.length === 0} onClick={() => onLink(chosen, p.name)}
              title={`Link ${chosen.length} search${chosen.length === 1 ? "" : "es"} to ${p.name}`}
              className="inline-flex items-center gap-1 rounded-lg border border-outline-variant px-2 py-1 text-xs font-bold hover:border-primary hover:text-primary disabled:opacity-50">
              <Link2 className="h-3.5 w-3.5" /> {p.name}
            </button>
          ))
        )}
        <button type="button" disabled={chosen.length === 0} onClick={() => onLink(chosen)}
          className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-bold text-white disabled:opacity-50">
          <Search className="h-3.5 w-3.5" /> Choose product…
        </button>
        <button type="button" disabled={chosen.length === 0} onClick={() => onIgnore(chosen)}
          title="Hide these searches (junk, or something we will not sell)"
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-on-surface-variant hover:bg-surface-container disabled:opacity-50">
          <EyeOff className="h-3.5 w-3.5" /> Ignore
        </button>
      </div>
    </li>
  );
}

function SearchLinksPage() {
  const params = useSearchParams();
  const [range, setRange] = useState<(typeof RANGES)[number]>(90);
  const [tab, setTab] = useState<"unlinked" | "linked">("unlinked");
  const [onlyNothing, setOnlyNothing] = useState(true);
  const [showIgnored, setShowIgnored] = useState(false);
  const [filter, setFilter] = useState("");
  const [stats, setStats] = useState<Map<string, TermStat>>(new Map());
  const [links, setLinks] = useState<SearchLink[]>([]);
  const [ignored, setIgnoredTerms] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ terms: string[]; query: string } | null>(null);
  const [addTo, setAddTo] = useState<Record<string, string>>({});

  const by = () => auth.currentUser?.email ?? auth.currentUser?.uid ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [daySnap, linkSnap, ignoredSnap] = await Promise.all([
        getDocs(query(collection(db, "searchStats"),
          where(documentId(), ">=", istDayKey(range - 1)), where(documentId(), "<=", istDayKey(0)))),
        getDocs(collection(db, LINKS_COLLECTION)),
        getDoc(doc(db, LINK_SETTINGS_COLLECTION, IGNORED_DOC)),
      ]);
      const m = new Map<string, TermStat>();
      for (const d of daySnap.docs) {
        const terms = (d.get("terms") ?? {}) as Record<string, number>;
        const zero = (d.get("zeroResults") ?? {}) as Record<string, number>;
        for (const [term, n] of Object.entries(terms)) {
          const s = m.get(term) ?? { term, searches: 0, noResults: 0 };
          s.searches += Number(n) || 0;
          s.noResults += Number(zero[term]) || 0;
          m.set(term, s);
        }
      }
      setStats(m);
      setLinks(linkSnap.docs.map((d) => ({
        cardId: d.id,
        nameKey: String(d.get("nameKey") ?? ""),
        productName: String(d.get("productName") ?? d.get("nameKey") ?? ""),
        terms: ((d.get("terms") ?? []) as string[]).slice().sort(),
      })).filter((l) => l.terms.length > 0).sort((a, b) => a.productName.localeCompare(b.productName)));
      setIgnoredTerms(new Set((ignoredSnap.get("terms") ?? []) as string[]));
    } catch (err) {
      console.error(err);
      setError("Could not load search links. Check that you have the Analytics permission.");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { void load(); }, [load]);

  // Opened from Search insights with ?term=…: start linking that search.
  useEffect(() => {
    const term = normalizeSearchTerm(params.get("term"));
    if (term) setPicker({ terms: [term], query: term });
  }, [params]);

  const linkedTo = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const l of links) for (const t of l.terms) m.set(t, [...(m.get(t) ?? []), l.productName]);
    return m;
  }, [links]);

  const groups = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const open = Array.from(stats.values()).filter((s) =>
      !linkedTo.has(s.term) &&
      ignored.has(s.term) === showIgnored &&
      (!onlyNothing || s.noResults > 0) &&
      s.term.length >= 2);
    return groupSimilarSearches(open)
      .filter((g) => !f || g.members.some((m) => m.term.includes(f)));
  }, [stats, linkedTo, ignored, showIgnored, onlyNothing, filter]);

  const linkedSearches = useMemo(() => {
    let n = 0;
    for (const t of Array.from(linkedTo.keys())) n += stats.get(t)?.searches ?? 0;
    return n;
  }, [linkedTo, stats]);
  const openNothing = useMemo(
    () => Array.from(stats.values()).filter((s) => !linkedTo.has(s.term) && !ignored.has(s.term))
      .reduce((n, s) => n + s.noResults, 0),
    [stats, linkedTo, ignored],
  );

  const doLink = async (terms: string[], productName: string) => {
    await linkSearches(db, productName, terms, by());
    setPicker(null);
    setNotice(`Linked ${terms.length} search${terms.length === 1 ? "" : "es"} to ${productName}. Search picks it up within a minute or two.`);
    await load();
  };

  const startLink = (terms: string[], productName?: string) => {
    if (productName) void doLink(terms, productName).catch((e) => setError(`Could not link: ${String(e)}`));
    else setPicker({ terms, query: terms[0] ?? "" });
  };

  const doIgnore = async (terms: string[], ignore: boolean) => {
    try {
      await setIgnored(db, terms, ignore);
      setNotice(ignore ? `Hid ${terms.length} search${terms.length === 1 ? "" : "es"}.` : "Shown again.");
      await load();
    } catch (e) {
      setError(`Could not update: ${String(e)}`);
    }
  };

  const doUnlink = async (link: SearchLink, terms: string[]) => {
    try {
      await unlinkSearches(db, link.cardId, terms, by());
      setNotice(terms.length === 1 ? `Unlinked “${terms[0]}” from ${link.productName}.` : `Unlinked every search from ${link.productName}.`);
      await load();
    } catch (e) {
      setError(`Could not unlink: ${String(e)}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link2 className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-black text-on-surface">Search links</h1>
          </div>
          <p className="text-sm text-on-surface-variant ml-9 max-w-3xl">
            Tie what farmers type to the product they mean. A linked search always finds its product on the
            website and the app, whatever the spelling. Similar spellings are grouped so you can link them together.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex rounded-xl border border-outline-variant p-1">
            {RANGES.map((r) => (
              <button key={r} onClick={() => setRange(r)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${range === r ? "bg-primary text-white" : "text-on-surface-variant hover:bg-surface-container"}`}>
                {r} days
              </button>
            ))}
          </div>
          <button onClick={() => void load()} disabled={loading} title="Refresh"
            className="p-2.5 rounded-xl border border-outline-variant hover:bg-surface-container disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <Link href="/admin/search-insights" className="text-sm font-bold px-3 py-2 rounded-xl border border-outline-variant hover:bg-surface-container">
            Search insights
          </Link>
        </div>
      </div>

      {error && <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-sm font-semibold">{error}</div>}
      {notice && (
        <div className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-green-50 border border-green-200 text-green-900 text-sm font-semibold">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Tile label="Products with links" value={links.length.toLocaleString("en-IN")} />
        <Tile label="Linked searches" value={linkedTo.size.toLocaleString("en-IN")}
          hint={`${linkedSearches.toLocaleString("en-IN")} searches in ${range} days`} />
        <Tile label="Not linked, found nothing" value={openNothing.toLocaleString("en-IN")}
          hint={`searches in ${range} days`} />
        <Tile label="Ignored" value={ignored.size.toLocaleString("en-IN")} hint="hidden searches" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-outline-variant p-1">
          {([["unlinked", "Not linked yet"], ["linked", "Linked to products"]] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg ${tab === key ? "bg-primary text-white" : "text-on-surface-variant hover:bg-surface-container"}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-outline-variant px-3 py-1.5">
          <Search className="h-4 w-4 text-on-surface-variant" />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={tab === "linked" ? "Filter products or searches" : "Filter searches"}
            className="w-48 bg-transparent text-sm outline-none" />
        </div>
        {tab === "unlinked" && (
          <>
            <label className="flex items-center gap-2 text-xs font-bold text-on-surface-variant">
              <input type="checkbox" checked={onlyNothing} onChange={(e) => setOnlyNothing(e.target.checked)} />
              Only searches that found nothing
            </label>
            <label className="flex items-center gap-2 text-xs font-bold text-on-surface-variant">
              <input type="checkbox" checked={showIgnored} onChange={(e) => setShowIgnored(e.target.checked)} />
              Show ignored
            </label>
          </>
        )}
      </div>

      {loading ? (
        <div className="flex h-60 items-center justify-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tab === "unlinked" ? (
        <section className="rounded-3xl border border-outline-variant/30 bg-surface-container-lowest p-5">
          <div className="flex items-center gap-2 mb-1">
            <SearchX className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-black text-on-surface">{showIgnored ? "Ignored searches" : "Searches not linked yet"}</h2>
          </div>
          <p className="text-xs text-on-surface-variant">
            Similar spellings are grouped; tap a spelling to leave it out. Link the group to one of the products search
            shows now, or choose another. Most-searched first.
          </p>
          {groups.length === 0 ? (
            <p className="py-10 text-center text-sm text-on-surface-variant">Nothing left to link in this period.</p>
          ) : showIgnored ? (
            <ul className="mt-2 divide-y divide-outline-variant/30">
              {groups.slice(0, 100).map((g) => (
                <li key={g.head} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {g.members.map((m) => <Chip key={m.term} term={m.term} count={m.searches} muted />)}
                  </div>
                  <button type="button" onClick={() => void doIgnore(g.members.map((m) => m.term), false)}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-on-surface-variant hover:bg-surface-container">
                    <Eye className="h-3.5 w-3.5" /> Show again
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="mt-2 divide-y divide-outline-variant/30">
              {groups.slice(0, 60).map((g) => (
                <GroupRow key={g.head} group={g} onLink={startLink} onIgnore={(t) => void doIgnore(t, true)} />
              ))}
            </ul>
          )}
          {groups.length > 60 && !showIgnored && (
            <p className="pt-3 text-center text-xs text-on-surface-variant">Showing the 60 most-searched of {groups.length} groups. Filter to find others.</p>
          )}
        </section>
      ) : (
        <section className="rounded-3xl border border-outline-variant/30 bg-surface-container-lowest p-5">
          <div className="flex items-center gap-2 mb-1">
            <Link2 className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-black text-on-surface">Searches linked to products</h2>
          </div>
          <p className="text-xs text-on-surface-variant">
            Each product with the searches linked to it (and how often they were searched), plus similar searches
            not linked to it yet. Add one with +, remove one with ×.
          </p>
          {links.length === 0 ? (
            <p className="py-10 text-center text-sm text-on-surface-variant">No searches linked yet. Start from “Not linked yet”.</p>
          ) : (
            <ul className="mt-2 divide-y divide-outline-variant/30">
              {links
                .filter((l) => {
                  const f = filter.trim().toLowerCase();
                  return !f || l.productName.toLowerCase().includes(f) || l.terms.some((t) => t.includes(f));
                })
                .map((l) => {
                  const total = l.terms.reduce((n, t) => n + (stats.get(t)?.searches ?? 0), 0);
                  const similar = Array.from(stats.values())
                    .filter((s) => !linkedTo.has(s.term) && !ignored.has(s.term) && looksLikeProduct(s.term, l.productName, l.terms))
                    .sort((a, b) => b.searches - a.searches)
                    .slice(0, 15);
                  const draft = addTo[l.cardId] ?? "";
                  return (
                    <li key={l.cardId} className="py-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-black text-on-surface">{l.productName}</p>
                        <p className="text-xs text-on-surface-variant tabular-nums">
                          {l.terms.length} linked · {total.toLocaleString("en-IN")} searches in {range} days
                        </p>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {l.terms.map((t) => (
                          <Chip key={t} term={t} count={stats.get(t)?.searches ?? 0} onRemove={() => void doUnlink(l, [t])} />
                        ))}
                      </div>
                      {similar.length > 0 && (
                        <div className="mt-3">
                          <p className="text-[11px] font-black uppercase tracking-widest text-on-surface-variant mb-1.5">Similar searches, not linked</p>
                          <div className="flex flex-wrap gap-1.5">
                            {similar.map((s) => (
                              <Chip key={s.term} term={s.term} count={s.searches} muted
                                onAdd={() => void doLink([s.term], l.productName).catch((e) => setError(`Could not link: ${String(e)}`))} />
                            ))}
                          </div>
                        </div>
                      )}
                      <form className="mt-3 flex items-center gap-2" onSubmit={(e) => {
                        e.preventDefault();
                        const term = normalizeSearchTerm(draft);
                        if (term.length < 2) return;
                        setAddTo((m) => ({ ...m, [l.cardId]: "" }));
                        void doLink([term], l.productName).catch((err) => setError(`Could not link: ${String(err)}`));
                      }}>
                        <input value={draft} onChange={(e) => setAddTo((m) => ({ ...m, [l.cardId]: e.target.value }))}
                          placeholder="Add a search, e.g. a local name"
                          className="w-64 rounded-lg border border-outline-variant bg-transparent px-2.5 py-1 text-xs outline-none focus:border-primary" />
                        <button type="submit" disabled={normalizeSearchTerm(draft).length < 2}
                          className="inline-flex items-center gap-1 rounded-lg border border-outline-variant px-2 py-1 text-xs font-bold hover:border-primary disabled:opacity-50">
                          <Plus className="h-3.5 w-3.5" /> Add
                        </button>
                        <button type="button" title="Unlink every search from this product"
                          onClick={() => void doUnlink(l, l.terms)}
                          className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-on-surface-variant hover:bg-red-50 hover:text-red-700">
                          <Link2Off className="h-3.5 w-3.5" /> Unlink all
                        </button>
                      </form>
                    </li>
                  );
                })}
            </ul>
          )}
        </section>
      )}

      {picker && (
        <ProductPicker terms={picker.terms} initialQuery={picker.query} onClose={() => setPicker(null)}
          onPick={(name) => doLink(picker.terms, name).catch((e) => setError(`Could not link: ${String(e)}`))} />
      )}
    </div>
  );
}

export default function AdminSearchLinksPage() {
  return (
    <Suspense fallback={null}>
      <SearchLinksPage />
    </Suspense>
  );
}
