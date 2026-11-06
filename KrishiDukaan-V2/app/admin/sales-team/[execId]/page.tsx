"use client";

/**
 * Sales Team → single executive activity (read-only, admin-only).
 *
 * Reuses the EXISTING /sales daily-session, visit, route, distance and dealer
 * data and components — nothing new is tracked or stored:
 *   - fetchAllSessions / fetchVisitsForDate / fetchAllVisitsForExec (services)
 *   - fetchDealersByExec (dealers-service)
 *   - DaySessionCard / SessionSummary / RouteMap / VisitTimeline / AdminDealerCard (components)
 *
 * Admin-read is possible because dealerVisits & dealers already grant isAdmin()
 * reads, and daySessions now does too (see firestore.rules). This is a VIEW
 * only: no writes are performed, so an admin can inspect an exec's sessions,
 * routes, distances and dealers without any risk of performing sales actions
 * as them — the Dealers Added section below has no create/edit/delete/upload
 * affordance, unlike the rep-facing DealerCard it deliberately does not reuse.
 */

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeft, Contact, Eye, MapPin, Store, CalendarDays, Route, Clock } from "lucide-react";
import { fetchAllSessions, type DaySession } from "../../../sales/day-session-service";
import { fetchAllVisitsForExec, fetchVisitsForDate, type DealerVisit } from "../../../sales/dealers/dealer-visit-service";
import { fetchDealersByExec, type Dealer } from "../../../sales/dealers/dealers-service";
import { doc, getDoc, getDocs, collection, query, where, limit } from "firebase/firestore";
import { db } from "../../../firebase";
import DaySessionCard from "../../../../components/sales/DaySessionCard";
import SessionSummary from "../../../../components/sales/SessionSummary";
import VisitTimeline from "../../../../components/sales/VisitTimeline";
import AdminDealerCard from "../../../../components/sales/AdminDealerCard";

// RouteMap uses the Google Maps JS SDK — client-only, same as the /sales portal.
const RouteMap = dynamic(() => import("../../../../components/sales/RouteMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-80 items-center justify-center rounded-2xl bg-surface-container ring-1 ring-outline/10">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  ),
});

type PageState = "loading" | "ready" | "error";

/** Groups all visits by their IST date string (YYYY-MM-DD) — same logic as /sales/day-sessions. */
/** The exec's own user doc: users/{uid} (email accounts), else the doc whose uid matches. */
async function fetchExecUser(execId: string): Promise<Record<string, any> | null> {
  const direct = await getDoc(doc(db, "users", execId));
  if (direct.exists()) return direct.data();
  const byUid = await getDocs(query(collection(db, "users"), where("uid", "==", execId), limit(1)));
  return byUid.empty ? null : byUid.docs[0].data();
}

function buildVisitCountByDate(visits: DealerVisit[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const v of visits) {
    if (!v.visitedAt || typeof (v.visitedAt as any).toDate !== "function") continue;
    const ist = new Date((v.visitedAt as any).toDate().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const key = [
      ist.getFullYear(),
      String(ist.getMonth() + 1).padStart(2, "0"),
      String(ist.getDate()).padStart(2, "0"),
    ].join("-");
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

type MonthRow = {
  key: string;          // YYYY-MM
  label: string;        // "Sep 2026"
  sessions: number;
  distanceKm: number;
  visits: number;
  workingMinutes: number;
};

function fmtDistance(km: number): string {
  return km > 0 ? `${km.toFixed(1)} km` : "—";
}

function fmtDuration(mins: number): string {
  if (!mins) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

export default function AdminSalesExecActivityPage() {
  const params = useParams();
  const execId = String(params.execId ?? "");

  const [execName, setExecName] = useState("");
  const [execEmail, setExecEmail] = useState("");
  const [sessions, setSessions] = useState<DaySession[]>([]);
  const [visitCountByDate, setVisitCountByDate] = useState<Map<string, number>>(new Map());
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [pageState, setPageState] = useState<PageState>("loading");
  const [loadError, setLoadError] = useState("");

  // Session detail drill-in — a session id + its visits, loaded on demand.
  const [selected, setSelected] = useState<DaySession | null>(null);
  const [selectedVisits, setSelectedVisits] = useState<DealerVisit[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Which of the two already-loaded sections is visible below Monthly
  // Performance. Both `sessions` and `dealers` are fetched together above, so
  // this is purely a display toggle — no extra Firestore reads.
  const [activeSection, setActiveSection] = useState<"sessions" | "dealers">(
    "sessions",
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPageState("loading");
      setLoadError("");
      try {
        const [exec, allSessions, allVisits, execDealers] = await Promise.all([
          fetchExecUser(execId).catch(() => null),
          fetchAllSessions(execId),
          fetchAllVisitsForExec(execId),
          fetchDealersByExec(execId),
        ]);
        if (cancelled) return;
        setExecName(String(exec?.name ?? "").trim());
        setExecEmail(String(exec?.email ?? "").trim());
        setSessions(allSessions);
        setVisitCountByDate(buildVisitCountByDate(allVisits));
        setDealers(execDealers);
        setPageState("ready");
      } catch (e) {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : "Failed to load activity.");
        setPageState("error");
      }
    })();
    return () => { cancelled = true; };
  }, [execId]);

  const openSession = async (session: DaySession) => {
    setSelected(session);
    setDetailLoading(true);
    setSelectedVisits([]);
    try {
      const v = await fetchVisitsForDate(execId, session.date);
      setSelectedVisits(v);
    } catch {
      // Non-fatal — timeline/map just render without visit points.
    } finally {
      setDetailLoading(false);
    }
  };

  // Monthly performance rolled up from the sessions themselves — no new data.
  const monthly = useMemo<MonthRow[]>(() => {
    const rows = new Map<string, MonthRow>();
    for (const s of sessions) {
      const key = s.date.slice(0, 7); // YYYY-MM
      if (!key || key.length !== 7) continue;
      let row = rows.get(key);
      if (!row) {
        const [y, m] = key.split("-").map(Number);
        row = {
          key,
          label: new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" }),
          sessions: 0, distanceKm: 0, visits: 0, workingMinutes: 0,
        };
        rows.set(key, row);
      }
      row.sessions += 1;
      row.distanceKm += typeof s.totalDistanceKm === "number" ? s.totalDistanceKm : 0;
      row.workingMinutes += typeof s.totalWorkingMinutes === "number" ? s.totalWorkingMinutes : 0;
      row.visits += visitCountByDate.get(s.date) ?? 0;
    }
    return Array.from(rows.values()).sort((a, b) => b.key.localeCompare(a.key));
  }, [sessions, visitCountByDate]);

  const title = execName || execEmail || "Sales Executive";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link
          href="/admin/sales-team"
          aria-label="Back to Sales Team"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-outline-variant/40 text-on-surface hover:bg-surface-container transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Contact className="h-5 w-5 sm:h-6 sm:w-6 text-primary shrink-0" />
            <h1 className="text-lg sm:text-2xl font-black text-on-surface truncate">{title}</h1>
          </div>
          {execEmail && execName && (
            <p className="text-xs sm:text-sm text-on-surface-variant ml-7 sm:ml-9 truncate">{execEmail}</p>
          )}
        </div>
      </div>

      {/* Read-only notice */}
      <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-3">
        <Eye className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <p className="text-xs text-amber-800">
          <span className="font-bold">Read-only view.</span> You are viewing this Sales Executive&apos;s field
          activity as an admin. No changes are made to their account and no sales actions can be performed here.
        </p>
      </div>

      {pageState === "loading" && (
        <div className="flex h-60 items-center justify-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {pageState === "error" && (
        <div className="rounded-2xl bg-red-50 px-5 py-4 text-center">
          <p className="text-sm font-semibold text-red-600">{loadError}</p>
        </div>
      )}

      {pageState === "ready" && (
        <>
          {/* ── Session detail drill-in ─────────────────────────────────── */}
          {selected ? (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => { setSelected(null); setSelectedVisits([]); }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 px-3 py-1.5 text-xs font-semibold text-on-surface hover:bg-surface-container transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back to sessions
              </button>

              <SessionSummary session={selected} visitCount={selectedVisits.length} />

              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-outline">Route Map</p>
                {detailLoading ? (
                  <div className="flex h-80 items-center justify-center rounded-2xl bg-surface-container ring-1 ring-outline/10">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                  </div>
                ) : (
                  <RouteMap session={selected} visits={selectedVisits} />
                )}
              </div>

              <div>
                <div className="mb-3 flex items-center gap-2">
                  <p className="text-xs font-semibold uppercase tracking-widest text-outline">Visit Timeline</p>
                  {selectedVisits.length > 0 && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                      {selectedVisits.length}
                    </span>
                  )}
                </div>
                {!detailLoading && <VisitTimeline session={selected} visits={selectedVisits} />}
              </div>
            </div>
          ) : (
            <>
              {/* ── Monthly performance ─────────────────────────────────── */}
              {monthly.length > 0 && (
                <section>
                  <p className="mb-3 text-xs font-black uppercase tracking-widest text-on-surface-variant">
                    Monthly Performance
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {monthly.map((m) => (
                      <div key={m.key} className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4">
                        <p className="text-sm font-bold text-on-surface mb-3">{m.label}</p>
                        <div className="grid grid-cols-2 gap-2">
                          <MonthStat icon={<CalendarDays className="h-3.5 w-3.5 text-outline" />} label="Sessions" value={String(m.sessions)} />
                          <MonthStat icon={<Store className="h-3.5 w-3.5 text-outline" />} label="Visits" value={String(m.visits)} />
                          <MonthStat icon={<Route className="h-3.5 w-3.5 text-outline" />} label="Distance" value={fmtDistance(m.distanceKm)} />
                          <MonthStat icon={<Clock className="h-3.5 w-3.5 text-outline" />} label="Working" value={fmtDuration(m.workingMinutes)} />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* ── Section tabs ─────────────────────────────────────────── */}
              <div className="flex space-x-2 border-b border-outline-variant/20 mb-4">
                <button
                  type="button"
                  onClick={() => setActiveSection("sessions")}
                  className={`pb-2 px-1 font-semibold text-sm ${activeSection === "sessions" ? "border-b-2 border-primary text-primary" : "text-on-surface-variant hover:text-on-surface"}`}
                >
                  Daily Sessions {sessions.length > 0 && `(${sessions.length})`}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSection("dealers")}
                  className={`pb-2 px-1 font-semibold text-sm ${activeSection === "dealers" ? "border-b-2 border-primary text-primary" : "text-on-surface-variant hover:text-on-surface"}`}
                >
                  Dealers Added {dealers.length > 0 && `(${dealers.length})`}
                </button>
              </div>

              {/* ── Sessions list ───────────────────────────────────────── */}
              {activeSection === "sessions" && (
                <section>
                  {sessions.length === 0 ? (
                    <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest px-5 py-10 text-center">
                      <MapPin className="mx-auto mb-2 h-6 w-6 text-outline" />
                      <p className="text-sm font-semibold text-on-surface">No daily sessions yet</p>
                      <p className="mt-1 text-xs text-on-surface-variant">
                        This executive hasn&apos;t started any day sessions in the field app.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      {sessions.map((session) => (
                        <DaySessionCard
                          key={session.id}
                          session={session}
                          visitCount={visitCountByDate.get(session.date) ?? 0}
                          onClick={() => void openSession(session)}
                        />
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* ── Dealers added ───────────────────────────────────────── */}
              {activeSection === "dealers" && (
                <section>
                  {dealers.length === 0 ? (
                    <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest px-5 py-10 text-center">
                      <Store className="mx-auto mb-2 h-6 w-6 text-outline" />
                      <p className="text-sm font-semibold text-on-surface">No dealers added yet</p>
                      <p className="mt-1 text-xs text-on-surface-variant">
                        This executive hasn&apos;t added any dealers in the field app.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {dealers.map((dealer) => (
                        <AdminDealerCard key={dealer.id} dealer={dealer} execId={execId} />
                      ))}
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function MonthStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-container-low px-3 py-2">
      <div className="flex items-center gap-1 mb-0.5">
        {icon}
        <p className="text-[10px] font-semibold uppercase tracking-wider text-outline">{label}</p>
      </div>
      <p className="text-sm font-bold text-on-surface">{value}</p>
    </div>
  );
}
