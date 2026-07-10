"use client";

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { onAuthStateChanged, type User } from 'firebase/auth';
import dynamic from 'next/dynamic';
import { ArrowLeft } from 'lucide-react';
import { auth } from '../../../firebase';
import { fetchSessionById, type DaySession } from '../../day-session-service';
import { fetchVisitsForDate, type DealerVisit } from '../../dealers/dealer-visit-service';
import SessionSummary from '../../../../components/sales/SessionSummary';

const RouteMap = dynamic(
  () => import('../../../../components/sales/RouteMap'),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-80 items-center justify-center rounded-2xl bg-surface-container ring-1 ring-outline/10">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    ),
  }
);
import VisitTimeline from '../../../../components/sales/VisitTimeline';

type PageState = 'loading' | 'ready' | 'not-found' | 'error';

export default function SessionDetailPage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params.sessionId as string;

  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<DaySession | null>(null);
  const [visits, setVisits] = useState<DealerVisit[]>([]);
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
      const s = await fetchSessionById(sessionId);
      if (!s) { setPageState('not-found'); return; }
      // Guard: only the owning exec can view their session
      if (s.salesExecutiveId !== uid) { setPageState('not-found'); return; }

      const v = await fetchVisitsForDate(uid, s.date);
      setSession(s);
      setVisits(v);
      setPageState('ready');
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load session.');
      setPageState('error');
    }
  };

  function fmtDate(dateStr: string): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    });
  }

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
          <h1 className="text-base font-bold text-on-surface">Session Details</h1>
          <p className="text-xs text-on-surface-variant">
            {pageState === 'ready' && session ? fmtDate(session.date) : 'Loading…'}
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

        {/* Not found */}
        {pageState === 'not-found' && (
          <div className="mt-8 rounded-2xl bg-surface-container px-5 py-8 text-center">
            <p className="text-sm font-semibold text-on-surface">Session not found</p>
            <p className="mt-1 text-xs text-on-surface-variant">This session may have been deleted or doesn't belong to your account.</p>
            <button
              onClick={() => router.back()}
              className="mt-4 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white transition active:scale-95"
            >
              Go back
            </button>
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

        {/* Content */}
        {pageState === 'ready' && session && (
          <>
            <SessionSummary session={session} visitCount={visits.length} />

            {/* Route map */}
            <div className="mt-6">
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-outline">
                Route Map
              </p>
              <RouteMap session={session} visits={visits} />
            </div>

            {/* Visit timeline */}
            <div className="mt-6">
              <div className="mb-3 flex items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-outline">
                  Visit Timeline
                </p>
                {visits.length > 0 && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                    {visits.length}
                  </span>
                )}
              </div>
              <VisitTimeline session={session} visits={visits} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
