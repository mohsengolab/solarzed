"use client";

import { useState, useEffect, useCallback, FormEvent, type JSX } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import {
  adminLogin, adminLogout, adminSession, adminOverview, adminWarranties, adminDecision,
  adminRollsSearch, adminCreateRolls, adminGetSettings, adminSaveSettings,
  adminBoxLabels, managementFetch, ADMIN_UNAUTHORIZED, fa, qs,
} from "@/lib/api";
import styles from "./admin.module.css";
import labelsStyle from "./labels.module.css";
import BoxLabelsPanel from "./BoxLabelsPanel";
import { printQrLabels } from "./qrPrint";
import { ProductsPanel, CustomersPanel, AccountPanel, UsersPanel } from "./ManagementPanels";
import SmsSettingsPanel from "./SmsSettingsPanel";
import { usePaged, SortTh, Pager, FilterBar, countActive, downloadCsv, errorText } from "./AdminKit";

type Role = "admin" | "carton";
const VIEWS = ["overview", "reports", "warranties", "rolls", "products", "customers", "labels", "sms", "settings", "account", "users"] as const;
type View = typeof VIEWS[number];
const LABELS: Record<View, string> = {
  overview: "نمای کلی", reports: "گزارش‌ها", warranties: "گارانتی‌ها", rolls: "رول‌ها", products: "محصولات",
  labels: "برچسب‌ها", customers: "مشتریان", sms: "پیامک", settings: "تنظیمات", account: "حساب کاربری", users: "کاربران",
};
// A carton operator only needs the box labels and their own account.
const VIEWS_BY_ROLE: Record<Role, readonly View[]> = { admin: VIEWS, carton: ["labels", "account"] };

// ── SVG Nav Icons ─────────────────────────────────────────────────────────────
const NavIcons: Record<View, JSX.Element> = {
  overview: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
  reports:  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  warranties:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>,
  rolls:    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="12" rx="10" ry="4"/><path d="M2 12v6c0 2.2 4.5 4 10 4s10-1.8 10-4v-6"/><path d="M2 6v6c0 2.2 4.5 4 10 4s10-1.8 10-4V6"/></svg>,
  products: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>,
  labels:   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>,
  customers:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  sms:      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  settings: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  account:  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  users:    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-2a4 4 0 0 0-3-3.87"/></svg>,
};
const viewFromHash = (): View => {
  const h = typeof window === "undefined" ? "" : window.location.hash.slice(1);
  return (VIEWS as readonly string[]).includes(h) ? h as View : "overview";
};

export default function AdminPage() {
  const [state, setState] = useState<"checking" | "out" | "in">("checking");
  const [view, setView] = useState<View>("overview");
  const [role, setRole] = useState<Role>("admin");

  // Restore an existing HttpOnly-cookie session; any 401 later returns to the sign-in form.
  useEffect(() => {
    let live = true;
    adminSession()
      .then(s => {
        if (!live) return;
        const r: Role = s.role === "carton" ? "carton" : "admin";
        setRole(r);
        const wanted = viewFromHash();
        setView(VIEWS_BY_ROLE[r].includes(wanted) ? wanted : VIEWS_BY_ROLE[r][0]);
        setState("in");
      })
      .catch(() => { if (live) setState("out"); });
    const out = () => setState("out");
    const hash = () => setView(v => (VIEWS_BY_ROLE[role].includes(viewFromHash()) ? viewFromHash() : v));
    window.addEventListener(ADMIN_UNAUTHORIZED, out);
    window.addEventListener("hashchange", hash);
    return () => { live = false; window.removeEventListener(ADMIN_UNAUTHORIZED, out); window.removeEventListener("hashchange", hash); };
  }, [role]);

  const nav = useCallback((v: View) => {
    setView(v);
    if (window.location.hash.slice(1) !== v) window.history.pushState(null, "", `#${v}`);
  }, []);

  if (state === "checking") return <div className={styles.loginWrap}><p className={styles.loading}>{fa("Loading…")}</p></div>;
  if (state === "out") return <LoginView onLogin={r => { setRole(r); setView(VIEWS_BY_ROLE[r][0]); setState("in"); }} />;
  return <AdminApp view={view} role={role} onNav={nav} onLogout={() => { adminLogout().catch(() => {}).finally(() => setState("out")); }} />;
}

// ── Login ────────────────────────────────────────────────────────────────────

function LoginView({ onLogin }: { onLogin: (role: Role) => void }) {
  const [username, setUsername] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr("");
    try {
      const session = await adminLogin(username.trim(), pw);
      setPw("");
      onLogin(session.role === "carton" ? "carton" : "admin");
    } catch (ex: unknown) {
      setErr(fa(errorText(ex, fa("Login failed"))));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.loginWrap}>
      <form onSubmit={onSubmit} className={styles.loginCard} dir="rtl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/solarzed-original.png" alt="SOLARZED" width={200} height={40} />
        <h1>{fa("Warranty administration")}</h1>
        <p>{fa("Sign in to review installations, manage rolls and set coverage.")}</p>
        <label htmlFor="username">{fa("Username")}</label>
        <input id="username" autoComplete="username" required maxLength={100} value={username} onChange={e => setUsername(e.target.value)} />
        <label htmlFor="pw">{fa("Admin password")}</label>
        <input id="pw" type="password" autoComplete="current-password" required maxLength={200} value={pw} onChange={e => setPw(e.target.value)} />
        <button type="submit" disabled={loading}>
          {loading ? fa("Signing in…") : fa("Sign in ↗")}
        </button>
        {err && <p className={styles.loginErr} role="alert">{err}</p>}
      </form>
    </div>
  );
}

// ── App shell ────────────────────────────────────────────────────────────────

const NAV_GROUPS: { label?: string; views: View[] }[] = [
  { views: ["overview", "reports"] },
  { label: "مدیریت", views: ["warranties", "rolls", "products", "customers", "labels"] },
  { label: "پیکربندی", views: ["sms", "settings"] },
  { label: "حساب", views: ["account", "users"] },
];

function AdminApp({ view, role, onNav, onLogout }: { view: View; role: Role; onNav: (v: View) => void; onLogout: () => void }) {
  const allowed = VIEWS_BY_ROLE[role];
  return (
    <div className={styles.app}>
      <aside className={styles.side}>
        <Link href="/" className={styles.brand}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/solarzed-original.png" alt="SOLARZED" width={140} height={28} />
          <span className={styles.brandBadge}>ADMIN</span>
        </Link>

        <nav aria-label="Administration" className={styles.nav}>
          {NAV_GROUPS.map((group, gi) => {
            const items = group.views.filter(v => allowed.includes(v));
            if (!items.length) return null;
            return (
              <div key={gi} className={styles.navGroup}>
                {group.label && <span className={styles.navGroupLabel}>{group.label}</span>}
                {items.map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => onNav(v)}
                    aria-current={view === v ? "page" : undefined}
                    className={`${styles.navBtn} ${view === v ? styles.navActive : ""}`}
                  >
                    <span className={styles.navIconWrap} aria-hidden="true">{NavIcons[v]}</span>
                    <span className={styles.navLabel}>{LABELS[v]}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </nav>

        <div className={styles.sideFooter}>
          <button type="button" className={styles.logout} onClick={onLogout}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            خروج از سیستم
          </button>
        </div>
      </aside>
      <main className={styles.main} dir="rtl">
        {view === "overview"  && <OverviewPanel onNav={onNav} />}
        {view === "reports"   && <ReportsPanel />}
        {view === "products"  && <ProductsPanel />}
        {view === "customers" && <CustomersPanel />}
        {view === "account"   && <AccountPanel role={role} />}
        {view === "users"     && <UsersPanel />}
        {view === "warranties"&& <WarrantiesPanel />}
        {view === "rolls"     && <RollsPanel />}
        {view === "labels"    && <BoxLabelsPanel onSettings={() => onNav("settings")} role={role} />}
        {view === "sms"       && <SmsSettingsPanel />}
        {view === "settings"  && <SettingsPanel />}
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
  if (!data) return <p className={styles.loading}>{fa("Loading…")}</p>;
  const d = data;

  return (
    <section>
      <header className={styles.panelHead}>
        <div><span className={styles.eyebrow}>نمای کلی</span><h1>عملیات گارانتی</h1></div>
        <button type="button" className={styles.ghost} onClick={load}>بازخوانی</button>
      </header>
      <div className={styles.kpis}>
        {[["کل", d.total], ["در انتظار", d.pending], ["فعال", d.active], ["رد شده", d.rejected], ["رول‌ها", d.rollCount]].map(([k, v]) => (
          <div key={String(k)} className={styles.kpi}><span>{k}</span><b>{Number(v).toLocaleString("fa-IR")}</b></div>
        ))}
      </div>
      <div className={styles.card}>
        <h2>صف بررسی</h2>
        {d.queue.length === 0
          ? <p className={styles.empty}>صف خالی است.</p>
          : <table className={styles.table}>
              <thead><tr><th>کد</th><th>خودرو</th><th>تاریخ نصب</th><th>پرچم‌ها</th></tr></thead>
              <tbody>
                {d.queue.map(w => (
                  <tr key={w.code} onClick={() => onNav("warranties")} style={{ cursor: "pointer" }}>
                    <td><code dir="ltr">{w.code}</code></td>
                    <td>{w.make} {w.model}</td>
                    <td>{w.installed}</td>
                    <td>{(JSON.parse(w.flagsJson || "[]") as string[]).map(x => fa(x)).join("، ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
        }
      </div>
    </section>
  );
}

// ── Reports ───────────────────────────────────────────────────────────────────

type ReportTab = "warranties" | "rolls" | "summary";

function ReportsPanel() {
  const [tab, setTab] = useState<ReportTab>("summary");
  return (
    <section>
      <header className={styles.panelHead}>
        <div><span className={styles.eyebrow}>گزارش‌ها</span><h1>گزارش‌گیری جامع</h1></div>
      </header>
      <div className={styles.reportTabs}>
        {([["summary", "خلاصه کلی"], ["warranties", "گزارش گارانتی‌ها"], ["rolls", "گزارش رول‌ها"]] as [ReportTab, string][]).map(([t, l]) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={tab === t ? styles.reportTabActive : styles.reportTab}>{l}</button>
        ))}
      </div>
      {tab === "summary"    && <ReportSummary />}
      {tab === "warranties" && <ReportWarranties />}
      {tab === "rolls"      && <ReportRolls />}
    </section>
  );
}

function ReportSummary() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    setLoading(true);
    adminOverview()
      .then(d => { setData(d as OverviewData); setLoading(false); })
      .catch(e => { setErr(errorText(e)); setLoading(false); });
  }, []);

  if (loading) return <p className={styles.loading}>در حال بارگذاری…</p>;
  if (err) return <p className={styles.errorText}>{err}</p>;
  if (!data) return null;

  const pctActive   = data.total ? Math.round((data.active   / data.total) * 100) : 0;
  const pctPending  = data.total ? Math.round((data.pending  / data.total) * 100) : 0;
  const pctRejected = data.total ? Math.round((data.rejected / data.total) * 100) : 0;

  return (
    <>
      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard} data-accent="teal">
          <span className={styles.kpiLabel}>کل گارانتی‌ها</span>
          <span className={styles.kpiValue}>{data.total.toLocaleString("fa-IR")}</span>
          <span className={styles.kpiSub}>تمام ثبت‌ها</span>
        </div>
        <div className={styles.kpiCard} data-accent="green">
          <span className={styles.kpiLabel}>فعال</span>
          <span className={styles.kpiValue}>{data.active.toLocaleString("fa-IR")}</span>
          <span className={styles.kpiSub}>{pctActive}٪ از کل</span>
        </div>
        <div className={styles.kpiCard} data-accent="yellow">
          <span className={styles.kpiLabel}>در انتظار بررسی</span>
          <span className={styles.kpiValue}>{data.pending.toLocaleString("fa-IR")}</span>
          <span className={styles.kpiSub}>{pctPending}٪ از کل</span>
        </div>
        <div className={styles.kpiCard} data-accent="red">
          <span className={styles.kpiLabel}>رد شده</span>
          <span className={styles.kpiValue}>{data.rejected.toLocaleString("fa-IR")}</span>
          <span className={styles.kpiSub}>{pctRejected}٪ از کل</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>رول‌های موجود</span>
          <span className={styles.kpiValue}>{data.rollCount.toLocaleString("fa-IR")}</span>
          <span className={styles.kpiSub}>در سیستم</span>
        </div>
      </div>

      {data.queue.length > 0 && (
        <div className={styles.card}>
          <h2>صف بررسی ({data.queue.length.toLocaleString("fa-IR")} مورد)</h2>
          <table className={styles.table}>
            <thead><tr><th>کد</th><th>خودرو</th><th>تاریخ نصب</th><th>پرچم‌ها</th></tr></thead>
            <tbody>
              {data.queue.map(w => (
                <tr key={w.code}>
                  <td><code dir="ltr">{w.code}</code></td>
                  <td>{w.make} {w.model}</td>
                  <td>{w.installed}</td>
                  <td>{(JSON.parse(w.flagsJson || "[]") as string[]).map(x => fa(x)).join("، ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

const thisMonthStart = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };
const lastMonthRange = () => {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const last  = new Date(now.getFullYear(), now.getMonth(), 0);
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
};

const W_RPT_EMPTY = { status: "", type: "", installer: "", make: "", createdFrom: "", createdTo: "", installedFrom: "", installedTo: "", expiringDays: "" };

function ReportWarranties() {
  const [f, setF] = useState(W_RPT_EMPTY);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const set = (k: keyof typeof W_RPT_EMPTY) => (e: { target: { value: string } }) => setF(p => ({ ...p, [k]: e.target.value }));

  function preset(name: "thisMonth" | "lastMonth" | "allActive" | "expiring90") {
    if (name === "thisMonth")  setF({ ...W_RPT_EMPTY, createdFrom: thisMonthStart() });
    if (name === "lastMonth")  { const { from, to } = lastMonthRange(); setF({ ...W_RPT_EMPTY, createdFrom: from, createdTo: to }); }
    if (name === "allActive")  setF({ ...W_RPT_EMPTY, status: "active" });
    if (name === "expiring90") setF({ ...W_RPT_EMPTY, status: "active", expiringDays: "90" });
  }

  async function doExport() {
    setLoading(true); setMsg("");
    try {
      const q = qs({ ...f, page: 1, pageSize: 1000, sort: "createdAt", dir: "desc" });
      const all = await adminWarranties<WRow>(q);
      downloadCsv("warranties-report", all.items, [
        ["code", "کد گارانتی"], ["status", "وضعیت"], ["type", "نوع محصول"],
        ["owner", "مالک"], ["phone", "موبایل"], ["make", "برند خودرو"], ["model", "مدل خودرو"],
        ["vin", "VIN"], ["plate", "پلاک"], ["filmSerial", "سریال فیلم"], ["invoiceNumber", "شماره فاکتور"],
        ["installer", "نصّاب / فروشنده"], ["installed", "تاریخ نصب"],
        ["filmEnds", "پایان گارانتی فیلم"], ["createdAt", "تاریخ ثبت"],
      ]);
      setMsg(`${all.total.toLocaleString("fa-IR")} ردیف دریافت شد.`);
    } catch (e) { setMsg(errorText(e, "خروجی ناموفق بود.")); }
    finally { setLoading(false); }
  }

  const lmr = lastMonthRange();

  return (
    <div className={styles.card}>
      <h2>گزارش سفارشی گارانتی‌ها</h2>
      <p className={styles.empty}>فیلترها را تنظیم کنید، سپس خروجی CSV بگیرید (حداکثر ۱۰۰۰ ردیف).</p>

      <div className={styles.filters}>
        <span style={{ fontSize: 12, color: "#7d97ad", marginInlineEnd: 4 }}>گزارش سریع:</span>
        <button type="button" className={styles.ghost} onClick={() => preset("thisMonth")}>این ماه</button>
        <button type="button" className={styles.ghost} onClick={() => preset("lastMonth")}>ماه گذشته ({lmr.from.slice(0,7)})</button>
        <button type="button" className={styles.ghost} onClick={() => preset("allActive")}>همه فعال‌ها</button>
        <button type="button" className={styles.ghost} onClick={() => preset("expiring90")}>انقضا ۹۰ روز</button>
        <button type="button" className={styles.ghost} onClick={() => setF(W_RPT_EMPTY)}>پاک کردن</button>
      </div>

      <div className={styles.row2}>
        <label className={styles.adminForm.toString()}>وضعیت
          <select value={f.status} onChange={set("status")} className="" style={{ padding: "9px 12px", background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.12)", borderRadius: 10, color: "#fff", fontFamily: "var(--sz-font)", fontSize: 14 }}>
            <option value="">همه وضعیت‌ها</option><option value="active">فعال</option><option value="pending">در انتظار</option><option value="rejected">رد شده</option>
          </select>
        </label>
        <label>نوع محصول
          <select value={f.type} onChange={set("type")} style={{ padding: "9px 12px", background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.12)", borderRadius: 10, color: "#fff", fontFamily: "var(--sz-font)", fontSize: 14 }}>
            <option value="">همه انواع</option><option value="tint">فیلم شیشه</option><option value="ppf">PPF</option>
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 600, color: "#c3d4e3" }}>نصّاب / فروشنده
          <input value={f.installer} onChange={set("installer")} placeholder="نام نصّاب یا فروشنده" style={{ padding: "9px 12px", background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.12)", borderRadius: 10, color: "#fff", fontFamily: "var(--sz-font)", fontSize: 14 }} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 600, color: "#c3d4e3" }}>برند / مدل خودرو
          <input value={f.make} onChange={set("make")} placeholder="مثلاً تویوتا یا پراید" style={{ padding: "9px 12px", background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.12)", borderRadius: 10, color: "#fff", fontFamily: "var(--sz-font)", fontSize: 14 }} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 600, color: "#c3d4e3" }}>ثبت از
          <input type="date" value={f.createdFrom} onChange={set("createdFrom")} style={{ padding: "9px 12px", background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.12)", borderRadius: 10, color: "#fff", fontFamily: "var(--sz-font)", fontSize: 14, colorScheme: "dark" }} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 600, color: "#c3d4e3" }}>ثبت تا
          <input type="date" value={f.createdTo} onChange={set("createdTo")} style={{ padding: "9px 12px", background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.12)", borderRadius: 10, color: "#fff", fontFamily: "var(--sz-font)", fontSize: 14, colorScheme: "dark" }} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 600, color: "#c3d4e3" }}>نصب از
          <input type="date" value={f.installedFrom} onChange={set("installedFrom")} style={{ padding: "9px 12px", background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.12)", borderRadius: 10, color: "#fff", fontFamily: "var(--sz-font)", fontSize: 14, colorScheme: "dark" }} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 600, color: "#c3d4e3" }}>نصب تا
          <input type="date" value={f.installedTo} onChange={set("installedTo")} style={{ padding: "9px 12px", background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.12)", borderRadius: 10, color: "#fff", fontFamily: "var(--sz-font)", fontSize: 14, colorScheme: "dark" }} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 600, color: "#c3d4e3" }}>انقضای گارانتی فیلم
          <select value={f.expiringDays} onChange={set("expiringDays")} style={{ padding: "9px 12px", background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.12)", borderRadius: 10, color: "#fff", fontFamily: "var(--sz-font)", fontSize: 14 }}>
            <option value="">هر زمان</option><option value="30">تا ۳۰ روز</option><option value="90">تا ۹۰ روز</option><option value="365">تا ۱ سال</option>
          </select>
        </label>
      </div>

      <div className={styles.filters} style={{ marginTop: 20 }}>
        <button type="button" className={styles.btnPrimary} onClick={doExport} disabled={loading}>
          {loading ? "در حال دریافت…" : "دریافت خروجی CSV ↓"}
        </button>
      </div>
      {msg && <p className={styles.okText}>{msg}</p>}
    </div>
  );
}

const R_RPT_EMPTY = { model: "", type: "", qc: "", status: "", supplier: "", receivedFrom: "", receivedTo: "" };

function ReportRolls() {
  const [f, setF] = useState(R_RPT_EMPTY);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [products, setProducts] = useState<{ code: string; name: string }[]>([]);
  const set = (k: keyof typeof R_RPT_EMPTY) => (e: { target: { value: string } }) => setF(p => ({ ...p, [k]: e.target.value }));

  useEffect(() => {
    managementFetch<{ items: typeof products }>("products?pageSize=200")
      .then(r => setProducts(r.items)).catch(() => {});
  }, []);

  async function doExport() {
    setLoading(true); setMsg("");
    try {
      const q = qs({ ...f, page: 1, pageSize: 1000, sort: "receivedAt", dir: "desc" });
      const all = await adminRollsSearch<RollRow>(q);
      downloadCsv("rolls-report", all.items, [
        ["id", "شناسه رول"], ["modelCode", "کد مدل"], ["type", "نوع"],
        ["batch", "بچ"], ["supplier", "تأمین‌کننده"], ["qc", "کنترل کیفیت"],
        ["status", "وضعیت انبار"], ["installs", "تعداد نصب"], ["receivedAt", "تاریخ دریافت"],
      ]);
      setMsg(`${all.total.toLocaleString("fa-IR")} ردیف دریافت شد.`);
    } catch (e) { setMsg(errorText(e, "خروجی ناموفق بود.")); }
    finally { setLoading(false); }
  }

  const lmr = lastMonthRange();
  return (
    <div className={styles.card}>
      <h2>گزارش سفارشی رول‌ها</h2>
      <p className={styles.empty}>فیلترها را تنظیم کنید، سپس خروجی CSV بگیرید (حداکثر ۱۰۰۰ ردیف).</p>

      <div className={styles.filters}>
        <span style={{ fontSize: 12, color: "#7d97ad", marginInlineEnd: 4 }}>گزارش سریع:</span>
        <button type="button" className={styles.ghost} onClick={() => setF({ ...R_RPT_EMPTY, receivedFrom: thisMonthStart() })}>دریافت این ماه</button>
        <button type="button" className={styles.ghost} onClick={() => setF({ ...R_RPT_EMPTY, receivedFrom: lmr.from, receivedTo: lmr.to })}>دریافت ماه گذشته</button>
        <button type="button" className={styles.ghost} onClick={() => setF({ ...R_RPT_EMPTY, status: "instock" })}>موجود در انبار</button>
        <button type="button" className={styles.ghost} onClick={() => setF({ ...R_RPT_EMPTY, qc: "pending" })}>QC در انتظار</button>
        <button type="button" className={styles.ghost} onClick={() => setF(R_RPT_EMPTY)}>پاک کردن</button>
      </div>

      <div className={styles.row2}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 600, color: "#c3d4e3" }}>محصول
          <select value={f.model} onChange={set("model")} style={{ padding: "9px 12px", background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.12)", borderRadius: 10, color: "#fff", fontFamily: "var(--sz-font)", fontSize: 14 }}>
            <option value="">همه محصولات</option>{products.map(p => <option key={p.code} value={p.code}>{p.code}</option>)}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 600, color: "#c3d4e3" }}>نوع
          <select value={f.type} onChange={set("type")} style={{ padding: "9px 12px", background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.12)", borderRadius: 10, color: "#fff", fontFamily: "var(--sz-font)", fontSize: 14 }}>
            <option value="">همه انواع</option><option value="tint">فیلم شیشه</option><option value="ppf">PPF</option>
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 600, color: "#c3d4e3" }}>کنترل کیفیت
          <select value={f.qc} onChange={set("qc")} style={{ padding: "9px 12px", background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.12)", borderRadius: 10, color: "#fff", fontFamily: "var(--sz-font)", fontSize: 14 }}>
            <option value="">همه</option><option value="pending">در انتظار</option><option value="approved">تأیید شده</option><option value="rejected">رد شده</option>
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 600, color: "#c3d4e3" }}>وضعیت انبار
          <select value={f.status} onChange={set("status")} style={{ padding: "9px 12px", background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.12)", borderRadius: 10, color: "#fff", fontFamily: "var(--sz-font)", fontSize: 14 }}>
            <option value="">همه</option><option value="instock">موجود</option><option value="shipped">ارسال شده</option><option value="consumed">مصرف شده</option><option value="void">باطل</option>
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 600, color: "#c3d4e3" }}>تأمین‌کننده شامل
          <input value={f.supplier} onChange={set("supplier")} placeholder="کد یا نام تأمین‌کننده" style={{ padding: "9px 12px", background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.12)", borderRadius: 10, color: "#fff", fontFamily: "var(--sz-font)", fontSize: 14 }} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 600, color: "#c3d4e3" }}>دریافت از
          <input type="date" value={f.receivedFrom} onChange={set("receivedFrom")} style={{ padding: "9px 12px", background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.12)", borderRadius: 10, color: "#fff", fontFamily: "var(--sz-font)", fontSize: 14, colorScheme: "dark" }} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 600, color: "#c3d4e3" }}>دریافت تا
          <input type="date" value={f.receivedTo} onChange={set("receivedTo")} style={{ padding: "9px 12px", background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.12)", borderRadius: 10, color: "#fff", fontFamily: "var(--sz-font)", fontSize: 14, colorScheme: "dark" }} />
        </label>
      </div>

      <div className={styles.filters} style={{ marginTop: 20 }}>
        <button type="button" className={styles.btnPrimary} onClick={doExport} disabled={loading}>
          {loading ? "در حال دریافت…" : "دریافت خروجی CSV ↓"}
        </button>
      </div>
      {msg && <p className={styles.okText}>{msg}</p>}
    </div>
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
    adminBoxLabels().then(r => setSite(r.siteUrl)).catch(() => setQrError("بارگذاری آدرس وب‌سایت عمومی ناموفق بود. آن را در بخش برچسب‌ها → تنظیمات چاپ تعیین کنید."));
  }, []);

  const printable = Object.values(checked).filter(w => w.status !== "rejected");
  const printableKey = printable.map(w => w.code).join("|");

  useEffect(() => {
    if (!site) return;
    let cancelled = false;
    Promise.all(printableKey.split("|").filter(Boolean).map(async code =>
      [code, await QRCode.toDataURL(`${site.replace(/\/+$/, "")}/warranty?code=${encodeURIComponent(code)}`, { errorCorrectionLevel: "M", margin: 4, scale: 8 })] as const,
    )).then(entries => { if (!cancelled) setQrs(Object.fromEntries(entries)); })
      .catch(ex => { if (!cancelled) setQrError(fa(errorText(ex, "ساخت QR ناموفق بود."))); });
    return () => { cancelled = true; };
  }, [printableKey, site]);

  async function decide() {
    if (!selected) return;
    setSaving(true);
    setMsg("");
    try {
      await adminDecision(selected.code, decStatus, decNote);
      setMsg("ذخیره شد.");
      setSelected(null);
      list.reload();
    } catch (e: unknown) {
      setMsg(fa(errorText(e, fa("Error"))));
    } finally {
      setSaving(false);
    }
  }

  async function printQr() {
    setQrError("");
    if (width < 60 || width > 150 || height < 40 || height > 150 || !Number.isFinite(width + height)) {
      setQrError("اندازه برچسب باید ۶۰ تا ۱۵۰ میلی‌متر عرض و ۴۰ تا ۱۵۰ میلی‌متر ارتفاع باشد."); return;
    }
    if (!site || !printable.length || printable.some(w => !qrs[w.code])) {
      setQrError("گارانتی‌ها را انتخاب کنید و منتظر پیش‌نمایش QR بمانید."); return;
    }
    await printQrLabels("Solarzed warranty QR", width, height, printable.map(w => ({
      qr: qrs[w.code],
      alt: `تأیید گارانتی ${w.code}`,
      title: "برای تأیید گارانتی اسکن کنید",
      lines: [w.code, `${w.make} ${w.model} · ${w.type === "ppf" ? "PPF" : "فیلم شیشه"}`, `نصب ${w.installed}`,
        ...(w.status === "active" && w.filmEnds ? [`گارانتی فیلم تا ${w.filmEnds}`] : [`وضعیت: ${fa(w.status)}`])],
      footer: new URL(site).host,
    })));
  }

  async function exportCsv() {
    try {
      const all = await adminWarranties<WRow>(list.exportQuery);
      downloadCsv("warranties", all.items, [["code", "کد"], ["status", "وضعیت"], ["type", "نوع"], ["owner", "مالک"], ["phone", "موبایل"],
        ["make", "برند"], ["model", "مدل"], ["vin", "VIN"], ["plate", "پلاک"], ["filmSerial", "سریال فیلم"], ["invoiceNumber", "فاکتور"],
        ["installer", "نصّاب"], ["installed", "تاریخ نصب"], ["filmEnds", "پایان گارانتی فیلم"], ["createdAt", "ثبت"]]);
    } catch (e) { setQrError(fa(errorText(e, "خروجی ناموفق بود."))); }
  }

  const sortProps = { sort: list.sort, onSort: list.toggleSort };
  return (
    <section>
      <header className={styles.panelHead}>
        <div><span className={styles.eyebrow}>گارانتی‌ها</span><h1>ثبت‌ها</h1></div>
        <button type="button" className={styles.ghost} onClick={exportCsv} disabled={!list.total}>خروجی CSV (حداکثر ۲۰۰)</button>
      </header>
      <div className={styles.filters} role="group" aria-label="وضعیت">
        {["pending", "active", "rejected", ""].map(st => (
          <button key={st} type="button" onClick={() => setStatus(st)} className={status === st ? styles.segActive : styles.seg} aria-pressed={status === st}>
            {st ? fa(st) : "همه"}
          </button>
        ))}
      </div>
      <FilterBar active={countActive(f)} onClear={() => setF(W_EMPTY)}>
        <label className={styles.wide}>جستجوی گارانتی<input type="search" placeholder="کد، مالک، موبایل، VIN، پلاک، سریال، فاکتور، رول" value={f.q} onChange={set("q")} /></label>
        <label>نوع محصول<select value={f.type} onChange={set("type")}><option value="">همه انواع</option><option value="tint">فیلم شیشه</option><option value="ppf">PPF</option></select></label>
        <label>پرچم‌ها<select value={f.flagged} onChange={set("flagged")}><option value="">هر</option><option value="true">فقط دارای پرچم</option><option value="false">بدون پرچم</option></select></label>
        <label>پرچم مشخص<select value={f.flag} onChange={set("flag")}><option value="">هر پرچم</option>{FLAGS.map(x => <option key={x} value={x}>{fa(x)}</option>)}</select></label>
        <label>برند / مدل خودرو<input value={f.make} onChange={set("make")} /></label>
        <label>نصّاب / فروشنده<input value={f.installer} onChange={set("installer")} /></label>
        <label>نصب از<input type="date" value={f.installedFrom} onChange={set("installedFrom")} /></label>
        <label>نصب تا<input type="date" value={f.installedTo} onChange={set("installedTo")} /></label>
        <label>ثبت از<input type="date" value={f.createdFrom} onChange={set("createdFrom")} /></label>
        <label>ثبت تا<input type="date" value={f.createdTo} onChange={set("createdTo")} /></label>
        <label>انقضای گارانتی فیلم<select value={f.expiringDays} onChange={set("expiringDays")}><option value="">هر زمان</option><option value="30">تا ۳۰ روز</option><option value="90">تا ۹۰ روز</option><option value="365">تا ۱ سال</option></select></label>
      </FilterBar>
      {list.error && <p role="alert" className={styles.errorText}>{list.error}</p>}
      <div className={styles.card}>
        <table className={`${styles.table} ${list.loading ? styles.tableBusy : ""}`}>
          <thead><tr><th>QR</th><SortTh column="code" label="کد" {...sortProps} /><SortTh column="owner" label="مالک" {...sortProps} /><SortTh column="make" label="خودرو" {...sortProps} />
            <SortTh column="type" label="نوع" {...sortProps} /><SortTh column="installer" label="نصّاب" {...sortProps} /><SortTh column="installed" label="نصب" {...sortProps} />
            <SortTh column="filmEnds" label="پایان فیلم" {...sortProps} /><SortTh column="status" label="وضعیت" {...sortProps} /><th>پرچم‌ها</th></tr></thead>
          <tbody>
            {list.items.map(w => (
              <tr key={w.code} onClick={() => { setSelected(w); setDecStatus("active"); setDecNote(""); setMsg(""); }} style={{ cursor: "pointer" }}>
                <td onClick={e => e.stopPropagation()}>
                  <input type="checkbox" aria-label={`انتخاب ${w.code} برای چاپ QR`} disabled={w.status === "rejected"}
                    checked={!!checked[w.code]}
                    onChange={e => setChecked(c => { const n = { ...c }; if (e.target.checked) n[w.code] = w; else delete n[w.code]; return n; })} />
                </td>
                <td><code dir="ltr">{w.code}</code></td>
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
        {!list.loading && !list.items.length && <p className={styles.empty}>گارانتی‌ای با این فیلترها یافت نشد.</p>}
        <Pager page={list.page} pageSize={list.pageSize} total={list.total} loading={list.loading} onPage={list.setPage} />
      </div>

      <div className={`${styles.card} ${styles.adminForm}`} style={{ marginBottom: 20 }}>
        <h2>کدهای QR گارانتی</h2>
        <p className={labelsStyle.help}>گارانتی‌های بالا را برای چاپ برچسب QR انتخاب کنید (انتخاب بین صفحه‌ها و فیلترها حفظ می‌شود). اسکن آن، صفحه بررسی عمومی گارانتی همان کد را روی {site ? new URL(site).host : "وب‌سایت عمومی"} باز می‌کند. گارانتی‌های رد شده قابل چاپ نیستند.</p>
        {qrError && <p role="alert" className={labelsStyle.error}>{qrError}</p>}
        <div className={labelsStyle.sizes}>
          <label>عرض (میلی‌متر)<input type="number" min={60} max={150} value={width} onChange={e => setWidth(Number(e.target.value))} /></label>
          <label>ارتفاع (میلی‌متر)<input type="number" min={40} max={150} value={height} onChange={e => setHeight(Number(e.target.value))} /></label>
        </div>
        <div className={styles.filters}>
          <button type="button" className={styles.btnPrimary} onClick={() => { printQr().catch(ex => setQrError(fa(errorText(ex, "چاپ ناموفق بود.")))); }}
            disabled={!site || !printable.length || printable.some(w => !qrs[w.code])}>
            چاپ QR گارانتی ({printable.length.toLocaleString("fa-IR")})
          </button>
          {printable.length > 0 && <button type="button" className={styles.ghost} onClick={() => setChecked({})}>پاک کردن انتخاب</button>}
        </div>
      </div>

      <div className={labelsStyle.previews}>{printable.map(w => (
        <article key={w.code} className={labelsStyle.preview}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {qrs[w.code] && <img src={qrs[w.code]} alt={`QR ${w.code}`} width={150} height={150} />}
          <div>
            <b>SOLARZED</b>
            <p>{w.make} {w.model} · {w.type === "ppf" ? "PPF" : "فیلم شیشه"}</p>
            <code dir="ltr">{w.code}</code>
            <p>{w.status === "active" && w.filmEnds ? `گارانتی فیلم تا ${w.filmEnds}` : `وضعیت: ${fa(w.status)}`}</p>
            <a href={`/warranty?code=${encodeURIComponent(w.code)}`} target="_blank" rel="noreferrer">پیش‌نمایش بررسی محلی ↗</a>
          </div>
        </article>
      ))}</div>

      {selected && (
        <div className={styles.dialog} role="dialog" aria-modal="true" aria-label="تصمیم گارانتی" onKeyDown={e => { if (e.key === "Escape") setSelected(null); }}>
          <div className={styles.dialogInner}>
            <button type="button" onClick={() => setSelected(null)} className={styles.dialogClose} aria-label="بستن">×</button>
            <h2>تصمیم — <span dir="ltr">{selected.code}</span></h2>
            <dl>{["owner", "phone", "make", "model", "vin", "plate", "filmSerial", "invoiceNumber", "installed", "sellerName", "sellerPhone", "installer", "rollId", "flagsJson", "reviewNote"].map(k => <div key={k}><dt>{fa(k)}</dt><dd>{String(selected[k] ?? "—")}</dd></div>)}</dl>
            <label>وضعیت
              <select value={decStatus} onChange={e => setDecStatus(e.target.value)}>
                <option value="active">فعال‌سازی</option>
                <option value="rejected">رد</option>
                <option value="pending">در انتظار بمان</option>
              </select>
            </label>
            <label>یادداشت {decStatus === "rejected" && <span style={{ color: "#f87171" }}>(الزامی)</span>}
              <textarea value={decNote} maxLength={500} onChange={e => setDecNote(e.target.value)} rows={3} />
            </label>
            <button type="button" className={styles.btnPrimary} onClick={decide} disabled={saving}>
              {saving ? "در حال ذخیره…" : "ذخیره تصمیم"}
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
    managementFetch<{ items: typeof products }>("products?pageSize=200").then(r => setProducts(r.items)).catch(e => setMsg(fa(errorText(e, "بارگذاری محصولات ناموفق بود."))));
  }, []);

  async function updateRoll(e: FormEvent) {
    e.preventDefault(); if (!edit) return; setSaving(true); setMsg("");
    try { await managementFetch(`rolls/${encodeURIComponent(edit.id)}`, { qc: edit.qc, status: edit.status, note }); list.reload(); setEdit(null); setMsg("موجودی به‌روزرسانی شد."); }
    catch (e) { setMsg(fa(errorText(e, "به‌روزرسانی ناموفق بود."))); } finally { setSaving(false); }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setMsg("");
    try {
      await adminCreateRolls({ ...form, quantity: Number(form.quantity) });
      setMsg("رول‌ها ساخته شدند.");
      list.reload();
    } catch (ex: unknown) {
      setMsg(fa(errorText(ex, fa("Error"))));
    } finally {
      setSaving(false);
    }
  }

  async function exportCsv() {
    try {
      const all = await adminRollsSearch<RollRow>(list.exportQuery);
      downloadCsv("rolls", all.items, [["id", "شناسه رول"], ["modelCode", "مدل"], ["type", "نوع"], ["batch", "بچ"], ["supplier", "تأمین‌کننده"],
        ["qc", "QC"], ["status", "وضعیت"], ["installs", "نصب‌ها"], ["receivedAt", "دریافت"]]);
    } catch (e) { setMsg(fa(errorText(e, "خروجی ناموفق بود."))); }
  }

  const sortProps = { sort: list.sort, onSort: list.toggleSort };
  return (
    <section>
      <header className={styles.panelHead}><div><span className={styles.eyebrow}>ثبت رول‌ها</span><h1>رول‌ها و بچ‌ها</h1></div></header>
      <div className={styles.card}>
        <h2>دریافت رول</h2>
        <form onSubmit={onSubmit} className={styles.adminForm}>
          <label>محصول تعریف‌شده
            <select value={products.some(p => p.code === form.modelCode) ? form.modelCode : ""} onChange={e => { const p = products.find(p => p.code === e.target.value); if (p) setForm(f => ({ ...f, modelCode: p.code, type: p.type })); }}>
              <option value="">یک محصول انتخاب کنید یا مدل موجود را پایین وارد کنید</option>
              {products.filter(p => !p.archived).map(p => <option key={p.code} value={p.code}>{p.code} · {p.name}</option>)}
            </select>
          </label>
          <div className={styles.row2}>
            {[
              { label: "کد مدل", name: "modelCode", placeholder: "مثلاً PIR یا CP-01", max: 24 },
              { label: "بچ", name: "batch", placeholder: "مثلاً LOT-2608-B17", max: 32 },
              { label: "کد تأمین‌کننده", name: "supplier", placeholder: "مثلاً SUP-02", max: 16 },
            ].map(x => (
              <label key={x.name}>{x.label}
                <input required maxLength={x.max} value={(form as Record<string, string>)[x.name]} placeholder={x.placeholder} dir="ltr"
                  onChange={e => setForm(p => ({ ...p, [x.name]: e.target.value }))} />
              </label>
            ))}
            <label>نوع
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                <option value="tint">فیلم شیشه</option>
                <option value="ppf">فیلم محافظ رنگ</option>
              </select>
            </label>
            <label>کنترل کیفیت
              <select value={form.qc} onChange={e => setForm(p => ({ ...p, qc: e.target.value }))}>
                <option value="pending">در انتظار</option>
                <option value="approved">تأیید شده</option>
                <option value="rejected">رد شده</option>
              </select>
            </label>
            <label>تعداد
              <input type="number" required min="1" max="200" value={form.quantity}
                onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))} />
            </label>
          </div>
          <button type="submit" className={styles.btnPrimary} disabled={saving}>
            {saving ? "در حال ساخت…" : "ساخت شناسه رول ↗"}
          </button>
          {msg && <p>{msg}</p>}
        </form>
      </div>

      <div className={styles.panelHead} style={{ marginTop: 24, marginBottom: 12 }}>
        <h2>موجودی</h2>
        <button type="button" className={styles.ghost} onClick={exportCsv} disabled={!list.total}>خروجی CSV (حداکثر ۲۰۰)</button>
      </div>
      <FilterBar active={countActive(f)} onClear={() => setF(R_EMPTY)}>
        <label className={styles.wide}>جستجوی موجودی<input type="search" placeholder="شناسه رول، مدل، بچ یا تأمین‌کننده" value={f.q} onChange={set("q")} /></label>
        <label>محصول<select value={f.model} onChange={set("model")}><option value="">همه محصولات</option>{products.map(p => <option key={p.code} value={p.code}>{p.code}</option>)}</select></label>
        <label>نوع<select value={f.type} onChange={set("type")}><option value="">همه انواع</option><option value="tint">فیلم شیشه</option><option value="ppf">PPF</option></select></label>
        <label>فیلتر QC<select value={f.qc} onChange={set("qc")}><option value="">هر QC</option><option value="pending">در انتظار</option><option value="approved">تأیید شده</option><option value="rejected">رد شده</option></select></label>
        <label>فیلتر وضعیت انبار<select value={f.status} onChange={set("status")}><option value="">هر وضعیت</option><option value="instock">موجود در انبار</option><option value="shipped">ارسال شده</option><option value="consumed">مصرف شده</option><option value="void">باطل</option></select></label>
        <label>بچ شامل<input value={f.batch} onChange={set("batch")} /></label>
        <label>تأمین‌کننده شامل<input value={f.supplier} onChange={set("supplier")} /></label>
        <label>دریافت از<input type="date" value={f.receivedFrom} onChange={set("receivedFrom")} /></label>
        <label>دریافت تا<input type="date" value={f.receivedTo} onChange={set("receivedTo")} /></label>
        <label>نصب‌ها<select value={f.hasInstalls} onChange={set("hasInstalls")}><option value="">هر</option><option value="true">دارای نصب</option><option value="false">بدون نصب</option></select></label>
      </FilterBar>
      {list.error && <p role="alert" className={styles.errorText}>{list.error}</p>}
      <div className={styles.card}>
        <table className={`${styles.table} ${list.loading ? styles.tableBusy : ""}`}>
          <thead><tr><SortTh column="id" label="شناسه رول" {...sortProps} /><SortTh column="modelCode" label="مدل" {...sortProps} /><SortTh column="type" label="نوع" {...sortProps} />
            <SortTh column="batch" label="بچ" {...sortProps} /><SortTh column="supplier" label="تأمین‌کننده" {...sortProps} /><SortTh column="qc" label="QC" {...sortProps} />
            <SortTh column="status" label="وضعیت" {...sortProps} /><th>نصب‌ها</th><SortTh column="receivedAt" label="دریافت" {...sortProps} /></tr></thead>
          <tbody>
            {list.items.map(r => (
              <tr key={r.id}>
                <td><code dir="ltr">{r.id}</code></td>
                <td>{r.modelCode}</td>
                <td>{r.type}</td>
                <td>{r.batch}</td>
                <td>{r.supplier}</td>
                <td><Badge value={r.qc} /></td>
                <td>{fa(r.status)} <button type="button" className={styles.ghost} onClick={() => { setEdit(r); setNote(""); setMsg(""); }}>مدیریت {r.id}</button></td>
                <td>{r.installs.toLocaleString("fa-IR")}</td>
                <td>{new Date(r.receivedAt).toLocaleDateString("fa-IR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.loading && !list.items.length && <p className={styles.empty}>رولی با این فیلترها یافت نشد.</p>}
        <Pager page={list.page} pageSize={list.pageSize} total={list.total} loading={list.loading} onPage={list.setPage} />
      </div>
      {edit && <div className={styles.dialog} role="dialog" aria-modal="true" aria-label="مدیریت موجودی"><form className={`${styles.dialogInner} ${styles.adminForm}`} onSubmit={updateRoll}>
        <h2 dir="ltr">{edit.id}</h2><button type="button" className={styles.dialogClose} aria-label="بستن موجودی" onClick={() => setEdit(null)}>×</button>
        <label>کنترل کیفیت<select value={edit.qc} onChange={e => setEdit({ ...edit, qc: e.target.value })}>{["pending", "approved", "rejected"].map(v => <option key={v} value={v}>{fa(v)}</option>)}</select></label>
        <label>وضعیت انبار<select value={edit.status} onChange={e => setEdit({ ...edit, status: e.target.value })}>{["instock", "shipped", "consumed", "void"].map(v => <option key={v} value={v}>{fa(v)}</option>)}</select></label>
        <label>یادداشت تغییر<textarea maxLength={1000} value={note} onChange={e => setNote(e.target.value)} /></label>
        <button className={styles.btnPrimary} disabled={saving}>ذخیره موجودی</button>{msg && <p role="alert">{msg}</p>}
        <h3>تاریخچه</h3><div className={styles.history}>{(JSON.parse(edit.historyJson || "[]") as { at: string; action: string; note: string }[]).map((h, i) => <p key={i}>{h.at} · {h.action} · {h.note}</p>)}</div>
      </form></div>}
    </section>
  );
}

// ── Settings ──────────────────────────────────────────────────────────────────

function SettingsPanel() {
  const [vals, setVals] = useState({ tintFilm: null as number | null, tintInstall: null as number | null, ppfFilm: null as number | null, ppfInstall: null as number | null });
  const [codeLength, setCodeLength] = useState(16);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    adminGetSettings().then((d: unknown) => {
      const dd = d as { durations: { tint: { film: number | null; install: number | null }; ppf: { film: number | null; install: number | null } }; warrantyCodeLength: number };
      setVals({ tintFilm: dd.durations.tint.film, tintInstall: dd.durations.tint.install, ppfFilm: dd.durations.ppf.film, ppfInstall: dd.durations.ppf.install });
      setCodeLength(dd.warrantyCodeLength ?? 16);
      setLoaded(true);
    }).catch((ex: unknown) => setMsg(fa(errorText(ex, fa("Could not load coverage periods.")))));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setMsg("");
    try {
      await adminSaveSettings({ durations: { tint: { film: vals.tintFilm, install: vals.tintInstall }, ppf: { film: vals.ppfFilm, install: vals.ppfInstall } }, warrantyCodeLength: codeLength });
      setMsg(fa("Saved."));
    } catch (ex: unknown) {
      setMsg(fa(errorText(ex, fa("Error"))));
    } finally {
      setSaving(false);
    }
  }

  function sel(key: keyof typeof vals, v: string) {
    setVals(p => ({ ...p, [key]: v === "null" ? null : Number(v) }));
  }

  return (
    <section>
      <header className={styles.panelHead}><div><span className={styles.eyebrow}>تنظیمات</span><h1>{fa("Coverage periods")}</h1></div></header>
      <div className={styles.card} style={{ maxWidth: 540 }}>
        <form onSubmit={onSubmit} className={styles.adminForm}>
          {[
            { label: "Tint – film warranty", key: "tintFilm" as const },
            { label: "Tint – installation warranty", key: "tintInstall" as const },
            { label: "PPF – film warranty", key: "ppfFilm" as const },
            { label: "PPF – installation warranty", key: "ppfInstall" as const },
          ].map(x => (
            <label key={x.key}>{fa(x.label)}
              <select value={String(vals[x.key])} onChange={e => sel(x.key, e.target.value)}>
                <option value="null">{fa("Not set")}</option>
                {(x.key.endsWith("Film") ? [3, 5, 7, 10] : [1, 2, 3]).map(n => <option key={n} value={n}>{n.toLocaleString("fa-IR")} سال</option>)}
              </select>
            </label>
          ))}
          <label>{fa("Warranty code length (characters)")}
            <input type="number" min={6} max={29} required value={codeLength}
              onChange={e => setCodeLength(Number(e.target.value))} dir="ltr" />
          </label>
          <p className={styles.empty}>{fa("Characters after the SZ- prefix. Existing warranties keep their code.")}</p>
          <button type="submit" className={styles.btnPrimary} disabled={saving || !loaded}>
            {saving ? fa("Saving…") : fa("Save periods ↗")}
          </button>
          {msg && <p>{msg}</p>}
        </form>
      </div>
      <p className={styles.empty}>اتصال پیامک و قواعد تأیید به بخش پیامک منتقل شده است.</p>
    </section>
  );
}
