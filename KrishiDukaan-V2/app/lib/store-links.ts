/**
 * Single source of truth for the app-store download links, shared by the
 * /app landing page, the footer, and the navbar.
 *
 * The Android package id is fixed at build time (mobile/android/app/build.gradle.kts),
 * so the Play Store URL is deterministic and safe to hardcode — it will 404 until
 * the listing goes live, then start working with zero code changes.
 *
 * The iOS App Store URL is NOT deterministic — Apple assigns the numeric app id
 * only once the app is approved in App Store Connect. That happened: the app is
 * live as id 6788309167 (verified against Apple's own lookup API, matching bundle
 * com.karanarjuntechnologies.KrishiDukan), so the id is baked in here the same way
 * the Android package id is. NEXT_PUBLIC_APP_STORE_URL still overrides it, which
 * is what a region-specific or campaign-tagged link would use.
 */

const ANDROID_PACKAGE_ID = "com.karanarjuntechnologies.KrishiDukan";

/** Apple's numeric app id, assigned on approval. */
const IOS_APP_ID = "6788309167";

export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE_ID}`;

export const APP_STORE_URL =
  process.env.NEXT_PUBLIC_APP_STORE_URL?.trim() ||
  `https://apps.apple.com/in/app/krishidukan/id${IOS_APP_ID}`;

/** Android is always considered "live" — the Play Store URL 404s gracefully pre-launch. */
export const androidLive = true;

/** iOS is live on the App Store — same reasoning as androidLive above. */
export const iosLive = Boolean(APP_STORE_URL);
