import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import LegacyHead from "../../(home)/_shared/LegacyHead";
import { isLandingLang, landingDir } from "../../(home)/_shared/landingCopy";
import { LangProvider } from "@/lib/i18n/client";

// Persian and Arabic landing pages (/fa, /ar). They need their own root layout so <html> carries
// the right lang and dir="rtl"; English stays at "/" in the (home) layout.
export const dynamicParams = false;
export const generateStaticParams = () => [{ lang: "fa" }, { lang: "ar" }];

export const metadata: Metadata = {
  metadataBase: new URL("https://solarzed.com"),
  robots: { index: true, follow: true },
  icons: {
    icon: "/assets/solarzed-original.png",
    shortcut: "/assets/solarzed-original.png",
    apple: "/assets/solarzed-original.png",
  },
};

export const viewport: Viewport = { themeColor: "#102a43" };

export default async function LandingLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLandingLang(lang) || lang === "en") notFound();
  return (
    <html data-scroll-behavior="smooth" lang={lang} dir={landingDir(lang)}>
      <LegacyHead />
      <body><LangProvider lang={lang}>{children}</LangProvider></body>
    </html>
  );
}
