import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

const faqs = [
    {
        q: 'Is KaranArjun OS free to use?',
        a: 'Yes! KaranArjun OS is completely free during our Early Adopter Partnership program. You get full access to GST invoicing, smart inventory management, POS billing, Digital Khata, and analytics — all at zero cost. We are committed to empowering Indian retailers.',
    },
    {
        q: 'Can I use it in rural areas or with slow internet?',
        a: 'Absolutely. KaranArjun is built with PWA technology, meaning it works offline. You can continue billing at your counter even if the internet goes down. Your data safe-syncs to our secure cloud as soon as you\'re back online. It works on any budget smartphone, tablet, or laptop.',
    },
    {
        q: 'Does it support professional GST compliance?',
        a: 'Yes. From HSN codes to CGST/SGST/IGST breakdowns, every invoice is 100% GST compliant. You can generate GSTR-1 summaries and share professional PDF invoices with your business logo instantly via WhatsApp.',
    },
    {
        q: 'How is my business data protected?',
        a: 'Data privacy is our top priority. Your business operates in a strictly isolated digital "Tenant" workspace. We use bank-grade encryption and Google Firestore security protocols to ensure that your inventory, sales, and customer data are visible only to you.',
    },
    {
        q: 'How is KaranArjun different from other billing software?',
        a: 'Tally is complex and requires specialized training. Many billing apps are limited to a single device. KaranArjun OS is a modern, web-native "Operating System" for your shop. It\'s faster (3-second billing), works on any device simultaneously, includes a Digital Khata, and is designed for the retailer, not just the accountant.',
    },
    {
        q: 'Can I manage customer Udhaar (Credit) digitally?',
        a: 'Yes! Our Digital Khata feature replaces physical registers. You can track exactly who owes you what, set automated payment reminders via WhatsApp, and mark settlements with a single click.',
    },
    {
        q: 'What kind of printers and scanners are supported?',
        a: 'KaranArjun supports standard 58mm and 80mm thermal receipt printers via browser print. For inventory, you can use any USB or Bluetooth barcode scanner, or even your phone\'s camera to scan items instantly.',
    },
    {
        q: 'Can I add multiple staff members?',
        a: 'Yes. You can invite your sales staff, cashiers, or managers with specific "Role-Based Permissions". You decide exactly what they can see (e.g., billing only) and what stay private (e.g., profit reports).',
    },
];

export default function FAQ() {
    const [open, setOpen] = useState<number | null>(null);

    return (
        <section
            id="faq"
            style={{ padding: '8rem 2rem', maxWidth: '860px', margin: '0 auto' }}
        >
            <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
                <span style={{
                    background: 'hsla(152, 60%, 40%, 0.15)',
                    color: 'var(--primary-light)',
                    padding: '0.4rem 1rem',
                    borderRadius: '99px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    display: 'inline-block',
                    border: '1px solid hsla(152, 60%, 40%, 0.3)',
                    marginBottom: '1.5rem',
                }}>
                    Common Questions
                </span>
                <h2 style={{ fontSize: '3rem', fontWeight: 800, marginBottom: '1rem' }}>
                    Frequently Asked{' '}
                    <span style={{ color: 'var(--primary-light)' }}>Questions</span>
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>
                    Everything a small business owner in India needs to know before getting started.
                </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {faqs.map((faq, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: i * 0.05, duration: 0.5 }}
                        className="glass-panel"
                        style={{
                            border: `1px solid ${open === i ? 'var(--primary-light)' : 'var(--surface-border)'}`,
                            borderRadius: '14px',
                            overflow: 'hidden',
                            transition: 'border-color 0.3s',
                        }}
                    >
                        <button
                            onClick={() => setOpen(open === i ? null : i)}
                            style={{
                                width: '100%',
                                padding: '1.25rem 1.5rem',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: '1rem',
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                font: 'inherit',
                                textAlign: 'left',
                                color: 'var(--text-primary)',
                                fontWeight: open === i ? 700 : 600,
                                fontSize: '1rem',
                            }}
                        >
                            <span>{faq.q}</span>
                            <ChevronDown
                                size={20}
                                style={{
                                    color: 'var(--primary-light)',
                                    transform: open === i ? 'rotate(180deg)' : 'rotate(0deg)',
                                    transition: 'transform 0.3s',
                                    flexShrink: 0,
                                }}
                            />
                        </button>

                        <AnimatePresence>
                            {open === i && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                                    style={{ overflow: 'hidden' }}
                                >
                                    <p style={{
                                        padding: '0 1.5rem 1.25rem',
                                        color: 'var(--text-secondary)',
                                        lineHeight: 1.7,
                                        fontSize: '0.95rem',
                                        borderTop: '1px solid var(--surface-border)',
                                        paddingTop: '1rem',
                                        margin: 0,
                                    }}>
                                        {faq.a}
                                    </p>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                ))}
            </div>
        </section>
    );
}
