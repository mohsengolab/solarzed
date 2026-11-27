"use client";

import type { WarrantyCard } from "@/lib/api";
import { useT } from "@/lib/i18n/client";
import css from "./CardDetails.module.css";

/**
 * Shown under the gold card: what each line on the card means, what the film's datasheet values (VLT, IRR, UVR,
 * thickness) stand for, and the product description from the catalog.
 */
export default function CardDetails({ card }: { card: WarrantyCard }) {
  const t = useT();
  const s = card.specs;
  const specs = ([
    ["VLT", s?.vlt != null ? `${s.vlt}%` : null, t("Visible Light Transmission: how much visible light passes through the film. A lower number means a darker film and more privacy.")],
    ["IRR", s?.irr != null ? `${s.irr}%` : null, t("Infrared Rejection: how much of the sun's infrared (the heat you feel) the film blocks. A higher number means a cooler cabin.")],
    ["UVR", s?.uvr != null ? `${s.uvr}%` : null, t("Ultraviolet Rejection: how much UV the film blocks. UV fades the interior and harms the skin.")],
    [t("Thickness"), s?.thicknessMil != null ? `${Number(s.thicknessMil)} mil` : null, t("Thickness of the film in mil (1 mil = 0.0254 mm). A thicker film is stronger and more resistant to scratches and impacts.")],
  ] as const).filter(([, value]) => value != null);
  const fields: [string, string][] = [
    [t("Owner"), t("The customer this warranty is registered to. The warranty stays with this owner and vehicle.")],
    [t("Vehicle"), t("Make and model of the vehicle the film was installed on.")],
    [t("Plate"), t("The vehicle's plate number, partly hidden for your privacy.")],
    ["VIN", t("The vehicle identification number, partly hidden. Use the full VIN with your mobile number to find this card on the warranty inquiry page.")],
    [t("Installed"), t("The date the film was installed.")],
    [t("Installer"), t("The authorised Solarzed installer who installed the film, and their country.")],
    [t("Film warranty until"), t("The last day the film is covered against product defects under normal use and the care instructions.")],
  ];
  return <section className={css.details}>
    {(card.product || card.description) && <div className={css.block}>
      <h2>{t("About the product")}</h2>
      {(card.product || card.series) && <p className={css.product}>{[card.series, card.product].filter(Boolean).join(" · ")}</p>}
      {card.description && <p className={css.text}>{card.description}</p>}
    </div>}
    {specs.length > 0 && <div className={css.block}>
      <h2>{t("Film specifications")}</h2>
      <dl className={css.specs}>
        {specs.map(([name, value, text]) => <div key={name}>
          <dt><b dir="ltr">{name}</b><span dir="ltr">{value}</span></dt>
          <dd>{text}</dd>
        </div>)}
      </dl>
    </div>}
    <div className={css.block}>
      <h2>{t("What is on your card")}</h2>
      <dl className={css.fields}>
        {fields.map(([name, text]) => <div key={name}><dt>{name}</dt><dd>{text}</dd></div>)}
        <div><dt>{t("Status")}</dt><dd>{t("ACTIVE means the warranty is in force. UNDER REVIEW means Solarzed is still checking the installation photos.")}</dd></div>
      </dl>
    </div>
  </section>;
}
