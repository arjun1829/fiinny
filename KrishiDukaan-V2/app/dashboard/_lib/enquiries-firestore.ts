import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../../firebase";

/**
 * Seller-facing buyer enquiries.
 *
 * One doc per (abandoned checkout × seller), written server-side by the
 * scheduled sweep in functions/src/notifications/enquiries.ts. A seller sees
 * only their own — the collection exists precisely so a seller can be shown a
 * lost sale without being shown the rest of a multi-seller basket or the
 * buyer's delivery address (see the enquiries block in firestore.rules).
 */

export type EnquiryStatus = "open" | "contacted" | "closed";

export interface EnquiryItem {
  productId: string;
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

export interface EnquiryDoc {
  id: string;
  attemptId: string;
  /** Why the sale was lost: the buyer walked away, or the payment failed. */
  reason: "abandoned" | "failed";
  status: EnquiryStatus;
  buyerName: string | null;
  buyerPhone: string;
  items: EnquiryItem[];
  itemSummary: string;
  /** Rupees the basket was worth to THIS seller. */
  value: number;
  sellerNote: string | null;
  createdAt: Date | null;
  contactedAt: Date | null;
}

function toDate(v: unknown): Date | null {
  const ts = v as { toDate?: () => Date } | null | undefined;
  if (ts?.toDate) {
    try {
      return ts.toDate();
    } catch {
      return null;
    }
  }
  return null;
}

function mapEnquiry(id: string, r: Record<string, unknown>): EnquiryDoc {
  const items = Array.isArray(r.items) ? (r.items as Record<string, unknown>[]) : [];
  return {
    id,
    attemptId: String(r.attemptId ?? ""),
    reason: r.reason === "failed" ? "failed" : "abandoned",
    status:
      r.status === "contacted" || r.status === "closed"
        ? (r.status as EnquiryStatus)
        : "open",
    buyerName: r.buyerName ? String(r.buyerName) : null,
    buyerPhone: String(r.buyerPhone ?? ""),
    items: items.map((i) => ({
      productId: String(i.productId ?? ""),
      name: String(i.name ?? "Product"),
      qty: Number(i.qty ?? 1) || 1,
      unitPrice: Number(i.unitPrice ?? 0) || 0,
      lineTotal: Number(i.lineTotal ?? 0) || 0,
    })),
    itemSummary: String(r.itemSummary ?? ""),
    value: Number(r.value ?? 0) || 0,
    sellerNote: r.sellerNote ? String(r.sellerNote) : null,
    createdAt: toDate(r.createdAt),
    contactedAt: toDate(r.contactedAt),
  };
}

/**
 * Resolves the caller's phone the way every other seller-scoped read here
 * does — the signed-in uid maps to a phone through uidIndex, and enquiries are
 * keyed by phone because that is what the products carry as their seller key.
 */
async function resolvePhone(ownerId: string): Promise<string> {
  try {
    const idx = await getDoc(doc(db, "uidIndex", ownerId));
    const phone = idx.exists() ? String(idx.data()?.phone ?? "") : "";
    if (phone) return phone;
  } catch {
    /* fall through to the uid — some accounts are keyed by phone already */
  }
  return ownerId;
}

/**
 * Every enquiry raised for this seller, newest first.
 *
 * Queried by `sellerPhones array-contains` (the doc stores both the +91 and
 * bare forms) and sorted client-side — deliberately no orderBy, so this needs
 * no composite index to be deployed, same as the reviews read alongside it.
 */
export async function fetchSellerEnquiries(
  ownerId: string,
  profilePhone?: string | null,
): Promise<EnquiryDoc[]> {
  const phone = profilePhone?.trim() || (await resolvePhone(ownerId));
  if (!phone) return [];

  const snap = await getDocs(
    query(
      collection(db, "enquiries"),
      where("sellerPhones", "array-contains", phone),
      limit(200),
    ),
  );

  return snap.docs
    .map((d) => mapEnquiry(d.id, d.data() as Record<string, unknown>))
    .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
}

/**
 * Moves an enquiry through its follow-up states. The matching rule lets a
 * seller touch only these fields on their own enquiry — everything describing
 * what the buyer tried to order stays server-written.
 */
export async function setEnquiryStatus(
  enquiryId: string,
  status: EnquiryStatus,
  sellerNote?: string,
): Promise<void> {
  await updateDoc(doc(db, "enquiries", enquiryId), {
    status,
    ...(status === "contacted" ? { contactedAt: serverTimestamp() } : {}),
    ...(sellerNote !== undefined ? { sellerNote } : {}),
    updatedAt: serverTimestamp(),
  });
}
