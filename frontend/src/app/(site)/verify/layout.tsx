import type { Metadata } from "next";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
  title: t("Product Authenticity Check"),
  description: t("Check that your Solarzed window film or paint protection film is genuine by the ROLL NO on the carton."),
  keywords: ["Solarzed authenticity", "genuine window film", "ROLL NO check", "PPF authenticity"],
  alternates: { canonical: "https://solarzed.com/verify" },
  openGraph: {
    url: "https://solarzed.com/verify",
    title: t("Product Authenticity Check"),
    description: t("Check that your Solarzed window film or paint protection film is genuine by the ROLL NO on the carton."),
  },
};
}

export default function VerifyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
