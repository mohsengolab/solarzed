"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { portalMe, PortalUser } from "@/lib/api";
import ActivationFlow from "./ActivationFlow";
import styles from "./activate.module.css";

export default function ActivationPage() {
  const [user, setUser] = useState<PortalUser | null>(null);
  const [checked, setChecked] = useState(false);
  const [code, setCode] = useState("");

  useEffect(() => {
    // Sign-in state first: an installer's session is what lets a bare ROLL NO open the carton.
    const fromHash = decodeURIComponent(window.location.hash.slice(1)).trim();
    portalMe().then(r => setUser(r.user)).catch(() => setUser(null)).finally(() => { setCode(fromHash); setChecked(true); });
  }, []);

  return <div className={styles.page}>
    <header><Link href="/">SOLAR<span>ZED</span></Link><small>DIGITAL WARRANTY</small></header>
    <main className={styles.card}>
      <span className={styles.eyebrow}>SCAN · SIGN IN · ACTIVATE</span><h1>Activate your Solarzed warranty</h1>
      <ActivationFlow user={user} checked={checked} onUser={setUser} initialCode={code} />
    </main><footer>© SOLARZED · <Link href="/account">My account</Link> · <Link href="/coverage">Warranty policy</Link></footer>
  </div>;
}
