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
  }[];

  /** Lowest selling price across all stores that stock this product */
  lowestPrice?: number;

  /** Variants — package sizes with per-variant price and stock */
  variants?: { unit: string; price: number; stock?: number }[];

  /** Product detail enrichment */
  composition?: { name: string; value: string; color: string }[];
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
};
