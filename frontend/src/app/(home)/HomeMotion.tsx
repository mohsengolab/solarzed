"use client";

import { useEffect } from "react";

// Port of the static site's motion.js, presentation.js reveals, reference-home.js and the
// menu toggle from solarzed.js. It drives the server-rendered markup through the same
// classes the original stylesheets expect.
export default function HomeMotion() {
  useEffect(() => {
    const root = document.documentElement;
    const cleanups: (() => void)[] = [];
    const on = <K extends keyof WindowEventMap>(t: Window, type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      t.addEventListener(type, fn, opts);
      cleanups.push(() => t.removeEventListener(type, fn, opts));
    };
    const onDoc = <K extends keyof DocumentEventMap>(type: K, fn: (e: DocumentEventMap[K]) => void) => {
      document.addEventListener(type, fn);
      cleanups.push(() => document.removeEventListener(type, fn));
    };

    if (new URLSearchParams(location.search).get("capture") === "1") root.classList.add("screenshot-mode");

    // Mobile menu
    const menu = document.querySelector<HTMLButtonElement>(".menu");
    const nav = document.querySelector<HTMLElement>("#navigation");
    if (menu && nav) {
      const setOpen = (open: boolean) => {
        nav.classList.toggle("open", open);
        menu.setAttribute("aria-expanded", String(open));
        menu.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      };
      menu.onclick = () => setOpen(!nav.classList.contains("open"));
      nav.querySelectorAll("a").forEach(a => (a.onclick = () => setOpen(false)));
    }

    // Warranty dropdown
    const dropdowns = [...document.querySelectorAll<HTMLDetailsElement>(".sv-dropdown")];
    dropdowns.forEach(d => (d.onkeydown = e => { if (e.key === "Escape") d.open = false; }));
    // The header persists across product pages, so close a menu once one of its links is chosen.
    dropdowns.forEach(d => d.querySelectorAll<HTMLAnchorElement>(":scope > div a").forEach(a => {
      const close = () => { d.open = false; };
      a.addEventListener("click", close);
      cleanups.push(() => a.removeEventListener("click", close));
    }));
    if (matchMedia("(hover: hover) and (pointer: fine)").matches) {
      let closeTimer = 0;
      cleanups.push(() => clearTimeout(closeTimer));
      dropdowns.forEach(d => {
        d.onmouseenter = () => { clearTimeout(closeTimer); dropdowns.forEach(o => { o.open = o === d; }); };
        d.onmouseleave = () => { closeTimer = window.setTimeout(() => { d.open = false; }, 200); };
        // Hover already opened it; a mouse click must not toggle it shut. Keyboard (detail 0) still toggles.
        const summary = d.querySelector("summary");
        if (summary) summary.onclick = e => { if (e.detail > 0) { e.preventDefault(); d.open = true; } };
      });
    }
    onDoc("click", e => {
      dropdowns.forEach(d => { if (d.open && !d.contains(e.target as Node)) d.open = false; });
    });

    // Header state
    const header = document.querySelector(".sv-header");
    const onScroll = () => header?.classList.toggle("is-scrolled", scrollY > 24);
    on(window, "scroll", onScroll, { passive: true });
    onScroll();

    const reduceQuery = matchMedia("(prefers-reduced-motion: reduce)");
    const capture = root.classList.contains("screenshot-mode");

    // presentation.js reveals
    let storyObserver: IntersectionObserver | undefined;
    if (!reduceQuery.matches && "IntersectionObserver" in window) {
      const targets = document.querySelectorAll<HTMLElement>(".window-story-grid>div");
      storyObserver = new IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          storyObserver!.unobserve(entry.target);
        }
      }, { threshold: .08, rootMargin: "0px 0px 20px 0px" });
      targets.forEach((t, i) => {
        t.classList.add("reveal");
        t.style.setProperty("--reveal-delay", `${Math.min(i % 3, 2) * 65}ms`);
        storyObserver!.observe(t);
      });
      root.classList.add("motion-ready");
      cleanups.push(() => storyObserver?.disconnect());
    }

    if (reduceQuery.matches || capture) return () => cleanups.forEach(c => c());
    root.classList.add("sz-motion");
    cleanups.push(() => root.classList.remove("sz-motion"));

    // Scroll reveals and count-ups
    const revealTargets = document.querySelectorAll<HTMLElement>(
      ".sv-intro-copy>*,.sv-intro figure,.sv-facts h2,.sv-facts-inner>p,.sv-fact-grid>div,.sv-section-title,.sv-photo-card,.sv-registration h2,.sv-registration p,.sv-registration-actions a,.sv-contact>div,.page-intro>*",
    );
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add("sz-in"); io.unobserve(e.target); }
    }, { threshold: .12, rootMargin: "0px 0px -40px 0px" });
    revealTargets.forEach((el, i) => {
      el.classList.add("sz-reveal");
      el.style.setProperty("--sz-delay", `${(i % 4) * 90}ms`);
      io.observe(el);
    });
    const revealFallback = setTimeout(() => revealTargets.forEach(el => el.classList.add("sz-in")), 4000);
    cleanups.push(() => { io.disconnect(); clearTimeout(revealFallback); });

    type Counter = { el: Element; node: Text; pre: string; target: number; post: string; raf?: number };
    const counters: Counter[] = [];
    document.querySelectorAll(".sv-fact-grid strong,.sz-hero-strip b").forEach(el => {
      const node = [...el.childNodes].find((n): n is Text => n.nodeType === 3 && /\d/.test(n.textContent ?? ""));
      const match = node?.textContent?.match(/^(\s*)(\d+)([\s\S]*)$/);
      if (node && match) counters.push({ el, node, pre: match[1], target: +match[2], post: match[3] });
    });
    const co = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const c = counters.find(c => c.el === e.target);
        if (!c) continue;
        co.unobserve(e.target);
        const start = performance.now(), dur = 1100;
        const tick = (t: number) => {
          const p = Math.min(1, (t - start) / dur);
          c.node.textContent = c.pre + Math.round(c.target * (1 - Math.pow(1 - p, 3))) + c.post;
          if (p < 1) c.raf = requestAnimationFrame(tick);
        };
        c.raf = requestAnimationFrame(tick);
      }
    }, { threshold: .5 });
    counters.forEach(c => { c.node.textContent = c.pre + "0" + c.post; co.observe(c.el); });
    cleanups.push(() => {
      co.disconnect();
      counters.forEach(c => { if (c.raf) cancelAnimationFrame(c.raf); c.node.textContent = c.pre + c.target + c.post; });
    });

    const hero = document.querySelector<HTMLElement>(".sz-hero");
    if (!hero) return () => cleanups.forEach(c => c());

    // Parallax on the vehicle
    const car = hero.querySelector<HTMLElement>(".sz-car-wrap");
    if (car && matchMedia("(pointer:fine)").matches) {
      const move = (e: PointerEvent) => {
        const r = hero.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
        car.style.transform = `translate3d(${x * -18}px,${y * -10}px,0) rotateY(${x * 4}deg)`;
      };
      const leave = () => { car.style.transform = ""; };
      hero.addEventListener("pointermove", move);
      hero.addEventListener("pointerleave", leave);
      cleanups.push(() => { hero.removeEventListener("pointermove", move); hero.removeEventListener("pointerleave", leave); });
    }

    // Drifting light particles
    const canvas = hero.querySelector<HTMLCanvasElement>(".sz-particles");
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return () => cleanups.forEach(c => c());
    type Dot = { x: number; y: number; r: number; vx: number; vy: number; a: number; tw: number };
    let w = 0, h = 0, dots: Dot[] = [], raf = 0, visible = true;
    const resize = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(Math.min(90, w * h / 14000));
      dots = Array.from({ length: n }, () => ({
        x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.6 + .3,
        vx: (Math.random() - .5) * .15, vy: -(Math.random() * .25 + .05),
        a: Math.random() * .6 + .2, tw: Math.random() * Math.PI * 2,
      }));
    };
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const d of dots) {
        d.x += d.vx; d.y += d.vy; d.tw += .02;
        if (d.y < -5) { d.y = h + 5; d.x = Math.random() * w; }
        if (d.x < -5) d.x = w + 5;
        if (d.x > w + 5) d.x = -5;
        const a = d.a * (.6 + .4 * Math.sin(d.tw));
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${d.r > 1.3 ? "120,235,240" : "255,255,255"},${a})`;
        ctx.fill();
      }
      if (visible) raf = requestAnimationFrame(draw);
    };
    resize();
    on(window, "resize", resize);
    draw();
    const vo = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible) draw();
    });
    vo.observe(hero);
    onDoc("visibilitychange", () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && visible) draw();
    });
    cleanups.push(() => { vo.disconnect(); cancelAnimationFrame(raf); });

    return () => cleanups.forEach(c => c());
  }, []);

  return null;
}
