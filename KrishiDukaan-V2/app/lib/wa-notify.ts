import { getAdminDb } from "@/app/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

type WaTemplate =
  | "subscription_welcome"
  | "subscription_expiry"
  | "order_notification"
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
 * Queues a WhatsApp notification. The wa-service picks this up and sends it.
 * Never call WhatsApp Web directly from the app — always go through this queue.
 */
export async function queueWaNotification(
  phone: string,
  message: string,
  opts: QueueOptions = {}
): Promise<string> {
  const db = getAdminDb();
  const doc = await db.collection("waNotifications").add({
    phone: phone.trim(),
    message,
    template: opts.template ?? "generic",
    payload: opts.payload ?? {},
    source: opts.source ?? { event: "manual", entityType: "unknown", entityId: "" },
    status: "pending",
    type: opts.type ?? "general",
    createdAt: FieldValue.serverTimestamp(),
    sentAt: null,
    lastAttemptAt: null,
    retryCount: 0,
    maxRetries: opts.maxRetries ?? DEFAULT_MAX_RETRIES,
    error: null,
  });
  return doc.id;
}

// ── Pre-built message helpers ─────────────────────────────────────────────────

export async function queueSubscriptionWelcome(
  phone: string,
  name: string,
  opts: { source?: WaSourceEvent } = {}
) {
  const payload: WaPayload = { name };
  return queueWaNotification(
    phone,
    `नमस्ते ${name} जी! 🌱\n\nKrishi Dukan में आपका स्वागत है। आपकी सदस्यता सक्रिय हो गई है।\n\nकिसी भी सहायता के लिए हमसे संपर्क करें।`,
    {
      template: "subscription_welcome",
      payload,
      type: "subscription",
      source: opts.source ?? { event: "subscription_created", entityType: "subscription", entityId: "" },
    }
  );
}

export async function queueSubscriptionExpiry(
  phone: string,
  name: string,
  expiryDate: string,
  opts: { source?: WaSourceEvent; subscriptionId?: string } = {}
) {
  const payload: WaPayload = { name, expiryDate };
  return queueWaNotification(
    phone,
    `नमस्ते ${name} जी,\n\nआपकी Krishi Dukan सदस्यता ${expiryDate} को समाप्त हो रही है। ⏰\n\nसदस्यता नवीनीकृत करने के लिए ऐप खोलें।`,
    {
      template: "subscription_expiry",
      payload,
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
  const payload: WaPayload = { customerName, itemSummary, total };
  return queueWaNotification(
    phone,
    `नया ऑर्डर मिला! 🛒\n\n${customerName} ने ${itemSummary} का ऑर्डर दिया है।\nकुल: ₹${total}\n\nKrishi Dukan ऐप में देखें।`,
    {
      template: "order_notification",
      payload,
      type: "order",
      source: opts.source ?? {
        event: "order_created",
        entityType: "order",
        entityId: opts.orderId ?? "",
      },
    }
  );
}
