import * as admin from "firebase-admin";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";

/**
 * Keeps the fields that say WHO sells a product in one consistent shape.
 *
 * Products are written by the website, the app, the admin portal, the
 * manufacturer "assign" flow and scripts, and over time they stored the
 * seller differently: phone only in `ownerId`, only in `retailerPhone`, a
 * Firebase uid with no phone at all, or a phone without "+91". Pages that list
 * a seller's products query `ownerPhone` (shop pages) and brand pages query
 * `manufacturerPhone`, so every product stored the odd way silently vanished
 * from them, for any seller, with nothing to show it was missing.
 *
 * Fixing each writer would leave the next new writer free to repeat it, so
 * this trigger fills the gaps after every write instead:
 *   - ownerPhone: normalized to +91…; filled from ownerId (when it is a phone),
 *     retailerPhone, or uidIndex/{ownerId}.phone.
 *   - manufacturerPhone: on a manufacturer's own product, = ownerPhone.
 *   - isActive: true when absent (every reader already treated absent as
 *     active; the paged queries filter isActive == true).
 * It only ever ADDS or normalizes; it never overwrites a valid value, and it
 * writes nothing when nothing is missing, so it cannot loop.
 */

const REGION = "asia-south1";
const COPY_SOURCES = new Set(["retailer_inventory_copy", "manufacturer_assigned", "admin_assigned"]);

/** "+91XXXXXXXXXX" for an Indian mobile number in any common form, else null. */
export function normalizePhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (raw.startsWith("+") && digits.length >= 11 && digits.length <= 13) return `+${digits}`;
  return null;
}

export type UidToPhone = (uid: string) => Promise<string | null>;

/** The field updates a product needs, or {} when it is already consistent. Pure apart from `uidToPhone`. */
export async function ownerFieldFixes(
  data: Record<string, unknown>,
  uidToPhone: UidToPhone,
): Promise<Record<string, unknown>> {
  const fixes: Record<string, unknown> = {};

  const current = typeof data.ownerPhone === "string" ? data.ownerPhone : "";
  let ownerPhone = normalizePhone(current);
  if (!ownerPhone) {
    ownerPhone = normalizePhone(data.ownerId) ?? normalizePhone(data.retailerPhone);
  }
  if (!ownerPhone && typeof data.ownerId === "string" && data.ownerId.length >= 20) {
    ownerPhone = await uidToPhone(data.ownerId);
  }
  if (ownerPhone && ownerPhone !== current) fixes.ownerPhone = ownerPhone;

  const source = String(data.source ?? "");
  const phone = ownerPhone ?? (current || null);
  if (
    data.ownerType === "manufacturer" &&
    !COPY_SOURCES.has(source) &&
    !normalizePhone(data.manufacturerPhone) &&
    phone
  ) {
    fixes.manufacturerPhone = phone;
  }

  if (data.isActive === undefined) fixes.isActive = true;

  return fixes;
}

export function uidIndexLookup(db: admin.firestore.Firestore): UidToPhone {
  const cache = new Map<string, string | null>();
  return async (uid) => {
    if (cache.has(uid)) return cache.get(uid)!;
    const snap = await db.collection("uidIndex").doc(uid).get();
    const phone = snap.exists ? normalizePhone(snap.get("phone")) : null;
    cache.set(uid, phone);
    return phone;
  };
}

export const normalizeProductOwnerOnWrite = onDocumentWritten(
  { region: REGION, document: "products/{id}" },
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;
    const db = admin.firestore();
    const fixes = await ownerFieldFixes(after.data() ?? {}, uidIndexLookup(db));
    if (Object.keys(fixes).length === 0) return;
    await after.ref.update(fixes);
    logger.info("normalized product owner fields", { id: after.id, fields: Object.keys(fixes) });
  },
);
