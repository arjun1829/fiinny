import type { WaTemplate, WaPayload, WaTemplateComponent, WaTextParam } from "./types";

function t(text: string): WaTextParam {
  return { type: "text", text };
}

function body(...texts: string[]): WaTemplateComponent {
  return { type: "body", parameters: texts.map(t) };
}

/**
 * Builds the WhatsApp Cloud API template component array for a given template
 * and its payload. The parameter order MUST match the {{1}}, {{2}}… variable
 * order in the approved Meta template exactly.
 *
 * If the template has no variable placeholders (e.g. a fully static template),
 * return an empty array — the Cloud API accepts that fine.
 *
 * Update this function whenever a template's variable list changes in Meta.
 */
export function resolveTemplateComponents(
  template: WaTemplate,
  payload: WaPayload
): WaTemplateComponent[] {
  const p = (key: string): string => String(payload[key] ?? "");

  switch (template) {
    case "subscription_welcome":
      // {{1}} = retailer/owner name
      return [body(p("name"))];

    case "subscription_expiry":
      // {{1}} = name   {{2}} = expiryDate (localised date string)
      return [body(p("name"), p("expiryDate"))];

    case "order_notification":
      // {{1}} = customerName   {{2}} = itemSummary   {{3}} = total (₹ amount)
      return [body(p("customerName"), p("itemSummary"), p("total"))];

    case "product_assignment":
      // {{1}} = productName   {{2}} = manufacturerName
      return [body(p("productName"), p("manufacturerName"))];

    case "retailer_onboarding": {
      // {{1}} = manufacturerName   {{2}} = signupLink
      // signupLink is empty when the retailer is already onboarded; fall back to
      // the base URL so the parameter count still matches the approved template.
      const link = p("signupLink") || "https://krishidukan.com";
      return [body(p("manufacturerName"), link)];
    }

    case "generic":
    default:
      // No template — caller must provide a plain-text message instead
      return [];
  }
}
