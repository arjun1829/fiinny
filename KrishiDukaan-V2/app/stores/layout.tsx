import { SiteHeader, SiteFooter } from "../../components/shared/site-chrome";

/**
 * Site chrome for /stores/*. See app/products/layout.tsx for the rationale.
 *
 * This is the largest section in the sitemap (state, city and store pages), and
 * the one whose URLs dominate the "Discovered – currently not indexed" sample,
 * so giving these pages real inbound and outbound links matters most here.
 */
export default function StoresLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      {children}
      <SiteFooter />
    </>
  );
}
