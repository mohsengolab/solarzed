"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { adminTickets, adminTicketDetail, adminTicketReply, adminTicketClose, adminTicketOpen, fa, FA_DATE, type AdminTicketRow, type AdminTicketDetail } from "@/lib/api";
import s from "./admin.module.css";
import { usePaged, SortTh, Pager, FilterBar, countActive, errorText } from "./AdminKit";
import { useCan } from "./RolesPanel";

const T_EMPTY = { q: "" };
const DEPARTMENT: Record<string, string> = { support: "پشتیبانی", sales: "فروش" };
const date = (value: string) => new Date(value).toLocaleString(FA_DATE);

/** Support inbox: every ticket shows who is writing (mobile, name, profile) — never masked. */
export default function TicketsPanel() {
  const canReply = useCan()("tickets.edit");
  const [status, setStatus] = useState("");
  const [department, setDepartment] = useState("");
  const [f, setF] = useState(T_EMPTY);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<AdminTicketDetail | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const list = usePaged<AdminTicketRow>(adminTickets, { ...f, status, department }, { sort: "updatedAt" });
  const set = (k: keyof typeof T_EMPTY) => (e: { target: { value: string } }) => setF(p => ({ ...p, [k]: e.target.value }));

  useEffect(() => {
    if (selectedId == null) { setDetail(null); return; }
    let live = true;
    setDetail(null); setReply(""); setMsg("");
    adminTicketDetail(selectedId)
      .then(d => { if (live) setDetail(d); })
      .catch(e => { if (live) setMsg(fa(errorText(e))); });
    return () => { live = false; };
  }, [selectedId]);

  // Keep the open conversation and the inbox live, so a user's follow-up shows without a reload.
  const reloadList = list.reload;
  useEffect(() => {
    let live = true;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        if (selectedId != null) { const d = await adminTicketDetail(selectedId); if (live) setDetail(d); }
        if (live) await reloadList();
      } catch { /* transient: try again on the next tick */ }
    };
    const timer = window.setInterval(tick, 15_000);
    document.addEventListener("visibilitychange", tick);
    return () => { live = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [selectedId, reloadList]);

  async function refresh(selectedId: number) {
    setDetail(await adminTicketDetail(selectedId));
  }

  async function act(action: () => Promise<unknown>) {
    if (selectedId == null) return;
    setBusy(true); setMsg("");
    try { await action(); await refresh(selectedId); await list.reload(); }
    catch (e) { setMsg(fa(errorText(e))); }
    finally { setBusy(false); }
  }

  async function sendReply(e: FormEvent) {
    e.preventDefault();
    if (selectedId == null || !reply.trim()) return;
    await act(async () => { await adminTicketReply(selectedId, reply.trim()); setReply(""); });
  }

  const tone: Record<string, string> = { open: "pending", answered: "active", closed: "muted" };
  const sortProps = { sort: list.sort, onSort: list.toggleSort };
  return <section>
    <header className={s.panelHead}><div><span className={s.eyebrow}>پشتیبانی</span><h1>تیکت‌های پشتیبانی</h1></div></header>
    <p className={s.empty}>هر تیکت شامل موبایل، نام و مشخصات نویسنده است؛ هر کسی که گفتگو را می‌بیند می‌داند با چه کسی صحبت می‌کند.</p>
    <div className={s.filters} role="group" aria-label="وضعیت تیکت">
      {[["", "همه"], ["open", "باز"], ["answered", "پاسخ داده شد"], ["closed", "بسته"]].map(([value, label]) => (
        <button key={value} type="button" onClick={() => setStatus(value)} className={status === value ? s.segActive : s.seg} aria-pressed={status === value}>{label}</button>
      ))}
    </div>
    <div className={s.filters} role="group" aria-label="واحد">
      {[["", "همه واحدها"], ["support", "پشتیبانی"], ["sales", "فروش"]].map(([value, label]) => (
        <button key={value} type="button" onClick={() => setDepartment(value)} className={department === value ? s.segActive : s.seg} aria-pressed={department === value}>{label}</button>
      ))}
    </div>
    <FilterBar active={countActive(f)} onClear={() => setF(T_EMPTY)}>
      <label className={s.wide}>جستجوی تیکت<input type="search" placeholder="کد، موضوع، موبایل، ایمیل یا نام" value={f.q} onChange={set("q")} /></label>
    </FilterBar>
    {list.error && <p role="alert" className={s.errorText}>{list.error}</p>}
    <div className={s.card}>
      <table className={`${s.table} ${list.loading ? s.tableBusy : ""}`}>
        <thead><tr><SortTh column="code" label="کد" {...sortProps} /><SortTh column="subject" label="موضوع" {...sortProps} />
          <SortTh column="department" label="واحد" {...sortProps} />
          <th>نویسنده</th><th>تماس</th><SortTh column="status" label="وضعیت" {...sortProps} />
          <th>پاسخ‌ها</th><SortTh column="updatedAt" label="آخرین فعالیت" {...sortProps} /></tr></thead>
        <tbody>
          {list.items.map(t => (
            <tr key={t.id} onClick={() => setSelectedId(t.id)} style={{ cursor: "pointer" }}>
              <td><code dir="ltr">{t.code}</code></td>
              <td>{t.subject}</td>
              <td>{DEPARTMENT[t.department] ?? t.department}</td>
              <td>{[t.firstName, t.lastName].filter(Boolean).join(" ") || "—"}</td>
              <td dir="ltr">{t.userPhone ?? t.userEmail ?? "—"}</td>
              <td><span className={s.badge} data-tone={tone[t.status] ?? "muted"}>{fa(t.status)}</span></td>
              <td>{t.replies.toLocaleString("fa-IR")}</td>
              <td>{date(t.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!list.loading && !list.items.length && <p className={s.empty}>تیکتی با این فیلترها یافت نشد.</p>}
      <Pager page={list.page} pageSize={list.pageSize} total={list.total} loading={list.loading} onPage={list.setPage} />
    </div>

    {selectedId != null && <div className={s.card} style={{ marginTop: 20 }}>
      {!detail ? <p className={s.loading}>{fa("Loading…")}</p> : <>
        <div className={s.panelHead}>
          <h2>{detail.ticket.subject} · <code dir="ltr">{detail.ticket.code}</code> · <span className={s.badge} data-tone={detail.ticket.department === "sales" ? "active" : "pending"}>واحد {DEPARTMENT[detail.ticket.department] ?? detail.ticket.department}</span></h2>
          <div className={s.filters}>
            {canReply && (detail.ticket.status !== "closed"
              ? <button type="button" className={s.ghost} disabled={busy} onClick={() => act(() => adminTicketClose(selectedId))}>بستن تیکت</button>
              : <button type="button" className={s.ghost} disabled={busy} onClick={() => act(() => adminTicketOpen(selectedId))}>بازگشایی</button>)}
            <button type="button" className={s.ghost} onClick={() => setSelectedId(null)}>بستن گفتگو</button>
          </div>
        </div>
        <p className={s.empty}>
          {[detail.ticket.userPhone && `موبایل: ${detail.ticket.userPhone}`, detail.ticket.userEmail && `ایمیل: ${detail.ticket.userEmail}`].filter(Boolean).join(" · ") || "—"}
        </p>
        {(detail.ticket.firstName || detail.ticket.lastName || detail.ticket.country || detail.ticket.city || detail.ticket.job) && <p className={s.empty}>
          {[[detail.ticket.firstName, detail.ticket.lastName].filter(Boolean).join(" "), detail.ticket.country, detail.ticket.city, detail.ticket.job].filter(Boolean).join(" · ")}
        </p>}
        {detail.profile && (detail.profile.phone || detail.profile.email || detail.profile.lastLoginAt) && <p className={s.empty}>
          پروفایل فعلی: {[detail.profile.phone, detail.profile.email].filter(Boolean).join(" · ") || "—"}
          {detail.profile.lastLoginAt ? ` · آخرین ورود: ${date(detail.profile.lastLoginAt)}` : ""}
        </p>}
        <div style={{ display: "grid", gap: 12, margin: "18px 0" }}>
          {detail.replies.map(r => (
            <article key={r.id} style={{
              alignSelf: r.author === "staff" ? "flex-end" : "flex-start", maxWidth: 640, width: "100%",
              background: r.author === "staff" ? "rgba(31,195,207,.08)" : "rgba(255,255,255,.04)",
              border: `1px solid ${r.author === "staff" ? "rgba(31,195,207,.35)" : "rgba(255,255,255,.12)"}`,
              borderRadius: 12, padding: "10px 14px",
            }}>
              <b style={{ fontSize: 12 }}>{r.author === "staff" ? `${DEPARTMENT[detail.ticket.department] ?? "پشتیبانی"}${r.authorLabel ? ` · ${r.authorLabel}` : ""}` : [detail.ticket.firstName, detail.ticket.lastName].filter(Boolean).join(" ") || "کاربر"}</b>
              <p style={{ margin: "6px 0", whiteSpace: "pre-wrap" }}>{r.message}</p>
              <span style={{ fontSize: 11, opacity: .6 }}>{date(r.createdAt)}</span>
            </article>
          ))}
        </div>
        {canReply && <form onSubmit={sendReply} className={s.adminForm}>
          <label>پاسخ شما<textarea rows={3} maxLength={4000} required value={reply} onChange={e => setReply(e.target.value)} /></label>
          <button type="submit" className={s.btnPrimary} disabled={busy || !reply.trim()}>{busy ? "در حال ارسال…" : "ارسال پاسخ"}</button>
        </form>}
      </>}
      {msg && <p role="alert" className={s.errorText}>{msg}</p>}
    </div>}
  </section>;
}
