import type { WaTemplateComponent } from "./types";

const GRAPH_API_VERSION = "v20.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

function getConfig(): { accessToken: string; phoneNumberId: string; wabaId: string } {
  const accessToken  = process.env.WA_ACCESS_TOKEN;
  const phoneNumberId = process.env.WA_PHONE_NUMBER_ID;
  const wabaId       = process.env.WA_WABA_ID ?? "";

  if (!accessToken)   throw new Error("WA_ACCESS_TOKEN is not set");
  if (!phoneNumberId) throw new Error("WA_PHONE_NUMBER_ID is not set");

  return { accessToken, phoneNumberId, wabaId };
}

/** Returns a masked representation: first 10 chars + … + last 4 chars. */
function maskToken(token: string): string {
  if (token.length <= 14) return "***";
  return `${token.slice(0, 10)}…${token.slice(-4)}`;
}

/**
 * Verifies credentials against the Graph API BEFORE sending any messages.
 *
 * Makes two calls:
 *   1. GET /{phone-number-id}  — confirms the token is valid and authorised for
 *      this specific phone number ID.
 *   2. GET /debug_token        — decodes the token and shows expiry, app ID,
 *      granted scopes, and whether it is valid.
 *
 * Logs all results so the exact cause of any [190] error is visible.
 * Never throws — a failed check is logged but the service still starts
 * (so in-flight retries survive a transient Graph API hiccup).
 */
export async function verifyCredentials(): Promise<void> {
  const { accessToken, phoneNumberId, wabaId } = getConfig();

  console.log("[CloudAPI] ── Credential check ──────────────────────────────");
  console.log(`[CloudAPI]  WA_ACCESS_TOKEN   : ${maskToken(accessToken)}`);
  console.log(`[CloudAPI]  WA_PHONE_NUMBER_ID: ${phoneNumberId}`);
  console.log(`[CloudAPI]  WA_WABA_ID        : ${wabaId || "(not set)"}`);
  console.log(`[CloudAPI]  Graph API version : ${GRAPH_API_VERSION}`);

  // ── 1. Verify the token is authorised for this phone number ID ────────────
  {
    const url = `${GRAPH_API_BASE}/${phoneNumberId}?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating,status&access_token=${accessToken}`;
    try {
      const res  = await fetch(url);
      const json = await res.json() as Record<string, unknown>;

      if (!res.ok) {
        const err = (json as { error?: { code?: number; message?: string; error_subcode?: number } }).error ?? {};
        console.error(`[CloudAPI]  Phone-number check FAILED`);
        console.error(`[CloudAPI]    code        : ${err.code ?? res.status}`);
        console.error(`[CloudAPI]    subcode     : ${err.error_subcode ?? "—"}`);
        console.error(`[CloudAPI]    message     : ${err.message ?? "(no message)"}`);
        console.error("[CloudAPI]  ▶ Most likely causes:");
        console.error("[CloudAPI]    • Token is expired — generate a new permanent system user token in");
        console.error("[CloudAPI]      Meta Business Manager → Settings → System Users.");
        console.error("[CloudAPI]    • Token belongs to a different Meta App than the one owning this phone.");
        console.error("[CloudAPI]    • Token lacks the 'whatsapp_business_messaging' permission.");
        console.error(`[CloudAPI]    • Phone Number ID ${phoneNumberId} does not exist or was removed.`);
      } else {
        console.log("[CloudAPI]  Phone-number check OK");
        console.log(`[CloudAPI]    id             : ${json.id}`);
        console.log(`[CloudAPI]    display_number : ${json.display_phone_number ?? "—"}`);
        console.log(`[CloudAPI]    verified_name  : ${json.verified_name ?? "—"}`);
        console.log(`[CloudAPI]    status         : ${json.status ?? "—"}`);
        console.log(`[CloudAPI]    quality_rating : ${json.quality_rating ?? "—"}`);
      }
    } catch (fetchErr) {
      console.error("[CloudAPI]  Phone-number check threw (network issue?):", String(fetchErr));
    }
  }

  // ── 2. Debug-token introspection (shows expiry and granted scopes) ────────
  {
    // debug_token requires an app access token ({app-id}|{app-secret}) as the
    // second access_token param, which we don't store here. As a lightweight
    // substitute we call GET /me which works with any user token and returns
    // the token owner's app-scoped ID — enough to confirm the token is live.
    const url = `${GRAPH_API_BASE}/me?access_token=${accessToken}`;
    try {
      const res  = await fetch(url);
      const json = await res.json() as Record<string, unknown>;

      if (!res.ok) {
        const err = (json as { error?: { code?: number; message?: string } }).error ?? {};
        console.error(`[CloudAPI]  Token /me check FAILED — code ${err.code ?? res.status}: ${err.message ?? ""}`);
        console.error("[CloudAPI]  ▶ The token is invalid or expired.");
      } else {
        console.log(`[CloudAPI]  Token /me check OK — token owner id: ${json.id ?? "—"}`);
        console.log("[CloudAPI]  ▶ Token is alive. If phone-number check above failed,");
        console.log("[CloudAPI]    the token likely lacks WhatsApp Business permissions");
        console.log("[CloudAPI]    or belongs to the wrong Meta App.");
      }
    } catch (fetchErr) {
      console.error("[CloudAPI]  Token /me check threw (network issue?):", String(fetchErr));
    }
  }

  console.log("[CloudAPI] ────────────────────────────────────────────────────");
}

/** Normalises a phone number to E.164 without the leading '+': 919876543210 */
function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("91") ? digits : `91${digits}`;
}

interface CloudApiResponse {
  messaging_product: string;
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string }>;
}

interface CloudApiError {
  error: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

const DEBUG = process.env.WA_DEBUG === "true";

async function post(
  phoneNumberId: string,
  accessToken: string,
  body: Record<string, unknown>
): Promise<CloudApiResponse> {
  const url = `${GRAPH_API_BASE}/${phoneNumberId}/messages`;

  // Always log the full request body so template name, language code, and
  // component structure are visible without needing WA_DEBUG=true.
  console.log(`[CloudAPI] POST ${url}`);
  console.log("[CloudAPI] Request body:\n" + JSON.stringify(body, null, 2));

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const rawText = await res.text();

  // Always log the full HTTP response — status, body, and every error field.
  console.log(`[CloudAPI] Response status: ${res.status} ${res.statusText}`);
  console.log("[CloudAPI] Response body:\n" + rawText);

  let json: CloudApiResponse | CloudApiError;
  try {
    json = JSON.parse(rawText) as CloudApiResponse | CloudApiError;
  } catch {
    throw new Error(`WhatsApp Cloud API returned non-JSON (HTTP ${res.status}): ${rawText.slice(0, 200)}`);
  }

  if (!res.ok) {
    const err = (json as CloudApiError).error ?? {};
    console.error("[CloudAPI] ── Error detail ───────────────────────────────");
    console.error(`[CloudAPI]   code        : ${err.code ?? res.status}`);
    console.error(`[CloudAPI]   type        : ${err.type ?? "—"}`);
    console.error(`[CloudAPI]   message     : ${err.message ?? "—"}`);
    console.error(`[CloudAPI]   subcode     : ${err.error_subcode ?? "—"}`);
    console.error(`[CloudAPI]   fbtrace_id  : ${err.fbtrace_id ?? "—"}`);
    if (err.code === 132001) {
      console.error("[CloudAPI] ── [132001] diagnosis ──────────────────────");
      const tmpl = (body.template as Record<string, unknown> | undefined) ?? {};
      console.error(`[CloudAPI]   template.name          : "${tmpl.name ?? "(missing)"}"`);
      console.error(`[CloudAPI]   template.language.code : "${(tmpl.language as Record<string,unknown> | undefined)?.code ?? "(missing)"}"`);
      console.error("[CloudAPI]   Verify these EXACTLY match the approved template name");
      console.error("[CloudAPI]   and language in Meta Business Manager → Account → Templates.");
      console.error("[CloudAPI]   Common mismatches: 'en' vs 'en_US', trailing spaces,");
      console.error("[CloudAPI]   capitalisation, or a template approved under a different WABA.");
    }
    console.error("[CloudAPI] ────────────────────────────────────────────────");
    const msg = err.message ?? `HTTP ${res.status}`;
    const code = err.code ?? res.status;
    throw new Error(`WhatsApp Cloud API error [${code}]: ${msg}`);
  }

  if (DEBUG) {
    console.log("[CloudAPI] Success response parsed:", JSON.stringify(json, null, 2));
  }

  return json as CloudApiResponse;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface SendResult {
  metaMessageId: string;
  waId: string; // WhatsApp ID returned by Meta (may differ from input)
}

/**
 * Sends a plain-text message via the Cloud API.
 * Suitable for utility messages; for marketing/transactional use sendTemplateMessage.
 */
export async function sendTextMessage(
  phone: string,
  text: string
): Promise<SendResult> {
  const { accessToken, phoneNumberId } = getConfig();
  const to = toE164(phone);

  console.log(`[CloudAPI] Sending text message to ${to}`);

  const data = await post(phoneNumberId, accessToken, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { preview_url: false, body: text },
  });

  return {
    metaMessageId: data.messages[0].id,
    waId: data.contacts[0]?.wa_id ?? to,
  };
}

/**
 * Sends a pre-approved template message via the Cloud API.
 *
 * @param phone - Recipient phone number (10-digit or with 91 prefix)
 * @param templateName - Approved Meta template name (snake_case)
 * @param languageCode - BCP-47 language code, e.g. "en", "en_IN", "hi"
 * @param components - Header / body / button parameter components
 */
export async function sendTemplateMessage(
  phone: string,
  templateName: string,
  languageCode: string,
  components: WaTemplateComponent[] = []
): Promise<SendResult> {
  const { accessToken, phoneNumberId } = getConfig();
  const to = toE164(phone);

  console.log(`[CloudAPI] sendTemplateMessage: name="${templateName}" language="${languageCode}" to=${to} components=${components.length}`);

  const data = await post(phoneNumberId, accessToken, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(components.length > 0 ? { components } : {}),
    },
  });

  return {
    metaMessageId: data.messages[0].id,
    waId: data.contacts[0]?.wa_id ?? to,
  };
}
