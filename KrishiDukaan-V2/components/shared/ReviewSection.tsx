import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  getProductReviews,
  getStoreReviews,
  addProductReview,
  addStoreReview,
  updateProductReview,
  updateStoreReview,
  getUserProductReview,
  getUserStoreReview,
  Review,
} from '../../app/reviews';
import { auth } from '../../app/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../app/firebase';
import { Star, MessageSquare, Pencil } from 'lucide-react';
import { useI18n } from '../../app/i18n/I18nContext';

export function ReviewSection({
  targetId,
  targetType,
  onAggregateChange,
}: {
  targetId: string;
  targetType: 'product' | 'store';
  /** Reports the live average rating + count whenever reviews load or change. */
  onAggregateChange?: (targetId: string, averageRating: number, totalReviews: number) => void;
}) {
  const { t } = useI18n();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [existingReview, setExistingReview] = useState<Review | null>(null);

  // Auth state
  const [userPhone, setUserPhone] = useState('');
  const [userName, setUserName] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setIsLoggedIn(true);
        let phone = '';
        let name = user.displayName || 'Anonymous Farmer';
        try {
          const idxSnap = await getDoc(doc(db, 'uidIndex', user.uid));
          if (idxSnap.exists()) {
            phone = idxSnap.data().phone || '';
            const userSnap = await getDoc(doc(db, 'users', phone));
            if (userSnap.exists() && userSnap.data().name) {
              name = userSnap.data().name;
            }
          } else {
            phone = user.uid; // fallback
          }
        } catch {
           phone = user.uid;
        }
        setUserPhone(phone);
        setUserName(name);
      } else {
        setIsLoggedIn(false);
        setUserPhone('');
        setUserName('');
        setExistingReview(null);
      }
    });
    return () => unsub();
  }, []);

  // Fetch all reviews
  useEffect(() => {
    if (!targetId) return;
    setLoading(true);
    const fetch = targetType === 'product' ? getProductReviews(targetId) : getStoreReviews(targetId);
    fetch
      .then(setReviews)
      .catch(() => setReviews([]))
      .finally(() => setLoading(false));
  }, [targetId, targetType]);

  // Check if current user already has a review
  useEffect(() => {
    if (!targetId || !userPhone || !isLoggedIn) {
      setExistingReview(null);
      return;
    }
    const fetchExisting = targetType === 'product'
      ? getUserProductReview(targetId, userPhone)
      : getUserStoreReview(targetId, userPhone);
    fetchExisting.then(setExistingReview).catch(() => setExistingReview(null));
  }, [targetId, userPhone, isLoggedIn, targetType]);

  // Report the live aggregate up to the parent so cards/badges can reflect it immediately.
  useEffect(() => {
    if (!onAggregateChange || !targetId) return;
    const count = reviews.length;
    const avg = count > 0 ? reviews.reduce((s, r) => s + (r.rating || 0), 0) / count : 0;
    onAggregateChange(targetId, avg, count);
  }, [reviews, targetId, onAggregateChange]);

  const openNewReview = () => {
    setIsEditing(false);
    setRating(5);
    setText('');
    setShowForm(true);
  };

  const openEditReview = () => {
    if (!existingReview) return;
    setIsEditing(true);
    setRating(existingReview.rating);
    setText(existingReview.reviewText);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoggedIn || !text.trim() || !userPhone) return;

    setSubmitting(true);
    try {
      if (isEditing && existingReview) {
        // Edit existing review
        if (targetType === 'product') {
          await updateProductReview(existingReview.id, rating, text);
        } else {
          await updateStoreReview(existingReview.id, rating, text);
        }
      } else {
        // Submit new review
        if (targetType === 'product') {
          await addProductReview(targetId, userPhone, userName, rating, text);
        } else {
          await addStoreReview(targetId, userPhone, userName, rating, text);
        }
      }
      // Refresh reviews and existing review
      const [updated, myReview] = await Promise.all([
        targetType === 'product' ? getProductReviews(targetId) : getStoreReviews(targetId),
        targetType === 'product' ? getUserProductReview(targetId, userPhone) : getUserStoreReview(targetId, userPhone),
      ]);
      setReviews(updated);
      setExistingReview(myReview);
      setShowForm(false);
      setText('');
      setRating(5);
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to submit review', err);
      alert(t('reviewSubmitFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  // While loading, render nothing — avoids layout shift for the empty state
  if (loading) return null;

  const totalReviews = reviews.length;

  // When there are no reviews, only show the section if the user is logged in
  // and can write one — otherwise hide it completely.
  if (totalReviews === 0 && !isLoggedIn) return null;

  const ratingCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  let sum = 0;
  reviews.forEach(r => {
    const rounded = Math.round(r.rating) as 1 | 2 | 3 | 4 | 5;
    if (rounded >= 1 && rounded <= 5) ratingCounts[rounded]++;
    sum += r.rating;
  });
  const avgRating = totalReviews > 0 ? (sum / totalReviews).toFixed(1) : '0.0';

  const INITIAL_VISIBLE = 2;
  const visibleReviews = showAllReviews ? reviews : reviews.slice(0, INITIAL_VISIBLE);
  const hasMore = reviews.length > INITIAL_VISIBLE;

  return (
    <section className="bg-white rounded-3xl border border-surface-container shadow-sm p-6 md:p-8 flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-surface-container-low pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-xl text-primary">
            <MessageSquare className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-on-surface tracking-tight">{t('customerReviews')}</h2>
            {totalReviews > 0 && (
              <p className="text-xs text-on-surface-variant mt-0.5">{totalReviews} {totalReviews === 1 ? 'review' : 'reviews'} · {avgRating} avg</p>
            )}
          </div>
        </div>
        {!showForm && isLoggedIn && (
          existingReview ? (
            <button
              onClick={openEditReview}
              className="inline-flex w-full sm:w-auto justify-center items-center gap-2 px-5 py-2.5 bg-surface-container text-on-surface font-bold rounded-xl border border-outline-variant/40 hover:bg-surface-container-high hover:scale-[1.02] active:scale-95 transition-all text-sm uppercase tracking-wider"
            >
              <Pencil className="w-4 h-4" />{t('editYourReview')}
            </button>
          ) : (
            <button
              onClick={openNewReview}
              className="w-full sm:w-auto px-5 py-2.5 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all text-sm uppercase tracking-wider"
            >
              {t('writeAReview')}
            </button>
          )
        )}
      </div>

      {/* Login prompt — only when logged out and reviews exist (so the section is visible) */}
      {!isLoggedIn && totalReviews > 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 p-5 rounded-2xl border border-amber-200/60 flex items-center justify-between">
          <p className="text-amber-800 text-sm font-medium">Join the community and share your experience.</p>
          <a href="/?view=login" className="px-4 py-2 bg-amber-100 text-amber-900 font-bold rounded-lg hover:bg-amber-200 transition-colors text-xs uppercase tracking-widest">
            {t('loginToReview')}
          </a>
        </div>
      )}

      {/* User's existing review banner */}
      {isLoggedIn && existingReview && !showForm && (
        <div className="bg-gradient-to-r from-primary/5 to-secondary/5 border border-primary/20 rounded-2xl p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
              {userName.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-primary mb-0.5">{t('yourReviewLabel')}</p>
              <div className="flex items-center gap-1.5">
                {[1,2,3,4,5].map(s => (
                  <Star key={s} className={`w-3.5 h-3.5 ${s <= existingReview.rating ? 'fill-amber-400 text-amber-400' : 'text-surface-container-highest fill-surface-container-low'}`} />
                ))}
                <span className="text-xs text-on-surface-variant ml-1 font-medium">{existingReview.reviewText.slice(0, 60)}{existingReview.reviewText.length > 60 ? '…' : ''}</span>
              </div>
            </div>
          </div>
          <button onClick={openEditReview} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-primary border border-primary/30 rounded-lg hover:bg-primary/10 transition-colors">
            <Pencil className="w-3 h-3" /> Edit
          </button>
        </div>
      )}

      {/* Write / edit form */}
      {showForm && isLoggedIn && (
        <form onSubmit={handleSubmit} className="bg-surface-container-lowest p-6 rounded-3xl flex flex-col gap-5 border border-surface-container shadow-inner">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
              {userName.charAt(0).toUpperCase()}
            </div>
            <div>
              <h3 className="font-bold text-on-surface leading-none">{userName}</h3>
              <p className="text-xs text-on-surface-variant mt-1 uppercase tracking-widest font-semibold">
                {isEditing ? t('editingYourReview') : t('postingPublicly')}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-bold text-on-surface-variant uppercase tracking-widest">{t('selectRatingLabel')}</span>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <button key={star} type="button" onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)} onMouseLeave={() => setHoverRating(0)}
                  className="focus:outline-none transition-transform hover:scale-110 p-1">
                  <Star className={`w-8 h-8 ${star <= (hoverRating || rating) ? 'fill-amber-400 text-amber-400 drop-shadow-sm' : 'text-surface-container-highest stroke-1'} transition-colors`} />
                </button>
              ))}
            </div>
          </div>
          <textarea
            placeholder="Share details of your experience with this product or store..."
            value={text} onChange={(e) => setText(e.target.value)} required
            className="w-full bg-white border border-surface-container rounded-2xl px-5 py-4 text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 min-h-[120px] resize-y transition-all"
          />
          <div className="flex justify-end gap-3 mt-2">
            <button type="button" onClick={() => { setShowForm(false); setIsEditing(false); }}
              className="px-6 py-2.5 text-on-surface-variant hover:bg-surface-container hover:text-on-surface font-bold rounded-xl transition-all text-sm uppercase tracking-wider">
              {t('cancelBtn')}
            </button>
            <button type="submit" disabled={submitting}
              className="px-8 py-2.5 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/20 hover:bg-primary/90 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 text-sm uppercase tracking-wider">
              {submitting ? (isEditing ? t('updatingBtn') : t('postingBtn')) : (isEditing ? t('updateReviewBtn') : t('postReviewBtn'))}
            </button>
          </div>
        </form>
      )}

      {/* Reviews list — only rendered when reviews exist */}
      {totalReviews > 0 && (
        <div className="flex flex-col gap-6">
          {/* Rating overview */}
          <div className="flex flex-col md:flex-row gap-8 bg-surface-container-lowest p-6 rounded-3xl border border-surface-container">
            <div className="flex flex-col items-center justify-center shrink-0 w-32">
              <span className="text-5xl font-black text-on-surface">{avgRating}</span>
              <div className="flex items-center my-2 gap-0.5">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star key={s} className={`w-4 h-4 ${s <= Math.round(Number(avgRating)) ? 'fill-amber-400 text-amber-400' : 'text-surface-container-highest fill-surface-container-low'}`} />
                ))}
              </div>
              <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-widest">
                {totalReviews} {totalReviews === 1 ? t('reviewSingular') : t('reviewPlural')}
              </span>
            </div>
            <div className="flex-1 flex flex-col gap-2 justify-center border-l-0 md:border-l md:border-surface-container pl-0 md:pl-8">
              {[5, 4, 3, 2, 1].map((stars) => {
                const count = ratingCounts[stars as keyof typeof ratingCounts];
                const percent = totalReviews > 0 ? (count / totalReviews) * 100 : 0;
                return (
                  <div key={stars} className="flex items-center gap-3">
                    <span className="text-xs font-bold w-10 flex items-center justify-end gap-1 text-on-surface-variant">
                      {stars} <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                    </span>
                    <div className="flex-1 h-2.5 bg-surface-container rounded-full overflow-hidden">
                      <motion.div initial={{ width: 0 }} animate={{ width: `${percent}%` }}
                        transition={{ duration: 1, ease: 'easeOut' }} className="h-full bg-amber-400 rounded-full" />
                    </div>
                    <span className="text-xs font-semibold text-on-surface-variant w-8 text-right">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Individual reviews — capped at 2, expandable */}
          <div className="grid grid-cols-1 gap-4">
            {visibleReviews.map(review => (
              <div key={review.id} className={`border p-5 rounded-2xl hover:border-primary/30 transition-colors ${review.reviewerPhone === userPhone ? 'bg-primary/5 border-primary/20' : 'bg-surface-container-lowest border-surface-container'}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface-variant font-bold">
                      {review.reviewerName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex flex-col">
                      <span className="font-bold text-on-surface">{review.reviewerName}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-on-surface-variant font-semibold uppercase tracking-widest mt-0.5">{t('verifiedBuyer')}</span>
                        {review.reviewerPhone === userPhone && (
                          <span className="text-[10px] font-black uppercase tracking-widest text-primary bg-primary/10 px-2 py-0.5 rounded-full">{t('youLabel')}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-0.5 bg-amber-50 px-2 py-1 rounded-lg border border-amber-100">
                      <span className="text-xs font-black text-amber-700 mr-1">{review.rating.toFixed(1)}</span>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star key={star} className={`w-3.5 h-3.5 ${star <= review.rating ? 'fill-amber-400 text-amber-400' : 'text-amber-200 fill-amber-50'}`} />
                      ))}
                    </div>
                    {review.reviewerPhone === userPhone && (
                      <button onClick={openEditReview} className="p-1.5 rounded-lg text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors" title="Edit your review">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-on-surface-variant text-sm leading-relaxed whitespace-pre-wrap ml-12 pl-1 mt-1">{review.reviewText}</p>
                {review.updatedAt && (
                  <p className="text-[10px] text-on-surface-variant/50 ml-12 pl-1 mt-1 font-medium">edited</p>
                )}
              </div>
            ))}
          </div>

          {/* Show More / Show Less */}
          {hasMore && (
            <button
              type="button"
              onClick={() => setShowAllReviews(v => !v)}
              className="self-center px-6 py-2.5 rounded-xl border border-outline-variant/40 text-sm font-bold text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-all"
            >
              {showAllReviews ? `Show Less` : `Show ${reviews.length - INITIAL_VISIBLE} More Review${reviews.length - INITIAL_VISIBLE !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      )}

      {/* Empty state — only shown when logged in (so user can write the first review) */}
      {totalReviews === 0 && isLoggedIn && !showForm && (
        <div className="flex flex-col items-center justify-center py-8 px-4 bg-surface-container-lowest rounded-2xl border border-dashed border-surface-container text-center">
          <Star className="w-8 h-8 text-on-surface-variant opacity-30 mb-3" />
          <p className="text-sm font-bold text-on-surface mb-1">No reviews yet</p>
          <p className="text-xs text-on-surface-variant">Be the first to share your experience.</p>
        </div>
      )}
    </section>
  );
}
