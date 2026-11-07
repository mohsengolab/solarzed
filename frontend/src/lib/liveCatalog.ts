import "server-only";
import { cache } from "react";
import type { Series } from "./catalog";

type PublishedProduct = { code: string; name: string; type: string; series: string; description: string };

export const CATALOG_TAG = "catalog";

// Cached in the Next.js Data Cache (fast page loads, no API call per visit). The API invalidates the
// "catalog" tag through /api/internal/revalidate when an administrator saves a product; the
// time-based window is a fallback when that hook is not configured.
export const getCatalog = cache(async (): Promise<Series[]> => {
  const origin = process.env.SOLARZED_API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:5010";
  const response = await fetch(`${origin.replace(/\/$/, "")}/api/catalog`, {
    next: { revalidate: 60, tags: [CATALOG_TAG] },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Product catalog is temporarily unavailable.");
  const products: PublishedProduct[] = await response.json();
  const groups = new Map<string, Series>();
  for (const p of products) {
    const category = p.type === "tint" ? "tint" : "ppf";
    const name = p.series.trim() || (category === "tint" ? "Window Film" : "Paint Protection Film");
    // UTF-8 hex preserves distinct names, including Persian, without slug collisions.
    const id = `${category}-${Buffer.from(name.toLowerCase()).toString("hex")}`;
    let series = groups.get(id);
    if (!series) {
      series = { id, category, name, tagline: name, banner: category === "tint" ? "/assets/city.jpg" : "/assets/dominate.jpg",
        description: "", specs: [], products: [] };
      groups.set(id, series);
    }
    series.products.push({ model: p.code, name: p.name, description: p.description });
  }
  return Array.from(groups.values());
});
