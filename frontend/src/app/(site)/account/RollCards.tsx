"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { portalBox, type HeldBox, type RollDetail } from "@/lib/api";
import InstallationPhotos from "@/components/InstallationPhotos";
import { LOCALES, formatDate, type T } from "@/lib/i18n";
import { useLang, useT } from "@/lib/i18n/client";
import own from "./account.module.css";

const WARRANTY_STATUS = { active: "Active", pending: "In review", rejected: "Sent back" } as const;

/** Full length, meters used and meters left. Used falls back to length − left when installs recorded no meters. */
export function rollMeters(b: HeldBox) {
  const total = b.lengthM ?? null;
  const left = b.remainingM ?? (b.activatedAt ? null : total);
  const used = b.usedM ? b.usedM : total != null && left != null ? Math.max(0, +(total - left).toFixed(2)) : 0;
  return { total, left, used };
}

/** A bar of what is left on the roll, with "N m left of M m". */
function Meter({ box, t, n }: { box: HeldBox; t: T; n: (v: number) => string }) {
  const { total, left } = rollMeters(box);
  if (total == null && left == null) return <small className={own.muted}>{t("Length not recorded")}</small>;
  const pct = total && left != null ? Math.max(0, Math.min(100, (left / total) * 100)) : null;
  const low = pct != null && pct < 15;
  return <span className={own.meter}>
    <span><b className={low ? own.low : undefined}>{left != null ? t("{n} m", { n: n(left) }) : "—"}</b> <small>{total != null ? t("left of {n} m", { n: n(total) }) : t("left")}</small></span>
    {pct != null && <span className={own.bar} aria-hidden="true"><span className={low ? own.low : undefined} style={{ width: `${pct}%` }} /></span>}
  </span>;
}

/**
 * The rolls an account holds as cards. The checkbox picks a roll for a transfer; the card itself opens everything
 * about the roll: film and size, meters used and left, the vehicles it went on and how it reached the account.
 */
export default function RollCards({ rolls, phone, selected, onToggle, onToggleAll }: {
  rolls: HeldBox[]; phone: string; selected?: string[]; onToggle?: (id: string) => void; onToggleAll?: (on: boolean) => void;
}) {
  const t = useT();
  const lang = useLang();
  const n = (v: number) => v.toLocaleString(LOCALES[lang], { maximumFractionDigits: 2 });
  const date = (v: string | null | undefined) => formatDate(lang, v ?? null);
  const [open, setOpen] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, RollDetail | { error: string }>>({});

  const toggleOpen = (id: string) => {
    const next = open === id ? null : id;
    setOpen(next);
    if (next && (!details[next] || "error" in details[next]))
      portalBox(next).then(d => setDetails(m => ({ ...m, [next]: d })))
        .catch(ex => setDetails(m => ({ ...m, [next]: { error: ex instanceof Error ? t(ex.message) : t("Could not load this roll.") } })));
  };
  const pickable = rolls.filter(b => !b.void && !b.activatedAt).map(b => b.id);
  const allOn = !!selected && pickable.length > 0 && pickable.every(id => selected.includes(id));

  return <>
    {onToggleAll && pickable.length > 0 && <label className={own.selectAll}>
      <input type="checkbox" checked={allOn} onChange={e => onToggleAll(e.target.checked)} /> {t("Select all rolls on this page")}
    </label>}
    <ul className={own.cards}>{rolls.map(box => {
      const picked = !!selected?.includes(box.id);
      const expanded = open === box.id;
      const detail = details[box.id];
      const canPick = !!onToggle && !box.void && !box.activatedAt;
      return <li key={box.id} className={`${own.item} ${own.car} ${own.rollCard} ${picked ? own.rollPicked : ""}`}>
        <div className={own.rollRow}>
          {onToggle && <input type="checkbox" className={own.rollCheck} aria-label={t("Select {id}", { id: box.id })}
            disabled={!canPick} checked={picked} onChange={() => onToggle(box.id)} />}
          <button type="button" className={own.carHead} aria-expanded={expanded} onClick={() => toggleOpen(box.id)}>
            <span className={own.itemMain}>
              <b><code dir="ltr">{box.id}</code><span className={own.badge}>{box.type === "ppf" ? "PPF" : t("Window film")}</span>
                {box.void && <span className={`${own.status} ${own.s_rejected}`}>{t("Void")}</span>}
                {box.activatedAt && <span className={`${own.status} ${own.s_active}`}>{t("In use")}</span>}</b>
              <span className={own.rollName}>{box.productName ?? box.product}{box.productName && <small dir="ltr"> · {box.product}</small>}</span>
              <small>{[box.widthCm != null ? t("{n} cm wide", { n: n(box.widthCm) }) : null, rollYearsText(t, box),
                box.installs ? t("{n} installation(s)", { n: box.installs }) : null].filter(Boolean).join(" · ")}</small>
            </span>
            <span className={own.itemSide}><Meter box={box} t={t} n={n} /></span>
            <span className={own.chevron} aria-hidden="true">{expanded ? "−" : "+"}</span>
          </button>
        </div>
        {expanded && <div className={own.carBody}>
          {box.activatedAt && box.rollId && <RollQr serial={box.rollId} t={t} />}
          <RollFacts box={box} t={t} n={n} date={date} />
          {!detail ? <p className={own.muted}>{t("Loading…")}</p>
            : "error" in detail ? <p role="alert" className={own.reason}>{detail.error}</p>
            : <>
              <h3 className={own.subhead}>{t("Installations from this roll")}</h3>
              {!detail.installs.length ? <p className={own.muted}>{t("Not used on a vehicle yet.")}</p>
                : <ul className={own.rolls}>{detail.installs.map(({ warranty: w, ownerPhoneMasked, photos }) => <li key={w.ref} className={own.roll}>
                  <div className={own.rollHead}>
                    <b>{w.make} {w.model} <span className={own.plate} dir="ltr">{w.plate}</span></b>
                    <span className={`${own.status} ${own[`s_${w.status}`]}`}>{t(WARRANTY_STATUS[w.status as keyof typeof WARRANTY_STATUS] ?? w.statusLabel)}</span>
                  </div>
                  <dl className={own.facts}>
                    <dt>{t("Installed")}</dt><dd>{date(w.installed)}</dd>
                    <dt>{t("Meters used")}</dt><dd>{w.usedLengthM != null ? t("{n} m", { n: n(w.usedLengthM) }) : "—"}</dd>
                    <dt>{t("Film warranty")}</dt><dd>{w.coverage?.filmEnds ? t("until {date}", { date: date(w.coverage.filmEnds) }) : "—"}</dd>
                    {w.coverage?.installEnds && <><dt>{t("Installation warranty")}</dt><dd>{t("until {date}", { date: date(w.coverage.installEnds) })}</dd></>}
                    <dt>{t("Customer")}</dt><dd dir="ltr">{ownerPhoneMasked}</dd>
                    {w.areas.length > 0 && <><dt>{t("Areas")}</dt><dd>{w.areas.length}</dd></>}
                  </dl>
                  {photos > 0 && <InstallationPhotos reference={w.ref} />}
                </li>)}</ul>}
              {detail.history.length > 0 && <>
                <h3 className={own.subhead}>{t("History")}</h3>
                <ul className={own.timeline}>{detail.history.map(h => <li key={h.id}>
                  <time>{date(h.at)}</time>
                  <span>{h.note === "Warranty activated" ? t("First used on a vehicle")
                    : h.toPhone === phone ? <>{t("Received from")} <b>{h.fromHolder ?? h.fromPhone ?? t("Central warehouse")}</b></>
                    : <>{t("Transferred to")} <b>{h.toHolder ?? h.toPhone ?? t("Central warehouse")}</b></>}
                    {h.note && h.note !== "Warranty activated" && <small> · {h.note}</small>}</span>
                </li>)}</ul>
              </>}
            </>}
        </div>}
      </li>;
    })}</ul>
  </>;
}

const rollYearsText = (t: T, b: HeldBox) => [b.filmYears ? t("Film {n} yr", { n: b.filmYears }) : null, b.installYears ? t("Install {n} yr", { n: b.installYears }) : null]
  .filter(Boolean).join(" · ") || null;

/** The warranty card's QR (it holds the roll's Serial Number), shown once the roll was activated on a vehicle. */
function RollQr({ serial, t }: { serial: string; t: T }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(serial, { errorCorrectionLevel: "M", margin: 4, scale: 8 }).then(url => { if (live) setSrc(url); }).catch(() => undefined);
    return () => { live = false; };
  }, [serial]);
  return <div className={own.rollQr}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {src ? <img src={src} width={132} height={132} alt={t("QR code of {id}", { id: serial })} /> : <span className={own.qrBlank} />}
    <div>
      <small>{t("Serial Number")}</small>
      <code dir="ltr">{serial}</code>
      <p className={own.muted}>{t("The QR code on this roll's warranty card. Scan it to register another vehicle from this roll.")}</p>
      {src && <a className={own.ghost} href={src} download={`${serial}.png`}>{t("Download QR")}</a>}
    </div>
  </div>;
}

/** Everything recorded about the roll itself. */
function RollFacts({ box, t, n, date }: { box: HeldBox; t: T; n: (v: number) => string; date: (v: string | null | undefined) => string }) {
  const { total, left, used } = rollMeters(box);
  const pct = (v: number | null | undefined) => v != null ? `${n(v)}%` : null;
  const rows: [string, string | null][] = [
    ["ROLL NO", box.id],
    [t("Product"), [box.productName, box.product].filter(Boolean).join(" · ")],
    [t("Type"), box.type === "ppf" ? "PPF" : t("Window film")],
    [t("Width"), box.widthCm != null ? t("{n} cm", { n: n(box.widthCm) }) : null],
    [t("Roll length"), total != null ? t("{n} m", { n: n(total) }) : null],
    [t("Meters used"), total != null || used ? t("{n} m", { n: n(used) }) : null],
    [t("Meters left"), left != null ? t("{n} m", { n: n(left) }) : null],
    [t("Film warranty"), box.filmYears ? t("{n} years", { n: box.filmYears }) : null],
    [t("Installation warranty"), box.installYears ? t("{n} years", { n: box.installYears }) : null],
    ["VLT", pct(box.vlt)], ["TSER", pct(box.tser)], ["UV", pct(box.uv)], ["IRR", pct(box.irr)],
    [t("Thickness"), box.thicknessMil != null ? `${n(box.thicknessMil)} mil` : null],
    [t("In your account since"), box.heldSince ? date(box.heldSince) : null],
    [t("First used"), box.activatedAt ? date(box.activatedAt) : null],
  ];
  return <dl className={own.rollFacts}>{rows.filter(([, v]) => v).map(([k, v]) =>
    <div key={k}><dt>{k}</dt><dd dir={/^[A-Z]{2,}/.test(k) || k === "ROLL NO" ? "ltr" : undefined}>{v}</dd></div>)}</dl>;
}
