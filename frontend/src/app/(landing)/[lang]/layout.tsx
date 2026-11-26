import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import LegacyHead from "../../(home)/_shared/LegacyHead";
import { isLandingLang, landingDir } from "../../(home)/_shared/landingCopy";

// Persian and Arabic landing pages (/fa, /ar). They need their own root layout so <html> carries
// the right lang and dir="rtl"; English stays at "/" in the (home) layout.
export const dynamicParams = false;
export const generateStaticParams = () => [{ lang: "fa" }, { lang: "ar" }];

export const metadata: Metadata = {
  metadataBase: new URL("https://solarzed.com"),
  robots: { index: true, follow: true },
  icons: {
    icon: "/assets/solarzed-logo.svg",
    shortcut: "/assets/solarzed-logo.svg",
    apple: "/assets/solarzed-logo.svg",
  },
};

export const viewport: Viewport = { themeColor: "#102a43" };

export default async function LandingLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLandingLang(lang) || lang === "en") notFound();
  return (
    <html lang={lang} dir={landingDir(lang)}>
      <LegacyHead rtl />
      <body>{children}</body>
    </html>
  );
}
