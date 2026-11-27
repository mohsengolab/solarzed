import type { Metadata } from "next";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
  title: t("Warranty Inquiry"),
  description:
    t("Look up your Solarzed window film or paint protection film warranty certificate by warranty number, VIN or mobile number."),
  keywords: ["warranty lookup", "window tint certificate", "PPF warranty check", "Solarzed warranty inquiry"],
  alternates: { canonical: "https://solarzed.com/warranty" },
  openGraph: {
    url: "https://solarzed.com/warranty",
    title: t("Warranty Inquiry"),
    description: t("Look up your Solarzed window film or paint protection film warranty certificate by warranty number, VIN or mobile number."),
  },
};
}

export default function WarrantyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
