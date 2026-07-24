import type { Metadata } from 'next';
import Script from 'next/script';
import { Fraunces, Outfit } from 'next/font/google';
import { ToastProvider } from '@/components/ui';
import { AuthProvider } from '@/providers/auth-provider';
import { ProfileCompletionGuard } from '@/features/auth/components/ProfileCompletionGuard';
import { Header } from '@/components/layout/Header';
import { TabBar } from '@/components/layout/TabBar';
import { MainContainer } from '@/components/layout/MainContainer';
import './globals.css';

// Self-hosted via next/font — replaces the original SPA's render-blocking
// Google Fonts <link>. Exposed as CSS variables consumed by the Tailwind
// fontFamily.display / fontFamily.sans tokens (tailwind.config.js).
const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['600', '700', '800', '900'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-fraunces',
});

const outfit = Outfit({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-outfit',
});

export const metadata: Metadata = {
  title: 'FlatFind',
  description: 'Find flats and flatmates — verified, spam-free listings across India.',
};

// `modal` is Next.js's parallel-route slot for app/@modal (Phase 10) — the
// intercepting route at app/@modal/(.)listings/[id] renders into this slot
// as a sibling to the page content, which is what lets it appear as an
// overlay on top of whatever page triggered the navigation instead of
// replacing it. A direct visit/refresh of /listings/[id] never populates
// this slot (intercepting routes only intercept in-app navigation), so
// `modal` is null in that case and only the full-page route renders.
export default function RootLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${fraunces.variable} ${outfit.variable}`}>
      <body>
        <ToastProvider>
          <AuthProvider>
            <ProfileCompletionGuard>
              <Header />
              <TabBar />
              <MainContainer>{children}</MainContainer>
              {modal}
            </ProfileCompletionGuard>
          </AuthProvider>
        </ToastProvider>
        {/* Razorpay Checkout — loaded once, app-wide, lazily (not needed until a user opens UpgradeModal). window.Razorpay is declared in useRazorpayCheckout.ts. */}
        <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      </body>
    </html>
  );
}
