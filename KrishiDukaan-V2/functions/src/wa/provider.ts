/**
 * WhatsApp provider layer.
 *
 * WA_PROVIDER=mock        — log payloads only, never call Meta
 * WA_PROVIDER=test        — use test credentials, block non-verified recipients
 * WA_PROVIDER=production  — real WABA credentials (default)
 */

import type { WaTemplateComponent } from "./types";
import {
  sendTextMessage as prodSendText,
  sendTemplateMessage as prodSendTemplate,
} from "./cloudApi";

export type { SendResult } from "./cloudApi";
import type { SendResult } from "./cloudApi";

// ─── Interface ────────────────────────────────────────────────────────────────

export interface WaProvider {
  sendTextMessage(phone: string, text: string): Promise<SendResult>;
  sendTemplateMessage(
    phone: string,
    templateName: string,
    languageCode: string,
    components?: WaTemplateComponent[]
  ): Promise<SendResult>;
}

// ─── Mock ─────────────────────────────────────────────────────────────────────

function getMockProvider(): WaProvider {
  return {
    async sendTextMessage(phone, text) {
      const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phone,
        type: "text",
        text: { preview_url: false, body: text },
      };
      console.log("[WA:mock] sendTextMessage — payload:\n" + JSON.stringify(payload, null, 2));
      return { metaMessageId: `mock-text-${Date.now()}`, waId: phone };
    },

    async sendTemplateMessage(phone, templateName, languageCode, components = []) {
      const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phone,
        type: "template",
        template: {
          name: templateName,
          language: { code: languageCode },
          ...(components.length > 0 ? { components } : {}),
        },
      };
      console.log("[WA:mock] sendTemplateMessage — payload:\n" + JSON.stringify(payload, null, 2));
      return { metaMessageId: `mock-tmpl-${Date.now()}`, waId: phone };
    },
  };
}

// ─── Test ─────────────────────────────────────────────────────────────────────

const GRAPH_API_VERSION = "v20.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("91") ? digits : `91${digits}`;
}

function maskToken(token: string): string {
  if (token.length <= 14) return "***";
  return `${token.slice(0, 10)}…${token.slice(-4)}`;
}

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

function assertVerifiedRecipient(to: string, verifiedRecipients: Set<string>): void {
  if (verifiedRecipients.size > 0 && !verifiedRecipients.has(to)) {
    throw new Error(
      `[WA:test] Recipient ${to} is not in WA_TEST_RECIPIENTS — add it to allow test sends`
    );
  }
}

async function testPost(
  phoneNumberId: string,
  accessToken: string,
  body: Record<string, unknown>
): Promise<SendResult> {
  const url = `${GRAPH_API_BASE}/${phoneNumberId}/messages`;

  console.log("[WA:test] ── pre-send diagnostics ──────────────────────────────");
  console.log(`[WA:test]  provider        : test`);
  console.log(`[WA:test]  phoneNumberId   : ${phoneNumberId}`);
  console.log(`[WA:test]  accessToken     : ${maskToken(accessToken)}`);
  console.log(`[WA:test]  url             : ${url}`);
  console.log("[WA:test] ────────────────────────────────────────────────────────");
  console.log("[WA:test] body:\n" + JSON.stringify(body, null, 2));

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const rawText = await res.text();
  console.log(`[WA:test] Response ${res.status} ${res.statusText}:\n` + rawText);

  if (!res.ok) {
    throw new Error(`WhatsApp test API error (${res.status}): ${rawText.slice(0, 300)}`);
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

function getTestProvider(): WaProvider {
  return {
    async sendTextMessage(phone, text) {
      const { accessToken, phoneNumberId, verifiedRecipients } = getTestConfig();
      const to = toE164(phone);
      assertVerifiedRecipient(to, verifiedRecipients);
      return testPost(phoneNumberId, accessToken, {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { preview_url: false, body: text },
      });
    },

    async sendTemplateMessage(phone, templateName, languageCode, components = []) {
      const { accessToken, phoneNumberId, verifiedRecipients } = getTestConfig();
      const to = toE164(phone);
      assertVerifiedRecipient(to, verifiedRecipients);
      return testPost(phoneNumberId, accessToken, {
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
    },
  };
}

// ─── Production ───────────────────────────────────────────────────────────────

function getProductionProvider(): WaProvider {
  return {
    sendTextMessage: prodSendText,
    sendTemplateMessage: prodSendTemplate,
  };
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function getProvider(): WaProvider {
  const raw  = process.env.WA_PROVIDER;
  const mode = (raw ?? "production").toLowerCase();

  console.log("[WA:provider] ── factory ───────────────────────────────────────");
  console.log(`[WA:provider]  WA_PROVIDER env value : ${raw === undefined ? "(NOT SET — defaulting to production)" : `"${raw}"`}`);
  console.log(`[WA:provider]  resolved mode         : ${mode}`);
  console.log("[WA:provider] ────────────────────────────────────────────────────");

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
