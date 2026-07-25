import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ReceiptText, Package, Plus, Edit2, Trash2, Loader2, Save, X, Calculator, ShoppingCart, Download, FileSpreadsheet, FileDown, Search, Factory } from 'lucide-react';
import { query, onSnapshot, addDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection, getTenantDoc } from '../utils/tenantPath';
import { AGRI_CATEGORIES } from '../utils/constants';
import Papa from 'papaparse';

interface Product {
    id: string;
    productNumber?: string;
    category?: 'B2B' | 'B2C';
    type?: string;            // Agri category (Insecticide, Fertilizer, …) — POS filters on this
    name: string;
    description?: string;
    maxRetailPrice: number; // Piece MRP
    boxMaxRetailPrice?: number; // Box MRP
    retailerPrice: number;  // Piece PTR
    boxRetailerPrice?: number; // Box PTR
    purchasePrice: number;  // Piece Rate
    boxPurchasePrice?: number; // Box Rate
    sellingPrice: number;   // Piece Special Offer
    boxSellingPrice?: number; // Box Special Offer
    quantity: number;       // In Full Boxes
    loosePieces?: number;   // Loose pieces in stock
    boxCapacity: number;    // Pcs/Units per Box
    baseUnit: 'pcs' | 'ltr' | 'kg' | 'g' | 'ml';
    unitSize?: number;      // Size per piece
    unitMeasure?: 'pcs' | 'ltr' | 'kg' | 'g' | 'ml'; // Measure
    margin: string;
    gstPct?: number;
    imageUrl?: string;
    // ── Traceability, written by the Supplier Ledger via utils/inventoryPosting.ts.
    // These land on the product master whenever a supplier invoice is posted, so
    // the rate sheet must read the exact same field names it writes.
    mfgCompany?: string;
    batchNumber?: string;
    mfgDate?: string;       // 'YYYY-MM-DD'
    expiryDate?: string;    // 'YYYY-MM-DD'
    hsnCode?: string;
}

// ── Display helpers ──────────────────────────────────────────────────────────

const fmtDate = (s?: string) => {
    if (!s) return '';
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
};

const boxOf = (piece: number | undefined, box: number | undefined, capacity: number) =>
    box || Math.round((piece || 0) * (capacity || 1) * 100) / 100;

const totalPieces = (p: Product) =>
    (p.quantity || 0) * (p.boxCapacity || 1) + (p.loosePieces || 0);

const LOW_STOCK_BOXES = 5;
const EXPIRY_WARN_DAYS = 90;

/** Single-word stock/expiry state so the column holds one value, not a badge stack. */
const statusOf = (p: Product): { label: string; tone: string } => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (p.expiryDate) {
        const e = new Date(p.expiryDate);
        if (!isNaN(e.getTime())) {
            if (e < today) return { label: 'Expired', tone: 'var(--danger)' };
            if ((e.getTime() - today.getTime()) / 86_400_000 <= EXPIRY_WARN_DAYS) {
                return { label: 'Expiring soon', tone: 'var(--warning)' };
            }
        }
    }
    if ((p.quantity || 0) < LOW_STOCK_BOXES) return { label: 'Low stock', tone: 'var(--danger)' };
    return { label: 'OK', tone: 'var(--text-tertiary)' };
};

// ── Column model ─────────────────────────────────────────────────────────────
// One definition drives the table header, the table cells, the CSV template, the
// CSV export and the CSV import. Keeping them in one place is what guarantees a
// clean Excel round-trip: every cell holds exactly one value, and the header a
// user exports is the header the importer accepts back.

type ColKind = 'text' | 'num' | 'money' | 'date';

interface Col {
    /** Product field this column reads/writes. Omitted for derived columns. */
    field?: keyof Product;
    header: string;
    kind: ColKind;
    /** Value shown on screen and written to CSV. */
    value: (p: Product) => string | number;
    /** Cost data — rendered only for roles allowed to see purchase pricing. */
    cost?: boolean;
    /** Computed on the fly; exported for convenience but ignored on import. */
    readOnly?: boolean;
    tone?: (p: Product) => string | undefined;
}

function buildColumns(canSeeCost: boolean): Col[] {
    const cols: Col[] = [
        { field: 'productNumber', header: 'SKU', kind: 'text', value: p => p.productNumber || '' },
        { field: 'name', header: 'Product Name', kind: 'text', value: p => p.name || '' },
        { field: 'type', header: 'Category', kind: 'text', value: p => p.type || '' },
        { field: 'mfgCompany', header: 'Company', kind: 'text', value: p => p.mfgCompany || '' },
        { field: 'batchNumber', header: 'Batch No', kind: 'text', value: p => p.batchNumber || '' },
        { field: 'mfgDate', header: 'Mfg Date', kind: 'date', value: p => p.mfgDate || '' },
        {
            field: 'expiryDate', header: 'Expiry Date', kind: 'date', value: p => p.expiryDate || '',
            tone: p => statusOf(p).label === 'Expired' ? 'var(--danger)' : statusOf(p).label === 'Expiring soon' ? 'var(--warning)' : undefined,
        },
        { field: 'hsnCode', header: 'HSN', kind: 'text', value: p => p.hsnCode || '' },
        { field: 'gstPct', header: 'GST %', kind: 'num', value: p => p.gstPct ?? 0 },

        { field: 'maxRetailPrice', header: 'MRP', kind: 'money', value: p => p.maxRetailPrice || 0 },
        { field: 'boxMaxRetailPrice', header: 'Box MRP', kind: 'money', value: p => boxOf(p.maxRetailPrice, p.boxMaxRetailPrice, p.boxCapacity) },
        { field: 'retailerPrice', header: 'PTR (Retailer)', kind: 'money', value: p => p.retailerPrice || 0 },
        { field: 'boxRetailerPrice', header: 'Box PTR', kind: 'money', value: p => boxOf(p.retailerPrice, p.boxRetailerPrice, p.boxCapacity) },
        { field: 'sellingPrice', header: 'Selling (Farmer)', kind: 'money', value: p => p.sellingPrice || 0 },
        { field: 'boxSellingPrice', header: 'Box Selling', kind: 'money', value: p => boxOf(p.sellingPrice, p.boxSellingPrice, p.boxCapacity) },

        { field: 'purchasePrice', header: 'Rate (Purch)', kind: 'money', cost: true, value: p => p.purchasePrice || 0 },
        { field: 'boxPurchasePrice', header: 'Box Rate (Purch)', kind: 'money', cost: true, value: p => boxOf(p.purchasePrice, p.boxPurchasePrice, p.boxCapacity) },

        { field: 'margin', header: 'Margin', kind: 'text', readOnly: true, value: p => p.margin || '' },

        {
            field: 'quantity', header: 'Boxes', kind: 'num', value: p => p.quantity || 0,
            tone: p => (p.quantity || 0) < LOW_STOCK_BOXES ? 'var(--danger)' : undefined,
        },
        { field: 'loosePieces', header: 'Loose Pcs', kind: 'num', value: p => p.loosePieces || 0 },
        { header: 'Total Pcs', kind: 'num', readOnly: true, value: totalPieces },
        { field: 'boxCapacity', header: 'Pcs/Box', kind: 'num', value: p => p.boxCapacity || 1 },
        { field: 'baseUnit', header: 'Base Unit', kind: 'text', value: p => p.baseUnit || 'pcs' },
        { field: 'unitSize', header: 'Unit Size', kind: 'num', value: p => p.unitSize ?? 1 },
        { field: 'unitMeasure', header: 'Unit Measure', kind: 'text', value: p => p.unitMeasure || 'pcs' },
        { field: 'description', header: 'Description', kind: 'text', value: p => p.description || '' },
        { header: 'Status', kind: 'text', readOnly: true, value: p => statusOf(p).label, tone: p => statusOf(p).tone },
    ];
    return cols.filter(c => canSeeCost || !c.cost);
}

const isNumeric = (k: ColKind) => k === 'num' || k === 'money';

export default function RateSheetPage() {
    const { t } = useTranslation();
    const { userRole, tenantId } = useAuth();
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Catalog maintenance (add / edit / bulk upload) is open to analysts; purchase
    // cost and destructive deletes stay with admins. Firestore already permits
    // analyst writes on `products` (isAdminOrAnalyst in firestore.rules).
    const canManage = userRole === 'admin' || userRole === 'analyst';
    const canSeeCost = userRole === 'admin';
    const canDelete = userRole === 'admin';

    const columns = buildColumns(canSeeCost);

    // Suggest the next sequential SKU (KA-001, KA-002, …) so the user never has
    // to invent product codes by hand when adding a product.
    const generateNextSku = () => {
        let max = 0;
        products.forEach(p => {
            const m = /^KA-(\d+)$/i.exec((p.productNumber || '').trim());
            if (m) max = Math.max(max, parseInt(m[1], 10));
        });
        return `KA-${String(max + 1).padStart(3, '0')}`;
    };

    // Form State
    const emptyForm = {
        productNumber: '',
        name: '',
        type: '',
        description: '',
        maxRetailPrice: 0,
        boxMaxRetailPrice: 0,
        retailerPrice: 0,
        boxRetailerPrice: 0,
        purchasePrice: 0,
        boxPurchasePrice: 0,
        sellingPrice: 0,
        boxSellingPrice: 0,
        quantity: 0,
        loosePieces: 0,
        boxCapacity: 1,
        baseUnit: 'pcs' as 'pcs' | 'ltr' | 'kg' | 'g' | 'ml',
        unitSize: 1,
        unitMeasure: 'pcs' as 'pcs' | 'ltr' | 'kg' | 'g' | 'ml',
        gstPct: 5,
        category: 'B2B' as 'B2B' | 'B2C',
        imageUrl: '',
        mfgCompany: '',
        batchNumber: '',
        mfgDate: '',
        expiryDate: '',
        hsnCode: '',
    };
    const [formData, setFormData] = useState(emptyForm);
    const [imagePreview, setImagePreview] = useState<string | null>(null);

    useEffect(() => {
        if (!tenantId) return;
        const q = query(getTenantCollection(db, tenantId, 'products'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const productsData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Product[];
            productsData.sort((a, b) => a.name.localeCompare(b.name));
            setProducts(productsData);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [tenantId]);

    const handleOpenModal = (product?: Product) => {
        if (product) {
            setEditingProduct(product);
            setFormData({
                productNumber: product.productNumber || '',
                name: product.name,
                type: product.type || '',
                description: product.description || '',
                maxRetailPrice: product.maxRetailPrice || 0,
                boxMaxRetailPrice: product.boxMaxRetailPrice || 0,
                retailerPrice: product.retailerPrice || 0,
                boxRetailerPrice: product.boxRetailerPrice || 0,
                // Never load cost into form state for roles that can't see it.
                purchasePrice: canSeeCost ? (product.purchasePrice || 0) : 0,
                boxPurchasePrice: canSeeCost ? (product.boxPurchasePrice || 0) : 0,
                sellingPrice: product.sellingPrice || 0,
                boxSellingPrice: product.boxSellingPrice || (product as any).boxPrice || 0,
                quantity: product.quantity || 0,
                loosePieces: product.loosePieces || 0,
                boxCapacity: product.boxCapacity || 1,
                baseUnit: product.baseUnit || 'pcs',
                unitSize: product.unitSize || 1,
                unitMeasure: product.unitMeasure || 'pcs',
                gstPct: product.gstPct || 5,
                category: product.category || 'B2B',
                imageUrl: product.imageUrl || '',
                mfgCompany: product.mfgCompany || '',
                batchNumber: product.batchNumber || '',
                mfgDate: product.mfgDate || '',
                expiryDate: product.expiryDate || '',
                hsnCode: product.hsnCode || '',
            });
            setImagePreview(product.imageUrl || null);
        } else {
            setEditingProduct(null);
            setFormData({ ...emptyForm, productNumber: generateNextSku() });
            setImagePreview(null);
        }
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingProduct(null);
        setImagePreview(null);
    };

    // Resize + compress the chosen image before storing it.
    // Product images live inline on the Firestore product doc, which has a ~1MB
    // hard limit — a raw phone photo (2-7MB) overflows it and makes "Add Product"
    // silently fail. We downscale to <=1000px and re-encode as JPEG (~0.82) so the
    // result is ~100-250KB, comfortably under the limit.
    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onloadend = () => {
            const dataUrl = reader.result as string;
            const img = new Image();
            img.onload = () => {
                const MAX_DIM = 1000;
                let { width, height } = img;
                if (width > MAX_DIM || height > MAX_DIM) {
                    if (width >= height) { height = Math.round((height * MAX_DIM) / width); width = MAX_DIM; }
                    else { width = Math.round((width * MAX_DIM) / height); height = MAX_DIM; }
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) { setImagePreview(dataUrl); setFormData(prev => ({ ...prev, imageUrl: dataUrl })); return; }
                ctx.drawImage(img, 0, 0, width, height);
                const compressed = canvas.toDataURL('image/jpeg', 0.82);
                setImagePreview(compressed);
                setFormData(prev => ({ ...prev, imageUrl: compressed }));
            };
            // Non-decodable (e.g. SVG) — fall back to the raw data URL.
            img.onerror = () => { setImagePreview(dataUrl); setFormData(prev => ({ ...prev, imageUrl: dataUrl })); };
            img.src = dataUrl;
        };
        reader.readAsDataURL(file);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const margin = formData.maxRetailPrice > 0
            ? `${Math.round(((formData.maxRetailPrice - formData.retailerPrice) / formData.maxRetailPrice) * 100)}%`
            : 'N/A';

        const { purchasePrice, boxPurchasePrice, ...costFree } = formData;
        // Analysts submit the form without ever holding a cost value — omit the
        // keys entirely so saving can't blank out an admin-entered purchase rate.
        const productData: Record<string, unknown> = {
            ...(canSeeCost ? formData : costFree),
            margin,
            updatedAt: serverTimestamp(),
        };

        // Final safety net: a Firestore document is capped at ~1MB. If an image
        // somehow remains oversized, fail loudly with a clear message rather than
        // a generic error.
        if ((formData.imageUrl?.length || 0) > 900_000) {
            alert('That product photo is too large even after compression. Please pick a smaller image and try again.');
            return;
        }

        try {
            if (editingProduct) {
                await updateDoc(getTenantDoc(db, tenantId!, 'products', editingProduct.id), productData);
            } else {
                await addDoc(getTenantCollection(db, tenantId!, 'products'), {
                    ...productData,
                    createdAt: serverTimestamp()
                });
            }
            handleCloseModal();
        } catch (error: any) {
            console.error("Error saving product:", error);
            alert(`${t('inventory.save_error') || 'Failed to save product.'}\n\n${error?.message || error}`);
        }
    };

    const handleDelete = async (id: string) => {
        if (!tenantId || !window.confirm(t('worklist.delete_confirm'))) return;
        try {
            await deleteDoc(getTenantDoc(db, tenantId, 'products', id));
        } catch (error) {
            console.error("Error deleting product:", error);
            alert(t('manage_retailers.delete_error'));
        }
    };

    // ── CSV: template / export / import all share the `columns` model ─────────

    const downloadCsv = (rows: Record<string, string | number>[], filename: string) => {
        const csv = Papa.unparse(rows, { columns: columns.map(c => c.header) });
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleDownloadTemplate = () => {
        const sample: Record<string, string | number> = {};
        columns.forEach(c => {
            sample[c.header] = c.kind === 'date' ? '2027-03-31'
                : c.kind === 'money' ? 0
                    : c.kind === 'num' ? 1
                        : '';
        });
        sample['SKU'] = 'KA-001';
        sample['Product Name'] = 'Sample Fertilizer';
        sample['Category'] = 'Fertilizer';
        sample['Company'] = 'Sample Agro Ltd';
        sample['Batch No'] = 'B-1234';
        downloadCsv([sample], 'inventory_template.csv');
    };

    const handleExport = () => {
        const rows = visibleProducts.map(p => {
            const row: Record<string, string | number> = {};
            columns.forEach(c => { row[c.header] = c.value(p); });
            return row;
        });
        const stamp = new Date().toISOString().slice(0, 10);
        downloadCsv(rows, `rate_sheet_${stamp}.csv`);
    };

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !tenantId) return;

        setLoading(true);
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                try {
                    let updatedCount = 0;
                    let addedCount = 0;

                    for (const raw of results.data as Record<string, string>[]) {
                        const row = raw as Record<string, string | undefined>;
                        const name = (row['Product Name'] ?? '').trim();
                        if (!name) continue;

                        // Blank cell → omit the field. A partial sheet (say, one with
                        // no cost column because an analyst exported it) must never
                        // reset the values it simply didn't carry.
                        const productData: Record<string, unknown> = {};
                        for (const c of columns) {
                            if (!c.field || c.readOnly) continue;
                            const cell = (row[c.header] ?? '').trim();
                            if (cell === '') continue;
                            if (isNumeric(c.kind)) {
                                const n = Number(cell);
                                if (Number.isFinite(n)) productData[c.field] = n;
                            } else {
                                productData[c.field] = cell;
                            }
                        }
                        productData.name = name;
                        productData.updatedAt = serverTimestamp();

                        const productNumber = (row['SKU'] ?? '').trim();
                        const existing = products.find(p =>
                            (productNumber && p.productNumber === productNumber) ||
                            (p.name.toLowerCase() === name.toLowerCase())
                        );

                        // Recompute margin from the merged (existing + incoming) prices.
                        const mrp = Number(productData.maxRetailPrice ?? existing?.maxRetailPrice ?? 0) || 0;
                        const ptr = Number(productData.retailerPrice ?? existing?.retailerPrice ?? 0) || 0;
                        productData.margin = mrp > 0 ? `${Math.round(((mrp - ptr) / mrp) * 100)}%` : 'N/A';

                        if (existing) {
                            await updateDoc(getTenantDoc(db, tenantId, 'products', existing.id), productData);
                            updatedCount++;
                        } else {
                            await addDoc(getTenantCollection(db, tenantId, 'products'), {
                                category: 'B2B',
                                baseUnit: 'pcs',
                                boxCapacity: 1,
                                gstPct: 0,
                                maxRetailPrice: 0,
                                retailerPrice: 0,
                                purchasePrice: 0,
                                sellingPrice: 0,
                                quantity: 0,
                                loosePieces: 0,
                                ...productData,
                                createdAt: serverTimestamp(),
                            });
                            addedCount++;
                        }
                    }
                    alert(`Upload Complete! \nAdded: ${addedCount}\nUpdated: ${updatedCount}`);
                } catch (error) {
                    console.error("Upload error:", error);
                    alert("Error processing CSV upload.");
                } finally {
                    setLoading(false);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                }
            }
        });
    };

    // One unified catalog — the old B2B/B2C split has been removed. The `category`
    // field is still written for backward compatibility but no longer filters.
    const visibleProducts = products.filter(p => {
        if (!searchTerm.trim()) return true;
        const q = searchTerm.toLowerCase();
        return p.name.toLowerCase().includes(q)
            || (p.productNumber || '').toLowerCase().includes(q)
            || (p.mfgCompany || '').toLowerCase().includes(q)
            || (p.batchNumber || '').toLowerCase().includes(q);
    });

    if (loading) {
        return (
            <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
                <Loader2 className="animate-spin" style={{ margin: '0 auto', marginBottom: '1rem' }} /> {t('common.loading')}
            </div>
        );
    }

    const thStyle = (c: Col): React.CSSProperties => ({
        padding: '0.75rem 0.85rem',
        fontWeight: 600,
        textAlign: isNumeric(c.kind) ? 'right' : 'left',
        whiteSpace: 'nowrap',
    });

    const tdStyle = (c: Col, p: Product): React.CSSProperties => ({
        padding: '0.75rem 0.85rem',
        textAlign: isNumeric(c.kind) ? 'right' : 'left',
        whiteSpace: 'nowrap',
        color: c.tone?.(p) || 'var(--text-secondary)',
    });

    const renderCell = (c: Col, p: Product) => {
        const v = c.value(p);
        if (c.kind === 'money') return `₹${v}`;
        if (c.kind === 'date') return fmtDate(String(v));
        return v;
    };

    const totalCols = columns.length + 2 + (canManage ? 1 : 0); // + Sr + image

    return (
        <div className="animate-fade-in" style={{ maxWidth: '1600px', margin: '0 auto' }}>
            <div style={{ marginBottom: '2rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1 className="primary-gradient-text" style={{ fontSize: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                        <ReceiptText size={32} /> {t('inventory.title')}
                    </h1>
                    <p style={{ color: 'var(--text-secondary)' }}>One catalog — stock, MRP, retailer &amp; farmer pricing, and bulk uploads. Rates, batch, expiry and manufacturer details set from a supplier invoice land here automatically.</p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <button onClick={handleExport} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                        <FileDown size={16} /> Export CSV
                    </button>
                    {canManage && (
                        <>
                            <input
                                type="file"
                                accept=".csv"
                                ref={fileInputRef}
                                style={{ display: 'none' }}
                                onChange={handleFileUpload}
                            />
                            <button onClick={handleDownloadTemplate} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                                <Download size={16} /> CSV Template
                            </button>
                            <button onClick={() => fileInputRef.current?.click()} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                                <FileSpreadsheet size={16} /> Upload CSV
                            </button>
                            <button onClick={() => handleOpenModal()} className="btn btn-primary animate-pulse" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Plus size={18} /> {t('inventory.add_product')}
                            </button>
                        </>
                    )}
                </div>
            </div>

            <div style={{ position: 'relative', width: '100%', marginBottom: '1.5rem' }}>
                <Search size={20} style={{ position: 'absolute', left: '1.1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                <input
                    type="text"
                    className="input-field"
                    placeholder={`Search by name, SKU, company or batch… (${visibleProducts.length} products)`}
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    style={{ paddingLeft: '3rem', paddingRight: '3rem', margin: 0, height: '54px', fontSize: '1.05rem', borderRadius: '14px', width: '100%', boxSizing: 'border-box' }}
                />
                {searchTerm && (
                    <button onClick={() => setSearchTerm('')} title="Clear" style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex' }}>
                        <X size={18} />
                    </button>
                )}
            </div>

            {/* Every cell holds exactly one value — copying a block into Excel keeps
                its row/column shape instead of splitting on the second line. */}
            <div className="glass-panel" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--surface-border)', color: 'var(--text-secondary)' }}>
                            <th style={{ padding: '0.75rem 0.85rem', fontWeight: 600, width: '56px' }}>Sr.</th>
                            <th style={{ padding: '0.75rem 0.85rem', fontWeight: 600, width: '60px' }}>Photo</th>
                            {columns.map(c => <th key={c.header} style={thStyle(c)}>{c.header}</th>)}
                            {canManage && <th style={{ padding: '0.75rem 0.85rem', fontWeight: 600, textAlign: 'center' }}>{t('common.actions')}</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {visibleProducts.map((product, i) => (
                            <tr
                                key={product.id}
                                style={{
                                    borderBottom: '1px solid var(--surface-border)',
                                    transition: 'background-color 0.2s',
                                }}
                                onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--surface-raised)'}
                                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                <td style={{ padding: '0.75rem 0.85rem', color: 'var(--text-tertiary)', fontWeight: 500 }}>{i + 1}</td>
                                <td style={{ padding: '0.75rem 0.85rem' }}>
                                    <div style={{
                                        width: '36px', height: '36px', borderRadius: '8px', overflow: 'hidden',
                                        background: 'hsla(152, 60%, 40%, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                        {product.imageUrl ? (
                                            <img src={product.imageUrl} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        ) : (
                                            <Package size={16} color="var(--primary-light)" />
                                        )}
                                    </div>
                                </td>
                                {columns.map(c => (
                                    <td key={c.header} style={tdStyle(c, product)}>{renderCell(c, product)}</td>
                                ))}
                                {canManage && (
                                    <td style={{ padding: '0.75rem 0.85rem', textAlign: 'center' }}>
                                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                                            <button onClick={() => handleOpenModal(product)} className="btn btn-secondary" style={{ padding: '0.4rem' }}><Edit2 size={14} /></button>
                                            {canDelete && (
                                                <button onClick={() => handleDelete(product.id)} className="btn" style={{ padding: '0.4rem', background: 'hsla(0, 84%, 60%, 0.1)', color: 'var(--danger)', border: '1px solid hsla(0, 84%, 60%, 0.2)' }}><Trash2 size={14} /></button>
                                            )}
                                        </div>
                                    </td>
                                )}
                            </tr>
                        ))}
                        {visibleProducts.length === 0 && (
                            <tr>
                                <td colSpan={totalCols} style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                    <Package size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.3, display: 'block' }} />
                                    {searchTerm
                                        ? <div>No products match "<strong>{searchTerm}</strong>".</div>
                                        : <div>No products yet.</div>}
                                    {canManage && (
                                        <button onClick={() => handleOpenModal()} className="btn btn-primary" style={{ marginTop: '1rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <Plus size={16} /> {t('inventory.add_product')}
                                        </button>
                                    )}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal — rendered via portal to document.body so it escapes the page's
                .animate-fade-in transform (a transformed ancestor becomes the
                containing block for position:fixed, which previously broke centering
                and left a huge blank scroll area). */}
            {isModalOpen && createPortal(
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(8px)', padding: '1rem' }}>
                    <div className="glass-panel animate-scale-in" style={{ width: '95vw', maxWidth: '1300px', maxHeight: '95vh', position: 'relative', display: 'flex', flexDirection: 'column', boxShadow: 'var(--neon-glow)', overflow: 'hidden' }}>

                        {/* Sticky Header — always visible, close button here */}
                        <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid var(--surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <div style={{ padding: '0.65rem', background: 'hsla(152, 60%, 40%, 0.1)', borderRadius: '12px', color: 'var(--primary-light)' }}>
                                    {editingProduct ? <Edit2 size={22} /> : <Plus size={22} />}
                                </div>
                                <div>
                                    <h2 style={{ fontSize: '1.5rem', margin: 0 }}>{editingProduct ? t('inventory.edit_product') : t('inventory.add_new_product')}</h2>
                                    <p style={{ color: 'var(--text-tertiary)', margin: 0, fontSize: '0.85rem' }}>{editingProduct ? t('inventory.modal_desc_edit') : t('inventory.modal_desc_add')}</p>
                                </div>
                            </div>
                            <button onClick={handleCloseModal} style={{ background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', color: 'var(--text-secondary)', cursor: 'pointer', width: '44px', height: '44px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', flexShrink: 0 }} onMouseOver={e => { e.currentTarget.style.background = 'hsla(0,84%,60%,0.1)'; e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.borderColor = 'var(--danger)'; }} onMouseOut={e => { e.currentTarget.style.background = 'var(--surface-raised)'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--surface-border)'; }}>
                                <X size={22} />
                            </button>
                        </div>

                        {/* Scrollable Form Body */}
                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', flex: 1, minHeight: 0, overflowY: 'auto', padding: '1.5rem 2rem 1.5rem 2rem' }}>
                            {/* Section 1: Basic Info */}
                            <div className="glass-panel" style={{ padding: '1.25rem', background: 'hsla(0, 0%, 100%, 0.02)', border: '1px solid var(--surface-border)' }}>
                                <h3 style={{ fontSize: '0.95rem', color: 'var(--primary-light)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Package size={16} /> {t('inventory.product_basics')}
                                </h3>

                                <div style={{ display: 'flex', gap: '2rem', marginBottom: '1.5rem' }}>
                                    <div style={{ position: 'relative', width: '120px', height: '120px', borderRadius: '12px', border: '2px dashed var(--surface-border)', background: 'var(--surface-raised)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        {imagePreview ? (
                                            <img src={imagePreview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        ) : (
                                            <div style={{ textAlign: 'center', color: 'var(--text-tertiary)' }}>
                                                <Plus size={24} style={{ margin: '0 auto' }} />
                                                <div style={{ fontSize: '0.7rem', marginTop: '4px' }}>Add Photo</div>
                                            </div>
                                        )}
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={handleImageChange}
                                            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                                        />
                                    </div>
                                    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '1rem' }}>
                                        <div>
                                            <label className="input-label">Product No. (SKU)</label>
                                            <input className="input-field" value={formData.productNumber} onChange={e => setFormData({ ...formData, productNumber: e.target.value })} placeholder="e.g. KA-001" />
                                        </div>
                                        <div>
                                            <label className="input-label">{t('inventory.table_name')} *</label>
                                            <input required className="input-field" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Tomato Seeds Hybrid-X" />
                                        </div>
                                        <div>
                                            <label className="input-label">GST %</label>
                                            <input type="number" min="0" className="input-field" value={formData.gstPct} onChange={e => setFormData({ ...formData, gstPct: Number(e.target.value) })} />
                                        </div>
                                        <div>
                                            <label className="input-label">Category</label>
                                            <select className="input-field" value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })}>
                                                <option value="">— Select category —</option>
                                                {AGRI_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                                    <div>
                                        <label className="input-label">{t('inventory.pcs_box')}</label>
                                        <input type="number" min="1" className="input-field" value={formData.boxCapacity} onChange={e => setFormData({ ...formData, boxCapacity: Number(e.target.value) })} />
                                    </div>
                                    <div>
                                        <label className="input-label">Base Unit</label>
                                        <select className="input-field" value={formData.baseUnit} onChange={e => setFormData({ ...formData, baseUnit: e.target.value as any })}>
                                            <option value="pcs">Pieces (pcs)</option>
                                            <option value="ltr">Liters (ltr)</option>
                                            <option value="kg">Kilograms (kg)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="input-label">Unit Size (qty/pc)</label>
                                        <input type="number" min="0" step="0.01" className="input-field" value={formData.unitSize} onChange={e => setFormData({ ...formData, unitSize: Number(e.target.value) })} />
                                    </div>
                                    <div>
                                        <label className="input-label">Unit Measure</label>
                                        <select className="input-field" value={formData.unitMeasure} onChange={e => setFormData({ ...formData, unitMeasure: e.target.value as any })}>
                                            <option value="pcs">Pieces (pcs)</option>
                                            <option value="ml">Milliliters (ml)</option>
                                            <option value="ltr">Liters (ltr)</option>
                                            <option value="g">Grams (g)</option>
                                            <option value="kg">Kilograms (kg)</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Section 2: Manufacturer & traceability — the same fields the
                                Supplier Ledger posts onto this product when an invoice is saved. */}
                            <div className="glass-panel" style={{ padding: '1.25rem', background: 'hsla(0, 0%, 100%, 0.02)', border: '1px solid var(--surface-border)' }}>
                                <h3 style={{ fontSize: '0.95rem', color: 'var(--text-primary)', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Factory size={16} /> Manufacturer &amp; Batch
                                </h3>
                                <p style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem', marginTop: 0, marginBottom: '1rem' }}>
                                    Auto-filled from the latest supplier invoice. Editing here overrides it until the next purchase is posted.
                                </p>
                                <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr', gap: '1rem' }}>
                                    <div>
                                        <label className="input-label">Company (Manufacturer)</label>
                                        <input className="input-field" value={formData.mfgCompany} onChange={e => setFormData({ ...formData, mfgCompany: e.target.value })} placeholder="e.g. Adama India" />
                                    </div>
                                    <div>
                                        <label className="input-label">Batch No.</label>
                                        <input className="input-field" value={formData.batchNumber} onChange={e => setFormData({ ...formData, batchNumber: e.target.value })} placeholder="e.g. B-1234" />
                                    </div>
                                    <div>
                                        <label className="input-label">Mfg Date</label>
                                        <input type="date" className="input-field" value={formData.mfgDate} onChange={e => setFormData({ ...formData, mfgDate: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="input-label">Expiry Date</label>
                                        <input type="date" className="input-field" value={formData.expiryDate} onChange={e => setFormData({ ...formData, expiryDate: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="input-label">HSN / SAC</label>
                                        <input className="input-field" value={formData.hsnCode} onChange={e => setFormData({ ...formData, hsnCode: e.target.value })} placeholder="e.g. 3808" />
                                    </div>
                                </div>
                                <div style={{ marginTop: '1rem' }}>
                                    <label className="input-label">Description</label>
                                    <input className="input-field" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="Optional notes shown on the rate sheet" />
                                </div>
                            </div>

                            {/* Section 3: Pricing — piece level + box level (one unified catalog) */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                                <div className="glass-panel" style={{ padding: '1.25rem', background: 'hsla(152, 60%, 40%, 0.03)', border: '1px solid hsla(152, 60%, 40%, 0.1)' }}>
                                    <h3 style={{ fontSize: '0.95rem', color: 'var(--primary-light)', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Calculator size={16} /> {t('inventory.piece_level')}</div>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', background: 'var(--surface-raised)', padding: '2px 8px', borderRadius: '4px' }}>Per piece</span>
                                    </h3>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        <div>
                                            <label className="input-label">MRP (Printed on pack)</label>
                                            <input type="number" step="0.01" className="input-field" value={formData.maxRetailPrice || ''} onChange={e => setFormData({ ...formData, maxRetailPrice: Number(e.target.value) })} placeholder="0.00" />
                                        </div>
                                        <div>
                                            <label className="input-label">PTR (Trade price to retailer)</label>
                                            <input type="number" step="0.01" className="input-field" value={formData.retailerPrice || ''} onChange={e => setFormData({ ...formData, retailerPrice: Number(e.target.value) })} placeholder="0.00" />
                                        </div>
                                        {canSeeCost && (
                                            <div>
                                                <label className="input-label">Rate (Your purchase cost)</label>
                                                <input type="number" step="0.01" className="input-field" value={formData.purchasePrice || ''} onChange={e => setFormData({ ...formData, purchasePrice: Number(e.target.value) })} placeholder="0.00" />
                                            </div>
                                        )}
                                        <div>
                                            <label className="input-label">Offer / Selling Price</label>
                                            <input type="number" step="0.01" className="input-field" value={formData.sellingPrice || ''} onChange={e => setFormData({ ...formData, sellingPrice: Number(e.target.value) })} placeholder="0.00" />
                                        </div>
                                    </div>
                                </div>
                                <div className="glass-panel" style={{ padding: '1.25rem', background: 'hsla(45, 93%, 47%, 0.03)', border: '1px solid hsla(45, 93%, 47%, 0.1)' }}>
                                    <h3 style={{ fontSize: '0.95rem', color: 'var(--secondary-light)', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><ShoppingCart size={16} /> {t('inventory.box_level')}</div>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', background: 'var(--surface-raised)', padding: '2px 8px', borderRadius: '4px' }}>{formData.boxCapacity} {formData.baseUnit}/box</span>
                                    </h3>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        <div>
                                            <label className="input-label">Box MRP</label>
                                            <input type="number" step="0.01" className="input-field" style={{ borderColor: 'hsla(45, 93%, 47%, 0.2)' }} value={formData.boxMaxRetailPrice || ''} onChange={e => setFormData({ ...formData, boxMaxRetailPrice: Number(e.target.value) })} placeholder={String(formData.maxRetailPrice * formData.boxCapacity || '')} />
                                        </div>
                                        <div>
                                            <label className="input-label">Box PTR (Trade)</label>
                                            <input type="number" step="0.01" className="input-field" style={{ borderColor: 'hsla(45, 93%, 47%, 0.2)' }} value={formData.boxRetailerPrice || ''} onChange={e => setFormData({ ...formData, boxRetailerPrice: Number(e.target.value) })} placeholder={String(formData.retailerPrice * formData.boxCapacity || '')} />
                                        </div>
                                        {canSeeCost && (
                                            <div>
                                                <label className="input-label">Box Rate (Purchase)</label>
                                                <input type="number" step="0.01" className="input-field" style={{ borderColor: 'hsla(45, 93%, 47%, 0.2)' }} value={formData.boxPurchasePrice || ''} onChange={e => setFormData({ ...formData, boxPurchasePrice: Number(e.target.value) })} placeholder={String(formData.purchasePrice * formData.boxCapacity || '')} />
                                            </div>
                                        )}
                                        <div>
                                            <label className="input-label">Box Offer / Selling</label>
                                            <input type="number" step="0.01" className="input-field" style={{ borderColor: 'hsla(45, 93%, 47%, 0.2)' }} value={formData.boxSellingPrice || ''} onChange={e => setFormData({ ...formData, boxSellingPrice: Number(e.target.value) })} placeholder={String(formData.sellingPrice * formData.boxCapacity || '')} />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Section 4: Stock Management */}
                            <div className="glass-panel" style={{ padding: '1.25rem', background: 'hsla(0, 0%, 100%, 0.02)', border: '1px solid var(--surface-border)' }}>
                                <h3 style={{ fontSize: '0.95rem', color: 'var(--text-primary)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Package size={16} /> {t('inventory.stock_management')}
                                </h3>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: '1rem', alignItems: 'flex-end' }}>
                                    <div>
                                        <label className="input-label">{t('inventory.boxes_in_stock')}</label>
                                        <input type="number" min="0" className="input-field" value={formData.quantity} onChange={e => setFormData({ ...formData, quantity: Number(e.target.value) })} />
                                    </div>
                                    <div>
                                        <label className="input-label">Loose Pieces</label>
                                        <input type="number" min="0" className="input-field" value={formData.loosePieces} onChange={e => setFormData({ ...formData, loosePieces: Number(e.target.value) })} />
                                    </div>
                                    <div style={{ fontSize: '0.875rem', color: 'var(--text-tertiary)', padding: '1rem', background: 'var(--surface-raised)', borderRadius: '8px' }}>
                                        Total pieces: <strong>{(formData.quantity * formData.boxCapacity) + formData.loosePieces}</strong> {formData.baseUnit}
                                    </div>
                                </div>
                            </div>

                            <button type="submit" className="btn btn-primary" style={{ width: '100%', height: '3.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', fontSize: '1.1rem', boxShadow: 'var(--neon-glow)', flexShrink: 0 }}>
                                <Save size={20} /> {editingProduct ? t('common.save') : t('inventory.add_product')}
                            </button>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            <div style={{ marginTop: '2rem', padding: '1rem', background: 'var(--surface-raised)', borderRadius: '10px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                <strong>{t('common.notes')}:</strong> {t('inventory.note_footer')}
            </div>
        </div>
    );
}
