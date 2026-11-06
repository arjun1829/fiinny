"use client";

import { Check, Clock, X, Minus } from "lucide-react";
import { fmtWhen, payoutTimeline, type PayoutTimeline, type TimelineOrder } from "../../lib/payout-timeline";

const TONE: Record<PayoutTimeline["tone"], string> = {
  good: "bg-green-50 text-green-800 border-green-200",
  info: "bg-blue-50 text-blue-800 border-blue-200",
  wait: "bg-amber-50 text-amber-800 border-amber-200",
  warn: "bg-orange-50 text-orange-800 border-orange-300",
  bad: "bg-red-50 text-red-800 border-red-200",
  muted: "bg-surface-container text-on-surface-variant border-outline-variant/40",
};

/** A small pill with where the money is now, for lists. */
export function PayoutHeadline({
  order,
  audience = "seller",
  kycPending,
}: {
  order: TimelineOrder;
  audience?: "seller" | "admin";
  kycPending?: boolean;
}) {
  const t = payoutTimeline(order, { audience, kycPending });
  return (
    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONE[t.tone]}`}>{t.headline}</span>
  );
}

/**
 * The order's money journey, step by step: placed → paid → held → delivered
 * → released → in the bank, with the date of each step done and what the
 * next one is waiting for.
 */
export function PayoutTimelineView({
  order,
  audience = "seller",
  compact = false,
  kycPending,
}: {
  order: TimelineOrder;
  audience?: "seller" | "admin";
  compact?: boolean;
  /** See payoutTimeline's opts.kycPending. */
  kycPending?: boolean;
}) {
  const t = payoutTimeline(order, { audience, kycPending });
  return (
    <div>
      {!compact && (
        <p className={`mb-3 inline-block rounded-full border px-3 py-1 text-xs font-bold ${TONE[t.tone]}`}>{t.headline}</p>
      )}
      <ol className="relative">
        {t.steps.map((s, i) => {
          const last = i === t.steps.length - 1;
          const dot =
            s.status === "done"
              ? "bg-green-600 text-white"
              : s.status === "current"
                ? "bg-amber-500 text-white ring-4 ring-amber-100"
                : s.status === "failed"
                  ? "bg-red-600 text-white"
                  : "bg-surface-container text-on-surface-variant";
          const Icon = s.status === "done" ? Check : s.status === "failed" ? X : s.status === "skipped" ? Minus : Clock;
          return (
            <li key={s.key} className="relative flex gap-3 pb-4 last:pb-0">
              {!last && (
                <span
                  className={`absolute left-[11px] top-6 h-[calc(100%-1.25rem)] w-0.5 ${s.status === "done" ? "bg-green-600/40" : "bg-outline-variant/40"}`}
                  aria-hidden
                />
              )}
              <span className={`relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${dot}`}>
                <Icon className="h-3.5 w-3.5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className={`text-sm font-semibold ${s.status === "upcoming" ? "text-on-surface-variant" : "text-on-surface"}`}>
                    {s.label}
                    <span className="sr-only"> ({s.status})</span>
                  </p>
                  {s.at && <p className="text-xs text-on-surface-variant">{fmtWhen(s.at)}</p>}
                </div>
                {s.detail && <p className="mt-0.5 text-xs leading-relaxed text-on-surface-variant">{s.detail}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
