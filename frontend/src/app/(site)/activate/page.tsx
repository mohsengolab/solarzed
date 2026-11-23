"use client";

import { useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import { inspectBox, completeActivation, installerActivation, portalMe, ActivationInfo, PortalUser, ActivationResult, PhotoSet } from "@/lib/api";
import PhotoPicker, { photosComplete } from "@/components/PhotoPicker";
import PortalSignIn from "@/components/PortalSignIn";
import ScanButton, { serialFromScan } from "@/components/ScanButton";
import CarWindows from "./CarWindows";
import styles from "./activate.module.css";

const panels = ["hood", "front-bumper", "roof", "trunk", "rear-bumper", "left-front-fender", "right-front-fender", "left-doors", "right-doors", "left-rear-quarter", "right-rear-quarter", "mirrors"];
const fields = [
  ["owner", "Full name", 200], ["make", "Vehicle make", 100], ["model", "Vehicle model", 100],
  ["vin", "VIN (17 characters)", 20], ["plate", "Licence plate", 20], ["installed", "Installation date", 10],
  ["invoiceNumber", "Invoice number", 60], ["installer", "Installer / shop", 200],
] as const;
const initial = { owner: "", make: "", model: "", vin: "", plate: "", installed: "", invoiceNumber: "", installer: "" };
// Warranty card code: carton roll number + 7-digit warranty number + factory code (e.g. CPT30614374-4827153-ABC).
// Older cards: without the factory (CPT30614374-4827153), Factory-Serial-Warranty (SA-SZB-…-SZ-…) or a 64-hex label token.
const CARD = /^[A-Za-z0-9][A-Za-z0-9-]{2,30}[A-Za-z0-9]-[1-9][0-9]{6}(-[A-Za-z]{3})?$/;
const OLD_CARD = /^[A-Za-z]{1,4}-SZB-[0-9A-Fa-f]{16}-SZ-[A-Za-z0-9]{6,29}$/;
const LEGACY = /^[a-f0-9]{64}$/i;
// New cards: the QR holds only the Serial Number (carton Roll No); approved installers register with it.
const SERIAL = /^[A-Za-z0-9][A-Za-z0-9-]{2,30}[A-Za-z0-9]$/;
const valid = (value: string) => SERIAL.test(value) || CARD.test(value) || OLD_CARD.test(value) || LEGACY.test(value);

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
  // Approved installer partners register for the customer's mobile, with photos; the counter then reviews them.
  const installer = user?.partner === "approved";
  const [customerPhone, setCustomerPhone] = useState("");
  const [country, setCountry] = useState("");
  const [photos, setPhotos] = useState<PhotoSet>({});

  async function open(code: string) {
    setError(""); setInfo(null);
    try { const data = await inspectBox(code); setToken(code); setInfo(data); }
    catch (ex) { setError(ex instanceof Error ? ex.message : "Could not read this warranty card."); }
  }

  useEffect(() => {
    // Sign-in state first: an installer's session is what lets a bare Serial Number open the carton.
    const code = decodeURIComponent(window.location.hash.slice(1)).trim();
    portalMe().then(r => setUser(r.user)).catch(() => setUser(null)).finally(() => {
      setChecked(true);
      if (valid(code)) void open(code);
    });
  }, []);

  async function activate(event: FormEvent) {
    event.preventDefault(); if (!info || !user) return;
    if (!areas.length) { setError("Select the installed windows or protected panels."); return; }
    if (installer && !photosComplete(photos)) { setError("Add a photo of the vehicle with its plate and of the installed film."); return; }
    setBusy(true); setError("");
    try {
      const used = info.remainingLengthM == null ? null : Number(usedLength);
      const registration = { ...form, installer: installer ? (user.shopName ?? "") : form.installer, phone: installer ? customerPhone : user.phone, type: info.type, filmSerial: info.id, windows: info.type === "tint" ? areas : undefined, panels: info.type === "ppf" ? areas : undefined };
      const completed = installer
        ? await installerActivation(token, registration, used, customerPhone, country || user.country || "", photos)
        : await completeActivation(token, registration, used);
      setResult(completed);
      setInfo({ ...info, activated: true, canRegister: (completed.remainingLengthM ?? 0) > 0, remainingLengthM: completed.remainingLengthM });
      if (!(completed.remainingLengthM && completed.remainingLengthM > 0)) window.history.replaceState(null, "", window.location.pathname);
    } catch (ex) { setError(ex instanceof Error ? ex.message : "Activation failed."); }
    finally { setBusy(false); }
  }

  const card = info && <div className={styles.product}>
    <b>{info.product} · {info.type === "tint" ? "Window film" : "Paint protection film"}</b>
    <dl>
      <dt>Serial Number</dt><dd><code dir="ltr">{info.id}</code></dd>
      {info.remainingLengthM != null && <><dt>Remaining roll length</dt><dd>{info.remainingLengthM} m</dd></>}
    </dl>
    <span>{info.filmYears}-year film warranty{info.installYears ? ` · ${info.installYears}-year installation warranty` : ""}</span>
  </div>;

  return <div className={styles.page}>
    <header><Link href="/">SOLAR<span>ZED</span></Link><small>DIGITAL WARRANTY</small></header>
    <main className={styles.card}>
      {result ? <section aria-live="polite"><span className={styles.eyebrow}>WARRANTY REGISTERED</span>{result.warranty.status === "pending"
          ? <><h1>Sent for review</h1><p>The installation and its photos were sent to the Solarzed counter. Once the photos are approved the warranty becomes active and the customer gets an SMS with their gold warranty card. You can follow it in your account.</p></>
          : <><h1>Your warranty is active</h1><p>Keep your warranty number for future reference. You can see it any time in your account.</p></>}<small className={styles.codeLabel}>Warranty number</small><code className={styles.code} dir="ltr">{result.warranty.code}</code><dl><dt>Serial Number</dt><dd dir="ltr">{info?.id}</dd><dt>Vehicle</dt><dd>{result.warranty.make} {result.warranty.model}</dd>{result.warranty.usedLengthM != null && <><dt>Film used</dt><dd>{result.warranty.usedLengthM} m</dd><dt>Remaining roll length</dt><dd>{result.remainingLengthM} m</dd></>}{result.warranty.coverage?.filmEnds && <><dt>Film warranty ends</dt><dd>{result.warranty.coverage.filmEnds}</dd></>}{result.warranty.coverage?.installEnds && <><dt>Installation warranty ends</dt><dd>{result.warranty.coverage.installEnds}</dd></>}</dl>
        {info?.canRegister && <p><button className={styles.button} type="button" onClick={() => { setResult(null); setForm(initial); setAreas([]); setUsedLength(""); setCustomerPhone(""); setPhotos({}); }}>Register another vehicle</button></p>}
        <Link className={styles.button} href="/account">My account</Link></section>
      : <><span className={styles.eyebrow}>SCAN · SIGN IN · ACTIVATE</span><h1>Activate your Solarzed warranty</h1>
      {error && <p role="alert" className={styles.error}>{error}</p>}

      {!info && <form onSubmit={event => { event.preventDefault(); open(typed.trim()); }}>
        {installer
          ? <p>Scan the QR on the warranty card inside the carton, or type the Serial Number printed under it.</p>
          : <p>Your Solarzed installer registers the warranty for your mobile and you receive your gold warranty card by SMS. Older cards with a warranty code (e.g. CPT30614374-4827153-ABC) can still be activated here.</p>}
        <label>{installer ? "Serial Number" : "Serial Number or warranty card code"}
          <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input dir="ltr" required style={{ flex: "1 1 200px" }} placeholder={installer ? "CPT30614374" : "CPT30614374-4827153-ABC"} value={typed} onChange={event => setTyped(event.target.value.replace(/\s+/g, "").toUpperCase())} />
            <ScanButton label="Scan" onScan={text => { const sn = installer ? serialFromScan(text) : text.trim(); setTyped(sn.toUpperCase()); if (valid(sn)) void open(sn); }} />
          </span>
        </label>
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
          {installer
            ? <p>Installer: <b>{user.shopName}</b> (<span dir="ltr">{user.phone}</span>). Enter the customer&apos;s details and the installation photos. The warranty is registered to the customer&apos;s mobile and becomes active after the counter approves the photos.</p>
            : <p>Signed in as <b dir="ltr">{user.phone}</b>. Enter the installation details. Coverage starts from the installation date under the approved product terms.</p>}
          {user.partner === "pending" && <p role="status">Your installer application is waiting for approval. Until then, this card registers as your own warranty.</p>}
          {installer && <div className={styles.grid}>
            <label>Customer mobile<input required dir="ltr" type="tel" inputMode="tel" maxLength={20} placeholder="09…" value={customerPhone} onChange={event => setCustomerPhone(event.target.value)} /></label>
            <label>Country of installation<input maxLength={100} placeholder={user.country ?? "Iran"} value={country} onChange={event => setCountry(event.target.value)} /></label>
          </div>}
          {installer && <p />}
          <div className={styles.grid}>{fields.filter(([key]) => !(installer && key === "installer")).map(([key, label, max]) => <label key={key}>{installer && key === "owner" ? "Customer full name" : label}<input required maxLength={max} value={form[key]} type={key === "installed" ? "date" : "text"} autoComplete={key === "owner" ? "name" : "off"} onChange={event => setForm(value => ({ ...value, [key]: event.target.value }))} /></label>)}</div>
          {info.remainingLengthM != null && <label className={styles.meters}>Film used (m)<input required type="number" inputMode="decimal" min="0.01" step="0.01" max={info.remainingLengthM} value={usedLength} onChange={event => setUsedLength(event.target.value)} /></label>}
          <fieldset><legend>{info.type === "tint" ? "Installed windows" : "Protected panels"}</legend>{info.type === "tint" ? <CarWindows value={areas} onChange={setAreas} /> : <div className={styles.areas}>{panels.map(area => <label key={area}><input type="checkbox" checked={areas.includes(area)} onChange={event => setAreas(current => event.target.checked ? [...current, area] : current.filter(item => item !== area))} />{area.replaceAll("-", " ")}</label>)}</div>}</fieldset>
          {installer && <PhotoPicker value={photos} onChange={setPhotos} disabled={busy} />}
          <button className={styles.button} type="submit" disabled={busy || !info.released}>{busy ? (installer ? "Uploading…" : "Checking…") : installer ? "Send for review" : "Check & register warranty"}</button>
        </form>}
      </>}
      </>}
    </main><footer>© SOLARZED · <Link href="/account">My account</Link> · <Link href="/coverage">Warranty policy</Link></footer>
  </div>;
}
