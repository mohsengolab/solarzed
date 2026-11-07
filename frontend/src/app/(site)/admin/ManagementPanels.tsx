"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { adminSession, managementFetch, type Paged } from "@/lib/api";
import s from "./admin.module.css";
import { usePaged, SortTh, Pager, FilterBar, countActive, errorText as message } from "./AdminKit";

type Product = { code: string; name: string; type: string; series: string; description: string; archived: boolean; updatedAt?: string };
const empty: Product = { code: "", name: "", type: "tint", series: "", description: "", archived: false };
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
      list.reload(); setForm(empty); setEditing(false); setMsg("Product saved.");
    } catch (e) { setMsg(message(e)); } finally { setBusy(false); }
  }
  const sortProps = { sort: list.sort, onSort: list.toggleSort };
  return <section>
    <header className={s.panelHead}><div><span className={s.eyebrow}>PRODUCT CATALOG</span><h1>Products</h1></div></header>
    <p className={s.empty}>Active products appear on the website automatically, grouped by type and series. Archiving removes a product from the public catalog and new inventory while preserving existing warranties.</p>
    <form className={`${s.card} ${s.adminForm}`} onSubmit={save}>
      <h2>{editing ? "Edit product" : "Define product"}</h2>
      <div className={s.row2}>
        <label>Product code<input required maxLength={24} pattern="[A-Za-z0-9-]+" disabled={editing} value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} /></label>
        <label>Product name<input required maxLength={120} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
        <label>Product type<select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}><option value="tint">Window film</option><option value="ppf">Paint protection film (including Color PPF)</option></select></label>
        <label>Series<input maxLength={80} list="series-options" value={form.series} onChange={e => setForm({ ...form, series: e.target.value })} /></label>
      </div>
      <datalist id="series-options">{seriesList.map(x => <option key={x} value={x} />)}</datalist>
      <label>Description<textarea maxLength={2000} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
      <label>Availability<select value={String(form.archived)} onChange={e => setForm({ ...form, archived: e.target.value === "true" })}><option value="false">Active</option><option value="true">Archived — unavailable for new inventory</option></select></label>
      <div className={s.filters}><button className={s.btnPrimary} disabled={busy}>{busy ? "Saving…" : "Save product"}</button>{editing && <button type="button" className={s.ghost} onClick={() => { setEditing(false); setForm(empty); }}>Cancel editing</button>}</div>
      {msg && <p role="status">{msg}</p>}
    </form>
    <FilterBar active={countActive(f)} onClear={() => setF(P_EMPTY)}>
      <label className={s.wide}>Search products<input type="search" placeholder="Code, name, series or description" value={f.q} onChange={set("q")} /></label>
      <label>Type<select value={f.type} onChange={set("type")}><option value="">All types</option><option value="tint">Window film</option><option value="ppf">PPF</option></select></label>
      <label>Series filter<select value={f.series} onChange={set("series")}><option value="">All series</option>{seriesList.map(x => <option key={x} value={x}>{x}</option>)}</select></label>
      <label>Show<select value={f.availability} onChange={set("availability")}><option value="">Active and archived</option><option value="active">Active only</option><option value="archived">Archived only</option></select></label>
    </FilterBar>
    {list.error && <p role="alert" className={s.errorText}>{list.error}</p>}
    <div className={s.card}><table className={`${s.table} ${list.loading ? s.tableBusy : ""}`}><thead><tr>
      <SortTh column="code" label="Code" {...sortProps} /><SortTh column="name" label="Name" {...sortProps} /><SortTh column="type" label="Type" {...sortProps} />
      <SortTh column="series" label="Series" {...sortProps} /><th>Status</th><SortTh column="updatedAt" label="Updated" {...sortProps} /><th>Action</th></tr></thead><tbody>
      {list.items.map(p => <tr key={p.code}><td><code>{p.code}</code></td><td>{p.name}</td><td>{p.type}</td><td>{p.series}</td>
        <td><span className={s.badge} data-tone={p.archived ? "muted" : "active"}>{p.archived ? "Archived" : "Active"}</span></td>
        <td>{p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : "—"}</td>
        <td><button type="button" className={s.ghost} onClick={() => { setForm(p); setEditing(true); setMsg(""); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Edit {p.code}</button></td></tr>)}
    </tbody></table>
      {!list.loading && list.items.length === 0 && <p className={s.empty}>{countActive(f) ? "No products match these filters." : "No products defined yet."}</p>}
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
  return <section><header className={s.panelHead}><div><span className={s.eyebrow}>CUSTOMERS</span><h1>Customers &amp; vehicles</h1></div></header>
    <FilterBar active={countActive(f)} onClear={() => setF(C_EMPTY)}>
      <label className={s.wide}>Search name, mobile or VIN<input type="search" placeholder="Name, mobile, VIN, plate or warranty code" value={f.q} onChange={set("q")} /></label>
      <label>Vehicle make / model<input value={f.make} onChange={set("make")} /></label>
      <label>Warranty status<select value={f.status} onChange={set("status")}><option value="">Any status</option><option value="pending">Pending</option><option value="active">Active</option><option value="rejected">Rejected</option></select></label>
      <label>Product type<select value={f.type} onChange={set("type")}><option value="">All types</option><option value="tint">Window film</option><option value="ppf">PPF</option></select></label>
      <label>Installed from<input type="date" value={f.installedFrom} onChange={set("installedFrom")} /></label>
      <label>Installed to<input type="date" value={f.installedTo} onChange={set("installedTo")} /></label>
    </FilterBar>
    {list.error && <p role="alert" className={s.errorText}>{list.error}</p>}
    <p className={s.empty}>Customer information comes from warranty registrations. Each customer shows their full history.</p>
    <div className={list.loading ? s.tableBusy : ""}>
      {phones.map(phone => {
        const records = list.items.filter(r => r.phone === phone);
        if (!records.length) return null;
        return <article className={s.card} key={phone}><h2>{records[0].owner} · {phone}</h2><table className={s.table}><thead><tr><th>Warranty</th><th>Vehicle</th><th>VIN</th><th>Plate</th><th>Type</th><th>Installed</th><th>Status</th><th>Film ends</th></tr></thead><tbody>{records.map(r => <tr key={r.code}><td><code>{r.code}</code></td><td>{r.make} {r.model}</td><td>{r.vin}</td><td>{r.plate}</td><td>{r.type}</td><td>{r.installed}</td><td><span className={s.badge} data-tone={r.status}>{r.status}</span></td><td>{r.filmEnds ?? "—"}</td></tr>)}</tbody></table></article>;
      })}
    </div>
    {!list.loading && phones.length === 0 && <p className={s.empty}>No customers match these filters.</p>}
    <div className={s.card}><Pager page={list.page} pageSize={list.pageSize} total={list.total} loading={list.loading} onPage={list.setPage} /></div>
  </section>;
}

export function AccountPanel() {
  const [form, setForm] = useState({ username: "admin", currentPassword: "", newPassword: "", confirm: "" });
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { adminSession().then(r => setForm(f => ({ ...f, username: r.username }))).catch(() => {}); }, []);
  async function save(e: FormEvent) {
    e.preventDefault(); setMsg("");
    if (form.newPassword !== form.confirm) { setMsg("New passwords do not match."); return; }
    setBusy(true);
    try {
      await managementFetch("account/password", { username: form.username, currentPassword: form.currentPassword, newPassword: form.newPassword });
      setForm({ ...form, currentPassword: "", newPassword: "", confirm: "" });
      setMsg("Password changed. All sessions were signed out; sign in again with the new password.");
    }
    catch (e) { setMsg(message(e)); } finally { setBusy(false); }
  }
  return <section><header className={s.panelHead}><h1>Account security</h1></header><form className={`${s.card} ${s.adminForm}`} onSubmit={save} style={{ maxWidth: 540 }}>
    <label>Account username<input required autoComplete="username" readOnly value={form.username} /></label>
    <label>Current password<input required type="password" autoComplete="current-password" value={form.currentPassword} onChange={e => setForm({ ...form, currentPassword: e.target.value })} /></label>
    <label>New password<input required minLength={12} maxLength={72} type="password" autoComplete="new-password" value={form.newPassword} onChange={e => setForm({ ...form, newPassword: e.target.value })} /></label>
    <label>Confirm new password<input required type="password" autoComplete="new-password" value={form.confirm} onChange={e => setForm({ ...form, confirm: e.target.value })} /></label>
    <p className={s.empty}>Use at least 12 characters. Changing the password signs out every existing session. Sessions expire after 8 hours; repeated failed sign-ins lock the account for 15 minutes.</p>
    <button className={s.btnPrimary} disabled={busy}>Change password</button>{msg && <p role="status">{msg}</p>}
  </form></section>;
}
