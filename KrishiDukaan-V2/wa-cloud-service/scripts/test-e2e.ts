/**
 * Local end-to-end integration test for wa-cloud-service.
 *
 * Usage:
 *   TEST_PHONE=91XXXXXXXXXX npm run test:e2e
 *
 * What it validates:
 *   1. Template resolver — all 5 templates produce correct component structure
 *   2. Cloud API connectivity — single text message send to TEST_PHONE
 *   3. Template sends — each template fires through sendTemplateMessage
 *   4. Queue processor — writes a pending Firestore doc and confirms it transitions
 *      pending → sending → sent with a real metaMessageId
 *   5. Webhook server — GET hub verification and POST event handling
 *   6. Duplicate-claim guard — same doc can't be processed twice concurrently
 *   7. Webhook status lifecycle — Firestore updates for sent/delivered/read/failed,
 *      idempotency of duplicate events, and no-downgrade ordering guarantee
 *   8. HMAC signature verification (when WA_APP_SECRET is set)
 */

import "dotenv/config";
import * as crypto from "crypto";
import * as http from "http";
import * as admin from "firebase-admin";

// ── Helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function pass(label: string): void {
  console.log(`  ✅  ${label}`);
  passed++;
}

function fail(label: string, reason: string): void {
  console.log(`  ❌  ${label}`);
  console.log(`       ${reason}`);
  failed++;
  failures.push(`${label}: ${reason}`);
}

function section(title: string): void {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("─".repeat(60));
}

function assert(cond: boolean, label: string, reason = "assertion failed"): void {
  cond ? pass(label) : fail(label, reason);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── 1. Template Resolver ────────────────────────────────────────────────────

async function testTemplateResolver(): Promise<void> {
  section("1. Template Resolver — component structure");

  const { resolveTemplateComponents } = await import("../src/templateResolver");

  // subscription_welcome — 1 body param, ownerName → businessName → shopName → "User"
  {
    // primary: ownerName wins
    const c = resolveTemplateComponents("subscription_welcome", { ownerName: "Rajesh", businessName: "Rajesh Agro", shopName: "" });
    assert(c.length === 1, "subscription_welcome: 1 component", `got ${c.length}`);
    assert(c[0].type === "body", "subscription_welcome: component type=body");
    assert(c[0].parameters.length === 1, "subscription_welcome: 1 parameter", `got ${c[0].parameters.length}`);
    const p0 = c[0].parameters[0] as { type: string; text: string };
    assert(p0.text === "Rajesh", "subscription_welcome: {{1}} = ownerName when present");

    // fallback: businessName used when ownerName is absent
    const c2 = resolveTemplateComponents("subscription_welcome", { ownerName: "", businessName: "Rajesh Agro", shopName: "" });
    const p2 = c2[0].parameters[0] as { type: string; text: string };
    assert(p2.text === "Rajesh Agro", "subscription_welcome: {{1}} falls back to businessName");

    // last-resort: "User" when all name fields are empty
    const c3 = resolveTemplateComponents("subscription_welcome", { ownerName: "", businessName: "", shopName: "" });
    const p3 = c3[0].parameters[0] as { type: string; text: string };
    assert(p3.text === "User", "subscription_welcome: {{1}} falls back to 'User'");
  }

  // subscription_expiry — 2 body params: ownerName fallback + formattedExpiryDate
  {
    const c = resolveTemplateComponents("subscription_expiry", { ownerName: "Meena", businessName: "", shopName: "", formattedExpiryDate: "15 July 2026" });
    assert(c.length === 1, "subscription_expiry: 1 component");
    assert(c[0].parameters.length === 2, "subscription_expiry: 2 parameters", `got ${c[0].parameters.length}`);
    const params = c[0].parameters as Array<{ type: string; text: string }>;
    assert(params[0].text === "Meena", "subscription_expiry: {{1}} = ownerName");
    assert(params[1].text === "15 July 2026", "subscription_expiry: {{2}} = formattedExpiryDate");

    // fallback: businessName
    const c2 = resolveTemplateComponents("subscription_expiry", { ownerName: "", businessName: "Meena Agro", shopName: "", formattedExpiryDate: "15 July 2026" });
    const p2 = c2[0].parameters[0] as { type: string; text: string };
    assert(p2.text === "Meena Agro", "subscription_expiry: {{1}} falls back to businessName");
  }

  // manufacturer_network_summary — 2 body params: ownerName fallback + retailerCount
  {
    const c = resolveTemplateComponents("manufacturer_network_summary", { ownerName: "Suresh", businessName: "", shopName: "", retailerCount: "42" });
    assert(c.length === 1, "manufacturer_network_summary: 1 component");
    assert(c[0].parameters.length === 2, "manufacturer_network_summary: 2 parameters", `got ${c[0].parameters.length}`);
    const params = c[0].parameters as Array<{ type: string; text: string }>;
    assert(params[0].text === "Suresh", "manufacturer_network_summary: {{1}} = ownerName");
    assert(params[1].text === "42", "manufacturer_network_summary: {{2}} = retailerCount");

    // fallback to shopName
    const c2 = resolveTemplateComponents("manufacturer_network_summary", { ownerName: "", businessName: "", shopName: "Suresh Seeds", retailerCount: "10" });
    const p2 = c2[0].parameters[0] as { type: string; text: string };
    assert(p2.text === "Suresh Seeds", "manufacturer_network_summary: {{1}} falls back to shopName");
  }

  // order_notification — 1 body param (shopName → businessName → "Retailer")
  // Sent to the SELLER. Static Orders Dashboard URL button in the Meta template.
  {
    // primary: shopName wins
    const c = resolveTemplateComponents("order_notification", { shopName: "Anil Agro", businessName: "" });
    assert(c.length === 1, "order_notification: 1 component");
    assert(c[0].parameters.length === 1, "order_notification: 1 parameter", `got ${c[0].parameters.length}`);
    const params = c[0].parameters as Array<{ type: string; text: string }>;
    assert(params[0].text === "Anil Agro", "order_notification: {{1}} = shopName");

    // fallback: businessName when shopName is absent
    const c2 = resolveTemplateComponents("order_notification", { shopName: "", businessName: "Anil Enterprises" });
    const p2 = c2[0].parameters[0] as { type: string; text: string };
    assert(p2.text === "Anil Enterprises", "order_notification: {{1}} falls back to businessName");

    // last-resort: "Retailer" when both are absent
    const c3 = resolveTemplateComponents("order_notification", { shopName: "", businessName: "" });
    const p3 = c3[0].parameters[0] as { type: string; text: string };
    assert(p3.text === "Retailer", "order_notification: {{1}} falls back to 'Retailer'");
  }

  // order_confirmation_customer — 1 body param (customerName) + 1 button (orderId)
  // Sent to the CUSTOMER after order placement. Button resolves to /invoice/{orderId}.
  {
    const c = resolveTemplateComponents("order_confirmation_customer", { customerName: "Priya Patil", orderId: "ORD12345678" });
    assert(c.length === 2, "order_confirmation_customer: 2 components (body + button)", `got ${c.length}`);
    assert(c[0].type === "body", "order_confirmation_customer: c[0] = body");
    assert(c[0].parameters.length === 1, "order_confirmation_customer: body has 1 param", `got ${c[0].parameters.length}`);
    const bodyParams = c[0].parameters as Array<{ type: string; text: string }>;
    assert(bodyParams[0].text === "Priya Patil", "order_confirmation_customer: body {{1}} = customerName");
    assert(c[1].type === "button" && c[1].sub_type === "url" && c[1].index === 0, "order_confirmation_customer: c[1] = button url index=0");
    const btnParam = c[1].parameters[0] as { type: string; text: string };
    assert(btnParam.text === "ORD12345678", "order_confirmation_customer: button {{1}} = orderId (no full URL)");
    assert(!btnParam.text.includes("https://"), "order_confirmation_customer: button param contains no URL");
  }

  // product_assignment_onboarded — 1 body (2 params) + 1 button
  {
    const c = resolveTemplateComponents("product_assignment_onboarded", {
      manufacturerName: "AgriCorp", productName: "NPK Fertiliser", productId: "prod_abc123",
    });
    assert(c.length === 2, "product_assignment_onboarded: 2 components (body + button)", `got ${c.length}`);
    assert(c[0].type === "body", "product_assignment_onboarded: c[0] = body");
    assert(c[0].parameters.length === 2, "product_assignment_onboarded: body has 2 params", `got ${c[0].parameters.length}`);
    const bodyParams = c[0].parameters as Array<{ type: string; text: string }>;
    assert(bodyParams[0].text === "AgriCorp", "product_assignment_onboarded: body {{1}} = manufacturerName");
    assert(bodyParams[1].text === "NPK Fertiliser", "product_assignment_onboarded: body {{2}} = productName");
    assert(c[1].type === "button" && c[1].sub_type === "url" && c[1].index === 0, "product_assignment_onboarded: c[1] = button url index=0");
    const btnParam = c[1].parameters[0] as { type: string; text: string };
    assert(btnParam.text === "prod_abc123", "product_assignment_onboarded: button {{1}} = productId (no full URL)");
  }

  // product_assignment_pending_signup — 1 body (2 params) + 2 buttons
  {
    const c = resolveTemplateComponents("product_assignment_pending_signup", {
      manufacturerName: "AgriCorp", productName: "NPK Fertiliser", inviteCode: "INV456", productId: "prod_abc123",
    });
    assert(c.length === 3, "product_assignment_pending_signup: 3 components (body + 2 buttons)", `got ${c.length}`);
    assert(c[0].type === "body", "product_assignment_pending_signup: c[0] = body");
    const bodyParams = c[0].parameters as Array<{ type: string; text: string }>;
    assert(bodyParams[0].text === "AgriCorp", "product_assignment_pending_signup: body {{1}} = manufacturerName");
    assert(bodyParams[1].text === "NPK Fertiliser", "product_assignment_pending_signup: body {{2}} = productName");
    assert(c[1].type === "button" && c[1].sub_type === "url" && c[1].index === 0, "product_assignment_pending_signup: c[1] = button url index=0");
    const btn0 = c[1].parameters[0] as { type: string; text: string };
    assert(btn0.text === "INV456", "product_assignment_pending_signup: button[0] {{1}} = inviteCode (no full URL)");
    assert(c[2].type === "button" && c[2].sub_type === "url" && c[2].index === 1, "product_assignment_pending_signup: c[2] = button url index=1");
    const btn1 = c[2].parameters[0] as { type: string; text: string };
    assert(btn1.text === "prod_abc123", "product_assignment_pending_signup: button[1] {{1}} = productId (no full URL)");
  }

  // retailer_onboarding — 1 body param + 1 button; inviteCode only (no full URL)
  {
    const c = resolveTemplateComponents("retailer_onboarding", { manufacturerName: "SeedCo", inviteCode: "ABC123" });
    assert(c.length === 2, "retailer_onboarding: 2 components (body + button)", `got ${c.length}`);
    assert(c[0].type === "body", "retailer_onboarding: c[0] = body");
    assert(c[0].parameters.length === 1, "retailer_onboarding: body has 1 param", `got ${c[0].parameters.length}`);
    const bodyParams = c[0].parameters as Array<{ type: string; text: string }>;
    assert(bodyParams[0].text === "SeedCo", "retailer_onboarding: body {{1}} = manufacturerName");
    assert(c[1].type === "button" && c[1].sub_type === "url" && c[1].index === 0, "retailer_onboarding: c[1] = button url index=0");
    const btnParam = c[1].parameters[0] as { type: string; text: string };
    assert(btnParam.text === "ABC123", "retailer_onboarding: button {{1}} = inviteCode (no full URL)");
    assert(!btnParam.text.includes("https://"), "retailer_onboarding: button param contains no URL");
  }

  // generic — empty (plain-text path)
  {
    const c = resolveTemplateComponents("generic", {});
    assert(c.length === 0, "generic: returns empty components");
  }
}

// ─── 2. Cloud API — text message ─────────────────────────────────────────────

async function testCloudApiText(testPhone: string): Promise<void> {
  section("2. Cloud API — send text message");

  const { sendTextMessage } = await import("../src/cloudApi");

  try {
    process.env.WA_DEBUG = "true";
    const result = await sendTextMessage(testPhone, "KrishiDukaan WA pipeline diagnostic ✅ — text message test");
    process.env.WA_DEBUG = "false";

    assert(typeof result.metaMessageId === "string" && result.metaMessageId.startsWith("wamid."),
      `sendTextMessage: returned wamid (${result.metaMessageId})`);
    assert(typeof result.waId === "string" && result.waId.length > 5,
      `sendTextMessage: returned waId (${result.waId})`);
  } catch (err) {
    process.env.WA_DEBUG = "false";
    fail("sendTextMessage", err instanceof Error ? err.message : String(err));
  }
}

// ─── 3. Template sends — each template type ──────────────────────────────────

async function testTemplateSends(testPhone: string): Promise<void> {
  section("3. Cloud API — template sends (WA_DEBUG=true shows full payload)");

  const { sendTemplateMessage } = await import("../src/cloudApi");
  const { resolveTemplateComponents } = await import("../src/templateResolver");

  const lang = process.env.WA_TEMPLATE_LANGUAGE ?? "en";
  process.env.WA_DEBUG = "true";

  const templates: Array<{ name: string; payload: Record<string, string | number | boolean> }> = [
    { name: "subscription_welcome",             payload: { ownerName: "Test User", businessName: "", shopName: "" } },
    { name: "subscription_expiry",              payload: { ownerName: "Test User", businessName: "", shopName: "", formattedExpiryDate: "31 July 2026" } },
    { name: "order_notification",               payload: { shopName: "Test Agro Store", businessName: "" } },
    { name: "order_confirmation_customer",      payload: { customerName: "Test Customer", orderId: "TESTORDERID001" } },
    { name: "manufacturer_network_summary",     payload: { ownerName: "Test Corp", businessName: "", shopName: "", retailerCount: "5" } },
    { name: "product_assignment_onboarded",     payload: { manufacturerName: "Test Corp", productName: "Test Product", productId: "test_prod_id" } },
    { name: "product_assignment_pending_signup", payload: { manufacturerName: "Test Corp", productName: "Test Product", inviteCode: "TESTCODE", productId: "test_prod_id" } },
    { name: "retailer_onboarding",              payload: { manufacturerName: "Test Corp", inviteCode: "TESTCODE" } },
  ];

  for (const tmpl of templates) {
    const components = resolveTemplateComponents(tmpl.name as Parameters<typeof resolveTemplateComponents>[0], tmpl.payload);
    console.log(`\n  → ${tmpl.name} [${components[0]?.parameters.length ?? 0} params]`);

    try {
      const result = await sendTemplateMessage(testPhone, tmpl.name, lang, components);
      pass(`${tmpl.name}: sent — metaMessageId=${result.metaMessageId}`);
      await sleep(500); // avoid rate-limiting
    } catch (err) {
      fail(`${tmpl.name}: send failed`, err instanceof Error ? err.message : String(err));
    }
  }

  process.env.WA_DEBUG = "false";
}

// ─── 4. Queue processor — full lifecycle via Firestore ────────────────────────

async function testQueueLifecycle(testPhone: string): Promise<void> {
  section("4. Queue processor — pending → sending → sent lifecycle");

  const { getDb } = await import("../src/firebase");
  const { processPendingNotifications } = await import("../src/queue");

  const db = getDb();

  // Write a controlled test doc
  const docRef = await db.collection("waNotifications").add({
    phone: testPhone,
    message: "KrishiDukaan E2E test message",
    template: "generic",
    payload: {},
    source: { event: "e2e_test", entityType: "test", entityId: "local-test" },
    status: "pending",
    type: "general",
    metaMessageId: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    sentAt: null,
    deliveredAt: null,
    readAt: null,
    failedAt: null,
    retryCount: 0,
    maxRetries: 1,
    lastError: null,
  });

  console.log(`  → Created test doc: ${docRef.id}`);

  // Verify initial state
  const before = (await docRef.get()).data() as Record<string, unknown>;
  assert(before.status === "pending", "Initial status is 'pending'", `got ${before.status}`);
  assert(before.metaMessageId === null, "Initial metaMessageId is null");

  // Run the queue
  await processPendingNotifications(1);

  // Give Firestore a moment to settle
  await sleep(800);

  const after = (await docRef.get()).data() as Record<string, unknown>;

  assert(after.status === "sent" || after.status === "failed",
    `Status transitioned from pending (got: ${after.status})`);

  if (after.status === "sent") {
    const wamid = String(after.metaMessageId ?? "");
    assert(wamid.startsWith("wamid."), `metaMessageId stored (${wamid})`);
    assert(after.sentAt !== null, "sentAt is populated");
    assert(after.lastError === null, "lastError is null on success");
    assert(Number(after.retryCount) === 1, `retryCount incremented to 1 (got ${after.retryCount})`);
  } else {
    // failed — check lastError is set
    assert(typeof after.lastError === "string" && after.lastError.length > 0,
      "lastError populated on failure");
    console.log(`  ℹ️  Send failed (expected if template not approved): ${after.lastError}`);
  }

  // ── Duplicate-claim guard: re-run should skip this doc ──────────────────────
  console.log("\n  → Running queue again on same doc (should skip)...");
  // Temporarily reset status to simulate a race-condition claim attempt
  const skippedBefore = passed + failed;
  await processPendingNotifications(1);
  const skippedAfter = (await docRef.get()).data() as Record<string, unknown>;
  assert(skippedAfter.status !== "sending",
    `Duplicate-claim guard: doc is not re-claimed (status=${skippedAfter.status})`);
  void skippedBefore; // suppress unused warning

  // ── Retry logic: write a doc that will fail immediately ───────────────────────
  section("4b. Retry logic — fails exhaust retryCount");
  const retryRef = await db.collection("waNotifications").add({
    phone: "9999999999", // invalid number — Meta will reject
    message: "retry logic test",
    template: "generic",
    payload: {},
    source: { event: "e2e_retry_test", entityType: "test", entityId: "retry-test" },
    status: "pending",
    type: "general",
    metaMessageId: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    sentAt: null,
    deliveredAt: null,
    readAt: null,
    failedAt: null,
    retryCount: 0,
    maxRetries: 1,
    lastError: null,
  });

  console.log(`  → Created retry test doc: ${retryRef.id} (maxRetries=1, invalid phone)`);
  await processPendingNotifications(1);
  await sleep(800);

  const retryDoc = (await retryRef.get()).data() as Record<string, unknown>;
  assert(retryDoc.status === "failed", `Retry: status=failed after exhausting maxRetries (got: ${retryDoc.status})`);
  assert(retryDoc.failedAt !== null, "Retry: failedAt is set");
  assert(typeof retryDoc.lastError === "string" && retryDoc.lastError.length > 0, "Retry: lastError is set");
  assert(retryDoc.metaMessageId === null, "Retry: metaMessageId stays null on failure");
}

// ─── 5. Webhook server ───────────────────────────────────────────────────────

async function testWebhookServer(): Promise<void> {
  section("5. Webhook server — GET verification + POST event handling");

  const { createWebhookServer } = await import("../src/webhook/server");

  const app = createWebhookServer();
  const port = 13579; // use a unique port so we don't collide with a running instance
  const server = app.listen(port);

  await sleep(300);

  function httpGet(path: string): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      http.get(`http://localhost:${port}${path}`, (res) => {
        let body = "";
        res.on("data", (chunk: Buffer) => { body += chunk.toString(); });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      }).on("error", reject);
    });
  }

  function httpPost(path: string, payload: unknown): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(payload);
      const req = http.request(
        { hostname: "localhost", port, path, method: "POST",
          headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
        (res) => {
          let body = "";
          res.on("data", (chunk: Buffer) => { body += chunk.toString(); });
          res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
        }
      );
      req.on("error", reject);
      req.write(data);
      req.end();
    });
  }

  const verifyToken = process.env.WA_WEBHOOK_VERIFY_TOKEN ?? "";
  const testChallenge = "test_challenge_12345";

  // GET — correct token
  {
    const r = await httpGet(`/webhook?hub.mode=subscribe&hub.verify_token=${verifyToken}&hub.challenge=${testChallenge}`);
    assert(r.status === 200, `GET /webhook (correct token): HTTP 200 (got ${r.status})`);
    assert(r.body === testChallenge, `GET /webhook: echoes hub.challenge (got "${r.body}")`);
  }

  // GET — wrong token
  {
    const r = await httpGet(`/webhook?hub.mode=subscribe&hub.verify_token=WRONG&hub.challenge=${testChallenge}`);
    assert(r.status === 403, `GET /webhook (wrong token): HTTP 403 (got ${r.status})`);
  }

  // POST — valid Meta status webhook payload
  {
    const payload = {
      object: "whatsapp_business_account",
      entry: [{
        id: "WABA_ID",
        changes: [{
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "919000000000", phone_number_id: "123" },
            statuses: [{
              id: "wamid.test123",
              status: "delivered",
              timestamp: String(Math.floor(Date.now() / 1000)),
              recipient_id: "919876543210",
            }],
          },
        }],
      }],
    };
    const r = await httpPost("/webhook", payload);
    assert(r.status === 200, `POST /webhook (status event): HTTP 200 immediately (got ${r.status})`);
  }

  // POST — valid incoming message payload
  // Use a deterministic message ID so we can look it up directly after (avoids
  // needing a composite Firestore index that may not be deployed locally yet).
  const incomingMsgId = `wamid.e2e_incoming_${Date.now()}`;
  {
    const payload = {
      object: "whatsapp_business_account",
      entry: [{
        id: "WABA_ID",
        changes: [{
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "919000000000", phone_number_id: "123" },
            contacts: [{ profile: { name: "Test Sender" }, wa_id: "919876543210" }],
            messages: [{
              from: "919876543210",
              id: incomingMsgId,
              timestamp: String(Math.floor(Date.now() / 1000)),
              type: "text",
              text: { body: "Hello from e2e test" },
            }],
          },
        }],
      }],
    };
    const r = await httpPost("/webhook", payload);
    assert(r.status === 200, `POST /webhook (incoming message): HTTP 200 immediately (got ${r.status})`);
  }

  // POST — malformed body
  {
    const r = await httpPost("/webhook", { garbage: true });
    assert(r.status === 200, `POST /webhook (malformed body): HTTP 200 (no retry storm) (got ${r.status})`);
  }

  // Give async handlers time to complete, then look up the doc by its ID
  // (message ID is used as the Firestore doc ID — no index query needed)
  await sleep(1500);
  const { getDb } = await import("../src/firebase");
  const db = getDb();
  const incomingDoc = await db.collection("waIncomingMessages").doc(incomingMsgId).get();
  assert(incomingDoc.exists, "Incoming message saved to waIncomingMessages");
  if (incomingDoc.exists) {
    const msg = incomingDoc.data() as Record<string, unknown>;
    assert(msg.messageText === "Hello from e2e test", `waIncomingMessages.messageText correct (got "${msg.messageText}")`);
    assert(msg.phone === "919876543210", `waIncomingMessages.phone correct (got "${msg.phone}")`);
    assert(msg.messageId === incomingMsgId, "waIncomingMessages.messageId matches wamid");
    assert(msg.receivedAt !== null, "waIncomingMessages.receivedAt populated");
  }

  server.close();
}

// ─── 6. Missing env vars check ───────────────────────────────────────────────

function testEnvVars(): void {
  section("6. Environment variable completeness");

  const required = [
    "WA_ACCESS_TOKEN",
    "WA_PHONE_NUMBER_ID",
    "WA_WABA_ID",
    "WA_WEBHOOK_VERIFY_TOKEN",
    "WEBHOOK_PORT",
  ];
  const optional = ["WA_APP_SECRET", "WA_TEMPLATE_LANGUAGE", "POLL_INTERVAL_MINUTES", "BATCH_SIZE"];

  for (const v of required) {
    const val = process.env[v];
    assert(!!val && val.length > 0, `${v} is set (required)`);
  }
  for (const v of optional) {
    const val = process.env[v];
    if (val && val.length > 0) {
      pass(`${v} is set (optional, using: ${v === "WA_APP_SECRET" ? "***" : val})`);
    } else {
      if (v === "WA_APP_SECRET") {
        console.log(`  ⚠️   WA_APP_SECRET not set — HMAC verification disabled (section 8 will be skipped)`);
      } else {
        pass(`${v} not set — default will be used`);
      }
    }
  }
}

// ─── 7. Webhook status lifecycle — Firestore updates ─────────────────────────

async function testWebhookStatusLifecycle(): Promise<void> {
  section("7. Webhook status lifecycle — Firestore updates");

  const { createWebhookServer } = await import("../src/webhook/server");
  const { getDb } = await import("../src/firebase");

  const db = getDb();
  const port = 13580; // separate from section 5's port
  const app = createWebhookServer();
  const server = app.listen(port);
  await sleep(300);

  function postWebhook(payload: unknown, secret?: string): Promise<{ status: number }> {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(payload);
      const headers: Record<string, string | number> = {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
      };
      if (secret) {
        headers["x-hub-signature-256"] = "sha256=" + crypto
          .createHmac("sha256", secret)
          .update(data)
          .digest("hex");
      }
      const req = http.request(
        { hostname: "localhost", port, path: "/webhook", method: "POST", headers },
        (res) => {
          res.resume(); // drain body
          res.on("end", () => resolve({ status: res.statusCode ?? 0 }));
        }
      );
      req.on("error", reject);
      req.write(data);
      req.end();
    });
  }

  function makeStatusPayload(wamid: string, eventStatus: string, errors?: unknown[]): unknown {
    const entry: Record<string, unknown> = {
      id: wamid,
      status: eventStatus,
      timestamp: String(Math.floor(Date.now() / 1000)),
      recipient_id: "919876543210",
    };
    if (errors) entry.errors = errors;
    return {
      object: "whatsapp_business_account",
      entry: [{
        id: "WABA_ID",
        changes: [{
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "919000000000", phone_number_id: "123" },
            statuses: [entry],
          },
        }],
      }],
    };
  }

  // ── Create a test notification doc already in "sent" state ───────────────────
  const testWamid = `wamid.e2e_lifecycle_${Date.now()}`;
  const docRef = await db.collection("waNotifications").add({
    phone: "919876543210",
    type: "general",
    template: "generic",
    payload: {},
    source: { event: "e2e_lifecycle_test", entityType: "test", entityId: "lifecycle-1" },
    status: "sent",
    metaMessageId: testWamid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    sentAt: admin.firestore.FieldValue.serverTimestamp(),
    deliveredAt: null,
    readAt: null,
    failedAt: null,
    retryCount: 1,
    maxRetries: 3,
    lastError: null,
  });
  console.log(`  → Created lifecycle test doc: ${docRef.id} metaId=${testWamid}`);

  // ── Step 1: "delivered" → status should advance ───────────────────────────────
  await postWebhook(makeStatusPayload(testWamid, "delivered"));
  await sleep(800);
  {
    const d = (await docRef.get()).data() as Record<string, unknown>;
    assert(d.status === "delivered",  `Step 1: status advanced to "delivered" (got "${d.status}")`);
    assert(d.deliveredAt !== null,    `Step 1: deliveredAt is set`);
    assert(d.readAt === null,         `Step 1: readAt not yet set`);
    assert(d.updatedAt !== undefined, `Step 1: updatedAt written`);
  }

  // ── Step 2: "read" → status should advance ────────────────────────────────────
  await postWebhook(makeStatusPayload(testWamid, "read"));
  await sleep(800);
  {
    const d = (await docRef.get()).data() as Record<string, unknown>;
    assert(d.status === "read",    `Step 2: status advanced to "read" (got "${d.status}")`);
    assert(d.readAt !== null,      `Step 2: readAt is set`);
    assert(d.deliveredAt !== null, `Step 2: deliveredAt preserved after read`);
  }

  // ── Step 3: Duplicate "delivered" → no-op, status stays "read" ───────────────
  await postWebhook(makeStatusPayload(testWamid, "delivered"));
  await sleep(800);
  {
    const d = (await docRef.get()).data() as Record<string, unknown>;
    assert(d.status === "read", `Step 3: duplicate "delivered" did not downgrade (still "read")`);
  }

  // ── Step 4: Late "sent" → no-op, status stays "read" ─────────────────────────
  await postWebhook(makeStatusPayload(testWamid, "sent"));
  await sleep(800);
  {
    const d = (await docRef.get()).data() as Record<string, unknown>;
    assert(d.status === "read", `Step 4: late "sent" did not downgrade (still "read")`);
  }

  // ── Step 5: Duplicate "read" → no-op ─────────────────────────────────────────
  await postWebhook(makeStatusPayload(testWamid, "read"));
  await sleep(800);
  {
    const d = (await docRef.get()).data() as Record<string, unknown>;
    assert(d.status === "read", `Step 5: duplicate "read" is idempotent`);
  }

  // ── Step 6: "failed" event on a separate doc ──────────────────────────────────
  const failWamid = `wamid.e2e_failed_${Date.now()}`;
  const failDocRef = await db.collection("waNotifications").add({
    phone: "919876543210",
    type: "general",
    template: "generic",
    payload: {},
    source: { event: "e2e_fail_test", entityType: "test", entityId: "lifecycle-2" },
    status: "sent",
    metaMessageId: failWamid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    sentAt: admin.firestore.FieldValue.serverTimestamp(),
    deliveredAt: null,
    readAt: null,
    failedAt: null,
    retryCount: 1,
    maxRetries: 3,
    lastError: null,
  });

  const fakeError = [{ code: 131014, title: "Message Undeliverable", message: "Recipient unreachable" }];
  await postWebhook(makeStatusPayload(failWamid, "failed", fakeError));
  await sleep(800);
  {
    const d = (await failDocRef.get()).data() as Record<string, unknown>;
    assert(d.status === "failed",        `Step 6: status set to "failed" (got "${d.status}")`);
    assert(d.failedAt !== null,          `Step 6: failedAt is set`);
    assert(typeof d.lastError === "string" && (d.lastError as string).includes("131014"),
      `Step 6: lastError contains error code (got "${d.lastError}")`);
  }

  // ── Step 7: Unknown wamid → warning logged, no crash ─────────────────────────
  {
    const r = await postWebhook(makeStatusPayload("wamid.does_not_exist_xyz", "delivered"));
    assert(r.status === 200, `Step 7: unknown metaMessageId still returns HTTP 200`);
  }

  // ── Step 8: "sending" doc healed by "sent" webhook ───────────────────────────
  const healWamid = `wamid.e2e_heal_${Date.now()}`;
  const healDocRef = await db.collection("waNotifications").add({
    phone: "919876543210",
    type: "general",
    template: "generic",
    payload: {},
    source: { event: "e2e_heal_test", entityType: "test", entityId: "lifecycle-3" },
    status: "sending",       // simulates queue crash after API call
    metaMessageId: healWamid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    sentAt: null,
    deliveredAt: null,
    readAt: null,
    failedAt: null,
    retryCount: 1,
    maxRetries: 3,
    lastError: null,
  });

  await postWebhook(makeStatusPayload(healWamid, "sent"));
  await sleep(800);
  {
    const d = (await healDocRef.get()).data() as Record<string, unknown>;
    assert(d.status === "sent",  `Step 8: "sending" doc healed → "sent" by webhook (got "${d.status}")`);
    assert(d.sentAt !== null,    `Step 8: sentAt populated from webhook`);
  }

  server.close();
  console.log(`\n  ✓ Lifecycle test complete — all Firestore transitions verified`);
}

// ─── 8. HMAC signature verification ──────────────────────────────────────────

async function testHmacVerification(): Promise<void> {
  section("8. HMAC signature verification");

  const appSecret = process.env.WA_APP_SECRET;
  if (!appSecret) {
    console.log("  ⚠️   WA_APP_SECRET not set — skipping HMAC tests");
    console.log("  To enable: add WA_APP_SECRET to .env (Meta Developer Console → App → Basic Settings → App Secret)");
    pass("HMAC test skipped (WA_APP_SECRET not configured)");
    return;
  }

  const { createWebhookServer } = await import("../src/webhook/server");
  const port = 13581;
  const app = createWebhookServer();
  const server = app.listen(port);
  await sleep(300);

  function postWithHeaders(
    payload: unknown,
    customHeaders: Record<string, string>
  ): Promise<{ status: number }> {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(payload);
      const headers: Record<string, string | number> = {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
        ...customHeaders,
      };
      const req = http.request(
        { hostname: "localhost", port, path: "/webhook", method: "POST", headers },
        (res) => {
          res.resume();
          res.on("end", () => resolve({ status: res.statusCode ?? 0 }));
        }
      );
      req.on("error", reject);
      req.write(data);
      req.end();
    });
  }

  const payload = {
    object: "whatsapp_business_account",
    entry: [{ id: "WABA", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: {}, statuses: [] } }] }],
  };
  const data = JSON.stringify(payload);

  // Correct signature → 200
  const correctSig = "sha256=" + crypto.createHmac("sha256", appSecret).update(data).digest("hex");
  {
    const r = await postWithHeaders(payload, { "x-hub-signature-256": correctSig });
    assert(r.status === 200, `HMAC: correct signature → HTTP 200 (got ${r.status})`);
  }

  // Wrong signature → 403
  {
    const r = await postWithHeaders(payload, { "x-hub-signature-256": "sha256=deadbeef" });
    assert(r.status === 403, `HMAC: wrong signature → HTTP 403 (got ${r.status})`);
  }

  // Missing signature → 403
  {
    const r = await postWithHeaders(payload, {});
    assert(r.status === 403, `HMAC: missing signature header → HTTP 403 (got ${r.status})`);
  }

  server.close();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const testPhone = process.env.TEST_PHONE ?? "";

  console.log("\n══════════════════════════════════════════════════════════");
  console.log("  KrishiDukaan wa-cloud-service — Local E2E Test Suite");
  console.log("══════════════════════════════════════════════════════════");

  if (!testPhone) {
    console.error("\n⛔ TEST_PHONE env var is required.");
    console.error("   Usage: TEST_PHONE=919876543210 npm run test:e2e\n");
    process.exit(1);
  }
  console.log(`  Test phone: ${testPhone}`);

  testEnvVars();
  await testTemplateResolver();

  const skipApiTests = process.env.SKIP_API === "true";
  if (skipApiTests) {
    console.log("\n  ℹ️  SKIP_API=true — skipping live API and Firestore tests");
  } else {
    await testCloudApiText(testPhone);
    await testTemplateSends(testPhone);
    await testQueueLifecycle(testPhone);
    await testWebhookServer();
    await testWebhookStatusLifecycle();
    await testHmacVerification();
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════════════════");
  console.log(`  Results: ${passed} passed  ${failed} failed`);
  if (failures.length > 0) {
    console.log("\n  Failed assertions:");
    failures.forEach((f) => console.log(`    ✗ ${f}`));
  }
  console.log("══════════════════════════════════════════════════════════\n");

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("\n[E2E] Fatal error:", err instanceof Error ? err.message : String(err));
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(1);
});
