import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore/lite";
import { getClientDb } from "../../lib/firebase-client-server";
import { buildProductSlug } from "../../lib/seo/products-server";
import BrandView from "../../views/BrandView";
import type {
  ManufacturerBrandData,
  BrandProductSummary,
  BrandRetailerSummary,
  BrandPageCustomization,
} from "../../dashboard/_lib/brand-page-types";
import { assembleBrandData } from "../../dashboard/_lib/brand-page-types";

export const dynamic = "force-dynamic";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://krishidukan.com";

interface PageProps {
  params: Promise<{ slug: string }>;
}

// ─── Data fetching ────────────────────────────────────────────────────────────

async function resolveSlugToPhone(slug: string): Promise<string | null> {
  const db = getClientDb();
  const snap = await getDocs(
    query(collection(db, "manufacturers"), where("slug", "==", slug), limit(1)),
  );
  if (snap.empty) return null;
  return snap.docs[0].id;
}

async function fetchPageData(manufacturerPhone: string): Promise<{
  brand: ManufacturerBrandData;
  products: BrandProductSummary[];
  retailers: BrandRetailerSummary[];
} | null> {
  const db = getClientDb();

  const [mfrSnap, retailerDocsSnap] = await Promise.all([
    getDoc(doc(db, "manufacturers", manufacturerPhone)),
    // Fetch ALL linked retailer mirror docs — no limit, subcollection is scoped to one manufacturer.
    getDocs(collection(db, "manufacturers", manufacturerPhone, "retailers")),
  ]);

  if (!mfrSnap.exists()) return null;

  const mfrData = mfrSnap.data() as Record<string, unknown>;
  const uid = String(mfrData.uid ?? mfrData.manufacturerId ?? "");

  // Brand page may be stored under phone (canonical) or uid (when manufacturer dashboard saved
  // before uidIndex was created for the account). Try phone first, then uid as fallback.
  let brandSnap = await getDoc(doc(db, "brandPages", manufacturerPhone));
  if (!brandSnap.exists() && uid && uid !== manufacturerPhone) {
    brandSnap = await getDoc(doc(db, "brandPages", uid));
  }

  const customization = brandSnap.exists()
    ? (brandSnap.data() as Partial<BrandPageCustomization>)
    : null;

  const brand = assembleBrandData(manufacturerPhone, mfrData, customization);

  // ── Products: manufacturer-owned catalog only ──────────────────────────────
  // Run two queries in parallel to cover both field schemas:
  //   - new schema: manufacturerId == uid (set on products created via the new dashboard)
  //   - legacy schema: ownerId == uid + ownerType == "manufacturer" (older products)
  // Deduplicate by document ID, then exclude retailer-assigned copies.
  let products: BrandProductSummary[] = [];
  if (uid) {
    const [byManufacturerId, byOwnerId] = await Promise.all([
      getDocs(
        query(
          collection(db, "products"),
          where("manufacturerId", "==", uid),
          where("isActive", "==", true),
        ),
      ),
      getDocs(
        query(
          collection(db, "products"),
          where("ownerId", "==", uid),
          where("ownerType", "==", "manufacturer"),
        ),
      ),
    ]);

    const seen = new Set<string>();
    products = [...byManufacturerId.docs, ...byOwnerId.docs]
      .filter((d) => {
        if (seen.has(d.id)) return false;
        seen.add(d.id);
        const r = d.data() as Record<string, unknown>;
        // exclude inactive and retailer-assigned copies
        return r.isActive !== false && r.source !== "manufacturer_assigned";
      })
      .map((d) => {
        const r = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          name: String(r.name ?? ""),
          category: String(r.category ?? ""),
          price: Number(r.price ?? 0),
          image: String(r.image ?? ""),
        };
      });
  }

  // ── Retailers: build summaries, enriching from retailers/{docId} when mirror lacks geo ──
  function parseGeo(g: unknown): { latitude: number; longitude: number } | null {
    if (!g || typeof g !== "object") return null;
    const { latitude, longitude } = g as { latitude?: number; longitude?: number };
    return typeof latitude === "number" && typeof longitude === "number"
      ? { latitude, longitude }
      : null;
  }

  // Match Retailer Network dashboard logic: exclude only explicitly revoked/removed/inactive
  // entries. "invited" retailers (pending claim) are visible — they appear in the dashboard too.
  const activeMirrors = retailerDocsSnap.docs.filter((d) => {
    const r = d.data() as Record<string, unknown>;
    const status = String(r.status ?? "invited");
    const onboarding = String(r.onboardingStatus ?? "active");
    return (
      status !== "revoked" &&
      onboarding !== "removed" &&
      onboarding !== "inactive"
    );
  });

  // Debug: log mirror counts server-side so mismatches are visible in server logs.
  console.log(
    `[BrandPage] ${manufacturerPhone} — subcollection docs: ${retailerDocsSnap.docs.length}, ` +
    `after filter: ${activeMirrors.length}`,
  );

  // For each mirror, fetch the full retailers/{docId} profile in parallel to get geo/address.
  // retailerDocId field in the mirror points to the correct doc in the retailers collection.
  // Process all filtered mirrors — no cap, subcollection is fetched in full.
  const retailers: BrandRetailerSummary[] = await Promise.all(
    activeMirrors.map(async (d) => {
      const r = d.data() as Record<string, unknown>;
      const mirrorAddr = (r.address ?? {}) as Record<string, unknown>;
      const mirrorGeo = parseGeo(r.geo);
      const shopName = String(r.shopName ?? r.ownerName ?? "");
      const ownerName = String(r.ownerName ?? "");

      const mirrorLogo = String(r.logo ?? "");

      // If mirror already has both geo and city, use it directly
      if (mirrorGeo && mirrorAddr.city) {
        return {
          phone: d.id,
          secondaryPhone: String(r.secondaryPhone ?? ""),
          shopName,
          ownerName,
          address: {
            city: String(mirrorAddr.city ?? ""),
            state: String(mirrorAddr.state ?? ""),
            line1: String(mirrorAddr.line1 ?? ""),
          },
          geo: mirrorGeo,
          logo: mirrorLogo || undefined,
        };
      }

      // Slow path: fetch the retailer's global profile to get address/geo.
      // Try retailers/{docId} first (may be stored as E164 "+91…" or bare 10-digit).
      // Fall back to profiles/{docId} which is always publicly readable.
      const retailerDocId = String(r.retailerDocId ?? d.id);
      // Derive the alternate phone format so we catch both stored forms.
      const altRetailerId = retailerDocId.startsWith("+91")
        ? retailerDocId.slice(3)
        : `+91${retailerDocId}`;

      const tryFetch = async (id: string) => {
        try {
          const snap = await getDoc(doc(db, "retailers", id));
          if (snap.exists()) return snap.data() as Record<string, unknown>;
        } catch { /* fall through */ }
        return null;
      };

      const tryProfileFetch = async (id: string) => {
        try {
          const snap = await getDoc(doc(db, "profiles", id));
          if (snap.exists()) return snap.data() as Record<string, unknown>;
        } catch { /* fall through */ }
        return null;
      };

      const rd =
        (await tryFetch(retailerDocId)) ??
        (retailerDocId !== altRetailerId ? await tryFetch(altRetailerId) : null) ??
        (await tryProfileFetch(retailerDocId)) ??
        (retailerDocId !== altRetailerId ? await tryProfileFetch(altRetailerId) : null);

      if (rd) {
        const rdAddr = (rd.address ?? {}) as Record<string, unknown>;
        return {
          phone: d.id,
          secondaryPhone: String(rd.secondaryPhone ?? r.secondaryPhone ?? ""),
          shopName: shopName || String(rd.shopName ?? rd.businessName ?? rd.ownerName ?? ""),
          ownerName: ownerName || String(rd.ownerName ?? ""),
          address: {
            city: String(rdAddr.city ?? rd.city ?? mirrorAddr.city ?? ""),
            state: String(rdAddr.state ?? rd.state ?? mirrorAddr.state ?? ""),
            line1: String(rdAddr.line1 ?? mirrorAddr.line1 ?? ""),
          },
          geo: parseGeo(rd.geo) ?? mirrorGeo,
          logo: String(rd.logo ?? "") || mirrorLogo || undefined,
        };
      }

      return {
        phone: d.id,
        secondaryPhone: String(r.secondaryPhone ?? ""),
        shopName,
        ownerName,
        address: {
          city: String(mirrorAddr.city ?? ""),
          state: String(mirrorAddr.state ?? ""),
          line1: String(mirrorAddr.line1 ?? ""),
        },
        geo: mirrorGeo,
        logo: mirrorLogo || undefined,
      };
    }),
  );

  return { brand, products, retailers };
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const phone = await resolveSlugToPhone(slug);
  if (!phone) return { title: "Brand Not Found | KrishiDukan" };

  const db = getClientDb();
  const [snap, brandSnap] = await Promise.all([
    getDoc(doc(db, "manufacturers", phone)),
    getDoc(doc(db, "brandPages", phone)),
  ]);

  if (!snap.exists()) return { title: "Brand Not Found | KrishiDukan" };

  const d = snap.data() as Record<string, unknown>;
  const name = String(d.businessName ?? d.ownerName ?? "Brand");
  const tagline = brandSnap.exists() ? String(brandSnap.data()?.tagline ?? "") : "";

  const brandTitle = `${name} | KrishiDukan`;
  const brandDescription =
    tagline ||
    `${name} — verified manufacturer on KrishiDukan. View products and find nearby stores.`;
  return {
    title: brandTitle,
    description: brandDescription,
    alternates: { canonical: `${SITE_URL}/brand/${slug}` },
    openGraph: {
      title: brandTitle,
      description: tagline || `${name} — verified manufacturer on KrishiDukan.`,
      images: [{ url: "/images/og-default.png", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: brandTitle,
      description: brandDescription,
      images: ["/images/og-default.png"],
    },
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function BrandPage({ params }: PageProps) {
  const { slug } = await params;
  const phone = await resolveSlugToPhone(slug);
  if (!phone) notFound();

  const data = await fetchPageData(phone);
  if (!data) notFound();

  return (
    <main>
      {/* Server-rendered product links — crawlable by Google, hidden visually.
          BrandView renders the interactive product grid for users. */}
      {data.products.length > 0 && (
        <nav aria-label="Brand products" className="sr-only">
          <ul>
            {data.products.map((p) => (
              <li key={p.id}>
                <Link href={`/products/${buildProductSlug(p.name, p.id)}`}>
                  {p.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <BrandView
        brand={data.brand}
        products={data.products}
        retailers={data.retailers}
      />
    </main>
  );
}
