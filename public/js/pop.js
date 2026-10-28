// Wspólne małe menu podręczne (przy kratkach, osobach itp.) – zamykane kliknięciem obok albo Esc.
import { h } from './ui.js';

export function closePop() { const p = document.querySelector('.pop'); if (p) { p._cleanup?.(); p.remove(); } }
export function openPop(anchor, content) {
  closePop();
  const pop = h('div', { class: 'pop', role: 'menu' }, content);
  document.body.append(pop);
  const r = anchor.getBoundingClientRect();
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  pop.style.left = Math.max(8, Math.min(r.left, innerWidth - pw - 8)) + 'px';
  pop.style.top = (r.bottom + ph + 8 > innerHeight ? Math.max(8, r.top - ph - 6) : r.bottom + 6) + 'px';
  const close = (e) => {
    if (e.type === 'keydown' && e.key !== 'Escape') return;
    if (e.type === 'mousedown' && (pop.contains(e.target) || e.target.closest?.('.modal-back'))) return;
    closePop();
  };
  pop._cleanup = () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  setTimeout(() => { document.addEventListener('mousedown', close); document.addEventListener('keydown', close); });
  (pop.querySelector('textarea, input, .opt.cur, .opt') || pop).focus?.();
  return pop;
}
