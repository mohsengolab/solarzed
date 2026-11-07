/* eslint-disable @next/next/no-img-element -- markup mirrors the original static site */
import type { CSSProperties } from "react";
import Link from "next/link";
import { CATEGORIES, seriesHref } from "@/lib/catalog";
import { getCatalog } from "@/lib/liveCatalog";
import mega from "./mega-menu.module.css";

export function Brand() {
  return (
    <Link href="/" className="logo sv-brand" aria-label="Solarzed home">
      <img src="/assets/solarzed-original.png" width="220" height="27" alt="SOLARZED" />
      <small>WINDOW FILMS &amp; PAINT PROTECTION</small>
    </Link>
  );
}

async function ProductsMenu() {
  const SERIES = await getCatalog().catch(() => []);
  return (
    <details className={`sv-dropdown ${mega.menu}`}>
      <summary>PRODUCTS <span>▾</span></summary>
      <div className={mega.panel} style={{ "--cols": CATEGORIES.length } as CSSProperties}>
        {CATEGORIES.map(category => (
          <section key={category.id} className={mega.col} aria-label={category.label}>
            <h3>{category.label}</h3>
            <ul>
              {SERIES.filter(s => s.category === category.id).map(series => (
                <li key={series.id}>
                  <Link href={seriesHref(series.id)}>
                    <span>{series.name}</span>
                    <i className={mega.dots} aria-label={`${series.products.length} colors`}>
                      {series.products.slice(0, 5).map(p => (
                        <b key={p.model} style={{ "--swatch": p.swatch ?? "#0b1d3a" } as CSSProperties} />
                      ))}
                    </i>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <Link className={mega.all} href="/products">View all products →</Link>
      </div>
    </details>
  );
}

export default function SiteHeader() {
  return (
    <header className="sv-header">
      <nav id="navigation" aria-label="Main navigation">
        <ProductsMenu />
        <details className="sv-dropdown">
          <summary>WARRANTY <span>▾</span></summary>
          <div>
            <Link href="/register">Register an installation</Link>
            <Link href="/warranty">Check warranty</Link>
            <Link href="/coverage">Warranty policy</Link>
          </div>
        </details>
        <Link href="/#about">ABOUT</Link>
      </nav>
      <Brand />
      <div className="sv-header-actions">
        <Link className="sv-dealer" href="/register">DEALER REGISTRATION ↗</Link>
        <Link className="sv-button" href="/contact">CONTACTS</Link>
      </div>
      <button className="menu" aria-label="Open menu" aria-expanded="false" aria-controls="navigation">☰</button>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="sv-footer">
      <Brand />
      <div>
        <Link href="/contact">CONTACTS</Link>
        <Link href="/coverage">WARRANTY POLICY</Link>
        <Link href="/warranty">CHECK WARRANTY</Link>
        <Link href="/register">DEALER REGISTRATION</Link>
      </div>
      <span>SOLARZED · DESIGN PRESENTATION</span>
    </footer>
  );
}
