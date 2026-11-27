"use client";

import { useEffect, useRef, useState } from "react";
import type { CircleMarker, Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import { useT } from "@/lib/i18n/client";
import styles from "./LocationPicker.module.css";

export type LatLng = { lat: number; lng: number };

// Without a saved point the map opens on Iran when that is the country, otherwise on the whole world.
const IRAN: [number, number] = [32.4, 53.7];

/**
 * Lets the user pick where they are: a click (or tap) on the map drops the pin, and "Use my location" asks the browser.
 * Leaflet touches `window`, so it is loaded only in the browser after mount.
 */
export default function LocationPicker({ value, onChange, country }: { value: LatLng | null; onChange: (next: LatLng | null) => void; country?: string }) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const pin = useRef<CircleMarker | null>(null);
  const leaflet = useRef<typeof import("leaflet") | null>(null);
  const change = useRef(onChange);
  change.current = onChange;
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then(L => {
      if (cancelled || !box.current || map.current) return;
      leaflet.current = L;
      const m = L.map(box.current, { scrollWheelZoom: false, worldCopyJump: true });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
      }).addTo(m);
      m.on("click", e => change.current({ lat: e.latlng.lat, lng: e.latlng.lng }));
      map.current = m;
      if (value) m.setView([value.lat, value.lng], 15);
      else if (country === "IR") m.setView(IRAN, 5);
      else m.setView([20, 0], 2);
      place(value);
    });
    return () => { cancelled = true; map.current?.remove(); map.current = null; pin.current = null; };
    // The map is built once; later value changes move the pin below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function place(next: LatLng | null) {
    const L = leaflet.current, m = map.current;
    if (!L || !m) return;
    if (!next) { pin.current?.remove(); pin.current = null; return; }
    if (pin.current) pin.current.setLatLng([next.lat, next.lng]);
    else pin.current = L.circleMarker([next.lat, next.lng], { radius: 9, weight: 3, color: "#fff", fillColor: "#e0262b", fillOpacity: 1 }).addTo(m);
  }
  useEffect(() => { place(value); }, [value]);

  function locate() {
    if (!navigator.geolocation) { setError(t("Your browser cannot share your location.")); return; }
    setError(""); setLocating(true);
    navigator.geolocation.getCurrentPosition(
      p => {
        setLocating(false);
        const next = { lat: p.coords.latitude, lng: p.coords.longitude };
        change.current(next);
        map.current?.setView([next.lat, next.lng], 16);
      },
      () => { setLocating(false); setError(t("Could not get your location. Pick it on the map instead.")); },
      { enableHighAccuracy: true, timeout: 15000 });
  }

  return (
    <div className={styles.picker}>
      <div ref={box} className={styles.map} dir="ltr" role="application" aria-label={t("Map: click to set your location")} />
      <div className={styles.bar}>
        <button type="button" className={styles.action} onClick={locate} disabled={locating}>{locating ? t("Finding you…") : t("Use my location")}</button>
        {value && <button type="button" className={styles.action} onClick={() => onChange(null)}>{t("Remove location")}</button>}
        <span className={styles.coords} dir="ltr">{value ? `${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}` : t("Click the map to set your location.")}</span>
      </div>
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </div>
  );
}
