import Razorpay from "razorpay";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "./firebase-admin";
import { computeSellerSplit } from "./route-split";
import { loadRouteConfig, resolveSellerAccount } from "./route-server";

/**
 * Razorpay Route transfers as they relate to ONE order document.
 *
 * A cart checkout creates one Razorpay payment but one order doc per seller,
 * and the payment carries one HELD transfer per seller that had a linked
 * account at checkout (see api/payment/create-cart-order), each tagged with
 * `notes.sellerKey`. Everything that moves or reverses a seller's money for a
 * single order has to pick that seller's transfer out of the payment — and
 * never another seller's.
 *
 * SOURCE OF TRUTH
 * Whether a transfer still holds money is read from Razorpay itself
 * (`amount - amount_reversed`), never from a Firestore flag. A flag can be
 * written without the money moving, or the money can move without the flag
 * being written; Razorpay's own number cannot disagree with Razorpay.
 */

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export interface RouteTransferRow {
  id: string;
  amount: number;
  amount_reversed: number;
  on_hold: boolean;
  recipient: string;
  notes: Record<string, string>;
}

/** 10-digit key — sellerKey notes and order.sellerPhone are written in both
 *  the +91 and bare forms across the schema. */
function phoneKey(v: unknown): string {
  const digits = String(v ?? "").replace(/\D/g, "");
  return digits.slice(-10);
}

/** Paise still sitting in a transfer (i.e. not yet reversed). */
export function outstandingPaise(t: RouteTransferRow): number {
  return Math.max(0, Number(t.amount ?? 0) - Number(t.amount_reversed ?? 0));
}

/** Every transfer against a payment, newest SDK shape normalised. */
export async function fetchPaymentTransfers(paymentId: string): Promise<RouteTransferRow[]> {
  const res = (await razorpay.payments.fetchTransfer(paymentId)) as unknown as {
    items?: Array<Record<string, unknown>>;
  };
  return (res.items ?? []).map((t) => ({
    id: String(t.id),
    amount: Number(t.amount ?? 0),
    amount_reversed: Number(t.amount_reversed ?? 0),
    on_hold: Boolean(t.on_hold),
    recipient: String(t.recipient ?? ""),
    notes: (t.notes as Record<string, string>) ?? {},
  }));
}

/**
 * The transfer belonging to one seller on a payment, or null.
 *
 * Deliberately strict. The delivery-release trigger used to fall back to "the
 * only transfer on the payment" — on a reassigned order that is the ORIGINAL
 * seller's transfer, so the fallback would have paid the seller who rejected.
 * Here a transfer is only ever returned when:
 *   - its id is the one the order explicitly recorded (`preferredId`), or
 *   - its `notes.sellerKey` names this seller, or
 *   - it is the single transfer on the payment AND carries no sellerKey note
 *     at all (transfers from before the note existed).
 * A transfer whose note names a DIFFERENT seller is never a match.
 */
export function matchSellerTransfer(
  transfers: RouteTransferRow[],
  sellerIdentities: string | string[],
  preferredId?: string | null,
): RouteTransferRow | null {
  if (preferredId) {
    return transfers.find((t) => t.id === preferredId) ?? null;
  }
  // Checkout tags a transfer with item.sellerPhone, falling back to
  // item.sellerId — which web orders key to a Firebase uid. So a note can be
  // either form, and an order carries both; compare against every identity,
  // exactly and as a 10-digit phone.
  const ids = (Array.isArray(sellerIdentities) ? sellerIdentities : [sellerIdentities])
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);
  const keys = new Set(ids.map(phoneKey).filter((k) => k.length === 10));
  const tagged = transfers.find((t) => {
    const note = String(t.notes?.sellerKey ?? "").trim();
    if (!note) return false;
    return ids.includes(note) || keys.has(phoneKey(note));
  });
  if (tagged) return tagged;
  if (transfers.length === 1 && !transfers[0]!.notes?.sellerKey) return transfers[0]!;
  return null;
}

export type ReversalOutcome =
  | { ok: true; transferId: string | null; reversalId: string | null; reversedPaise: number }
  | { ok: false; error: string };

/**
 * Reverses this order's seller Route transfer (up to `capPaise`, default the
 * whole outstanding amount) and records it on the order.
 *
 * Returns ok with a null transferId when there is nothing to reverse — no
 * online payment, a seller who had no linked account, or a transfer already
 * fully reversed. Callers treat that as success: the money is already with the
 * platform.
 */
export async function reverseOrderSellerTransfer(
  orderId: string,
  order: FirebaseFirestore.DocumentData,
  capPaise?: number,
): Promise<ReversalOutcome> {
  const paymentId = String(order.payment?.razorpayPaymentId ?? "").trim();
  if (!paymentId) return { ok: true, transferId: null, reversalId: null, reversedPaise: 0 };

  let transfer: RouteTransferRow | null;
  try {
    const transfers = await fetchPaymentTransfers(paymentId);
    transfer = matchSellerTransfer(
      transfers,
      [String(order.sellerPhone ?? ""), String(order.sellerId ?? "")],
      order.routeTransfer?.id ? String(order.routeTransfer.id) : null,
    );
  } catch (e) {
    return {
      ok: false,
      error: "Could not read the payment's seller transfers from Razorpay: " +
        (e instanceof Error ? e.message : String(e)),
    };
  }

  if (!transfer) return { ok: true, transferId: null, reversalId: null, reversedPaise: 0 };
  const outstanding = outstandingPaise(transfer);
  const amount = Math.min(outstanding, capPaise ?? outstanding);
  if (amount <= 0) {
    return { ok: true, transferId: transfer.id, reversalId: null, reversedPaise: 0 };
  }

  let reversalId: string;
  try {
    const reversal = (await razorpay.transfers.reverse(transfer.id, { amount })) as { id: string };
    reversalId = reversal.id;
  } catch (e) {
    return {
      ok: false,
      error: `Could not reverse seller transfer ${transfer.id}: ` +
        (e instanceof Error ? e.message : String(e)),
    };
  }

  // Audit trail only — the authority on "is this reversed" stays Razorpay.
  await getAdminDb()
    .collection("orders")
    .doc(orderId)
    .update({
      "payment.transferReversals": FieldValue.arrayUnion({
        transferId: transfer.id,
        reversalId,
        amountPaise: amount,
        at: new Date().toISOString(),
      }),
      updatedAt: new Date().toISOString(),
    })
    .catch((e) => console.error("[route-transfers] could not record reversal", orderId, e));

  return { ok: true, transferId: transfer.id, reversalId, reversedPaise: amount };
}

export type HeldTransferOutcome =
  | { status: "created"; transferId: string; amountPaise: number; accountId: string }
  | { status: "not_linked" }
  | { status: "no_payment" }
  | { status: "failed"; error: string };

/**
 * Creates a HELD transfer from the order's payment to a new seller's linked
 * account — what checkout would have created had this seller been chosen
 * originally. Same linked-account lookup and same split maths as
 * create-cart-order, so the new seller nets exactly what they would have.
 *
 * Held, so it only settles when the new seller marks the order delivered
 * (functions/src/route-release.ts reads `order.routeTransfer.id`).
 *
 * Never throws. A failure is returned, not raised: the seller has already
 * taken the order, and a transfer that can't be created simply means they are
 * paid through the manual payout run instead (api/admin/payout-transfer,
 * which asks Razorpay whether a Route transfer exists before paying).
 */
export async function createHeldTransferForSeller(
  orderId: string,
  paymentId: string,
  sellerPhone: string,
  grossPaise: number,
): Promise<HeldTransferOutcome> {
  if (!paymentId) return { status: "no_payment" };

  try {
    const seller = await resolveSellerAccount(sellerPhone);
    const accountId = seller?.razorpayAccountId ?? null;
    if (!accountId) return { status: "not_linked" };

    const config = await loadRouteConfig();
    const split = computeSellerSplit(grossPaise, config);

    const res = (await razorpay.payments.transfer(paymentId, {
      transfers: [
        {
          account: accountId,
          amount: split.transferPaise,
          currency: "INR",
          on_hold: 1,
          notes: {
            sellerKey: sellerPhone,
            orderId,
            reassigned: "true",
            commissionPaise: String(split.commissionPaise),
          },
        } as never,
      ],
    })) as unknown as { items?: Array<{ id: string }> } | { id: string };

    const created = "items" in res ? res.items?.[0] : (res as { id: string });
    if (!created?.id) return { status: "failed", error: "Razorpay returned no transfer id." };
    return {
      status: "created",
      transferId: created.id,
      amountPaise: split.transferPaise,
      accountId,
    };
  } catch (e) {
    return { status: "failed", error: e instanceof Error ? e.message : String(e) };
  }
}
