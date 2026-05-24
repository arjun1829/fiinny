export const metadata = {
  title: 'Privacy Policy – KrishiDukan',
};

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px', fontFamily: 'sans-serif', color: '#1B1C1B', lineHeight: 1.7 }}>
      <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 4 }}>Privacy Policy</h1>
      <p style={{ color: '#6B7563', marginBottom: 40 }}>Last updated: 17 May 2026</p>

      <p>
        KrishiDukan (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is an agri-commerce platform operated by
        Karanarjun Technologies. This Privacy Policy explains how we collect, use, and protect your
        information when you use our mobile application or website (collectively, the &quot;Service&quot;).
      </p>

      <Section title="1. Information We Collect">
        <b>Phone number.</b> We collect your mobile phone number to create and authenticate your account
        via one-time password (OTP). This is the only personal identifier required to use the Service.
        <br /><br />
        <b>Location.</b> With your permission, we access your approximate location to show nearby
        agri-input stores. Location access is optional and can be denied without losing core features.
        <br /><br />
        <b>Usage data.</b> We collect anonymised information about how you interact with the app
        (screens visited, searches, errors) to improve the Service.
      </Section>

      <Section title="2. How We Use Your Information">
        <ul style={{ paddingLeft: 20 }}>
          <li>To create and manage your account.</li>
          <li>To display nearby stores and product availability relevant to your area.</li>
          <li>To process orders and payments through our payment partner (Razorpay).</li>
          <li>To send transactional notifications (order status, OTP).</li>
          <li>To improve app performance and fix bugs.</li>
        </ul>
      </Section>

      <Section title="3. Data Sharing">
        We do <b>not</b> sell your personal data. We share data only with:
        <ul style={{ paddingLeft: 20 }}>
          <li><b>Firebase (Google):</b> authentication, database, and hosting.</li>
          <li><b>Razorpay:</b> payment processing. Razorpay&apos;s own privacy policy applies to payment data.</li>
          <li><b>Google Maps:</b> to display store locations. No personal data is shared.</li>
        </ul>
      </Section>

      <Section title="4. Data Retention">
        Your account data is retained as long as your account is active. You may request deletion of
        your account and associated data at any time by contacting us at the address below, and we
        will remove it within 30 days.
      </Section>

      <Section title="5. Security">
        All data is transmitted over HTTPS and stored securely in Google Firebase infrastructure.
        We follow industry-standard practices to protect your information against unauthorised access.
      </Section>

      <Section title="6. Children's Privacy">
        The Service is not directed at children under the age of 13. We do not knowingly collect
        personal information from children. If you believe a child has provided us with personal data,
        please contact us and we will delete it promptly.
      </Section>

      <Section title="7. Your Rights">
        You have the right to access, correct, or delete your personal data. To exercise these rights,
        contact us at the email below. We will respond within 30 days.
      </Section>

      <Section title="8. Changes to This Policy">
        We may update this Privacy Policy from time to time. We will notify you of significant changes
        by updating the &quot;Last updated&quot; date at the top. Continued use of the Service after changes
        constitutes acceptance of the revised policy.
      </Section>

      <Section title="9. Contact Us">
        If you have any questions about this Privacy Policy, please contact us at:<br /><br />
        <b>Karanarjun Technologies</b><br />
        Email: <a href="mailto:support@krishidukan.com" style={{ color: '#154212' }}>support@krishidukan.com</a><br />
        App: KrishiDukan
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: '#154212' }}>{title}</h2>
      <div>{children}</div>
    </section>
  );
}
