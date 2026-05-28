import { notFound } from "next/navigation";
import type { Metadata } from "next";
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
import BrandView from "../../views/BrandView";
import type {
  ManufacturerBrandData,
  BrandProductSummary,
  BrandRetailerSummary,
  BrandPageCustomization,
} from "../../dashboard/_lib/brand-page-types";
import { assembleBrandData } from "../../dashboard/_lib/brand-page-types";

export const dynamic = "force-dynamic";

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

  const [mfrSnap, brandSnap, retailerDocsSnap] = await Promise.all([
    getDoc(doc(db, "manufacturers", manufacturerPhone)),
    getDoc(doc(db, "brandPages", manufacturerPhone)),
    // Fetch up to 50 linked retailer mirror docs from subcollection (public list allowed)
    getDocs(query(collection(db, "manufacturers", manufacturerPhone, "retailers"), limit(50))),
  ]);

  if (!mfrSnap.exists()) return null;

  const mfrData = mfrSnap.data() as Record<string, unknown>;
  const uid = String(mfrData.uid ?? mfrData.manufacturerId ?? "");
  const customization = brandSnap.exists()
    ? (brandSnap.data() as Partial<BrandPageCustomization>)
    : null;

  const brand = assembleBrandData(manufacturerPhone, mfrData, customization);

  // ── Products: manufacturer-owned catalog only ──────────────────────────────
  // Fetch with a generous limit, then client-filter out retailer-assigned copies
  // (those have source === "manufacturer_assigned") so they don't appear twice.
  let products: BrandProductSummary[] = [];
  if (uid) {
    const productsSnap = await getDocs(
      query(
        collection(db, "products"),
        where("manufacturerId", "==", uid),
        where("isActive", "==", true),
        limit(60),
      ),
    );
    products = productsSnap.docs
      .filter((d) => {
        const r = d.data() as Record<string, unknown>;
        return r.source !== "manufacturer_assigned";
      })
      .slice(0, 30)
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

  const activeMirrors = retailerDocsSnap.docs.filter((d) => {
    const r = d.data() as Record<string, unknown>;
    return (
      String(r.status ?? "") === "active" &&
      String(r.onboardingStatus ?? "active") !== "pending"
    );
  });

  // For each mirror, fetch the full retailers/{docId} profile in parallel to get geo/address.
  // retailerDocId field in the mirror points to the correct doc in the retailers collection.
  const retailers: BrandRetailerSummary[] = await Promise.all(
    activeMirrors.slice(0, 20).map(async (d) => {
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

      // Otherwise fetch from retailers/{retailerDocId} (publicly readable)
      const retailerDocId = String(r.retailerDocId ?? d.id);
      try {
        const rSnap = await getDoc(doc(db, "retailers", retailerDocId));
        if (rSnap.exists()) {
          const rd = rSnap.data() as Record<string, unknown>;
          const rdAddr = (rd.address ?? {}) as Record<string, unknown>;
          return {
            phone: d.id,
            shopName: shopName || String(rd.shopName ?? rd.ownerName ?? ""),
            ownerName: ownerName || String(rd.ownerName ?? ""),
            address: {
              city: String(rdAddr.city ?? mirrorAddr.city ?? ""),
              state: String(rdAddr.state ?? mirrorAddr.state ?? ""),
              line1: String(rdAddr.line1 ?? mirrorAddr.line1 ?? ""),
            },
            geo: parseGeo(rd.geo) ?? mirrorGeo,
            logo: String(rd.logo ?? "") || mirrorLogo || undefined,
          };
        }
      } catch {
        // fall through to mirror data
      }

      return {
        phone: d.id,
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

  return {
    title: `${name} | KrishiDukan`,
    description:
      tagline ||
      `${name} — verified manufacturer on KrishiDukan. View products and find nearby stores.`,
    openGraph: {
      title: `${name} | KrishiDukan`,
      description: tagline || `${name} — verified manufacturer on KrishiDukan.`,
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
      <BrandView
        brand={data.brand}
        products={data.products}
        retailers={data.retailers}
      />
    </main>
  );
}
