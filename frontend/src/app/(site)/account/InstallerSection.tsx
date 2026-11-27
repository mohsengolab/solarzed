"use client";

import { useMemo, useState, FormEvent } from "react";
import { installerResendPhotos, portalApplyPartner, InstallerWarranty, PhotoSet, PortalUser } from "@/lib/api";
import PhotoPicker, { photosComplete } from "@/components/PhotoPicker";
import CountrySelect from "@/components/CountrySelect";
import VehicleCoverage from "@/components/VehicleCoverage";
import InstallationPhotos from "@/components/InstallationPhotos";
import { AREA_LABELS } from "../activate/CarWindows";
import { citiesOf, countryFromText, findCountry } from "@/lib/countries";
import { Empty, ListToolbar, Pager, useListView } from "./ListTools";
import { formatDate } from "@/lib/i18n";
import { useLang, useT } from "@/lib/i18n/client";
import styles from "../activate/activate.module.css";
import own from "./account.module.css";

const STATUS = { pending: "Waiting for review", active: "Approved · active", rejected: "Sent back" } as const;
const FILTERS = [["pending", "Waiting"], ["active", "Approved"], ["rejected", "Sent back"]] as const;
type Status = keyof typeof STATUS;

/** One vehicle the installer worked on: every roll (warranty) registered for it. */
interface Car { key: string; rows: InstallerWarranty[]; installed: string; createdAt: string; status: Status }

// A vehicle is "sent back" if any roll was, "waiting" if any roll still is, otherwise approved.
const carStatus = (rows: InstallerWarranty[]): Status =>
  rows.some(r => r.warranty.status === "rejected") ? "rejected" : rows.some(r => r.warranty.status === "pending") ? "pending" : "active";

export function toCars(rows: InstallerWarranty[]): Car[] {
  const groups = new Map<string, InstallerWarranty[]>();
  for (const r of rows) {
    const w = r.warranty;
    const key = `${w.vinMasked}|${w.make}|${w.model}|${w.plate}`.toUpperCase();
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.entries()].map(([key, list]) => {
    const sorted = [...list].sort((a, b) => b.warranty.installed.localeCompare(a.warranty.installed) || b.createdAt.localeCompare(a.createdAt));
    const createdAt = sorted.reduce((latest, r) => r.createdAt > latest ? r.createdAt : latest, sorted[0].createdAt);
    return { key, rows: sorted, installed: sorted[0].warranty.installed, createdAt, status: carStatus(sorted) };
  }).sort((a, b) => b.installed.localeCompare(a.installed) || b.createdAt.localeCompare(a.createdAt));
}

const text = (c: Car) => c.rows.flatMap(({ warranty: w, ownerPhoneMasked, country }) =>
  [w.make, w.model, w.plate, w.vinMasked, w.filmSerial, w.invoiceNumber, w.installed, ownerPhoneMasked, country ?? ""]).join(" ");
const statusOf = (c: Car): Status => c.status;

/** Installer partners (همکار): apply in the profile, and follow every vehicle they installed with the warranty of each roll used. */
export default function InstallerSection({ user, onUser, view, rows = [], reload, onRegister }: {
  user: PortalUser; onUser: (user: PortalUser) => void; view: "profile" | "installations";
  rows?: InstallerWarranty[]; reload?: () => Promise<unknown>; onRegister?: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const date = (value: string) => formatDate(lang, value);
  const filters = FILTERS.map(([id, label]) => [id, t(label)] as const);
  const status = user.partner ?? "none";
  const [apply, setApply] = useState({ shopName: user.shopName ?? "", country: user.country ?? "", city: user.city ?? "" });
  const applyCode = countryFromText(apply.country)?.code ?? null;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [fixing, setFixing] = useState<string | null>(null);
  const [photos, setPhotos] = useState<PhotoSet>({});
  const cars = useMemo(() => toCars(rows), [rows]);
  const list = useListView(cars, text, statusOf);
  const [open, setOpen] = useState<string | null>(null);


  async function submitApplication(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMsg("");
    try { onUser(await portalApplyPartner(apply)); setMsg(t("Application sent. Solarzed will review it.")); }
    catch (ex) { setMsg(ex instanceof Error ? t(ex.message) : t("Could not send the application.")); }
    finally { setBusy(false); }
  }

  async function resend(reference: string) {
    if (!photosComplete(photos)) { setMsg(t("Add a photo of the vehicle with its plate and of the installed film.")); return; }
    setBusy(true); setMsg("");
    try { await installerResendPhotos(reference, photos); setFixing(null); setPhotos({}); setMsg(t("New photos sent to the counter.")); await reload?.(); }
    catch (ex) { setMsg(ex instanceof Error ? t(ex.message) : t("Could not send the photos.")); }
    finally { setBusy(false); }
  }

  if (view === "installations") {
    if (status !== "approved") return null;
    return <section>
      <div className={own.sectionHead}>
        <div><h2>{t("My installations")}</h2><p>{t("Every vehicle you installed film on, with its date. Open a vehicle to see the full warranty of each roll used on it.")}</p></div>
        {onRegister && <button type="button" className={styles.button} onClick={onRegister}>{t("+ Register installation")}</button>}
      </div>
      {msg && <p role="status" className={own.notice}>{msg}</p>}
      {cars.length > 0 && <ListToolbar view={list} placeholder={t("Search plate, vehicle, ROLL NO…")} filters={filters} />}
      {!cars.length ? <Empty title={t("No installations registered yet")}>
        <span>{t("Scan the QR on the warranty card inside a carton to register the first vehicle.")}</span>
      </Empty> : !list.matches.length ? <Empty title={t("Nothing matches your search")} /> : <>
        <ul className={own.cards}>{list.rows.map(car => {
          const first = car.rows[0].warranty;
          const isOpen = open === car.key;
          return <li key={car.key} className={`${own.item} ${own.car}`}>
            <button type="button" className={own.carHead} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : car.key)}>
              <div className={own.itemMain}>
                <b>{first.make} {first.model} <span className={own.plate} dir="ltr">{first.plate}</span></b>
                <small>
                  {t("Installed {date}", { date: car.installed })} · {t(car.rows.length === 1 ? "{n} roll used" : "{n} rolls used", { n: car.rows.length })} · {t("Customer")} <span dir="ltr">{car.rows[0].ownerPhoneMasked}</span>
                </small>
              </div>
              <div className={own.itemSide}>
                <span className={`${own.status} ${own[`s_${car.status}`]}`}>{t(STATUS[car.status])}</span>
                <small>{t("Registered {date}", { date: date(car.createdAt) })}</small>
                <span className={own.ghost}>{isOpen ? t("Hide details") : t("Show warranty details")}</span>
              </div>
            </button>
            {isOpen && <div className={`${own.itemExtra} ${own.carBody}`}>
              <VehicleCoverage title={`VIN ${first.vinMasked}`}
                items={car.rows.map(r => ({ ...r.warranty, film: `ROLL NO ${r.warranty.filmSerial}` }))} />
              <h3 className={own.subhead}>{t("Rolls used on this vehicle")}</h3>
              <ul className={own.rolls}>{car.rows.map(r => {
                const w = r.warranty;
                return <li key={w.ref} className={own.roll}>
                  <div className={own.rollHead}>
                    <b>ROLL NO <code dir="ltr">{w.filmSerial}</code></b>
                    <span className={`${own.status} ${own[`s_${w.status}`]}`}>{t(STATUS[w.status])}</span>
                  </div>
                  <dl className={own.facts}>
                    <dt>{t("Film")}</dt><dd>{w.type === "ppf" ? t("Paint protection film") : t("Window film")}{w.usedLengthM != null && ` · ${t("{n} m", { n: w.usedLengthM })}`}</dd>
                    <dt>{t("Installed")}</dt><dd>{w.installed}</dd>
                    <dt>{t("Covers")}</dt><dd>{w.areas.length ? w.areas.map(a => t(AREA_LABELS[a] ?? a)).join(" · ") : "—"}</dd>
                    <dt>{t("Film warranty until")}</dt><dd>{w.status === "active" ? w.coverage?.filmEnds ?? "—" : t("Starts once Solarzed approves it")}</dd>
                    {w.invoiceNumber && <><dt>{t("Invoice number")}</dt><dd dir="ltr">{w.invoiceNumber}</dd></>}
                    {w.sellerName && <><dt>{t("Seller")}</dt><dd>{w.sellerName}</dd></>}
                    {r.country && <><dt>{t("Country")}</dt><dd>{r.country}</dd></>}
                    <dt>{t("Photos")}</dt><dd>{t(r.photos === 1 ? "{n} photo" : "{n} photos", { n: r.photos })}</dd>
                  </dl>
                  {r.photos > 0 && <InstallationPhotos reference={w.ref} />}
                  {w.status === "rejected" && w.statusNote && <small className={own.reason}>{t("Reason: {note}", { note: w.statusNote })}</small>}
                  {w.status !== "active" && <button type="button" className={own.ghost} onClick={() => { setFixing(fixing === w.ref ? null : w.ref); setPhotos({}); }}>
                    {fixing === w.ref ? t("Cancel") : t("New photos")}
                  </button>}
                  {fixing === w.ref && <div className={own.form}>
                    <PhotoPicker value={photos} onChange={setPhotos} disabled={busy} />
                    <button type="button" className={styles.button} disabled={busy} onClick={() => resend(w.ref)}>{busy ? t("Uploading…") : t("Send new photos")}</button>
                  </div>}
                </li>;
              })}</ul>
            </div>}
          </li>;
        })}</ul>
        <Pager page={list.page} pages={list.pages} setPage={list.setPage} shown={list.rows.length} matched={list.matches.length} />
      </>}
    </section>;
  }

  return <section>
    <h2>{t("Installer partner")} {status === "approved" && <small className={own.badge}>{user.shopName}</small>}</h2>
    {msg && <p role="status" className={own.notice}>{msg}</p>}
    {status === "approved" && <p>{t("Your partner account is approved. Register vehicles under Register installation and pass cartons on under Rolls.")}</p>}
    {status === "none" && <>
      <p>{t("Installers and shops register each installation for the customer: vehicle details, the customer's mobile and photos of the work. Apply once; Solarzed approves your account.")}</p>
      {!user.phone && <p role="status" className={own.notice}>{t("Add your verified mobile above first.")}</p>}
      <form onSubmit={submitApplication} className={own.form}>
        <div className={styles.grid}>
          <label>{t("Shop / workshop name")}<input required maxLength={200} value={apply.shopName} onChange={e => setApply({ ...apply, shopName: e.target.value })} /></label>
          <div className={own.field}>
            <span>{t("Country")}</span>
            <CountrySelect value={applyCode} label={t("Country")}
              onChange={code => setApply({ ...apply, country: findCountry(code)?.names.en ?? code, city: code === applyCode ? apply.city : "" })} />
          </div>
          <label>{t("City")}<input maxLength={100} list="apply-cities" autoComplete="off" value={apply.city} onChange={e => setApply({ ...apply, city: e.target.value })} />
            <datalist id="apply-cities">{citiesOf(applyCode, lang).map(c => <option key={c} value={c} />)}</datalist></label>
        </div>
        <button className={styles.button} disabled={busy || !user.phone || !apply.shopName.trim()}>{busy ? t("Sending…") : t("Apply as installer")}</button>
      </form>
    </>}
    {status === "pending" && <p className={own.notice}>{t("Your application for {shop} is waiting for approval.", { shop: user.shopName })}</p>}
    {status === "suspended" && <p role="alert" className={styles.error}>{t("Your installer account is suspended. Please contact Solarzed support.")}</p>}
  </section>;
}
