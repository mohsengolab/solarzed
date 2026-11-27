"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { warrantyCard, WarrantyCard } from "@/lib/api";
import GoldCard from "@/components/GoldCard";
import { useT } from "@/lib/i18n/client";
import styles from "../warranty/warranty.module.css";

/** Opened from the "warranty active" SMS: /card#{warranty number}.{card key}. The key stays in the hash, never in server logs. */
export default function CardPage() {
  const t = useT();
  const [card, setCard] = useState<WarrantyCard | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const [code, key] = decodeURIComponent(window.location.hash.slice(1)).trim().split(".");
    const load = !code || !key ? Promise.reject(new Error(t("This warranty card link is not complete. Open it again from the SMS.")))
      : warrantyCard(code, key);
    load.then(setCard).catch(ex => setError(ex instanceof Error ? t(ex.message) : t("Could not open the warranty card.")));
  }, [t]);

  return <div className={styles.page}>
    <header className={styles.header}>
      <Link href="/" className={styles.logo}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/solarzed-original.png" width={190} height={38} alt="SOLARZED" />
      </Link>
      <Link href="/warranty" className={styles.support}>{t("Warranty inquiry")}</Link>
    </header>
    <main className={styles.hero}>
      <div className={styles.inner}>
        <h1>{t("YOUR WARRANTY CARD")}</h1>
        {!card && !error && <p className={styles.sub}>{t("Loading…")}</p>}
        {error && <p className={styles.errorMsg}>{error}</p>}
        {card && <>
          <div className={styles.results}><GoldCard card={card} /></div>
          <p className={styles.helpText}>{t("Keep this link. You can also find this card any time on the warranty inquiry page with your VIN and mobile number.")} <Link href="/warranty">{t("Warranty inquiry")}</Link></p>
          <div className={styles.form}><button type="submit" onClick={() => window.print()}>{t("Save / print card")}</button></div>
        </>}
      </div>
    </main>
    <footer className={styles.footer}>
      <span>© SOLARZED</span>
      <Link href="/coverage">{t("Warranty guide")}</Link>
      <Link href="/contact">{t("Support")}</Link>
    </footer>
  </div>;
}
