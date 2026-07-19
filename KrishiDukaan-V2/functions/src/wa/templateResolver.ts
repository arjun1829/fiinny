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
  // Fallback chain applied to every template that uses an owner/business name.
  const name = (): string =>
    p("ownerName") || p("businessName") || p("shopName") || "User";

  switch (template) {
    case "subscription_welcome":
      // {{1}} = ownerName → businessName → shopName → "User"
      // Static URL button (https://krishidukan.com/dashboard) — no button component needed
      return [body(name())];

    case "subscription_expiry":
      // {{1}} = ownerName → businessName → shopName → "User"
      // {{2}} = formattedExpiryDate (human-readable, e.g. "15 July 2026")
      // Static URL button (https://krishidukan.com/dashboard/settings) — no button component needed
      return [body(name(), p("formattedExpiryDate"))];

    case "manufacturer_network_summary":
      // {{1}} = ownerName → businessName → shopName → "User"
      // {{2}} = retailerCount
      // Static URL button (https://krishidukan.com/dashboard/manufacturer/retailers) — no button component needed
      return [body(name(), p("retailerCount"))];

    case "order_notification":
      // Sent to the SELLER when a new order arrives.
      // {{1}} = shopName → businessName → "Retailer"
      // Static Orders Dashboard URL button in the template — no button component needed.
      return [body(p("shopName") || p("businessName") || "Retailer")];

    case "order_confirmation_customer":
      // Sent to the CUSTOMER immediately after order placement.
      // Body:   {{1}} = customerName
      // Button 0 (Dynamic URL): {{1}} = orderId
      //   Meta template base URL: https://krishidukan.com/invoice/
      //   Full resolved URL: https://krishidukan.com/invoice/{orderId}
      return [
        body(p("customerName")),
        { type: "button", sub_type: "url", index: 0, parameters: [t(p("orderId"))] },
      ];

    case "product_assignment_onboarded":
      // Body: {{1}} = retailerName  {{2}} = manufacturerName  {{3}} = productName
      // Button 0 (Dynamic URL): {{1}} = productId
      return [
        body(p("retailerName"), p("manufacturerName"), p("productName")),
        { type: "button", sub_type: "url", index: 0, parameters: [t(p("productId"))] },
      ];

    case "product_assignment_pending_signup":
      // Body: {{1}} = retailerName  {{2}} = manufacturerName  {{3}} = productName
      // Button 0 (Dynamic URL): {{1}} = inviteCode (signup URL)
      // Button 1 (Dynamic URL): {{1}} = productId (product URL)
      return [
        body(p("retailerName"), p("manufacturerName"), p("productName")),
        { type: "button", sub_type: "url", index: 0, parameters: [t(p("inviteCode"))] },
        { type: "button", sub_type: "url", index: 1, parameters: [t(p("productId"))] },
      ];

    case "retailer_onboarding":
      // Body: {{1}} = retailerName  {{2}} = manufacturerName
      // Button 0 (Dynamic URL): {{1}} = inviteCode
      return [
        body(p("retailerName"), p("manufacturerName")),
        { type: "button", sub_type: "url", index: 0, parameters: [t(p("inviteCode"))] },
      ];

    case "generic":
    default:
      // No template — caller must provide a plain-text message instead
      return [];
  }
}
