import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "../../../lib/firebase-admin";
import { requireAuthed } from "../../../lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/manufacturer/network-online
 * Body: { linkIds: string[], allowed: boolean }
 *
 * A manufacturer decides whether retailers in their network may sell the
 * manufacturer's products ONLINE, or in-store only. Default (no flag) is
 * allowed, as before this setting existed.
 *
 * The decision lives on the manufacturerRetailers link (onlineSalesBlocked),
 * which checkout reads (lib/sell-area-server.ts) — the retailer cannot edit
 * it. Blocking also switches that retailer's assigned copies offline and
 * mirrors the lock onto them (onlineLockedByManufacturer) plus their entry in
 * each manufacturer product's availability[], so the marketplace stops
 * offering online delivery from that shop and the retailer's own screens show
 * why. Allowing only clears the lock: going online again stays the
 * retailer's choice (Inventory → Online Delivery).
 *
 * Caller: the link's manufacturer, or an admin. Admin SDK, so it can update
 * the retailers' copies the manufacturer's own login can't.
 */

const MAX_LINKS = 500;

async function isAdmin(uid: string): Promise<boolean> {
  const db = getAdminDb();
  const [byUid, idx] = await Promise.all([db.collection("users").doc(uid).get(), db.collection("uidIndex").doc(uid).get()]);
  if (byUid.exists && byUid.data()?.role === "admin") return true;
  const phone = idx.exists ? String(idx.data()?.phone ?? "") : "";
  if (!phone) return false;
  const byPhone = await db.collection("users").doc(phone).get();
  return byPhone.exists && byPhone.data()?.role === "admin";
}

export async function POST(req: Request) {
  const caller = await requireAuthed(req);
  if (caller instanceof NextResponse) return caller;

  let body: { linkIds?: unknown; allowed?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* handled below */
  }
  const linkIds = Array.from(new Set((Array.isArray(body.linkIds) ? body.linkIds : []).map(String)))
    .filter((id) => /^[A-Za-z0-9_-]{1,128}$/.test(id))
    .slice(0, MAX_LINKS);
  if (linkIds.length === 0 || typeof body.allowed !== "boolean") {
    return NextResponse.json({ error: "linkIds and allowed are required." }, { status: 400 });
  }
  const allowed = body.allowed;
  const db = getAdminDb();

  const links = await Promise.all(linkIds.map((id) => db.collection("manufacturerRetailers").doc(id).get()));
  if (links.some((l) => !l.exists)) return NextResponse.json({ error: "Retailer not found in your network." }, { status: 404 });
  const notMine = links.some((l) => l.get("manufacturerId") !== caller.uid);
  if (notMine && !(await isAdmin(caller.uid))) {
    return NextResponse.json({ error: "These retailers are not in your network." }, { status: 403 });
  }

  const now = new Date().toISOString();
  let copiesUpdated = 0;

  for (const link of links) {
    const manufacturerId = String(link.get("manufacturerId") ?? "");
    const retailerDocId = String(link.get("retailerDocId") ?? "");
    await link.ref.update({
      onlineSalesBlocked: !allowed,
      onlineSalesUpdatedAt: now,
      onlineSalesUpdatedBy: caller.uid,
    });
    if (!manufacturerId || !retailerDocId) continue;

    // This retailer's copies of this manufacturer's products.
    const copies = await db.collection("products")
      .where("manufacturerId", "==", manufacturerId)
      .where("retailerDocId", "==", retailerDocId)
      .get();
    const assigned = copies.docs.filter((d) => d.get("source") === "manufacturer_assigned");
    for (let i = 0; i < assigned.length; i += 400) {
      const batch = db.batch();
      for (const d of assigned.slice(i, i + 400)) {
        batch.update(d.ref, allowed
          ? { onlineLockedByManufacturer: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }
          : {
              onlineLockedByManufacturer: true,
              isOnline: false,
              sellMode: "offline_store_only",
              updatedAt: FieldValue.serverTimestamp(),
            });
      }
      await batch.commit();
      copiesUpdated += Math.min(400, assigned.length - i);
    }

    // Blocking: this shop's entries on the manufacturer's products go offline too.
    if (!allowed) {
      const productIds = Array.from(new Set(assigned.map((d) => String(d.get("manufacturerProductId") ?? "")).filter(Boolean)));
      await Promise.all(productIds.map((pid) =>
        db.runTransaction(async (tx) => {
          const ref = db.collection("products").doc(pid);
          const snap = await tx.get(ref);
          const av = snap.get("availability");
          if (!Array.isArray(av)) return;
          let changed = false;
          const next = av.map((e: Record<string, unknown>) => {
            if (e && e.storeId === retailerDocId && e.isOnline !== false) {
              changed = true;
              return { ...e, isOnline: false };
            }
            return e;
          });
          if (changed) tx.update(ref, { availability: next });
        }).catch((err) => console.error("[network-online] availability update failed", pid, err)),
      ));
    }
  }

  return NextResponse.json({ ok: true, allowed, links: links.length, copiesUpdated });
}
