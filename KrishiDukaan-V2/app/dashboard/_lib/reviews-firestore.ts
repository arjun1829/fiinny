import {
  collection,
  count,
  doc,
  getAggregateFromServer,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  sum,
  where,
  type DocumentData,
  type Query,
  type QueryDocumentSnapshot,
  type Timestamp,
} from "firebase/firestore";
import { db } from "../../firebase";

export interface ReviewDoc {
  id: string;
  productId: string;
  productName: string;
  authorName: string;
  rating: number;
  comment: string;
  createdAt: Date | null;
  reviewType: "store" | "product";
}

/**
 * The phone the seller's store reviews are keyed by (storeReviews.storePhone):
 * uidIndex/{uid}.phone, or the id itself for phone-keyed accounts.
 *
 * Only storeReviews is read. The legacy `reviews` collection has no security
 * rule, so the queries this file used to run against it were refused on
 * every visit and never returned anything.
 */
export async function resolveReviewPhone(ownerId: string): Promise<string> {
  try {
    const idxSnap = await getDoc(doc(db, "uidIndex", ownerId));
    if (idxSnap.exists() && idxSnap.data().phone) return String(idxSnap.data().phone);
  } catch { /* fall through */ }
  return ownerId;
}

/** The seller's store reviews, newest first (page with usePagedQuery). */
export function ownerReviewsQuery(phone: string): Query<DocumentData> {
  return query(collection(db, "storeReviews"), where("storePhone", "==", phone), orderBy("createdAt", "desc"));
}

export function toReviewDoc(d: QueryDocumentSnapshot<DocumentData>): ReviewDoc {
  return mapReview(d.id, d.data() as Record<string, unknown>, "store");
}

export type ReviewSummary = { count: number; average: number; stars: Record<1 | 2 | 3 | 4 | 5, number> };

/**
 * Rating summary over ALL the seller's store reviews from count and sum
 * queries (7 small reads), not by reading the reviews.
 */
export async function fetchReviewSummary(phone: string): Promise<ReviewSummary> {
  const base = query(collection(db, "storeReviews"), where("storePhone", "==", phone));
  const [agg, ...starCounts] = await Promise.all([
    getAggregateFromServer(base, { n: count(), total: sum("rating") }),
    ...[1, 2, 3, 4, 5].map((star) =>
      getCountFromServer(query(base, where("rating", "==", star))).then((c) => c.data().count)),
  ]);
  const n = agg.data().n;
  return {
    count: n,
    average: n > 0 ? Number(agg.data().total ?? 0) / n : 0,
    stars: { 1: starCounts[0], 2: starCounts[1], 3: starCounts[2], 4: starCounts[3], 5: starCounts[4] },
  };
}

/** The seller's newest store reviews (dashboard Home card). */
export async function fetchRecentOwnerReviews(ownerId: string, max = 5): Promise<ReviewDoc[]> {
  const phone = await resolveReviewPhone(ownerId);
  const snap = await getDocs(query(ownerReviewsQuery(phone), limit(max)));
  return snap.docs.map(toReviewDoc);
}

function mapReview(id: string, r: Record<string, unknown>, reviewType: ReviewDoc["reviewType"] = "product"): ReviewDoc {
  const ts = r.createdAt as Timestamp | null;
  return {
    id,
    reviewType,
    productId:   String(r.productId   ?? ""),
    productName: String(r.productName ?? r.product ?? (reviewType === "store" ? "Store Review" : "")),
    authorName:  String(r.reviewerName ?? r.authorName  ?? r.author  ?? r.userName ?? "Anonymous"),
    rating:      typeof r.rating === "number" ? Math.min(5, Math.max(1, r.rating)) : 0,
    comment:     String(r.reviewText ?? r.comment ?? r.text ?? r.review ?? ""),
    createdAt:   typeof ts?.toDate === "function" ? ts.toDate() : null,
  };
}
