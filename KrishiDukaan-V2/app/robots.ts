import type { MetadataRoute } from "next";

// Canonical public origin (kept in sync with app/layout.tsx and app/sitemap.ts).
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://krishidukan.com";

// Paths that must never be indexed: authenticated/admin areas, APIs, and the
// SPA's internal query-based views / cart states. Public marketplace content
// (home, brand pages, blog) stays crawlable.
const DISALLOW = [
  "/admin",
  "/admin-login",
  "/dashboard",
  "/api/",
  "/?view=cart",
  "/?view=profile",
  "/?view=orders",
  "/?view=login",
  "/?view=signup",
  "/?view=subscription",
  "/*?*view=cart",
  "/*?*view=profile",
  "/*?*view=orders",
  "/*?*view=login",
  "/*?*view=signup",
  "/*?*view=subscription",
];

// Explicitly welcomed crawlers — traditional search plus AI search engines.
const ALLOWED_BOTS = [
  "Googlebot",
  "Bingbot",
  "GPTBot",
  "ChatGPT-User",
  "PerplexityBot",
  "ClaudeBot",
  "Claude-Web",
  "Google-Extended",
  "CCBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Default rule for every crawler.
      {
        userAgent: "*",
        allow: "/",
        disallow: DISALLOW,
      },
      // Per-bot rules (same policy) so each welcomed crawler has an explicit entry.
      ...ALLOWED_BOTS.map((bot) => ({
        userAgent: bot,
        allow: "/",
        disallow: DISALLOW,
      })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
