"use client";

import { useCallback, useEffect, useState } from "react";
import { holderPage, holderDetail, HolderRow, HolderDetail, fa, FA_DATE } from "@/lib/api";
import { usePaged, SortTh, Pager, FilterBar, countActive, errorText } from "./AdminKit";
import { holderName } from "./BoxTransfers";
import { backdropProps } from "@/components/backdrop";
import s from "./admin.module.css";

const date = (value: string | null) => value ? new Date(value).toLocaleString(FA_DATE) : "—";
const n = (value: number) => value.toLocaleString("fa-IR");
const typeLabel = (type: string) => type === "ppf" ? "PPF" : "فیلم شیشه";
const EMPTY = { q: "" };

/** Who the detail dialog is about: a mobile, a legacy name-only holder, or the central warehouse (both null). */
type Who = { phone: string | null; name: string | null; label: string };

/**
 * «دارندگان رول»: who holds not-yet-activated rolls, searchable by first/last name, shop, mobile or a ROLL NO they
 * hold, paged. Opening a holder shows the rolls in their hands and every transfer to or from them.
 */
export default function RollHolders() {
  const [f, setF] = useState(EMPTY);
  const [warehouse, setWarehouse] = useState<number | null>(null);
  const [who, setWho] = useState<Who | null>(null);
  const load = useCallback(async (query: string) => {
    const r = await holderPage(query);
    setWarehouse(r.warehouse);
    return r;
  }, []);
  const list = usePaged<HolderRow>(load, f, { pageSize: 20, sort: "boxes", dir: "desc" });
  const sortProps = { sort: list.sort, onSort: list.toggleSort };

  return (
    <section>
      <header className={s.panelHead}><div><span className={s.eyebrow}>دارندگان رول</span><h2>رول‌ها دست چه کسانی است</h2></div></header>
      <FilterBar active={countActive(f)} onClear={() => setF(EMPTY)}>
        <label className={s.wide}>جستجو
          <input type="search" placeholder="نام، نام خانوادگی، فروشگاه، موبایل یا ROLL NO" value={f.q} onChange={e => setF({ q: e.target.value })} />
        </label>
      </FilterBar>
      {list.error && <p role="alert" className={s.errorText}>{list.error}</p>}
      {warehouse !== null && (
        <div className={s.card} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <span>{fa("Central warehouse")}: <b>{n(warehouse)}</b> رول فعال‌نشده</span>
          <button type="button" className={s.ghost} onClick={() => setWho({ phone: null, name: null, label: fa("Central warehouse") })}>رول‌ها و انتقال‌ها</button>
        </div>
      )}
      <div className={s.card}>
        <table className={`${s.table} ${list.loading ? s.tableBusy : ""}`}>
          <thead><tr>
            <SortTh column="name" label="نام و نام خانوادگی" {...sortProps} /><th>فروشگاه</th><th>موبایل</th>
            <SortTh column="boxes" label="تعداد رول" {...sortProps} /><SortTh column="lastAt" label="آخرین دریافت" {...sortProps} /><th></th>
          </tr></thead>
          <tbody>{list.items.map(h => {
            const label = holderName(h.name, h.phone);
            return <tr key={h.phone ?? `name:${h.name}`}>
              <td>{h.name ?? "—"}</td><td>{h.shopName ?? "—"}</td><td dir="ltr">{h.phone ?? "—"}</td>
              <td>{n(h.boxes)}</td><td>{date(h.lastAt)}</td>
              <td><button type="button" className={s.ghost} onClick={() => setWho({ phone: h.phone, name: h.phone ? null : h.name, label })}>رول‌ها و انتقال‌ها</button></td>
            </tr>;
          })}</tbody>
        </table>
        {!list.loading && list.items.length === 0 && <p className={s.empty}>{f.q ? "دارنده‌ای با این جستجو یافت نشد." : "رولی در دست کسی نیست."}</p>}
        <Pager page={list.page} pageSize={list.pageSize} total={list.total} loading={list.loading} onPage={list.setPage} />
      </div>
      {who && <HolderDialog who={who} onClose={() => setWho(null)} />}
    </section>
  );
}

function HolderDialog({ who, onClose }: { who: Who; onClose: () => void }) {
  const [detail, setDetail] = useState<HolderDetail | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"held" | "transfers">("held");
  const [filter, setFilter] = useState("");
  useEffect(() => {
    holderDetail(who.phone, who.name).then(setDetail).catch(e => setError(errorText(e)));
  }, [who.phone, who.name]);

  // Is this transfer row coming to the person, or leaving them?
  const incoming = (t: HolderDetail["transfers"][number]) =>
    who.phone ? t.toPhone === who.phone : who.name ? t.toPhone === null && t.toHolder === who.name : t.toPhone === null && t.toHolder === null;
  const term = filter.trim().toUpperCase();
  const held = detail?.held.filter(b => !term || b.id.includes(term) || (b.rollId ?? "").toUpperCase().includes(term) || b.product.toUpperCase().includes(term)) ?? [];
  const moves = detail?.transfers.filter(t => !term || t.labelId.includes(term) || t.batchId.toUpperCase().includes(term)) ?? [];

  return (
    <div className={s.dialog} role="dialog" aria-modal="true" aria-label={who.label} {...backdropProps(onClose)}>
      <div className={s.dialogInner} style={{ maxWidth: 900, width: "100%" }}>
        <button type="button" className={s.dialogClose} aria-label="بستن" onClick={onClose}>×</button>
        <h2>{who.label}</h2>
        {error && <p role="alert" className={s.errorText}>{error}</p>}
        {!detail && !error && <p className={s.empty}>{fa("Loading…")}</p>}
        {detail && <>
          <p className={s.empty} style={{ textAlign: "start" }}>
            {detail.shopName && <>فروشگاه: <b>{detail.shopName}</b> · </>}
            {detail.city && <>شهر: <b>{detail.city}</b> · </>}
            رول در دست: <b>{n(detail.boxes)}</b> · انتقال‌ها: <b>{n(detail.transfers.length)}</b>
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
            <button type="button" className={tab === "held" ? s.btnPrimary : s.ghost} onClick={() => setTab("held")}>رول‌های در دست ({n(detail.boxes)})</button>
            <button type="button" className={tab === "transfers" ? s.btnPrimary : s.ghost} onClick={() => setTab("transfers")}>انتقال‌ها ({n(detail.transfers.length)})</button>
            <input type="search" dir="ltr" placeholder="ROLL NO" value={filter} onChange={e => setFilter(e.target.value)} style={{
              flex: 1, minWidth: 140, padding: "10px 14px", borderRadius: 11, color: "var(--sz-fg)", font: "inherit",
              background: "rgb(var(--sz-tint) / 0.05)", border: "1.5px solid rgb(var(--sz-tint) / 0.12)" }} />
          </div>
          <div style={{ maxHeight: "60vh", overflow: "auto" }}>
            {tab === "held" ? (held.length ? <table className={s.table}>
              <thead><tr><th>ROLL NO</th><th>محصول</th><th>نوع</th><th>Serial Number</th><th>در دست از</th></tr></thead>
              <tbody>{held.map(b => <tr key={b.id}>
                <td><code dir="ltr">{b.id}</code></td><td>{b.product}</td><td>{typeLabel(b.type)}</td>
                <td><code dir="ltr">{b.rollId ?? "—"}</code></td><td>{date(b.heldSince)}</td>
              </tr>)}</tbody>
            </table> : <p className={s.empty}>{term ? "رولی با این ROLL NO یافت نشد." : "رولی در دست ندارد."}</p>)
            : (moves.length ? <table className={s.table}>
              <thead><tr><th>{fa("Date")}</th><th>جهت</th><th>ROLL NO</th><th>{fa("From")}</th><th>{fa("To")}</th><th>{fa("By")}</th><th>{fa("Note (optional)")}</th></tr></thead>
              <tbody>{moves.map(t => {
                const into = incoming(t);
                return <tr key={t.id}>
                  <td>{date(t.at)}<br /><small dir="ltr">{t.batchId}</small></td>
                  <td><span className={s.badge} data-tone={into ? "active" : "muted"}>{into ? "دریافت" : "ارسال"}</span></td>
                  <td><code dir="ltr">{t.labelId}</code></td>
                  <td>{holderName(t.fromHolder, t.fromPhone)}</td><td>{holderName(t.toHolder, t.toPhone)}</td>
                  <td>{t.actor}</td><td>{t.note ?? "—"}</td>
                </tr>;
              })}</tbody>
            </table> : <p className={s.empty}>{term ? "انتقالی با این ROLL NO یافت نشد." : "انتقالی ثبت نشده است."}</p>)}
          </div>
          {(detail.boxes > detail.held.length || detail.transfers.length >= 1000) && <p className={s.empty}>فقط ۱۰۰۰ مورد آخر نمایش داده می‌شود.</p>}
        </>}
      </div>
    </div>
  );
}
