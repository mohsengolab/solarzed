export type QrPrintItem = { qr: string; alt: string; title: string; lines: string[]; footer: string };

// Prints a single QR code large on a plain page, with its code under it — no label layout.
export async function printQrImage(docTitle: string, qr: string, caption: string, heading?: string) {
  const popup = window.open("", "_blank");
  if (!popup) throw new Error("Allow the print preview window in your browser.");
  popup.opener = null;
  const doc = popup.document;
  doc.title = docTitle;
  const style = doc.createElement("style");
  style.textContent = `@page{margin:15mm}body{margin:0;font-family:Arial,sans-serif;color:#000;background:#fff}main{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6mm;padding-top:20mm}img{width:120mm;height:120mm;image-rendering:pixelated}code{font:700 16pt monospace;letter-spacing:.05em}h1{margin:0;font:700 22pt monospace;letter-spacing:.05em}`;
  doc.head.append(style);
  const main = doc.createElement("main");
  const image = doc.createElement("img"); image.src = qr; image.alt = caption;
  const code = doc.createElement("code"); code.textContent = caption;
  if (heading) { const title = doc.createElement("h1"); title.textContent = heading; main.append(title); }
  main.append(image, code);
  doc.body.append(main);
  await image.decode();
  popup.focus();
  popup.print();
}

// Opens a print window with one label per page, sized for a label printer or cut sheet.
export async function printQrLabels(docTitle: string, widthMm: number, heightMm: number, items: QrPrintItem[]) {
  const popup = window.open("", "_blank");
  if (!popup) throw new Error("Allow the print preview window in your browser.");
  popup.opener = null;
  popup.document.title = docTitle;
  const qrSize = Math.min(heightMm - 8, widthMm * .48, 42);
  const style = popup.document.createElement("style");
  style.textContent = `@page{size:${widthMm}mm ${heightMm}mm;margin:0}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#000;background:#fff}.label{width:${widthMm}mm;height:${heightMm}mm;padding:3mm;display:flex;align-items:center;gap:2.5mm;break-after:page;overflow:hidden}.label:last-child{break-after:auto}.label img{width:${qrSize}mm;height:${qrSize}mm;flex:none}.copy{min-width:0}h1{font-size:12pt;margin:0 0 1.5mm;letter-spacing:.06em}b{display:block;font-size:7.5pt;margin-bottom:1mm}p{font-size:7.5pt;line-height:1.3;margin:.6mm 0;overflow-wrap:anywhere}code{display:block;font:700 7pt monospace;margin:1mm 0;overflow-wrap:anywhere}small{display:block;font-size:6pt;margin-top:1mm}`;
  popup.document.head.append(style);
  for (const item of items) {
    const doc = popup.document;
    const section = doc.createElement("section"); section.className = "label";
    const image = doc.createElement("img"); image.src = item.qr; image.alt = item.alt;
    const copy = doc.createElement("div"); copy.className = "copy";
    const add = (tag: string, text: string) => { const el = doc.createElement(tag); el.textContent = text; copy.append(el); };
    add("h1", "SOLARZED");
    add("b", item.title);
    item.lines.forEach((line, i) => add(i === 0 ? "code" : "p", line));
    add("small", item.footer);
    section.append(image, copy);
    doc.body.append(section);
  }
  await Promise.all(Array.from(popup.document.images).map(image => image.decode()));
  popup.focus();
  popup.print();
}
