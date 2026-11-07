import type { CSSProperties } from "react";
import styles from "./uv-rays.module.css";

// Coordinates are in car.png pixel space (1545×1018). Each hit point lies on a car
// surface; `out` is the mirror reflection of the sun ray about that surface's normal,
// and `tilt` (deg) aligns the splash ellipse with the surface.
const SUN = [1800, -450] as const;
const BEAMS = [
  { hit: [380, 575], out: [50, 572], tilt: -17, delay: 0 },       // hood
  { hit: [800, 470], out: [420, 289], tilt: -9, delay: -0.64 },   // windshield
  { hit: [940, 415], out: [616, 89], tilt: 0, delay: -1.28 },     // roof
  { hit: [1220, 480], out: [1605, 372], tilt: 53, delay: -1.92 }, // side window
  { hit: [1350, 590], out: [1642, 664], tilt: 64, delay: -2.56 }, // rear fender
];

export default function UvRays() {
  return (
    <svg className={styles.rays} viewBox="0 0 1545 1018" aria-hidden="true" focusable="false">
      <defs>
        <filter id="szGlow" filterUnits="userSpaceOnUse" x="-600" y="-900" width="3200" height="2600">
          <feGaussianBlur stdDeviation="7" />
        </filter>
        {BEAMS.map((b, i) => (
          <g key={i}>
            <linearGradient id={`szIn${i}`} gradientUnits="userSpaceOnUse"
              x1={SUN[0]} y1={SUN[1]} x2={b.hit[0]} y2={b.hit[1]}>
              <stop offset="0" stopColor="#8ff3f6" stopOpacity="0" />
              <stop offset="1" stopColor="#8ff3f6" stopOpacity="0.75" />
            </linearGradient>
            <linearGradient id={`szOut${i}`} gradientUnits="userSpaceOnUse"
              x1={b.hit[0]} y1={b.hit[1]} x2={b.out[0]} y2={b.out[1]}>
              <stop offset="0" stopColor="#8ff3f6" stopOpacity="0.7" />
              <stop offset="1" stopColor="#8ff3f6" stopOpacity="0" />
            </linearGradient>
          </g>
        ))}
      </defs>

      {BEAMS.map((b, i) => (
        <g key={i} style={{ "--d": `${b.delay}s` } as CSSProperties}>
          <line x1={SUN[0]} y1={SUN[1]} x2={b.hit[0]} y2={b.hit[1]} stroke={`url(#szIn${i})`} strokeWidth="18" opacity="0.45" filter="url(#szGlow)" />
          <line x1={b.hit[0]} y1={b.hit[1]} x2={b.out[0]} y2={b.out[1]} stroke={`url(#szOut${i})`} strokeWidth="16" opacity="0.4" filter="url(#szGlow)" />
          <line x1={SUN[0]} y1={SUN[1]} x2={b.hit[0]} y2={b.hit[1]} stroke={`url(#szIn${i})`} strokeWidth="3" />
          <line x1={b.hit[0]} y1={b.hit[1]} x2={b.out[0]} y2={b.out[1]} stroke={`url(#szOut${i})`} strokeWidth="2.5" />
          <line className={styles.pulseIn} x1={SUN[0]} y1={SUN[1]} x2={b.hit[0]} y2={b.hit[1]}
            pathLength={100} stroke="#e6feff" strokeWidth="9" filter="url(#szGlow)" />
          <line className={styles.pulseOut} x1={b.hit[0]} y1={b.hit[1]} x2={b.out[0]} y2={b.out[1]}
            pathLength={100} stroke="#e6feff" strokeWidth="8" filter="url(#szGlow)" />
          <g transform={`rotate(${b.tilt} ${b.hit[0]} ${b.hit[1]})`}>
            <ellipse className={styles.ripple} cx={b.hit[0]} cy={b.hit[1]} rx="70" ry="20" fill="none" stroke="#8ff3f6" strokeWidth="3" />
          </g>
          <circle className={styles.flash} cx={b.hit[0]} cy={b.hit[1]} r="14" fill="#e6feff" filter="url(#szGlow)" />
        </g>
      ))}
    </svg>
  );
}
