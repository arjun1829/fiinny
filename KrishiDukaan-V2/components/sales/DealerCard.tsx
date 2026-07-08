"use client";

import { useEffect, useState } from 'react';
import { Phone, MapPin, Pencil, PowerOff, Store, ClipboardCheck, Clock, Zap, Loader2 } from 'lucide-react';
import type { Dealer } from '../../app/sales/dealers/dealers-service';
import type { DealerVisit } from '../../app/sales/dealers/dealer-visit-service';

interface DealerCardProps {
  dealer: Dealer;
  lastVisit?: DealerVisit | null;    // last COMPLETED visit (for the strip)
  activeVisit: DealerVisit | null;   // global active visit (any dealer), null if none
  onEdit: (dealer: Dealer) => void;
  onDeactivate: (dealer: Dealer) => void;
  onStartVisit: (dealer: Dealer) => void;
  onEndVisit: (visit: DealerVisit) => Promise<void>;
}

function formatRelative(ts: unknown): string {
  if (!ts || typeof (ts as any).toMillis !== 'function') return '';
  const diffMs = Date.now() - (ts as any).toMillis();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function formatElapsed(startMs: number): string {
  const mins = Math.floor((Date.now() - startMs) / 60_000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function DealerCard({
  dealer,
  lastVisit,
  activeVisit,
  onEdit,
  onDeactivate,
  onStartVisit,
  onEndVisit,
}: DealerCardProps) {
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [ending, setEnding] = useState(false);
  const [elapsed, setElapsed] = useState('0m');

  const isThisActive = activeVisit?.dealerId === dealer.id;
  const isOtherActive = !!activeVisit && activeVisit.dealerId !== dealer.id;

  // ── Live elapsed timer (only for the active dealer) ───────────────────────
  useEffect(() => {
    if (!isThisActive) return;
    const ts = activeVisit?.startedAt ?? activeVisit?.visitedAt;
    const startMs =
      typeof (ts as any)?.toMillis === 'function' ? (ts as any).toMillis() : Date.now();

    const tick = () => setElapsed(formatElapsed(startMs));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [isThisActive, activeVisit]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleCall = () => {
    if (dealer.phone) window.location.href = `tel:${dealer.phone}`;
  };

  const handleMaps = () => {
    if (!dealer.geo) return;
    const { latitude, longitude } = dealer.geo;
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
      '_blank',
    );
  };

  const handleDeactivate = () => {
    if (!confirmDeactivate) {
      setConfirmDeactivate(true);
      setTimeout(() => setConfirmDeactivate(false), 3000);
      return;
    }
    onDeactivate(dealer);
  };

  const handleEndVisit = async () => {
    if (!activeVisit || ending) return;
    setEnding(true);
    try {
      await onEndVisit(activeVisit);
    } finally {
      setEnding(false);
    }
  };

  // ── Last visit label ──────────────────────────────────────────────────────
  const visitLabel = lastVisit
    ? (lastVisit.purpose === 'Other' && lastVisit.purposeOther
        ? lastVisit.purposeOther
        : lastVisit.purpose)
    : null;

  return (
    <div className={`rounded-2xl bg-white shadow-sm ring-1 overflow-hidden transition-all ${
      isThisActive ? 'ring-primary/40 shadow-md' : 'ring-outline/10'
    }`}>
      <div className="p-4">

        {/* Header */}
        <div className="flex items-start gap-3">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
            isThisActive ? 'bg-primary' : 'bg-primary/10'
          }`}>
            <Store className={`h-5 w-5 ${isThisActive ? 'text-white' : 'text-primary'}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-bold text-on-surface">{dealer.shopName}</p>
              {isThisActive && (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-white">
                  <Zap className="h-2.5 w-2.5" />
                  ACTIVE
                </span>
              )}
            </div>
            <p className="truncate text-xs text-on-surface-variant">{dealer.ownerName}</p>
          </div>
        </div>

        {/* Details */}
        <div className="mt-3 space-y-1.5">
          {dealer.phone ? (
            <div className="flex items-center gap-2 text-xs text-on-surface-variant">
              <Phone className="h-3.5 w-3.5 shrink-0 text-outline" />
              <span>{dealer.phone}</span>
            </div>
          ) : null}
          {dealer.address ? (
            <div className="flex items-start gap-2 text-xs text-on-surface-variant">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-outline" />
              <span className="line-clamp-2">{dealer.address}</span>
            </div>
          ) : null}
        </div>

        {/* Active visit — elapsed timer */}
        {isThisActive ? (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-primary/10 px-3 py-2">
            <Clock className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="text-xs font-semibold text-primary">Visit in progress · {elapsed}</span>
          </div>
        ) : (
          /* Last completed visit strip */
          lastVisit ? (
            <div className="mt-3 flex items-center gap-1.5 rounded-xl bg-surface-container-low px-3 py-2">
              <Clock className="h-3.5 w-3.5 shrink-0 text-outline" />
              <span className="text-xs text-on-surface-variant">
                Last visit{' '}
                <span className="font-semibold text-on-surface">{formatRelative(lastVisit.visitedAt)}</span>
                {visitLabel ? (
                  <>
                    {' · '}
                    <span className="font-semibold text-primary">{visitLabel}</span>
                  </>
                ) : null}
              </span>
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-1.5 rounded-xl bg-surface-container-low px-3 py-2">
              <Clock className="h-3.5 w-3.5 shrink-0 text-outline/50" />
              <span className="text-xs text-outline">No visits yet</span>
            </div>
          )
        )}

        {/* Primary CTA */}
        {isThisActive ? (
          <button
            onClick={handleEndVisit}
            disabled={ending}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-red-500 py-2.5 text-sm font-bold text-white shadow-sm transition active:scale-95 hover:bg-red-600 disabled:opacity-60"
          >
            {ending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {ending ? 'Capturing location…' : 'End Visit'}
          </button>
        ) : (
          <button
            onClick={() => !isOtherActive && onStartVisit(dealer)}
            disabled={isOtherActive}
            title={isOtherActive ? 'Another visit is already in progress' : undefined}
            className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white shadow-sm transition active:scale-95 ${
              isOtherActive
                ? 'cursor-not-allowed bg-outline/30'
                : 'bg-primary hover:bg-primary-container'
            }`}
          >
            <ClipboardCheck className="h-4 w-4" />
            {isOtherActive ? 'Visit In Progress' : 'Start Visit'}
          </button>
        )}
      </div>

      {/* Secondary actions */}
      <div className="flex items-center border-t border-outline/10">
        <button
          onClick={handleCall}
          disabled={!dealer.phone}
          className="flex flex-1 items-center justify-center gap-1 py-2.5 text-xs font-semibold text-primary transition hover:bg-primary/5 active:scale-95 disabled:opacity-40"
        >
          <Phone className="h-3.5 w-3.5" />
          Call
        </button>

        <div className="w-px self-stretch bg-outline/10" />

        <button
          onClick={handleMaps}
          disabled={!dealer.geo}
          className="flex flex-1 items-center justify-center gap-1 py-2.5 text-xs font-semibold text-on-surface-variant transition hover:bg-surface-container active:scale-95 disabled:opacity-40"
        >
          <MapPin className="h-3.5 w-3.5" />
          Maps
        </button>

        <div className="w-px self-stretch bg-outline/10" />

        <button
          onClick={() => onEdit(dealer)}
          className="flex flex-1 items-center justify-center gap-1 py-2.5 text-xs font-semibold text-on-surface-variant transition hover:bg-surface-container active:scale-95"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </button>

        <div className="w-px self-stretch bg-outline/10" />

        <button
          onClick={handleDeactivate}
          className={`flex flex-1 items-center justify-center gap-1 py-2.5 text-xs font-semibold transition active:scale-95 ${
            confirmDeactivate
              ? 'bg-red-50 text-red-600'
              : 'text-on-surface-variant hover:bg-surface-container'
          }`}
        >
          <PowerOff className="h-3.5 w-3.5" />
          {confirmDeactivate ? 'Sure?' : 'Off'}
        </button>
      </div>
    </div>
  );
}
