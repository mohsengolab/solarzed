import SiteHeader, { SiteFooter } from "../_shared/SiteHeader";
import HomeMotion from "../HomeMotion";

// Header and footer live here so each product page's first element is its content;
// Next.js then scrolls a newly opened series page to the top.
export default function ProductsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      {children}
      <SiteFooter />
      <HomeMotion />
    </>
  );
}
