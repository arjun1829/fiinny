import { NextResponse } from "next/server";

// Served at /.well-known/apple-app-site-association (no file extension — the
// folder name IS the path segment under Next's App Router). This is what
// makes shared krishidukan.com links open directly in the app on iOS
// (Universal Links) instead of Safari, when the app is installed — the OS
// fetches this file once, verifies it against the app's Associated Domains
// entitlement, and routes future taps to matching paths straight to the app.
//
// Team ID D9JTVVB85F (Apple Developer → Membership). Bundle id must match
// PRODUCT_BUNDLE_IDENTIFIER in ios/Runner.xcodeproj/project.pbxproj exactly —
// already confirmed to match.
const APPLE_APP_ID = "D9JTVVB85F.com.karanarjuntechnologies.KrishiDukan";

const AASA = {
  applinks: {
    apps: [],
    details: [
      {
        appID: APPLE_APP_ID,
        appIDs: [APPLE_APP_ID],
        paths: [
          // Product deep link (WebLinks.product — query-param SPA route).
          "/",
          "/reels/*",
          "/products/*",
        ],
      },
    ],
  },
};

export async function GET() {
  return NextResponse.json(AASA, {
    headers: { "Content-Type": "application/json" },
  });
}
