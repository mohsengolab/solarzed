// Lists every English string the user-facing site translates and reports any missing from the Persian or Arabic table.
// Usage: node scripts/check-translations.mjs [--list]
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../src/", import.meta.url));

function files(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "admin" || name === "i18n" ? [] : files(path);
    return /\.(tsx?|mjs)$/.test(name) ? [path] : [];
  });
}

const unquote = text => JSON.parse(`"${text}"`);
const keys = new Map();
const add = (key, file) => { if (!keys.has(key)) keys.set(key, relative(root, file)); };

// Constant lists whose labels reach the page through t(label).
const LISTS = [
  /const (?:STATUS|TICKET_STATUS|WARRANTY_STATUS|TICKET_FILTERS|WARRANTY_FILTERS|FILTERS)\b[^;]*;/gs,
  /const fields = \[[\s\S]*?\] as const;/g,
  /const glass = \[[\s\S]*?\] as const;/g,
  /export const PANEL_LABELS[\s\S]*?\};/g,
  /const (?:WINDOWS|PANELS): \[string, string\]\[\] = \[[\s\S]*?\];/g,
  /const (?:TINT_ITEMS|PPF_ITEMS|NOT_COVERED|CARD_STYLE) = \[[\s\S]*?\];/g,
  /const rows: \[string, unknown\]\[\] = \[[\s\S]*?\];/g,
];

for (const file of files(root)) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(/\bt\("((?:[^"\\]|\\.)*)"/g)) add(unquote(m[1]), file);
  for (const m of text.matchAll(/\bt\([\w.]+ (?:===|>) \d+ \? "((?:[^"\\]|\\.)*)" : "((?:[^"\\]|\\.)*)"/g)) { add(unquote(m[1]), file); add(unquote(m[2]), file); }
  for (const re of LISTS) for (const block of text.match(re) ?? []) {
    for (const m of block.matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
      const value = unquote(m[1]);
      // Skip ids such as "left-front" and style names; labels start with a capital letter.
      if (/^[A-Z(✓✕]/.test(value) && !/^[A-Z0-9_]+$/.test(value.replace(/[ &]/g, ""))) add(value, file);
      else if (/^[A-Z][A-Z ]+[A-Z]$/.test(value) && block.includes("STATUS")) add(value, file);
    }
  }
}
// Warranty page terms, photo kinds and catalog categories are data passed through t().
const warranty = readFileSync(join(root, "app/(site)/warranty/page.tsx"), "utf8");
for (const m of warranty.matchAll(/(?:title|body): "((?:[^"\\]|\\.)*)"/g)) add(unquote(m[1]), "app/(site)/warranty/page.tsx");
const api = readFileSync(join(root, "lib/api.ts"), "utf8");
for (const m of api.matchAll(/labelEn: "((?:[^"\\]|\\.)*)"/g)) add(unquote(m[1]), "lib/api.ts");
const catalog = readFileSync(join(root, "lib/catalog.ts"), "utf8");
const cats = catalog.slice(catalog.indexOf("export const CATEGORIES"), catalog.indexOf("];", catalog.indexOf("export const CATEGORIES")));
for (const m of cats.matchAll(/label: "((?:[^"\\]|\\.)*)"/g)) add(unquote(m[1]), "lib/catalog.ts");
for (const m of cats.matchAll(/\["((?:[^"\\]|\\.)*)", "((?:[^"\\]|\\.)*)"\]/g)) { add(unquote(m[1]), "lib/catalog.ts"); add(unquote(m[2]), "lib/catalog.ts"); }

const table = name => {
  const text = readFileSync(join(root, `lib/i18n/${name}.ts`), "utf8");
  const found = new Set();
  for (const m of text.matchAll(/^\s*"((?:[^"\\]|\\.)*)":/gm)) found.add(unquote(m[1]));
  return found;
};
const placeholders = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(",");

if (process.argv.includes("--list")) { for (const [k, f] of keys) console.log(`${f}\t${k}`); process.exit(0); }

let problems = 0;
for (const lang of ["fa", "ar"]) {
  const have = table(lang);
  const text = readFileSync(join(root, `lib/i18n/${lang}.ts`), "utf8");
  const missing = [...keys.keys()].filter(k => !have.has(k));
  for (const k of missing) console.log(`${lang} missing: ${JSON.stringify(k)}  (${keys.get(k)})`);
  for (const m of text.matchAll(/^\s*"((?:[^"\\]|\\.)*)":\s*"((?:[^"\\]|\\.)*)"/gm)) {
    const [k, v] = [unquote(m[1]), unquote(m[2])];
    // A translation may leave a value out (Arabic writes "one product" for {n} = 1) but never invent one.
    const allowed = new Set(placeholders(k).split(","));
    if (placeholders(v).split(",").some(p => p && !allowed.has(p))) { console.log(`${lang} unknown placeholder: ${JSON.stringify(k)}`); problems++; }
    if (placeholders(k) !== placeholders(v) && !/^\{n\} /.test(k)) { console.log(`${lang} placeholders differ: ${JSON.stringify(k)}`); problems++; }
  }
  problems += missing.length;
}
console.log(`${keys.size} strings; ${problems} problem(s).`);
process.exit(problems ? 1 : 0);
