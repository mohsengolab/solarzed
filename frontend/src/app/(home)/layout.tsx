import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Solarzed Window Films | Film & Installation Warranty",
  description:
    "Solarzed automotive window film warranty. Register installations and find your window tint record.",
};

export const viewport: Viewport = { themeColor: "#102a43" };

// The homepage and product pages keep the original static-site stylesheets verbatim
// (public/legacy). They have their own root layout so those styles never load elsewhere.
const LEGACY_CSS = [
  "style", "warranty", "solarzed", "presentation", "reference-theme", "polish", "protection",
];

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr">
      <head>
        {LEGACY_CSS.slice(0, 5).map(name => (
          <link key={name} rel="stylesheet" href={`/legacy/${name}.css`} />
        ))}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
        />
        {LEGACY_CSS.slice(5).map(name => (
          <link key={name} rel="stylesheet" href={`/legacy/${name}.css`} />
        ))}
      </head>
      <body>{children}</body>
    </html>
  );
}
