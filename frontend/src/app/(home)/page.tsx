import type { Metadata } from "next";
import HomeContent from "./_shared/HomeContent";
import { LANDING } from "./_shared/landingCopy";

const { title, description } = LANDING.en.meta;

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: "https://solarzed.com",
    languages: { en: "https://solarzed.com", fa: "https://solarzed.com/fa", ar: "https://solarzed.com/ar", "x-default": "https://solarzed.com" },
  },
  openGraph: {
    url: "https://solarzed.com",
    title,
    description: "Premium automotive window film and PPF. Digital warranty certificates, traceable serials and 5-window installation maps.",
  },
};

export default function HomePage() {
  return <HomeContent lang="en" />;
}
