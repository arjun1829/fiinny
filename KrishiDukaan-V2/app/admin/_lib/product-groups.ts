"use client";

import type { DocumentData } from "firebase/firestore";
import { db, mapAdminProductDocs } from "../../firebase";
import { getDocsByIds } from "../../lib/firestore-by-ids";
import type { MarketplaceProduct } from "../../../types/product";

// Seller-owned copies are surfaced via the "Assigned" column on their base
// product, so they are never rows of their own.
export const COPY_SOURCES = new Set(["admin_assigned", "retailer_inventory_copy", "manufacturer_assigned"]);

/**
 * The catalogue grouped by name, one row per product name: the canonical doc
 * (manufacturer_inventory, then admin, then the newest) with the sizes of
 * every doc in the group and `allDocIds` (the non-copy docs), plus
 * retailer-only listings promoted to their own row. Used on one name group at
 * a time (resolveGroup) before an edit or delete.
 */
export function groupProducts(products: MarketplaceProduct[], rawDocs: any[]): MarketplaceProduct[] {
  const groups = new Map<string, MarketplaceProduct[]>();
  for (const p of products) {
    if (COPY_SOURCES.has((p as any).source)) continue;
    const key = p.name.toLowerCase().trim();
    const arr = groups.get(key) ?? [];
    arr.push(p);
    groups.set(key, arr);
  }

  const result: MarketplaceProduct[] = [];
  const canonicalNames = new Set<string>();

  for (const [key, list] of Array.from(groups.entries())) {
    canonicalNames.add(key);

    // Find canonical one in group: prefer manufacturer_inventory, then admin, then retailer_inventory
    const canonical = list.find(p => p.source === 'manufacturer_inventory')
      || list.find(p => p.source === 'admin')
      || list[0];

    // Merge all variants from all docs in the list
    const mergedVariants: any[] = [];
    const seenVariantKeys = new Set<string>();

    for (const p of list) {
      if (p.variants && p.variants.length > 0) {
        for (const v of p.variants) {
          const vKey = `${v.unit}-${v.price}`;
          if (!seenVariantKeys.has(vKey)) {
            seenVariantKeys.add(vKey);
            mergedVariants.push(v);
          }
        }
      } else {
        // If no variants array, treat the product itself as a variant
        const unit = (p as any).unit || p.stock || "Standard";
        const vKey = `${unit}-${p.price}`;
        if (!seenVariantKeys.has(vKey)) {
          seenVariantKeys.add(vKey);
          mergedVariants.push({
            unit,
            price: p.price,
            stock: p.stock === 'Out of Stock' ? 0 : 50
          });
        }
      }
    }

    const allDocIds = list.map(p => p.id);

    result.push({
      ...canonical,
      variants: mergedVariants,
      allDocIds,
    } as any);
  }

  // Promoted copies: retailer-only listings (a copy whose name has no canonical match)
  // that the marketplace promotes to standalone cards.
  const promotedByName = new Map<string, any>();
  for (const raw of rawDocs) {
    if (!COPY_SOURCES.has(String(raw.source ?? ''))) continue;
    if (raw.isActive === false) continue;
    if (!raw.name || !raw.price) continue;
    if (!(raw.ownerId || raw.retailerId || raw.retailerPhone)) continue;
    const key = String(raw.name).toLowerCase().trim();
    if (canonicalNames.has(key)) continue;
    if (!promotedByName.has(key)) promotedByName.set(key, raw);
  }
  for (const raw of Array.from(promotedByName.values())) {
    const mapped = mapAdminProductDocs([raw])[0];
    if (mapped) result.push(mapped);
  }

  return result;
}

/** A table row from a marketplace card (one per product name). */
export function cardRow(cardId: string, card: DocumentData): MarketplaceProduct {
  const members: string[] = Array.isArray(card.memberIds) ? card.memberIds.map(String) : [];
  return {
    ...mapAdminProductDocs([{ ...card, id: String(card.id ?? cardId) }])[0],
    cardId,
    // Every doc of the name group (copies too): enough to count assignments.
    // Edits and deletes re-read the group first (resolveGroup).
    allDocIds: members.length ? members : [String(card.id ?? cardId)],
  } as any;
}

/**
 * The row's name group read fresh from `products` (its card's member docs),
 * grouped exactly as this page always did: the doc to edit and the non-copy
 * docs (allDocIds) an edit deactivates or a delete removes.
 */
export async function resolveGroup(row: MarketplaceProduct): Promise<MarketplaceProduct> {
  const ids: string[] = (row as any).allDocIds ?? [row.id];
  const docs = Array.from(await getDocsByIds(db, "products", ids), ([id, data]) => ({ id, ...data }));
  const nameKey = row.name.toLowerCase().trim();
  const group = groupProducts(mapAdminProductDocs(docs), docs)
    .find((p) => p.name.toLowerCase().trim() === nameKey);
  return group ? ({ ...group, cardId: (row as any).cardId } as any) : row;
}

