import { getCountries, getCountryCallingCode, isValidPhoneNumber, parsePhoneNumberFromString, validatePhoneNumberLength, type CountryCode } from "libphonenumber-js/mobile";
import examples from "libphonenumber-js/mobile/examples";
import { getExampleNumber } from "libphonenumber-js/mobile";
import type { Lang } from "@/lib/i18n";

/**
 * Countries for the profile: flag, localised name and international dialling code,
 * mobile-number checks per country (libphonenumber) and a short list of cities for the main markets.
 */
export type Country = { code: CountryCode; dial: string; names: Record<Lang, string> };

const NAME_LOCALES: Record<Lang, string> = { en: "en", fa: "fa", ar: "ar" };
/** Shown first: where Solarzed sells most. */
export const SUGGESTED: CountryCode[] = ["IR", "IQ", "AE", "TR", "AF", "SA", "OM", "QA", "KW", "BH", "AM", "AZ"];

let cache: Country[] | null = null;
export function countries(): Country[] {
  if (cache) return cache;
  const display = Object.fromEntries((Object.keys(NAME_LOCALES) as Lang[]).map(l => {
    try { return [l, new Intl.DisplayNames([NAME_LOCALES[l]], { type: "region" })]; } catch { return [l, null]; }
  })) as Record<Lang, Intl.DisplayNames | null>;
  cache = getCountries().map(code => ({
    code, dial: getCountryCallingCode(code),
    names: { en: display.en?.of(code) ?? code, fa: display.fa?.of(code) ?? display.en?.of(code) ?? code, ar: display.ar?.of(code) ?? display.en?.of(code) ?? code },
  }));
  return cache;
}

export const findCountry = (code: string | null | undefined) => code ? countries().find(c => c.code === code) ?? null : null;

/** Profiles stored the country as free text: accept the code or the name in any of the site's languages. */
export function countryFromText(text: string | null | undefined): Country | null {
  const value = (text ?? "").trim().toLowerCase();
  if (!value) return null;
  return countries().find(c => c.code.toLowerCase() === value || Object.values(c.names).some(n => n.toLowerCase() === value)) ?? null;
}

export const flagUrl = (code: string) => `/flags/${code}.svg`;

/** Persian and Arabic digits typed on a phone keyboard become Latin digits; everything else but digits is dropped. */
export const digits = (raw: string) => raw
  .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06f0))
  .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
  .replace(/\D/g, "");

/** The national number without the trunk 0 (Iranians type 0912…, which is 912… after +98). */
export const nationalDigits = (raw: string) => digits(raw).replace(/^0+/, "");

export const isValidMobile = (national: string, country: CountryCode) => {
  const n = nationalDigits(national);
  return n.length > 0 && isValidPhoneNumber(n, country);
};

/** True once the number is long enough to judge and still not a mobile of that country, so no error shows mid-typing. */
export const isWrongMobile = (national: string, country: CountryCode) => {
  const n = nationalDigits(national);
  if (!n || isValidPhoneNumber(n, country)) return false;
  const typical = getExampleNumber(country, examples)?.nationalNumber.length ?? 0;
  return n.length >= typical || validatePhoneNumberLength(n, country) === "TOO_LONG";
};

/** +<code><number>, the form the API stores for every country (Iranian numbers become 09… on the server). */
export const toE164 = (national: string, country: CountryCode) =>
  parsePhoneNumberFromString(nationalDigits(national), country)?.number ?? `+${getCountryCallingCode(country)}${nationalDigits(national)}`;

/** Example mobile, written the way people in that country write it, for the input placeholder. */
export const examplePlaceholder = (country: CountryCode) => getExampleNumber(country, examples)?.formatNational() ?? "";

/** Which country a stored mobile belongs to (09… is Iranian). */
export function countryOfPhone(phone: string | null | undefined): CountryCode | null {
  if (!phone) return null;
  if (/^09\d{9}$/.test(phone)) return "IR";
  return parsePhoneNumberFromString(phone.startsWith("+") ? phone : `+${phone}`)?.country ?? null;
}

/** Main cities as [English, local name]. People can still type a city that is not listed. */
const CITIES: Partial<Record<CountryCode, [string, string?][]>> = {
  IR: [["Tehran", "تهران"], ["Mashhad", "مشهد"], ["Isfahan", "اصفهان"], ["Karaj", "کرج"], ["Shiraz", "شیراز"], ["Tabriz", "تبریز"],
    ["Qom", "قم"], ["Ahvaz", "اهواز"], ["Kermanshah", "کرمانشاه"], ["Urmia", "ارومیه"], ["Rasht", "رشت"], ["Zahedan", "زاهدان"],
    ["Kerman", "کرمان"], ["Hamadan", "همدان"], ["Yazd", "یزد"], ["Ardabil", "اردبیل"], ["Bandar Abbas", "بندرعباس"], ["Arak", "اراک"],
    ["Zanjan", "زنجان"], ["Sanandaj", "سنندج"], ["Qazvin", "قزوین"], ["Khorramabad", "خرم‌آباد"], ["Gorgan", "گرگان"], ["Sari", "ساری"],
    ["Bushehr", "بوشهر"], ["Birjand", "بیرجند"], ["Bojnurd", "بجنورد"], ["Ilam", "ایلام"], ["Shahrekord", "شهرکرد"], ["Semnan", "سمنان"],
    ["Yasuj", "یاسوج"], ["Kish", "کیش"], ["Qeshm", "قشم"], ["Kashan", "کاشان"], ["Amol", "آمل"], ["Babol", "بابل"], ["Dezful", "دزفول"],
    ["Neyshabur", "نیشابور"], ["Sabzevar", "سبزوار"], ["Najafabad", "نجف‌آباد"], ["Varamin", "ورامین"], ["Eslamshahr", "اسلامشهر"]],
  AE: [["Dubai", "دبي"], ["Abu Dhabi", "أبوظبي"], ["Sharjah", "الشارقة"], ["Ajman", "عجمان"], ["Ras Al Khaimah", "رأس الخيمة"], ["Fujairah", "الفجيرة"], ["Umm Al Quwain", "أم القيوين"], ["Al Ain", "العين"]],
  IQ: [["Baghdad", "بغداد"], ["Basra", "البصرة"], ["Erbil", "أربيل"], ["Mosul", "الموصل"], ["Sulaymaniyah", "السليمانية"], ["Najaf", "النجف"], ["Karbala", "كربلاء"], ["Kirkuk", "كركوك"], ["Duhok", "دهوك"], ["Nasiriyah", "الناصرية"], ["Hillah", "الحلة"], ["Amarah", "العمارة"]],
  SA: [["Riyadh", "الرياض"], ["Jeddah", "جدة"], ["Mecca", "مكة"], ["Medina", "المدينة المنورة"], ["Dammam", "الدمام"], ["Khobar", "الخبر"], ["Taif", "الطائف"], ["Tabuk", "تبوك"], ["Abha", "أبها"], ["Buraidah", "بريدة"]],
  KW: [["Kuwait City", "مدينة الكويت"], ["Hawalli", "حولي"], ["Farwaniya", "الفروانية"], ["Ahmadi", "الأحمدي"], ["Jahra", "الجهراء"]],
  QA: [["Doha", "الدوحة"], ["Al Rayyan", "الريان"], ["Al Wakrah", "الوكرة"], ["Al Khor", "الخور"]],
  BH: [["Manama", "المنامة"], ["Muharraq", "المحرق"], ["Riffa", "الرفاع"], ["Hamad Town", "مدينة حمد"]],
  OM: [["Muscat", "مسقط"], ["Salalah", "صلالة"], ["Sohar", "صحار"], ["Nizwa", "نزوى"], ["Sur", "صور"]],
  AF: [["Kabul", "کابل"], ["Herat", "هرات"], ["Mazar-i-Sharif", "مزار شریف"], ["Kandahar", "قندهار"], ["Jalalabad", "جلال‌آباد"], ["Kunduz", "کندز"]],
  TR: [["Istanbul"], ["Ankara"], ["Izmir"], ["Bursa"], ["Antalya"], ["Van"], ["Konya"], ["Gaziantep"], ["Adana"], ["Trabzon"]],
  AM: [["Yerevan"], ["Gyumri"], ["Vanadzor"]],
  AZ: [["Baku"], ["Ganja"], ["Sumgait"], ["Nakhchivan"]],
  SY: [["Damascus", "دمشق"], ["Aleppo", "حلب"], ["Homs", "حمص"], ["Latakia", "اللاذقية"]],
  LB: [["Beirut", "بيروت"], ["Tripoli", "طرابلس"], ["Sidon", "صيدا"]],
  JO: [["Amman", "عمّان"], ["Zarqa", "الزرقاء"], ["Irbid", "إربد"], ["Aqaba", "العقبة"]],
  EG: [["Cairo", "القاهرة"], ["Alexandria", "الإسكندرية"], ["Giza", "الجيزة"]],
  PK: [["Karachi"], ["Lahore"], ["Islamabad"], ["Quetta"], ["Peshawar"]],
  GE: [["Tbilisi"], ["Batumi"], ["Kutaisi"]],
  TM: [["Ashgabat"], ["Mary"], ["Turkmenabat"]],
};

/** City suggestions for a country, in the page's language where a local name is known. */
export function citiesOf(code: string | null | undefined, lang: Lang): string[] {
  const list = code ? CITIES[code as CountryCode] : undefined;
  if (!list) return [];
  return list.map(([en, local]) => lang !== "en" && local ? local : en);
}
