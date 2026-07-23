import type { Metadata } from "next";
import Link from "next/link";
import {
  PLAY_STORE_URL,
  APP_STORE_URL,
  androidLive,
  iosLive,
} from "../lib/store-links";

// Static SSR page — indexable, so "krishidukan app" / "krishidukan app download"
// searches land here instead of nowhere. Regenerated rarely since the content
// barely changes; store links flip instantly once NEXT_PUBLIC_APP_STORE_URL is set.
export const revalidate = 86400;

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://krishidukan.com";

export const metadata: Metadata = {
  title: "KrishiDukan App — Download for Android & iOS",
  description:
    "Get the KrishiDukan app for Android and iPhone. Compare prices from nearby agri stores, watch AgriReels product videos, and order seeds, fertilizers & pesticides with doorstep delivery.",
  alternates: { canonical: "/app" },
  openGraph: {
    type: "website",
    siteName: "KrishiDukan",
    url: `${SITE_URL}/app`,
    title: "KrishiDukan App — Download for Android & iOS",
    description:
      "Compare nearby agri stores, watch product videos, and order farm inputs with doorstep delivery — right from your phone.",
    images: ["/images/og-default.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "KrishiDukan App — Download for Android & iOS",
    description:
      "Compare nearby agri stores, watch product videos, and order farm inputs with doorstep delivery — right from your phone.",
    images: ["/images/og-default.png"],
  },
};

const FEATURES: { title: string; body: string }[] = [
  {
    title: "Compare nearby sellers",
    body: "See prices from multiple retailers and manufacturers for the same product and pick the best deal.",
  },
  {
    title: "AgriReels product videos",
    body: "Watch short videos from sellers showing products in action, usage tips, and results before you buy.",
  },
  {
    title: "Doorstep delivery",
    body: "Get farm inputs delivered to your village or field, with delivery charges shown clearly upfront.",
  },
  {
    title: "Genuine products",
    body: "Buy authentic seeds, fertilizers, pesticides, growth promoters, and equipment from verified sellers.",
  },
  {
    title: "Store locator with directions",
    body: "Find nearby agri stores and get turn-by-turn directions right to their door.",
  },
  {
    title: "Local language support",
    body: "Use the app comfortably in your preferred language.",
  },
];

export default function AppDownloadPage() {
  const softwareAppLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "KrishiDukan",
    operatingSystem: "Android, iOS",
    applicationCategory: "ShoppingApplication",
    url: `${SITE_URL}/app`,
    image: `${SITE_URL}/images/krishidukan%20icon.webp`,
    description:
      "KrishiDukan is an agri-input marketplace app — compare nearby seller prices, watch AgriReels product videos, and order seeds, fertilizers, and pesticides with doorstep delivery.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "INR",
    },
    ...(androidLive ? { installUrl: PLAY_STORE_URL } : {}),
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "KrishiDukan", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "App" },
    ],
  };

  return (
    <main className="min-h-screen bg-surface">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareAppLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 text-xs font-semibold text-on-surface-variant mb-10"
        >
          <Link href="/" className="hover:text-primary">
            KrishiDukan
          </Link>
          <span>›</span>
          <span className="text-primary">App</span>
        </nav>

        {/* Hero */}
        <section className="text-center max-w-2xl mx-auto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/krishidukan icon.webp"
            alt="KrishiDukan app icon"
            className="w-20 h-20 mx-auto rounded-2xl border border-surface-container object-contain bg-white shadow-sm"
          />
          <h1 className="mt-6 text-3xl sm:text-4xl font-black text-on-surface leading-tight">
            The KrishiDukan App
          </h1>
          <p className="mt-4 text-base text-on-surface-variant leading-relaxed">
            Compare prices from nearby agri stores, watch AgriReels product videos,
            and order genuine seeds, fertilizers &amp; pesticides — with doorstep
            delivery, right from your phone.
          </p>

          {/* Store badges */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            {androidLive ? (
              <a
                href={PLAY_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Get KrishiDukan on Google Play"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/google-play-badge.png"
                  alt="Get it on Google Play"
                  className="h-14 w-auto"
                />
              </a>
            ) : null}

            {iosLive ? (
              <a
                href={APP_STORE_URL!}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Download KrishiDukan on the App Store"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/app-store-badge.svg"
                  alt="Download on the App Store"
                  className="h-12 w-auto"
                />
              </a>
            ) : (
              <div
                className="flex items-center gap-2 h-12 px-4 rounded-xl bg-on-surface/10 text-on-surface-variant text-sm font-bold cursor-not-allowed select-none"
                title="Coming soon to the App Store"
              >
                iOS — Coming soon
              </div>
            )}
          </div>
        </section>

        {/* Features */}
        <section className="mt-16">
          <h2 className="text-xl font-black text-on-surface mb-6 text-center">
            Everything for your farm, in one app
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-surface-container bg-white p-5"
              >
                <h3 className="text-sm font-black text-on-surface mb-1.5">
                  {f.title}
                </h3>
                <p className="text-sm text-on-surface-variant leading-relaxed">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* For retailers & manufacturers */}
        <section className="mt-16 rounded-2xl border border-surface-container bg-surface-container-low p-6 sm:p-8">
          <h2 className="text-xl font-black text-on-surface mb-3">
            For retailers &amp; manufacturers
          </h2>
          <p className="text-sm text-on-surface-variant leading-relaxed mb-4">
            List your products and reach farmers across your region. Manage
            inventory, prices, discounts, and delivery charges from a simple
            dashboard, post AgriReels to showcase products, and track orders —
            all from the same app.
          </p>
          <Link
            href="/?view=about"
            className="inline-flex items-center justify-center rounded-2xl bg-primary px-6 py-3 font-bold text-white hover:opacity-90 transition-opacity text-sm"
          >
            Learn more about selling on KrishiDukan →
          </Link>
        </section>

        {/* Still on the fence — use the website */}
        <section className="mt-16 text-center pb-8">
          <p className="text-sm text-on-surface-variant">
            Prefer to browse first?{" "}
            <Link href="/" className="font-bold text-primary hover:underline">
              Explore KrishiDukan on the web →
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
