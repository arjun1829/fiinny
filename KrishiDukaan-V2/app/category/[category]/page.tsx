import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import {
  getProductsByCategory,
  buildProductSlug,
} from "../../lib/seo/products-server";
import { getCategoryBySlug, SEO_CATEGORIES } from "../../lib/seo/category-meta";

// ISR — cached at the edge, refreshed hourly.
export const revalidate = 3600;
export const dynamicParams = true;

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://krishidukan.com";

interface PageProps {
  params: Promise<{ category: string }>;
}

// Pre-generate the known category pages at build time; unknown slugs 404.
export function generateStaticParams() {
  return SEO_CATEGORIES.map((c) => ({ category: c.slug }));
}

// ─── Metadata ───────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { category } = await params;
  const meta = getCategoryBySlug(category);
  if (!meta) return { title: "Category Not Found | KrishiDukan" };

  const title = `Buy ${meta.heading} Online — Best Prices in India | KrishiDukan`;
  return {
    title,
    description: meta.metaDescription,
    alternates: { canonical: `/category/${meta.slug}` },
    openGraph: {
      type: "website",
      title,
      description: meta.metaDescription,
      url: `${SITE_URL}/category/${meta.slug}`,
      images: [{ url: "/images/og-default.png", width: 1200, height: 630 }],
    },
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function CategoryPage({ params }: PageProps) {
  const { category } = await params;
  const meta = getCategoryBySlug(category);
  if (!meta) notFound();

  const products = await getProductsByCategory(meta.name);

  // ── JSON-LD: BreadcrumbList ──
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "KrishiDukan", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: meta.heading },
    ],
  };

  // ── JSON-LD: CollectionPage + ItemList ──
  const collectionLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${meta.heading} — KrishiDukan`,
    description: meta.metaDescription,
    url: `${SITE_URL}/category/${meta.slug}`,
    ...(products.length
      ? {
          mainEntity: {
            "@type": "ItemList",
            numberOfItems: products.length,
            itemListElement: products.slice(0, 30).map((p, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: p.name,
              url: `${SITE_URL}/products/${buildProductSlug(p.name, p.id)}`,
            })),
          },
        }
      : {}),
  };

  return (
    <main className="min-h-screen bg-surface">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionLd) }}
      />

      <div className="max-w-6xl mx-auto px-4 py-10">
        {/* Breadcrumb */}
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 text-xs font-semibold text-on-surface-variant mb-6"
        >
          <Link href="/" className="hover:text-primary">
            KrishiDukan
          </Link>
          <span>›</span>
          <span className="text-primary">{meta.heading}</span>
        </nav>

        <h1 className="text-3xl md:text-4xl font-black text-on-surface leading-tight">
          Buy {meta.heading} Online
        </h1>

        {/* Indexable intro copy */}
        <p className="mt-4 max-w-3xl text-on-surface-variant leading-relaxed">
          {meta.intro}
        </p>

        {/* Product grid — real crawlable links */}
        {products.length > 0 ? (
          <section className="mt-10">
            <h2 className="sr-only">{meta.heading} products</h2>
            <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
              {products.map((p) => {
                const price = p.lowestFinalPrice ?? p.lowestPrice ?? p.price;
                return (
                  <li key={p.id}>
                    <Link
                      href={`/products/${buildProductSlug(p.name, p.id)}`}
                      className="group block rounded-2xl border border-surface-container bg-white p-3 hover:shadow-md transition-shadow h-full"
                    >
                      {p.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.image}
                          alt={p.name}
                          className="w-full aspect-square object-cover rounded-xl bg-surface-container-low"
                        />
                      ) : null}
                      <h3 className="mt-3 font-bold text-sm text-on-surface line-clamp-2 group-hover:text-primary transition-colors">
                        {p.name}
                      </h3>
                      <p className="mt-1 text-primary font-black text-sm">
                        ₹{price.toLocaleString("en-IN")}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : (
          <p className="mt-10 text-on-surface-variant">
            New {meta.heading.toLowerCase()} are being added. Meanwhile, explore the{" "}
            <Link href="/?view=market" className="text-primary font-semibold hover:underline">
              full marketplace
            </Link>
            .
          </p>
        )}

        {/* Internal links to sibling categories */}
        <nav className="mt-14 pt-8 border-t border-surface-container" aria-label="Categories">
          <h2 className="text-sm font-black uppercase tracking-wide text-on-surface-variant mb-3">
            Other Categories
          </h2>
          <ul className="flex flex-wrap gap-3">
            {SEO_CATEGORIES.filter((c) => c.slug !== meta.slug).map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/category/${c.slug}`}
                  className="rounded-full border border-surface-container px-4 py-1.5 text-sm font-semibold text-on-surface hover:border-primary hover:text-primary transition-colors"
                >
                  {c.heading}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </main>
  );
}
