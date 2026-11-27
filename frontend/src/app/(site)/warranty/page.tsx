"use client";

import { useState, useEffect, FormEvent } from "react";
import Link from "next/link";
import { lookupOwner, WarrantyCard } from "@/lib/api";
import GoldCard from "@/components/GoldCard";
import CardDetails from "@/components/CardDetails";
import VehicleCoverage, { byVehicle } from "@/components/VehicleCoverage";
import { useT } from "@/lib/i18n/client";
import styles from "./warranty.module.css";

export default function WarrantyPage() {
  const t = useT();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The VIN, the mobile the installer registered the warranty to, or the owner's email → the gold cards.
  // The warranty number is never searchable.
  const [who, setWho] = useState("");
  const [cards, setCards] = useState<WarrantyCard[] | null>(null);

  async function find(value: string) {
    setLoading(true); setError(null); setCards(null);
    try { setCards((await lookupOwner(value)).cards); }
    catch (ex: unknown) { setError(ex instanceof Error ? t(ex.message) : t("Lookup failed")); }
    finally { setLoading(false); }
  }

  function ownerLookup(e: FormEvent) {
    e.preventDefault();
    if (who.trim()) void find(who.trim());
  }

  // Deep-link support: ?vin=... or ?q=... (a VIN, mobile or email). A warranty number is never accepted: old
  // ?code=... links are stripped from the address bar and ignored.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("code")) { params.delete("code"); window.history.replaceState(null, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`); }
    const val = params.get("vin") ?? params.get("q");
    if (val) Promise.resolve().then(() => { setWho(val); void find(val); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.logo}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/solarzed-original.png" width={190} height={38} alt="SOLARZED" />
        </Link>
        <Link href="/contact" className={styles.support}>{t("Support")}</Link>
      </header>

      <main className={styles.hero}>
        <div className={styles.inner}>
          <h1>{t("WARRANTY INQUIRY")}</h1>
          <p className={styles.sub}>{t("Window film and paint protection film")}</p>


          <form onSubmit={ownerLookup} className={styles.form}>
            <label htmlFor="inquiry-who" className="visually-hidden">{t("VIN, mobile or email")}</label>
            <input id="inquiry-who" value={who} onChange={e => setWho(e.target.value)} required maxLength={254}
              autoComplete="off" spellCheck={false} dir="ltr" placeholder={t("VIN, mobile (09…) or email")} />
            <button type="submit" disabled={loading}>{loading ? t("Searching…") : t("Show my warranty card")}</button>
            <p className={styles.helpText}>{t("Enter only one of: your vehicle's VIN, the mobile number your installer registered the warranty to, or the email of your Solarzed account. If different films were used on different windows, you will see the warranty of each window.")}{" "}
              <Link href="/account">{t("Sign in to your account")}</Link></p>
          </form>

          {cards !== null && <div className={`${styles.results} ${styles.cards}`} aria-live="polite">
            {cards.length === 0
              ? <p className={styles.noResult}>{t("No warranty found for that input.")}</p>
              : <>{[...new Set(cards.map(c => c.owner).filter(Boolean))].length > 0 && <div className={styles.ownerHead}>
                <span>{t("Warranty owner")}</span>
                <b>{[...new Set(cards.map(c => c.owner).filter(Boolean))].join(" · ")}</b>
              </div>}
              {byVehicle(cards).map((car, i) => <div key={i} className={styles.cards}>
                <VehicleCoverage title={`${car[0].make} ${car[0].model} · ${car[0].plate}`}
                  items={car.map(c => ({ ...c, film: c.product }))} />
                {car.map((c, j) => <div key={j}><GoldCard card={c} /><CardDetails card={c} /></div>)}
              </div>)}</>}
          </div>}

          {error && <p className={styles.errorMsg}>{error}</p>}

          <div className={styles.divider}><span>{t("Description")}</span></div>

          <div className={styles.terms}>
            {[
              {
                title: "Window film warranty",
                body: "Covers confirmed product defects under normal use such as abnormal discoloration, delamination or bubbling. Covers installation issues such as trapped contamination, poor trimming or edge lifting."
              },
              {
                title: "Paint protection film (body cover) warranty",
                body: "Adhesion without abnormal delamination, blistering or separation. No abnormal yellowing or loss of clarity. Professional removal without damage to original paint."
              },
              {
                title: "What is usually not covered",
                body: "Collision, impact, scratches, stone chips or vandalism. Unsuitable chemicals. Repainted or non-original paint. Later modifications or abnormal use."
              },
              {
                title: "Care after installation",
                body: "Follow the curing time before washing. Use mild, pH-neutral cleaners and soft cloths. Keep pressure washers away from film edges. Contact your installer with photos if you notice lifting or bubbles."
              },
              {
                title: "About your warranty",
                body: "The warranty is issued to the original customer and becomes active after Solarzed verifies the product and installation. Read the full warranty guide or contact support."
              },
            ].map(item => (
              <details key={item.title}>
                <summary>{t(item.title)}</summary>
                <p>{t(item.body)}</p>
              </details>
            ))}
          </div>
        </div>
      </main>

      <footer className={styles.footer}>
        <span>© SOLARZED</span>
        <Link href="/coverage">{t("Warranty guide")}</Link>
        <Link href="/contact">{t("Support")}</Link>
      </footer>
    </div>
  );
}
