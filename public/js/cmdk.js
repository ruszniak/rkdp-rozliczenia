// Szybkie wyszukiwanie (Ctrl+K / ⌘K): klienci RKDP i M2 TAX, sprawy, zgłoszenia, zakładki, narzędzia i akcje.
import { h } from './ui.js';
import { sb, state, hasModule, isJpkOnly } from './store.js';
import { toggleTheme, getTheme } from './motyw.js';
import { canInstall, promptInstall } from './push.js';

const IC = {
  go: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  client: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  matter: '<path d="M4 7h16v13H4z"/><path d="M9 7V4h6v3"/>',
  ticket: '<path d="M4 6h16v12H4z"/><path d="m4 6 8 7 8-7"/>',
  tool: '<path d="M14 7l3-3 3 3-3 3"/><path d="M4 20l10-10"/>',
  theme: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  install: '<path d="M12 3v12m0 0-4-4m4 4 4-4"/><path d="M5 21h14"/>',
};
const icon = k => { const s = h('span', { class: 'i', 'aria-hidden': 'true' }); s.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${IC[k]}</svg>`; return s; };
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');

function staticItems() {
  const go = (label, href, meta = '') => ({ group: 'Przejdź do', label, meta, icon: 'go', run: () => { location.hash = href; } });
  const tool = (label, href, meta = '') => ({ group: 'Narzędzia', label, meta, icon: 'tool', run: () => { location.hash = href; } });
  const out = [];
  if (isJpkOnly()) out.push(tool('Podgląd JPK_CIT', '#/jpk'), go('Regulamin', '#/regulamin'));
  else {
    if (hasModule('rozliczenia')) out.push(go('Pulpit', '#/pulpit', 'RKDP'), go('Rozliczenia', '#/rozliczenia', 'RKDP'), go('Klienci', '#/klienci', 'RKDP'), go('Zgłoszenia', '#/zgloszenia', 'RKDP'), go('Dokumenty', '#/dokumenty', 'RKDP'),
      tool('Protokół ZZW – zatwierdzenie sprawozdania', '#/sprawozdania/nowy'), tool('Oferta na usługi', '#/oferty/nowa'), tool('Weryfikacja AML', '#/aml'));
    if (hasModule('doradztwo')) out.push(go('Pulpit M2 TAX', '#/doradztwo', 'M2 TAX'), go('Sprawy', '#/doradztwo/sprawy', 'M2 TAX'), go('Klienci M2 TAX', '#/doradztwo/klienci', 'M2 TAX'), go('Kalendarz', '#/doradztwo/kalendarz', 'M2 TAX'),
      go('Dokumenty – wzory pism', '#/doradztwo/dokumenty', 'M2 TAX'), go('Zlecenia i umowy', '#/doradztwo/zlecenia', 'M2 TAX'), go('Zgłoszenia M2 TAX', '#/doradztwo/zgloszenia', 'M2 TAX'));
    out.push(tool('Kalkulator: JDG czy spółka z o.o.?', hasModule('rozliczenia') ? '#/kalkulator' : '#/doradztwo/kalkulator'), tool('Wzory umów i uchwał', hasModule('rozliczenia') ? '#/wzory' : '#/doradztwo/wzory'),
      tool('Podgląd JPK_CIT', hasModule('rozliczenia') ? '#/jpk' : '#/doradztwo/jpk'), go('Lista obecności', '#/obecnosc'), go('Mój profil i powiadomienia', '#/profil'), go('Regulamin', '#/regulamin'));
    if (state.me?.role === 'admin') out.push(go('Zespół i ustawienia', '#/zespol'));
  }
  out.push({ group: 'Akcje', label: getTheme() === 'dark' ? 'Przełącz na motyw jasny' : 'Przełącz na motyw ciemny', meta: 'Ctrl Shift L', icon: 'theme', run: toggleTheme });
  if (canInstall()) out.push({ group: 'Akcje', label: 'Zainstaluj aplikację na tym urządzeniu', icon: 'install', run: () => promptInstall() });
  return out;
}

// dane do wyszukiwania – pobierane przy pierwszym otwarciu i odświeżane co 2 minuty
let cache = null, cacheAt = 0;
async function loadData() {
  if (cache && Date.now() - cacheAt < 120000) return cache;
  const q = [];
  const rk = hasModule('rozliczenia') && !isJpkOnly(), m2 = hasModule('doradztwo');
  q.push(rk ? sb.from('clients').select('id,name,nip,status').order('name').limit(2000) : null);
  q.push(m2 ? sb.from('m2_clients').select('id,name,nip').order('name').limit(2000) : null);
  q.push(m2 ? sb.from('m2_matters').select('id,number,title,status').order('opened_at', { ascending: false }).limit(1000) : null);
  q.push(rk || m2 ? sb.from('rkdp_tickets').select('id,no,title,module,status').order('created_at', { ascending: false }).limit(600) : null);
  const [c, mc, mm, tk] = await Promise.all(q.map(p => p ? p.then(r => r.data || [], () => []) : Promise.resolve([])));
  const out = [
    ...c.map(x => ({ group: 'Klienci RKDP', label: x.name, meta: x.nip ? `NIP ${x.nip}` : (x.status || ''), extra: x.nip, icon: 'client', href: `#/klient/${x.id}` })),
    ...mc.map(x => ({ group: 'Klienci M2 TAX', label: x.name, meta: x.nip ? `NIP ${x.nip}` : '', extra: x.nip, icon: 'client', href: `#/doradztwo/klient/${x.id}` })),
    ...mm.map(x => ({ group: 'Sprawy M2 TAX', label: `${x.number} – ${x.title}`, meta: x.status || '', icon: 'matter', href: `#/doradztwo/sprawa/${x.id}` })),
    ...tk.filter(x => (x.module === 'm2' ? m2 : rk)).map(x => ({ group: 'Zgłoszenia', label: `#${x.no} ${x.title}`, meta: x.status === 'zrobione' ? 'zrobione' : (x.module === 'm2' ? 'M2 TAX' : 'RKDP'), icon: 'ticket', href: x.module === 'm2' ? `#/doradztwo/zgloszenia/${x.id}` : `#/zgloszenia/${x.id}` })),
  ];
  out.forEach(o => { o._n = norm(`${o.label} ${o.extra || ''}`); });
  cache = out; cacheAt = Date.now();
  return out;
}

const LIMITS = { 'Przejdź do': 6, 'Narzędzia': 6, 'Akcje': 3, 'Klienci RKDP': 7, 'Klienci M2 TAX': 6, 'Sprawy M2 TAX': 6, 'Zgłoszenia': 6 };
function search(items, query) {
  const toks = norm(query).split(/\s+/).filter(Boolean);
  if (!toks.length) return items.filter(i => !i.href || false);
  const scored = [];
  for (const it of items) {
    const n = it._n || (it._n = norm(it.label));
    if (!toks.every(t => n.includes(t))) continue;
    let s = 0; for (const t of toks) { const i = n.indexOf(t); s += i === 0 ? 3 : n[i - 1] === ' ' ? 2 : 1; }
    scored.push([s, it]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  const per = {}; const out = [];
  for (const [, it] of scored) { per[it.group] = (per[it.group] || 0) + 1; if (per[it.group] <= (LIMITS[it.group] || 6)) out.push(it); }
  return out;
}
const ORDER = ['Akcje', 'Przejdź do', 'Narzędzia', 'Klienci RKDP', 'Klienci M2 TAX', 'Sprawy M2 TAX', 'Zgłoszenia'];

function highlight(label, query) {
  const toks = norm(query).split(/\s+/).filter(Boolean);
  const n = norm(label); const t = toks.find(x => n.includes(x));
  if (!t) return [label];
  const i = n.indexOf(t);
  return [label.slice(0, i), h('mark', {}, label.slice(i, i + t.length)), label.slice(i + t.length)];
}

let openEl = null;
export function openCmdk() {
  if (openEl) { openEl.querySelector('input')?.focus(); return; }
  const prevFocus = document.activeElement;
  const input = h('input', { type: 'text', placeholder: 'Szukaj klienta, NIP, sprawy, zgłoszenia, narzędzia…', 'aria-label': 'Szukaj', autocomplete: 'off', spellcheck: 'false' });
  const list = h('div', { class: 'cmdk-list', role: 'listbox' });
  let items = staticItems(), data = [], shown = [], active = 0;
  const close = () => { back.remove(); openEl = null; document.removeEventListener('keydown', onKey, true); prevFocus?.focus?.(); };
  const run = it => { if (!it) return; close(); if (it.run) it.run(); else if (it.href) location.hash = it.href; };
  const draw = () => {
    const q = input.value.trim();
    shown = q ? search([...items, ...data], q) : items;
    shown = [...shown].sort((a, b) => ORDER.indexOf(a.group) - ORDER.indexOf(b.group));
    if (active >= shown.length) active = 0;
    if (!shown.length) { list.replaceChildren(h('div', { class: 'cmdk-empty' }, data.length || !q ? 'Nic nie znaleziono.' : 'Wczytywanie…')); return; }
    const nodes = []; let g = null;
    shown.forEach((it, i) => {
      if (it.group !== g) { g = it.group; nodes.push(h('div', { class: 'cmdk-sec' }, g)); }
      nodes.push(h('button', { type: 'button', role: 'option', class: 'cmdk-item' + (i === active ? ' on' : ''), 'aria-selected': i === active ? 'true' : 'false',
        onmousemove: () => { if (active !== i) { active = i; mark(); } }, onclick: () => run(it) },
        icon(it.icon), h('span', { class: 't' }, ...highlight(it.label, q)), it.meta ? h('span', { class: 'm' }, it.meta) : null));
    });
    list.replaceChildren(...nodes);
  };
  const mark = () => list.querySelectorAll('.cmdk-item').forEach((b, i) => { b.classList.toggle('on', i === active); b.setAttribute('aria-selected', i === active ? 'true' : 'false'); if (i === active) b.scrollIntoView({ block: 'nearest' }); });
  const onKey = e => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(shown.length - 1, active + 1); mark(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); mark(); }
    else if (e.key === 'Enter' && document.activeElement === input) { e.preventDefault(); run(shown[active]); }
  };
  input.addEventListener('input', () => { active = 0; draw(); });
  const back = h('div', { class: 'cmdk-back', onclick: e => { if (e.target === back) close(); } },
    h('div', { class: 'cmdk', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Szybkie wyszukiwanie' },
      h('div', { class: 'cmdk-in' }, (() => { const s = h('span', { 'aria-hidden': 'true' }); s.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>'; return s; })(), input, h('kbd', {}, 'Esc')),
      list,
      h('div', { class: 'cmdk-foot' }, h('span', {}, '↑ ↓ wybór'), h('span', {}, 'Enter otwórz'), h('span', {}, 'Esc zamknij'), h('span', { style: { marginLeft: 'auto' } }, 'Ctrl K – w każdej chwili'))));
  document.body.append(back); openEl = back;
  document.addEventListener('keydown', onKey, true);
  draw(); input.focus();
  loadData().then(d => { data = d; if (openEl === back) draw(); }).catch(() => {});
}

// skróty globalne: Ctrl/⌘+K – wyszukiwanie, Ctrl+Shift+L – motyw
export function initShortcuts() {
  document.addEventListener('keydown', e => {
    if (!state.me) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && k === 'k') { e.preventDefault(); openCmdk(); }
    else if ((e.ctrlKey || e.metaKey) && e.shiftKey && k === 'l') { e.preventDefault(); toggleTheme(); }
  });
}
