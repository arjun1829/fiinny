import Link from "next/link";
import { SEO_CATEGORIES } from "../../app/lib/seo/category-meta";
import { LEGAL_ROUTES } from "../../app/lib/legal-constants";

/**
 * Header and footer for the server-rendered public pages.
 *
 * WHY NOT REUSE components/shared/navbar.tsx AND footer.tsx
 * ---------------------------------------------------------
 * Those two drive the SPA at "/" and navigate by calling props — onNavigate,
 * onCategoryClick, onCartClick — that only app/page.tsx can supply. Footer's
 * category links even call e.preventDefault() before delegating to
 * onCategoryClick, and its About / Stores / Crop Hubs / Contact / FAQs /
 * Become-a-retailer entries are <button>s, not links. Dropping them onto an
 * SSR route with those props undefined would ship a footer whose links look
 * live and do nothing — a UX regression, and no help to a crawler either,
 * since a <button> is not a link to follow.
 *
 * They are also client components pulling in framer-motion, the Firebase auth
 * listener and reverse geocoding. This file exists so the SSR pages get real
 * crawlable <a href> navigation with zero client JS, while app/page.tsx keeps
 * the interactive chrome it needs, unchanged.
 *
 * Every destination below is a server-rendered route that returns real HTML.
 * Nothing here links into a "?view=" SPA state, which a crawler cannot render.
 */

const FOOTER_LINKS: { href: string; label: string }[] = [
  { href: "/stores", label: "Store directory" },
  { href: "/reels", label: "AgriReels" },
  { href: "/blog", label: "Farming guides" },
  { href: "/sell", label: "Sell on KrishiDukan" },
  { href: "/help", label: "Help centre" },
  { href: "/app", label: "Get the app" },
];

const LEGAL_LINKS: { href: string; label: string }[] = [
  { href: LEGAL_ROUTES.terms, label: "Terms" },
  { href: LEGAL_ROUTES.privacy, label: "Privacy" },
  { href: LEGAL_ROUTES.sellerTerms, label: "Seller terms" },
  { href: LEGAL_ROUTES.returns, label: "Returns" },
];

/** Slim server-rendered header: wordmark home link + primary sections. */
export function SiteHeader() {
  return (
    <header className="border-b border-surface-container bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="text-xl font-black tracking-tight text-primary">
          Krishi<span className="text-secondary">Dukan</span>
        </Link>
        <nav aria-label="Primary" className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {[
            { href: "/stores", label: "Stores" },
            { href: "/reels", label: "AgriReels" },
            { href: "/blog", label: "Blog" },
            { href: "/sell", label: "Sell" },
            { href: "/help", label: "Help" },
          ].map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-xs font-semibold text-on-surface-variant transition-colors hover:text-primary"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

/**
 * Server-rendered footer. Its category list is the site's main crawl path into
 * /category/[slug] — and from there into every product page — so it is built
 * from SEO_CATEGORIES, the same constant the sitemap and the category routes
 * use, rather than a second hand-written list that could drift.
 */
export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-surface-container bg-surface-container-low">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 md:grid-cols-3">
        <div>
          <h2 className="mb-4 text-sm font-black uppercase tracking-wider text-on-surface">
            Shop by category
          </h2>
          <ul className="space-y-2 text-sm">
            {SEO_CATEGORIES.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/category/${c.slug}`}
                  className="font-medium text-on-surface-variant transition-colors hover:text-primary"
                >
                  {c.heading}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="mb-4 text-sm font-black uppercase tracking-wider text-on-surface">
            KrishiDukan
          </h2>
          <ul className="space-y-2 text-sm">
            {FOOTER_LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="font-medium text-on-surface-variant transition-colors hover:text-primary"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="mb-4 text-sm font-black uppercase tracking-wider text-on-surface">
            Get in touch
          </h2>
          <div className="space-y-1 text-sm text-on-surface-variant">
            <p className="font-semibold text-on-surface">
              Karan Arjun Krushi Seva Kendra
            </p>
            <p>Chatrapati Shivaji Nagar, 132 KV</p>
            <p>Karjat, Ahilyanagar — 414402</p>
            <a
              href="tel:+918658032751"
              className="block pt-1 font-bold text-primary hover:underline"
            >
              +91 86580 32751
            </a>
          </div>
        </div>
      </div>

      <div className="border-t border-surface-container">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-xs text-on-surface-variant">
          <p>
            © {new Date().getFullYear()} KrishiDukan · Connecting Indian farmers
            with verified retailers
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {LEGAL_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="hover:text-primary">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
