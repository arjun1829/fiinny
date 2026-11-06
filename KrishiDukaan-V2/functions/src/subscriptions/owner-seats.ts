import * as admin from "firebase-admin";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";

/**
 * Keeps the seat snapshot on a seller's user doc — users/{phone}.totalSeats,
 * isPaid, subscriptionStatus — equal to what their subscriptions add up to
 * NOW. Admin Users, analytics "Seats purchased", the website profile and the
 * app all read that snapshot.
 *
 * It used to drift: buying or promoting a plan ADDED to totalSeats and expiry
 * never took the seats back off, so expired seats stayed counted forever.
 * Now it is recomputed from the subscriptions, never incremented:
 *  - on every subscription write (bought, edited, expired, cancelled), and
 *  - for every owner in the daily expiry run, which also repairs old data.
 *
 * A plan counts while subscriptionStatus is "active", it has started and its
 * expiryDate is in the future — the same rule as the seller dashboard
 * (app/dashboard/_lib/subscriptions-firestore.ts isSubscriptionActive) and
 * the admin page (app/lib/subscription-status.ts).
 *
 * Only users who HAVE subscription records are touched, and never admins, so
 * an account given access by hand without a plan keeps it.
 */

const REGION = "asia-south1";
const db = (): admin.firestore.Firestore => admin.firestore();

type Sub = admin.firestore.DocumentData;

function ms(v: unknown): number {
  if (!v) return 0;
  if (typeof (v as admin.firestore.Timestamp).toMillis === "function") return (v as admin.firestore.Timestamp).toMillis();
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Date.parse(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function isRunning(sub: Sub, now: number): boolean {
  if ((sub.subscriptionStatus ?? "active") !== "active") return false;
  const expiry = ms(sub.expiryDate);
  if (!expiry || expiry <= now) return false;
  const start = ms(sub.startDate);
  return !start || start <= now;
}

export type OwnerState = { totalSeats: number; isPaid: boolean; subscriptionStatus: "paid" | "expired" };

export function ownerState(subs: Sub[], now: number): OwnerState {
  const running = subs.filter((s) => isRunning(s, now));
  const seats = running.reduce((n, s) => n + (Number(s.seatsPurchased) || 0), 0);
  return running.length > 0
    ? { totalSeats: seats, isPaid: true, subscriptionStatus: "paid" }
    : { totalSeats: 0, isPaid: false, subscriptionStatus: "expired" };
}

export function e164(v: unknown): string {
  const digits = String(v ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? `+91${digits.slice(-10)}` : "";
}

/** The user docs a subscription's owner may live under (new phone-keyed, legacy uid-keyed). */
function ownerDocIds(sub: Sub): string[] {
  const ids = [e164(sub.ownerPhone), e164(sub.ownerId), String(sub.ownerId ?? "").trim()];
  return Array.from(new Set(ids.filter(Boolean)));
}

/** uid → E164 phone via uidIndex, for plans saved before the phone was known. */
async function phonesForUids(uids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = Array.from(new Set(uids.filter((u) => u && !e164(u))));
  for (let i = 0; i < unique.length; i += 300) {
    const refs = unique.slice(i, i + 300).map((u) => db().collection("uidIndex").doc(u));
    const snaps = await db().getAll(...refs);
    snaps.forEach((snap) => {
      const phone = e164(snap.get("phone"));
      if (phone) out.set(snap.id, phone);
    });
  }
  return out;
}

/**
 * Writes [state] to the existing user docs among [userIds] whose snapshot
 * differs. Missing docs are skipped (never created) and admins left alone.
 */
async function applyState(userIds: string[], state: OwnerState, dryRun = false): Promise<number> {
  if (userIds.length === 0) return 0;
  const snaps = await db().getAll(...userIds.map((id) => db().collection("users").doc(id)));
  let written = 0;
  const batch = db().batch();
  for (const snap of snaps) {
    if (!snap.exists) continue;
    const u = snap.data() ?? {};
    if (u.role === "admin") continue;
    // An admin revoke leaves "cancelled"; that is as final as "expired", keep it.
    const status = !state.isPaid && u.subscriptionStatus === "cancelled" ? "cancelled" : state.subscriptionStatus;
    if (
      Number(u.totalSeats ?? 0) === state.totalSeats &&
      u.isPaid === state.isPaid &&
      u.subscriptionStatus === status
    ) continue;
    batch.update(snap.ref, {
      totalSeats: state.totalSeats,
      isPaid: state.isPaid,
      subscriptionStatus: status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    written++;
  }
  if (written && !dryRun) await batch.commit();
  return written;
}

/** Every subscription of the owner behind [sub], by phone and by uid. */
async function subsOfOwner(sub: Sub): Promise<Sub[]> {
  const phone = e164(sub.ownerPhone) || e164(sub.ownerId);
  const uid = String(sub.ownerId ?? "").trim();
  const col = db().collection("subscriptions");
  const snaps = await Promise.all([
    phone ? col.where("ownerPhone", "==", phone).get() : null,
    uid ? col.where("ownerId", "==", uid).get() : null,
  ]);
  const byId = new Map<string, Sub>();
  for (const s of snaps) for (const d of s?.docs ?? []) byId.set(d.id, d.data());
  return Array.from(byId.values());
}

export async function recomputeOwnerOf(sub: Sub): Promise<void> {
  // A uid-only plan: find the owner's phone so their phone-keyed plans and
  // user doc are included too.
  let probe = sub;
  if (!e164(sub.ownerPhone) && sub.ownerId && !e164(sub.ownerId)) {
    const phone = (await phonesForUids([String(sub.ownerId)])).get(String(sub.ownerId));
    if (phone) probe = { ...sub, ownerPhone: phone };
  }
  const subs = await subsOfOwner(probe);
  const ids = new Set<string>();
  for (const s of [probe, ...subs]) for (const id of ownerDocIds(s)) ids.add(id);
  await applyState(Array.from(ids), ownerState(subs, Date.now()));
}

export const syncOwnerSeatsOnSubscriptionWrite = onDocumentWritten(
  { document: "subscriptions/{subId}", region: REGION },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    const owners = [before, after].filter((d): d is Sub => !!d);
    // Recompute each distinct owner once (the owner rarely changes, but can).
    const seen = new Set<string>();
    for (const sub of owners) {
      const key = ownerDocIds(sub).join("|");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      try {
        await recomputeOwnerOf(sub);
      } catch (err) {
        logger.error("[ownerSeats] recompute failed", { subId: event.params.subId, err });
        throw err; // retried
      }
    }
  },
);

/**
 * Recomputes every owner from one read of all subscriptions; fixes whatever
 * drifted (including seats left behind by the old add-only logic).
 */
export async function reconcileAllOwnerSeats(opts: { dryRun?: boolean } = {}): Promise<{ owners: number; updated: number }> {
  const now = Date.now();
  const snap = await db().collection("subscriptions").get();
  const subs = snap.docs.map((d) => d.data());
  const uidPhones = await phonesForUids(subs.map((s) => String(s.ownerId ?? "")));

  // Group by owner with union–find: plans sharing a phone or a uid (directly
  // or through uidIndex) belong to one person.
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  const union = (a: string, b: string) => {
    for (const x of [a, b]) if (!parent.has(x)) parent.set(x, x);
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  const idsOfSub = subs.map((sub) => {
    const ids = ownerDocIds(sub);
    const viaIndex = uidPhones.get(String(sub.ownerId ?? ""));
    if (viaIndex && !ids.includes(viaIndex)) ids.push(viaIndex);
    ids.forEach((id) => union(ids[0], id));
    return ids;
  });
  const groups = new Map<string, { subs: Sub[]; ids: Set<string> }>();
  subs.forEach((sub, i) => {
    const ids = idsOfSub[i];
    if (ids.length === 0) return;
    const root = find(ids[0]);
    const g = groups.get(root) ?? { subs: [], ids: new Set<string>() };
    g.subs.push(sub);
    ids.forEach((id) => g.ids.add(id));
    groups.set(root, g);
  });

  let updated = 0;
  for (const g of Array.from(groups.values())) {
    updated += await applyState(Array.from(g.ids), ownerState(g.subs, now), opts.dryRun);
  }
  return { owners: groups.size, updated };
}
