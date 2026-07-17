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
  getDoc,
  getDocFromServer,
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
import { syncRetailerMirror } from "../../dashboard/_lib/manufacturer-retailers-firestore";
import {
  mapInviteAcceptanceError,
  mapInviteSnapshot,
  precheckInviteForAcceptance,
  type ManufacturerRetailerInviteSnapshot,
} from "./invite-validation";

const COLLECTION = "manufacturerRetailers";

// P3: In-memory lock — prevents concurrent processing of the same invite code
// within the same browser tab (e.g., SignupView + page.tsx auto-accept racing
// after OTP confirmation fires onAuthStateChanged before onInviteConsumed is called).
const _processingInvites = new Set<string>();

// Backfill-level lock — keyed by retailerDocId, held for the duration of the batch
// commit. Covers the gap between the P3 lock release (when acceptManufacturerInvite
// returns) and the moment backfilledAt is written to Firestore.
const _backfillingRetailers = new Set<string>();

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

  // P3: Skip if this exact code is already being processed in this tab.
  // Prevents the race where onAuthStateChanged fires in page.tsx before
  // SignupView calls onInviteConsumed(), causing two concurrent calls.
  if (_processingInvites.has(code)) {
    console.log(`[acceptInvite] Duplicate concurrent call for ${code} — already in progress, skipping`);
    return { ok: true, alreadyActive: true };
  }
  _processingInvites.add(code);

  try {
  console.log(`[acceptInvite] Starting for code: ${code}, uid: ${params.uid}`);

  const normalize = (p: string): string => {
    if (!p) return "";
    const d = p.replace(/\D/g, '');
    // Always produce E164 to match uidIndex format and invite doc format
    if (d.length === 10) return `+91${d}`;
    if (d.length === 12 && d.startsWith('91')) return `+${d}`;
    if (d.length === 13 && d.startsWith('91')) return `+${d}`;
    // Already has +, return as-is (already E164)
    if (p.startsWith('+')) return p.trim();
    return p.trim();
  };

  // Resolve phone + look up invite in parallel — two independent reads, no need to sequence them
  let currentPhoneRaw: string | null = null;
  let initial: ManufacturerRetailerInviteSnapshot | null;
  try {
    const [idxSnap, inviteResult] = await Promise.all([
      getDoc(doc(db, "uidIndex", params.uid)),
      findInviteByCode(code).catch((e: unknown) => { throw e; }),
    ]);
    currentPhoneRaw = idxSnap.exists() ? String(idxSnap.data().phone ?? "") : null;
    initial = inviteResult;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[acceptInvite] parallel lookup failed:`, e);
    if (msg.includes("permission") || msg.includes("insufficient")) {
      return { ok: false, message: "Permission error — Firestore rules not deployed yet. Ask your admin to run: firebase deploy --only firestore:rules" };
    }
    return { ok: false, message: "Could not look up invite code. Try again." };
  }

  const currentPhone = currentPhoneRaw ? normalize(currentPhoneRaw) : null;
  if (!currentPhone) {
    return { ok: false, message: "Phone number required to claim invite. Please complete your profile." };
  }

  // Normalize invite phone to E164 for comparison
  if (initial) {
    initial.retailerPhone = normalize(initial.retailerPhone);
  }

  const pre = precheckInviteForAcceptance(initial, currentPhone);
  if (!pre.ok) {
     const failureReason = (pre as any).reason;
     console.warn(`[acceptInvite] Precheck failed for ${code}:`, failureReason);
     return { ok: false, message: mapInviteAcceptanceError(failureReason) };
  }

  const ref = doc(db, COLLECTION, initial!.id);
  const wasAlreadyActive = initial?.status === "active" && initial.retailerPhone === currentPhone;

  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists()) {
        throw new Error("invalid_code");
      }
      const row = mapInviteSnapshot(snap.id, snap.data() as Record<string, unknown>);
      row.retailerPhone = normalize(row.retailerPhone);
      const check = precheckInviteForAcceptance(row, currentPhone);
      
      if (!check.ok) {
        const failureReason = (check as any).reason;
        throw new Error(typeof failureReason === "string" ? failureReason : "already_used");
      }

      if (row.status === "active" && row.retailerPhone === currentPhone) {
        console.log(`[acceptInvite] Already active for this phone, skipping update.`);
        return;
      }

      console.log(`[acceptInvite] Updating invite doc ${row.id} to active for phone ${currentPhone}`);
      transaction.update(ref, {
        status: "active",
        onboardingStatus: "active",
        retailerId: params.uid,
        retailerPhone: currentPhoneRaw,
        claimable: false,
        updatedAt: serverTimestamp(),
      });
    });
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    console.error(`[acceptInvite] Transaction failed:`, e);
    
    if (err === "invalid_code" || err === "expired" || err === "not_invited") {
      return { ok: false, message: mapInviteAcceptanceError(err as any) };
    }
    if (err === "already_used") {
      // Fallback message if we don't have the specific UID in the catch block
      return { ok: false, message: "This invite has already been used by another account. Sign in with that account." };
    }

    return {
      ok: false,
      message: e instanceof Error ? e.message : "Could not accept invite. Try again.",
    };
  }

  const retailerDocId = initial!.retailerDocId;

  // P4: Only run backfill for new acceptances. If wasAlreadyActive the backfill
  // already completed previously (backfilledAt idempotency guard will also catch it).
  if (!wasAlreadyActive) {
    // P7: Write isPaid immediately so the dashboard can load without waiting for
    // the heavy backfill work (product/inventory/listing sync).
    if (currentPhone) {
      setDoc(doc(db, "users", currentPhone), {
        isPaid: true,
        updatedAt: serverTimestamp(),
      }, { merge: true }).catch(e =>
        console.warn("[acceptInvite] isPaid pre-write failed (non-critical):", e)
      );
    }
    // P7: Run backfill in the background — user is redirected immediately after
    // this function returns. The backfill has its own idempotency guard (backfilledAt).
    console.log(`[acceptInvite] Scheduling background backfill for retailerDocId: ${retailerDocId}`);
    void backfillRetailerAfterInvite(params.uid, retailerDocId, currentPhoneRaw).catch(e =>
      console.warn("[acceptInvite] Background backfill failed (non-critical):", e)
    );
  }

  return { ok: true, alreadyActive: wasAlreadyActive };
  } finally {
    // P3: Always release the lock so future calls (e.g. page refresh) can proceed.
    _processingInvites.delete(code);
  }
}

/**
 * Finds all retailerDocIds linked to this UID (or phone) (status=active).
 * Helps find products if the user profile hasn't synced yet.
 */
export async function fetchLinkedRetailerDocIds(uid: string): Promise<string[]> {
  try {
    let currentPhone: string | null = null;
    try {
      const idxSnap = await getDoc(doc(db, "uidIndex", uid));
      currentPhone = idxSnap.exists() ? String(idxSnap.data().phone ?? "") : null;
    } catch (e) {
      // ignore
    }

    const queries = [];
    queries.push(getDocs(query(
      collection(db, "manufacturerRetailers"),
      where("retailerId", "==", uid),
      where("status", "==", "active"),
    )));

    if (currentPhone) {
      // Handle the raw format and +91 format just in case
      queries.push(getDocs(query(
        collection(db, "manufacturerRetailers"),
        where("retailerPhone", "==", currentPhone),
        where("status", "==", "active"),
      )));
      
      const normalized = currentPhone.replace(/\D/g, '');
      const raw = normalized.length === 12 && normalized.startsWith('91') ? normalized.slice(2) : normalized;
      if (raw !== currentPhone) {
         queries.push(getDocs(query(
          collection(db, "manufacturerRetailers"),
          where("retailerPhone", "==", raw),
          where("status", "==", "active"),
        )));
      }
    }

    const snaps = await Promise.all(queries);
    const docs = snaps.flatMap(snap => snap.docs);
    return Array.from(new Set(docs.map(d => String(d.data().retailerDocId ?? "")).filter(Boolean)));
  } catch (e) {
    console.error("[fetchLinkedRetailerDocIds] Failed:", e);
    return [];
  }
}

/**
 * Finds any pending (status=invited, claimable=true) invites for the retailer's
 * registered phone number and auto-accepts them — no invite code needed.
 * Runs the full backfill (updates ownerId on products/inventory/listings,
 * sets isPaid:true on their user profile).
 * Returns true if at least one invite was accepted.
 */
export async function autoAcceptPendingInvitesForPhone(uid: string): Promise<boolean> {
  const idxSnap = await getDoc(doc(db, "uidIndex", uid));
  if (!idxSnap.exists()) return false;
  const e164Phone = String(idxSnap.data().phone ?? "");
  if (!e164Phone) return false;

  // Try both E164 (+919876543210) and plain 10-digit (9876543210) variants
  const phonesToCheck: string[] = [e164Phone];
  if (e164Phone.startsWith("+91") && e164Phone.length === 13) {
    phonesToCheck.push(e164Phone.slice(3));
  }

  // list rule: allow list: if isAuthed() — any authed user can query
  const snap = await getDocs(query(
    collection(db, "manufacturerRetailers"),
    where("retailerPhone", "in", phonesToCheck),
  ));

  // Filter client-side to avoid composite index requirement
  const pending = snap.docs.filter((d) => {
    const data = d.data();
    return data.status === "invited" && data.claimable === true;
  });

  if (pending.length === 0) return false;

  let anyAccepted = false;
  for (const d of pending) {
    const data = d.data() as Record<string, unknown>;
    const retailerDocId = String(data.retailerDocId ?? "");
    try {
      console.log(`[autoAccept] Activating invite ${d.id} for phone ${data.retailerPhone} -> uid ${uid}`);
      await updateDoc(d.ref, {
        status: "active",
        onboardingStatus: "active",
        retailerId: uid,
        retailerPhone: e164Phone,
        claimable: false,
        updatedAt: serverTimestamp(),
      });
      // Sync the manufacturer mirror immediately after activating the invite
      const mPhone = data.manufacturerPhone ? String(data.manufacturerPhone) : null;
      if (mPhone && e164Phone) {
        await syncRetailerMirror(mPhone, e164Phone, {
          status: "active",
          retailerId: uid,
          retailerPhone: e164Phone,
          onboardingStatus: String(data.onboardingStatus ?? "active"),
          assignedSeat: data.assignedSeat === true,
        });
      }
      const res = await backfillRetailerAfterInvite(uid, retailerDocId);
      if (res) console.warn(`[autoAccept] Backfill warning for ${d.id}:`, res);
      anyAccepted = true;
    } catch (e) {
      console.warn("[autoAccept] Failed for doc", d.id, e);
    }
  }
  return anyAccepted;
}

/**
 * For retailers already linked to a manufacturer (status=active) but missing
 * isPaid:true — sets it so the dashboard becomes accessible.
 *
 * Queries by both retailerId (UID) and retailerPhone (E164 + 10-digit) so it works
 * for retailers who signed up after the invite was created (retailerId was empty).
 * Safe to call on every login; no-ops if already paid or no link found.
 * Returns true if access was granted.
 */
export async function grantAccessIfManufacturerLinked(uid: string): Promise<boolean> {
  // Resolve phone for phone-based queries
  let phone: string | null = null;
  try {
    const idxSnap = await getDoc(doc(db, "uidIndex", uid));
    phone = idxSnap.exists() ? String(idxSnap.data().phone ?? "") || null : null;
  } catch { /* ignore */ }

  const phoneQueries = [
    getDocs(query(collection(db, "manufacturerRetailers"), where("retailerId", "==", uid))),
  ];
  if (phone) {
    phoneQueries.push(
      getDocs(query(collection(db, "manufacturerRetailers"), where("retailerPhone", "==", phone))),
    );
    // Also check raw 10-digit variant for legacy docs
    const raw = phone.startsWith("+91") && phone.length === 13 ? phone.slice(3) : null;
    if (raw) {
      phoneQueries.push(
        getDocs(query(collection(db, "manufacturerRetailers"), where("retailerPhone", "==", raw))),
      );
    }
  }

  const snaps = await Promise.all(phoneQueries);
  const hasActive = snaps.some((snap) =>
    snap.docs.some((d) => d.data().status === "active"),
  );
  if (!hasActive) return false;

  const userDocId = phone || uid;
  await setDoc(doc(db, "users", userDocId), {
    isPaid: true,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  return true;
}

/**
 * Last-resort access check: grants dashboard access if the retailer has at least one
 * active, non-expired manufacturer-assigned seat listing in `retailerSeatListings`.
 *
 * This covers the case where the invite acceptance flow failed silently (e.g., Firestore
 * rule mismatch, network error) but the manufacturer already assigned a product — which
 * creates the seat listing — so the retailer legitimately has earned access.
 *
 * Also repairs the `isPaid` flag as a side effect so future logins are fast.
 */
export async function grantAccessIfHasActiveSeat(uid: string): Promise<boolean> {
  let phone: string | null = null;
  try {
    const idxSnap = await getDoc(doc(db, "uidIndex", uid));
    phone = idxSnap.exists() ? String(idxSnap.data().phone ?? "") || null : null;
  } catch { /* ignore */ }

  const { retailerHasActiveSeat } = await import("../../dashboard/_lib/subscriptions-firestore");
  const hasSeat = await retailerHasActiveSeat(uid, phone).catch(() => false);
  if (!hasSeat) return false;

  // Repair the isPaid flag so subsequent logins skip all these fallback checks.
  const userDocId = phone || uid;
  await setDoc(doc(db, "users", userDocId), {
    isPaid: true,
    updatedAt: serverTimestamp(),
  }, { merge: true }).catch((e) => {
    console.warn("[grantAccessIfHasActiveSeat] Could not repair isPaid flag:", e);
  });

  return true;
}

export async function backfillRetailerAfterInvite(
  uid: string,
  retailerDocId: string,
  preResolvedPhone?: string | null,
): Promise<string | undefined> {
  if (!retailerDocId) {
    console.warn("[backfill] retailerDocId is empty");
    return "retailerDocId is empty — cannot sync products. Contact your manufacturer.";
  }

  // P3b: Backfill-level lock — prevents a second concurrent backfill from starting
  // during the window between the invite-level lock release and backfilledAt commit.
  if (_backfillingRetailers.has(retailerDocId)) {
    console.log(`[backfill] Already running for ${retailerDocId}, skipping concurrent call`);
    return undefined;
  }
  _backfillingRetailers.add(retailerDocId);

  try {
  // P2: Idempotency — skip if a prior run already completed. Uses getDocFromServer
  // to bypass the SDK cache so a fresh page load after redirect always reads the truth.
  try {
    const idempotencySnap = await getDocFromServer(doc(db, "retailers", retailerDocId));
    if (idempotencySnap.exists() && idempotencySnap.data()?.backfilledAt) {
      console.log(`[backfill] Already completed for ${retailerDocId} (backfilledAt set), skipping`);
      return undefined;
    }
  } catch {
    // Proceed on read error — better to re-run than silently skip
  }

  console.log(`[backfill] Starting for uid: ${uid}, retailerDocId: ${retailerDocId}`);
  try {
    const now = serverTimestamp();

    // 1. Resolve the user's phone — use the pre-resolved value when available to skip
    //    a redundant uidIndex read (caller already resolved it).
    let phone: string | null = preResolvedPhone ?? null;
    if (!phone) {
      const idxSnap = await getDoc(doc(db, "uidIndex", uid));
      phone = idxSnap.exists() ? String(idxSnap.data().phone ?? "") : null;
    }
    const userDocId = phone || uid;

    // 2. Kick off all read queries in parallel while we build the batch
    //    (products/inventory/listings keyed by retailerDocId)
    console.log(`[backfill] Querying products/inventory/listings for retailerDocId: ${retailerDocId}`);
    const [productsSnap, inventorySnap, listingsSnap] = await Promise.all([
      getDocs(query(collection(db, "products"),            where("retailerDocId", "==", retailerDocId))),
      getDocs(query(collection(db, "inventory"),           where("retailerDocId", "==", retailerDocId))),
      getDocs(query(collection(db, "retailerSeatListings"),where("retailerDocId", "==", retailerDocId))),
    ]);

    console.log(`[backfill] Found: ${productsSnap.size} products, ${inventorySnap.size} inventory, ${listingsSnap.size} listings`);

    if (productsSnap.empty && inventorySnap.empty && listingsSnap.empty) {
      return `No products found with retailerDocId="${retailerDocId}". The manufacturer may not have assigned any products yet.`;
    }

    // Batch all writes — include user profile + retailer doc updates so they happen
    // in a single round trip instead of two sequential awaits before this point.
    const batch = writeBatch(db);

    console.log(`[backfill] Updating user profile ${userDocId} with retailerDocId: ${retailerDocId}`);
    batch.set(doc(db, "users", userDocId), {
      isPaid: true,
      retailerDocId,
      updatedAt: now,
    }, { merge: true });

    batch.set(doc(db, "retailers", retailerDocId), {
      userId: uid,
      retailerId: uid,
      active: true,
      backfilledAt: now,  // P2: idempotency marker — prevents re-running on duplicate calls
      updatedAt: now,
      ...(phone ? { phone } : {}),
    }, { merge: true });

    productsSnap.docs.forEach((d) => {
      const data = d.data() as Record<string, unknown>;
      const updateData: Record<string, any> = { retailerId: uid, updatedAt: now };
      if (phone) updateData.retailerPhone = phone; // add phone support
      if (String(data.ownerId ?? "") === retailerDocId) {
        updateData.ownerId = uid;
        if (phone) updateData.ownerPhone = phone;
      }
      batch.update(d.ref, updateData);
    });

    inventorySnap.docs.forEach((d) => {
      const data = d.data() as Record<string, unknown>;
      const updateData: Record<string, any> = { retailerId: uid, updatedAt: now };
      if (String(data.ownerId ?? "") === retailerDocId) updateData.ownerId = uid;
      if (phone) {
        updateData.retailerPhone = phone;
        if (String(data.ownerId ?? "") === retailerDocId) updateData.ownerPhone = phone;
      }
      batch.update(d.ref, updateData);
    });

    listingsSnap.docs.forEach((d) => {
      const data = d.data() as Record<string, unknown>;
      if (!data.retailerId || data.retailerId === retailerDocId) {
        const updateData: Record<string, any> = { retailerId: uid };
        if (phone) updateData.retailerPhone = phone;
        batch.update(d.ref, updateData);
      }
    });

    console.log("[backfill] Committing batch update...");
    await batch.commit();
    console.log("[backfill] Success!");

    // storePhone enrichment in root product availability[] is now handled by the
    // syncSellerProductToCanonical Cloud Function (P6/P8) when it sees the
    // retailerPhone field written to product copies above — no per-product
    // arrayRemove+arrayUnion loop needed here.

    // Sync all manufacturer mirror docs for this retailer to status: "active"
    if (phone) {
      (async () => {
        try {
          // Find all manufacturerRetailers docs that match this retailerDocId
          const inviteSnap = await getDocs(query(
            collection(db, "manufacturerRetailers"),
            where("retailerDocId", "==", retailerDocId),
          ));
          await Promise.all(inviteSnap.docs.map(async (inviteDoc) => {
            const d = inviteDoc.data() as Record<string, unknown>;
            const mPhone = d.manufacturerPhone ? String(d.manufacturerPhone) : null;
            if (!mPhone) {
              console.warn("[backfill] Skipping mirror for invite without manufacturerPhone:", inviteDoc.id);
              return;
            }
            await syncRetailerMirror(mPhone, phone, {
              status: "active",
              retailerId: uid,
              retailerPhone: phone,
              onboardingStatus: String(d.onboardingStatus ?? "active"),
              assignedSeat: d.assignedSeat === true,
            });
          }));
        } catch (e) {
          console.warn("[backfill] Manufacturer mirror sync failed:", e);
        }
      })();
    }

    // Mirror synced records to phone-keyed subcollections (fire-and-forget)
    if (phone) {
      import("firebase/firestore").then(({ writeBatch: wb, doc: wDoc, serverTimestamp: wTs }) => {
        const mirrorBatch = wb(db);
        const mirrorNow = wTs();

        productsSnap.docs.forEach((d) => {
          const data = d.data() as Record<string, any>;
          mirrorBatch.set(
            wDoc(db, `retailers/${phone}/products/${d.id}`),
            {
              retailerId: uid,
              retailerPhone: phone,
              manufacturerId: data.manufacturerId ?? null,
              manufacturerPhone: data.manufacturerPhone ?? null,
              assignedAt: data.createdAt ?? mirrorNow,
            },
            { merge: true }
          );
        });

        inventorySnap.docs.forEach((d) => {
          const data = d.data() as Record<string, any>;
          mirrorBatch.set(
            wDoc(db, `retailers/${phone}/inventory/${d.id}`),
            {
              id: d.id,
              productId: data.productId ?? null,
              stockQuantity: data.stockQuantity ?? 0,
              sellingPrice: data.sellingPrice ?? 0,
              reorderThreshold: data.reorderThreshold ?? 5,
              isAvailable: data.isAvailable ?? false,
              updatedAt: mirrorNow,
              assignedByManufacturer: true,
            },
            { merge: true }
          );
        });

        mirrorBatch.commit().catch((me) => {
          console.warn("[backfill] Mirror batch commit failed:", me);
        });
      }).catch((ie) => {
        console.warn("[backfill] Mirror dynamic import failed:", ie);
      });
    }

    return undefined; // success
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[backfill] Failed:", e);
    return `Sync failed: ${msg}`;
  }
  // end of inner main-logic try/catch — now back inside the outer P3b try
  } finally {
    // P3b: Always release the backfill lock — runs for every return path including
    // the P2 idempotency early return above the main-logic try.
    _backfillingRetailers.delete(retailerDocId);
  }
}