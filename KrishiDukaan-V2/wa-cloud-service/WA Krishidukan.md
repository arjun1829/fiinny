# KrishiDukaan — WhatsApp Notification Pipeline

Complete architecture and data-flow reference for the WhatsApp Cloud integration.
All file paths are relative to the repo root.

---

## Complete End-to-End Flow

```
Business Event (Cloud Function trigger)
        │
        ▼
functions/src/index.ts — trigger handler
        │  Resolves recipient phone, names, IDs
        ▼
functions/src/wa-notify.ts — queueWaNotification()
        │  Writes waNotifications/{docId} to Firestore
        ▼
Firestore  waNotifications  status = "pending"
        │
        ▼
wa-cloud-service  cron every 1 min  processPendingNotifications()
        │  Queries pending docs, claims each with a transaction
        ▼
src/queue.ts — dispatchNotification()
        │  Chooses: sendTemplateMessage or sendTextMessage
        ▼
src/templateResolver.ts — resolveTemplateComponents()
        │  Maps payload fields → WhatsApp template component array
        ▼
src/cloudApi.ts — post()
        │  POST https://graph.facebook.com/v20.0/{phoneNumberId}/messages
        ▼
Meta WhatsApp Cloud API
        │  Returns wamid (message ID) on success
        ▼
Firestore  waNotifications  status = "sent"  metaMessageId = wamid
        │
        ▼
Meta sends webhook event (delivered / read / failed)
        │
        ▼
src/webhook/server.ts  POST /webhook
        │  Responds 200 immediately, processes async
        ▼
src/webhook/handler.ts — handleWebhookPayload()
        │  Routes: status events → applyStatusUpdate()
        │          incoming messages → saveIncomingMessage()
        ▼
src/webhook/statusUpdater.ts — applyStatusUpdate()
        │  Queries by metaMessageId, patches deliveredAt / readAt / failedAt
        ▼
Firestore  waNotifications  status = "delivered" → "read"
```

---

## Step 1 — Business Event

A Firestore trigger or scheduled job in `functions/src/index.ts` detects that something noteworthy happened and decides a WhatsApp notification should be sent. Every event has its own trigger function.

| Event | Trigger type | Function | Template sent |
|---|---|---|---|
| New order placed | `onDocumentCreated("orders/{orderId}")` | `notifySellerOnOrder` | `order_notification` → seller |
| Order status placed | `onDocumentWritten("orders/{orderId}")` | `notifyCustomerOnOrderStatus` | `order_confirmation_customer` → customer |
| Product assigned to retailer | `onDocumentCreated("products/{productId}")` | `notifyRetailerOnAssignment` | `product_assignment_onboarded` or `product_assignment_pending_signup` |
| Retailer added to network | `onDocumentCreated("manufacturerRetailers/{docId}")` | `notifyRetailerOnNetworkAdd` | `retailer_onboarding` |
| Subscription activated | `onDocumentCreated("subscriptions/{subscriptionId}")` | `notifyOnSubscriptionCreated` | `subscription_welcome` |
| Subscription expiring in ~2 days | `onSchedule("every 24 hours")` | `remindExpiringSubscriptions` | `subscription_expiry` |

**What happens inside each handler:**

1. Extract the recipient's phone number from the Firestore document using `firstPhone()`, which tries multiple field names (`sellerPhone`, `sellerId`, `retailerPhone`, etc.) and skips UID-like values.
2. Look up display names from `manufacturers/`, `users/`, or `retailers/` collections using `displayName()` or `manufacturerDisplayName()`.
3. Build a human-readable `message` string (kept for audit/debug only).
4. Build a `payload` object — a flat key-value map with the variable values for the template.
5. Call `queueWaNotification()`.

**If this step fails:** The Cloud Function logs the error. The WhatsApp notification is never created. The in-app push notification (`notify()`) is separate and may still succeed. No retry — Cloud Functions are ephemeral.

---

## Step 2 — Notification Creation (the Queue Document)

**File:** `functions/src/wa-notify.ts` → `queueWaNotification()`
**Also available:** `app/lib/wa-notify.ts` → same function for API routes that run server-side

```
Firestore  waNotifications/{auto-id}
```

### Why a queue document instead of sending directly?

Cloud Functions have a 9-minute timeout and should not make long-running HTTP calls inline. Separating the send step into a separate always-running process (`wa-cloud-service`) gives:

- **Reliability** — if the Cloud API is momentarily unavailable, the document stays pending and is retried automatically.
- **Decoupling** — the trigger function finishes immediately regardless of whether the WhatsApp send succeeds.
- **Observability** — every notification has a permanent Firestore record with its full lifecycle.
- **Rate limiting** — the queue processor can be tuned (`BATCH_SIZE`, `POLL_INTERVAL_MINUTES`) independently of the trigger.

### Firestore document schema

```ts
waNotifications/{docId} {
  // ── Recipient ────────────────────────────────────────────────
  phone: string            // E.164 with country code, no '+', e.g. "919876543210"
                           // Written by queueWaNotification(); normalised to E.164
                           // by toE164() before the API call.

  // ── Content ──────────────────────────────────────────────────
  message: string          // Human-readable audit copy. NOT sent to Meta.
                           // The Cloud API uses the approved template text.
  template: WaTemplate     // Template name sent to Meta: "subscription_welcome",
                           // "order_notification", "order_confirmation_customer",
                           // "retailer_onboarding", "product_assignment_onboarded",
                           // "product_assignment_pending_signup",
                           // "manufacturer_network_summary", "generic"
  payload: WaPayload       // Flat key→value map. resolveTemplateComponents() reads
                           // this to build the component array at send time.
                           // e.g. { ownerName: "Suresh", formattedExpiryDate: "15 July 2026" }

  // ── Tracing ───────────────────────────────────────────────────
  source: {
    event: string          // What caused this: "order_created", "product_assigned", …
    entityType: string     // "order", "subscription", "product", "manufacturerRetailer"
    entityId: string       // The Firestore document ID of the triggering entity
  }

  // ── Lifecycle ─────────────────────────────────────────────────
  status: NotificationStatus
  //  "pending"   — written here; waiting to be picked up
  //  "sending"   — claimed by the queue processor (transaction lock)
  //  "sent"      — API returned 200 and a wamid
  //  "delivered" — Meta webhook confirmed device received it
  //  "read"      — Meta webhook confirmed recipient opened it
  //  "failed"    — exhausted maxRetries OR Meta webhook reported failure
  //  "cancelled" — reserved for future use (e.g. order cancellation)

  type: NotificationType   // "subscription" | "order" | "onboarding" | "general"
                           // Allows filtering the queue by category.

  metaMessageId: string | null
                           // The wamid returned by Meta, e.g. "wamid.XXXXXXX"
                           // null until the API call succeeds.
                           // Used by statusUpdater.ts to match webhook events
                           // back to this document.

  // ── Timestamps ────────────────────────────────────────────────
  createdAt: Timestamp     // Server timestamp; set by queueWaNotification()
  sentAt: Timestamp | null // Set when the API call returns 200
  deliveredAt: Timestamp | null  // Set by statusUpdater when Meta sends "delivered"
  readAt: Timestamp | null       // Set by statusUpdater when Meta sends "read"
  failedAt: Timestamp | null     // Set when exhausted OR Meta reports failure

  // ── Retry ─────────────────────────────────────────────────────
  retryCount: number       // Incremented on every attempt (success or failure)
  maxRetries: number       // Default 3. After retryCount >= maxRetries, status="failed"
  lastError: string | null // Last error message from the API or queue processor
}
```

**If this step fails:** `queueWaNotification()` catches Firestore errors and returns `null` instead of the document ID. The Cloud Function logs the error. The notification is lost — there is no retry at this layer.

---

## Step 3 — Queue Processing

**File:** `wa-cloud-service/src/queue.ts` → `processPendingNotifications()`
**Scheduler:** `wa-cloud-service/src/index.ts` via `node-cron`

```
Poll interval: POLL_INTERVAL_MINUTES (default: 1 minute)
Batch size:    BATCH_SIZE (default: 10 documents per poll)
```

### How the cron works

`src/index.ts` runs `import "dotenv/config"` first (loading `.env`), then schedules:

```
cron("* * * * *")  →  processPendingNotifications(BATCH_SIZE)
```

It also runs once immediately on startup so documents queued before the service started are not delayed a full minute.

### How pending documents are found

```ts
db.collection("waNotifications")
  .where("status", "==", "pending")
  .orderBy("retryCount", "asc")   // lowest retry count first (fresh docs before retries)
  .orderBy("createdAt", "asc")    // oldest first within same retry count
  .limit(BATCH_SIZE)
```

Documents stuck at `status = "sending"` (claimed but never completed, e.g. after a crash) are **not** automatically reclaimed. They remain in `"sending"` state permanently. This is a known limitation — see Architecture Review.

### How each document is processed

1. **Claim** — `claimDoc()` runs a Firestore transaction: read the doc, verify `status === "pending"`, write `status = "sending"`. If another worker already claimed it (concurrent poll cycles), the transaction sees `status !== "pending"` and returns `null`. The document is skipped.

2. **Dispatch** — `dispatchNotification()` checks `n.template`:
   - If not `"generic"` → calls `resolveTemplateComponents()` then `sendTemplateMessage()`
   - If `"generic"` → calls `sendTextMessage()` with `n.message`

3. **On success** — writes `status = "sent"`, `metaMessageId`, `sentAt`, increments `retryCount`.

4. **On failure** — increments `retryCount`. If `retryCount >= maxRetries`, writes `status = "failed"` and `failedAt`. Otherwise writes `status = "pending"` so the next poll cycle picks it up again.

**If this step fails:**
- Network error → caught, doc reverts to `pending`, retried next poll
- Max retries exhausted → `status = "failed"`, `lastError` contains the error message
- `claimDoc` transaction fails → doc stays `pending`, harmless

---

## Step 4 — Template Resolution

**File:** `wa-cloud-service/src/templateResolver.ts` → `resolveTemplateComponents()`

This function converts the flat `payload` object from Firestore into the exact component array format that the WhatsApp Cloud API expects.

### How it works

```ts
resolveTemplateComponents(template: WaTemplate, payload: WaPayload): WaTemplateComponent[]
```

The function is a `switch` on `template`. Each `case` hard-codes the mapping from payload keys to component positions, in the exact order the approved Meta template expects them.

### Variable mapping for each template

| Template | Component | Position | Payload key |
|---|---|---|---|
| `subscription_welcome` | body | {{1}} | `ownerName → businessName → shopName → "User"` |
| `subscription_expiry` | body | {{1}} | `ownerName → businessName → shopName → "User"` |
| | body | {{2}} | `formattedExpiryDate` |
| `order_notification` | body | {{1}} | `shopName → businessName → "Retailer"` |
| `order_confirmation_customer` | body | {{1}} | `customerName` |
| | button[0] | {{1}} | `orderId` (appended to `https://krishidukan.com/invoice/`) |
| `retailer_onboarding` | body | {{1}} | `manufacturerName` |
| | button[0] url | {{1}} | `inviteCode` |
| `product_assignment_onboarded` | body | {{1}} | `manufacturerName` |
| | body | {{2}} | `productName` |
| | button[0] url | {{1}} | `productId` |
| `product_assignment_pending_signup` | body | {{1}} | `manufacturerName` |
| | body | {{2}} | `productName` |
| | button[0] url | {{1}} | `inviteCode` |
| | button[1] url | {{1}} | `productId` |
| `manufacturer_network_summary` | body | {{1}} | `ownerName → businessName → shopName → "User"` |
| | body | {{2}} | `retailerCount` |
| `generic` | _(none)_ | — | Uses plain-text `message` field instead |

### Output shape

A body component:
```json
{ "type": "body", "parameters": [{ "type": "text", "text": "Suresh" }] }
```

A dynamic URL button component:
```json
{
  "type": "button",
  "sub_type": "url",
  "index": 0,
  "parameters": [{ "type": "text", "text": "ORD12345678" }]
}
```

**Important:** Button components send only the dynamic suffix. The base URL (e.g. `https://krishidukan.com/invoice/`) is hardcoded in the Meta-approved template. Only the variable part (`orderId`) is sent here.

**If this step fails:** An exception propagates to `dispatchNotification()`, which marks the document for retry.

---

## Step 5 — WhatsApp Cloud API

**File:** `wa-cloud-service/src/cloudApi.ts`

### Environment variables

| Variable | Purpose |
|---|---|
| `WA_ACCESS_TOKEN` | Permanent system user token from Meta Business Manager |
| `WA_PHONE_NUMBER_ID` | The WhatsApp phone number ID (not the phone number itself) |
| `WA_WABA_ID` | WhatsApp Business Account ID (used for `verifyCredentials`) |

These are read by `getConfig()` on every call — never cached at module level. If they change in `.env` and the service is restarted, the new values take effect immediately.

### Startup credential check

`verifyCredentials()` is called once at startup in `src/index.ts`. It makes two Graph API calls:

1. `GET /{phoneNumberId}?fields=id,display_phone_number,status,…` — confirms the token is valid and authorised for this specific phone number.
2. `GET /me` — confirms the token itself is alive (not expired/revoked).

All results are logged with masked token values so the exact cause of any `[190]` or `[132001]` error is visible before any message is attempted.

### The API request

`sendTemplateMessage()` builds this payload and passes it to `post()`:

```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "919876543210",
  "type": "template",
  "template": {
    "name": "subscription_welcome",
    "language": { "code": "en" },
    "components": [
      {
        "type": "body",
        "parameters": [{ "type": "text", "text": "Suresh" }]
      }
    ]
  }
}
```

The endpoint is:
```
POST https://graph.facebook.com/v20.0/{phoneNumberId}/messages
Authorization: Bearer {WA_ACCESS_TOKEN}
Content-Type: application/json
```

Phone numbers are normalised by `toE164()` — strips non-digits, prepends `91` if not already present.

The language code comes from `process.env.WA_TEMPLATE_LANGUAGE ?? "en"` in `queue.ts`. This must exactly match the language the template was approved for in Meta Business Manager (e.g. `"en"`, `"en_US"`, `"mr"`).

### Request and response logging

Every call logs the full request body and the full raw HTTP response (status code + body text) unconditionally. On error `[132001]`, it additionally logs which template name and language code were sent so they can be compared character-by-character against what Meta has approved.

**If this step fails:** `post()` throws. The queue processor catches it, increments `retryCount`, and sets `status = "pending"` (or `"failed"` if retries are exhausted).

---

## Step 6 — Firestore Status Updates (full lifecycle)

The `status` field follows this state machine:

```
pending → sending → sent → delivered → read
                  ↘ failed (webhook or retry exhaustion)
```

| Field | Set when | Set by |
|---|---|---|
| `status = "pending"` | Document created | `queueWaNotification()` |
| `status = "sending"` | Claimed by queue processor | `claimDoc()` transaction |
| `status = "sent"` | API returned 200 | `queue.ts` success branch |
| `metaMessageId` | API returned 200 | `queue.ts` success branch |
| `sentAt` | API returned 200 | `queue.ts` success branch |
| `retryCount++` | Every attempt (success or fail) | `queue.ts` both branches |
| `lastError` | Any failure | `queue.ts` failure branch |
| `status = "failed"`, `failedAt` | retryCount ≥ maxRetries | `queue.ts` failure branch |
| `status = "delivered"`, `deliveredAt` | Meta webhook "delivered" | `statusUpdater.ts` |
| `status = "read"`, `readAt` | Meta webhook "read" | `statusUpdater.ts` |
| `status = "failed"`, `failedAt`, `lastError` | Meta webhook "failed" | `statusUpdater.ts` |

The `metaMessageId` is the key that connects outbound notifications to inbound webhook events. `statusUpdater.ts` queries `where("metaMessageId", "==", status.id)` to find the right document.

---

## Step 7 — Webhook

**File:** `wa-cloud-service/src/webhook/server.ts`

The webhook server runs in the same process as the queue poller (both started from `src/index.ts`). It listens on `WEBHOOK_PORT` (default 3001).

### Hub verification (one-time setup)

When you register a webhook URL in Meta Developer Console, Meta sends:

```
GET /webhook?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=<random>
```

The server checks `hub.verify_token === process.env.WA_WEBHOOK_VERIFY_TOKEN`. If it matches, it echoes back `hub.challenge` with HTTP 200. Meta considers the webhook verified. This happens once and never again unless the URL or token changes.

### Incoming events

Meta sends a POST to `/webhook` for every status change and incoming message. The server responds **200 immediately** — before doing any processing. This is intentional: Meta retries delivery if it doesn't receive a 200 within 20 seconds, so slow Firestore writes must not delay the response.

Processing happens asynchronously via `handleWebhookPayload()`.

### Event routing — `src/webhook/handler.ts`

`handleWebhookPayload()` iterates Meta's batched payload structure:

```
payload.entry[]
  → .changes[]
      → .value.statuses[]  →  applyStatusUpdate()
      → .value.messages[]  →  saveIncomingMessage()
```

Each event is handled inside its own `try/catch` so a failure on one event doesn't block the others.

### Status updates — `src/webhook/statusUpdater.ts`

`applyStatusUpdate()` queries Firestore by `metaMessageId` and applies a partial update:

| Meta status | Fields written |
|---|---|
| `"sent"` | `sentAt` (fills it if somehow missed) |
| `"delivered"` | `status = "delivered"`, `deliveredAt` |
| `"read"` | `status = "read"`, `readAt` |
| `"failed"` | `status = "failed"`, `failedAt`, `lastError` with Meta error details |

### Incoming messages — `src/webhook/incomingMessages.ts`

When a customer replies to a WhatsApp message, `saveIncomingMessage()` writes to `waIncomingMessages/{messageId}`. The Meta message ID is used as the Firestore document ID, making every write idempotent — replaying the same webhook creates no duplicates.

**If the webhook step fails:** Errors are caught and logged. The document may not be updated to `"delivered"` or `"read"`, but the message was already delivered from the customer's perspective. Meta retries webhooks for up to 7 days if it receives a non-200, but since we always return 200, Meta does not retry.

---

## File Responsibilities

| File | Responsibility |
|---|---|
| `functions/src/index.ts` | All Cloud Function exports. Trigger handlers that detect business events, resolve names and phones, and call `queueWaNotification`. Also contains push notification (`notify`) and scheduled jobs (`expireSubscriptions`, `remindExpiringSubscriptions`). |
| `functions/src/wa-notify.ts` | `queueWaNotification()` — the single function responsible for writing a `waNotifications` document. Contains the `WaTemplate` type locally to avoid importing from `wa-cloud-service`. |
| `app/lib/wa-notify.ts` | Same queue function for use from Next.js API routes (server-side only). Includes typed helpers `queueOrderNotification`, `queueSubscriptionWelcome`, `queueOrderConfirmationCustomer`, etc. |
| `wa-cloud-service/src/index.ts` | Entry point of the always-running service. Loads `.env`, runs `verifyCredentials()` at startup, starts the webhook HTTP server, starts the cron poller. |
| `wa-cloud-service/src/firebase.ts` | Firebase Admin SDK initialisation using Application Default Credentials. Exports `getDb()` singleton. |
| `wa-cloud-service/src/queue.ts` | `processPendingNotifications()` — queries pending docs, claims each with an optimistic transaction, dispatches to the Cloud API, writes success/failure back to Firestore. Contains all retry logic. |
| `wa-cloud-service/src/cloudApi.ts` | All HTTP communication with the Meta Graph API. `sendTemplateMessage()`, `sendTextMessage()`, `verifyCredentials()`, and the internal `post()` function. Reads env vars via `getConfig()`. |
| `wa-cloud-service/src/templateResolver.ts` | Pure function. Converts a `(template, payload)` pair into a `WaTemplateComponent[]` array. The only place where template variable ordering is defined. Must match Meta-approved templates exactly. |
| `wa-cloud-service/src/types.ts` | All shared TypeScript types: `WaTemplate`, `WaNotification`, `WaPayload`, `WaSourceEvent`, Meta webhook payload shapes, `WaTemplateComponent`, `NotificationStatus`. |
| `wa-cloud-service/src/webhook/server.ts` | Express server. Handles GET (hub verification) and POST (event delivery). Always returns 200 before processing. |
| `wa-cloud-service/src/webhook/handler.ts` | Routes a Meta webhook payload to status updater and incoming message handler. Iterates the `entry → changes → value` nesting structure. |
| `wa-cloud-service/src/webhook/statusUpdater.ts` | Queries `waNotifications` by `metaMessageId` and applies partial Firestore updates for `delivered`, `read`, and `failed` webhook events. |
| `wa-cloud-service/src/webhook/incomingMessages.ts` | Saves customer replies to `waIncomingMessages/{messageId}`. Idempotent via `set(..., { merge: false })` keyed on the Meta message ID. |
| `wa-cloud-service/scripts/test-e2e.ts` | Full local test suite. Tests template resolver structure, live Cloud API text send, every template send, queue lifecycle (pending → sent), and webhook GET/POST handling. Run with `TEST_PHONE=91XXXXXXXXXX npm run test:e2e`. |

---

## Architecture Review

### Production-ready

- **Queue pattern** — Firestore as a durable message queue with atomic claim transactions is correct and battle-tested. It handles concurrent workers safely.
- **Webhook server** — returns 200 immediately, processes async, handles malformed payloads without crashing.
- **Template resolver** — pure function, no side effects, fully testable.
- **Retry logic** — exponential retry via `retryCount / maxRetries` is sound. Oldest-first, lowest-retry-first ordering is correct.
- **Idempotent incoming messages** — keying on Meta message ID prevents duplicates on webhook replay.
- **Credential verification at startup** — catches misconfigured tokens before any message is attempted.

### Temporary / needs improvement later

| Issue | Priority | Notes |
|---|---|---|
| `"sending"` documents never reclaimed | High | If the service crashes mid-dispatch, those docs stay `"sending"` forever. Add a cron that resets docs stuck in `"sending"` for more than 5 minutes to `"pending"`. |
| Language code hardcoded to `"en"` | High | Templates submitted in a different locale (`"mr"`, `"en_IN"`) will always fail with `[132001]`. Support per-template language codes in the payload or in a language map in `queue.ts`. |
| Webhook has no signature verification | High | Meta signs POST webhooks with an HMAC-SHA256 of the body using the app secret (`X-Hub-Signature-256` header). Currently ignored. Anyone who knows the webhook URL can inject fake events. |
| No deduplication of outbound notifications | Medium | If a Cloud Function trigger fires twice for the same event (Firestore at-least-once delivery), two `waNotifications` docs are created and two messages are sent. Add an idempotency key (e.g. `{eventType}:{entityId}`) checked before writing. |
| `status = "cancelled"` is defined but never used | Low | Reserved for cancellations (e.g. order cancelled after a notification was queued). Wire it up when order cancellation is implemented. |
| No monitoring or alerting | Medium | No Cloud Monitoring metrics on queue depth, failure rate, or delivery rate. Add a daily summary or alert when `failed` documents exceed a threshold. |
| Single-language template support | Medium | All templates use one `WA_TEMPLATE_LANGUAGE`. Marathi-speaking users would benefit from `"mr"` templates. Build a per-user language preference lookup when Marathi templates are approved in Meta. |
| `wa-cloud-service` has its own `WaTemplate` type | Low | `functions/src/wa-notify.ts` and `app/lib/wa-notify.ts` each duplicate the `WaTemplate` union locally. Extract into a shared package (or a shared types file) so adding a new template requires one change, not three. |

### Next improvements in priority order

1. **Webhook HMAC signature verification** — security fix, straightforward to implement with `crypto.createHmac`.
2. **Reclaim stuck `"sending"` docs** — reliability fix, add a scheduled cleanup.
3. **Per-template language code support** — unblocks Marathi template rollout.
4. **Outbound deduplication via idempotency key** — prevents duplicate messages on Firestore trigger re-fires.
5. **Queue depth monitoring** — operational visibility before scaling.
6. **Shared `WaTemplate` type package** — maintainability, eliminates the three-file update required per new template.
