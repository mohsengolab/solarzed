import type { Metadata } from "next";
export const metadata: Metadata = { title: "My account", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function AccountLayout({ children }: { children: React.ReactNode }) { return children; }
