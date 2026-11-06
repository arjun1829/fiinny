import { formatINR, type DisplayPrice } from "../../app/lib/price-display";

type Props = {
  value: DisplayPrice;
  /** "sm" for dense grids, "md" for regular cards, "lg" for a product page. */
  size?: "sm" | "md" | "lg";
  className?: string;
  /** Rendered between the price and the struck MRP, e.g. "From". */
  prefix?: string;
};

const SIZES = {
  sm: { price: "text-sm", mrp: "text-[11px]", pct: "text-[11px]" },
  md: { price: "text-base", mrp: "text-xs", pct: "text-xs" },
  lg: { price: "text-3xl", mrp: "text-base", pct: "text-base" },
} as const;

/**
 * Marketplace-style price line: the price paid, then the pre-discount price
 * struck out and "% off" — only when there is a real discount.
 *
 *   ₹86,999  ₹99,900  13% off
 *
 * No hooks, so it renders in server and client components alike.
 */
export function PriceTag({ value, size = "md", className = "", prefix }: Props) {
  const s = SIZES[size];
  const hasOffer = value.mrp !== null && value.pct > 0;
  return (
    <div className={`flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 ${className}`}>
      {prefix && <span className={`${s.mrp} font-semibold text-on-surface-variant`}>{prefix}</span>}
      <span className={`${s.price} font-black text-on-surface`}>{formatINR(value.price)}</span>
      {hasOffer && (
        <>
          <span className={`${s.mrp} text-outline line-through`}>
            <span className="sr-only">MRP </span>
            {formatINR(value.mrp!)}
          </span>
          <span className={`${s.pct} font-bold text-green-700`}>{value.pct}% off</span>
        </>
      )}
    </div>
  );
}
