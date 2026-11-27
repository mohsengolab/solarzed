"use client";

import { useId } from "react";
import type { CountryCode } from "libphonenumber-js/mobile";
import { digits, examplePlaceholder, findCountry, isWrongMobile } from "@/lib/countries";
import { useLang, useT } from "@/lib/i18n/client";
import CountrySelect from "./CountrySelect";
import styles from "./CountrySelect.module.css";

/**
 * Mobile number field: the country (flag and +code) in front, the number behind it,
 * checked against that country's mobile numbering plan.
 */
export default function PhoneInput({ label, country, onCountry, value, onChange }: {
  label: string; country: CountryCode; onCountry: (code: CountryCode) => void; value: string; onChange: (national: string) => void;
}) {
  const t = useT();
  const lang = useLang();
  const id = useId();
  const bad = isWrongMobile(value, country);
  const name = findCountry(country)?.names[lang] ?? country;
  return <div className={styles.field}>
    <label htmlFor={id}>{label}</label>
    <div className={styles.phone} dir="ltr">
      <CountrySelect compact value={country} onChange={onCountry} label={t("Country code")} />
      <input id={id} type="tel" inputMode="tel" autoComplete="tel-national" maxLength={20} value={value}
        placeholder={examplePlaceholder(country)} aria-invalid={bad || undefined}
        onChange={e => onChange(digits(e.target.value))} />
    </div>
    {bad && <small className={`${styles.hint} ${styles.bad}`} role="alert">{t("This is not a valid mobile number for {country}.", { country: name })}</small>}
  </div>;
}
