import * as admin from "firebase-admin";
import { logger } from "firebase-functions/v2";

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
type NotificationType = "subscription" | "order" | "onboarding" | "general";

interface WaSourceEvent {
  event: string;
  entityType: string;
  entityId: string;
}

interface QueueOptions {
  template?: WaTemplate;
  payload?: WaPayload;
  source?: WaSourceEvent;
  maxRetries?: number;
  type?: NotificationType;
}

const DEFAULT_MAX_RETRIES = 3;

/**
 * Queues a WhatsApp notification by writing to waNotifications.
 * The sendWaNotification Firebase Function picks this up and sends it via the WhatsApp Cloud API.
 * Never call the Cloud API directly from Functions — always go through this queue.
 */
export async function queueWaNotification(
  phone: string,
  message: string,
  opts: QueueOptions = {}
): Promise<string | null> {
  const trimmed = phone.trim();
  if (!trimmed) return null;

  logger.info("[waQueue] queueing notification", {
    phone: trimmed,
    template: opts.template ?? "generic",
  });

  try {
    const doc = await admin.firestore().collection("waNotifications").add({
      // Recipient
      phone: trimmed,

      // Content — message is kept for audit/debug; templateComponents are
      // resolved by the Firebase Function from template + payload at send time.
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
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      sentAt: null,
      deliveredAt: null,
      readAt: null,
      failedAt: null,

      // Retry
      retryCount: 0,
      maxRetries: opts.maxRetries ?? DEFAULT_MAX_RETRIES,
      lastError: null,
    });

    logger.info("[waQueue] document created", { docId: doc.id, phone: trimmed });
    return doc.id;
  } catch (err) {
    logger.error(
      "[waQueue] Firestore add() FAILED — waNotification was NOT queued",
      {
        phone: trimmed,
        template: opts.template,
        errorMessage: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      }
    );
    return null;
  }
}

/** Returns the app's public base URL configured via the BASE_URL env var. */
export function buildSignupInviteUrl(inviteCode: string): string {
  const base = (process.env.BASE_URL ?? "").replace(/\/$/, "");
  const path = `/?view=signup&inviteCode=${encodeURIComponent(inviteCode.trim())}`;
  return base ? `${base}${path}` : path;
}
