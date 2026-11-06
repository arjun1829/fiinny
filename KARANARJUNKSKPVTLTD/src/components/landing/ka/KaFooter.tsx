import { Link } from 'react-router-dom';
import { BRAND, whatsappLink } from '../../../utils/brand';

export default function KaFooter() {
    return (
        <footer className="ka-footer">
            <div className="ka-container">
                <div className="ka-footer-grid">
                    <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
                        <Link to="/" className="ka-brand">
                            <img src="/logo.png" alt="" width={36} height={36} />
                            <span className="ka-brand-name">KaranArjun <span>ERP</span></span>
                        </Link>
                        <p>{BRAND.tagline}. {BRAND.initiative}.</p>
                    </div>
                    <div>
                        <h5>Product</h5>
                        <a href="/#features">Features</a>
                        <a href="/#pricing">Pricing</a>
                        <a href="/#how">How it works</a>
                        <Link to="/login">Log in</Link>
                    </div>
                    <div>
                        <h5>For your shop</h5>
                        <Link to="/fertilizer-shop-billing-software">Fertilizer shop</Link>
                        <Link to="/pesticide-shop-billing-software">Pesticide shop</Link>
                        <Link to="/seed-shop-billing-software">Seed shop</Link>
                        <Link to="/krishi-seva-kendra-software">Krishi seva kendra</Link>
                        <Link to="/resources">All guides</Link>
                        <Link to="/mr/krishi-seva-kendra-billing-software" hrefLang="mr">मराठी</Link>
                        <Link to="/hi/krishi-seva-kendra-billing-software" hrefLang="hi">हिन्दी</Link>
                    </div>
                    <div>
                        <h5>Company</h5>
                        <Link to="/about">About us</Link>
                        <Link to="/contact">Contact</Link>
                        <Link to="/terms">Terms of Service</Link>
                        <Link to="/privacy">Privacy Policy</Link>
                        <Link to="/refund-policy">Refund &amp; Cancellation</Link>
                    </div>
                    <div>
                        <h5>Talk to us</h5>
                        <a href={`tel:${BRAND.supportPhoneE164}`}>{BRAND.supportPhone}</a>
                        <a href={whatsappLink()} target="_blank" rel="noopener noreferrer">WhatsApp us</a>
                        <a href={`mailto:${BRAND.supportEmail}`}>{BRAND.supportEmail}</a>
                        <p style={{ marginTop: 8 }}>{BRAND.location}</p>
                    </div>
                </div>
                <div className="ka-footer-bottom">
                    <span>© {new Date().getFullYear()} {BRAND.company}. All rights reserved.</span>
                    <span>Payments secured by Razorpay</span>
                </div>
            </div>
        </footer>
    );
}
