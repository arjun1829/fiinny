import {
    writeBatch, doc, getDoc, getDocs, query, where, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { getTenantCollection, getTenantDoc } from './tenantPath';

// ─────────────────────────────────────────────────────────────────────────────
// Supplier Invoice → Inventory posting
//
// Turns each supplier-invoice line into (a) a create/update on the tenant's
// `products` master (prices, manufacturer, current batch, stock) and (b) an
// `inventoryBatches` record for the expiry/traceability dashboard.
//
// Idempotency: the caller stores the returned `postedLines` snapshot on the
// supplier-invoice doc and passes it back on the next save. We first reverse the
// previously-posted stock, then apply the current lines — so editing or
// re-saving an invoice reconciles stock instead of double-counting. Batch docs
// use a deterministic id (`${invoiceId}_${index}`) so a re-save updates the same
// batch rather than creating duplicates.
// ─────────────────────────────────────────────────────────────────────────────

export interface PostedLine {
    productId: string;
    boxes: number;   // stock added to product.quantity (boxes)
    loose: number;   // stock added to product.loosePieces
}

export interface SupplierLineForPost {
    description: string;
    mfgCompany?: string;
    batchNo?: string;
    mfgDate?: string;
    expDate?: string;
    hsnCode?: string;
    unit?: string;
    quantity?: number;      // total selling units (fallback when packing not given)
    boxCount?: number;      // boxes / bags received
    piecesPerBox?: number;  // pieces per box/bag
    rate?: number;          // received / purchase rate (cost)
    mrp?: number;
    farmerRate?: number;    // sale rate to farmer (POS selling price)
    retailerRate?: number;  // price to retailer (B2B / PTR)
    gstPct?: number;
    // Remaining product-master fields, entered in the line's details panel.
    productNumber?: string; // SKU
    type?: string;          // agri category (Insecticide, Fertilizer, …)
    unitSize?: number;
    unitMeasure?: string;
    boxMrp?: number;
    boxPtr?: number;
    boxPurchase?: number;
    boxSelling?: number;
}

interface ExistingProductLite { id: string; name: string; }

const norm = (s: string) => (s || '').trim().toLowerCase();

// Field writers that emit nothing when the invoice line left the value blank, so
// a re-save never clobbers an existing product value with an empty/zero one.
const num = (key: string, v: unknown): Record<string, number> => {
    if (v === undefined || v === null || v === '') return {};
    const n = Number(v);
    return Number.isFinite(n) ? { [key]: n } : {};
};
const str = (key: string, v: unknown): Record<string, string> => {
    const s = typeof v === 'string' ? v.trim() : '';
    return s ? { [key]: s } : {};
};

// Split a line's received quantity into whole boxes + loose pieces.
function splitUnits(line: SupplierLineForPost): { boxes: number; loose: number; pcsPerBox: number; totalUnits: number } {
    const pcsPerBox = Math.max(0, Number(line.piecesPerBox) || 0);
    const boxes = Math.max(0, Number(line.boxCount) || 0);
    const unitsFromBoxes = boxes * pcsPerBox;
    // When packing is given, trust it; otherwise fall back to the flat quantity.
    const totalUnits = (boxes > 0 && pcsPerBox > 0) ? unitsFromBoxes : Math.max(0, Number(line.quantity) || 0);
    const loose = Math.max(0, totalUnits - unitsFromBoxes);
    return { boxes, loose, pcsPerBox, totalUnits };
}

/**
 * Reconcile a supplier invoice into products + inventoryBatches.
 * Returns the new postedLines snapshot to persist on the invoice doc.
 */
export async function postSupplierInvoiceToInventory(
    tenantId: string,
    invoiceId: string,
    lines: SupplierLineForPost[],
    supplierName: string,
    existingProducts: ExistingProductLite[],
    prevPosted: PostedLine[] = [],
): Promise<PostedLine[]> {
    if (!tenantId || !invoiceId) return prevPosted;

    const active = lines.filter(l => (l.description || '').trim());

    // ── Resolve each active line to a product id (existing by name, else new) ──
    const byName = new Map(existingProducts.map(p => [norm(p.name), p.id]));
    const resolved: Array<{ line: SupplierLineForPost; productId: string; isNew: boolean; index: number }> = [];
    for (let i = 0; i < active.length; i++) {
        const line = active[i];
        let productId = byName.get(norm(line.description));
        let isNew = false;
        if (!productId) {
            // Not in the loaded list — double-check Firestore, then create.
            const snap = await getDocs(query(
                getTenantCollection(db, tenantId, 'products'),
                where('name', '==', line.description.trim()),
            ));
            if (!snap.empty) {
                productId = snap.docs[0].id;
            } else {
                productId = doc(getTenantCollection(db, tenantId, 'products')).id;
                isNew = true;
                byName.set(norm(line.description), productId); // dedupe repeated names in one invoice
            }
        }
        resolved.push({ line, productId, isNew, index: i });
    }

    // ── Aggregate net stock delta per product (apply now − reverse previous) ──
    type Agg = { boxesDelta: number; looseDelta: number; master?: any; isNew: boolean };
    const agg = new Map<string, Agg>();
    const ensure = (id: string, isNew = false): Agg => {
        let a = agg.get(id);
        if (!a) { a = { boxesDelta: 0, looseDelta: 0, isNew }; agg.set(id, a); }
        if (isNew) a.isNew = true;
        return a;
    };

    // Reverse previous contribution
    for (const p of prevPosted) {
        if (!p.productId) continue;
        const a = ensure(p.productId);
        a.boxesDelta -= Number(p.boxes) || 0;
        a.looseDelta -= Number(p.loose) || 0;
    }

    // Apply current lines
    const newPosted: PostedLine[] = [];
    for (const r of resolved) {
        const { boxes, loose, pcsPerBox } = splitUnits(r.line);
        const a = ensure(r.productId, r.isNew);
        a.boxesDelta += boxes;
        a.looseDelta += loose;
        // Master fields — last line for a product wins (typical: one line per product).
        // The supplier ledger is the source of truth for rates, so whatever this
        // invoice supplies overwrites the product master. Fields the line leaves
        // blank are omitted entirely so a blank never resets an existing value
        // (e.g. an untouched MRP must not become 0).
        a.master = {
            name: r.line.description.trim(),
            ...str('mfgCompany', r.line.mfgCompany),
            ...num('purchasePrice', r.line.rate),
            ...num('maxRetailPrice', r.line.mrp),
            ...num('sellingPrice', r.line.farmerRate),
            ...num('retailerPrice', r.line.retailerRate),
            ...num('boxPurchasePrice', r.line.boxPurchase),
            ...num('boxMaxRetailPrice', r.line.boxMrp),
            ...num('boxSellingPrice', r.line.boxSelling),
            ...num('boxRetailerPrice', r.line.boxPtr),
            ...num('gstPct', r.line.gstPct),
            ...str('productNumber', r.line.productNumber),
            ...str('type', r.line.type),
            ...num('unitSize', r.line.unitSize),
            ...str('unitMeasure', r.line.unitMeasure),
            ...str('baseUnit', r.line.unit),
            ...(pcsPerBox > 0 ? { boxCapacity: pcsPerBox } : {}),
            ...str('batchNumber', r.line.batchNo),
            ...str('expiryDate', r.line.expDate),
            ...str('mfgDate', r.line.mfgDate),
            ...str('hsnCode', r.line.hsnCode),
        };
        newPosted.push({ productId: r.productId, boxes, loose });
    }

    // ── Read current products so we can clamp stock at 0 and recompute margin
    //    from the merged (existing + incoming) prices ──
    const currentStock = new Map<string, { quantity: number; loosePieces: number; data: any }>();
    await Promise.all(Array.from(agg.entries()).map(async ([id, a]) => {
        if (a.isNew) { currentStock.set(id, { quantity: 0, loosePieces: 0, data: {} }); return; }
        try {
            const snap = await getDoc(getTenantDoc(db, tenantId, 'products', id));
            const d = snap.exists() ? snap.data() as any : {};
            currentStock.set(id, {
                quantity: Number(d.quantity ?? d.stock ?? 0) || 0,
                loosePieces: Number(d.loosePieces ?? 0) || 0,
                data: d,
            });
        } catch {
            currentStock.set(id, { quantity: 0, loosePieces: 0, data: {} });
        }
    }));

    // ── Write everything atomically ──
    const batch = writeBatch(db);

    for (const [id, a] of agg.entries()) {
        const cur = currentStock.get(id) || { quantity: 0, loosePieces: 0, data: {} };
        const newQty = Math.max(0, cur.quantity + a.boxesDelta);
        const newLoose = Math.max(0, cur.loosePieces + a.looseDelta);
        const ref = getTenantDoc(db, tenantId, 'products', id);

        // Margin is derived from the merged MRP/PTR (same formula as RateSheetPage).
        const mergedMrp = Number(a.master?.maxRetailPrice ?? cur.data?.maxRetailPrice ?? 0) || 0;
        const mergedPtr = Number(a.master?.retailerPrice ?? cur.data?.retailerPrice ?? 0) || 0;
        const margin = mergedMrp > 0
            ? `${Math.round(((mergedMrp - mergedPtr) / mergedMrp) * 100)}%`
            : 'N/A';

        const base = {
            quantity: newQty,
            loosePieces: newLoose,
            margin,
            lastPurchasedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            ...(a.master || {}),
        };
        if (a.isNew) {
            batch.set(ref, {
                // Defaults first so a product created straight from a purchase is
                // well-formed even when the line left optional fields blank;
                // `base` (the invoice's own values) overrides them.
                category: 'B2B',
                baseUnit: 'pcs',
                boxCapacity: 1,
                gstPct: 0,
                maxRetailPrice: 0,
                retailerPrice: 0,
                purchasePrice: 0,
                sellingPrice: 0,
                ...base,
                createdAt: serverTimestamp(),
            });
        } else {
            batch.set(ref, base, { merge: true });
        }
    }

    // One inventoryBatches doc per active line (deterministic id → idempotent).
    for (const r of resolved) {
        const { boxes, pcsPerBox, totalUnits } = splitUnits(r.line);
        const ref = getTenantDoc(db, tenantId, 'inventoryBatches', `${invoiceId}_${r.index}`);
        batch.set(ref, {
            productId: r.productId,
            productName: r.line.description.trim(),
            mfgCompany: (r.line.mfgCompany || '').trim(),
            batchNumber: (r.line.batchNo || '').trim(),
            mfgDate: r.line.mfgDate || '',
            expiryDate: r.line.expDate || '',
            hsnCode: (r.line.hsnCode || '').trim(),
            mrp: Number(r.line.mrp) || 0,
            purchaseRate: Number(r.line.rate) || 0,
            retailerRate: Number(r.line.retailerRate) || 0,
            farmerRate: Number(r.line.farmerRate) || 0,
            quantity: totalUnits,
            boxCount: boxes,
            piecesPerBox: pcsPerBox,
            unit: (r.line.unit || '').trim() || 'pcs',
            supplier: (supplierName || '').trim(),
            sourceInvoiceId: invoiceId,
            updatedAt: serverTimestamp(),
        }, { merge: true });
    }

    // Remove stale batch docs from a previous save that had more lines than now.
    for (let i = active.length; i < prevPosted.length; i++) {
        batch.delete(getTenantDoc(db, tenantId, 'inventoryBatches', `${invoiceId}_${i}`));
    }

    await batch.commit();
    return newPosted;
}
