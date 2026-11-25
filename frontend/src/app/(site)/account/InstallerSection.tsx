"use client";

import { useState, FormEvent } from "react";
import { installerResendPhotos, portalApplyPartner, InstallerWarranty, PhotoSet, PortalUser } from "@/lib/api";
import PhotoPicker, { photosComplete } from "@/components/PhotoPicker";
import { Empty, ListToolbar, Pager, useListView } from "./ListTools";
import styles from "../activate/activate.module.css";
import own from "./account.module.css";

const date = (value: string) => new Date(value).toLocaleDateString(undefined, { calendar: "gregory" });
const STATUS = { pending: "Waiting for review", active: "Approved · active", rejected: "Sent back" } as const;
const FILTERS = [["pending", "Waiting"], ["active", "Approved"], ["rejected", "Sent back"]] as const;
type Status = keyof typeof STATUS;

const text = (r: InstallerWarranty) => [r.warranty.code, r.warranty.make, r.warranty.model, r.warranty.plate, r.warranty.filmSerial, r.ownerPhoneMasked, r.country ?? ""].join(" ");
const statusOf = (r: InstallerWarranty): Status => r.warranty.status;

/** Installer partners (همکار): apply in the profile, and follow registered installations and the counter's review. */
export default function InstallerSection({ user, onUser, view, rows = [], reload, onRegister }: {
  user: PortalUser; onUser: (user: PortalUser) => void; view: "profile" | "installations";
  rows?: InstallerWarranty[]; reload?: () => Promise<unknown>; onRegister?: () => void;
}) {
  const status = user.partner ?? "none";
  const [apply, setApply] = useState({ shopName: user.shopName ?? "", country: user.country ?? "", city: user.city ?? "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [fixing, setFixing] = useState<string | null>(null);
  const [photos, setPhotos] = useState<PhotoSet>({});
  const list = useListView(rows, text, statusOf);


  async function submitApplication(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMsg("");
    try { onUser(await portalApplyPartner(apply)); setMsg("Application sent. Solarzed will review it."); }
    catch (ex) { setMsg(ex instanceof Error ? ex.message : "Could not send the application."); }
    finally { setBusy(false); }
  }

  async function resend(code: string) {
    if (!photosComplete(photos)) { setMsg("Add a photo of the vehicle with its plate and of the installed film."); return; }
    setBusy(true); setMsg("");
    try { await installerResendPhotos(code, photos); setFixing(null); setPhotos({}); setMsg("New photos sent to the counter."); await reload?.(); }
    catch (ex) { setMsg(ex instanceof Error ? ex.message : "Could not send the photos."); }
    finally { setBusy(false); }
  }

  if (view === "installations") {
    if (status !== "approved") return null;
    return <section>
      <div className={own.sectionHead}>
        <div><h2>My installations</h2><p>Every vehicle you registered and the counter&apos;s review of its photos.</p></div>
        {onRegister && <button type="button" className={styles.button} onClick={onRegister}>+ Register installation</button>}
      </div>
      {msg && <p role="status" className={own.notice}>{msg}</p>}
      {rows.length > 0 && <ListToolbar view={list} placeholder="Search plate, vehicle, ROLL NO, warranty code…" filters={FILTERS} />}
      {!rows.length ? <Empty title="No installations registered yet">
        <span>Scan the QR on the warranty card inside a carton to register the first vehicle.</span>
      </Empty> : !list.matches.length ? <Empty title="Nothing matches your search" /> : <>
        <ul className={own.cards}>{list.rows.map(r => <li key={r.warranty.code} className={own.item}>
          <div className={own.itemMain}>
            <b>{r.warranty.make} {r.warranty.model} <span className={own.plate} dir="ltr">{r.warranty.plate}</span></b>
            <small>
              <code dir="ltr">{r.warranty.code}</code> · ROLL NO <code dir="ltr">{r.warranty.filmSerial}</code> · Customer <span dir="ltr">{r.ownerPhoneMasked}</span>{r.country && ` · ${r.country}`}
            </small>
            {r.warranty.status === "rejected" && r.warranty.statusNote && <small className={own.reason}>Reason: {r.warranty.statusNote}</small>}
          </div>
          <div className={own.itemSide}>
            <span className={`${own.status} ${own[`s_${r.warranty.status}`]}`}>{STATUS[r.warranty.status]}</span>
            <small>{date(r.createdAt)} · {r.photos} photo{r.photos === 1 ? "" : "s"}</small>
            {r.warranty.status !== "active" && <button type="button" className={own.ghost} onClick={() => { setFixing(fixing === r.warranty.code ? null : r.warranty.code); setPhotos({}); }}>
              {fixing === r.warranty.code ? "Cancel" : "New photos"}
            </button>}
          </div>
          {fixing === r.warranty.code && <div className={`${own.form} ${own.itemExtra}`}>
            <PhotoPicker value={photos} onChange={setPhotos} disabled={busy} />
            <button type="button" className={styles.button} disabled={busy} onClick={() => resend(r.warranty.code)}>{busy ? "Uploading…" : "Send new photos"}</button>
          </div>}
        </li>)}</ul>
        <Pager page={list.page} pages={list.pages} setPage={list.setPage} shown={list.rows.length} matched={list.matches.length} />
      </>}
    </section>;
  }

  return <section>
    <h2>Installer partner {status === "approved" && <small className={own.badge}>{user.shopName}</small>}</h2>
    {msg && <p role="status" className={own.notice}>{msg}</p>}
    {status === "approved" && <p>Your partner account is approved. Register vehicles under <b>Register installation</b> and pass cartons on under <b>Rolls</b>.</p>}
    {status === "none" && <>
      <p>Installers and shops register each installation for the customer: vehicle details, the customer&apos;s mobile and photos of the work. Apply once; Solarzed approves your account.</p>
      {!user.phone && <p role="status" className={own.notice}>Add your verified mobile above first.</p>}
      <form onSubmit={submitApplication} className={own.form}>
        <div className={styles.grid}>
          <label>Shop / workshop name<input required maxLength={200} value={apply.shopName} onChange={e => setApply({ ...apply, shopName: e.target.value })} /></label>
          <label>Country<input maxLength={100} value={apply.country} onChange={e => setApply({ ...apply, country: e.target.value })} /></label>
          <label>City<input maxLength={100} value={apply.city} onChange={e => setApply({ ...apply, city: e.target.value })} /></label>
        </div>
        <button className={styles.button} disabled={busy || !user.phone || !apply.shopName.trim()}>{busy ? "Sending…" : "Apply as installer"}</button>
      </form>
    </>}
    {status === "pending" && <p className={own.notice}>Your application for <b>{user.shopName}</b> is waiting for approval.</p>}
    {status === "suspended" && <p role="alert" className={styles.error}>Your installer account is suspended. Please contact Solarzed support.</p>}
  </section>;
}
