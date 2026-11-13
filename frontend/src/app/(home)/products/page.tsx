export const dynamic = "force-dynamic";

import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CATEGORIES, seriesHref } from "@/lib/catalog";
import { getCatalog } from "@/lib/liveCatalog";
import styles from "./overview.module.css";

export const metadata: Metadata = {
  title: "Window Tint & PPF Products",
  description:
    "Explore Solarzed window tint, paint protection film and colour PPF series. Compare shades, finishes and product specifications for every model.",
  keywords: ["window tint series", "PPF series", "automotive film products", "color PPF", "Solarzed products"],
  alternates: { canonical: "https://solarzed.com/products" },
  openGraph: {
    url: "https://solarzed.com/products",
    title: "Window Tint & PPF Products | Solarzed",
    description: "Explore Solarzed window tint, paint protection film and colour PPF series.",
    images: [{ url: "/assets/solarzed-box.jpg", alt: "Solarzed product lineup" }],
  },
};

type Props = { searchParams: Promise<{ [key: string]: string | string[] | undefined }> };

export default async function ProductsOverview({ searchParams }: Props) {
  const SERIES = await getCatalog();
  // Old links used /products?series=<id>&model=<model>; send them to the series page.
  const { series: legacy, model } = await searchParams;
  const legacyId = Array.isArray(legacy) ? legacy[0] : legacy;
  if (legacyId && SERIES.some(s => s.id === legacyId)) {
    const m = Array.isArray(model) ? model[0] : model;
    redirect(seriesHref(legacyId) + (m ? `?model=${encodeURIComponent(m)}` : ""));
  }

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://solarzed.com" },
      { "@type": "ListItem", position: 2, name: "Products", item: "https://solarzed.com/products" },
    ],
  };

  return (
    <main className="series-page">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
        <div className="wrap series-crumbs">
          <div className="breadcrumb"><Link href="/">Home</Link><span>/</span><span>Products</span></div>
        </div>
        <section className="wrap">
          <h1 className="series-title">Products</h1>
          <p className={styles.intro}>Window tint, PPF and color PPF. Choose a series to see every shade, color and finish it comes in.</p>
          {SERIES.length === 0 && <p>No products are currently available. Please contact Solarzed for product information.</p>}
          {CATEGORIES.map(category => {
            const list = SERIES.filter(s => s.category === category.id);
            return (
              <section key={category.id} className={styles.category} aria-labelledby={`cat-${category.id}`}>
                <div className={styles.catHead}>
                  <h2 id={`cat-${category.id}`}>{category.label}</h2>
                  <span>{list.length} series</span>
                </div>
                <div className={styles.grid}>
                  {list.map(series => (
                    <Link key={series.id} href={seriesHref(series.id)} className={styles.card}>
                      <span className={styles.media} style={{ "--banner": `url('${series.banner}')` } as CSSProperties}>
                        <b>{category.label}</b>
                      </span>
                      <div className={styles.body}>
                        <h3>{series.name}</h3>
                        <p>{series.tagline}</p>
                        <span className={styles.swatches} aria-label={`${series.products.length} colors`}>
                          {series.products.map(p => (
                            <i key={p.model} title={p.name} style={{ "--swatch": p.swatch ?? "#0b1d3a" } as CSSProperties} />
                          ))}
                        </span>
                        <span className={styles.more}>
                          <span>{series.products.length} {series.products.length === 1 ? "product" : "products"}</span>
                          <span>View series →</span>
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </section>
    </main>
  );
}
