import fa from "./fa";
import ar from "./ar";

/**
 * Languages of the user-facing site (everything except /admin, which stays Persian).
 * The visitor's choice lives in the `sz-lang` cookie so the server renders the right language and direction.
 * Strings are written in English in the code and looked up in the Persian and Arabic tables;
 * a missing entry falls back to English. Use {name} placeholders for values.
 */
export const LANGS = ["en", "fa", "ar"] as const;
export type Lang = (typeof LANGS)[number];
export const LANG_COOKIE = "sz-lang";
export const isLang = (value: unknown): value is Lang => (LANGS as readonly unknown[]).includes(value);
export const dirOf = (lang: Lang) => (lang === "en" ? "ltr" : "rtl");

/** Shown in the language switch, each in its own language. */
export const LANG_NAMES: Record<Lang, string> = { en: "English", fa: "فارسی", ar: "العربية" };
export const LANG_SHORT: Record<Lang, string> = { en: "EN", fa: "فا", ar: "ع" };

/** Locale for dates and numbers. Gregorian calendar everywhere; Persian digits for Persian, Latin digits for Arabic. */
export const LOCALES: Record<Lang, string> = { en: "en-GB", fa: "fa-IR-u-ca-gregory", ar: "ar-u-ca-gregory-nu-latn" };

const TABLES: Record<Exclude<Lang, "en">, Record<string, string>> = { fa, ar };

export type Vars = Record<string, string | number | null | undefined>;
export type T = (text: string, vars?: Vars) => string;

export function translate(lang: Lang, text: string, vars?: Vars): string {
  const table = lang === "en" ? null : TABLES[lang];
  // The API includes the resend delay in its validation message.
  const wait = table && text.match(/^Please wait (\d+) seconds before requesting another code\.$/);
  if (wait) return translate(lang, "Please wait {n} seconds before requesting another code.", { n: Number(wait[1]) });
  const out = table && Object.hasOwn(table, text) ? table[text] : text;
  if (!vars) return out;
  return out.replace(/\{(\w+)\}/g, (all, name: string) => {
    const value = vars[name];
    if (value == null) return "";
    return typeof value === "number" ? value.toLocaleString(LOCALES[lang]) : value;
  });
}

export const makeT = (lang: Lang): T => (text, vars) => translate(lang, text, vars);

/** Date-only and date-and-time formatting in the visitor's language. */
export const formatDate = (lang: Lang, value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString(LOCALES[lang]) : "—";
export const formatStamp = (lang: Lang, value: string) =>
  new Date(value).toLocaleString(LOCALES[lang], { dateStyle: "medium", timeStyle: "short" });

/** Browser side: remember the choice for a year. */
export function saveLang(lang: Lang) {
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
}
