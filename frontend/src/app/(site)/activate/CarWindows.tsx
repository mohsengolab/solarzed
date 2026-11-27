"use client";

import { useT } from "@/lib/i18n/client";
import styles from "./carWindows.module.css";

// Top view of a car; tap each glass the film was installed on. Front of the car is at the top.
const glass = [
  ["windshield", "Windshield", styles.windshield],
  ["left-front", "Left front", styles.lf],
  ["right-front", "Right front", styles.rf],
  ["left-rear", "Left rear", styles.lr],
  ["right-rear", "Right rear", styles.rr],
  ["rear", "Rear windshield", styles.rear],
  ["sunroof", "Sunroof", styles.sunroof],
] as const;

/** Names of the body panels a paint protection film can cover. */
export const PANEL_LABELS: Record<string, string> = {
  hood: "Hood", "front-bumper": "Front bumper", roof: "Roof", trunk: "Trunk", "rear-bumper": "Rear bumper",
  "left-front-fender": "Left front fender", "right-front-fender": "Right front fender", "left-doors": "Left doors",
  "right-doors": "Right doors", "left-rear-quarter": "Left rear quarter", "right-rear-quarter": "Right rear quarter", mirrors: "Mirrors",
};

/** Smallest film cut accepted per glass, in cm (same rule as the server). 0 = no minimum. */
export const MIN_GLASS_SIZE: Record<string, { length: number; width: number }> = {
  windshield: { length: 100, width: 100 },
  "left-front": { length: 80, width: 50 }, "right-front": { length: 80, width: 50 },
  "left-rear": { length: 80, width: 50 }, "right-rear": { length: 80, width: 50 },
  rear: { length: 100, width: 0 },
  sunroof: { length: 0, width: 0 },
};
export type GlassSizes = Record<string, { length: string; width: string }>;
const GLASS_LABELS: Record<string, string> = Object.fromEntries(glass.map(([id, label]) => [id, label]));
/** English name of any glass or body panel id, to pass through t(). */
export const AREA_LABELS: Record<string, string> = { ...GLASS_LABELS, ...PANEL_LABELS };

/** Why the entered film sizes can't be registered, or null when every selected glass meets its minimum. */
export function glassSizeProblem(selected: string[], sizes: GlassSizes, t: (key: string, vars?: Record<string, string | number>) => string) {
  for (const id of selected) {
    const name = t(GLASS_LABELS[id] ?? id);
    const length = Number(sizes[id]?.length), width = Number(sizes[id]?.width);
    if (!(length > 0) || !(width > 0)) return t("Enter the film length and width for {name}.", { name });
    const min = MIN_GLASS_SIZE[id];
    if (min && (length < min.length || width < min.width))
      return min.width > 0
        ? t("You cannot register this: the film for {name} must be at least {l} cm long and {w} cm wide.", { name, l: min.length, w: min.width })
        : t("You cannot register this: the film for {name} must be at least {l} cm long.", { name, l: min.length });
  }
  return null;
}

export default function CarWindows({ value, onChange, sizes, onSizes }: {
  value: string[]; onChange: (next: string[]) => void; sizes: GlassSizes; onSizes: (next: GlassSizes) => void;
}) {
  const t = useT();
  const shown = glass;
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter(item => item !== id) : [...value, id]);
  const all = shown.map(([id]) => id);
  const sides = ["left-front", "right-front", "left-rear", "right-rear"];
  const selected = shown.filter(([id]) => value.includes(id));
  const setSize = (id: string, key: "length" | "width", v: string) => onSizes({ ...sizes, [id]: { ...(sizes[id] ?? { length: "", width: "" }), [key]: v } });
  return <div className={styles.wrap}>
    <div className={styles.shortcuts}>
      <button type="button" onClick={() => onChange(all)}>{t("All {n} windows", { n: all.length })}</button>
      <button type="button" onClick={() => onChange(sides)}>{t("Both sides")}</button>
      <button type="button" onClick={() => onChange([])}>{t("Clear")}</button>
    </div>
    <div className={styles.map}>
      <div className={styles.labels} aria-hidden="true">
        <span className={styles.labelLf}>{t("Left front")}</span><span className={styles.labelRf}>{t("Right front")}</span>
        <span className={styles.labelLr}>{t("Left rear")}</span><span className={styles.labelRr}>{t("Right rear")}</span>
      </div>
      <span className={styles.front}>↑ {t("FRONT OF VEHICLE")}</span>
      <svg viewBox="0 0 400 640" aria-hidden="true">
        <defs><linearGradient id="car-body" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#e5f0f5" /><stop offset=".5" stopColor="#fff" /><stop offset="1" stopColor="#c4d8e5" /></linearGradient></defs>
        <ellipse cx="200" cy="335" rx="147" ry="279" fill="#102a430a" />
        <rect x="62" y="165" width="20" height="80" rx="9" fill="#102a43" /><rect x="318" y="165" width="20" height="80" rx="9" fill="#102a43" />
        <rect x="62" y="435" width="20" height="80" rx="9" fill="#102a43" /><rect x="318" y="435" width="20" height="80" rx="9" fill="#102a43" />
        <path d="M120 62 Q200 33 280 62 Q321 95 320 165 L324 478 Q320 557 281 578 Q200 602 119 578 Q80 557 76 478 L80 165 Q79 95 120 62Z" fill="url(#car-body)" stroke="#8daabc" strokeWidth="2" />
        <rect x="143" y="266" width="114" height="164" rx="28" fill="#e6eff4" stroke="#b9cedb" />
        <path d="M120 98 Q200 75 280 98 M115 548 Q200 574 285 548" fill="none" stroke="#afc9d7" strokeWidth="2" />
        <path d="M101 111 L121 104 M279 104 L299 111" stroke="#23c5ce" strokeWidth="8" strokeLinecap="round" />
      </svg>
      {shown.map(([id, label, cls]) => {
        const on = value.includes(id);
        return <button key={id} type="button" className={`${styles.glass} ${cls}`} aria-label={t("{name} window", { name: t(label) })} aria-pressed={on} onClick={() => toggle(id)}>
          <span>{t(label)}</span><b>{on ? "✓" : "+"}</b>
        </button>;
      })}
    </div>
    <p className={styles.summary} aria-live="polite"><b>{t("{n} of {total} windows selected", { n: selected.length, total: shown.length })}</b>{selected.length > 0 && <span>{selected.map(([, label]) => t(label)).join(" · ")}</span>}</p>
    {selected.length > 0 && <div className={styles.sizes}>
      <p className={styles.sizesHead}>{t("Film size for each glass (cm)")}</p>
      {selected.map(([id, label]) => {
        const min = MIN_GLASS_SIZE[id];
        const length = Number(sizes[id]?.length), width = Number(sizes[id]?.width);
        const short = (!!sizes[id]?.length && length < min.length) || (!!sizes[id]?.width && width < min.width);
        return <div key={id} className={`${styles.sizeRow} ${short ? styles.sizeShort : ""}`}>
          <b>{t(label)}</b>
          <label>{t("Length")}<input type="number" inputMode="decimal" dir="ltr" min={min.length || 1} max={1000} step="any" required value={sizes[id]?.length ?? ""} onChange={event => setSize(id, "length", event.target.value)} /></label>
          <label>{t("Width")}<input type="number" inputMode="decimal" dir="ltr" min={min.width || 1} max={1000} step="any" required value={sizes[id]?.width ?? ""} onChange={event => setSize(id, "width", event.target.value)} /></label>
          <small>{min.width ? t("Min {l} × {w} cm", { l: min.length, w: min.width }) : min.length ? t("Min length {l} cm", { l: min.length }) : t("No minimum")}</small>
        </div>;
      })}
    </div>}
  </div>;
}
