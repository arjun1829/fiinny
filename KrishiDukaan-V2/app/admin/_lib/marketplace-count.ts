/**
 * Sources of per-seller COPIES of a product. A marketplace card whose
 * canonical doc has one of these sources is a retailer-only listing promoted
 * to its own card (no manufacturer/admin product of that name exists), which
 * Admin → Overview counts separately.
 */
export const COPY_SOURCES = new Set(["admin_assigned", "retailer_inventory_copy", "manufacturer_assigned"]);
