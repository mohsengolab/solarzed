import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "مدیریت | Solarzed",
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div lang="fa" dir="rtl">{children}</div>;
}
