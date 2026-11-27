"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { CountryCode } from "libphonenumber-js/mobile";
import { countries, findCountry, flagUrl, SUGGESTED, type Country } from "@/lib/countries";
import { useLang, useT } from "@/lib/i18n/client";
import styles from "./CountrySelect.module.css";

export const Flag = ({ code, size = 20 }: { code: string; size?: number }) =>
  // eslint-disable-next-line @next/next/no-img-element
  <img className={styles.flag} src={flagUrl(code)} width={size} height={Math.round(size * 2 / 3)} alt="" aria-hidden="true" loading="lazy" />;

/**
 * Searchable country picker: flag, name in the page's language and the dialling code.
 * `compact` shows only the flag and +code, for the front of a mobile number field.
 */
export default function CountrySelect({ value, onChange, compact, label, id }: {
  value: CountryCode | null; onChange: (code: CountryCode) => void; compact?: boolean; label?: string; id?: string;
}) {
  const t = useT();
  const lang = useLang();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const selected = findCountry(value);

  const options = useMemo(() => {
    const all = countries();
    const q = query.trim().toLowerCase().replace(/^\+/, "");
    const byName = (a: Country, b: Country) => a.names[lang].localeCompare(b.names[lang], lang);
    if (!q) {
      const top = SUGGESTED.map(c => all.find(x => x.code === c)!).filter(Boolean);
      return [...top, ...all.filter(c => !SUGGESTED.includes(c.code)).sort(byName)];
    }
    return all.filter(c => c.dial.startsWith(q) || c.code.toLowerCase() === q || Object.values(c.names).some(n => n.toLowerCase().includes(q))).sort(byName);
  }, [query, lang]);

  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const close = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  useEffect(() => { list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active]);

  const choose = (c: Country) => { onChange(c.code); setOpen(false); setQuery(""); };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(i => Math.min(i + 1, options.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (options[active]) choose(options[active]); }
    else if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
  };

  return <div ref={root} className={`${styles.root} ${compact ? styles.compact : ""}`}>
    <button type="button" id={id} className={styles.trigger} aria-haspopup="listbox" aria-expanded={open} aria-label={label}
      onClick={() => { setOpen(o => !o); setActive(0); setQuery(""); }}>
      {selected ? <>
        <Flag code={selected.code} />
        {!compact && <span className={styles.name}>{selected.names[lang]}</span>}
        <span className={styles.dial} dir="ltr">+{selected.dial}</span>
      </> : <span className={styles.placeholder}>{compact ? "+" : t("Choose a country")}</span>}
      <span aria-hidden="true" className={styles.caret}>▾</span>
    </button>
    {open && <div className={styles.popover}>
      <input ref={search} className={styles.search} value={query} placeholder={t("Search country or code…")} aria-label={t("Search country or code…")}
        role="combobox" aria-expanded="true" aria-controls={listId} aria-activedescendant={options[active] ? `${listId}-${options[active].code}` : undefined}
        onChange={e => { setQuery(e.target.value); setActive(0); }} onKeyDown={onKey} />
      <ul ref={list} id={listId} role="listbox" className={styles.list}>
        {options.map((c, i) => <li key={c.code} id={`${listId}-${c.code}`} data-index={i} role="option" aria-selected={c.code === value}
          className={`${styles.option} ${i === active ? styles.active : ""} ${!query && i === SUGGESTED.length - 1 ? styles.divider : ""}`}
          onMouseEnter={() => setActive(i)} onMouseDown={e => { e.preventDefault(); choose(c); }}>
          <Flag code={c.code} /><span className={styles.name}>{c.names[lang]}</span><span className={styles.dial} dir="ltr">+{c.dial}</span>
        </li>)}
        {!options.length && <li className={styles.empty}>{t("No country found")}</li>}
      </ul>
    </div>}
  </div>;
}
