import type { WaTemplate, WaPayload, WaTemplateComponent, WaTextParam } from "./types";

/**
 * Returns the BCP-47 language code for a given template as registered in Meta
 * Business Manager. Must match exactly — mismatches produce error 132001.
 * Defaults to "mr" (Marathi) for all existing templates; override per-template
 * only when a template is approved under a different language.
 */
export function resolveTemplateLanguage(template: WaTemplate): string {
  switch (template) {
    case "reel_promo_hindi":
      return "hi";
    default:
      return "mr";
  }
}

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

    case "enquiry_notification":
      // Sent to every seller offering a product whose checkout was abandoned.
      // {{1}} = shopName → businessName → "Retailer"
      // {{2}} = customerName
      // {{3}} = product (first item, "+N more" when the basket had several)
      // Static URL button in the template: https://krishidukan.com/dashboard/enquiry
      // — static, so no button component is sent from here.
      return [
        body(
          p("shopName") || p("businessName") || "Retailer",
          p("customerName"),
          p("product"),
        ),
      ];

    case "order_reassign_offer":
      // Sent to every seller offered an order another seller rejected.
      // {{1}} = product ("X +N more"), {{2}} = delivery area (city pincode)
      // Static URL button: https://krishidukan.com/dashboard/orders?tab=requests
      return [body(p("product"), p("area") || "your area")];

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

    case "order_accept_pending":
      // Sent to the SELLER (retailer) when an online delivery order has been
      // waiting for accept/reject for ≥24h. Marathi (mr — the resolver default).
      // Body:
      //   {{1}} = retailerName — retailer's business name, falling back to their
      //           real (owner) name; never the customer's name.
      //   {{2}} = productName   (first ordered item, "+N more" when several)
      //   {{3}} = pendingDays   (whole days the order has been pending)
      // CTA is a static URL button (https://krishidukan.com/dashboard/orders) —
      // static, so no button component is sent from here.
      return [
        body(
          p("retailerName") || "व्यापारी",
          p("productName"),
          p("pendingDays"),
        ),
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

    case "payment_failed_app_update":
      // Marathi Utility template (Meta ID 2083284825612732).
      // Body {{1}} = ownerName → businessName → shopName → "User"
      // Buttons are static CTAs: "ॲप अपडेट करा" and "पुन्हा पेमेंट करा".
      return [body(name())];

    case "retailer_seat_promotion": {
      // Manual admin campaign — never triggered automatically.
      // Header: static IMAGE (must be passed explicitly — Meta requires it even for static headers).
      // Body {{1}} = businessName → shopName → name → "Business"
      // Button: static URL — no component needed.
      // Image media ID: upload once via WhatsApp Media API; refresh if it expires (~30d unused).
      // Stored in WA_SEAT_PROMO_HEADER_ID env var; falls back to the upload from 2026-09-02.
      const headerImageId =
        process.env.WA_SEAT_PROMO_HEADER_ID || "2252388985496002";
      return [
        { type: "header", parameters: [{ type: "image", image: { id: headerImageId } }] },
        body(p("businessName") || p("shopName") || p("name") || "Business"),
      ];
    }

    case "new_product_reminder":
      // Manual admin Marketing campaign (Marathi) — never triggered automatically.
      // Sent to active-subscribed retailers who still have vacant/unused product seats.
      // {{1}} = ownerName → businessName → shopName → "User" (retailer/owner name)
      // {{2}} = vacantSeats (number of unused product seats)
      // Both CTAs are static URL buttons (video + inventory) — no button components sent.
      return [body(name(), p("vacantSeats"))];

    case "kyc_pending": {
      // Manual admin campaign — never triggered automatically.
      // Sent to subscribed retailers/manufacturers whose payout KYC is not yet
      // verified (payoutAccounts.status !== "verified", or no account at all).
      // Body has exactly ONE variable: {{1}} = businessName → shopName → ownerName → "User".
      // Only this single body parameter is sent — no header or button components.
      const displayName = p("businessName") || p("shopName") || p("ownerName") || "User";
      return [body(displayName)];
    }

    case "kyc_success": {
      // Manual admin campaign — never triggered automatically.
      // Sent to direct retailers whose payout KYC is verified
      // (payoutAccounts.status === "verified").
      // Body has exactly ONE variable: {{1}} = businessName → shopName → ownerName → "User".
      // CTA is a static URL button (https://krishidukan.com/dashboard/payouts) —
      // no button component is sent.
      const displayName = p("businessName") || p("shopName") || p("ownerName") || "User";
      return [body(displayName)];
    }

    case "app_update": {
      // Manual admin Marketing campaign — never triggered automatically.
      // Sent to retailers / manufacturers / customers to prompt an app update.
      // Body has exactly ONE variable: {{1}} = businessName → shopName → ownerName → "User".
      // CTA is a static URL button (Play Store listing) — no button component is sent.
      const displayName = p("businessName") || p("shopName") || p("ownerName") || "User";
      return [body(displayName)];
    }

    case "reel_promo_hindi": {
      // Manual admin Marketing campaign (Hindi) — never triggered automatically.
      // Header: static IMAGE — Meta requires the header component even for static images.
      // Body: ZERO variables — do NOT send a body component or Meta returns error 132000.
      // Button: static URL (https://krishidukan.com/reels/karan-veer-power-plus-xObUVDXHFtyluo3xCqQt)
      //   — static, so no button component is sent.
      // Image media ID injected via WA_REEL_PROMO_HEADER_ID secret (Secret Manager).
      // Must be declared in wa-dispatch.ts secrets[] — if undefined here the function
      // was not deployed with the secret, not a resolver bug.
      const headerImageId = process.env.WA_REEL_PROMO_HEADER_ID;
      if (!headerImageId) {
        throw new Error(
          "WA_REEL_PROMO_HEADER_ID is not set — add it to the function secrets[] in wa-dispatch.ts and redeploy"
        );
      }
      return [
        { type: "header", parameters: [{ type: "image", image: { id: headerImageId } }] },
      ];
    }

    case "generic":
    default:
      // No template — caller must provide a plain-text message instead
      return [];
  }
}
