import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ReceiptText, Package, Plus, Edit2, Trash2, Loader2, Save, X, Calculator, ShoppingCart, Store, Users, Download, FileSpreadsheet, Search } from 'lucide-react';
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
}

export default function RateSheetPage() {
    const { t } = useTranslation();
    const { userRole, tenantId } = useAuth();
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

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
    const [formData, setFormData] = useState({
        productNumber: '',
        name: '',
        type: '',
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
        imageUrl: ''
    });
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
    }, []);

    const handleOpenModal = (product?: Product) => {
        if (product) {
            setEditingProduct(product);
            setFormData({
                productNumber: product.productNumber || '',
                name: product.name,
                type: product.type || '',
                maxRetailPrice: product.maxRetailPrice || 0,
                boxMaxRetailPrice: product.boxMaxRetailPrice || 0,
                retailerPrice: product.retailerPrice || 0,
                boxRetailerPrice: product.boxRetailerPrice || 0,
                purchasePrice: product.purchasePrice || 0,
                boxPurchasePrice: product.boxPurchasePrice || 0,
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
                imageUrl: product.imageUrl || ''
            });
            setImagePreview(product.imageUrl || null);
        } else {
            setEditingProduct(null);
            setFormData({
                productNumber: generateNextSku(),
                name: '',
                type: '',
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
                baseUnit: 'pcs',
                unitSize: 1,
                unitMeasure: 'pcs',
                gstPct: 5,
                category: 'B2B',
                imageUrl: ''
            });
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

        const productData = {
            ...formData,
            margin,
            updatedAt: serverTimestamp()
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

                    for (const row of results.data as any[]) {
                        const name = row['Product Name']?.trim();
                        if (!name) continue;

                        const productNumber = row['Product Number']?.trim() || '';
                        const type = row['Category']?.trim() || '';
                        const maxRetailPrice = Number(row['MRP']) || 0;
                        const retailerPrice = Number(row['PTR']) || 0;
                        const purchasePrice = Number(row['Rate']) || 0;
                        const sellingPrice = Number(row['Offer']) || 0;
                        const quantity = Number(row['Quantity (Boxes)']) || 0;
                        const loosePieces = Number(row['Loose Pieces']) || 0;
                        const boxCapacity = Number(row['Pcs/Box']) || 1;
                        const baseUnit = (row['Base Unit']?.toLowerCase() || 'pcs') as any;
                        const unitSize = Number(row['Unit Size']) || 1;
                        const unitMeasure = (row['Unit Measure']?.toLowerCase() || 'pcs') as any;
                        const gstPct = Number(row['GST %']) || 5;

                        const margin = maxRetailPrice > 0
                            ? `${Math.round(((maxRetailPrice - retailerPrice) / maxRetailPrice) * 100)}%`
                            : 'N/A';

                        const productData = {
                            productNumber,
                            name,
                            type,
                            maxRetailPrice,
                            retailerPrice,
                            purchasePrice,
                            sellingPrice,
                            quantity,
                            loosePieces,
                            boxCapacity,
                            baseUnit,
                            unitSize,
                            unitMeasure,
                            gstPct,
                            margin,
                            category: 'B2B',
                            updatedAt: serverTimestamp()
                        };

                        const existing = products.find(p =>
                            (productNumber && p.productNumber === productNumber) ||
                            (p.name.toLowerCase() === name.toLowerCase())
                        );

                        if (existing) {
                            await updateDoc(getTenantDoc(db, tenantId, 'products', existing.id), productData);
                            updatedCount++;
                        } else {
                            await addDoc(getTenantCollection(db, tenantId, 'products'), {
                                ...productData,
                                createdAt: serverTimestamp()
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

    const handleDownloadTemplate = () => {
        const csvContent = "Product Number,Product Name,Category,MRP,PTR,Rate,Offer,Quantity (Boxes),Loose Pieces,Pcs/Box,Base Unit,Unit Size,Unit Measure,GST %\n" +
            "KA-001,Sample Fertilizer,Fertilizer,1500,1200,1000,1400,10,2,5,pcs,5,ltr,5\n";

        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", "inventory_template.csv");
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const getVolumePricing = (p: Product) => {
        if (!p.unitSize || !p.unitMeasure || p.unitMeasure === 'pcs') return null;
        let sizeInCanonical = p.unitSize;
        let canonicalUnit: string = p.unitMeasure;

        if (p.unitMeasure === 'ml') {
            sizeInCanonical = p.unitSize / 1000;
            canonicalUnit = 'Ltr';
        } else if (p.unitMeasure === 'g') {
            sizeInCanonical = p.unitSize / 1000;
            canonicalUnit = 'Kg';
        } else if (p.unitMeasure === 'ltr') {
            canonicalUnit = 'Ltr';
        } else if (p.unitMeasure === 'kg') {
            canonicalUnit = 'Kg';
        }

        if (sizeInCanonical <= 0) return null;
        const ratePerUnit = p.retailerPrice / sizeInCanonical;
        return `₹${Math.round(ratePerUnit)} / ${canonicalUnit}`;
    };

    // One unified catalog — the old B2B/B2C split has been removed. The `category`
    // field is still written for backward compatibility but no longer filters.
    const visibleProducts = products.filter(p => {
        if (!searchTerm.trim()) return true;
        const q = searchTerm.toLowerCase();
        return p.name.toLowerCase().includes(q) || (p.productNumber || '').toLowerCase().includes(q);
    });

    if (loading) {
        return (
            <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
                <Loader2 className="animate-spin" style={{ margin: '0 auto', marginBottom: '1rem' }} /> {t('common.loading')}
            </div>
        );
    }

    return (
        <div className="animate-fade-in" style={{ maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ marginBottom: '2rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1 className="primary-gradient-text" style={{ fontSize: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                        <ReceiptText size={32} /> {t('inventory.title')}
                    </h1>
                    <p style={{ color: 'var(--text-secondary)' }}>One catalog — stock, MRP, retailer &amp; farmer pricing, and bulk uploads. Rates set from a supplier invoice land here automatically.</p>
                </div>
                {userRole === 'admin' && (
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
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
                    </div>
                )}
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', fontWeight: 600 }}>
                    {visibleProducts.length} {visibleProducts.length === 1 ? 'product' : 'products'}
                </div>
                <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: '360px', minWidth: '200px' }}>
                    <Search size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                    <input
                        type="text"
                        className="input-field"
                        placeholder={t('inventory.search_placeholder')}
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        style={{ paddingLeft: '2.4rem', margin: 0, height: '40px' }}
                    />
                    {searchTerm && (
                        <button onClick={() => setSearchTerm('')} title="Clear" style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex' }}>
                            <X size={15} />
                        </button>
                    )}
                </div>
            </div>

            <div className="glass-panel" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--surface-border)', color: 'var(--text-secondary)' }}>
                            <th style={{ padding: '1rem', fontWeight: 600, width: '60px' }}>Sr.</th>
                            <th style={{ padding: '1rem', fontWeight: 600 }}>{t('inventory.table_name')}</th>

                            <th style={{ padding: '1rem', fontWeight: 600, textAlign: 'right' }}>MRP</th>
                            <th style={{ padding: '1rem', fontWeight: 600, textAlign: 'right' }}>PTR (Retailer)</th>
                            <th style={{ padding: '1rem', fontWeight: 600, textAlign: 'right' }}>Selling (Farmer)</th>
                            <th style={{ padding: '1rem', fontWeight: 600, textAlign: 'right' }}>Rate (Purch)</th>

                            <th style={{ padding: '1rem', fontWeight: 600, textAlign: 'right' }}>{t('inventory.stock')}</th>
                            <th style={{ padding: '1rem', fontWeight: 600, textAlign: 'right' }}>{t('inventory.pcs_box')}</th>
                            {userRole === 'admin' && <th style={{ padding: '1rem', fontWeight: 600, textAlign: 'center' }}>{t('common.actions')}</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {visibleProducts.map((product, i) => (
                            <tr
                                key={product.id}
                                className={`animate-fade-in delay-${(i % 5)}00`}
                                style={{
                                    borderBottom: '1px solid var(--surface-border)',
                                    transition: 'background-color 0.2s',
                                }}
                                onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--surface-raised)'}
                                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                <td style={{ padding: '1rem', color: 'var(--text-tertiary)', fontWeight: 500 }}>
                                    #{i + 1}
                                </td>
                                <td style={{ padding: '1rem', fontWeight: 500, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <div style={{ 
                                        width: '44px', height: '44px', borderRadius: '8px', overflow: 'hidden', 
                                        background: 'hsla(152, 60%, 40%, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' 
                                    }}>
                                        {product.imageUrl ? (
                                            <img src={product.imageUrl} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        ) : (
                                            <Package size={20} color="var(--primary-light)" />
                                        )}
                                    </div>
                                    <div>
                                        <div>{product.name}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                                            {product.productNumber && <span style={{ marginRight: '8px', background: 'var(--surface-raised)', padding: '2px 6px', borderRadius: '4px' }}>{product.productNumber}</span>}
                                            {product.type && <span style={{ marginRight: '8px', background: 'hsla(152,60%,40%,0.12)', color: 'var(--primary-light)', padding: '2px 6px', borderRadius: '4px' }}>{product.type}</span>}
                                            <span>{t('inventory.margin')}: {product.margin}</span>
                                        </div>
                                    </div>
                                </td>

                                <td style={{ padding: '1rem', textAlign: 'right', color: 'var(--text-secondary)' }}>
                                    <div style={{ fontWeight: 600 }}>₹{product.maxRetailPrice}</div>
                                    <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>Box: ₹{product.boxMaxRetailPrice || (product.maxRetailPrice * (product.boxCapacity || 1))}</div>
                                </td>
                                <td style={{ padding: '1rem', textAlign: 'right', color: 'var(--secondary-light)' }}>
                                    <div style={{ fontWeight: 600 }}>₹{product.retailerPrice}</div>
                                    <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>Box: ₹{product.boxRetailerPrice || (product.retailerPrice * (product.boxCapacity || 1))}</div>
                                </td>
                                <td style={{ padding: '1rem', textAlign: 'right', color: 'var(--primary-light)' }}>
                                    <div style={{ fontWeight: 600 }}>₹{product.sellingPrice || 0}</div>
                                    <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>Box: ₹{product.boxSellingPrice || (product as any).boxPrice || ((product.sellingPrice || 0) * (product.boxCapacity || 1))}</div>
                                </td>
                                <td style={{ padding: '1rem', textAlign: 'right', color: 'var(--warning)' }}>
                                    <div style={{ fontWeight: 600 }}>₹{product.purchasePrice || 0}</div>
                                    <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>Box: ₹{product.boxPurchasePrice || ((product.purchasePrice || 0) * (product.boxCapacity || 1))}</div>
                                </td>
                                <td style={{ padding: '1rem', textAlign: 'right', color: (product.quantity || (product as any).stock || 0) < 5 ? 'var(--danger)' : 'var(--text-primary)' }}>
                                    <div style={{ fontWeight: 600 }}>{product.quantity || (product as any).stock || 0} {t('inventory.box')}s</div>
                                    <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>+ {product.loosePieces || 0} {t('inventory.loose')}</div>
                                    {(product.quantity || (product as any).stock || 0) < 5 && <div style={{ fontSize: '0.6rem', color: 'var(--danger)', fontWeight: 700, marginTop: '2px' }}>{t('inventory.low_stock')}</div>}
                                </td>
                                <td style={{ padding: '1rem', textAlign: 'right', color: 'var(--text-tertiary)' }}>
                                    {product.boxCapacity || 1} {t(`common.${(product.baseUnit || (product as any).unit || 'pcs').toLowerCase()}`)}
                                </td>
                                {userRole === 'admin' && (
                                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                                            <button onClick={() => handleOpenModal(product)} className="btn btn-secondary" style={{ padding: '0.4rem' }}><Edit2 size={14} /></button>
                                            <button onClick={() => handleDelete(product.id)} className="btn" style={{ padding: '0.4rem', background: 'hsla(0, 84%, 60%, 0.1)', color: 'var(--danger)', border: '1px solid hsla(0, 84%, 60%, 0.2)' }}><Trash2 size={14} /></button>
                                        </div>
                                    </td>
                                )}
                            </tr>
                        ))}
                        {visibleProducts.length === 0 && (
                            <tr>
                                <td colSpan={8} style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                    <Package size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.3, display: 'block' }} />
                                    {searchTerm
                                        ? <div>No products match "<strong>{searchTerm}</strong>".</div>
                                        : <div>No products yet.</div>}
                                    {userRole === 'admin' && (
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
                                    <div style={{ position: 'relative', width: '120px', height: '120px', borderRadius: '12px', border: '2px dashed var(--surface-border)', background: 'var(--surface-raised)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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

                            {/* Section 2: Pricing — piece level + box level (one unified catalog) */}
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
                                        <div>
                                            <label className="input-label">Rate (Your purchase cost)</label>
                                            <input type="number" step="0.01" className="input-field" value={formData.purchasePrice || ''} onChange={e => setFormData({ ...formData, purchasePrice: Number(e.target.value) })} placeholder="0.00" />
                                        </div>
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
                                        <div>
                                            <label className="input-label">Box Rate (Purchase)</label>
                                            <input type="number" step="0.01" className="input-field" style={{ borderColor: 'hsla(45, 93%, 47%, 0.2)' }} value={formData.boxPurchasePrice || ''} onChange={e => setFormData({ ...formData, boxPurchasePrice: Number(e.target.value) })} placeholder={String(formData.purchasePrice * formData.boxCapacity || '')} />
                                        </div>
                                        <div>
                                            <label className="input-label">Box Offer / Selling</label>
                                            <input type="number" step="0.01" className="input-field" style={{ borderColor: 'hsla(45, 93%, 47%, 0.2)' }} value={formData.boxSellingPrice || ''} onChange={e => setFormData({ ...formData, boxSellingPrice: Number(e.target.value) })} placeholder={String(formData.sellingPrice * formData.boxCapacity || '')} />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Section 3: Stock Management */}
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
