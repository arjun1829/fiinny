import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

if (getApps().length === 0) initializeApp();
const db = getFirestore();

const ORACLE_URL = "https://minorapi.duckdns.org/extract";
const ORACLE_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 5;

/** Deterministic doc id (djb2 over txKey) – must match app side */
function djb2DocIdFromTxKey(txKey: string): string {
  let hash = 5381 >>> 0;
  for (let i = 0; i < txKey.length; i++) {
    hash = (((hash << 5) + hash) + txKey.charCodeAt(i)) >>> 0;
  }
  const hex = (hash & 0x7fffffff).toString(16);
  return `ing_${hex}`;
}

/** Job payload written by the app */
type IngestJob = {
  txKey: string;
  text: string;
  amount: number;
  currency?: string;
  timestamp?: number;  // ms epoch
  source: "sms" | "email" | "upi" | "manual" | string;
  status?: string;
  retries?: number;

  // optional routing hints
  userId?: string;                                 // == userPhone
  direction?: "debit" | "credit";
  docId?: string;
  docCollection?: "expenses" | "incomes";
  docPath?: string;                                // full path: users/{uid}/{collection}/{docId}
};

type OracleOut = {
  category?: string;
  subcategory?: string;
  merchant?: string;
  confidence?: number;
  model?: { name?: string; latencyMs?: number; version?: string };
};

// ---------- helpers ----------
function titleCase(s: string) {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function mapSynonyms(cat: string) {
  const key = (cat || "").toLowerCase();
  const map: Record<string, string> = {
    "food": "Food & Dining",
    "dining": "Food & Dining",
    "groceries": "Groceries",
    "grocery": "Groceries",
    "travel": "Travel",
    "transport": "Transport",
    "transportation": "Transport",
    "shopping": "Shopping",
    "rent": "Rent",
    "bills": "Bills",
  };
  return map[key] ?? titleCase(cat);
}

/** Permissive plain-text parser (if Oracle returns text) */
function parsePlainText(body: string, amount?: number): OracleOut {
  const lines = (body || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return {};
  const amtRe = amount ? new RegExp(`\\b${amount}\\b`) : null;

  // FIXED: removed extra ')'
  let line =
    (amtRe && lines.find((l) => amtRe.test(l))) ||
    lines.find((l) => l.includes("-")) ||
    lines[lines.length - 1];

  let cat = line as string;
  const dashIdx = (line as string).indexOf("-");
  if (dashIdx >= 0 && dashIdx < (line as string).length - 1) {
    cat = (line as string).slice(dashIdx + 1).trim();
  }
  return { category: mapSynonyms(cat) };
}

/** Tiny fallback mapper when model returns nothing */
function fallbackFromText(text: string): OracleOut {
  const t = text.toLowerCase();
  if (/agoda/.test(t)) return { category: "Travel", subcategory: "Hotel", merchant: "Agoda" };
  if (/uber/.test(t)) return { category: "Transport", subcategory: "Ride Hailing", merchant: "Uber" };
  if (/ola/.test(t)) return { category: "Transport", subcategory: "Ride Hailing", merchant: "Ola" };
  if (/zomato|swiggy|blinkit|zepto/.test(t)) return { category: "Food & Dining" };
  return {};
}
// --------------------------------

export const onIngestJobCreate = onDocumentCreated(
  { document: "users/{userPhone}/ingest_jobs/{txKey}", region: "asia-south1", retry: false },
  async (event) => {
    const userPhoneParam = event.params.userPhone as string;
    const snap = event.data;
    if (!snap) return;

    const job = snap.data() as IngestJob;

    if (job.status === "done") return;
    if (!job?.txKey || !job?.text || typeof job?.amount !== "number") {
      await snap.ref.update({
        status: "failed",
        lastError: "Bad job payload (txKey/text/amount required)",
        checkedAt: FieldValue.serverTimestamp(),
      });
      return;
    }

    // ---------- Resolve the exact tx document we must update ----------
    const uid = job.userId || userPhoneParam;
    let txRef = job.docPath ? db.doc(job.docPath) : null;

    if (!txRef) {
      const docId = job.docId || djb2DocIdFromTxKey(job.txKey);
      const prefer = job.docCollection;
      const candidates = prefer
        ? [db.doc(`users/${uid}/${prefer}/${docId}`)]
        : [db.doc(`users/${uid}/expenses/${docId}`), db.doc(`users/${uid}/incomes/${docId}`)];
      const snaps = await Promise.all(candidates.map((r) => r.get()));
      const idx = snaps.findIndex((s) => s.exists);
      if (idx === -1) {
        await snap.ref.update({
          status: "failed",
          lastError: `Target tx doc not found (uid=${uid})`,
          checkedAt: FieldValue.serverTimestamp(),
        });
        return;
      }
      txRef = candidates[idx];
    }
    // ------------------------------------------------------------------

    await snap.ref.update({ status: "processing", startedAt: FieldValue.serverTimestamp() });

    const payload = {
      txKey: job.txKey,
      text: job.text,
      amount: job.amount,
      currency: job.currency || "INR",
      timestamp: job.timestamp ? new Date(job.timestamp).toISOString() : new Date().toISOString(),
      channel: job.source || "sms",
      locale: "en-IN",
      hints: { knownMerchants: ["Zomato", "Blinkit", "Swiggy", "Zepto", "Amazon", "Flipkart"] },
    };

    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), ORACLE_TIMEOUT_MS);

      const res = await fetch(ORACLE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: ac.signal,
      } as any).finally(() => clearTimeout(t));

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Oracle HTTP ${res.status} ${txt}`);
      }

      const contentType = (res.headers.get("content-type") || "").toLowerCase();
      let out: OracleOut = {};
      if (contentType.includes("application/json")) {
        out = await res.json() as OracleOut;
        if (out.category) out.category = mapSynonyms(out.category);
        if (out.subcategory) out.subcategory = titleCase(out.subcategory);
      } else {
        const txt = await res.text();
        out = parsePlainText(txt, job.amount);
        out.model = { name: "oracle-text" };
      }

      if (!out.category && !out.merchant) {
        const fb = fallbackFromText(job.text);
        out = { ...fb, ...out };
      }

      const suggestedPatch = {
        suggestedCategory: out.category ?? null,
        suggestedSubcategory: out.subcategory ?? null,
        suggestedMerchant: out.merchant ?? null,
        suggestedConfidence: out.confidence ?? null,
        suggestedBy: out.model?.name ?? "oracle-groq",
        suggestedLatencyMs: out.model?.latencyMs ?? null,
        suggestedAt: FieldValue.serverTimestamp(),
      };

      const forcePatch: Record<string, any> = {};
      if (out.category) {
        forcePatch.category = out.category;
        forcePatch.categorySource = "oracle-auto";
      }
      if (out.merchant) forcePatch.merchant = out.merchant;

      await (txRef as FirebaseFirestore.DocumentReference).set(
        { ...suggestedPatch, ...forcePatch },
        { merge: true }
      );

      await snap.ref.update({ status: "done", completedAt: FieldValue.serverTimestamp() });
    } catch (e: any) {
      const retries = (job.retries ?? 0) + 1;
      await snap.ref.update({
        status: retries >= MAX_RETRIES ? "failed" : "retrying",
        retries,
        lastError: String(e?.message || e),
        lastTriedAt: FieldValue.serverTimestamp(),
      });
    }
  }
);
