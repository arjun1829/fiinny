import { Link } from 'react-router-dom';
import KaPage, { KaDoc } from '../components/landing/ka/KaPage';
import { BRAND } from '../utils/brand';

export default function TermsPage() {

    return (
        <KaPage>
            <KaDoc
                title="Terms of Service"
                updated="6 November 2026"
                intro={<>These terms are an agreement between you and <strong>{BRAND.company}</strong> (“we”, “us”) for the use of {BRAND.name} at {BRAND.domain} and its apps (the “Service”). By creating an account or paying for a plan you accept them.</>}
            >
                <h2>1. The Service</h2>
                <p>{BRAND.name} is business software for agri-input retailers: billing and POS, GST invoices, digital khata, inventory, purchases, staff access and reports. Features available to you depend on the plan you buy, as described on the <a href="/#pricing">pricing section</a> at the time of purchase.</p>

                <h2>2. Your account</h2>
                <ul>
                    <li>You sign in with a verified mobile number, email or Google account. Keep your login to yourself; you are responsible for activity under it and under the staff logins you create.</li>
                    <li>The business details you enter (name, GSTIN, licence numbers, address) must be true. They are printed on your invoices.</li>
                    <li>You must be at least 18 and authorised to act for the business.</li>
                </ul>

                <h2>3. Plans and payment</h2>
                <ul>
                    <li>Plans are prepaid for a fixed period (1 month or 1 year) and are charged in Indian Rupees through Razorpay.</li>
                    <li>Your plan starts when payment is confirmed and ends at the end of the paid period. Plans do <strong>not</strong> renew automatically; to continue, you pay for a new period.</li>
                    <li>If a plan ends, access to the ERP screens is paused until you renew. Your data is kept (see section 6).</li>
                    <li>We may change prices for future periods. A price change never affects a period you have already paid for.</li>
                    <li>Refunds are covered by our <Link to="/refund-policy">Refund &amp; Cancellation Policy</Link>.</li>
                </ul>

                <h2>4. Your responsibilities</h2>
                <ul>
                    <li>You remain responsible for your tax filings, invoices and compliance with laws that apply to your trade, including the Insecticides Act, the Fertilizer (Control) Order and the Seeds Act. The Service helps you keep records; it is not tax, legal or agronomic advice.</li>
                    <li>Check invoices and reports before filing or sharing them. Tax rates and HSN codes are set by you on your products.</li>
                    <li>Do not use the Service for anything unlawful, to send spam, or to try to access another business’s data.</li>
                </ul>

                <h2>5. Your data</h2>
                <p>Data you enter belongs to you. We process it only to provide the Service, as described in our <Link to="/privacy">Privacy Policy</Link>. Each business’s data is kept separate and is visible only to the people that business gives access to.</p>

                <h2>6. Ending your account</h2>
                <p>You can stop using the Service at any time. If you want your account and data deleted, email {BRAND.supportEmail}. We may suspend accounts that break these terms or that are used fraudulently; where we can, we will tell you first. After a plan ends we keep your data for at least 90 days so you can renew or export it.</p>

                <h2>7. Availability and liability</h2>
                <p>We work to keep the Service running and your data safe, but we cannot promise it will never be interrupted. To the extent the law allows, our total liability for any claim is limited to the amount you paid us for the Service in the 12 months before the claim, and we are not liable for indirect losses such as lost profit.</p>

                <h2>8. Changes</h2>
                <p>We may update these terms. If a change is significant we will tell you on the site or by SMS/WhatsApp before it applies. Continuing to use the Service after that means you accept the new terms.</p>

                <h2>9. Law and disputes</h2>
                <p>These terms are governed by the laws of India. Courts in Maharashtra have jurisdiction. Please contact us first; most problems are solved with a phone call.</p>

                <h2>10. Contact</h2>
                <p>{BRAND.company}, {BRAND.location}. Phone / WhatsApp {BRAND.supportPhone}. Email {BRAND.supportEmail}.</p>
            </KaDoc>
        </KaPage>
    );
}
