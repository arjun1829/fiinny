import {
    ArrowRight, BookOpenCheck, Boxes, Building2, CheckCircle2, ClipboardList, FileSpreadsheet,
    FileText, IndianRupee, MessageCircle, Printer, ReceiptText, ShieldCheck, Smartphone, Store,
    Users, Warehouse,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import KaNav from '../components/landing/ka/KaNav';
import KaFooter from '../components/landing/ka/KaFooter';
import KaPricing from '../components/landing/ka/KaPricing';
import { usePricingPlans } from '../hooks/usePricingPlans';
import { usePageJsonLd } from '../hooks/useSeo';
import { BRAND, whatsappLink } from '../utils/brand';
import { formatINR } from '../utils/pendingPlan';
import '../styles/ka-marketing.css';

const FAQS: { q: string; a: string }[] = [
    {
        q: 'Is there a free plan or free trial?',
        a: `No. ${BRAND.name} is a paid product, starting at the Starter plan. If you want to see it before you buy, message us on WhatsApp and we will show you a live demo on your phone.`,
    },
    {
        q: 'What happens after I pay?',
        a: 'Your account opens immediately. You can add your products and opening stock, then print your first bill the same day. Your business details from sign-up already appear on your invoices.',
    },
    {
        q: 'Does it make GST-compliant invoices?',
        a: 'Yes. B2B and POS bills carry HSN codes, your GSTIN and the CGST/SGST or IGST split. GST reports summarise your sales for GSTR-1 and GSTR-3B, and you can export bills as PDFs for your CA.',
    },
    {
        q: 'Can I give farmers and retailers credit (udhaar)?',
        a: 'Yes. The digital khata keeps every customer’s balance, payments and bills in one ledger. Send a payment reminder on WhatsApp in one tap.',
    },
    {
        q: 'Do I need a computer?',
        a: 'No. It runs in the browser on any Android phone, tablet or laptop. You need an internet connection; it works fine on a normal mobile connection.',
    },
    {
        q: 'Can my staff use it?',
        a: 'Yes. Add staff logins with their own roles, so a counter person can bill without seeing your purchase prices or reports. The number of users depends on your plan.',
    },
    {
        q: 'Is my business data safe?',
        a: 'Each business’s data is kept separate and is only visible to the people you add. We never sell or share your data. Payments are handled by Razorpay; card and bank details never reach our servers.',
    },
    {
        q: 'Can I get a refund?',
        a: 'Plans are prepaid for a fixed period. If you were charged twice or charged without your account being activated, we refund it in full. See the refund & cancellation policy for the details.',
    },
];

export default function LandingPage() {
    // FAQ rich result for the homepage only (the same answers shown on the page).
    usePageJsonLd('/', [{
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: FAQS.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    }]);
    const { plans } = usePricingPlans();
    const starter = plans.find(p => p.id === 'starter');
    const yearlyPerMonth = starter ? Math.round(starter.yearlyPrice / 12) : 833;

    return (
        <div className="ka">
            <KaNav />
            <main>
                {/* ── Hero ───────────────────────────────────────────────── */}
                <section className="ka-hero">
                    <div className="ka-container ka-hero-grid">
                        <div>
                            <span className="ka-pill"><Store size={15} /> Only for agri-input retailers</span>
                            <h1>Billing &amp; stock software for your <span className="ka-underline">agri shop</span>.</h1>
                            <p className="ka-lead">
                                GST bills in seconds, udhaar for every farmer, batch and expiry-wise stock, and reports your CA can use.
                                ERP, billing and POS made only for seed, fertilizer and pesticide shops.
                            </p>
                            <div className="ka-price-row">
                                <div className="ka-price-chip">
                                    <small>Starter plan</small>
                                    <b>{formatINR(starter?.monthlyPrice ?? 999)}<em> /month</em></b>
                                </div>
                                <div className="ka-price-chip dark">
                                    <small>On the yearly plan</small>
                                    <b>{formatINR(yearlyPerMonth)}<em> /month</em></b>
                                </div>
                            </div>
                            <div className="ka-hero-ctas">
                                <a href="#pricing" className="ka-btn ka-btn-primary">Buy now <ArrowRight size={18} /></a>
                                <a href={whatsappLink('Hi, I want a demo of KaranArjun ERP for my business.')} target="_blank" rel="noopener noreferrer" className="ka-btn ka-btn-ghost">
                                    <MessageCircle size={18} /> Get a demo on WhatsApp
                                </a>
                            </div>
                            <p className="ka-hero-note">
                                No setup fee · Pay by UPI, card or net banking · <a href="#how">How buying works</a>
                            </p>
                        </div>
                        <div className="ka-hero-visual">
                            <div className="ka-hero-photo">
                                <img src="/images/home/agri-shopkeeper.webp" alt="Agri-input shop owner at his counter" width={509} height={555} />
                            </div>
                            <div className="ka-float f2">
                                <div className="ka-float-icon"><Printer size={20} /></div>
                                <div><b>Bill #1042 · {formatINR(12585)}</b><span>GST invoice printed</span></div>
                            </div>
                            <div className="ka-float f1">
                                <div className="ka-float-icon"><BookOpenCheck size={20} /></div>
                                <div><b>Udhaar collected</b><span>₹8,400 from 3 farmers today</span></div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── Strip ──────────────────────────────────────────────── */}
                <div className="ka-strip">
                    <div className="ka-container ka-strip-inner">
                        <div className="ka-strip-item"><ReceiptText size={26} /><div><b>GST invoices</b><span>HSN, CGST/SGST, IGST</span></div></div>
                        <div className="ka-strip-item"><BookOpenCheck size={26} /><div><b>Digital khata</b><span>Udhaar with reminders</span></div></div>
                        <div className="ka-strip-item"><Boxes size={26} /><div><b>Batch &amp; expiry</b><span>Across every godown</span></div></div>
                        <div className="ka-strip-item"><Smartphone size={26} /><div><b>Phone or laptop</b><span>No software to install</span></div></div>
                    </div>
                </div>

                {/* ── Who it's for ───────────────────────────────────────── */}
                <section className="ka-section">
                    <div className="ka-container">
                        <div className="ka-section-head">
                            <span className="ka-eyebrow">Who it is for</span>
                            <h2 className="ka-h2">Made for the krishi seva kendra counter. Nothing else.</h2>
                            <p className="ka-lead">We do not build software for every kind of shop. Only agri-input retailers, so every screen speaks your trade: pack sizes, batches, licences, seasons and farmer udhaar.</p>
                        </div>
                        <div className="ka-who">
                            <div className="ka-who-card">
                                <Store size={30} color="var(--ka-forest)" />
                                <h3>One shop counter</h3>
                                <p>A krishi seva kendra billing farmers every day, run by the owner and a helper.</p>
                                <ul className="ka-ticks">
                                    <li><CheckCircle2 size={18} /> Fast counter billing and thermal printing</li>
                                    <li><CheckCircle2 size={18} /> Udhaar for every farmer, season after season</li>
                                    <li><CheckCircle2 size={18} /> Low-stock and expiry alerts</li>
                                </ul>
                                <span className="ka-who-plan">Best fit: Starter</span>
                            </div>
                            <div className="ka-who-card hl">
                                <Warehouse size={30} color="#e6a817" />
                                <h3>Shop with a godown</h3>
                                <p>A busy counter, a godown behind it, staff, and bulk buyers who take credit.</p>
                                <ul className="ka-ticks">
                                    <li><CheckCircle2 size={18} /> Shop and godown stock kept separately</li>
                                    <li><CheckCircle2 size={18} /> B2B invoices for bulk buyers and FPOs</li>
                                    <li><CheckCircle2 size={18} /> Staff logins that cannot see your margins</li>
                                </ul>
                                <span className="ka-who-plan">Best fit: Growth</span>
                            </div>
                            <div className="ka-who-card">
                                <Building2 size={30} color="var(--ka-forest)" />
                                <h3>Several shops</h3>
                                <p>A family business with branches in more than one village or taluka.</p>
                                <ul className="ka-ticks">
                                    <li><CheckCircle2 size={18} /> Every branch on one login</li>
                                    <li><CheckCircle2 size={18} /> Stock transfers between shops and godowns</li>
                                    <li><CheckCircle2 size={18} /> Unlimited staff with roles</li>
                                </ul>
                                <span className="ka-who-plan">Best fit: Pro</span>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── Feature rows ───────────────────────────────────────── */}
                <section className="ka-section" id="features" style={{ paddingTop: 24 }}>
                    <div className="ka-container">
                        <div className="ka-split">
                            <div className="ka-split-copy">
                                <span className="ka-eyebrow">Billing</span>
                                <h3>A GST bill in the time it takes to say the product name.</h3>
                                <p className="ka-lead">Search a product, set the quantity, print. Taxes, HSN codes and totals are worked out for you, on POS bills for farmers and B2B invoices for shops.</p>
                                <ul className="ka-ticks">
                                    <li><CheckCircle2 size={18} /> Your shop name, GSTIN and licence numbers on every bill</li>
                                    <li><CheckCircle2 size={18} /> Thermal and A4 printing, or share the bill on WhatsApp</li>
                                    <li><CheckCircle2 size={18} /> UPI QR code on the bill for quick payment</li>
                                </ul>
                            </div>
                            <div className="ka-split-media">
                                <div className="ka-mock-bg">
                                    <div className="ka-mock" aria-label="Example GST invoice">
                                        <div className="ka-mock-head">
                                            <div><b>Patil Krishi Seva Kendra</b><small>GSTIN 27ABCDE1234F1Z5 · Baramati</small></div>
                                            <span className="ka-tag">Tax invoice #1042</span>
                                        </div>
                                        <table className="ka-mock-table">
                                            <thead><tr><th>Item</th><th>Qty</th><th>Amount</th></tr></thead>
                                            <tbody>
                                                <tr><td>DAP 50 kg<small>HSN 3105 · GST 5%</small></td><td>4</td><td>₹5,400.00</td></tr>
                                                <tr><td>Coragen 150 ml<small>HSN 3808 · GST 18%</small></td><td>2</td><td>₹3,360.00</td></tr>
                                                <tr><td>Soybean seed 30 kg<small>HSN 1201 · Nil rated</small></td><td>1</td><td>₹2,950.00</td></tr>
                                            </tbody>
                                        </table>
                                        <div className="ka-mock-row" style={{ borderTop: 'none' }}><div><span>CGST + SGST</span></div><b>₹874.80</b></div>
                                        <div className="ka-mock-total"><span>Total</span><b>₹12,584.80</b></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="ka-split reverse">
                            <div className="ka-split-copy">
                                <span className="ka-eyebrow">Digital khata</span>
                                <h3>Know exactly who owes you, and since when.</h3>
                                <p className="ka-lead">Every credit sale goes into the customer’s khata automatically. See the season’s outstanding at a glance and remind people without awkward phone calls.</p>
                                <ul className="ka-ticks">
                                    <li><CheckCircle2 size={18} /> Running balance for every farmer and retailer</li>
                                    <li><CheckCircle2 size={18} /> Part payments, cash or UPI, recorded against bills</li>
                                    <li><CheckCircle2 size={18} /> One-tap WhatsApp payment reminders</li>
                                </ul>
                            </div>
                            <div className="ka-split-media">
                                <div className="ka-mock-bg">
                                    <div className="ka-mock" aria-label="Example khata">
                                        <div className="ka-mock-head">
                                            <div><b>Udhaar · Rabi 2026</b><small>42 customers with a balance</small></div>
                                            <span className="ka-tag gold">₹3,86,200 due</span>
                                        </div>
                                        <div className="ka-mock-row"><div>Suresh Jadhav<span>Shirsufal · last paid 12 Oct</span></div><b>₹18,450</b></div>
                                        <div className="ka-mock-row"><div>Anil Kale<span>Katewadi · 46 days</span></div><span className="ka-tag red">₹9,800</span></div>
                                        <div className="ka-mock-row"><div>Om Sai Agro (retailer)<span>Indapur · 3 open bills</span></div><b>₹62,300</b></div>
                                        <div className="ka-mock-row"><div>Vitthal More<span>Malegaon · paid ₹4,000 today</span></div><span className="ka-tag">₹2,150</span></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="ka-split">
                            <div className="ka-split-copy">
                                <span className="ka-eyebrow">Stock</span>
                                <h3>Stop losing money to expired stock.</h3>
                                <p className="ka-lead">Track every batch with its expiry date across all your godowns. Sell the oldest batch first and see what needs to move before it is too late.</p>
                                <ul className="ka-ticks">
                                    <li><CheckCircle2 size={18} /> Batch, expiry and godown on every product</li>
                                    <li><CheckCircle2 size={18} /> Purchase bills update stock and supplier ledger together</li>
                                    <li><CheckCircle2 size={18} /> Barcode labels for faster billing</li>
                                </ul>
                            </div>
                            <div className="ka-split-media">
                                <div className="ka-mock-bg">
                                    <div className="ka-mock" aria-label="Example stock list">
                                        <div className="ka-mock-head">
                                            <div><b>Batches expiring soon</b><small>Main godown + Shop counter</small></div>
                                            <span className="ka-tag red">5 batches</span>
                                        </div>
                                        <div className="ka-mock-row"><div>Emamectin 5% SG 100 g<span>Batch EM2407 · 64 pcs</span></div><span className="ka-tag red">Expires in 18 days</span></div>
                                        <div className="ka-mock-row"><div>Humic acid 1 L<span>Batch HA0912 · 30 pcs</span></div><span className="ka-tag gold">2 months</span></div>
                                        <div className="ka-mock-row"><div>Onion seed 500 g<span>Batch ON2611 · 12 pkts</span></div><span className="ka-tag gold">3 months</span></div>
                                        <div className="ka-mock-row"><div>Urea 45 kg<span>Godown 2 · 140 bags</span></div><span className="ka-tag">In stock</span></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="ka-split reverse">
                            <div className="ka-split-copy">
                                <span className="ka-eyebrow">Accounts</span>
                                <h3>From the counter to your CA, without retyping.</h3>
                                <p className="ka-lead">Sales, purchases, expenses and GST all come from the same bills, so month-end is a download, not a weekend.</p>
                                <ul className="ka-ticks">
                                    <li><CheckCircle2 size={18} /> GSTR-1 and GSTR-3B summaries</li>
                                    <li><CheckCircle2 size={18} /> Profit &amp; loss, sales and stock reports</li>
                                    <li><CheckCircle2 size={18} /> Export all sales and purchase bills as PDFs for your CA</li>
                                </ul>
                            </div>
                            <div className="ka-split-media">
                                <div className="ka-photo-card">
                                    <img src="/premium-hero.png" alt="Billing and GST summary on a tablet at a shop counter" loading="lazy" width={1024} height={1024} />
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── Everything included ────────────────────────────────── */}
                <section className="ka-section" style={{ background: 'var(--ka-surface)' }}>
                    <div className="ka-container">
                        <div className="ka-section-head">
                            <span className="ka-eyebrow">Everything in one place</span>
                            <h2 className="ka-h2">No more registers, Excel sheets and three apps.</h2>
                        </div>
                        <div className="ka-grid-3">
                            {[
                                { icon: ReceiptText, t: 'POS billing', d: 'Quick counter bills for farmers with thermal or A4 printing.' },
                                { icon: FileText, t: 'B2B GST invoices', d: 'Invoices for bulk buyers and FPOs with HSN, GSTIN and tax split.' },
                                { icon: BookOpenCheck, t: 'Digital khata', d: 'Customer and supplier balances, payments and reminders.' },
                                { icon: Warehouse, t: 'Stock & godowns', d: 'Batches, expiry, transfers and low-stock alerts.' },
                                { icon: ClipboardList, t: 'Orders & quotations', d: 'Quotation to order, delivery challan and invoice for bulk buyers.' },
                                { icon: IndianRupee, t: 'Purchase & suppliers', d: 'Purchase bills, supplier ledger and payments made.' },
                                { icon: FileSpreadsheet, t: 'GST & reports', d: 'GSTR summaries, P&L, sales, stock and expense reports.' },
                                { icon: Users, t: 'Staff & roles', d: 'Separate logins for counter, sales and accounts staff.' },
                                { icon: ShieldCheck, t: 'Your data, private', d: 'Each business is kept separate. Only your team sees it.' },
                            ].map(m => (
                                <div className="ka-tile" key={m.t}>
                                    <div className="ka-tile-icon"><m.icon size={22} /></div>
                                    <h4>{m.t}</h4>
                                    <p>{m.d}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── How buying works ───────────────────────────────────── */}
                <section className="ka-section" id="how">
                    <div className="ka-container">
                        <div className="ka-section-head">
                            <span className="ka-eyebrow">How it works</span>
                            <h2 className="ka-h2">Billing in 4 easy steps.</h2>
                            <p className="ka-lead">Everything happens online, in about five minutes.</p>
                        </div>
                        <div className="ka-steps">
                            {[
                                { t: 'Choose your plan', d: 'Starter, Growth or Pro, monthly or yearly. Pick below.' },
                                { t: 'Verify your mobile', d: 'Enter your number and the OTP we send. That is your login.' },
                                { t: 'Add business details', d: 'Shop name, city and GSTIN. These print on your bills.' },
                                { t: 'Pay & start billing', d: 'Pay securely with Razorpay. Your account opens instantly.' },
                            ].map((s, i) => (
                                <div className="ka-step" key={s.t}>
                                    <div className="ka-step-num">{i + 1}</div>
                                    <h4>{s.t}</h4>
                                    <p>{s.d}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <KaPricing />

                {/* ── Guides (internal links to the search-landing pages) ── */}
                <section className="ka-section-tight" id="guides">
                    <div className="ka-container">
                        <div className="ka-section-head" style={{ marginBottom: 28 }}>
                            <span className="ka-eyebrow">Guides for agri-input shops</span>
                            <h2 className="ka-h2">Made for your kind of shop.</h2>
                        </div>
                        <div className="ka-grid-3">
                            {[
                                { to: '/fertilizer-shop-billing-software', t: 'Fertilizer shop software', d: 'Bag-wise stock, 5% GST bills and your daily stock board.' },
                                { to: '/pesticide-shop-billing-software', t: 'Pesticide shop software', d: 'Batch and expiry on every pack, licence on every bill.' },
                                { to: '/seed-shop-billing-software', t: 'Seed shop software', d: 'Lot-wise stock, nil-GST seed bills and season credit.' },
                                { to: '/guides/gst-rates-fertilizer-pesticide-seeds', t: 'GST rates guide', d: 'Fertilizer, pesticide and seed GST with HSN codes.' },
                                { to: '/agri-shop-software-vs-general-billing-apps', t: 'Agri software or a general app?', d: 'A simple guide to choosing the right billing software.' },
                                { to: '/mr/krishi-seva-kendra-billing-software', t: 'मराठीत वाचा', d: 'कृषी सेवा केंद्रासाठी बिलिंग सॉफ्टवेअर.' },
                            ].map(g => (
                                <Link key={g.to} to={g.to} className="ka-contact-card">
                                    <b>{g.t}</b>
                                    <span>{g.d}</span>
                                </Link>
                            ))}
                        </div>
                        <p style={{ textAlign: 'center', marginTop: 20 }}><Link to="/resources" className="ka-linkbtn">See all guides</Link></p>
                    </div>
                </section>

                {/* ── FAQ ────────────────────────────────────────────────── */}
                <section className="ka-section" id="faq">
                    <div className="ka-container ka-narrow">
                        <div className="ka-section-head">
                            <span className="ka-eyebrow">Questions</span>
                            <h2 className="ka-h2">What shop owners ask us first.</h2>
                        </div>
                        <div className="ka-faq">
                            {FAQS.map((f, i) => (
                                <details key={f.q} open={i === 0}>
                                    <summary>{f.q}</summary>
                                    <p>{f.a}</p>
                                </details>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── Final CTA ──────────────────────────────────────────── */}
                <section className="ka-container">
                    <div className="ka-cta">
                        <div>
                            <h2>Start billing properly this season.</h2>
                            <p>{BRAND.initiative}: ERP, billing and POS made only for agri-input retailers. Pick a plan, verify your mobile and your shop is ready in minutes.</p>
                        </div>
                        <div className="ka-cta-actions">
                            <a href="#pricing" className="ka-btn ka-btn-gold">See plans &amp; buy <ArrowRight size={18} /></a>
                            <a href={whatsappLink()} target="_blank" rel="noopener noreferrer" className="ka-btn ka-btn-ghost"><MessageCircle size={18} /> WhatsApp {BRAND.supportPhone}</a>
                        </div>
                    </div>
                </section>
            </main>
            <KaFooter />
        </div>
    );
}
