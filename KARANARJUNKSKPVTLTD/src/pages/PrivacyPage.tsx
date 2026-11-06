import KaPage, { KaDoc } from '../components/landing/ka/KaPage';
import { BRAND } from '../utils/brand';

export default function PrivacyPage() {

    return (
        <KaPage>
            <KaDoc
                title="Privacy Policy"
                updated="6 November 2026"
                intro={<>This policy explains how <strong>{BRAND.company}</strong> handles personal and business information in {BRAND.name}. In short: we use your data only to run the Service for you, and we never sell it.</>}
            >
                <h2>1. What we collect</h2>
                <ul>
                    <li><strong>Account details:</strong> your name, mobile number, email (if you use email or Google sign-in) and the staff accounts you create.</li>
                    <li><strong>Business details:</strong> shop name, address, GSTIN, licence numbers and settings you enter.</li>
                    <li><strong>Business records:</strong> products, stock, bills, customers and suppliers, khata entries, payments and expenses you record.</li>
                    <li><strong>Payment information:</strong> the plan you bought, amount, date and Razorpay payment reference. Card, UPI and bank details are collected by Razorpay, not by us.</li>
                    <li><strong>Technical data:</strong> device and browser type, and error logs that help us fix problems.</li>
                </ul>

                <h2>2. How we use it</h2>
                <ul>
                    <li>To provide the Service: sign you in, print your bills, calculate stock and balances, and produce your reports.</li>
                    <li>To process plan payments and keep records required by law.</li>
                    <li>To support you when you contact us, and to tell you about your account (for example, that your plan is ending).</li>
                    <li>To keep the Service secure and to fix errors.</li>
                </ul>

                <h2>3. Who can see your data</h2>
                <ul>
                    <li>Your business data is visible only to you and the staff you give access to, according to the roles you set.</li>
                    <li>Our support team can access an account only when needed to help you or to keep the Service secure.</li>
                    <li>We use service providers to run the Service: Google Cloud / Firebase (hosting, sign-in, database, SMS OTP) and Razorpay (payments). They process data only on our instructions.</li>
                    <li>We share data with authorities only when Indian law requires it.</li>
                </ul>
                <p><strong>We do not sell your personal or business data, and we do not use your customers’ details for our own marketing.</strong></p>

                <h2>4. Your customers’ details</h2>
                <p>When you record farmers, retailers or suppliers in {BRAND.name}, you decide what to store and you are responsible for having a reason to keep it. We process those details only on your behalf.</p>

                <h2>5. Storage and security</h2>
                <p>Data is stored on Google Cloud infrastructure and encrypted in transit and at rest. Each business’s data is separated by access rules so one business cannot read another’s.</p>

                <h2>6. How long we keep it</h2>
                <p>We keep your data while your account is active and for at least 90 days after your plan ends, so you can renew or export it. Payment and invoice records may be kept longer where tax law requires.</p>

                <h2>7. Your choices</h2>
                <ul>
                    <li>Correct your details any time in Settings.</li>
                    <li>Ask for a copy of your data, or for your account and data to be deleted, by emailing {BRAND.supportEmail} from your registered email or calling from your registered mobile.</li>
                </ul>

                <h2>8. Cookies</h2>
                <p>The ERP uses only the cookies and browser storage needed to keep you signed in and remember choices such as the plan you picked. Our public web pages may load Google services that measure visits and ads; you can block these in your browser settings without affecting the ERP.</p>

                <h2>9. Contact</h2>
                <p>Questions about privacy: {BRAND.supportEmail} or {BRAND.supportPhone}. {BRAND.company}, {BRAND.location}.</p>
            </KaDoc>
        </KaPage>
    );
}
