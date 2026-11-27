"use client";

import { useT } from "@/lib/i18n/client";
import { usePathname } from "next/navigation";

const KEY = "sz-theme";

/** Day/night switch. The saved choice is applied by an inline script in the layout before first paint. */
export default function ThemeToggle() {
  const t = useT();
  const label = usePathname().startsWith("/admin") ? "روز / شب" : t("Day / night");
  function toggle() {
    const root = document.documentElement;
    const next = root.dataset.theme === "light" ? "dark" : "light";
    if (next === "light") root.dataset.theme = "light";
    else delete root.dataset.theme;
    try { localStorage.setItem(KEY, next); } catch { /* storage blocked */ }
  }

  return (
    <button type="button" className="sz-theme-toggle" onClick={toggle} aria-label={label} title={label}>
      <span className="sz-icon-sun" aria-hidden="true">☀</span>
      <span className="sz-icon-moon" aria-hidden="true">☾</span>
    </button>
  );
}
