"use client";

import { useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import { inspectBox, completeActivation, installerActivation, ActivationInfo, PortalUser, ActivationResult, PhotoSet } from "@/lib/api";
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
// New cards: the QR holds only the ROLL NO of the carton; approved installers register with it.
const ROLL_NO = /^[A-Za-z0-9][A-Za-z0-9-]{2,30}[A-Za-z0-9]$/;
export const validCardCode = (value: string) => ROLL_NO.test(value) || CARD.test(value) || OLD_CARD.test(value) || LEGACY.test(value);

/**
 * Scan / type a ROLL NO (or an older warranty card code), then register the installation.
 * Used by the public /activate page and embedded in the account dashboard, so installers never leave their account.
 */
export default function ActivationFlow({ user, checked, onUser, initialCode, embedded, onDone }: {
  user: PortalUser | null;
  checked: boolean;
  onUser: (user: PortalUser) => void;
  initialCode?: string;
  /** Inside the account dashboard: no sign-in form, "done" returns to the dashboard instead of linking away. */
  embedded?: boolean;
  onDone?: () => void;
}) {
  const [token, setToken] = useState("");
  const [typed, setTyped] = useState("");
  const [info, setInfo] = useState<ActivationInfo | null>(null);
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
    try { const data = await inspectBox(code); setToken(code); setInfo(data); setTyped(code.toUpperCase()); }
    catch (ex) { setError(ex instanceof Error ? ex.message : "Could not read this ROLL NO."); }
  }

  useEffect(() => {
    // Wait for the sign-in check: an installer's session is what lets a bare ROLL NO open the carton.
    if (checked && initialCode && validCardCode(initialCode)) void Promise.resolve().then(() => open(initialCode));
  }, [checked, initialCode]);

  function reset(keepRoll: boolean) {
    setResult(null); setForm(initial); setAreas([]); setUsedLength(""); setCustomerPhone(""); setPhotos({}); setError("");
    if (!keepRoll) { setInfo(null); setToken(""); setTyped(""); }
  }

  async function activate(event: FormEvent) {
    event.preventDefault(); if (!info || !user) return;
    if (!areas.length) { setError("Select the installed windows or protected panels."); return; }
    if (installer && !photosComplete(photos)) { setError("Add a photo of the vehicle with its plate and of the installed film."); return; }
    setBusy(true); setError("");
    try {
      // Meters are optional: a roll covers as many vehicles as it fits, nobody has to measure it.
      const used = usedLength.trim() ? Number(usedLength) : null;
      const registration = { ...form, installer: installer ? (user.shopName ?? "") : form.installer, phone: installer ? customerPhone : user.phone, type: info.type, filmSerial: info.id, windows: info.type === "tint" ? areas : undefined, panels: info.type === "ppf" ? areas : undefined };
      const completed = installer
        ? await installerActivation(token, registration, used, customerPhone, country || user.country || "", photos)
        : await completeActivation(token, registration, used);
      setResult(completed);
      setInfo({ ...info, activated: true, canRegister: true, remainingLengthM: completed.remainingLengthM });
      onDone?.();
    } catch (ex) { setError(ex instanceof Error ? ex.message : "Activation failed."); }
    finally { setBusy(false); }
  }

  const card = info && <div className={styles.product}>
    <b>{info.product} · {info.type === "tint" ? "Window film" : "Paint protection film"}</b>
    <dl>
      <dt>ROLL NO</dt><dd><code dir="ltr">{info.id}</code></dd>
      {info.remainingLengthM != null && <><dt>Remaining roll length</dt><dd>{info.remainingLengthM} m</dd></>}
    </dl>
    <span>{info.filmYears}-year film warranty{info.installYears ? ` · ${info.installYears}-year installation warranty` : ""}</span>
  </div>;

  if (result) return <section aria-live="polite">
    <span className={styles.eyebrow}>WARRANTY REGISTERED</span>
    {result.warranty.status === "pending"
      ? <><h2>Sent for review</h2><p>The installation and its photos were sent to the Solarzed counter. Once the photos are approved the warranty becomes active and the customer gets an SMS with their gold warranty card. You can follow it under <b>Installations</b>.</p></>
      : <><h2>Your warranty is active</h2><p>Keep your warranty number for future reference. You can see it any time under <b>Warranties</b> in your account.</p></>}
    <small className={styles.codeLabel}>Warranty number</small><code className={styles.code} dir="ltr">{result.warranty.code}</code>
    <dl><dt>ROLL NO</dt><dd dir="ltr">{info?.id}</dd><dt>Vehicle</dt><dd>{result.warranty.make} {result.warranty.model}</dd>{result.warranty.usedLengthM != null && <><dt>Film used</dt><dd>{result.warranty.usedLengthM} m</dd><dt>Remaining roll length</dt><dd>{result.remainingLengthM} m</dd></>}{result.warranty.coverage?.filmEnds && <><dt>Film warranty ends</dt><dd>{result.warranty.coverage.filmEnds}</dd></>}{result.warranty.coverage?.installEnds && <><dt>Installation warranty ends</dt><dd>{result.warranty.coverage.installEnds}</dd></>}</dl>
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      {info?.canRegister && <button className={styles.button} type="button" onClick={() => reset(true)}>Another vehicle from this roll</button>}
      {embedded
        ? <button className={styles.button} type="button" onClick={() => reset(false)}>Scan another ROLL NO</button>
        : <Link className={styles.button} href="/account">My account</Link>}
    </div>
  </section>;

  return <>
    {error && <p role="alert" className={styles.error}>{error}</p>}

    {!info && <form onSubmit={event => { event.preventDefault(); void open(typed.trim()); }}>
      {installer
        ? <p>Scan the QR on the warranty card inside the carton, or type the <b>ROLL NO</b> printed under it.</p>
        : <p>Your Solarzed installer registers the warranty for your mobile and you receive your gold warranty card by SMS. If you have a card, scan its QR or type the <b>ROLL NO</b> printed on it.</p>}
      <label>ROLL NO
        <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input dir="ltr" required style={{ flex: "1 1 200px" }} placeholder="e.g. CPT30614374" autoComplete="off" spellCheck={false} autoCapitalize="characters"
            value={typed} onChange={event => setTyped(event.target.value.replace(/\s+/g, "").toUpperCase())} />
          <ScanButton label="Scan" onScan={text => { const sn = installer ? serialFromScan(text) : text.trim(); setTyped(sn.toUpperCase()); if (validCardCode(sn)) void open(sn); }} />
        </span>
      </label>
      {!installer && <small className={styles.hint}>Older cards printed with a full warranty code (ROLL NO-7 digits-letters) are accepted too.</small>}
      <p />
      <button className={styles.button} disabled={!validCardCode(typed.trim())}>Check ROLL NO</button>
    </form>}

    {info && <>{card}
      {embedded && <p><button type="button" className={styles.linkButton} onClick={() => reset(false)}>← Use a different ROLL NO</button></p>}
      {!info.released && <p role="status" className={styles.error}>This product has not been released for customer activation yet. Please contact your seller. Your warranty card has not been used.</p>}
      {checked && !user && <PortalSignIn smsAvailable={info.smsAvailable} onSignedIn={signedIn => { onUser(signedIn); void open(token); }}
        intro={info.activated ? "Sign in with the mobile used for the first vehicle to see whether this roll has film left." : "Sign in with your mobile number. We send you a code by SMS; the warranty is registered to this mobile."} />}
      {user && !user.phone && <p role="status" className={styles.error}>Your account has no verified mobile number yet. Add one in <Link href="/account#profile">your profile</Link> first — warranty cards are registered to a mobile number.</p>}
      {!info.activated && !info.canRegister && <p role="status">This ROLL NO is not in your account yet. Ask your seller to transfer it to your mobile; then you can register the warranty.</p>}
      {user?.phone && info.activated && !info.canRegister && <p role="status">This roll is registered to another installer account. <Link href="/account#warranty">View my warranties</Link></p>}
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
        <label className={styles.meters}>Film used (m, optional)<input type="number" inputMode="decimal" min="0.01" step="0.01" value={usedLength} onChange={event => setUsedLength(event.target.value)} /></label>
        <fieldset><legend>{info.type === "tint" ? "Installed windows" : "Protected panels"}</legend>{info.type === "tint" ? <CarWindows value={areas} onChange={setAreas} /> : <div className={styles.areas}>{panels.map(area => <label key={area}><input type="checkbox" checked={areas.includes(area)} onChange={event => setAreas(current => event.target.checked ? [...current, area] : current.filter(item => item !== area))} />{area.replaceAll("-", " ")}</label>)}</div>}</fieldset>
        {installer && <PhotoPicker value={photos} onChange={setPhotos} disabled={busy} />}
        <button className={styles.button} type="submit" disabled={busy || !info.released}>{busy ? (installer ? "Uploading…" : "Checking…") : installer ? "Send for review" : "Check & register warranty"}</button>
      </form>}
    </>}
  </>;
}
