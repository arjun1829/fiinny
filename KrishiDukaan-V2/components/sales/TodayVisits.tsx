import { Clock, CheckCircle } from 'lucide-react';
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
        {visits.map((visit) => (
          <div
            key={visit.id}
            className="rounded-2xl bg-white p-4 ring-1 ring-outline/10"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-bold text-on-surface leading-tight">
                {visit.dealerName}
              </p>
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                <CheckCircle className="h-2.5 w-2.5" />
                Visited
              </span>
            </div>

            {visit.purpose && (
              <p className="mt-0.5 text-xs text-on-surface-variant">
                {visit.purpose === 'Other' && visit.purposeOther ? visit.purposeOther : visit.purpose}
              </p>
            )}

            <div className="mt-2 flex items-center gap-1 text-xs text-outline">
              <Clock className="h-3 w-3" />
              <span>{fmtTime(visit.visitedAt)}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
