"use client";

import { useEffect, useMemo, useState } from "react";
import { compressPhoto, PHOTO_KINDS, PhotoKind, PhotoSet } from "@/lib/api";
import { useT } from "@/lib/i18n/client";
import styles from "./PhotoPicker.module.css";

/**
 * One slot per installation photo. On a phone the slot opens the rear camera; each picture is shrunk before upload.
 * The vehicle (with plate) and installed-film photos are required.
 */
export default function PhotoPicker({ value, onChange, disabled }: { value: PhotoSet; onChange: (next: PhotoSet) => void; disabled?: boolean }) {
  const t = useT();
  const [busy, setBusy] = useState<PhotoKind | null>(null);
  const [error, setError] = useState("");

  // Object URLs follow the chosen blobs and are released when replaced.
  const previews = useMemo(() => {
    const next: Partial<Record<PhotoKind, string>> = {};
    for (const [kind, blob] of Object.entries(value)) if (blob) next[kind as PhotoKind] = URL.createObjectURL(blob);
    return next;
  }, [value]);
  useEffect(() => () => Object.values(previews).forEach(url => url && URL.revokeObjectURL(url)), [previews]);

  async function pick(kind: PhotoKind, file: File | undefined) {
    if (!file) return;
    setError(""); setBusy(kind);
    try { onChange({ ...value, [kind]: await compressPhoto(file) }); }
    catch (ex) { setError(ex instanceof Error ? t(ex.message) : t("Could not read this photo.")); }
    finally { setBusy(null); }
  }

  return <fieldset className={styles.box}>
    <legend>{t("Installation photos")} <small>{t("(vehicle with plate and installed film are required)")}</small></legend>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div className={styles.grid}>
      {PHOTO_KINDS.map(({ kind, labelEn, required }) => { const label = t(labelEn); return <div key={kind} className={styles.slot} data-filled={previews[kind] ? "" : undefined}>
        <label>
          {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview, not a remote image */}
          {previews[kind] ? <img src={previews[kind]} alt={label} /> : <span className={styles.plus} aria-hidden>{busy === kind ? "…" : "+"}</span>}
          <span className={styles.caption}>{label}{required && <b> *</b>}</span>
          <input type="file" accept="image/*" capture="environment" disabled={disabled || busy !== null}
            aria-label={label} data-kind={kind} onChange={event => { void pick(kind, event.target.files?.[0]); event.target.value = ""; }} />
        </label>
        {previews[kind] && !disabled && <button type="button" className={styles.remove} aria-label={t("Remove {name}", { name: label })}
          onClick={() => { const next = { ...value }; delete next[kind]; onChange(next); }}>×</button>}
      </div>; })}
    </div>
  </fieldset>;
}

export const photosComplete = (photos: PhotoSet) => PHOTO_KINDS.every(p => !p.required || photos[p.kind]);
