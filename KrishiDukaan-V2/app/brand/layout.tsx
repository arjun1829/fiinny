import { SiteHeader, SiteFooter } from "../../components/shared/site-chrome";

/**
 * Site chrome for /brand/*. See app/products/layout.tsx for the rationale.
 *
 * Brand pages had no inbound internal links from anywhere on the site, so this
 * at least gives them outbound ones and puts them in the same link graph as the
 * rest of the public surface.
 */
export default function BrandLayout({
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
