"use client";

import Link from "next/link";
import { Star } from "lucide-react";
import type { ReviewItem } from "../_data/mock";
import { useI18n } from "../../i18n/I18nContext";

export function RecentReviews({ reviews }: { reviews: ReviewItem[] }) {
  const { t } = useI18n();

  return (
    <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-ambient md:p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-on-surface">{t('recentReviewsTitle')}</h2>
          <p className="mt-0.5 text-sm text-on-surface-variant">{t('latestFeedback')}</p>
        </div>
        <Link
          href="/dashboard/reviews"
          className="text-xs font-semibold text-primary hover:underline"
        >
          {t('sideReviews')}
        </Link>
      </div>

      {reviews.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-2 rounded-xl border border-dashed border-outline-variant/40 py-8 text-center">
          <Star className="h-6 w-6 text-on-surface-variant/30" />
          <p className="text-sm font-medium text-on-surface-variant">No reviews yet</p>
          <p className="text-xs text-on-surface-variant/60">Customer reviews will appear here</p>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {reviews.map((r) => (
            <li
              key={r.id}
              className="flex gap-3 rounded-xl border border-outline-variant/25 bg-surface-container-low/80 p-3"
            >
              <div className="flex shrink-0 items-center gap-0.5 text-amber-500">
                {Array.from({ length: r.rating }).map((_, i) => (
                  <Star key={i} className="h-3.5 w-3.5 fill-current" />
                ))}
              </div>
              <div>
                <p className="text-sm text-on-surface">{r.excerpt}</p>
                <p className="mt-1 text-xs text-on-surface-variant">
                  {r.author} · {r.product}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
