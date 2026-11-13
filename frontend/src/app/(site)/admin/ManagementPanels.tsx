"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { adminSession, adminUsers, adminCreateUser, adminUpdateUser, adminResetPassword, managementFetch, fa, type AdminUserRow, type Paged } from "@/lib/api";
import s from "./admin.module.css";
import { usePaged, SortTh, Pager, FilterBar, countActive, errorText as message } from "./AdminKit";

type Product = { code: string; name: string; type: string; series: string; description: string; archived: boolean; updatedAt?: string;
  thicknessMil?: number | null; vlt?: number | null; irr?: number | null; uv?: number | null; tser?: number | null; warrantyYears?: number | null };
const empty: Product = { code: "", name: "", type: "tint", series: "", description: "", archived: false,
  thicknessMil: null, vlt: null, irr: null, uv: null, tser: null, warrantyYears: null };
const P_EMPTY = { q: "", type: "", series: "", availability: "" };

export function ProductsPanel() {
  const [form, setForm] = useState<Product>(empty);
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState(P_EMPTY);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [seriesList, setSeriesList] = useState<string[]>([]);
  const load = useCallback(async (query: string) => {
    const r = await managementFetch<Paged<Product> & { series: string[] }>(`products${query}`);
    setSeriesList(r.series);
    return r;
  }, []);
  const list = usePaged<Product>(load, f, { sort: "code", dir: "asc", pageSize: 50 });
  const set = (k: keyof typeof P_EMPTY) => (e: { target: { value: string } }) => setF(p => ({ ...p, [k]: e.target.value }));

  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setMsg("");
    try {
      await managementFetch(editing ? `products/${encodeURIComponent(form.code)}` : "products", form, editing ? "PUT" : "POST");
      list.reload(); setForm(empty); setEditing(false); setMsg("محصول ذخیره شد.");
    } catch (e) { setMsg(message(e)); } finally { setBusy(false); }
  }
  const sortProps = { sort: list.sort, onSort: list.toggleSort };
  return <section>
    <header className={s.panelHead}><div><span className={s.eyebrow}>کاتالوگ محصولات</span><h1>محصولات</h1></div></header>
    <p className={s.empty}>محصولات فعال به‌صورت خودکار و بر اساس نوع و سری در وب‌سایت نمایش داده می‌شوند. بایگانی کردن، محصول را از کاتالوگ عمومی و موجودی جدید حذف می‌کند اما گارانتی‌های موجود حفظ می‌شوند.</p>
    <form className={`${s.card} ${s.adminForm}`} onSubmit={save}>
      <h2>{editing ? "ویرایش محصول" : "تعریف محصول"}</h2>
      <div className={s.row2}>
        <label>کد محصول<input required maxLength={24} pattern="[A-Za-z0-9-]+" disabled={editing} value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} dir="ltr" /></label>
        <label>نام محصول<input required maxLength={120} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
        <label>نوع محصول<select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}><option value="tint">فیلم شیشه</option><option value="ppf">فیلم محافظ رنگ (شامل Color PPF)</option></select></label>
        <label>سری<input maxLength={80} list="series-options" value={form.series} onChange={e => setForm({ ...form, series: e.target.value })} /></label>
      </div>
      <datalist id="series-options">{seriesList.map(x => <option key={x} value={x} />)}</datalist>
      <label>توضیحات<textarea maxLength={2000} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
      <details style={{ marginTop: 8 }}><summary style={{ cursor: "pointer", fontWeight: 600 }}>مشخصات فنی (اختیاری)</summary>
      <div className={s.row2} style={{ marginTop: 8 }}>
        <label>ضخامت (Mil)<input type="number" step="0.1" min="0" max="20" placeholder="مثلاً ۲" value={form.thicknessMil ?? ""} onChange={e => setForm({ ...form, thicknessMil: e.target.value ? Number(e.target.value) : null })} dir="ltr" /></label>
        <label>VLT%<input type="number" min="0" max="100" placeholder="درصد عبور نور مرئی" value={form.vlt ?? ""} onChange={e => setForm({ ...form, vlt: e.target.value ? Number(e.target.value) : null })} dir="ltr" /></label>
        <label>IRR% (950nm)<input type="number" min="0" max="100" placeholder="درصد رد مادون قرمز" value={form.irr ?? ""} onChange={e => setForm({ ...form, irr: e.target.value ? Number(e.target.value) : null })} dir="ltr" /></label>
        <label>UV%<input type="number" min="0" max="100" placeholder="درصد رد UV" value={form.uv ?? ""} onChange={e => setForm({ ...form, uv: e.target.value ? Number(e.target.value) : null })} dir="ltr" /></label>
        <label>TSER%<input type="number" min="0" max="100" placeholder="رد کل انرژی خورشیدی" value={form.tser ?? ""} onChange={e => setForm({ ...form, tser: e.target.value ? Number(e.target.value) : null })} dir="ltr" /></label>
        <label>گارانتی (سال)<input type="number" min="1" max="30" placeholder="مثلاً ۷" value={form.warrantyYears ?? ""} onChange={e => setForm({ ...form, warrantyYears: e.target.value ? Number(e.target.value) : null })} dir="ltr" /></label>
      </div></details>
      <label>وضعیت عرضه<select value={String(form.archived)} onChange={e => setForm({ ...form, archived: e.target.value === "true" })}><option value="false">فعال</option><option value="true">بایگانی — برای موجودی جدید در دسترس نیست</option></select></label>
      <div className={s.filters}><button className={s.btnPrimary} disabled={busy}>{busy ? "در حال ذخیره…" : "ذخیره محصول"}</button>{editing && <button type="button" className={s.ghost} onClick={() => { setEditing(false); setForm(empty); }}>لغو ویرایش</button>}</div>
      {msg && <p role="status">{msg}</p>}
    </form>
    <FilterBar active={countActive(f)} onClear={() => setF(P_EMPTY)}>
      <label className={s.wide}>جستجوی محصول<input type="search" placeholder="کد، نام، سری یا توضیحات" value={f.q} onChange={set("q")} /></label>
      <label>نوع<select value={f.type} onChange={set("type")}><option value="">همه انواع</option><option value="tint">فیلم شیشه</option><option value="ppf">PPF</option></select></label>
      <label>فیلتر سری<select value={f.series} onChange={set("series")}><option value="">همه سری‌ها</option>{seriesList.map(x => <option key={x} value={x}>{x}</option>)}</select></label>
      <label>نمایش<select value={f.availability} onChange={set("availability")}><option value="">فعال و بایگانی</option><option value="active">فقط فعال</option><option value="archived">فقط بایگانی</option></select></label>
    </FilterBar>
    {list.error && <p role="alert" className={s.errorText}>{list.error}</p>}
    <div className={s.card}><table className={`${s.table} ${list.loading ? s.tableBusy : ""}`}><thead><tr>
      <SortTh column="code" label="کد" {...sortProps} /><SortTh column="name" label="نام" {...sortProps} /><SortTh column="type" label="نوع" {...sortProps} />
      <SortTh column="series" label="سری" {...sortProps} /><th>VLT%</th><th>IRR%</th><th>TSER%</th><th>گارانتی</th><th>وضعیت</th><SortTh column="updatedAt" label="به‌روزرسانی" {...sortProps} /><th>عملیات</th></tr></thead><tbody>
      {list.items.map(p => <tr key={p.code}><td><code dir="ltr">{p.code}</code></td><td>{p.name}</td><td>{p.type}</td><td>{p.series}</td>
        <td dir="ltr">{p.vlt != null ? p.vlt : "—"}</td><td dir="ltr">{p.irr != null ? p.irr : "—"}</td>
        <td dir="ltr">{p.tser != null ? p.tser : "—"}</td><td dir="ltr">{p.warrantyYears != null ? `${p.warrantyYears}Y` : "—"}</td>
        <td><span className={s.badge} data-tone={p.archived ? "muted" : "active"}>{p.archived ? "بایگانی" : "فعال"}</span></td>
        <td>{p.updatedAt ? new Date(p.updatedAt).toLocaleDateString("fa-IR") : "—"}</td>
        <td><button type="button" className={s.ghost} onClick={() => { setForm({ ...empty, ...p }); setEditing(true); setMsg(""); window.scrollTo({ top: 0, behavior: "smooth" }); }}>ویرایش {p.code}</button></td></tr>)}
    </tbody></table>
      {!list.loading && list.items.length === 0 && <p className={s.empty}>{countActive(f) ? "محصولی با این فیلترها یافت نشد." : "هنوز محصولی تعریف نشده است."}</p>}
      <Pager page={list.page} pageSize={list.pageSize} total={list.total} loading={list.loading} onPage={list.setPage} />
    </div>
  </section>;
}

type CustomerRecord = { code: string; owner: string; phone: string; make: string; model: string; vin: string; plate: string; type: string; installed: string; status: string; filmEnds: string | null };
type CustomerPage = Paged<CustomerRecord> & { phones: string[] };
const C_EMPTY = { q: "", make: "", status: "", type: "", installedFrom: "", installedTo: "" };

export function CustomersPanel() {
  const [f, setF] = useState(C_EMPTY);
  const [phones, setPhones] = useState<string[]>([]);
  const load = useCallback(async (query: string) => {
    const r = await managementFetch<CustomerPage>(`customers${query}`);
    setPhones(r.phones);
    return r;
  }, []);
  const list = usePaged<CustomerRecord>(load, f, { pageSize: 20 });
  const set = (k: keyof typeof C_EMPTY) => (e: { target: { value: string } }) => setF(p => ({ ...p, [k]: e.target.value }));
  return <section><header className={s.panelHead}><div><span className={s.eyebrow}>مشتریان</span><h1>مشتریان و خودروها</h1></div></header>
    <FilterBar active={countActive(f)} onClear={() => setF(C_EMPTY)}>
      <label className={s.wide}>جستجوی نام، موبایل یا VIN<input type="search" placeholder="نام، موبایل، VIN، پلاک یا کد گارانتی" value={f.q} onChange={set("q")} /></label>
      <label>برند / مدل خودرو<input value={f.make} onChange={set("make")} /></label>
      <label>وضعیت گارانتی<select value={f.status} onChange={set("status")}><option value="">هر وضعیت</option><option value="pending">در انتظار</option><option value="active">فعال</option><option value="rejected">رد شده</option></select></label>
      <label>نوع محصول<select value={f.type} onChange={set("type")}><option value="">همه انواع</option><option value="tint">فیلم شیشه</option><option value="ppf">PPF</option></select></label>
      <label>نصب از<input type="date" value={f.installedFrom} onChange={set("installedFrom")} /></label>
      <label>نصب تا<input type="date" value={f.installedTo} onChange={set("installedTo")} /></label>
    </FilterBar>
    {list.error && <p role="alert" className={s.errorText}>{list.error}</p>}
    <p className={s.empty}>اطلاعات مشتری از ثبت‌های گارانتی می‌آید. هر مشتری تاریخچه کامل خود را می‌بیند.</p>
    <div className={list.loading ? s.tableBusy : ""}>
      {phones.map(phone => {
        const records = list.items.filter(r => r.phone === phone);
        if (!records.length) return null;
        return <article className={s.card} key={phone}><h2>{records[0].owner} · <span dir="ltr">{phone}</span></h2><table className={s.table}><thead><tr><th>گارانتی</th><th>خودرو</th><th>VIN</th><th>پلاک</th><th>نوع</th><th>نصب</th><th>وضعیت</th><th>پایان فیلم</th></tr></thead><tbody>{records.map(r => <tr key={r.code}><td><code dir="ltr">{r.code}</code></td><td>{r.make} {r.model}</td><td dir="ltr">{r.vin}</td><td dir="ltr">{r.plate}</td><td>{r.type}</td><td>{r.installed}</td><td><span className={s.badge} data-tone={r.status}>{fa(r.status)}</span></td><td>{r.filmEnds ?? "—"}</td></tr>)}</tbody></table></article>;
      })}
    </div>
    {!list.loading && phones.length === 0 && <p className={s.empty}>مشتری‌ای با این فیلترها یافت نشد.</p>}
    <div className={s.card}><Pager page={list.page} pageSize={list.pageSize} total={list.total} loading={list.loading} onPage={list.setPage} /></div>
  </section>;
}

export function AccountPanel(_props: { role?: "admin" | "carton" }) {
  const [form, setForm] = useState({ username: "admin", currentPassword: "", newPassword: "", confirm: "" });
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { adminSession().then(r => setForm(f => ({ ...f, username: r.username }))).catch(() => {}); }, []);
  async function save(e: FormEvent) {
    e.preventDefault(); setMsg("");
    if (form.newPassword !== form.confirm) { setMsg("رمزهای جدید یکسان نیستند."); return; }
    setBusy(true);
    try {
      await managementFetch("account/password", { username: form.username, currentPassword: form.currentPassword, newPassword: form.newPassword });
      setForm({ ...form, currentPassword: "", newPassword: "", confirm: "" });
      setMsg("رمز عبور تغییر کرد. همه نشست‌ها خارج شدند؛ با رمز جدید وارد شوید.");
    }
    catch (e) { setMsg(message(e)); } finally { setBusy(false); }
  }
  return <section><header className={s.panelHead}><h1>امنیت حساب کاربری</h1></header><form className={`${s.card} ${s.adminForm}`} onSubmit={save} style={{ maxWidth: 540 }}>
    <label>نام کاربری حساب<input required autoComplete="username" readOnly value={form.username} dir="ltr" /></label>
    <label>رمز عبور فعلی<input required type="password" autoComplete="current-password" value={form.currentPassword} onChange={e => setForm({ ...form, currentPassword: e.target.value })} dir="ltr" /></label>
    <label>رمز عبور جدید<input required minLength={12} maxLength={72} type="password" autoComplete="new-password" value={form.newPassword} onChange={e => setForm({ ...form, newPassword: e.target.value })} dir="ltr" /></label>
    <label>تأیید رمز عبور جدید<input required type="password" autoComplete="new-password" value={form.confirm} onChange={e => setForm({ ...form, confirm: e.target.value })} dir="ltr" /></label>
    <p className={s.empty}>حداقل ۱۲ کاراکتر استفاده کنید. تغییر رمز همه نشست‌ها را خارج می‌کند. نشست‌ها پس از ۸ ساعت منقضی می‌شوند؛ ورودهای ناموفق پیاپی حساب را ۱۵ دقیقه قفل می‌کند.</p>
    <button className={s.btnPrimary} disabled={busy}>تغییر رمز عبور</button>{msg && <p role="status">{msg}</p>}
  </form></section>;
}

// ── Users (manager only) ─────────────────────────────────────────────────────

const U_EMPTY = { username: "", displayName: "", password: "", role: "carton" as "admin" | "carton", active: true };

export function UsersPanel() {
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [form, setForm] = useState(U_EMPTY);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetFor, setResetFor] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const load = useCallback(() => adminUsers().then(r => setRows(r.users)).catch(e => setMsg(message(e))), []);
  useEffect(() => { load(); }, [load]);

  async function create(e: FormEvent) {
    e.preventDefault(); setBusy(true); setMsg("");
    try {
      await adminCreateUser({ username: form.username.trim(), password: form.password, role: form.role, displayName: form.displayName.trim() || undefined, active: form.active });
      setForm(U_EMPTY); setMsg("کاربر ساخته شد."); await load();
    } catch (ex) { setMsg(message(ex)); } finally { setBusy(false); }
  }

  async function update(user: AdminUserRow, patch: { role?: "admin" | "carton"; active?: boolean }) {
    setMsg("");
    try { await adminUpdateUser(user.id, patch); setMsg("کاربر به‌روزرسانی شد."); await load(); }
    catch (ex) { setMsg(message(ex)); }
  }

  async function resetPassword(id: number) {
    setMsg("");
    try { await adminResetPassword(id, newPassword); setNewPassword(""); setResetFor(null); setMsg("رمز عبور بازنشانی شد."); }
    catch (ex) { setMsg(message(ex)); }
  }

  const roleName = (r: string) => (r === "admin" ? "مدیر" : "کارتن");
  return <section>
    <header className={s.panelHead}><div><span className={s.eyebrow}>کاربران</span><h1>مدیریت کاربران</h1></div></header>
    <form className={`${s.card} ${s.adminForm}`} onSubmit={create}>
      <h2>ساخت کاربر</h2>
      <p className={s.empty}>یک مدیر یا اپراتور کارتن/سریال اضافه کنید.</p>
      <div className={s.row2}>
        <label>نام کاربری<input required minLength={3} maxLength={50} pattern="[A-Za-z0-9._-]+" autoComplete="off" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} dir="ltr" /></label>
        <label>نام (اختیاری)<input maxLength={100} value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} /></label>
        <label>رمز عبور<input required minLength={12} maxLength={72} type="password" autoComplete="new-password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} dir="ltr" /></label>
        <label>نقش<select value={form.role} onChange={e => setForm({ ...form, role: e.target.value as "admin" | "carton" })}>
          <option value="admin">مدیر — همه چیز</option>
          <option value="carton">کارتن — فقط سریال روی جعبه</option>
        </select></label>
        <label>وضعیت<select value={String(form.active)} onChange={e => setForm({ ...form, active: e.target.value === "true" })}><option value="true">فعال</option><option value="false">غیرفعال</option></select></label>
      </div>
      <button className={s.btnPrimary} disabled={busy}>{busy ? "در حال ساخت…" : "ساخت کاربر"}</button>
      {msg && <p role="status">{msg}</p>}
    </form>
    <div className={s.card}>
      <table className={s.table}><thead><tr><th>نام کاربری</th><th>نام</th><th>نقش</th><th>وضعیت</th><th>عملیات</th></tr></thead>
        <tbody>{rows.map(u => <tr key={u.id}>
          <td><code dir="ltr">{u.username}</code></td>
          <td>{u.displayName ?? "—"}</td>
          <td><select value={u.role} onChange={e => update(u, { role: e.target.value as "admin" | "carton" })}>
            <option value="admin">{roleName("admin")}</option><option value="carton">{roleName("carton")}</option>
          </select></td>
          <td><span className={s.badge} data-tone={u.active ? "active" : "muted"}>{u.active ? "فعال" : "غیرفعال"}</span></td>
          <td>
            <button type="button" className={s.ghost} onClick={() => update(u, { active: !u.active })}>{u.active ? "غیرفعال" : "فعال"}</button>
            <button type="button" className={s.ghost} onClick={() => { setResetFor(u.id); setNewPassword(""); }}>بازنشانی رمز</button>
          </td>
        </tr>)}</tbody></table>
      {!rows.length && <p className={s.empty}>هنوز کاربری ثبت نشده است.</p>}
      {resetFor !== null && <div className={s.adminForm} style={{ marginTop: 16 }}>
        <label>رمز عبور جدید<input type="password" minLength={12} maxLength={72} autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)} dir="ltr" /></label>
        <div className={s.filters}>
          <button type="button" className={s.btnPrimary} disabled={newPassword.length < 12} onClick={() => resetPassword(resetFor)}>ذخیره رمز</button>
          <button type="button" className={s.ghost} onClick={() => setResetFor(null)}>بستن</button>
        </div>
      </div>}
    </div>
  </section>;
}
