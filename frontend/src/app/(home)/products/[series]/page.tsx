export const dynamic = "force-dynamic";

import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { categoryOf } from "@/lib/catalog";
import { getCatalog } from "@/lib/liveCatalog";
import Showcase from "../Showcase";
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
  const cat = categoryOf(series.category);
  const { series: id } = await params;
  return {
    title: series.name,
    description: `${series.tagline} — ${cat.label} by Solarzed. View all models, shades and product specifications.`,
    keywords: [series.name, cat.label, "Solarzed", "automotive film", "window tint"],
    alternates: { canonical: `https://solarzed.com/products/${id}` },
    openGraph: {
      url: `https://solarzed.com/products/${id}`,
      title: `${series.name} | Solarzed`,
      description: `${series.tagline} — ${cat.label} by Solarzed.`,
      images: series.banner ? [{ url: series.banner, alt: `${series.name} window film` }] : [{ url: "/assets/solarzed-box.jpg", alt: "Solarzed product" }],
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
            <Link href="/">Home</Link><span>/</span><Link href="/products">Products</Link><span>/</span><span>{series.name}</span>
          </div>
        </div>
        <section className="wrap series-top" aria-labelledby="series-title">
          <h1 className="series-title" id="series-title">{series.name}</h1>
          <Showcase key={series.id} series={series} categoryLabel={cat.label} start={start} />
          {series.specs.length > 0 && <div className="spec-scroll">
            <table className="spec-grid">
              <caption className="visually-hidden">Series specifications</caption>
              <thead><tr>{series.specs.map(([k]) => <th key={k} scope="col">{k}</th>)}</tr></thead>
              <tbody><tr>{series.specs.map(([k, v]) => <td key={k}>{v}</td>)}</tr></tbody>
            </table>
          </div>}
        </section>

        <section className="wrap intro-block">
          <h2 className="series-title">Product Introduction</h2>
          <p>{series.description || "Choose a product above to view its model and details."}</p>
        </section>

        <section className="series-banner" style={{ "--banner": `url('${series.banner}')` } as CSSProperties}>
          <div className="wrap">
            <span className="eyebrow">{cat.label.toUpperCase()}</span>
            <h2>{series.name}</h2>
            <p>{series.tagline}</p>
          </div>
        </section>

        <section className={`wrap layers ${styles.layers}`} style={{ "--n": cat.structure.length } as CSSProperties}>
          <div className="layers-visual" aria-hidden="true">
            {cat.structure.map(([name], i) => (
              <div key={name} className="layer" style={{ "--i": i } as CSSProperties}><span>{name}</span></div>
            ))}
          </div>
          <div className="layers-copy">
            <span className="eyebrow">INSIDE THE FILM</span>
            <h2>Built layer by layer.</h2>
            <p>The construction of each Solarzed film, from the surface to the liner the installer removes.</p>
            <ol className="layers-list">
              {cat.structure.map(([name, text]) => <li key={name}><b>{name}</b><p>{text}</p></li>)}
            </ol>
          </div>
        </section>

        <section className="wrap why">
          <div className="why-head"><span className="eyebrow">WHY SOLARZED</span><h2>One brand. One standard.</h2></div>
          <div className="why-grid">
            <article><b>01</b><h3>Checked every batch</h3><p>Each production batch is verified against the approved specification before it carries a Solarzed product name.</p></article>
            <article><b>02</b><h3>A serial for every roll</h3><p>A unique roll ID and batch number connect each installation back to its source.</p></article>
            <article><b>03</b><h3>A digital warranty</h3><p>Customers find their certificate by warranty number, VIN or mobile number — anytime.</p></article>
            <article><b>04</b><h3>Clear claims</h3><p>Every claim is assessed on its cause and evidence, with a documented decision.</p></article>
          </div>
        </section>

        <section className="wrap commitment">
          <h2 className="series-title">Official warranty commitment</h2>
          <div className="spec-scroll">
            <table className="commitment-table">
              <thead><tr><th scope="col">Coverage</th><th scope="col">What it covers</th><th scope="col">Period</th></tr></thead>
              <tbody>
                <tr><th scope="row">Film warranty</th><td>Confirmed product defects under normal use and the care instructions.</td><td>Per approved product terms</td></tr>
                <tr><th scope="row">Installation warranty</th><td>Workmanship issues assessed against the installation instructions for the model.</td><td>Per approved product terms</td></tr>
                <tr><th scope="row">Digital certificate</th><td>Links the product, roll serial, vehicle, installation and original customer.</td><td>Available online anytime</td></tr>
              </tbody>
            </table>
          </div>
          <p className="commitment-links">
            <Link className="text-link" href="/coverage">Read the full warranty guide <span>→</span></Link>
            <Link className="text-link" href="/warranty">Check a warranty <span>→</span></Link>
          </p>
        </section>

        <section className="consult">
          <div className="wrap">
            <div>
              <h2>Not sure which series<br />suits your car?</h2>
              <p>Tell us about your vehicle and how you drive. We’ll help you choose the right film and find an installer.</p>
              <Link className="sv-button" href="/contact">Get a recommendation ↗</Link>
            </div>
          </div>
        </section>
    </main>
  );
}
