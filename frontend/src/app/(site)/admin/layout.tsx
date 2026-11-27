import type { Metadata } from "next";
import { LangProvider } from "@/lib/i18n/client";

export const metadata: Metadata = {
  title: "مدیریت | Solarzed",
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // Admin is Persian only, whatever language the visitor chose for the public site.
  return <LangProvider lang="fa"><div lang="fa" dir="rtl">{children}</div></LangProvider>;
}
