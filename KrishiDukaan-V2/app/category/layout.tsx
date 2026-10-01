import { SiteHeader, SiteFooter } from "../../components/shared/site-chrome";

/**
 * Site chrome for /category/*. See app/products/layout.tsx for the rationale.
 *
 * The footer's category list makes every sibling category reachable from every
 * category page, and the header links out to the other public sections.
 */
export default function CategoryLayout({
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
