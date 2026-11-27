"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n/client";

/**
 * Short link to the signed-in Warranties page. /account shows the sign-in form when nobody is signed in and keeps
 * the #warranty tab, so after signing in the user lands straight on their warranties.
 */
export default function ActiveShortcut() {
  const t = useT();
  useEffect(() => { window.location.replace("/account#warranty"); }, []);
  return <p style={{ padding: 24 }}>{t("Opening your warranties…")} <Link href="/account#warranty">{t("Continue")}</Link></p>;
}
