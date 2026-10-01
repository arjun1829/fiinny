import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  Package, Plus, Edit2, Trash2, Loader2, Save, X, Download,
  FileSpreadsheet, FileDown, AlertTriangle,
} from 'lucide-react';
import { query, onSnapshot, addDoc, updateDoc, serverTimestamp, getDocs, where } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { softDelete } from '../utils/softDelete';
import { db, storage } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useFeaturePermissions } from '../hooks/useFeaturePermissions';
import { getTenantCollection, getTenantDoc } from '../utils/tenantPath';
import { logAudit } from '../utils/auditLog';
import { AGRI_CATEGORIES } from '../utils/constants';
import Papa from 'papaparse';
import {
  type NumFilter, EMPTY_NUM, matchNum, isNumActive,
  HDR_COL_STYLE, SortLabel, ColumnTextFilter, ColumnNumFilter, ColumnSelectFilter,
} from '../components/tableFilters';
import { useColumnLayout } from '../hooks/useColumnLayout';

// ── Interfaces ────────────────────────────────────────────────────────────────

interface Product {
  id: string;
  productNumber?: string;
  name: string;
  type?: string;         // Category (predefined or free-text "Others" value)
  mfgCompany?: string;   // Manufacturer
  description?: string;
  unitSize?: number;
  unitMeasure?: string;
  baseUnit?: string;
  gstPct?: number;
  maxRetailPrice: number;
  retailerPrice?: number;   // PTR — kept for POS/B2B compatibility
  purchasePrice: number;
  sellingPrice: number;
  // Stock fields (written by POS/inventoryPosting; read-only here)
  quantity?: number;
  loosePieces?: number;
  boxCapacity?: number;
  margin?: string;
  imageUrl?: string;
  // Firebase Storage bookkeeping for imageUrl — present only for products whose
  // photo was uploaded after the Storage migration. Absent (undefined) on older
  // products whose imageUrl is still a base64 data URL stored inline; those
  // continue to render exactly as before since imageUrl is just an <img src>.
  imagePath?: string;
  imageUploadedAt?: unknown;
  // Reference batch info — last known values, auto-populated by Purchase Invoice
  // posting (see inventoryPosting.ts). The authoritative per-batch records live
  // in the separate `inventoryBatches` collection (InventoryBatchPage).
  batchNumber?: string;
  mfgDate?: string;
  expiryDate?: string;
}

interface BatchItem {
  id: string;
  productId: string;
  productName?: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  purchaseRate?: number;
  mrp?: number;
}

const LOW_STOCK = 100;
const EXPIRY_WARN_DAYS = 90;

const totalStock = (p: Product) =>
  (p.loosePieces ?? 0) + (p.quantity ?? 0) * (p.boxCapacity ?? 1);

const fmtDate = (s?: string) => {
  if (!s) return '';
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
};

const daysUntil = (dateStr: string) => {
  if (!dateStr) return 999;
  const d = new Date(dateStr);
  return Math.floor((d.getTime() - Date.now()) / 86_400_000);
};

// CSV columns — single source of truth for template, export, and import.
// Order mirrors the table's default column order (# / Photo are not
// data fields so they're excluded; Batch No. and Stock are included so the
// table's own columns fully round-trip through export → template → upload).
const CSV_COLS = [
  { field: 'productNumber', header: 'SKU', num: false },
  { field: 'name', header: 'Product Name', num: false },
  { field: 'type', header: 'Category', num: false },
  { field: 'mfgCompany', header: 'Manufacturer', num: false },
  { field: 'batchNumber', header: 'Batch No.', num: false },
  { field: 'unitSize', header: 'Unit Size', num: true },
  { field: 'unitMeasure', header: 'Unit Measure', num: false },
  { field: 'baseUnit', header: 'Base Unit', num: false },
  { field: 'gstPct', header: 'GST %', num: true },
  { field: 'maxRetailPrice', header: 'MRP', num: true },
  { field: 'retailerPrice', header: 'Retailer Price', num: true },
  { field: 'purchasePrice', header: 'Purchase Rate', num: true },
  { field: 'sellingPrice', header: 'Sales Rate', num: true },
  // Stock is a derived/computed value in the table (batch-aggregate, falling
  // back to the product doc's own loosePieces/quantity*boxCapacity — see
  // rowStock()/totalStock() below), not a single stored field, so it can't
  // use the generic `field` lookup the other columns use. It's handled with
  // explicit special-case logic in handleExport/handleDownloadTemplate/
  // handleFileUpload below, writing/reading the product doc's `loosePieces`
  // field — the same field the Add/Edit modal's Stock Quantity input uses
  // (see `loosePieces: formData.stockQty` in handleSubmit).
  { field: 'stock', header: 'Stock', num: true } as const,
] as const;

// CSV_COLS entries handled generically (simple 1:1 field read/write). 'stock'
// is excluded — see the comment above on its CSV_COLS entry.
const CSV_DATA_COLS = CSV_COLS.filter(c => c.field !== 'stock');

const UNIT_MEASURES = ['pcs', 'ml', 'ltr', 'g', 'kg'] as const;
const GST_OPTIONS = [0, 5, 12, 18, 28];
const MAX_GST_PCT = 100;

// ── Product photo upload constraints ────────────────────────────────────────
// The compressed photo is uploaded to Firebase Storage at
// tenants/{tenantId}/product-images/{productId-or-timestamp} — nested under
// tenants/{tenantId}/ like every other upload in this app (uploadPaymentProof,
// AdminStoreProductsPage) so it's covered by the existing storage.rules
// tenant-scoped read/write rule without requiring a rules change. Only the
// resulting download URL (plus imagePath for later replacement/deletion) is
// stored on the product document, so there's no Firestore document-size
// concern here.
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB pre-compression cap
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const IMAGE_MAX_DIM = 1200;
const IMAGE_QUALITY_START = 0.85;
const IMAGE_QUALITY_MIN = 0.5;
const IMAGE_STORAGE_FOLDER = 'product-images';

const emptyForm = () => ({
  productNumber: '', name: '', type: '', otherType: '', mfgCompany: '', description: '',
  unitSize: 1, unit: 'pcs' as string,
  gstPct: 5, customGst: false, customGstValue: '',
  maxRetailPrice: 0, retailerPrice: 0, purchasePrice: 0, sellingPrice: 0,
  imageUrl: '', stockQty: 0,
  batchNumber: '', mfgDate: '', expiryDate: '',
});

// ── Column sort ───────────────────────────────────────────────────────────────
type SortCol =
  | 'batchNumber' | 'name' | 'type' | 'mfgCompany' | 'unitSize' | 'unitMeasure'
  | 'gstPct' | 'mrp' | 'purchase' | 'retail' | 'sales' | 'stock';

// ── Column layout config (drives resize / freeze / reorder / persistence) ──────
type PMColKey =
  | 'sr' | 'photo' | 'batchNumber' | 'name' | 'category' | 'mfg' | 'size' | 'unit'
  | 'gst' | 'mrp' | 'purchase' | 'retail' | 'sales' | 'stock' | 'actions';

// Order: # → Photo → Product Name → Category → Manufacturer → Batch No. → Size →
// Unit → GST % → MRP → Purch Rate → Retail Price → Sales Rate → Stock → Actions.
// Batch No. (a single reference string on the product master) sits after
// Manufacturer. This is distinct from the per-batch quantity ledger in the
// separate inventoryBatches collection (see InventoryBatchPage), which is not
// rendered as a table column here.
const PM_ALL_KEYS: PMColKey[] = [
  'sr', 'photo', 'name', 'category', 'mfg', 'batchNumber', 'size', 'unit',
  'gst', 'mrp', 'purchase', 'retail', 'sales', 'stock', 'actions',
];

const PM_LABELS: Record<PMColKey, string> = {
  sr: '#', photo: 'Photo', batchNumber: 'Batch No.', name: 'Product Name',
  category: 'Category', mfg: 'Manufacturer', size: 'Size', unit: 'Unit',
  gst: 'GST %', mrp: 'MRP', purchase: 'Purch Rate', retail: 'Retail Price',
  sales: 'Sales Rate', stock: 'Stock', actions: 'Actions',
};

// Batch No. kept intentionally compact (task requirement); the rest are sized to
// fit their filter control + header comfortably.
const PM_DEFAULT_WIDTHS: Record<PMColKey, number> = {
  sr: 56, photo: 68, batchNumber: 112, name: 220, category: 150, mfg: 165,
  size: 105, unit: 115, gst: 105, mrp: 120, purchase: 120, retail: 120,
  sales: 120, stock: 115, actions: 96,
};

const PM_ALIGN: Record<PMColKey, 'left' | 'right'> = {
  sr: 'left', photo: 'left', batchNumber: 'left', name: 'left', category: 'left',
  mfg: 'left', size: 'left', unit: 'left', gst: 'left', mrp: 'right',
  purchase: 'right', retail: 'right', sales: 'right', stock: 'right',
  actions: 'left',
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function RateSheetPage() {
  const { t } = useTranslation();
  const { userRole, tenantId, currentUser, userName } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState(emptyForm());
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageProcessing, setImageProcessing] = useState(false); // client-side compression
  const [imageUploading, setImageUploading] = useState(false);   // Storage upload on submit
  const [imageBlob, setImageBlob] = useState<Blob | null>(null); // compressed photo pending upload
  const [existingImagePath, setExistingImagePath] = useState<string | null>(null); // for delete-on-replace
  const [dupWarning, setDupWarning] = useState<string | null>(null);
  const [modalDirty, setModalDirty] = useState(false);
  const [confirmModalDiscard, setConfirmModalDiscard] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const canManage = userRole === 'admin' || userRole === 'analyst';

  // Feature-permission layer (Super Admin → Feature Permissions → Inventory →
  // Product Master). ANDed with the existing role gates so nothing is loosened.
  const can = useFeaturePermissions();
  const canAddProduct  = canManage && can('inventory.productMaster.add');
  const canEditProduct = canManage && can('inventory.productMaster.edit');
  const canExportCsv   = can('inventory.productMaster.csv.export');
  const canCsvTemplate = canManage && can('inventory.productMaster.csv.template');
  const canUploadCsv   = canManage && can('inventory.productMaster.csv.upload');

  // Editing the purchase rate stays admin-only (unchanged permission).
  const canSeeCost = userRole === 'admin';
  // Viewing the Purchase Rate column is allowed for Admin and Analyst. This is a
  // display-only flag — it never gates editing/writing the value (see canSeeCost
  // in the modal + save path), so no underlying permission or calculation changes.
  const canSeePurchaseRate = userRole === 'admin' || userRole === 'analyst';
  const canDelete = userRole === 'admin';

  // ── Column filters + sort ─────────────────────────────────────────────────
  const [fBatch, setFBatch]       = useState('');
  const [fCategory, setFCategory] = useState('');           // '' = all
  const [fMfg, setFMfg]           = useState('');
  const [fUnit, setFUnit]         = useState('');           // '' = all
  const [fSize, setFSize]         = useState<NumFilter>(EMPTY_NUM);
  const [fGst, setFGst]           = useState<NumFilter>(EMPTY_NUM);
  const [fMrp, setFMrp]           = useState<NumFilter>(EMPTY_NUM);
  const [fPurch, setFPurch]       = useState<NumFilter>(EMPTY_NUM);
  const [fRetail, setFRetail]     = useState<NumFilter>(EMPTY_NUM);
  const [fSales, setFSales]       = useState<NumFilter>(EMPTY_NUM);
  const [fStock, setFStock]       = useState<NumFilter>(EMPTY_NUM);

  const [sortCol, setSortCol] = useState<SortCol | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const toggleSort = (col: SortCol) => {
    if (sortCol === col) { if (sortDir === 'asc') setSortDir('desc'); else setSortCol(null); }
    else { setSortCol(col); setSortDir('asc'); }
  };

  // ── Column layout (resize / freeze / reorder / persistence) ────────────────
  const activeColKeys = useMemo(
    () => PM_ALL_KEYS.filter(k => (k !== 'purchase' || canSeePurchaseRate) && (k !== 'actions' || canManage)),
    [canSeePurchaseRate, canManage],
  );
  const layout = useColumnLayout<PMColKey>({
    keys: activeColKeys,
    // Place a newly-visible/absent column (e.g. Purchase Rate when it becomes
    // visible for Analyst, or an older saved order that predates it) at its
    // default position — after MRP — instead of appending it at the end. Keeps
    // the intended MRP → Purch Rate → Retail Price → Sales Rate sequence while
    // preserving the rest of a user's saved custom order.
    insertMissingAtDefaultIndex: true,
    defaultWidths: PM_DEFAULT_WIDTHS,
    labels: PM_LABELS,
    storageKey: 'fiinny_pm',
    tenantId,
  });

  // ── Data fetching ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!tenantId) return;
    const unsub1 = onSnapshot(
      query(getTenantCollection(db, tenantId, 'products')),
      snap => {
        try {
          // `name` is coerced here because a doc missing it made the sort below
          // throw *inside this listener* — async, so no error boundary catches
          // it — leaving the page on "Loading…" forever.
          const data = snap.docs
              .map(d => {
                const raw = d.data();
                return { id: d.id, ...raw, name: String(raw.name ?? '') } as Product;
              })
              .filter((p: any) => !p.deleted);
          data.sort((a, b) => a.name.localeCompare(b.name));
          setProducts(data);
        } finally {
          // Always clear the spinner: a stuck loader hides the problem, an
          // empty list at least shows the page.
          setLoading(false);
        }
      },
    );
    const unsub2 = onSnapshot(
      query(getTenantCollection(db, tenantId, 'inventoryBatches')),
      snap => setBatches(snap.docs.map(d => ({ id: d.id, ...d.data() } as BatchItem))),
    );
    return () => { unsub1(); unsub2(); };
  }, [tenantId]);

  // ── Batch summaries per product ─────────────────────────────────────────────
  const batchSummaries = useMemo(() => {
    const map = new Map<string, { count: number; totalQty: number; soonest: string }>();
    for (const b of batches) {
      if (!b.productId) continue;
      const s = map.get(b.productId) ?? { count: 0, totalQty: 0, soonest: '' };
      s.count++;
      s.totalQty += b.quantity || 0;
      if (b.expiryDate && (!s.soonest || b.expiryDate < s.soonest)) s.soonest = b.expiryDate;
      map.set(b.productId, s);
    }
    return map;
  }, [batches]);

  // ── Dedup check ─────────────────────────────────────────────────────────────
  const checkDuplicate = (name: string, mfgCompany: string, excludeId?: string) => {
    const n = name.trim().toLowerCase();
    const m = mfgCompany.trim().toLowerCase();
    return products.find(p =>
      p.id !== excludeId &&
      p.name.trim().toLowerCase() === n &&
      (p.mfgCompany || '').trim().toLowerCase() === m,
    );
  };

  const handleNameOrMfgChange = (name: string, mfg: string) => {
    if (name.trim() && mfg.trim()) {
      const dup = checkDuplicate(name, mfg, editingProduct?.id);
      setDupWarning(dup ? `"${dup.name}" by "${dup.mfgCompany}" already exists in the catalog.` : null);
    } else {
      setDupWarning(null);
    }
  };

  // ── Modal helpers ───────────────────────────────────────────────────────────
  const handleOpenModal = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      const isKnownCategory = !product.type || (AGRI_CATEGORIES as readonly string[]).includes(product.type);
      const isCustomGst = product.gstPct != null && !GST_OPTIONS.includes(product.gstPct);
      setFormData({
        productNumber: product.productNumber || '',
        name: product.name,
        type: isKnownCategory ? (product.type || '') : 'Others',
        otherType: isKnownCategory ? '' : (product.type || ''),
        mfgCompany: product.mfgCompany || '',
        description: product.description || '',
        unitSize: product.unitSize ?? 1,
        unit: product.baseUnit || product.unitMeasure || 'pcs',
        gstPct: product.gstPct ?? 5,
        customGst: isCustomGst,
        customGstValue: isCustomGst ? String(product.gstPct) : '',
        maxRetailPrice: product.maxRetailPrice || 0,
        retailerPrice: product.retailerPrice || 0,
        purchasePrice: canSeeCost ? (product.purchasePrice || 0) : 0,
        sellingPrice: product.sellingPrice || 0,
        imageUrl: product.imageUrl || '',
        stockQty: totalStock(product),
        batchNumber: product.batchNumber || '',
        mfgDate: product.mfgDate || '',
        expiryDate: product.expiryDate || '',
      });
      setImagePreview(product.imageUrl || null);
      setExistingImagePath(product.imagePath || null);
    } else {
      setEditingProduct(null);
      setFormData({ ...emptyForm(), productNumber: nextSku() });
      setImagePreview(null);
      setExistingImagePath(null);
    }
    setImageBlob(null);
    setDupWarning(null);
    setImageError(null);
    setModalDirty(false);
    setConfirmModalDiscard(false);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingProduct(null);
    setDupWarning(null);
    setImagePreview(null);
    setImageError(null);
    setImageBlob(null);
    setExistingImagePath(null);
  };

  const nextSku = () => {
    let max = 0;
    products.forEach(p => {
      const m = /^KA-(\d+)$/i.exec((p.productNumber || '').trim());
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return `KA-${String(max + 1).padStart(3, '0')}`;
  };

  // ── Image validate → compress → preview ─────────────────────────────────────
  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Could not read the selected file.'));
      reader.readAsDataURL(file);
    });

  const loadImage = (src: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not decode the selected image.'));
      img.src = src;
    });

  const canvasToBlob = (canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> =>
    new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));

  /** Downscales to IMAGE_MAX_DIM and re-encodes as JPEG, stepping quality (and
   * if still large, dimensions) down toward the ~200-500 KB target. Returns
   * the smallest attempt as a fallback if the target isn't reached, so a
   * genuinely dense photo still uploads rather than failing outright. */
  const compressToBlob = async (img: HTMLImageElement): Promise<Blob | null> => {
    let { width, height } = img;
    if (width > IMAGE_MAX_DIM || height > IMAGE_MAX_DIM) {
      if (width >= height) { height = Math.round(height * IMAGE_MAX_DIM / width); width = IMAGE_MAX_DIM; }
      else { width = Math.round(width * IMAGE_MAX_DIM / height); height = IMAGE_MAX_DIM; }
    }

    let smallest: Blob | null = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return smallest;
      ctx.drawImage(img, 0, 0, width, height);

      const quality = Math.max(IMAGE_QUALITY_MIN, IMAGE_QUALITY_START - attempt * 0.1);
      const blob = await canvasToBlob(canvas, quality);
      if (!blob) continue;
      if (!smallest || blob.size < smallest.size) smallest = blob;
      if (blob.size <= 500_000) return blob;

      if (quality <= IMAGE_QUALITY_MIN) { width = Math.round(width * 0.8); height = Math.round(height * 0.8); }
    }
    return smallest;
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageError(null);

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setImageError('Unsupported file format. Please upload a JPG, PNG, or WEBP image.');
      e.target.value = '';
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setImageError('Image size exceeds 5 MB. Please upload an image smaller than 5 MB.');
      e.target.value = '';
      return;
    }

    setImageProcessing(true);
    try {
      const rawDataUrl = await readFileAsDataUrl(file);
      const img = await loadImage(rawDataUrl);
      const compressed = await compressToBlob(img);
      if (!compressed) {
        setImageError('Could not compress this image. Please try a smaller or simpler image.');
        return;
      }
      setImageBlob(compressed);
      setImagePreview(URL.createObjectURL(compressed));
      setModalDirty(true);
    } catch (err) {
      console.error('Product photo compression failed:', err);
      setImageError('Could not process this image. Please try a different file.');
    } finally {
      setImageProcessing(false);
      e.target.value = '';
    }
  };

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;

    if (imageProcessing) {
      alert('Please wait for the photo to finish processing before saving.');
      return;
    }

    // Resolve category: "Others" requires and uses the free-text value
    if (formData.type === 'Others' && !formData.otherType.trim()) {
      alert('Please enter a category name for "Others".');
      return;
    }
    const resolvedType = formData.type === 'Others' ? formData.otherType.trim() : formData.type;

    // Resolve GST: custom requires a valid 0–100 numeric value
    let resolvedGst = formData.gstPct;
    if (formData.customGst) {
      const g = Number(formData.customGstValue);
      if (formData.customGstValue.trim() === '' || !Number.isFinite(g) || g < 0 || g > MAX_GST_PCT) {
        alert(`Please enter a valid GST % between 0 and ${MAX_GST_PCT}.`);
        return;
      }
      resolvedGst = Math.round(g * 100) / 100;
    }

    // Dates: expiry must not precede manufacturing when both are set
    if (formData.mfgDate && formData.expiryDate && formData.expiryDate < formData.mfgDate) {
      alert('Expiry Date cannot be earlier than Manufacturing Date.');
      return;
    }

    // Dedup guard
    const dup = checkDuplicate(formData.name, formData.mfgCompany, editingProduct?.id);
    if (dup) {
      alert(`"${dup.name}" by "${dup.mfgCompany || '(no manufacturer)'}" already exists. Use the existing product instead of creating a duplicate.`);
      return;
    }

    const margin = formData.maxRetailPrice > 0
      ? `${Math.round(((formData.maxRetailPrice - formData.retailerPrice) / formData.maxRetailPrice) * 100)}%`
      : 'N/A';

    const data: Record<string, unknown> = {
      productNumber: formData.productNumber,
      name: formData.name,
      type: resolvedType,
      mfgCompany: formData.mfgCompany,
      description: formData.description,
      unitSize: formData.unitSize,
      unitMeasure: formData.unit,
      baseUnit: formData.unit,
      gstPct: resolvedGst,
      maxRetailPrice: formData.maxRetailPrice,
      retailerPrice: formData.retailerPrice,
      sellingPrice: formData.sellingPrice,
      batchNumber: formData.batchNumber,
      mfgDate: formData.mfgDate,
      expiryDate: formData.expiryDate,
      ...(canSeeCost ? { purchasePrice: formData.purchasePrice } : {}),
      margin,
      loosePieces: formData.stockQty,
      updatedAt: serverTimestamp(),
    };

    // Only touch imageUrl/imagePath when a new photo was picked this session.
    // Leaving no new photo → these keys are simply omitted, so existing
    // Firestore values (base64 or Storage URL) are left completely untouched.
    if (imageBlob) {
      setImageUploading(true);
      try {
        const uploadKey = editingProduct?.id || `new-${Date.now()}`;
        const path = `tenants/${tenantId}/${IMAGE_STORAGE_FOLDER}/${uploadKey}`;
        const fileRef = storageRef(storage, path);
        await uploadBytes(fileRef, imageBlob, { contentType: 'image/jpeg' });
        data.imageUrl = await getDownloadURL(fileRef);
        data.imagePath = path;
        data.imageUploadedAt = serverTimestamp();

        // Best-effort cleanup of the previous file when replacing an existing
        // Storage-backed photo (older base64-only products have no imagePath).
        if (existingImagePath && existingImagePath !== path) {
          deleteObject(storageRef(storage, existingImagePath)).catch(err =>
            console.warn('Could not delete previous product photo:', err));
        }
      } catch (err) {
        console.error('Product photo upload failed:', err);
        alert('Failed to upload product photo. Please try again.');
        return;
      } finally {
        setImageUploading(false);
      }
    }

    try {
      if (editingProduct) {
        const before = { name: editingProduct.name, maxRetailPrice: editingProduct.maxRetailPrice, sellingPrice: editingProduct.sellingPrice, purchasePrice: editingProduct.purchasePrice };
        await updateDoc(getTenantDoc(db, tenantId, 'products', editingProduct.id), data);
        logAudit({ db, tenantId: tenantId!, userId: currentUser?.uid || '', userName: userName || currentUser?.email || 'Unknown', userRole: userRole || 'unknown', module: 'Inventory', action: 'Update', entityName: formData.name, entityId: editingProduct.id, description: `Product updated`, before, after: { name: formData.name, maxRetailPrice: formData.maxRetailPrice, sellingPrice: formData.sellingPrice, purchasePrice: formData.purchasePrice } });
      } else {
        const ref = await addDoc(getTenantCollection(db, tenantId, 'products'), {
          category: 'B2B', boxCapacity: 1, quantity: 0,
          ...data,
          createdAt: serverTimestamp(),
        });
        logAudit({ db, tenantId: tenantId!, userId: currentUser?.uid || '', userName: userName || currentUser?.email || 'Unknown', userRole: userRole || 'unknown', module: 'Inventory', action: 'Create', entityName: formData.name, entityId: ref.id, description: `Product added to catalog · MRP ₹${formData.maxRetailPrice}`, after: { name: formData.name, type: formData.type, mfgCompany: formData.mfgCompany, maxRetailPrice: formData.maxRetailPrice } });
      }
      handleCloseModal();
    } catch (err: unknown) {
      alert(`Failed to save product.\n\n${err instanceof Error ? err.message : err}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!tenantId || !window.confirm('Delete this product from the master catalog?')) return;
    const product = products.find(p => p.id === id);
    await softDelete({
        db, tenantId,
        collectionName: 'products',
        docId: id,
        userId: currentUser?.uid || '',
        userName: userName || currentUser?.email || 'Unknown',
        userRole: userRole || 'unknown',
        module: 'Inventory',
        entityName: product?.name || id,
    });
  };

  // ── CSV ─────────────────────────────────────────────────────────────────────
  const downloadCsv = (rows: Record<string, unknown>[], filename: string) => {
    const csv = Papa.unparse(rows, { columns: CSV_COLS.map(c => c.header) });
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleExport = () => {
    const rows = visibleProducts.map(p => {
      const row: Record<string, unknown> = {};
      CSV_DATA_COLS.forEach(c => { row[c.header] = (p as unknown as Record<string, unknown>)[c.field] ?? ''; });
      // Stock is derived (batch-aggregate, falling back to the product doc's
      // own fields) — same value the table's Stock column and its filter/sort
      // use, so export matches exactly what's on screen.
      row['Stock'] = rowStock(p);
      return row;
    });
    downloadCsv(rows, `product_master_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const handleDownloadTemplate = () => {
    const row: Record<string, unknown> = {};
    CSV_COLS.forEach(c => { row[c.header] = c.num ? 0 : ''; });
    row['SKU'] = 'KA-001'; row['Product Name'] = 'Sample Product'; row['Category'] = 'Insecticide';
    row['Manufacturer'] = 'Sample Agro Ltd'; row['Batch No.'] = 'B2024-01';
    row['Unit Size'] = 500; row['Unit Measure'] = 'ml';
    row['GST %'] = 18; row['MRP'] = 120; row['Sales Rate'] = 100; row['Stock'] = 0;
    downloadCsv([row], 'product_master_template.csv');
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !tenantId) return;
    setLoading(true);
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: async (results) => {
        try {
          let added = 0, updated = 0, skipped = 0;
          for (const raw of results.data as Record<string, string>[]) {
            const name = (raw['Product Name'] ?? '').trim();
            if (!name) continue;
            const mfgCompany = (raw['Manufacturer'] ?? '').trim();

            const productData: Record<string, unknown> = {};
            for (const c of CSV_DATA_COLS) {
              const cell = (raw[c.header] ?? '').trim();
              if (cell === '') continue;
              productData[c.field] = c.num ? (Number.isFinite(Number(cell)) ? Number(cell) : undefined) : cell;
            }
            productData.name = name;
            productData.updatedAt = serverTimestamp();

            // Stock: same field the Add/Edit modal's Stock Quantity input
            // writes (see `loosePieces: formData.stockQty` in handleSubmit).
            // Only overwrite on upload when the Stock cell is actually
            // present and non-empty, so a template row left blank doesn't
            // zero out an existing product's stock on update.
            const stockCell = (raw['Stock'] ?? '').trim();
            if (stockCell !== '' && Number.isFinite(Number(stockCell))) {
              productData.loosePieces = Math.max(0, Number(stockCell));
            }

            // Dedup: match by name + manufacturer
            const existing = products.find(p =>
              p.name.trim().toLowerCase() === name.toLowerCase() &&
              (p.mfgCompany || '').trim().toLowerCase() === mfgCompany.toLowerCase()
            ) || products.find(p =>
              (raw['SKU'] && p.productNumber === raw['SKU'].trim()) ||
              p.name.trim().toLowerCase() === name.toLowerCase()
            );

            const mrp = Number(productData.maxRetailPrice ?? existing?.maxRetailPrice ?? 0) || 0;
            const ptr = Number(productData.retailerPrice ?? existing?.retailerPrice ?? 0) || 0;
            productData.margin = mrp > 0 ? `${Math.round(((mrp - ptr) / mrp) * 100)}%` : 'N/A';

            if (existing) {
              await updateDoc(getTenantDoc(db, tenantId, 'products', existing.id), productData);
              updated++;
            } else {
              await addDoc(getTenantCollection(db, tenantId, 'products'), {
                category: 'B2B', boxCapacity: 1, quantity: 0, loosePieces: 0,
                ...productData, createdAt: serverTimestamp(),
              });
              added++;
            }
          }
          alert(`Upload complete!\nAdded: ${added}  Updated: ${updated}  Skipped: ${skipped}`);
        } catch (err) {
          alert('Error processing CSV. Check console for details.');
          console.error(err);
        } finally {
          setLoading(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      },
    });
  };

  // ── Column-filter helpers ───────────────────────────────────────────────────
  const rowStock = (p: Product) => batchSummaries.get(p.id)?.totalQty ?? totalStock(p);

  // Distinct Category / Unit values for the header dropdown filters
  const categoryOptions = useMemo(
    () => Array.from(new Set(products.map(p => (p.type || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [products],
  );
  const unitOptions = useMemo(
    () => Array.from(new Set(products.map(p => (p.unitMeasure || p.baseUnit || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [products],
  );

  const anyColumnFilter =
    fBatch.trim() !== '' || fCategory !== '' || fMfg.trim() !== '' || fUnit !== '' ||
    [fSize, fGst, fMrp, fPurch, fRetail, fSales, fStock].some(isNumActive);

  // ── Filter + sort ───────────────────────────────────────────────────────────
  const visibleProducts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const batchQ = fBatch.trim().toLowerCase();
    const mfgQ = fMfg.trim().toLowerCase();

    const filtered = products.filter(p => {
      // Global product search (name / SKU / manufacturer / category)
      if (q && !(
        p.name.toLowerCase().includes(q) ||
        (p.productNumber || '').toLowerCase().includes(q) ||
        (p.mfgCompany || '').toLowerCase().includes(q) ||
        (p.type || '').toLowerCase().includes(q)
      )) return false;
      // Column filters
      if (batchQ && !(p.batchNumber || '').toLowerCase().includes(batchQ)) return false;
      if (fCategory && (p.type || '') !== fCategory) return false;
      if (mfgQ && !(p.mfgCompany || '').toLowerCase().includes(mfgQ)) return false;
      if (fUnit && (p.unitMeasure || p.baseUnit || '') !== fUnit) return false;
      if (!matchNum(p.unitSize ?? 0, fSize)) return false;
      if (!matchNum(p.gstPct ?? 0, fGst)) return false;
      if (!matchNum(p.maxRetailPrice || 0, fMrp)) return false;
      if (!matchNum(p.purchasePrice || 0, fPurch)) return false;
      if (!matchNum(p.retailerPrice || 0, fRetail)) return false;
      if (!matchNum(p.sellingPrice || 0, fSales)) return false;
      if (!matchNum(rowStock(p), fStock)) return false;
      return true;
    });

    if (!sortCol) return filtered;

    const dir = sortDir === 'asc' ? 1 : -1;
    const strOf = (p: Product): string => {
      switch (sortCol) {
        case 'batchNumber': return p.batchNumber || '';
        case 'name':        return p.name || '';
        case 'type':        return p.type || '';
        case 'mfgCompany':  return p.mfgCompany || '';
        case 'unitMeasure': return p.unitMeasure || p.baseUnit || '';
        default:            return '';
      }
    };
    const numOf = (p: Product): number => {
      switch (sortCol) {
        case 'unitSize': return p.unitSize ?? 0;
        case 'gstPct':   return p.gstPct ?? 0;
        case 'mrp':      return p.maxRetailPrice || 0;
        case 'purchase': return p.purchasePrice || 0;
        case 'retail':   return p.retailerPrice || 0;
        case 'sales':    return p.sellingPrice || 0;
        case 'stock':    return rowStock(p);
        default:         return NaN;
      }
    };
    const isNumericSort = !['batchNumber', 'name', 'type', 'mfgCompany', 'unitMeasure'].includes(sortCol);

    return [...filtered].sort((a, b) =>
      isNumericSort
        ? (numOf(a) - numOf(b)) * dir
        : strOf(a).localeCompare(strOf(b)) * dir,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, batchSummaries, searchTerm, fBatch, fCategory, fMfg, fUnit, fSize, fGst, fMrp, fPurch, fRetail, fSales, fStock, sortCol, sortDir]);

  const set = (patch: Partial<ReturnType<typeof emptyForm>>) => {
    setFormData(f => ({ ...f, ...patch }));
    setModalDirty(true);
  };

  const requestCloseModal = useCallback(() => {
    if (modalDirty || imageBlob !== null) { setConfirmModalDiscard(true); return; }
    handleCloseModal();
  }, [modalDirty, imageBlob]);

  // ESC key closes modal (with dirty guard)
  useEffect(() => {
    if (!isModalOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') requestCloseModal(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isModalOpen, requestCloseModal]);

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
      <Loader2 className="animate-spin" style={{ margin: '0 auto 1rem' }} /> {t('common.loading')}
    </div>
  );

  // ── Dynamic column renderers (colOrder-driven, like the Stock Report) ────────
  const renderHeaderTh = (key: PMColKey, colIdx: number) => {
    const align = PM_ALIGN[key];
    const thBase: React.CSSProperties = {
      padding: '0.7rem 0.85rem', fontWeight: 600, textAlign: align,
      whiteSpace: 'nowrap', verticalAlign: 'top', overflow: 'hidden',
      position: 'sticky', top: 0, zIndex: 2, background: 'var(--surface-base)',
      ...layout.stickyStyle(colIdx, { header: true, rowBg: 'var(--surface-base)' }),
      ...(layout.isDragOver(key) ? { borderLeft: '3px solid var(--primary)' } : {}),
    };
    let inner: React.ReactNode;
    switch (key) {
      case 'sr':    inner = '#'; break;
      case 'photo': inner = 'Photo'; break;
      case 'batchNumber': inner = (
        <div style={HDR_COL_STYLE}>
          <SortLabel label="Batch No." active={sortCol === 'batchNumber'} dir={sortDir} onClick={() => toggleSort('batchNumber')} />
          <ColumnTextFilter value={fBatch} onChange={setFBatch} />
        </div>
      ); break;
      case 'name': inner = (
        <div style={HDR_COL_STYLE}>
          <SortLabel label="Product Name" active={sortCol === 'name'} dir={sortDir} onClick={() => toggleSort('name')} />
          {/* Global product search now lives in this column. Same multi-field
              logic as before (name / SKU / manufacturer / category) — see the
              `q` filter in visibleProducts. */}
          <ColumnTextFilter value={searchTerm} onChange={setSearchTerm} placeholder="Search products…" />
        </div>
      ); break;
      case 'category': inner = (
        <div style={HDR_COL_STYLE}>
          <SortLabel label="Category" active={sortCol === 'type'} dir={sortDir} onClick={() => toggleSort('type')} />
          <ColumnSelectFilter value={fCategory} options={categoryOptions} onChange={setFCategory} allLabel="All Categories" />
        </div>
      ); break;
      case 'mfg': inner = (
        <div style={HDR_COL_STYLE}>
          <SortLabel label="Manufacturer" active={sortCol === 'mfgCompany'} dir={sortDir} onClick={() => toggleSort('mfgCompany')} />
          <ColumnTextFilter value={fMfg} onChange={setFMfg} />
        </div>
      ); break;
      case 'size': inner = (
        <div style={HDR_COL_STYLE}>
          <SortLabel label="Size" active={sortCol === 'unitSize'} dir={sortDir} onClick={() => toggleSort('unitSize')} />
          <ColumnNumFilter state={fSize} onChange={setFSize} />
        </div>
      ); break;
      case 'unit': inner = (
        <div style={HDR_COL_STYLE}>
          <SortLabel label="Unit" active={sortCol === 'unitMeasure'} dir={sortDir} onClick={() => toggleSort('unitMeasure')} />
          <ColumnSelectFilter value={fUnit} options={unitOptions} onChange={setFUnit} allLabel="All Units" />
        </div>
      ); break;
      case 'gst': inner = (
        <div style={HDR_COL_STYLE}>
          <SortLabel label="GST %" active={sortCol === 'gstPct'} dir={sortDir} onClick={() => toggleSort('gstPct')} />
          <ColumnNumFilter state={fGst} onChange={setFGst} />
        </div>
      ); break;
      case 'mrp': inner = (
        <div style={HDR_COL_STYLE}>
          <SortLabel label="MRP" align="right" active={sortCol === 'mrp'} dir={sortDir} onClick={() => toggleSort('mrp')} />
          <ColumnNumFilter state={fMrp} onChange={setFMrp} />
        </div>
      ); break;
      case 'purchase': inner = (
        <div style={HDR_COL_STYLE}>
          <SortLabel label="Purch Rate" align="right" active={sortCol === 'purchase'} dir={sortDir} onClick={() => toggleSort('purchase')} />
          <ColumnNumFilter state={fPurch} onChange={setFPurch} />
        </div>
      ); break;
      case 'retail': inner = (
        <div style={HDR_COL_STYLE}>
          <SortLabel label="Retail Price" align="right" active={sortCol === 'retail'} dir={sortDir} onClick={() => toggleSort('retail')} />
          <ColumnNumFilter state={fRetail} onChange={setFRetail} />
        </div>
      ); break;
      case 'sales': inner = (
        <div style={HDR_COL_STYLE}>
          <SortLabel label="Sales Rate" align="right" active={sortCol === 'sales'} dir={sortDir} onClick={() => toggleSort('sales')} />
          <ColumnNumFilter state={fSales} onChange={setFSales} />
        </div>
      ); break;
      case 'stock': inner = (
        <div style={HDR_COL_STYLE}>
          <SortLabel label="Stock" align="right" active={sortCol === 'stock'} dir={sortDir} onClick={() => toggleSort('stock')} />
          <ColumnNumFilter state={fStock} onChange={setFStock} />
        </div>
      ); break;
      case 'actions': inner = 'Actions'; break;
      default: inner = PM_LABELS[key];
    }
    return (
      <th key={key} style={thBase} {...layout.getDragProps(key)}>
        {inner}
        {layout.resizeHandle(key)}
      </th>
    );
  };

  interface RowCtx {
    stock: number; isLow: boolean;
    rowExpiring: boolean; index: number;
  }

  const renderBodyTd = (key: PMColKey, colIdx: number, p: Product, ctx: RowCtx): React.ReactNode => {
    const align = PM_ALIGN[key];
    const tdBase: React.CSSProperties = {
      padding: '0.65rem 0.85rem', textAlign: align, overflow: 'hidden', textOverflow: 'ellipsis',
      ...layout.stickyStyle(colIdx, { rowBg: ctx.rowExpiring ? 'hsl(0,70%,97%)' : 'var(--surface-base)' }),
    };
    switch (key) {
      case 'sr':
        return <td key={key} style={{ ...tdBase, color: 'var(--text-tertiary)', fontWeight: 500 }}>{ctx.index + 1}</td>;
      case 'photo':
        return (
          <td key={key} style={tdBase}>
            <div style={{ width: 34, height: 34, borderRadius: 8, overflow: 'hidden', background: 'hsla(152,60%,40%,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {p.imageUrl
                ? <img src={p.imageUrl} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <Package size={15} color="var(--primary-light)" />}
            </div>
          </td>
        );
      case 'batchNumber':
        return (
          <td key={key} style={{ ...tdBase, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
            {p.batchNumber || '—'}
            {ctx.rowExpiring && (
              <div style={{ fontSize: '0.68rem', color: '#ef4444', fontWeight: 600, marginTop: '0.1rem' }}>
                Exp {fmtDate(p.expiryDate)}
              </div>
            )}
          </td>
        );
      case 'name':
        // Wrap long product names so they're fully readable within the column
        // (overrides tdBase's ellipsis/nowrap for this cell only).
        return (
          <td key={key} style={{ ...tdBase, whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip' }}>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'normal', wordBreak: 'break-word' }}>{p.name}</div>
            {p.productNumber && <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>{p.productNumber}</div>}
          </td>
        );
      case 'category':
        return <td key={key} style={{ ...tdBase, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{p.type || '—'}</td>;
      case 'mfg':
        return <td key={key} style={{ ...tdBase, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{p.mfgCompany || '—'}</td>;
      case 'size':
        return <td key={key} style={{ ...tdBase, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{p.unitSize ?? '—'}</td>;
      case 'unit':
        return <td key={key} style={{ ...tdBase, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{p.unitMeasure || p.baseUnit || '—'}</td>;
      case 'gst':
        return <td key={key} style={{ ...tdBase, color: 'var(--text-secondary)' }}>{p.gstPct ?? 0}%</td>;
      case 'mrp':
        return <td key={key} style={{ ...tdBase, fontWeight: 600, whiteSpace: 'nowrap' }}>₹{(p.maxRetailPrice || 0).toFixed(2)}</td>;
      case 'purchase':
        return <td key={key} style={{ ...tdBase, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>₹{(p.purchasePrice || 0).toFixed(2)}</td>;
      case 'retail':
        return <td key={key} style={{ ...tdBase, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>₹{(p.retailerPrice || 0).toFixed(2)}</td>;
      case 'sales':
        return <td key={key} style={{ ...tdBase, whiteSpace: 'nowrap' }}>₹{(p.sellingPrice || 0).toFixed(2)}</td>;
      case 'stock':
        return (
          <td key={key} style={{ ...tdBase, whiteSpace: 'nowrap' }}>
            <span style={{ fontWeight: 700, color: ctx.isLow ? '#ef4444' : 'var(--text-primary)' }}>{ctx.stock}</span>
            {ctx.isLow && (
              <span style={{ marginLeft: '0.35rem', fontSize: '0.65rem', padding: '0.1rem 0.35rem', borderRadius: '999px', background: 'hsla(0,84%,60%,0.12)', color: '#ef4444', fontWeight: 700 }}>LOW</span>
            )}
          </td>
        );
      case 'actions':
        return (
          <td key={key} style={tdBase}>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              {canEditProduct && (
                <button onClick={() => handleOpenModal(p)} className="btn btn-secondary" style={{ padding: '0.35rem' }}><Edit2 size={13} /></button>
              )}
              {canDelete && (
                <button onClick={() => handleDelete(p.id)} className="btn" style={{ padding: '0.35rem', background: 'hsla(0,84%,60%,0.08)', color: '#ef4444', border: '1px solid hsla(0,84%,60%,0.2)' }}><Trash2 size={13} /></button>
              )}
            </div>
          </td>
        );
      default: return <td key={key} style={tdBase} />;
    }
  };

  return (
    <div className="animate-fade-in" style={{ width: '100%' }}>

      {/* Header */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="primary-gradient-text" style={{ fontSize: '1.8rem', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <Package size={28} /> Product Master
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Single source of truth for product information across POS, B2B, Purchase Invoices, and Inventory.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
          {canExportCsv && (
            <button onClick={handleExport} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
              <FileDown size={15} /> Export CSV
            </button>
          )}
          {canUploadCsv && (
            <input type="file" accept=".csv" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} />
          )}
          {canCsvTemplate && (
            <button onClick={handleDownloadTemplate} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
              <Download size={15} /> CSV Template
            </button>
          )}
          {canUploadCsv && (
            <button onClick={() => fileInputRef.current?.click()} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
              <FileSpreadsheet size={15} /> Upload CSV
            </button>
          )}
          {canAddProduct && (
            <button onClick={() => handleOpenModal()} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Plus size={16} /> Add Product
            </button>
          )}
        </div>
      </div>

      {/* Table customization hint. Product search now lives in the Product Name
          column header (ColumnTextFilter), so the old top search bar was removed. */}
      <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', marginBottom: '0.6rem', fontSize: '0.72rem', color: 'var(--text-tertiary)', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{visibleProducts.length} of {products.length} products</span>
        <span>Search products in the Product Name column.</span>
        <span>Drag column headers to reorder.</span>
        <span>Drag column edges to resize.</span>
        <span>Right-click a header to freeze or reset.</span>
        {layout.freezeCount > 0 && (
          <span style={{ marginLeft: 'auto', color: 'var(--primary)', fontWeight: 600 }}>
            Frozen up to “{PM_LABELS[layout.colOrder[layout.freezeCount - 1]]}”
          </span>
        )}
      </div>

      {/* Full-screen capture div during column resize — prevents cursor flicker */}
      {layout.isResizing && <div style={{ position: 'fixed', inset: 0, zIndex: 9999, cursor: 'col-resize' }} />}

      {/* Right-click column context menu (freeze / reset widths / reset order) */}
      {layout.ContextMenu()}

      {/* Table */}
      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', maxHeight: '72vh', overflowY: 'auto' }} onContextMenu={layout.handleTableContextMenu}>
          <table style={{ width: layout.totalTableWidth, tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <colgroup>
              {layout.colOrder.map(key => (
                <col key={key} ref={layout.registerColEl(key)} style={{ width: layout.colWidths[key] }} />
              ))}
            </colgroup>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--surface-border)', color: 'var(--text-secondary)', background: 'var(--surface-base)' }}>
                {layout.colOrder.map((key, colIdx) => renderHeaderTh(key, colIdx))}
              </tr>
            </thead>
            <tbody>
              {visibleProducts.map((p, i) => {
                // Stock rolls up the separate inventoryBatches collection when it
                // has records for this product, else falls back to the product's
                // own loose/box counts.
                const stock = batchSummaries.get(p.id)?.totalQty ?? totalStock(p);
                const isLow = stock < LOW_STOCK;

                // Product-level expiry (from the Add/Edit Product form) drives the
                // whole-row warning and the "Exp …" sub-line under Batch No.
                const productExpDays = p.expiryDate ? daysUntil(p.expiryDate) : null;
                const rowExpiring = productExpDays !== null && productExpDays <= EXPIRY_WARN_DAYS;

                const ctx: RowCtx = { stock, isLow, rowExpiring, index: i };

                return (
                  <tr
                    key={p.id}
                    style={{
                      borderBottom: '1px solid var(--surface-border)',
                      background: rowExpiring ? 'hsla(0,84%,60%,0.08)' : undefined,
                    }}
                  >
                    {layout.colOrder.map((key, colIdx) => renderBodyTd(key, colIdx, p, ctx))}
                  </tr>
                );
              })}
              {visibleProducts.length === 0 && (
                <tr>
                  <td colSpan={layout.colOrder.length} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    <Package size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.25, display: 'block' }} />
                    {searchTerm ? `No products match "${searchTerm}".` : anyColumnFilter ? 'No products match the active column filters.' : 'No products yet.'}
                    {canAddProduct && !searchTerm && !anyColumnFilter && (
                      <button onClick={() => handleOpenModal()} className="btn btn-primary" style={{ marginTop: '1rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Plus size={15} /> Add First Product
                      </button>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && createPortal(
        <>
        <div
          ref={overlayRef}
          onMouseDown={e => { if (e.target === overlayRef.current) requestCloseModal(); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(8px)', padding: '1rem' }}
        >
          <div className="glass-panel animate-scale-in" style={{ width: '95vw', maxWidth: '740px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: 'var(--neon-glow)' }}>

            {/* Modal header */}
            <div style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid var(--surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.05rem' }}>{editingProduct ? 'Edit Product' : 'Add to Product Master'}</h2>
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.15rem' }}>
                  This record is shared across POS, B2B Invoice, and Purchase Invoices.
                </p>
              </div>
              <button onClick={requestCloseModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }}><X size={18} /></button>
            </div>

            {/* Dedup warning */}
            {dupWarning && (
              <div style={{ margin: '0.6rem 1.25rem 0', padding: '0.5rem 0.85rem', background: 'hsla(38,92%,50%,0.12)', border: '1px solid hsla(38,92%,50%,0.3)', borderRadius: '8px', fontSize: '0.78rem', color: '#b45309', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertTriangle size={13} style={{ flexShrink: 0 }} />
                {dupWarning} Use the existing product to avoid duplicates.
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>

              {/* Section 1: Product Identity */}
              <section>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '0.08em', marginBottom: '0.4rem' }}>1 · Product Identity</div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  {/* Photo */}
                  <div style={{ flexShrink: 0 }}>
                    <div style={{ position: 'relative', width: 60, height: 60, borderRadius: 10, border: '2px dashed var(--surface-border)', background: 'var(--surface-raised)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: (imageProcessing || imageUploading) ? 'wait' : 'pointer' }}>
                      {imagePreview
                        ? <img src={imagePreview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.58rem' }}><Plus size={14} style={{ margin: '0 auto' }} /><div>Photo</div></div>}
                      {(imageProcessing || imageUploading) && (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Loader2 size={16} className="animate-spin" color="#fff" />
                        </div>
                      )}
                      <input type="file" accept={ACCEPTED_IMAGE_TYPES.join(',')} onChange={handleImageChange} disabled={imageProcessing || imageUploading} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: (imageProcessing || imageUploading) ? 'wait' : 'pointer' }} />
                    </div>
                    {imageError && (
                      <div style={{ marginTop: '0.3rem', maxWidth: 140, fontSize: '0.62rem', lineHeight: 1.3, color: '#ef4444' }}>{imageError}</div>
                    )}
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {/* Row 1: SKU, Product Name, Batch Number */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                      <div style={{ width: 110, flexShrink: 0 }}>
                        <label className="input-label">SKU / Product No.</label>
                        <input className="input-field field-sm" value={formData.productNumber} onChange={e => set({ productNumber: e.target.value })} placeholder="KA-001" />
                      </div>
                      <div style={{ flex: '1 1 220px', minWidth: 160 }}>
                        <label className="input-label">Product Name *</label>
                        <input required className="input-field field-sm" value={formData.name} onChange={e => { set({ name: e.target.value }); handleNameOrMfgChange(e.target.value, formData.mfgCompany); }} placeholder="e.g. Confidor 200 SL" />
                      </div>
                      <div style={{ width: 130, flexShrink: 0 }}>
                        <label className="input-label">Batch Number</label>
                        <input className="input-field field-sm" value={formData.batchNumber} onChange={e => set({ batchNumber: e.target.value })} placeholder="e.g. B2024-01" />
                      </div>
                    </div>
                    {/* Row 2: Category, Other Category, Manufacturer */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                      <div style={{ width: 150, flexShrink: 0 }}>
                        <label className="input-label">Category</label>
                        <select className="input-field field-sm" value={formData.type} onChange={e => set({ type: e.target.value })}>
                          <option value="">— Select —</option>
                          {AGRI_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      {formData.type === 'Others' && (
                        <div style={{ width: 170, flexShrink: 0 }}>
                          <label className="input-label">Other Category</label>
                          <input required className="input-field field-sm" value={formData.otherType} onChange={e => set({ otherType: e.target.value })} placeholder="Enter category name" />
                        </div>
                      )}
                      <div style={{ flex: '1 1 200px', minWidth: 160 }}>
                        <label className="input-label">Manufacturer</label>
                        <input className="input-field field-sm" value={formData.mfgCompany} onChange={e => { set({ mfgCompany: e.target.value }); handleNameOrMfgChange(formData.name, e.target.value); }} placeholder="e.g. Bayer CropScience" />
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Section 2: Unit & Tax */}
              <section>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '0.08em', marginBottom: '0.4rem' }}>2 · Unit & Tax</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  <div style={{ width: 130, flexShrink: 0 }}>
                    <label className="input-label">Unit Size</label>
                    <input type="number" min="0" step="0.01" className="input-field field-sm" value={formData.unitSize || ''} onChange={e => set({ unitSize: Number(e.target.value) })} onWheel={e => e.currentTarget.blur()} placeholder="e.g. 500" />
                  </div>
                  <div style={{ width: 170, flexShrink: 0 }}>
                    <label className="input-label">Unit</label>
                    <select className="input-field field-sm" value={formData.unit} onChange={e => set({ unit: e.target.value })}>
                      {UNIT_MEASURES.map(u => <option key={u} value={u}>{u.charAt(0).toUpperCase() + u.slice(1)}</option>)}
                    </select>
                  </div>
                  <div style={{ width: 110, flexShrink: 0 }}>
                    <label className="input-label">GST %</label>
                    {formData.customGst ? (
                      <div style={{ display: 'flex', gap: '0.3rem' }}>
                        <input type="number" min="0" max={MAX_GST_PCT} step="0.01" className="input-field field-sm" value={formData.customGstValue} onChange={e => set({ customGstValue: e.target.value })} onWheel={e => e.currentTarget.blur()} placeholder="%" autoFocus />
                        <button type="button" onClick={() => set({ customGst: false, customGstValue: '' })} className="btn btn-secondary" style={{ padding: '0 0.5rem', flexShrink: 0 }} title="Use preset">×</button>
                      </div>
                    ) : (
                      <select className="input-field field-sm" value={formData.gstPct} onChange={e => {
                        if (e.target.value === 'custom') { set({ customGst: true, customGstValue: String(formData.gstPct) }); }
                        else { set({ gstPct: Number(e.target.value) }); }
                      }}>
                        {GST_OPTIONS.map(g => <option key={g} value={g}>{g}%</option>)}
                        <option value="custom">Custom…</option>
                      </select>
                    )}
                  </div>
                </div>
              </section>

              {/* Section 3: Stock & Rates */}
              <section>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '0.08em', marginBottom: '0.4rem' }}>3 · Stock & Rates</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  <div style={{ width: 110, flexShrink: 0 }}>
                    <label className="input-label">Stock Quantity</label>
                    <input type="number" min="0" step="1" className="input-field field-sm" value={formData.stockQty === 0 ? '' : formData.stockQty} onChange={e => set({ stockQty: Number(e.target.value) })} onWheel={e => e.currentTarget.blur()} placeholder="0" />
                  </div>
                  <div style={{ width: 120, flexShrink: 0 }}>
                    <label className="input-label">MRP</label>
                    <input type="number" step="0.01" min="0" className="input-field field-sm" value={formData.maxRetailPrice || ''} onChange={e => set({ maxRetailPrice: Number(e.target.value) })} onWheel={e => e.currentTarget.blur()} placeholder="0.00" />
                  </div>
                  <div style={{ width: 140, flexShrink: 0 }}>
                    <label className="input-label">Retailer Price (PTR)</label>
                    <input type="number" step="0.01" min="0" className="input-field field-sm" value={formData.retailerPrice || ''} onChange={e => set({ retailerPrice: Number(e.target.value) })} onWheel={e => e.currentTarget.blur()} placeholder="0.00" />
                  </div>
                  {canSeeCost && (
                    <div style={{ width: 120, flexShrink: 0 }}>
                      <label className="input-label">Purchase Rate</label>
                      <input type="number" step="0.01" min="0" className="input-field field-sm" value={formData.purchasePrice || ''} onChange={e => set({ purchasePrice: Number(e.target.value) })} onWheel={e => e.currentTarget.blur()} placeholder="0.00" />
                    </div>
                  )}
                  <div style={{ width: 120, flexShrink: 0 }}>
                    <label className="input-label">Sales Rate</label>
                    <input type="number" step="0.01" min="0" className="input-field field-sm" value={formData.sellingPrice || ''} onChange={e => set({ sellingPrice: Number(e.target.value) })} onWheel={e => e.currentTarget.blur()} placeholder="0.00" />
                  </div>
                </div>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '0.35rem' }}>
                  {editingProduct
                    ? 'Stock: direct edit for correction. Rates are defaults only — Purchase Invoices override them without changing the master.'
                    : 'Stock: leave 0 if it will be added via Purchase Invoices. Rates are defaults only and can be overridden per invoice.'}
                </p>
              </section>

              {/* Section 4: Batch Information */}
              <section>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '0.08em', marginBottom: '0.4rem' }}>4 · Batch Information</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  <div style={{ width: 165, flexShrink: 0 }}>
                    <label className="input-label">Manufacturing Date</label>
                    <input type="date" className="input-field field-sm" value={formData.mfgDate} onChange={e => set({ mfgDate: e.target.value })} />
                  </div>
                  <div style={{ width: 165, flexShrink: 0 }}>
                    <label className="input-label">Expiry Date</label>
                    <input type="date" className="input-field field-sm" value={formData.expiryDate} onChange={e => set({ expiryDate: e.target.value })} />
                  </div>
                </div>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '0.35rem' }}>
                  Reference values shown on the catalog row. For multi-batch stock tracking with individual expiry dates, use Inventory Batches.
                </p>
              </section>

              <button type="submit" disabled={imageProcessing || imageUploading} className="btn btn-primary" style={{ width: '100%', height: '2.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontSize: '0.9rem', flexShrink: 0, opacity: (imageProcessing || imageUploading) ? 0.7 : 1 }}>
                {imageUploading
                  ? <><Loader2 size={16} className="animate-spin" /> Uploading photo…</>
                  : <><Save size={16} /> {editingProduct ? 'Save Changes' : 'Add to Product Master'}</>}
              </button>
            </form>
          </div>
        </div>

        {confirmModalDiscard && (
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', background: 'hsla(220, 30%, 4%, 0.6)' }}
            role="alertdialog"
            aria-modal="true"
            aria-label="Discard changes confirmation"
          >
            <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '14px', maxWidth: '380px', width: '100%' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.5rem' }}>Discard changes?</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                You have unsaved changes. Are you sure you want to discard them?
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button className="btn btn-secondary" onClick={() => setConfirmModalDiscard(false)}>Keep Editing</button>
                <button
                  className="btn btn-primary"
                  onClick={() => { setConfirmModalDiscard(false); handleCloseModal(); }}
                  style={{ background: 'hsla(0,72%,51%,0.85)', borderColor: 'hsla(0,72%,51%,0.5)' }}
                >
                  Discard
                </button>
              </div>
            </div>
          </div>
        )}
        </>,
        document.body,
      )}
    </div>
  );
}
