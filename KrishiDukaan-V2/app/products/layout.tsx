import { SiteHeader, SiteFooter } from "../../components/shared/site-chrome";

/**
 * Site chrome for /products/*.
 *
 * Product pages carried no navigation at all: the Navbar and Footer are
 * imported only by app/page.tsx (the client-rendered SPA), so a crawler
 * reaching a product page found no links out of it and no links in — these
 * URLs were discoverable only through sitemap.xml. Search Console's
 * "Discovered – currently not indexed" list, where the sampled URLs show
 * "Last crawled: N/A", is that situation reported back.
 *
 * A layout is additive: the page components below are untouched, and their
 * generateMetadata / revalidate / notFound behaviour is unaffected.
 */
export default function ProductsLayout({
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
