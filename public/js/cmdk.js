// Szybkie wyszukiwanie (Ctrl+K / ⌘K): klienci RKDP i M2 TAX, sprawy, zgłoszenia, zakładki, narzędzia i akcje.
import { h, toast, toastAction, fail, defaultPeriod, periodLabel } from './ui.js';
import { sb, state, hasModule, isJpkOnly } from './store.js';
import { toggleTheme, getTheme, getDensity, setDensity } from './motyw.js';
import { STATUS } from './dict.js';
import { canInstall, promptInstall } from './push.js';

const IC = {
  go: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  client: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  matter: '<path d="M4 7h16v13H4z"/><path d="M9 7V4h6v3"/>',
  ticket: '<path d="M4 6h16v12H4z"/><path d="m4 6 8 7 8-7"/>',
  tool: '<path d="M14 7l3-3 3 3-3 3"/><path d="M4 20l10-10"/>',
  theme: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  install: '<path d="M12 3v12m0 0-4-4m4 4 4-4"/><path d="M5 21h14"/>',
  recent: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  bolt: '<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>',
};

// ostatnio otwierane (na tym urządzeniu)
const RKEY = 'rkdp_recent';
export function rememberRecent(item) {
  try {
    const list = JSON.parse(localStorage.getItem(RKEY) || '[]').filter(x => x.href !== item.href);
    list.unshift({ label: item.label, href: item.href, meta: item.meta || '', icon: item.icon || 'client', panel: item.panel || null });
    localStorage.setItem(RKEY, JSON.stringify(list.slice(0, 8)));
  } catch { /* */ }
}
const recents = () => { try { return JSON.parse(localStorage.getItem(RKEY) || '[]').map(x => ({ ...x, group: 'Ostatnio otwierane', icon: 'recent' })); } catch { return []; } };

// polecenia: „nowe zgłoszenie kowalski”, „oznacz pit nowak”, „poproś o dokumenty nowak”
const TASK_WORDS = [[/^(pit|cit|pit\/cit|zaliczka)$/, 'pit_cit'], [/^vat$/, 'vat'], [/^jpk$/, 'jpk'], [/^saldeo$/, 'saldeo'], [/^(rewizor|ksiegowanie|ksiegi)$/, 'ksiegowanie'],
  [/^(pit4|pit-4)$/, 'pit4'], [/^(wyciagi|wb|bank)$/, 'wb'], [/^zus$/, 'zus_wyslany'], [/^(podany|zus_podany)$/, 'zus_podany']];
const STOPW = new Set(['dla', 'u', 'o', 'w', 'dokumenty', 'dokumentow', 'jako', 'zrobione', 'zrobiony', 'klienta', 'klient', 'min', 'minut']);
function commandItems(query, data) {
  const toks = norm(query).split(/\s+/).filter(Boolean);
  if (!toks.length || !hasModule('rozliczenia')) return [];
  const verb = toks[0], second = toks[1] || '';
  let kind = null, rest = toks.slice(1);
  if (verb === 'nowe' && /^zglosz/.test(second)) { kind = 'ticket'; rest = toks.slice(2); }
  else if (/^zglos/.test(verb)) kind = 'ticket';
  else if (/^oznacz|^zrob/.test(verb)) kind = 'mark';
  else if (/^popros|^prosba/.test(verb)) kind = 'docs';
  if (!kind) return [];
  let task = null;
  rest = rest.filter(t => {
    if (kind === 'mark' && !task) { const m = TASK_WORDS.find(([re]) => re.test(t)); if (m) { task = m[1]; return false; } }
    return !STOPW.has(t);
  });
  const clients = data.filter(d => d.group === 'Klienci RKDP' && rest.length && rest.every(t => d._n.includes(t))).slice(0, 5);
  const label = state.taskTypes.find(t => t.code === task)?.label;
  const out = [];
  for (const c of clients) {
    const cl = { id: c.href.split('/').pop(), name: c.label, email: c.email || null };
    if (kind === 'ticket') out.push({ group: 'Polecenia', icon: 'bolt', label: `Nowe zgłoszenie dla: ${c.label}`, run: async () => { const z = await import('./views/zgloszenia.js'); z.newTicketDialog({ client: cl }).catch(fail); } });
    if (kind === 'docs') out.push({ group: 'Polecenia', icon: 'bolt', label: `Wyślij wiadomość: ${c.label}`, meta: periodLabel(defaultPeriod()), run: async () => { const { openDocRequest } = await import('./prosba.js'); const { data: full } = await sb.from('clients').select('id,name,email').eq('id', cl.id).maybeSingle(); openDocRequest(full || cl, defaultPeriod(), []); } });
    if (kind === 'mark') out.push({ group: 'Polecenia', icon: 'bolt', label: task ? `Oznacz „${label}” jako zrobione – ${c.label}` : `Oznacz… (dopisz: pit, vat, jpk, saldeo, rewizor, zus, pit4) – ${c.label}`, meta: periodLabel(defaultPeriod()), run: () => task ? markTask(cl, task, label) : null });
  }
  if (!clients.length) out.push({ group: 'Polecenia', icon: 'bolt', label: rest.length ? 'Nie znaleziono klienta – dopisz fragment nazwy' : 'Dopisz nazwę klienta…', run: () => null });
  return out;
}
async function markTask(c, code, label) {
  const per = defaultPeriod() + '-01';
  const { data: e, error } = await sb.from('checklist_entries').select('id,status').eq('client_id', c.id).eq('period', per).eq('task_code', code).maybeSingle();
  if (error) return fail(error);
  if (!e) return toast(`${c.name}: brak kratki „${label}” w ${periodLabel(defaultPeriod()).toLowerCase()}`, true);
  const before = e.status;
  const { error: e2 } = await sb.from('checklist_entries').update({ status: 'done' }).eq('id', e.id);
  if (e2) return fail(e2);
  toastAction(`${c.name} · ${label}: ${STATUS.done.label}`, 'Cofnij', async () => { await sb.from('checklist_entries').update({ status: before }).eq('id', e.id); toast('Cofnięto'); });
}
const icon = k => { const s = h('span', { class: 'i', 'aria-hidden': 'true' }); s.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${IC[k]}</svg>`; return s; };
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');

function staticItems() {
  const go = (label, href, meta = '') => ({ group: 'Przejdź do', label, meta, icon: 'go', run: () => { location.hash = href; } });
  const tool = (label, href, meta = '') => ({ group: 'Narzędzia', label, meta, icon: 'tool', run: () => { location.hash = href; } });
  const out = [];
  if (isJpkOnly()) out.push(tool('Podgląd JPK_CIT', '#/jpk'), go('Regulamin', '#/regulamin'));
  else {
    if (hasModule('rozliczenia')) out.push(go('Dziś – moja lista na dzisiaj', '#/pulpit?widok=dzis', 'RKDP'), go('Kalendarz obowiązków klientów', '#/terminy', 'RKDP'), go('Zamknięcie roku', '#/zamkniecie-roku', 'RKDP'),
      ...(state.me?.role === 'admin' ? [go('Raport miesięczny dla zarządu', '#/raport', 'RKDP')] : []),
      { group: 'Akcje', label: 'Nowe zgłoszenie', meta: 'albo: nowe zgłoszenie <klient>', icon: 'bolt', run: async () => { const z = await import('./views/zgloszenia.js'); z.newTicketDialog().catch(fail); } },
      go('Pulpit', '#/pulpit', 'RKDP'), go('Rozliczenia', '#/rozliczenia', 'RKDP'), go('Klienci', '#/klienci', 'RKDP'), go('Rozmowy', '#/rozmowy', 'RKDP'), go('Informacja do klientów (e-mail zbiorczy)', '#/informacje', 'RKDP'), go('Dokumenty', '#/dokumenty', 'RKDP'),
      tool('Protokół ZZW – zatwierdzenie sprawozdania', '#/sprawozdania/nowy'), tool('Oferta na usługi', '#/oferty/nowa'), tool('Weryfikacja AML', '#/aml'));
    if (hasModule('doradztwo')) out.push(go('Pulpit M2 TAX', '#/doradztwo', 'M2 TAX'), go('Sprawy', '#/doradztwo/sprawy', 'M2 TAX'), go('Klienci M2 TAX', '#/doradztwo/klienci', 'M2 TAX'),
      go('Dokumenty – wzory pism', '#/doradztwo/dokumenty', 'M2 TAX'), go('Zlecenia i umowy', '#/doradztwo/zlecenia', 'M2 TAX'), go('Zgłoszenia M2 TAX', '#/doradztwo/zgloszenia', 'M2 TAX'));
    out.push(tool('Kalkulator: JDG czy spółka z o.o.?', hasModule('rozliczenia') ? '#/kalkulator' : '#/doradztwo/kalkulator'), tool('Wzory umów i uchwał', hasModule('rozliczenia') ? '#/wzory' : '#/doradztwo/wzory'),
      tool('Podgląd JPK_CIT', hasModule('rozliczenia') ? '#/jpk' : '#/doradztwo/jpk'), go('Lista obecności', '#/obecnosc'), go('Mój profil i powiadomienia', '#/profil'), go('Regulamin', '#/regulamin'));
    if (state.me?.role === 'admin') out.push(go('Zespół i ustawienia', '#/zespol'));
  }
  out.push({ group: 'Akcje', label: getTheme() === 'dark' ? 'Przełącz na motyw jasny' : 'Przełącz na motyw ciemny', meta: 'Ctrl Shift L', icon: 'theme', run: toggleTheme });
  out.push({ group: 'Akcje', label: getDensity() === 'compact' ? 'Tabele: wygodne odstępy' : 'Tabele: tryb kompaktowy', meta: 'gęstość', icon: 'tool', run: () => { setDensity(getDensity() === 'compact' ? 'comfort' : 'compact'); toast(getDensity() === 'compact' ? 'Tabele kompaktowe' : 'Tabele z wygodnymi odstępami'); } });
  if (canInstall()) out.push({ group: 'Akcje', label: 'Zainstaluj aplikację na tym urządzeniu', icon: 'install', run: () => promptInstall() });
  return out;
}

// dane do wyszukiwania – pobierane przy pierwszym otwarciu i odświeżane co 2 minuty
let cache = null, cacheAt = 0;
async function loadData() {
  if (cache && Date.now() - cacheAt < 120000) return cache;
  const q = [];
  const rk = hasModule('rozliczenia') && !isJpkOnly(), m2 = hasModule('doradztwo');
  q.push(rk ? sb.from('clients').select('id,name,nip,status,email').order('name').limit(2000) : null);
  q.push(m2 ? sb.from('m2_clients').select('id,name,nip').order('name').limit(2000) : null);
  q.push(m2 ? sb.from('m2_matters').select('id,number,title,status').order('opened_at', { ascending: false }).limit(1000) : null);
  q.push(rk || m2 ? sb.from('rkdp_tickets').select('id,no,title,module,status').order('created_at', { ascending: false }).limit(600) : null);
  const [c, mc, mm, tk] = await Promise.all(q.map(p => p ? p.then(r => r.data || [], () => []) : Promise.resolve([])));
  const out = [
    ...c.map(x => ({ group: 'Klienci RKDP', label: x.name, meta: x.nip ? `NIP ${x.nip}` : (x.status || ''), extra: x.nip, email: x.email, icon: 'client', href: `#/klient/${x.id}`, panel: x.id })),
    ...mc.map(x => ({ group: 'Klienci M2 TAX', label: x.name, meta: x.nip ? `NIP ${x.nip}` : '', extra: x.nip, icon: 'client', href: `#/doradztwo/klient/${x.id}` })),
    ...mm.map(x => ({ group: 'Sprawy M2 TAX', label: `${x.number} – ${x.title}`, meta: x.status || '', icon: 'matter', href: `#/doradztwo/sprawa/${x.id}` })),
    ...tk.filter(x => (x.module === 'm2' ? m2 : rk)).map(x => ({ group: 'Zgłoszenia', label: `#${x.no} ${x.title}`, meta: x.status === 'zrobione' ? 'zrobione' : (x.module === 'm2' ? 'M2 TAX' : 'RKDP'), icon: 'ticket', href: x.module === 'm2' ? `#/doradztwo/zgloszenia/${x.id}` : `#/zgloszenia/${x.id}` })),
  ];
  out.forEach(o => { o._n = norm(`${o.label} ${o.extra || ''}`); });
  cache = out; cacheAt = Date.now();
  return out;
}

const LIMITS = { 'Polecenia': 6, 'Ostatnio otwierane': 6, 'Przejdź do': 6, 'Narzędzia': 6, 'Akcje': 3, 'Klienci RKDP': 7, 'Klienci M2 TAX': 6, 'Sprawy M2 TAX': 6, 'Zgłoszenia': 6 };
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
const ORDER = ['Polecenia', 'Ostatnio otwierane', 'Akcje', 'Przejdź do', 'Narzędzia', 'Klienci RKDP', 'Klienci M2 TAX', 'Sprawy M2 TAX', 'Zgłoszenia'];

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
  const input = h('input', { type: 'text', placeholder: 'Szukaj albo wpisz polecenie, np. „oznacz pit kowalski”…', 'aria-label': 'Szukaj', autocomplete: 'off', spellcheck: 'false' });
  const list = h('div', { class: 'cmdk-list', role: 'listbox' });
  let items = staticItems(), data = [], shown = [], active = 0;
  const close = () => { back.remove(); openEl = null; document.removeEventListener('keydown', onKey, true); prevFocus?.focus?.(); };
  const run = async it => {
    if (!it) return; close();
    if (it.href) rememberRecent(it);
    if (it.run) return it.run();
    // klient RKDP: karta w panelu bocznym (Shift+Enter – pełna karta)
    if (it.panel && !runFull && hasModule('rozliczenia')) { const { openClientPanel } = await import('./panel.js'); return openClientPanel(it.panel); }
    location.hash = it.href;
  };
  let runFull = false;
  const draw = () => {
    const q = input.value.trim();
    shown = q ? [...commandItems(q, data), ...search([...items, ...data], q)] : [...recents(), ...items];
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
    else if (e.key === 'Enter' && document.activeElement === input) { e.preventDefault(); runFull = e.shiftKey; run(shown[active]); }
  };
  input.addEventListener('input', () => { active = 0; draw(); });
  const back = h('div', { class: 'cmdk-back', onclick: e => { if (e.target === back) close(); } },
    h('div', { class: 'cmdk', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Szybkie wyszukiwanie' },
      h('div', { class: 'cmdk-in' }, (() => { const s = h('span', { 'aria-hidden': 'true' }); s.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>'; return s; })(), input, h('kbd', {}, 'Esc')),
      list,
      h('div', { class: 'cmdk-foot' }, h('span', {}, '↑ ↓ wybór'), h('span', {}, 'Enter otwórz'), h('span', {}, 'Shift+Enter pełna karta'), h('span', {}, 'Esc zamknij'),
        h('span', { style: { marginLeft: 'auto' }, 'data-tip': 'Polecenia: „nowe zgłoszenie kowalski”, „oznacz pit nowak”, „poproś nowak”' }, 'Polecenia: nowe zgłoszenie · oznacz · poproś'))));
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
