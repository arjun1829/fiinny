import { defineSecret } from "firebase-functions/params";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest } from "firebase-functions/v2/https";
import type { Request, Response } from "express";

import {
  processSingleNotification,
  processPendingNotifications,
  resetStuckAndFailed,
} from "./wa/queue";
import { handleWebhookPayload } from "./wa/webhook/handler";
import { verifyHmacSignature } from "./wa/webhook/server";
import type { MetaWebhookPayload } from "./wa/types";

const REGION = "asia-south1";
const WEBHOOK_REGION = "us-central1";

// Declare secrets — Firebase resolves these from Secret Manager at deploy time
// and injects them as process.env.<NAME> in each function's execution context.
const WA_ACCESS_TOKEN         = defineSecret("WA_ACCESS_TOKEN");
const WA_PHONE_NUMBER_ID      = defineSecret("WA_PHONE_NUMBER_ID");
const WA_WABA_ID              = defineSecret("WA_WABA_ID");
const WA_APP_SECRET           = defineSecret("WA_APP_SECRET");
const WA_WEBHOOK_VERIFY_TOKEN = defineSecret("WA_WEBHOOK_VERIFY_TOKEN");
// Test-mode credentials — only injected when WA_PROVIDER=test.
// Store via: firebase secrets:set WA_TEST_ACCESS_TOKEN
const WA_TEST_ACCESS_TOKEN    = defineSecret("WA_TEST_ACCESS_TOKEN");
const WA_TEST_PHONE_NUMBER_ID = defineSecret("WA_TEST_PHONE_NUMBER_ID");
// WA_TEST_RECIPIENTS is non-sensitive (just verified phone numbers), set in functions/.env.


/**
 * Fires immediately when a new waNotifications doc is created.
 * Claims the doc via transaction (safe against at-least-once delivery)
 * and sends the WhatsApp message via the Cloud API.
 */
export const sendWaNotification = onDocumentCreated(
  {
    document: "waNotifications/{id}",
    region: REGION,
    secrets: [WA_ACCESS_TOKEN, WA_PHONE_NUMBER_ID, WA_WABA_ID, WA_TEST_ACCESS_TOKEN, WA_TEST_PHONE_NUMBER_ID],
  },
  async (event) => {
    await processSingleNotification(event.params.id);
  }
);

/**
 * Runs every 5 minutes. Resets stuck "sending" docs (function crashed mid-flight)
 * and permanently-failed docs, then processes them as fresh pending notifications.
 */
export const retryWaNotifications = onSchedule(
  {
    schedule: "every 5 minutes",
    region: REGION,
    timeoutSeconds: 120,
    memory: "256MiB",
    secrets: [WA_ACCESS_TOKEN, WA_PHONE_NUMBER_ID, WA_WABA_ID, WA_TEST_ACCESS_TOKEN, WA_TEST_PHONE_NUMBER_ID],
  },
  async () => {
    await resetStuckAndFailed(25);
    await processPendingNotifications(25);
  }
);

/**
 * HTTPS webhook receiver for Meta delivery status events and incoming messages.
 *
 * GET  /webhook  — hub verification (called once when registering the URL in Meta Console)
 * POST /webhook  — delivery receipts (sent/delivered/read/failed) and incoming messages
 *
 * Responds 200 immediately before processing so Meta never sees a timeout.
 * minInstances:1 keeps the function warm to eliminate cold-start latency on the
 * webhook path (Meta retries for 7 days but a cold start adds visible lag).
 */
export const webhookReceiver = onRequest(
  {
    region: WEBHOOK_REGION,
    timeoutSeconds: 60,
    memory: "256MiB",
    secrets: [WA_APP_SECRET, WA_WEBHOOK_VERIFY_TOKEN],
  },
  (req: Request, res: Response): void => {
    if (req.method === "GET") {
      const mode      = req.query["hub.mode"]         as string | undefined;
      const token     = req.query["hub.verify_token"] as string | undefined;
      const challenge = req.query["hub.challenge"]    as string | undefined;

      const verifyToken = process.env.WA_WEBHOOK_VERIFY_TOKEN;
      if (!verifyToken) {
        console.error("[webhookReceiver] WA_WEBHOOK_VERIFY_TOKEN is not set");
        res.sendStatus(500);
        return;
      }

      if (mode === "subscribe" && token === verifyToken) {
        console.log("[webhookReceiver] Hub verification successful");
        res.status(200).send(challenge);
      } else {
        console.warn(`[webhookReceiver] Hub verification failed — mode="${mode}" token="${token}"`);
        res.sendStatus(403);
      }
      return;
    }

    if (req.method === "POST") {
      // Firebase Functions v2 attaches the raw body buffer to req.rawBody
      const rawBody: Buffer =
        (req as Request & { rawBody?: Buffer }).rawBody ??
        Buffer.from(JSON.stringify(req.body));

      if (!verifyHmacSignature(req, rawBody)) {
        console.warn("[webhookReceiver] Rejected POST — HMAC signature mismatch");
        res.sendStatus(403);
        return;
      }

      const payload = req.body as MetaWebhookPayload;
      if (!payload?.object) {
        res.sendStatus(200);
        return;
      }

      // Acknowledge before processing — ensures Meta gets 200 within its 20s window
      res.sendStatus(200);

      handleWebhookPayload(payload).catch((err) => {
        console.error(
          "[webhookReceiver] Unhandled error in handleWebhookPayload:",
          err instanceof Error ? err.message : String(err)
        );
      });
      return;
    }

    res.sendStatus(405);
  }
);
