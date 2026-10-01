import type { Metadata } from "next";
import Link from "next/link";
import { SEO_CATEGORIES } from "./lib/seo/category-meta";

/**
 * Site-wide 404.
 *
 * Next's built-in fallback is a bare "404 | This page could not be found" with
 * no links at all, which is what every notFound() in the app has been rendering:
 * a visitor who follows a stale product or store URL lands on a dead end with
 * no way back, and a crawler that reaches one finds a page with no outbound
 * links to follow.
 *
 * This still returns HTTP 404 — App Router sets the status for not-found.tsx
 * automatically, so nothing here risks turning a real 404 into a soft 200. The
 * only change is that the response now carries navigation.
 *
 * Deliberately a server component with no data fetching: a 404 must render even
 * when Firestore is unreachable, and it is the one route that must never be
 * slow. Category links come from SEO_CATEGORIES, the same constant the footer,
 * the sitemap and /category/[category] use, so this list cannot drift.
 */

export const metadata: Metadata = {
  title: "Page not found",
  // A 404 must never be indexed — without this the App Router would let the
  // root layout's index:true apply to every dead URL on the domain.
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <main className="min-h-screen bg-surface">
      <div className="mx-auto max-w-3xl px-4 py-20">
        <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant">
          Error 404
        </p>
        <h1 className="mt-3 text-3xl font-black leading-tight text-on-surface sm:text-4xl">
          This page isn&apos;t here
        </h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-on-surface-variant">
          The page you followed may have been removed, or the product or shop it
          pointed to is no longer listed. Everything below is still available.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-2xl bg-primary px-6 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
          >
            Go to KrishiDukan home
          </Link>
          <Link
            href="/stores"
            className="inline-flex items-center justify-center rounded-2xl border border-surface-container bg-white px-6 py-3 text-sm font-bold text-on-surface transition-colors hover:border-primary hover:text-primary"
          >
            Find a shop near you
          </Link>
        </div>

        <section className="mt-14 border-t border-surface-container pt-8">
          <h2 className="mb-4 text-sm font-black uppercase tracking-wide text-on-surface-variant">
            Shop by category
          </h2>
          <ul className="flex flex-wrap gap-3">
            {SEO_CATEGORIES.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/category/${c.slug}`}
                  className="inline-block rounded-full border border-surface-container px-4 py-1.5 text-sm font-semibold text-on-surface transition-colors hover:border-primary hover:text-primary"
                >
                  {c.heading}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="mb-4 text-sm font-black uppercase tracking-wide text-on-surface-variant">
            More on KrishiDukan
          </h2>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold">
            {[
              { href: "/reels", label: "AgriReels" },
              { href: "/blog", label: "Farming guides" },
              { href: "/sell", label: "Sell on KrishiDukan" },
              { href: "/help", label: "Help centre" },
              { href: "/app", label: "Get the app" },
            ].map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-primary hover:underline">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
