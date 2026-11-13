import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Warranty Inquiry",
  description:
    "Look up your Solarzed window film or paint protection film warranty certificate by warranty number, VIN or mobile number.",
  keywords: ["warranty lookup", "window tint certificate", "PPF warranty check", "Solarzed warranty inquiry"],
  alternates: { canonical: "https://solarzed.com/warranty" },
  openGraph: {
    url: "https://solarzed.com/warranty",
    title: "Solarzed Warranty Inquiry | Check Your Certificate",
    description: "Look up your Solarzed window film or PPF warranty certificate by warranty number, VIN or mobile number.",
  },
};

export default function WarrantyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
