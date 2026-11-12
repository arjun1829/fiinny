import type { Metadata } from "next";
import "./globals.css";
import Script from "next/script";
import { OpenAIPixel } from "../components/shared/openai-pixel";
import { GoogleAdsTag } from "../components/shared/google-ads-tag";
import { I18nProvider } from "./i18n/I18nContext";
import { UpdatePrompt } from "./components/shared/update-prompt";

// Plus Jakarta Sans is self-hosted from public/fonts and declared in
// globals.css (see the note there for why not next/font/google). The latin
// file is preloaded below so text paints in the brand font without a swap.

// Canonical public origin. Used by metadataBase, canonical URLs, Open Graph,
// JSON-LD and the sitemap/robots routes. Override via NEXT_PUBLIC_SITE_URL if needed.
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://krishidukan.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default:
      "KrishiDukan - Buy Seeds, Fertilizers, Pesticides, Herbicides & Farming Tools Online in India",
    template: "%s | KrishiDukan",
  },
  description:
    "KrishiDukan is India's agri-marketplace for farmers. Buy seeds, fertilizers, pesticides, herbicides, bio-stimulants, sprayers and farming tools online from verified manufacturers and nearby retailers",
  applicationName: "KrishiDukan",
  keywords: [
   "KrishiDukan",
  "agriculture marketplace",
  "agri marketplace India",
  "agriculture products online",
  "buy seeds online",
  "buy fertilizers online",
  "buy pesticides online",
  "herbicides online",
  "insecticides",
  "fungicides",
  "bio stimulants",
  "crop protection products",
  "farming tools",
  "agriculture tools",
  "sprayers",
  "farm inputs online",
  "soybean seeds",
  "cotton seeds",
  "organic fertilizers",
  "kisan store"
  ],
  authors: [{ name: "KrishiDukan" }],
  creator: "KrishiDukan",
  publisher: "KrishiDukan",
  /**
   * Root canonical, INHERITED by every page that does not set its own.
   *
   * It is load-bearing rather than boilerplate: the homepage is a client
   * component that cannot export metadata of its own, and the SPA is reachable
   * at /?view=market, /?view=hub and friends. This tag is what collapses all of
   * those query-string variants onto "/" instead of letting each one be crawled
   * as a separate page. Removing it would be actively harmful.
   *
   * The cost is that a new public page which forgets `alternates` silently
   * claims the homepage as its canonical and can never be indexed — which is
   * exactly what happened to /blog and /privacy. EVERY new public, indexable
   * route must set its own alternates.canonical.
   */
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: SITE_URL,
    siteName: "KrishiDukan",
    title:
      "KrishiDukan — Agriculture Marketplace for Indian Farmers",
    description:
      "Buy seeds, fertilizers, pesticides, herbicides & farming tools online from verified manufacturers and nearby retailers.",
    images: [
      {
        url: "/images/og-default.png",
        width: 1200,
        height: 630,
        alt: "KrishiDukan — Agriculture Marketplace for Indian Farmers",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title:
      "KrishiDukan — Buy Seeds, Fertilizers & Farming Tools Online",
    description:
      "India's agri-marketplace. Buy seeds, fertilizers, pesticides & farming tools online from verified sellers.",
    images: ["/images/og-default.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  // Replace the placeholder below with the verification token from Google
  // Search Console (Settings → Ownership verification → HTML tag).
  verification: {
    google: "fu8BBFlg3o0TzD7wwKw-nfI46iY2LtuIerejuxCP5jM",
  },
  // Icons come from the file convention in app/: favicon.ico, icon.png, apple-icon.png.
};

// ─── Structured data (JSON-LD) ──────────────────────────────────────────────
// Injected as plain <script type="application/ld+json"> tags. These do not
// render any visible UI and have no effect on hydration or layout.
const organizationLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "KrishiDukan",
  url: SITE_URL,
  logo: `${SITE_URL}/images/krishidukan%20icon.webp`,
  description:
    "India's agri-marketplace for farmers. Buy seeds, fertilizers, pesticides, herbicides, bio-stimulants, sprayers and farming tools online from verified manufacturers and nearby retailers.",
};

// potentialAction / SearchAction omitted until a server-rendered /search route
// exists. The previous urlTemplate pointed to /?view=market&search=… which is
// a client-rendered SPA view — Google cannot execute it, so the SearchAction
// was invalid. Re-add once /search returns real HTML.
const websiteLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "KrishiDukan",
  url: SITE_URL,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link
          rel="preload"
          href="/fonts/plus-jakarta-sans-latin.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body className="font-sans">
        {/* Must stay inside <body>: next/script renders a beforeInteractive
            script as an inline <script> where it is placed, and a <script>
            directly under <html> fails hydration, so React discards the server
            HTML and re-renders the whole page in the browser. Next.js still
            runs it before hydration from here. */}
        <OpenAIPixel />
        <OpenAIPixel />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteLd) }}
        />
        <I18nProvider>
          {children}
          <UpdatePrompt />
          <GoogleAdsTag />
          <Script
            id="razorpay-checkout-js"
            src="https://checkout.razorpay.com/v1/checkout.js"
          />
        </I18nProvider>
      </body>
    </html>
  );
}
