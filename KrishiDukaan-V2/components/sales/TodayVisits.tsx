import { Clock, CheckCircle, Zap } from 'lucide-react';
import type { DealerVisit } from '../../app/sales/dealers/dealer-visit-service';

interface TodayVisitsProps {
  visits: DealerVisit[];
}

function fmtTime(ts: unknown): string {
  if (!ts || typeof (ts as any).toDate !== 'function') return '—';
  return (ts as any).toDate().toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function fmtDuration(mins: number | undefined, status: string | undefined, startedAt: unknown): string {
  // If ACTIVE, show live elapsed instead
  if (status === 'ACTIVE' && startedAt) {
    const startMs =
      typeof (startedAt as any)?.toMillis === 'function'
        ? (startedAt as any).toMillis()
        : Date.now();
    const elapsed = Math.floor((Date.now() - startMs) / 60_000);
    return formatMins(elapsed) + ' (live)';
  }
  if (typeof mins !== 'number') return '—';
  return formatMins(mins);
}

function formatMins(m: number): string {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

function purposeLabel(visit: DealerVisit): string {
  if (visit.purpose === 'Other' && visit.purposeOther) return visit.purposeOther;
  return visit.purpose;
}

export default function TodayVisits({ visits }: TodayVisitsProps) {
  if (visits.length === 0) return null;

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-outline">
          Today's Visits
        </p>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
          {visits.length}
        </span>
      </div>

      <div className="space-y-2">
        {visits.map((visit) => {
          const isActive = visit.status === 'ACTIVE';
          return (
            <div
              key={visit.id}
              className={`rounded-2xl p-4 ring-1 ${
                isActive
                  ? 'bg-primary/5 ring-primary/20'
                  : 'bg-white ring-outline/10'
              }`}
            >
              {/* Dealer + status badge */}
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-bold text-on-surface leading-tight">
                  {visit.dealerName}
                </p>
                {isActive ? (
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-white">
                    <Zap className="h-2.5 w-2.5" />
                    ACTIVE
                  </span>
                ) : (
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-surface-container px-2 py-0.5 text-[10px] font-semibold text-outline">
                    <CheckCircle className="h-2.5 w-2.5" />
                    Done
                  </span>
                )}
              </div>

              {/* Purpose */}
              <p className="mt-0.5 text-xs text-on-surface-variant">{purposeLabel(visit)}</p>

              {/* Time + duration */}
              <div className="mt-2 flex items-center gap-3 text-xs text-outline">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {fmtTime(visit.startedAt ?? visit.visitedAt)}
                  {visit.endedAt ? ` → ${fmtTime(visit.endedAt)}` : isActive ? ' → now' : ''}
                </span>
                <span className="h-1 w-1 rounded-full bg-outline/40" />
                <span className="font-medium text-on-surface-variant">
                  {fmtDuration(visit.visitDurationMinutes, visit.status, visit.startedAt ?? visit.visitedAt)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
