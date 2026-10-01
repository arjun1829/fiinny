import { NextResponse } from "next/server";

// Served at /.well-known/apple-app-site-association (no file extension — the
// folder name IS the path segment under Next's App Router). This is what
// makes shared krishidukan.com links open directly in the app on iOS
// (Universal Links) instead of Safari, when the app is installed — the OS
// fetches this file once, verifies it against the app's Associated Domains
// entitlement, and routes future taps to matching paths straight to the app.
//
// appID = Team ID + the LIVE App Store bundle id. It must match exactly, or
// iOS silently opens every link in Safari. The App Store app is
// com.karanarjuntechnologies.KrishiDukan (itunes.apple.com/lookup?bundleId=…,
// and PRODUCT_BUNDLE_IDENTIFIER in mobile/ios/Runner.xcodeproj). It was changed
// on 28 Sep to "…krishidukaanApp" — an id registered in Firebase but never
// shipped — which is why shared links stopped opening the app on iPhone.
// Do not change it without checking the App Store listing first.
const APPLE_APP_ID = "D9JTVVB85F.com.karanarjuntechnologies.KrishiDukan";

// Only paths the app can actually open (see _translateExternalLink and the
// routes in mobile/lib/core/router/app_router.dart). Anything else — admin,
// dashboard, blog, API — keeps opening on the website.
const APP_PATHS = [
  "/",             // /?view=product&product=… and /?inviteCode=… (query on root)
  "/reels/*",      // shared reels
  "/products/*",   // SEO product pages
  "/subscribe",    // sales / marketing referral + offer links
  "/invoice/*",    // invoice links sent on WhatsApp
];

const AASA = {
  applinks: {
    apps: [],
    details: [
      {
        // Legacy keys (iOS 12) and the modern components form (iOS 13+).
        appID: APPLE_APP_ID,
        appIDs: [APPLE_APP_ID],
        paths: APP_PATHS,
        components: APP_PATHS.map((path) => ({ "/": path })),
      },
    ],
  },
};

export async function GET() {
  return NextResponse.json(AASA, {
    headers: { "Content-Type": "application/json" },
  });
}
