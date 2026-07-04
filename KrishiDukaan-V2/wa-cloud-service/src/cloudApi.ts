import type { WaTemplateComponent } from "./types";

const GRAPH_API_VERSION = "v20.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

function getConfig(): { accessToken: string; phoneNumberId: string } {
  const accessToken = process.env.WA_ACCESS_TOKEN;
  const phoneNumberId = process.env.WA_PHONE_NUMBER_ID;

  if (!accessToken) throw new Error("WA_ACCESS_TOKEN is not set");
  if (!phoneNumberId) throw new Error("WA_PHONE_NUMBER_ID is not set");

  return { accessToken, phoneNumberId };
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

  if (DEBUG) {
    console.log("[CloudAPI] Request payload:", JSON.stringify(body, null, 2));
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as CloudApiResponse | CloudApiError;

  if (!res.ok) {
    const err = json as CloudApiError;
    if (DEBUG) {
      console.log("[CloudAPI] Error response:", JSON.stringify(err, null, 2));
    }
    const msg = err.error?.message ?? `HTTP ${res.status}`;
    const code = err.error?.code ?? res.status;
    throw new Error(`WhatsApp Cloud API error [${code}]: ${msg}`);
  }

  if (DEBUG) {
    console.log("[CloudAPI] Response:", JSON.stringify(json, null, 2));
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

  console.log(`[CloudAPI] Sending template "${templateName}" to ${to}`);

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
