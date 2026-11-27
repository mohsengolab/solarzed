"use client";

import { useState, useEffect, FormEvent } from "react";
import Link from "next/link";
import { lookupWarranty, lookupOwner, WarrantyCheck, WarrantyCard } from "@/lib/api";
import GoldCard from "@/components/GoldCard";
import VehicleCoverage, { byVehicle } from "@/components/VehicleCoverage";
import { useT } from "@/lib/i18n/client";
import styles from "./warranty.module.css";

const STATUS = { active: "Active warranty", pending: "In review", rejected: "Not active" } as const;

function CertificateCard({ w }: { w: WarrantyCheck }) {
  const t = useT();
  const statusColor = {
    active: "#1fc3cf",
    pending: "#f59e0b",
    rejected: "#ef4444",
  }[w.status] ?? "#93aac0";

  return (
    <div className={styles.certificate}>
      <div className={styles.certHeader}>
        <span className={styles.certCode}>{w.code}</span>
        <span className={styles.certBadge} style={{ background: statusColor + "22", color: statusColor, border: `1px solid ${statusColor}55` }}>
          {t(STATUS[w.status] ?? w.statusLabel)}
        </span>
      </div>
      <div className={styles.certGrid}>
        <div><span>{t("Vehicle")}</span><b>{w.make} {w.model}</b></div>
        <div><span>{t("Type")}</span><b>{w.type === "ppf" ? t("Paint protection film") : t("Window film")}</b></div>
        <div><span>{t("Installed")}</span><b>{w.installed}</b></div>
      </div>
      {w.coverage && (
        <div className={styles.certCoverage}>
          <span>{t("Coverage")}</span>
          <div>
            {w.coverage.filmEnds && <p>{t("Film warranty ends")}: <b>{w.coverage.filmEnds}</b></p>}
            {w.coverage.installEnds && <p>{t("Installation warranty ends")}: <b>{w.coverage.installEnds}</b></p>}
            {!w.coverage.filmEnds && !w.coverage.installEnds && <p>{t("Per approved product terms")}</p>}
          </div>
        </div>
      )}
      {w.statusNote && (
        <div className={styles.certNote}>
          <b>{t("Note")}:</b> {w.statusNote}
        </div>
      )}
    </div>
  );
}

export default function WarrantyPage() {
  const t = useT();
  const [q, setQ] = useState("");
  const [records, setRecords] = useState<WarrantyCheck[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "owner": the VIN, the mobile the installer registered the warranty to, or the owner's email → the gold cards.
  const [mode, setMode] = useState<"code" | "owner">("owner");
  const [who, setWho] = useState("");
  const [cards, setCards] = useState<WarrantyCard[] | null>(null);

  async function ownerLookup(e: FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null); setCards(null);
    try { setCards((await lookupOwner(who.trim())).cards); }
    catch (ex: unknown) { setError(ex instanceof Error ? t(ex.message) : t("Lookup failed")); }
    finally { setLoading(false); }
  }

  // Deep-link support: ?q=... or ?code=... or ?vin=...
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const val = params.get("q") ?? params.get("code") ?? params.get("vin");
    if (val) Promise.resolve().then(() => {
      setMode("code");
      setQ(val);
      doLookup(val);
    });
  }, []);

  async function doLookup(value: string) {
    setLoading(true);
    setError(null);
    setRecords(null);
    try {
      const res = await lookupWarranty(value);
      setRecords(res.records);
    } catch (e: unknown) {
      setError(e instanceof Error ? t(e.message) : t("Lookup failed"));
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    doLookup(q.trim());
  }

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

          <div className={styles.tabs} role="tablist">
            <button type="button" role="tab" aria-selected={mode === "owner"} onClick={() => { setMode("owner"); setError(null); }}>{t("VIN, mobile or email")}</button>
            <button type="button" role="tab" aria-selected={mode === "code"} onClick={() => { setMode("code"); setError(null); }}>{t("Warranty number")}</button>
          </div>

          {mode === "owner" && <form onSubmit={ownerLookup} className={styles.form}>
            <label htmlFor="inquiry-who" className="visually-hidden">{t("VIN, mobile or email")}</label>
            <input id="inquiry-who" value={who} onChange={e => setWho(e.target.value)} required maxLength={254}
              autoComplete="off" spellCheck={false} dir="ltr" placeholder={t("VIN, mobile (09…) or email")} />
            <button type="submit" disabled={loading}>{loading ? t("Searching…") : t("Show my warranty card")}</button>
            <p className={styles.helpText}>{t("Enter only one of: your vehicle's VIN, the mobile number your installer registered the warranty to, or the email of your Solarzed account. If different films were used on different windows, you will see the warranty of each window.")}{" "}
              <Link href="/account">{t("Sign in to your account")}</Link></p>
          </form>}

          {mode === "owner" && cards !== null && <div className={`${styles.results} ${styles.cards}`} aria-live="polite">
            {cards.length === 0
              ? <p className={styles.noResult}>{t("No warranty found for that input.")}</p>
              : <>{[...new Set(cards.map(c => c.owner).filter(Boolean))].length > 0 && <div className={styles.ownerHead}>
                <span>{t("Warranty owner")}</span>
                <b>{[...new Set(cards.map(c => c.owner).filter(Boolean))].join(" · ")}</b>
              </div>}
              {byVehicle(cards).map(car => <div key={car[0].code} className={styles.cards}>
                <VehicleCoverage title={`${car[0].make} ${car[0].model} · ${car[0].plate}`}
                  items={car.map(c => ({ ...c, film: c.product }))} />
                {car.map(c => <GoldCard key={c.code} card={c} />)}
              </div>)}</>}
          </div>}

          {mode === "code" && <form onSubmit={onSubmit} className={styles.form}>
            <label htmlFor="inquiry-q" className="visually-hidden">
              {t("Warranty number or VIN")}
            </label>
            <input
              id="inquiry-q"
              value={q}
              onChange={e => setQ(e.target.value)}
              required
              maxLength={40}
              autoComplete="off"
              spellCheck={false}
              autoCapitalize="characters"
              placeholder={t("Warranty number / VIN")}
            />
            <button type="submit" disabled={loading}>
              {loading ? t("Searching…") : t("Query")}
            </button>
          </form>}

          {error && <p className={styles.errorMsg}>{error}</p>}

          {mode === "code" && records !== null && (
            <div className={styles.results} aria-live="polite">
              {records.length === 0 ? (
                <p className={styles.noResult}>{t("No warranty found for that input.")}</p>
              ) : (
                records.map(w => <CertificateCard key={w.code} w={w} />)
              )}
            </div>
          )}

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
