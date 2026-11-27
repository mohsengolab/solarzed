"use client";

import type { FilmSpecs } from "@/lib/api";
import { useT } from "@/lib/i18n/client";
import FilmSpecsLine from "./FilmSpecs";
import css from "./VehicleCoverage.module.css";

/** One warranty on a vehicle: each roll used on the car is its own warranty with its own glasses and coverage dates. */
export interface CoverageItem {
  /** Opaque handle (never the warranty number). */
  ref: string;
  type: "tint" | "ppf";
  /** Product name, or the ROLL NO when the product is not known. */
  film?: string | null;
  installed: string;
  areas: string[];
  status: "pending" | "active" | "rejected";
  coverage?: { filmEnds?: string | null; installEnds?: string | null } | null;
  specs?: FilmSpecs | null;
}

const WINDOWS: [string, string][] = [
  ["windshield", "Windshield"], ["left-front", "Left front"], ["right-front", "Right front"],
  ["left-rear", "Left rear"], ["right-rear", "Right rear"], ["rear", "Rear windshield"], ["sunroof", "Sunroof"],
];
const PANELS: [string, string][] = [
  ["hood", "Hood"], ["front-bumper", "Front bumper"], ["roof", "Roof"], ["trunk", "Trunk"], ["rear-bumper", "Rear bumper"],
  ["left-front-fender", "Left front fender"], ["right-front-fender", "Right front fender"], ["left-doors", "Left doors"],
  ["right-doors", "Right doors"], ["left-rear-quarter", "Left rear quarter"], ["right-rear-quarter", "Right rear quarter"], ["mirrors", "Mirrors"],
];
const STATUS = { active: "Active", pending: "In review", rejected: "Not covered" } as const;
// An active warranty wins over one in review, which wins over a rejected one; then the newest installation.
const RANK = { active: 0, pending: 1, rejected: 2 } as const;

function Rows({ items, parts, uncovered }: { items: CoverageItem[]; parts: [string, string][]; uncovered: boolean }) {
  const t = useT();
  const rows = parts.map(([id, label]) => {
    const on = items.filter(w => w.areas.includes(id))
      .sort((a, b) => RANK[a.status] - RANK[b.status] || b.installed.localeCompare(a.installed));
    return { id, label, current: on[0], earlier: on.length - 1 };
  }).filter(r => r.current || (uncovered && r.id !== "sunroof"));
  return <ul className={css.rows}>{rows.map(({ id, label, current: w, earlier }) => <li key={id} className={css.row} data-status={w?.status ?? "none"}>
    <span className={css.part}>{t(label)}</span>
    {w ? <>
      <span className={css.film}>
        <b>{w.film ?? (w.type === "ppf" ? t("Paint protection film") : t("Window film"))}</b>
        <FilmSpecsLine specs={w.specs} className={css.specs} />
        <small>{t("installed {date}", { date: w.installed })}{earlier > 0 && ` · ${t("{n} earlier", { n: earlier })}`}</small>
      </span>
      <span className={css.dates}>
        {w.status === "active"
          ? <><small>{t("Film until")} <b>{w.coverage?.filmEnds ?? "—"}</b></small><small>{t("Installation until")} <b>{w.coverage?.installEnds ?? "—"}</b></small></>
          : <small>{w.status === "pending" ? t("Starts once Solarzed approves it") : t("Contact your installer")}</small>}
      </span>
      <span className={css.badge}>{t(STATUS[w.status])}</span>
    </> : <span className={css.none}>{t("No Solarzed warranty")}</span>}
  </li>)}</ul>;
}

/** Which warranty covers each glass (and each body panel) of one vehicle. */
export default function VehicleCoverage({ items, title }: { items: CoverageItem[]; title?: string }) {
  const t = useT();
  const tint = items.filter(w => w.type === "tint");
  const ppf = items.filter(w => w.type === "ppf");
  const films = new Set(items.map(w => w.film ?? w.ref)).size;
  return <section className={css.box} aria-label={title ?? t("Coverage by glass")}>
    {title && <h3 className={css.title}>{title}</h3>}
    <p className={css.lead}>{t(items.length === 1 ? "{n} warranty on this vehicle." : "{n} warranties on this vehicle.", { n: items.length })}{films > 1 ? ` ${t("{n} different films.", { n: films })}` : ""} {t("Each glass shows the warranty that covers it.")}</p>
    {tint.length > 0 && <><h4 className={css.group}>{t("Windows")}</h4><Rows items={tint} parts={WINDOWS} uncovered /></>}
    {ppf.length > 0 && <><h4 className={css.group}>{t("Body panels")}</h4><Rows items={ppf} parts={PANELS} uncovered={false} /></>}
  </section>;
}

/** Groups warranties by vehicle (VIN, make and model), newest installation first. */
export function byVehicle<T extends { vinMasked: string; make: string; model: string; installed: string }>(list: T[]) {
  const groups = new Map<string, T[]>();
  for (const w of [...list].sort((a, b) => b.installed.localeCompare(a.installed))) {
    const key = `${w.vinMasked}|${w.make}|${w.model}`.toUpperCase();
    groups.set(key, [...(groups.get(key) ?? []), w]);
  }
  return [...groups.values()];
}
