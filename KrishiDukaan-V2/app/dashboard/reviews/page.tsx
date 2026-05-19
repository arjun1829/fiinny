"use client";

import { recentReviews } from "../_data/mock";
import { PageHeader } from "../_components/page-header";
import { ReviewsFullList } from "../_components/reviews-full-list";
import { useI18n } from "../../i18n/I18nContext";

export default function ReviewsPage() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader
        title={t('reviewsTitle')}
        description={t('reviewsDesc')}
        helperKey="dashReviews"
      />
      <ReviewsFullList seed={recentReviews} />
    </>
  );
}
