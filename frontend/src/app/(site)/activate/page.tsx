"use client";

import { useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import { inspectBox, completeActivation, portalMe, ActivationInfo, PortalUser, ActivationResult } from "@/lib/api";
import PortalSignIn from "@/components/PortalSignIn";
import styles from "./activate.module.css";

const windows = ["left-front", "right-front", "left-rear", "right-rear", "rear"];
const panels = ["hood", "front-bumper", "roof", "trunk", "rear-bumper", "left-front-fender", "right-front-fender", "left-doors", "right-doors", "left-rear-quarter", "right-rear-quarter", "mirrors"];
const fields = [
  ["owner", "Full name", 200], ["make", "Vehicle make", 100], ["model", "Vehicle model", 100],
  ["vin", "VIN (17 characters)", 20], ["plate", "Licence plate", 20], ["installed", "Installation date", 10],
  ["invoiceNumber", "Invoice number", 60], ["installer", "Installer / shop", 200], ["sellerName", "Seller name", 200], ["sellerPhone", "Seller mobile", 30],
] as const;
const initial = { owner: "", make: "", model: "", vin: "", plate: "", installed: "", invoiceNumber: "", installer: "", sellerName: "", sellerPhone: "" };
// Warranty card code: carton roll number + 7-digit warranty number + factory code (e.g. CPT30614374-4827153-ABC).
// Older cards: without the factory (CPT30614374-4827153), Factory-Serial-Warranty (SA-SZB-…-SZ-…) or a 64-hex label token.
const CARD = /^[A-Za-z0-9][A-Za-z0-9-]{2,30}[A-Za-z0-9]-[1-9][0-9]{6}(-[A-Za-z]{3})?$/;
const OLD_CARD = /^[A-Za-z]{1,4}-SZB-[0-9A-Fa-f]{16}-SZ-[A-Za-z0-9]{6,29}$/;
const LEGACY = /^[a-f0-9]{64}$/i;
const valid = (value: string) => CARD.test(value) || OLD_CARD.test(value) || LEGACY.test(value);

export default function ActivationPage() {
  const [token, setToken] = useState("");
  const [typed, setTyped] = useState("");
  const [info, setInfo] = useState<ActivationInfo | null>(null);
  const [user, setUser] = useState<PortalUser | null>(null);
  const [checked, setChecked] = useState(false);
  const [form, setForm] = useState(initial);
  const [areas, setAreas] = useState<string[]>([]);
  const [usedLength, setUsedLength] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ActivationResult | null>(null);

  async function open(code: string) {
    setError(""); setInfo(null);
    try { const data = await inspectBox(code); setToken(code); setInfo(data); }
    catch (ex) { setError(ex instanceof Error ? ex.message : "Could not read this warranty card."); }
  }

  useEffect(() => {
    portalMe().then(r => setUser(r.user)).catch(() => setUser(null)).finally(() => setChecked(true));
    const code = decodeURIComponent(window.location.hash.slice(1)).trim();
    if (valid(code)) Promise.resolve().then(() => open(code));
  }, []);

  async function activate(event: FormEvent) {
    event.preventDefault(); if (!info || !user) return;
    if (!areas.length) { setError("Select the installed windows or protected panels."); return; }
    setBusy(true); setError("");
    try {
      const registration = { ...form, phone: user.phone, type: info.type, filmSerial: info.id, windows: info.type === "tint" ? areas : undefined, panels: info.type === "ppf" ? areas : undefined };
      const completed = await completeActivation(token, registration, info.remainingLengthM == null ? null : Number(usedLength));
      setResult(completed);
      setInfo({ ...info, activated: true, canRegister: (completed.remainingLengthM ?? 0) > 0, remainingLengthM: completed.remainingLengthM });
      if (!(completed.remainingLengthM && completed.remainingLengthM > 0)) window.history.replaceState(null, "", window.location.pathname);
    } catch (ex) { setError(ex instanceof Error ? ex.message : "Activation failed."); }
    finally { setBusy(false); }
  }

  const card = info && <div className={styles.product}>
    <b>{info.product} · {info.type === "tint" ? "Window film" : "Paint protection film"}</b>
    <dl>
      <dt>Roll No</dt><dd><code dir="ltr">{info.id}</code></dd>
      {info.remainingLengthM != null && <><dt>Remaining roll length</dt><dd>{info.remainingLengthM} m</dd></>}
    </dl>
    <span>{info.filmYears}-year film warranty{info.installYears ? ` · ${info.installYears}-year installation warranty` : ""}</span>
  </div>;

  return <div className={styles.page}>
    <header><Link href="/">SOLAR<span>ZED</span></Link><small>DIGITAL WARRANTY</small></header>
    <main className={styles.card}>
      {result ? <section aria-live="polite"><span className={styles.eyebrow}>WARRANTY REGISTERED</span><h1>Your warranty is active</h1><p>Keep your warranty number for future reference. You can see it any time in your account.</p><code className={styles.code}>{result.warranty.code}</code><dl><dt>Product serial</dt><dd>{info?.id}</dd><dt>Vehicle</dt><dd>{result.warranty.make} {result.warranty.model}</dd>{result.warranty.usedLengthM != null && <><dt>Film used</dt><dd>{result.warranty.usedLengthM} m</dd><dt>Remaining roll length</dt><dd>{result.remainingLengthM} m</dd></>}<dt>Film warranty ends</dt><dd>{result.warranty.coverage?.filmEnds}</dd>{result.warranty.coverage?.installEnds && <><dt>Installation warranty ends</dt><dd>{result.warranty.coverage.installEnds}</dd></>}</dl>
        {info?.canRegister && <p><button className={styles.button} type="button" onClick={() => { setResult(null); setForm(initial); setAreas([]); setUsedLength(""); }}>Register another vehicle</button></p>}
        <Link className={styles.button} href="/account">My account</Link></section>
      : <><span className={styles.eyebrow}>SCAN · SIGN IN · ACTIVATE</span><h1>Activate your Solarzed warranty</h1>
      {error && <p role="alert" className={styles.error}>{error}</p>}

      {!info && <form onSubmit={event => { event.preventDefault(); open(typed.trim()); }}>
        <p>Scan the QR code on the warranty card inside your Solarzed box, or type the code printed under it.</p>
        <label>Warranty card code<input dir="ltr" required placeholder="CPT30614374-4827153-ABC" value={typed} onChange={event => setTyped(event.target.value.toUpperCase())} /></label>
        <p />
        <button className={styles.button} disabled={!valid(typed.trim())}>Check card</button>
      </form>}

      {info && <>{card}
        {!info.released && <p role="status" className={styles.error}>This product has not been released for customer activation yet. Please contact your seller. Your warranty card has not been used.</p>}
        {checked && !user && <PortalSignIn smsAvailable={info.smsAvailable} onSignedIn={signedIn => { setUser(signedIn); void open(token); }}
          intro={info.activated ? "Sign in with the mobile used for the first vehicle to see whether this roll has film left." : "Sign in with your mobile number. We send you a code by SMS; the warranty is registered to this mobile."} />}
        {user && !user.phone && <p role="status" className={styles.error}>Your account has no verified mobile number yet. Add one in <Link href="/account">my account</Link> first — warranty cards are registered to a mobile number.</p>}
        {!info.activated && !info.canRegister && <p role="status">The roll length is unavailable. Contact your seller.</p>}
        {user?.phone && info.activated && !info.canRegister && <p role="status">This card has no available length for this account. <Link href="/account">View my warranties</Link></p>}
        {user?.phone && info.canRegister && <form onSubmit={activate}>
          <p>Signed in as <b dir="ltr">{user.phone}</b>. Enter the installation details. Coverage starts from the installation date under the approved product terms.</p>
          <div className={styles.grid}>{fields.map(([key, label, max]) => <label key={key}>{label}<input required maxLength={max} value={form[key]} type={key === "installed" ? "date" : key === "sellerPhone" ? "tel" : "text"} autoComplete={key === "owner" ? "name" : "off"} onChange={event => setForm(value => ({ ...value, [key]: event.target.value }))} /></label>)}</div>
          {info.remainingLengthM != null && <label>Film used on this vehicle (meters)<input required type="number" inputMode="decimal" min="0.01" step="0.01" max={info.remainingLengthM} value={usedLength} onChange={event => setUsedLength(event.target.value)} /></label>}
          <fieldset><legend>{info.type === "tint" ? "Installed windows" : "Protected panels"}</legend><div className={styles.areas}>{(info.type === "tint" ? windows : panels).map(area => <label key={area}><input type="checkbox" checked={areas.includes(area)} onChange={event => setAreas(current => event.target.checked ? [...current, area] : current.filter(item => item !== area))} />{area.replaceAll("-", " ")}</label>)}</div></fieldset>
          <button className={styles.button} type="submit" disabled={busy || !info.released}>{busy ? "Checking…" : "Check & register warranty"}</button>
        </form>}
      </>}
      </>}
    </main><footer>© SOLARZED · <Link href="/account">My account</Link> · <Link href="/coverage">Warranty policy</Link></footer>
  </div>;
}
