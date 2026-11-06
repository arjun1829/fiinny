import { SiteHeader, SiteFooter } from "../../components/shared/site-chrome";

/** Site chrome for a retailer's brand page (/shop/{phone}); see app/brand/layout.tsx. */
export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      {children}
      <SiteFooter />
    </>
  );
}
