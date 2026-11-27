/* eslint-disable @next/next/no-img-element -- markup mirrors the original static site */
import type { CSSProperties } from "react";
import Link from "next/link";
import { CATEGORIES, seriesHref } from "@/lib/catalog";
import { getCatalog } from "@/lib/liveCatalog";
import LanguageSwitch from "@/components/LanguageSwitch";
import { makeT } from "@/lib/i18n";
import { LANDING, landingHref, type LandingLang } from "./landingCopy";
import mega from "./mega-menu.module.css";

export function Brand({ lang = "en" }: { lang?: LandingLang }) {
  return (
    <Link href={landingHref(lang)} className="logo sv-brand" aria-label={makeT(lang)("Solarzed home")}>
      <img src="/assets/solarzed-original.png" width="220" height="27" alt="SOLARZED" />
      <small>{LANDING[lang].header.tagline}</small>
    </Link>
  );
}

async function ProductsMenu({ lang }: { lang: LandingLang }) {
  const t = LANDING[lang].header;
  const SERIES = await getCatalog().catch(() => []);
  return (
    <details className={`sv-dropdown ${mega.menu}`}>
      <summary>{t.products} <span>▾</span></summary>
      <div className={mega.panel} style={{ "--cols": CATEGORIES.length } as CSSProperties}>
        {CATEGORIES.map(category => {
          const label = t.categories[category.id] ?? category.label;
          return (
            <section key={category.id} className={mega.col} aria-label={label}>
              <h3>{label}</h3>
              <ul>
                {SERIES.filter(s => s.category === category.id).map(series => (
                  <li key={series.id}>
                    <Link href={seriesHref(series.id)}>
                      <span>{series.name}</span>
                      <i className={mega.dots} aria-label={`${series.products.length} ${t.colors}`}>
                        {series.products.slice(0, 5).map(p => (
                          <b key={p.model} style={{ "--swatch": p.swatch ?? "#0b1d3a" } as CSSProperties} />
                        ))}
                      </i>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        <Link className={mega.all} href="/products">{t.viewAll}</Link>
      </div>
    </details>
  );
}

/** The site header. Pass `lang` to translate the labels and show the language switch (landing and product pages). */
export default function SiteHeader({ lang }: { lang?: LandingLang }) {
  const t = LANDING[lang ?? "en"].header;
  return (
    <header className="sv-header">
      <nav id="navigation" aria-label={makeT(lang ?? "en")("Main navigation")}>
        <ProductsMenu lang={lang ?? "en"} />
        <details className="sv-dropdown">
          <summary>{t.warranty} <span>▾</span></summary>
          <div>
            <Link href="/activate">{t.activate}</Link>
            <Link href="/warranty">{t.check}</Link>
            <Link href="/verify">{t.verify}</Link>
            <Link href="/coverage">{t.policy}</Link>
          </div>
        </details>
        <Link href={`${landingHref(lang ?? "en")}#about`}>{t.about}</Link>
      </nav>
      <Brand lang={lang} />
      <div className="sv-header-actions">
        {lang && <LanguageSwitch className="sv-lang" label={t.language} current={lang} />}
        <Link className="sv-dealer" href="/account">{t.dealer}</Link>
        <Link className="sv-button" href="/contact">{t.contacts}</Link>
      </div>
      <button className="menu" aria-label={t.openMenu} aria-expanded="false" aria-controls="navigation">☰</button>
    </header>
  );
}

export function SiteFooter({ lang = "en" }: { lang?: LandingLang }) {
  const t = LANDING[lang].footer;
  return (
    <footer className="sv-footer">
      <Brand lang={lang} />
      <div>
        <Link href="/contact">{t.contacts}</Link>
        <Link href="/coverage">{t.policy}</Link>
        <Link href="/warranty">{t.check}</Link>
        <Link href="/verify">{t.verify}</Link>
        <Link href="/account">{t.dealer}</Link>
      </div>
      <span>{t.note}</span>
    </footer>
  );
}
