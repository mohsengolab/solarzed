"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { managementFetch, fa } from "@/lib/api";
import s from "./admin.module.css";
import { errorText } from "./AdminKit";

type WarehouseRow = { id: number; name: string; address: string; archived: boolean; rolls: number };
const EMPTY = { name: "", address: "", archived: false };

export const WarehouseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 21V8l9-5 9 5v13"/><path d="M7 21v-8h10v8"/><path d="M7 17h10"/>
  </svg>
);
export const PersonIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>
  </svg>
);

/** Warehouses where rolls are stored. A roll's location is one of these, or a system user holding it. */
export function WarehousesPanel() {
  const [items, setItems] = useState<WarehouseRow[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState<number | null>(null);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    managementFetch<{ items: WarehouseRow[] }>("warehouses").then(r => setItems(r.items)).catch(e => setMsg(fa(errorText(e))));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save(e: FormEvent) {
    e.preventDefault(); setSaving(true); setMsg("");
    try {
      if (editId == null) await managementFetch("warehouses", form);
      else await managementFetch(`warehouses/${editId}`, form, "PUT");
      setMsg(editId == null ? "انبار اضافه شد." : "انبار ذخیره شد.");
      setForm(EMPTY); setEditId(null); load();
    } catch (ex) { setMsg(fa(errorText(ex, "ذخیره ناموفق بود."))); } finally { setSaving(false); }
  }

  async function remove(w: WarehouseRow) {
    if (!window.confirm(`انبار «${w.name}» حذف شود؟`)) return;
    setMsg("");
    try { await managementFetch(`warehouses/${w.id}`, undefined, "DELETE"); setMsg("انبار حذف شد."); load(); }
    catch (ex) { setMsg(fa(errorText(ex, "حذف ناموفق بود."))); }
  }

  return (
    <section>
      <header className={s.panelHead}><div><span className={s.eyebrow}>محل نگهداری رول‌ها</span><h1>انبارها</h1></div></header>
      <div className={s.card}>
        <h2>{editId == null ? "انبار جدید" : "ویرایش انبار"}</h2>
        <form onSubmit={save} className={s.adminForm}>
          <div className={s.row2}>
            <label>نام انبار<input required maxLength={100} value={form.name} placeholder="مثلاً انبار مرکزی" onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></label>
            <label>آدرس (اختیاری)<input maxLength={300} value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} /></label>
          </div>
          {editId != null && (
            <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={form.archived} onChange={e => setForm(p => ({ ...p, archived: e.target.checked }))} /> بایگانی (دیگر برای رول‌های جدید انتخاب نمی‌شود)
            </label>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" className={s.btnPrimary} disabled={saving}>{editId == null ? "افزودن انبار" : "ذخیره"}</button>
            {editId != null && <button type="button" className={s.ghost} onClick={() => { setEditId(null); setForm(EMPTY); }}>انصراف</button>}
          </div>
          {msg && <p>{msg}</p>}
        </form>
      </div>
      <div className={s.card}>
        <table className={s.table}>
          <thead><tr><th>انبار</th><th>آدرس</th><th>رول‌های موجود</th><th>عملیات</th></tr></thead>
          <tbody>
            {items.map(w => (
              <tr key={w.id} style={w.archived ? { opacity: .55 } : undefined}>
                <td><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><WarehouseIcon /> {w.name}</span>{w.archived && <small style={{ display: "block" }}>بایگانی</small>}</td>
                <td>{w.address || "—"}</td>
                <td>{w.rolls.toLocaleString("fa-IR")}</td>
                <td><div className={s.rowActions}>
                  <button type="button" className={`${s.ghost} ${s.iconBtn}`} title="ویرایش" aria-label={`ویرایش ${w.name}`}
                    onClick={() => { setEditId(w.id); setForm({ name: w.name, address: w.address, archived: w.archived }); setMsg(""); }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
                  </button>
                  <button type="button" className={`${s.danger} ${s.iconBtn}`} title="حذف" aria-label={`حذف ${w.name}`} onClick={() => remove(w)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                  </button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length && <p className={s.empty}>هنوز انباری تعریف نشده است.</p>}
      </div>
    </section>
  );
}
