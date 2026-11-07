"use client";

import { useState, useEffect, useCallback, FormEvent } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import {
  adminLogin, adminLogout, adminSession, adminOverview, adminWarranties, adminDecision,
  adminRollsSearch, adminCreateRolls, adminGetSettings, adminSaveSettings,
  adminBoxLabels, managementFetch, ADMIN_UNAUTHORIZED,
} from "@/lib/api";
import styles from "./admin.module.css";
import labelsStyle from "./labels.module.css";
import BoxLabelsPanel from "./BoxLabelsPanel";
import { printQrLabels } from "./qrPrint";
import { ProductsPanel, CustomersPanel, AccountPanel } from "./ManagementPanels";
import SmsSettingsPanel from "./SmsSettingsPanel";
import { usePaged, SortTh, Pager, FilterBar, countActive, downloadCsv, errorText } from "./AdminKit";

const VIEWS = ["overview", "products", "rolls", "labels", "warranties", "customers", "sms", "settings", "account"] as const;
type View = typeof VIEWS[number];
const LABELS: Record<View, string> = {
  overview: "Overview", products: "Products", rolls: "Rolls", labels: "Labels", warranties: "Warranties",
  customers: "Customers", sms: "SMS", settings: "Settings", account: "Account",
};
const viewFromHash = (): View => {
  const h = typeof window === "undefined" ? "" : window.location.hash.slice(1);
  return (VIEWS as readonly string[]).includes(h) ? h as View : "overview";
};

export default function AdminPage() {
  const [state, setState] = useState<"checking" | "out" | "in">("checking");
  const [view, setView] = useState<View>("overview");

  // Restore an existing HttpOnly-cookie session; any 401 later returns to the sign-in form.
  useEffect(() => {
    let live = true;
    adminSession().then(() => { if (live) { setView(viewFromHash()); setState("in"); } }).catch(() => { if (live) setState("out"); });
    const out = () => setState("out");
    const hash = () => setView(viewFromHash());
    window.addEventListener(ADMIN_UNAUTHORIZED, out);
    window.addEventListener("hashchange", hash);
    return () => { live = false; window.removeEventListener(ADMIN_UNAUTHORIZED, out); window.removeEventListener("hashchange", hash); };
  }, []);

  const nav = useCallback((v: View) => {
    setView(v);
    if (window.location.hash.slice(1) !== v) window.history.pushState(null, "", `#${v}`);
  }, []);

  if (state === "checking") return <div className={styles.loginWrap}><p className={styles.loading}>Loading…</p></div>;
  if (state === "out") return <LoginView onLogin={() => { setView(viewFromHash()); setState("in"); }} />;
  return <AdminApp view={view} onNav={nav} onLogout={() => { adminLogout().catch(() => {}).finally(() => setState("out")); }} />;
}

// ── Login ────────────────────────────────────────────────────────────────────

function LoginView({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr("");
    try {
      await adminLogin(username.trim(), pw);
      setPw("");
      onLogin();
    } catch (ex: unknown) {
      setErr(errorText(ex, "Login failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.loginWrap}>
      <form onSubmit={onSubmit} className={styles.loginCard}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/solarzed-original.png" alt="SOLARZED" width={200} height={40} />
        <h1>Warranty administration</h1>
        <p>Sign in to review installations, manage rolls and set coverage.</p>
        <label htmlFor="username">Username</label>
        <input id="username" autoComplete="username" required maxLength={100} value={username} onChange={e => setUsername(e.target.value)} />
        <label htmlFor="pw">Admin password</label>
        <input id="pw" type="password" autoComplete="current-password" required maxLength={200} value={pw} onChange={e => setPw(e.target.value)} />
        <button type="submit" disabled={loading}>
          {loading ? "Signing in…" : "Sign in ↗"}
        </button>
        {err && <p className={styles.loginErr} role="alert">{err}</p>}
      </form>
    </div>
  );
}

// ── App shell ────────────────────────────────────────────────────────────────

function AdminApp({ view, onNav, onLogout }: { view: View; onNav: (v: View) => void; onLogout: () => void }) {
  return (
    <div className={styles.app}>
      <aside className={styles.side}>
        <Link href="/" className={styles.brand}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/solarzed-original.png" alt="SOLARZED" width={160} height={32} />
          <small>ADMIN</small>
        </Link>
        <nav aria-label="Administration">
          {VIEWS.map(v => (
            <button key={v} type="button" onClick={() => onNav(v)} aria-current={view === v ? "page" : undefined} className={view === v ? styles.navActive : ""}>
              {LABELS[v]}
            </button>
          ))}
        </nav>
        <button type="button" className={styles.logout} onClick={onLogout}>Sign out</button>
      </aside>
      <main className={styles.main}>
        {view === "overview" && <OverviewPanel onNav={onNav} />}
        {view === "products" && <ProductsPanel />}
        {view === "customers" && <CustomersPanel />}
        {view === "account" && <AccountPanel />}
        {view === "warranties" && <WarrantiesPanel />}
        {view === "rolls" && <RollsPanel />}
        {view === "labels" && <BoxLabelsPanel onSettings={() => onNav("settings")} />}
        {view === "sms" && <SmsSettingsPanel />}
        {view === "settings" && <SettingsPanel />}
      </main>
    </div>
  );
}

const Badge = ({ value }: { value: string }) => <span className={styles.badge} data-tone={value}>{value}</span>;

// ── Overview ─────────────────────────────────────────────────────────────────

type OverviewData = { total: number; pending: number; active: number; rejected: number; rollCount: number;
  queue: { code: string; make: string; model: string; installed: string; flagsJson: string }[] };

function OverviewPanel({ onNav }: { onNav: (v: View) => void }) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => adminOverview().then(d => { setData(d as OverviewData); setError(""); }).catch(e => setError(errorText(e))), []);
  useEffect(() => { load(); }, [load]);

  if (error && !data) return <p role="alert" className={styles.errorText}>{error}</p>;
  if (!data) return <p className={styles.loading}>Loading…</p>;
  const d = data;

  return (
    <section>
      <header className={styles.panelHead}>
        <div><span className={styles.eyebrow}>OVERVIEW</span><h1>Warranty operations</h1></div>
        <button type="button" className={styles.ghost} onClick={load}>Refresh</button>
      </header>
      <div className={styles.kpis}>
        {[["Total", d.total], ["Pending", d.pending], ["Active", d.active], ["Rejected", d.rejected], ["Rolls", d.rollCount]].map(([k, v]) => (
          <div key={String(k)} className={styles.kpi}><span>{k}</span><b>{Number(v).toLocaleString()}</b></div>
        ))}
      </div>
      <div className={styles.card}>
        <h2>Review queue</h2>
        {d.queue.length === 0
          ? <p className={styles.empty}>Queue is empty.</p>
          : <table className={styles.table}>
              <thead><tr><th>Code</th><th>Vehicle</th><th>Installed</th><th>Flags</th></tr></thead>
              <tbody>
                {d.queue.map(w => (
                  <tr key={w.code} onClick={() => onNav("warranties")} style={{ cursor: "pointer" }}>
                    <td><code>{w.code}</code></td>
                    <td>{w.make} {w.model}</td>
                    <td>{w.installed}</td>
                    <td>{(JSON.parse(w.flagsJson || "[]") as string[]).join(", ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
        }
      </div>
    </section>
  );
}

// ── Warranties ───────────────────────────────────────────────────────────────

type WRow = { code: string; owner: string; phone: string; make: string; model: string; vin: string; plate: string; type: string; installer: string;
  installed: string; status: string; flagsJson: string; filmEnds: string | null; createdAt: string; filmSerial: string; invoiceNumber: string } & Record<string, unknown>;

const FLAGS = ["roll_unknown", "roll_not_approved", "roll_not_distributed", "roll_void", "type_mismatch", "vin_repeat"];
const W_EMPTY = { q: "", type: "", flagged: "", flag: "", make: "", installer: "", installedFrom: "", installedTo: "", createdFrom: "", createdTo: "", expiringDays: "" };

function WarrantiesPanel() {
  const [status, setStatus] = useState("pending");
  const [f, setF] = useState(W_EMPTY);
  const [selected, setSelected] = useState<WRow | null>(null);
  const [decStatus, setDecStatus] = useState("active");
  const [decNote, setDecNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [checked, setChecked] = useState<Record<string, WRow>>({});
  const [site, setSite] = useState("");
  const [qrs, setQrs] = useState<Record<string, string>>({});
  const [qrError, setQrError] = useState("");
  const [width, setWidth] = useState(80);
  const [height, setHeight] = useState(50);

  const list = usePaged<WRow>(adminWarranties<WRow>, { ...f, status }, { sort: "createdAt" });
  const set = (k: keyof typeof W_EMPTY) => (e: { target: { value: string } }) => setF(p => ({ ...p, [k]: e.target.value }));

  useEffect(() => {
    adminBoxLabels().then(r => setSite(r.siteUrl)).catch(() => setQrError("Could not load the public website address. Set it in Labels → Print setup."));
  }, []);

  const printable = Object.values(checked).filter(w => w.status !== "rejected");
  const printableKey = printable.map(w => w.code).join("|");

  useEffect(() => {
    if (!site) return;
    let cancelled = false;
    Promise.all(printableKey.split("|").filter(Boolean).map(async code =>
      [code, await QRCode.toDataURL(`${site.replace(/\/+$/, "")}/warranty?code=${encodeURIComponent(code)}`, { errorCorrectionLevel: "M", margin: 4, scale: 8 })] as const,
    )).then(entries => { if (!cancelled) setQrs(Object.fromEntries(entries)); })
      .catch(ex => { if (!cancelled) setQrError(errorText(ex, "QR generation failed.")); });
    return () => { cancelled = true; };
  }, [printableKey, site]);

  async function decide() {
    if (!selected) return;
    setSaving(true);
    setMsg("");
    try {
      await adminDecision(selected.code, decStatus, decNote);
      setMsg("Saved.");
      setSelected(null);
      list.reload();
    } catch (e: unknown) {
      setMsg(errorText(e, "Error"));
    } finally {
      setSaving(false);
    }
  }

  async function printQr() {
    setQrError("");
    if (width < 60 || width > 150 || height < 40 || height > 150 || !Number.isFinite(width + height)) {
      setQrError("Label size must be 60–150 mm wide and 40–150 mm high."); return;
    }
    if (!site || !printable.length || printable.some(w => !qrs[w.code])) {
      setQrError("Select warranties and wait for their QR previews."); return;
    }
    await printQrLabels("Solarzed warranty QR", width, height, printable.map(w => ({
      qr: qrs[w.code],
      alt: `Verify warranty ${w.code}`,
      title: "Scan to verify warranty",
      lines: [w.code, `${w.make} ${w.model} · ${w.type === "ppf" ? "PPF" : "Window film"}`, `Installed ${w.installed}`,
        ...(w.status === "active" && w.filmEnds ? [`Film warranty until ${w.filmEnds}`] : [`Status: ${w.status}`])],
      footer: new URL(site).host,
    })));
  }

  async function exportCsv() {
    try {
      const all = await adminWarranties<WRow>(list.exportQuery);
      downloadCsv("warranties", all.items, [["code", "Code"], ["status", "Status"], ["type", "Type"], ["owner", "Owner"], ["phone", "Mobile"],
        ["make", "Make"], ["model", "Model"], ["vin", "VIN"], ["plate", "Plate"], ["filmSerial", "Film serial"], ["invoiceNumber", "Invoice"],
        ["installer", "Installer"], ["installed", "Installed"], ["filmEnds", "Film warranty ends"], ["createdAt", "Registered"]]);
    } catch (e) { setQrError(errorText(e, "Export failed.")); }
  }

  const sortProps = { sort: list.sort, onSort: list.toggleSort };
  return (
    <section>
      <header className={styles.panelHead}>
        <div><span className={styles.eyebrow}>WARRANTIES</span><h1>Registrations</h1></div>
        <button type="button" className={styles.ghost} onClick={exportCsv} disabled={!list.total}>Export CSV (max 200)</button>
      </header>
      <div className={styles.filters} role="group" aria-label="Status">
        {["pending", "active", "rejected", ""].map(st => (
          <button key={st} type="button" onClick={() => setStatus(st)} className={status === st ? styles.segActive : styles.seg} aria-pressed={status === st}>
            {st || "All"}
          </button>
        ))}
      </div>
      <FilterBar active={countActive(f)} onClear={() => setF(W_EMPTY)}>
        <label className={styles.wide}>Search warranties<input type="search" placeholder="Code, owner, mobile, VIN, plate, serial, invoice, roll" value={f.q} onChange={set("q")} /></label>
        <label>Product type<select value={f.type} onChange={set("type")}><option value="">All types</option><option value="tint">Window film</option><option value="ppf">PPF</option></select></label>
        <label>Flags<select value={f.flagged} onChange={set("flagged")}><option value="">Any</option><option value="true">Flagged only</option><option value="false">Not flagged</option></select></label>
        <label>Specific flag<select value={f.flag} onChange={set("flag")}><option value="">Any flag</option>{FLAGS.map(x => <option key={x} value={x}>{x.replace(/_/g, " ")}</option>)}</select></label>
        <label>Vehicle make / model<input value={f.make} onChange={set("make")} /></label>
        <label>Installer / seller<input value={f.installer} onChange={set("installer")} /></label>
        <label>Installed from<input type="date" value={f.installedFrom} onChange={set("installedFrom")} /></label>
        <label>Installed to<input type="date" value={f.installedTo} onChange={set("installedTo")} /></label>
        <label>Registered from<input type="date" value={f.createdFrom} onChange={set("createdFrom")} /></label>
        <label>Registered to<input type="date" value={f.createdTo} onChange={set("createdTo")} /></label>
        <label>Film warranty expiring<select value={f.expiringDays} onChange={set("expiringDays")}><option value="">Any time</option><option value="30">Within 30 days</option><option value="90">Within 90 days</option><option value="365">Within 1 year</option></select></label>
      </FilterBar>
      {list.error && <p role="alert" className={styles.errorText}>{list.error}</p>}
      <div className={styles.card}>
        <table className={`${styles.table} ${list.loading ? styles.tableBusy : ""}`}>
          <thead><tr><th>QR</th><SortTh column="code" label="Code" {...sortProps} /><SortTh column="owner" label="Owner" {...sortProps} /><SortTh column="make" label="Vehicle" {...sortProps} />
            <SortTh column="type" label="Type" {...sortProps} /><SortTh column="installer" label="Installer" {...sortProps} /><SortTh column="installed" label="Installed" {...sortProps} />
            <SortTh column="filmEnds" label="Film ends" {...sortProps} /><SortTh column="status" label="Status" {...sortProps} /><th>Flags</th></tr></thead>
          <tbody>
            {list.items.map(w => (
              <tr key={w.code} onClick={() => { setSelected(w); setDecStatus("active"); setDecNote(""); setMsg(""); }} style={{ cursor: "pointer" }}>
                <td onClick={e => e.stopPropagation()}>
                  <input type="checkbox" aria-label={`Select ${w.code} for QR printing`} disabled={w.status === "rejected"}
                    checked={!!checked[w.code]}
                    onChange={e => setChecked(c => { const n = { ...c }; if (e.target.checked) n[w.code] = w; else delete n[w.code]; return n; })} />
                </td>
                <td><code>{w.code}</code></td>
                <td>{w.owner}</td>
                <td>{w.make} {w.model}</td>
                <td>{w.type}</td>
                <td>{w.installer}</td>
                <td>{w.installed}</td>
                <td>{w.filmEnds ?? "—"}</td>
                <td><Badge value={w.status} /></td>
                <td>{(JSON.parse(w.flagsJson || "[]") as string[]).length || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.loading && !list.items.length && <p className={styles.empty}>No warranties match these filters.</p>}
        <Pager page={list.page} pageSize={list.pageSize} total={list.total} loading={list.loading} onPage={list.setPage} />
      </div>

      <div className={`${styles.card} ${styles.adminForm}`} style={{ marginBottom: 20 }}>
        <h2>Warranty QR codes</h2>
        <p className={labelsStyle.help}>Tick warranties above to print a QR label (selection is kept across pages and filters). Scanning it opens the public warranty check for that code on {site ? new URL(site).host : "the public website"}. Rejected warranties cannot be printed.</p>
        {qrError && <p role="alert" className={labelsStyle.error}>{qrError}</p>}
        <div className={labelsStyle.sizes}>
          <label>Width (mm)<input type="number" min={60} max={150} value={width} onChange={e => setWidth(Number(e.target.value))} /></label>
          <label>Height (mm)<input type="number" min={40} max={150} value={height} onChange={e => setHeight(Number(e.target.value))} /></label>
        </div>
        <div className={styles.filters}>
          <button type="button" className={styles.btnPrimary} onClick={() => { printQr().catch(ex => setQrError(errorText(ex, "Printing failed."))); }}
            disabled={!site || !printable.length || printable.some(w => !qrs[w.code])}>
            Print warranty QR ({printable.length})
          </button>
          {printable.length > 0 && <button type="button" className={styles.ghost} onClick={() => setChecked({})}>Clear selection</button>}
        </div>
      </div>

      <div className={labelsStyle.previews}>{printable.map(w => (
        <article key={w.code} className={labelsStyle.preview}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {qrs[w.code] && <img src={qrs[w.code]} alt={`QR for ${w.code}`} width={150} height={150} />}
          <div>
            <b>SOLARZED</b>
            <p>{w.make} {w.model} · {w.type === "ppf" ? "PPF" : "Window film"}</p>
            <code>{w.code}</code>
            <p>{w.status === "active" && w.filmEnds ? `Film warranty until ${w.filmEnds}` : `Status: ${w.status}`}</p>
            <a href={`/warranty?code=${encodeURIComponent(w.code)}`} target="_blank" rel="noreferrer">Local lookup preview ↗</a>
          </div>
        </article>
      ))}</div>

      {selected && (
        <div className={styles.dialog} role="dialog" aria-modal="true" aria-label="Warranty decision" onKeyDown={e => { if (e.key === "Escape") setSelected(null); }}>
          <div className={styles.dialogInner}>
            <button type="button" onClick={() => setSelected(null)} className={styles.dialogClose} aria-label="Close">×</button>
            <h2>Decision — {selected.code}</h2>
            <dl>{["owner", "phone", "make", "model", "vin", "plate", "filmSerial", "invoiceNumber", "installed", "sellerName", "sellerPhone", "installer", "rollId", "flagsJson", "reviewNote"].map(k => <div key={k}><dt>{k}</dt><dd>{String(selected[k] ?? "—")}</dd></div>)}</dl>
            <label>Status
              <select value={decStatus} onChange={e => setDecStatus(e.target.value)}>
                <option value="active">Activate</option>
                <option value="rejected">Reject</option>
                <option value="pending">Keep pending</option>
              </select>
            </label>
            <label>Note {decStatus === "rejected" && <span style={{ color: "#f87171" }}>(required)</span>}
              <textarea value={decNote} maxLength={500} onChange={e => setDecNote(e.target.value)} rows={3} />
            </label>
            <button type="button" className={styles.btnPrimary} onClick={decide} disabled={saving}>
              {saving ? "Saving…" : "Save decision"}
            </button>
            {msg && <p>{msg}</p>}
          </div>
        </div>
      )}
    </section>
  );
}

// ── Rolls ─────────────────────────────────────────────────────────────────────

type RollRow = { id: string; modelCode: string; type: string; batch: string; supplier: string; qc: string; status: string; installs: number; historyJson: string; receivedAt: string };
const R_EMPTY = { q: "", model: "", type: "", qc: "", status: "", supplier: "", batch: "", receivedFrom: "", receivedTo: "", hasInstalls: "" };

function RollsPanel() {
  const [form, setForm] = useState({ modelCode: "", type: "tint", batch: "", supplier: "", qc: "pending", quantity: "1" });
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState<{ code: string; name: string; type: string; archived: boolean }[]>([]);
  const [f, setF] = useState(R_EMPTY);
  const [edit, setEdit] = useState<RollRow | null>(null);
  const [note, setNote] = useState("");
  const list = usePaged<RollRow>(adminRollsSearch<RollRow>, f, { sort: "receivedAt" });
  const set = (k: keyof typeof R_EMPTY) => (e: { target: { value: string } }) => setF(p => ({ ...p, [k]: e.target.value }));

  useEffect(() => {
    managementFetch<{ items: typeof products }>("products?pageSize=200").then(r => setProducts(r.items)).catch(e => setMsg(errorText(e, "Could not load products.")));
  }, []);

  async function updateRoll(e: FormEvent) {
    e.preventDefault(); if (!edit) return; setSaving(true); setMsg("");
    try { await managementFetch(`rolls/${encodeURIComponent(edit.id)}`, { qc: edit.qc, status: edit.status, note }); list.reload(); setEdit(null); setMsg("Inventory updated."); }
    catch (e) { setMsg(errorText(e, "Update failed.")); } finally { setSaving(false); }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setMsg("");
    try {
      await adminCreateRolls({ ...form, quantity: Number(form.quantity) });
      setMsg("Rolls created.");
      list.reload();
    } catch (ex: unknown) {
      setMsg(errorText(ex, "Error"));
    } finally {
      setSaving(false);
    }
  }

  async function exportCsv() {
    try {
      const all = await adminRollsSearch<RollRow>(list.exportQuery);
      downloadCsv("rolls", all.items, [["id", "Roll ID"], ["modelCode", "Model"], ["type", "Type"], ["batch", "Batch"], ["supplier", "Supplier"],
        ["qc", "QC"], ["status", "Status"], ["installs", "Installs"], ["receivedAt", "Received"]]);
    } catch (e) { setMsg(errorText(e, "Export failed.")); }
  }

  const sortProps = { sort: list.sort, onSort: list.toggleSort };
  return (
    <section>
      <header className={styles.panelHead}><div><span className={styles.eyebrow}>ROLL REGISTRY</span><h1>Rolls &amp; batches</h1></div></header>
      <div className={styles.card}>
        <h2>Receive rolls</h2>
        <form onSubmit={onSubmit} className={styles.adminForm}>
          <label>Defined product
            <select value={products.some(p => p.code === form.modelCode) ? form.modelCode : ""} onChange={e => { const p = products.find(p => p.code === e.target.value); if (p) setForm(f => ({ ...f, modelCode: p.code, type: p.type })); }}>
              <option value="">Select a product or enter an existing model below</option>
              {products.filter(p => !p.archived).map(p => <option key={p.code} value={p.code}>{p.code} · {p.name}</option>)}
            </select>
          </label>
          <div className={styles.row2}>
            {[
              { label: "Model code", name: "modelCode", placeholder: "e.g. PIR or CP-01", max: 24 },
              { label: "Batch", name: "batch", placeholder: "e.g. LOT-2608-B17", max: 32 },
              { label: "Supplier code", name: "supplier", placeholder: "e.g. SUP-02", max: 16 },
            ].map(x => (
              <label key={x.name}>{x.label}
                <input required maxLength={x.max} value={(form as Record<string, string>)[x.name]} placeholder={x.placeholder}
                  onChange={e => setForm(p => ({ ...p, [x.name]: e.target.value }))} />
              </label>
            ))}
            <label>Type
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                <option value="tint">Window film</option>
                <option value="ppf">Paint protection film</option>
              </select>
            </label>
            <label>QC
              <select value={form.qc} onChange={e => setForm(p => ({ ...p, qc: e.target.value }))}>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </label>
            <label>Quantity
              <input type="number" required min="1" max="200" value={form.quantity}
                onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))} />
            </label>
          </div>
          <button type="submit" className={styles.btnPrimary} disabled={saving}>
            {saving ? "Creating…" : "Create roll IDs ↗"}
          </button>
          {msg && <p>{msg}</p>}
        </form>
      </div>

      <div className={styles.panelHead} style={{ marginTop: 24, marginBottom: 12 }}>
        <h2>Inventory</h2>
        <button type="button" className={styles.ghost} onClick={exportCsv} disabled={!list.total}>Export CSV (max 200)</button>
      </div>
      <FilterBar active={countActive(f)} onClear={() => setF(R_EMPTY)}>
        <label className={styles.wide}>Search inventory<input type="search" placeholder="Roll ID, model, batch or supplier" value={f.q} onChange={set("q")} /></label>
        <label>Product<select value={f.model} onChange={set("model")}><option value="">All products</option>{products.map(p => <option key={p.code} value={p.code}>{p.code}</option>)}</select></label>
        <label>Type<select value={f.type} onChange={set("type")}><option value="">All types</option><option value="tint">Window film</option><option value="ppf">PPF</option></select></label>
        <label>QC filter<select value={f.qc} onChange={set("qc")}><option value="">Any QC</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></label>
        <label>Stock status filter<select value={f.status} onChange={set("status")}><option value="">Any status</option><option value="instock">In stock</option><option value="shipped">Shipped</option><option value="consumed">Consumed</option><option value="void">Void</option></select></label>
        <label>Batch contains<input value={f.batch} onChange={set("batch")} /></label>
        <label>Supplier contains<input value={f.supplier} onChange={set("supplier")} /></label>
        <label>Received from<input type="date" value={f.receivedFrom} onChange={set("receivedFrom")} /></label>
        <label>Received to<input type="date" value={f.receivedTo} onChange={set("receivedTo")} /></label>
        <label>Installations<select value={f.hasInstalls} onChange={set("hasInstalls")}><option value="">Any</option><option value="true">Has installations</option><option value="false">No installations</option></select></label>
      </FilterBar>
      {list.error && <p role="alert" className={styles.errorText}>{list.error}</p>}
      <div className={styles.card}>
        <table className={`${styles.table} ${list.loading ? styles.tableBusy : ""}`}>
          <thead><tr><SortTh column="id" label="Roll ID" {...sortProps} /><SortTh column="modelCode" label="Model" {...sortProps} /><SortTh column="type" label="Type" {...sortProps} />
            <SortTh column="batch" label="Batch" {...sortProps} /><SortTh column="supplier" label="Supplier" {...sortProps} /><SortTh column="qc" label="QC" {...sortProps} />
            <SortTh column="status" label="Status" {...sortProps} /><th>Installs</th><SortTh column="receivedAt" label="Received" {...sortProps} /></tr></thead>
          <tbody>
            {list.items.map(r => (
              <tr key={r.id}>
                <td><code>{r.id}</code></td>
                <td>{r.modelCode}</td>
                <td>{r.type}</td>
                <td>{r.batch}</td>
                <td>{r.supplier}</td>
                <td><Badge value={r.qc} /></td>
                <td>{r.status} <button type="button" className={styles.ghost} onClick={() => { setEdit(r); setNote(""); setMsg(""); }}>Manage {r.id}</button></td>
                <td>{r.installs}</td>
                <td>{new Date(r.receivedAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.loading && !list.items.length && <p className={styles.empty}>No rolls match these filters.</p>}
        <Pager page={list.page} pageSize={list.pageSize} total={list.total} loading={list.loading} onPage={list.setPage} />
      </div>
      {edit && <div className={styles.dialog} role="dialog" aria-modal="true" aria-label="Manage inventory"><form className={`${styles.dialogInner} ${styles.adminForm}`} onSubmit={updateRoll}>
        <h2>{edit.id}</h2><button type="button" className={styles.dialogClose} aria-label="Close inventory" onClick={() => setEdit(null)}>×</button>
        <label>Quality control<select value={edit.qc} onChange={e => setEdit({ ...edit, qc: e.target.value })}>{["pending", "approved", "rejected"].map(v => <option key={v}>{v}</option>)}</select></label>
        <label>Stock status<select value={edit.status} onChange={e => setEdit({ ...edit, status: e.target.value })}>{["instock", "shipped", "consumed", "void"].map(v => <option key={v}>{v}</option>)}</select></label>
        <label>Change note<textarea maxLength={1000} value={note} onChange={e => setNote(e.target.value)} /></label>
        <button className={styles.btnPrimary} disabled={saving}>Save inventory</button>{msg && <p role="alert">{msg}</p>}
        <h3>History</h3><div className={styles.history}>{(JSON.parse(edit.historyJson || "[]") as { at: string; action: string; note: string }[]).map((h, i) => <p key={i}>{h.at} · {h.action} · {h.note}</p>)}</div>
      </form></div>}
    </section>
  );
}

// ── Settings ──────────────────────────────────────────────────────────────────

function SettingsPanel() {
  const [vals, setVals] = useState({ tintFilm: null as number | null, tintInstall: null as number | null, ppfFilm: null as number | null, ppfInstall: null as number | null });
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    adminGetSettings().then((d: unknown) => {
      const dd = d as { durations: { tint: { film: number | null; install: number | null }; ppf: { film: number | null; install: number | null } } };
      setVals({ tintFilm: dd.durations.tint.film, tintInstall: dd.durations.tint.install, ppfFilm: dd.durations.ppf.film, ppfInstall: dd.durations.ppf.install });
      setLoaded(true);
    }).catch((ex: unknown) => setMsg(errorText(ex, "Could not load coverage periods.")));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setMsg("");
    try {
      await adminSaveSettings({ durations: { tint: { film: vals.tintFilm, install: vals.tintInstall }, ppf: { film: vals.ppfFilm, install: vals.ppfInstall } } });
      setMsg("Saved.");
    } catch (ex: unknown) {
      setMsg(errorText(ex, "Error"));
    } finally {
      setSaving(false);
    }
  }

  function sel(key: keyof typeof vals, v: string) {
    setVals(p => ({ ...p, [key]: v === "null" ? null : Number(v) }));
  }

  return (
    <section>
      <header className={styles.panelHead}><div><span className={styles.eyebrow}>SETTINGS</span><h1>Coverage periods</h1></div></header>
      <div className={styles.card} style={{ maxWidth: 540 }}>
        <form onSubmit={onSubmit} className={styles.adminForm}>
          {[
            { label: "Tint – film warranty", key: "tintFilm" as const },
            { label: "Tint – installation warranty", key: "tintInstall" as const },
            { label: "PPF – film warranty", key: "ppfFilm" as const },
            { label: "PPF – installation warranty", key: "ppfInstall" as const },
          ].map(x => (
            <label key={x.key}>{x.label}
              <select value={String(vals[x.key])} onChange={e => sel(x.key, e.target.value)}>
                <option value="null">Not set</option>
                {(x.key.endsWith("Film") ? [3, 5, 7, 10] : [1, 2, 3]).map(n => <option key={n} value={n}>{n} year{n > 1 ? "s" : ""}</option>)}
              </select>
            </label>
          ))}
          <button type="submit" className={styles.btnPrimary} disabled={saving || !loaded}>
            {saving ? "Saving…" : "Save periods ↗"}
          </button>
          {msg && <p>{msg}</p>}
        </form>
      </div>
      <p className={styles.empty}>SMS connection and verification rules moved to the SMS section.</p>
    </section>
  );
}
