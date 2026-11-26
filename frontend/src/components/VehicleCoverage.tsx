import css from "./VehicleCoverage.module.css";

/** One warranty on a vehicle: each roll used on the car is its own warranty with its own glasses and coverage dates. */
export interface CoverageItem {
  code: string;
  type: "tint" | "ppf";
  /** Product name, or the ROLL NO when the product is not known. */
  film?: string | null;
  installed: string;
  areas: string[];
  status: "pending" | "active" | "rejected";
  coverage?: { filmEnds?: string | null; installEnds?: string | null } | null;
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
  const rows = parts.map(([id, label]) => {
    const on = items.filter(w => w.areas.includes(id))
      .sort((a, b) => RANK[a.status] - RANK[b.status] || b.installed.localeCompare(a.installed));
    return { id, label, current: on[0], earlier: on.length - 1 };
  }).filter(r => r.current || (uncovered && r.id !== "sunroof"));
  return <ul className={css.rows}>{rows.map(({ id, label, current: w, earlier }) => <li key={id} className={css.row} data-status={w?.status ?? "none"}>
    <span className={css.part}>{label}</span>
    {w ? <>
      <span className={css.film}>
        <b>{w.film ?? (w.type === "ppf" ? "Paint protection film" : "Window film")}</b>
        <small>Warranty <code dir="ltr">{w.code}</code> · installed {w.installed}{earlier > 0 && ` · ${earlier} earlier`}</small>
      </span>
      <span className={css.dates}>
        {w.status === "active"
          ? <><small>Film until <b>{w.coverage?.filmEnds ?? "—"}</b></small><small>Installation until <b>{w.coverage?.installEnds ?? "—"}</b></small></>
          : <small>{w.status === "pending" ? "Starts once Solarzed approves it" : "Contact your installer"}</small>}
      </span>
      <span className={css.badge}>{STATUS[w.status]}</span>
    </> : <span className={css.none}>No Solarzed warranty</span>}
  </li>)}</ul>;
}

/** Which warranty covers each glass (and each body panel) of one vehicle. */
export default function VehicleCoverage({ items, title }: { items: CoverageItem[]; title?: string }) {
  const tint = items.filter(w => w.type === "tint");
  const ppf = items.filter(w => w.type === "ppf");
  const films = new Set(items.map(w => w.film ?? w.code)).size;
  return <section className={css.box} aria-label={title ?? "Coverage by glass"}>
    {title && <h3 className={css.title}>{title}</h3>}
    <p className={css.lead}>{items.length} warrant{items.length === 1 ? "y" : "ies"}{films > 1 ? ` · ${films} different films` : ""} on this vehicle. Each glass shows the warranty that covers it.</p>
    {tint.length > 0 && <><h4 className={css.group}>Windows</h4><Rows items={tint} parts={WINDOWS} uncovered /></>}
    {ppf.length > 0 && <><h4 className={css.group}>Body panels</h4><Rows items={ppf} parts={PANELS} uncovered={false} /></>}
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
