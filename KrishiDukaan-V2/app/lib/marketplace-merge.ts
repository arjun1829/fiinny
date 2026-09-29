/**
 * Shared marketplace product mapping + dedup/merge logic.
 *
 * This is the SINGLE source of truth for how raw `products` docs become the
 * merged marketplace cards farmers see. Both paths use it so their output is
 * identical by construction:
 *   - app/firebase.ts   fetchMarketplaceProducts()  — client, full-collection read
 *   - app/api/marketplace/products/route.ts          — server, cursor-paginated
 *
 * The merge dedups by product NAME (case-insensitive): manufacturer, retailer
 * and admin copies of the same name collapse into one canonical card, with each
 * copy's price/availability/discount/variants/reviews folded in. Because the
 * dedup key is the name, the paginated route can feed this function one page of
 * COMPLETE name-groups at a time and get the same result as merging the whole
 * collection.
 *
 * IMPORTANT: keep this pure (no Firestore SDK imports). It receives already
 * read+mapped data so it runs identically on the client and in Node.
 */
import type { MarketplaceProduct } from "../../types/product";
import { getActiveDiscountPct } from "../utils/discount";

type RatingAgg = Map<string, { sum: number; count: number }>;

/** Build the per-catalogId rating aggregate from raw review rows. */
export function buildRatingAgg(
  reviews: { catalogId: string; rating: number }[],
): RatingAgg {
  const ratingAgg: RatingAgg = new Map();
  for (const r of reviews) {
    const id = String(r.catalogId || "");
    const rating = Number(r.rating || 0);
    if (!id || !(rating > 0)) continue;
    const cur = ratingAgg.get(id) ?? { sum: 0, count: 0 };
    cur.sum += rating;
    cur.count += 1;
    ratingAgg.set(id, cur);
  }
  return ratingAgg;
}

/** Map one raw Firestore product doc to a MarketplaceProduct (pre-merge). */
export function mapMarketplaceDoc(
  id: string,
  data: Record<string, any>,
): MarketplaceProduct {
  return {
    id,
    name: String(data.name || ""),
    fullName: data.fullName ? String(data.fullName) : undefined,
    price: Number(data.price || 0),
    oldPrice: data.oldPrice ? Number(data.oldPrice) : undefined,
    category: String(data.category || "general"),
    description: String(data.description || ""),
    image: String(data.image || ""),
    stock: String(data.stock || "In Stock"),
    store: String(data.store || "Local Store"),
    distance: String(data.distance || "Nearby"),
    retailerId: data.retailerId ? String(data.retailerId) : undefined,
    retailerPhone: data.retailerPhone ? String(data.retailerPhone) : undefined,
    ownerId: data.ownerId ? String(data.ownerId) : undefined,
    manufacturerId: data.manufacturerId ? String(data.manufacturerId) : undefined,
    manufacturerPhone: data.manufacturerPhone ? String(data.manufacturerPhone) : undefined,
    sellMode: data.sellMode === "offline_store_only" ? "offline_store_only" : "online_delivery",
    isOnline: data.sellMode !== "offline_store_only",
    availability: data.availability || undefined,
    source: data.source ? String(data.source) : undefined,
    gstApplicable: data.gstApplicable === true,
    // Predefined slab or a custom seller-entered rate — accept any non-negative number.
    gstRate: (typeof data.gstRate === "number" || typeof data.gstRate === "string") && Number(data.gstRate) >= 0
      ? Number(data.gstRate)
      : undefined,
    gstIncluded: data.gstIncluded === true,
    extraDeliveryCharge: typeof data.extraDeliveryCharge === "number" && data.extraDeliveryCharge > 0
      ? data.extraDeliveryCharge
      : undefined,
    freeDelivery: data.freeDelivery === true ? true : undefined,
    averageRating: typeof data.averageRating === "number" ? data.averageRating : undefined,
    totalReviews: typeof data.totalReviews === "number" ? data.totalReviews : undefined,
    categoryInfo: (data.categoryInfo && typeof data.categoryInfo === "object" && !Array.isArray(data.categoryInfo))
      ? data.categoryInfo as Record<string, string | string[]>
      : undefined,
    // Legacy fertilizer flat fields — kept for backward compat
    nitrogen: data.nitrogen ? String(data.nitrogen) : undefined,
    phosphorus: data.phosphorus ? String(data.phosphorus) : undefined,
    potassium: data.potassium ? String(data.potassium) : undefined,
    applicationDesc: data.applicationDesc ? String(data.applicationDesc) : undefined,
    dosage: data.dosage ? String(data.dosage) : undefined,
    bestForCrops: Array.isArray(data.bestForCrops) ? data.bestForCrops : undefined,
    // Discount fields — written by updateDiscountRecord when a seller sets a discount.
    // `effectiveDiscountPct`/`maxDiscountPct` are snapshots taken once at save time and
    // never re-evaluated afterward, so once a discount's end date passes (or it's
    // disabled) the stored number stays frozen at the old %, showing a phantom offer
    // on marketplace cards after checkout/detail pages correctly show none. Recompute
    // liveness from the raw discountEnabled/discountPct/date fields (same helper the
    // dashboard uses) whenever they're present, instead of trusting the stale snapshot.
    effectiveDiscountPct: (data.discountPct !== undefined || data.discountEnabled !== undefined)
      ? getActiveDiscountPct(data as { discountEnabled?: boolean; discountType?: "percentage" | "fixed_amount"; discountPct?: number; discountStartDate?: { toMillis(): number } | null; discountEndDate?: { toMillis(): number } | null })
      : (typeof data.effectiveDiscountPct === "number" ? data.effectiveDiscountPct : 0),
    maxDiscountPct: (data.discountPct !== undefined || data.discountEnabled !== undefined)
      ? getActiveDiscountPct(data as { discountEnabled?: boolean; discountType?: "percentage" | "fixed_amount"; discountPct?: number; discountStartDate?: { toMillis(): number } | null; discountEndDate?: { toMillis(): number } | null })
      : (typeof data.maxDiscountPct === "number" ? data.maxDiscountPct : 0),
    variants: Array.isArray(data.variants) ? data.variants : undefined,
    images: Array.isArray(data.images) ? data.images : undefined,
    videoUrl: data.videoUrl ? String(data.videoUrl) : undefined,
    composition: Array.isArray(data.composition) ? data.composition : undefined,
    customFields: Array.isArray(data.customFields) ? data.customFields : undefined,
  } as MarketplaceProduct;
}

/**
 * Dedup by name + merge copies into canonical cards, then finalize
 * lowestPrice / lowestFinalPrice / ratings / sellMode / availability.
 *
 * `allMapped` must already be mapped via mapMarketplaceDoc and filtered for
 * isActive. For paginated callers, pass one page of COMPLETE name-groups.
 */
/**
 * The retailer-specific commercial settings that must travel with each seller's
 * availability entry (so cart/checkout use the retailer's own config, never the
 * master product's). Undefined values are stripped so they don't clobber a
 * canonical fallback when absent.
 */
function sellerCommercial(p: MarketplaceProduct) {
  return {
    ...(p.gstApplicable === true ? { gstApplicable: true } : {}),
    ...(typeof p.gstRate === "number" ? { gstRate: p.gstRate } : {}),
    ...(p.gstIncluded === true ? { gstIncluded: true } : {}),
    ...(typeof p.extraDeliveryCharge === "number" && p.extraDeliveryCharge > 0 ? { extraDeliveryCharge: p.extraDeliveryCharge } : {}),
    ...(p.freeDelivery === true ? { freeDelivery: true } : {}),
  };
}

export function mergeMarketplaceProducts(
  allMapped: MarketplaceProduct[],
  ratingAgg: RatingAgg,
): MarketplaceProduct[] {
  // Track every source product id merged under each dedup key, so a review on any
  // variant (manufacturer/retailer copy) still contributes to the merged card's rating.
  const idsByKey = new Map<string, string[]>();

  // Retailer copies hold each store's selling price — collect separately before filtering.
  // admin_assigned copies are also per-seller and must NOT contribute to the canonical
  // raw dedup pool — they carry a stale isOnline inherited from the original at creation
  // time and would permanently keep anyOnlineByKey=true even after the original goes offline.
  const COPY_SOURCES = new Set(["retailer_inventory_copy", "manufacturer_assigned", "admin_assigned"]);
  const retailerCopies = allMapped.filter((p) => COPY_SOURCES.has(p.source ?? ""));

  const raw = allMapped.filter(
    (product) =>
      product.name &&
      product.image &&
      Number.isFinite(product.price) &&
      !COPY_SOURCES.has(product.source ?? ""),
  );

  // Per-seller discount map: nameKey → { sellerUidOrPhone: discountPct }
  const sellerDiscountsByKey = new Map<string, Record<string, number>>();
  const recordSellerDiscount = (key: string, uid: string | undefined, phone: string | undefined, pct: number) => {
    if (!pct || pct <= 0) return;
    const map = sellerDiscountsByKey.get(key) ?? {};
    if (uid) map[uid] = pct;
    if (phone) map[phone] = pct;
    sellerDiscountsByKey.set(key, map);
  };

  /**
   * Union of package sizes across the canonical product and a seller's copy.
   * Sizes are appended, never reordered.
   */
  const unionVariants = (
    base: MarketplaceProduct["variants"],
    extra: MarketplaceProduct["variants"],
  ): MarketplaceProduct["variants"] => {
    if (!Array.isArray(extra) || extra.length === 0) return base;
    const out = Array.isArray(base) ? [...base] : [];
    const seen = new Set(out.map((v) => String(v.unit ?? "").trim().toLowerCase()));
    for (const v of extra) {
      const unit = String(v?.unit ?? "").trim();
      if (!unit || seen.has(unit.toLowerCase())) continue;
      seen.add(unit.toLowerCase());
      out.push({ unit, price: Number(v.price) || 0 });
    }
    return out.length > 0 ? out : base;
  };

  // Per-key tracker: is ANY seller listing online for this product?
  const anyOnlineByKey = new Map<string, boolean>();
  const markOnline = (key: string, isOnline: boolean) => {
    if (isOnline) anyOnlineByKey.set(key, true);
  };

  // Deduplicate by name: keep the manufacturer_inventory card as canonical and
  // merge the retailer's store info into its availability array.
  const byName = new Map<string, MarketplaceProduct>();
  for (const p of raw) {
    const key = p.name.toLowerCase().trim();
    recordSellerDiscount(key, (p as any).ownerId, p.retailerPhone, p.effectiveDiscountPct ?? 0);
    markOnline(key, p.isOnline === true);
    const ids = idsByKey.get(key) ?? [];
    ids.push(p.id);
    idsByKey.set(key, ids);
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, { ...p, availability: p.availability ? [...p.availability] : [] });
      continue;
    }

    const existingIsManufacturer = existing.source === "manufacturer_inventory";
    const pIsManufacturer = p.source === "manufacturer_inventory";
    const canonical = (!existingIsManufacturer && pIsManufacturer) ? { ...p, availability: p.availability ? [...p.availability] : [] } : existing;
    const secondary = (!existingIsManufacturer && pIsManufacturer) ? existing : p;

    // Merge secondary's own availability entries into canonical
    const av: NonNullable<MarketplaceProduct["availability"]> = [...(canonical.availability ?? [])];
    for (const entry of (secondary.availability ?? [])) {
      const dup = av.some(
        (a) => a.storeId === entry.storeId ||
               (entry.storePhone && a.storePhone === entry.storePhone),
      );
      if (!dup) av.push(entry);
    }

    // Register the secondary product itself as an availability source.
    const secondaryStoreId = (secondary as any).ownerId || secondary.retailerId || "";
    const secondaryPhone = secondary.retailerPhone;
    const alreadyPresent = av.some(
      (a) => (secondaryStoreId && a.storeId === secondaryStoreId) ||
             (secondaryPhone && a.storePhone === secondaryPhone),
    );
    if (!alreadyPresent && (secondaryStoreId || secondaryPhone)) {
      const secondaryDiscountPct = secondary.effectiveDiscountPct ?? 0;
      av.push({
        storeId: secondaryStoreId,
        storePhone: secondaryPhone,
        storeName: secondary.store || undefined,
        stockLevel: secondary.stock || "In Stock",
        sellingPrice: secondary.price,
        isOnline: secondary.isOnline,
        discountPct: secondaryDiscountPct > 0 ? secondaryDiscountPct : undefined,
        variants: Array.isArray(secondary.variants) ? secondary.variants : undefined,
        ...sellerCommercial(secondary),
      });
    }

    const mergedMaxDiscount = Math.max(
      canonical.maxDiscountPct ?? canonical.effectiveDiscountPct ?? 0,
      secondary.maxDiscountPct ?? secondary.effectiveDiscountPct ?? 0,
    );
    byName.set(key, {
      ...canonical,
      availability: av.length > 0 ? av : undefined,
      variants: unionVariants(canonical.variants, secondary.variants),
      maxDiscountPct: mergedMaxDiscount,
      effectiveDiscountPct: mergedMaxDiscount,
    });
  }

  // Merge each retailer copy's price into the canonical product's availability
  for (const copy of retailerCopies) {
    if (!copy.name || !copy.price) continue;
    const key = copy.name.toLowerCase().trim();

    const copyStoreId = (copy as any).ownerId || copy.retailerId || "";
    const copyPhone = copy.retailerPhone;
    if (!copyStoreId && !copyPhone) continue;

    markOnline(key, copy.isOnline === true);

    const copyIds = idsByKey.get(key) ?? [];
    if (!copyIds.includes(copy.id)) { copyIds.push(copy.id); idsByKey.set(key, copyIds); }

    const copyDiscountPct = copy.effectiveDiscountPct ?? 0;
    recordSellerDiscount(key, copyStoreId, copyPhone, copyDiscountPct);

    const canonical = byName.get(key);
    if (!canonical) {
      // No canonical manufacturer product exists for this item yet — promote the copy.
      const entryAv: NonNullable<MarketplaceProduct["availability"]> = [
        {
          storeId: copyStoreId,
          storePhone: copyPhone,
          storeName: copy.store || undefined,
          stockLevel: copy.stock || "In Stock",
          sellingPrice: copy.price,
          isOnline: copy.isOnline,
          discountPct: copyDiscountPct > 0 ? copyDiscountPct : undefined,
          variants: Array.isArray(copy.variants) ? copy.variants : undefined,
          ...sellerCommercial(copy),
        },
      ];
      byName.set(key, {
        ...copy,
        availability: entryAv,
        variants: copy.variants,
        maxDiscountPct: copyDiscountPct,
        effectiveDiscountPct: copyDiscountPct,
      });
      continue;
    }

    const av: NonNullable<MarketplaceProduct["availability"]> = [...(canonical.availability ?? [])];
    const existing = av.find(
      (a) =>
        (copyStoreId && a.storeId === copyStoreId) ||
        (copyPhone && a.storePhone === copyPhone),
    );

    if (existing) {
      // Prefer the sellingPrice already synced by updateInventoryRecord.
      if (!existing.sellingPrice || existing.sellingPrice === 0) {
        existing.sellingPrice = copy.price;
      }
      if (copy.isOnline !== undefined) existing.isOnline = copy.isOnline;
      if (Array.isArray(copy.variants)) existing.variants = copy.variants;
      if (copyDiscountPct > 0) existing.discountPct = copyDiscountPct;
      // This seller's own commercial settings always come from its copy doc.
      Object.assign(existing, sellerCommercial(copy));
    } else {
      av.push({
        storeId: copyStoreId,
        storePhone: copyPhone,
        storeName: copy.store || undefined,
        stockLevel: copy.stock || "In Stock",
        sellingPrice: copy.price,
        isOnline: copy.isOnline,
        discountPct: copyDiscountPct > 0 ? copyDiscountPct : undefined,
        variants: Array.isArray(copy.variants) ? copy.variants : undefined,
        ...sellerCommercial(copy),
      });
    }
    const newMax = Math.max(canonical.maxDiscountPct ?? 0, copyDiscountPct);
    byName.set(key, {
      ...canonical,
      availability: av,
      variants: unionVariants(canonical.variants, copy.variants),
      maxDiscountPct: newMax,
    });
  }

  // Compute lowestPrice + ratings + corrected sellMode across all merged sources.
  return Array.from(byName.entries()).map(([key, p]) => {
    const prices = (p.availability ?? [])
      .map((a) => a.sellingPrice)
      .filter((v): v is number => typeof v === "number" && v > 0);
    const lowestPrice = prices.length > 0 ? Math.min(...prices) : undefined;

    const finalPrices = (p.availability ?? []).flatMap((a) => {
      const sp = a.sellingPrice;
      if (typeof sp !== "number" || sp <= 0) return [];
      const pct = typeof a.discountPct === "number" ? a.discountPct : 0;
      return [Math.round(sp * (1 - pct / 100) * 100) / 100];
    });
    if (finalPrices.length === 0 && typeof p.price === "number" && p.price > 0) {
      const pct = p.effectiveDiscountPct ?? 0;
      finalPrices.push(Math.round(p.price * (1 - pct / 100) * 100) / 100);
    }
    const lowestFinalPrice = finalPrices.length > 0 ? Math.min(...finalPrices) : undefined;

    let sum = 0, count = 0;
    for (const id of (idsByKey.get(key) ?? [p.id])) {
      const agg = ratingAgg.get(id);
      if (agg) { sum += agg.sum; count += agg.count; }
    }
    const averageRating = count > 0 ? sum / count : p.averageRating;
    const totalReviews = count > 0 ? count : p.totalReviews;

    const sellerDiscounts = sellerDiscountsByKey.get(key) ?? {};

    // Recompute isOnline/sellMode: true if ANY seller listing is online.
    const mergedOnline = anyOnlineByKey.get(key) ?? false;
    const mergedSellMode: "online_delivery" | "offline_store_only" =
      mergedOnline ? "online_delivery" : "offline_store_only";

    // Ensure the canonical product's own seller always has an availability entry.
    const canonOwnerId = (p as any).ownerId as string | undefined;
    const canonPhone = ((p as any).manufacturerPhone as string | undefined) || p.retailerPhone;
    const currentAv = p.availability ?? [];
    const hasCanonEntry =
      !canonOwnerId && !canonPhone
        ? true
        : currentAv.some(
            (a) =>
              (canonOwnerId && (a.storeId === canonOwnerId || a.storePhone === canonOwnerId)) ||
              (canonPhone && (a.storePhone === canonPhone || a.storeId === canonPhone)),
          );
    const finalAvailability: NonNullable<MarketplaceProduct["availability"]> = hasCanonEntry
      ? currentAv
      : [
          ...currentAv,
          {
            storeId: canonOwnerId || "",
            storePhone: canonPhone,
            storeName: p.store || undefined,
            stockLevel: p.stock || "In Stock",
            sellingPrice: p.price,
            isOnline: p.isOnline,
            variants: Array.isArray(p.variants) ? p.variants : undefined,
            ...sellerCommercial(p),
          },
        ];

    return {
      ...p,
      isOnline: mergedOnline,
      sellMode: mergedSellMode,
      availability: finalAvailability.length > 0 ? finalAvailability : undefined,
      lowestPrice,
      lowestFinalPrice,
      averageRating,
      totalReviews,
      sellerDiscounts,
      mergedProductIds: Array.from(new Set(idsByKey.get(key) ?? [p.id])),
    };
  });
}
