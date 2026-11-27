export const dynamic = "force-dynamic";

import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { categoryOf } from "@/lib/catalog";
import { getCatalog } from "@/lib/liveCatalog";
import Showcase from "../Showcase";
import { getT } from "@/lib/i18n/server";
import styles from "./series.module.css";

type Props = {
  params: Promise<{ series: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

const find = async (params: Props["params"]) => {
  const { series } = await params;
  return (await getCatalog()).find(s => s.id === series);
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const series = await find(params);
  if (!series) return {};
  const t = await getT();
  const cat = categoryOf(series.category);
  const { series: id } = await params;
  return {
    title: series.name,
    description: t("{tagline} — {category} by Solarzed. View all models, shades and product specifications.", { tagline: series.tagline, category: t(cat.label) }),
    keywords: [series.name, cat.label, "Solarzed", "automotive film", "window tint"],
    alternates: { canonical: `https://solarzed.com/products/${id}` },
    openGraph: {
      url: `https://solarzed.com/products/${id}`,
      title: `${series.name} | Solarzed`,
      description: t("{tagline} — {category} by Solarzed. View all models, shades and product specifications.", { tagline: series.tagline, category: t(cat.label) }),
      images: series.banner ? [{ url: series.banner, alt: series.name }] : [{ url: "/assets/solarzed-box.jpg", alt: t("Products") }],
    },
  };
}

// Port of the static site's products.html (Carbins-style series page): one page per series.
export default async function SeriesPage({ params, searchParams }: Props) {
  const series = await find(params);
  if (!series) notFound();
  const modelParam = (await searchParams).model;
  const model = Array.isArray(modelParam) ? modelParam[0] : modelParam;
  const cat = categoryOf(series.category);
  const t = await getT();
  const catLabel = t(cat.label);
  const start = Math.max(0, series.products.findIndex(p => p.model === model));

  const { series: seriesId } = await params;
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://solarzed.com" },
      { "@type": "ListItem", position: 2, name: "Products", item: "https://solarzed.com/products" },
      { "@type": "ListItem", position: 3, name: series.name, item: `https://solarzed.com/products/${seriesId}` },
    ],
  };

  return (
    <main className="series-page">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
        <div className="wrap series-crumbs">
          <div className="breadcrumb">
            <Link href="/">{t("Home")}</Link><span>/</span><Link href="/products">{t("Products")}</Link><span>/</span><span>{series.name}</span>
          </div>
        </div>
        <section className="wrap series-top" aria-labelledby="series-title">
          <h1 className="series-title" id="series-title">{series.name}</h1>
          <Showcase key={series.id} series={series} categoryLabel={catLabel} start={start} />
          {series.specs.length > 0 && <div className="spec-scroll">
            <table className="spec-grid">
              <caption className="visually-hidden">{t("Series specifications")}</caption>
              <thead><tr>{series.specs.map(([k]) => <th key={k} scope="col">{k}</th>)}</tr></thead>
              <tbody><tr>{series.specs.map(([k, v]) => <td key={k}>{v}</td>)}</tr></tbody>
            </table>
          </div>}
        </section>

        <section className="wrap intro-block">
          <h2 className="series-title">{t("Product Introduction")}</h2>
          <p>{series.description || t("Choose a product above to view its model and details.")}</p>
        </section>

        <section className="series-banner" style={{ "--banner": `url('${series.banner}')` } as CSSProperties}>
          <div className="wrap">
            <span className="eyebrow">{catLabel.toUpperCase()}</span>
            <h2>{series.name}</h2>
            <p>{series.tagline}</p>
          </div>
        </section>

        <section className={`wrap layers ${styles.layers}`} style={{ "--n": cat.structure.length } as CSSProperties}>
          <div className="layers-visual" aria-hidden="true">
            {cat.structure.map(([name], i) => (
              <div key={name} className="layer" style={{ "--i": i } as CSSProperties}><span>{t(name)}</span></div>
            ))}
          </div>
          <div className="layers-copy">
            <span className="eyebrow">{t("INSIDE THE FILM")}</span>
            <h2>{t("Built layer by layer.")}</h2>
            <p>{t("The construction of each Solarzed film, from the surface to the liner the installer removes.")}</p>
            <ol className="layers-list">
              {cat.structure.map(([name, text]) => <li key={name}><b>{t(name)}</b><p>{t(text)}</p></li>)}
            </ol>
          </div>
        </section>

        <section className="wrap why">
          <div className="why-head"><span className="eyebrow">{t("WHY SOLARZED")}</span><h2>{t("One brand. One standard.")}</h2></div>
          <div className="why-grid">
            <article><b>01</b><h3>{t("Checked every batch")}</h3><p>{t("Each production batch is verified against the approved specification before it carries a Solarzed product name.")}</p></article>
            <article><b>02</b><h3>{t("A serial for every roll")}</h3><p>{t("A unique roll ID and batch number connect each installation back to its source.")}</p></article>
            <article><b>03</b><h3>{t("A digital warranty")}</h3><p>{t("Customers find their warranty card by VIN or mobile number — anytime.")}</p></article>
            <article><b>04</b><h3>{t("Clear claims")}</h3><p>{t("Every claim is assessed on its cause and evidence, with a documented decision.")}</p></article>
          </div>
        </section>

        <section className="wrap commitment">
          <h2 className="series-title">{t("Official warranty commitment")}</h2>
          <div className="spec-scroll">
            <table className="commitment-table">
              <thead><tr><th scope="col">{t("Coverage")}</th><th scope="col">{t("What it covers")}</th><th scope="col">{t("Period")}</th></tr></thead>
              <tbody>
                <tr><th scope="row">{t("Film warranty")}</th><td>{t("Confirmed product defects under normal use and the care instructions.")}</td><td>{t("Per approved product terms")}</td></tr>
                <tr><th scope="row">{t("Installation warranty")}</th><td>{t("Workmanship issues assessed against the installation instructions for the model.")}</td><td>{t("Per approved product terms")}</td></tr>
                <tr><th scope="row">{t("Digital certificate")}</th><td>{t("Links the product, roll serial, vehicle, installation and original customer.")}</td><td>{t("Available online anytime")}</td></tr>
              </tbody>
            </table>
          </div>
          <p className="commitment-links">
            <Link className="text-link" href="/coverage">{t("Read the full warranty guide")} <span>{t("→")}</span></Link>
            <Link className="text-link" href="/warranty">{t("Check a warranty")} <span>{t("→")}</span></Link>
          </p>
        </section>

        <section className="consult">
          <div className="wrap">
            <div>
              <h2>{t("Not sure which series suits your car?")}</h2>
              <p>{t("Tell us about your vehicle and how you drive. We’ll help you choose the right film and find an installer.")}</p>
              <Link className="sv-button" href="/contact">{t("Get a recommendation")} ↗</Link>
            </div>
          </div>
        </section>
    </main>
  );
}
