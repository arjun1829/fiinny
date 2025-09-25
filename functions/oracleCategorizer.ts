// functions/src/oracleCategorizer.ts
import * as admin from "firebase-admin";
import { onDocumentCreated } from "firebase-functions/v2/firestore";

admin.apps.length ? admin.app() : admin.initializeApp();
const db = admin.firestore();

const ORACLE_URL = "https://minorapi.duckdns.org/extract";

// djb2 hash → matches your app's _docIdFromKey("ing_"+hex)
function djb2DocIdFromTxKey(txKey: string): string {
  let hash = 5381 >>> 0;
  for (let i = 0; i < txKey.length; i++) {
    hash = (((hash << 5) + hash) + txKey.charCodeAt(i)) >>> 0;
  }
  const hex = (hash & 0x7fffffff).toString(16);
  return `ing_${hex}`;
}

type IngestJob = {
  txKey: string;
  text: string;
  amount: number;
  currency?: string;
  timestamp?: number;  // ms epoch
  source: "sms" | "email" | "upi" | "manual" | string;
  status?: string;
  retries?: number;
};

export const onIngestJobCreate = onDocumentCreated(
  {
    document: "users/{userPhone}/ingest_jobs/{txKey}",
    region: "asia-south1",
    retry: false, // we track retries in Firestore
  },
  async (event) => {
    const userPhone = event.params.userPhone as string;
    const snap = event.data;
    if (!snap) return;

    const job = snap.data() as IngestJob;

    // idempotency / guard rails
    if (job.status === "done") return;
    if (!job?.txKey || !job?.text || typeof job?.amount !== "number") {
      await snap.ref.update({
        status: "failed",
        lastError: "Bad job payload (txKey/text/amount required)",
        checkedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return;
    }

    // find target doc (expense OR income) by hashed id
    const docId = djb2DocIdFromTxKey(job.txKey);
    const expRef = db.doc(`users/${userPhone}/expenses/${docId}`);
    const incRef = db.doc(`users/${userPhone}/incomes/${docId}`);
    const [expDoc, incDoc] = await Promise.all([expRef.get(), incRef.get()]);
    if (!expDoc.exists && !incDoc.exists) {
      await snap.ref.update({
        status: "failed",
        lastError: `Target doc not found for docId=${docId}`,
        checkedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return;
    }

    // mark processing
    await snap.ref.update({
      status: "processing",
      startedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // build request payload for Oracle
    const payload = {
      txKey: job.txKey,
      text: job.text,
      amount: job.amount,
      currency: job.currency || "INR",
      timestamp: job.timestamp
        ? new Date(job.timestamp).toISOString()
        : new Date().toISOString(),
      channel: job.source || "sms",
      locale: "en-IN",
      hints: { knownMerchants: ["Zomato", "Blinkit", "Swiggy", "Zepto", "Amazon", "Flipkart"] },
    };
    const body = JSON.stringify(payload);

    try {
      // 10s timeout so we don’t hang the trigger
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 10_000);

      const res = await fetch(ORACLE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: ac.signal,
      } as any).finally(() => clearTimeout(t));

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Oracle HTTP ${res.status} ${txt}`);
      }

      const out = (await res.json()) as {
        category?: string;
        subcategory?: string;
        merchant?: string;
        confidence?: number;
        model?: { name?: string; latencyMs?: number; version?: string };
      };

      const patch = {
        suggestedCategory: out.category ?? null,
        suggestedSubcategory: out.subcategory ?? null,
        suggestedMerchant: out.merchant ?? null,
        suggestedConfidence: out.confidence ?? null,
        suggestedBy: out.model?.name ?? "oracle-groq",
        suggestedLatencyMs: out.model?.latencyMs ?? null,
        suggestedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      const writes: Promise<any>[] = [];
      if (expDoc.exists) writes.push(expRef.set(patch, { merge: true }));
      if (incDoc.exists) writes.push(incRef.set(patch, { merge: true }));
      await Promise.all(writes);

      await snap.ref.update({
        status: "done",
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e: any) {
      const retries = (job.retries ?? 0) + 1;
      const maxRetries = 5;
      await snap.ref.update({
        status: retries >= maxRetries ? "failed" : "retrying",
        retries,
        lastError: String(e?.message || e),
        lastTriedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }
);
