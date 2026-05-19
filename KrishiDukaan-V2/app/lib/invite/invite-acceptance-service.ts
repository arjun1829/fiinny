/**
 * Firestore rules (suggested):
 *
 * - **Manufacturer dashboard:** `list`/`get` on `manufacturerRetailers` where `manufacturerId == request.auth.uid`.
 * - **Signup invite read:** allow query `where('inviteCode','==', code)` for authenticated users only if
 *   acceptable for your threat model; otherwise use a callable Cloud Function to validate and claim.
 * - **Claim update:** allow when `resource.data.status == 'invited'`, `resource.data.claimable == true`,
 *   `resource.data.retailerId` is empty, and after update `status` is `active`, `retailerId` is uid, `claimable` is `false`.
 */

import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../firebase";
import {
  mapInviteAcceptanceError,
  mapInviteSnapshot,
  precheckInviteForAcceptance,
  type ManufacturerRetailerInviteSnapshot,
} from "./invite-validation";

const COLLECTION = "manufacturerRetailers";

export async function findInviteByCode(
  inviteCode: string,
): Promise<ManufacturerRetailerInviteSnapshot | null> {
  const normalized = inviteCode.trim();
  if (!normalized) return null;

  const q = query(
    collection(db, COLLECTION),
    where("inviteCode", "==", normalized),
    limit(1),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0]!;
  return mapInviteSnapshot(d.id, d.data() as Record<string, unknown>);
}

export type AcceptInviteResult =
  | { ok: true; alreadyActive: boolean; backfillError?: string }
  | { ok: false; message: string };

/**
 * Activates manufacturer–retailer relationship when invite is pending and unclaimed.
 * Idempotent if the same user already claimed the invite.
 */
export async function acceptManufacturerInvite(params: {
  uid: string;
  inviteCode: string;
}): Promise<AcceptInviteResult> {
  const code = params.inviteCode.trim();
  if (!code) {
    return { ok: false, message: "Missing invite code." };
  }

  let initial: ManufacturerRetailerInviteSnapshot | null;
  try {
    initial = await findInviteByCode(code);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("permission") || msg.includes("insufficient")) {
      return { ok: false, message: "Permission error — Firestore rules not deployed yet. Ask your admin to run: firebase deploy --only firestore:rules" };
    }
    return { ok: false, message: "Could not look up invite code. Try again." };
  }
  const pre = precheckInviteForAcceptance(initial, params.uid);
  if (!pre.ok) {
    return { ok: false, message: mapInviteAcceptanceError((pre as { ok: false; reason: any }).reason) };
  }

  const ref = doc(db, COLLECTION, pre.docId);
  const wasAlreadyActive = initial?.status === "active" && initial.retailerId.trim() === params.uid;

  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists()) {
        throw new Error("invalid_code");
      }
      const row = mapInviteSnapshot(snap.id, snap.data() as Record<string, unknown>);
      const check = precheckInviteForAcceptance(row, params.uid);
      if (!check.ok) {
        throw new Error((check as { ok: false; reason: string }).reason);
      }

      if (row.status === "active" && row.retailerId.trim() === params.uid) {
        return;
      }

      if (row.status !== "invited") {
        throw new Error("not_invited");
      }
      if (!row.claimable) {
        throw new Error("not_invited");
      }
      const rid = row.retailerId.trim();
      if (rid && rid !== params.uid) {
        throw new Error("already_used");
      }

      transaction.update(ref, {
        status: "active",
        retailerId: params.uid,
        claimable: false,
        updatedAt: serverTimestamp(),
      });
    });
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    const reasons = ["invalid_code", "already_used", "expired", "not_invited"] as const;
    if (reasons.includes(err as (typeof reasons)[number])) {
      return { ok: false, message: mapInviteAcceptanceError(err as (typeof reasons)[number]) };
    }
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Could not accept invite. Try again.",
    };
  }

  // After successful invite acceptance, backfill product/inventory/listing records.
  // Products store retailerDocId = the `retailerDocId` FIELD on the manufacturerRetailers doc
  // (a retailers collection doc ID), NOT the manufacturerRetailers doc's own ID.
  const retailerDocId = initial!.retailerDocId;
  const backfillError = await backfillRetailerAfterInvite(params.uid, retailerDocId);

  return { ok: true, alreadyActive: wasAlreadyActive, backfillError };
}

async function backfillRetailerAfterInvite(uid: string, retailerDocId: string): Promise<string | undefined> {
  if (!retailerDocId) {
    return "retailerDocId is empty — cannot sync products. Contact your manufacturer.";
  }
  try {
    const now = serverTimestamp();

    // 1. Mark the retailer's user profile as paid (merge so it never overwrites the full doc).
    //    This also sets retailerDocId on users/{uid} which the Firestore rules use to authorize
    //    product/inventory updates below.
    await setDoc(doc(db, "users", uid), {
      isPaid: true,
      retailerDocId,
      updatedAt: now,
    }, { merge: true });

    // 2. Fetch product copies created before the retailer signed up (ownerId = retailerDocId placeholder)
    const [productsSnap, inventorySnap, listingsSnap] = await Promise.all([
      getDocs(query(collection(db, "products"),            where("retailerDocId", "==", retailerDocId))),
      getDocs(query(collection(db, "inventory"),           where("retailerDocId", "==", retailerDocId))),
      getDocs(query(collection(db, "retailerSeatListings"),where("retailerDocId", "==", retailerDocId))),
    ]);

    if (productsSnap.empty && inventorySnap.empty && listingsSnap.empty) {
      return `No products found with retailerDocId="${retailerDocId}". The manufacturer may not have assigned any products yet.`;
    }

    // Batch all writes (Firestore limit: 500 per batch)
    const batch = writeBatch(db);

    productsSnap.docs.forEach((d) => {
      const data = d.data() as Record<string, unknown>;
      if (String(data.ownerId ?? "") === retailerDocId) {
        batch.update(d.ref, { ownerId: uid, retailerId: uid, updatedAt: now });
      } else {
        batch.update(d.ref, { retailerId: uid, updatedAt: now });
      }
    });

    inventorySnap.docs.forEach((d) => {
      batch.update(d.ref, { retailerId: uid, updatedAt: now });
    });

    listingsSnap.docs.forEach((d) => {
      const data = d.data() as Record<string, unknown>;
      if (!data.retailerId || data.retailerId === retailerDocId) {
        batch.update(d.ref, { retailerId: uid });
      }
    });

    await batch.commit();
    return undefined; // success
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("Retailer backfill after invite acceptance failed:", msg);
    return `Sync failed: ${msg}`;
  }
}
