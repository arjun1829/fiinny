"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, orderBy, query, where } from "firebase/firestore";
import {
  Link2,
  Search,
  X,
  Loader2,
  Check,
  AlertTriangle,
  ImageIcon,
  Fingerprint,
  Unlink,
} from "lucide-react";
import { auth, db, adminLinkProductsToCanonical, adminUnlinkProductFromCanonical } from "../../firebase";
import { usePagedQuery, type PagedQuery } from "../_lib/use-paged-query";
import { LoadMore } from "../_components/load-more";
import { cn } from "../../dashboard/_lib/cn";
import {
  type IdentityRow,
  toIdentityRow,
  fetchIdentityDocById,
  fetchIdentityDocsByName,
  fetchIdentityDocsByOwner,
  fetchIdentityDocsByField,
  fetchIdentityDocsByCanonicalId,
  defaultAuthoritative,
} from "../_lib/product-identity";

type SearchMode = "name" | "id" | "owner" | "source";

const SOURCE_OPTIONS = [
  "manufacturer_inventory",
  "retailer_inventory",
  "retailer",
  "admin",
  "admin_assigned",
  "manufacturer_assigned",
  "retailer_inventory_copy",
];

function SourceBadge({ source, isCopy }: { source: string; isCopy: boolean }) {
  return (
    <span
      className={cn(
        "inline-block rounded-md px-2 py-0.5 text-xs font-medium",
        isCopy ? "bg-amber-100 text-amber-800" : "bg-surface-container-high text-on-surface-variant",
      )}
    >
      {source}
    </span>
  );
}

export default function ProductIdentityPage() {
  const [mode, setMode] = useState<SearchMode>("name");
  const [text, setText] = useState("");
  const [sourceBrowse, setSourceBrowse] = useState<string>("all");

  const [results, setResults] = useState<IdentityRow[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);

  // Every row the admin has seen (browse + search), so the link modal can render
  // selected docs even after the view changes.
  const [seen, setSeen] = useState<Map<string, IdentityRow>>(new Map());
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [linkOpen, setLinkOpen] = useState(false);
  const [authoritativeId, setAuthoritativeId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const [inspectId, setInspectId] = useState<string | null>(null);
  const [inspectRows, setInspectRows] = useState<IdentityRow[]>([]);
  const [inspectLoading, setInspectLoading] = useState(false);

  // ── Browse (direct products read, paginated) ──────────────────────────────
  const browseQuery = useMemo(() => {
    const base = collection(db, "products");
    return sourceBrowse === "all"
      ? query(base, orderBy("name"))
      : query(base, where("source", "==", sourceBrowse), orderBy("name"));
  }, [sourceBrowse]);

  const remember = useCallback((rows: IdentityRow[]) => {
    setSeen((prev) => {
      const next = new Map(prev);
      for (const r of rows) next.set(r.id, r);
      return next;
    });
  }, []);

  const browse: PagedQuery<IdentityRow> = usePagedQuery(
    results === null ? browseQuery : null,
    (d) => {
      const row = toIdentityRow(d.id, d.data() as Record<string, any>);
      return row;
    },
    { pageSize: 40 },
  );

  // Keep `seen` in sync with whatever browse has loaded.
  useEffect(() => { remember(browse.rows); }, [browse.rows, remember]);

  const rows = results ?? browse.rows;

  // ── Search ────────────────────────────────────────────────────────────────
  const runSearch = useCallback(async () => {
    const q = text.trim();
    if (!q) {
      setResults(null);
      setSearchErr(null);
      return;
    }
    setSearching(true);
    setSearchErr(null);
    try {
      let found: IdentityRow[] = [];
      if (mode === "id") {
        const one = await fetchIdentityDocById(q);
        found = one ? [one] : [];
      } else if (mode === "name") {
        found = await fetchIdentityDocsByName(q);
      } else if (mode === "owner") {
        found = await fetchIdentityDocsByOwner(q);
      } else if (mode === "source") {
        found = await fetchIdentityDocsByField("source", q);
      }
      remember(found);
      setResults(found);
    } catch (e) {
      setSearchErr(e instanceof Error ? e.message : "Search failed.");
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [text, mode, remember]);

  const clearSearch = () => {
    setText("");
    setResults(null);
    setSearchErr(null);
  };

  // ── Selection ───────────────────────────────────────────────────────────────
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const selectedRows = useMemo(
    () => Array.from(selected).map((id) => seen.get(id)).filter((r): r is IdentityRow => !!r),
    [selected, seen],
  );

  const openLink = () => {
    const auth0 = defaultAuthoritative(selectedRows);
    setAuthoritativeId(auth0?.id ?? selectedRows[0]?.id ?? "");
    setActionErr(null);
    setLinkOpen(true);
  };

  // Does the selection span docs that already belong to different canonical
  // groups (or re-point an already-linked doc)? That is a group MERGE — flagged.
  const existingCanonicals = useMemo(
    () => Array.from(new Set(selectedRows.map((r) => r.canonicalId).filter(Boolean))),
    [selectedRows],
  );
  const selectionHasCopy = selectedRows.some((r) => r.isCopy);
  const isGroupMerge =
    existingCanonicals.length > 1 ||
    (existingCanonicals.length === 1 && !selectedRows.every((r) => r.canonicalId === existingCanonicals[0]));

  const confirmLink = async () => {
    setBusy(true);
    setActionErr(null);
    try {
      const uid = auth.currentUser?.uid ?? "admin";
      const ids = selectedRows.map((r) => r.id);
      const n = await adminLinkProductsToCanonical(ids, authoritativeId, uid);
      // Reflect the new canonicalId locally without a full refetch.
      setSeen((prev) => {
        const next = new Map(prev);
        for (const id of ids) {
          const r = next.get(id);
          if (r) next.set(id, { ...r, canonicalId: authoritativeId, canonicalLinkedBy: uid });
        }
        return next;
      });
      setResults((prev) =>
        prev
          ? prev.map((r) => (ids.includes(r.id) ? { ...r, canonicalId: authoritativeId, canonicalLinkedBy: uid } : r))
          : prev,
      );
      setSelected(new Set());
      setLinkOpen(false);
      setNotice(`Linked ${n} products under canonicalId ${authoritativeId}.`);
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Link failed.");
    } finally {
      setBusy(false);
    }
  };

  const openInspect = async (canonicalId: string) => {
    setInspectId(canonicalId);
    setInspectLoading(true);
    try {
      const members = await fetchIdentityDocsByCanonicalId(canonicalId);
      remember(members);
      setInspectRows(members);
    } catch {
      setInspectRows([]);
    } finally {
      setInspectLoading(false);
    }
  };

  const unlinkOne = async (id: string) => {
    setBusy(true);
    setActionErr(null);
    try {
      await adminUnlinkProductFromCanonical(id);
      setInspectRows((prev) => prev.filter((r) => r.id !== id));
      setSeen((prev) => {
        const next = new Map(prev);
        const r = next.get(id);
        if (r) next.set(id, { ...r, canonicalId: "", canonicalLinkedBy: "" });
        return next;
      });
      setResults((prev) => (prev ? prev.map((r) => (r.id === id ? { ...r, canonicalId: "", canonicalLinkedBy: "" } : r)) : prev));
      setNotice(`Unlinked ${id}.`);
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Unlink failed.");
    } finally {
      setBusy(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-5 flex items-center gap-3">
        <Fingerprint className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold text-on-surface">Product Identity</h1>
          <p className="text-sm text-on-surface-variant">
            Individual <code>products</code> documents (not name-merged cards). Link docs that are the same real
            product — it stamps a shared <code>canonicalId</code> and never changes names, variants, prices, stock or
            ownership. Grouping stays name-based until the catalogId migration is approved.
          </p>
        </div>
      </div>

      {notice && (
        <div className="mb-3 flex items-center justify-between rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Search bar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as SearchMode)}
          className="rounded-xl border border-outline-variant bg-white px-3 py-2 text-sm"
        >
          <option value="name">Name</option>
          <option value="id">Document ID</option>
          <option value="owner">Owner / manufacturer</option>
          <option value="source">Source</option>
        </select>
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder={
              mode === "id"
                ? "exact product document id"
                : mode === "owner"
                  ? "owner uid or phone"
                  : mode === "source"
                    ? "e.g. retailer_inventory"
                    : "product name"
            }
            className="w-full rounded-xl border border-outline-variant bg-white py-2 pl-9 pr-3 text-sm"
          />
        </div>
        <button
          onClick={runSearch}
          disabled={searching}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary disabled:opacity-50"
        >
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Search
        </button>
        {results !== null && (
          <button
            onClick={clearSearch}
            className="inline-flex items-center gap-1 rounded-xl border border-outline-variant bg-white px-3 py-2 text-sm"
          >
            <X className="h-4 w-4" /> Clear
          </button>
        )}
        {results === null && (
          <select
            value={sourceBrowse}
            onChange={(e) => setSourceBrowse(e.target.value)}
            className="rounded-xl border border-outline-variant bg-white px-3 py-2 text-sm"
            title="Filter browse by source"
          >
            <option value="all">All sources</option>
            {SOURCE_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}
      </div>

      {mode === "source" && results === null && (
        <p className="mb-2 text-xs text-on-surface-variant">
          Tip: use the “All sources” dropdown to browse by source; the Search box with mode “Source” matches an exact
          value.
        </p>
      )}
      {searchErr && <p className="mb-3 text-sm text-red-600">{searchErr}</p>}

      {/* Selection bar */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm text-on-surface-variant">
          {results !== null ? `${rows.length} result${rows.length === 1 ? "" : "s"}` : "Browsing all products"}
          {selected.size > 0 && ` · ${selected.size} selected`}
        </span>
        <button
          onClick={openLink}
          disabled={selected.size < 2}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary disabled:opacity-40"
        >
          <Link2 className="h-4 w-4" /> Link as Same Product{selected.size >= 2 ? ` (${selected.size})` : ""}
        </button>
      </div>

      {/* Rows */}
      <div className="overflow-hidden rounded-2xl border border-outline-variant bg-white">
        {rows.length === 0 && !browse.loading && !searching && (
          <div className="p-8 text-center text-sm text-on-surface-variant">No products.</div>
        )}
        {rows.map((r) => (
          <IdentityRowView
            key={r.id}
            row={r}
            checked={selected.has(r.id)}
            onToggle={() => toggle(r.id)}
            onInspect={() => r.canonicalId && openInspect(r.canonicalId)}
          />
        ))}
        {(browse.loading || searching) && (
          <div className="flex items-center justify-center gap-2 p-6 text-sm text-on-surface-variant">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}
      </div>

      {results === null && (
        <LoadMore hasMore={browse.hasMore} loading={browse.loadingMore} onClick={browse.loadMore} />
      )}

      {/* Link confirm modal */}
      {linkOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && setLinkOpen(false)}>
          <div className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-on-surface">Link as Same Product</h2>
              <button onClick={() => !busy && setLinkOpen(false)} aria-label="Close"><X className="h-5 w-5" /></button>
            </div>

            <p className="mb-3 text-sm text-on-surface-variant">
              These {selectedRows.length} documents will share one <code>canonicalId</code> (the authoritative
              document’s own id). No other field is changed; nothing is deleted.
            </p>

            {(isGroupMerge || selectionHasCopy) && (
              <div className="mb-3 space-y-2">
                {isGroupMerge && (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      Some selected docs already belong to a different canonical group. Confirming will re-point them —
                      this merges groups. Existing: {existingCanonicals.join(", ")}.
                    </span>
                  </div>
                )}
                {selectionHasCopy && (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      Selection includes a seller COPY (already bound to a root via originalProductId /
                      manufacturerProductId). Confirm you really want to link it.
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="mb-3 space-y-2">
              <p className="text-xs font-semibold uppercase text-on-surface-variant">Authoritative (identity source)</p>
              {selectedRows.map((r) => (
                <label
                  key={r.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-xl border p-2",
                    authoritativeId === r.id ? "border-primary bg-primary/5" : "border-outline-variant",
                  )}
                >
                  <input
                    type="radio"
                    name="authoritative"
                    checked={authoritativeId === r.id}
                    onChange={() => setAuthoritativeId(r.id)}
                  />
                  <Thumb src={r.image} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-on-surface">{r.name || "(no name)"}</div>
                    <div className="truncate text-xs text-on-surface-variant">
                      {r.id} · <SourceBadge source={r.source} isCopy={r.isCopy} /> · ₹{r.price}
                    </div>
                  </div>
                </label>
              ))}
            </div>

            {actionErr && <p className="mb-2 text-sm text-red-600">{actionErr}</p>}

            <div className="flex justify-end gap-2">
              <button onClick={() => !busy && setLinkOpen(false)} className="rounded-xl border border-outline-variant px-4 py-2 text-sm">
                Cancel
              </button>
              <button
                onClick={confirmLink}
                disabled={busy || !authoritativeId}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Confirm link
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Linked-group inspector */}
      {inspectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setInspectId(null)}>
          <div className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-on-surface">Linked group · <code className="text-sm">{inspectId}</code></h2>
              <button onClick={() => setInspectId(null)} aria-label="Close"><X className="h-5 w-5" /></button>
            </div>
            {actionErr && <p className="mb-2 text-sm text-red-600">{actionErr}</p>}
            {inspectLoading ? (
              <div className="flex items-center gap-2 p-4 text-sm text-on-surface-variant"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
            ) : inspectRows.length === 0 ? (
              <p className="p-4 text-sm text-on-surface-variant">No members (all unlinked).</p>
            ) : (
              <div className="space-y-2">
                {inspectRows.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 rounded-xl border border-outline-variant p-2">
                    <Thumb src={r.image} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-on-surface">
                        {r.name || "(no name)"} {r.id === inspectId && <span className="text-xs text-primary">(authoritative)</span>}
                      </div>
                      <div className="truncate text-xs text-on-surface-variant">
                        {r.id} · <SourceBadge source={r.source} isCopy={r.isCopy} /> · {r.isActive ? "active" : "inactive"} · ₹{r.price}
                        {r.variants.length > 0 && ` · ${r.variants.map((v) => v.unit).join(", ")}`}
                      </div>
                    </div>
                    <button
                      onClick={() => unlinkOne(r.id)}
                      disabled={busy}
                      className="inline-flex items-center gap-1 rounded-lg border border-outline-variant px-2 py-1 text-xs disabled:opacity-50"
                    >
                      <Unlink className="h-3.5 w-3.5" /> Unlink
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Thumb({ src }: { src: string }) {
  if (!src) {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-container-high text-on-surface-variant">
        <ImageIcon className="h-4 w-4" />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />;
}

function IdentityRowView({
  row,
  checked,
  onToggle,
  onInspect,
}: {
  row: IdentityRow;
  checked: boolean;
  onToggle: () => void;
  onInspect: () => void;
}) {
  const owner = row.ownerId || row.ownerPhone || row.retailerId || row.retailerPhone || "—";
  const mfr = row.manufacturerId || row.manufacturerPhone || "—";
  return (
    <div className={cn("flex items-center gap-3 border-b border-outline-variant p-3 last:border-b-0", checked && "bg-primary/5")}>
      <input type="checkbox" checked={checked} onChange={onToggle} className="h-4 w-4" />
      <Thumb src={row.image} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-on-surface">{row.name || "(no name)"}</span>
          {!row.isActive && <span className="rounded bg-red-100 px-1.5 text-xs text-red-700">inactive</span>}
          {row.isOnline && <span className="rounded bg-green-100 px-1.5 text-xs text-green-700">online</span>}
        </div>
        <div className="truncate text-xs text-on-surface-variant">
          <code>{row.id}</code> · <SourceBadge source={row.source} isCopy={row.isCopy} /> · owner {owner} · mfr {mfr} · ₹{row.price}
          {row.variants.length > 0 && ` · [${row.variants.map((v) => `${v.unit} ₹${v.price}`).join(", ")}]`}
        </div>
      </div>
      {row.canonicalId ? (
        <button
          onClick={onInspect}
          className="inline-flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/5 px-2 py-1 text-xs text-primary"
          title="Inspect linked group"
        >
          <Link2 className="h-3.5 w-3.5" /> linked
        </button>
      ) : (
        <span className="text-xs text-on-surface-variant">—</span>
      )}
    </div>
  );
}
