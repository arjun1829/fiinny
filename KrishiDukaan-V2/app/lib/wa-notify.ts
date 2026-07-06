import { getAdminDb } from "@/app/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

type WaTemplate =
  | "subscription_welcome"
  | "subscription_expiry"
  | "order_notification"
  | "retailer_onboarding"
  | "product_assignment_onboarded"
  | "product_assignment_pending_signup"
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
  name: string,
  opts: { source?: WaSourceEvent } = {}
) {
  return queueWaNotification(
    phone,
    `🎉 अभिनंदन!\n\nतुमची Krishi Dukan सदस्यता यशस्वीरित्या सक्रिय झाली आहे.\n\nआता तुम्ही तुमचं दुकान व्यवस्थापित करू शकता, प्रॉडक्ट्स जोडू शकता आणि ऑनलाइन ऑर्डर्स स्वीकारू शकता.\n\nतुमच्या व्यवसायासाठी शुभेच्छा!\nhttps://krishidukan.com`,
    {
      template: "subscription_welcome",
      payload: { name },
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
  name: string,
  expiryDate: string,
  opts: { source?: WaSourceEvent; subscriptionId?: string } = {}
) {
  return queueWaNotification(
    phone,
    `⏰ सदस्यता नूतनीकरणाची आठवण\n\nतुमची Krishi Dukan सदस्यता ${expiryDate} रोजी संपणार आहे.\n\nसेवा अखंड सुरू ठेवण्यासाठी कृपया वेळेत सदस्यता नूतनीकरण करा.\nhttps://krishidukan.com`,
    {
      template: "subscription_expiry",
      payload: { name, expiryDate },
      type: "subscription",
      source: opts.source ?? {
        event: "subscription_expiry",
        entityType: "subscription",
        entityId: opts.subscriptionId ?? "",
      },
    }
  );
}

export async function queueOrderNotification(
  phone: string,
  customerName: string,
  itemSummary: string,
  total: number,
  opts: { source?: WaSourceEvent; orderId?: string } = {}
) {
  return queueWaNotification(
    phone,
    `🛒 नवीन ऑनलाइन ऑर्डर प्राप्त झाली आहे.\n\nग्राहक: ${customerName}\nप्रॉडक्ट: ${itemSummary}\nएकूण रक्कम: ₹${total}\n\nऑर्डरची संपूर्ण माहिती पाहण्यासाठी Krishi Dukan अॅप किंवा वेबसाइटला भेट द्या.\nhttps://krishidukan.com`,
    {
      template: "order_notification",
      payload: { customerName, itemSummary, total },
      type: "order",
      source: opts.source ?? {
        event: "order_created",
        entityType: "order",
        entityId: opts.orderId ?? "",
      },
    }
  );
}
