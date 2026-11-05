/**
 * Marketplace product mapping + dedup/merge logic.
 *
 * This is the source of truth for how raw `products` docs become the merged
 * marketplace cards farmers see: marketplaceCards/{id} is built from it (see
 * cards.ts), and the web and app read those cards instead of merging raw docs
 * themselves. Copied verbatim from the web's former app/lib/marketplace-merge.ts
 * so card output matches what the storefront rendered before.
 *
 * The merge dedups by product NAME (case-insensitive): manufacturer, retailer
 * and admin copies of the same name collapse into one canonical card, with each
 * copy's price/availability/discount/variants/reviews folded in. Because the
 * dedup key is the name, merging one complete name-group at a time gives the
 * same result as merging the whole collection.
 *
 * IMPORTANT: keep this pure (no Firestore SDK imports).
 */
import type { MarketplaceProduct } from "./product-types";
import { getActiveDiscountPct } from "./discount";

/** Port of app/utils/weight.ts normalizeUnit: "2 Ltr", "2L" → "2l". */
function normalizeUnit(unit: string): string {
  const s = unit.trim().toLowerCase();
  if (!s) return "";
  const m = s.match(
    /^(\d+(?:\.\d+)?)\s*(kilograms?|kilogram|kgs?|kg|grams?|gms?|gm|g|millilitres?|milliliters?|mls?|ml|litres?|liters?|ltrs?|ltr|ls?|l)$/,
  );
  if (!m) return s.replace(/\s+/g, "");
  let num = m[1];
  if (num.includes(".")) num = num.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  const raw = m[2];
  const canon = /^(kilograms?|kilogram|kgs?|kg)$/.test(raw) ? "kg"
    : /^(millilitres?|milliliters?|mls?|ml)$/.test(raw) ? "ml"
    : /^(grams?|gms?|gm|g)$/.test(raw) ? "g"
    : "l";
  return `${num}${canon}`;
}

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
    // Default included (business rule); false only when explicitly set exclusive.
    // Gated by gstApplicable downstream, so the default is harmless for non-GST products.
    gstIncluded: data.gstIncluded !== false,
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
    // A manufacturer's selling licence: online delivery only to these states.
    licenseStates:
      String(data.source ?? "") === "manufacturer_inventory" && Array.isArray((data.license as { states?: unknown } | undefined)?.states)
        ? ((data.license as { states: unknown[] }).states).map(String).filter(Boolean)
        : undefined,
    // Only used to rank which doc of a name group is the card's canonical.
    createdAtMs: millisOfCreated(data.createdAt),
  } as MarketplaceProduct;
}

function millisOfCreated(v: unknown): number {
  if (v && typeof (v as { toMillis?: unknown }).toMillis === "function") return (v as { toMillis(): number }).toMillis();
  if (v && typeof (v as { seconds?: unknown }).seconds === "number") return (v as { seconds: number }).seconds * 1000;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const ms = Date.parse(v);
    return Number.isFinite(ms) ? ms : 0;
  }
  return 0;
}

/** Phones compare on their last 10 digits (+91… vs 10-digit); other ids as-is. */
function idKey(v: unknown): string {
  const s = String(v ?? "").trim();
  const digits = s.replace(/\D/g, "");
  return digits.length >= 10 && digits.length === s.replace(/^\+/, "").length ? digits.slice(-10) : s;
}

/** Sellers attached to this doc's availability[] other than its own owner. */
function foreignSellerCount(p: MarketplaceProduct): number {
  const own = new Set(
    [p.ownerId, p.retailerId, p.retailerPhone, p.manufacturerId, p.manufacturerPhone]
      .map(idKey).filter(Boolean),
  );
  return (p.availability ?? []).filter(
    (a) => !own.has(idKey(a.storeId)) && !own.has(idKey(a.storePhone)),
  ).length;
}

/**
 * Which same-name doc is the card's canonical (its id, details and the
 * availability[] that detail pages and checkout read). Manufacturer products
 * first; then the doc most OTHER sellers are attached to (they linked their
 * listings to it); then, among non-manufacturers, the OLDEST doc.
 *
 * This used to be "lowest document id", so a seller listing a product that
 * already existed — without linking it — could randomly take over the card:
 * the product page then read only that seller's doc and every other seller
 * vanished from it.
 */
function compareCanonical(a: MarketplaceProduct, b: MarketplaceProduct): number {
  const tier = (p: MarketplaceProduct) => (p.source === "manufacturer_inventory" ? 0 : 1);
  const byId = a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  return tier(a) - tier(b)
    || foreignSellerCount(b) - foreignSellerCount(a)
    // Between manufacturers keep the old id order, so no card changes hands
    // without a reason; otherwise the original listing beats a newcomer.
    || (tier(a) === 0 ? 0 : (a.createdAtMs ?? 0) - (b.createdAtMs ?? 0))
    || byId;
}

const GENERIC_CATEGORIES = new Set(["", "general", "other", "others"]);

function isBlank(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (Array.isArray(v)) return v.length === 0;
  return String(v).trim() === "";
}

/**
 * Details the canonical lacks, taken from the other listings of the same
 * product (same-name listings in canonical rank order, then linked copies).
 * The canonical always wins where it has a value — a seller can add
 * information, never overwrite the manufacturer's. Only returns the fields
 * it fills.
 */
function fillMissingDetails(canon: MarketplaceProduct, donors: MarketplaceProduct[]): Partial<MarketplaceProduct> {
  if (donors.length === 0) return {};
  const out: Partial<MarketplaceProduct> = {};
  const first = <T>(pick: (d: MarketplaceProduct) => T | undefined, ok: (v: T) => boolean) => {
    for (const d of donors) {
      const v = pick(d);
      if (v !== undefined && ok(v)) return v;
    }
    return undefined;
  };

  if (isBlank(canon.description)) {
    const v = first((d) => d.description, (x) => !isBlank(x));
    if (v) out.description = v;
  }
  if (GENERIC_CATEGORIES.has(String(canon.category ?? "").trim().toLowerCase())) {
    const v = first((d) => d.category, (x) => !GENERIC_CATEGORIES.has(String(x).trim().toLowerCase()));
    if (v) out.category = v;
  }
  if (isBlank(canon.image) && isBlank(canon.images)) {
    const d = donors.find((x) => !isBlank(x.images) || !isBlank(x.image));
    if (d) {
      out.images = d.images;
      out.image = d.image || d.images?.[0] || "";
    }
  }
  if (isBlank(canon.videoUrl)) {
    const v = first((d) => d.videoUrl, (x) => !isBlank(x));
    if (v) out.videoUrl = v;
  }

  // Category fields: each one the canonical leaves empty, only from listings
  // in the same category (another category's fields don't apply).
  const categoryOf = (p: Partial<MarketplaceProduct>) => String(p.category ?? "").trim().toLowerCase();
  const finalCategory = categoryOf(out.category !== undefined ? out : canon);
  const info: Record<string, string | string[]> = { ...(canon.categoryInfo ?? {}) };
  let infoChanged = false;
  for (const d of donors) {
    if (categoryOf(d) !== finalCategory) continue;
    for (const [k, v] of Object.entries(d.categoryInfo ?? {})) {
      if (isBlank(info[k]) && !isBlank(v)) {
        info[k] = v;
        infoChanged = true;
      }
    }
  }
  if (infoChanged) out.categoryInfo = info;

  // Free-form rows and composition: add the ones the canonical doesn't have.
  const union = <T>(base: T[] | undefined, extra: (d: MarketplaceProduct) => T[] | undefined, key: (x: T) => string) => {
    const list = Array.isArray(base) ? [...base] : [];
    const seen = new Set(list.map(key));
    let changed = false;
    for (const d of donors) {
      for (const x of extra(d) ?? []) {
        const k = key(x);
        if (!k || seen.has(k)) continue;
        seen.add(k);
        list.push(x);
        changed = true;
      }
    }
    return changed ? list : undefined;
  };
  const fields = union(canon.customFields, (d) => d.customFields,
    (x) => (isBlank(x?.value) ? "" : String(x?.title ?? "").trim().toLowerCase()));
  if (fields) out.customFields = fields;
  const comp = union(canon.composition, (d) => d.composition,
    (x) => (isBlank(x?.value) ? "" : String(x?.name ?? "").trim().toLowerCase()));
  if (comp) out.composition = comp;
  return out;
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
    // Carry the explicit boolean when GST applies so exclusive (false) is preserved.
    ...(p.gstApplicable === true ? { gstIncluded: p.gstIncluded !== false } : {}),
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
    // Same size however it is spelled: "1L", "1 L" and "1 Ltr" are one chip.
    const seen = new Set(out.map((v) => normalizeUnit(String(v.unit ?? ""))));
    for (const v of extra) {
      const unit = String(v?.unit ?? "").trim();
      if (!unit || seen.has(normalizeUnit(unit))) continue;
      seen.add(normalizeUnit(unit));
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
  // Every other listing of a name, for fillMissingDetails.
  const donorsByKey = new Map<string, MarketplaceProduct[]>();
  const addDonor = (key: string, p: MarketplaceProduct) => {
    const list = donorsByKey.get(key) ?? [];
    list.push(p);
    donorsByKey.set(key, list);
  };
  // Rank each name group so its canonical comes first (compareCanonical);
  // groups keep the order they first appear in, so the output order is unchanged.
  const rawByKey = new Map<string, MarketplaceProduct[]>();
  for (const p of raw) {
    const k = p.name.toLowerCase().trim();
    const list = rawByKey.get(k) ?? [];
    list.push(p);
    rawByKey.set(k, list);
  }
  const rankedRaw = Array.from(rawByKey.values()).flatMap((list) => [...list].sort(compareCanonical));
  for (const p of rankedRaw) {
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
    addDonor(key, secondary);

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

    addDonor(key, copy);
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
      // The copy is the authority on its own seller's discount. Overwrite even
      // with 0 — keeping the old value let an expired or switched-off offer
      // live on in lowestFinalPrice and the struck-out card price.
      existing.discountPct = copyDiscountPct > 0 ? copyDiscountPct : undefined;
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
  return Array.from(byName.entries()).map(([key, merged]) => {
    const p: MarketplaceProduct = { ...merged, ...fillMissingDetails(merged, donorsByKey.get(key) ?? []) };
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
