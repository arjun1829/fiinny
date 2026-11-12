import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

/**
 * Nightly Firestore backup at 2:00 AM IST (20:30 UTC)
 * Region pinned to us-central1 (org policy allows it). Explicit so the CLI can
 * reconcile the deployed function unambiguously — without a region it defaulted
 * to us-central1 but the deployed copy exists in multiple regions, which blocks
 * `firebase deploy` codebase analysis for every function.
 */
export const dailyFirestoreBackup = onSchedule(
  {
    schedule: "30 20 * * *",
    timeZone: "Asia/Kolkata",
    region: "us-central1",
    memory: "256MiB",
    timeoutSeconds: 120,
  },
  async () => {
    const db = getFirestore();
    const today = new Date().toISOString().slice(0, 10);
    try {
      await db.collection("systemLogs").add({
        type: "backup_started", date: today, timestamp: new Date(), status: "running",
      });
      const collections = ["tenants", "paymentLinks_public", "users"];
      const storage = getStorage();
      const bucket = storage.bucket();
      for (const col of collections) {
        const snap = await db.collection(col).limit(5000).get();
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const file = bucket.file(`backups/daily/${today}/${col}.json`);
        await file.save(JSON.stringify(data, null, 2), { contentType: "application/json" });
        console.log(`[Backup] Exported ${col}: ${snap.size} docs`);
      }
      console.log(`[Backup] Completed for ${today}`);
    } catch (error) {
      console.error("[Backup] Failed:", error);
      await db.collection("systemLogs").add({
        type: "backup_failed", date: today, error: String(error), timestamp: new Date(),
      });
    }
  }
);

/**
 * Daily metrics at 11:59 PM IST
 */
export const dailyMetrics = onSchedule(
  {
    schedule: "29 18 * * *",
    timeZone: "Asia/Kolkata",
    region: "us-central1",
    memory: "256MiB",
  },
  async () => {
    const db = getFirestore();
    const today = new Date().toISOString().slice(0, 10);
    try {
      const tenantsSnap = await db.collection("tenants").get();
      let totalInvoicesToday = 0;
      let totalRevenueToday = 0;
      for (const tenant of tenantsSnap.docs) {
        const tenantId = tenant.id;
        const startOfDay = new Date(`${today}T00:00:00.000Z`);
        const invoicesSnap = await db
          .collection(`tenants/${tenantId}/invoices`)
          .where("createdAt", ">=", startOfDay)
          .get();
        const revenue = invoicesSnap.docs.reduce(
          (sum, d) => sum + (d.data().grandTotal || d.data().totalAmount || 0), 0
        );
        totalInvoicesToday += invoicesSnap.size;
        totalRevenueToday += revenue;
      }
      await db.doc(`metrics/daily/${today}/summary`).set({
        date: today, totalTenants: tenantsSnap.size,
        invoicesToday: totalInvoicesToday, revenueToday: totalRevenueToday,
        computedAt: new Date(),
      });
      console.log(`[Metrics] ${today}: ${totalInvoicesToday} invoices, ₹${totalRevenueToday}`);
    } catch (error) {
      console.error("[Metrics] Failed:", error);
    }
  }
);
