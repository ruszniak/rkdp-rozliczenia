// Złoty akcent sukcesu: krótki deszcz złotych iskier w kolorach logo RKDP + komunikat.
// Bez bibliotek – canvas na 1,6 s; wyłączony przy „ograniczonych animacjach”.
import { toast } from './ui.js';

let last = 0;
export function celebrate(msg) {
  if (Date.now() - last < 4000) return; last = Date.now();
  if (msg) toast(msg);
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const cv = document.createElement('canvas');
  cv.className = 'fx-canvas'; cv.setAttribute('aria-hidden', 'true');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  document.body.append(cv);
  const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
  const COLORS = ['#806341', '#A3814F', '#CFAE86', '#E0C098', '#F3E6D2'];
  const parts = Array.from({ length: 110 }, () => ({
    x: innerWidth / 2 + (Math.random() - .5) * innerWidth * .5, y: innerHeight * .35 + (Math.random() - .5) * 60,
    vx: (Math.random() - .5) * 9, vy: -Math.random() * 9 - 3, r: 2 + Math.random() * 3.5,
    c: COLORS[(Math.random() * COLORS.length) | 0], rot: Math.random() * 6, vr: (Math.random() - .5) * .3, sq: Math.random() < .5,
  }));
  const t0 = performance.now();
  const step = (t) => {
    const k = (t - t0) / 1600;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.globalAlpha = Math.max(0, 1 - k * k);
    for (const p of parts) {
      p.vy += .28; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c;
      if (p.sq) ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); else { ctx.beginPath(); ctx.arc(0, 0, p.r * .7, 0, 7); ctx.fill(); }
      ctx.restore();
    }
    if (k < 1) requestAnimationFrame(step); else cv.remove();
  };
  requestAnimationFrame(step);
}
