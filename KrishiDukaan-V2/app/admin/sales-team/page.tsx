"use client";

/**
 * Sales Team — Phase 1 (read-only roster).
 *
 * Lists the field sales executives already in the system (users/{uid} with
 * role === "salesExecutive") and, for each, a lightweight activity summary
 * derived from the SAME collections the /sales portal already writes:
 *   - dealerVisits  (salesExecutiveId) → visits (count), distinct dealers
 *                                        visited in the last 30 days, last active
 *   - dealers       (createdBy)        → dealers ("retailers") they added (count)
 *
 * Totals are count queries and only the last 30 days of visits are read, so
 * the page doesn't grow with the visit history.
 *
 * Both collections already grant admin client reads in firestore.rules. The
 * roster deliberately does NOT read daySessions (dealerVisits already yields
 * last-active) — per-exec daily sessions live on the drill-in activity page at
 * /admin/sales-team/[execId], which reuses the /sales session/route services.
 *
 * Deliberately no new Firestore collections, schemas, or tracking — this only
 * reads what the sales app produces. "Status" is DERIVED from recent activity
 * (there is no status field on the exec's user doc).
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Contact, Search, X, Eye } from "lucide-react";
import { collection, getCountFromServer, getDocs, limit, orderBy, query, Timestamp, where } from "firebase/firestore";
import { db } from "../../firebase";
import { fetchUsersByRoles } from "../_lib/admin-queries";
import { RefreshButton } from "../_components/refresh-button";

// ── Types ─────────────────────────────────────────────────────────────────────
type ExecStats = {
  totalVisits: number;
  /** Distinct dealers visited in the last RECENT_DAYS days. */
  dealersVisited: Set<string>;
  dealersCreated: number;
  lastActiveMs: number;
};

type SalesExec = {
  uid: string;
  name: string;
  email: string;
  phone: string;
  createdAtMs: number;
  stats: ExecStats;
};

// ── Helpers ─────────────────────────────────────────────────────────────────
/** Numeric ms from a Firestore Timestamp, Date, or date string. */
function getTs(val: any): number {
  if (!val) return 0;
  if (typeof val.toDate === "function") return val.toDate().getTime();
  if (val instanceof Date) return val.getTime();
  if (typeof val === "string" || typeof val === "number") {
    const t = new Date(val).getTime();
    return isNaN(t) ? 0 : t;
  }
  return 0;
}

function fmtDate(ms: number): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const ACTIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const RECENT_DAYS = 30;

/** Derived status from most-recent activity — there is no status field on the doc. */
function statusOf(lastActiveMs: number): { label: string; cls: string; dot: string } {
  if (!lastActiveMs) return { label: "No activity", cls: "text-on-surface-variant", dot: "bg-gray-300" };
  if (Date.now() - lastActiveMs <= ACTIVE_WINDOW_MS)
    return { label: "Active", cls: "text-green-600", dot: "bg-green-500" };
  return { label: "Idle", cls: "text-amber-600", dot: "bg-amber-400" };
}

export default function AdminSalesTeamPage() {
  const [execs, setExecs] = useState<SalesExec[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dataAge, setDataAge] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const since = Timestamp.fromMillis(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000);
      const [users, recentSnap] = await Promise.all([
        fetchUsersByRoles(["salesExecutive"]),
        getDocs(query(collection(db, "dealerVisits"), where("visitedAt", ">=", since))),
      ]);

      // Distinct dealers visited and last activity from the recent visits.
      const recent = new Map<string, { dealers: Set<string>; lastMs: number }>();
      for (const d of recentSnap.docs) {
        const v = d.data();
        const uid = String(v.salesExecutiveId ?? "");
        if (!uid) continue;
        const r = recent.get(uid) ?? { dealers: new Set<string>(), lastMs: 0 };
        if (v.dealerId) r.dealers.add(String(v.dealerId));
        r.lastMs = Math.max(r.lastMs, getTs(v.visitedAt) || getTs(v.createdAt));
        recent.set(uid, r);
      }

      // All-time totals per exec are count queries; the last visit is read
      // only for execs with no visit in the recent window.
      const roster: SalesExec[] = await Promise.all(users.map(async (u: any) => {
        const uid = String(u.uid || u.id);
        const visits = query(collection(db, "dealerVisits"), where("salesExecutiveId", "==", uid));
        const r = recent.get(uid);
        const [visitCount, dealerCount, lastSnap] = await Promise.all([
          getCountFromServer(visits).then((c) => c.data().count).catch(() => 0),
          getCountFromServer(query(collection(db, "dealers"), where("createdBy", "==", uid)))
            .then((c) => c.data().count).catch(() => 0),
          r ? Promise.resolve(null) : getDocs(query(visits, orderBy("visitedAt", "desc"), limit(1))).catch(() => null),
        ]);
        const lastDoc = lastSnap?.docs[0]?.data();
        return {
          uid,
          name: String(u.name ?? "").trim(),
          email: String(u.email ?? "").trim(),
          phone: String(u.phone ?? "").trim(),
          createdAtMs: getTs(u.createdAt),
          stats: {
            totalVisits: visitCount,
            dealersVisited: r?.dealers ?? new Set<string>(),
            dealersCreated: dealerCount,
            lastActiveMs: r?.lastMs ?? (lastDoc ? getTs(lastDoc.visitedAt) || getTs(lastDoc.createdAt) : 0),
          },
        };
      }));

      // Most recently active first, then alphabetical.
      roster.sort((a, b) =>
        b.stats.lastActiveMs - a.stats.lastActiveMs || a.name.localeCompare(b.name),
      );

      setExecs(roster);
      setDataAge(Date.now());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    void load().finally(() => setRefreshing(false));
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return execs;
    return execs.filter((e) => [e.name, e.email, e.phone].join(" ").toLowerCase().includes(q));
  }, [execs, search]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 sm:gap-3 mb-1">
            <Contact className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            <h1 className="text-lg sm:text-2xl font-black text-on-surface">Sales Team</h1>
          </div>
          <p className="text-xs sm:text-sm text-on-surface-variant ml-7 sm:ml-9">
            Field sales executives and their visit activity. Status is derived from recent field activity.
          </p>
        </div>
        <div className="shrink-0">
          <RefreshButton savedAt={dataAge} refreshing={refreshing} onRefresh={handleRefresh} />
        </div>
      </div>

      {/* Search */}
      <div className="flex flex-1 items-center gap-3 bg-surface-container-low border border-outline-variant rounded-2xl px-4 py-2.5">
        <Search className="h-4 w-4 text-outline shrink-0" />
        <input
          type="text"
          placeholder="Search name, email, phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-on-surface placeholder-on-surface-variant"
        />
        {search && (
          <button type="button" onClick={() => setSearch("")} className="text-outline hover:text-on-surface">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex h-60 items-center justify-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b border-outline-variant/20 bg-surface-container-low">
            <span className="text-xs font-bold text-on-surface-variant">
              {filtered.length} sales executive{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant/20">
                  <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Executive</th>
                  <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Contact</th>
                  <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Status</th>
                  <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Retailers Visited ({RECENT_DAYS}d)</th>
                  <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Retailers Added</th>
                  <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Visits</th>
                  <th className="px-5 py-3 text-right text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => {
                  const st = statusOf(e.stats.lastActiveMs);
                  return (
                    <tr key={e.uid} className="border-b border-outline-variant/10 hover:bg-surface-container-low transition-colors">
                      <td className="px-5 py-3">
                        <p className="font-semibold text-on-surface">{e.name || "—"}</p>
                        <p className="text-xs text-on-surface-variant/70">Last active {fmtDate(e.stats.lastActiveMs)}</p>
                      </td>
                      <td className="px-5 py-3 text-xs text-on-surface-variant">
                        {e.email && <p className="truncate">{e.email}</p>}
                        {e.phone && <p className="text-on-surface-variant/70">{e.phone}</p>}
                        {!e.email && !e.phone && "—"}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`flex items-center gap-1 text-xs font-bold ${st.cls}`}>
                          <span className={`w-2 h-2 rounded-full ${st.dot}`} />
                          {st.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm text-on-surface">{e.stats.dealersVisited.size}</td>
                      <td className="px-5 py-3 text-sm text-on-surface">{e.stats.dealersCreated}</td>
                      <td className="px-5 py-3 text-sm text-on-surface">{e.stats.totalVisits}</td>
                      <td className="px-5 py-3 text-right">
                        <Link
                          href={`/admin/sales-team/${encodeURIComponent(e.uid)}`}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 px-3 py-1.5 text-xs font-medium text-on-surface hover:bg-surface-container transition-colors"
                        >
                          <Eye className="h-3.5 w-3.5" /> View Activity
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-on-surface-variant">No sales executives found.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="md:hidden divide-y divide-outline-variant/10">
            {filtered.map((e) => {
              const st = statusOf(e.stats.lastActiveMs);
              return (
                <div key={e.uid} className="px-4 py-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-on-surface truncate">{e.name || "—"}</p>
                      {e.email && <p className="text-[11px] text-on-surface-variant/70 truncate">{e.email}</p>}
                      {e.phone && <p className="text-[11px] text-on-surface-variant/70 truncate">{e.phone}</p>}
                    </div>
                    <Link
                      href={`/admin/sales-team/${encodeURIComponent(e.uid)}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-outline-variant/40 px-2.5 py-1 text-[11px] font-medium text-on-surface hover:bg-surface-container shrink-0"
                    >
                      <Eye className="h-3 w-3" /> View Activity
                    </Link>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className={`flex items-center gap-1 text-[11px] font-bold ${st.cls}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                      {st.label}
                    </span>
                    <span className="text-[11px] text-on-surface-variant">{e.stats.dealersVisited.size} visited ({RECENT_DAYS}d)</span>
                    <span className="text-[11px] text-on-surface-variant">{e.stats.dealersCreated} added</span>
                    <span className="text-[11px] text-on-surface-variant">{e.stats.totalVisits} visits</span>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-on-surface-variant">No sales executives found.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
