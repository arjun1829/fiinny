import { useState, useRef } from 'react';
import { Upload, X, AlertCircle, CheckCircle2, Loader2, AlertTriangle, ChevronRight } from 'lucide-react';
import Papa from 'papaparse';
import { writeBatch, doc, serverTimestamp, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { getTenantCollection } from '../utils/tenantPath';
import { useAuth } from '../contexts/AuthContext';
import { useSchema } from '../contexts/SchemaContext';

interface UdhariUploadModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

type Step = 'upload' | 'preview' | 'importing' | 'done';

type RowStatus = 'ok' | 'warning' | 'skip';

interface RowPreview {
    index: number;
    name: string;
    number: string;
    portfolioSize: string;
    outstandingAmount: number;
    status: RowStatus;
    issues: string[];
    warnings: string[];
}

interface ImportResult {
    imported: number;
    skipped: number;
    duplicates: number;
    ordersCreated: number;
    rows: { rowIndex: number; name: string; status: string; issues: string[]; warnings: string[] }[];
}

// ─── Local validation (mirrors Cloud Function logic) ──────────────────────────

function cleanPhoneLocally(raw: string): { number: string | null; warnings: string[]; error: string | null } {
    if (!raw || !raw.trim()) return { number: null, warnings: [], error: 'Missing phone number' };

    const parts = raw.trim().split(/[\s,;]+/).filter(Boolean);
    const validNumbers: string[] = [];
    const warnings: string[] = [];

    for (const part of parts) {
        let stripped = part.replace(/[^\d]/g, '');
        if (stripped.length === 12 && stripped.startsWith('91')) {
            stripped = stripped.slice(2);
            warnings.push(`Stripped +91 from "${part}"`);
        }
        if (stripped.length === 11 && stripped.startsWith('0')) stripped = stripped.slice(1);
        if (/^\d{10}$/.test(stripped)) validNumbers.push(stripped);
    }

    if (validNumbers.length === 0) return { number: null, warnings, error: `"${raw}" is not a valid 10-digit number` };
    if (validNumbers.length > 1) warnings.push(`Multiple numbers → using ${validNumbers[0]} as primary`);
    return { number: validNumbers[0], warnings, error: null };
}

function validateRowLocally(row: Record<string, string>, index: number): RowPreview {
    const name = (row['Retailer Name'] || row['name'] || '').trim();
    const rawNumber = row['Contact Number'] || row['number'] || '';
    const location = row['Location/Village'] || row['location'] || '';
    const portfolioSize = row['Portfolio Size'] || row['portfolioSize'] || '';
    const outstandingAmount = parseFloat(String(row['Outstanding Balance'] || row['outstandingAmount'] || '0').replace(/,/g, '')) || 0;

    const issues: string[] = [];
    const warnings: string[] = [];

    if (!name) {
        issues.push('Missing retailer name');
        return { index, name: `Row ${index}`, number: rawNumber, portfolioSize, outstandingAmount, status: 'skip', issues, warnings };
    }

    // Detect test data
    if (name.toLowerCase().includes('test') && rawNumber.toLowerCase().replace(/\s/g, '').match(/[a-z]/)) {
        issues.push('Detected as test data');
        return { index, name, number: rawNumber, portfolioSize, outstandingAmount, status: 'skip', issues, warnings };
    }

    const phoneResult = cleanPhoneLocally(rawNumber);
    if (phoneResult.error) {
        issues.push(phoneResult.error);
        return { index, name, number: rawNumber, portfolioSize, outstandingAmount, status: 'skip', issues, warnings };
    }
    warnings.push(...phoneResult.warnings);

    if (!location.trim()) warnings.push('No location provided');
    if (!portfolioSize || !['Big', 'Medium', 'Small'].includes(portfolioSize)) {
        warnings.push(`Portfolio size "${portfolioSize || 'empty'}" → will default to Small`);
    }

    return {
        index,
        name,
        number: phoneResult.number || rawNumber,
        portfolioSize,
        outstandingAmount,
        status: warnings.length > 0 ? 'warning' : 'ok',
        issues,
        warnings,
    };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function UdhariUploadModal({ isOpen, onClose, onSuccess }: UdhariUploadModalProps) {
    const { tenantId } = useAuth();
    const { getSchema } = useSchema();
    const [step, setStep] = useState<Step>('upload');
    const [file, setFile] = useState<File | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([]);
    const [preview, setPreview] = useState<RowPreview[]>([]);
    const [result, setResult] = useState<ImportResult | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const schema = getSchema('retailers');

    if (!isOpen) return null;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            setFile(e.target.files[0]);
            setError(null);
        }
    };

    const handleParseAndPreview = () => {
        if (!file) return;
        setError(null);

        Papa.parse<Record<string, string>>(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                const data = results.data;
                if (data.length === 0) { setError('The CSV file is empty.'); return; }

                // Fall back to schema-label mapping if standard headers not found
                const firstRow = data[0];
                const hasStandardHeaders = 'Retailer Name' in firstRow || 'Contact Number' in firstRow;

                let normalized = data;
                if (!hasStandardHeaders && schema) {
                    const exportFields = schema.fields.filter(f => f.visibleInExport).sort((a, b) => a.order - b.order);
                    const colKeys = Object.keys(firstRow);
                    normalized = data.map(row => {
                        const mapped: Record<string, string> = {};
                        exportFields.forEach((field, i) => {
                            mapped[field.label] = String(row[field.label] || Object.values(row)[i] || '');
                        });
                        // Re-map schema labels to standard keys for validation
                        mapped['Retailer Name'] = mapped['Retailer Name'] || mapped['name'] || '';
                        mapped['Contact Number'] = mapped['Contact Number'] || mapped['Contact Number'] || '';
                        return { ...row, ...mapped };
                    });
                    void colKeys; // suppress unused warning
                }

                setParsedRows(normalized);
                const previews = normalized.map((row, i) => validateRowLocally(row, i + 1));
                setPreview(previews);
                setStep('preview');
            },
            error: (err) => setError(`Parse error: ${err.message}`),
        });
    };

    const handleConfirmImport = async () => {
        if (!tenantId || parsedRows.length === 0) return;
        setStep('importing');
        setError(null);

        try {
            // Load existing retailer names for dedup
            const existingSnap = await getDocs(query(getTenantCollection(db, tenantId, 'retailers'), where('name', '!=', '')));
            const existingNames = new Set(existingSnap.docs.map(d => ((d.data().name as string) || '').toLowerCase().trim()));

            let batch = writeBatch(db);
            let ops = 0;
            const OPS_LIMIT = 490;
            const flush = async () => { await batch.commit(); batch = writeBatch(db); ops = 0; };

            const counts = { imported: 0, skipped: 0, duplicates: 0, ordersCreated: 0 };

            // Only import rows that passed validation (ok + warning)
            const importableRows = parsedRows.filter((_, i) => preview[i]?.status !== 'skip');

            for (let i = 0; i < importableRows.length; i++) {
                const row = importableRows[i];
                const name = (row['Retailer Name'] || row['name'] || '').trim();
                if (!name) { counts.skipped++; continue; }

                const nameKey = name.toLowerCase().trim();
                if (existingNames.has(nameKey)) { counts.duplicates++; continue; }

                // Clean phone: strip +91, pick first valid 10-digit
                const rawPhone = row['Contact Number'] || row['number'] || '';
                const phoneParts = rawPhone.trim().split(/[\s,;]+/).filter(Boolean);
                let cleanPhone = '';
                for (const p of phoneParts) {
                    let s = p.replace(/[^\d]/g, '');
                    if (s.length === 12 && s.startsWith('91')) s = s.slice(2);
                    if (s.length === 11 && s.startsWith('0')) s = s.slice(1);
                    if (/^\d{10}$/.test(s)) { cleanPhone = s; break; }
                }

                const outstandingAmount = parseFloat(String(row['Outstanding Balance'] || row['outstandingAmount'] || '0').replace(/,/g, '')) || 0;
                const portfolioSize = ['Big', 'Medium', 'Small'].includes(row['Portfolio Size'] || '') ? row['Portfolio Size'] : 'Small';

                const retailerRef = doc(getTenantCollection(db, tenantId, 'retailers'));
                batch.set(retailerRef, {
                    name,
                    number: cleanPhone || rawPhone,
                    alternateNumber: (row['Alternate Mobile'] || row['alternateNumber'] || '').trim(),
                    location: (row['Location/Village'] || row['location'] || '').trim(),
                    email: (row['Email Address'] || row['email'] || '').trim(),
                    portfolioSize,
                    bookName: (row['Book Name'] || row['bookName'] || '').trim(),
                    billBookPageNo: (row['Bill Book Page No'] || row['billBookPageNo'] || '').trim(),
                    outstandingAmount,
                    createdAt: serverTimestamp(),
                });
                ops++;
                existingNames.add(nameKey);
                counts.imported++;

                if (outstandingAmount > 0) {
                    const orderRef = doc(getTenantCollection(db, tenantId, 'orders'));
                    batch.set(orderRef, {
                        retailerId: retailerRef.id,
                        retailerName: name,
                        productId: 'UDHARI_IMPORT',
                        productName: 'Imported Opening Balance',
                        quantity: 1, unit: 'N/A',
                        amount: outstandingAmount,
                        paymentStatus: 'Unpaid',
                        isDelivered: true,
                        createdAt: serverTimestamp(),
                        notes: 'Imported via CSV upload',
                    });
                    ops++;
                    counts.ordersCreated++;
                }

                if (ops >= OPS_LIMIT) await flush();
            }

            if (ops > 0) await flush();

            setResult({ ...counts, rows: [] });
            setStep('done');
            onSuccess();
        } catch (err: any) {
            setError(err.message || 'Import failed. Please try again.');
            setStep('preview');
        }
    };

    const handleClose = () => {
        setStep('upload');
        setFile(null);
        setError(null);
        setParsedRows([]);
        setPreview([]);
        setResult(null);
        onClose();
    };

    const okCount = preview.filter(r => r.status === 'ok').length;
    const warnCount = preview.filter(r => r.status === 'warning').length;
    const skipCount = preview.filter(r => r.status === 'skip').length;

    return (
        <div className="modal-overlay animate-fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 100 }}>
            <div className="modal-content animate-slide-up glass-panel" style={{ width: '100%', maxWidth: step === 'preview' ? '720px' : '500px', padding: '2rem', position: 'relative', maxHeight: '90vh', overflowY: 'auto' }}>
                <button onClick={handleClose} className="btn-icon" style={{ position: 'absolute', top: '1rem', right: '1rem' }}>
                    <X size={20} />
                </button>

                <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Upload className="primary-gradient-text" />
                    Import Retailers CSV
                </h2>

                {/* Step indicator */}
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1.5rem', fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                    {(['upload', 'preview', 'importing', 'done'] as Step[]).map((s, i, arr) => (
                        <span key={s} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ color: step === s ? 'var(--primary)' : s === 'done' && result ? 'var(--primary-light)' : 'inherit', fontWeight: step === s ? 600 : 400 }}>
                                {s === 'upload' ? '1. Upload' : s === 'preview' ? '2. Preview' : s === 'importing' ? '3. Importing' : '4. Done'}
                            </span>
                            {i < arr.length - 1 && <ChevronRight size={12} />}
                        </span>
                    ))}
                </div>

                {error && (
                    <div style={{ padding: '0.75rem 1rem', background: 'hsla(0,100%,50%,0.1)', color: '#ff4d4f', borderRadius: '8px', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                        <AlertCircle size={16} />
                        {error}
                    </div>
                )}

                {/* ── Step 1: Upload ── */}
                {step === 'upload' && (
                    <>
                        <div style={{ marginBottom: '1.5rem', background: 'var(--surface-raised)', borderRadius: '12px', border: '1px dashed var(--surface-border)', padding: '2rem', textAlign: 'center' }}>
                            <input type="file" accept=".csv" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileChange} />
                            <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()} style={{ margin: '0 auto 1rem auto' }}>
                                Select CSV File
                            </button>
                            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>
                                {file ? `Selected: ${file.name}` : 'CSV must have headers: Retailer Name, Contact Number, Location/Village, Portfolio Size, Outstanding Balance'}
                            </p>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                            <button className="btn btn-secondary" onClick={handleClose}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleParseAndPreview} disabled={!file} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                Preview Data <ChevronRight size={16} />
                            </button>
                        </div>
                    </>
                )}

                {/* ── Step 2: Preview ── */}
                {step === 'preview' && (
                    <>
                        {/* Summary chips */}
                        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                            <span style={{ padding: '0.35rem 0.75rem', borderRadius: '999px', background: 'hsla(152,60%,40%,0.15)', color: 'var(--primary-light)', fontSize: '0.8rem', fontWeight: 600 }}>
                                ✓ {okCount + warnCount} will import
                            </span>
                            {warnCount > 0 && (
                                <span style={{ padding: '0.35rem 0.75rem', borderRadius: '999px', background: 'hsla(38,90%,50%,0.15)', color: '#faad14', fontSize: '0.8rem', fontWeight: 600 }}>
                                    ⚠ {warnCount} with warnings
                                </span>
                            )}
                            {skipCount > 0 && (
                                <span style={{ padding: '0.35rem 0.75rem', borderRadius: '999px', background: 'hsla(0,100%,50%,0.1)', color: '#ff4d4f', fontSize: '0.8rem', fontWeight: 600 }}>
                                    ✗ {skipCount} will be skipped
                                </span>
                            )}
                        </div>

                        {/* Preview table */}
                        <div style={{ overflowX: 'auto', marginBottom: '1.5rem', borderRadius: '10px', border: '1px solid var(--surface-border)' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                <thead>
                                    <tr style={{ background: 'var(--surface-raised)', borderBottom: '1px solid var(--surface-border)' }}>
                                        <th style={{ padding: '0.6rem 0.75rem', textAlign: 'left', color: 'var(--text-secondary)' }}>#</th>
                                        <th style={{ padding: '0.6rem 0.75rem', textAlign: 'left', color: 'var(--text-secondary)' }}>Name</th>
                                        <th style={{ padding: '0.6rem 0.75rem', textAlign: 'left', color: 'var(--text-secondary)' }}>Phone</th>
                                        <th style={{ padding: '0.6rem 0.75rem', textAlign: 'right', color: 'var(--text-secondary)' }}>Outstanding</th>
                                        <th style={{ padding: '0.6rem 0.75rem', textAlign: 'left', color: 'var(--text-secondary)' }}>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {preview.map((row) => (
                                        <tr key={row.index} style={{ borderBottom: '1px solid var(--surface-border)', background: row.status === 'skip' ? 'hsla(0,100%,50%,0.04)' : 'transparent' }}>
                                            <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text-tertiary)' }}>{row.index}</td>
                                            <td style={{ padding: '0.6rem 0.75rem', maxWidth: '200px' }}>
                                                <span style={{ color: row.status === 'skip' ? 'var(--text-tertiary)' : 'var(--text-primary)', textDecoration: row.status === 'skip' ? 'line-through' : 'none' }}>
                                                    {row.name}
                                                </span>
                                            </td>
                                            <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{row.number}</td>
                                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', color: row.outstandingAmount > 0 ? '#ff9800' : 'var(--text-tertiary)' }}>
                                                {row.outstandingAmount > 0 ? `₹${row.outstandingAmount.toLocaleString('en-IN')}` : '—'}
                                            </td>
                                            <td style={{ padding: '0.6rem 0.75rem' }}>
                                                {row.status === 'ok' && <span style={{ color: 'var(--primary-light)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><CheckCircle2 size={13} /> OK</span>}
                                                {row.status === 'warning' && (
                                                    <div>
                                                        <span style={{ color: '#faad14', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><AlertTriangle size={13} /> Warning</span>
                                                        {row.warnings.map((w, i) => <div key={i} style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.2rem' }}>{w}</div>)}
                                                    </div>
                                                )}
                                                {row.status === 'skip' && (
                                                    <div>
                                                        <span style={{ color: '#ff4d4f', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><X size={13} /> Skip</span>
                                                        {row.issues.map((e, i) => <div key={i} style={{ fontSize: '0.75rem', color: '#ff4d4f', marginTop: '0.2rem' }}>{e}</div>)}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                            <button className="btn btn-secondary" onClick={() => setStep('upload')}>Back</button>
                            <button
                                className="btn btn-primary"
                                onClick={handleConfirmImport}
                                disabled={okCount + warnCount === 0}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                            >
                                Import {okCount + warnCount} Retailers
                            </button>
                        </div>
                    </>
                )}

                {/* ── Step 3: Importing ── */}
                {step === 'importing' && (
                    <div style={{ padding: '2rem 0', textAlign: 'center' }}>
                        <Loader2 size={40} className="animate-spin" style={{ margin: '0 auto 1rem auto', color: 'var(--primary)' }} />
                        <p style={{ color: 'var(--text-secondary)' }}>Importing {okCount + warnCount} retailers via backend…</p>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginTop: '0.5rem' }}>Using batch writes — this is fast and safe.</p>
                    </div>
                )}

                {/* ── Step 4: Done ── */}
                {step === 'done' && result && (
                    <>
                        <div style={{ padding: '1.5rem', background: 'hsla(152,60%,40%,0.1)', color: 'var(--primary-light)', borderRadius: '8px', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', textAlign: 'center' }}>
                            <CheckCircle2 size={48} />
                            <strong style={{ fontSize: '1.25rem' }}>Import Complete!</strong>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
                            {[
                                { label: 'Retailers Added', value: result.imported, color: 'var(--primary-light)' },
                                { label: 'Outstanding Orders', value: result.ordersCreated, color: '#ff9800' },
                                { label: 'Duplicates Skipped', value: result.duplicates, color: 'var(--text-tertiary)' },
                                { label: 'Invalid Rows Skipped', value: result.skipped, color: '#ff4d4f' },
                            ].map(({ label, value, color }) => (
                                <div key={label} style={{ padding: '1rem', background: 'var(--surface-raised)', borderRadius: '10px', border: '1px solid var(--surface-border)', textAlign: 'center' }}>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color }}>{value}</div>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginTop: '0.25rem' }}>{label}</div>
                                </div>
                            ))}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button className="btn btn-primary" onClick={handleClose}>Done</button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
