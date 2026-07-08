import "dotenv/config";
import cron from "node-cron";
import { processPendingNotifications } from "./queue";
import { startWebhookServer } from "./webhook/server";

const POLL_MINUTES = parseInt(process.env.POLL_INTERVAL_MINUTES ?? "1", 10);
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE ?? "10", 10);
const WEBHOOK_PORT = parseInt(process.env.WEBHOOK_PORT ?? "3000", 10);

async function main() {
  console.log("[Main] Starting KrishiDukaan WA Cloud service");
  console.log(`[Main] Poll interval: ${POLL_MINUTES} min | Batch: ${BATCH_SIZE}`);

  // Start webhook server for Meta delivery receipts and incoming messages
  startWebhookServer(WEBHOOK_PORT);

  // No blocking QR scan — Cloud API is stateless. Run immediately on start.
  await processPendingNotifications(BATCH_SIZE);

  const schedule = POLL_MINUTES === 1 ? "* * * * *" : `*/${POLL_MINUTES} * * * *`;
  cron.schedule(schedule, async () => {
    try {
      await processPendingNotifications(BATCH_SIZE);
    } catch (err) {
      console.error(
        "[Main] Error in poll cycle:",
        err instanceof Error ? err.message : String(err)
      );
    }
  });

  console.log(`[Main] Cron running — polling every ${POLL_MINUTES} min`);
}

main().catch((err) => {
  console.error("[Main] Fatal startup error:", err);
  process.exit(1);
});
