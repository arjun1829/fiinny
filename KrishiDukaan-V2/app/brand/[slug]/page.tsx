import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import {
  collection,
  doc,
  getCount,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore/lite";
import { getClientDb } from "../../lib/firebase-client-server";
import { sharePhone } from "../../lib/share-links";
import { buildProductSlug } from "../../lib/seo/products-server";
import BrandView from "../../views/BrandView";
import { countBrandProducts, fetchBrandProductsPage } from "../../lib/brand-products";
import type {
  ManufacturerBrandData,
  BrandProductSummary,
  BrandPageCustomization,
} from "../../dashboard/_lib/brand-page-types";
import { assembleBrandData } from "../../dashboard/_lib/brand-page-types";
import type { MarketplaceProduct } from "../../../types/product";

export const dynamic = "force-dynamic";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://krishidukan.com";

interface PageProps {
  params: Promise<{ slug: string }>;
}

// ─── Data fetching ────────────────────────────────────────────────────────────

async function resolveSlugToPhone(slug: string): Promise<string | null> {
  const db = getClientDb();
  // A shared brand link (app/lib/share-links.ts) carries the phone instead of
  // the slug: /brand/+919876543210. The page itself redirects it to the slug.
  const phone = sharePhone(decodeURIComponent(slug));
  if (phone) {
    const snap = await getDoc(doc(db, "manufacturers", phone));
    return snap.exists() ? phone : null;
  }
  const snap = await getDocs(
    query(collection(db, "manufacturers"), where("slug", "==", slug), limit(1)),
  );
  if (snap.empty) return null;
  return snap.docs[0].id;
}

async function fetchPageData(manufacturerPhone: string): Promise<{
  brand: ManufacturerBrandData;
  products: BrandProductSummary[];
  marketProducts: MarketplaceProduct[];
  retailerCount: number;
  totalProducts: number;
  nextCursor: string | null;
} | null> {
  const db = getClientDb();

  // ── Perf instrumentation ───────────────────────────────────────────────────
  // Per-stage wall-clock timings + approximate doc-read counts, logged once as a
  // single [BrandPagePerf] line. Safe to remove once latency is settled.
  const _perf: Record<string, number> = {};
  let _mark = performance.now();
  const _stage = (name: string) => {
    _perf[name] = +(performance.now() - _mark).toFixed(1);
    _mark = performance.now();
  };
  let _reads = 0;

  // Retailer network is NOT fetched here — it is not on the purchase path and
  // rendering hundreds of map markers + cards was the brand page's dominant
  // cost. Only the count is read (for the hero stat + whether to offer the
  // "Where to Find Us" panel); the list loads on demand via
  // GET /api/brand/retailers. See app/lib/brand-retailers.ts.
  const [mfrSnap, retailerCountSnap] = await Promise.all([
    getDoc(doc(db, "manufacturers", manufacturerPhone)),
    getCount(
      query(collection(db, "manufacturers", manufacturerPhone, "retailers")),
    ).catch(() => null),
  ]);
  const retailerCount = retailerCountSnap?.data().count ?? 0;
  _reads += 1;
  _stage("profile+count");

  if (!mfrSnap.exists()) return null;

  const mfrData = mfrSnap.data() as Record<string, unknown>;
  const uid = String(mfrData.uid ?? mfrData.manufacturerId ?? "");

  // Brand page may be stored under phone (canonical) or uid (when manufacturer dashboard saved
  // before uidIndex was created for the account). Try phone first, then uid as fallback.
  let brandSnap = await getDoc(doc(db, "brandPages", manufacturerPhone));
  _reads += 1;
  if (!brandSnap.exists() && uid && uid !== manufacturerPhone) {
    brandSnap = await getDoc(doc(db, "brandPages", uid));
    _reads += 1;
  }
  _stage("brandPages");

  const customization = brandSnap.exists()
    ? (brandSnap.data() as Partial<BrandPageCustomization>)
    : null;

  const brand = assembleBrandData(manufacturerPhone, mfrData, customization);

  // ── Products: the brand's own catalog, first page only ─────────────────────
  // One bounded query on the brand's phone (app/lib/brand-products.ts): 12 own
  // products plus their pre-merged marketplace cards; the rest load on demand
  // through /api/brand/products. This replaced matching on the manufacturer's
  // uid (wrong on some accounts: UNIMAX showed no products) and reading every
  // retailer copy of every product (2,000+ docs for a big brand) to merge
  // prices. Works because normalizeProductOwnerOnWrite keeps manufacturerPhone
  // on every product a brand owns.
  const [page, totalProducts] = await Promise.all([
    fetchBrandProductsPage(manufacturerPhone),
    countBrandProducts(manufacturerPhone),
  ]);
  const products: BrandProductSummary[] = page.products;
  const marketProducts: MarketplaceProduct[] = page.marketProducts;
  const nextCursor = page.nextCursor;
  _reads += products.length + marketProducts.length + 1;
  _perf["product.docsFetched"] = products.length;
  _stage("products+ratings");

  // One structured line per request. Grep server logs for [BrandPagePerf].
  // Only ms-valued keys are summed for totalMs (count metrics live alongside).
  const _msKeys = ["profile+count", "brandPages", "products+ratings"];
  console.log(
    "[BrandPagePerf]",
    JSON.stringify({
      phone: manufacturerPhone,
      retailerCount,
      productDocsFetched: _perf["product.docsFetched"] ?? 0,
      totalReads: _reads,
      stagesMs: _perf,
      totalMs: +_msKeys.reduce((a, k) => a + (_perf[k] ?? 0), 0).toFixed(1),
    }),
  );

  return { brand, products, marketProducts, retailerCount, totalProducts, nextCursor };
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const phone = await resolveSlugToPhone(slug);
  if (!phone) return { title: "Brand Not Found" };

  const db = getClientDb();
  const [snap, brandSnap] = await Promise.all([
    getDoc(doc(db, "manufacturers", phone)),
    getDoc(doc(db, "brandPages", phone)),
  ]);

  if (!snap.exists()) return { title: "Brand Not Found" };

  const d = snap.data() as Record<string, unknown>;
  const name = String(d.businessName ?? d.ownerName ?? "Brand");
  const tagline = brandSnap.exists() ? String(brandSnap.data()?.tagline ?? "") : "";

  // Bare name — the "%s | KrishiDukan" template in app/layout.tsx appends the
  // brand. shareTitle carries it explicitly for openGraph/twitter, which the
  // template does not apply to.
  const brandTitle = name;
  const shareTitle = `${name} | KrishiDukan`;
  const brandDescription =
    tagline ||
    `${name} — verified manufacturer on KrishiDukan. View products and find nearby stores.`;
  return {
    title: brandTitle,
    description: brandDescription,
    alternates: { canonical: `${SITE_URL}/brand/${slug}` },
    openGraph: {
      title: shareTitle,
      description: tagline || `${name} — verified manufacturer on KrishiDukan.`,
      // og:image comes from ./opengraph-image.tsx (the brand's own card).
    },
    twitter: {
      card: "summary_large_image",
      title: shareTitle,
      description: brandDescription,
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

  // Shared link by phone: show the brand at its usual address when it has one.
  if (sharePhone(decodeURIComponent(slug)) && data.brand.slug && data.brand.slug !== slug) {
    redirect(`/brand/${encodeURIComponent(data.brand.slug)}`);
  }

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
        marketProducts={data.marketProducts}
        retailerCount={data.retailerCount}
        totalProducts={data.totalProducts}
        nextCursor={data.nextCursor}
      />
    </main>
  );
}
