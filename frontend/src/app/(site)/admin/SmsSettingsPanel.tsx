"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { managementFetch } from "@/lib/api";
import s from "./admin.module.css";
import { errorText } from "./AdminKit";

type Policy = { enabled: boolean; otpMinutes: number; resendSeconds: number; dailyLimit: number };
type Status = { configured: boolean; connected: boolean; keyStored: boolean; mode: string; pattern: string; codeVariable: string; line: string; updatedAt: string | null; policy: Policy };
type LogEntry = { at: string; phone: string; purpose: string; ok: boolean; error: string | null };
type Note = { ok: boolean; text: string } | null;

const fetchAll = () => Promise.all([managementFetch<Status>("sms"), managementFetch<LogEntry[]>("sms/log")]);

const Msg = ({ note }: { note: Note }) => note ? <p role={note.ok ? "status" : "alert"} className={note.ok ? s.okText : s.errorText}>{note.text}</p> : null;

export default function SmsSettingsPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [form, setForm] = useState({ token: "", pattern: "2675", line: "", codeVariable: "code1" });
  const [policy, setPolicy] = useState<Policy>({ enabled: true, otpMinutes: 5, resendSeconds: 60, dailyLimit: 10 });
  const [phone, setPhone] = useState("");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState("");
  const [notes, setNotes] = useState<Record<string, Note>>({});
  const note = (k: string, n: Note) => setNotes(p => ({ ...p, [k]: n }));

  const apply = useCallback(([r, entries]: [Status, LogEntry[]]) => {
    setStatus(r); setLog(entries); setPolicy(r.policy);
    setForm(f => ({ ...f, pattern: r.pattern, line: r.line, codeVariable: r.codeVariable }));
  }, []);
  const load = useCallback(() => fetchAll().then(apply), [apply]);
  useEffect(() => {
    let live = true;
    fetchAll().then(d => { if (live) apply(d); })
      .catch(e => { if (live) setNotes(p => ({ ...p, load: { ok: false, text: errorText(e, "Could not load SMS settings.") } })); });
    return () => { live = false; };
  }, [apply]);

  async function run(key: string, action: () => Promise<{ message?: string }>) {
    setBusy(key); note(key, null);
    try { const r = await action(); note(key, { ok: true, text: r.message ?? "Saved." }); await load(); }
    catch (e) { note(key, { ok: false, text: errorText(e, "Request failed.") }); }
    finally { setBusy(""); }
  }

  function saveConnection(e: FormEvent) {
    e.preventDefault();
    run("connection", async () => { const r = await managementFetch<{ message: string }>("sms", form); setForm(f => ({ ...f, token: "" })); return r; });
  }
  function savePolicy(e: FormEvent) { e.preventDefault(); run("policy", () => managementFetch<{ message: string }>("sms/policy", policy)); }
  function sendTest(e: FormEvent) { e.preventDefault(); run("test", () => managementFetch<{ message: string }>("sms/test", { phone: phone.trim() })); }
  function disconnect() {
    if (!window.confirm("Disconnect SMS and delete the stored API key? Customer activation will stop until it is connected again.")) return;
    run("connection", () => managementFetch<{ message: string }>("sms", undefined, "DELETE"));
  }

  const state = !status ? "Loading…" : status.configured ? "Active" : status.connected ? "Paused" : "Not connected";
  const tone = !status ? "muted" : status.configured ? "active" : status.connected ? "pending" : "rejected";
  return <section>
    <header className={s.panelHead}><div><span className={s.eyebrow}>SMS</span><h1>SMS gateway</h1></div>
      <button type="button" className={s.ghost} onClick={() => load().catch(e => note("load", { ok: false, text: errorText(e) }))}>Refresh</button></header>
    <Msg note={notes.load ?? null} />

    <div className={s.statusGrid}>
      <div className={s.kpi}><span>Status</span><b><span className={s.badge} data-tone={tone}>{state}</span></b></div>
      <div className={s.kpi}><span>Provider</span><b style={{ fontSize: 16 }}>Faraz · HTTPS</b></div>
      <div className={s.kpi}><span>Sender line</span><b style={{ fontSize: 16 }}>{status?.line || "—"}</b></div>
      <div className={s.kpi}><span>Pattern</span><b style={{ fontSize: 16 }}>{status?.pattern || "—"}</b></div>
      <div className={s.kpi}><span>Last verified</span><b style={{ fontSize: 14 }}>{status?.updatedAt ? new Date(status.updatedAt).toLocaleString() : "—"}</b></div>
    </div>
    {status && !status.configured && <p className={s.empty}>{status.connected ? "Sending is paused. Customer activation is unavailable until sending is resumed." : "SMS is not connected. Customer activation remains unavailable."}</p>}

    <div className={s.row2} style={{ alignItems: "start" }}>
      <form onSubmit={saveConnection} className={`${s.card} ${s.adminForm}`}>
        <h2>Connection</h2>
        <label>Faraz API key<input type="password" autoComplete="off" required={!status?.keyStored} maxLength={2048} value={form.token}
          placeholder={status?.keyStored ? "Stored securely — leave empty to keep it" : ""} onChange={e => setForm({ ...form, token: e.target.value })} /></label>
        <label>OTP pattern ID<input required maxLength={100} pattern="[A-Za-z0-9_\-]+" value={form.pattern} onChange={e => setForm({ ...form, pattern: e.target.value })} /></label>
        <label>Sender line<input required inputMode="numeric" pattern="[0-9]{3,24}" value={form.line} onChange={e => setForm({ ...form, line: e.target.value })} /></label>
        <label>OTP variable name<input required maxLength={50} pattern="[A-Za-z][A-Za-z0-9_]*" value={form.codeVariable} onChange={e => setForm({ ...form, codeVariable: e.target.value })} /></label>
        <p className={s.empty}>Use the exact variable name from the approved pattern (for example code or code1). Saving verifies your account and pattern without sending a message. The key is encrypted on the server and is never returned to this page.</p>
        <button disabled={!!busy} className={s.btnPrimary}>{busy === "connection" ? "Verifying…" : "Verify connection and save SMS"}</button>
        {status?.keyStored && <button type="button" className={s.danger} disabled={!!busy} onClick={disconnect}>Disconnect and delete key</button>}
        <Msg note={notes.connection ?? null} />
      </form>

      <div className={s.adminForm}>
        <form onSubmit={savePolicy} className={`${s.card} ${s.adminForm}`}>
          <h2>Verification rules</h2>
          <label className={s.switch}><input type="checkbox" checked={policy.enabled} onChange={e => setPolicy({ ...policy, enabled: e.target.checked })} /> Sending enabled</label>
          <label>Code validity (minutes)<input type="number" min={2} max={15} required value={policy.otpMinutes} onChange={e => setPolicy({ ...policy, otpMinutes: Number(e.target.value) })} /></label>
          <label>Wait before resending (seconds)<input type="number" min={30} max={600} required value={policy.resendSeconds} onChange={e => setPolicy({ ...policy, resendSeconds: Number(e.target.value) })} /></label>
          <label>Daily messages per mobile<input type="number" min={1} max={50} required value={policy.dailyLimit} onChange={e => setPolicy({ ...policy, dailyLimit: Number(e.target.value) })} /></label>
          <button disabled={!!busy} className={s.btnPrimary}>{busy === "policy" ? "Saving…" : "Save rules"}</button>
          <Msg note={notes.policy ?? null} />
        </form>

        <form onSubmit={sendTest} className={`${s.card} ${s.adminForm}`}>
          <h2>Send test message</h2>
          <p className={s.empty}>Sends one real SMS with a random code using the approved pattern. Limited to 5 tests per 10 minutes.</p>
          <label>Mobile number<input required inputMode="tel" pattern="(09[0-9]{9}|\+?989[0-9]{9})" placeholder="09123456789" value={phone} onChange={e => setPhone(e.target.value)} /></label>
          <button disabled={!!busy || !status?.configured} className={s.ghost}>{busy === "test" ? "Sending…" : "Send test SMS"}</button>
          <Msg note={notes.test ?? null} />
        </form>
      </div>
    </div>

    <div className={s.card}>
      <h2>Recent activity</h2>
      {log.length === 0 ? <p className={s.empty}>No messages sent since the server started.</p> :
        <table className={s.table}><thead><tr><th>Time</th><th>Mobile</th><th>Purpose</th><th>Result</th><th>Detail</th></tr></thead><tbody>
          {log.map((x, i) => <tr key={i}><td>{new Date(x.at).toLocaleString()}</td><td>{x.phone}</td><td>{x.purpose}</td>
            <td><span className={s.badge} data-tone={x.ok ? "ok" : "fail"}>{x.ok ? "Submitted" : "Failed"}</span></td><td>{x.error ?? "—"}</td></tr>)}
        </tbody></table>}
      <p className={s.empty}>Numbers are masked and verification codes are never stored. The log is kept in memory and clears when the server restarts.</p>
    </div>
  </section>;
}
