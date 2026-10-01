/**
 * OpenAI Ads measurement — browser side.
 *
 * Data source: "Paid seller subscription". The conversion we report is the
 * standard event `subscription_created`, fired for a NEWLY paid seller plan
 * enrolment only (see app/api/ads/subscription-created/route.ts for the
 * renewal and duplicate rules, which are enforced server-side).
 *
 * Nothing in this module may throw into a checkout. Every entry point swallows
 * its own errors: a blocked SDK, a cookie-less browser or a failed request must
 * leave the payment and activation flow exactly as it was.
 */

/**
 * The Data Source's Pixel ID, which is the same value the Conversions API takes
 * as its `pid` query parameter (the documented endpoint is
 * `https://bzr.openai.com/v1/events?pid=${PIXEL_ID}`).
 *
 * Hard-coded rather than read from `.env.local` on purpose. A `NEXT_PUBLIC_*`
 * value is baked at build time from whichever machine runs the deploy, and this
 * repo has already shipped a wrong value that way once. A Pixel ID is public by
 * nature, so there is nothing to protect by hiding it, and a literal cannot go
 * missing in a build. The env var still wins if it is set, for UAT.
 */
export const OPENAI_PIXEL_ID =
  process.env.NEXT_PUBLIC_OPENAI_PIXEL_ID || "WtoF4ur18Tyf8Z2ne9KxWP";

/** Standard event name shown by Ads Manager for this conversion. */
export const SUBSCRIPTION_EVENT = "subscription_created";

/**
 * Deduplication key, shared by the Pixel (`event_id`) and the Conversions API
 * (`id`) exactly as the docs require. Derived from the Razorpay payment id, so
 * it is stable across refreshes, revisits and callback retries — the same
 * purchase can never produce two different ids.
 */
export function subscriptionEventId(razorpayPaymentId: string): string {
  return `sub_${razorpayPaymentId}`;
}

type Oaiq = ((...args: unknown[]) => void) & { q?: unknown[] };

function oaiq(): Oaiq | null {
  if (typeof window === "undefined") return null;
  const fn = (window as unknown as { oaiq?: Oaiq }).oaiq;
  return typeof fn === "function" ? fn : null;
}

/**
 * The Pixel stores the click reference it captured from the landing page URL in
 * a first-party `__oppref` cookie. The Conversions API does NOT capture this
 * value by itself, so the server event has to be told. Returns null when the
 * SDK never ran or no ad click brought this visitor here — never a made-up id.
 */
export function readOpprefCookie(): string | null {
  if (typeof document === "undefined") return null;
  try {
    const match = document.cookie.match(/(?:^|;\s*)__oppref=([^;]*)/);
    return match ? decodeURIComponent(match[1]) || null : null;
  } catch {
    return null;
  }
}

/** Browser-side half of the conversion. Silently no-ops if the SDK is blocked. */
export function measureSubscriptionCreated(eventId: string): void {
  try {
    const q = oaiq();
    if (!q) return;
    q("measure", SUBSCRIPTION_EVENT, { type: "plan_enrollment" }, { event_id: eventId });
  } catch {
    /* tracking must never interrupt checkout */
  }
}

/**
 * Reports the conversion through both documented channels for one payment.
 *
 * The browser call alone is not enough here (see the route's header comment),
 * so this also asks the server to send the Conversions API event. Both carry
 * the same event id, which is how OpenAI deduplicates them into one conversion.
 *
 * Fire-and-forget by design: `keepalive` lets the request outlive the
 * navigation that usually follows a successful purchase, and every failure is
 * swallowed. The caller must not await this in a way that can block activation.
 */
export function reportSubscriptionCreated(params: {
  razorpayPaymentId: string;
  idToken: string;
}): void {
  const { razorpayPaymentId, idToken } = params;
  if (!razorpayPaymentId) return;

  const eventId = subscriptionEventId(razorpayPaymentId);
  measureSubscriptionCreated(eventId);

  try {
    void fetch("/api/ads/subscription-created", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ razorpayPaymentId, oppref: readOpprefCookie() }),
      keepalive: true,
    }).catch(() => {
      /* reporting is best-effort; the purchase already succeeded */
    });
  } catch {
    /* ignore */
  }
}
