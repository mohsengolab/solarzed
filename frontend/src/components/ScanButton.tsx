"use client";

import { useEffect, useRef, useState } from "react";
import css from "./ScanButton.module.css";
import { backdropProps } from "./backdrop";

type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> };
type DetectorClass = new (options: { formats: string[] }) => Detector;

/**
 * Reads the Serial Number from the warranty card QR (or the carton barcode) with the phone camera.
 * Uses the browser's BarcodeDetector where it exists (Android Chrome, also 1D barcodes) and jsQR otherwise (iPhone).
 * The camera needs HTTPS (or localhost).
 */
export default function ScanButton({ onScan, label = "Scan", disabled }: { onScan: (text: string) => void; label?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null, stopped = false, timer = 0;
    const canvas = document.createElement("canvas");
    const stop = () => { stopped = true; window.clearTimeout(timer); stream?.getTracks().forEach(t => t.stop()); };
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser cannot use the camera here. Type the Serial Number instead.");
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (stopped || !video.current) { stop(); return; }
        video.current.srcObject = stream;
        await video.current.play();
        const Native = (window as unknown as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
        const detector = Native ? new Native({ formats: ["qr_code", "code_128", "code_39", "ean_13", "data_matrix"] }) : null;
        const jsQR = detector ? null : (await import("jsqr")).default;
        const tick = async () => {
          if (stopped || !video.current) return;
          const v = video.current;
          let text: string | null = null;
          if (v.videoWidth) {
            if (detector) text = (await detector.detect(v).catch(() => []))[0]?.rawValue ?? null;
            else if (jsQR) {
              canvas.width = v.videoWidth; canvas.height = v.videoHeight;
              const ctx = canvas.getContext("2d", { willReadFrequently: true });
              ctx?.drawImage(v, 0, 0);
              const image = ctx?.getImageData(0, 0, canvas.width, canvas.height);
              text = image ? jsQR(image.data, image.width, image.height)?.data ?? null : null;
            }
          }
          if (text?.trim()) { stop(); setOpen(false); onScan(text.trim()); return; }
          timer = window.setTimeout(tick, 200);
        };
        void tick();
      } catch (ex) {
        setError(ex instanceof DOMException && ex.name === "NotAllowedError" ? "Camera access was refused. Allow the camera or type the Serial Number."
          : ex instanceof Error ? ex.message : "The camera could not start.");
      }
    })();
    return stop;
  }, [open, onScan]);

  return <>
    <button type="button" className={css.button} disabled={disabled} onClick={() => { setError(""); setOpen(true); }}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10" /></svg>
      {label}
    </button>
    {open && <div className={css.overlay} role="dialog" aria-modal="true" aria-label="Scan the Serial Number" {...backdropProps(() => setOpen(false))}>
      <div className={css.sheet}>
        <video ref={video} className={css.video} playsInline muted />
        <div className={css.frame} aria-hidden="true" />
        <p>{error || "Point the camera at the QR on the warranty card."}</p>
        <button type="button" className={css.close} onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>}
  </>;
}

/** The Serial Number inside whatever was scanned: a bare serial, an old /activate#… link, or an old Serial-1234567[-ABC] card code. */
export function serialFromScan(raw: string) {
  let text = raw.trim();
  const hash = text.indexOf("#");
  if (/^https?:\/\//i.test(text) && hash >= 0) text = decodeURIComponent(text.slice(hash + 1));
  text = text.replace(/\s+/g, "").toUpperCase();
  const card = /^(.+)-[1-9][0-9]{6}(?:-[A-Z]{3})?$/.exec(text);
  return card ? card[1] : text;
}
