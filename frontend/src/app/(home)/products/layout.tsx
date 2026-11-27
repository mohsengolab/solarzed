import SiteHeader, { SiteFooter } from "../_shared/SiteHeader";
import HomeMotion from "../HomeMotion";
import { dirOf } from "@/lib/i18n";
import { LangProvider } from "@/lib/i18n/client";
import { getLang } from "@/lib/i18n/server";

// Header and footer live here so each product page's first element is its content;
// Next.js then scrolls a newly opened series page to the top.
// The root layout also sets the document language and direction from the saved cookie.
export default async function ProductsLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <LangProvider lang={lang}>
      <div lang={lang} dir={dirOf(lang)}>
        <SiteHeader lang={lang} />
        {children}
        <SiteFooter lang={lang} />
        <HomeMotion />
      </div>
    </LangProvider>
  );
}
