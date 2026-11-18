"use client";

import { useEffect, useState, FormEvent } from "react";
import QRCode from "qrcode";
import { adminBoxLabels, adminRolls, adminGetSettings, issueBoxLabels, releaseRoll, saveLabelSite, BoxLabel, fa } from "@/lib/api";
import styles from "./admin.module.css";
import labelsStyle from "./labels.module.css";
import BoxTransfers, { holderName } from "./BoxTransfers";
import { printQrLabels } from "./qrPrint";
import { printBarcodeLabels } from "./barcode";

type Role = "superadmin" | "admin" | "carton";
type Roll = { id: string; modelCode: string; type: "tint" | "ppf"; qc: string; status: string; supplier: string; lengthM: number | null };
type CoverageSettings = { durations: Record<"tint" | "ppf", { film: number | null; install: number | null }> };
const message = (error: unknown) => error instanceof Error ? fa(error.message) : fa("The request failed.");

export default function BoxLabelsPanel({ onSettings, role }: { onSettings: () => void; role: Role }) {
  const canManage = role !== "carton";
  const [labels, setLabels] = useState<BoxLabel[]>([]);
  const [rolls, setRolls] = useState<Roll[]>([]);
  const [rollId, setRollId] = useState("");
  const [serialText, setSerialText] = useState("");
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
    const result = await adminBoxLabels();
    setLabels(result.labels); setSite(result.siteUrl); setSmsReady(result.smsConfigured);
    if (canManage) {
      const [inventory, settings] = await Promise.all([adminRolls(), adminGetSettings()]);
      setCoverage(settings as CoverageSettings);
      setRolls(inventory as Roll[]);
    }
    setLoaded(true);
  }
  useEffect(() => {
    Promise.resolve().then(load).catch(ex => { setError(message(ex)); setLoaded(true); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!canManage) return;
    let cancelled = false;
    Promise.all(labels.filter(label => selected.includes(label.id) && label.activationUrl).map(async label =>
      [label.id, await QRCode.toDataURL(label.activationUrl!, { errorCorrectionLevel: "M", margin: 4, scale: 8 })] as const
    )).then(entries => { if (!cancelled) setPreviews(Object.fromEntries(entries)); }).catch(ex => { if (!cancelled) setError(message(ex)); });
    return () => { cancelled = true; };
  }, [labels, selected, canManage]);

  async function create(event: FormEvent) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const result = await issueBoxLabels(rollId, serials);
      setSerialText("");
      await load(); setSelected(result.labels.map(label => label.id));
    } catch (ex) { setError(message(ex)); } finally { setBusy(false); }
  }

  const sizeOk = () => {
    if (width < 60 || width > 150 || height < 40 || height > 150 || !Number.isFinite(width + height)) {
      setError(fa("Label size must be 60–150 mm wide and 40–150 mm high.")); return false;
    }
    return true;
  };
  const validSelection = labels.filter(label => selected.includes(label.id) && !label.activatedAt);

  // Outside of the carton: barcode of the box serial only, used for every hand-over.
  async function printBarcodes() {
    setError("");
    if (!sizeOk()) return;
    if (!validSelection.length) { setError("کارتن‌های موردنظر را انتخاب کنید."); return; }
    await printBarcodeLabels(width, height, validSelection.map(label => ({ serial: label.id, lines: [`${label.product} · ${label.type.toUpperCase()}`] })));
  }

  // Inside the carton: warranty card with the QR (carton roll number + 7-digit warranty code). Only the box opener sees it.
  async function printCards() {
    setError("");
    if (!sizeOk()) return;
    const chosen = validSelection.filter(label => label.activationUrl);
    if (!chosen.length || chosen.some(label => !previews[label.id])) { setError(fa("Select unused labels and wait for their QR previews.")); return; }
    await printQrLabels("Solarzed warranty cards", width, height, chosen.map(label => ({
      qr: previews[label.id], alt: `Warranty card ${label.id}`, title: "Scan to activate your warranty",
      lines: [`${label.product} · ${label.type.toUpperCase()}`, `Roll No ${label.id}`,
        ...(label.cardCode ? [`Warranty code ${label.cardCode}`] : [label.fullCode ?? label.id])],
      footer: `${new URL(label.activationUrl!).host}/activate`,
    })));
  }

  // One roll number per line (a barcode scanner types the number and presses Enter).
  const serials = [...new Set(serialText.split(/[\s,]+/).map(item => item.trim().toUpperCase()).filter(Boolean))];
  const roll = rolls.find(item => item.id === rollId);
  const validSupplier = !!roll && /^[A-Za-z]{3}$/.test(roll.supplier.trim());
  const period = roll && coverage?.durations[roll.type];
  const selectBox = (label: BoxLabel) => <input aria-label={`${fa("Select")} ${label.id}`} type="checkbox" disabled={!!label.activatedAt} checked={selected.includes(label.id)} onChange={event => setSelected(items => event.target.checked ? [...items, label.id] : items.filter(id => id !== label.id))} />;
  const sizeFields = <div className={labelsStyle.sizes}><label>{fa("Width (mm)")}<input type="number" min={60} max={150} value={width} onChange={event => setWidth(Number(event.target.value))} /></label><label>{fa("Height (mm)")}<input type="number" min={40} max={150} value={height} onChange={event => setHeight(Number(event.target.value))} /></label></div>;
  const barcodeButton = <button type="button" className={styles.btnPrimary} onClick={() => { printBarcodes().catch(ex => setError(message(ex))); }} disabled={busy || !validSelection.length}>چاپ بارکد روی کارتن ({validSelection.length.toLocaleString("fa-IR")})</button>;

  // Carton operators see the box serial only: they can print the outside barcode but never the warranty card.
  if (!canManage) {
    return (
      <section>
        <header className={styles.panelHead}><div><span className={styles.eyebrow}>بارکد کارتن</span><h1>{fa("Box serials")}</h1></div>
          <button type="button" className={styles.ghost} onClick={() => load().catch(ex => setError(message(ex)))}>{fa("Refresh")}</button>
        </header>
        {error && <p role="alert" className={labelsStyle.error}>{error}</p>}
        <div className={`${styles.card} ${styles.adminForm}`}>
          <h2>چاپ بارکد سریال روی کارتن</h2>
          {sizeFields}
          {barcodeButton}
        </div>
        <div className={`${styles.card} ${labelsStyle.list}`}>
          <h2>فقط سریال کارتن (بدون کارت گارانتی و کد گارانتی)</h2>
          <div className={labelsStyle.scroll}><table className={styles.table}>
            <thead><tr><th>{fa("Select")}</th><th>{fa("Box serial")}</th><th>{fa("Status")}</th><th>{fa("Holder")}</th></tr></thead>
            <tbody>{labels.map(label => <tr key={label.id}>
              <td>{selectBox(label)}</td>
              <td><code dir="ltr">{label.id}</code></td>
              <td>{label.activatedAt ? fa("Activated") : "صادر شده"}</td>
              <td>{holderName(label.holder, label.holderPhone)}</td>
            </tr>)}</tbody>
          </table></div>
          {loaded && !labels.length && <p className={styles.empty}>{fa("No box labels issued yet.")}</p>}
        </div>
        <BoxTransfers selected={validSelection.map(label => label.id)} onChanged={() => { load().catch(ex => setError(message(ex))); }} />
      </section>
    );
  }

  return (
    <section>
      <header className={styles.panelHead}><div><span className={styles.eyebrow}>بارکد کارتن و کارت گارانتی</span><h1>برچسب کارتن و کارت گارانتی</h1></div></header>
      {error && <p role="alert" className={labelsStyle.error}>{error}</p>}
      {loaded && !smsReady && <p role="status" className={labelsStyle.notice}>پیامک هنوز متصل نیست. برچسب‌ها و کارت‌ها را می‌توانید آماده کنید، اما نمایندگان و مشتریان تا اتصال پیامک نمی‌توانند وارد سایت شوند.</p>}
      <div className={labelsStyle.columns}>
        <form className={`${styles.card} ${styles.adminForm}`} onSubmit={create}>
          <h2>ساخت برچسب برای کارتن‌ها</h2>
          <p className={labelsStyle.help}>بارکد Roll No روی هر کارتن را اسکن کنید (مثلاً CPT30614374). برای هر کارتن یک کارت گارانتی با کد ۷ رقمی ساخته می‌شود که داخل همان کارتن قرار می‌گیرد. دورهٔ گارانتی از تنظیمات کپی می‌شود.</p>
          <label>{fa("Product roll")}<select required value={rollId} onChange={event => setRollId(event.target.value)}><option value="">{fa("Select a roll")}</option>{rolls.map(item => <option key={item.id} value={item.id}>{item.id} · {item.qc} · {item.status}</option>)}</select></label>
          {roll && !period?.film && <div className={labelsStyle.notice}>{fa("Set the approved warranty period for")} {roll.type === "tint" ? fa("Window film") : "PPF"} {fa("before generating labels.")} <button type="button" className={styles.ghost} onClick={onSettings}>{fa("Open coverage settings")}</button></div>}
          {roll?.qc === "approved" && roll.status === "instock" && <><p className={labelsStyle.help}>{fa("You can generate and print QR labels now. Mark the roll as shipped when it is ready for customers to activate.")}</p><button type="button" className={styles.ghost} disabled={busy} onClick={async () => { setBusy(true); setError(""); try { await releaseRoll(roll.id); await load(); } catch (ex) { setError(message(ex)); } finally { setBusy(false); } }}>{fa("Mark roll as shipped — enable customer activation")}</button></>}
          {roll && <p className={labelsStyle.help}>{validSupplier ? <>کد کارخانه (از تأمین‌کنندهٔ رول): <code dir="ltr">{roll.supplier.trim().toUpperCase()}</code> — روی کارت چاپ نمی‌شود.</> : "کد سه‌حرفی تأمین‌کننده را در موجودی رول اصلاح کنید."} {(roll.lengthM ?? 0) > 0 ? ` طول هر رول: ${roll.lengthM} متر.` : " طول رول را در موجودی ثبت کنید."}</p>}
          <label>Roll No کارتن‌ها (هر خط یکی، با بارکدخوان) — {serials.length.toLocaleString("fa-IR")} کارتن<textarea dir="ltr" rows={5} required value={serialText} onChange={event => setSerialText(event.target.value)} placeholder={"CPT30614374\nCPT30614375"} /></label>
          <button className={styles.btnPrimary} disabled={busy || !loaded || !roll || !period?.film || roll.qc !== "approved" || roll.status === "void" || !validSupplier || !(roll.lengthM && roll.lengthM > 0) || !serials.length || serials.length > 200}>{busy ? fa("Working…") : "ساخت برچسب و کارت گارانتی"}</button>
        </form>
        <div className={`${styles.card} ${styles.adminForm}`}>
          <h2>{fa("Print setup")}</h2>
          <label>{fa("Public website")}<input type="url" dir="ltr" value={site} onChange={event => setSite(event.target.value)} /></label>
          <button type="button" className={styles.ghost} disabled={busy || !loaded} onClick={async () => { setBusy(true); setError(""); try { await saveLabelSite(site); await load(); } catch (ex) { setError(message(ex)); } finally { setBusy(false); } }}>{fa("Save QR website")}</button>
          {sizeFields}
          <p className={labelsStyle.help}>بارکد Roll No که روی کارتن چاپ شده برای انتقال به نماینده و نفرات بعدی است؛ برای کارتن‌هایی که این بارکد را ندارند می‌توانید بارکد چاپ کنید. کارت گارانتی داخل کارتن گذاشته می‌شود؛ QR آن Roll No + کد ۷ رقمی گارانتی است و سایت {site.replace(/^https:\/\//, "")} را باز می‌کند. کاغذ هم‌اندازه، مقیاس ۱۰۰٪ و بدون سربرگ/پاورقی مرورگر چاپ کنید.</p>
          {barcodeButton}
          <button type="button" className={styles.btnPrimary} onClick={() => { printCards().catch(ex => setError(message(ex))); }} disabled={busy || !validSelection.length || validSelection.some(label => !previews[label.id])}>چاپ کارت گارانتی داخل کارتن ({validSelection.length.toLocaleString("fa-IR")})</button>
        </div>
      </div>
      <div className={`${styles.card} ${labelsStyle.list}`}>
        <h2>{fa("Issued labels")}</h2>
        <div className={labelsStyle.scroll}><table className={styles.table}><thead><tr><th>{fa("Select")}</th><th>{fa("Box serial")}</th><th>کد کارت گارانتی</th><th>{fa("Product / roll")}</th><th>مانده (متر)</th><th>{fa("Status")}</th><th>{fa("Holder")}</th><th>{fa("Warranty")}</th></tr></thead><tbody>{labels.map(label => <tr key={label.id}>
          <td>{selectBox(label)}</td><td><code dir="ltr">{label.id}</code></td><td><code dir="ltr">{label.fullCode ?? "—"}</code></td><td>{label.product}<br /><small>{label.rollId}</small></td><td>{label.remainingLengthM ?? "—"}</td><td>{label.activatedAt ? fa("Activated") : rolls.find(item => item.id === label.rollId)?.status === "instock" ? fa("Awaiting shipment") : fa("Unused")}</td><td>{holderName(label.holder, label.holderPhone)}</td><td><code dir="ltr">{label.warrantyCode ?? "—"}</code></td>
        </tr>)}</tbody></table></div>
        {loaded && !labels.length && <p className={styles.empty}>{fa("No box labels issued yet.")}</p>}
      </div>
      <BoxTransfers selected={validSelection.map(label => label.id)} onChanged={() => { load().catch(ex => setError(message(ex))); }} />
      <div className={labelsStyle.previews}>{validSelection.map(label => <article key={label.id} className={labelsStyle.preview}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {previews[label.id] && <img src={previews[label.id]} alt={`QR ${label.id}`} width={150} height={150} />}
        <div><b>SOLARZED · کارت گارانتی</b><p>{label.product} · {label.type.toUpperCase()}</p><code dir="ltr">{label.fullCode ?? label.id}</code><p>اسکن ← ورود با موبایل ← ثبت گارانتی</p>{label.activationUrl && <a href={`/activate#${new URL(label.activationUrl).hash.slice(1)}`} target="_blank" rel="noreferrer">پیش‌نمایش محلی فعال‌سازی ↗</a>}</div>
      </article>)}</div>
    </section>
  );
}
