"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { portalMe, PortalUser } from "@/lib/api";
import PortalSignIn from "@/components/PortalSignIn";
import styles from "./activate.module.css";

/**
 * Warranty activation is done by approved installers inside their own profile. This page signs the installer in
 * (partner login) and then opens the profile's "Register installation" tab, carrying a scanned Serial Number along
 * (/activate#SZ-… → /account#register:SZ-…). There the installer checks the Serial Number and, when the roll is in
 * their account, registers the warranty.
 */
export default function ActivationPage() {
  const [user, setUser] = useState<PortalUser | null>(null);
  const [checked, setChecked] = useState(false);
  const [code, setCode] = useState("");

  useEffect(() => {
    const fromHash = () => decodeURIComponent(window.location.hash.slice(1)).replace(/\s+/g, "").toUpperCase();
    portalMe().then(r => setUser(r.user)).catch(() => setUser(null)).finally(() => { setCode(fromHash()); setChecked(true); });
    // Scanning another card while this page is open changes only the hash.
    const sync = () => setCode(fromHash());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const installer = user?.partner === "approved";
  useEffect(() => {
    if (installer) window.location.replace(`/account#register${code ? `:${encodeURIComponent(code)}` : ""}`);
  }, [installer, code]);

  return <div className={styles.page}>
    <header><Link href="/">SOLAR<span>ZED</span></Link><small>DIGITAL WARRANTY</small></header>
    <main className={styles.card}>
      <span className={styles.eyebrow}>INSTALLER SIGN-IN · CHECK SERIAL NUMBER · ACTIVATE</span><h1>Activate a Solarzed warranty</h1>
      {!checked && <p role="status">Checking sign-in…</p>}
      {checked && !user && <>
        <p>Warranties are activated by approved Solarzed installers. Sign in with the mobile registered as your installer account; you then continue in your profile, check the roll&apos;s <b>Serial Number</b> and, if the roll is in your account, activate the warranty for your customer.</p>
        {code && <p>Serial Number: <code dir="ltr">{code}</code></p>}
        <PortalSignIn intro="Installer sign-in" onSignedIn={setUser} />
        <p><small>Customers: your installer registers the warranty for your mobile and you receive your gold warranty card by SMS.</small></p>
      </>}
      {installer && <p role="status">Opening your installer profile…</p>}
      {user && !installer && <section role="status">
        {user.partner === "pending"
          ? <p>Your installer application is waiting for approval. Once Solarzed approves it you can activate warranties from your profile.</p>
          : <p>Only approved Solarzed installers can activate warranties. Your installer registers the warranty for your mobile and you receive your gold warranty card by SMS.</p>}
        <Link className={styles.button} href="/account">My account</Link>
      </section>}
    </main><footer>© SOLARZED · <Link href="/account">My account</Link> · <Link href="/coverage">Warranty policy</Link></footer>
  </div>;
}
