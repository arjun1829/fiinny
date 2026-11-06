/* eslint-disable @next/next/no-before-interactive-script-outside-document --
   This rule predates the App Router: it says to move beforeInteractive into
   pages/_document.js, which does not exist in this project. For the App Router
   the documented home for this strategy is the root layout. */
import Script from "next/script";
import { OPENAI_PIXEL_ID } from "../../app/lib/ads/openai-pixel";

/**
 * OpenAI Ads measurement Pixel loader, verbatim from the official Measurement
 * Pixel guide, with the Data Source's real Pixel ID substituted.
 *
 * `beforeInteractive` makes Next.js add this to <head> and run it before the
 * page hydrates, which the guide asks for so an early conversion is not lost
 * while the rest of the page loads. It is mounted from the root layout (inside
 * <body>, see there), so it initialises exactly once for the whole site —
 * including /sell, the ads landing page.
 *
 * CONSENT: this codebase has no consent manager — there is no cookie banner and
 * no stored preference anywhere to read — so there is no existing decision for
 * this to follow and nothing is gated on one. The SDK supports
 * `oaiq("consent", false)` before `init` if one is ever added; that call belongs
 * immediately above the `init` below.
 */
export function OpenAIPixel() {
  return (
    <Script id="openai-ads-pixel" strategy="beforeInteractive">
      {`(function (w, d, s, u) {
  if (w.oaiq) return;
  var q = function () {
    q.q.push(arguments);
  };
  q.q = [];
  w.oaiq = q;
  var js = d.createElement(s);
  js.async = true;
  js.src = u;
  var f = d.getElementsByTagName(s)[0];
  f.parentNode.insertBefore(js, f);
})(window, document, "script", "https://bzrcdn.openai.com/sdk/oaiq.min.js");

oaiq("init", {
  pixelId: ${JSON.stringify(OPENAI_PIXEL_ID)},
  // Opt-in per visit: append ?oaiq_debug=1 to any URL to have the SDK log its
  // activity to the console. Avoids a rebuild just to validate, and leaves
  // normal traffic untouched.
  debug: (function () {
    try {
      return new URLSearchParams(window.location.search).has("oaiq_debug");
    } catch (e) {
      return false;
    }
  })(),
});`}
    </Script>
  );
}
