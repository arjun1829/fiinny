import { useState, useEffect } from 'react';
import { getProductReviews, getStoreReviews, addProductReview, addStoreReview, Review } from '../../app/reviews';
import { auth } from '../../app/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../app/firebase';
import { Star, MessageSquare, User } from 'lucide-react';

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
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  // Auth state
  const [userPhone, setUserPhone] = useState('');
  const [userName, setUserName] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setIsLoggedIn(true);
        // Try to get user's phone and name
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
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!targetId) return;
    setLoading(true);
    const fetch = targetType === 'product' ? getProductReviews(targetId) : getStoreReviews(targetId);
    fetch
      .then(setReviews)
      .catch(() => setReviews([]))
      .finally(() => setLoading(false));
  }, [targetId, targetType]);

  // Report the live aggregate up to the parent so cards/badges can reflect it immediately.
  useEffect(() => {
    if (!onAggregateChange || !targetId) return;
    const count = reviews.length;
    const avg = count > 0 ? reviews.reduce((s, r) => s + (r.rating || 0), 0) / count : 0;
    onAggregateChange(targetId, avg, count);
  }, [reviews, targetId, onAggregateChange]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoggedIn || !text.trim() || !userPhone) return;
    
    setSubmitting(true);
    try {
      if (targetType === 'product') {
        await addProductReview(targetId, userPhone, userName, rating, text);
        const updated = await getProductReviews(targetId);
        setReviews(updated);
      } else {
        await addStoreReview(targetId, userPhone, userName, rating, text);
        const updated = await getStoreReviews(targetId);
        setReviews(updated);
      }
      setShowForm(false);
      setText('');
      setRating(5);
    } catch (err) {
      console.error("Failed to submit review", err);
      alert("Failed to submit review. You might not have permission.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse flex flex-col gap-4 mt-8 bg-white rounded-3xl border border-surface-container shadow-sm p-8">
        <div className="h-8 bg-surface-container rounded w-1/3"></div>
        <div className="h-24 bg-surface-container-low rounded-2xl w-full"></div>
      </div>
    );
  }

  return (
    <section className="bg-white rounded-3xl border border-surface-container shadow-sm p-6 md:p-8 flex flex-col gap-6 mt-8">
      <div className="flex items-center justify-between border-b border-surface-container-low pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-xl text-primary">
            <MessageSquare className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-extrabold text-on-surface tracking-tight">Customer Reviews</h2>
        </div>
        {!showForm && isLoggedIn && (
          <button 
            onClick={() => setShowForm(true)}
            className="px-5 py-2.5 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all text-sm uppercase tracking-wider"
          >
            Write a Review
          </button>
        )}
      </div>

      {!isLoggedIn && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 p-5 rounded-2xl border border-amber-200/60 flex items-center justify-between">
          <p className="text-amber-800 text-sm font-medium">
            Join the community and share your experience.
          </p>
          <a href="/?view=login" className="px-4 py-2 bg-amber-100 text-amber-900 font-bold rounded-lg hover:bg-amber-200 transition-colors text-xs uppercase tracking-widest">
            Login to Review
          </a>
        </div>
      )}

      {showForm && isLoggedIn && (
        <form onSubmit={handleSubmit} className="bg-surface-container-lowest p-6 rounded-3xl flex flex-col gap-5 border border-surface-container shadow-inner">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
              {userName.charAt(0).toUpperCase()}
            </div>
            <div>
              <h3 className="font-bold text-on-surface leading-none">{userName}</h3>
              <p className="text-xs text-on-surface-variant mt-1 uppercase tracking-widest font-semibold">Posting publicly</p>
            </div>
          </div>
          
          <div className="flex flex-col gap-2">
            <span className="text-sm font-bold text-on-surface-variant uppercase tracking-widest">Select Rating</span>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="focus:outline-none transition-transform hover:scale-110 p-1"
                >
                  <Star
                    className={`w-8 h-8 ${
                      star <= (hoverRating || rating)
                        ? 'fill-amber-400 text-amber-400 drop-shadow-sm'
                        : 'text-surface-container-highest stroke-1'
                    } transition-colors`}
                  />
                </button>
              ))}
            </div>
          </div>

          <textarea
            placeholder="Share details of your experience with this product or store..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full bg-white border border-surface-container rounded-2xl px-5 py-4 text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 min-h-[120px] resize-y transition-all"
            required
          />
          
          <div className="flex justify-end gap-3 mt-2">
            <button 
              type="button" 
              onClick={() => setShowForm(false)}
              className="px-6 py-2.5 text-on-surface-variant hover:bg-surface-container hover:text-on-surface font-bold rounded-xl transition-all text-sm uppercase tracking-wider"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={submitting}
              className="px-8 py-2.5 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/20 hover:bg-primary/90 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 text-sm uppercase tracking-wider"
            >
              {submitting ? 'Posting...' : 'Post Review'}
            </button>
          </div>
        </form>
      )}

      {reviews.length > 0 ? (
        <div className="grid grid-cols-1 gap-4">
          {reviews.map(review => (
            <div key={review.id} className="bg-surface-container-lowest border border-surface-container p-5 rounded-2xl hover:border-primary/30 transition-colors group">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface-variant font-bold">
                    {review.reviewerName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex flex-col">
                    <span className="font-bold text-on-surface">{review.reviewerName}</span>
                    <span className="text-[10px] text-on-surface-variant font-semibold uppercase tracking-widest mt-0.5">Verified Buyer</span>
                  </div>
                </div>
                <div className="flex items-center gap-0.5 bg-amber-50 px-2 py-1 rounded-lg border border-amber-100">
                  <span className="text-xs font-black text-amber-700 mr-1">{review.rating.toFixed(1)}</span>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`w-3.5 h-3.5 ${
                        star <= review.rating
                          ? 'fill-amber-400 text-amber-400'
                          : 'text-amber-200 fill-amber-50'
                      }`}
                    />
                  ))}
                </div>
              </div>
              <p className="text-on-surface-variant text-sm leading-relaxed whitespace-pre-wrap ml-12 pl-1 mt-1">
                {review.reviewText}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-10 px-4 bg-surface-container-lowest rounded-2xl border border-dashed border-surface-container text-center">
          <div className="w-16 h-16 bg-surface-container rounded-full flex items-center justify-center mb-4">
            <Star className="w-8 h-8 text-on-surface-variant opacity-50" />
          </div>
          <p className="text-lg font-bold text-on-surface mb-1">No reviews yet</p>
          <p className="text-sm text-on-surface-variant max-w-sm">Be the first to share your experience with the community.</p>
        </div>
      )}
    </section>
  );
}
