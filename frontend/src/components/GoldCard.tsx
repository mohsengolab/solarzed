import type { WarrantyCard } from "@/lib/api";
import css from "./GoldCard.module.css";

const STATUS = { active: "ACTIVE", pending: "UNDER REVIEW", rejected: "NOT ACTIVE" } as const;

/** The owner's gold warranty card. */
export default function GoldCard({ card }: { card: WarrantyCard }) {
  const film = card.type === "ppf" ? "Paint Protection Film" : "Window Film";
  return <article className={css.card} data-status={card.status} aria-label={`Solarzed warranty ${card.code}`}>
    <div className={css.shine} aria-hidden="true" />
    <header className={css.head}>
      <span className={css.brand}>SOLAR<b>ZED</b></span>
      <span className={css.badge}>{STATUS[card.status]}</span>
    </header>
    <div className={css.chip} aria-hidden="true" />
    <p className={css.kind}>{film} Warranty{card.product ? ` · ${card.product}` : ""}</p>
    <p className={css.code} dir="ltr">{card.code}</p>
    <dl className={css.grid}>
      <div><dt>Owner</dt><dd>{card.owner}</dd></div>
      <div><dt>Vehicle</dt><dd>{card.make} {card.model}</dd></div>
      <div><dt>Plate</dt><dd dir="ltr">{card.plate}</dd></div>
      <div><dt>VIN</dt><dd dir="ltr">{card.vinMasked}</dd></div>
      <div><dt>Installed</dt><dd>{card.installed}</dd></div>
      <div><dt>Installer</dt><dd>{card.installer}{card.country ? ` · ${card.country}` : ""}</dd></div>
      {card.coverage?.filmEnds && <div><dt>Film warranty until</dt><dd>{card.coverage.filmEnds}</dd></div>}
      {card.coverage?.installEnds && <div><dt>Installation warranty until</dt><dd>{card.coverage.installEnds}</dd></div>}
    </dl>
    {card.status !== "active" && <p className={css.note}>{card.status === "pending"
      ? "The installation photos are being reviewed. The warranty becomes active once Solarzed approves them."
      : "This warranty is not active. Please contact your installer."}</p>}
  </article>;
}
