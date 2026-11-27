import { cookies } from "next/headers";
import { LANG_COOKIE, isLang, makeT, type Lang } from "./index";

/** The visitor's language from the `sz-lang` cookie (English when unset). */
export async function getLang(): Promise<Lang> {
  const value = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(value) ? value : "en";
}

export async function getT() {
  return makeT(await getLang());
}
