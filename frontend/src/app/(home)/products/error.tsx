"use client";

import { useT } from "@/lib/i18n/client";

export default function CatalogError({ reset }: { reset: () => void }) {
  const t = useT();
  return <main className="series-page"><section className="wrap"><h1 className="series-title">{t("Products")}</h1>
    <p>{t("The product catalog is temporarily unavailable. Please try again or contact Solarzed.")}</p>
    <button className="sv-button" onClick={reset}>{t("Try again")}</button>
  </section></main>;
}
