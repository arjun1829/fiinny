import { collection, addDoc, getDocs, getDoc, updateDoc, serverTimestamp, query, where, doc } from 'firebase/firestore';
import { db } from './firebase';

export type Review = {
  id: string;
  targetId: string;
  reviewerPhone: string;
  reviewerName: string;
  rating: number;
  reviewText: string;
  createdAt: any;
  updatedAt?: any;
};

export async function addProductReview(catalogId: string, reviewerPhone: string, reviewerName: string, rating: number, reviewText: string) {
  // Persist the review. Aggregated ratings are computed from these docs at fetch time
  // (fetchMarketplaceProducts), so no aggregate write is needed here — and a customer
  // has no permission to update the product owner's doc anyway.
  const reviewsRef = collection(db, 'productReviews');
  await addDoc(reviewsRef, {
    catalogId,
    reviewerPhone,
    reviewerName,
    rating,
    reviewText,
    createdAt: serverTimestamp()
  });
}

export async function updateProductReview(reviewId: string, rating: number, reviewText: string) {
  const reviewRef = doc(db, 'productReviews', reviewId);
  await updateDoc(reviewRef, {
    rating,
    reviewText,
    updatedAt: serverTimestamp(),
  });
}

export async function getUserProductReview(catalogId: string, reviewerPhone: string): Promise<Review | null> {
  const reviewsRef = collection(db, 'productReviews');
  const q = query(reviewsRef, where('catalogId', '==', catalogId), where('reviewerPhone', '==', reviewerPhone));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data(), targetId: d.data().catalogId } as Review;
}

export async function getProductReviews(catalogId: string): Promise<Review[]> {
  const reviewsRef = collection(db, 'productReviews');
  const q = query(reviewsRef, where('catalogId', '==', catalogId));
  const snap = await getDocs(q);
  const results = snap.docs.map(doc => ({ id: doc.id, ...doc.data(), targetId: doc.data().catalogId }) as Review);
  return results.sort((a, b) => {
    const tA = a.createdAt?.toMillis?.() ?? 0;
    const tB = b.createdAt?.toMillis?.() ?? 0;
    return tB - tA;
  });
}

export async function addStoreReview(storePhone: string, reviewerPhone: string, reviewerName: string, rating: number, reviewText: string) {
  // Persist the review only. Aggregated store ratings are computed from these docs at
  // fetch time (fetchStores) — a customer cannot (and should not) write to the store's
  // own retailer/manufacturer document, which previously caused a permission error.
  const reviewsRef = collection(db, 'storeReviews');
  await addDoc(reviewsRef, {
    storePhone,
    reviewerPhone,
    reviewerName,
    rating,
    reviewText,
    createdAt: serverTimestamp()
  });
}

export async function updateStoreReview(reviewId: string, rating: number, reviewText: string) {
  const reviewRef = doc(db, 'storeReviews', reviewId);
  await updateDoc(reviewRef, {
    rating,
    reviewText,
    updatedAt: serverTimestamp(),
  });
}

export async function getUserStoreReview(storePhone: string, reviewerPhone: string): Promise<Review | null> {
  const reviewsRef = collection(db, 'storeReviews');
  const q = query(reviewsRef, where('storePhone', '==', storePhone), where('reviewerPhone', '==', reviewerPhone));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data(), targetId: d.data().storePhone } as Review;
}

export async function getStoreReviews(storePhone: string): Promise<Review[]> {
  const reviewsRef = collection(db, 'storeReviews');
  const q = query(reviewsRef, where('storePhone', '==', storePhone));
  const snap = await getDocs(q);
  const results = snap.docs.map(doc => ({ id: doc.id, ...doc.data(), targetId: doc.data().storePhone }) as Review);
  return results.sort((a, b) => {
    const tA = a.createdAt?.toMillis?.() ?? 0;
    const tB = b.createdAt?.toMillis?.() ?? 0;
    return tB - tA;
  });
}
