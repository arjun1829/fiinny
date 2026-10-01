/**
 * The product listing tile used on the Product Detail page (Similar Products
 * rail) — extracted here so anywhere that needs to show "a product as it appears
 * in the marketplace" reuses one card instead of re-implementing its styling.
 *
 * Presentational only: it takes the handful of fields it displays, not a full
 * MarketplaceProduct, so non-marketplace callers (e.g. the subscription pitch
 * preview) can render a representative card without constructing a real product.
 *
 * Interactive when `onClick` is given (renders a <button>, as the Similar
 * Products rail needs); a plain, non-clickable <div> otherwise.
 */

interface ProductListingCardProps {
  image: string;
  name: string;
  price: number;
  category?: string;
  averageRating?: number;
  totalReviews?: number;
  onClick?: () => void;
  /** Width / layout classes for the outer element (card styling stays internal). */
  className?: string;
}

export function ProductListingCard({
  image,
  name,
  price,
  category,
  averageRating,
  totalReviews,
  onClick,
  className = "",
}: ProductListingCardProps) {
  const base =
    "text-left rounded-2xl border border-surface-container bg-white shadow-sm overflow-hidden";
  const interactive = onClick
    ? "cursor-pointer transition-all hover:shadow-md hover:border-primary/30 hover:scale-[1.02]"
    : "";

  const inner = (
    <>
      <div className="aspect-square overflow-hidden bg-surface-container-low">
        <img src={image} alt={name} className="w-full h-full object-cover" />
      </div>
      <div className="p-3 flex flex-col gap-0.5">
        {category ? (
          <span className="text-[10px] font-black uppercase tracking-widest text-primary">
            {category}
          </span>
        ) : null}
        <p className="font-bold text-on-surface text-sm truncate leading-tight">{name}</p>
        {(averageRating ?? 0) > 0 && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-on-surface-variant">
            <span className="text-amber-500">★</span>
            {averageRating!.toFixed(1)}
            {totalReviews ? <span className="text-outline">({totalReviews})</span> : null}
          </span>
        )}
        <span className="text-secondary font-extrabold text-sm">
          ₹{price.toLocaleString("en-IN")}
        </span>
      </div>
    </>
  );

  return onClick ? (
    <button type="button" onClick={onClick} className={`${base} ${interactive} ${className}`}>
      {inner}
    </button>
  ) : (
    <div className={`${base} ${className}`}>{inner}</div>
  );
}
