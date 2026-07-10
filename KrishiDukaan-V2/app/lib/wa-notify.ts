import { getAdminDb } from "@/app/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

type WaTemplate =
  | "subscription_welcome"
  | "subscription_expiry"
  | "order_notification"
  | "order_confirmation_customer"
  | "retailer_onboarding"
  | "product_assignment_onboarded"
  | "product_assignment_pending_signup"
  | "manufacturer_network_summary"
  | "generic";

type WaPayload = Record<string, string | number | boolean>;

interface WaSourceEvent {
  event: string;
  entityType: string;
  entityId: string;
}

type NotificationType = "subscription" | "order" | "onboarding" | "general";

const DEFAULT_MAX_RETRIES = 3;

interface QueueOptions {
  template?: WaTemplate;
  payload?: WaPayload;
  source?: WaSourceEvent;
  maxRetries?: number;
  type?: NotificationType;
}

/**
 * Queues a WhatsApp notification. The wa-cloud-service picks this up and sends
 * it via the WhatsApp Cloud API. Never call the API directly from the app.
 */
export async function queueWaNotification(
  phone: string,
  message: string,
  opts: QueueOptions = {}
): Promise<string> {
  const db = getAdminDb();
  const doc = await db.collection("waNotifications").add({
    // Recipient
    phone: phone.trim(),

    // Content — message is kept for audit/debug; templateComponents are
    // resolved by wa-cloud-service from template + payload at send time.
    message,
    template: opts.template ?? "generic",
    payload: opts.payload ?? {},

    // Tracing
    source: opts.source ?? { event: "manual", entityType: "unknown", entityId: "" },

    // Lifecycle — full schema so wa-cloud-service and webhooks can update in-place
    status: "pending",
    type: opts.type ?? "general",
    metaMessageId: null,

    // Timestamps
    createdAt: FieldValue.serverTimestamp(),
    sentAt: null,
    deliveredAt: null,
    readAt: null,
    failedAt: null,

    // Retry
    retryCount: 0,
    maxRetries: opts.maxRetries ?? DEFAULT_MAX_RETRIES,
    lastError: null,
  });
  return doc.id;
}

// ── Pre-built helpers for common notification types ───────────────────────────

export async function queueSubscriptionWelcome(
  phone: string,
  ownerName: string,
  opts: { source?: WaSourceEvent; businessName?: string; shopName?: string } = {}
) {
  return queueWaNotification(
    phone,
    `तुमची Krishi Dukan सदस्यता यशस्वीरित्या सक्रिय झाली आहे.`,
    {
      template: "subscription_welcome",
      payload: { ownerName, businessName: opts.businessName ?? "", shopName: opts.shopName ?? "" },
      type: "subscription",
      source: opts.source ?? {
        event: "subscription_created",
        entityType: "subscription",
        entityId: "",
      },
    }
  );
}

export async function queueSubscriptionExpiry(
  phone: string,
  ownerName: string,
  formattedExpiryDate: string,
  opts: { source?: WaSourceEvent; subscriptionId?: string; businessName?: string; shopName?: string } = {}
) {
  return queueWaNotification(
    phone,
    `तुमची Krishi Dukan सदस्यता ${formattedExpiryDate} रोजी संपणार आहे.`,
    {
      template: "subscription_expiry",
      payload: { ownerName, businessName: opts.businessName ?? "", shopName: opts.shopName ?? "", formattedExpiryDate },
      type: "subscription",
      source: opts.source ?? {
        event: "subscription_expiry",
        entityType: "subscription",
        entityId: opts.subscriptionId ?? "",
      },
    }
  );
}

// Seller notification — sent to the retailer when a new order arrives.
// order_notification body {{1}} = shopName → businessName → "Retailer"
// Static Orders Dashboard URL button in the Meta template — no button component needed.
export async function queueOrderNotification(
  phone: string,
  shopName: string,
  opts: { source?: WaSourceEvent; orderId?: string; businessName?: string } = {}
) {
  return queueWaNotification(
    phone,
    `🛒 नवीन ऑनलाइन ऑर्डर प्राप्त झाली आहे.`,
    {
      template: "order_notification",
      payload: { shopName, businessName: opts.businessName ?? "" },
      type: "order",
      source: opts.source ?? {
        event: "order_created",
        entityType: "order",
        entityId: opts.orderId ?? "",
      },
    }
  );
}

// Customer confirmation — sent to the buyer immediately after order placement.
// order_confirmation_customer body {{1}} = customerName, button {{1}} = orderId.
// Meta template button base URL: https://krishidukan.com/invoice/
export async function queueOrderConfirmationCustomer(
  phone: string,
  customerName: string,
  orderId: string,
  opts: { source?: WaSourceEvent } = {}
) {
  return queueWaNotification(
    phone,
    `✅ तुमची ऑर्डर यशस्वीरित्या दिली गेली आहे. ऑर्डर ID: ${orderId}`,
    {
      template: "order_confirmation_customer",
      payload: { customerName, orderId },
      type: "order",
      source: opts.source ?? {
        event: "order_placed",
        entityType: "order",
        entityId: orderId,
      },
    }
  );
}
