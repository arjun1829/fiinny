import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { db, auth } from '../firebase';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, collection, writeBatch } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { Building2, MapPin, Target, Phone, CheckCircle2, LogOut, Home, Package, Printer, Scan, ListChecks, ArrowRight, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

const BUSINESS_TYPES = [
    { value: 'kirana', label: '🛒 Kirana / General Store', quickItems: ['Milk', 'Bread', 'Cooking Oil', 'Rice (5kg)', 'Sugar (1kg)', 'Tea Powder', 'Soap Bar', 'Washing Powder', 'Biscuits', 'Salt'] },
    { value: 'pharmacy', label: '💊 Medical / Pharmacy', quickItems: ['Paracetamol', 'Cough Syrup', 'Vitamin C', 'Band-Aids', 'Face Mask', 'Sanitizer', 'Antiseptic Liquid', 'Ointment', 'Digital Thermometer', 'Tablets Case'] },
    { value: 'garments', label: '👗 Garments / Clothing', quickItems: ['T-Shirt (Cotton)', 'Blue Jeans', 'Formal Shirt', 'Socks (Pair)', 'Casual Dress', 'Kurtis', 'Underwear set', 'Belt', 'Handkerchief', 'Trousers'] },
    { value: 'restaurant', label: '🍛 Restaurant / Food', quickItems: ['Paneer Tikka', 'Butter Chicken', 'Dal Makhani', 'Roti', 'Naan', 'Veg Biryani', 'Coca Cola', 'Water Bottle', 'Coffee', 'Sandwich'] },
    { value: 'hardware', label: '🔧 Hardware / Materials', quickItems: ['Screw Set', 'Hammer', 'Drill Machine', 'Paint Brush', 'Asian Paints (1L)', 'PVC Pipe', 'Screwdriver', 'Pliers', 'Nails (Box)', 'Tape Measure'] },
    { value: 'other', label: '🏢 Other Business', quickItems: ['Service Fee', 'Consultation', 'Standard Item', 'Custom Product', 'Miscellaneous'] },
];

const STEPS = [
    { id: 1, title: 'Store Profile', icon: Building2 },
    { id: 2, title: 'Inventory Launch', icon: Package },
    { id: 3, title: 'Hardware Hub', icon: Printer },
];

export default function ClientOnboardingPage() {
    const { currentUser } = useAuth();
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);
    
    // Step 1 Data
    const [formData, setFormData] = useState({
        businessName: '',
        location: '',
        purpose: 'kirana',
        phone: '',
        referredBy: '',
    });

    // Step 2 Data
    const [selectedItems, setSelectedItems] = useState<string[]>([]);
    
    // Step 3 Data
    const [hardware, setHardware] = useState({
        hasPrinter: true,
        hasScanner: false,
        useGST: true
    });

    useEffect(() => {
        const fetchUserData = async () => {
            if (!currentUser) return;
            try {
                const userSnap = await getDoc(doc(db, 'users', currentUser.uid));
                if (userSnap.exists()) {
                    const userData = userSnap.data();
                    if (userData.phone) {
                        setFormData(prev => ({ ...prev, phone: userData.phone }));
                    }
                }
            } catch (err) {
                console.error('Error fetching user data:', err);
            }
        };
        fetchUserData();
    }, [currentUser]);

    // Update selected items when purpose changes
    useEffect(() => {
        const type = BUSINESS_TYPES.find(b => b.value === formData.purpose);
        if (type) setSelectedItems(type.quickItems);
    }, [formData.purpose]);

    const handleNext = () => setStep(s => Math.min(s + 1, 3));
    const handlePrev = () => setStep(s => Math.max(s - 1, 1));

    const handleSubmit = async () => {
        if (!currentUser) return;
        setLoading(true);

        try {
            const tenantId = `tenant_${currentUser.uid}`;
            
            // 1. Create Tenant
            await setDoc(doc(db, 'tenants', tenantId), {
                ...formData,
                hardware,
                referredBy: formData.referredBy.trim() || null,
                ownerId: currentUser.uid,
                setupCompleted: true,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });

            // 2. Update User
            await updateDoc(doc(db, 'users', currentUser.uid), {
                tenantId: tenantId,
                role: 'admin',
            });

            // 3. Bootstrap Inventory (Batch Write)
            if (selectedItems.length > 0) {
                const batch = writeBatch(db);
                selectedItems.forEach(itemName => {
                    const productRef = doc(collection(db, 'tenants', tenantId, 'products'));
                    batch.set(productRef, {
                        name: itemName,
                        type: formData.purpose,
                        purchasePrice: 0,
                        quantity: 50, 
                        loosePieces: 0,
                        unit: 'pcs',
                        baseUnit: 'pcs',
                        category: 'B2B',
                        sku: `SKU-${Math.random().toString(36).substring(7).toUpperCase()}`,
                        createdAt: serverTimestamp()
                    });
                });
                await batch.commit();
            }

            setDone(true);
            setTimeout(() => {
                window.location.href = '/pricing';
            }, 1800);
        } catch (error) {
            console.error('Error onboarding client:', error);
            alert('Setup failed. Please try again.');
            setLoading(false);
        }
    };

    const renderStep = () => {
        switch (step) {
            case 1:
                return (
                    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div className="input-group">
                            <label><Building2 size={14} style={{ marginBottom: '-2px', marginRight: '6px' }} />Business Name</label>
                            <input required type="text" className="input-field" placeholder="e.g. Sharma General Store" value={formData.businessName} onChange={(e) => setFormData({ ...formData, businessName: e.target.value })} />
                        </div>
                        <div className="input-group">
                            <label><MapPin size={14} style={{ marginBottom: '-2px', marginRight: '6px' }} />City & State</label>
                            <input required type="text" className="input-field" placeholder="e.g. Nagpur, Maharashtra" value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} />
                        </div>
                        <div className="input-group">
                            <label><Target size={14} style={{ marginBottom: '-2px', marginRight: '6px' }} />Business Type</label>
                            <select required className="input-field" value={formData.purpose} onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}>
                                {BUSINESS_TYPES.map((bt) => (
                                    <option key={bt.value} value={bt.value}>{bt.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="input-group">
                            <label><Phone size={14} style={{ marginBottom: '-2px', marginRight: '6px' }} />Phone Number</label>
                            <input type="tel" className="input-field" placeholder="+91 98765 43210" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
                        </div>
                        <button onClick={handleNext} disabled={!formData.businessName || !formData.location} className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }}>
                            Next: Setup Inventory <ArrowRight size={18} style={{ marginLeft: '8px' }} />
                        </button>
                    </motion.div>
                );
            case 2:
                const type = BUSINESS_TYPES.find(b => b.value === formData.purpose);
                return (
                    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                        <div style={{ marginBottom: '1.5rem' }}>
                            <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Bootstrap your Stock</h3>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Select common items you sell to get started instantly.</p>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', maxHeight: '300px', overflowY: 'auto', padding: '0.5rem', marginBottom: '1.5rem' }}>
                            {type?.quickItems.map(item => (
                                <div 
                                    key={item} 
                                    onClick={() => setSelectedItems(prev => prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item])}
                                    style={{ 
                                        padding: '0.75rem', borderRadius: '10px', cursor: 'pointer', border: '1px solid',
                                        borderColor: selectedItems.includes(item) ? 'var(--primary)' : 'var(--surface-border)',
                                        background: selectedItems.includes(item) ? 'hsla(152, 60%, 40%, 0.1)' : 'var(--surface-base)',
                                        display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem'
                                    }}
                                >
                                    <div style={{ width: '14px', height: '14px', borderRadius: '3px', border: '1px solid var(--primary)', background: selectedItems.includes(item) ? 'var(--primary)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                                        {selectedItems.includes(item) && <CheckCircle2 size={10} />}
                                    </div>
                                    {item}
                                </div>
                            ))}
                        </div>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button onClick={handlePrev} className="btn btn-secondary" style={{ flex: 1 }}><ArrowLeft size={18} /> Back</button>
                            <button onClick={handleNext} className="btn btn-primary" style={{ flex: 2 }}>Next: Hardware <ArrowRight size={18} /></button>
                        </div>
                    </motion.div>
                );
            case 3:
                return (
                    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                        <div style={{ marginBottom: '1.5rem' }}>
                            <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Final Touch: Hardware</h3>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Configure your billing preferences for professional invoices.</p>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
                            {[
                                { id: 'hasPrinter', label: 'Do you have a Thermal Printer?', icon: Printer },
                                { id: 'hasScanner', label: 'Do you have a Barcode Scanner?', icon: Scan },
                                { id: 'useGST', label: 'Enable GST Billing (B2B + B2C)?', icon: ListChecks },
                            ].map(pref => (
                                <div 
                                    key={pref.id}
                                    onClick={() => setHardware(prev => ({ ...prev, [pref.id]: !prev[pref.id as keyof typeof hardware] }))}
                                    className="glass-panel"
                                    style={{ 
                                        padding: '1.25rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '1rem',
                                        border: (hardware as any)[pref.id] ? '1px solid var(--primary)' : '1px solid var(--surface-border)',
                                        background: (hardware as any)[pref.id] ? 'hsla(152, 60%, 40%, 0.05)' : 'var(--surface-base)'
                                    }}
                                >
                                    <pref.icon size={24} color={(hardware as any)[pref.id] ? 'var(--primary)' : 'var(--text-tertiary)'} />
                                    <span style={{ fontWeight: 600, flex: 1 }}>{pref.label}</span>
                                    <div style={{ 
                                        width: '20px', height: '20px', borderRadius: '50%', border: '2px solid var(--primary)',
                                        background: (hardware as any)[pref.id] ? 'var(--primary)' : 'transparent'
                                    }} />
                                </div>
                            ))}
                        </div>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button onClick={handlePrev} className="btn btn-secondary" style={{ flex: 1 }}><ArrowLeft size={18} /> Back</button>
                            <button onClick={handleSubmit} disabled={loading} className="btn btn-primary" style={{ flex: 2 }}>
                                {loading ? 'Saving Setup...' : "Finish & Go Live 🚀"}
                            </button>
                        </div>
                    </motion.div>
                );
            default: return null;
        }
    };

    return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-panel" style={{ maxWidth: '640px', width: '100%', padding: '3rem' }}>
                
                {/* Step Progress */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, marginBottom: '3rem' }}>
                    {STEPS.map((s, i) => (
                        <div key={s.id} style={{ display: 'flex', alignItems: 'center' }}>
                            <div className="onboarding-step-indicator" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                                <div className={`onboarding-step-circle ${step === s.id ? 'active' : step > s.id ? 'completed' : 'pending'}`}>
                                    {step > s.id ? <CheckCircle2 size={20} /> : s.id}
                                </div>
                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: step >= s.id ? 'var(--primary-light)' : 'var(--text-tertiary)' }}>{s.title}</span>
                            </div>
                            {i < STEPS.length - 1 && (
                                <div style={{ width: '80px', height: '2px', background: step > s.id ? 'var(--primary)' : 'var(--surface-border)', margin: '0 0.5rem', marginBottom: '20px' }} />
                            )}
                        </div>
                    ))}
                </div>

                <AnimatePresence mode="wait">
                    {done ? (
                        <motion.div key="success" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} style={{ textAlign: 'center', padding: '2rem 0' }}>
                            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring' }} style={{ width: '80px', height: '80px', background: 'hsla(152, 60%, 40%, 0.15)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
                                <CheckCircle2 size={44} color="var(--primary-light)" className="pulse-success" />
                            </motion.div>
                            <h2 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Store is Ready! 🚀</h2>
                            <p style={{ color: 'var(--text-secondary)' }}>Welcome to Fiinny! Choose a plan to start using your ERP...</p>
                        </motion.div>
                    ) : (
                        renderStep()
                    )}
                </AnimatePresence>

                {/* Footer Actions */}
                {!done && (
                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--surface-border)' }}>
                        <button type="button" onClick={() => signOut(auth).then(() => window.location.href = '/')} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', padding: 0 }}>
                            <LogOut size={14} /> Exit Setup
                        </button>
                    </div>
                )}
            </motion.div>
        </div>
    );
}
