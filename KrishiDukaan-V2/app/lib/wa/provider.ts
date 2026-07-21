/**
 * WhatsApp provider layer for Next.js API routes.
 *
 * WA_PROVIDER=mock        — log payloads only, never call Meta
 * WA_PROVIDER=test        — use test credentials, block non-verified recipients
 * WA_PROVIDER=production  — real WABA credentials (default)
 *
 * Next.js loads .env.local at server startup. A server restart is required
 * after changing WA_PROVIDER for the new value to take effect.
 */

const GRAPH_API_VERSION = "v20.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export interface WaSendResult {
  metaMessageId: string;
  waId: string;
}

export interface WaProvider {
  sendTextMessage(to: string, text: string): Promise<WaSendResult>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("91") ? digits : `91${digits}`;
}

function maskToken(token: string): string {
  if (token.length <= 14) return "***";
  return `${token.slice(0, 10)}…${token.slice(-4)}`;
}

function buildTextBody(to: string, text: string): Record<string, unknown> {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { preview_url: false, body: text },
  };
}

async function graphPost(
  phoneNumberId: string,
  accessToken: string,
  body: Record<string, unknown>,
  tag: string
): Promise<WaSendResult> {
  const url = `${GRAPH_API_BASE}/${phoneNumberId}/messages`;

  console.log(`[WA:${tag}] ── pre-send diagnostics ──────────────────────────`);
  console.log(`[WA:${tag}]  provider      : ${tag}`);
  console.log(`[WA:${tag}]  phoneNumberId : ${phoneNumberId}`);
  console.log(`[WA:${tag}]  accessToken   : ${maskToken(accessToken)}`);
  console.log(`[WA:${tag}]  url           : ${url}`);
  console.log(`[WA:${tag}] ──────────────────────────────────────────────────`);
  console.log(`[WA:${tag}] body:\n` + JSON.stringify(body, null, 2));

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const rawText = await res.text();
  console.log(`[WA:${tag}] Response ${res.status} ${res.statusText}:\n` + rawText);

  if (!res.ok) {
    throw new Error(`WhatsApp API error (${res.status}): ${rawText.slice(0, 300)}`);
  }

  const data = JSON.parse(rawText) as {
    messages: Array<{ id: string }>;
    contacts: Array<{ wa_id: string }>;
  };

  return {
    metaMessageId: data.messages[0].id,
    waId: data.contacts[0]?.wa_id ?? String(body.to),
  };
}

// ─── Mock ─────────────────────────────────────────────────────────────────────

function getMockProvider(): WaProvider {
  return {
    async sendTextMessage(phone, text) {
      const to = toE164(phone);
      const payload = buildTextBody(to, text);
      console.log("[WA:mock] ── pre-send diagnostics ──────────────────────────");
      console.log("[WA:mock]  provider      : mock (no API call will be made)");
      console.log(`[WA:mock]  to            : ${to}`);
      console.log("[WA:mock] ──────────────────────────────────────────────────");
      console.log("[WA:mock] payload:\n" + JSON.stringify(payload, null, 2));
      return { metaMessageId: `mock-text-${Date.now()}`, waId: to };
    },
  };
}

// ─── Test ─────────────────────────────────────────────────────────────────────

function getTestConfig(): {
  accessToken: string;
  phoneNumberId: string;
  verifiedRecipients: Set<string>;
} {
  const accessToken = process.env.WA_TEST_ACCESS_TOKEN;
  const phoneNumberId = process.env.WA_TEST_PHONE_NUMBER_ID;

  console.log("[WA:provider] getTestConfig —");
  console.log(`  WA_TEST_ACCESS_TOKEN    : ${accessToken ? maskToken(accessToken) : "(NOT SET)"}`);
  console.log(`  WA_TEST_PHONE_NUMBER_ID : ${phoneNumberId ?? "(NOT SET)"}`);
  console.log(`  WA_TEST_RECIPIENTS      : ${process.env.WA_TEST_RECIPIENTS ?? "(not set)"}`);

  if (!accessToken) throw new Error("WA_TEST_ACCESS_TOKEN is not set (required for WA_PROVIDER=test)");
  if (!phoneNumberId) throw new Error("WA_TEST_PHONE_NUMBER_ID is not set (required for WA_PROVIDER=test)");

  const verifiedRecipients = new Set(
    (process.env.WA_TEST_RECIPIENTS ?? "")
      .split(",")
      .map((r) => toE164(r.trim()))
      .filter(Boolean)
  );

  return { accessToken, phoneNumberId, verifiedRecipients };
}

function getTestProvider(): WaProvider {
  return {
    async sendTextMessage(phone, text) {
      const { accessToken, phoneNumberId, verifiedRecipients } = getTestConfig();
      const to = toE164(phone);

      if (verifiedRecipients.size > 0 && !verifiedRecipients.has(to)) {
        throw new Error(
          `[WA:test] Recipient ${to} is not in WA_TEST_RECIPIENTS — add it to allow test sends`
        );
      }

      return graphPost(phoneNumberId, accessToken, buildTextBody(to, text), "test");
    },
  };
}

// ─── Production ───────────────────────────────────────────────────────────────

function getProductionProvider(): WaProvider {
  const accessToken = process.env.WA_ACCESS_TOKEN;
  const phoneNumberId = process.env.WA_PHONE_NUMBER_ID;

  console.log("[WA:provider] getProductionProvider —");
  console.log(`  WA_ACCESS_TOKEN    : ${accessToken ? maskToken(accessToken) : "(NOT SET)"}`);
  console.log(`  WA_PHONE_NUMBER_ID : ${phoneNumberId ?? "(NOT SET)"}`);

  if (!accessToken) throw new Error("WA_ACCESS_TOKEN is not set");
  if (!phoneNumberId) throw new Error("WA_PHONE_NUMBER_ID is not set");

  return {
    async sendTextMessage(phone, text) {
      const to = toE164(phone);
      return graphPost(phoneNumberId, accessToken, buildTextBody(to, text), "production");
    },
  };
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function getWaProvider(): WaProvider {
  const raw  = process.env.WA_PROVIDER;
  const mode = (raw ?? "production").toLowerCase();

  console.log("[WA:provider] ── factory ────────────────────────────────────────");
  console.log(`[WA:provider]  WA_PROVIDER env value : ${raw === undefined ? "(NOT SET — defaulting to production)" : `"${raw}"`}`);
  console.log(`[WA:provider]  resolved mode         : ${mode}`);
  console.log("[WA:provider] ──────────────────────────────────────────────────");

  switch (mode) {
    case "mock":
      return getMockProvider();
    case "test":
      return getTestProvider();
    case "production":
      return getProductionProvider();
    default:
      console.warn(`[WA:provider] Unknown WA_PROVIDER="${mode}", falling back to production`);
      return getProductionProvider();
  }
}
