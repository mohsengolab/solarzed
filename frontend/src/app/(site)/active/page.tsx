"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Short link to the signed-in Warranties page. /account shows the sign-in form when nobody is signed in and keeps
 * the #warranty tab, so after signing in the user lands straight on their warranties.
 */
export default function ActiveShortcut() {
  useEffect(() => { window.location.replace("/account#warranty"); }, []);
  return <p style={{ padding: 24 }}>Opening your warranties… <Link href="/account#warranty">Continue</Link></p>;
}
