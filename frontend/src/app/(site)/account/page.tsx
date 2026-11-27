"use client";

import { useCallback, useEffect, useState, FormEvent, type ReactNode } from "react";
import Link from "next/link";
import VehicleCoverage, { byVehicle } from "@/components/VehicleCoverage";
import InstallationPhotos from "@/components/InstallationPhotos";
import {
  portalBoxes, portalLogout, portalMe, portalRecipient, portalTransfer, portalWarranties, portalInstallerWarranties,
  portalProfile, portalBind, portalBindVerify, portalTickets, portalCreateTicket, portalTicketDetail, portalTicketReply,
  BoxTransfer, HeldBox, InstallerWarranty, PortalUser, PortalChannel, PortalTicket, WarrantyPublic, type AdminTicketReply, type Recipient, type TicketDepartment,
} from "@/lib/api";
import PortalSignIn, { EMAIL_VERIFICATION } from "@/components/PortalSignIn";
import CountrySelect, { Flag } from "@/components/CountrySelect";
import PhoneInput from "@/components/PhoneInput";
import { citiesOf, countryFromText, countryOfPhone, findCountry, isValidMobile, toE164 } from "@/lib/countries";
import type { CountryCode } from "libphonenumber-js/mobile";
import ActivationFlow from "../activate/ActivationFlow";
import InstallerSection, { toCars } from "./InstallerSection";
import { Empty, ListToolbar, Pager, useListView } from "./ListTools";
import RollCards from "./RollCards";
import { LOCALES, formatDate, formatStamp, type T } from "@/lib/i18n";
import { useLang, useT } from "@/lib/i18n/client";
import styles from "../activate/activate.module.css";
import own from "./account.module.css";
import { backdropProps } from "@/components/backdrop";

const who = (t: T, name: string | null, phone: string | null) => name && phone && name !== phone ? `${name} (${phone})` : name ?? phone ?? t("Central warehouse");
const fullName = (user: PortalUser) => [user.firstName, user.lastName].filter(Boolean).join(" ") || user.name || null;
const initials = (user: PortalUser) => {
  const name = fullName(user);
  if (name) return name.split(/\s+/).slice(0, 2).map(p => p[0]).join("").toUpperCase();
  return (user.phone ?? user.email ?? "?").slice(-2);
};

const ICONS: Record<string, string> = {
  overview: "M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-16v5h6V4h-6Z",
  profile: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0",
  transfer: "M4 8h13l-3-3m6 11H7l3 3",
  rolls: "M4 7.5 12 4l8 3.5v9L12 20l-8-3.5v-9Zm0 0L12 11l8-3.5M12 11v9",
  warranty: "M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Zm-3 9 2 2 4-4",
  register: "M4 7V5a1 1 0 0 1 1-1h2m10 0h2a1 1 0 0 1 1 1v2m0 10v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2m4-5h8",
  installations: "M5 16l1.5-5A2 2 0 0 1 8.4 9.5h7.2a2 2 0 0 1 1.9 1.5L19 16M4 16h16v3H4zM7 19v1m10-1v1",
  tickets: "M4 5h16v11H8l-4 4V5Zm4 5h8m-8 3h5",
};
const Icon = ({ name }: { name: string }) => <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18"><path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d={ICONS[name]} /></svg>;

type Tab = "overview" | "profile" | "rolls" | "transfer" | "warranty" | "register" | "installations" | "tickets";
const ALL_TABS: Tab[] = ["overview", "profile", "rolls", "transfer", "warranty", "register", "installations", "tickets"];
const tabFromHash = (): Tab => { const h = typeof window === "undefined" ? "" : window.location.hash.slice(1); return (ALL_TABS as string[]).includes(h) ? h as Tab : "overview"; };

const SEEN_KEY = "sz-ticket-seen";
const TICKET_POLL_MS = 15_000;
const TICKET_STATUS = { open: "Waiting for support", answered: "Answered", closed: "Closed" } as const;
const TICKET_DEPARTMENTS = [["support", "Support"], ["sales", "Sales"]] as const;
const TICKET_FILTERS = [["open", "Waiting"], ["answered", "Answered"], ["closed", "Closed"]] as const;
const WARRANTY_FILTERS = [["active", "Active"], ["pending", "In review"], ["rejected", "Sent back"]] as const;
const WARRANTY_STATUS = { active: "Active", pending: "In review", rejected: "Sent back" } as const;

// country holds the ISO code picked in the country list; a free-text country saved before the list existed stays in countryText.
const emptyProfile = { firstName: "", lastName: "", company: "", country: "" as CountryCode | "", countryText: "", city: "", job: "" };

const warrantyText = (w: WarrantyPublic) => [w.make, w.model, w.plate, w.filmSerial, w.invoiceNumber].join(" ");
const warrantyStatus = (w: WarrantyPublic) => w.status;
const ticketText = (t: PortalTicket) => `${t.code} ${t.subject}`;
const ticketStatus = (t: PortalTicket) => t.status;
const boxText = (b: HeldBox) => `${b.id} ${b.product} ${b.productName ?? ""} ${b.type}`;
const EMAIL_RX = /^[^@\s]{1,64}@[^@\s]{1,190}\.[A-Za-z]{2,63}$/;
// What a roll is, in one short line each: size, warranty years and film specs.
const rollSize = (b: HeldBox) => [b.widthCm != null ? `${b.widthCm} cm` : null, b.lengthM != null ? `${b.lengthM} m` : null].filter(Boolean).join(" × ") || "—";
const rollSpecs = (b: HeldBox) => [b.vlt != null && `VLT ${b.vlt}%`, b.tser != null && `TSER ${b.tser}%`, b.uv != null && `UV ${b.uv}%`,
  b.irr != null && `IRR ${b.irr}%`, b.thicknessMil != null && `${b.thicknessMil} mil`].filter(Boolean).join(" · ") || "—";
const rollYears = (t: T, b: HeldBox) => [b.filmYears ? t("Film {n} yr", { n: b.filmYears }) : null, b.installYears ? t("Install {n} yr", { n: b.installYears }) : null]
  .filter(Boolean).join(" · ") || "—";
const boxType = (b: HeldBox) => b.type;
const outText = (t: BoxTransfer) => `${t.labelId} ${t.toHolder ?? ""} ${t.toPhone ?? ""} ${t.note ?? ""}`;
const none = () => null;

export default function AccountPage() {
  const t = useT();
  const lang = useLang();
  const date = (value: string | null) => formatDate(lang, value);
  const stamp = (value: string) => formatStamp(lang, value);
  const warrantyFilters = WARRANTY_FILTERS.map(([id, label]) => [id, t(label)] as const);
  const ticketFilters = TICKET_FILTERS.map(([id, label]) => [id, t(label)] as const);
  const [user, setUser] = useState<PortalUser | null>(null);
  const [checked, setChecked] = useState(false);
  const [boxes, setBoxes] = useState<HeldBox[]>([]);
  const [outgoing, setOutgoing] = useState<BoxTransfer[]>([]);
  const [usedBoxes, setUsedBoxes] = useState<HeldBox[]>([]);
  const [warranties, setWarranties] = useState<WarrantyPublic[]>([]);
  const [installs, setInstalls] = useState<InstallerWarranty[]>([]);
  const [list, setSerials] = useState<string[]>([]);
  const [toPhone, setToPhone] = useState("");
  // The receiver's country defaults to the sender's own until another one is picked.
  const [toCountry, setToCountry] = useState<CountryCode | null>(null);
  const [toName, setToName] = useState("");
  // The receiver is found by mobile (with country code) or by the email on their account; their name then fills in.
  const [toBy, setToBy] = useState<"phone" | "email">("phone");
  const [toEmail, setToEmail] = useState("");
  // The lookup answer for one receiver; it no longer applies once the mobile or email changes.
  const [lookup, setLookup] = useState<{ key: string; recipient?: Recipient; error?: string } | null>(null);
  // Second step: the sender reviews the receiver and the rolls, then confirms (for this receiver only).
  const [confirmKey, setConfirmKey] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [menuOpen, setMenuOpen] = useState(false);
  // Customers activate an older card right inside the Warranties section.
  const [activating, setActivating] = useState(false);
  // The Serial Number an installer scanned before landing here (/account#register:SZ-…).
  const [registerCode, setRegisterCode] = useState("");
  const [registerKey, setRegisterKey] = useState(0);

  useEffect(() => {
    const sync = () => setTab(tabFromHash());
    sync(); window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const go = (next: Tab) => {
    setTab(next); setMenuOpen(false); history.replaceState(null, "", `#${next}`);
    if (next === "register") { setRegisterCode(""); setRegisterKey(k => k + 1); }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Profile (first/last name, country, city, job)
  const [profile, setProfile] = useState(emptyProfile);
  const [profileMsg, setProfileMsg] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);

  // Bind a new mobile or email with a verification code
  const [bindChannel, setBindChannel] = useState<PortalChannel>("sms");
  // The mobile's country follows the profile country until the user picks another one in front of the number.
  const [bindCountry, setBindCountry] = useState<CountryCode | null>(null);
  const phoneCountry: CountryCode = bindCountry ?? (profile.country || "IR");
  const receiverCountry: CountryCode = toCountry ?? countryOfPhone(user?.phone) ?? (profile.country || "IR");
  const [bindIdentifier, setBindIdentifier] = useState("");
  const [bindChallenge, setBindChallenge] = useState<{ challengeId: string } | null>(null);
  const [bindCode, setBindCode] = useState("");
  const [bindMsg, setBindMsg] = useState("");
  const [bindBusy, setBindBusy] = useState(false);

  // Support tickets
  const [tickets, setTickets] = useState<PortalTicket[]>([]);
  const [ticketForm, setTicketForm] = useState<{ subject: string; message: string; department: TicketDepartment }>({ subject: "", message: "", department: "support" });
  const [newTicket, setNewTicket] = useState(false);
  const [ticketBusy, setTicketBusy] = useState(false);
  const [ticketMsg, setTicketMsg] = useState("");
  const [openTicket, setOpenTicket] = useState<{ id: number; code: string; subject: string; status: string; department: TicketDepartment; createdAt: string; replies: AdminTicketReply[] } | null>(null);
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

  // Lists: search, filter chips and pages, so long lists stay easy to use.
  const sortedTickets = [...tickets].sort((a, b) => (unread(b) > 0 ? 1 : 0) - (unread(a) > 0 ? 1 : 0) || b.updatedAt.localeCompare(a.updatedAt));
  const ticketList = useListView(sortedTickets, ticketText, ticketStatus);
  const warrantyList = useListView(warranties, warrantyText, warrantyStatus);
  const boxList = useListView(boxes, boxText, boxType);
  const usedList = useListView(usedBoxes, boxText, boxType);
  const outList = useListView(outgoing, outText, none);

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

  const installer = user?.partner === "approved";
  const loadInstalls = useCallback(async () => {
    const r = await portalInstallerWarranties();
    setInstalls(r.warranties);
  }, []);

  // Fills the profile form from the account; the country defaults to the one the mobile number belongs to.
  function signedIn(u: PortalUser | null) {
    setUser(u);
    if (u) setProfile({
      firstName: u.firstName ?? "", lastName: u.lastName ?? "", company: u.shopName ?? "",
      country: countryFromText(u.country)?.code ?? countryOfPhone(u.phone) ?? "", countryText: u.country ?? "",
      city: u.city ?? "", job: u.job ?? "",
    });
  }

  async function load() {
    const [b, w, t] = await Promise.all([portalBoxes(), portalWarranties(), portalTickets()]);
    setBoxes(b.boxes); setOutgoing(b.outgoing); setUsedBoxes(b.used ?? []); setWarranties(w.warranties); setTickets(t.tickets);
  }

  useEffect(() => {
    // An installer scanning a card from a phone lands on /account#register:SERIAL and stays in the dashboard.
    const h = decodeURIComponent(window.location.hash.slice(1));
    portalMe().then(r => {
      if (h.startsWith("register:")) { setRegisterCode(h.slice(9).trim().toUpperCase()); history.replaceState(null, "", "#register"); setTab("register"); }
      signedIn(r.user);
    }).catch(() => setUser(null)).finally(() => setChecked(true));
  }, []);
  useEffect(() => {
    if (user) Promise.resolve().then(load).catch(ex => setError(ex instanceof Error ? t(ex.message) : t("Could not load your account.")));
  }, [user, t]);
  useEffect(() => {
    if (installer) void Promise.resolve().then(loadInstalls).catch(() => undefined);
  }, [installer, loadInstalls]);

  const receiverReady = toBy === "phone" ? isValidMobile(toPhone, receiverCountry) : EMAIL_RX.test(toEmail.trim());
  const receiverKey = !user?.phone ? "" : toBy === "phone" ? (receiverReady ? toE164(toPhone, receiverCountry) : "") : (receiverReady ? toEmail.trim().toLowerCase() : "");
  useEffect(() => {
    if (!receiverKey) return;
    let live = true;
    const timer = window.setTimeout(async () => {
      try {
        const r = await portalRecipient(toBy === "phone" ? { phone: receiverKey } : { email: receiverKey });
        if (!live) return;
        setLookup({ key: receiverKey, recipient: r });
        if (r.name || r.shopName) setToName(r.name ?? r.shopName ?? "");
      } catch (ex) { if (live) setLookup({ key: receiverKey, error: ex instanceof Error ? t(ex.message) : t("Could not find this receiver.") }); }
    }, 400);
    return () => { live = false; window.clearTimeout(timer); };
  }, [receiverKey, toBy, t]);
  const lookedUp = receiverKey && lookup?.key === receiverKey ? lookup : null;
  const recipient = lookedUp?.recipient ?? null;
  const lookupMsg = lookedUp?.error ?? "";
  const looking = !!receiverKey && !lookedUp;
  const confirming = !!recipient && confirmKey === receiverKey;
  const setConfirming = (on: boolean) => setConfirmKey(on ? receiverKey : "");
  const receiverName = recipient?.name ?? recipient?.shopName ?? (toName.trim() || null);
  const chosenRolls = list.map(id => boxes.find(b => b.id === id) ?? null);
  // Ticking a roll in the list puts it straight into the transfer; scanned or typed ROLL NOs show up ticked.
  const toggleRoll = (id: string) => setSerials(items => items.includes(id) ? items.filter(x => x !== id) : [...items, id]);
  const pageRolls = boxList.rows.filter(b => !b.void).map(b => b.id);

  function review(event: FormEvent) {
    event.preventDefault(); setError(""); setDone("");
    if (recipient) setConfirming(true);
  }

  async function transfer() {
    setBusy(true); setError(""); setDone("");
    try {
      const result = await portalTransfer({ serials: list, ...(toBy === "phone" ? { toPhone: toE164(toPhone, receiverCountry) } : { toEmail: toEmail.trim() }),
        toName: toName || null, note: note || null });
      setDone(t("{n} roll(s) transferred to {to} · Transfer {batch}", { n: result.transfers.length, to: who(t, result.toHolder, result.toPhone), batch: result.batchId }) + (result.sms === "sent" ? " · " + t("The receiver was notified by SMS.") : ""));
      setSerials([]); setNote(""); setConfirming(false);
      setToPhone(""); setToEmail(""); setToName("");
      await load();
    } catch (ex) { setError(ex instanceof Error ? t(ex.message) : t("Transfer failed.")); }
    finally { setBusy(false); }
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault(); setProfileBusy(true); setProfileMsg("");
    try {
      const { countryText, company, ...rest } = profile;
      const updated = await portalProfile({ ...rest, ...(user?.shopName ? { company } : {}), country: findCountry(profile.country)?.names.en ?? countryText });
      setUser(updated); setProfileMsg(t("Profile saved."));
    } catch (ex) { setProfileMsg(ex instanceof Error ? t(ex.message) : t("Could not save your profile.")); }
    finally { setProfileBusy(false); }
  }

  async function startBind(channel: PortalChannel) {
    setBindChannel(channel); setBindBusy(true); setBindMsg(""); setBindChallenge(null);
    try {
      const to = channel === "sms" ? toE164(bindIdentifier, phoneCountry) : bindIdentifier.trim();
      const r = await portalBind(channel, to);
      setBindChallenge({ challengeId: r.challengeId }); setBindCode("");
      setBindMsg(t("A 6-digit code was sent to {to}.", { to }));
    } catch (ex) { setBindMsg(ex instanceof Error ? t(ex.message) : t("Could not send the code.")); }
    finally { setBindBusy(false); }
  }

  async function verifyBind(event: FormEvent) {
    event.preventDefault();
    if (!bindChallenge) return;
    setBindBusy(true); setBindMsg("");
    try {
      const updated = await portalBindVerify(bindChannel, bindChallenge.challengeId, bindCode);
      setUser(updated); setBindChallenge(null); setBindIdentifier(""); setBindCode("");
      setBindMsg(bindChannel === "sms" ? t("Mobile verified.") : t("Email verified."));
      if (bindChannel === "sms") await load().catch(() => undefined);
    } catch (ex) { setBindMsg(ex instanceof Error ? t(ex.message) : t("Verification failed.")); }
    finally { setBindBusy(false); }
  }

  async function showTicket(id: number) {
    setTicketMsg(""); setReplyText(""); setNewTicket(false);
    try {
      const d = await portalTicketDetail(id);
      setOpenTicket({ id: d.ticket.id, code: d.ticket.code, subject: d.ticket.subject, status: d.ticket.status, department: d.ticket.department, createdAt: d.ticket.createdAt, replies: d.replies });
      markSeen(d.ticket.id, d.replies.length);
    } catch (ex) { setTicketMsg(ex instanceof Error ? t(ex.message) : t("Could not load the ticket.")); }
  }

  async function createTicket(event: FormEvent) {
    event.preventDefault(); setTicketBusy(true); setTicketMsg("");
    try {
      const r = await portalCreateTicket(ticketForm.subject.trim(), ticketForm.message.trim(), ticketForm.department);
      setTicketForm({ subject: "", message: "", department: "support" });
      await load();
      await showTicket(r.ticket.id);
      setTicketMsg(t("Ticket {code} was created. Our staff will reply here.", { code: r.ticket.code }));
    } catch (ex) { setTicketMsg(ex instanceof Error ? t(ex.message) : t("Could not create the ticket.")); }
    finally { setTicketBusy(false); }
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
    } catch (ex) { setTicketMsg(ex instanceof Error ? t(ex.message) : t("Could not send the reply.")); }
    finally { setTicketBusy(false); }
  }

  async function logout() {
    await portalLogout().catch(() => undefined);
    setUser(null); setBoxes([]); setOutgoing([]); setWarranties([]); setTickets([]); setInstalls([]); setOpenTicket(null);
  }

  if (!checked || !user) return <div className={styles.page}>
    <header><Link href="/" aria-label={t("Solarzed home")}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/assets/solarzed-original.png" width={160} height={32} alt="SOLARZED" style={{ display: "block" }} /></Link><small>{t("MY ACCOUNT")}</small></header>
    <main className={`${styles.card} ${own.stack}`}>
      <span className={styles.eyebrow}>{t("PARTNER & CUSTOMER ACCOUNT")}</span>
      {!checked ? <p>{t("Loading…")}</p> : <>
        <h1>{t("Sign in")}</h1>
        <PortalSignIn onSignedIn={signedIn} intro={EMAIL_VERIFICATION ? t("Representatives and shops: sign in with the mobile number Solarzed sent your cartons to, or with your email address. Customers: sign in to see your warranties.") : t("Representatives and shops: sign in with the mobile number Solarzed sent your cartons to. Customers: sign in to see your warranties.")} />
      </>}
    </main><footer>© SOLARZED · <Link href="/warranty">{t("Warranty lookup")}</Link> · <Link href="/coverage">{t("Warranty policy")}</Link></footer>
  </div>;

  // Installations are counted per vehicle, the way the Installations section lists them.
  const cars = toCars(installs);
  const pendingInstalls = cars.filter(c => c.status !== "active").length;
  const rejectedInstalls = cars.filter(c => c.status === "rejected").length;
  const openTickets = tickets.filter(t => t.status !== "closed").length;
  const name = fullName(user);

  const menu: { id: Tab; label: string; count?: ReactNode; hot?: boolean }[] = [
    { id: "overview", label: t("Overview") },
    ...(installer ? [
      { id: "register" as Tab, label: t("Register installation") },
      { id: "installations" as Tab, label: t("Installations"), count: cars.length || undefined, hot: rejectedInstalls > 0 },
    ] : []),
    // Installers follow every warranty they registered under Installations, so they get no separate Warranties section.
    ...(installer ? [] : [{ id: "warranty" as Tab, label: t("Warranties"), count: warranties.length || undefined }]),
    { id: "rolls", label: t("Rolls"), count: boxes.length || undefined },
    { id: "transfer", label: t("Transfer rolls"), count: list.length || undefined },
    { id: "tickets", label: t("Support"), count: unreadTotal ? t("{n} new", { n: unreadTotal }) : openTickets || undefined, hot: unreadTotal > 0 },
    { id: "profile", label: t("Profile") },
  ];
  const current = menu.find(m => m.id === tab) ?? menu[0];
  const view: Tab = current.id;

  const stat = (id: Tab, label: string, value: number, hint: string, hot = false) =>
    <button type="button" className={`${own.stat} ${hot ? own.statHot : ""}`} onClick={() => go(id)}>
      <span className={own.statIcon}><Icon name={id} /></span>
      <b>{value.toLocaleString(LOCALES[lang])}</b><span>{label}</span><small>{hint}</small>
    </button>;

  // Every unused roll the account holds, with a checkbox to pick it for a transfer.
  const rollPicker = <>
              {boxes.length > 0 && <ListToolbar view={boxList} placeholder={t("Search ROLL NO or product…")} filters={[["tint", t("Window film")], ["ppf", "PPF"]] as const} />}
              {!boxes.length ? <Empty title={t("No rolls in your account")}><span>{t("When Solarzed or a seller transfers rolls to your mobile, they appear here.")}</span></Empty>
                : !boxList.matches.length ? <Empty title={t("Nothing matches your search")} /> : <>
                <RollCards rolls={boxList.rows} phone={user.phone ?? ""} selected={list} onToggle={toggleRoll}
                  onToggleAll={on => setSerials(items => on ? [...new Set([...items, ...pageRolls])] : items.filter(id => !pageRolls.includes(id)))} />
                <Pager page={boxList.page} pages={boxList.pages} setPage={boxList.setPage} shown={boxList.rows.length} matched={boxList.matches.length} />
              </>}
  </>;

  return <div className={`${styles.page} ${own.wide}`}>
    <header><Link href="/" aria-label={t("Solarzed home")}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/assets/solarzed-original.png" width={160} height={32} alt="SOLARZED" style={{ display: "block" }} /></Link><small>{t("MY ACCOUNT")}</small></header>
    <div className={own.shell}>
      <aside className={own.side}>
        <div className={own.me}>
          <span className={own.avatar} aria-hidden="true">{initials(user)}</span>
          <div>
            <b>{name ?? t("Welcome")}</b>
            <small dir="ltr">{user.phone ?? user.email}</small>
            {installer ? <span className={own.badge}>{t("Installer")} · {user.shopName}</span>
              : user.partner === "pending" ? <span className={own.badge}>{t("Installer application pending")}</span> : null}
          </div>
          <button type="button" className={own.menuToggle} aria-expanded={menuOpen} aria-controls="account-menu" onClick={() => setMenuOpen(o => !o)}>
            {current.label} <span aria-hidden="true">▾</span>
          </button>
        </div>
        <nav id="account-menu" className={`${own.nav} ${menuOpen ? own.navOpen : ""}`} aria-label={t("Account menu")}>
          {menu.map(m => <button key={m.id} type="button" className={own.navItem} aria-current={view === m.id ? "page" : undefined} onClick={() => go(m.id)}>
            <Icon name={m.id} /><span>{m.label}</span>{m.count != null && <em className={m.hot ? own.hot : undefined}>{m.count}</em>}
          </button>)}
          <button type="button" className={`${own.navItem} ${own.signOut}`} onClick={logout}>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18"><path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" /></svg>
            <span>{t("Sign out")}</span>
          </button>
        </nav>
      </aside>

      <main className={`${styles.card} ${own.content}`}>
        {error && <p role="alert" className={styles.error}>{error}</p>}

        {view === "overview" && <>
          <section>
            <span className={styles.eyebrow}>{t("DASHBOARD")}</span>
            <h1 className={own.title}>{name ? t("Hello, {name}", { name }) : t("Hello")}</h1>
            <p>{installer ? t("Register installations, follow the counter's review and pass rolls on — all from here.") : t("Your warranties, rolls and support conversations in one place.")}</p>
            {!user.phone && <p role="status" className={own.notice}>{t("Add and verify your mobile in your profile: rolls and warranty cards are registered to mobile numbers.")} <button type="button" className={styles.linkButton} onClick={() => go("profile")}>{t("Go to profile")}</button></p>}
            <div className={own.stats}>
              {installer && stat("installations", t("Installations"), cars.length, pendingInstalls ? t("{n} waiting or sent back", { n: pendingInstalls }) : t("all approved"), rejectedInstalls > 0)}
              {!installer && stat("warranty", t("Warranties"), warranties.length, t("{n} active", { n: warranties.filter(w => w.status === "active").length }))}
              {stat("rolls", t("Rolls in account"), boxes.length, outgoing.length ? t("{n} transferred out", { n: outgoing.length }) : t("ready to transfer"))}
              {stat("tickets", t("Support tickets"), tickets.length, unreadTotal ? t("{n} with a new reply", { n: unreadTotal }) : t("{n} open", { n: openTickets }), unreadTotal > 0)}
            </div>
          </section>
          <section>
            <h2>{t("Quick actions")}</h2>
            <div className={own.actions}>
              {installer && <button type="button" className={own.action} onClick={() => go("register")}><Icon name="register" /><b>{t("Register an installation")}</b><small>{t("Scan the Serial Number on the card")}</small></button>}
              {!installer && <button type="button" className={own.action} onClick={() => { setActivating(true); go("warranty"); }}><Icon name="warranty" /><b>{t("Activate a warranty card")}</b><small>{t("Type or scan the ROLL NO")}</small></button>}
              {boxes.length > 0 && <button type="button" className={own.action} onClick={() => go("transfer")}><Icon name="transfer" /><b>{t("Transfer rolls")}</b><small>{t("Send rolls to another mobile")}</small></button>}
              <button type="button" className={own.action} onClick={() => { go("tickets"); setOpenTicket(null); setNewTicket(true); }}><Icon name="tickets" /><b>{t("Ask support")}</b><small>{t("Open a new ticket")}</small></button>
            </div>
          </section>
          {unreadTotal > 0 && <section>
            <h2>{t("New replies from support")}</h2>
            <ul className={own.cards}>{sortedTickets.filter(x => unread(x) > 0).slice(0, 3).map(x => <li key={x.id} className={own.item}>
              <div className={own.itemMain}><b>{x.subject}</b><small><code dir="ltr">{x.code}</code> · {stamp(x.updatedAt)}</small></div>
              <div className={own.itemSide}><button type="button" className={own.ghost} onClick={() => { go("tickets"); void showTicket(x.id); }}>{t("Read reply")}</button></div>
            </li>)}</ul>
          </section>}
        </>}

        {view === "register" && installer && <section>
          <span className={styles.eyebrow}>{t("REGISTER INSTALLATION")}</span>
          <h1 className={own.title}>{t("Register a vehicle")}</h1>
          <ActivationFlow key={registerKey} user={user} checked onUser={setUser} initialCode={registerCode} embedded onDone={() => { void loadInstalls().catch(() => undefined); }} />
          <p className={own.muted}>{t("See every vehicle and the warranty of each roll under")} <button type="button" className={styles.linkButton} onClick={() => go("installations")}>{t("Installations")}</button></p>
        </section>}

        {view === "installations" && <InstallerSection user={user} onUser={setUser} view="installations" rows={installs} reload={loadInstalls} onRegister={() => go("register")} />}

        {view === "warranty" && <section>
          <div className={own.sectionHead}>
            <div><h2>{t("My warranties")}</h2><p>{t("Warranties registered to your mobile. Open one to see its gold card and coverage.")}</p></div>
            {user.phone && !installer && <button type="button" className={activating ? own.ghost : styles.button} onClick={() => setActivating(a => !a)}>{activating ? t("Close") : t("+ Activate a card")}</button>}
          </div>
          {activating && !installer && <div className={own.panel}><ActivationFlow user={user} checked onUser={setUser} embedded onDone={() => { void load().catch(() => undefined); }} /></div>}
          {!user.phone && <p role="status" className={own.notice}>{t("Warranty card activation needs a verified mobile number — add one in your profile first.")} <button type="button" className={styles.linkButton} onClick={() => go("profile")}>{t("Go to profile")}</button></p>}
          {warranties.length > 0 && <div className={own.vehicles}>
            <h3>{t("Coverage by vehicle")}</h3>
            {byVehicle(warranties).map(car => <VehicleCoverage key={car[0].ref} title={`${car[0].make} ${car[0].model} · ${car[0].plate} · VIN ${car[0].vinMasked}`}
              items={car.map(w => ({ ...w, film: `ROLL NO ${w.filmSerial}` }))} />)}
          </div>}
          {warranties.length > 0 && <ListToolbar view={warrantyList} placeholder={t("Search plate, vehicle, ROLL NO…")} filters={warrantyFilters} />}
          {!warranties.length ? <Empty title={t("No warranties yet")}>
            <span>{installer ? t("Warranties you register for customers are listed under Installations.") : t("Your installer registers the warranty for your mobile and you receive your gold card by SMS.")}</span>
          </Empty> : !warrantyList.matches.length ? <Empty title={t("Nothing matches your search")} /> : <>
            <ul className={own.cards}>{warrantyList.rows.map(w => <li key={w.ref} className={own.item}>
              <div className={own.itemMain}>
                <b>{w.make} {w.model} <span className={own.plate} dir="ltr">{w.plate}</span></b>
                <small>ROLL NO <code dir="ltr">{w.filmSerial}</code>{w.usedLengthM != null && ` · ${t("{n} m", { n: w.usedLengthM })}`}</small>
                <InstallationPhotos reference={w.ref} />
              </div>
              <div className={own.itemSide}>
                <span className={`${own.status} ${own[`s_${w.status}`]}`}>{t(WARRANTY_STATUS[w.status])}</span>
                <small>{t("Film warranty until {date}", { date: w.coverage?.filmEnds ?? "—" })}</small>
                {w.cardLink && <Link className={own.ghost} href={w.cardLink}>{t("View card")}</Link>}
              </div>
            </li>)}</ul>
            <Pager page={warrantyList.page} pages={warrantyList.pages} setPage={warrantyList.setPage} shown={warrantyList.rows.length} matched={warrantyList.matches.length} />
          </>}
        </section>}

        {(view === "rolls" || view === "transfer") && <>
          {done && view === "transfer" && <p role="status" className={own.notice}>{done}</p>}
          {!user.phone ? <section>
            <h2>{t("Rolls")}</h2>
            <p role="status" className={own.notice}>{t("Rolls are transferred by ROLL NO to a mobile number. Add and verify your mobile in your profile first: the company and other sellers send rolls to that number, and you receive them here.")}</p>
            <button type="button" className={styles.button} onClick={() => go("profile")}>{t("Go to profile")}</button>
          </section> : <>
            {view === "rolls" && <section>
              <h2>{t("Unused rolls in your account")}</h2>
              <p>{t("Every roll transferred to your mobile and not yet used on a vehicle. Open a roll to see all its details and meters left; tick rolls to transfer them.")} <b dir="ltr">{user.phone}</b></p>
              {rollPicker}
                {boxes.length > 0 && list.length > 0 && <div className={own.pickBar} role="status">
                  <b>{t("{n} roll(s) selected", { n: list.length })}</b>
                  <button type="button" className={own.ghost} onClick={() => setSerials([])}>{t("Clear")}</button>
                  <button type="button" className={styles.button} onClick={() => go("transfer")}>{t("Transfer selected")}</button>
                </div>}
            </section>}

            {view === "transfer" && (!boxes.length ? <section>
              <h2>{t("Transfer rolls")}</h2>
              <Empty title={t("No rolls in your account")}><span>{t("When Solarzed or a seller transfers rolls to your mobile, they appear here.")}</span></Empty>
            </section> : <section>
              <h2>{t("Transfer rolls")}</h2>
              {confirming && recipient && <div className={own.modal} role="dialog" aria-modal="true" aria-label={t("Are you sure you want to transfer these rolls?")}
                {...backdropProps(() => !busy && setConfirming(false))}>
                <div className={`${own.form} ${own.modalInner}`}>
                <h3>{t("Are you sure you want to transfer these rolls?")}</h3>
                <p>{t("To")}: <b>{receiverName ?? t("New account")}</b>{recipient.partner && <span className={own.badge}>{t("Partner")}</span>}
                  {recipient.phone && <> · <span dir="ltr">{recipient.phone}</span></>}{recipient.email && <> · <span dir="ltr">{recipient.email}</span></>}</p>
                {!recipient.registered && <p role="status" className={own.notice}>{t("No account has this mobile yet. The transfer creates one; the receiver signs in with this mobile to see the rolls.")}</p>}
                <div className={own.scroll}><table className={own.table}>
                  <thead><tr><th>ROLL NO</th><th>{t("Product")}</th><th>{t("Size")}</th><th>{t("Warranty")}</th><th>{t("Specs")}</th></tr></thead>
                  <tbody>{list.map((id, i) => { const b = chosenRolls[i]; return <tr key={id}>
                    <td><code dir="ltr">{id}</code></td>
                    {b ? <><td>{b.productName ?? b.product} · {b.type.toUpperCase()}</td><td dir="ltr">{rollSize(b)}</td><td>{rollYears(t, b)}</td><td dir="ltr"><small>{rollSpecs(b)}</small></td></>
                      : <td colSpan={4} className={own.muted}>{t("Not in your account")}</td>}
                  </tr>; })}</tbody>
                </table></div>
                {note && <p>{t("Note")}: {note}</p>}
                {error && <p role="alert" className={styles.error}>{error}</p>}
                <div className={own.chips}>
                  <button type="button" className={styles.button} disabled={busy} onClick={transfer}>{busy ? t("Working…") : t("Yes, transfer {n} roll(s)", { n: list.length })}</button>
                  <button type="button" className={own.ghost} disabled={busy} onClick={() => setConfirming(false)}>{t("Cancel")}</button>
                </div>
                </div>
              </div>}
              <p>{t("Tick the rolls you want to transfer, then enter the receiver's mobile (with country code) or email. Their name fills in automatically; you confirm on the next step.")}</p>
              {rollPicker}
              {list.length > 0 && <p className={own.muted}><b>{t("{n} roll(s) selected", { n: list.length })}</b> · <button type="button" className={styles.linkButton} onClick={() => setSerials([])}>{t("Clear")}</button></p>}
              <form onSubmit={review} className={own.form}>
                <div className={own.chips} role="radiogroup" aria-label={t("Find the receiver by")}>
                  {([["phone", t("Mobile")], ["email", t("Email")]] as const).map(([id, label]) =>
                    <button key={id} type="button" role="radio" aria-checked={toBy === id} className={toBy === id ? styles.button : own.ghost} onClick={() => setToBy(id)}>{label}</button>)}
                </div>
                <div className={styles.grid}>
                  {toBy === "phone"
                    ? <PhoneInput label={t("Receiver mobile")} country={receiverCountry} onCountry={setToCountry} value={toPhone} onChange={setToPhone} />
                    : <label>{t("Receiver email")}<input type="email" dir="ltr" maxLength={254} value={toEmail} onChange={event => setToEmail(event.target.value)} /></label>}
                  <label>{t("Receiver name")}<input maxLength={200} value={toName} readOnly={!!recipient?.name} onChange={event => setToName(event.target.value)} /></label>
                </div>
                {looking && <p className={own.muted}>{t("Looking up the receiver…")}</p>}
                {lookupMsg && <p role="alert" className={styles.error}>{lookupMsg}</p>}
                {recipient && (recipient.registered
                  ? <p role="status" className={own.notice}>{t("Receiver")}: <b>{receiverName ?? "—"}</b>{recipient.shopName && recipient.shopName !== receiverName && <> · {recipient.shopName}</>}{recipient.partner && <span className={own.badge}>{t("Partner")}</span>}{toBy === "email" && recipient.phone && <> · <span dir="ltr">{recipient.phone}</span></>}</p>
                  : <p role="status" className={own.notice}>{t("No account has this mobile yet. The transfer creates one; the receiver signs in with this mobile to see the rolls.")}</p>)}
                <label>{t("Note (optional)")}<input maxLength={500} value={note} onChange={event => setNote(event.target.value)} /></label>
                <button className={styles.button} disabled={busy || looking || !list.length || !receiverReady || !recipient}>{t("Continue")}</button>
              </form>
            </section>)}

            {view === "rolls" && usedBoxes.length > 0 && <section>
              <h2>{t("Rolls in use")}</h2>
              <p>{t("Rolls you started on vehicles. Open a roll to see the meters left and every vehicle and warranty it was used for.")}</p>
              <ListToolbar view={usedList} placeholder={t("Search ROLL NO or product…")} filters={[["tint", t("Window film")], ["ppf", "PPF"]] as const} />
              {!usedList.matches.length ? <Empty title={t("Nothing matches your search")} /> : <>
                <RollCards rolls={usedList.rows} phone={user.phone ?? ""} />
                <Pager page={usedList.page} pages={usedList.pages} setPage={usedList.setPage} shown={usedList.rows.length} matched={usedList.matches.length} />
              </>}
            </section>}

            {view === "rolls" && outgoing.length > 0 && <section>
              <h2>{t("Rolls you transferred")}</h2>
              <ListToolbar view={outList} placeholder={t("Search ROLL NO, receiver, note…")} />
              {!outList.matches.length ? <Empty title={t("Nothing matches your search")} /> : <>
                <div className={own.scroll}><table className={own.table}>
                  <thead><tr><th>{t("Date")}</th><th>ROLL NO</th><th>{t("To")}</th><th>{t("Note")}</th></tr></thead>
                  <tbody>{outList.rows.map(x => <tr key={x.id}><td>{date(x.at)}</td><td><code dir="ltr">{x.labelId}</code></td><td>{who(t, x.toHolder, x.toPhone)}</td><td>{x.note ?? "—"}</td></tr>)}</tbody>
                </table></div>
                <Pager page={outList.page} pages={outList.pages} setPage={outList.setPage} shown={outList.rows.length} matched={outList.matches.length} />
              </>}
            </section>}
          </>}
        </>}

        {view === "tickets" && <section>
          {openTicket ? <div className={own.thread}>
            <button type="button" className={styles.linkButton} onClick={() => { setOpenTicket(null); setTicketMsg(""); }}>{lang === "en" ? "←" : "→"} {t("All tickets")}</button>
            <div className={own.threadHead}>
              <div><h2>{openTicket.subject}</h2><small><code dir="ltr">{openTicket.code}</code> · {t(openTicket.department === "sales" ? "Sales" : "Support")} · {t("opened {date}", { date: stamp(openTicket.createdAt) })}</small></div>
              <span className={`${own.status} ${own[`t_${openTicket.status}`]}`}>{t(TICKET_STATUS[openTicket.status as keyof typeof TICKET_STATUS] ?? openTicket.status)}</span>
            </div>
            {ticketMsg && <p role="status" className={own.notice}>{ticketMsg}</p>}
            <ol className={own.messages}>
              {openTicket.replies.map(r => <li key={r.id} className={r.author === "staff" ? own.staff : own.mine}>
                <b>{r.author === "staff" ? t("Solarzed support") : t("You")}</b>
                <p>{r.message}</p>
                <time>{stamp(r.createdAt)}</time>
              </li>)}
            </ol>
            {openTicket.status === "closed"
              ? <p className={own.muted}>{t("This ticket is closed. Writing a reply opens it again.")}</p> : null}
            <form onSubmit={sendReply} className={own.form}>
              <label>{t("Your reply")}<textarea rows={3} maxLength={4000} required value={replyText} onChange={e => setReplyText(e.target.value)} /></label>
              <button className={styles.button} disabled={ticketBusy || !replyText.trim()}>{ticketBusy ? t("Sending…") : t("Send reply")}</button>
            </form>
          </div> : <>
            <div className={own.sectionHead}>
              <div><h2>{t("Support tickets")}</h2><p>{t("Ask us anything — our staff replies here and you see new replies straight away.")}</p></div>
              <button type="button" className={newTicket ? own.ghost : styles.button} onClick={() => { setNewTicket(n => !n); setTicketMsg(""); }}>{newTicket ? t("Cancel") : t("+ New ticket")}</button>
            </div>
            {ticketMsg && <p role="status" className={own.notice}>{ticketMsg}</p>}
            {newTicket && <form onSubmit={createTicket} className={`${own.form} ${own.panel}`}>
              <fieldset className={own.departments}>
                <legend>{t("Department")}</legend>
                {TICKET_DEPARTMENTS.map(([id, label]) => <label key={id}>
                  <input type="radio" name="ticket-department" value={id} checked={ticketForm.department === id} onChange={() => setTicketForm({ ...ticketForm, department: id })} />
                  {t(label)}
                </label>)}
              </fieldset>
              <label>{t("Subject")}<input maxLength={200} required value={ticketForm.subject} onChange={e => setTicketForm({ ...ticketForm, subject: e.target.value })} /></label>
              <label>{t("Your question")}<textarea rows={4} maxLength={4000} required value={ticketForm.message} onChange={e => setTicketForm({ ...ticketForm, message: e.target.value })} /></label>
              <button className={styles.button} disabled={ticketBusy}>{ticketBusy ? t("Sending…") : t("Create ticket")}</button>
            </form>}
            {tickets.length > 0 && <ListToolbar view={ticketList} placeholder={t("Search ticket code or subject…")} filters={ticketFilters} />}
            {!tickets.length ? <Empty title={t("No tickets yet")}><span>{t("Open a ticket whenever you need help — with a roll, a card or an installation.")}</span></Empty>
              : !ticketList.matches.length ? <Empty title={t("Nothing matches your search")} /> : <>
              <ul className={own.cards}>{ticketList.rows.map(x => <li key={x.id}>
                <button type="button" className={`${own.item} ${own.itemButton}`} onClick={() => showTicket(x.id)}>
                  <div className={own.itemMain}>
                    <b>{x.subject}{unread(x) > 0 && <span className={own.newBadge}>{t("New reply")}</span>}</b>
                    <small><code dir="ltr">{x.code}</code> · {t(x.department === "sales" ? "Sales" : "Support")} · {t(x.replies === 1 ? "{n} message" : "{n} messages", { n: x.replies })}</small>
                  </div>
                  <div className={own.itemSide}>
                    <span className={`${own.status} ${own[`t_${x.status}`]}`}>{t(TICKET_STATUS[x.status])}</span>
                    <small>{stamp(x.updatedAt)}</small>
                  </div>
                </button>
              </li>)}</ul>
              <Pager page={ticketList.page} pages={ticketList.pages} setPage={ticketList.setPage} shown={ticketList.rows.length} matched={ticketList.matches.length} />
            </>}
          </>}
        </section>}

        {view === "profile" && <>
          <section>
            <h2>{t("Your profile")}</h2>
            <p>{t("Tell us who you are. Support sees your name and mobile with every ticket, and your country and city help us serve you better.")}</p>
            <form onSubmit={saveProfile} className={own.form}>
              <div className={styles.grid}>
                <label>{t("First name")}<input maxLength={100} value={profile.firstName} onChange={e => setProfile({ ...profile, firstName: e.target.value })} /></label>
                <label>{t("Last name")}<input maxLength={100} value={profile.lastName} onChange={e => setProfile({ ...profile, lastName: e.target.value })} /></label>
                {user.shopName && <label>{t("Company")}<input required maxLength={200} value={profile.company} onChange={e => setProfile({ ...profile, company: e.target.value })} />
                  <small className={own.muted}>{t("Set by Solarzed for your partner account. You can correct it here.")}</small></label>}
                <div className={own.field}>
                  <span id="profile-country">{t("Country")}</span>
                  <CountrySelect id="profile-country-button" value={profile.country || null} label={t("Country")}
                    onChange={code => setProfile({ ...profile, country: code, countryText: "", city: code === profile.country ? profile.city : "" })} />
                </div>
                <label>{t("City")}<input maxLength={100} list="profile-cities" autoComplete="off" value={profile.city}
                  placeholder={profile.country ? t("Choose or type your city") : t("Choose a country first")}
                  onChange={e => setProfile({ ...profile, city: e.target.value })} />
                  <datalist id="profile-cities">{citiesOf(profile.country, lang).map(c => <option key={c} value={c} />)}</datalist></label>
                <label>{t("Job / business")}<input maxLength={100} placeholder={t("e.g. shop, installer, driver")} value={profile.job} onChange={e => setProfile({ ...profile, job: e.target.value })} /></label>
              </div>
              <button className={styles.button} disabled={profileBusy}>{profileBusy ? t("Saving…") : t("Save profile")}</button>
              {profileMsg && <p role="status" className={own.notice}>{profileMsg}</p>}
            </form>
          </section>
          <section>
            <h2>{t("Sign-in & contact")}</h2>
            <dl className={own.facts}>
              <dt>{t("Mobile")}</dt><dd dir="ltr" className={own.phoneFact}>{user.phone && countryOfPhone(user.phone) && <Flag code={countryOfPhone(user.phone)!} />}{user.phone ?? t("not set")}</dd>
              <dt>{t("Email")}</dt><dd dir="ltr">{user.email ?? t("not set")}</dd>
            </dl>
            <p className={own.muted}>{t("Rolls are transferred to your mobile and warranty cards are registered to it.")}</p>
            {(!user.phone || (EMAIL_VERIFICATION && !user.email)) && <div className={own.form}>
              {user.phone
                ? <p>{t("Add your email to sign in without SMS.")}</p>
                : <p>{t("Add your verified mobile to receive cartons and activate warranty cards: carton hand-over and card activation work with mobile numbers.")}</p>}
              {!bindChallenge && <>
                <div className={styles.grid}>
                  {!user.phone && <PhoneInput label={t("Mobile number")} country={phoneCountry} onCountry={code => { setBindCountry(code); setBindChannel("sms"); }}
                    value={bindChannel === "sms" ? bindIdentifier : ""} onChange={v => { setBindChannel("sms"); setBindIdentifier(v); }} />}
                  {EMAIL_VERIFICATION && !user.email && <label>{t("Email address")}<input type="email" dir="ltr" maxLength={254} placeholder="you@example.com" value={bindChannel === "email" ? bindIdentifier : ""} onChange={e => { setBindChannel("email"); setBindIdentifier(e.target.value); }} /></label>}
                </div>
                {!user.phone && <button type="button" className={styles.button} disabled={bindBusy || bindChannel !== "sms" || !isValidMobile(bindIdentifier, phoneCountry)} onClick={() => startBind("sms")}>{t("Verify mobile")}</button>}
                {EMAIL_VERIFICATION && !user.email && <button type="button" className={own.ghost} disabled={bindBusy || !bindIdentifier.trim() || bindChannel !== "email"} onClick={() => startBind("email")}>{t("Verify email")}</button>}
              </>}
              {bindMsg && <p role={bindChallenge ? "status" : "alert"} className={own.notice}>{bindMsg}</p>}
              {bindChallenge && <form onSubmit={verifyBind} className={own.form}>
                <label>{t("Verification code")}<input dir="ltr" inputMode="numeric" maxLength={6} pattern="[0-9]{6}" required value={bindCode} onChange={e => setBindCode(e.target.value.replace(/\D/g, "").slice(0, 6))} /></label>
                <button className={styles.button} disabled={bindBusy || bindCode.length !== 6}>{bindBusy ? t("Verifying…") : t("Confirm")}</button>
              </form>}
            </div>}
          </section>
          <InstallerSection user={user} onUser={setUser} view="profile" />
        </>}
      </main>
    </div>
    <footer>© SOLARZED · <Link href="/warranty">{t("Warranty lookup")}</Link> · <Link href="/coverage">{t("Warranty policy")}</Link></footer>
  </div>;
}
