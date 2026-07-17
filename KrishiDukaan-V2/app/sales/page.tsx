"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "../firebase";
import { getUserLocation } from "../utils/geolocation";
import {
  startDaySession,
  endDaySession,
  fetchTodaySession,
  fetchActiveSession,
  getTodayIST,
  calculateRoute,
  type DaySession,
} from "./day-session-service";
import { fetchTodayVisits, sortVisits } from "./dealers/dealer-visit-service";
import DashboardHeader from "../../components/sales/DashboardHeader";
import DaySummary from "../../components/sales/DaySummary";
import FeatureCard from "../../components/sales/FeatureCard";
import ComingSoonCard from "../../components/sales/ComingSoonCard";
import {
  Store,
  Sprout,
  ReceiptText,
  CalendarCheck,
  BarChart2,
  Settings,
  Sun,
  Loader2,
  CalendarDays,
} from "lucide-react";

type SessionAction = 'idle' | 'starting' | 'locating' | 'calculating' | 'saving';

export default function SalesDashboardPage() {
  const [user, setUser]               = useState<User | null>(null);
  const [session, setSession]         = useState<DaySession | null>(null);
  const [visitCount, setVisitCount]   = useState(0);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [action, setAction]           = useState<SessionAction>('idle');
  const [actionError, setActionError] = useState('');

  // ── Auth + load today's session ──────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (!u) return;
      await loadSession(u.uid);
    });
    return () => unsub();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadSession = async (uid: string) => {
    setSessionLoading(true);
    try {
      // Operate on the ACTIVE session regardless of its date: if a rep forgot to
      // "End Day" yesterday, that session must surface today (so it can be closed)
      // instead of being orphaned while a fresh session is silently started.
      // Fall back to today's session (e.g. a COMPLETED one) when nothing is active.
      const [active, today, visits] = await Promise.all([
        fetchActiveSession(uid),
        fetchTodaySession(uid),
        fetchTodayVisits(uid),
      ]);
      setSession(active ?? today);
      setVisitCount(visits.length);
    } catch {
      // Non-fatal: session just won't show
    } finally {
      setSessionLoading(false);
    }
  };

  // ── Start Day ─────────────────────────────────────────────────────────────
  const handleStartDay = async () => {
    if (!user || action !== 'idle') return;
    setAction('starting');
    setActionError('');
    try {
      const result = await getUserLocation();
      const id = await startDaySession(user.uid, result.coords);
      // Re-fetch so we have the full session with server timestamps
      await loadSession(user.uid);
      void id; // used indirectly via loadSession
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Failed to start day. Please try again.');
    } finally {
      setAction('idle');
    }
  };

  // ── End Day ───────────────────────────────────────────────────────────────
  const handleEndDay = async () => {
    if (!user || !session || action !== 'idle') return;
    setActionError('');

    try {
      // Step 1: capture end location
      setAction('locating');
      const geoResult = await getUserLocation();
      const endCoords = geoResult.coords;

      // Step 2: build waypoints in canonical order and calculate route
      setAction('calculating');
      const visits = await fetchTodayVisits(user.uid);
      const sortedVisits = sortVisits(visits);

      const waypoints: { lat: number; lng: number }[] = [
        { lat: session.startGeo.latitude, lng: session.startGeo.longitude },
        ...sortedVisits
          .filter((v) => v.geo)
          .map((v) => ({ lat: v.geo!.latitude, lng: v.geo!.longitude })),
        { lat: endCoords.lat, lng: endCoords.lng },
      ];

      let routeResult = null;
      try {
        routeResult = await calculateRoute(waypoints);
      } catch {
        // Route failure does not block ending the day — distance is simply omitted
      }

      // Step 3: write session as COMPLETED with route result
      setAction('saving');
      await endDaySession(session.id, session.startedAt, endCoords, routeResult);
      await loadSession(user.uid);

    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Failed to end day. Please try again.');
    } finally {
      setAction('idle');
    }
  };

  const isActive    = session?.status === 'ACTIVE';
  const isCompleted = session?.status === 'COMPLETED';
  // An ACTIVE session whose date is before today = a day the rep forgot to end.
  const isStaleActive = isActive && !!session && session.date !== getTodayIST();

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <DashboardHeader email={user?.email} displayName={user?.displayName} />

      <main className="flex-1 px-4 py-6 space-y-6">

        {/* ── Day Session card ──────────────────────────────────────────── */}
        <section>
          {sessionLoading ? (
            <div className="flex items-center justify-center rounded-2xl bg-white py-6 ring-1 ring-outline/10">
              <Loader2 className="h-5 w-5 animate-spin text-outline" />
            </div>
          ) : isCompleted && session ? (
            <DaySummary session={session} visitCount={visitCount} />
          ) : isActive && session ? (
            /* Active session — show summary + End Day button */
            <div className="space-y-3">
              {isStaleActive ? (
                <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 ring-1 ring-amber-200">
                  <Sun className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <p className="text-xs text-amber-700">
                    You have an unfinished session from <span className="font-semibold">{session.date}</span>. Please end it before starting a new day.
                  </p>
                </div>
              ) : null}
              <DaySummary session={session} visitCount={visitCount} />
              <button
                onClick={handleEndDay}
                disabled={action !== 'idle'}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-500 py-3.5 text-sm font-bold text-white shadow-sm transition active:scale-95 hover:bg-red-600 disabled:opacity-60"
              >
                {action === 'locating' ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Getting location…</>
                ) : action === 'calculating' ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Calculating route…</>
                ) : action === 'saving' ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                ) : (
                  'End Day'
                )}
              </button>
            </div>
          ) : (
            /* No session yet — show Start Day */
            <div className="rounded-2xl bg-white p-5 ring-1 ring-outline/10">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-harvest/10">
                  <Sun className="h-6 w-6 text-harvest" />
                </div>
                <div>
                  <p className="text-sm font-bold text-on-surface">Start your day</p>
                  <p className="text-xs text-on-surface-variant">Capture your start location to begin tracking</p>
                </div>
              </div>
              <button
                onClick={handleStartDay}
                disabled={action !== 'idle'}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-white shadow-sm transition active:scale-95 hover:bg-primary-container disabled:opacity-60"
              >
                {action === 'starting' ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Getting location…</>
                ) : (
                  'Start Day'
                )}
              </button>
            </div>
          )}

          {actionError ? (
            <p className="mt-2 rounded-xl bg-red-50 px-4 py-2 text-xs text-red-600">{actionError}</p>
          ) : null}
        </section>

        {/* ── Modules ──────────────────────────────────────────────────── */}
        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-outline">
            Modules
          </p>
          <div className="space-y-3">
            <FeatureCard
              icon={Store}
              title="Dealer Visit"
              description="Log and manage dealer visits in your territory"
              href="/sales/dealers"
              accentColor="bg-primary"
            />
            <FeatureCard
              icon={CalendarDays}
              title="Daily Sessions"
              description="View your daily visit history and route summaries"
              href="/sales/day-sessions"
              accentColor="bg-harvest"
            />
            <ComingSoonCard icon={Sprout}       title="Farmer Visit"      description="Track and record farmer outreach visits" />
            <ComingSoonCard icon={ReceiptText}   title="Expense Tracker"   description="Submit and monitor daily field expenses" />
            <ComingSoonCard icon={CalendarCheck} title="Attendance"        description="Mark daily attendance and check-ins" />
            <ComingSoonCard icon={BarChart2}     title="Reports"           description="View weekly and monthly performance reports" />
            <ComingSoonCard icon={Settings}      title="Settings"          description="Manage your account and preferences" />
          </div>
        </section>

      </main>
    </div>
  );
}
