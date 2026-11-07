(() => {
  const hero = document.querySelector('.sz-hero');
  const car = hero?.querySelector('.sz-car');
  if (!hero || !car) return;
  hero.querySelector('.sz-protection-rays')?.remove();
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.classList.add('sz-light-field');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  hero.append(svg);
  // Coordinates follow the existing car image; page layout is never changed.
  const targets = [
    ...Array.from({ length: 12 }, (_, i) => [.423 + i * .016, .495 + Math.sin(i * .4) * .012]),
    ...Array.from({ length: 10 }, (_, i) => [.265 + i * .023, .579 - i * .003]),
    ...Array.from({ length: 8 }, (_, i) => [.743 + i * .017, .685 - i * .005]),
  ];
  function render() {
    const bounds = hero.getBoundingClientRect();
    const image = car.getBoundingClientRect();
    if (!bounds.width || !image.width) return;
    svg.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
    svg.innerHTML = `<defs>
      <linearGradient id="sz-incoming-light" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
        <stop stop-color="#fff4d9" stop-opacity=".02"/><stop offset=".3" stop-color="#ffe3ad" stop-opacity=".45"/>
        <stop offset=".8" stop-color="#ffde9a" stop-opacity=".85"/><stop offset="1" stop-color="#fffbea"/>
      </linearGradient>
      <linearGradient id="sz-reflected-light" x1="0" y1="1" x2="1" y2="0" gradientUnits="objectBoundingBox">
        <stop stop-color="#cffff9"/><stop offset=".35" stop-color="#7cfff1" stop-opacity=".75"/>
        <stop offset="1" stop-color="#62e5f2" stop-opacity="0"/>
      </linearGradient>
    </defs>`;
    targets.forEach(([u, v], index) => {
      const x = image.left - bounds.left + image.width * u;
      const y = image.top - bounds.top + image.height * v;
      const topX = Math.min(bounds.width * 1.04, x + y * .28 + (index % 4) * 7);
      const reflectedX = x + y * (.64 + (index % 5) * .035);
      const incoming = `M${topX.toFixed(1)} -20L${x.toFixed(1)} ${y.toFixed(1)}`;
      const reflected = `M${x.toFixed(1)} ${y.toFixed(1)}Q${(x + y * .3).toFixed(1)} ${(y * .46).toFixed(1)} ${reflectedX.toFixed(1)} -30`;
      const group = document.createElementNS(ns, 'g');
      group.style.setProperty('--ray-delay', `${-(index * .41 + .7).toFixed(2)}s`);
      group.style.setProperty('--ray-duration', `${(4.2 + (index % 5) * .23).toFixed(2)}s`);
      for (const [d, className] of [[incoming, 'sz-light-beam sz-light-soft'], [incoming, 'sz-light-beam'], [reflected, 'sz-light-reflection']]) {
        const path = document.createElementNS(ns, 'path');
        path.setAttribute('d', d);
        path.setAttribute('pathLength', '1000');
        path.setAttribute('class', className);
        group.append(path);
      }
      const impact = document.createElementNS(ns, 'circle');
      impact.setAttribute('cx', x.toFixed(1));
      impact.setAttribute('cy', y.toFixed(1));
      impact.setAttribute('r', index % 3 === 0 ? '2' : '1.2');
      impact.classList.add('sz-light-impact');
      group.append(impact);
      svg.append(group);
    });
  }
  let frame;
  function schedule() { cancelAnimationFrame(frame); frame = requestAnimationFrame(render); }
  car.addEventListener('load', schedule);
  new ResizeObserver(schedule).observe(hero);
  new ResizeObserver(schedule).observe(car);
  document.fonts?.ready.then(schedule);
  schedule();
})();
