import type { MetaWebhookPayload } from "../types";
import { applyStatusUpdate } from "./statusUpdater";
import { saveIncomingMessage } from "./incomingMessages";

/**
 * Processes a verified webhook payload from Meta.
 *
 * Meta batches multiple events (statuses, messages) inside a single POST.
 * This handler iterates all entries and changes, dispatching each event
 * to the appropriate handler without blocking the HTTP response.
 */
export async function handleWebhookPayload(
  payload: MetaWebhookPayload
): Promise<void> {
  if (payload.object !== "whatsapp_business_account") {
    console.warn("[Handler] Unexpected object type:", payload.object);
    return;
  }

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;

      const value = change.value;

      // Log full payload once per change for inspection during development
      console.log(
        "[Handler] Incoming change payload:",
        JSON.stringify(value, null, 2)
      );

      const contacts = value.contacts ?? [];

      // ── Status updates (delivery receipts) ─────────────────────────────────
      for (const status of value.statuses ?? []) {
        try {
          await applyStatusUpdate(status);
        } catch (err) {
          console.error(
            `[Handler] Failed to apply status update for ${status.id}:`,
            err instanceof Error ? err.message : String(err)
          );
        }
      }

      // ── Incoming customer messages ──────────────────────────────────────────
      for (const msg of value.messages ?? []) {
        try {
          await saveIncomingMessage(msg, contacts);
        } catch (err) {
          console.error(
            `[Handler] Failed to save incoming message ${msg.id}:`,
            err instanceof Error ? err.message : String(err)
          );
        }
      }
    }
  }
}
