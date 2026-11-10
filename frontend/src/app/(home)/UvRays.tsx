import type { CSSProperties } from "react";

// Coordinates are in the car image's pixel space (1545×1018). Each hit point lies on a car
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
    <svg className="sz-uv-rays" viewBox="0 0 1545 1018" aria-hidden="true" focusable="false">
      <style>{RAY_STYLES}</style>
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
          <line className="sz-uv-in" x1={SUN[0]} y1={SUN[1]} x2={b.hit[0]} y2={b.hit[1]}
            pathLength={100} stroke="#e6feff" strokeWidth="4" />
          <line className="sz-uv-out" x1={b.hit[0]} y1={b.hit[1]} x2={b.out[0]} y2={b.out[1]}
            pathLength={100} stroke="#e6feff" strokeWidth="3.5" />
          <g transform={`rotate(${b.tilt} ${b.hit[0]} ${b.hit[1]})`}>
            <ellipse className="sz-uv-ripple" cx={b.hit[0]} cy={b.hit[1]} rx="70" ry="20" fill="none" stroke="#8ff3f6" strokeWidth="3" />
          </g>
          <circle className="sz-uv-flash" cx={b.hit[0]} cy={b.hit[1]} r="7" fill="#e6feff" />
        </g>
      ))}
    </svg>
  );
}

// Keep the animation with the server-rendered SVG so it starts without hydration or another request.
const RAY_STYLES = `
.sz-uv-rays {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
  mix-blend-mode: screen;
}

.sz-uv-in, .sz-uv-out {
  stroke-linecap: round;
  stroke-dasharray: 10 200;
  stroke-dashoffset: 10;
}

.sz-uv-ripple, .sz-uv-flash {
  opacity: 0;
  transform-box: fill-box;
  transform-origin: center;
}

@media (prefers-reduced-motion: no-preference) {
  .sz-uv-in { animation: sz-uv-in 3.2s cubic-bezier(.4,0,.9,.6) var(--d) infinite; }
  .sz-uv-out { animation: sz-uv-out 3.2s cubic-bezier(.1,.5,.6,1) var(--d) infinite; }
  .sz-uv-ripple { animation: sz-uv-ripple 3.2s ease-out var(--d) infinite; }
  .sz-uv-flash { animation: sz-uv-flash 3.2s ease var(--d) infinite; }
}

@media (prefers-reduced-motion: reduce) {
  .sz-uv-flash { opacity: .6; }
}

@keyframes sz-uv-in {
  0% { stroke-dashoffset: 10; }
  42%, 100% { stroke-dashoffset: -100; }
}

@keyframes sz-uv-out {
  0%, 42% { stroke-dashoffset: 10; }
  80%, 100% { stroke-dashoffset: -100; }
}

@keyframes sz-uv-ripple {
  0%, 41% { opacity: 0; transform: scale(.15); }
  43% { opacity: 1; transform: scale(.25); }
  78%, 100% { opacity: 0; transform: scale(1); }
}

@keyframes sz-uv-flash {
  0%, 40% { opacity: 0; transform: scale(.4); }
  43% { opacity: 1; transform: scale(1.5); }
  62% { opacity: .2; transform: scale(1); }
  100% { opacity: 0; transform: scale(.8); }
}
`;
