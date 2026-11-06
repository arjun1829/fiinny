import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "./firebase-admin";
import { findReassignmentCandidates } from "./order-reassignment";
import { resolveSellerAccount } from "./route-server";
import {
  classifyExistingTransfer,
  fetchPaymentTransfers,
  matchSellerTransfer,
  rzpErrorMessage,
  type ExistingTransferClass,
} from "./route-transfers";

/**
 * Admin-initiated order reassignment — "Route Order".
 *
 * WHAT THIS IS (and is NOT)
 * -------------------------
 * The admin moves a STILL-UNACCEPTED order from the retailer it was placed with
 * to a different eligible retailer. This is distinct from the seller-rejection
 * reassignment in order-reassignment.ts, which offers a rejected order to a pool
 * of candidates and lets the FIRST to accept win. Here the admin chooses the new
 * retailer directly and the swap is immediate.
 *
 * WHY ONLY BEFORE ACCEPTANCE
 * Once a retailer has accepted, an invoice exists (INVOICE_READY_STATUSES) and
 * the customer has been told who is fulfilling the order. Reassigning after that
 * is a cancel-and-reorder, not a routing decision, so it is refused here — admin
 * uses reject/refund for that case.
 *
 * MONEY — OWNERSHIP IS NOT SETTLEMENT (the important design rule)
 * --------------------------------------------------------------
 * Reassignment is an OWNERSHIP change only. It does NOT reverse, create or
 * otherwise mutate any Razorpay transfer. The customer's payment and its ids are
 * left exactly as they are.
 *
 * At checkout a HELD transfer may already exist to the ORIGINAL retailer
 * (create-cart-order). We do NOT touch it. Changing order.sellerPhone does not
 * redirect Razorpay, but it does not need to, because the two things that
 * actually move money both resolve the order's CURRENT seller, never a transfer
 * tagged for a different one:
 *   - release on delivery (functions/src/route-release.ts) matches only a
 *     transfer tagged for the current seller for a reassigned order — so the
 *     old retailer's held transfer is never released, and
 *   - the payout run / pay-after-kyc pay the current seller from balance and
 *     skip only a live transfer that is actually the current seller's.
 * The old retailer's held transfer therefore simply stays parked on hold and is
 * never settled to anyone. No money is created or reversed by this operation.
 *
 * SAFETY INSPECTION (read-only — no mutation)
 * Before committing, we READ the payment's transfers (only when the order was
 * paid online) and classify the original retailer's transfer. If it is already
 * released / scheduled / settled — i.e. money is on its way to the old retailer
 * — a plain ownership change is NOT safe (Firestore can't call it back), so we
 * STOP and report rather than silently proceeding. An indefinite on-hold or no
 * transfer is safe and we proceed. A failed read does not block the ownership
 * change (it performs no financial operation); it is recorded on the audit.
 *
 * CONCURRENCY
 * The seller swap is committed in a transaction that re-checks the order is
 * still 'placed' and still owned by the original retailer. A retailer accepting
 * (or the admin reassigning twice) at the same moment resolves to one winner.
 *
 * AUDIT
 * Every reassignment records who (admin uid), from/to retailer, when, the
 * reason, and the inspected existing-transfer state under order.adminReassignment.
 */

function phoneKey(v: unknown): string {
  return String(v ?? "").replace(/\D/g, "").slice(-10);
}

function orderItems(order: FirebaseFirestore.DocumentData): Array<Record<string, unknown>> {
  return Array.isArray(order.items) ? (order.items as Array<Record<string, unknown>>) : [];
}

function itemProductId(item: Record<string, unknown>): string {
  return String(item.catalogId ?? item.productId ?? "").trim();
}

/** Statuses from which an admin may reassign. Includes "accepted" so that an
 *  order reverted back to accepted (seller unable to fulfil) can be re-routed.
 *  Anything past acceptance that has NOT been reverted (dispatched/delivered)
 *  and anything closed is still refused. */
const REASSIGNABLE_STATUSES = new Set(["placed", "accepted"]);

export interface EligibleRetailer {
  phone: string;
  name: string;
  /** retailer | manufacturer — the collection the seller doc lives in. */
  type: "retailer" | "manufacturer";
  /** Whether this retailer has a Razorpay linked account — i.e. whether the new
   *  held transfer can be created now, or the manual payout run will pay them. */
  onRoute: boolean;
  /**
   * True when this seller stocks EVERY item in the order online (the rule
   * checkout and the seller-rejection pool use). False for a seller surfaced
   * only because their online-delivery switch is on — the admin can still route
   * to them, but they may not carry every product. Fully-eligible sellers are
   * listed first.
   */
  fullyEligible: boolean;
}

/**
 * Sellers the order can be reassigned to, fully-eligible first:
 *   1. everyone who sells EVERY item in it online (fullyEligible: true), then
 *   2. every other retailer/manufacturer whose online-delivery switch is on
 *      (fullyEligible: false) — a fallback so the admin is never stuck with an
 *      empty list when no single store stocks the whole order.
 * The current seller is excluded from both.
 */
export async function eligibleRetailersForOrder(
  order: FirebaseFirestore.DocumentData,
): Promise<EligibleRetailer[]> {
  const current = String(order.sellerPhone ?? order.sellerId ?? "");
  const [strictPhones, online] = await Promise.all([
    findReassignmentCandidates(order, [current]),
    onlineDeliverySellers(),
  ]);

  const strictKeys = new Set(strictPhones.map(phoneKey));
  const out: EligibleRetailer[] = await Promise.all(
    strictPhones.map(async (phone) => {
      const seller = await resolveSellerAccount(phone);
      return {
        phone,
        name: seller?.shopName || phone,
        type: seller?.collection === "manufacturers" ? ("manufacturer" as const) : ("retailer" as const),
        onRoute: Boolean(seller?.razorpayAccountId),
        fullyEligible: true,
      };
    }),
  );

  const excluded = new Set(strictKeys);
  excluded.add(phoneKey(current));
  for (const s of online) {
    if (excluded.has(phoneKey(s.phone))) continue;
    out.push({ ...s, fullyEligible: false });
  }
  return out;
}

/**
 * Every retailer / manufacturer whose account-level online-delivery switch is
 * on. The flag is written to retailers/{phone} and manufacturers/{phone} by the
 * seller's own toggle (app/firebase.ts enableOnlineDeliveryWithGst / the disable
 * path), so it is queried straight off those collections. Capped — this is an
 * admin fallback list, not a live marketplace query.
 */
async function onlineDeliverySellers(): Promise<Array<Omit<EligibleRetailer, "fullyEligible">>> {
  const db = getAdminDb();
  const [retailers, manufacturers] = await Promise.all([
    db.collection("retailers").where("onlineDelivery", "==", true).limit(400).get(),
    db.collection("manufacturers").where("onlineDelivery", "==", true).limit(400).get(),
  ]);

  const byKey = new Map<string, Omit<EligibleRetailer, "fullyEligible">>();
  const add = (doc: FirebaseFirestore.QueryDocumentSnapshot, type: "retailer" | "manufacturer") => {
    const phone = doc.id;
    const key = phoneKey(phone);
    if (!key || byKey.has(key)) return; // a seller in both collections is listed once
    const d = doc.data();
    byKey.set(key, {
      phone,
      name: String(d.shopName ?? d.businessName ?? d.storeName ?? d.name ?? "").trim() || phone,
      type,
      onRoute: Boolean(d.razorpayAccountId),
    });
  };
  retailers.docs.forEach((doc) => add(doc, "retailer"));
  manufacturers.docs.forEach((doc) => add(doc, "manufacturer"));
  return Array.from(byKey.values());
}

/** How the original retailer's existing transfer was handled — recorded on the
 *  audit and returned so the UI/admin can see no money was touched. */
export type ExistingTransferAudit =
  | { kind: "none" }
  | { kind: "held"; transferId: string; paise: number }
  | { kind: "unverified"; error: string };

export type ReassignOutcome =
  | {
      ok: true;
      fromSellerPhone: string;
      toSellerPhone: string;
      toSellerName: string;
      /** What the original retailer's transfer was (none / left on hold / unverified).
       *  Reassignment never creates or reverses a transfer, so there is no new one. */
      existingTransfer: ExistingTransferAudit;
    }
  | { ok: false; status: number; error: string };

/**
 * Reassign `orderId` to `newSellerPhone`. Server-only — the caller must already
 * be an authenticated admin (api/admin/reassign-order).
 */
export async function reassignOrderByAdmin(params: {
  orderId: string;
  newSellerPhone: string;
  adminUid: string;
  reason: string;
}): Promise<ReassignOutcome> {
  const { orderId, adminUid } = params;
  const reason = params.reason.trim();
  const newSellerPhone = params.newSellerPhone.trim();
  const db = getAdminDb();

  if (!newSellerPhone) return { ok: false, status: 400, error: "A retailer is required." };
  if (!reason) return { ok: false, status: 400, error: "A reassignment reason is required." };

  const ref = db.collection("orders").doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, status: 404, error: "Order not found." };
  const order = snap.data() as FirebaseFirestore.DocumentData;

  // ── Pre-checks (cheap rejections before any money or lock) ────────────────
  if (!REASSIGNABLE_STATUSES.has(String(order.status))) {
    return {
      ok: false,
      status: 409,
      error: `Only a placed or accepted order can be reassigned (this one is ${order.status}).`,
    };
  }
  // An order mid-way through the seller-rejection reassignment belongs to nobody
  // yet; let that flow finish rather than racing it.
  if (order.reassignment && order.reassignment.status !== "closed") {
    return { ok: false, status: 409, error: "This order is already being reassigned to another seller." };
  }

  const fromSellerPhone = String(order.sellerPhone ?? order.sellerId ?? "");
  if (phoneKey(newSellerPhone) === phoneKey(fromSellerPhone)) {
    return { ok: false, status: 400, error: "That is already this order's retailer." };
  }

  // Eligibility: the new seller must either stock every item in the order online
  // (the gate checkout enforces) OR at least have online delivery switched on
  // (the admin fallback). A seller in neither set can't take an online order.
  const eligible = await eligibleRetailersForOrder(order);
  const match = eligible.find((e) => phoneKey(e.phone) === phoneKey(newSellerPhone));
  if (!match) {
    return {
      ok: false,
      status: 422,
      error: "That store does not have online delivery enabled, so this order cannot be reassigned to it.",
    };
  }

  const newSeller = await resolveSellerAccount(newSellerPhone);
  if (!newSeller) return { ok: false, status: 404, error: "Retailer account not found." };

  // ── Safety inspection (READ-ONLY — no transfer is created or reversed) ────
  // Reassignment is an ownership change only. But if the original retailer's
  // transfer is ALREADY on its way to them (released / scheduled / settled),
  // changing Firestore seller fields will not call it back — so we stop and
  // report rather than silently proceeding. An indefinite hold or no transfer
  // is safe and left exactly as-is. A read failure performs no financial
  // operation, so it does not block the ownership change; it is recorded.
  let existingTransfer: ExistingTransferAudit = { kind: "none" };
  const paymentId = String(order.payment?.razorpayPaymentId ?? "").trim();
  if (paymentId) {
    try {
      const transfers = await fetchPaymentTransfers(paymentId);
      const oldTransfer = matchSellerTransfer(
        transfers,
        [String(order.sellerPhone ?? ""), String(order.sellerId ?? "")],
        order.routeTransfer?.id ? String(order.routeTransfer.id) : null,
      );
      const klass: ExistingTransferClass = classifyExistingTransfer(oldTransfer);
      if (klass.kind === "blocking") {
        return {
          ok: false,
          status: 409,
          error:
            `The original retailer's payout for this order is ${klass.reason} ` +
            `(transfer ${klass.transferId}). Reassigning ownership would not redirect it, ` +
            `so this needs a manual Razorpay reversal/refund before the order can be reassigned.`,
        };
      }
      existingTransfer =
        klass.kind === "held"
          ? { kind: "held", transferId: klass.transferId, paise: klass.paise }
          : { kind: "none" };
    } catch (e) {
      // No money is being moved, so a read failure does not block ownership
      // change. Record that the transfer state could not be verified.
      existingTransfer = { kind: "unverified", error: rzpErrorMessage(e) };
      console.warn("[admin-reassign] could not verify existing transfer state", orderId, existingTransfer.error);
    }
  }

  // ── Commit the seller swap under a concurrency gate ───────────────────────
  const nowIso = new Date().toISOString();
  const sellerType = newSeller.collection === "manufacturers" ? "manufacturer" : "retailer";
  const sellerName = newSeller.shopName || newSellerPhone;
  // Remap each item's seller-copy pointer (mobile orders carry items[].listingId)
  // to the new retailer's copy of that product, so anything keyed off it points
  // at the right listing. Falls back to the product id when no copy is found.
  const newItems = await remapItemListings(order, newSellerPhone);

  let raced: string | null = null;
  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    const f = fresh.data() ?? {};
    if (!REASSIGNABLE_STATUSES.has(String(f.status))) {
      raced = `Order changed to ${f.status} while it was being reassigned.`;
      return;
    }
    if (phoneKey(f.sellerPhone ?? f.sellerId) !== phoneKey(fromSellerPhone)) {
      raced = "This order was already reassigned to another retailer.";
      return;
    }
    // When routing an accepted order (reverted back), reset to placed so the
    // new seller gets to accept/reject rather than inheriting an accepted state.
    const resetToPlaced = String(f.status) === "accepted";
    tx.update(ref, {
      sellerId: newSellerPhone,
      sellerPhone: newSellerPhone,
      sellerName,
      sellerType,
      ...(newSeller.data?.gstin ? { sellerGstNumber: String(newSeller.data.gstin) } : {}),
      ...(resetToPlaced ? { status: "placed" } : {}),
      items: newItems,
      statusHistory: FieldValue.arrayUnion({
        status: "placed",
        at: nowIso,
        by: adminUid,
        byRole: "admin",
        reason: `Reassigned to ${sellerName}: ${reason}`,
      }),
      adminReassignment: {
        at: nowIso,
        by: adminUid,
        reason,
        fromSellerPhone,
        fromSellerName: String(order.sellerName ?? ""),
        toSellerPhone: newSellerPhone,
        toSellerName: sellerName,
        // False when the admin used the fallback list (store has online delivery
        // on but may not stock every item) — worth keeping on the audit trail.
        fullyEligible: match.fullyEligible,
        // The inspected state of the original retailer's transfer. No transfer is
        // created or reversed here — this only records what was found.
        existingTransfer,
      },
      // Reassignment does NOT record a new routeTransfer: it creates none. The
      // release trigger and payout run resolve the CURRENT seller for a
      // reassigned order (adminReassignment is set), so a stale routeTransfer
      // from any earlier state must not linger and point at the old seller.
      routeTransfer: FieldValue.delete(),
      updatedAt: nowIso,
    });
  });

  if (raced) {
    // Nothing financial happened (no transfer was created or reversed), so there
    // is nothing to undo — the order is simply left as whatever it raced to.
    return { ok: false, status: 409, error: `${raced} Refresh and try again.` };
  }

  // ── Stock, best-effort, after the swap is committed ───────────────────────
  // Give the original retailer back what the order took off them at creation,
  // and take it off the new retailer — mirroring decrementStockOnOrder.
  await adjustStock(order, fromSellerPhone, +1).catch((e) =>
    console.warn("[admin-reassign] restore old-seller stock failed", orderId, e),
  );
  await adjustStock(order, newSellerPhone, -1).catch((e) =>
    console.warn("[admin-reassign] decrement new-seller stock failed", orderId, e),
  );

  return {
    ok: true,
    fromSellerPhone,
    toSellerPhone: newSellerPhone,
    toSellerName: sellerName,
    existingTransfer,
  };
}

/** The new retailer's copy-doc id for each item, so items[].listingId points at
 *  the retailer who now owns the order. Best-effort; unchanged items are kept. */
async function remapItemListings(
  order: FirebaseFirestore.DocumentData,
  sellerPhone: string,
): Promise<Array<Record<string, unknown>>> {
  const items = orderItems(order);
  return Promise.all(
    items.map(async (item) => {
      if (!("listingId" in item)) return item; // web orders carry none — leave as-is
      const copyRef = await findSellerCopy(itemProductId(item), sellerPhone);
      return { ...item, listingId: copyRef?.id ?? itemProductId(item) };
    }),
  );
}

/** The seller's own product copy / inventory row for a product, or null. Mirrors
 *  the copy lookup in order-reassignment.decrementSellerStock. */
async function findSellerCopy(
  productId: string,
  sellerPhone: string,
): Promise<FirebaseFirestore.DocumentReference | null> {
  if (!productId) return null;
  const db = getAdminDb();
  const snap = await db.collection("products").doc(productId).get();
  const d = snap.data() ?? {};
  const canonicalId = String(d.originalProductId ?? d.manufacturerProductId ?? productId);
  for (const field of ["manufacturerProductId", "originalProductId"]) {
    for (const sellerField of ["retailerPhone", "ownerPhone"]) {
      const q = await db
        .collection("products")
        .where(field, "==", canonicalId)
        .where(sellerField, "==", sellerPhone)
        .limit(1)
        .get();
      if (!q.empty) return q.docs[0]!.ref;
    }
  }
  // The new seller may own the canonical product itself.
  const c = await db.collection("products").doc(canonicalId).get();
  const cd = c.data() ?? {};
  if (phoneKey(cd.retailerPhone ?? cd.ownerPhone ?? cd.manufacturerPhone) === phoneKey(sellerPhone)) {
    return c.ref;
  }
  return null;
}

/** Adjust a seller's stock for every item by `sign * qty`. sign:-1 decrements
 *  (new seller takes the order on), +1 restores (old seller gets it back). */
async function adjustStock(
  order: FirebaseFirestore.DocumentData,
  sellerPhone: string,
  sign: 1 | -1,
): Promise<void> {
  const db = getAdminDb();
  for (const item of orderItems(order)) {
    const qty = Math.max(1, Math.floor(Number(item.quantity ?? item.qty ?? 1)));
    const copyRef = await findSellerCopy(itemProductId(item), sellerPhone);
    if (copyRef) {
      await copyRef.update({ stockQuantity: FieldValue.increment(sign * qty) }).catch(() => undefined);
    }
  }
}
