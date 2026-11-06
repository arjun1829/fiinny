import * as admin from "firebase-admin";

/**
 * Exactly-once counter updates for totals documents kept by triggers.
 *
 * A trigger describes what a source doc adds to the totals (its
 * "contribution") before and after the write; the difference is applied as
 * FieldValue.increment()s. Triggers run at least once, so each event is
 * applied in a transaction together with a marker doc named after the event
 * id: a retried event finds its marker and does nothing.
 */

/** Totals one source doc adds: doc path → dotted field path → amount. */
export type Contribution = Map<string, Record<string, number>>;

const EVENTS = "statsEvents";
// Markers only need to outlive retries. Firestore can delete them via a TTL
// policy on statsEvents.expireAt (see the deploy guide); they are tiny either way.
const MARKER_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const db = (): admin.firestore.Firestore => admin.firestore();

/** YYYY-MM-DD in India time, the day the admin and seller dashboards bucket by. */
export function istDayKey(ms: number): string {
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Millis of a Firestore Timestamp, Date, epoch number or date string; 0 if none. */
export function millisOf(value: unknown): number {
  if (!value) return 0;
  if (typeof (value as admin.firestore.Timestamp).toMillis === "function") {
    return (value as admin.firestore.Timestamp).toMillis();
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : 0;
  }
  return 0;
}

/** A safe map key for a free-form value such as an order status. */
export function fieldKey(value: unknown, fallback = "unknown"): string {
  const key = String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 40);
  return key || fallback;
}

export function addTo(c: Contribution, docPath: string, field: string, amount: number): void {
  if (!amount || !Number.isFinite(amount)) return;
  const fields = c.get(docPath) ?? {};
  fields[field] = (fields[field] ?? 0) + amount;
  c.set(docPath, fields);
}

/** after − before, per doc and field, without zero entries. */
export function diffContributions(before: Contribution, after: Contribution): Contribution {
  const out: Contribution = new Map();
  for (const [path, fields] of Array.from(after)) for (const [f, v] of Object.entries(fields)) addTo(out, path, f, v);
  for (const [path, fields] of Array.from(before)) for (const [f, v] of Object.entries(fields)) addTo(out, path, f, -v);
  for (const [path, fields] of Array.from(out)) {
    for (const f of Object.keys(fields)) if (Math.abs(fields[f]) < 1e-9) delete fields[f];
    if (Object.keys(fields).length === 0) out.delete(path);
  }
  return out;
}

/** {"a.b": 1} → { a: { b: increment(1) } }, for set(..., { merge: true }). */
function incrementsOf(fields: Record<string, number>, extra: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...extra };
  for (const [path, amount] of Object.entries(fields)) {
    const parts = path.split(".");
    let node = out;
    for (const p of parts.slice(0, -1)) {
      node[p] = (node[p] as Record<string, unknown>) ?? {};
      node = node[p] as Record<string, unknown>;
    }
    node[parts[parts.length - 1]] = admin.firestore.FieldValue.increment(amount);
  }
  return out;
}

/**
 * Applies `delta` once per event. `scope` names the caller, since several
 * triggers can receive the same event (one write to orders fires each of
 * them with the same event id). `extra(docPath)` adds plain fields to each
 * written doc (e.g. its day and owner, so it can be queried).
 */
export async function applyOnce(
  scope: string,
  eventId: string,
  delta: Contribution,
  extra: (docPath: string) => Record<string, unknown> = () => ({}),
): Promise<boolean> {
  if (delta.size === 0) return false;
  const marker = db().collection(EVENTS).doc(`${scope}_${eventId}`.replace(/\//g, "_"));
  return db().runTransaction(async (tx) => {
    if ((await tx.get(marker)).exists) return false;
    for (const [path, fields] of Array.from(delta)) {
      tx.set(db().doc(path), {
        ...incrementsOf(fields, extra(path)),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    tx.set(marker, { expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + MARKER_TTL_MS) });
    return true;
  });
}
