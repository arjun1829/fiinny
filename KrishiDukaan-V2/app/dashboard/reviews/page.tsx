"use client";

import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { Star, RefreshCw, MessageSquare, Store, Package } from "lucide-react";
import { auth, getUserProfile } from "../../firebase";
import { PageHeader } from "../_components/page-header";
import { fetchOwnerReviews, type ReviewDoc } from "../_lib/reviews-firestore";
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

function RatingSummary({ reviews }: { reviews: ReviewDoc[] }) {
  const { t } = useI18n();
  if (reviews.length === 0) return null;
  const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
  const counts = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => r.rating === star).length,
  }));
  return (
    <div className="mb-6 flex flex-wrap items-center gap-6 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest px-5 py-4 shadow-ambient">
      <div className="flex flex-col items-center gap-1">
        <span className="text-4xl font-bold text-on-surface tabular-nums">{avg.toFixed(1)}</span>
        <StarRow rating={Math.round(avg)} />
        <span className="text-xs text-on-surface-variant">{reviews.length} {t('reviewsLabel')}</span>
      </div>
      <div className="flex flex-col gap-1.5 flex-1 min-w-[140px]">
        {counts.map(({ star, count }) => (
          <div key={star} className="flex items-center gap-2 text-xs">
            <span className="w-3 text-right text-on-surface-variant">{star}</span>
            <Star className="h-3 w-3 fill-harvest text-harvest shrink-0" />
            <div className="h-1.5 flex-1 rounded-full bg-surface-container overflow-hidden">
              <div
                className="h-full rounded-full bg-harvest"
                style={{ width: `${reviews.length ? (count / reviews.length) * 100 : 0}%` }}
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
  const [uid, setUid] = useState<string | null>(null);
  const [reviews, setReviews] = useState<ReviewDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (userId: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchOwnerReviews(userId);
      setReviews(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load reviews.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLoading(false); return; }
      setUid(user.uid);
      await load(user.uid);
    });
    return () => unsub();
  }, [load]);

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
          <RatingSummary reviews={reviews} />
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
        </>
      )}
    </>
  );
}
