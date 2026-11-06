import Script from "next/script";
import { GOOGLE_ADS_ID } from "../../app/lib/ads/google-ads";

/**
 * Loads the Google tag (gtag.js) for Google Ads conversion measurement.
 *
 * Existing setup, checked first: the site has no Google Tag Manager and no
 * gtag.js snippet of its own. The only Google tag is the one the Firebase
 * Analytics SDK injects for the GA4 stream (G-7MEFGCD4EX, app/firebase.ts), and
 * it only does so where Analytics is supported. That tag does not know about
 * the Ads account, and relying on it would mean no conversion whenever
 * Analytics is blocked.
 *
 * So this adds the Ads ID to the SAME gtag/dataLayer rather than a second
 * instance: it defines window.gtag only if one is not already there, and the
 * `js` command is only sent when it defined it. A second gtag.js file for a
 * different ID is the documented way to add an ID to a page.
 *
 * send_page_view is off: this tag is for conversions, and the GA4 stream already
 * records page views. Fires nothing by itself.
 *
 * CONSENT: the site has no consent manager (see components/shared/openai-pixel.tsx),
 * so nothing here is gated on one.
 */
export function GoogleAdsTag() {
  return (
    <>
      <Script
        id="google-ads-gtag-src"
        src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-ads-gtag-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
if (typeof window.gtag !== "function") {
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
}
window.gtag("config", ${JSON.stringify(GOOGLE_ADS_ID)}, { send_page_view: false });`}
      </Script>
    </>
  );
}
