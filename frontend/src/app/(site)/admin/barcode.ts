// Code 128 (set B) barcode as an SVG data URL, for the box serial printed on the outside of the carton.
// Bar/space widths for symbol values 0–106 (106 = stop). Each symbol is 11 modules wide; stop is 13.
const PATTERNS = (
  "212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 " +
  "123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 " +
  "232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 " +
  "313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 " +
  "111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 " +
  "111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 " +
  "114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112"
).split(" ");
const START_B = 104, STOP = 106;

/** Symbol values for `text` in Code 128 set B, including start, checksum and stop. */
export function code128Values(text: string): number[] {
  const data = Array.from(text, ch => {
    const code = ch.charCodeAt(0);
    if (code < 32 || code > 126) throw new Error(`Character not supported in a barcode: ${ch}`);
    return code - 32;
  });
  const checksum = data.reduce((sum, value, i) => sum + value * (i + 1), START_B) % 103;
  return [START_B, ...data, checksum, STOP];
}

/** Bars as [x, width] in modules, with a 10-module quiet zone on each side. */
export function code128Bars(text: string): { bars: [number, number][]; width: number } {
  const bars: [number, number][] = [];
  let x = 10;
  for (const value of code128Values(text)) {
    Array.from(PATTERNS[value]).forEach((w, i) => { const width = Number(w); if (i % 2 === 0) bars.push([x, width]); x += width; });
  }
  return { bars, width: x + 10 };
}

export function code128Svg(text: string, height = 40): string {
  const { bars, width } = code128Bars(text);
  const rects = bars.map(([x, w]) => `<rect x="${x}" y="0" width="${w}" height="${height}"/>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" shape-rendering="crispEdges"><rect width="${width}" height="${height}" fill="#fff"/><g fill="#000">${rects}</g></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export type BarcodeItem = { serial: string; lines: string[] };

/** Opens a print window with one carton barcode label per page. */
export async function printBarcodeLabels(widthMm: number, heightMm: number, items: BarcodeItem[]) {
  const popup = window.open("", "_blank");
  if (!popup) throw new Error("Allow the print preview window in your browser.");
  popup.opener = null;
  const doc = popup.document;
  doc.title = "Solarzed carton barcodes";
  doc.documentElement.dir = "ltr";
  const style = doc.createElement("style");
  style.textContent = `@page{size:${widthMm}mm ${heightMm}mm;margin:0}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#000;background:#fff}.label{width:${widthMm}mm;height:${heightMm}mm;padding:3mm 4mm;display:flex;flex-direction:column;justify-content:center;gap:1.2mm;break-after:page;overflow:hidden}.label:last-child{break-after:auto}h1{font-size:11pt;margin:0;letter-spacing:.06em}img{width:100%;height:${Math.max(10, heightMm * .42)}mm;image-rendering:pixelated}code{font:700 10pt monospace;text-align:center;letter-spacing:.08em}p{font-size:7.5pt;margin:0;text-align:center}`;
  doc.head.append(style);
  for (const item of items) {
    const section = doc.createElement("section"); section.className = "label";
    const add = (tag: string, text: string) => { const el = doc.createElement(tag); el.textContent = text; section.append(el); };
    add("h1", "SOLARZED");
    const image = doc.createElement("img"); image.src = code128Svg(item.serial); image.alt = item.serial; section.append(image);
    add("code", item.serial);
    item.lines.forEach(line => add("p", line));
    doc.body.append(section);
  }
  await Promise.all(Array.from(doc.images).map(image => image.decode()));
  popup.focus();
  popup.print();
}
