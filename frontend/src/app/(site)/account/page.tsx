"use client";

import { useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import {
  portalBoxes, portalLogout, portalMe, portalTransfer, portalWarranties,
  portalProfile, portalBind, portalBindVerify, portalTickets, portalCreateTicket, portalTicketDetail, portalTicketReply,
  BoxTransfer, HeldBox, PortalUser, PortalChannel, PortalTicket, WarrantyPublic, type AdminTicketReply,
} from "@/lib/api";
import PortalSignIn from "@/components/PortalSignIn";
import styles from "../activate/activate.module.css";
import own from "./account.module.css";

const date = (value: string | null) => value ? new Date(value).toLocaleDateString() : "—";
const stamp = (value: string) => new Date(value).toLocaleString();
const who = (name: string | null, phone: string | null) => name && phone && name !== phone ? `${name} (${phone})` : name ?? phone ?? "Central warehouse";
const display = (user: PortalUser) => user.phone ?? user.email ?? "your account";

const emptyProfile = { firstName: "", lastName: "", country: "", city: "", job: "" };

export default function AccountPage() {
  const [user, setUser] = useState<PortalUser | null>(null);
  const [checked, setChecked] = useState(false);
  const [boxes, setBoxes] = useState<HeldBox[]>([]);
  const [outgoing, setOutgoing] = useState<BoxTransfer[]>([]);
  const [warranties, setWarranties] = useState<WarrantyPublic[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [serials, setSerials] = useState("");
  const [toPhone, setToPhone] = useState("");
  const [toName, setToName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  // Profile (first/last name, country, city, job)
  const [profile, setProfile] = useState(emptyProfile);
  const [profileMsg, setProfileMsg] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);

  // Bind a new mobile or email with a verification code
  const [bindChannel, setBindChannel] = useState<PortalChannel>("sms");
  const [bindIdentifier, setBindIdentifier] = useState("");
  const [bindChallenge, setBindChallenge] = useState<{ challengeId: string } | null>(null);
  const [bindCode, setBindCode] = useState("");
  const [bindMsg, setBindMsg] = useState("");
  const [bindBusy, setBindBusy] = useState(false);

  // Support tickets
  const [tickets, setTickets] = useState<PortalTicket[]>([]);
  const [ticketForm, setTicketForm] = useState({ subject: "", message: "" });
  const [ticketBusy, setTicketBusy] = useState(false);
  const [ticketMsg, setTicketMsg] = useState("");
  const [openTicket, setOpenTicket] = useState<{ id: number; code: string; subject: string; status: string; replies: AdminTicketReply[] } | null>(null);
  const [replyText, setReplyText] = useState("");

  async function load() {
    const [b, w, t] = await Promise.all([portalBoxes(), portalWarranties(), portalTickets()]);
    setBoxes(b.boxes); setOutgoing(b.outgoing); setWarranties(w.warranties); setTickets(t.tickets);
    setSelected(current => current.filter(id => b.boxes.some(box => box.id === id)));
  }

  useEffect(() => {
    portalMe().then(r => {
      setUser(r.user);
      if (r.user) setProfile({
        firstName: r.user.firstName ?? "", lastName: r.user.lastName ?? "",
        country: r.user.country ?? "", city: r.user.city ?? "", job: r.user.job ?? "",
      });
    }).catch(() => setUser(null)).finally(() => setChecked(true));
  }, []);
  useEffect(() => {
    if (user) Promise.resolve().then(load).catch(ex => setError(ex instanceof Error ? ex.message : "Could not load your account."));
  }, [user]);

  const list = serials.split(/[\s,;]+/).map(x => x.trim()).filter(Boolean);

  async function transfer(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setDone("");
    try {
      const result = await portalTransfer({ serials: list, toPhone, toName: toName || null, note: note || null });
      setDone(`${result.transfers.length} box(es) transferred to ${who(result.toHolder, result.toPhone)} · Transfer ${result.batchId}`);
      setSerials(""); setNote(""); setSelected([]);
      await load();
    } catch (ex) { setError(ex instanceof Error ? ex.message : "Transfer failed."); }
    finally { setBusy(false); }
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault(); setProfileBusy(true); setProfileMsg("");
    try {
      const updated = await portalProfile(profile);
      setUser(updated); setProfileMsg("Profile saved.");
    } catch (ex) { setProfileMsg(ex instanceof Error ? ex.message : "Could not save your profile."); }
    finally { setProfileBusy(false); }
  }

  async function startBind(channel: PortalChannel) {
    setBindChannel(channel); setBindBusy(true); setBindMsg(""); setBindChallenge(null);
    try {
      const r = await portalBind(channel, bindIdentifier.trim());
      setBindChallenge({ challengeId: r.challengeId }); setBindCode("");
      setBindMsg(`A 6-digit code was sent to ${bindIdentifier.trim()}.`);
    } catch (ex) { setBindMsg(ex instanceof Error ? ex.message : "Could not send the code."); }
    finally { setBindBusy(false); }
  }

  async function verifyBind(event: FormEvent) {
    event.preventDefault();
    if (!bindChallenge) return;
    setBindBusy(true); setBindMsg("");
    try {
      const updated = await portalBindVerify(bindChannel, bindChallenge.challengeId, bindCode);
      setUser(updated); setBindChallenge(null); setBindIdentifier(""); setBindCode("");
      setBindMsg(bindChannel === "sms" ? "Mobile verified." : "Email verified.");
      if (bindChannel === "sms") await load().catch(() => undefined);
    } catch (ex) { setBindMsg(ex instanceof Error ? ex.message : "Verification failed."); }
    finally { setBindBusy(false); }
  }

  async function createTicket(event: FormEvent) {
    event.preventDefault(); setTicketBusy(true); setTicketMsg("");
    try {
      const r = await portalCreateTicket(ticketForm.subject.trim(), ticketForm.message.trim());
      setTicketForm({ subject: "", message: "" });
      setTicketMsg(`Ticket ${r.ticket.code} was created. Our staff will reply here.`);
      await load();
      const d = await portalTicketDetail(r.ticket.id);
      setOpenTicket({ id: d.ticket.id, code: d.ticket.code, subject: d.ticket.subject, status: d.ticket.status, replies: d.replies });
    } catch (ex) { setTicketMsg(ex instanceof Error ? ex.message : "Could not create the ticket."); }
    finally { setTicketBusy(false); }
  }

  async function showTicket(id: number) {
    setTicketMsg(""); setReplyText("");
    try {
      const d = await portalTicketDetail(id);
      setOpenTicket({ id: d.ticket.id, code: d.ticket.code, subject: d.ticket.subject, status: d.ticket.status, replies: d.replies });
    } catch (ex) { setTicketMsg(ex instanceof Error ? ex.message : "Could not load the ticket."); }
  }

  async function sendReply(event: FormEvent) {
    event.preventDefault();
    if (!openTicket || !replyText.trim()) return;
    setTicketBusy(true); setTicketMsg("");
    try {
      await portalTicketReply(openTicket.id, replyText.trim());
      setReplyText("");
      await showTicket(openTicket.id);
      await load();
    } catch (ex) { setTicketMsg(ex instanceof Error ? ex.message : "Could not send the reply."); }
    finally { setTicketBusy(false); }
  }

  async function logout() {
    await portalLogout().catch(() => undefined);
    setUser(null); setBoxes([]); setOutgoing([]); setWarranties([]); setTickets([]); setOpenTicket(null);
  }

  return <div className={styles.page}>
    <header><Link href="/">SOLAR<span>ZED</span></Link><small>MY ACCOUNT</small></header>
    <main className={`${styles.card} ${own.stack}`}>
      <span className={styles.eyebrow}>PROFILE · BOXES · TRANSFERS · WARRANTIES · SUPPORT</span>
      {!checked ? <p>Loading…</p> : !user ? <>
        <h1>Sign in</h1>
        <PortalSignIn onSignedIn={setUser} intro="Representatives and shops: sign in with the mobile number Solarzed sent your cartons to, or with your email address. Customers: sign in to see your warranties." />
      </> : <>
        <div className={own.head}><h1>Signed in as <span dir="ltr">{display(user)}</span></h1><button type="button" className={own.ghost} onClick={logout}>Sign out</button></div>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        {done && <p role="status" className={own.notice}>{done}</p>}

        <section>
          <h2>Your profile</h2>
          <p>Tell us who you are. Support sees your name and mobile with every ticket, and your country and city help us serve you better.</p>
          <form onSubmit={saveProfile} className={own.form}>
            <div className={styles.grid}>
              <label>First name<input maxLength={100} value={profile.firstName} onChange={e => setProfile({ ...profile, firstName: e.target.value })} /></label>
              <label>Last name<input maxLength={100} value={profile.lastName} onChange={e => setProfile({ ...profile, lastName: e.target.value })} /></label>
              <label>Country<input maxLength={100} value={profile.country} onChange={e => setProfile({ ...profile, country: e.target.value })} /></label>
              <label>City<input maxLength={100} value={profile.city} onChange={e => setProfile({ ...profile, city: e.target.value })} /></label>
              <label>Job / business<input maxLength={100} placeholder="e.g. shop, installer, driver" value={profile.job} onChange={e => setProfile({ ...profile, job: e.target.value })} /></label>
            </div>
            <button className={styles.button} disabled={profileBusy}>{profileBusy ? "Saving…" : "Save profile"}</button>
            {profileMsg && <p role="status" className={own.notice}>{profileMsg}</p>}
          </form>
          <p className={own.notice}>
            Mobile: <b dir="ltr">{user.phone ?? "not set"}</b> · Email: <b dir="ltr">{user.email ?? "not set"}</b>
          </p>
          {(!user.phone || !user.email) && <div className={own.form}>
            {user.phone
              ? <p>Add your email to sign in without SMS.</p>
              : <p>Add your verified mobile to receive cartons and activate warranty cards: carton hand-over and card activation work with mobile numbers.</p>}
            {!bindChallenge && <>
              <div className={styles.grid}>
                {!user.phone && <label>Mobile number<input type="tel" dir="ltr" maxLength={20} placeholder="09…" value={bindChannel === "sms" ? bindIdentifier : ""} onChange={e => { setBindChannel("sms"); setBindIdentifier(e.target.value); }} /></label>}
                {!user.email && <label>Email address<input type="email" dir="ltr" maxLength={254} placeholder="you@example.com" value={bindChannel === "email" ? bindIdentifier : ""} onChange={e => { setBindChannel("email"); setBindIdentifier(e.target.value); }} /></label>}
              </div>
              {!user.phone && <button type="button" className={styles.button} disabled={bindBusy || !bindIdentifier.trim() || bindChannel !== "sms"} onClick={() => startBind("sms")}>Verify mobile</button>}
              {!user.email && <button type="button" className={own.ghost} disabled={bindBusy || !bindIdentifier.trim() || bindChannel !== "email"} onClick={() => startBind("email")}>Verify email</button>}
            </>}
            {bindMsg && <p role={bindChallenge ? "status" : "alert"} className={own.notice}>{bindMsg}</p>}
            {bindChallenge && <form onSubmit={verifyBind} className={own.form}>
              <label>Verification code<input dir="ltr" inputMode="numeric" maxLength={6} pattern="[0-9]{6}" required value={bindCode} onChange={e => setBindCode(e.target.value.replace(/\D/g, "").slice(0, 6))} /></label>
              <button className={styles.button} disabled={bindBusy || bindCode.length !== 6}>{bindBusy ? "Verifying…" : "Confirm"}</button>
            </form>}
          </div>}
        </section>

        <section>
          <h2>Cartons in your account ({boxes.length})</h2>
          {boxes.length ? <div className={own.scroll}><table className={own.table}>
            <thead><tr><th>Select</th><th>Box serial</th><th>Product</th><th>Since</th></tr></thead>
            <tbody>{boxes.map(box => <tr key={box.id}>
              <td><input type="checkbox" aria-label={`Select ${box.id}`} checked={selected.includes(box.id)} onChange={event => setSelected(items => event.target.checked ? [...items, box.id] : items.filter(id => id !== box.id))} /></td>
              <td><code dir="ltr">{box.id}</code></td><td>{box.product} · {box.type.toUpperCase()}</td><td>{date(box.heldSince)}</td>
            </tr>)}</tbody>
          </table></div> : <p>No cartons are in your account. When Solarzed or another representative transfers cartons to your mobile, they appear here.</p>}
        </section>

        {boxes.length > 0 && <section>
          <h2>Pass cartons on</h2>
          <p>Scan the barcode on each carton (or type the serial), enter the next person&apos;s mobile and record the transfer. The cartons then appear in their account.</p>
          <form onSubmit={transfer} className={own.form}>
            <label>Box serials (one per line)<textarea dir="ltr" rows={4} required value={serials} onChange={event => setSerials(event.target.value)} placeholder="SZB-…" /></label>
            {selected.length > 0 && <button type="button" className={own.ghost} onClick={() => setSerials(selected.join("\n"))}>Use selected cartons ({selected.length})</button>}
            <div className={styles.grid}>
              <label>Receiver mobile<input type="tel" dir="ltr" required maxLength={20} value={toPhone} onChange={event => setToPhone(event.target.value)} placeholder="09…" /></label>
              <label>Receiver name (optional)<input maxLength={200} value={toName} onChange={event => setToName(event.target.value)} /></label>
            </div>
            <label>Note (optional)<input maxLength={500} value={note} onChange={event => setNote(event.target.value)} /></label>
            <button className={styles.button} disabled={busy || !list.length || !toPhone.trim()}>{busy ? "Working…" : `Transfer ${list.length} carton(s)`}</button>
          </form>
        </section>}

        {outgoing.length > 0 && <section>
          <h2>Cartons you passed on</h2>
          <div className={own.scroll}><table className={own.table}>
            <thead><tr><th>Date</th><th>Box serial</th><th>To</th><th>Note</th></tr></thead>
            <tbody>{outgoing.map(t => <tr key={t.id}><td>{date(t.at)}</td><td><code dir="ltr">{t.labelId}</code></td><td>{who(t.toHolder, t.toPhone)}</td><td>{t.note ?? "—"}</td></tr>)}</tbody>
          </table></div>
        </section>}

        <section>
          <h2>My warranties ({warranties.length})</h2>
          {warranties.length ? <div className={own.scroll}><table className={own.table}>
            <thead><tr><th>Warranty code</th><th>Vehicle</th><th>Status</th><th>Film warranty ends</th></tr></thead>
            <tbody>{warranties.map(w => <tr key={w.code}>
              <td><Link href={`/warranty?code=${encodeURIComponent(w.code)}`}><code dir="ltr">{w.code}</code></Link></td>
              <td>{w.make} {w.model} · {w.plate}</td><td>{w.statusLabel}</td><td>{w.coverage?.filmEnds ?? "—"}</td>
            </tr>)}</tbody>
          </table></div> : <p>{user.phone ? "No warranties yet. Scan the QR code on the warranty card inside your Solarzed box to activate one." : "No warranties yet. Add your verified mobile above, then scan the QR code on the warranty card inside your Solarzed box."}</p>}
          {user.phone
            ? <Link className={styles.button} href="/activate">Activate a warranty card</Link>
            : <p role="status" className={own.notice}>Warranty card activation needs a verified mobile number — add one above first.</p>}
        </section>

        <section>
          <h2>Support tickets</h2>
          <p>Open a ticket and our staff replies here. Every reply notification shows your mobile and name, so we always know who is asking.</p>
          <form onSubmit={createTicket} className={own.form}>
            <label>Subject<input maxLength={200} required value={ticketForm.subject} onChange={e => setTicketForm({ ...ticketForm, subject: e.target.value })} /></label>
            <label>Your question<textarea rows={3} maxLength={4000} required value={ticketForm.message} onChange={e => setTicketForm({ ...ticketForm, message: e.target.value })} /></label>
            <button className={styles.button} disabled={ticketBusy}>{ticketBusy ? "Sending…" : "Create ticket"}</button>
            {ticketMsg && <p role="status" className={own.notice}>{ticketMsg}</p>}
          </form>
          {tickets.length > 0 && <div className={own.scroll}><table className={own.table}>
            <thead><tr><th>Code</th><th>Subject</th><th>Status</th><th>Replies</th><th>Updated</th><th></th></tr></thead>
            <tbody>{tickets.map(t => <tr key={t.id}>
              <td><code dir="ltr">{t.code}</code></td><td>{t.subject}</td><td>{t.status}</td><td>{t.replies}</td><td>{stamp(t.updatedAt)}</td>
              <td><button type="button" className={own.ghost} onClick={() => showTicket(t.id)}>Open</button></td>
            </tr>)}</tbody>
          </table></div>}
          {openTicket && <article className={own.form} style={{ marginTop: 12 }}>
            <div className={own.head}>
              <h3>{openTicket.subject} · <code dir="ltr">{openTicket.code}</code></h3>
              <button type="button" className={own.ghost} onClick={() => setOpenTicket(null)}>Close conversation</button>
            </div>
            <div style={{ display: "grid", gap: 10, margin: "12px 0" }}>
              {openTicket.replies.map(r => (
                <div key={r.id} style={{
                  maxWidth: 620, padding: "10px 14px", borderRadius: 12,
                  background: r.author === "staff" ? "rgba(31,195,207,.08)" : "rgb(var(--sz-tint) / .04)",
                  border: `1px solid ${r.author === "staff" ? "rgba(31,195,207,.35)" : "rgb(var(--sz-tint) / .12)"}`,
                }}>
                  <b style={{ fontSize: 12 }}>{r.author === "staff" ? "Solarzed support" : "You"}</b>
                  <p style={{ margin: "6px 0", whiteSpace: "pre-wrap" }}>{r.message}</p>
                  <span style={{ fontSize: 11, opacity: .6 }}>{stamp(r.createdAt)}</span>
                </div>
              ))}
            </div>
            <form onSubmit={sendReply}>
              <label>Your reply<textarea rows={3} maxLength={4000} required value={replyText} onChange={e => setReplyText(e.target.value)} /></label>
              <button className={styles.button} disabled={ticketBusy || !replyText.trim()}>{ticketBusy ? "Sending…" : "Send reply"}</button>
            </form>
          </article>}
        </section>
      </>}
    </main><footer>© SOLARZED · <Link href="/warranty">Warranty lookup</Link> · <Link href="/coverage">Warranty policy</Link></footer>
  </div>;
}
