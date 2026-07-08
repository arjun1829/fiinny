import "dotenv/config";
import cron from "node-cron";
import { getWhatsAppClient } from "./whatsapp";
import { processPendingNotifications } from "./queue";

const POLL_MINUTES = parseInt(process.env.POLL_INTERVAL_MINUTES ?? "1", 10);
const BATCH_SIZE   = parseInt(process.env.BATCH_SIZE ?? "10", 10);

async function main() {
  console.log("[Main] Starting KrishiDukaan WA service (POC)");
  console.log(`[Main] Poll interval: ${POLL_MINUTES} min | Batch: ${BATCH_SIZE}`);

  // Initialise WhatsApp client (blocks until QR is scanned on first run)
  await getWhatsAppClient();

  // Run once immediately after client is ready
  await processPendingNotifications(BATCH_SIZE);

  // Then on schedule
  const schedule = POLL_MINUTES === 1 ? "* * * * *" : `*/${POLL_MINUTES} * * * *`;
  cron.schedule(schedule, async () => {
    try {
      // getWhatsAppClient() returns immediately when the client is already
      // ready, and reinitializes it (with saved LocalAuth session, no QR
      // needed) when it has disconnected — giving the service automatic
      // recovery without a manual restart.
      await getWhatsAppClient();
      await processPendingNotifications(BATCH_SIZE);
    } catch (err) {
      console.error("[Main] Error in poll cycle:", err instanceof Error ? err.message : String(err));
    }
  });

  console.log(`[Main] Cron running — polling every ${POLL_MINUTES} min`);
}

main().catch((err) => {
  console.error("[Main] Fatal startup error:", err);
  process.exit(1);
});
