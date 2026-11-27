"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LANGS, LANG_NAMES, LANG_SHORT, saveLang, type Lang } from "@/lib/i18n";
import { useLang, useT } from "@/lib/i18n/client";

const LANDING: Record<Lang, string> = { en: "/", fa: "/fa", ar: "/ar" };
const isLanding = (path: string) => path === "/" || path === "/fa" || path === "/ar";

/**
 * EN / فا / ع. Saves the choice in the `sz-lang` cookie. On the landing page it opens that language's landing page
 * (/, /fa, /ar); everywhere else it re-renders the current page in the new language.
 */
export default function LanguageSwitch({ className, label, current }: { className?: string; label?: string; current?: Lang }) {
  const router = useRouter();
  const path = usePathname();
  const context = useLang();
  const t = useT();
  const lang = current ?? context;

  function choose(next: Lang) {
    saveLang(next);
    if (isLanding(path)) router.push(LANDING[next]);
    else if (next !== lang) router.refresh();
  }

  // The admin panel is Persian only.
  if (path.startsWith("/admin")) return null;

  return <div className={className} role="group" aria-label={label ?? t("Language")}>
    {LANGS.map(code => (
      <button key={code} type="button" lang={code} title={LANG_NAMES[code]} aria-label={LANG_NAMES[code]}
        aria-pressed={code === lang} onClick={() => choose(code)}>{LANG_SHORT[code]}</button>
    ))}
  </div>;
}

/** Opening /fa or /ar remembers that language for the rest of the site. */
export function RememberLang({ lang }: { lang: Lang }) {
  useEffect(() => { saveLang(lang); }, [lang]);
  return null;
}
