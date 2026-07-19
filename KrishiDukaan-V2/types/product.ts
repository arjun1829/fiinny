export type MarketplaceProduct = {
  id: string;
  name: string;
  fullName?: string;
  price: number;
  oldPrice?: number;
  category: string;
  description: string;
  image: string;
  images?: string[];
  averageRating?: number;
  totalReviews?: number;

  /** Ownership — primary query fields */
  ownerId?: string;
  ownerType?: "manufacturer" | "retailer";
  createdBy?: string;
  source?: string;

  /** Reference / Back-compat fields */
  manufacturerId?: string;
  manufacturerProductId?: string;
  retailerId?: string;
  retailerDocId?: string;
  retailerPhone?: string;
  manufacturerPhone?: string;

  /** Market display & Delivery fields */
  sellMode?: "online_delivery" | "offline_store_only";
  isOnline?: boolean;

  /** GST configuration — set by the manufacturer/owner, applies to all sellers of this product */
  gstApplicable?: boolean;
  gstRate?: 0 | 5 | 12 | 18 | 28;
  
  /** Legacy display fields — present on older documents only */
  stock?: string;
  store?: string;
  distance?: string;

  availability?: {
    storeId: string;       // retailer's Auth UID (legacy key)
    storePhone?: string;   // retailer's E164 phone (new-schema key; matches retailers/{phone} doc ID)
    storeName?: string;    // retailer's shop name for display
    stockLevel: string;
    sellingPrice?: number;
    discountPct?: number;  // active discount percentage for this seller (0 if none)
    /** Product-level online delivery flag for this specific seller's listing.
     *  undefined means "unknown/legacy" — fall back to account-level storeOnlineMap check. */
    isOnline?: boolean;
    /**
     * This store's OWN per-package-size prices, mirrored from the seller's product copy.
     * `sellingPrice` above is the base (variants[0]) price; this array carries every
     * package size the store actually configured so the Product Detail view can show
     * the correct price per selected variant and hide stores that don't stock a size.
     */
    variants?: { unit: string; price: number; stock?: number }[];
  }[];

  /** Lowest selling price across all stores that stock this product (pre-discount) */
  lowestPrice?: number;
  /** Lowest final price after each seller's own discount is applied */
  lowestFinalPrice?: number;

  /** Variants — package sizes with per-variant price and stock */
  variants?: { unit: string; price: number; stock?: number }[];

  /** Optional YouTube demonstration URL. Extract the video ID and embed via iframe. */
  videoUrl?: string;

  /** Product detail enrichment */
  composition?: { name: string; value: string; color?: string }[];
  /** Free-form additional fields entered by the seller. */
  customFields?: { title: string; value: string }[];
  benefits?: string[];
  application?: string;

  /**
   * Category-specific structured information (new schema).
   * Keys and value types are defined in app/dashboard/_lib/category-info.ts.
   * String values for most fields; string[] for chips fields (bestForCrops, bestRegions, etc.).
   */
  categoryInfo?: Record<string, string | string[]>;

  /**
   * @deprecated Legacy flat fertilizer insight fields — kept for backward compat
   * with documents written before the categoryInfo refactor.
   * New writes use categoryInfo instead.
   */
  nitrogen?: string;
  phosphorus?: string;
  potassium?: string;
  applicationDesc?: string;
  dosage?: string;
  bestForCrops?: string[];

  /**
   * Set to true on a retailer product copy to opt out of manufacturer price
   * syncs. When true, syncPriceToRetailers() will leave this copy's price
   * unchanged, allowing the retailer to maintain their own pricing.
   */
  hasCustomPrice?: boolean;

  /** Discount — mirrored from inventory on discount save */
  effectiveDiscountPct?: number; // this product/seller's active discount (0 if none)
  maxDiscountPct?: number;       // max across all sellers of this product (on original doc only)

  /**
   * Per-seller discount map built by fetchMarketplaceProducts.
   * Keys are seller UID or phone, values are their active discount %.
   * Use this in ProductDetailView to show each store's own discount.
   * Never use the merged effectiveDiscountPct for per-store display.
   */
  sellerDiscounts?: Record<string, number>;

  /**
   * Every underlying Firestore product doc id that merged into this one card
   * (the manufacturer canonical `id` plus all retailer/admin copy ids), set by
   * fetchMarketplaceProducts. Used to (a) resolve a deep-link that targets a
   * secondary/copy id back to this merged product, and (b) find reels whose
   * `linkedProductId` points at any of those docs. Falls back to `[id]`.
   */
  mergedProductIds?: string[];
};
