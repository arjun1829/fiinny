import { collection, getDocs, limit, query, where, type Timestamp, doc, getDoc } from "firebase/firestore";
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

export async function fetchOwnerReviews(ownerId: string): Promise<ReviewDoc[]> {
  const results: ReviewDoc[] = [];

  // Resolve phone from uidIndex
  let phone = ownerId;
  try {
    const idxSnap = await getDoc(doc(db, 'uidIndex', ownerId));
    if (idxSnap.exists() && idxSnap.data().phone) {
       phone = String(idxSnap.data().phone);
    }
  } catch {}

  // 1. Fetch from storeReviews (new schema) — no orderBy to avoid needing a composite index
  try {
    const qStore = query(
      collection(db, "storeReviews"),
      where("storePhone", "==", phone),
      limit(100),
    );
    const snapStore = await getDocs(qStore);
    snapStore.docs.forEach((d) => {
      const r = d.data() as Record<string, unknown>;
      results.push(mapReview(d.id, r, "store"));
    });
  } catch {}

  // Primary: reviews have ownerId field pointing to the product owner (legacy)
  try {
    const q = query(
      collection(db, "reviews"),
      where("ownerId", "==", ownerId),
      limit(100),
    );
    const snap = await getDocs(q);
    snap.docs.forEach((d) => {
      const r = d.data() as Record<string, unknown>;
      results.push(mapReview(d.id, r));
    });
  } catch { /* collection may not exist yet or index missing */ }

  // Fallback: reviews keyed by productOwnerId (legacy)
  try {
    const q2 = query(
      collection(db, "reviews"),
      where("productOwnerId", "==", ownerId),
      limit(100),
    );
    const snap2 = await getDocs(q2);
    snap2.docs.forEach((d) => {
      const r = d.data() as Record<string, unknown>;
      results.push(mapReview(d.id, r));
    });
  } catch { /* ignore */ }

  // Sort results by date descending since we merged multiple sources
  return results.sort((a, b) => {
    const tA = a.createdAt?.getTime() ?? 0;
    const tB = b.createdAt?.getTime() ?? 0;
    return tB - tA;
  });
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
