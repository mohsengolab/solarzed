"use client";

import type { WarrantyCard } from "@/lib/api";
import { useT } from "@/lib/i18n/client";
import FilmSpecsLine from "./FilmSpecs";
import css from "./GoldCard.module.css";

const STATUS = { active: "ACTIVE", pending: "UNDER REVIEW", rejected: "NOT ACTIVE" } as const;

/** The owner's gold warranty card. */
export default function GoldCard({ card }: { card: WarrantyCard }) {
  const t = useT();
  const kind = card.type === "ppf" ? t("Paint Protection Film Warranty") : t("Window Film Warranty");
  return <article className={css.card} data-status={card.status} aria-label={kind}>
    <div className={css.shine} aria-hidden="true" />
    <header className={css.head}>
      <span className={css.brand}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/solarzed-logo.svg" alt="SOLARZED" width={150} height={18} />
      </span>
      <span className={css.badge}>{t(STATUS[card.status])}</span>
    </header>
    <div className={css.chip} aria-hidden="true" />
    <p className={css.kind}>{kind}</p>
    {card.product && <p className={css.model}>{card.product}</p>}
    <FilmSpecsLine specs={card.specs} className={css.specs} />
    <dl className={css.grid}>
      <div><dt>{t("Owner")}</dt><dd>{card.owner}</dd></div>
      <div><dt>{t("Vehicle")}</dt><dd>{card.make} {card.model}</dd></div>
      <div><dt>{t("Plate")}</dt><dd dir="ltr">{card.plate}</dd></div>
      <div><dt>VIN</dt><dd dir="ltr">{card.vinMasked}</dd></div>
      <div><dt>{t("Installed")}</dt><dd>{card.installed}</dd></div>
      <div><dt>{t("Installer")}</dt><dd>{card.installer}{card.country ? ` · ${card.country}` : ""}</dd></div>
      {card.coverage?.filmEnds && <div><dt>{t("Film warranty until")}</dt><dd>{card.coverage.filmEnds}</dd></div>}
    </dl>
    {card.status !== "active" && <p className={css.note}>{card.status === "pending"
      ? t("The installation photos are being reviewed. The warranty becomes active once Solarzed approves them.")
      : t("This warranty is not active. Please contact your installer.")}</p>}
  </article>;
}
