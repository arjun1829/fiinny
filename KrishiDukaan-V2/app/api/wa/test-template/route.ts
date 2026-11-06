import { NextRequest, NextResponse } from "next/server";
import { requireSection } from "../../../lib/admin-auth";
import {
  buildTemplateBody,
  getTestProvider,
  toE164,
  type WaTemplateComponent,
} from "../../../lib/wa/provider";
import {
  environmentLabel,
  isWaTestingEnabled,
  uatLiveSendConfig,
} from "../../../lib/wa/test-mode";
// REUSE the exact resolver + language map the Cloud Function uses, so a test
// validates the real variable-mapping logic and can never drift from production.
import {
  resolveTemplateComponents,
  resolveTemplateLanguage,
} from "../../../../functions/src/wa/templateResolver";
import type { WaPayload, WaTemplate } from "../../../../functions/src/wa/types";

/**
 * POST /api/wa/test-template  — development / UAT only.
 *
 * Validates and (optionally) sends a WhatsApp template through the SAME resolver
 * and provider layer the real workflows use, without any production credentials
 * and without creating orders / seats / subscriptions or any other business
 * side effect. Two modes:
 *
 *   mode = "mock"  — resolve + validate + build the exact Cloud API payload and
 *                    return it, clearly labelled simulated. No API call.
 *   mode = "live"  — actually deliver via the dedicated WA test number
 *                    (WA_TEST_* credentials, WA_TEST_RECIPIENTS allowlist).
 *                    Never uses production credentials. If the test credentials
 *                    are missing it explains exactly what is unavailable instead
 *                    of silently simulating.
 *
 * Gated to non-production environments on the backend (isWaTestingEnabled) and
 * to admins / whatsapp-section team members (requireSection).
 */

// Templates the resolver knows how to build components for. Anything else would
// resolve to an empty component list, which is almost always a typo, so we flag
// it rather than silently "passing".
const KNOWN_TEMPLATES: WaTemplate[] = [
  "subscription_welcome", "subscription_expiry", "order_notification",
  "order_confirmation_customer", "order_tracking_link", "order_accept_pending",
  "retailer_onboarding", "product_assignment_onboarded",
  "product_assignment_pending_signup", "manufacturer_network_summary",
  "payment_failed_app_update", "retailer_seat_promotion", "enquiry_notification",
  "order_reassign_offer", "new_product_reminder", "kyc_pending", "kyc_success",
  "app_update", "reel_promo_hindi", "free_seats_assigned",
  "navratri_offer_free", "navratri_offer_paid",
];

type Check = { label: string; ok: boolean; detail?: string };

function isValidE164India(phone: string): boolean {
  return /^91[6-9]\d{9}$/.test(phone);
}

/** Pulls every text parameter out of resolved components, flagging empties. */
function describeParameters(components: WaTemplateComponent[]): {
  flat: { component: string; position: number; type: string; value: string }[];
  emptyTextParams: string[];
} {
  const flat: { component: string; position: number; type: string; value: string }[] = [];
  const emptyTextParams: string[] = [];
  for (const c of components) {
    const comp = c as Record<string, unknown>;
    const compLabel = comp.sub_type ? `${comp.type}:${comp.sub_type}` : String(comp.type);
    const params = Array.isArray(comp.parameters) ? (comp.parameters as Record<string, unknown>[]) : [];
    params.forEach((p, i) => {
      const type = String(p.type ?? "unknown");
      let value = "";
      if (type === "text") value = String(p.text ?? "");
      else if (type === "image") value = JSON.stringify(p.image ?? {});
      else value = JSON.stringify(p);
      flat.push({ component: compLabel, position: i + 1, type, value });
      if (type === "text" && !value.trim()) {
        emptyTextParams.push(`${compLabel} {{${i + 1}}}`);
      }
    });
  }
  return { flat, emptyTextParams };
}

/**
 * Optional, read-only approval check. Only runs with a DEDICATED non-production
 * WABA (WA_TEST_WABA_ID) + the test access token — never the production token —
 * so this feature stays strictly non-production. Returns null when unavailable.
 */
async function fetchApprovalStatus(template: string): Promise<{ status: string; language: string; bodyVarCount: number | null } | null> {
  const wabaId = process.env.WA_TEST_WABA_ID;
  const token = process.env.WA_TEST_ACCESS_TOKEN;
  if (!wabaId || !token) return null;
  try {
    const url = `https://graph.facebook.com/v20.0/${wabaId}/message_templates?name=${encodeURIComponent(template)}&limit=1&access_token=${token}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: Array<{ status?: string; language?: string; components?: Array<{ type?: string; text?: string }> }> };
    const t = data.data?.[0];
    if (!t) return null;
    const bodyText = t.components?.find((c) => c.type === "BODY")?.text ?? "";
    const varMatches = bodyText.match(/\{\{\d+\}\}/g);
    return {
      status: t.status ?? "UNKNOWN",
      language: t.language ?? "",
      bodyVarCount: varMatches ? new Set(varMatches).size : 0,
    };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1) Environment gate — hard off on the production deployment.
  if (!isWaTestingEnabled()) {
    return NextResponse.json(
      { error: "WhatsApp template testing is disabled in production." },
      { status: 403 },
    );
  }

  // 2) Admin / whatsapp-section auth (reuses the existing guard).
  const caller = await requireSection(req, "whatsapp");
  if (caller instanceof NextResponse) return caller;

  let body: { template?: string; payload?: WaPayload; phone?: string; mode?: "mock" | "live" };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const template = String(body.template ?? "").trim() as WaTemplate;
  const payload = (body.payload ?? {}) as WaPayload;
  const mode = body.mode === "live" ? "live" : "mock";
  const rawPhone = String(body.phone ?? "").trim();
  const phone = rawPhone ? toE164(rawPhone) : "";

  if (!template) return NextResponse.json({ error: "template is required" }, { status: 400 });

  // 3) Resolve components + language with the REAL resolver. Some templates
  //    (image-header campaigns) throw when their header media-id secret is not
  //    configured — common in UAT/local. Surface that as a validation error
  //    instead of a 500 so the tester sees exactly what is missing.
  const language = resolveTemplateLanguage(template);
  const checks: Check[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  let components: WaTemplateComponent[] = [];
  let resolveError: string | null = null;
  try {
    components = resolveTemplateComponents(template, payload) as unknown as WaTemplateComponent[];
  } catch (err) {
    resolveError = err instanceof Error ? err.message : String(err);
    errors.push(`Could not resolve components: ${resolveError}`);
  }
  const payloadPreview = resolveError ? null : buildTemplateBody(phone || "<recipient>", template, language, components);

  // 4) Validate.
  checks.push({ label: "Components resolved", ok: !resolveError, detail: resolveError ?? "ok" });

  const known = KNOWN_TEMPLATES.includes(template);
  checks.push({ label: "Template name recognised", ok: known, detail: known ? template : `"${template}" is not a known template` });
  if (!known) errors.push(`Unknown template "${template}" — the resolver produces no components for it.`);

  checks.push({ label: "Language resolved", ok: !!language, detail: language });

  const { flat, emptyTextParams } = describeParameters(components);
  const paramCount = flat.length;
  checks.push({ label: "Parameters resolved", ok: true, detail: `${paramCount} parameter${paramCount === 1 ? "" : "s"} across ${components.length} component${components.length === 1 ? "" : "s"}` });

  if (emptyTextParams.length > 0) {
    // A template with zero variables legitimately has zero params; empties only
    // appear when a declared {{n}} got no value — i.e. a missing/undefined var.
    errors.push(`Missing or undefined variable(s): ${emptyTextParams.join(", ")}. Check the payload keys your workflow passes.`);
    checks.push({ label: "No missing variables", ok: false, detail: emptyTextParams.join(", ") });
  } else {
    checks.push({ label: "No missing variables", ok: true });
  }

  // Phone is required for a send; for a pure payload preview it's optional.
  if (phone) {
    const phoneOk = isValidE164India(phone);
    checks.push({ label: "Recipient phone format", ok: phoneOk, detail: phoneOk ? phone : `"${rawPhone}" → "${phone}" is not a valid Indian E.164 number` });
    if (!phoneOk) errors.push(`Recipient "${rawPhone}" does not normalise to a valid Indian number (91XXXXXXXXXX).`);
  } else if (mode === "live") {
    errors.push("A recipient phone number is required for a live send.");
    checks.push({ label: "Recipient phone provided", ok: false });
  }

  // Optional approval check against a non-production WABA (when configured).
  const approval = await fetchApprovalStatus(template);
  if (approval) {
    const bodyParams = flat.filter((f) => f.component === "body").length;
    checks.push({ label: "Template approval status", ok: approval.status === "APPROVED", detail: approval.status });
    if (approval.language && language && approval.language !== language) {
      warnings.push(`Resolver language "${language}" differs from Meta's "${approval.language}" for this template.`);
    }
    if (approval.bodyVarCount != null && approval.bodyVarCount !== bodyParams) {
      warnings.push(`Body parameter count (${bodyParams}) differs from Meta's declared ${approval.bodyVarCount} variable(s) — check count/ordering.`);
      checks.push({ label: "Body parameter count matches Meta", ok: false, detail: `resolved ${bodyParams} vs Meta ${approval.bodyVarCount}` });
    } else if (approval.bodyVarCount != null) {
      checks.push({ label: "Body parameter count matches Meta", ok: true, detail: `${bodyParams}` });
    }
  } else {
    warnings.push("Template approval status not checked (no non-production WABA configured — set WA_TEST_WABA_ID + WA_TEST_ACCESS_TOKEN to enable).");
  }

  const validation = { valid: errors.length === 0, errors, warnings, checks };
  const envLabel = environmentLabel();

  // Log (never secrets) — clearly labelled.
  console.log(`[wa/test-template] env=${envLabel} mode=${mode} template=${template} lang=${language} params=${paramCount} valid=${validation.valid} by=${caller.uid}`);

  // 5a) MOCK — simulate only. Never report delivery.
  if (mode === "mock") {
    return NextResponse.json({
      ok: true,
      simulated: true,
      delivered: false,
      mode: "mock",
      environment: envLabel,
      resultLabel: "MOCK / SIMULATED — no WhatsApp message was sent",
      template, language,
      components, parameters: flat,
      payload: payloadPreview,
      validation,
    });
  }

  // 5b) LIVE — only with dedicated test credentials; refuse clearly otherwise.
  const live = uatLiveSendConfig();
  if (!live.available) {
    return NextResponse.json({
      ok: false,
      simulated: false,
      delivered: false,
      mode: "live",
      environment: envLabel,
      error: `Live test send unavailable — missing dedicated test credential(s): ${live.missing.join(", ")}. ` +
        `Configure the WA test number (WA_TEST_ACCESS_TOKEN, WA_TEST_PHONE_NUMBER_ID, WA_TEST_RECIPIENTS) to enable. ` +
        `Production credentials are never used here.`,
      validation,
    }, { status: 409 });
  }
  if (!validation.valid) {
    return NextResponse.json({
      ok: false, simulated: false, delivered: false, mode: "live", environment: envLabel,
      error: "Validation failed — fix the errors before a live send.", validation,
    }, { status: 400 });
  }
  if (live.recipients.length > 0 && !live.recipients.includes(phone)) {
    return NextResponse.json({
      ok: false, simulated: false, delivered: false, mode: "live", environment: envLabel,
      error: `Recipient ${phone} is not in the WA_TEST_RECIPIENTS allowlist. Add it to send a real test message.`,
      validation,
    }, { status: 409 });
  }

  try {
    const provider = getTestProvider(); // WA_TEST_* creds + allowlist — never production
    const result = await provider.sendTemplateMessage(phone, template, language, components);
    console.log(`[wa/test-template] LIVE test sent via test number — metaId=${result.metaMessageId} to=${phone}`);
    return NextResponse.json({
      ok: true, simulated: false, delivered: true, mode: "live", environment: envLabel,
      resultLabel: "LIVE TEST — sent via the dedicated WA test number (not production)",
      template, language, components, parameters: flat, payload: payloadPreview,
      metaMessageId: result.metaMessageId, validation,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[wa/test-template] live send failed:", detail);
    return NextResponse.json({
      ok: false, simulated: false, delivered: false, mode: "live", environment: envLabel,
      error: "Live test send failed.", detail, validation,
    }, { status: 502 });
  }
}
