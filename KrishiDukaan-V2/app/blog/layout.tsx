import type { Metadata } from 'next';
import { SiteHeader, SiteFooter } from '../../components/shared/site-chrome';

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://krishidukan.com';

export const metadata: Metadata = {
  title: 'Blog — KrishiDukan | Agricultural Insights & Farming Tips',
  description: 'Expert advice, crop guides, and agri-retail news from the KrishiDukan team. Helping Indian farmers make better decisions.',
  // Self-referencing canonical for the index. Only /blog inherits this —
  // app/blog/[slug]/page.tsx sets its own canonical in generateMetadata, and a
  // page's own metadata wins over the layout's, so posts are unaffected.
  alternates: { canonical: `${SITE_URL}/blog` },
  openGraph: {
    siteName: 'KrishiDukan',
    type: 'website',
    url: `${SITE_URL}/blog`,
    title: 'Blog — KrishiDukan | Agricultural Insights & Farming Tips',
    description: 'Expert advice, crop guides, and agri-retail news from the KrishiDukan team.',
    images: ['/images/og-default.png'],
  },
};

// Site chrome — see app/products/layout.tsx for the rationale.
export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      {children}
      <SiteFooter />
    </>
  );
}
