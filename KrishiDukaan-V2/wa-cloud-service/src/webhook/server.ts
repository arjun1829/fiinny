import express, { type Request, type Response } from "express";
import { handleWebhookPayload } from "./handler";
import type { MetaWebhookPayload } from "../types";

export function createWebhookServer(): express.Application {
  const app = express();

  // Parse JSON bodies; reject if Content-Type is wrong or body is malformed
  app.use(express.json());

  // ── GET /webhook — Meta hub verification ─────────────────────────────────────
  //
  // Meta sends this once when you register the webhook URL in the Developer
  // Console. It expects the server to echo back hub.challenge when the
  // verify token matches.
  app.get("/webhook", (req: Request, res: Response): void => {
    const mode = req.query["hub.mode"] as string | undefined;
    const token = req.query["hub.verify_token"] as string | undefined;
    const challenge = req.query["hub.challenge"] as string | undefined;

    const verifyToken = process.env.WA_WEBHOOK_VERIFY_TOKEN;
    if (!verifyToken) {
      console.error("[Webhook] WA_WEBHOOK_VERIFY_TOKEN is not set");
      res.sendStatus(500);
      return;
    }

    if (mode === "subscribe" && token === verifyToken) {
      console.log("[Webhook] Hub verification successful");
      res.status(200).send(challenge);
      return;
    }

    console.warn("[Webhook] Hub verification failed — token mismatch or wrong mode");
    res.sendStatus(403);
  });

  // ── POST /webhook — incoming events from Meta ─────────────────────────────────
  //
  // Meta retries delivery if it doesn't receive a 200 within 20 seconds.
  // We respond 200 immediately and process asynchronously to avoid timeouts
  // on slow Firestore writes.
  app.post("/webhook", (req: Request, res: Response): void => {
    const payload = req.body as MetaWebhookPayload;

    if (!payload?.object) {
      console.warn("[Webhook] Received malformed POST body — ignoring");
      // Still 200 to prevent Meta from retrying a bad payload indefinitely
      res.sendStatus(200);
      return;
    }

    // Acknowledge immediately
    res.sendStatus(200);

    // Process asynchronously — errors here don't affect the HTTP response
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
