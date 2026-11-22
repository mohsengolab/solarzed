// Reads carton Roll Nos from an Excel (.xlsx) or CSV/text file in the browser, without uploading the file anywhere.
// The Roll No column is the one headed "Roll No" (or similar); otherwise the column with the most valid serials.

export const SERIAL = /^[A-Z0-9][A-Z0-9-]{2,30}[A-Z0-9]$/;
export const normalizeSerial = (raw: string) => raw.replace(/\s+/g, "").toUpperCase();
const HEADER = /roll\s*[-_.]?\s*(no|num|number|#)|رول|serial|سریال/i;

type Grid = string[][];

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Minimal ZIP reader: returns the named entries' text (only what an .xlsx needs). */
async function unzip(buffer: ArrayBuffer, wanted: (name: string) => boolean): Promise<Map<string, string>> {
  const view = new DataView(buffer), bytes = new Uint8Array(buffer);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error("not a zip");
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const out = new Map<string, string>(), decoder = new TextDecoder();
  for (let n = 0; n < count && view.getUint32(at, true) === 0x02014b50; n++) {
    const method = view.getUint16(at + 10, true), size = view.getUint32(at + 20, true);
    const nameLen = view.getUint16(at + 28, true), extraLen = view.getUint16(at + 30, true), commentLen = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLen));
    at += 46 + nameLen + extraLen + commentLen;
    if (!wanted(name)) continue;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const raw = bytes.subarray(start, start + size);
    out.set(name, decoder.decode(method === 0 ? raw : method === 8 ? await inflate(raw) : new Uint8Array()));
  }
  return out;
}

const xml = (text: string) => new DOMParser().parseFromString(text, "application/xml");
const all = (node: Document | Element, tag: string) => Array.from(node.getElementsByTagNameNS("*", tag));
const columnIndex = (ref: string) => [...ref.replace(/\d+/g, "")].reduce((acc, ch) => acc * 26 + ch.charCodeAt(0) - 64, 0) - 1;

async function readXlsx(buffer: ArrayBuffer): Promise<Grid> {
  const files = await unzip(buffer, name => name === "xl/workbook.xml" || name === "xl/_rels/workbook.xml.rels" ||
    name === "xl/sharedStrings.xml" || name.startsWith("xl/worksheets/sheet"));
  // First sheet in workbook order, falling back to the first worksheet file.
  let sheetPath = "";
  const workbook = files.get("xl/workbook.xml"), rels = files.get("xl/_rels/workbook.xml.rels");
  if (workbook && rels) {
    const first = all(xml(workbook), "sheet")[0];
    const id = first && Array.from(first.attributes).find(a => a.localName === "id")?.value;
    const target = all(xml(rels), "Relationship").find(r => r.getAttribute("Id") === id)?.getAttribute("Target");
    if (target) sheetPath = target.startsWith("/") ? target.slice(1) : "xl/" + target.replace(/^\.\//, "");
  }
  const sheet = files.get(sheetPath) ?? [...files.entries()].filter(([name]) => name.startsWith("xl/worksheets/sheet")).sort()[0]?.[1];
  if (!sheet) throw new Error("no sheet");
  const shared = files.get("xl/sharedStrings.xml");
  const strings = shared ? all(xml(shared), "si").map(si => all(si, "t").map(t => t.textContent ?? "").join("")) : [];
  const grid: Grid = [];
  all(xml(sheet), "row").forEach((row, rowIndex) => {
    const r = Number(row.getAttribute("r") ?? rowIndex + 1) - 1;
    for (const cell of all(row, "c")) {
      const type = cell.getAttribute("t"), v = all(cell, "v")[0]?.textContent ?? "";
      const value = type === "s" ? strings[Number(v)] ?? "" : type === "inlineStr" ? all(cell, "t").map(t => t.textContent ?? "").join("") : v;
      const c = cell.getAttribute("r") ? columnIndex(cell.getAttribute("r")!) : (grid[r]?.length ?? 0);
      (grid[r] ??= [])[c] = value.trim();
    }
  });
  return grid;
}

const readText = (text: string): Grid => text.replace(/^﻿/, "").split(/\r?\n/).map(line => line.split(/[,;\t]/).map(x => x.replace(/^"|"$/g, "").trim()));

function pick(grid: Grid): string[] {
  const width = Math.max(0, ...grid.map(row => row?.length ?? 0));
  let column = -1, from = 0;
  for (let r = 0; r < Math.min(grid.length, 5) && column < 0; r++)
    grid[r]?.forEach((value, c) => { if (column < 0 && value && HEADER.test(value)) { column = c; from = r + 1; } });
  if (column < 0) {
    // No header: the column holding the most serial-looking values (with at least one digit).
    let best = 0;
    for (let c = 0; c < width; c++) {
      const hits = grid.filter(row => { const v = normalizeSerial(row?.[c] ?? ""); return SERIAL.test(v) && /\d/.test(v); }).length;
      if (hits > best) { best = hits; column = c; }
    }
  }
  if (column < 0) return [];
  return grid.slice(from).map(row => normalizeSerial(row?.[column] ?? "")).filter(Boolean);
}

/** Returns the valid Roll Nos (deduplicated, in file order) and the cells in that column that were not valid. */
export async function readRollNos(file: File): Promise<{ serials: string[]; invalid: string[] }> {
  const isXlsx = /\.xlsx$/i.test(file.name) || file.type.includes("spreadsheetml");
  if (/\.xls$/i.test(file.name)) throw new Error("old-xls");
  const values = pick(isXlsx ? await readXlsx(await file.arrayBuffer()) : readText(await file.text()));
  const serials = [...new Set(values.filter(v => SERIAL.test(v)))];
  return { serials, invalid: values.filter(v => !SERIAL.test(v)) };
}
