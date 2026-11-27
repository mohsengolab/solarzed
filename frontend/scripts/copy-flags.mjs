// Copies the country flags (from the country-flag-icons package) to public/flags for the country picker.
// Usage: node scripts/copy-flags.mjs
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const from = fileURLToPath(new URL("../node_modules/country-flag-icons/3x2/", import.meta.url));
const to = fileURLToPath(new URL("../public/flags/", import.meta.url));
mkdirSync(to, { recursive: true });
const files = readdirSync(from).filter(f => /^[A-Z]{2}\.svg$/.test(f));
for (const f of files) copyFileSync(from + f, to + f);
console.log(`Copied ${files.length} flags to public/flags`);
