"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { ArrowLeft } from 'lucide-react';
import { auth } from '../../firebase';
import { fetchAllSessions, type DaySession } from '../day-session-service';
import { fetchAllVisitsForExec, type DealerVisit } from '../dealers/dealer-visit-service';
import DaySessionCard from '../../../components/sales/DaySessionCard';

type PageState = 'loading' | 'ready' | 'error';

/** Groups all visits by their IST date string (YYYY-MM-DD). */
function buildVisitCountByDate(visits: DealerVisit[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const v of visits) {
    if (!v.visitedAt || typeof (v.visitedAt as any).toDate !== 'function') continue;
    const ist = new Date(
      (v.visitedAt as any).toDate().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }),
    );
    const key = [
      ist.getFullYear(),
      String(ist.getMonth() + 1).padStart(2, '0'),
      String(ist.getDate()).padStart(2, '0'),
    ].join('-');
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

export default function DaySessionsPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [sessions, setSessions] = useState<DaySession[]>([]);
  const [visitCountByDate, setVisitCountByDate] = useState<Map<string, number>>(new Map());
  const [pageState, setPageState] = useState<PageState>('loading');
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { router.replace('/sales/login'); return; }
      setUser(u);
      await load(u.uid);
    });
    return () => unsub();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const load = async (uid: string) => {
    setPageState('loading');
    setLoadError('');
    try {
      const [allSessions, allVisits] = await Promise.all([
        fetchAllSessions(uid),
        fetchAllVisitsForExec(uid),
      ]);
      setSessions(allSessions);
      setVisitCountByDate(buildVisitCountByDate(allVisits));
      setPageState('ready');
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load sessions.');
      setPageState('error');
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-surface">

      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-outline/15 bg-white px-4 py-3 shadow-sm">
        <button
          onClick={() => router.back()}
          aria-label="Go back"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition hover:bg-surface-container active:scale-95"
        >
          <ArrowLeft className="h-5 w-5 text-on-surface" />
        </button>
        <div className="min-w-0">
          <h1 className="text-base font-bold text-on-surface">Daily Sessions</h1>
          <p className="text-xs text-on-surface-variant">
            {pageState === 'ready'
              ? `${sessions.length} session${sessions.length !== 1 ? 's' : ''}`
              : 'Loading…'}
          </p>
        </div>
      </header>

      <main className="flex-1 px-4 pb-8 pt-4">

        {/* Loading */}
        {pageState === 'loading' && (
          <div className="flex flex-col items-center justify-center pt-24 text-center">
            <div className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-sm text-on-surface-variant">Loading…</p>
          </div>
        )}

        {/* Error */}
        {pageState === 'error' && (
          <div className="mt-8 rounded-2xl bg-red-50 px-5 py-4 text-center">
            <p className="text-sm font-semibold text-red-600">{loadError}</p>
            <button
              onClick={() => user && load(user.uid)}
              className="mt-3 rounded-xl bg-red-100 px-4 py-2 text-xs font-bold text-red-700 transition active:scale-95"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty */}
        {pageState === 'ready' && sessions.length === 0 && (
          <div className="flex flex-col items-center justify-center pt-20 text-center">
            <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/10">
              <svg className="h-10 w-10 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-on-surface">No sessions yet</h2>
            <p className="mt-2 max-w-xs text-sm text-on-surface-variant">
              Start your day from the dashboard to begin tracking daily sessions.
            </p>
          </div>
        )}

        {/* Session list */}
        {pageState === 'ready' && sessions.length > 0 && (
          <>
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-outline">
              History
            </p>
            <div className="space-y-3">
              {sessions.map((session) => (
                <DaySessionCard
                  key={session.id}
                  session={session}
                  visitCount={visitCountByDate.get(session.date) ?? 0}
                  onClick={() => router.push(`/sales/day-sessions/${session.id}`)}
                />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
