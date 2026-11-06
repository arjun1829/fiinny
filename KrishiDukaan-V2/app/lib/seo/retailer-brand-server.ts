import { cache } from "react";
import { collection, doc, getDoc, getDocs, limit, query, where } from "firebase/firestore/lite";
import { getClientDb } from "../firebase-client-server";
import {
  parseRetailerBrand,
  parseRetailerProfile,
  type RetailerBrandPage,
  type RetailerBrandProfile,
} from "../retailer-brand";
import { buildProductSlug, filterServableProductIds } from "./products-server";
import type { StoreProduct } from "./stores-server";

export type RetailerBrandData = {
  brand: RetailerBrandPage;
  profile: RetailerBrandProfile;
};

/**
 * The visible brand page for [phone] (E164), or null when the shop has none
 * or switched it off. Read with the public (unauthenticated) client, so the
 * rules decide visibility: a hidden page's get is denied and lands here as
 * null. cache() dedupes the page and generateMetadata into one read set.
 */
export const getRetailerBrand = cache(async (phone: string): Promise<RetailerBrandData | null> => {
  const db = getClientDb();
  const [brandSnap, profileSnap] = await Promise.all([
    getDoc(doc(db, "retailerBrandPages", phone)).catch(() => null),
    getDoc(doc(db, "profiles", phone)).catch(() => null),
  ]);
  if (!brandSnap?.exists()) return null;
  const brand = parseRetailerBrand(brandSnap.data());
  if (!brand.enabled) return null;

  let data = profileSnap?.exists() ? profileSnap.data() : undefined;
  let profile = parseRetailerProfile(phone, data);
  if (!profile.name || !profile.logo) {
    // Older shops only have the retailers/ doc (E164 or 10-digit id).
    const ten = phone.replace(/\D/g, "").slice(-10);
    for (const id of [phone, ten]) {
      const snap = await getDoc(doc(db, "retailers", id)).catch(() => null);
      if (snap?.exists()) {
        data = { ...snap.data(), ...stripEmpty(data) };
        profile = parseRetailerProfile(phone, data);
        break;
      }
    }
  }
  return { brand, profile };
});

function stripEmpty(d: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d ?? {})) if (v !== null && v !== undefined && v !== "") out[k] = v;
  return out;
}

/**
 * The shop's own active listings. Web-created products carry ownerPhone and
 * app-created ones retailerPhone, so both are queried (in parallel) and
 * de-duplicated by the canonical product they point at.
 */
export const getRetailerBrandProducts = cache(async (phone: string, max = 24): Promise<StoreProduct[]> => {
  try {
    const db = getClientDb();
    const snaps = await Promise.all(
      (["ownerPhone", "retailerPhone"] as const).map((field) =>
        getDocs(query(collection(db, "products"), where(field, "==", phone), limit(80))).catch(() => null),
      ),
    );
    const byCanonicalId = new Map<string, StoreProduct>();
    for (const snap of snaps) {
      for (const d of snap?.docs ?? []) {
        const data = d.data() as Record<string, unknown>;
        if (data.isActive === false) continue;
        const name = typeof data.name === "string" ? data.name.trim() : "";
        const image = typeof data.image === "string" ? data.image : Array.isArray(data.images) ? String(data.images[0] ?? "") : "";
        if (!name || !image) continue;
        const canonicalId = String(data.manufacturerProductId || data.originalProductId || d.id);
        if (byCanonicalId.has(canonicalId)) continue;
        byCanonicalId.set(canonicalId, {
          id: canonicalId,
          name,
          image,
          price: Number(data.price || 0),
          slug: buildProductSlug(name, canonicalId),
        });
      }
    }
    const candidates = Array.from(byCanonicalId.values())
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, max);
    // Only link products that have a page (same guard as the store pages).
    const servable = await filterServableProductIds(candidates.map((p) => p.id));
    return candidates.filter((p) => servable.has(p.id));
  } catch (err) {
    console.warn("[retailer-brand-server] products failed:", err);
    return [];
  }
});
