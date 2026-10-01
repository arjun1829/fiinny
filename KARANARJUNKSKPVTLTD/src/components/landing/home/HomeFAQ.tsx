import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { home, container, eyebrow } from './tokens';

// Same real questions as the original FAQ, rebranded to FIINNY.
const faqs = [
    {
        q: 'Can I use FIINNY in rural areas or with slow internet?',
        a: 'Yes. FIINNY is built as a PWA, so it works offline. You can keep billing at your counter even if the internet drops, and your data safe-syncs to the secure cloud as soon as you\'re back online. It runs on any budget smartphone, tablet or laptop.',
    },
    {
        q: 'Does it handle full GST compliance?',
        a: 'Yes. From HSN codes to CGST/SGST/IGST breakdowns, every invoice is GST-compliant. You can generate GSTR-1 and GSTR-3B summaries and share professional PDF invoices with your business logo instantly via WhatsApp.',
    },
    {
        q: 'How is my business data protected?',
        a: 'Each business operates in a strictly isolated "tenant" workspace. FIINNY uses bank-grade encryption and Firestore security rules so your inventory, sales and customer data are visible only to you and the team members you invite.',
    },
    {
        q: 'How is FIINNY different from Tally or Vyapar?',
        a: 'Tally is complex and needs training; single-device tools limit you to one screen. FIINNY is a modern, web-native ERP for your business — fast billing, live multi-device access, digital khata, multi-warehouse inventory and analytics, all in one system.',
    },
    {
        q: 'Can I manage customer udhaar (credit) digitally?',
        a: 'Yes. The Digital Khata replaces physical registers. You can track exactly who owes what, send automated WhatsApp payment reminders, and mark settlements in a single click.',
    },
    {
        q: 'What printers and scanners are supported?',
        a: 'FIINNY supports standard 58mm and 80mm thermal receipt printers via browser print. For inventory, use any USB or Bluetooth barcode scanner — or your phone camera — to scan items instantly.',
    },
    {
        q: 'Can I add multiple staff members?',
        a: 'Yes. Invite cashiers, sales staff or managers with role-based permissions. You decide exactly what each person can see — for example billing only, while profit reports stay private.',
    },
    {
        q: 'Does FIINNY connect to the KrishiDukan marketplace?',
        a: 'Yes. For agri-input shops, FIINNY can push live inventory to the KrishiDukan marketplace after each sale, so nearby farmers can see what\'s in stock at your shop in real time.',
    },
];

export default function HomeFAQ() {
    const [open, setOpen] = useState<number | null>(0);

    return (
        <section id="faq" style={{ background: home.color.cream, padding: '6.5rem 2rem' }}>
            <div style={{ ...container, maxWidth: 860 }}>
                <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
                    <span style={eyebrow}>Common questions</span>
                    <h2 style={{
                        fontFamily: home.font.heading, fontWeight: 800, color: home.color.ink,
                        fontSize: '2.9rem', letterSpacing: '-0.03em', margin: '0.9rem 0 0.75rem',
                    }}>
                        Everything you need to know
                    </h2>
                    <p style={{ fontFamily: home.font.body, color: home.color.body, fontSize: '1.1rem', margin: 0 }}>
                        Still curious? The answers below cover what most business owners ask first.
                    </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {faqs.map((faq, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 16 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.04, duration: 0.4 }}
                            style={{
                                background: home.color.surface,
                                border: `1px solid ${open === i ? home.color.emerald : home.color.line}`,
                                borderRadius: home.radius.sm, overflow: 'hidden', transition: 'border-color 0.25s',
                            }}
                        >
                            <button
                                onClick={() => setOpen(open === i ? null : i)}
                                style={{
                                    width: '100%', padding: '1.25rem 1.5rem', display: 'flex',
                                    justifyContent: 'space-between', alignItems: 'center', gap: '1rem',
                                    background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                                    fontFamily: home.font.heading, color: home.color.ink,
                                    fontWeight: open === i ? 700 : 600, fontSize: '1.02rem',
                                }}
                            >
                                <span>{faq.q}</span>
                                <ChevronDown size={20} color={home.color.emerald} style={{
                                    transform: open === i ? 'rotate(180deg)' : 'rotate(0deg)',
                                    transition: 'transform 0.25s', flexShrink: 0,
                                }} />
                            </button>
                            <AnimatePresence>
                                {open === i && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.28, ease: 'easeInOut' }}
                                        style={{ overflow: 'hidden' }}
                                    >
                                        <p style={{
                                            padding: '0 1.5rem 1.35rem', margin: 0,
                                            fontFamily: home.font.body, color: home.color.body, lineHeight: 1.7, fontSize: '0.95rem',
                                        }}>
                                            {faq.a}
                                        </p>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
