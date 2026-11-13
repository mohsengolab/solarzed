import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Register Installation",
  description:
    "Register a Solarzed window film or PPF installation. For authorised installers and dealers — create a digital warranty certificate for your customer.",
  keywords: ["register warranty", "Solarzed installer", "window tint registration", "PPF installation register"],
  alternates: { canonical: "https://solarzed.com/register" },
  openGraph: {
    url: "https://solarzed.com/register",
    title: "Register Solarzed Installation | Installer Portal",
    description: "Create a digital warranty certificate for your customer. For authorised Solarzed installers and dealers.",
  },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
