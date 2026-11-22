"use client";

import { useEffect, useState, FormEvent } from "react";
import { boxHistory, boxHolders, transferBoxes, BoxHistory, HolderSummary, fa } from "@/lib/api";
import styles from "./admin.module.css";
import labelsStyle from "./labels.module.css";
import SerialInput from "@/components/SerialInput";

// Server messages for a rejected batch embed serials and names, so translate the fixed fragments only.
const FRAGMENTS: [string, string][] = [
  ["Transfer rejected.", "انتقال رد شد."], ["already activated on a vehicle", "روی خودرو فعال شده"],
  ["product is void", "محصول باطل شده"], ["held by", "در دست"], ["already with", "از قبل در دست"],
  ["central warehouse", "انبار مرکزی"], ["not in your account", "در حساب شما نیست"],
  ["Enter the receiver's mobile number.", "شماره موبایل گیرنده را وارد کنید."], ["Enter a valid mobile number.", "شماره موبایل معتبر نیست."], ["Invalid box serial:", "سریال نامعتبر:"], ["Box serial not found:", "سریال یافت نشد:"],
];
const message = (error: unknown) => {
  const text = error instanceof Error ? error.message : "The request failed.";
  const direct = fa(text);
  return direct !== text ? direct : FRAGMENTS.reduce((acc, [en, faText]) => acc.split(en).join(faText), text);
};
// A holder is a mobile (representative/shop account) with an optional display name; none = central warehouse.
const holderName = (holder: string | null, phone?: string | null) =>
  holder && phone && holder !== phone ? `${holder} (${phone})` : holder ?? phone ?? fa("Central warehouse");
const date = (value: string) => new Date(value).toLocaleString("fa-IR");
const ANY = "__any__", WAREHOUSE = "__warehouse__";

export default function BoxTransfers({ selected = [], onChanged }: { selected?: string[]; onChanged: () => void }) {
  const [list, setSerials] = useState<string[]>([]);
  const [from, setFrom] = useState(ANY);
  const [to, setTo] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [toWarehouse, setToWarehouse] = useState(false);
  const [holders, setHolders] = useState<HolderSummary[]>([]);
  const [lookup, setLookup] = useState("");
  const [history, setHistory] = useState<BoxHistory | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const loadHolders = () => boxHolders().then(result => setHolders(result.holders)).catch(ex => setError(message(ex)));
  useEffect(() => { loadHolders(); }, []);


  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setDone(""); setBusy(true);
    try {
      const result = await transferBoxes({
        serials: list, toHolder: toWarehouse ? null : to || null, toWarehouse, toPhone: toWarehouse ? null : phone, note: note || null,
        expectedFrom: from === ANY ? null : from === WAREHOUSE ? "" : from,
      });
      setDone(`${result.transfers.length.toLocaleString("fa-IR")} ${fa("boxes transferred")} → ${holderName(result.toHolder, result.toPhone)} · ${fa("Transfer number")}: ${result.batchId}`);
      setSerials([]); setNote(""); setTo(""); setPhone("");
      await loadHolders(); onChanged();
      if (history && result.transfers.some(t => t.labelId === history.id)) setHistory(await boxHistory(history.id));
    } catch (ex) { setError(message(ex)); } finally { setBusy(false); }
  }

  async function showHistory(serial: string) {
    setError(""); setLookup(serial);
    try { setHistory(await boxHistory(serial)); } catch (ex) { setHistory(null); setError(message(ex)); }
  }

  const named = holders.filter(h => h.holder !== null || h.phone !== null);

  return (
    <div className={labelsStyle.list}>
      <header className={styles.panelHead}><div><span className={styles.eyebrow}>{fa("BOX TRANSFERS")}</span><h2>{fa("Move boxes by carton serial")}</h2></div></header>
      {error && <p role="alert" className={labelsStyle.error}>{error}</p>}
      {done && <p role="status" className={labelsStyle.notice}>{done}</p>}
      <div className={labelsStyle.columns}>
        <form className={`${styles.card} ${styles.adminForm}`} onSubmit={submit}>
          <SerialInput label="سریال کارتن‌ها (Roll No؛ با بارکدخوان، تایپ یا فایل اکسل)" value={list} onChange={setSerials} />
          {selected.length > 0 && <button type="button" className={styles.ghost} onClick={() => setSerials([...new Set([...list, ...selected])])}>{fa("Use selected boxes")} ({selected.length.toLocaleString("fa-IR")})</button>}
          <label>{fa("Current holder (safety check)")}
            <select value={from} onChange={e => setFrom(e.target.value)}>
              <option value={ANY}>{fa("Any holder — no check")}</option>
              <option value={WAREHOUSE}>{fa("Central warehouse")}</option>
              {named.map(h => <option key={`${h.phone}|${h.holder}`} value={h.phone ?? h.holder ?? ""}>{holderName(h.holder, h.phone)}</option>)}
            </select>
          </label>
          <label><input type="checkbox" checked={toWarehouse} onChange={e => setToWarehouse(e.target.checked)} /> {fa("Return to central warehouse")}</label>
          {!toWarehouse && <label>موبایل نماینده / گیرنده (با همین موبایل وارد سایت می‌شود و کارتن‌ها را می‌بیند)<input dir="ltr" required inputMode="tel" maxLength={20} list="box-holder-phones" value={phone} onChange={e => setPhone(e.target.value)} placeholder="09…" /></label>}
          <datalist id="box-holder-phones">{named.filter(h => h.phone).map(h => <option key={h.phone!} value={h.phone!}>{h.holder ?? ""}</option>)}</datalist>
          {!toWarehouse && <label>نام نماینده / گیرنده (اختیاری)<input maxLength={200} value={to} onChange={e => setTo(e.target.value)} /></label>}
          <label>{fa("Note (optional)")}<input maxLength={500} value={note} onChange={e => setNote(e.target.value)} /></label>
          <button className={styles.btnPrimary} disabled={busy || !list.length || (!toWarehouse && !phone.trim())}>{busy ? fa("Working…") : `${fa("Record transfer")} (${list.length.toLocaleString("fa-IR")})`}</button>
        </form>
        <div className={styles.card}>
          <h2>{fa("Who holds the boxes")}</h2>
          <table className={styles.table}><thead><tr><th>{fa("Holder")}</th><th>{fa("Boxes")}</th></tr></thead>
            <tbody>{holders.map(h => <tr key={`${h.phone}|${h.holder}`}>
              <td><button type="button" className={styles.ghost} onClick={() => setFrom(h.phone ?? h.holder ?? WAREHOUSE)}>{holderName(h.holder, h.phone)}</button></td>
              <td>{h.boxes.toLocaleString("fa-IR")}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </div>
      <div className={`${styles.card} ${labelsStyle.list}`}>
        <h2>{fa("Box history")}</h2>
        <form className={labelsStyle.sizes} onSubmit={e => { e.preventDefault(); showHistory(lookup); }}>
          <input dir="ltr" required placeholder="CPT30614374" value={lookup} onChange={e => setLookup(e.target.value)} />
          <button className={styles.ghost}>{fa("Show history")}</button>
        </form>
        {history && <>
          <p className={labelsStyle.help}><code dir="ltr">{history.id}</code> · {history.product} · {fa("Holder")}: <b>{holderName(history.holder, history.holderPhone)}</b>{history.activated && <> · {fa("Activated on a vehicle")}</>}</p>
          {history.transfers.length ? <div className={labelsStyle.scroll}><table className={styles.table}>
            <thead><tr><th>{fa("Date")}</th><th>{fa("From")}</th><th>{fa("To")}</th><th>{fa("By")}</th><th>{fa("Note (optional)")}</th></tr></thead>
            <tbody>{history.transfers.map(t => <tr key={t.id}>
              <td>{date(t.at)}<br /><small dir="ltr">{t.batchId}</small></td><td>{holderName(t.fromHolder, t.fromPhone)}</td>
              <td>{holderName(t.toHolder, t.toPhone)}</td><td>{t.actor}</td><td>{t.note ?? "—"}</td>
            </tr>)}</tbody>
          </table></div> : <p className={styles.empty}>{fa("No transfers recorded for this box.")}</p>}
        </>}
      </div>
    </div>
  );
}

export { holderName };
