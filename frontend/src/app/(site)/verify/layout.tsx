import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Product Authenticity Check",
  description: "Check that your Solarzed window film or paint protection film is genuine by the ROLL NO on the carton.",
  keywords: ["Solarzed authenticity", "genuine window film", "ROLL NO check", "PPF authenticity"],
  alternates: { canonical: "https://solarzed.com/verify" },
  openGraph: {
    url: "https://solarzed.com/verify",
    title: "Solarzed Product Authenticity Check",
    description: "Check that your Solarzed film is genuine by the ROLL NO on the carton.",
  },
};

export default function VerifyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
