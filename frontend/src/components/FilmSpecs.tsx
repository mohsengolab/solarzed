import type { FilmSpecs } from "@/lib/api";

/** "VLT 15% · IRR 90% · UVR 99% · 1.5 mil", or nothing when the product has no datasheet values. */
export function specParts(s?: FilmSpecs | null): string[] {
  if (!s) return [];
  return [
    s.vlt != null && `VLT ${s.vlt}%`,
    s.irr != null && `IRR ${s.irr}%`,
    s.uvr != null && `UVR ${s.uvr}%`,
    s.thicknessMil != null && `${Number(s.thicknessMil)} mil`,
  ].filter((x): x is string => !!x);
}

export default function FilmSpecsLine({ specs, className }: { specs?: FilmSpecs | null; className?: string }) {
  const parts = specParts(specs);
  if (parts.length === 0) return null;
  return <span className={className} dir="ltr">{parts.join(" · ")}</span>;
}
