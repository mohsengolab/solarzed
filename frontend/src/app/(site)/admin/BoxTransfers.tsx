"use client";

import { useEffect, useState, FormEvent } from "react";
import { adminRecipient, boxHistory, boxHolders, transferBoxes, managementFetch, BoxHistory, HolderSummary, fa, FA_DATE } from "@/lib/api";
import styles from "./admin.module.css";
import labelsStyle from "./labels.module.css";
import SerialInput from "@/components/SerialInput";
import { backdropProps } from "@/components/backdrop";

// Server messages for a rejected batch embed serials and names, so translate the fixed fragments only.
const FRAGMENTS: [string, string][] = [
  ["Transfer rejected.", "انتقال رد شد."], ["already activated on a vehicle", "روی خودرو فعال شده"],
  ["product is void", "محصول باطل شده"], ["held by", "در دست"], ["already with", "از قبل در دست"],
  ["central warehouse", "انبار مرکزی"], ["not in your account", "در حساب شما نیست"],
  ["Enter the receiver's mobile number.", "شماره موبایل گیرنده را وارد کنید."], ["Enter a valid mobile number.", "شماره موبایل معتبر نیست."], ["Invalid ROLL NO:", "ROLL NO نامعتبر:"], ["ROLL NO not found:", "ROLL NO یافت نشد:"],
];
const message = (error: unknown) => {
  const text = error instanceof Error ? error.message : "The request failed.";
  const direct = fa(text);
  return direct !== text ? direct : FRAGMENTS.reduce((acc, [en, faText]) => acc.split(en).join(faText), text);
};
// A holder is a mobile (representative/shop account) with an optional display name; none = central warehouse.
const holderName = (holder: string | null, phone?: string | null) =>
  holder && phone && holder !== phone ? `${holder} (${phone})` : holder ?? phone ?? fa("Central warehouse");
const date = (value: string) => new Date(value).toLocaleString(FA_DATE);
const n = (value: number) => value.toLocaleString("fa-IR");

/** ROLL NOs queued from the roll list («رول‌ها») for the transfer page. */
export const TRANSFER_QUEUE = "sz-transfer-queue";

/** Adds ROLL NOs to the transfer page's list and opens it («انتقال رول» in the menu). */
export function queueTransfer(rollNos: string[]) {
  try {
    const queued: string[] = JSON.parse(sessionStorage.getItem(TRANSFER_QUEUE) ?? "[]");
    sessionStorage.setItem(TRANSFER_QUEUE, JSON.stringify([...new Set([...queued, ...rollNos])]));
  } catch { /* storage unavailable */ }
  window.location.hash = "transfers";
}

/**
 * Sends rolls by ROLL NO to a seller's or installer's mobile (company → seller → installer). Rolls that come back
 * are returned with a separate action that asks which warehouse they go to.
 */
export default function BoxTransfers({ onChanged }: { onChanged?: () => void }) {
  // Rolls picked with «انتقال» in the roll list or the label page.
  const [list, setList] = useState<string[]>(() => {
    try { return typeof window === "undefined" ? [] : JSON.parse(sessionStorage.getItem(TRANSFER_QUEUE) ?? "[]"); } catch { return []; }
  });
  const [to, setTo] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [holders, setHolders] = useState<HolderSummary[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: number; name: string }[]>([]);
  const [returning, setReturning] = useState(false);
  const [warehouseId, setWarehouseId] = useState("");
  const [lookup, setLookup] = useState("");
  const [history, setHistory] = useState<BoxHistory | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  // The receiver's account name fills in once a full mobile is typed (as in the installer's transfer form).
  const [found, setFound] = useState<{ phone: string; name: string | null; registered: boolean } | null>(null);
  useEffect(() => {
    const value = phone.trim();
    if (!/^(?:0|\+?98)?9\d{9}$|^\+\d{8,15}$/.test(value.replace(/[\s-]/g, ""))) return;
    let live = true;
    const timer = window.setTimeout(() => {
      adminRecipient(value).then(r => {
        if (!live) return;
        const name = r.name ?? r.shopName ?? null;
        setFound({ phone: value, name, registered: r.registered });
        if (name) setTo(name);
      }).catch(() => { if (live) setFound(null); });
    }, 400);
    return () => { live = false; window.clearTimeout(timer); };
  }, [phone]);
  const recipient = found && found.phone === phone.trim() ? found : null;

  const loadHolders = () => boxHolders().then(result => setHolders(result.holders)).catch(ex => setError(message(ex)));
  useEffect(() => {
    loadHolders();
    managementFetch<{ warehouses: { id: number; name: string }[] }>("locations").then(r => setWarehouses(r.warehouses)).catch(() => {});
    try { sessionStorage.removeItem(TRANSFER_QUEUE); } catch { /* storage unavailable */ }
  }, []);

  async function run(toWarehouse: boolean) {
    setError(""); setDone(""); setBusy(true);
    try {
      const result = await transferBoxes({
        serials: list, toWarehouse, toHolder: toWarehouse ? null : to || null, toPhone: toWarehouse ? null : phone, note: note || null,
        warehouseId: toWarehouse && warehouseId ? Number(warehouseId) : null,
      });
      const sms = result.sms === "sent" ? "پیامک برای گیرنده ارسال شد."
        : result.sms === "off" ? "پیامک ارسال نشد: الگوی «پیامک انتقال رول» در «پیامک» تنظیم نشده یا ارسال متوقف است."
        : result.sms ? `پیامک ارسال نشد: ${fa(result.sms)}` : "";
      setDone(`${n(result.transfers.length)} رول ${toWarehouse ? "به انبار برگشت" : "ارسال شد"} → ${holderName(result.toHolder, result.toPhone)} · ${fa("Transfer number")}: ${result.batchId}${sms && ` · ${sms}`}`);
      setList([]); setNote(""); setTo(""); setPhone(""); setReturning(false);
      await loadHolders(); onChanged?.();
      if (history && result.transfers.some(t => t.labelId === history.id)) setHistory(await boxHistory(history.id));
    } catch (ex) { setError(message(ex)); setReturning(false); } finally { setBusy(false); }
  }

  // The send button only asks for confirmation; the transfer runs once the modal is confirmed.
  const [confirming, setConfirming] = useState(false);
  function send(event: FormEvent) { event.preventDefault(); setError(""); setDone(""); setConfirming(true); }
  async function confirmSend() { await run(false); setConfirming(false); }

  function openReturn() {
    setError(""); setWarehouseId(String(warehouses[0]?.id ?? "")); setReturning(true);
  }

  async function showHistory(serial: string) {
    setError(""); setLookup(serial);
    try { setHistory(await boxHistory(serial)); } catch (ex) { setHistory(null); setError(message(ex)); }
  }

  const named = holders.filter(h => h.holder !== null || h.phone !== null);

  return (
    <div>
      <header className={styles.panelHead}><div><span className={styles.eyebrow}>انتقال رول</span><h2>ارسال رول به فروشنده / نصاب</h2></div></header>
      <p className={labelsStyle.help} style={{ marginTop: 0 }}>رول با ROLL NO و موبایل گیرنده ارسال می‌شود: شرکت ← فروشنده ← نصاب (یا مستقیم به نصاب). فقط نصابی که رول دستش است می‌تواند گارانتی را فعال کند. رولی که برگردد با «بازگشت به انبار» دوباره موجود می‌شود.</p>
      {error && <p role="alert" className={labelsStyle.error}>{error}</p>}
      {done && <p role="status" className={labelsStyle.notice}>{done}</p>}
      <form className={`${styles.card} ${styles.adminForm}`} onSubmit={send}>
          <SerialInput label="رول‌ها" value={list} onChange={setList} />
          <div className={styles.row2}>
            <label>موبایل گیرنده<input dir="ltr" required inputMode="tel" maxLength={20} list="box-holder-phones" value={phone} onChange={e => { setPhone(e.target.value); if (recipient?.name) setTo(""); }} placeholder="09…" /></label>
            <label>نام گیرنده (اختیاری)<input maxLength={200} value={to} readOnly={!!recipient?.name} onChange={e => setTo(e.target.value)} /></label>
          </div>
          {recipient && <small style={{ marginTop: -6 }}>{recipient.registered ? <>گیرنده: <b>{recipient.name ?? "بدون نام"}</b></> : "این موبایل هنوز حساب ندارد؛ با انتقال، حساب ساخته می‌شود."}</small>}
          <datalist id="box-holder-phones">{named.filter(h => h.phone).map(h => <option key={h.phone!} value={h.phone!}>{h.holder ?? ""}</option>)}</datalist>
          <small style={{ opacity: .7, marginTop: -6 }}>گیرنده با همین موبایل وارد سایت می‌شود و رول‌ها را در حساب خود می‌بیند.</small>
          <label>{fa("Note (optional)")}<input maxLength={500} value={note} onChange={e => setNote(e.target.value)} /></label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className={styles.btnPrimary} style={{ flex: 1 }} disabled={busy || !list.length || !phone.trim()}>
              {busy && !returning ? fa("Working…") : list.length ? `ارسال ${n(list.length)} رول` : "ارسال"}
            </button>
            <button type="button" className={styles.ghost} disabled={busy || !list.length} onClick={openReturn}>بازگشت به انبار…</button>
          </div>
        </form>
      <div className={`${styles.card} ${labelsStyle.list}`}>
        <h2>تاریخچه یک رول</h2>
        <form className={labelsStyle.sizes} onSubmit={e => { e.preventDefault(); showHistory(lookup); }}>
          <input dir="ltr" required placeholder="ROLL NO" value={lookup} onChange={e => setLookup(e.target.value)} />
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
      {confirming && <div className={styles.dialog} role="dialog" aria-modal="true" aria-label="تأیید انتقال" {...backdropProps(() => !busy && setConfirming(false))}>
        <div className={`${styles.dialogInner} ${styles.adminForm}`} style={{ maxWidth: 480 }}>
          <h2>آیا از انتقال مطمئن هستید؟</h2>
          <button type="button" className={styles.dialogClose} aria-label="بستن" disabled={busy} onClick={() => setConfirming(false)}>×</button>
          <p style={{ margin: 0 }}>{n(list.length)} رول به <b>{to.trim() ? `${to.trim()} (` : ""}<span dir="ltr">{phone.trim()}</span>{to.trim() ? ")" : ""}</b> منتقل می‌شود.</p>
          <div className={labelsStyle.scroll} style={{ maxHeight: 220 }}>
            <p style={{ margin: 0, lineHeight: 1.9 }} dir="ltr">{list.map(id => <code key={id} style={{ marginInlineEnd: 8 }}>{id}</code>)}</p>
          </div>
          {note && <p style={{ margin: 0 }}>{fa("Note (optional)")}: {note}</p>}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" className={styles.btnPrimary} style={{ flex: 1 }} disabled={busy} onClick={confirmSend}>{busy ? fa("Working…") : `بله، ${n(list.length)} رول منتقل شود`}</button>
            <button type="button" className={styles.ghost} disabled={busy} onClick={() => setConfirming(false)}>انصراف</button>
          </div>
        </div>
      </div>}
      {returning && <div className={styles.dialog} role="dialog" aria-modal="true" aria-label="بازگشت به انبار" {...backdropProps(() => !busy && setReturning(false))}>
        <form className={`${styles.dialogInner} ${styles.adminForm}`} style={{ maxWidth: 440 }} onSubmit={e => { e.preventDefault(); run(true); }}>
          <h2>بازگشت {n(list.length)} رول به انبار</h2>
          <button type="button" className={styles.dialogClose} aria-label="بستن" onClick={() => setReturning(false)}>×</button>
          <label>به کدام انبار برگردد؟
            {warehouses.length
              ? <select required value={warehouseId} onChange={e => setWarehouseId(e.target.value)}>
                  {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              : <input disabled value={fa("Central warehouse")} />}
          </label>
          <label>{fa("Note (optional)")}<input maxLength={500} value={note} onChange={e => setNote(e.target.value)} placeholder="مثلاً مرجوعی فروشنده" /></label>
          <button className={styles.btnPrimary} disabled={busy}>{busy ? fa("Working…") : "ثبت بازگشت به انبار"}</button>
        </form>
      </div>}
    </div>
  );
}

export { holderName };
