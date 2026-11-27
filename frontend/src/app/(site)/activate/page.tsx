"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { portalMe, PortalUser } from "@/lib/api";
import PortalSignIn from "@/components/PortalSignIn";
import { useT } from "@/lib/i18n/client";
import styles from "./activate.module.css";

/**
 * Entry point for warranty activation. Signed-out visitors sign in here (installer / partner login); anyone signed in
 * goes to the Warranties page of their account (/account#warranty). Approved installers check the roll's Serial Number
 * and register warranties from their profile.
 */
export default function ActivationPage() {
  const t = useT();
  const [user, setUser] = useState<PortalUser | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    portalMe().then(r => setUser(r.user)).catch(() => setUser(null)).finally(() => setChecked(true));
  }, []);

  useEffect(() => {
    if (user) window.location.replace("/account#warranty");
  }, [user]);

  return <div className={styles.page}>
    <header><Link href="/" aria-label={t("Solarzed home")}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/assets/solarzed-original.png" width={160} height={32} alt="SOLARZED" style={{ display: "block" }} /></Link><small>{t("DIGITAL WARRANTY")}</small></header>
    <main className={styles.card}>
      <span className={styles.eyebrow}>{t("INSTALLER SIGN-IN · CHECK SERIAL NUMBER · ACTIVATE")}</span><h1>{t("Activate a Solarzed warranty")}</h1>
      {!checked && <p role="status">{t("Checking sign-in…")}</p>}
      {checked && !user && <>
        <p>{t("Warranties are activated by approved Solarzed installers. Sign in with the mobile registered as your installer account; you then continue in your profile, check the roll's Serial Number and, if the roll is in your account, activate the warranty for your customer.")}</p>
        <PortalSignIn intro={t("Installer sign-in")} onSignedIn={setUser} />
        <p><small>{t("Customers: your installer registers the warranty for your mobile and you receive your gold warranty card by SMS.")}</small></p>
      </>}
      {user && <p role="status">{t("Opening your warranties…")}</p>}
    </main><footer>© SOLARZED · <Link href="/account">{t("My account")}</Link> · <Link href="/coverage">{t("Warranty policy")}</Link></footer>
  </div>;
}
