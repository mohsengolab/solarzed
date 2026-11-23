"use client";

import { useCallback, useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { installerResendPhotos, portalApplyPartner, portalInstallerWarranties, InstallerWarranty, PhotoSet, PortalUser } from "@/lib/api";
import PhotoPicker, { photosComplete } from "@/components/PhotoPicker";
import ScanButton, { serialFromScan } from "@/components/ScanButton";
import styles from "../activate/activate.module.css";
import own from "./account.module.css";

const date = (value: string) => new Date(value).toLocaleDateString(undefined, { calendar: "gregory" });
const STATUS = { pending: "Waiting for counter review", active: "Approved · active", rejected: "Sent back — new photos needed" } as const;

/** Installer partners (همکار): apply, then register customers' warranties with photos and follow the counter's review. */
export default function InstallerSection({ user, onUser }: { user: PortalUser; onUser: (user: PortalUser) => void }) {
  const status = user.partner ?? "none";
  const [apply, setApply] = useState({ shopName: user.shopName ?? "", country: user.country ?? "", city: user.city ?? "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [rows, setRows] = useState<InstallerWarranty[]>([]);
  const [fixing, setFixing] = useState<string | null>(null);
  const [photos, setPhotos] = useState<PhotoSet>({});
  const [serial, setSerial] = useState("");
  const router = useRouter();
  const serialOk = /^[A-Z0-9][A-Z0-9-]{2,30}[A-Z0-9]$/.test(serial);
  const openSerial = (value: string) => { const sn = serialFromScan(value); setSerial(sn); if (/^[A-Z0-9][A-Z0-9-]{2,30}[A-Z0-9]$/.test(sn)) router.push(`/activate#${encodeURIComponent(sn)}`); };

  const load = useCallback(() => portalInstallerWarranties().then(r => setRows(r.warranties)).catch(ex => setMsg(ex instanceof Error ? ex.message : "Could not load your installations.")), []);
  useEffect(() => { if (status === "approved") void Promise.resolve().then(load); }, [status, load]);

  async function submitApplication(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMsg("");
    try { onUser(await portalApplyPartner(apply)); setMsg("Application sent. Solarzed will review it."); }
    catch (ex) { setMsg(ex instanceof Error ? ex.message : "Could not send the application."); }
    finally { setBusy(false); }
  }

  async function resend(code: string) {
    if (!photosComplete(photos)) { setMsg("Add a photo of the vehicle with its plate and of the installed film."); return; }
    setBusy(true); setMsg("");
    try { await installerResendPhotos(code, photos); setFixing(null); setPhotos({}); setMsg("New photos sent to the counter."); await load(); }
    catch (ex) { setMsg(ex instanceof Error ? ex.message : "Could not send the photos."); }
    finally { setBusy(false); }
  }

  return <section>
    <h2>Installer partner {status === "approved" && <small className={own.badge}>{user.shopName}</small>}</h2>
    {msg && <p role="status" className={own.notice}>{msg}</p>}
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
    {status === "approved" && <>
      <p>To register a vehicle, scan the QR on the warranty card inside the carton or type the <b>Serial Number</b> printed under it. The warranty goes to the customer&apos;s mobile; when the counter approves your photos the customer gets an SMS with their gold warranty card.</p>
      <form className={own.form} onSubmit={event => { event.preventDefault(); if (serialOk) openSerial(serial); }}>
        <label>Serial Number
          <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input dir="ltr" required style={{ flex: "1 1 200px" }} placeholder="e.g. CPT30614374" autoComplete="off" spellCheck={false} autoCapitalize="characters"
              value={serial} onChange={e => setSerial(e.target.value.replace(/\s+/g, "").toUpperCase())} />
            <ScanButton label="Scan" onScan={openSerial} disabled={busy} />
          </span>
        </label>
        <button className={styles.button} disabled={!serialOk}>Register an installation</button>
      </form>
      <h3 style={{ marginTop: 24 }}>My installations ({rows.length})</h3>
      {rows.length ? <div className={own.scroll}><table className={own.table}>
        <thead><tr><th>Date</th><th>Vehicle</th><th>Customer</th><th>Photos</th><th>Status</th><th></th></tr></thead>
        <tbody>{rows.map(r => <tr key={r.warranty.code}>
          <td>{date(r.createdAt)}</td>
          <td>{r.warranty.make} {r.warranty.model} · {r.warranty.plate}{r.country && <small> · {r.country}</small>}</td>
          <td dir="ltr">{r.ownerPhoneMasked}</td><td>{r.photos}</td>
          <td>{STATUS[r.warranty.status]}{r.warranty.status === "rejected" && r.warranty.statusNote && <small><br />{r.warranty.statusNote}</small>}</td>
          <td>{r.warranty.status !== "active" && <button type="button" className={own.ghost} onClick={() => { setFixing(fixing === r.warranty.code ? null : r.warranty.code); setPhotos({}); }}>New photos</button>}</td>
        </tr>)}</tbody>
      </table></div> : <p>No installations registered yet.</p>}
      {fixing && <div className={own.form}>
        <PhotoPicker value={photos} onChange={setPhotos} disabled={busy} />
        <button type="button" className={styles.button} disabled={busy} onClick={() => resend(fixing)}>{busy ? "Uploading…" : "Send new photos"}</button>
      </div>}
    </>}
  </section>;
}
