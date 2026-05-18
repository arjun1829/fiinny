export type MarketplaceProduct = {
  id: string;
  name: string;
  fullName?: string;
  price: number;
  oldPrice?: number;
  category: string;
  description: string;
  image: string;
  
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

  /** Market display & Delivery fields */
  sellMode?: "online_delivery" | "offline_store_only";
  isOnline?: boolean;
  
  /** Legacy display fields — present on older documents only */
  stock?: string;
  store?: string;
  distance?: string;

  availability?: {
    storeId: string;
    stockLevel: string;
  }[];
};
