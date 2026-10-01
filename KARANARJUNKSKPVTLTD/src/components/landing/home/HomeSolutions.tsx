import { motion } from 'framer-motion';
import {
    Calculator, FileText, BookOpen, Boxes, ClipboardList,
    BarChart3, Link2, Sparkles, Users, Sprout,
} from 'lucide-react';
import { home, container, eyebrow } from './tokens';

// Every card maps to a module that actually ships in the ERP.
const solutions = [
    { icon: Calculator, title: 'POS Billing', desc: 'Fast counter checkout with thermal-printer receipts and WhatsApp delivery.' },
    { icon: FileText, title: 'B2B GST Invoicing', desc: 'HSN-aware CGST/SGST/IGST invoices with GSTR-1 & GSTR-3B summaries.' },
    { icon: BookOpen, title: 'Digital Khata', desc: 'Track customer & supplier credit with automated payment reminders.' },
    { icon: Boxes, title: 'Inventory & Warehouses', desc: 'Batches, expiry, barcode labels and multi-godown stock movement.' },
    { icon: ClipboardList, title: 'Sales Worklist', desc: 'Quotation → sales order → delivery challan → invoice, tracked end to end.' },
    { icon: BarChart3, title: 'Analytics & Reports', desc: 'B2B, B2C and online dashboards plus P&L, balance sheet and GST reports.' },
    { icon: Link2, title: 'Payments', desc: 'Razorpay payment links, reminders and reconciliation built in.' },
    { icon: Sparkles, title: 'AI Business Advisor', desc: 'Claude-powered insights on reorders, margins and business health.' },
    { icon: Users, title: 'Roles & Portals', desc: 'Role-based access with dedicated retailer and manufacturer portals.' },
    { icon: Sprout, title: 'KrishiDukan Sync', desc: 'Push live inventory to the KrishiDukan marketplace after every sale.' },
];

export default function HomeSolutions() {
    return (
        <section id="features" style={{ background: home.color.surface, padding: '6.5rem 2rem' }}>
            <div style={container}>
                <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
                    <span style={eyebrow}>Major ERP capabilities</span>
                    <h2 style={{
                        fontFamily: home.font.heading, fontWeight: 800, color: home.color.ink,
                        fontSize: '2.9rem', letterSpacing: '-0.03em', margin: '0.9rem 0 0.75rem',
                    }}>
                        Everything your operation needs, in one system
                    </h2>
                    <p style={{ fontFamily: home.font.body, color: home.color.body, fontSize: '1.15rem', maxWidth: '640px', margin: '0 auto', lineHeight: 1.6 }}>
                        No stitched-together tools. Billing, inventory, credit, payments and insight all
                        share the same live data.
                    </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.25rem' }}>
                    {solutions.map((s, i) => (
                        <motion.div
                            key={s.title}
                            initial={{ opacity: 0, y: 24 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: (i % 5) * 0.06, duration: 0.5 }}
                            whileHover={{ y: -6, borderColor: home.color.emerald }}
                            style={{
                                background: home.color.cream, border: `1px solid ${home.color.line}`,
                                borderRadius: home.radius.md, padding: '1.75rem',
                            }}
                        >
                            <div style={{
                                width: 48, height: 48, borderRadius: home.radius.sm, marginBottom: '1.1rem',
                                background: home.color.emeraldSoft, color: home.color.forest,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <s.icon size={24} />
                            </div>
                            <h3 style={{ fontFamily: home.font.heading, fontWeight: 700, fontSize: '1.15rem', color: home.color.ink, margin: '0 0 0.45rem' }}>
                                {s.title}
                            </h3>
                            <p style={{ fontFamily: home.font.body, fontSize: '0.93rem', color: home.color.body, lineHeight: 1.55, margin: 0 }}>
                                {s.desc}
                            </p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
