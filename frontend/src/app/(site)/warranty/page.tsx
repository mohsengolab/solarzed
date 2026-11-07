"use client";

import { useState, useEffect, FormEvent } from "react";
import Link from "next/link";
import { lookupWarranty, WarrantyPublic } from "@/lib/api";
import styles from "./warranty.module.css";

function CertificateCard({ w }: { w: WarrantyPublic }) {
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
          {w.statusLabel}
        </span>
      </div>
      <div className={styles.certGrid}>
        <div><span>Vehicle</span><b>{w.make} {w.model}</b></div>
        <div><span>VIN</span><b className={styles.mono}>{w.vinMasked}</b></div>
        <div><span>Plate</span><b>{w.plate}</b></div>
        <div><span>Type</span><b>{w.type === "ppf" ? "Paint protection film" : "Window film"}</b></div>
        <div><span>Film serial</span><b className={styles.mono}>{w.filmSerial}</b></div>
        <div><span>Installed</span><b>{w.installed}</b></div>
        <div><span>Installer</span><b>{w.installer}</b></div>
        <div><span>Seller</span><b>{w.sellerName}</b></div>
      </div>
      {w.coverage && (
        <div className={styles.certCoverage}>
          <span>Coverage</span>
          <div>
            {w.coverage.filmEnds && <p>Film warranty ends: <b>{w.coverage.filmEnds}</b></p>}
            {w.coverage.installEnds && <p>Installation warranty ends: <b>{w.coverage.installEnds}</b></p>}
            {!w.coverage.filmEnds && !w.coverage.installEnds && <p>Per approved product terms</p>}
          </div>
        </div>
      )}
      {w.statusNote && (
        <div className={styles.certNote}>
          <b>Note:</b> {w.statusNote}
        </div>
      )}
    </div>
  );
}

export default function WarrantyPage() {
  const [q, setQ] = useState("");
  const [records, setRecords] = useState<WarrantyPublic[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Deep-link support: ?q=... or ?code=... or ?vin=... or ?phone=...
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const val = params.get("q") ?? params.get("code") ?? params.get("vin") ?? params.get("phone");
    if (val) {
      setQ(val);
      doLookup(val);
    }
  }, []);

  async function doLookup(value: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await lookupWarranty(value);
      setRecords(res.records);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    doLookup(q.trim());
  }

  async function showSample() {
    setQ("SZ-DEMO-0001");
    setLoading(true);
    setError(null);
    // mock sample
    setRecords([{
      code: "SZ-DEMO-0001",
      type: "tint",
      make: "Toyota",
      model: "Camry",
      vinMasked: "1HG••••F2JH123456",
      plate: "A123-BC",
      filmSerial: "SZ-PIR-26-000001",
      invoiceNumber: "INV-2026-001",
      installed: "2026-03-15",
      sellerName: "Sample Auto Tint",
      sellerPhoneMasked: "09**1234",
      installer: "Sample Installer",
      areas: ["left-front", "right-front", "left-rear", "right-rear", "rear"],
      status: "active",
      statusLabel: "Active warranty",
      coverage: { filmEnds: "2031-03-14", installEnds: "2028-03-14" },
      flags: [],
    }]);
    setLoading(false);
  }

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
          <h1>WARRANTY INQUIRY</h1>
          <p className={styles.sub}>Window film and paint protection film</p>

          <form onSubmit={onSubmit} className={styles.form}>
            <label htmlFor="inquiry-q" className="visually-hidden">
              Warranty number, VIN or mobile number
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
              placeholder="Warranty number / VIN / mobile number"
            />
            <button type="submit" disabled={loading}>
              {loading ? "Searching…" : "Query"}
            </button>
            <p className={styles.helpText}>
              Enter one of: your warranty number (SZ-…), the 17-character VIN, or your mobile number.
            </p>
            <button type="button" className={styles.sampleBtn} onClick={showSample}>
              See a sample certificate
            </button>
          </form>

          {error && <p className={styles.errorMsg}>{error}</p>}

          {records !== null && (
            <div className={styles.results} aria-live="polite">
              {records.length === 0 ? (
                <p className={styles.noResult}>No warranty found for that input.</p>
              ) : (
                records.map(w => <CertificateCard key={w.code} w={w} />)
              )}
            </div>
          )}

          <div className={styles.divider}><span>Description</span></div>

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
                <summary>{item.title}</summary>
                <p>{item.body}</p>
              </details>
            ))}
          </div>
        </div>
      </main>

      <footer className={styles.footer}>
        <span>© SOLARZED</span>
        <Link href="/coverage">Warranty guide</Link>
        <Link href="/contact">Support</Link>
      </footer>
    </div>
  );
}
