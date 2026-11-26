import type { MetadataRoute } from "next";

const BASE = "https://solarzed.com";
// The landing page exists in English (/), Persian (/fa) and Arabic (/ar).
const LANDING_LANGUAGES = { en: BASE, fa: `${BASE}/fa`, ar: `${BASE}/ar` };

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE, lastModified: now, changeFrequency: "weekly", priority: 1.0, alternates: { languages: LANDING_LANGUAGES } },
    { url: `${BASE}/fa`, lastModified: now, changeFrequency: "weekly", priority: 0.9, alternates: { languages: LANDING_LANGUAGES } },
    { url: `${BASE}/ar`, lastModified: now, changeFrequency: "weekly", priority: 0.9, alternates: { languages: LANDING_LANGUAGES } },
    { url: `${BASE}/products`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE}/warranty`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/coverage`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE}/contact`, lastModified: now, changeFrequency: "yearly", priority: 0.5 },
  ];

  return staticRoutes;
}
