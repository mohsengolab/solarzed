"use client";

import { useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import { portalBoxes, portalLogout, portalMe, portalTransfer, portalWarranties, BoxTransfer, HeldBox, PortalUser, WarrantyPublic } from "@/lib/api";
import PortalSignIn from "@/components/PortalSignIn";
import styles from "../activate/activate.module.css";
import own from "./account.module.css";

const date = (value: string | null) => value ? new Date(value).toLocaleDateString() : "—";
const who = (name: string | null, phone: string | null) => name && phone && name !== phone ? `${name} (${phone})` : name ?? phone ?? "Central warehouse";

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

  async function load() {
    const [b, w] = await Promise.all([portalBoxes(), portalWarranties()]);
    setBoxes(b.boxes); setOutgoing(b.outgoing); setWarranties(w.warranties);
    setSelected(current => current.filter(id => b.boxes.some(box => box.id === id)));
  }

  useEffect(() => {
    portalMe().then(r => setUser(r.user)).catch(() => setUser(null)).finally(() => setChecked(true));
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

  async function logout() {
    await portalLogout().catch(() => undefined);
    setUser(null); setBoxes([]); setOutgoing([]); setWarranties([]);
  }

  return <div className={styles.page}>
    <header><Link href="/">SOLAR<span>ZED</span></Link><small>MY ACCOUNT</small></header>
    <main className={`${styles.card} ${own.stack}`}>
      <span className={styles.eyebrow}>BOXES · TRANSFERS · WARRANTIES</span>
      {!checked ? <p>Loading…</p> : !user ? <>
        <h1>Sign in</h1>
        <PortalSignIn onSignedIn={setUser} intro="Representatives and shops: sign in with the mobile number Solarzed sent your cartons to. Customers: sign in to see your warranties." />
      </> : <>
        <div className={own.head}><h1>Signed in as <span dir="ltr">{user.phone}</span></h1><button type="button" className={own.ghost} onClick={logout}>Sign out</button></div>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        {done && <p role="status" className={own.notice}>{done}</p>}

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
          </table></div> : <p>No warranties yet. Scan the QR code on the warranty card inside your Solarzed box to activate one.</p>}
          <Link className={styles.button} href="/activate">Activate a warranty card</Link>
        </section>
      </>}
    </main><footer>© SOLARZED · <Link href="/warranty">Warranty lookup</Link> · <Link href="/coverage">Warranty policy</Link></footer>
  </div>;
}
