import type { Metadata } from "next";
import { notFound } from "next/navigation";
import HomeContent from "../../(home)/_shared/HomeContent";
import { LANDING, isLandingLang } from "../../(home)/_shared/landingCopy";

const LANGUAGES = { en: "https://solarzed.com", fa: "https://solarzed.com/fa", ar: "https://solarzed.com/ar", "x-default": "https://solarzed.com" };

export async function generateMetadata({ params }: PageProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLandingLang(lang)) return {};
  const { title, description, ogLocale } = LANDING[lang].meta;
  const url = `https://solarzed.com/${lang}`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url, languages: LANGUAGES },
    openGraph: {
      type: "website", siteName: "Solarzed", url, title, description, locale: ogLocale,
      images: [{ url: "/assets/car.png", width: 1545, height: 1018, alt: LANDING[lang].hero.carAlt }],
    },
    twitter: { card: "summary_large_image", title, description, images: ["/assets/car.png"] },
  };
}

export default async function LandingPage({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLandingLang(lang) || lang === "en") notFound();
  return <HomeContent lang={lang} />;
}
