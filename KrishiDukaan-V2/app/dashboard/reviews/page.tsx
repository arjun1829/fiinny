"use client";

import { useEffect, useMemo, useState } from "react";
import { useEffectiveUser } from "../_context/effective-user-context";
import { Star, RefreshCw, MessageSquare, Store, Package } from "lucide-react";
import { PageHeader } from "../_components/page-header";
import {
  fetchReviewSummary,
  ownerReviewsQuery,
  resolveReviewPhone,
  toReviewDoc,
  type ReviewSummary,
} from "../_lib/reviews-firestore";
import { usePagedQuery } from "../../lib/use-paged-query";
import { useI18n } from "../../i18n/I18nContext";
function StarRow({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-harvest">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={`h-3.5 w-3.5 ${i < rating ? "fill-current" : "opacity-25"}`} />
      ))}
    </span>
  );
}

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

/** Over ALL the seller's reviews (count and sum queries), not just the loaded ones. */
function RatingSummary({ summary }: { summary: ReviewSummary }) {
  const { t } = useI18n();
  if (summary.count === 0) return null;
  const avg = summary.average;
  const counts = ([5, 4, 3, 2, 1] as const).map((star) => ({ star, count: summary.stars[star] }));
  const total = summary.count;
  return (
    <div className="mb-6 flex flex-wrap items-center gap-6 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest px-5 py-4 shadow-ambient">
      <div className="flex flex-col items-center gap-1">
        <span className="text-4xl font-bold text-on-surface tabular-nums">{avg.toFixed(1)}</span>
        <StarRow rating={Math.round(avg)} />
        <span className="text-xs text-on-surface-variant">{total} {t('reviewsLabel')}</span>
      </div>
      <div className="flex flex-col gap-1.5 flex-1 min-w-[140px]">
        {counts.map(({ star, count }) => (
          <div key={star} className="flex items-center gap-2 text-xs">
            <span className="w-3 text-right text-on-surface-variant">{star}</span>
            <Star className="h-3 w-3 fill-harvest text-harvest shrink-0" />
            <div className="h-1.5 flex-1 rounded-full bg-surface-container overflow-hidden">
              <div
                className="h-full rounded-full bg-harvest"
                style={{ width: `${total ? (count / total) * 100 : 0}%` }}
              />
            </div>
            <span className="w-5 text-right text-on-surface-variant tabular-nums">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ReviewsPage() {
  const { t } = useI18n();
  const { uid: effectiveUid } = useEffectiveUser();
  const [uid, setUid] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // Newest 50 store reviews, "Load more" for older; the summary covers all.
  const base = useMemo(() => (phone ? ownerReviewsQuery(phone) : null), [phone]);
  const paged = usePagedQuery(base, toReviewDoc);
  const reviews = paged.rows;
  const loading = paged.loading || (!!effectiveUid && phone === null);
  const error = paged.error ?? summaryError;

  const loadSummary = (p: string) => {
    setSummaryError(null);
    fetchReviewSummary(p).then(setSummary).catch((e) => {
      setSummaryError(e instanceof Error ? e.message : "Failed to load reviews.");
    });
  };
  const load = (_userId: string) => {
    void paged.reload();
    if (phone) loadSummary(phone);
  };

  useEffect(() => {
    if (!effectiveUid) { setPhone(null); return; }
    setUid(effectiveUid);
    let cancelled = false;
    resolveReviewPhone(effectiveUid).then((p) => {
      if (cancelled) return;
      setPhone(p);
      loadSummary(p);
    });
    return () => { cancelled = true; };
  }, [effectiveUid]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title={t('reviewsTitle')}
          description={t('reviewsRealFeedback')}
          helperKey="dashReviews"
        />
        {uid && (
          <button
            type="button"
            onClick={() => uid && load(uid)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 px-3 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            {t('refreshBtn')}
          </button>
        )}
      </div>

      {error ? (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {loading ? (
        <div className="flex min-h-[200px] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : reviews.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-outline-variant/50 bg-surface-container-low/40 px-6 py-16 text-center">
          <div className="rounded-full bg-surface-container p-4">
            <MessageSquare className="h-8 w-8 text-on-surface-variant/40" />
          </div>
          <div>
            <p className="text-base font-semibold text-on-surface">{t('noReviewsYet')}</p>
            <p className="mt-1 text-sm text-on-surface-variant max-w-sm mx-auto">
              {t('noReviewsDesc')}
            </p>
          </div>
        </div>
      ) : (
        <>
          {summary && <RatingSummary summary={summary} />}
          <ul className="divide-y divide-outline-variant/25 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-ambient">
            {reviews.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 p-4 md:flex-row md:items-start md:justify-between md:p-5">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-on-surface">{r.authorName}</span>
                    <StarRow rating={r.rating} />
                    {r.reviewType === "store" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-bold px-2 py-0.5">
                        <Store className="h-2.5 w-2.5" /> Store Review
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/8 border border-primary/20 text-primary text-[10px] font-bold px-2 py-0.5">
                        <Package className="h-2.5 w-2.5" /> Product Review
                      </span>
                    )}
                  </div>
                  {r.comment ? (
                    <p className="mt-2 max-w-prose text-sm text-on-surface-variant">{r.comment}</p>
                  ) : null}
                  {r.productName ? (
                    <p className="mt-2 text-xs font-medium text-primary">{r.productName}</p>
                  ) : null}
                </div>
                <span className="shrink-0 text-xs text-on-surface-variant md:text-sm whitespace-nowrap">
                  {formatDate(r.createdAt)}
                </span>
              </li>
            ))}
          </ul>
          {paged.hasMore && (
            <div className="flex justify-center py-4">
              <button type="button" onClick={() => void paged.loadMore()} disabled={paged.loadingMore}
                className="rounded-xl border border-outline-variant/40 px-4 py-2 text-sm font-medium text-on-surface hover:bg-surface-container disabled:opacity-60">
                {paged.loadingMore ? "Loading…" : "Load older reviews"}
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
