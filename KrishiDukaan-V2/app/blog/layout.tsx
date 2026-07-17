import type { Metadata } from 'next';

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://krishidukan.com';

export const metadata: Metadata = {
  title: 'Blog — KrishiDukan | Agricultural Insights & Farming Tips',
  description: 'Expert advice, crop guides, and agri-retail news from the KrishiDukan team. Helping Indian farmers make better decisions.',
  openGraph: {
    siteName: 'KrishiDukan',
    type: 'website',
    url: `${SITE_URL}/blog`,
    title: 'Blog — KrishiDukan | Agricultural Insights & Farming Tips',
    description: 'Expert advice, crop guides, and agri-retail news from the KrishiDukan team.',
    images: ['/images/og-default.png'],
  },
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
