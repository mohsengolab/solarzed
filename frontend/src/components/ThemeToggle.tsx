"use client";

const KEY = "sz-theme";

/** Day/night switch. The saved choice is applied by an inline script in the layout before first paint. */
export default function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    const next = root.dataset.theme === "light" ? "dark" : "light";
    if (next === "light") root.dataset.theme = "light";
    else delete root.dataset.theme;
    try { localStorage.setItem(KEY, next); } catch { /* storage blocked */ }
  }

  return (
    <button type="button" className="sz-theme-toggle" onClick={toggle} aria-label="روز / شب" title="روز / شب">
      <span className="sz-icon-sun" aria-hidden="true">☀</span>
      <span className="sz-icon-moon" aria-hidden="true">☾</span>
    </button>
  );
}
