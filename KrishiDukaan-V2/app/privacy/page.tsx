import { 
  ShieldCheck, 
  Lock, 
  User, 
  MapPin, 
  CreditCard, 
  Trash2, 
  Mail, 
  Share2, 
  Activity, 
  Clock 
} from 'lucide-react';
import React from 'react';

export const metadata = {
  title: 'Privacy Policy – KrishiDukan',
  description: 'Privacy Policy and data practices for KrishiDukan mobile app and website.',
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        
        {/* Header Section */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center justify-center p-3 bg-green-100 rounded-full mb-4">
            <ShieldCheck className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 tracking-tight mb-4">
            Privacy Policy
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            KrishiDukan ("we", "our", or "us") is an agri-commerce platform operated by Karanarjun Technologies. We are committed to protecting your privacy and ensuring your data is secure.
          </p>
          <div className="mt-6 inline-flex items-center space-x-2 text-sm text-gray-500 bg-white px-4 py-2 rounded-full shadow-sm border border-gray-100">
            <Clock className="w-4 h-4" />
            <span>Last updated: <strong className="text-gray-700">17 May 2026</strong></span>
          </div>
        </div>

        {/* Content Sections */}
        <div className="space-y-8">
          
          <Section 
            icon={<User className="w-6 h-6 text-blue-500" />}
            title="1. Information We Collect"
            bgColor="bg-blue-50"
          >
            <div className="space-y-4 text-gray-600 leading-relaxed">
              <div className="flex items-start">
                <div className="flex-shrink-0 mt-1">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                </div>
                <div className="ml-3">
                  <strong className="text-gray-900 block">Phone Number & Account Data</strong>
                  We collect your mobile phone number to create and authenticate your account via one-time password (OTP). We may also collect your name and business details if you are a retailer or manufacturer.
                </div>
              </div>
              <div className="flex items-start">
                <div className="flex-shrink-0 mt-1">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                </div>
                <div className="ml-3">
                  <strong className="text-gray-900 block">Location Data</strong>
                  With your permission, we access your approximate or precise location to show nearby agri-input stores and products. Location access is optional and can be denied without losing core browsing features.
                </div>
              </div>
              <div className="flex items-start">
                <div className="flex-shrink-0 mt-1">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                </div>
                <div className="ml-3">
                  <strong className="text-gray-900 block">Usage Data</strong>
                  We collect anonymised information about how you interact with the app (screens visited, searches, errors) to improve the Service and provide a better user experience.
                </div>
              </div>
            </div>
          </Section>

          <Section 
            icon={<Activity className="w-6 h-6 text-green-500" />}
            title="2. How We Use Your Information"
            bgColor="bg-green-50"
          >
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-4 text-gray-600">
              <ListItem>To create, manage, and authenticate your account securely.</ListItem>
              <ListItem>To display nearby stores and product availability relevant to your area.</ListItem>
              <ListItem>To process orders and payments smoothly.</ListItem>
              <ListItem>To send transactional notifications (e.g., order status, OTPs).</ListItem>
              <ListItem>To provide customer support and respond to your inquiries.</ListItem>
              <ListItem>To improve app performance, troubleshoot bugs, and develop new features.</ListItem>
            </ul>
          </Section>

          <Section 
            icon={<Share2 className="w-6 h-6 text-purple-500" />}
            title="3. Data Sharing & Third Parties"
            bgColor="bg-purple-50"
          >
            <p className="text-gray-600 mb-4">
              We <strong>do not sell</strong> your personal data. We only share information with trusted third-party service providers to operate our platform:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                <strong className="text-gray-900 block mb-1">Google Firebase</strong>
                <span className="text-sm text-gray-500">Used for secure authentication, database hosting, and app analytics.</span>
              </div>
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                <strong className="text-gray-900 block mb-1">Razorpay</strong>
                <span className="text-sm text-gray-500">Secure payment gateway. Razorpay's privacy policy governs payment data.</span>
              </div>
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                <strong className="text-gray-900 block mb-1">Google Maps</strong>
                <span className="text-sm text-gray-500">Used to display store locations and calculate distances. No personal data is shared.</span>
              </div>
            </div>
          </Section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <Section 
              icon={<Trash2 className="w-6 h-6 text-red-500" />}
              title="4. Data Retention & Deletion"
              bgColor="bg-red-50"
            >
              <p className="text-gray-600 leading-relaxed">
                Your account data is retained as long as your account is active. You may request the deletion of your account and associated data at any time through the app settings or by contacting us. We will process your deletion request within 30 days.
              </p>
            </Section>

            <Section 
              icon={<Lock className="w-6 h-6 text-indigo-500" />}
              title="5. Security"
              bgColor="bg-indigo-50"
            >
              <p className="text-gray-600 leading-relaxed">
                All data is transmitted over secure HTTPS connections and stored securely in Google Firebase infrastructure. We follow strict industry-standard practices to protect your personal information against unauthorised access, alteration, or destruction.
              </p>
            </Section>
          </div>

          <Section 
            icon={<User className="w-6 h-6 text-orange-500" />}
            title="6. Children's Privacy"
            bgColor="bg-orange-50"
          >
            <p className="text-gray-600 leading-relaxed">
              The Service is not directed at children under the age of 13. We do not knowingly collect personal information from children. If you are a parent or guardian and believe a child has provided us with personal data, please contact us immediately, and we will delete it promptly.
            </p>
          </Section>

          <Section 
            icon={<ShieldCheck className="w-6 h-6 text-teal-500" />}
            title="7. Your Rights & Policy Changes"
            bgColor="bg-teal-50"
          >
            <div className="space-y-4 text-gray-600 leading-relaxed">
              <p>
                <strong>Your Rights:</strong> You have the right to access, correct, or delete your personal data. To exercise these rights, please contact our support team. We aim to respond to all requests within 30 days.
              </p>
              <p>
                <strong>Changes to Policy:</strong> We may update this Privacy Policy periodically. We will notify you of significant changes by updating the "Last updated" date at the top of this page. Continued use of the Service after changes constitutes your acceptance of the revised policy.
              </p>
            </div>
          </Section>

          <Section 
            icon={<Mail className="w-6 h-6 text-gray-700" />}
            title="8. Contact Us"
            bgColor="bg-gray-100"
          >
            <p className="text-gray-600 mb-4">
              If you have any questions, concerns, or requests regarding this Privacy Policy, please reach out to us:
            </p>
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm inline-block">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Karanarjun Technologies</h3>
              <div className="flex items-center text-gray-600 mb-2">
                <Mail className="w-4 h-4 mr-2" />
                <a href="mailto:support@krishidukan.com" className="text-green-600 hover:text-green-700 font-medium transition-colors">
                  support@krishidukan.com
                </a>
              </div>
              <div className="flex items-center text-gray-600">
                <MapPin className="w-4 h-4 mr-2" />
                <span>KrishiDukan App Support</span>
              </div>
            </div>
          </Section>

        </div>
      </div>
    </main>
  );
}

// Reusable Components
function Section({ 
  title, 
  children, 
  icon,
  bgColor 
}: { 
  title: string; 
  children: React.ReactNode; 
  icon: React.ReactNode;
  bgColor: string;
}) {
  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden transition-shadow hover:shadow-md">
      <div className="p-6 sm:p-8">
        <div className="flex items-center mb-6">
          <div className={`p-3 rounded-xl ${bgColor} mr-4`}>
            {icon}
          </div>
          <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
        </div>
        <div>{children}</div>
      </div>
    </section>
  );
}

function ListItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start">
      <svg className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
      </svg>
      <span>{children}</span>
    </li>
  );
}

