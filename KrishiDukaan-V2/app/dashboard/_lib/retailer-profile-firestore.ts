import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "../../firebase";

const GENERIC_NAMES = new Set(["my store", "local store", ""]);

function isGenericName(name: string) {
  return GENERIC_NAMES.has(name.trim().toLowerCase());
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type RetailerPublicProfile = {
  phone: string;
  secondaryPhone?: string;
  shopName: string;
  ownerName?: string;
  address?: string;
  city?: string;
  state?: string;
  bio?: string;
  role: string;
  /** Full business name (manufacturer alias for shopName) */
  businessName?: string;
  logo?: string;
  banner?: string;
  website?: string;
  gstin?: string;
  tagline?: string;
  onlineDelivery?: boolean;
  socialLinks?: Record<string, string>;
  averageRating?: number;
  totalReviews?: number;
};

export type RetailerProductSummary = {
  productId: string;
  name: string;
  image: string;
  price: number;
  category: string;
  isActive: boolean;
};

// ─── Fetchers ─────────────────────────────────────────────────────────────────

/**
 * Fetch a retailer's public profile.
 *
 * Primary source: `profiles/{phone}` (new phone-keyed schema).
 * Fallback:       `retailers` collection queried by phone field (legacy schema
 *                 where shop name is stored but document ID is a UID/GUID).
 *
 * Falls back whenever `profiles` doc is missing or has a generic shop name
 * like "My Store" / "Local Store" (written as placeholder during product creation).
 */
export async function fetchRetailerPublicProfile(
  phone: string,
): Promise<RetailerPublicProfile | null> {
  try {
    const snap = await getDoc(doc(db, "profiles", phone));
    const profileData = snap.exists() ? snap.data() : null;
    const profileShopName = String(profileData?.shopName ?? "").trim();

    // If profiles doc has a real shop name, use it directly.
    if (profileData && !isGenericName(profileShopName)) {
      return {
        phone:           String(profileData.phone ?? phone),
        secondaryPhone:  profileData.secondaryPhone ? String(profileData.secondaryPhone) : undefined,
        shopName:        profileShopName,
        businessName:    profileData.businessName ? String(profileData.businessName) : profileShopName,
        ownerName:       profileData.ownerName   ? String(profileData.ownerName)   : undefined,
        address:         profileData.address     ? String(profileData.address)     : undefined,
        city:            profileData.city        ? String(profileData.city)        : undefined,
        state:           profileData.state       ? String(profileData.state)       : undefined,
        bio:             profileData.bio         ? String(profileData.bio)         : undefined,
        role:            String(profileData.role ?? "retailer"),
        logo:            profileData.logo        ? String(profileData.logo)        : undefined,
        banner:          profileData.banner      ? String(profileData.banner)      : undefined,
        website:         profileData.website     ? String(profileData.website)     : undefined,
        gstin:           profileData.gstin       ? String(profileData.gstin)       : undefined,
        tagline:         profileData.tagline     ? String(profileData.tagline)     : undefined,
        onlineDelivery:  typeof profileData.onlineDelivery === "boolean" ? profileData.onlineDelivery : undefined,
        socialLinks:     profileData.socialLinks as Record<string, string> | undefined,
        averageRating:   profileData.averageRating,
        totalReviews:    profileData.totalReviews,
      };
    }

    // Fallback: query the legacy `retailers` collection by phone.
    // Retailers save their profile here via saveRetailerProfile().
    // Try both E164 (+91XXXXXXXXXX) and 10-digit formats.
    const phoneDigits = phone.replace(/^\+91/, "");
    const [byE164, byDigits] = await Promise.all([
      getDocs(query(collection(db, "retailers"), where("phone", "==", phone), limit(1))),
      getDocs(query(collection(db, "retailers"), where("phone", "==", phoneDigits), limit(1))),
    ]);

    const retailerDoc = byE164.docs[0] ?? byDigits.docs[0];
    if (retailerDoc) {
      const r = retailerDoc.data();
      const legacyShopName = String(r.shopName ?? r.ownerName ?? "").trim();
      if (legacyShopName) {
        return {
          phone,
          shopName: legacyShopName,
          ownerName: r.ownerName ? String(r.ownerName) : undefined,
          address: r.address ? String(r.address) : undefined,
          city: r.city ? String(r.city) : undefined,
          state: r.state ? String(r.state) : undefined,
          role: "retailer",
        };
      }
    }

    // Return whatever we have from profiles, even if the shop name is generic.
    if (profileData) {
      return {
        phone:          String(profileData.phone ?? phone),
        secondaryPhone: profileData.secondaryPhone ? String(profileData.secondaryPhone) : undefined,
        shopName:       profileShopName || "Retailer",
        businessName:   profileData.businessName ? String(profileData.businessName) : (profileShopName || undefined),
        ownerName:      profileData.ownerName  ? String(profileData.ownerName)  : undefined,
        address:        profileData.address    ? String(profileData.address)    : undefined,
        city:           profileData.city       ? String(profileData.city)       : undefined,
        state:          profileData.state      ? String(profileData.state)      : undefined,
        bio:            profileData.bio        ? String(profileData.bio)        : undefined,
        role:           String(profileData.role ?? "retailer"),
        logo:           profileData.logo       ? String(profileData.logo)       : undefined,
        banner:         profileData.banner     ? String(profileData.banner)     : undefined,
        website:        profileData.website    ? String(profileData.website)    : undefined,
        gstin:          profileData.gstin      ? String(profileData.gstin)      : undefined,
        tagline:        profileData.tagline    ? String(profileData.tagline)    : undefined,
        onlineDelivery: typeof profileData.onlineDelivery === "boolean" ? profileData.onlineDelivery : undefined,
        socialLinks:    profileData.socialLinks as Record<string, string> | undefined,
        averageRating:  profileData.averageRating,
        totalReviews:   profileData.totalReviews,
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch up to `limitCount` active product summaries from
 * `retailers/{phone}/products`, excluding the current product.
 *
 * This is O(1) reads — it goes directly to the retailer's subcollection
 * instead of scanning the entire global `products` collection.
 */
export async function fetchRetailerProductSummaries(
  phone: string,
  excludeProductId: string,
  limitCount = 8,
): Promise<RetailerProductSummary[]> {
  try {
    // Fetch a few extra to account for the excluded product and inactive ones.
    const q = query(
      collection(db, "retailers", phone, "products"),
      orderBy("createdAt", "desc"),
      limit(limitCount + 3),
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => {
        const data = d.data();
        return {
          productId: d.id,
          name: String(data.name ?? ""),
          image: String(data.image ?? ""),
          price: Number(data.price ?? 0),
          category: String(data.category ?? ""),
          isActive: data.isActive !== false,
        };
      })
      .filter((p) => p.productId !== excludeProductId && p.isActive && p.name)
      .slice(0, limitCount);
  } catch {
    return [];
  }
}
