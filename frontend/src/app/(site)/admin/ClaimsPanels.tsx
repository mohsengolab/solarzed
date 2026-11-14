"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { managementFetch, type Paged } from "@/lib/api";
import s from "./admin.module.css";
import { usePaged, SortTh, Pager, FilterBar, countActive, errorText } from "./AdminKit";

// ── Labels (policy §4–§6) ─────────────────────────────────────────────────────

export const STAGES: Record<string, string> = {
  received: "۱ · دریافت درخواست", initialReview: "۲ · بررسی اولیه", technicalAssessment: "۳ · تشخیص فنی",
  decided: "۴ · تصمیم و راهکار", closed: "۵ · اجرا و بستن پرونده",
};
const CAUSES: Record<string, string> = {
  undetermined: "هنوز مشخص نشده", film: "خود فیلم", installation: "اجرای نصب", vehicle: "شیشه / قطعات خودرو", external: "عامل خارجی (ضربه، مواد شیمیایی…)",
};
const DECISIONS: Record<string, string> = { none: "بدون تصمیم", needsMoreReview: "نیازمند بررسی بیشتر", accepted: "پذیرفته", rejected: "رد با دلیل مستند" };
const REMEDIES: Record<string, string> = {
  none: "—", fixInstallation: "اصلاح نصب / رفع نقص", replaceFilm: "تعویض بخش معیوب یا نصب مجدد فیلم",
  replaceProduct: "تعویض محصول هم‌سطح", refund: "بازپرداخت / راهکار قانونی دیگر", other: "سایر (در یادداشت)",
};
const CHANNELS: Record<string, string> = { phone: "تلفن", installer: "مرکز نصب", website: "سایت / لینک گارانتی", email: "ایمیل", inPerson: "حضوری" };
const LATE: Record<string, string> = { acknowledge: "تأیید دریافت", initialReview: "بررسی اولیه", decision: "تصمیم فنی" };

const ENTITY: Record<string, string> = { warranty: "گارانتی", claim: "ادعا", roll: "رول", product: "محصول", settings: "تنظیمات", user: "کاربر" };
const ACTIONS: Record<string, string> = {
  created: "ایجاد", updated: "ویرایش", stageChanged: "تغییر مرحله", reopened: "بازگشایی", decision: "تصمیم گارانتی",
  claimOpened: "ثبت ادعا", registered: "ثبت فرم عمومی", activated: "فعال‌سازی با QR", received: "دریافت در انبار",
  archived: "بایگانی", restored: "بازگردانی", passwordReset: "تغییر رمز",
};
const FIELDS: Record<string, string> = {
  stage: "مرحله", cause: "علت", decision: "تصمیم", decisionNote: "دلیل تصمیم", remedy: "راهکار", remedyNote: "شرح اجرا",
  requiredDocuments: "مدارک موردنیاز", laborCost: "هزینه نیروی کار", partsCost: "هزینه قطعه/فیلم", otherCost: "سایر هزینه‌ها",
  status: "وضعیت", reviewNote: "یادداشت بررسی", filmEnds: "پایان گارانتی فیلم", installEnds: "پایان گارانتی نصب",
  claim: "ادعا", warrantyCode: "کد گارانتی", channel: "کانال", description: "شرح", qc: "QC", batch: "بچ", supplier: "تأمین‌کننده",
  modelCode: "مدل", name: "نام", archived: "بایگانی", role: "نقش", active: "فعال", displayName: "نام نمایشی",
};

const camel = (v: string) => v ? v[0].toLowerCase() + v.slice(1) : v;
const valueLabel = (v: unknown) => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "بله" : "خیر";
  const key = camel(String(v));
  return STAGES[key] ?? DECISIONS[key] ?? CAUSES[key] ?? REMEDIES[key] ?? CHANNELS[key] ?? String(v);
};
const when = (v?: string | null) => v ? new Date(v).toLocaleString("fa-IR", { dateStyle: "short", timeStyle: "short" }) : "—";
const money = (v?: number | null) => v == null ? "—" : Number(v).toLocaleString("fa-IR");

// ── Types ─────────────────────────────────────────────────────────────────────

type Due = { acknowledgeBy: string; initialReviewBy: string; decisionBy: string | null; overdue: boolean; overdueStage: string | null };
export type Claim = {
  id: string; warrantyCode: string; channel: string; description: string; requiredDocuments: string | null;
  stage: string; cause: string; decision: string; decisionNote: string | null; remedy: string; remedyNote: string | null;
  laborCost: number | null; partsCost: number | null; otherCost: number | null; totalCost: number;
  createdAt: string; createdBy: string; acknowledgedAt: string | null; initialReviewedAt: string | null; documentsCompleteAt: string | null;
  decidedAt: string | null; closedAt: string | null; updatedAt: string; revision: number; due: Due;
};
type ClaimRow = { claim: Claim; vehicle: { owner: string; make: string; model: string; plate: string; type: string } | null };
export type AuditRow = { id: number; entityType: string; entityId: string; action: string; actor: string; at: string; reason: string | null; changes: Record<string, [unknown, unknown]> };
type ClaimDetail = {
  claim: Claim;
  warranty: Record<string, string | null>;
  roll: { id: string; modelCode: string; batch: string; supplier: string } | null;
  history: AuditRow[];
};

// ── Shared pieces ─────────────────────────────────────────────────────────────

function DueBadge({ c }: { c: Claim }) {
  if (c.stage === "closed") return <span className={s.badge} data-tone="active">بسته</span>;
  if (c.due.overdue) return <span className={s.badge} data-tone="rejected">تأخیر: {LATE[c.due.overdueStage ?? ""] ?? ""}</span>;
  const next = c.stage === "received" ? c.due.acknowledgeBy : c.stage === "initialReview" ? c.due.initialReviewBy : c.stage === "technicalAssessment" ? c.due.decisionBy : null;
  return next ? <span className={s.badge} data-tone="pending">مهلت {when(next)}</span> : <span className={s.badge} data-tone="muted">—</span>;
}

export function AuditList({ rows }: { rows: AuditRow[] }) {
  if (!rows.length) return <p className={s.empty}>سابقه‌ای ثبت نشده است.</p>;
  return <div className={s.history}>{rows.map(a => (
    <p key={a.id}>
      <b>{when(a.at)}</b> · {ACTIONS[a.action] ?? a.action} · <span dir="ltr">{a.actor}</span>
      {Object.entries(a.changes).map(([k, [o, n]]) => <span key={k}><br />{FIELDS[k] ?? k}: {valueLabel(o)} ← {valueLabel(n)}</span>)}
      {a.reason && <><br /><i>دلیل: {a.reason}</i></>}
    </p>
  ))}</div>;
}

export function NewClaimForm({ warrantyCode, onCreated }: { warrantyCode?: string; onCreated: (c: Claim) => void }) {
  const blank = { warrantyCode: warrantyCode ?? "", channel: "phone", description: "", requiredDocuments: "" };
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setMsg("");
    try {
      const c = await managementFetch<Claim>("claims", form);
      setForm(blank); setMsg(`ادعا با شماره پیگیری ${c.id} ثبت شد.`); onCreated(c);
    } catch (ex) { setMsg(errorText(ex)); } finally { setBusy(false); }
  }
  return <form className={`${s.card} ${s.adminForm}`} onSubmit={submit}>
    <h2>ثبت ادعای گارانتی</h2>
    <div className={s.row2}>
      {!warrantyCode && <label>کد گارانتی<input required maxLength={32} dir="ltr" placeholder="SZ-…" value={form.warrantyCode} onChange={e => setForm({ ...form, warrantyCode: e.target.value.toUpperCase() })} /></label>}
      <label>کانال دریافت<select value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value })}>{Object.entries(CHANNELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
    </div>
    <label>شرح مشکل (حداقل ۱۰ نویسه)<textarea required minLength={10} maxLength={2000} rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
    <label>مدارک موردنیاز از مشتری (اختیاری)<input maxLength={1000} placeholder="مثلاً تصویر نزدیک از حباب، تصویر فاکتور" value={form.requiredDocuments} onChange={e => setForm({ ...form, requiredDocuments: e.target.value })} /></label>
    <div className={s.filters}><button className={s.btnPrimary} disabled={busy}>{busy ? "در حال ثبت…" : "ثبت و صدور شماره پیگیری"}</button></div>
    {msg && <p role="status">{msg}</p>}
  </form>;
}

/** Claims and change log for one warranty, shown inside the warranty dialog. */
export function WarrantyActivity({ code }: { code: string }) {
  const [data, setData] = useState<{ claims: Claim[]; history: AuditRow[] } | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => managementFetch<{ claims: Claim[]; history: AuditRow[] }>(`warranties/${encodeURIComponent(code)}/activity`)
    .then(d => { setData(d); setError(""); }).catch(e => setError(errorText(e))), [code]);
  useEffect(() => { load(); }, [load]);
  if (error) return <p role="alert" className={s.errorText}>{error}</p>;
  if (!data) return <p className={s.loading}>در حال بارگذاری…</p>;
  return <>
    <h3>ادعاهای این گارانتی</h3>
    {data.claims.length === 0 ? <p className={s.empty}>ادعایی ثبت نشده است.</p> :
      <table className={s.table}><thead><tr><th>شماره پیگیری</th><th>مرحله</th><th>تصمیم</th><th>مهلت</th></tr></thead><tbody>
        {data.claims.map(c => <tr key={c.id}><td><a href={`#claims`} onClick={() => sessionStorage.setItem("sz-open-claim", c.id)}><code dir="ltr">{c.id}</code></a></td>
          <td>{STAGES[c.stage]}</td><td>{DECISIONS[c.decision]}</td><td><DueBadge c={c} /></td></tr>)}
      </tbody></table>}
    <NewClaimForm warrantyCode={code} onCreated={load} />
    <h3>سابقه تغییرات گارانتی</h3>
    <AuditList rows={data.history} />
  </>;
}

// ── Claim dialog ──────────────────────────────────────────────────────────────

function ClaimDialog({ id, onClose, onSaved }: { id: string; onClose: () => void; onSaved: () => void }) {
  const [detail, setDetail] = useState<ClaimDetail | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => managementFetch<ClaimDetail>(`claims/${encodeURIComponent(id)}`).then(d => {
    setDetail(d);
    const c = d.claim;
    setForm({
      stage: c.stage, cause: c.cause, decision: c.decision, decisionNote: c.decisionNote ?? "", remedy: c.remedy, remedyNote: c.remedyNote ?? "",
      requiredDocuments: c.requiredDocuments ?? "", laborCost: c.laborCost?.toString() ?? "", partsCost: c.partsCost?.toString() ?? "",
      otherCost: c.otherCost?.toString() ?? "", reason: "",
    });
  }).catch(e => setMsg(errorText(e))), [id]);
  useEffect(() => { load(); }, [load]);

  const set = (k: string) => (e: { target: { value: string } }) => setForm(f => ({ ...f, [k]: e.target.value }));
  const num = (v: string) => v.trim() === "" ? null : Number(v);

  async function save(e: FormEvent) {
    e.preventDefault(); if (!detail) return;
    setBusy(true); setMsg("");
    try {
      await managementFetch(`claims/${encodeURIComponent(id)}`, {
        revision: detail.claim.revision, stage: form.stage, cause: form.cause, decision: form.decision,
        decisionNote: form.decisionNote, remedy: form.remedy, remedyNote: form.remedyNote, requiredDocuments: form.requiredDocuments,
        laborCost: num(form.laborCost), partsCost: num(form.partsCost), otherCost: num(form.otherCost), reason: form.reason,
      }, "PUT");
      setMsg("ذخیره شد."); onSaved(); await load();
    } catch (ex) { setMsg(errorText(ex)); } finally { setBusy(false); }
  }

  const c = detail?.claim;
  const w = detail?.warranty;
  const stageOrder = Object.keys(STAGES);
  const goingBack = c ? stageOrder.indexOf(form.stage) < stageOrder.indexOf(c.stage) : false;

  return <div className={s.dialog} role="dialog" aria-modal="true" aria-label="پرونده ادعا" onKeyDown={e => { if (e.key === "Escape") onClose(); }}>
    <div className={s.dialogInner}>
      <button type="button" onClick={onClose} className={s.dialogClose} aria-label="بستن">×</button>
      <h2>پرونده ادعا — <span dir="ltr">{id}</span></h2>
      {!detail ? <p className={s.loading}>{msg || "در حال بارگذاری…"}</p> : <>
        <dl>
          {[["کد گارانتی", w?.code], ["وضعیت گارانتی", w?.status], ["مالک", w?.owner], ["موبایل", w?.phone], ["خودرو", `${w?.make} ${w?.model}`],
            ["VIN", w?.vin], ["پلاک", w?.plate], ["نصاب", w?.installer], ["تاریخ نصب", w?.installed], ["پایان گارانتی فیلم", w?.filmEnds], ["پایان گارانتی نصب", w?.installEnds],
            ["رول / بچ", detail.roll ? `${detail.roll.id} · ${detail.roll.batch} · ${detail.roll.supplier}` : "—"],
            ["کانال", CHANNELS[c!.channel]], ["ثبت", `${when(c!.createdAt)} · ${c!.createdBy}`]].map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v || "—"}</dd></div>)}
        </dl>
        <p><b>شرح مشکل:</b> {c!.description}</p>
        <p>
          <DueBadge c={c!} />{" "}
          تأیید دریافت تا {when(c!.due.acknowledgeBy)} · بررسی اولیه تا {when(c!.due.initialReviewBy)}
          {c!.due.decisionBy && <> · تصمیم تا {when(c!.due.decisionBy)}</>}
        </p>
        <form className={s.adminForm} onSubmit={save}>
          <div className={s.row2}>
            <label>مرحله<select aria-label="مرحله" value={form.stage} onChange={set("stage")}>{Object.entries(STAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label>علت عیب<select aria-label="علت عیب" value={form.cause} onChange={set("cause")}>{Object.entries(CAUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label>تصمیم<select aria-label="تصمیم" value={form.decision} onChange={set("decision")}>{Object.entries(DECISIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label>راهکار<select aria-label="راهکار" value={form.remedy} onChange={set("remedy")} disabled={form.decision === "rejected"}>{Object.entries(REMEDIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          </div>
          <label>مدارک موردنیاز (اعلام‌شده به مشتری)<input maxLength={1000} value={form.requiredDocuments} onChange={set("requiredDocuments")} /></label>
          <label>دلیل تصمیم {form.decision === "rejected" && <span style={{ color: "#f87171" }}>(الزامی)</span>}<textarea maxLength={1000} rows={2} value={form.decisionNote} onChange={set("decisionNote")} /></label>
          <label>شرح اجرای راهکار<textarea maxLength={1000} rows={2} value={form.remedyNote} onChange={set("remedyNote")} /></label>
          <div className={s.row2}>
            <label>هزینه نیروی کار<input type="number" min={0} step="any" dir="ltr" value={form.laborCost} onChange={set("laborCost")} /></label>
            <label>هزینه قطعه / فیلم<input type="number" min={0} step="any" dir="ltr" value={form.partsCost} onChange={set("partsCost")} /></label>
            <label>سایر (حمل، بازکردن…)<input type="number" min={0} step="any" dir="ltr" value={form.otherCost} onChange={set("otherCost")} /></label>
          </div>
          <label>دلیل این تغییر {goingBack && <span style={{ color: "#f87171" }}>(برای بازگشت به مرحله قبل الزامی)</span>}<input maxLength={1000} value={form.reason} onChange={set("reason")} /></label>
          <div className={s.filters}><button className={s.btnPrimary} disabled={busy}>{busy ? "در حال ذخیره…" : "ذخیره پرونده"}</button></div>
          {msg && <p role="status">{msg}</p>}
        </form>
        <h3>سابقه تغییرات پرونده</h3>
        <AuditList rows={detail.history} />
      </>}
    </div>
  </div>;
}

// ── Claims panel ──────────────────────────────────────────────────────────────

const CL_EMPTY = { q: "", open: "true", overdue: "", stage: "", decision: "", cause: "", createdFrom: "", createdTo: "" };

export function ClaimsPanel() {
  const [f, setF] = useState(CL_EMPTY);
  // A claim link in the warranty dialog asks this panel to open that claim.
  const [openId, setOpenId] = useState<string | null>(() => {
    try {
      const id = typeof window === "undefined" ? null : sessionStorage.getItem("sz-open-claim");
      if (id) sessionStorage.removeItem("sz-open-claim");
      return id;
    } catch { return null; }
  });
  const [showNew, setShowNew] = useState(false);
  const load = useCallback((q: string) => managementFetch<Paged<ClaimRow>>(`claims${q}`), []);
  const list = usePaged<ClaimRow>(load, f, { sort: "createdAt" });
  const set = (k: keyof typeof CL_EMPTY) => (e: { target: { value: string } }) => setF(p => ({ ...p, [k]: e.target.value }));
  const sortProps = { sort: list.sort, onSort: list.toggleSort };

  return <section>
    <header className={s.panelHead}>
      <div><span className={s.eyebrow}>خدمات پس از فروش</span><h1>ادعاهای گارانتی</h1></div>
      <button type="button" className={s.btnPrimary} onClick={() => setShowNew(v => !v)}>{showNew ? "بستن فرم" : "ادعای جدید"}</button>
    </header>
    <p className={s.empty}>اهداف خدماتی پیشنهادی: تأیید دریافت ۲ روز کاری، بررسی اولیه ۳ روز کاری، تصمیم ۷ روز کاری پس از تکمیل مدارک (جمعه تعطیل). این‌ها هدف عملیاتی‌اند، نه مهلت قانونی.</p>
    {showNew && <NewClaimForm onCreated={c => { list.reload(); setOpenId(c.id); setShowNew(false); }} />}
    <FilterBar active={countActive(f, CL_EMPTY)} onClear={() => setF(CL_EMPTY)}>
      <label className={s.wide}>جستجو<input type="search" placeholder="شماره پیگیری، کد گارانتی، مالک، موبایل، VIN، پلاک، شرح" value={f.q} onChange={set("q")} /></label>
      <label>نمایش<select value={f.open} onChange={set("open")}><option value="true">فقط باز</option><option value="">همه</option></select></label>
      <label>مهلت<select value={f.overdue} onChange={set("overdue")}><option value="">همه</option><option value="true">فقط دارای تأخیر</option></select></label>
      <label>مرحله<select value={f.stage} onChange={set("stage")}><option value="">همه</option>{Object.entries(STAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>تصمیم<select value={f.decision} onChange={set("decision")}><option value="">همه</option>{Object.entries(DECISIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>علت<select value={f.cause} onChange={set("cause")}><option value="">همه</option>{Object.entries(CAUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>ثبت از<input type="date" value={f.createdFrom} onChange={set("createdFrom")} /></label>
      <label>ثبت تا<input type="date" value={f.createdTo} onChange={set("createdTo")} /></label>
    </FilterBar>
    {list.error && <p role="alert" className={s.errorText}>{list.error}</p>}
    <div className={s.card}>
      <table className={`${s.table} ${list.loading ? s.tableBusy : ""}`}>
        <thead><tr><SortTh column="id" label="شماره پیگیری" {...sortProps} /><SortTh column="warrantyCode" label="گارانتی" {...sortProps} /><th>خودرو / مالک</th>
          <SortTh column="stage" label="مرحله" {...sortProps} /><SortTh column="decision" label="تصمیم" {...sortProps} /><th>علت</th><th>مهلت</th><th>هزینه</th>
          <SortTh column="createdAt" label="ثبت" {...sortProps} /></tr></thead>
        <tbody>{list.items.map(({ claim: c, vehicle: v }) => (
          <tr key={c.id} onClick={() => setOpenId(c.id)} style={{ cursor: "pointer" }}>
            <td><code dir="ltr">{c.id}</code></td><td><code dir="ltr">{c.warrantyCode}</code></td>
            <td>{v ? `${v.make} ${v.model} · ${v.owner}` : "—"}</td><td>{STAGES[c.stage]}</td>
            <td><span className={s.badge} data-tone={c.decision === "accepted" ? "active" : c.decision === "rejected" ? "rejected" : "muted"}>{DECISIONS[c.decision]}</span></td>
            <td>{CAUSES[c.cause]}</td><td><DueBadge c={c} /></td><td dir="ltr">{c.totalCost ? money(c.totalCost) : "—"}</td><td>{when(c.createdAt)}</td>
          </tr>))}
        </tbody>
      </table>
      {!list.loading && !list.items.length && <p className={s.empty}>ادعایی با این فیلترها یافت نشد.</p>}
      <Pager page={list.page} pageSize={list.pageSize} total={list.total} loading={list.loading} onPage={list.setPage} />
    </div>
    {openId && <ClaimDialog id={openId} onClose={() => setOpenId(null)} onSaved={list.reload} />}
  </section>;
}

// ── Change log panel ──────────────────────────────────────────────────────────

const H_EMPTY = { q: "", entityType: "", actor: "", from: "", to: "" };

export function HistoryPanel() {
  const [f, setF] = useState(H_EMPTY);
  const load = useCallback((q: string) => managementFetch<Paged<AuditRow>>(`audit${q}`), []);
  const list = usePaged<AuditRow>(load, f, { pageSize: 50 });
  const set = (k: keyof typeof H_EMPTY) => (e: { target: { value: string } }) => setF(p => ({ ...p, [k]: e.target.value }));
  return <section>
    <header className={s.panelHead}><div><span className={s.eyebrow}>ردیابی</span><h1>سابقه تغییرات</h1></div></header>
    <p className={s.empty}>هر تغییر در گارانتی‌ها، ادعاها، رول‌ها، محصولات، تنظیمات و کاربران با زمان، کاربر، مقدار قبلی و جدید و دلیل ثبت می‌شود. این سوابق قابل ویرایش یا حذف نیستند.</p>
    <FilterBar active={countActive(f)} onClear={() => setF(H_EMPTY)}>
      <label className={s.wide}>جستجو<input type="search" placeholder="شناسه، کاربر، دلیل یا مقدار" value={f.q} onChange={set("q")} /></label>
      <label>نوع<select value={f.entityType} onChange={set("entityType")}><option value="">همه</option>{Object.entries(ENTITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>کاربر<input value={f.actor} onChange={set("actor")} /></label>
      <label>از<input type="date" value={f.from} onChange={set("from")} /></label>
      <label>تا<input type="date" value={f.to} onChange={set("to")} /></label>
    </FilterBar>
    {list.error && <p role="alert" className={s.errorText}>{list.error}</p>}
    <div className={s.card}>
      <table className={`${s.table} ${list.loading ? s.tableBusy : ""}`}>
        <thead><tr><th>زمان</th><th>مورد</th><th>عملیات</th><th>کاربر</th><th>تغییرات</th><th>دلیل</th></tr></thead>
        <tbody>{list.items.map(a => (
          <tr key={a.id}>
            <td>{when(a.at)}</td><td>{ENTITY[a.entityType] ?? a.entityType} <code dir="ltr">{a.entityId}</code></td>
            <td>{ACTIONS[a.action] ?? a.action}</td><td dir="ltr">{a.actor}</td>
            <td>{Object.entries(a.changes).map(([k, [o, n]]) => <div key={k}>{FIELDS[k] ?? k}: {valueLabel(o)} ← {valueLabel(n)}</div>)}</td>
            <td>{a.reason ?? "—"}</td>
          </tr>))}
        </tbody>
      </table>
      {!list.loading && !list.items.length && <p className={s.empty}>سابقه‌ای یافت نشد.</p>}
      <Pager page={list.page} pageSize={list.pageSize} total={list.total} loading={list.loading} onPage={list.setPage} />
    </div>
  </section>;
}
