/** Shared types and pure helpers for brand pages — safe to import in both server and client code. */

// ─── Types ────────────────────────────────────────────────────────────────────

export type BrandPageCustomization = {
  tagline: string;
  about: string;
  establishedYear: string;
  website: string;
  socialProof: string;
  certifications: string[];
  videos: string[];
  primaryColor: string;
  accentColor: string;
  logo: string;
  banner: string;
  socialLinks?: {
    instagram?: string;
    facebook?: string;
    whatsapp?: string;
    youtube?: string;
  };
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type ManufacturerBrandData = {
  phone: string;
  secondaryPhone: string;
  uid: string | null;
  businessName: string;
  ownerName: string;
  address: { city: string; state: string; line1: string };
  geo: { latitude: number; longitude: number } | null;
  email: string;
  slug: string;
  tagline: string;
  about: string;
  establishedYear: string;
  website: string;
  socialProof: string;
  certifications: string[];
  videos: string[];
  primaryColor: string;
  accentColor: string;
  logo: string;
  banner: string;
  socialLinks?: {
    instagram?: string;
    facebook?: string;
    whatsapp?: string;
    youtube?: string;
  };
  averageRating?: number;
  totalReviews?: number;
};

export type BrandProductSummary = {
  id: string;
  name: string;
  category: string;
  price: number;
  image: string;
};

export type BrandRetailerSummary = {
  phone: string;
  secondaryPhone: string;
  shopName: string;
  ownerName: string;
  address: { city: string; state: string; line1: string };
  geo: { latitude: number; longitude: number } | null;
  logo?: string;
};

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_CUSTOMIZATION = {
  tagline: "",
  about: "",
  establishedYear: "",
  website: "",
  socialProof: "",
  certifications: [] as string[],
  videos: [] as string[],
  primaryColor: "#154212",
  accentColor: "#f57c00",
  logo: "",
  banner: "",
};

// ─── Pure helpers ─────────────────────────────────────────────────────────────

export function assembleBrandData(
  manufacturerPhone: string,
  manufacturerDoc: Record<string, unknown>,
  customization: Partial<BrandPageCustomization> | null,
): ManufacturerBrandData {
  const c = customization ?? {};
  const addr = (manufacturerDoc.address ?? {}) as Record<string, unknown>;
  const geo = manufacturerDoc.geo as { latitude?: number; longitude?: number } | null;

  return {
    phone: manufacturerPhone,
    secondaryPhone: String(manufacturerDoc.secondaryPhone ?? ""),
    uid: manufacturerDoc.uid
      ? String(manufacturerDoc.uid)
      : manufacturerDoc.manufacturerId
        ? String(manufacturerDoc.manufacturerId)
        : null,
    businessName: String(manufacturerDoc.businessName ?? manufacturerDoc.ownerName ?? ""),
    ownerName: String(manufacturerDoc.ownerName ?? ""),
    address: {
      city: String(addr.city ?? ""),
      state: String(addr.state ?? ""),
      line1: String(addr.line1 ?? ""),
    },
    geo:
      geo && typeof geo.latitude === "number" && typeof geo.longitude === "number"
        ? { latitude: geo.latitude, longitude: geo.longitude }
        : null,
    email: String(manufacturerDoc.email ?? ""),
    slug: String(manufacturerDoc.slug ?? ""),
    tagline: String(c.tagline ?? DEFAULT_CUSTOMIZATION.tagline),
    about: String(c.about ?? DEFAULT_CUSTOMIZATION.about),
    establishedYear: String(c.establishedYear ?? DEFAULT_CUSTOMIZATION.establishedYear),
    // website, logo, banner: customization overrides > profile field > default
    website: String(c.website || manufacturerDoc.website || DEFAULT_CUSTOMIZATION.website),
    socialProof: String(c.socialProof ?? DEFAULT_CUSTOMIZATION.socialProof),
    certifications: Array.isArray(c.certifications)
      ? c.certifications
      : DEFAULT_CUSTOMIZATION.certifications,
    videos: Array.isArray(c.videos) ? c.videos : DEFAULT_CUSTOMIZATION.videos,
    primaryColor: String(c.primaryColor ?? DEFAULT_CUSTOMIZATION.primaryColor),
    accentColor: String(c.accentColor ?? DEFAULT_CUSTOMIZATION.accentColor),
    logo: String(c.logo || manufacturerDoc.logo || DEFAULT_CUSTOMIZATION.logo),
    banner: String(c.banner || manufacturerDoc.banner || DEFAULT_CUSTOMIZATION.banner),
    socialLinks: c.socialLinks,
    averageRating: typeof manufacturerDoc.averageRating === 'number' ? manufacturerDoc.averageRating : undefined,
    totalReviews: typeof manufacturerDoc.totalReviews === 'number' ? manufacturerDoc.totalReviews : undefined,
  };
}

export function generateSlug(businessName: string, phone: string): string {
  const base = businessName
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const suffix = phone.replace(/\D/g, "").slice(-4);
  return base ? `${base}-${suffix}` : `brand-${suffix}`;
}
