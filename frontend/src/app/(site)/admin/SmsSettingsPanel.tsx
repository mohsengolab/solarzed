"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { managementFetch, fa, FA_DATE } from "@/lib/api";
import s from "./admin.module.css";
import { errorText } from "./AdminKit";
import { useCan } from "./RolesPanel";

type Policy = { enabled: boolean; otpMinutes: number; resendSeconds: number; dailyLimit: number };
type EmailStatus = { configured: boolean; host: string; port: number; from: string; senderName: string; user: string; passwordStored: boolean };
type Status = { configured: boolean; connected: boolean; keyStored: boolean; mode: string; pattern: string; codeVariable: string; line: string; endpoint: string | null; updatedAt: string | null; policy: Policy; email: EmailStatus;
  warranty: { pattern: string; codeVariable: string; linkVariable: string; configured: boolean } };
type LogEntry = { at: string; phone: string; purpose: string; ok: boolean; error: string | null };
type Note = { ok: boolean; text: string } | null;

const fetchAll = () => Promise.all([managementFetch<Status>("sms"), managementFetch<LogEntry[]>("sms/log")]);

const Msg = ({ note }: { note: Note }) => note ? <p role={note.ok ? "status" : "alert"} className={note.ok ? s.okText : s.errorText}>{note.text}</p> : null;

export default function SmsSettingsPanel() {
  const canEdit = useCan()("sms.edit");
  const [status, setStatus] = useState<Status | null>(null);
  const [form, setForm] = useState({ mode: "soap", endpoint: "http://185.112.33.61/wbs/send.php", token: "", pattern: "2675", line: "21000051112", codeVariable: "code1" });
  const [policy, setPolicy] = useState<Policy>({ enabled: true, otpMinutes: 5, resendSeconds: 60, dailyLimit: 10 });
  const [phone, setPhone] = useState("");
  const [warranty, setWarranty] = useState({ pattern: "", codeVariable: "code", linkVariable: "link" });
  const [emailForm, setEmailForm] = useState({ host: "", port: "587", from: "", name: "", user: "", password: "", enableSsl: true });
  const [testEmail, setTestEmail] = useState("");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState("");
  const [notes, setNotes] = useState<Record<string, Note>>({});
  const note = (k: string, n: Note) => setNotes(p => ({ ...p, [k]: n }));

  const apply = useCallback(([r, entries]: [Status, LogEntry[]]) => {
    setStatus(r); setLog(entries); setPolicy(r.policy);
    if (r.warranty) setWarranty({ pattern: r.warranty.pattern, codeVariable: r.warranty.codeVariable, linkVariable: r.warranty.linkVariable });
    setForm(f => ({ ...f, pattern: r.pattern, line: r.line || f.line, codeVariable: r.codeVariable,
      ...(r.mode === "rest" || r.mode === "soap" ? { mode: r.mode } : {}), ...(r.endpoint ? { endpoint: r.endpoint } : {}) }));
    setEmailForm(e => ({ ...e, host: r.email.host || e.host, port: String(r.email.port || 587), from: r.email.from || e.from,
      name: r.email.senderName || e.name, user: r.email.user || e.user }));
  }, []);
  const load = useCallback(() => fetchAll().then(apply), [apply]);
  useEffect(() => {
    let live = true;
    fetchAll().then(d => { if (live) apply(d); })
      .catch(e => { if (live) setNotes(p => ({ ...p, load: { ok: false, text: fa(errorText(e, "بارگذاری تنظیمات پیامک ناموفق بود.")) } })); });
    return () => { live = false; };
  }, [apply]);

  async function run(key: string, action: () => Promise<{ message?: string }>) {
    setBusy(key); note(key, null);
    try { const r = await action(); note(key, { ok: true, text: fa(r.message ?? "ذخیره شد.") }); await load(); }
    catch (e) { note(key, { ok: false, text: fa(errorText(e, "درخواست ناموفق بود.")) }); }
    finally { setBusy(""); }
  }

  function saveConnection(e: FormEvent) {
    e.preventDefault();
    run("connection", async () => { const r = await managementFetch<{ message: string }>("sms", form); setForm(f => ({ ...f, token: "" })); return r; });
  }
  function savePolicy(e: FormEvent) { e.preventDefault(); run("policy", () => managementFetch<{ message: string }>("sms/policy", policy)); }
  function saveWarranty(e: FormEvent) { e.preventDefault(); run("warranty", () => managementFetch<{ message: string }>("sms/warranty", { ...warranty, pattern: warranty.pattern.trim() })); }
  function sendUnsentCards() {
    if (!window.confirm("پیامک کارت طلایی برای همه گارانتی‌های فعالی که تاکنون پیامک نگرفته‌اند (حداکثر ۲۰۰ مورد) ارسال شود؟")) return;
    run("warrantyUnsent", () => managementFetch<{ message: string }>("sms/warranty/send-unsent", {}));
  }
  function sendTest(e: FormEvent) { e.preventDefault(); run("test", () => managementFetch<{ message: string }>("sms/test", { phone: phone.trim() })); }
  function saveEmail(e: FormEvent) {
    e.preventDefault();
    run("email", () => managementFetch<{ message: string }>("sms/email", {
      host: emailForm.host.trim(), port: Number(emailForm.port) || 587, from: emailForm.from.trim(), name: emailForm.name.trim(),
      user: emailForm.user.trim(), password: emailForm.password, enableSsl: emailForm.enableSsl,
    }).then(r => { setEmailForm(f => ({ ...f, password: "" })); return r; }));
  }
  function sendTestEmail(e: FormEvent) { e.preventDefault(); run("emailTest", () => managementFetch<{ message: string }>("sms/email/test", { to: testEmail.trim() })); }
  function disconnect() {
    if (!window.confirm("اتصال پیامک قطع و کلید API ذخیره‌شده حذف شود؟ فعال‌سازی مشتری تا اتصال دوباره متوقف می‌شود.")) return;
    run("connection", () => managementFetch<{ message: string }>("sms", undefined, "DELETE"));
  }

  const state = !status ? "در حال بارگذاری…" : status.configured ? "فعال" : status.connected ? "متوقف" : "متصل نیست";
  const tone = !status ? "muted" : status.configured ? "active" : status.connected ? "pending" : "rejected";
  return <section>
    <header className={s.panelHead}><div><span className={s.eyebrow}>پیامک</span><h1>درگاه پیامک</h1></div>
      <button type="button" className={s.ghost} onClick={() => load().catch(e => note("load", { ok: false, text: errorText(e) }))}>بازخوانی</button></header>
    <Msg note={notes.load ?? null} />

    <div className={s.statusGrid}>
      <div className={s.kpi}><span>وضعیت</span><b><span className={s.badge} data-tone={tone}>{state}</span></b></div>
      <div className={s.kpi}><span>ارائه‌دهنده</span><b style={{ fontSize: 16 }}>{status?.mode === "soap" ? "فراز · SOAP" : "فراز · HTTPS"}</b></div>
      <div className={s.kpi}><span>خط فرستنده</span><b style={{ fontSize: 16 }} dir="ltr">{status?.line || "—"}</b></div>
      <div className={s.kpi}><span>الگو</span><b style={{ fontSize: 16 }} dir="ltr">{status?.pattern || "—"}</b></div>
      <div className={s.kpi}><span>آخرین تأیید</span><b style={{ fontSize: 14 }}>{status?.updatedAt ? new Date(status.updatedAt).toLocaleString(FA_DATE) : "—"}</b></div>
    </div>
    {status && !status.configured && <p className={s.empty}>{fa(status.connected ? "Sending is paused. Customer activation is unavailable until sending is resumed." : "SMS is not connected. Customer activation remains unavailable.")}</p>}

    {!canEdit && <p className={s.empty}>دسترسی شما به این صفحه فقط مشاهده است.</p>}
    <fieldset disabled={!canEdit} style={{ display: "contents" }}>
    <div className={s.row2} style={{ alignItems: "start" }}>
      <form onSubmit={saveConnection} className={`${s.card} ${s.adminForm}`}>
        <h2>اتصال</h2>
        <label>نوع اتصال<select value={form.mode} onChange={e => setForm({ ...form, mode: e.target.value })}>
          <option value="soap">وب‌سرویس SOAP (توکن — مثل ربات پیام)</option>
          <option value="rest">REST HTTPS (کلید API)</option></select></label>
        {form.mode === "soap" && <label>آدرس وب‌سرویس<input required maxLength={300} value={form.endpoint} dir="ltr" onChange={e => setForm({ ...form, endpoint: e.target.value })} /></label>}
        <label>{form.mode === "soap" ? "توکن فراز" : "کلید API فراز"}<input type="password" autoComplete="off" required={!status?.keyStored || status.mode !== form.mode} maxLength={2048} value={form.token} dir="ltr"
          placeholder={status?.keyStored ? "به‌صورت امن ذخیره شده — برای حفظ آن خالی بگذارید" : ""} onChange={e => setForm({ ...form, token: e.target.value })} /></label>
        <label>شناسه الگوی OTP<input required maxLength={100} pattern="[A-Za-z0-9_\-]+" value={form.pattern} onChange={e => setForm({ ...form, pattern: e.target.value })} dir="ltr" /></label>
        <label>خط فرستنده<input required inputMode="numeric" pattern="[0-9]{3,24}" value={form.line} onChange={e => setForm({ ...form, line: e.target.value })} dir="ltr" /></label>
        <label>نام متغیر OTP<input required maxLength={50} pattern="[A-Za-z][A-Za-z0-9_]*" value={form.codeVariable} onChange={e => setForm({ ...form, codeVariable: e.target.value })} dir="ltr" /></label>
        <p className={s.empty}>نام متغیر دقیقاً همان چیزی باشد که در الگوی تأییدشده آمده است (مثلاً code یا code1). {form.mode === "soap" ? "در حالت SOAP بررسی خودکار وجود ندارد؛ پس از ذخیره یک پیامک آزمایشی بفرستید." : "ذخیره کردن، حساب و الگوی شما را بدون ارسال پیام بررسی می‌کند."} کلید روی سرور رمزنگاری می‌شود و هرگز به این صفحه برنمی‌گردد.</p>
        <button disabled={!!busy} className={s.btnPrimary}>{busy === "connection" ? "در حال تأیید…" : "تأیید اتصال و ذخیره پیامک"}</button>
        {status?.keyStored && <button type="button" className={s.danger} disabled={!!busy} onClick={disconnect}>قطع اتصال و حذف کلید</button>}
        <Msg note={notes.connection ?? null} />
      </form>

      <div className={s.adminForm}>
        <form onSubmit={savePolicy} className={`${s.card} ${s.adminForm}`}>
          <h2>قواعد تأیید</h2>
          <label className={s.switch}><input type="checkbox" checked={policy.enabled} onChange={e => setPolicy({ ...policy, enabled: e.target.checked })} /> ارسال فعال</label>
          <label>اعتبار کد (دقیقه)<input type="number" min={2} max={15} required value={policy.otpMinutes} onChange={e => setPolicy({ ...policy, otpMinutes: Number(e.target.value) })} /></label>
          <label>انتظار پیش از ارسال مجدد (ثانیه)<input type="number" min={30} max={600} required value={policy.resendSeconds} onChange={e => setPolicy({ ...policy, resendSeconds: Number(e.target.value) })} /></label>
          <label>پیام روزانه به هر موبایل<input type="number" min={1} max={50} required value={policy.dailyLimit} onChange={e => setPolicy({ ...policy, dailyLimit: Number(e.target.value) })} /></label>
          <button disabled={!!busy} className={s.btnPrimary}>{busy === "policy" ? "در حال ذخیره…" : "ذخیره قواعد"}</button>
          <Msg note={notes.policy ?? null} />
        </form>

        <form onSubmit={saveWarranty} className={`${s.card} ${s.adminForm}`}>
          <h2>پیامک فعال شدن گارانتی (کارت طلایی)</h2>
          <p className={s.empty}>وقتی گارانتی فعال می‌شود (تأیید عکس‌ها توسط کانتر)، یک پیامک با شماره گارانتی و لینک کارت طلایی به موبایل مشتری می‌رود. یک الگوی جدا در پنل فراز بسازید با دو متغیر: شماره گارانتی و لینک کارت.
            {status && <> وضعیت: <b>{status.warranty?.configured ? "فعال" : "تنظیم نشده"}</b></>}</p>
          <label>شناسه الگوی گارانتی<input maxLength={100} pattern="[A-Za-z0-9_\-]+" value={warranty.pattern} onChange={e => setWarranty({ ...warranty, pattern: e.target.value })} dir="ltr" placeholder="خالی = ارسال نشود" /></label>
          <label>متغیر شماره گارانتی<input required maxLength={50} pattern="[A-Za-z][A-Za-z0-9_]*" value={warranty.codeVariable} onChange={e => setWarranty({ ...warranty, codeVariable: e.target.value })} dir="ltr" /></label>
          <label>متغیر لینک کارت<input required maxLength={50} pattern="[A-Za-z][A-Za-z0-9_]*" value={warranty.linkVariable} onChange={e => setWarranty({ ...warranty, linkVariable: e.target.value })} dir="ltr" /></label>
          <button disabled={!!busy} className={s.btnPrimary}>{busy === "warranty" ? "در حال ذخیره…" : "ذخیره الگوی گارانتی"}</button>
          <Msg note={notes.warranty ?? null} />
          <button type="button" disabled={!!busy || !status?.warranty?.configured} className={s.ghost} onClick={sendUnsentCards}>{busy === "warrantyUnsent" ? "در حال ارسال…" : "ارسال برای گارانتی‌های فعالِ بدون پیامک"}</button>
          <Msg note={notes.warrantyUnsent ?? null} />
        </form>

        <form onSubmit={sendTest} className={`${s.card} ${s.adminForm}`}>
          <h2>ارسال پیام آزمایشی</h2>
          <p className={s.empty}>یک پیامک واقعی با کد تصادفی و الگوی تأییدشده ارسال می‌کند. حداکثر ۵ آزمون در ۱۰ دقیقه.</p>
          <label>شماره موبایل<input required inputMode="tel" pattern="(09[0-9]{9}|\+?989[0-9]{9})" placeholder="09123456789" value={phone} onChange={e => setPhone(e.target.value)} dir="ltr" /></label>
          <button disabled={!!busy || !status?.configured} className={s.ghost}>{busy === "test" ? "در حال ارسال…" : "ارسال پیامک آزمایشی"}</button>
          <Msg note={notes.test ?? null} />
        </form>

        <form onSubmit={saveEmail} className={`${s.card} ${s.adminForm}`}>
          <h2>کانال ایمیل</h2>
          <p className={s.empty}>کاربرانی که ایمیل ثبت کرده‌اند کد ورود را با ایمیل دریافت می‌کنند (به‌جای یا در کنار پیامک).</p>
          <div className={s.statusGrid} style={{ marginBottom: 14 }}>
            <div className={s.kpi}><span>وضعیت</span><b><span className={s.badge} data-tone={status?.email.configured ? "active" : "muted"}>{status?.email.configured ? "فعال" : "تنظیم نشده"}</span></b></div>
            <div className={s.kpi}><span>میزبان</span><b style={{ fontSize: 14 }} dir="ltr">{status?.email.host || "—"}</b></div>
          </div>
          <div className={s.row2}>
            <label>میزبان SMTP<input required maxLength={253} placeholder="smtp.example.com" value={emailForm.host} dir="ltr" onChange={e => setEmailForm({ ...emailForm, host: e.target.value })} /></label>
            <label>پورت<input type="number" min={1} max={65535} required value={emailForm.port} dir="ltr" onChange={e => setEmailForm({ ...emailForm, port: e.target.value })} /></label>
            <label>آدرس فرستنده<input required maxLength={254} type="email" placeholder="no-reply@example.com" value={emailForm.from} dir="ltr" onChange={e => setEmailForm({ ...emailForm, from: e.target.value })} /></label>
            <label>نام فرستنده<input maxLength={100} value={emailForm.name} onChange={e => setEmailForm({ ...emailForm, name: e.target.value })} /></label>
            <label>کاربر SMTP<input autoComplete="off" maxLength={254} value={emailForm.user} dir="ltr" placeholder="برای ارسال ناشناس خالی بگذارید" onChange={e => setEmailForm({ ...emailForm, user: e.target.value })} /></label>
            <label>رمز SMTP<input type="password" autoComplete="new-password" maxLength={512} value={emailForm.password} dir="ltr"
              placeholder={status?.email.passwordStored ? "به‌صورت امن ذخیره شده — برای حفظ آن خالی بگذارید" : ""}
              onChange={e => setEmailForm({ ...emailForm, password: e.target.value })} /></label>
          </div>
          <label className={s.switch}><input type="checkbox" checked={emailForm.enableSsl} onChange={e => setEmailForm({ ...emailForm, enableSsl: e.target.checked })} /> استفاده از SSL/TLS</label>
          <button disabled={!!busy} className={s.btnPrimary}>{busy === "email" ? "در حال ذخیره…" : "ذخیره تنظیمات ایمیل"}</button>
          <Msg note={notes.email ?? null} />
        </form>

        <form onSubmit={sendTestEmail} className={`${s.card} ${s.adminForm}`}>
          <h2>ارسال ایمیل آزمایشی</h2>
          <p className={s.empty}>یک ایمیل واقعی با کد تصادفی ارسال می‌کند. حداکثر ۵ آزمون در ۱۰ دقیقه.</p>
          <label>آدرس ایمیل<input required type="email" maxLength={254} placeholder="you@example.com" value={testEmail} dir="ltr" onChange={e => setTestEmail(e.target.value)} /></label>
          <button disabled={!!busy || !status?.email.configured} className={s.ghost}>{busy === "emailTest" ? "در حال ارسال…" : "ارسال ایمیل آزمایشی"}</button>
          <Msg note={notes.emailTest ?? null} />
        </form>
      </div>
    </div>
    </fieldset>

    <div className={s.card}>
      <h2>فعالیت اخیر</h2>
      {log.length === 0 ? <p className={s.empty}>از زمان راه‌اندازی سرور پیامی ارسال نشده است.</p> :
        <table className={s.table}><thead><tr><th>زمان</th><th>موبایل</th><th>هدف</th><th>نتیجه</th><th>جزئیات</th></tr></thead><tbody>
          {log.map((x, i) => <tr key={i}><td>{new Date(x.at).toLocaleString(FA_DATE)}</td><td dir="ltr">{x.phone}</td><td>{fa(x.purpose)}</td>
            <td><span className={s.badge} data-tone={x.ok ? "ok" : "fail"}>{x.ok ? "ارسال شد" : "ناموفق"}</span></td><td>{x.error ?? "—"}</td></tr>)}
        </tbody></table>}
      <p className={s.empty}>شماره‌ها پوشیده می‌شوند و کدهای تأیید هرگز ذخیره نمی‌شوند. گزارش در حافظه نگه داشته می‌شود و با راه‌اندازی مجدد سرور پاک می‌شود.</p>
    </div>
  </section>;
}
