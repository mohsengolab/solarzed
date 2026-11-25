"use client";

import { useRef, useState, KeyboardEvent } from "react";
import { readRollNos, normalizeSerial, SERIAL } from "@/lib/readRollNos";
import css from "./SerialInput.module.css";

const TEXT = {
  fa: {
    placeholder: "ROLL NO را اسکن یا تایپ کنید و Enter بزنید", add: "افزودن", upload: "فایل اکسل", clear: "پاک کردن همه",
    remove: "حذف", count: (n: number) => `${n.toLocaleString("fa-IR")} رول انتخاب شده`, empty: "هنوز رولی اضافه نشده است.", num: (n: number) => n.toLocaleString("fa-IR"), invalid: "نامعتبر", duplicate: "تکراری بود و دوباره اضافه نشد",
    fromFile: (n: number, file: string) => `${n.toLocaleString("fa-IR")} ROLL NO از ${file} اضافه شد.`, none: "در این فایل ROLL NO معتبری پیدا نشد.",
    oldXls: "فایل .xls قدیمی پشتیبانی نمی‌شود؛ آن را به‌صورت .xlsx یا CSV ذخیره کنید.", unreadable: "این فایل خوانده نشد. فایل .xlsx یا CSV انتخاب کنید.",
    max: (n: number) => `حداکثر ${n.toLocaleString("fa-IR")} ROLL NO.`,
  },
  en: {
    placeholder: "Scan or type a ROLL NO and press Enter", add: "Add", upload: "Upload Excel", clear: "Clear all",
    remove: "Remove", count: (n: number) => `${n} roll${n === 1 ? "" : "s"} selected`, empty: "No rolls added yet.", num: (n: number) => String(n), invalid: "Invalid", duplicate: "already in the list",
    fromFile: (n: number, file: string) => `Added ${n} ROLL NO${n === 1 ? "" : "s"} from ${file}.`, none: "No valid ROLL NOs found in this file.",
    oldXls: "Old .xls files are not supported; save it as .xlsx or CSV.", unreadable: "Could not read this file. Choose an .xlsx or CSV file.",
    max: (n: number) => `At most ${n} ROLL NOs.`,
  },
};

/**
 * One-line carton serial entry: a barcode scanner types the Roll No and presses Enter, which adds it to the list.
 * Several numbers can be pasted at once, or read from an Excel/CSV file (Roll No column).
 */
export default function SerialInput({ value, onChange, label, max = 200, lang = "fa" }:
  { value: string[]; onChange: (next: string[]) => void; label: string; max?: number; lang?: "fa" | "en" }) {
  const t = TEXT[lang];
  const [text, setText] = useState("");
  const [note, setNote] = useState<{ error: boolean; text: string } | null>(null);
  const file = useRef<HTMLInputElement>(null);

  function add(items: string[], source?: string) {
    const next = [...value], invalid: string[] = [], repeated: string[] = [];
    for (const item of items.map(normalizeSerial).filter(Boolean)) {
      if (!SERIAL.test(item)) invalid.push(item);
      else if (next.includes(item)) repeated.push(item);
      else next.push(item);
    }
    const added = next.length - value.length;
    const kept = next.slice(0, max);
    onChange(kept);
    const parts = [
      source && (added ? t.fromFile(added, source) : t.none),
      invalid.length && `${t.invalid}: ${invalid.slice(0, 5).join(", ")}${invalid.length > 5 ? "…" : ""}`,
      repeated.length && !source && `${repeated.join(", ")} ${t.duplicate}`,
      next.length > max && t.max(max),
    ].filter(Boolean) as string[];
    setNote(parts.length ? { error: invalid.length > 0 || next.length > max || (!!source && !added), text: parts.join(" ") } : null);
    return invalid;
  }

  function commit(raw = text) {
    const items = raw.split(/[\s,;]+/).filter(Boolean);
    if (!items.length) { setText(""); return; }
    const invalid = add(items);
    setText(invalid.join(" "));   // keep only what was rejected so it can be fixed
  }

  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === "Tab" && text.trim()) { event.preventDefault(); commit(); }
    else if (event.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
  }

  async function upload(picked: File | undefined) {
    if (!picked) return;
    try {
      const result = await readRollNos(picked);
      add([...result.serials, ...result.invalid], picked.name);
    } catch (ex) {
      setNote({ error: true, text: ex instanceof Error && ex.message === "old-xls" ? t.oldXls : t.unreadable });
    } finally { if (file.current) file.current.value = ""; }
  }

  return (
    <div className={css.box}>
      <div className={css.head}><span>{label}</span>{value.length > 0 && <span className={css.badge}>{t.num(value.length)}</span>}</div>
      <div className={css.row}>
        <div className={css.field}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 8v8M10 8v8M13 8v8M17 8v8"/></svg>
          <input dir="ltr" aria-label={label} value={text} placeholder={t.placeholder} autoComplete="off" spellCheck={false}
            onChange={event => { const v = event.target.value; if (/\S[\s,;]/.test(v)) commit(v); else setText(v.trimStart()); }}
            onKeyDown={keyDown} onBlur={() => commit()}
            onPaste={event => { const v = event.clipboardData.getData("text"); if (/[\s,;]/.test(v.trim())) { event.preventDefault(); commit(text + " " + v); } }} />
        </div>
        <button type="button" className={css.ghost} onClick={() => commit()} disabled={!text.trim()}>{t.add}</button>
        <button type="button" className={css.ghost} onClick={() => file.current?.click()}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13l3 4M12 13l-3 4"/></svg>
          {t.upload}
        </button>
        <input ref={file} type="file" hidden accept=".xlsx,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain"
          onChange={event => upload(event.target.files?.[0])} />
      </div>
      {note && <p className={note.error ? css.error : css.note} role={note.error ? "alert" : "status"}>{note.text}</p>}
      {value.length > 0
        ? <div className={css.list}>
            <div className={css.listHead}><span>{t.count(value.length)}</span>
              <button type="button" className={css.clear} onClick={() => { onChange([]); setNote(null); }}>{t.clear}</button></div>
            <div className={css.items}>
              {value.map((serial, i) => <div key={serial} className={css.item}>
                <span className={css.num}>{t.num(i + 1)}</span><code dir="ltr">{serial}</code>
                <button type="button" title={t.remove} aria-label={`${t.remove} ${serial}`} onClick={() => onChange(value.filter(x => x !== serial))}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              </div>)}
            </div>
          </div>
        : <p className={css.empty}>{t.empty}</p>}
    </div>
  );
}
