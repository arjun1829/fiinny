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
  }[];

  /** Lowest selling price across all stores that stock this product */
  lowestPrice?: number;

  /** Product detail enrichment */
  composition?: { name: string; value: string; color: string }[];
  benefits?: string[];
  application?: string;
};
