import type { Metadata } from "next";
import { getT } from "@/lib/i18n/server";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Your warranty card"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}
export default function CardLayout({ children }: { children: React.ReactNode }) { return children; }
