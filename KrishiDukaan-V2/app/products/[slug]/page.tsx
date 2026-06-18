import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import {
  getProductById,
  extractIdFromSlug,
  buildProductSlug,
  type SeoProduct,
} from "../../lib/seo/products-server";
import {
  CATEGORY_FIELDS,
  isStandardCategory,
} from "../../dashboard/_lib/category-info";
import { categoryNameToSlug } from "../../lib/seo/category-meta";

// Incremental Static Regeneration — cached at the edge, refreshed hourly.
export const revalidate = 3600;
export const dynamicParams = true;

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://krishidukan.com";

interface PageProps {
  params: Promise<{ slug: string }>;
}

// Human-readable label for a categoryInfo key, using the dashboard field schema.
function labelForKey(category: string, key: string): string {
  if (isStandardCategory(category)) {
    const field = CATEGORY_FIELDS[category].find((f) => f.key === key);
    if (field) return field.label;
  }
  // Fallback: turn camelCase / snake into Title Case.
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]+/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}

function specRows(p: SeoProduct): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  for (const [key, raw] of Object.entries(p.categoryInfo)) {
    const value = Array.isArray(raw) ? raw.join(", ") : String(raw ?? "");
    if (value.trim()) rows.push({ label: labelForKey(p.category, key), value });
  }
  return rows;
}

function priceValue(p: SeoProduct): number {
  return p.lowestFinalPrice ?? p.lowestPrice ?? p.price;
}

// ─── Metadata ───────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductById(extractIdFromSlug(slug));
  if (!product) return { title: "Product Not Found | KrishiDukan" };

  const crops = [
    ...(Array.isArray(product.categoryInfo.bestForCrops)
      ? product.categoryInfo.bestForCrops
      : []),
  ].join(", ");
  const dosage = product.categoryInfo.dosage
    ? `Dosage: ${product.categoryInfo.dosage}. `
    : "";

  const title = `${product.name} — Price, Uses & Buy Online | KrishiDukan`;
  const description =
    `Buy ${product.name} (${product.category}) online at KrishiDukan. ${dosage}` +
    `${crops ? `Best for ${crops}. ` : ""}` +
    `Price ₹${priceValue(product)}. Compare nearby sellers and order with doorstep delivery.`;

  const canonicalPath = `/products/${buildProductSlug(product.name, product.id)}`;
  const images = (product.images.length ? product.images : [product.image]).filter(
    Boolean,
  );

  return {
    title,
    description: description.slice(0, 320),
    alternates: { canonical: canonicalPath },
    openGraph: {
      type: "website",
      title,
      description: description.slice(0, 320),
      url: `${SITE_URL}${canonicalPath}`,
      images: images.map((url) => ({ url })),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: description.slice(0, 200),
      images,
    },
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params;
  const product = await getProductById(extractIdFromSlug(slug));
  if (!product) notFound();

  const rows = specRows(product);
  const price = priceValue(product);
  const categorySlug = categoryNameToSlug(product.category);
  const images = (product.images.length ? product.images : [product.image]).filter(
    Boolean,
  );

  // ── JSON-LD: Product + Offer (+ AggregateRating) ──
  const productLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description || product.fullName || product.name,
    category: product.category,
    ...(images.length ? { image: images } : {}),
    offers: {
      "@type": "Offer",
      priceCurrency: "INR",
      price: String(price),
      availability: product.inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      url: `${SITE_URL}/products/${buildProductSlug(product.name, product.id)}`,
    },
  };
  if (product.totalReviews && product.averageRating) {
    productLd.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: String(product.averageRating),
      reviewCount: String(product.totalReviews),
    };
  }

  // ── JSON-LD: BreadcrumbList ──
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "KrishiDukan", item: SITE_URL },
      ...(categorySlug
        ? [
            {
              "@type": "ListItem",
              position: 2,
              name: product.category,
              item: `${SITE_URL}/category/${categorySlug}`,
            },
          ]
        : []),
      {
        "@type": "ListItem",
        position: categorySlug ? 3 : 2,
        name: product.name,
      },
    ],
  };

  return (
    <main className="min-h-screen bg-surface">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 text-xs font-semibold text-on-surface-variant mb-6 flex-wrap"
        >
          <Link href="/" className="hover:text-primary">
            KrishiDukan
          </Link>
          <span>›</span>
          {categorySlug ? (
            <>
              <Link href={`/category/${categorySlug}`} className="hover:text-primary">
                {product.category}
              </Link>
              <span>›</span>
            </>
          ) : null}
          <span className="text-primary truncate max-w-[220px]">{product.name}</span>
        </nav>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Image (plain img to match existing marketplace rendering; no next/image config change) */}
          {product.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.image}
              alt={product.name}
              className="w-full rounded-2xl border border-surface-container object-cover bg-white"
            />
          ) : null}

          <div>
            <h1 className="text-3xl font-black text-on-surface leading-tight">
              {product.name}
            </h1>
            {product.fullName && product.fullName !== product.name ? (
              <p className="text-base text-on-surface-variant mt-1">{product.fullName}</p>
            ) : null}

            <div className="mt-4 flex items-baseline gap-3">
              <span className="text-2xl font-black text-primary">
                ₹{price.toLocaleString("en-IN")}
              </span>
              {product.oldPrice && product.oldPrice > price ? (
                <span className="text-base text-on-surface-variant line-through">
                  ₹{product.oldPrice.toLocaleString("en-IN")}
                </span>
              ) : null}
            </div>

            {product.totalReviews && product.averageRating ? (
              <p className="mt-2 text-sm text-on-surface-variant">
                ★ {product.averageRating.toFixed(1)} ({product.totalReviews} reviews)
              </p>
            ) : null}

            <p className="mt-2 text-sm font-semibold">
              {product.inStock ? (
                <span className="text-green-700">In stock</span>
              ) : (
                <span className="text-on-surface-variant">Check availability</span>
              )}
            </p>

            {/* Deep-link into the interactive marketplace SPA for ordering. */}
            <Link
              href={`/?view=product&product=${encodeURIComponent(product.id)}`}
              className="mt-6 inline-flex items-center justify-center rounded-2xl bg-primary px-6 py-3 font-bold text-white hover:opacity-90 transition-opacity"
            >
              View sellers &amp; buy →
            </Link>
          </div>
        </div>

        {/* Description */}
        {product.description ? (
          <section className="mt-10">
            <h2 className="text-xl font-black text-on-surface mb-3">
              About {product.name}
            </h2>
            <p className="text-on-surface leading-relaxed whitespace-pre-line">
              {product.description}
            </p>
          </section>
        ) : null}

        {/* Specifications — crawlable spec table from categoryInfo */}
        {rows.length > 0 ? (
          <section className="mt-10">
            <h2 className="text-xl font-black text-on-surface mb-3">
              {product.name} — Specifications &amp; Usage
            </h2>
            <table className="w-full text-sm border border-surface-container rounded-xl overflow-hidden">
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label} className="border-b border-surface-container last:border-0">
                    <th className="text-left align-top font-bold text-on-surface-variant px-4 py-3 w-1/3 bg-surface-container-low">
                      {r.label}
                    </th>
                    <td className="px-4 py-3 text-on-surface">{r.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {/* Variants / pack sizes */}
        {product.variants.length > 0 ? (
          <section className="mt-10">
            <h2 className="text-xl font-black text-on-surface mb-3">Available Pack Sizes</h2>
            <ul className="flex flex-wrap gap-3">
              {product.variants.map((v) => (
                <li
                  key={v.unit}
                  className="rounded-xl border border-surface-container px-4 py-2 text-sm font-semibold text-on-surface"
                >
                  {v.unit} — ₹{Number(v.price).toLocaleString("en-IN")}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Benefits */}
        {product.benefits.length > 0 ? (
          <section className="mt-10">
            <h2 className="text-xl font-black text-on-surface mb-3">Key Benefits</h2>
            <ul className="list-disc pl-6 space-y-1 text-on-surface">
              {product.benefits.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {categorySlug ? (
          <div className="mt-12 pt-8 border-t border-surface-container">
            <Link
              href={`/category/${categorySlug}`}
              className="text-sm font-bold text-primary hover:underline"
            >
              ← Browse more {product.category}
            </Link>
          </div>
        ) : null}
      </div>
    </main>
  );
}
