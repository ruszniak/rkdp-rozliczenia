// Małe wykresy w kafelkach: linia trendu (sparkline) i znacznik zmiany względem poprzedniego okresu.
import { h } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };

// values: liczby (np. % rozliczonych) od najstarszego do najnowszego; labels: opisy punktów do podpowiedzi
export function sparkline(values, { w = 96, h: ht = 28, labels = [], max = null } = {}) {
  const vs = values.map(v => (v == null || isNaN(v) ? null : +v));
  const pts = vs.map((v, i) => [i, v]).filter(p => p[1] != null);
  const svg = el('svg', { viewBox: `0 0 ${w} ${ht}`, width: w, height: ht, class: 'spark', 'aria-hidden': 'true' });
  if (pts.length < 2) return svg;
  const hi = max ?? Math.max(...pts.map(p => p[1])), lo = Math.min(0, ...pts.map(p => p[1]));
  const x = i => 2 + (i * (w - 4)) / (vs.length - 1), y = v => ht - 3 - ((v - lo) / ((hi - lo) || 1)) * (ht - 6);
  const d = pts.map((p, k) => `${k ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ');
  const area = `${d} L${x(pts.at(-1)[0]).toFixed(1)},${ht} L${x(pts[0][0]).toFixed(1)},${ht} Z`;
  const gid = 'sg' + Math.random().toString(36).slice(2, 8);
  const defs = el('defs', {}), g = el('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 });
  g.append(el('stop', { offset: '0', 'stop-color': '#CFAE86', 'stop-opacity': '.45' }), el('stop', { offset: '1', 'stop-color': '#CFAE86', 'stop-opacity': '0' }));
  defs.append(g); svg.append(defs, el('path', { d: area, fill: `url(#${gid})` }), el('path', { d, fill: 'none', stroke: '#A3814F', 'stroke-width': '1.8', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  const last = pts.at(-1);
  svg.append(el('circle', { cx: x(last[0]).toFixed(1), cy: y(last[1]).toFixed(1), r: 2.6, fill: '#806341' }));
  if (labels.length) { const t = el('title', {}); t.textContent = labels.map((l, i) => `${l}: ${vs[i] == null ? '—' : Math.round(vs[i]) + '%'}`).join('\n'); svg.append(t); }
  return svg;
}

// zmiana względem poprzedniego okresu, np. +6 p.p.
export function delta(cur, prev, { unit = ' p.p.', label = '' } = {}) {
  if (cur == null || prev == null) return null;
  const d = Math.round(cur - prev);
  return h('span', { class: 'delta ' + (d > 0 ? 'up' : d < 0 ? 'down' : 'eq'), 'data-tip': label || null }, (d > 0 ? '▲ +' : d < 0 ? '▼ ' : '= ') + Math.abs(d) * (d < 0 ? 1 : 1) + unit);
}
