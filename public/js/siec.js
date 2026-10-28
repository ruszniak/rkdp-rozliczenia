// Żywa „sieć” w kolorach RKDP (złoto na grafitowym tle): punkty powoli dryfują, łączą się liniami, gdy są blisko,
// i lekko przyciągają do kursora. Bez bibliotek. Przy ograniczonych animacjach w systemie zostaje statyczne tło (siec.svg).
export function liveNetwork(host) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = document.createElement('canvas');
  cv.className = 'siec-live'; cv.setAttribute('aria-hidden', 'true');
  host.prepend(cv); host.classList.add('live');
  const ctx = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1, pts = [], raf = 0, last = 0;
  const mouse = { x: -1e4, y: -1e4 };
  const LINK = 150, GOLD = '207,174,134';

  function resize() {
    const r = host.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2); W = r.width; H = r.height;
    cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(Math.min(110, Math.max(40, W * H / 9000)));
    while (pts.length < n) pts.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .18, vy: (Math.random() - .5) * .18, r: Math.random() < .12 ? 2.4 : 1.3, ph: Math.random() * 6.28 });
    pts.length = n;
  }
  function frame(t) {
    if (!cv.isConnected) { cancelAnimationFrame(raf); removeEventListener('resize', resize); return; }
    raf = requestAnimationFrame(frame);
    if (document.hidden) return;
    const dt = Math.min(48, t - (last || t)) / 16.7; last = t;
    ctx.clearRect(0, 0, W, H);
    for (const p of pts) {
      // delikatne przyciąganie do kursora
      const mx = mouse.x - p.x, my = mouse.y - p.y, md = Math.hypot(mx, my);
      if (md < 220 && md > 1) { p.vx += mx / md * .004; p.vy += my / md * .004; }
      p.vx *= .995; p.vy *= .995;
      const sp = Math.hypot(p.vx, p.vy); if (sp < .06) { p.vx += (Math.random() - .5) * .02; p.vy += (Math.random() - .5) * .02; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.x < -20) p.x = W + 20; else if (p.x > W + 20) p.x = -20;
      if (p.y < -20) p.y = H + 20; else if (p.y > H + 20) p.y = -20;
    }
    ctx.lineWidth = .7;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      for (let j = i + 1; j < pts.length; j++) {
        const b = pts[j], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < LINK) { ctx.strokeStyle = `rgba(${GOLD},${(1 - d / LINK) * .42})`; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      }
      const md = Math.hypot(a.x - mouse.x, a.y - mouse.y);
      if (md < 190) { ctx.strokeStyle = `rgba(${GOLD},${(1 - md / 190) * .45})`; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke(); }
    }
    for (const p of pts) {
      const tw = .55 + .45 * Math.sin(t / 900 + p.ph);
      ctx.fillStyle = `rgba(${GOLD},${(p.r > 2 ? .85 : .6) * tw})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
      if (p.r > 2) { ctx.fillStyle = `rgba(${GOLD},${.08 * tw})`; ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, 6.283); ctx.fill(); }
    }
  }
  host.addEventListener('pointermove', e => { const r = host.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; });
  host.addEventListener('pointerleave', () => { mouse.x = mouse.y = -1e4; });
  addEventListener('resize', resize);
  resize();
  raf = requestAnimationFrame(frame);
}
