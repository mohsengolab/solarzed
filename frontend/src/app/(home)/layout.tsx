import type { Metadata, Viewport } from "next";
import LegacyHead from "./_shared/LegacyHead";

export const metadata: Metadata = {
  metadataBase: new URL("https://solarzed.com"),
  title: {
    default: "Solarzed Window Films | Automotive Tint & PPF Warranty",
    template: "%s | Solarzed",
  },
  description:
    "Solarzed premium automotive window film and paint protection film. Register your installation, verify your warranty certificate, and explore window tint and PPF series.",
  keywords: [
    "automotive window film", "window tint warranty", "paint protection film",
    "PPF warranty", "car tint registration", "solar film", "Solarzed",
    "window tint certificate", "automotive film warranty",
  ],
  authors: [{ name: "Solarzed" }],
  creator: "Solarzed",
  publisher: "Solarzed",
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
  openGraph: {
    type: "website",
    siteName: "Solarzed",
    title: "Solarzed Window Films | Automotive Tint & PPF Warranty",
    description:
      "Premium automotive window film and paint protection film. Digital warranty certificates, traceable serials and 5-window installation maps.",
    url: "https://solarzed.com",
    images: [
      {
        url: "/assets/car.png",
        width: 1545,
        height: 1018,
        alt: "Vehicle with Solarzed window film",
      },
    ],
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Solarzed Window Films | Automotive Tint & PPF Warranty",
    description:
      "Premium automotive window film and PPF. Digital warranty certificates and traceable installation records.",
    images: ["/assets/car.png"],
    creator: "@solarzed_official",
  },
  icons: {
    icon: "/assets/solarzed-original.png",
    shortcut: "/assets/solarzed-original.png",
    apple: "/assets/solarzed-original.png",
  },
  alternates: {
    canonical: "https://solarzed.com",
  },
};

export const viewport: Viewport = { themeColor: "#102a43" };

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr">
      <LegacyHead />
      <body>{children}</body>
    </html>
  );
}
