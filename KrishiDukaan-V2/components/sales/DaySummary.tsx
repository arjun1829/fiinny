"use client";

import { Clock, MapPin, Store, CheckCircle } from 'lucide-react';
import type { DaySession } from '../../app/sales/day-session-service';

interface DaySummaryProps {
  session: DaySession;
  visitCount: number;
}

function fmtTime(ts: unknown): string {
  if (!ts || typeof (ts as any).toDate !== 'function') return '—';
  return (ts as any).toDate().toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function fmtDuration(mins: number | undefined): string {
  if (typeof mins !== 'number') return '—';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function liveElapsed(startedAt: unknown): string {
  if (!startedAt || typeof (startedAt as any).toMillis !== 'function') return '—';
  const mins = Math.floor((Date.now() - (startedAt as any).toMillis()) / 60_000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function DaySummary({ session, visitCount }: DaySummaryProps) {
  const isActive    = session.status === 'ACTIVE';
  const hasDistance = typeof session.totalDistanceKm === 'number';

  return (
    <div className={`rounded-2xl p-4 ring-1 ${isActive ? 'bg-primary/5 ring-primary/25' : 'bg-white ring-outline/10'}`}>

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
          Today's Summary
        </p>
        {isActive ? (
          <span className="flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold text-white">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            LIVE
          </span>
        ) : (
          <span className="flex items-center gap-1 rounded-full bg-surface-container px-2.5 py-1 text-[10px] font-semibold text-outline">
            <CheckCircle className="h-3 w-3" />
            Completed
          </span>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Started" value={fmtTime(session.startedAt)} />
        <Stat label="Ended"   value={isActive ? '—' : fmtTime(session.endedAt)} />
        <Stat
          label="Visits"
          value={`${visitCount}`}
          icon={<Store className="h-3.5 w-3.5 text-outline" />}
        />
        <Stat
          label="Working Time"
          value={isActive ? liveElapsed(session.startedAt) : fmtDuration(session.totalWorkingMinutes)}
          icon={<Clock className="h-3.5 w-3.5 text-outline" />}
        />
      </div>

      {/* Distance */}
      <div className="mt-3 flex items-start gap-3 rounded-xl bg-surface-container-low px-4 py-3">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-outline">Total Distance</p>
          {isActive ? (
            <p className="text-sm text-on-surface-variant">Calculated when you end the day</p>
          ) : hasDistance ? (
            <p className="text-lg font-black text-primary">{session.totalDistanceKm!.toFixed(1)} km</p>
          ) : (
            <p className="text-sm text-outline">Not calculated</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-surface-container-low px-3 py-2.5">
      <div className="flex items-center gap-1 mb-0.5">
        {icon}
        <p className="text-[10px] font-semibold uppercase tracking-wider text-outline">{label}</p>
      </div>
      <p className="text-sm font-bold text-on-surface">{value}</p>
    </div>
  );
}
