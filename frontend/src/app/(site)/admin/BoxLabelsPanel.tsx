"use client";

import { useEffect, useState, FormEvent } from "react";
import QRCode from "qrcode";
import { adminBoxLabels, adminRolls, adminGetSettings, issueBoxLabels, releaseRoll, saveLabelSite, BoxLabel } from "@/lib/api";
import styles from "./admin.module.css";
import labelsStyle from "./labels.module.css";

type Roll = { id: string; modelCode: string; type: "tint" | "ppf"; qc: string; status: string };
type CoverageSettings = { durations: Record<"tint" | "ppf", { film: number | null; install: number | null }> };
const message = (error: unknown) => error instanceof Error ? error.message : "The request failed.";

export default function BoxLabelsPanel({ onSettings }: { onSettings: () => void }) {
  const [labels, setLabels] = useState<BoxLabel[]>([]);
  const [rolls, setRolls] = useState<Roll[]>([]);
  const [rollId, setRollId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [site, setSite] = useState("https://solarzed.com");
  const [smsReady, setSmsReady] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [width, setWidth] = useState(80);
  const [height, setHeight] = useState(50);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [coverage, setCoverage] = useState<CoverageSettings | null>(null);

  async function load() {
    const [result, inventory, settings] = await Promise.all([adminBoxLabels(), adminRolls(), adminGetSettings()]);
    setCoverage(settings as CoverageSettings);
    setLabels(result.labels); setSite(result.siteUrl); setSmsReady(result.smsConfigured);
    setRolls(inventory as Roll[]); setLoaded(true);
  }
  useEffect(() => {
    Promise.all([adminBoxLabels(), adminRolls(), adminGetSettings()]).then(([result, inventory, settings]) => {
      setCoverage(settings as CoverageSettings);
      setLabels(result.labels); setSite(result.siteUrl); setSmsReady(result.smsConfigured);
      setRolls(inventory as Roll[]); setLoaded(true);
    }).catch(ex => setError(message(ex)));
  }, []);
  useEffect(() => {
    let cancelled = false;
    Promise.all(labels.filter(label => selected.includes(label.id)).map(async label =>
      [label.id, await QRCode.toDataURL(label.activationUrl, { errorCorrectionLevel: "M", margin: 4, scale: 8 })] as const
    )).then(entries => { if (!cancelled) setPreviews(Object.fromEntries(entries)); }).catch(ex => { if (!cancelled) setError(message(ex)); });
    return () => { cancelled = true; };
  }, [labels, selected]);

  async function create(event: FormEvent) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const result = await issueBoxLabels(rollId, quantity);
      await load(); setSelected(result.labels.map(label => label.id));
    } catch (ex) { setError(message(ex)); } finally { setBusy(false); }
  }

  async function print() {
    setError("");
    const chosen = labels.filter(label => selected.includes(label.id) && !label.activatedAt);
    if (width < 60 || width > 150 || height < 40 || height > 150 || !Number.isFinite(width + height)) {
      setError("Label size must be 60–150 mm wide and 40–150 mm high."); return;
    }
    if (!chosen.length || chosen.some(label => !previews[label.id])) { setError("Select unused labels and wait for their QR previews."); return; }
    const popup = window.open("", "_blank");
    if (!popup) { setError("Allow the print preview window in your browser."); return; }
    popup.opener = null;
    popup.document.title = "Solarzed carton labels";
    const style = popup.document.createElement("style");
    const qrSize = Math.min(height - 8, width * .48, 42);
    style.textContent = `@page{size:${width}mm ${height}mm;margin:0}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#000;background:#fff}.label{width:${width}mm;height:${height}mm;padding:3mm;display:flex;align-items:center;gap:2mm;break-after:page;overflow:hidden}.label:last-child{break-after:auto}.label img{width:${qrSize}mm;height:${qrSize}mm;flex:none}.copy{min-width:0}h1{font-size:13pt;margin:0 0 2mm}p{font-size:8pt;line-height:1.3;margin:1mm 0;overflow-wrap:anywhere}b{font-size:8pt}small{font-size:6pt}`;
    popup.document.head.append(style);
    chosen.forEach(label => {
      const section = popup.document.createElement("section"); section.className = "label";
      const image = popup.document.createElement("img"); image.src = previews[label.id]; image.alt = `Activate ${label.id}`;
      const copy = popup.document.createElement("div"); copy.className = "copy";
      for (const [tag, text] of [["h1", "SOLARZED"], ["b", "Scan to activate warranty"], ["p", `${label.product} · ${label.type.toUpperCase()}`], ["p", label.id], ["small", new URL(label.activationUrl).host]]) {
        const element = popup.document.createElement(tag); element.textContent = text; copy.append(element);
      }
      section.append(image, copy); popup.document.body.append(section);
    });
    await Promise.all(Array.from(popup.document.images).map(image => image.decode()));
    popup.focus(); popup.print();
  }

  const roll = rolls.find(item => item.id === rollId);
  const period = roll && coverage?.durations[roll.type];
  const validSelection = labels.filter(label => selected.includes(label.id) && !label.activatedAt);
  return (
    <section>
      <header className={styles.panelHead}><div><span className={styles.eyebrow}>CARTON QR LABELS</span><h1>Box warranty activation</h1></div></header>
      {error && <p role="alert" className={labelsStyle.error}>{error}</p>}
      {loaded && !smsReady && <p role="status" className={labelsStyle.notice}>SMS is not configured yet. QR labels can be prepared, but customers cannot activate until Faraz is connected.</p>}
      <div className={labelsStyle.columns}>
        <form className={`${styles.card} ${styles.adminForm}`} onSubmit={create}>
          <h2>Create unique box labels</h2>
          <p className={labelsStyle.help}>One code per box. Print carton labels while the product is in stock. Coverage is copied from Settings.</p>
          <label>Product roll<select required value={rollId} onChange={event => setRollId(event.target.value)}><option value="">Select a roll</option>{rolls.map(item => <option key={item.id} value={item.id}>{item.id} · {item.qc} · {item.status}</option>)}</select></label>
          {roll && !period?.film && <div className={labelsStyle.notice}>Set the approved warranty period for {roll.type === "tint" ? "window film" : "PPF"} before generating labels. <button type="button" className={styles.ghost} onClick={onSettings}>Open coverage settings</button></div>}
          {roll?.qc === "approved" && roll.status === "instock" && <><p className={labelsStyle.help}>You can generate and print QR labels now. Mark the roll as shipped when it is ready for customers to activate.</p><button type="button" className={styles.ghost} disabled={busy} onClick={async () => { setBusy(true); setError(""); try { await releaseRoll(roll.id); await load(); } catch (ex) { setError(message(ex)); } finally { setBusy(false); } }}>Mark roll as shipped — enable customer activation</button></>}
          <label>Number of boxes<input type="number" min={1} max={200} required value={quantity} onChange={event => setQuantity(Number(event.target.value))} /></label>
          <button className={styles.btnPrimary} disabled={busy || !loaded || !roll || !period?.film || roll.qc !== "approved" || roll.status === "void"}>{busy ? "Working…" : "Generate QR labels"}</button>
        </form>
        <div className={`${styles.card} ${styles.adminForm}`}>
          <h2>Print setup</h2>
          <label>Public website<input type="url" value={site} onChange={event => setSite(event.target.value)} /></label>
          <button type="button" className={styles.ghost} disabled={busy || !loaded} onClick={async () => { setBusy(true); setError(""); try { await saveLabelSite(site); await load(); } catch (ex) { setError(message(ex)); } finally { setBusy(false); } }}>Save QR website</button>
          <div className={labelsStyle.sizes}><label>Width (mm)<input type="number" min={60} max={150} value={width} onChange={event => setWidth(Number(event.target.value))} /></label><label>Height (mm)<input type="number" min={40} max={150} value={height} onChange={event => setHeight(Number(event.target.value))} /></label></div>
          <p className={labelsStyle.help}>Use matching paper dimensions, 100% scale and no browser headers/footers. The printed link opens solarzed.com, so the activation page must be deployed there.</p>
          <button type="button" className={styles.btnPrimary} onClick={() => { print().catch(ex => setError(message(ex))); }} disabled={busy || !validSelection.length || validSelection.some(label => !previews[label.id])}>Print selected labels ({validSelection.length})</button>
        </div>
      </div>
      <div className={`${styles.card} ${labelsStyle.list}`}>
        <h2>Issued labels</h2>
        <div className={labelsStyle.scroll}><table className={styles.table}><thead><tr><th>Select</th><th>Box serial</th><th>Product / roll</th><th>Status</th><th>Warranty</th></tr></thead><tbody>{labels.map(label => <tr key={label.id}>
          <td><input aria-label={`Select ${label.id}`} type="checkbox" disabled={!!label.activatedAt} checked={selected.includes(label.id)} onChange={event => setSelected(items => event.target.checked ? [...items, label.id] : items.filter(id => id !== label.id))} /></td><td><code>{label.id}</code></td><td>{label.product}<br /><small>{label.rollId}</small></td><td>{label.activatedAt ? "Activated" : rolls.find(item => item.id === label.rollId)?.status === "instock" ? "Awaiting shipment" : "Unused"}</td><td>{label.warrantyCode ?? "—"}</td>
        </tr>)}</tbody></table></div>
        {loaded && !labels.length && <p className={styles.empty}>No box labels issued yet.</p>}
      </div>
      <div className={labelsStyle.previews}>{validSelection.map(label => <article key={label.id} className={labelsStyle.preview}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {previews[label.id] && <img src={previews[label.id]} alt={`QR for ${label.id}`} width={150} height={150} />}
        <div><b>SOLARZED</b><p>{label.product} · {label.type.toUpperCase()}</p><code>{label.id}</code><p>Scan → Verify mobile → Activate</p><a href={`/activate#${new URL(label.activationUrl).hash.slice(1)}`} target="_blank" rel="noreferrer">Local activation preview ↗</a></div>
      </article>)}</div>
    </section>
  );
}
