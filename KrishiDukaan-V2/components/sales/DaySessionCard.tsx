import { ChevronRight, Clock, MapPin } from 'lucide-react';
import type { DaySession } from '../../app/sales/day-session-service';

interface DaySessionCardProps {
  session: DaySession;
  visitCount: number;
  onClick: () => void;
}

function fmtDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function fmtTime(ts: unknown): string {
  if (!ts || typeof (ts as any).toDate !== 'function') return '—';
  return (ts as any).toDate().toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function fmtDuration(mins: number | undefined): string {
  if (typeof mins !== 'number') return '—';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function DaySessionCard({ session, visitCount, onClick }: DaySessionCardProps) {
  const isActive = session.status === 'ACTIVE';

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-2xl bg-white p-4 ring-1 ring-outline/10 shadow-sm transition active:scale-[0.99] hover:ring-primary/20"
    >
      {/* Date row */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <p className="text-sm font-bold text-on-surface">{fmtDate(session.date)}</p>
        <div className="flex items-center gap-2">
          {isActive && (
            <span className="flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-white">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
              LIVE
            </span>
          )}
          <ChevronRight className="h-4 w-4 text-outline" />
        </div>
      </div>

      {/* Time + visits row */}
      <div className="grid grid-cols-3 gap-2 mb-2">
        <Chip label="Start"  value={fmtTime(session.startedAt)} />
        <Chip label="End"    value={isActive ? '—' : fmtTime(session.endedAt)} />
        <Chip label="Visits" value={String(visitCount)} />
      </div>

      {/* Distance + duration row */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center gap-1.5 rounded-xl bg-surface-container-low px-3 py-2">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-outline" />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-outline">Distance</p>
            <p className="text-xs font-bold text-on-surface truncate">
              {typeof session.totalDistanceKm === 'number'
                ? `${session.totalDistanceKm.toFixed(1)} km`
                : 'Not calculated'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-xl bg-surface-container-low px-3 py-2">
          <Clock className="h-3.5 w-3.5 shrink-0 text-outline" />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-outline">Duration</p>
            <p className="text-xs font-bold text-on-surface">{fmtDuration(session.totalWorkingMinutes)}</p>
          </div>
        </div>
      </div>
    </button>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-container-low px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-outline mb-0.5">{label}</p>
      <p className="text-xs font-bold text-on-surface">{value}</p>
    </div>
  );
}
