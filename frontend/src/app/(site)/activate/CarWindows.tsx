"use client";

import { useState } from "react";
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

export default function CarWindows({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const [hasSunroof, setHasSunroof] = useState(value.includes("sunroof"));
  const shown = glass.filter(([id]) => id !== "sunroof" || hasSunroof);
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter(item => item !== id) : [...value, id]);
  const all = shown.map(([id]) => id);
  const sides = ["left-front", "right-front", "left-rear", "right-rear"];
  const selected = shown.filter(([id]) => value.includes(id));
  const toggleSunroof = (on: boolean) => {
    setHasSunroof(on);
    if (!on) onChange(value.filter(item => item !== "sunroof"));
  };
  return <div className={styles.wrap}>
    <div className={styles.shortcuts}>
      <button type="button" onClick={() => onChange(all)}>All {all.length} windows</button>
      <button type="button" onClick={() => onChange(sides)}>Both sides</button>
      <button type="button" onClick={() => onChange([])}>Clear</button>
      <label className={styles.sunroofToggle}><input type="checkbox" checked={hasSunroof} onChange={event => toggleSunroof(event.target.checked)} />Vehicle has a sunroof</label>
    </div>
    <div className={styles.map}>
      <div className={styles.labels} aria-hidden="true">
        <span className={styles.labelLf}>Left front</span><span className={styles.labelRf}>Right front</span>
        <span className={styles.labelLr}>Left rear</span><span className={styles.labelRr}>Right rear</span>
      </div>
      <span className={styles.front}>↑ FRONT OF VEHICLE</span>
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
        return <button key={id} type="button" className={`${styles.glass} ${cls}`} aria-label={`${label} window`} aria-pressed={on} onClick={() => toggle(id)}>
          <span>{label}</span><b>{on ? "✓" : "+"}</b>
        </button>;
      })}
    </div>
    <p className={styles.summary} aria-live="polite"><b>{selected.length} of {shown.length} windows selected</b>{selected.length > 0 && <span>{selected.map(([, label]) => label).join(" · ")}</span>}</p>
  </div>;
}
