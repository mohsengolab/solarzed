"use client";

import { useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import { inspectBox, sendActivationOtp, completeActivation, ActivationInfo, WarrantyPublic } from "@/lib/api";
import styles from "./activate.module.css";

const windows = ["left-front", "right-front", "left-rear", "right-rear", "rear"];
const panels = ["hood", "front-bumper", "roof", "trunk", "rear-bumper", "left-front-fender", "right-front-fender", "left-doors", "right-doors", "left-rear-quarter", "right-rear-quarter", "mirrors"];
const fields = [
  ["owner", "Full name", 200], ["phone", "Mobile number", 30], ["make", "Vehicle make", 100], ["model", "Vehicle model", 100],
  ["vin", "VIN (17 characters)", 20], ["plate", "Licence plate", 20], ["installed", "Installation date", 10],
  ["invoiceNumber", "Invoice number", 60], ["installer", "Installer / shop", 200], ["sellerName", "Seller name", 200], ["sellerPhone", "Seller mobile", 30],
] as const;
const initial = { owner: "", phone: "", make: "", model: "", vin: "", plate: "", installed: "", invoiceNumber: "", installer: "", sellerName: "", sellerPhone: "" };

export default function ActivationPage() {
  const [token, setToken] = useState("");
  const [info, setInfo] = useState<ActivationInfo | null>(null);
  const [form, setForm] = useState(initial);
  const [areas, setAreas] = useState<string[]>([]);
  const [challenge, setChallenge] = useState("");
  const [otp, setOtp] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<WarrantyPublic | null>(null);
  useEffect(() => {
    const code = window.location.hash.slice(1);
    if (!/^[a-f0-9]{64}$/i.test(code)) { Promise.resolve().then(() => setError("Scan the QR code on your Solarzed box to open the activation form.")); return; }
    inspectBox(code).then(data => { setToken(code); setInfo(data); }).catch(ex => setError(ex instanceof Error ? ex.message : "Could not read this label."));
  }, []);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!info) return;
    if (!areas.length) { setError("Select the installed windows or protected panels."); return; }
    setBusy(true); setError("");
    try {
      const response = await sendActivationOtp(token, form.phone);
      setChallenge(response.challengeId); setOtp(""); setCooldown(response.retryAfterSeconds);
    } catch (ex) { setError(ex instanceof Error ? ex.message : "Could not send the verification code."); }
    finally { setBusy(false); }
  }
  async function activate() {
    if (!info) return; setBusy(true); setError("");
    try {
      const registration = { ...form, type: info.type, filmSerial: info.id, windows: info.type === "tint" ? areas : undefined, panels: info.type === "ppf" ? areas : undefined };
      setResult(await completeActivation(token, challenge, otp, registration));
      window.history.replaceState(null, "", window.location.pathname);
    } catch (ex) { setError(ex instanceof Error ? ex.message : "Activation failed."); }
    finally { setBusy(false); }
  }

  return <div className={styles.page}>
    <header><Link href="/">SOLAR<span>ZED</span></Link><small>DIGITAL WARRANTY</small></header>
    <main className={styles.card}>
      {result ? <section aria-live="polite"><span className={styles.eyebrow}>MOBILE VERIFIED</span><h1>Your warranty is active</h1><p>Keep your warranty number for future reference.</p><code className={styles.code}>{result.code}</code><dl><dt>Product serial</dt><dd>{info?.id}</dd><dt>Vehicle</dt><dd>{result.make} {result.model}</dd><dt>Film warranty ends</dt><dd>{result.coverage?.filmEnds}</dd>{result.coverage?.installEnds && <><dt>Installation warranty ends</dt><dd>{result.coverage.installEnds}</dd></>}</dl><Link className={styles.button} href={`/warranty?code=${encodeURIComponent(result.code)}`}>View warranty</Link></section>
      : <><span className={styles.eyebrow}>SCAN · VERIFY · ACTIVATE</span><h1>Activate your Solarzed warranty</h1>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {!info && !error && <p>Reading your box label…</p>}
      {info?.activated ? <div><h2>This box is already activated</h2><p>A box code can activate one warranty. You can find your existing warranty using your mobile number.</p><Link href="/warranty" className={styles.button}>Find my warranty</Link></div>
      : info && <><div className={styles.product}><b>{info.product} · {info.type === "tint" ? "Window film" : "Paint protection film"}</b><code>{info.id}</code><span>{info.filmYears}-year film warranty{info.installYears ? ` · ${info.installYears}-year installation warranty` : ""}</span></div>
      {!info.smsAvailable && <p role="status" className={styles.error}>Mobile verification is temporarily unavailable. Please contact Solarzed support. Your box code has not been used.</p>}
      {!info.released && <p role="status" className={styles.error}>This product has not been released for customer activation yet. Please contact your seller. Your box code has not been used.</p>}
      <form onSubmit={send}>
        <p>Enter your details, then verify the code sent to your mobile. Coverage starts from the installation date under the approved product terms.</p>
        <div className={styles.grid}>{fields.map(([key, label, max]) => <label key={key}>{label}<input required maxLength={max} value={form[key]} type={key === "installed" ? "date" : key.includes("Phone") || key === "phone" ? "tel" : "text"} autoComplete={key === "owner" ? "name" : key === "phone" ? "tel" : "off"} onChange={event => { setForm(value => ({ ...value, [key]: event.target.value })); if (key === "phone") { setChallenge(""); setOtp(""); } }} /></label>)}</div>
        <fieldset><legend>{info.type === "tint" ? "Installed windows" : "Protected panels"}</legend><div className={styles.areas}>{(info.type === "tint" ? windows : panels).map(area => <label key={area}><input type="checkbox" checked={areas.includes(area)} onChange={event => setAreas(current => event.target.checked ? [...current, area] : current.filter(item => item !== area))} />{area.replaceAll("-", " ")}</label>)}</div></fieldset>
        <button className={styles.button} type="submit" disabled={busy || !info.smsAvailable || !info.released || cooldown > 0}>{cooldown > 0 ? `Resend available in ${cooldown}s` : challenge ? "Resend verification code" : "Send verification code"}</button>
        {challenge && <div className={styles.verification}><p role="status">Verification code requested for your mobile. It expires in 5 minutes.</p><label>SMS verification code<input value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} /></label><button className={styles.button} type="button" onClick={activate} disabled={busy || otp.length !== 6}>{busy ? "Verifying…" : "Verify mobile & activate warranty"}</button></div>}
      </form></>}
      </>}
    </main><footer>© SOLARZED · <Link href="/coverage">Warranty policy</Link></footer>
  </div>;
}
