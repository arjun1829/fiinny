/**
 * A retailer's brand page — the shop's own public page at /shop/{phone},
 * the retailer counterpart of a manufacturer's /brand page.
 *
 * Stored at retailerBrandPages/{E164 phone}. Name, logo, banner, address and
 * phone are NOT duplicated here: they stay on the shop's profile (edited on
 * the Profile screen) so there is one source of truth for them. This doc only
 * holds what the brand page adds, plus the visibility switch.
 *
 * Field limits match firestore.rules (validRetailerBrandPage) and the app's
 * mobile/lib/features/brand/data/retailer_brand_repository.dart.
 */

export const RB_LIMITS = {
  tagline: 120,
  about: 2000,
  photos: 8,
  openingHours: 120,
  highlights: 8,
  highlight: 40,
} as const;

export type RetailerBrandSocials = {
  instagram?: string;
  facebook?: string;
  youtube?: string;
};

export type RetailerBrandPage = {
  /** Public visibility. Off = only the owner sees it; /shop/{phone} falls back to the store listing. */
  enabled: boolean;
  tagline: string;
  about: string;
  establishedYear: string;
  /** Shop photos (Storage URLs), shown as a gallery. */
  photos: string[];
  /** Free text, e.g. "Mon–Sat 8am – 8pm". */
  openingHours: string;
  /** Short chips: "Home delivery", "Soil testing", "Credit for farmers"… */
  highlights: string[];
  /** WhatsApp number for the Chat button; blank = the shop phone. */
  whatsapp: string;
  socialLinks: RetailerBrandSocials;
};

export const EMPTY_RETAILER_BRAND: RetailerBrandPage = {
  enabled: false,
  tagline: "",
  about: "",
  establishedYear: "",
  photos: [],
  openingHours: "",
  highlights: [],
  whatsapp: "",
  socialLinks: {},
};

/** Suggestions offered as one-tap chips in the editor. */
export const SUGGESTED_HIGHLIGHTS = [
  "Home delivery",
  "Genuine products",
  "Expert crop advice",
  "Soil testing",
  "Seeds & saplings",
  "Credit for farmers",
  "Bulk orders",
  "Open on Sundays",
];

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

const httpsOnly = (v: unknown) => {
  const s = str(v, 300);
  return /^https:\/\//i.test(s) ? s : "";
};

const SOCIAL_HOSTS = {
  instagram: "https://instagram.com/",
  facebook: "https://facebook.com/",
  youtube: "https://youtube.com/@",
} as const;

/**
 * A social link as typed — "https://…", "instagram.com/shop" or "@shop" — as
 * an https URL, or "" when it can't be one.
 */
export function socialUrl(kind: keyof typeof SOCIAL_HOSTS, raw: unknown): string {
  let v = str(raw, 300);
  if (!v) return "";
  if (/^@?[\w.-]{2,60}$/.test(v) && !v.includes(".")) return SOCIAL_HOSTS[kind] + v.replace(/^@/, "");
  if (/^@[\w.-]{2,60}$/.test(v)) return SOCIAL_HOSTS[kind] + v.slice(1);
  if (/^http:\/\//i.test(v)) v = v.replace(/^http:/i, "https:");
  if (!/^https:\/\//i.test(v)) v = `https://${v}`;
  try {
    const u = new URL(v);
    return u.hostname.includes(".") ? u.toString() : "";
  } catch {
    return "";
  }
}

/** Reads a stored doc defensively — an old or partial doc never breaks the page. */
export function parseRetailerBrand(data: Record<string, unknown> | undefined | null): RetailerBrandPage {
  if (!data) return { ...EMPTY_RETAILER_BRAND };
  const social = (data.socialLinks && typeof data.socialLinks === "object"
    ? data.socialLinks
    : {}) as Record<string, unknown>;
  return {
    enabled: data.enabled === true,
    tagline: str(data.tagline, RB_LIMITS.tagline),
    about: str(data.about, RB_LIMITS.about),
    establishedYear: str(data.establishedYear, 20).replace(/\D/g, "").slice(0, 4),
    photos: Array.isArray(data.photos)
      ? data.photos.map(httpsOnly).filter(Boolean).slice(0, RB_LIMITS.photos)
      : [],
    openingHours: str(data.openingHours, RB_LIMITS.openingHours),
    highlights: Array.isArray(data.highlights)
      ? data.highlights.map((h) => str(h, RB_LIMITS.highlight)).filter(Boolean).slice(0, RB_LIMITS.highlights)
      : [],
    whatsapp: str(data.whatsapp, 16).replace(/[^\d+]/g, ""),
    socialLinks: {
      instagram: socialUrl("instagram", social.instagram) || undefined,
      facebook: socialUrl("facebook", social.facebook) || undefined,
      youtube: socialUrl("youtube", social.youtube) || undefined,
    },
  };
}

/** The shape written to Firestore (rules reject any other key). */
export function serializeRetailerBrand(b: RetailerBrandPage): Record<string, unknown> {
  const p = parseRetailerBrand(b as unknown as Record<string, unknown>);
  const socialLinks: Record<string, string> = {};
  for (const [k, v] of Object.entries(p.socialLinks)) if (v) socialLinks[k] = v;
  return {
    enabled: b.enabled === true,
    tagline: p.tagline,
    about: p.about,
    establishedYear: p.establishedYear,
    photos: p.photos,
    openingHours: p.openingHours,
    highlights: p.highlights,
    whatsapp: p.whatsapp,
    socialLinks,
  };
}

/** The shop's public profile fields the brand page shows (from profiles / retailers). */
export type RetailerBrandProfile = {
  phone: string;
  name: string;
  ownerName: string;
  logo: string;
  banner: string;
  line1: string;
  city: string;
  state: string;
  pincode: string;
  lat?: number;
  lng?: number;
  onlineDelivery: boolean;
  /** Socials saved on the Profile screen — the brand page's own links win. */
  socialLinks: RetailerBrandSocials;
};

export function parseRetailerProfile(phone: string, d: Record<string, unknown> | undefined): RetailerBrandProfile {
  const data = d ?? {};
  const addr = (data.address && typeof data.address === "object" ? data.address : {}) as Record<string, unknown>;
  const geo = (data.geo && typeof data.geo === "object" ? data.geo : {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const social = (data.socialLinks && typeof data.socialLinks === "object"
    ? data.socialLinks
    : {}) as Record<string, unknown>;
  return {
    phone,
    name: str(data.shopName ?? data.businessName ?? data.storeName ?? data.name ?? data.ownerName, 120),
    ownerName: str(data.ownerName, 120),
    logo: httpsOnly(data.logo),
    banner: httpsOnly(data.banner),
    line1: str(addr.line1 ?? (typeof data.address === "string" ? data.address : ""), 200),
    city: str(addr.city ?? data.city, 80),
    state: str(addr.state ?? data.state, 80),
    pincode: str(addr.pincode ?? data.pincode, 10),
    // geo is a Firestore GeoPoint (latitude/longitude) or a plain {lat,lng} map.
    lat: num(geo.latitude) ?? num(geo.lat) ?? num(data.lat),
    lng: num(geo.longitude) ?? num(geo.lng) ?? num(data.lng),
    onlineDelivery: data.onlineDelivery === true,
    socialLinks: {
      instagram: httpsOnly(social.instagram) || undefined,
      facebook: httpsOnly(social.facebook) || undefined,
      youtube: httpsOnly(social.youtube) || undefined,
    },
  };
}
