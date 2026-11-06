"use client";

/**
 * Read-side helpers for the admin "Product Identity" view
 * (/admin/product-identity).
 *
 * Unlike /admin/products — which reads the NAME-merged `marketplaceCards` — this
 * view reads the underlying `products` collection DIRECTLY, so two docs with the
 * same name are returned as two independent rows. That is the whole point: the
 * admin must see and link duplicates before any name-merge hides them.
 *
 * Every function here is READ-ONLY. The link / unlink writes live in
 * app/firebase.ts (adminLinkProductsToCanonical / adminUnlinkProductFromCanonical).
 */
import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit as fsLimit,
  query,
  where,
} from "firebase/firestore";
import { db } from "../../firebase";
import { getDocsByIds } from "../../lib/firestore-by-ids";

const COPY_SOURCES = new Set(["retailer_inventory_copy", "manufacturer_assigned", "admin_assigned"]);

export type IdentityVariant = { unit: string; price: number; stock?: number };

/** One raw product document, flattened to the fields the identity view shows. */
export type IdentityRow = {
  id: string;
  name: string;
  nameKey: string;
  source: string;
  isActive: boolean;
  isCopy: boolean;
  image: string;
  price: number;
  category: string;
  sellMode: string;
  isOnline: boolean;
  ownerId: string;
  ownerPhone: string;
  ownerType: string;
  manufacturerId: string;
  manufacturerPhone: string;
  retailerId: string;
  retailerPhone: string;
  originalProductId: string;
  manufacturerProductId: string;
  variants: IdentityVariant[];
  canonicalId: string;
  canonicalLinkedBy: string;
  createdAtMs: number;
};

export function nameKeyOf(name: unknown): string {
  return String(name ?? "").toLowerCase().trim();
}

function millis(v: any): number {
  if (v && typeof v.toMillis === "function") return v.toMillis();
  const p = Date.parse(String(v ?? ""));
  return Number.isFinite(p) ? p : 0;
}

/** Map a raw `products` doc into an IdentityRow. Keeps identity fields the
 *  name-merge mapper (mapAdminProductDocs) deliberately drops. */
export function toIdentityRow(id: string, data: Record<string, any>): IdentityRow {
  const images = Array.isArray(data.images) ? data.images : [];
  const source = String(data.source ?? "");
  return {
    id,
    name: String(data.name ?? ""),
    nameKey: nameKeyOf(data.name),
    source: source || "(none)",
    isActive: data.isActive !== false,
    isCopy: COPY_SOURCES.has(source),
    image: String(data.image || images[0] || ""),
    price: Number(data.price ?? 0),
    category: String(data.category ?? ""),
    sellMode: String(data.sellMode ?? ""),
    isOnline: data.isOnline === true,
    ownerId: String(data.ownerId ?? ""),
    ownerPhone: String(data.ownerPhone ?? ""),
    ownerType: String(data.ownerType ?? ""),
    manufacturerId: String(data.manufacturerId ?? ""),
    manufacturerPhone: String(data.manufacturerPhone ?? ""),
    retailerId: String(data.retailerId ?? ""),
    retailerPhone: String(data.retailerPhone ?? ""),
    originalProductId: String(data.originalProductId ?? ""),
    manufacturerProductId: String(data.manufacturerProductId ?? ""),
    variants: Array.isArray(data.variants)
      ? (data.variants as any[]).map((v) => ({
          unit: String(v?.unit ?? ""),
          price: Number(v?.price ?? 0),
          stock: typeof v?.stock === "number" ? v.stock : undefined,
        }))
      : [],
    canonicalId: String(data.canonicalId ?? ""),
    canonicalLinkedBy: String(data.canonicalLinkedBy ?? ""),
    createdAtMs: millis(data.createdAt),
  };
}

const sortByCreatedDesc = (a: IdentityRow, b: IdentityRow) => b.createdAtMs - a.createdAtMs;

/** One product doc by exact doc id. */
export async function fetchIdentityDocById(id: string): Promise<IdentityRow | null> {
  const snap = await getDoc(doc(db, "products", id.trim()));
  return snap.exists() ? toIdentityRow(snap.id, snap.data() as Record<string, any>) : null;
}

/**
 * Every product doc sharing a normalized name — copies included — each as its
 * own row. Uses `cardMembers` (the name → product-id index Cloud Functions
 * maintain) because Firestore cannot query `products` case-insensitively by
 * name, then reads those product docs directly.
 */
export async function fetchIdentityDocsByName(name: string): Promise<IdentityRow[]> {
  const key = nameKeyOf(name);
  if (!key) return [];
  const members = await getDocs(query(collection(db, "cardMembers"), where("nameKey", "==", key)));
  const ids = members.docs.map((d) => d.id);
  if (ids.length === 0) return [];
  const byId = await getDocsByIds(db, "products", ids);
  return Array.from(byId, ([id, data]) => toIdentityRow(id, data as Record<string, any>)).sort(sortByCreatedDesc);
}

/** Product docs matching a single identifier field (owner / manufacturer / source). */
export async function fetchIdentityDocsByField(
  field: "ownerId" | "ownerPhone" | "manufacturerId" | "manufacturerPhone" | "retailerId" | "retailerPhone" | "source",
  value: string,
  max = 100,
): Promise<IdentityRow[]> {
  const v = value.trim();
  if (!v) return [];
  const snap = await getDocs(query(collection(db, "products"), where(field, "==", v), fsLimit(max)));
  return snap.docs.map((d) => toIdentityRow(d.id, d.data() as Record<string, any>)).sort(sortByCreatedDesc);
}

/** Owner search across the several fields a seller id can live under, deduped by doc id. */
export async function fetchIdentityDocsByOwner(value: string, max = 100): Promise<IdentityRow[]> {
  const fields = ["ownerId", "ownerPhone", "retailerId", "retailerPhone", "manufacturerId", "manufacturerPhone"] as const;
  const results = await Promise.all(fields.map((f) => fetchIdentityDocsByField(f, value, max)));
  const byId = new Map<string, IdentityRow>();
  for (const rows of results) for (const r of rows) byId.set(r.id, r);
  return Array.from(byId.values()).sort(sortByCreatedDesc);
}

/** All members of a canonical group: `products where canonicalId == id`. */
export async function fetchIdentityDocsByCanonicalId(canonicalId: string): Promise<IdentityRow[]> {
  const v = canonicalId.trim();
  if (!v) return [];
  const snap = await getDocs(query(collection(db, "products"), where("canonicalId", "==", v)));
  return snap.docs.map((d) => toIdentityRow(d.id, d.data() as Record<string, any>)).sort(sortByCreatedDesc);
}

/**
 * Pick the default authoritative doc for a link selection: prefer an active
 * manufacturer_inventory doc, else an active doc with an image, else the oldest.
 * Mirrors the Stage-0 review rule (and never a seed/stub when a real doc exists).
 */
export function defaultAuthoritative(rows: IdentityRow[]): IdentityRow | null {
  if (rows.length === 0) return null;
  const mfr = rows.filter((r) => r.source === "manufacturer_inventory" && r.isActive);
  const withImg = rows.filter((r) => r.isActive && r.image);
  const pool = (mfr.length ? mfr : withImg.length ? withImg : rows).slice();
  pool.sort((a, b) => a.createdAtMs - b.createdAtMs);
  return pool[0] ?? null;
}
