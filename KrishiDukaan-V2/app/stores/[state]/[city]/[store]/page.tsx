import type { Metadata } from "next";
import Link from "next/link";
import SellerPricingLine from "../../../../../components/shared/seller-pricing-line";
import { notFound, permanentRedirect } from "next/navigation";
import {
  resolveStore,
  storeUrlPath,
  getStoresInCity,
  getStoreProductsPage,
  getAllStores,
  buildStoreSlug,
  slugifyGeo,
  type SeoStore,
} from "../../../../lib/seo/stores-server";
import StoreProductGrid from "../../../_components/store-product-grid";
import { fetchCardsForNames } from "../../../../lib/brand-products";
import { ShareLinkButton } from "../../../../components/shared/share-link-button";
import { shopShareUrl } from "../../../../lib/share-links";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://krishidukan.com";

export const revalidate = 3600;
export const dynamicParams = true;

interface PageProps {
  params: Promise<{ state: string; city: string; store: string }>;
}

export async function generateStaticParams() {
  const stores = await getAllStores();
  return stores.map((s) => ({
    state: slugifyGeo(s.state),
    city: slugifyGeo(s.city),
    store: buildStoreSlug(s.name, s.id),
  }));
}

function describe(store: SeoStore): string {
  const kind =
    store.role === "manufacturer"
      ? "Agri-input manufacturer"
      : "Agricultural products retailer";
  return (
    `${store.name} — ${kind} in ${store.city}, ${store.state}. ` +
    `Find seeds, fertilizers, pesticides and farming tools, see the shop address ` +
    `and get directions on KrishiDukan.`
  );
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { state, city, store: storeSlug } = await params;
  const resolved = await resolveStore(state, city, storeSlug);
  const store = resolved?.store;
  if (!store) return { title: "Store Not Found" };

  const title = `${store.name} — Agricultural Shop in ${store.city}, ${store.state}`;
  const description = describe(store);
  const canonical = `${SITE_URL}${storeUrlPath(store)}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      title: `${title} | KrishiDukan`,
      description,
      url: canonical,
      images: [{ url: "/images/og-default.png", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | KrishiDukan`,
      description,
      images: ["/images/og-default.png"],
    },
  };
}

export default async function StorePage({ params }: PageProps) {
  const { state, city, store: storeSlug } = await params;
  const resolved = await resolveStore(state, city, storeSlug);
  if (!resolved) notFound();

  // The URL carries the shop's state, city and name, all of which change. When
  // any of them has, send the visitor — and the crawler — to where the shop
  // lives now, so an indexed URL survives a data correction instead of dying as
  // a 404 or lingering as a duplicate of the new one. Resolving the canonical
  // path yields the same store and therefore the same path, so this cannot loop.
  if (resolved.canonicalPath !== `/stores/${state}/${city}/${storeSlug}`) {
    permanentRedirect(resolved.canonicalPath);
  }
  const store = resolved.store;

  const [firstPage, siblings] = await Promise.all([
    getStoreProductsPage(store),
    getStoresInCity(state, city),
  ]);
  const products = firstPage.products;
  const nextCursor = firstPage.nextCursor;
  // Cross-seller price and this shop's own discount, for just these products.
  const marketProducts = await fetchCardsForNames(products.map((p) => p.name));
  const others = siblings.filter((s) => s.id !== store.id).slice(0, 8);

  const canonical = `${SITE_URL}${storeUrlPath(store)}`;
  const addressLine = [store.line1, store.city, store.state, store.pincode]
    .filter(Boolean)
    .join(", ");

  // LocalBusiness — the schema that makes a shop eligible for local results.
  // Only fields the store genuinely has are emitted; inventing an openingHours
  // or a rating we don't hold would be misleading markup.
  const localBusinessLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Store",
    name: store.name,
    url: canonical,
    description: describe(store),
    address: {
      "@type": "PostalAddress",
      ...(store.line1 ? { streetAddress: store.line1 } : {}),
      addressLocality: store.city,
      addressRegion: store.state,
      ...(store.pincode ? { postalCode: store.pincode } : {}),
      addressCountry: "IN",
    },
    ...(store.lat && store.lng
      ? { geo: { "@type": "GeoCoordinates", latitude: store.lat, longitude: store.lng } }
      : {}),
    ...(store.phone ? { telephone: store.phone } : {}),
    ...(store.logo ? { image: store.logo } : {}),
    parentOrganization: { "@type": "Organization", name: "KrishiDukan", url: SITE_URL },
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "KrishiDukan", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Stores", item: `${SITE_URL}/stores` },
      {
        "@type": "ListItem",
        position: 3,
        name: store.state,
        item: `${SITE_URL}/stores/${slugifyGeo(store.state)}`,
      },
      {
        "@type": "ListItem",
        position: 4,
        name: store.city,
        item: `${SITE_URL}/stores/${slugifyGeo(store.state)}/${slugifyGeo(store.city)}`,
      },
      { "@type": "ListItem", position: 5, name: store.name },
    ],
  };

  const directionsHref =
    store.lat && store.lng
      ? `https://www.google.com/maps/dir/?api=1&destination=${store.lat},${store.lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          [store.name, store.city, store.state].filter(Boolean).join(", "),
        )}`;

  return (
    <main className="min-h-screen bg-surface">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      <div className="mx-auto max-w-4xl px-4 py-8">
        <nav
          aria-label="Breadcrumb"
          className="mb-6 flex flex-wrap items-center gap-2 text-xs font-semibold text-on-surface-variant"
        >
          <Link href="/" className="hover:text-primary">KrishiDukan</Link>
          <span>›</span>
          <Link href="/stores" className="hover:text-primary">Stores</Link>
          <span>›</span>
          <Link href={`/stores/${slugifyGeo(store.state)}`} className="hover:text-primary">
            {store.state}
          </Link>
          <span>›</span>
          <Link
            href={`/stores/${slugifyGeo(store.state)}/${slugifyGeo(store.city)}`}
            className="hover:text-primary"
          >
            {store.city}
          </Link>
          <span>›</span>
          <span className="text-primary">{store.name}</span>
        </nav>

        {/* Header */}
        <header className="rounded-2xl border border-surface-container bg-white p-6">
          <span className="inline-block rounded-full bg-primary/10 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-primary">
            {store.role === "manufacturer" ? "Manufacturer" : "Agri retailer"}
          </span>
          <h1 className="mt-3 text-2xl font-black leading-tight text-on-surface sm:text-3xl">
            {store.name}
          </h1>
          <p className="mt-1 text-sm font-semibold text-on-surface-variant">
            Agricultural products shop in {store.city}, {store.state}
          </p>

          <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
            {addressLine ? (
              <div>
                <dt className="text-xs font-black uppercase tracking-wide text-on-surface-variant">
                  Address
                </dt>
                <dd className="mt-0.5 text-on-surface">{addressLine}</dd>
              </div>
            ) : null}
            {store.ownerName ? (
              <div>
                <dt className="text-xs font-black uppercase tracking-wide text-on-surface-variant">
                  Proprietor
                </dt>
                <dd className="mt-0.5 text-on-surface">{store.ownerName}</dd>
              </div>
            ) : null}
            {store.phone ? (
              <div>
                <dt className="text-xs font-black uppercase tracking-wide text-on-surface-variant">
                  Phone
                </dt>
                <dd className="mt-0.5">
                  <a href={`tel:${store.phone}`} className="font-bold text-primary hover:underline">
                    {store.phone}
                  </a>
                </dd>
              </div>
            ) : null}
          </dl>

          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={directionsHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-2xl bg-primary px-6 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
            >
              Get directions →
            </a>
            {store.brandSlug ? (
              <Link
                href={`/brand/${store.brandSlug}`}
                className="inline-flex items-center justify-center rounded-2xl border border-surface-container bg-white px-6 py-3 text-sm font-bold text-on-surface transition-colors hover:border-primary"
              >
                View full brand page
              </Link>
            ) : null}
            <ShareLinkButton
              url={shopShareUrl(store.phone ?? store.id)}
              title={store.name}
              text={`${store.name}, ${store.city}: see our products and prices on KrishiDukan`}
              label="Share shop"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-surface-container bg-white px-6 py-3 text-sm font-bold text-on-surface transition-colors hover:border-primary"
            />
          </div>
        </header>

        {/* Products.
            The grid itself is a client island (cart + cross-seller discounts),
            so the crawlable links live in the sr-only nav above it — the same
            split /brand/[slug] uses. Google still sees every product link even
            though the shopping UI is client-rendered. */}
        {products.length > 0 ? (
          <section className="mt-10">
            <h2 className="mb-4 text-lg font-black text-on-surface">
              Products available at {store.name}
            </h2>
            <nav aria-label={`Products at ${store.name}`} className="sr-only">
              <ul>
                {products.map((p) => (
                  <li key={p.id}>
                    <Link href={`/products/${p.slug}`}>{p.name}</Link>
                  </li>
                ))}
              </ul>
            </nav>
            <StoreProductGrid
              products={products}
              storeName={store.name}
              storePhone={store.phone}
              storeIds={[store.id]}
              marketProducts={marketProducts}
              nextCursor={nextCursor}
            />
          </section>
        ) : (
          <section className="mt-10 rounded-2xl border border-surface-container bg-surface-container-low p-6">
            <h2 className="text-base font-black text-on-surface">
              Product list coming soon
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
              {store.name} has not published its catalogue on KrishiDukan yet. Call
              the shop directly, or{" "}
              <Link href="/" className="font-bold text-primary hover:underline">
                browse products from other nearby sellers
              </Link>
              .
            </p>
          </section>
        )}

        {/* Other stores in this city */}
        {others.length > 0 ? (
          <section className="mt-12">
            <h2 className="mb-4 text-lg font-black text-on-surface">
              Other agricultural shops in {store.city}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {others.map((s) => (
                <li key={s.id}>
                  <Link
                    href={storeUrlPath(s)}
                    className="block rounded-2xl border border-surface-container bg-white p-4 transition-colors hover:border-primary"
                  >
                    <p className="text-sm font-black text-on-surface">{s.name}</p>
                    <p className="mt-0.5 text-xs text-on-surface-variant">
                      {[s.line1, s.city].filter(Boolean).join(", ")}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Seller CTA */}
        <section className="mt-12 rounded-2xl border border-surface-container bg-surface-container-low p-6">
          <h2 className="text-base font-black text-on-surface">
            Run an agri shop in {store.city}?
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
            List your store on KrishiDukan so farmers nearby can find you.{" "}
            <SellerPricingLine />
          </p>
          <Link
            href="/sell"
            className="mt-4 inline-flex items-center justify-center rounded-2xl bg-primary px-6 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
          >
            List your store →
          </Link>
        </section>
      </div>
    </main>
  );
}
