import type { Metadata } from "next";
export const metadata: Metadata = { title: "Your warranty card", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function CardLayout({ children }: { children: React.ReactNode }) { return children; }
