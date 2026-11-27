"use client";

import { useEffect, useState, FormEvent } from "react";
import { portalLogin, portalSendCode, PortalChannel, PortalUser } from "@/lib/api";
import { useT } from "@/lib/i18n/client";
import type { CountryCode } from "libphonenumber-js/mobile";
import { isValidMobile, toE164 } from "@/lib/countries";
import PhoneInput from "./PhoneInput";
import styles from "@/app/(site)/activate/activate.module.css";

/** Email codes (sign-in and adding an email) are switched off for now; the server refuses them too (Portal:EmailVerification). */
export const EMAIL_VERIFICATION = false;

/** Sign-in with mobile + SMS code or email + email code. Both use a one-time 6-digit code. */
export default function PortalSignIn({ onSignedIn, intro, smsAvailable = true, emailAvailable = EMAIL_VERIFICATION }: {
  onSignedIn: (user: PortalUser) => void; intro?: string; smsAvailable?: boolean; emailAvailable?: boolean;
}) {
  const t = useT();
  const [channel, setChannel] = useState<PortalChannel>("sms");
  const [identifier, setIdentifier] = useState("");
  const [country, setCountry] = useState<CountryCode>("IR");
  const target = channel === "sms" ? toE164(identifier, country) : identifier.trim();
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
      const result = await portalSendCode(target, channel);
      setChallenge(result.challengeId);
      setSentTo(result.phone ?? result.email ?? target);
      setCode(""); setCooldown(result.retryAfterSeconds);
    } catch (ex) { setError(ex instanceof Error ? t(ex.message) : t("Could not send the verification code.")); }
    finally { setBusy(false); }
  }

  async function verify(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { onSignedIn(await portalLogin(challenge, code)); }
    catch (ex) { setError(ex instanceof Error ? t(ex.message) : t("Sign-in failed.")); }
    finally { setBusy(false); }
  }

  const codeSent = channel === "email" ? t("A 6-digit code was sent to") : t("A 6-digit code was sent by SMS to");
  const channelAvailable = channel === "sms" ? smsAvailable : emailAvailable;

  return <div>
    {intro && <p>{intro}</p>}
    {emailAvailable && <div className={styles.channels} role="tablist" aria-label={t("Sign-in channel")}>
      <button type="button" role="tab" aria-selected={channel === "sms"} className={channel === "sms" ? styles.channelActive : styles.channel}
        onClick={() => { setChannel("sms"); setChallenge(""); setCode(""); setError(""); }}>{t("SMS · Mobile")}</button>
      {emailAvailable && <button type="button" role="tab" aria-selected={channel === "email"} className={channel === "email" ? styles.channelActive : styles.channel}
        onClick={() => { setChannel("email"); setChallenge(""); setCode(""); setError(""); }}>{t("Email")}</button>}
    </div>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {!channelAvailable && <p role="status" className={styles.error}>
      {channel === "sms" ? t("Mobile verification is temporarily unavailable. Please contact Solarzed support.") : t("Email verification is temporarily unavailable. Please sign in with your mobile number.")}
    </p>}
    <form onSubmit={send}>
      {channel === "sms"
        ? <PhoneInput label={t("Mobile number")} country={country} onCountry={code => { setCountry(code); setChallenge(""); setCode(""); }}
          value={identifier} onChange={value => { setIdentifier(value); setChallenge(""); setCode(""); }} />
        : <label>{t("Email address")}
          <input dir="ltr" required maxLength={254} autoComplete="email" inputMode="email" type="email"
            placeholder="you@example.com" value={identifier}
            onChange={event => { setIdentifier(event.target.value); setChallenge(""); setCode(""); }} />
        </label>}
      <p />
      <button className={styles.button} type="submit" disabled={busy || !channelAvailable || cooldown > 0 || (channel === "sms" ? !isValidMobile(identifier, country) : !identifier.trim())}>
        {cooldown > 0 ? t("Resend available in {n}s", { n: cooldown }) : challenge ? t("Resend code") : t("Send sign-in code")}
      </button>
    </form>
    {challenge && <form className={styles.verification} onSubmit={verify}>
      <p role="status">{codeSent} <b dir="ltr">{sentTo}</b>.</p>
      <label>{t("Verification code")}
        <input value={code} onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric"
          autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} autoFocus />
      </label>
      <button className={styles.button} type="submit" disabled={busy || code.length !== 6}>{busy ? t("Verifying…") : t("Sign in")}</button>
    </form>}
  </div>;
}
