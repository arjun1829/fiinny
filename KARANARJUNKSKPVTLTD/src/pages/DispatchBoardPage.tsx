import { useState, useEffect } from 'react';
import { getDocs, query, orderBy, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection, getTenantDoc } from '../utils/tenantPath';
import { useToast } from '../contexts/ToastContext';
import { Truck, CheckCircle, Package } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const STATUS_COLS = [
    { id: 'confirmed', label: 'Confirmed', color: 'var(--secondary)', bg: 'hsla(45,93%,47%,0.1)' },
    { id: 'dispatched', label: 'Dispatched', color: 'var(--primary-light)', bg: 'hsla(152,60%,40%,0.1)' },
    { id: 'delivered', label: 'Delivered', color: 'var(--success)', bg: 'hsla(142,60%,40%,0.08)' },
];

export default function DispatchBoardPage() {
    const { tenantId } = useAuth();
    const { showToast } = useToast();
    const navigate = useNavigate();
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchOrders = async () => {
        if (!tenantId) return;
        try {
            const snap = await getDocs(query(getTenantCollection(db, tenantId, 'salesOrders'), orderBy('createdAt', 'desc')));
            setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter((o: any) => ['confirmed', 'dispatched', 'delivered'].includes(o.status)));
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchOrders(); }, [tenantId]);

    const moveStatus = async (order: any, newStatus: string) => {
        if (!tenantId) return;
        try {
            await updateDoc(getTenantDoc(db, tenantId, 'salesOrders', order.id), { status: newStatus, updatedAt: serverTimestamp() });
            showToast(`Order moved to ${newStatus}`, 'success');
            fetchOrders();
        } catch { showToast('Failed to update status', 'error'); }
    };

    if (loading) return <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>Loading...</div>;

    return (
        <div className="animate-fade-in" style={{ maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ marginBottom: '2rem' }}>
                <h1 className="primary-gradient-text" style={{ fontSize: '2rem' }}>Dispatch Board</h1>
                <p style={{ color: 'var(--text-secondary)' }}>Track active orders from confirmation through delivery.</p>
            </div>

            {orders.length === 0 ? (
                <div className="glass-panel" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                    <Truck size={48} color="var(--surface-border)" style={{ margin: '0 auto 1rem auto', display: 'block' }} />
                    <h3 style={{ color: 'var(--text-secondary)' }}>No active dispatches</h3>
                    <p style={{ color: 'var(--text-tertiary)' }}>Confirm a sales order to see it here.</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', alignItems: 'start' }}>
                    {STATUS_COLS.map(col => {
                        const colOrders = orders.filter((o: any) => o.status === col.id);
                        return (
                            <div key={col.id}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', padding: '0.6rem 1rem', background: col.bg, borderRadius: '10px', borderLeft: `3px solid ${col.color}` }}>
                                    <span style={{ fontWeight: 700, color: col.color, fontSize: '0.9rem' }}>{col.label}</span>
                                    <span style={{ background: col.color, color: 'white', borderRadius: '20px', padding: '1px 8px', fontSize: '0.75rem', fontWeight: 700 }}>{colOrders.length}</span>
                                </div>
                                <div className="themed-scroll" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: 'calc(6 * 158px)', overflowY: 'auto', paddingRight: '0.4rem' }}>
                                    {colOrders.length === 0 && (
                                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-tertiary)', border: '2px dashed var(--surface-border)', borderRadius: '10px', fontSize: '0.85rem' }}>
                                            No orders
                                        </div>
                                    )}
                                    {colOrders.map((order: any) => (
                                        <div key={order.id} className="glass-panel" style={{ padding: '1.25rem', cursor: 'pointer' }} onClick={() => navigate(`/sales-order/${order.id}`)}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                                                <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--primary-light)' }}>{order.orderNumber}</span>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{order.createdAt?.toDate ? new Date(order.createdAt.toDate()).toLocaleDateString() : ''}</span>
                                            </div>
                                            <p style={{ fontWeight: 600, margin: '0 0 0.25rem' }}>{order.retailerName}</p>
                                            <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', margin: '0 0 0.75rem' }}>{order.retailerAddress}</p>
                                            {order.assignedManufacturerName && (
                                                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0 0 0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                    <Package size={12} /> {order.assignedManufacturerName}
                                                </p>
                                            )}
                                            <p style={{ fontWeight: 700, color: 'var(--primary-light)', margin: '0 0 0.75rem' }}>₹{Number(order.grandTotal).toLocaleString()}</p>
                                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                {col.id === 'confirmed' && (
                                                    <button className="btn btn-primary" style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                                                        onClick={e => { e.stopPropagation(); moveStatus(order, 'dispatched'); }}>
                                                        <Truck size={13} /> Mark Dispatched
                                                    </button>
                                                )}
                                                {col.id === 'dispatched' && (
                                                    <button className="btn" style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem', background: 'hsla(142,60%,40%,0.15)', color: 'var(--success)', border: '1px solid hsla(142,60%,40%,0.3)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                                                        onClick={e => { e.stopPropagation(); moveStatus(order, 'delivered'); }}>
                                                        <CheckCircle size={13} /> Mark Delivered
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
