import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Script from "next/script";
import { I18nProvider } from "./i18n/I18nContext";

const inter = Inter({ subsets: ["latin"] });

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
  icons: {
    icon: "/images/krishidukan icon.webp",
    apple: "/images/krishidukan icon.webp",
  },
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

const websiteLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "KrishiDukan",
  url: SITE_URL,
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: `${SITE_URL}/?view=market&search={search_term_string}`,
    },
    "query-input": "required name=search_term_string",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
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
          <Script
            id="razorpay-checkout-js"
            src="https://checkout.razorpay.com/v1/checkout.js"
          />
        </I18nProvider>
      </body>
    </html>
  );
}
