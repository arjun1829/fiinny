import { Clock } from 'lucide-react';
import { sortVisits, type DealerVisit } from '../../app/sales/dealers/dealer-visit-service';
import type { DaySession } from '../../app/sales/day-session-service';

interface VisitTimelineProps {
  session: DaySession;
  visits: DealerVisit[];
}

function fmtTime(ts: unknown): string {
  if (!ts || typeof (ts as any).toDate !== 'function') return '—';
  return (ts as any).toDate().toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function Connector({ show }: { show: boolean }) {
  if (!show) return null;
  return <div className="mx-auto mt-1 w-0.5 min-h-[16px] bg-outline/20" />;
}

export default function VisitTimeline({ session, visits }: VisitTimelineProps) {
  const ordered = sortVisits(visits);

  return (
    <div className="mt-2">

      {/* Start row */}
      <div className="flex gap-3">
        <div className="flex w-7 shrink-0 flex-col items-center pt-1">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-green-600 text-[11px] font-bold text-white">
            S
          </div>
          <Connector show={ordered.length > 0 || !!session.endGeo} />
        </div>
        <div className="flex-1 rounded-2xl bg-white p-3 ring-1 ring-outline/10 mb-2">
          <p className="text-sm font-bold text-green-700">Start of Day</p>
          <div className="mt-1 flex items-center gap-1 text-xs text-outline">
            <Clock className="h-3 w-3" />
            <span>{fmtTime(session.startedAt)}</span>
          </div>
        </div>
      </div>

      {/* Visit rows */}
      {ordered.length === 0 && !session.endGeo && (
        <div className="py-4 text-center">
          <p className="text-sm text-on-surface-variant">No visits recorded for this session.</p>
        </div>
      )}

      {ordered.map((visit, index) => {
        const isLastVisit = index === ordered.length - 1;
        const showConnector = !isLastVisit || !!session.endGeo;
        const purpose = visit.purpose === 'Other' && visit.purposeOther
          ? visit.purposeOther
          : visit.purpose;
        return (
          <div key={visit.id} className="flex gap-3">
            <div className="flex w-7 shrink-0 flex-col items-center pt-1">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">
                {index + 1}
              </div>
              <Connector show={showConnector} />
            </div>
            <div className={`flex-1 rounded-2xl bg-white p-3 ring-1 ring-outline/10 ${showConnector ? 'mb-2' : 'mb-0'}`}>
              <p className="text-sm font-bold text-on-surface leading-tight">{visit.dealerName}</p>
              {purpose && (
                <p className="text-xs text-on-surface-variant mt-0.5">{purpose}</p>
              )}
              <div className="mt-1.5 flex items-center gap-1 text-xs text-outline">
                <Clock className="h-3 w-3" />
                <span>{fmtTime(visit.visitedAt)}</span>
              </div>
            </div>
          </div>
        );
      })}

      {/* End row — only when session is completed */}
      {session.endGeo && (
        <div className="flex gap-3">
          <div className="flex w-7 shrink-0 flex-col items-center pt-1">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-red-600 text-[11px] font-bold text-white">
              E
            </div>
          </div>
          <div className="flex-1 rounded-2xl bg-white p-3 ring-1 ring-outline/10">
            <p className="text-sm font-bold text-red-700">End of Day</p>
            <div className="mt-1 flex items-center gap-1 text-xs text-outline">
              <Clock className="h-3 w-3" />
              <span>{fmtTime(session.endedAt)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
