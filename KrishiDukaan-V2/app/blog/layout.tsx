import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Blog — KrishiDukan | Agricultural Insights & Farming Tips',
  description: 'Expert advice, crop guides, and agri-retail news from the KrishiDukan team. Helping Indian farmers make better decisions.',
  openGraph: {
    siteName: 'KrishiDukaan',
    type: 'website',
  },
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
