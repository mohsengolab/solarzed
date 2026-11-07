"use client";

export default function CatalogError({ reset }: { reset: () => void }) {
  return <main className="series-page"><section className="wrap"><h1 className="series-title">Products</h1>
    <p>The product catalog is temporarily unavailable. Please try again or contact Solarzed.</p>
    <button className="sv-button" onClick={reset}>Try again</button>
  </section></main>;
}
