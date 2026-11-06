import {
    ArrowRight, BadgeIndianRupee, BookOpenCheck, Boxes, HeartHandshake, Languages, Lock,
    MessageCircle, ReceiptText, ScanBarcode, ShieldCheck, Sprout, Store,
} from 'lucide-react';
import KaPage from '../components/landing/ka/KaPage';
import { usePageJsonLd } from '../hooks/useSeo';
import { BRAND, whatsappLink } from '../utils/brand';
import { usePricingPlans } from '../hooks/usePricingPlans';
import { formatINR } from '../utils/pendingPlan';

const VALUES = [
    {
        icon: Store,
        t: 'Built for the counter',
        d: 'Every screen is designed around how an agri-input shop actually works: a farmer at the counter, a helper fetching stock, the owner keeping an eye on udhaar.',
    },
    {
        icon: BadgeIndianRupee,
        t: 'Honest pricing',
        d: 'One clear price per plan. No setup fee, no hidden charges, and no plan renews without you choosing to pay again.',
    },
    {
        icon: Lock,
        t: 'Your data is yours',
        d: 'Your customers, bills and margins are visible only to you and the staff you add. We do not sell or share business data. Ever.',
    },
    {
        icon: HeartHandshake,
        t: 'Help in your language',
        d: 'Talk to us on phone or WhatsApp in Marathi, Hindi or English. We understand the trade because we are in it.',
    },
];

const WHY_AGRI = [
    { icon: Boxes, t: 'Batches and expiry', d: 'Pesticides and seeds expire. Batch-wise stock with expiry dates is built in, not an add-on.' },
    { icon: ScanBarcode, t: 'Pack sizes that make sense', d: '100 ml, 250 ml, 1 L. 25 kg, 45 kg, 50 kg bags. Sell loose or by the box with the right price.' },
    { icon: ReceiptText, t: 'Licences on every bill', d: 'Your fertilizer, pesticide and seed licence numbers print on the invoice, as the law asks.' },
    { icon: BookOpenCheck, t: 'Season-long udhaar', d: 'Farmers buy at sowing and pay at harvest. The khata is designed for credit that runs for months.' },
];

export default function AboutPage() {
    // Prices come from the Super Admin plan editor, never typed into copy.
    const starter = usePricingPlans().plans.find(p => p.id === 'starter');
    usePageJsonLd('/about', [{
            '@context': 'https://schema.org',
            '@type': 'AboutPage',
            name: `About ${BRAND.name}`,
            url: `${BRAND.url}/about`,
            about: { '@type': 'Organization', name: BRAND.company, url: BRAND.url },
        }]);

    return (
        <KaPage>
            {/* ── Hero ─────────────────────────────────────────────── */}
            <section className="ka-hero">
                <div className="ka-container ka-hero-grid">
                    <div style={{ display: 'grid', gap: 18 }}>
                        <span className="ka-pill"><Sprout size={15} /> {BRAND.initiative}</span>
                        <h1 style={{ margin: 0 }}>Software for one trade: <span className="ka-underline">agri-input retail</span>.</h1>
                        <p className="ka-lead">
                            {BRAND.name} is an initiative of Karan Arjun to build ERP, billing and POS software only for
                            the people who sell seeds, fertilizers and pesticides to India’s farmers. Not for every shop. Just yours.
                        </p>
                        <div className="ka-hero-ctas">
                            <a href="/#pricing" className="ka-btn ka-btn-primary">See plans <ArrowRight size={18} /></a>
                            <a href={whatsappLink()} target="_blank" rel="noopener noreferrer" className="ka-btn ka-btn-ghost"><MessageCircle size={18} /> Talk to us</a>
                        </div>
                    </div>
                    <div className="ka-hero-visual">
                        <div className="ka-hero-photo">
                            <img src="/images/home/agri-shopkeeper.webp" alt="Agri-input retailer at his shop counter" width={509} height={555} />
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Story ────────────────────────────────────────────── */}
            <section className="ka-section">
                <div className="ka-container ka-grid-2" style={{ alignItems: 'start', gap: 48 }}>
                    <div style={{ display: 'grid', gap: 14 }}>
                        <span className="ka-eyebrow">Our story</span>
                        <h2 className="ka-h2">We built it to run our own agri business first.</h2>
                    </div>
                    <div style={{ display: 'grid', gap: 16 }}>
                        <p className="ka-lead">
                            Karan Arjun works in the agri-input trade in Maharashtra. Like most businesses in this trade, we ran on
                            bill books, a khata register and spreadsheets, and we watched the same problems repeat every season:
                            udhaar nobody could total, expired stock found too late, and month-end GST done from a pile of paper.
                        </p>
                        <p className="ka-lead">
                            General billing apps did not understand batches, pack sizes, licences or crop-season credit. So we built
                            our own, and we use it every day for our own billing, stock and collections. {BRAND.name} is that same
                            software, opened up to agri-input retailers everywhere.
                        </p>
                        <p className="ka-quote">“If it does not work at a busy counter in sowing season, it does not ship.”</p>
                    </div>
                </div>
            </section>

            {/* ── Facts ────────────────────────────────────────────── */}
            <section className="ka-section-tight">
                <div className="ka-container ka-stats">
                    <div className="ka-stat"><b>1 trade</b><span>We build only for agri-input retailers, and say no to everything else.</span></div>
                    <div className="ka-stat"><b>3 products</b><span>ERP, billing and POS, sharing the same live data.</span></div>
                    <div className="ka-stat"><b>Same day</b><span>Sign up, add your shop and print your first bill.</span></div>
                    <div className="ka-stat"><b>₹0 setup</b><span>No installation, hardware or setup fee. Just your plan.</span></div>
                </div>
            </section>

            {/* ── What we build ───────────────────────────────────── */}
            <section className="ka-section">
                <div className="ka-container">
                    <div className="ka-section-head">
                        <span className="ka-eyebrow">What we build</span>
                        <h2 className="ka-h2">ERP, billing and POS. Nothing you do not need.</h2>
                    </div>
                    <div className="ka-grid-3">
                        <div className="ka-tile">
                            <div className="ka-tile-icon"><ReceiptText size={22} /></div>
                            <h4>Billing</h4>
                            <p>GST invoices for bulk buyers and FPOs, with HSN codes, your GSTIN and licence numbers on every bill.</p>
                        </div>
                        <div className="ka-tile">
                            <div className="ka-tile-icon"><Store size={22} /></div>
                            <h4>POS</h4>
                            <p>Fast counter billing for farmers: search, add, print. Thermal or A4, cash, UPI or udhaar.</p>
                        </div>
                        <div className="ka-tile">
                            <div className="ka-tile-icon"><Boxes size={22} /></div>
                            <h4>ERP</h4>
                            <p>Stock with batches and expiry, purchases and suppliers, khata, staff roles and the reports your CA needs.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Why only agri ───────────────────────────────────── */}
            <section className="ka-section" style={{ background: 'var(--ka-surface)' }}>
                <div className="ka-container">
                    <div className="ka-section-head">
                        <span className="ka-eyebrow">Why only agri-input</span>
                        <h2 className="ka-h2">Your trade has its own rules. Your software should too.</h2>
                    </div>
                    <div className="ka-grid-2">
                        {WHY_AGRI.map(w => (
                            <div className="ka-tile" key={w.t}>
                                <div className="ka-tile-icon"><w.icon size={22} /></div>
                                <h4>{w.t}</h4>
                                <p>{w.d}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Values ──────────────────────────────────────────── */}
            <section className="ka-section">
                <div className="ka-container">
                    <div className="ka-section-head">
                        <span className="ka-eyebrow">What we stand for</span>
                        <h2 className="ka-h2">Our promises to every shop owner.</h2>
                    </div>
                    <div className="ka-grid-2">
                        {VALUES.map(v => (
                            <div className="ka-tile" key={v.t}>
                                <div className="ka-tile-icon"><v.icon size={22} /></div>
                                <h4>{v.t}</h4>
                                <p>{v.d}</p>
                            </div>
                        ))}
                    </div>
                    <div className="ka-pay-badges" style={{ marginTop: 28 }}>
                        <span><ShieldCheck size={16} /> Each business’s data kept separate</span>
                        <span><Lock size={16} /> Payments by Razorpay</span>
                        <span><Languages size={16} /> Marathi · हिन्दी · English support</span>
                    </div>
                </div>
            </section>

            {/* ── Contact ─────────────────────────────────────────── */}
            <section className="ka-section" id="contact" style={{ paddingTop: 0 }}>
                <div className="ka-container">
                    <div className="ka-section-head">
                        <span className="ka-eyebrow">Get in touch</span>
                        <h2 className="ka-h2">Talk to a person, not a ticket.</h2>
                        <p className="ka-lead">Questions about plans, setting up your shop or moving from your old software: call or WhatsApp us.</p>
                    </div>
                    <div className="ka-grid-3">
                        <a className="ka-contact-card" href={`tel:${BRAND.supportPhoneE164}`}>
                            <small>Phone</small><b>{BRAND.supportPhone}</b><span>Mon–Sat, 10 am – 7 pm</span>
                        </a>
                        <a className="ka-contact-card" href={whatsappLink()} target="_blank" rel="noopener noreferrer">
                            <small>WhatsApp</small><b>Chat with us</b><span>Usually replies within working hours</span>
                        </a>
                        <a className="ka-contact-card" href={`mailto:${BRAND.supportEmail}`}>
                            <small>Email</small><b>{BRAND.supportEmail}</b><span>{BRAND.company} · {BRAND.location}</span>
                        </a>
                    </div>
                </div>
            </section>

            <section className="ka-container">
                <div className="ka-cta">
                    <div>
                        <h2>Run your agri shop on software made for it.</h2>
                        <p>{starter ? `Plans start at ${formatINR(starter.monthlyPrice)} a month. ` : ''}Set up in minutes, bill the same day.</p>
                    </div>
                    <div className="ka-cta-actions">
                        <a href="/#pricing" className="ka-btn ka-btn-gold">See plans &amp; buy <ArrowRight size={18} /></a>
                    </div>
                </div>
            </section>
        </KaPage>
    );
}
