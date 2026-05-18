import type { Metadata } from "next";
import { recentReviews } from "../_data/mock";
import { PageHeader } from "../_components/page-header";
import { ReviewsFullList } from "../_components/reviews-full-list";

export const metadata: Metadata = {
  title: "Reviews",
};

export default function ReviewsPage() {
  return (
    <>
      <PageHeader
        title="Reviews"
        description="Monitor shopper sentiment and follow up on recent feedback."
        helperKey="dashReviews"
      />
      <ReviewsFullList seed={recentReviews} />
    </>
  );
}
