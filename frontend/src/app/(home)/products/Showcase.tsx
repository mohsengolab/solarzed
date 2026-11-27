"use client";

/* eslint-disable @next/next/no-img-element -- markup mirrors the original static site */
import { useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import type { Product, Series } from "@/lib/catalog";
import { useLang, useT } from "@/lib/i18n/client";

// A product visual: the supplied photo, or a film roll in the product's shade beside the car.
function Stage({ product, large, categoryLabel }: { product: Product; large: boolean; categoryLabel: string }) {
  return (
    <div className={`stage${large ? " is-large" : ""}`}>
      {product.image ? (
        <img className="stage-photo" src={product.image} alt={large ? product.name : ""} />
      ) : (
        <>
          <span className="stage-brand">SOLARZED</span>
          <div className="roll" style={{ "--swatch": product.swatch ?? "#0b1d3a" } as CSSProperties}>
            <span className="roll-end" /><span className="roll-sheet" />
          </div>
          <img className="stage-car" src="/assets/car.webp" alt="" loading={large ? "eager" : "lazy"} />
        </>
      )}
      {large && (
        <div className="stage-tag"><b>{product.model}</b><small>{`${categoryLabel.toUpperCase()} · ${product.name}`}</small></div>
      )}
    </div>
  );
}

export default function Showcase({ series, categoryLabel, start }: { series: Series; categoryLabel: string; start: number }) {
  const t = useT();
  const rtl = useLang() !== "en";
  const [index, setIndex] = useState(start);
  const thumbs = useRef<HTMLDivElement>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const product = series.products[index];

  function select(i: number) {
    setIndex(i);
    buttons.current[i]?.scrollIntoView({ block: "nearest", inline: "nearest" });
    const url = new URL(location.href);
    url.searchParams.set("model", series.products[i].model);
    history.replaceState(history.state, "", url);
  }
  const scroll = (dir: number) => thumbs.current?.scrollBy({ left: dir * (rtl ? -1 : 1) * thumbs.current.clientWidth * .8, behavior: "smooth" });

  return (
    <>
      <div className="showcase">
        <div className="showcase-stage" aria-live="polite">
          <Stage product={product} large categoryLabel={categoryLabel} />
        </div>
        <div className="showcase-info">
          <span className="eyebrow">{categoryLabel.toUpperCase()}</span>
          <h2>{product.name}</h2>
          <p className="product-model"><small>{t("MODEL")}</small><b>{product.model}</b></p>
          <p className="showcase-text">{product.description || t("{product} from the {series}.", { product: product.name, series: series.name })}</p>
          <ul className="showcase-points">
            <li>{t("Unique Serial Number and production batch")}</li>
            <li>{t("Registered to the vehicle by VIN")}</li>
            <li>{t("Digital warranty certificate for the customer")}</li>
          </ul>
          <div className="showcase-actions">
            <Link className="button dark" href="/contact">{t("Find an installer")} <span>↗</span></Link>
            <Link className="secondary-action" href="/warranty">{t("Check a warranty")}</Link>
          </div>
        </div>
      </div>
      <div className="thumbs-wrap">
        <button type="button" className="thumbs-arrow" aria-label={t("Previous products")} onClick={() => scroll(-1)}>{rtl ? "›" : "‹"}</button>
        <div className="thumbs" ref={thumbs} aria-label={t("Select product")}>
          {series.products.map((p, i) => (
            <button key={p.model} type="button" className="thumb" ref={el => { buttons.current[i] = el; }}
              aria-label={t("{name}, model {model}", { name: p.name, model: p.model })} aria-pressed={i === index} onClick={() => select(i)}>
              <Stage product={p} large={false} categoryLabel={categoryLabel} />
              <span className="thumb-meta"><b>{p.model}</b><span>{p.name}</span></span>
            </button>
          ))}
        </div>
        <button type="button" className="thumbs-arrow" aria-label={t("Next products")} onClick={() => scroll(1)}>{rtl ? "‹" : "›"}</button>
      </div>
    </>
  );
}
