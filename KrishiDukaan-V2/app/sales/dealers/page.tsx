"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { ArrowLeft } from 'lucide-react';
import { auth } from '../../firebase';
import { getUserLocation } from '../../utils/geolocation';
import {
  fetchDealers,
  createDealer,
  updateDealer,
  deactivateDealer,
  type Dealer,
  type DealerInput,
} from './dealers-service';
import {
  startVisit,
  endVisit,
  fetchActiveVisit,
  fetchLastVisitsByExec,
  fetchTodayVisits,
  type DealerVisit,
  type VisitInput,
} from './dealer-visit-service';
import DealerCard from '../../../components/sales/DealerCard';
import DealerSearch from '../../../components/sales/DealerSearch';
import DealerForm from '../../../components/sales/DealerForm';
import VisitForm from '../../../components/sales/VisitForm';
import TodayVisits from '../../../components/sales/TodayVisits';
import FloatingActionButton from '../../../components/sales/FloatingActionButton';

type PageState = 'loading' | 'ready' | 'error';

export default function DealersPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [lastVisits, setLastVisits] = useState<Map<string, DealerVisit>>(new Map());
  const [activeVisit, setActiveVisit] = useState<DealerVisit | null>(null);
  const [todayVisits, setTodayVisits] = useState<DealerVisit[]>([]);
  const [pageState, setPageState] = useState<PageState>('loading');
  const [loadError, setLoadError] = useState('');

  const [search, setSearch] = useState('');

  // Dealer form state
  const [dealerFormOpen, setDealerFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Dealer | null>(null);

  // Visit form state
  const [visitFormOpen, setVisitFormOpen] = useState(false);
  const [visitDealer, setVisitDealer] = useState<Dealer | null>(null);

  // ── Auth + initial load ────────────────────────────────────────────────────
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
      const [data, visitsMap, active, todayVis] = await Promise.all([
        fetchDealers(uid),
        fetchLastVisitsByExec(uid),
        fetchActiveVisit(uid),
        fetchTodayVisits(uid),
      ]);
      data.sort((a, b) => {
        const ta = (a.createdAt as any)?.toMillis?.() ?? 0;
        const tb = (b.createdAt as any)?.toMillis?.() ?? 0;
        return tb - ta || a.shopName.localeCompare(b.shopName);
      });
      setDealers(data);
      setLastVisits(visitsMap);
      setActiveVisit(active);
      setTodayVisits(todayVis);
      setPageState('ready');
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load dealers.');
      setPageState('error');
    }
  };

  /** Refresh only visit state (faster than full reload). */
  const refreshVisits = async (uid: string) => {
    const [visitsMap, active, todayVis] = await Promise.all([
      fetchLastVisitsByExec(uid),
      fetchActiveVisit(uid),
      fetchTodayVisits(uid),
    ]);
    setLastVisits(visitsMap);
    setActiveVisit(active);
    setTodayVisits(todayVis);
  };

  // ── Search filter ──────────────────────────────────────────────────────────
  const filtered = dealers.filter((d) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      d.shopName.toLowerCase().includes(q) ||
      d.ownerName.toLowerCase().includes(q) ||
      d.phone.includes(q)
    );
  });

  // ── Dealer CRUD ────────────────────────────────────────────────────────────
  const handleAddDealer = async (input: DealerInput) => {
    if (!user) return;
    await createDealer(user.uid, input);
    await load(user.uid);
  };

  const handleEditDealer = async (input: DealerInput) => {
    if (!editTarget) return;
    await updateDealer(editTarget.id, input);
    setEditTarget(null);
    await load(user!.uid);
  };

  const handleDeactivate = async (dealer: Dealer) => {
    await deactivateDealer(dealer.id);
    setDealers((prev) => prev.filter((d) => d.id !== dealer.id));
  };

  const openAddDealer = () => { setEditTarget(null); setDealerFormOpen(true); };
  const openEditDealer = (dealer: Dealer) => { setEditTarget(dealer); setDealerFormOpen(true); };
  const closeDealerForm = () => { setDealerFormOpen(false); setEditTarget(null); };

  // ── Visit lifecycle ────────────────────────────────────────────────────────
  const handleOpenVisitForm = (dealer: Dealer) => {
    setVisitDealer(dealer);
    setVisitFormOpen(true);
  };

  const handleStartVisit = async (input: VisitInput) => {
    if (!user) return;
    await startVisit(user.uid, input);
    await refreshVisits(user.uid);
  };

  const handleEndVisit = async (visit: DealerVisit) => {
    if (!user) return;
    const result = await getUserLocation();
    await endVisit(visit.id, visit.startedAt ?? visit.visitedAt, {
      lat: result.coords.lat,
      lng: result.coords.lng,
    });
    await refreshVisits(user.uid);
  };

  const closeVisitForm = () => { setVisitFormOpen(false); setVisitDealer(null); };

  // ── Render ─────────────────────────────────────────────────────────────────
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
          <h1 className="text-base font-bold text-on-surface">Dealer Visit</h1>
          <p className="text-xs text-on-surface-variant">
            {pageState === 'ready'
              ? `${dealers.length} dealer${dealers.length !== 1 ? 's' : ''}${activeVisit ? ' · 1 active visit' : ''}`
              : 'Loading…'}
          </p>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 px-4 pb-24 pt-4">

        {/* Search */}
        {pageState === 'ready' && dealers.length > 0 && (
          <div className="mb-4">
            <DealerSearch value={search} onChange={setSearch} />
          </div>
        )}

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

        {/* Empty state */}
        {pageState === 'ready' && dealers.length === 0 && (
          <div className="flex flex-col items-center justify-center pt-20 text-center">
            <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/10">
              <svg className="h-10 w-10 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5A2.25 2.25 0 0 0 11.25 11h-1.5A2.25 2.25 0 0 0 7.5 13.5V21m4.5-10.5h-1.5m9-4.5H3m18 0c0-3.314-2.686-6-6-6S9 2.686 9 6m9 0H6" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-on-surface">No dealers yet</h2>
            <p className="mt-2 max-w-xs text-sm text-on-surface-variant">
              Tap the <span className="font-semibold text-harvest">+</span> button to add your first dealer.
            </p>
          </div>
        )}

        {/* No search results */}
        {pageState === 'ready' && dealers.length > 0 && filtered.length === 0 && (
          <div className="mt-6 rounded-2xl bg-surface-container px-5 py-5 text-center">
            <p className="text-sm font-semibold text-on-surface">No results for "{search}"</p>
            <p className="mt-1 text-xs text-on-surface-variant">Try a different name or phone number.</p>
          </div>
        )}

        {/* Dealer list */}
        {pageState === 'ready' && filtered.length > 0 && (
          <>
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-outline">
              Dealers
            </p>
            <div className="space-y-3">
              {filtered.map((dealer) => (
                <DealerCard
                  key={dealer.id}
                  dealer={dealer}
                  lastVisit={lastVisits.get(dealer.id) ?? null}
                  activeVisit={activeVisit}
                  onEdit={openEditDealer}
                  onDeactivate={handleDeactivate}
                  onStartVisit={handleOpenVisitForm}
                  onEndVisit={handleEndVisit}
                />
              ))}
            </div>
          </>
        )}

        {/* Today's Visits timeline */}
        {pageState === 'ready' && (
          <TodayVisits visits={todayVisits} />
        )}
      </main>

      {/* Dealer add/edit form */}
      <DealerForm
        open={dealerFormOpen}
        initial={editTarget}
        onClose={closeDealerForm}
        onSubmit={editTarget ? handleEditDealer : handleAddDealer}
      />

      {/* Visit start form */}
      <VisitForm
        open={visitFormOpen}
        dealer={visitDealer}
        onClose={closeVisitForm}
        onSubmit={handleStartVisit}
      />

      {/* FAB — opens Add Dealer */}
      <FloatingActionButton onClick={openAddDealer} label="Add dealer" />
    </div>
  );
}
