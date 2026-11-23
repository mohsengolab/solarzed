"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  adminPartners, adminAddPartner, adminPartnerStatus, adminReviewList, adminReviewDecide, adminReviewPhoto,
  fa, FA_DATE, PHOTO_KINDS, type PartnerRow, type ReviewItem,
} from "@/lib/api";
import s from "./admin.module.css";
import own from "./partners.module.css";
import { errorText as message } from "./AdminKit";

const date = (v: string | null) => v ? new Date(v).toLocaleDateString(FA_DATE) : "—";
const STATUS_FA: Record<PartnerRow["status"], string> = { pending: "در انتظار تأیید", approved: "تأییدشده", suspended: "تعلیق" };
const KIND_FA = Object.fromEntries(PHOTO_KINDS.map(k => [k.kind, k.label])) as Record<string, string>;
const EMPTY = { phone: "", shopName: "", firstName: "", lastName: "", country: "ایران", city: "" };

// ── همکاران (نصاب‌ها) ─────────────────────────────────────────────────────────

export function PartnersPanel({ onReview }: { onReview: () => void }) {
  const [rows, setRows] = useState<PartnerRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (q.trim()) params.set("q", q.trim());
    const r = await adminPartners(params.size ? `?${params}` : "");
    setRows(r.partners); setCounts(r.counts);
  }, [status, q]);
  useEffect(() => {
    const t = setTimeout(() => { load().catch(e => setMsg(message(e))); }, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function add(e: FormEvent) {
    e.preventDefault(); setBusy(true); setMsg("");
    try { await adminAddPartner(form); setForm(EMPTY); setAdding(false); setMsg("همکار ثبت و تأیید شد. با همین موبایل وارد سایت می‌شود."); await load(); }
    catch (e) { setMsg(message(e)); } finally { setBusy(false); }
  }

  async function change(p: PartnerRow, next: "approved" | "suspended" | "none") {
    const ask = next === "approved" ? `همکار «${p.shopName ?? p.phone}» تأیید شود؟`
      : next === "suspended" ? `همکار «${p.shopName ?? p.phone}» تعلیق شود؟ دیگر نمی‌تواند گارانتی ثبت کند.`
      : `«${p.shopName ?? p.phone}» از لیست همکاران حذف شود؟ حساب کاربری و گارانتی‌های ثبت‌شده باقی می‌مانند.`;
    if (!window.confirm(ask)) return;
    setMsg("");
    try { await adminPartnerStatus(p.id, next); await load(); }
    catch (e) { setMsg(message(e)); }
  }

  const total = (counts.pending ?? 0) + (counts.approved ?? 0) + (counts.suspended ?? 0);
  return <section>
    <header className={s.panelHead}>
      <div><span className={s.eyebrow}>نصاب‌ها و فروشگاه‌ها</span><h1>همکاران</h1></div>
      <button type="button" className={s.btnPrimary} onClick={() => setAdding(v => !v)}>{adding ? "بستن" : "+ افزودن همکار"}</button>
    </header>
    <p className={s.empty}>همکاران با موبایل خود در سایت وارد می‌شوند، کارت گارانتی داخل کارتن را اسکن می‌کنند و مشخصات خودرو، موبایل مشتری و عکس‌های نصب را ثبت می‌کنند. گارانتی به نام مشتری ثبت می‌شود و پس از تأیید عکس‌ها توسط کانتر فعال می‌شود.</p>

    <div className={s.kpiGrid}>
      {([["", "همه", total, "teal"], ["pending", "در انتظار تأیید", counts.pending ?? 0, "yellow"], ["approved", "تأییدشده", counts.approved ?? 0, "green"], ["suspended", "تعلیق", counts.suspended ?? 0, "red"]] as const)
        .map(([key, label, value, accent]) => <button key={key} type="button" className={`${s.kpiCard} ${own.kpiButton}`} data-accent={accent} aria-pressed={status === key} onClick={() => setStatus(key)}>
          <span className={s.kpiLabel}>{label}</span><span className={s.kpiValue}>{fa(String(value))}</span>
        </button>)}
    </div>

    {adding && <form className={`${s.card} ${s.adminForm}`} onSubmit={add}>
      <h2>افزودن همکار</h2>
      <div className={s.row2}>
        <label>موبایل<input required dir="ltr" type="tel" inputMode="tel" maxLength={20} placeholder="09…" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></label>
        <label>نام فروشگاه / کارگاه<input required maxLength={200} value={form.shopName} onChange={e => setForm({ ...form, shopName: e.target.value })} /></label>
        <label>نام<input maxLength={100} value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} /></label>
        <label>نام خانوادگی<input maxLength={100} value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} /></label>
        <label>کشور<input maxLength={100} value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} /></label>
        <label>شهر<input maxLength={100} value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} /></label>
      </div>
      <div className={s.filters}><button className={s.btnPrimary} disabled={busy}>{busy ? "در حال ذخیره…" : "ثبت و تأیید همکار"}</button></div>
    </form>}

    <div className={s.filters}>
      <label className={s.wide}>جستجو<input type="search" placeholder="موبایل، نام فروشگاه، شهر یا کشور" value={q} onChange={e => setQ(e.target.value)} /></label>
    </div>
    {msg && <p role="status">{msg}</p>}
    <div className={s.card}><table className={s.table}><thead><tr>
      <th>فروشگاه</th><th>موبایل</th><th>شهر / کشور</th><th>وضعیت</th><th>گارانتی ثبت‌شده</th><th>منتظر کانتر</th><th>کارتن نزد همکار</th><th>آخرین نصب</th><th>عملیات</th>
    </tr></thead><tbody>
      {rows.map(p => <tr key={p.id}>
        <td><b>{p.shopName ?? "—"}</b>{(p.firstName || p.lastName) && <small className={own.sub}>{[p.firstName, p.lastName].filter(Boolean).join(" ")}</small>}</td>
        <td dir="ltr">{p.phone}</td>
        <td>{[p.city, p.country].filter(Boolean).join("، ") || "—"}</td>
        <td><span className={s.badge} data-tone={p.status === "suspended" ? "rejected" : p.status}>{STATUS_FA[p.status]}</span>{p.status === "pending" && p.appliedAt && <small className={own.sub}>درخواست: {date(p.appliedAt)}</small>}</td>
        <td>{fa(String(p.warranties))}{p.rejected > 0 && <small className={own.sub}>{fa(String(p.rejected))} برگشتی</small>}</td>
        <td>{p.pendingReview > 0 ? <button type="button" className={s.ghost} onClick={onReview}>{fa(String(p.pendingReview))} مورد</button> : "—"}</td>
        <td>{fa(String(p.cartons))}</td>
        <td>{date(p.lastInstall)}</td>
        <td className={own.actions}>
          {p.status !== "approved" && <button type="button" className={s.ghost} onClick={() => change(p, "approved")}>تأیید</button>}
          {p.status !== "suspended" && <button type="button" className={s.danger} onClick={() => change(p, "suspended")}>تعلیق</button>}
          {p.status !== "approved" && <button type="button" className={s.ghost} onClick={() => change(p, "none")}>حذف از همکاران</button>}
        </td>
      </tr>)}
    </tbody></table>
      {rows.length === 0 && <p className={s.empty}>{status || q ? "همکاری با این فیلتر یافت نشد." : "هنوز همکاری ثبت نشده است. همکاران از صفحه «حساب من» در سایت درخواست می‌دهند یا اینجا اضافه می‌شوند."}</p>}
    </div>
  </section>;
}

// ── کانتر: بررسی عکس‌های نصب ──────────────────────────────────────────────────

function Photo({ id, alt, onOpen }: { id: number; alt: string; onOpen: (url: string) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let current: string | null = null; let alive = true;
    adminReviewPhoto(id).then(u => { current = u; if (alive) setUrl(u); else URL.revokeObjectURL(u); }).catch(() => alive && setFailed(true));
    return () => { alive = false; if (current) URL.revokeObjectURL(current); };
  }, [id]);
  return <button type="button" className={own.thumb} disabled={!url} onClick={() => url && onOpen(url)}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {url ? <img src={url} alt={alt} /> : <span>{failed ? "خطا" : "…"}</span>}
    <small>{alt}</small>
  </button>;
}

export function ReviewPanel() {
  const [tab, setTab] = useState<"pending" | "active" | "rejected">("pending");
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [pending, setPending] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [zoom, setZoom] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await adminReviewList(tab); setItems(r.items); setPending(r.pending); }
    catch (e) { setMsg(message(e)); } finally { setLoading(false); }
  }, [tab]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function decide(item: ReviewItem, approve: boolean) {
    const note = (notes[item.ref] ?? "").trim();
    if (!approve && !note) { setMsg("برای برگرداندن، دلیل را بنویسید تا نصاب بداند چه چیزی را اصلاح کند."); return; }
    setBusy(item.ref); setMsg("");
    try { await adminReviewDecide(item.ref, approve, note || undefined); setMsg(approve ? "گارانتی تأیید و فعال شد." : "برای نصاب برگردانده شد."); await load(); }
    catch (e) { setMsg(message(e)); } finally { setBusy(null); }
  }

  return <section>
    <header className={s.panelHead}><div><span className={s.eyebrow}>کانتر</span><h1>بررسی عکس‌های نصب</h1></div></header>
    <p className={s.empty}>عکس‌ها را با مشخصات خودرو مقایسه کنید: پلاک در عکس خودرو، فیلم نصب‌شده و در صورت وجود شماره شاسی. پس از تأیید، گارانتی برای موبایل مشتری فعال می‌شود. اگر عکس‌ها کافی نیست، با نوشتن دلیل برگردانید تا نصاب عکس جدید بفرستد.</p>
    <div className={s.reportTabs}>
      {([["pending", `در انتظار (${fa(String(pending))})`], ["active", "تأییدشده"], ["rejected", "برگشتی"]] as const).map(([t, l]) =>
        <button key={t} type="button" onClick={() => setTab(t)} className={tab === t ? s.reportTabActive : s.reportTab}>{l}</button>)}
    </div>
    {msg && <p role="status">{msg}</p>}
    {loading ? <p className={s.empty}>در حال بارگذاری…</p> : items.length === 0
      ? <p className={s.empty}>{tab === "pending" ? "موردی برای بررسی نیست." : "موردی نیست."}</p>
      : <div className={own.list}>{items.map(item => <article key={item.ref} className={`${s.card} ${own.item}`}>
        <div className={own.itemHead}>
          <div>
            <h2>{item.make} {item.model} <span dir="ltr" className={own.plate}>{item.plate}</span></h2>
            <small className={own.sub}>نصاب: <b>{item.installer}</b> (<span dir="ltr">{item.installerPhone}</span>) · {date(item.createdAt)}</small>
          </div>
          <span className={s.badge} data-tone={item.status}>{item.status === "pending" ? "در انتظار" : item.status === "active" ? "فعال" : "برگشتی"}</span>
        </div>
        <dl className={own.facts}>
          <dt>VIN</dt><dd dir="ltr">{item.vin}</dd>
          <dt>مشتری</dt><dd>{item.owner} · <span dir="ltr">{item.ownerPhone}</span></dd>
          <dt>محصول / کارتن</dt><dd>{item.product ?? "—"} · <code dir="ltr">{item.carton}</code></dd>
          <dt>تاریخ نصب</dt><dd>{date(item.installed)}</dd>
          <dt>کشور</dt><dd>{item.country ?? "—"}</dd>
          <dt>متراژ مصرفی</dt><dd>{item.usedLengthM != null ? `${fa(String(item.usedLengthM))} متر` : "—"}</dd>
          <dt>{item.type === "tint" ? "شیشه‌ها" : "قطعات"}</dt><dd>{item.areas.join("، ")}</dd>
          <dt>کد گارانتی</dt><dd dir="ltr">{item.code}</dd>
        </dl>
        {item.flags.includes("vin_repeat") && <p className={s.errorText}>این VIN قبلاً گارانتی هم‌نوع داشته است.</p>}
        <div className={own.photos}>{item.photos.map(p => <Photo key={p.id} id={p.id} alt={KIND_FA[p.kind] ?? p.kind} onOpen={setZoom} />)}
          {item.photos.length === 0 && <p className={s.empty}>عکسی ارسال نشده است.</p>}</div>
        {item.status === "pending" ? <div className={own.decide}>
          <label>یادداشت برای نصاب (برای برگرداندن الزامی)<input maxLength={500} value={notes[item.ref] ?? ""} onChange={e => setNotes(n => ({ ...n, [item.ref]: e.target.value }))} placeholder="مثلاً پلاک در عکس خودرو خوانا نیست" /></label>
          <div className={s.filters}>
            <button type="button" className={s.btnPrimary} disabled={busy === item.ref || item.photos.length === 0} onClick={() => decide(item, true)}>تأیید و فعال‌سازی گارانتی</button>
            <button type="button" className={s.danger} disabled={busy === item.ref} onClick={() => decide(item, false)}>برگرداندن به نصاب</button>
          </div>
        </div> : item.reviewNote && <p className={own.sub}>یادداشت: {item.reviewNote}{item.reviewedAt && ` · ${date(item.reviewedAt)}`}</p>}
      </article>)}</div>}
    {zoom && <div className={own.lightbox} role="dialog" aria-label="نمایش عکس" onClick={() => setZoom(null)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={zoom} alt="" />
      <button type="button" aria-label="بستن">×</button>
    </div>}
  </section>;
}
