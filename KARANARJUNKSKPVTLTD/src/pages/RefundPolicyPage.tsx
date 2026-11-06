import KaPage, { KaDoc } from '../components/landing/ka/KaPage';
import { BRAND } from '../utils/brand';

export default function RefundPolicyPage() {

    return (
        <KaPage>
            <KaDoc
                title="Refund & Cancellation Policy"
                updated="6 November 2026"
                intro={<>{BRAND.name} plans are prepaid for a fixed period. This page explains when we refund a payment and how cancellation works.</>}
            >
                <h2>1. Plans are prepaid and do not auto-renew</h2>
                <p>You pay once for 1 month or 1 year. Nothing is charged again unless you choose to buy another period, so there is no subscription to cancel.</p>

                <h2>2. When we refund in full</h2>
                <ul>
                    <li>You were charged more than once for the same plan purchase.</li>
                    <li>Money left your account but your plan was not activated, and we cannot activate it.</li>
                    <li>You were charged an amount different from the price shown at checkout.</li>
                </ul>

                <h2>3. Change of mind</h2>
                <p>If you contact us within <strong>7 days</strong> of your first ever payment and have not yet used the Service for real billing, we will refund that first payment in full. After that, or for renewals, payments for a period that has started are not refundable, and the plan stays active until the end of the period you paid for.</p>

                <h2>4. How to ask for a refund</h2>
                <p>Email {BRAND.supportEmail} or WhatsApp {BRAND.supportPhone} with your registered mobile number and the Razorpay payment ID (shown in the payment confirmation SMS or email). We reply within 2 working days.</p>

                <h2>5. How long it takes</h2>
                <p>Approved refunds go back to the original payment method through Razorpay. Banks usually show the money within <strong>5–7 working days</strong> after we approve it.</p>

                <h2>6. Closing your account</h2>
                <p>You can stop using {BRAND.name} at any time. To have your account and data deleted, email us from your registered email or call from your registered mobile.</p>

                <p style={{ marginTop: 18 }}>{BRAND.company}, {BRAND.location}.</p>
            </KaDoc>
        </KaPage>
    );
}
