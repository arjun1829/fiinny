import { OPENAI_PIXEL_ID, SUBSCRIPTION_EVENT } from "./openai-pixel";

// Server-only by construction: the API key is read from a non-NEXT_PUBLIC env
// var, so it is never bundled, and the sole importer is the route handler. The
// `server-only` package is not a dependency of this project, so there is no
// import guard to add here without taking one on.

/**
 * OpenAI Ads Conversions API — server side.
 *
 * Endpoint, auth header and event shape follow the official Conversion Tracking
 * documentation:
 *   POST https://bzr.openai.com/v1/events?pid=<PIXEL_ID>
 *   Authorization: Bearer <API key>
 *
 * The API key is read from the server-only `OPENAI_CONVERSIONS_API_KEY` env var
 * and never reaches the browser.
 */

const ENDPOINT = "https://bzr.openai.com/v1/events";

export type ConversionResult =
  | { ok: true }
  | { ok: false; reason: "missing_api_key" | "request_failed"; detail?: string };

/** Whether a key is configured at all. Lets callers skip without burning a
 *  deduplication record they would then be unable to retry. */
export function conversionsApiConfigured(): boolean {
  return Boolean(process.env.OPENAI_CONVERSIONS_API_KEY);
}

/**
 * Sends one `subscription_created` event.
 *
 * `eventId` MUST be the same value the Pixel sent as `event_id` — that pairing,
 * together with the same Pixel ID and event name, is how the two channels are
 * deduplicated into a single conversion rather than counted twice.
 *
 * `oppref` is the click reference the Pixel captured from the landing page URL
 * and stored in its first-party cookie. The Conversions API does not capture it
 * on its own. It is forwarded only when the browser actually had one — this
 * never invents an attribution identifier.
 */
export async function sendSubscriptionCreated(params: {
  eventId: string;
  sourceUrl: string;
  oppref?: string | null;
  timestampMs?: number;
}): Promise<ConversionResult> {
  const apiKey = process.env.OPENAI_CONVERSIONS_API_KEY;
  if (!apiKey) return { ok: false, reason: "missing_api_key" };

  const { eventId, sourceUrl, oppref, timestampMs } = params;

  const event: Record<string, unknown> = {
    id: eventId,
    type: SUBSCRIPTION_EVENT,
    timestamp_ms: timestampMs ?? Date.now(),
    source_url: sourceUrl,
    action_source: "web",
    data: { type: "plan_enrollment" },
  };
  if (oppref) event.oppref = oppref;

  try {
    const res = await fetch(`${ENDPOINT}?pid=${encodeURIComponent(OPENAI_PIXEL_ID)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ validate_only: false, events: [event] }),
      cache: "no-store",
    });

    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 400);
      return { ok: false, reason: "request_failed", detail: `HTTP ${res.status} ${detail}` };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      reason: "request_failed",
      detail: e instanceof Error ? e.message : "fetch failed",
    };
  }
}
