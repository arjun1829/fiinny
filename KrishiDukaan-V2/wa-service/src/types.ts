import type { Timestamp } from "firebase-admin/firestore";

export type NotificationStatus =
  | "pending"
  | "processing"
  | "sent"
  | "failed"
  | "cancelled";

export type NotificationType = "subscription" | "order" | "onboarding" | "general";

export type WaTemplate =
  | "subscription_welcome"
  | "subscription_expiry"
  | "order_notification"
  | "generic";

/** Dynamic values substituted into the template at render time. */
export type WaPayload = Record<string, string | number | boolean>;

/** Source event that triggered this notification — used for tracing. */
export interface WaSourceEvent {
  event: string;       // e.g. "subscription_expiry", "order_created"
  entityType: string;  // e.g. "subscription", "order"
  entityId: string;    // e.g. "sub_abc123", "ORD-456"
}

export interface WaNotification {
  id?: string;

  // Recipient
  phone: string;

  // Content
  message: string;              // final rendered message (for history / debugging)
  template: WaTemplate;
  payload: WaPayload;

  // Source tracing
  source: WaSourceEvent;

  // Lifecycle
  status: NotificationStatus;
  type: NotificationType;

  // Timestamps
  createdAt: Timestamp | Date;
  sentAt: Timestamp | Date | null;
  lastAttemptAt: Timestamp | Date | null;

  // Retry
  retryCount: number;
  maxRetries: number;
  error: string | null;
}
