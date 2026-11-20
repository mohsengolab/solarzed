import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Activate your warranty",
  robots: { index: false },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
