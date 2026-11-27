"use client";

import { useCallback, useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import { verifyRollNo, RollVerification } from "@/lib/api";
import ScanButton from "@/components/ScanButton";
import { type T } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import styles from "../warranty/warranty.module.css";

const GOOD = "#1fc3cf", BAD = "#ef4444";

const has = (v: unknown) => v !== null && v !== undefined && v !== "";
const years = (t: T, n: number) => t(n === 1 ? "{n} year" : "{n} years", { n });

/** Every public detail of the carton; the Serial Number is never sent by the API. */
function fields(t: T, r: RollVerification): [string, string][] {
  const rows: [string, unknown][] = [
    ["Product", r.product],
    ["Model code", r.productCode !== r.product ? r.productCode : null],
    ["Series", r.series],
    ["Type", r.type === "ppf" ? t("Paint protection film") : t("Window film")],
    ["Thickness", has(r.thicknessMil) ? `${r.thicknessMil} mil` : null],
    ["Visible light (VLT)", has(r.vlt) ? `${r.vlt}%` : null],
    ["IR rejection", has(r.irr) ? `${r.irr}%` : null],
    ["UV rejection", has(r.uv) ? `${r.uv}%` : null],
    ["Total solar energy rejected (TSER)", has(r.tser) ? `${r.tser}%` : null],
    ["Roll width", has(r.widthCm) ? t("{n} cm", { n: r.widthCm }) : null],
    ["Roll length", has(r.lengthM) ? t("{n} m", { n: r.lengthM }) : null],
    ["Batch", r.batch],
    ["Received", r.receivedOn],
    ["Film warranty", has(r.filmYears) && r.filmYears! > 0 ? years(t, r.filmYears!) : null],
    ["Warranty card", r.activated ? (r.activatedOn ? t("Activated ({date})", { date: r.activatedOn }) : t("Activated")) : t("Not activated yet")],
  ];
  return rows.filter(([, v]) => has(v)).map(([k, v]) => [t(k), String(v)]);
}

function Result({ r }: { r: RollVerification }) {
  const t = useT();
  const color = r.genuine ? GOOD : BAD;
  return (
    <div className={styles.certificate}>
      <div className={styles.certHeader}>
        <span className={styles.certCode} dir="ltr">ROLL NO {r.rollNo}</span>
        <span className={styles.certBadge} style={{ background: color + "22", color, border: `1px solid ${color}55` }}>
          {r.genuine ? t("✓ Genuine Solarzed product") : t("✕ Not found")}
        </span>
      </div>
      {r.genuine ? (<>
        <div className={styles.certGrid}>
          {fields(t, r).map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}
        </div>
        {r.description && <p className={styles.helpText}>{r.description}</p>}
      </>) : (
        <p className={styles.helpText}>
          {t("This ROLL NO is not registered by Solarzed. Check that you typed it exactly as printed on the carton. If it is correct, the product may not be genuine — please contact support.")}{" "}
          <Link href="/contact">{t("Contact support")}</Link>
        </p>
      )}
    </div>
  );
}

/** Public check: is the carton with this ROLL NO a genuine Solarzed product? Deep link: /verify?r=CPT30614374 */
export default function VerifyPage() {
  const t = useT();
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RollVerification | null>(null);

  const check = useCallback(async (value: string) => {
    const v = value.trim();
    if (!v) return;
    setLoading(true); setError(null); setResult(null);
    try { setResult(await verifyRollNo(v)); }
    catch (ex: unknown) { setError(ex instanceof Error ? t(ex.message) : t("Check failed")); }
    finally { setLoading(false); }
  }, [t]);

  useEffect(() => {
    const val = new URLSearchParams(window.location.search).get("r");
    if (val) Promise.resolve().then(() => { setQ(val.toUpperCase()); check(val); });
  }, [check]);

  function onSubmit(e: FormEvent) { e.preventDefault(); check(q); }

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
          <h1>{t("AUTHENTICITY CHECK")}</h1>
          <p className={styles.sub}>{t("Make sure your film is a genuine Solarzed product")}</p>

          <form onSubmit={onSubmit} className={styles.form}>
            <label htmlFor="verify-roll" className="visually-hidden">ROLL NO</label>
            <input id="verify-roll" value={q} onChange={e => setQ(e.target.value.toUpperCase())} required maxLength={80}
              autoComplete="off" spellCheck={false} autoCapitalize="characters" dir="ltr" placeholder={t("ROLL NO (e.g. {example})", { example: "CPT30614374" })} />
            <button type="submit" disabled={loading}>{loading ? t("Checking…") : t("Check")}</button>
            <ScanButton label={t("Scan barcode / QR")} disabled={loading} onScan={text => { setQ(text.trim().toUpperCase()); void check(text); }} />
            <p className={styles.helpText}>
              {t("Enter the ROLL NO printed under the barcode on the carton, or scan the barcode or the QR on the warranty card. To look up an installed warranty, use Check warranty.")}{" "}
              <Link href="/warranty">{t("Check warranty")}</Link>
            </p>
          </form>

          {error && <p className={styles.errorMsg}>{error}</p>}
          {result && <div className={styles.results} aria-live="polite"><Result r={result} /></div>}
        </div>
      </main>

      <footer className={styles.footer}>
        <span>© SOLARZED</span>
        <Link href="/warranty">{t("Check warranty")}</Link>
        <Link href="/contact">{t("Support")}</Link>
      </footer>
    </div>
  );
}
