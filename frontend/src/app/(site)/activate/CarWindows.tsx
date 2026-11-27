"use client";

import { useState } from "react";
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

/** Shortest film length (cm) each glass takes, same rule as the server. The meters used must cover the sum. */
export const MIN_GLASS_LENGTH: Record<string, number> = {
  windshield: 100, "left-front": 80, "right-front": 80, "left-rear": 80, "right-rear": 80, rear: 100, sunroof: 0,
};
/** The windshield needs film at least this wide (cm). */
export const WINDSHIELD_MIN_WIDTH = 100;
/** Least film any window-film installation uses (four side windows), same as the server. */
export const MIN_FILM_USED_M = 3.2;
/** Selected when a window-film roll opens: the four side windows. */
export const DEFAULT_WINDOWS = ["left-front", "right-front", "left-rear", "right-rear"];
/** Why the windshield can't be picked for a roll this wide, or null. */
export const windshieldProblem = (rollWidthCm: number | null | undefined, t: (key: string, vars?: Record<string, string | number>) => string) =>
  rollWidthCm != null && rollWidthCm < WINDSHIELD_MIN_WIDTH
    ? t("This roll is {w} cm wide. You cannot register the windshield: it needs film at least {min} cm wide.", { w: rollWidthCm, min: WINDSHIELD_MIN_WIDTH }) : null;
const GLASS_LABELS: Record<string, string> = Object.fromEntries(glass.map(([id, label]) => [id, label]));
/** English name of any glass or body panel id, to pass through t(). */
export const AREA_LABELS: Record<string, string> = { ...GLASS_LABELS, ...PANEL_LABELS };

/** Why the film used can't cover the selected glass, or null. Shown only when the form is sent. */
export function filmLengthProblem(selected: string[], usedM: string, rollWidthCm: number | null | undefined, t: (key: string, vars?: Record<string, string | number>) => string) {
  const narrow = selected.includes("windshield") ? windshieldProblem(rollWidthCm, t) : null;
  if (narrow) return narrow;
  const used = Number(usedM);
  if (!usedM.trim() || !(used > 0)) return t("Enter the film used in meters.");
  const needed = Math.max(MIN_FILM_USED_M, selected.reduce((sum, id) => sum + (MIN_GLASS_LENGTH[id] ?? 0), 0) / 100);
  if (used < needed) return t("You cannot register {n} windows with {m} m of film. They need at least {need} m.", { n: selected.length, m: used, need: needed });
  return null;
}

/** rollWidthCm: the windshield is refused right on the tap when the roll is too narrow for it, with the reason under the map. */
export default function CarWindows({ value, onChange, rollWidthCm }: {
  value: string[]; onChange: (next: string[]) => void; rollWidthCm?: number | null;
}) {
  const t = useT();
  const shown = glass;
  const narrow = windshieldProblem(rollWidthCm, t);
  const [warn, setWarn] = useState("");
  const pick = (next: string[]) => {
    const refused = !!narrow && next.includes("windshield") && !value.includes("windshield");
    setWarn(refused ? narrow : "");
    onChange(refused ? next.filter(id => id !== "windshield") : next);
  };
  const toggle = (id: string) => pick(value.includes(id) ? value.filter(item => item !== id) : [...value, id]);
  const all = shown.map(([id]) => id);
  const sides = DEFAULT_WINDOWS;
  const selected = shown.filter(([id]) => value.includes(id));
  return <div className={styles.wrap}>
    <div className={styles.shortcuts}>
      <button type="button" onClick={() => pick(all)}>{t("All {n} windows", { n: all.length })}</button>
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
    {warn && <p role="alert" className={styles.warn}>{warn}</p>}
  </div>;
}
