import { collection, getDocs, limit, orderBy, query, where, type Timestamp } from "firebase/firestore";
import { db } from "../../firebase";

export interface ReviewDoc {
  id: string;
  productId: string;
  productName: string;
  authorName: string;
  rating: number;
  comment: string;
  createdAt: Date | null;
}

/**
 * Fetch reviews for all products owned by a user.
 * Queries the `reviews` collection by `ownerId` or by `productOwnerId`.
 */
export async function fetchOwnerReviews(ownerId: string): Promise<ReviewDoc[]> {
  const results: ReviewDoc[] = [];

  // Primary: reviews have ownerId field pointing to the product owner
  try {
    const q = query(
      collection(db, "reviews"),
      where("ownerId", "==", ownerId),
      orderBy("createdAt", "desc"),
      limit(100),
    );
    const snap = await getDocs(q);
    snap.docs.forEach((d) => {
      const r = d.data() as Record<string, unknown>;
      results.push(mapReview(d.id, r));
    });
    if (results.length > 0) return results;
  } catch { /* collection may not exist yet or index missing */ }

  // Fallback: reviews keyed by productOwnerId
  try {
    const q2 = query(
      collection(db, "reviews"),
      where("productOwnerId", "==", ownerId),
      orderBy("createdAt", "desc"),
      limit(100),
    );
    const snap2 = await getDocs(q2);
    snap2.docs.forEach((d) => {
      const r = d.data() as Record<string, unknown>;
      results.push(mapReview(d.id, r));
    });
  } catch { /* ignore */ }

  return results;
}

function mapReview(id: string, r: Record<string, unknown>): ReviewDoc {
  const ts = r.createdAt as Timestamp | null;
  return {
    id,
    productId:   String(r.productId   ?? ""),
    productName: String(r.productName ?? r.product ?? ""),
    authorName:  String(r.authorName  ?? r.author  ?? r.userName ?? "Anonymous"),
    rating:      typeof r.rating === "number" ? Math.min(5, Math.max(1, r.rating)) : 0,
    comment:     String(r.comment ?? r.text ?? r.review ?? ""),
    createdAt:   typeof ts?.toDate === "function" ? ts.toDate() : null,
  };
}
