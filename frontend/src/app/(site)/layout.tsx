import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://solarzed.com"),
  title: {
    default: "SOLARZED – Window Film & PPF Warranty",
    template: "%s | Solarzed",
  },
  description:
    "Solarzed window film and paint protection film warranty registration and inquiry. Register your installation and look up your digital warranty certificate.",
  keywords: [
    "Solarzed warranty", "window film warranty", "PPF warranty",
    "automotive tint registration", "warranty certificate lookup",
  ],
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: "Solarzed",
    title: "SOLARZED – Window Film & PPF Warranty",
    description:
      "Register your Solarzed window film or PPF installation and look up your digital warranty certificate.",
    url: "https://solarzed.com",
    images: [{ url: "/assets/solarzed-original.png", width: 160, height: 32, alt: "SOLARZED" }],
    locale: "en_US",
  },
  twitter: {
    card: "summary",
    title: "SOLARZED – Window Film & PPF Warranty",
    description: "Register your Solarzed installation and look up your digital warranty certificate.",
    images: ["/assets/solarzed-original.png"],
  },
  icons: {
    icon: "/assets/solarzed-logo.svg",
    shortcut: "/assets/solarzed-logo.svg",
    apple: "/assets/solarzed-logo.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
