"use client";

import { useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import { verifyRollNo, RollVerification } from "@/lib/api";
import ScanButton from "@/components/ScanButton";
import styles from "../warranty/warranty.module.css";

const GOOD = "#1fc3cf", BAD = "#ef4444";

const has = (v: unknown) => v !== null && v !== undefined && v !== "";
const years = (n: number) => `${n} year${n === 1 ? "" : "s"}`;

/** Every public detail of the carton; the Serial Number is never sent by the API. */
function fields(r: RollVerification): [string, string][] {
  const rows: [string, unknown][] = [
    ["Product", r.product],
    ["Model code", r.productCode !== r.product ? r.productCode : null],
    ["Series", r.series],
    ["Type", r.type === "ppf" ? "Paint protection film" : "Window film"],
    ["Thickness", has(r.thicknessMil) ? `${r.thicknessMil} mil` : null],
    ["Visible light (VLT)", has(r.vlt) ? `${r.vlt}%` : null],
    ["IR rejection", has(r.irr) ? `${r.irr}%` : null],
    ["UV rejection", has(r.uv) ? `${r.uv}%` : null],
    ["Total solar energy rejected (TSER)", has(r.tser) ? `${r.tser}%` : null],
    ["Roll width", has(r.widthCm) ? `${r.widthCm} cm` : null],
    ["Roll length", has(r.lengthM) ? `${r.lengthM} m` : null],
    ["Batch", r.batch],
    ["Received", r.receivedOn],
    ["Film warranty", has(r.filmYears) && r.filmYears! > 0 ? years(r.filmYears!) : null],
    ["Installation warranty", has(r.installYears) && r.installYears! > 0 ? years(r.installYears!) : null],
    ["Warranty card", r.activated ? `Activated${r.activatedOn ? ` (${r.activatedOn})` : ""}` : "Not activated yet"],
  ];
  return rows.filter(([, v]) => has(v)).map(([k, v]) => [k, String(v)]);
}

function Result({ r }: { r: RollVerification }) {
  const color = r.genuine ? GOOD : BAD;
  return (
    <div className={styles.certificate}>
      <div className={styles.certHeader}>
        <span className={styles.certCode} dir="ltr">ROLL NO {r.rollNo}</span>
        <span className={styles.certBadge} style={{ background: color + "22", color, border: `1px solid ${color}55` }}>
          {r.genuine ? "✓ Genuine Solarzed product" : "✕ Not found"}
        </span>
      </div>
      {r.genuine ? (<>
        <div className={styles.certGrid}>
          {fields(r).map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}
        </div>
        {r.description && <p className={styles.helpText}>{r.description}</p>}
      </>) : (
        <p className={styles.helpText}>
          This ROLL NO is not registered by Solarzed. Check that you typed it exactly as printed on the carton.
          If it is correct, the product may not be genuine — please <Link href="/contact">contact support</Link>.
        </p>
      )}
    </div>
  );
}

/** Public check: is the carton with this ROLL NO a genuine Solarzed product? Deep link: /verify?r=CPT30614374 */
export default function VerifyPage() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RollVerification | null>(null);

  async function check(value: string) {
    const v = value.trim();
    if (!v) return;
    setLoading(true); setError(null); setResult(null);
    try { setResult(await verifyRollNo(v)); }
    catch (ex: unknown) { setError(ex instanceof Error ? ex.message : "Check failed"); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    const val = new URLSearchParams(window.location.search).get("r");
    if (val) Promise.resolve().then(() => { setQ(val.toUpperCase()); check(val); });
  }, []);

  function onSubmit(e: FormEvent) { e.preventDefault(); check(q); }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.logo}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/solarzed-original.png" width={190} height={38} alt="SOLARZED" />
        </Link>
        <Link href="/contact" className={styles.support}>Support</Link>
      </header>

      <main className={styles.hero}>
        <div className={styles.inner}>
          <h1>AUTHENTICITY CHECK</h1>
          <p className={styles.sub}>Make sure your film is a genuine Solarzed product</p>

          <form onSubmit={onSubmit} className={styles.form}>
            <label htmlFor="verify-roll" className="visually-hidden">ROLL NO</label>
            <input id="verify-roll" value={q} onChange={e => setQ(e.target.value.toUpperCase())} required maxLength={80}
              autoComplete="off" spellCheck={false} autoCapitalize="characters" dir="ltr" placeholder="ROLL NO (e.g. CPT30614374)" />
            <button type="submit" disabled={loading}>{loading ? "Checking…" : "Check"}</button>
            <ScanButton label="Scan barcode / QR" disabled={loading} onScan={text => { setQ(text.trim().toUpperCase()); void check(text); }} />
            <p className={styles.helpText}>
              Enter the ROLL NO printed under the barcode on the carton, or scan the barcode or the QR on the warranty card.
              To look up an installed warranty, use <Link href="/warranty">Check warranty</Link>.
            </p>
          </form>

          {error && <p className={styles.errorMsg}>{error}</p>}
          {result && <div className={styles.results} aria-live="polite"><Result r={result} /></div>}
        </div>
      </main>

      <footer className={styles.footer}>
        <span>© SOLARZED</span>
        <Link href="/warranty">Check warranty</Link>
        <Link href="/contact">Support</Link>
      </footer>
    </div>
  );
}
