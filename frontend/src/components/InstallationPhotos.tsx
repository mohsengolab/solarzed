"use client";

import { useEffect, useState } from "react";
import { PHOTO_KINDS, portalPhoto, portalWarrantyPhotos } from "@/lib/api";
import { useT } from "@/lib/i18n/client";
import css from "./InstallationPhotos.module.css";

const KIND = Object.fromEntries(PHOTO_KINDS.map(k => [k.kind, k.labelEn])) as Record<string, string>;

function Thumb({ id, alt, onOpen }: { id: number; alt: string; onOpen: (url: string) => void }) {
  const t = useT();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let current: string | null = null; let alive = true;
    portalPhoto(id).then(u => { current = u; if (alive) setUrl(u); else URL.revokeObjectURL(u); }).catch(() => alive && setFailed(true));
    return () => { alive = false; if (current) URL.revokeObjectURL(current); };
  }, [id]);
  return <button type="button" className={css.thumb} disabled={!url} onClick={() => url && onOpen(url)}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {url ? <img src={url} alt={alt} /> : <span>{failed ? t("Could not load the photo.") : "…"}</span>}
    <small>{alt}</small>
  </button>;
}

/** The installation photos of one warranty, for its owner and its installer; loaded only when opened. */
export default function InstallationPhotos({ reference }: { reference: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<{ id: number; kind: string }[] | null>(null);
  const [error, setError] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);

  useEffect(() => {
    if (!open || items || error) return;
    let alive = true;
    portalWarrantyPhotos(reference).then(r => alive && setItems(r.items)).catch(() => alive && setError(true));
    return () => { alive = false; };
  }, [open, items, error, reference]);

  return <div className={css.wrap}>
    <button type="button" className={css.toggle} aria-expanded={open} onClick={() => setOpen(o => !o)}>
      {open ? t("Hide installation photos") : t("Show installation photos")}
    </button>
    {open && (error ? <p role="alert" className={css.note}>{t("Could not load the photos.")}</p>
      : !items ? <p className={css.note}>{t("Loading photos…")}</p>
      : !items.length ? <p className={css.note}>{t("No installation photos for this warranty.")}</p>
      : <div className={css.grid}>{items.map(p => <Thumb key={p.id} id={p.id} alt={t(KIND[p.kind] ?? p.kind)} onOpen={setZoom} />)}</div>)}
    {zoom && <div className={css.lightbox} role="dialog" aria-label={t("Photo")} onClick={() => setZoom(null)}>
      <button type="button" aria-label={t("Close")}>×</button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={zoom} alt="" />
    </div>}
  </div>;
}
