import crypto from "crypto";
import express, { type Request, type Response } from "express";
import { handleWebhookPayload } from "./handler";
import type { MetaWebhookPayload } from "../types";

/**
 * Verifies the X-Hub-Signature-256 header that Meta attaches to every POST.
 *
 * Requires WA_APP_SECRET (Meta Developer Console → App → Basic Settings → App Secret).
 * When the env var is absent the function returns true and logs a one-time warning
 * at server start — this lets the service run in development without the secret,
 * but MUST be set in production so fake events cannot be injected.
 *
 * Uses `crypto.timingSafeEqual` to prevent timing-side-channel attacks.
 */
export function verifyHmacSignature(req: Request, rawBody: Buffer): boolean {
  const appSecret = process.env.WA_APP_SECRET;
  if (!appSecret) {
    // Permissive: no secret configured — accept all POSTs (warned at startup)
    return true;
  }

  const sigHeader = req.headers["x-hub-signature-256"] as string | undefined;
  if (!sigHeader) {
    console.warn("[Webhook] Rejected POST — missing X-Hub-Signature-256 header");
    return false;
  }

  const expected = "sha256=" + crypto
    .createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");

  try {
    // Buffers must be the same length for timingSafeEqual
    const a = Buffer.from(sigHeader);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function createWebhookServer(): express.Application {
  const app = express();

  if (!process.env.WA_APP_SECRET) {
    console.warn(
      "[Webhook] WA_APP_SECRET is not set — HMAC signature verification is DISABLED. " +
      "Set WA_APP_SECRET in .env to verify that webhook events are genuinely from Meta."
    );
  }

  // Parse JSON and capture the raw body buffer so verifyHmacSignature can use it.
  // express.json() by itself discards the raw bytes; the verify callback preserves them.
  app.use(
    express.json({
      verify: (_req: Request, _res: Response, buf: Buffer) => {
        (_req as Request & { rawBody?: Buffer }).rawBody = buf;
      },
    })
  );

  // ── GET /webhook — Meta hub verification ─────────────────────────────────────
  //
  // Meta sends this once when you register or update the webhook URL in the
  // Developer Console. The server must echo back hub.challenge when the
  // verify_token matches WA_WEBHOOK_VERIFY_TOKEN.
  app.get("/webhook", (req: Request, res: Response): void => {
    const mode      = req.query["hub.mode"]         as string | undefined;
    const token     = req.query["hub.verify_token"] as string | undefined;
    const challenge = req.query["hub.challenge"]    as string | undefined;

    const verifyToken = process.env.WA_WEBHOOK_VERIFY_TOKEN;
    if (!verifyToken) {
      console.error("[Webhook] WA_WEBHOOK_VERIFY_TOKEN is not set");
      res.sendStatus(500);
      return;
    }

    if (mode === "subscribe" && token === verifyToken) {
      console.log("[Webhook] Hub verification successful — challenge echoed");
      res.status(200).send(challenge);
      return;
    }

    console.warn(
      `[Webhook] Hub verification failed — mode="${mode}" token="${token}" (expected "${verifyToken}")`
    );
    res.sendStatus(403);
  });

  // ── POST /webhook — incoming events from Meta ─────────────────────────────────
  //
  // Meta retries delivery up to 20 times if it doesn't receive HTTP 200 within
  // 20 seconds. We respond 200 immediately and process asynchronously so slow
  // Firestore writes never block the acknowledgement.
  app.post("/webhook", (req: Request, res: Response): void => {
    const rawBody: Buffer =
      (req as Request & { rawBody?: Buffer }).rawBody ??
      Buffer.from(JSON.stringify(req.body));

    // HMAC verification — rejects requests not signed by Meta
    if (!verifyHmacSignature(req, rawBody)) {
      console.warn("[Webhook] Rejected POST — HMAC signature mismatch");
      res.sendStatus(403);
      return;
    }

    const payload = req.body as MetaWebhookPayload;

    if (!payload?.object) {
      console.warn("[Webhook] Received POST with missing `object` field — ignoring");
      // Return 200 so Meta doesn't keep retrying a permanently malformed payload
      res.sendStatus(200);
      return;
    }

    // Acknowledge before processing — ensures Meta gets 200 within its timeout
    res.sendStatus(200);

    // Process asynchronously — errors here are logged but don't affect the response
    handleWebhookPayload(payload).catch((err) => {
      console.error(
        "[Webhook] Unhandled error in handleWebhookPayload:",
        err instanceof Error ? err.message : String(err)
      );
    });
  });

  return app;
}

export function startWebhookServer(port: number): void {
  const app = createWebhookServer();
  app.listen(port, () => {
    console.log(`[Webhook] Server listening on port ${port}`);
  });
}
