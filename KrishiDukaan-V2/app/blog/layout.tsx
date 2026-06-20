import type { Metadata } from 'next';

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://krishidukan.com';

export const metadata: Metadata = {
  // Absolute opts out of the root "%s | KrishiDukan" template so the brand
  // suffix isn't doubled. The /blog/[slug] route sets its own absolute title.
  title: { absolute: 'Blog — KrishiDukaan | Agricultural Insights & Farming Tips' },
  description: 'Expert advice, crop guides, and agri-retail news from the KrishiDukaan team. Helping Indian farmers make better decisions.',
  // Canonical for the listing page. The /blog/[slug] route overrides this with
  // its own per-post canonical in generateMetadata.
  alternates: { canonical: '/blog' },
  openGraph: {
    siteName: 'KrishiDukaan',
    type: 'website',
    url: `${SITE_URL}/blog`,
    title: 'Blog — KrishiDukaan | Agricultural Insights & Farming Tips',
    description: 'Expert advice, crop guides, and agri-retail news from the KrishiDukaan team.',
    images: ['/images/og-default.png'],
  },
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
