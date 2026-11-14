"use client";

import { useEffect, useState, FormEvent } from "react";
import { portalLogin, portalSendCode, PortalUser } from "@/lib/api";
import styles from "@/app/(site)/activate/activate.module.css";

/** Mobile number + SMS code sign-in for representatives, shops and customers. */
export default function PortalSignIn({ onSignedIn, intro, smsAvailable = true }: {
  onSignedIn: (user: PortalUser) => void; intro?: string; smsAvailable?: boolean;
}) {
  const [phone, setPhone] = useState("");
  const [challenge, setChallenge] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function send(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await portalSendCode(phone);
      setChallenge(result.challengeId); setSentTo(result.phone); setCode(""); setCooldown(result.retryAfterSeconds);
    } catch (ex) { setError(ex instanceof Error ? ex.message : "Could not send the verification code."); }
    finally { setBusy(false); }
  }

  async function verify(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { onSignedIn(await portalLogin(challenge, code)); }
    catch (ex) { setError(ex instanceof Error ? ex.message : "Sign-in failed."); }
    finally { setBusy(false); }
  }

  return <div>
    {intro && <p>{intro}</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {!smsAvailable && <p role="status" className={styles.error}>Mobile verification is temporarily unavailable. Please contact Solarzed support.</p>}
    <form onSubmit={send}>
      <label>Mobile number
        <input type="tel" dir="ltr" required maxLength={20} autoComplete="tel" inputMode="tel" placeholder="09…" value={phone}
          onChange={event => { setPhone(event.target.value); setChallenge(""); setCode(""); }} />
      </label>
      <p />
      <button className={styles.button} type="submit" disabled={busy || !smsAvailable || cooldown > 0 || !phone.trim()}>
        {cooldown > 0 ? `Resend available in ${cooldown}s` : challenge ? "Resend code" : "Send sign-in code"}
      </button>
    </form>
    {challenge && <form className={styles.verification} onSubmit={verify}>
      <p role="status">A 6-digit code was sent to <b dir="ltr">{sentTo}</b>.</p>
      <label>SMS code
        <input value={code} onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric"
          autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} autoFocus />
      </label>
      <button className={styles.button} type="submit" disabled={busy || code.length !== 6}>{busy ? "Verifying…" : "Sign in"}</button>
    </form>}
  </div>;
}
