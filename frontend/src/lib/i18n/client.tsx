"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { makeT, type Lang } from "./index";

const LangContext = createContext<Lang>("en");

/** Gives client components the language the server rendered the page in. */
export function LangProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);
export function useT() {
  const lang = useLang();
  return useMemo(() => makeT(lang), [lang]);
}
