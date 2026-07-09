"use client";

import { useState } from 'react';
import { Phone, MapPin, Pencil, PowerOff, Store, ClipboardCheck, Clock, CheckCircle } from 'lucide-react';
import type { Dealer } from '../../app/sales/dealers/dealers-service';
import type { DealerVisit } from '../../app/sales/dealers/dealer-visit-service';

interface DealerCardProps {
  dealer: Dealer;
  currentUserId: string;
  lastVisit?: DealerVisit | null;
  todayVisit?: DealerVisit | null;
  onEdit: (dealer: Dealer) => void;
  onDeactivate: (dealer: Dealer) => void;
  onMarkAsVisited: () => void;
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

function formatTime(ts: unknown): string {
  if (!ts || typeof (ts as any).toDate !== 'function') return '';
  return (ts as any).toDate().toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export default function DealerCard({
  dealer,
  currentUserId,
  lastVisit,
  todayVisit,
  onEdit,
  onDeactivate,
  onMarkAsVisited,
}: DealerCardProps) {
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  const canEdit = dealer.createdBy === currentUserId;

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

  return (
    <div className="rounded-2xl bg-white shadow-sm ring-1 ring-outline/10 overflow-hidden transition-all">
      <div className="p-4">

        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Store className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-on-surface">{dealer.shopName}</p>
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

        {/* Visit status strip */}
        {todayVisit ? (
          <div className="mt-3 flex items-center gap-1.5 rounded-xl bg-green-50 px-3 py-2">
            <CheckCircle className="h-3.5 w-3.5 shrink-0 text-green-600" />
            <span className="text-xs font-semibold text-green-700">
              Last visited today · {formatTime(todayVisit.visitedAt)}
            </span>
          </div>
        ) : lastVisit ? (
          <div className="mt-3 flex items-center gap-1.5 rounded-xl bg-surface-container-low px-3 py-2">
            <Clock className="h-3.5 w-3.5 shrink-0 text-outline" />
            <span className="text-xs text-on-surface-variant">
              Last visit{' '}
              <span className="font-semibold text-on-surface">{formatRelative(lastVisit.visitedAt)}</span>
              {lastVisit.purpose ? (
                <>
                  {' · '}
                  <span className="font-semibold text-primary">
                    {lastVisit.purpose === 'Other' && lastVisit.purposeOther
                      ? lastVisit.purposeOther
                      : lastVisit.purpose}
                  </span>
                </>
              ) : null}
            </span>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-1.5 rounded-xl bg-surface-container-low px-3 py-2">
            <Clock className="h-3.5 w-3.5 shrink-0 text-outline/50" />
            <span className="text-xs text-outline">No visits yet</span>
          </div>
        )}

        {/* CTA — always visible; label/style changes based on visit state */}
        <button
          onClick={onMarkAsVisited}
          className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold shadow-sm transition active:scale-95 ${
            todayVisit
              ? 'border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10'
              : 'bg-primary text-white hover:bg-primary-container'
          }`}
        >
          <ClipboardCheck className="h-4 w-4" />
          {todayVisit ? 'Add Visit' : 'Mark as Visited'}
        </button>
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

        {canEdit && (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}
