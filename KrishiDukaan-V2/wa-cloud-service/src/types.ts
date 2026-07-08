import type { Timestamp } from "firebase-admin/firestore";

export type NotificationStatus =
  | "pending"    // queued, not yet attempted
  | "sending"    // in-flight to Meta Cloud API
  | "sent"       // accepted by Meta (metaMessageId present)
  | "delivered"  // webhook: device received it
  | "read"       // webhook: recipient opened it
  | "failed"     // permanently failed after all retries
  | "cancelled"; // cancelled before sending (e.g. order cancelled)

export type NotificationType = "subscription" | "order" | "onboarding" | "general";

export type WaTemplate =
  | "subscription_welcome"
  | "subscription_expiry"
  | "order_notification"
  | "order_confirmation_customer"
  | "retailer_onboarding"
  | "product_assignment_onboarded"
  | "product_assignment_pending_signup"
  | "manufacturer_network_summary"
  | "generic";

/** Dynamic values substituted into the template at render time (for audit/debug). */
export type WaPayload = Record<string, string | number | boolean>;

/** Source event that triggered this notification — used for tracing. */
export interface WaSourceEvent {
  event: string;      // e.g. "subscription_expiry", "order_created"
  entityType: string; // e.g. "subscription", "order"
  entityId: string;   // e.g. "sub_abc123", "ORD-456"
}

// ─── WhatsApp Cloud API template components ───────────────────────────────────

export interface WaTextParam {
  type: "text";
  text: string;
}

export interface WaCurrencyParam {
  type: "currency";
  currency: {
    fallback_value: string;
    code: string;         // ISO 4217, e.g. "INR"
    amount_1000: number;  // amount × 1000
  };
}

export interface WaDateTimeParam {
  type: "date_time";
  date_time: { fallback_value: string };
}

export type WaComponentParam = WaTextParam | WaCurrencyParam | WaDateTimeParam;

export interface WaTemplateComponent {
  type: "header" | "body" | "button";
  sub_type?: "quick_reply" | "url";
  index?: number; // required for button components
  parameters: WaComponentParam[];
}

// ─── Incoming message document ───────────────────────────────────────────────

export interface WaIncomingMessage {
  // Sender
  phone: string;  // E.164 without '+', e.g. "919876543210"
  waId: string;   // WhatsApp ID returned by Meta (may differ from phone)

  // Message identity
  messageId: string; // wamid from Meta

  // Content
  messageType: string; // "text" | "image" | "audio" | "video" | "document" | "sticker" | "location" | "contacts" | "interactive" | "button" | "unknown"
  messageText: string | null; // body text for text messages, caption for media

  // Timestamps
  timestamp: Timestamp | Date; // parsed from Meta's Unix epoch string
  receivedAt: Timestamp | Date; // server time when our webhook received it

  // Full raw payload from Meta for this specific message object
  rawPayload: Record<string, unknown>;
}

// ─── Raw Meta webhook shapes (for handler typing) ────────────────────────────

export interface MetaStatusError {
  code: number;
  title: string;
  message: string;
  error_data?: { details: string };
}

export interface MetaStatusEvent {
  id: string; // wamid
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string; // Unix epoch as string
  recipient_id: string;
  conversation?: { id: string; expiration_timestamp?: string; origin?: { type: string } };
  pricing?: { billable: boolean; pricing_model: string; category: string };
  errors?: MetaStatusError[];
}

export interface MetaMessageEvent {
  from: string;    // sender phone, E.164 without '+'
  id: string;      // wamid
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type: string; sha256: string; caption?: string };
  audio?: { id: string; mime_type: string };
  video?: { id: string; mime_type: string; sha256: string; caption?: string };
  document?: { id: string; filename?: string; mime_type: string; caption?: string };
  sticker?: { id: string; mime_type: string; animated: boolean };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  button?: { payload: string; text: string };
  interactive?: { type: string; list_reply?: unknown; button_reply?: unknown };
  errors?: MetaStatusError[];
  [key: string]: unknown;
}

export interface MetaWebhookContact {
  profile: { name: string };
  wa_id: string;
}

export interface MetaChangeValue {
  messaging_product: "whatsapp";
  metadata: { display_phone_number: string; phone_number_id: string };
  contacts?: MetaWebhookContact[];
  statuses?: MetaStatusEvent[];
  messages?: MetaMessageEvent[];
  errors?: MetaStatusError[];
}

export interface MetaWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{ value: MetaChangeValue; field: string }>;
  }>;
}

// ─── Notification document ────────────────────────────────────────────────────

export interface WaNotification {
  id?: string;

  // Recipient
  phone: string;

  // Content
  type: NotificationType;
  template: WaTemplate;
  payload: WaPayload;

  // Cloud API template components (resolved at send time from payload)
  templateComponents?: WaTemplateComponent[];

  // Kept for audit / debug — rendered human-readable preview (optional)
  message?: string;

  // Source tracing
  source: WaSourceEvent;

  // Lifecycle
  status: NotificationStatus;

  // Cloud API response — populated after successful send
  metaMessageId: string | null;

  // Timestamps
  createdAt: Timestamp | Date;
  sentAt: Timestamp | Date | null;
  deliveredAt: Timestamp | Date | null;
  readAt: Timestamp | Date | null;
  failedAt: Timestamp | Date | null;

  // Retry
  retryCount: number;
  maxRetries: number;
  lastError: string | null;
}
