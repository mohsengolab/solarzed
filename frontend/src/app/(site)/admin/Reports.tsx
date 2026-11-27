"use client";

import { useCallback, useEffect, useState } from "react";
import { adminWarranties, adminRollsSearch, managementFetch, qs, fa, FA_DATE, type Paged } from "@/lib/api";
import s from "./admin.module.css";
import { usePaged, SortTh, Pager, FilterBar, countActive, downloadExcel, errorText } from "./AdminKit";

// ── Date range: daily / weekly / monthly presets or dates picked by hand ─────

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

type Preset = "day" | "week" | "month" | "thisMonth" | "lastMonth" | "year" | "all" | "custom";
const PRESETS: [Preset, string][] = [
  ["day", "روزانه (امروز)"], ["week", "هفتگی (۷ روز اخیر)"], ["month", "ماهانه (۳۰ روز اخیر)"],
  ["thisMonth", "این ماه"], ["lastMonth", "ماه گذشته"], ["year", "یک سال اخیر"], ["all", "همه زمان‌ها"], ["custom", "انتخاب دستی"],
];

function rangeOf(p: Preset): { from: string; to: string } {
  const today = new Date();
  switch (p) {
    case "day": return { from: iso(today), to: iso(today) };
    case "week": return { from: iso(addDays(today, -6)), to: iso(today) };
    case "month": return { from: iso(addDays(today, -29)), to: iso(today) };
    case "thisMonth": return { from: iso(new Date(today.getFullYear(), today.getMonth(), 1)), to: iso(today) };
    case "lastMonth": return { from: iso(new Date(today.getFullYear(), today.getMonth() - 1, 1)), to: iso(new Date(today.getFullYear(), today.getMonth(), 0)) };
    case "year": return { from: iso(addDays(today, -364)), to: iso(today) };
    default: return { from: "", to: "" };
  }
}

const shownDate = (v: string) => v ? new Date(`${v}T00:00:00`).toLocaleDateString(FA_DATE) : "";

function DateRange({ preset, from, to, onChange, label }: {
  preset: Preset; from: string; to: string; label: string; onChange: (v: { preset: Preset; from: string; to: string }) => void;
}) {
  return <div className={s.card}>
    <h2>بازه زمانی ({label})</h2>
    <div className={s.filters}>
      {PRESETS.map(([key, text]) => <button key={key} type="button" className={preset === key ? s.btnPrimary : s.ghost}
        aria-pressed={preset === key} onClick={() => onChange({ preset: key, ...(key === "custom" ? { from, to } : rangeOf(key)) })}>{text}</button>)}
    </div>
    <div className={s.filterGrid} style={{ marginTop: 12 }}>
      <label>از تاریخ<input type="date" value={from} max={to || undefined} onChange={e => onChange({ preset: "custom", from: e.target.value, to })} /></label>
      <label>تا تاریخ<input type="date" value={to} min={from || undefined} onChange={e => onChange({ preset: "custom", from, to: e.target.value })} /></label>
    </div>
    <p className={s.empty}>{from || to ? `از ${shownDate(from) || "ابتدا"} تا ${shownDate(to) || "امروز"}` : "بدون محدودیت تاریخ"}</p>
  </div>;
}

/** Every page of a search (200 rows per request, at most 10,000 rows) for the Excel file. */
async function loadAll<T>(load: (q: string) => Promise<Paged<T>>, filters: Record<string, string>, sort: { sort: string; dir: string }) {
  const rows: T[] = [];
  for (let page = 1; page <= 50; page++) {
    const r = await load(qs({ ...filters, sort: sort.sort, dir: sort.dir, page, pageSize: 200 }));
    rows.push(...r.items);
    if (page * 200 >= r.total) break;
  }
  return rows;
}

/** Counts per status for the KPI row: one small request per status, with the same filters. */
function useCounts(load: (q: string) => Promise<Paged<unknown>>, filters: Record<string, string>, keys: string[], field: string) {
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const key = qs(filters);
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      Promise.all(["", ...keys].map(k => load(qs({ ...filters, [field]: k || filters[field], page: 1, pageSize: 1 })).then(r => [k, r.total] as const)))
        .then(r => { if (alive) setCounts(Object.fromEntries(r)); }).catch(() => { if (alive) setCounts(null); });
    }, 300);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return counts;
}

const n = (v: number | undefined) => (v ?? 0).toLocaleString("fa-IR");
const W_STATUS: Record<string, string> = { active: "فعال", pending: "در انتظار", rejected: "رد شده" };
const TYPE: Record<string, string> = { tint: "فیلم شیشه", ppf: "PPF" };

// ── Warranty report ──────────────────────────────────────────────────────────

type WRow = { code: string; owner: string; phone: string; make: string; model: string; vin: string; plate: string; type: string; installer: string;
  installed: string; status: string; filmEnds: string | null; createdAt: string; filmSerial: string; invoiceNumber: string; usedLengthM?: number | null;
  country?: string | null; flagsJson?: string } & Record<string, unknown>;

const W_FILTERS = { q: "", status: "", type: "", installer: "", make: "", expiringDays: "" };

export function ReportWarranties() {
  const [f, setF] = useState(W_FILTERS);
  const [range, setRange] = useState<{ preset: Preset; from: string; to: string }>({ preset: "month", ...rangeOf("month") });
  const [by, setBy] = useState<"created" | "installed">("created");
  const [msg, setMsg] = useState("");
  const [exporting, setExporting] = useState(false);
  const set = (k: keyof typeof W_FILTERS) => (e: { target: { value: string } }) => setF(p => ({ ...p, [k]: e.target.value }));

  const filters = { ...f, ...(by === "created" ? { createdFrom: range.from, createdTo: range.to } : { installedFrom: range.from, installedTo: range.to }) };
  const load = useCallback((q: string) => adminWarranties<WRow>(q), []);
  const list = usePaged<WRow>(load, filters, { pageSize: 25, sort: by === "created" ? "createdAt" : "installed", dir: "desc" });
  const counts = useCounts(load as (q: string) => Promise<Paged<unknown>>, filters, f.status ? [] : ["active", "pending", "rejected"], "status");
  const types = useCounts(load as (q: string) => Promise<Paged<unknown>>, filters, f.type ? [] : ["tint", "ppf"], "type");
  const sortProps = { sort: list.sort, onSort: list.toggleSort };

  async function exportExcel() {
    setExporting(true); setMsg("");
    try {
      const rows = await loadAll(load, filters, list.sort);
      downloadExcel("warranty-report", rows.map(w => ({ ...w, status: W_STATUS[w.status] ?? w.status, type: TYPE[w.type] ?? w.type,
        createdAt: w.createdAt ? new Date(w.createdAt).toLocaleDateString(FA_DATE) : "" })), [
        ["code", "کد گارانتی"], ["status", "وضعیت"], ["type", "نوع محصول"], ["owner", "مالک"], ["phone", "موبایل"],
        ["make", "برند خودرو"], ["model", "مدل خودرو"], ["vin", "VIN"], ["plate", "پلاک"], ["filmSerial", "Serial Number"],
        ["usedLengthM", "مصرف (متر)"], ["invoiceNumber", "شماره فاکتور"], ["installer", "نصاب / فروشنده"], ["country", "کشور"],
        ["installed", "تاریخ نصب"], ["filmEnds", "پایان گارانتی فیلم"], ["createdAt", "تاریخ ثبت"],
      ]);
      setMsg(`${n(rows.length)} ردیف در فایل اکسل ذخیره شد.`);
    } catch (e) { setMsg(errorText(e, "خروجی ناموفق بود.")); }
    finally { setExporting(false); }
  }

  return <>
    <DateRange {...range} onChange={setRange} label={by === "created" ? "تاریخ ثبت" : "تاریخ نصب"} />
    <FilterBar active={countActive(f)} onClear={() => setF(W_FILTERS)}>
      <label className={s.wide}>جستجو<input type="search" placeholder="کد، مالک، موبایل، VIN، پلاک، Serial Number، فاکتور" value={f.q} onChange={set("q")} /></label>
      <label>تاریخ بر اساس<select value={by} onChange={e => setBy(e.target.value as typeof by)}><option value="created">تاریخ ثبت</option><option value="installed">تاریخ نصب</option></select></label>
      <label>وضعیت<select value={f.status} onChange={set("status")}><option value="">همه وضعیت‌ها</option><option value="active">فعال</option><option value="pending">در انتظار</option><option value="rejected">رد شده</option></select></label>
      <label>نوع محصول<select value={f.type} onChange={set("type")}><option value="">همه انواع</option><option value="tint">فیلم شیشه</option><option value="ppf">PPF</option></select></label>
      <label>نصاب / فروشنده<input value={f.installer} onChange={set("installer")} placeholder="نام نصاب یا فروشنده" /></label>
      <label>برند / مدل خودرو<input value={f.make} onChange={set("make")} placeholder="مثلاً تویوتا" /></label>
      <label>انقضای گارانتی فیلم<select value={f.expiringDays} onChange={set("expiringDays")}><option value="">هر زمان</option><option value="30">تا ۳۰ روز</option><option value="90">تا ۹۰ روز</option><option value="365">تا ۱ سال</option></select></label>
    </FilterBar>

    <div className={s.kpiGrid}>
      <div className={s.kpiCard} data-accent="teal"><span className={s.kpiLabel}>کل گارانتی‌ها در بازه</span><span className={s.kpiValue}>{n(list.total)}</span></div>
      {!f.status && <>
        <div className={s.kpiCard} data-accent="green"><span className={s.kpiLabel}>فعال</span><span className={s.kpiValue}>{n(counts?.active)}</span></div>
        <div className={s.kpiCard} data-accent="yellow"><span className={s.kpiLabel}>در انتظار</span><span className={s.kpiValue}>{n(counts?.pending)}</span></div>
        <div className={s.kpiCard} data-accent="red"><span className={s.kpiLabel}>رد شده</span><span className={s.kpiValue}>{n(counts?.rejected)}</span></div>
      </>}
      {!f.type && <>
        <div className={s.kpiCard}><span className={s.kpiLabel}>فیلم شیشه</span><span className={s.kpiValue}>{n(types?.tint)}</span></div>
        <div className={s.kpiCard}><span className={s.kpiLabel}>PPF</span><span className={s.kpiValue}>{n(types?.ppf)}</span></div>
      </>}
    </div>

    <div className={s.card}>
      <div className={s.filters}>
        <h2 style={{ margin: 0, marginInlineEnd: "auto" }}>گزارش گارانتی‌ها</h2>
        <button type="button" className={s.btnPrimary} onClick={exportExcel} disabled={exporting || !list.total}>{exporting ? "در حال آماده‌سازی…" : "خروجی اکسل ↓"}</button>
      </div>
      {msg && <p role="status" className={s.okText}>{msg}</p>}
      {list.error && <p role="alert" className={s.errorText}>{list.error}</p>}
      <div className={list.loading ? s.tableBusy : ""} style={{ overflowX: "auto" }}>
        <table className={s.table}><thead><tr>
          <SortTh column="code" label="کد" {...sortProps} /><SortTh column="status" label="وضعیت" {...sortProps} /><SortTh column="type" label="نوع" {...sortProps} />
          <SortTh column="owner" label="مالک" {...sortProps} /><th>موبایل</th><SortTh column="make" label="خودرو" {...sortProps} /><th>پلاک</th>
          <th>Serial Number</th><SortTh column="installer" label="نصاب" {...sortProps} /><SortTh column="installed" label="نصب" {...sortProps} />
          <SortTh column="filmEnds" label="پایان فیلم" {...sortProps} /><SortTh column="createdAt" label="ثبت" {...sortProps} />
        </tr></thead><tbody>
          {list.items.map(w => <tr key={w.code}>
            <td><code dir="ltr">{w.code}</code></td>
            <td><span className={s.badge} data-tone={w.status}>{W_STATUS[w.status] ?? w.status}</span></td>
            <td>{TYPE[w.type] ?? w.type}</td><td>{w.owner}</td><td dir="ltr">{w.phone}</td><td>{w.make} {w.model}</td><td dir="ltr">{w.plate}</td>
            <td><code dir="ltr">{w.filmSerial}</code></td><td>{w.installer}</td><td>{w.installed}</td><td>{w.filmEnds ?? "—"}</td>
            <td>{w.createdAt ? new Date(w.createdAt).toLocaleDateString(FA_DATE) : "—"}</td>
          </tr>)}
        </tbody></table>
        {!list.loading && list.items.length === 0 && <p className={s.empty}>در این بازه و با این فیلترها گارانتی‌ای ثبت نشده است.</p>}
      </div>
      <Pager page={list.page} pageSize={list.pageSize} total={list.total} loading={list.loading} onPage={list.setPage} />
    </div>
  </>;
}

// ── Roll report ──────────────────────────────────────────────────────────────

type RollRow = { id: string; number: number; rollNo?: string | null; modelCode: string; type: string; batch: string; supplier: string; qc: string; status: string;
  installs: number; receivedAt: string; widthCm?: number | null; lengthM?: number | null; remainingM?: number | null; usedM?: number;
  location?: { kind: string; name: string; phone?: string | null } | null } & Record<string, unknown>;

const R_FILTERS = { q: "", model: "", type: "", qc: "", status: "", supplier: "" };
const R_STATUS: Record<string, string> = { instock: "موجود", shipped: "ارسال شده", consumed: "مصرف شده", void: "باطل" };
const QC: Record<string, string> = { pending: "در انتظار", approved: "تأیید شده", rejected: "رد شده" };

export function ReportRolls() {
  const [f, setF] = useState(R_FILTERS);
  const [range, setRange] = useState<{ preset: Preset; from: string; to: string }>({ preset: "month", ...rangeOf("month") });
  const [products, setProducts] = useState<{ code: string; name: string }[]>([]);
  const [msg, setMsg] = useState("");
  const [exporting, setExporting] = useState(false);
  const set = (k: keyof typeof R_FILTERS) => (e: { target: { value: string } }) => setF(p => ({ ...p, [k]: e.target.value }));

  useEffect(() => { managementFetch<{ items: { code: string; name: string }[] }>("products?pageSize=200").then(r => setProducts(r.items)).catch(() => {}); }, []);

  const filters = { ...f, receivedFrom: range.from, receivedTo: range.to };
  const load = useCallback((q: string) => adminRollsSearch<RollRow>(q), []);
  const list = usePaged<RollRow>(load, filters, { pageSize: 25, sort: "receivedAt", dir: "desc" });
  const counts = useCounts(load as (q: string) => Promise<Paged<unknown>>, filters, f.status ? [] : ["instock", "shipped", "consumed", "void"], "status");
  const sortProps = { sort: list.sort, onSort: list.toggleSort };
  const where = (r: RollRow) => r.location ? `${r.location.name}${r.location.phone ? ` (${r.location.phone})` : ""}` : "";

  async function exportExcel() {
    setExporting(true); setMsg("");
    try {
      const rows = await loadAll(load, filters, list.sort);
      downloadExcel("roll-report", rows.map(r => ({ ...r, type: TYPE[r.type] ?? r.type, status: R_STATUS[r.status] ?? r.status, qc: QC[r.qc] ?? r.qc,
        where: where(r), receivedAt: r.receivedAt ? new Date(r.receivedAt).toLocaleDateString(FA_DATE) : "" })), [
        ["number", "#"], ["id", "Serial Number"], ["rollNo", "ROLL NO"], ["modelCode", "محصول"], ["type", "نوع"], ["batch", "Batch"],
        ["supplier", "تأمین‌کننده"], ["qc", "کنترل کیفیت"], ["status", "وضعیت انبار"], ["where", "محل / دارنده"],
        ["widthCm", "عرض (سانتی‌متر)"], ["lengthM", "طول (متر)"], ["usedM", "مصرف‌شده (متر)"], ["remainingM", "باقی‌مانده (متر)"],
        ["installs", "تعداد نصب"], ["receivedAt", "تاریخ دریافت"],
      ]);
      setMsg(`${n(rows.length)} ردیف در فایل اکسل ذخیره شد.`);
    } catch (e) { setMsg(errorText(e, "خروجی ناموفق بود.")); }
    finally { setExporting(false); }
  }

  return <>
    <DateRange {...range} onChange={setRange} label="تاریخ دریافت" />
    <FilterBar active={countActive(f)} onClear={() => setF(R_FILTERS)}>
      <label className={s.wide}>جستجو<input type="search" placeholder="Serial Number، ROLL NO، Batch" value={f.q} onChange={set("q")} /></label>
      <label>محصول<select value={f.model} onChange={set("model")}><option value="">همه محصولات</option>{products.map(p => <option key={p.code} value={p.code}>{p.code}{p.name ? ` · ${p.name}` : ""}</option>)}</select></label>
      <label>نوع<select value={f.type} onChange={set("type")}><option value="">همه انواع</option><option value="tint">فیلم شیشه</option><option value="ppf">PPF</option></select></label>
      <label>کنترل کیفیت<select value={f.qc} onChange={set("qc")}><option value="">همه</option><option value="pending">در انتظار</option><option value="approved">تأیید شده</option><option value="rejected">رد شده</option></select></label>
      <label>وضعیت انبار<select value={f.status} onChange={set("status")}><option value="">همه</option><option value="instock">موجود</option><option value="shipped">ارسال شده</option><option value="consumed">مصرف شده</option><option value="void">باطل</option></select></label>
      <label>تأمین‌کننده<input value={f.supplier} onChange={set("supplier")} placeholder="کد یا نام تأمین‌کننده" /></label>
    </FilterBar>

    <div className={s.kpiGrid}>
      <div className={s.kpiCard} data-accent="teal"><span className={s.kpiLabel}>کل رول‌ها در بازه</span><span className={s.kpiValue}>{n(list.total)}</span></div>
      {!f.status && <>
        <div className={s.kpiCard} data-accent="green"><span className={s.kpiLabel}>موجود</span><span className={s.kpiValue}>{n(counts?.instock)}</span></div>
        <div className={s.kpiCard} data-accent="yellow"><span className={s.kpiLabel}>ارسال شده</span><span className={s.kpiValue}>{n(counts?.shipped)}</span></div>
        <div className={s.kpiCard}><span className={s.kpiLabel}>مصرف شده</span><span className={s.kpiValue}>{n(counts?.consumed)}</span></div>
        <div className={s.kpiCard} data-accent="red"><span className={s.kpiLabel}>باطل</span><span className={s.kpiValue}>{n(counts?.void)}</span></div>
      </>}
    </div>

    <div className={s.card}>
      <div className={s.filters}>
        <h2 style={{ margin: 0, marginInlineEnd: "auto" }}>گزارش رول‌ها</h2>
        <button type="button" className={s.btnPrimary} onClick={exportExcel} disabled={exporting || !list.total}>{exporting ? "در حال آماده‌سازی…" : "خروجی اکسل ↓"}</button>
      </div>
      {msg && <p role="status" className={s.okText}>{msg}</p>}
      {list.error && <p role="alert" className={s.errorText}>{list.error}</p>}
      <div className={list.loading ? s.tableBusy : ""} style={{ overflowX: "auto" }}>
        <table className={s.table}><thead><tr>
          <SortTh column="number" label="#" {...sortProps} /><SortTh column="id" label="Serial Number" {...sortProps} /><SortTh column="rollNo" label="ROLL NO" {...sortProps} />
          <SortTh column="modelCode" label="محصول" {...sortProps} /><SortTh column="type" label="نوع" {...sortProps} /><SortTh column="batch" label="Batch" {...sortProps} />
          <SortTh column="qc" label="QC" {...sortProps} /><SortTh column="status" label="وضعیت" {...sortProps} /><th>محل / دارنده</th>
          <th>طول / باقی‌مانده (m)</th><th>نصب</th><SortTh column="receivedAt" label="دریافت" {...sortProps} />
        </tr></thead><tbody>
          {list.items.map(r => <tr key={r.id}>
            <td>{fa(String(r.number))}</td><td><code dir="ltr">{r.id}</code></td><td><code dir="ltr">{r.rollNo ?? "—"}</code></td>
            <td>{r.modelCode}</td><td>{TYPE[r.type] ?? r.type}</td><td dir="ltr">{r.batch || "—"}</td>
            <td><span className={s.badge} data-tone={r.qc}>{QC[r.qc] ?? r.qc}</span></td><td>{R_STATUS[r.status] ?? r.status}</td>
            <td>{where(r) || "—"}</td>
            <td dir="ltr">{r.lengthM != null ? `${r.lengthM} / ${r.remainingM ?? "—"}` : "—"}</td>
            <td>{fa(String(r.installs))}</td><td>{r.receivedAt ? new Date(r.receivedAt).toLocaleDateString(FA_DATE) : "—"}</td>
          </tr>)}
        </tbody></table>
        {!list.loading && list.items.length === 0 && <p className={s.empty}>در این بازه و با این فیلترها رولی ثبت نشده است.</p>}
      </div>
      <Pager page={list.page} pageSize={list.pageSize} total={list.total} loading={list.loading} onPage={list.setPage} />
    </div>
  </>;
}
