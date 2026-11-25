"use client";

import { useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import {
  portalBoxes, portalLogout, portalMe, portalTransfer, portalWarranties,
  portalProfile, portalBind, portalBindVerify, portalTickets, portalCreateTicket, portalTicketDetail, portalTicketReply,
  BoxTransfer, HeldBox, PortalUser, PortalChannel, PortalTicket, WarrantyPublic, type AdminTicketReply,
} from "@/lib/api";
import PortalSignIn, { EMAIL_VERIFICATION } from "@/components/PortalSignIn";
import SerialInput from "@/components/SerialInput";
import InstallerSection from "./InstallerSection";
import styles from "../activate/activate.module.css";
import own from "./account.module.css";

const date = (value: string | null) => value ? new Date(value).toLocaleDateString(undefined, { calendar: "gregory" }) : "—";
const stamp = (value: string) => new Date(value).toLocaleString(undefined, { calendar: "gregory" });
const who = (name: string | null, phone: string | null) => name && phone && name !== phone ? `${name} (${phone})` : name ?? phone ?? "Central warehouse";
const display = (user: PortalUser) => user.phone ?? user.email ?? "your account";

const TABS = [["profile", "Profile"], ["transfer", "Carton transfer"], ["warranty", "Warranty"], ["tickets", "Support tickets"]] as const;
type Tab = typeof TABS[number][0];
const tabFromHash = (): Tab => { const h = typeof window === "undefined" ? "" : window.location.hash.slice(1); return TABS.some(([id]) => id === h) ? h as Tab : "profile"; };

const SEEN_KEY = "sz-ticket-seen";
const TICKET_POLL_MS = 15_000;

const emptyProfile ={ firstName: "", lastName: "", country: "", city: "", job: "" };

export default function AccountPage() {
  const [user, setUser] = useState<PortalUser | null>(null);
  const [checked, setChecked] = useState(false);
  const [boxes, setBoxes] = useState<HeldBox[]>([]);
  const [outgoing, setOutgoing] = useState<BoxTransfer[]>([]);
  const [warranties, setWarranties] = useState<WarrantyPublic[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [list, setSerials] = useState<string[]>([]);
  const [toPhone, setToPhone] = useState("");
  const [toName, setToName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [tab, setTab] = useState<Tab>("profile");
  useEffect(() => {
    const sync = () => setTab(tabFromHash());
    sync(); window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const go = (next: Tab) => { setTab(next); history.replaceState(null, "", `#${next}`); };

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
  // How many messages of each ticket this browser has already shown, so new staff replies stand out.
  // Read lazily: the tickets tab renders only after sign-in is checked, so the server never renders this.
  const [seen, setSeen] = useState<Record<number, number>>(() => {
    try { return typeof window === "undefined" ? {} : JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}"); } catch { return {}; }
  });
  const markSeen = (id: number, count: number) => setSeen(current => {
    if (current[id] === count) return current;
    const next = { ...current, [id]: count };
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(next)); } catch { /* storage full or blocked */ }
    return next;
  });
  const unread = (t: PortalTicket) => {
    if (openTicket?.id === t.id) return 0;
    const last = seen[t.id];
    if (last == null) return t.status === "answered" ? 1 : 0;
    return Math.max(0, t.replies - last);
  };
  const unreadTotal = tickets.reduce((sum, t) => sum + (unread(t) > 0 ? 1 : 0), 0);

  // Keep the ticket list and the open conversation live: a staff reply shows up without a page reload.
  useEffect(() => {
    if (!user) return;
    let live = true;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const [t, d] = await Promise.all([portalTickets(), openTicket ? portalTicketDetail(openTicket.id) : Promise.resolve(null)]);
        if (!live) return;
        setTickets(t.tickets);
        if (d) {
          setOpenTicket(current => current && current.id === d.ticket.id
            ? { ...current, status: d.ticket.status, replies: d.replies } : current);
          markSeen(d.ticket.id, d.replies.length);
        }
      } catch { /* transient: try again on the next tick */ }
    };
    const timer = window.setInterval(tick, TICKET_POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => { live = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [user, openTicket?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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


  async function transfer(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setDone("");
    try {
      const result = await portalTransfer({ serials: list, toPhone, toName: toName || null, note: note || null });
      setDone(`${result.transfers.length} roll(s) transferred to ${who(result.toHolder, result.toPhone)} · Transfer ${result.batchId}${result.sms === "sent" ? " · The receiver was notified by SMS." : ""}`);
      setSerials([]); setNote(""); setSelected([]);
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
      markSeen(d.ticket.id, d.replies.length);
    } catch (ex) { setTicketMsg(ex instanceof Error ? ex.message : "Could not create the ticket."); }
    finally { setTicketBusy(false); }
  }

  async function showTicket(id: number) {
    setTicketMsg(""); setReplyText("");
    try {
      const d = await portalTicketDetail(id);
      setOpenTicket({ id: d.ticket.id, code: d.ticket.code, subject: d.ticket.subject, status: d.ticket.status, replies: d.replies });
      markSeen(d.ticket.id, d.replies.length);
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
      <span className={styles.eyebrow}>PARTNER &amp; CUSTOMER ACCOUNT</span>
      {!checked ? <p>Loading…</p> : !user ? <>
        <h1>Sign in</h1>
        <PortalSignIn onSignedIn={setUser} intro={`Representatives and shops: sign in with the mobile number Solarzed sent your cartons to${EMAIL_VERIFICATION ? ", or with your email address" : ""}. Customers: sign in to see your warranties.`} />
      </> : <>
        <div className={own.head}><h1>Signed in as <span dir="ltr">{display(user)}</span></h1><button type="button" className={own.ghost} onClick={logout}>Sign out</button></div>
        {error && <p role="alert" className={styles.error}>{error}</p>}

        <nav className={own.tabs} role="tablist" aria-label="Account sections">
          {TABS.map(([id, label]) => <button key={id} type="button" role="tab" id={`tab-${id}`} aria-controls={`panel-${id}`} aria-selected={tab === id} className={own.tab} onClick={() => go(id)}>
            {label}{id === "transfer" && boxes.length > 0 && ` (${boxes.length})`}{id === "tickets" && (unreadTotal > 0 ? ` (${unreadTotal} new)` : tickets.length > 0 && ` (${tickets.length})`)}
          </button>)}
        </nav>

        {tab === "profile" && <div role="tabpanel" id="panel-profile" aria-labelledby="tab-profile">
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
            Mobile (rolls are transferred to this number): <b dir="ltr">{user.phone ?? "not set"}</b> · Email: <b dir="ltr">{user.email ?? "not set"}</b>
          </p>
          {(!user.phone || (EMAIL_VERIFICATION && !user.email)) && <div className={own.form}>
            {user.phone
              ? <p>Add your email to sign in without SMS.</p>
              : <p>Add your verified mobile to receive cartons and activate warranty cards: carton hand-over and card activation work with mobile numbers.</p>}
            {!bindChallenge && <>
              <div className={styles.grid}>
                {!user.phone && <label>Mobile number<input type="tel" dir="ltr" maxLength={20} placeholder="09…" value={bindChannel === "sms" ? bindIdentifier : ""} onChange={e => { setBindChannel("sms"); setBindIdentifier(e.target.value); }} /></label>}
                {EMAIL_VERIFICATION && !user.email && <label>Email address<input type="email" dir="ltr" maxLength={254} placeholder="you@example.com" value={bindChannel === "email" ? bindIdentifier : ""} onChange={e => { setBindChannel("email"); setBindIdentifier(e.target.value); }} /></label>}
              </div>
              {!user.phone && <button type="button" className={styles.button} disabled={bindBusy || !bindIdentifier.trim() || bindChannel !== "sms"} onClick={() => startBind("sms")}>Verify mobile</button>}
              {EMAIL_VERIFICATION && !user.email && <button type="button" className={own.ghost} disabled={bindBusy || !bindIdentifier.trim() || bindChannel !== "email"} onClick={() => startBind("email")}>Verify email</button>}
            </>}
            {bindMsg && <p role={bindChallenge ? "status" : "alert"} className={own.notice}>{bindMsg}</p>}
            {bindChallenge && <form onSubmit={verifyBind} className={own.form}>
              <label>Verification code<input dir="ltr" inputMode="numeric" maxLength={6} pattern="[0-9]{6}" required value={bindCode} onChange={e => setBindCode(e.target.value.replace(/\D/g, "").slice(0, 6))} /></label>
              <button className={styles.button} disabled={bindBusy || bindCode.length !== 6}>{bindBusy ? "Verifying…" : "Confirm"}</button>
            </form>}
          </div>}
        </section>

        <InstallerSection user={user} onUser={setUser} view="profile" />
        </div>}

        {tab === "transfer" && <div role="tabpanel" id="panel-transfer" aria-labelledby="tab-transfer">
        {done && <p role="status" className={own.notice}>{done}</p>}
        {!user.phone ? <section>
          <h2>Carton transfer</h2>
          <p role="status" className={own.notice}>Rolls are transferred by <b>ROLL NO</b> to a mobile number. Add and verify your mobile in your profile first: the company and other sellers send rolls to that number, and you receive them here.</p>
          <button type="button" className={styles.button} onClick={() => go("profile")}>Go to profile</button>
        </section> : <>
        <section>
          <h2>Rolls in your account ({boxes.length})</h2>
          <p>Rolls transferred to your mobile <b dir="ltr">{user.phone}</b> appear here.</p>
          {boxes.length ? <div className={own.scroll}><table className={own.table}>
            <thead><tr><th>Select</th><th>ROLL NO</th><th>Product</th><th>Since</th></tr></thead>
            <tbody>{boxes.map(box => <tr key={box.id}>
              <td><input type="checkbox" aria-label={`Select ${box.id}`} checked={selected.includes(box.id)} onChange={event => setSelected(items => event.target.checked ? [...items, box.id] : items.filter(id => id !== box.id))} /></td>
              <td><code dir="ltr">{box.id}</code></td><td>{box.product} · {box.type.toUpperCase()}</td><td>{date(box.heldSince)}</td>
            </tr>)}</tbody>
          </table></div> : <p>No rolls are in your account. When Solarzed or a seller transfers rolls to your mobile, they appear here.</p>}
        </section>

        {boxes.length > 0 && <section>
          <h2>Transfer rolls</h2>
          <p>Scan or type the <b>ROLL NO</b> of each carton and enter the receiver&apos;s mobile — the number they registered in their Solarzed profile. The rolls then appear in their account.</p>
          <form onSubmit={transfer} className={own.form}>
            <SerialInput lang="en" label="ROLL NOs (scan, type or upload Excel)" value={list} onChange={setSerials} />
            {selected.length > 0 && <button type="button" className={own.ghost} onClick={() => setSerials([...new Set([...list, ...selected])])}>Use selected rolls ({selected.length})</button>}
            <div className={styles.grid}>
              <label>Receiver mobile<input type="tel" dir="ltr" required maxLength={20} value={toPhone} onChange={event => setToPhone(event.target.value)} placeholder="09…" /></label>
              <label>Receiver name (optional)<input maxLength={200} value={toName} onChange={event => setToName(event.target.value)} /></label>
            </div>
            <label>Note (optional)<input maxLength={500} value={note} onChange={event => setNote(event.target.value)} /></label>
            <button className={styles.button} disabled={busy || !list.length || !toPhone.trim()}>{busy ? "Working…" : `Transfer ${list.length} roll(s)`}</button>
          </form>
        </section>}

        {outgoing.length > 0 && <section>
          <h2>Rolls you transferred</h2>
          <div className={own.scroll}><table className={own.table}>
            <thead><tr><th>Date</th><th>ROLL NO</th><th>To</th><th>Note</th></tr></thead>
            <tbody>{outgoing.map(t => <tr key={t.id}><td>{date(t.at)}</td><td><code dir="ltr">{t.labelId}</code></td><td>{who(t.toHolder, t.toPhone)}</td><td>{t.note ?? "—"}</td></tr>)}</tbody>
          </table></div>
        </section>}
        </>}
        </div>}

        {tab === "warranty" && <div role="tabpanel" id="panel-warranty" aria-labelledby="tab-warranty">
        <InstallerSection user={user} onUser={setUser} view="warranty" />

        <section>
          <h2>My warranties ({warranties.length})</h2>
          {warranties.length ? <div className={own.scroll}><table className={own.table}>
            <thead><tr><th>Warranty code</th><th>Vehicle</th><th>Status</th><th>Film warranty ends</th></tr></thead>
            <tbody>{warranties.map(w => <tr key={w.code}>
              <td><Link href={`/warranty?code=${encodeURIComponent(w.code)}`}><code dir="ltr">{w.code}</code></Link></td>
              <td>{w.make} {w.model} · {w.plate}{w.usedLengthM != null && <small> · {w.usedLengthM} m</small>}</td><td>{w.statusLabel}</td><td>{w.coverage?.filmEnds ?? "—"}</td>
            </tr>)}</tbody>
          </table></div> : <p>{user.phone ? "No warranties yet. Scan the QR code on the warranty card inside your Solarzed box to activate one." : "No warranties yet. Add your verified mobile in your profile, then scan the QR code on the warranty card inside your Solarzed box."}</p>}
          {user.phone
            ? <Link className={styles.button} href="/activate">Activate a warranty card</Link>
            : <p role="status" className={own.notice}>Warranty card activation needs a verified mobile number — add one in your profile first.</p>}
        </section>
        </div>}

        {tab === "tickets" && <div role="tabpanel" id="panel-tickets" aria-labelledby="tab-tickets">
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
              <td><code dir="ltr">{t.code}</code></td><td>{t.subject}{unread(t) > 0 && <b className={own.newBadge}> New reply</b>}</td><td>{t.status}</td><td>{t.replies}</td><td>{stamp(t.updatedAt)}</td>
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
        </div>}
      </>}
    </main><footer>© SOLARZED · <Link href="/warranty">Warranty lookup</Link> · <Link href="/coverage">Warranty policy</Link></footer>
  </div>;
}
