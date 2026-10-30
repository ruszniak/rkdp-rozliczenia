import { h, initials, toast, initTooltips, initMobileTables, ava } from './ui.js';
import { sb, state, hasModule, isJpkOnly, setStaleHandler, autoRefreshRoute, invalidateCache } from './store.js';
import { renderLogin } from './views/login.js';
import { TERMS_VERSION } from './regulamin.js';
import { registerSW } from './push.js';
import { openCmdk, initShortcuts } from './cmdk.js';
import { getTheme, toggleTheme, onThemeChange, ICON_MOON, ICON_SUN } from './motyw.js';
import { initPanelLinks, closePanel } from './panel.js';
const LIGHT_LOGO = src => src.replace('/m2tax-logo.png', '/m2tax-logo-light.png');
// widoki wczytywane na żądanie – pierwszy ekran ładuje tylko potrzebny kod, reszta dociąga się w tle
const lazy = (load, name) => (...a) => load().then(m => m[name](...a));
const renderRozliczenia = lazy(() => import('./views/rozliczenia.js'), 'renderRozliczenia');
const renderKlienci = lazy(() => import('./views/klienci.js'), 'renderKlienci');
const renderInformacje = lazy(() => import('./views/informacje.js'), 'renderInformacje');
const renderSprawozdania = lazy(() => import('./views/sprawozdania.js'), 'renderSprawozdania');
const renderDokumenty = lazy(() => import('./views/dokumenty.js'), 'renderDokumenty');
const renderProfil = lazy(() => import('./views/profil.js'), 'renderProfil');
const renderObecnosc = lazy(() => import('./views/obecnosc.js'), 'renderObecnosc');
const renderAml = lazy(() => import('./aml/aml.js'), 'renderAml');
const renderZgloszenia = lazy(() => import('./views/zgloszenia.js'), 'renderZgloszenia');
const renderRozmowy = lazy(() => import('./views/rozmowy.js'), 'renderRozmowy');
const renderPulpit = lazy(() => import('./views/pulpit.js'), 'renderPulpit');
const renderOferty = lazy(() => import('./views/oferty.js'), 'renderOferty');
const renderKlient = lazy(() => import('./views/klient.js'), 'renderKlient');
const renderZespol = lazy(() => import('./views/zespol.js'), 'renderZespol');
const renderM2 = lazy(() => import('./views/m2.js'), 'renderM2');
const renderJpk = lazy(() => import('./views/jpk.js'), 'renderJpk');
const renderEsf = lazy(() => import('./views/esf.js'), 'renderEsf');
// licznik nieprzeczytanych rozmów – moduł wątku ładowany w tle
const unreadBadgeEl = () => { const slot = h('span', { class: 'wt-uslot' }); import('./watek.js').then(m => slot.replaceWith(m.unreadBadge())).catch(() => {}); return slot; };
const renderRegulamin = lazy(() => import('./views/regulamin.js'), 'renderRegulamin');
const renderKalkulator = lazy(() => import('./views/kalkulator.js'), 'renderKalkulator');
const renderWzory = lazy(() => import('./views/wzory.js'), 'renderWzory');
const renderTerminy = lazy(() => import('./views/terminy.js'), 'renderTerminy');
const renderRok = lazy(() => import('./views/rok.js'), 'renderRok');
const renderRaport = lazy(() => import('./views/raport.js'), 'renderRaport');
// po wyświetleniu pierwszego ekranu pobieramy w tle pozostałe widoki, żeby przełączanie zakładek było natychmiastowe
const prefetchViews = () => {
  const go = () => {
    const list = [];
    if (isJpkOnly()) return;
    if (hasModule('rozliczenia')) list.push(() => import('./views/pulpit.js'), () => import('./views/rozliczenia.js'), () => import('./views/klienci.js'), () => import('./views/klient.js'), () => import('./views/zgloszenia.js'), () => import('./views/rozmowy.js'), () => import('./watek.js'), () => import('./views/dokumenty.js'));
    if (hasModule('doradztwo')) list.push(() => import('./views/m2.js'));
    list.push(() => import('./views/obecnosc.js'), () => import('./views/profil.js'), () => import('./views/jpk.js'));
    list.reduce((p, f) => p.then(() => f().catch(() => null)), Promise.resolve());
  };
  if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 3000 }); else setTimeout(go, 1500);
};
import { logout as endSession, startIdleWatch, takeLogoutReason } from './session.js';

const app = document.getElementById('app');
let cleanup = null;
let tkRes = null;

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  return { parts, params: new URLSearchParams(query) };
}

const MODULES = {
  rkdp: { label: 'RKDP', full: 'RKDP · Rozliczenia', logo: '/logo-rkdp.png', alt: 'RKDP spółka doradztwa podatkowego', home: '#/pulpit', need: 'rozliczenia',
    tabs: [['#/pulpit', 'Pulpit', 'pulpit'], ['#/rozliczenia', 'Rozliczenia', 'rozliczenia'], ['#/klienci', 'Klienci', 'klienci'], ['#/rozmowy', 'Rozmowy', 'rozmowy'], ['#/dokumenty', 'Dokumenty', 'sprawozdania']] },
  m2: { label: 'M2 TAX', full: 'M2 TAX · Doradztwo podatkowe', logo: '/m2tax-logo.png', alt: 'M2 TAX Doradcy Podatkowi', home: '#/doradztwo', need: 'doradztwo',
    tabs: [['#/doradztwo', 'Pulpit', 'm2:'], ['#/doradztwo/sprawy', 'Sprawy', 'm2:sprawy'], ['#/doradztwo/klienci', 'Klienci', 'm2:klienci'],
      ['#/doradztwo/dokumenty', 'Dokumenty', 'm2:dokumenty'], ['#/doradztwo/zlecenia', 'Zlecenia', 'm2:zlecenia']] },
};
// konto „tylko podgląd JPK” – widzi wyłącznie zakładkę JPK
MODULES.jpk = { label: 'RKDP', full: 'RKDP · Podgląd JPK', logo: '/logo-rkdp.png', alt: 'RKDP spółka doradztwa podatkowego', home: '#/jpk', need: 'jpk', tabs: [['#/jpk', 'JPK', 'jpk']] };
const M2_PARENT = { sprawa: 'sprawy', klient: 'klienci', aml: 'klienci', dokumenty: 'dokumenty', zlecenie: 'zlecenia', oferty: 'zlecenia' };
const remembered = () => { try { return localStorage.getItem('rkdp_module'); } catch { return null; } };
const remember = m => { try { localStorage.setItem('rkdp_module', m); } catch { /* */ } };

// ikony zakładek (dolny pasek na telefonie)
const TAB_ICONS = {
  'rozmowy': '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 10.5h7M8.5 14h4.5"/></svg>',
  'pulpit': '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>',
  'rozliczenia': '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg>',
  'klienci': '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3 2.9-5 5.5-5s4.9 2 5.5 5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.2c2.3.2 4 1.9 4.5 4.8"/></svg>',
  'zgloszenia': '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13h4l1.5 3h5L16 13h4"/><path d="M5.5 5h13L21 13v6H3v-6z"/></svg>',
  'sprawozdania': '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M10 13h6M10 17h6"/></svg>',
  'zespol': '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  'm2:': '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>',
  'm2:sprawy': '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/></svg>',
  'm2:klienci': '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3 2.9-5 5.5-5s4.9 2 5.5 5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.2c2.3.2 4 1.9 4.5 4.8"/></svg>',
  'm2:kalendarz': '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  'm2:zlecenia': '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="m10 15 2 2 4-4"/></svg>',
  'm2:zgloszenia': '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13h4l1.5 3h5L16 13h4"/><path d="M5.5 5h13L21 13v6H3v-6z"/></svg>',
  'm2:spotkania': '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  'm2:dokumenty': '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M10 13h6M10 17h6"/></svg>',
  'jpk': '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="m10.5 13-2 2 2 2M14.5 13l2 2-2 2"/></svg>',
  'logout': '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 16l-4-4 4-4"/><path d="M6 12h10"/></svg>',
  'default': '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/></svg>',
};
TAB_ICONS['m2:jpk'] = TAB_ICONS.jpk;
const TAB_SHORT = { 'm2:jpk': 'JPK', rozliczenia: 'Rozliczenia', sprawozdania: 'Dokumenty', zespol: 'Ustawienia', 'm2:': 'Pulpit', 'm2:kalendarz': 'Kalendarz', 'm2:zgloszenia': 'Zgłoszenia', 'm2:dokumenty': 'Dokumenty', 'm2:spotkania': 'Spotkania' };

let themeOff = null;
// active: 'rozliczenia' | 'klienci' | 'zespol' | 'm2:<podstrona>'
function layout(active) {
  const me = state.me;
  const jpkOnly = isJpkOnly();
  const mine = jpkOnly ? ['jpk'] : Object.keys(MODULES).filter(k => k !== 'jpk' && hasModule(MODULES[k].need));
  let mod = jpkOnly ? 'jpk' : active.startsWith('m2:') ? 'm2' : active === 'zespol' ? (remembered() || mine[0]) : 'rkdp';
  if (!mine.includes(mod)) mod = mine[0] || 'rkdp';
  if (active !== 'zespol' && !jpkOnly) remember(mod);
  const M = MODULES[mod];

  const switcher = (() => {
    if (mine.length < 2) return h('span', { class: 'mod-label' }, M.label);
    const menu = h('div', { class: 'mod-menu', role: 'menu', hidden: true }, ...mine.map(k => h('a', {
      href: MODULES[k].home, role: 'menuitem', class: k === mod ? 'on' : null,
      onclick: () => { remember(k); menu.hidden = true; },
      'aria-label': MODULES[k].full, title: MODULES[k].full },
      h('img', { src: LIGHT_LOGO(MODULES[k].logo), alt: MODULES[k].label }))));
    const btn = h('button', { class: 'mod-switch', type: 'button', 'aria-haspopup': 'menu', title: 'Zmień moduł',
      onclick: (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; e.currentTarget.setAttribute('aria-expanded', String(!menu.hidden)); } }, M.label, h('span', { class: 'caret' }, '▾'));
    return h('div', { class: 'mod-wrap' }, btn, menu);
  })();

  const link = ([href, label, key]) => {
    const ico = h('span', { class: 'tab-ico', 'aria-hidden': 'true' }); ico.innerHTML = TAB_ICONS[key] || TAB_ICONS.default;
    return h('a', { href, class: [active === key ? 'active' : '', /jpk$/.test(key) && !jpkOnly ? 'desk-only' : ''].filter(Boolean).join(' ') || null }, ico, h('span', { class: 'tab-full' }, label), h('span', { class: 'tab-short' }, TAB_SHORT[key] || label));
  };
  const header = h('header', { class: 'site-header' },
    h('div', { class: 'wrap nav' },
      h('div', { class: 'nav-brand' },
        h('a', { href: M.home, class: 'brand-logo' }, h('img', { src: LIGHT_LOGO(M.logo), alt: M.alt })),
        switcher),
      h('nav', { class: 'nav-links' },
        ...M.tabs.map(link),
        me.role === 'admin' ? link(['#/zespol', 'Zespół i ustawienia', 'zespol']) : null),
      h('div', { class: 'nav-user' },
        (() => { const b = h('button', { type: 'button', class: 'hdr-search', onclick: () => openCmdk(), 'aria-label': 'Szukaj (Ctrl K)', 'data-tip': 'Szukaj klienta, sprawy, zgłoszenia, narzędzia' });
          b.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><span>Szukaj…</span><kbd>' + (/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl') + ' K</kbd>'; return b; })(),
        (() => { const b = h('button', { type: 'button', class: 'hdr-icon', onclick: () => toggleTheme() });
          const draw = () => { const d = getTheme() === 'dark'; b.innerHTML = d ? ICON_SUN : ICON_MOON; b.setAttribute('aria-label', d ? 'Motyw jasny' : 'Motyw ciemny'); b.setAttribute('data-tip', d ? 'Przełącz na motyw jasny' : 'Przełącz na motyw ciemny'); };
          draw(); themeOff?.(); themeOff = onThemeChange(draw); return b; })(),
        !jpkOnly && hasModule('rozliczenia') && mod === 'rkdp' ? unreadBadgeEl() : null,
        jpkOnly || !(state.me.attendance || state.me.role === 'admin' || state.me.attendance_scope) ? null : (() => { const i = h('a', { href: '#/obecnosc', class: 'ob-link' + (active.endsWith('obecnosc') ? ' on' : ''), 'aria-label': 'Lista obecności', 'data-tip': 'Lista obecności' }); i.innerHTML = TAB_ICONS['m2:spotkania']; return i; })(),
        jpkOnly ? h('span', { class: 'who' }, me.full_name) : h('a', { href: '#/profil', class: 'who', 'data-tip': 'Mój profil – dane do pełnomocnictw', style: { textDecoration: 'none', color: 'inherit' } }, me.full_name),
        jpkOnly ? h('span', { class: 'avatar', title: me.email }, ava(me)) : h('a', { href: '#/profil', class: 'avatar', title: me.email, style: { textDecoration: 'none' } }, ava(me)),
        h('button', { class: 'btn btn-ghost btn-sm logout', onclick: logout, 'aria-label': 'Wyloguj' }, (() => { const i = h('span', { class: 'logout-ico', 'aria-hidden': 'true' }); i.innerHTML = TAB_ICONS.logout; return i; })(), h('span', { class: 'logout-txt' }, 'Wyloguj')))));
  document.body.classList.toggle('has-tabbar', true);
  const main = h('main', { class: 'wrap' });
  const foot = h('footer', { class: 'wrap foot' },
    mod === 'm2' ? 'M2 TAX Doradcy Podatkowi Otręba Ruszniak sp. p.' : 'RKDP spółka doradztwa podatkowego sp. z o.o.',
    ' · aplikacja wewnętrzna · wykonanie: ',
    h('a', { href: 'https://ruszniak.io', target: '_blank', rel: 'noopener' }, 'druslak'),
    h('div', { class: 'owner' }, `© ${new Date().getFullYear()} Właściciel oprogramowania: RKDP spółka doradztwa podatkowego sp. z o.o. Wszelkie prawa zastrzeżone. · `, h('a', { href: '#/regulamin' }, 'Regulamin')));
  pending = [header, main, foot];
  if (!routing) commit();
  return main;
}

async function logout() {
  invalidateCache();
  location.hash = '';
  await endSession();
}

async function loadContext() {
  const email = (state.session.user.email || '').toLowerCase();
  const [{ data: members, error }, { data: tasks, error: e2 }] = await Promise.all([
    sb.from('team_members').select('*').order('full_name'),
    sb.from('task_types').select('*').order('sort'),
  ]);
  if (error || e2) throw error || e2;
  state.members = members;
  state.taskTypes = tasks;
  state.me = members.find(m => m.email === email && m.active) || null;
}

// ---------- przełączanie widoków bez „pustej strony” ----------
// Nowy widok rysuje się poza ekranem; stary zostaje widoczny (z paskiem postępu) do chwili, gdy nowy jest gotowy.
let pending = null, routing = false, routeSeq = 0, keepScrollY = null, animate = true;
const prog = h('div', { id: 'nprog', 'aria-hidden': 'true' });
document.body.append(prog);
let progTimer = null;
const showProgress = () => { clearTimeout(progTimer); progTimer = setTimeout(() => prog.classList.add('on'), 120); };
const hideProgress = () => { clearTimeout(progTimer); prog.classList.remove('on'); };
function commit() {
  if (!pending) return;
  app.replaceChildren(...pending); pending = null; hideProgress();
  const mn = app.querySelector('main'); if (mn && animate) mn.classList.add('view-enter');
  if (keepScrollY !== null) { const y = keepScrollY; requestAnimationFrame(() => window.scrollTo(0, y)); } else window.scrollTo(0, 0);
}
// od razu podświetl klikniętą zakładkę – nie czekając na dane
function markActiveTab() {
  const cur = location.hash.split('?')[0] || '#/';
  const links = [...document.querySelectorAll('.nav-links a')];
  const fit = links.filter(a => { const hr = a.getAttribute('href'); return cur === hr || cur.startsWith(hr + '/'); }).sort((x, y) => y.getAttribute('href').length - x.getAttribute('href').length)[0];
  if (fit) links.forEach(a => a.classList.toggle('active', a === fit));
}

async function route(opts = {}) {
  const seq = ++routeSeq;
  routing = true; keepScrollY = opts.keepScroll ? window.scrollY : null; animate = !opts.silent;
  if (!opts.silent) { markActiveTab(); showProgress(); }
  const early = setTimeout(() => { if (seq === routeSeq) commit(); }, opts.silent ? 4000 : 700);
  let c = null;
  const done = () => {
    clearTimeout(early);
    if (seq !== routeSeq) { try { c?.(); } catch { /* */ } return; }
    if (cleanup) { try { cleanup(); } catch { /* */ } }
    cleanup = c; routing = false; commit(); hideProgress();
  };
  document.querySelector('.pop')?.remove();
  closePanel();
  const { parts, params } = parseHash();
  if (parts[0] === 'wynik') { location.reload(); return; }
  if (isJpkOnly()) {
    if (parts[0] === 'regulamin') { try { c = await renderRegulamin(layout('regulamin')); } catch (err) { console.error(err); } return done(); }
    if (parts[0] !== 'jpk') history.replaceState(null, '', '#/jpk');
    try { c = await renderJpk(layout('jpk'), { mod: 'rkdp' }); } catch (err) { console.error(err); toast('Nie udało się wczytać: ' + (err.message || err), true); }
    return done();
  }
  const startMod = remembered() === 'm2' && hasModule('doradztwo') ? 'doradztwo' : null;
  const view = parts[0] || startMod || (hasModule('rozliczenia') ? 'pulpit' : 'doradztwo');
  const m2key = 'm2:' + (M2_PARENT[parts[1]] || parts[1] || '');
  try {
    if (view === 'obecnosc') c = await renderObecnosc(layout(remembered() === 'm2' && hasModule('doradztwo') ? 'm2:obecnosc' : 'obecnosc'), parts[1], params);
    else if (view === 'regulamin') c = await renderRegulamin(layout('regulamin'));
    else if (view === 'profil') c = await renderProfil(layout(remembered() === 'm2' && hasModule('doradztwo') ? 'm2:profil' : 'profil'));
    else if (view === 'doradztwo' && parts[1] === 'jpk' && hasModule('doradztwo')) c = await renderJpk(layout('m2:dokumenty'), { mod: 'm2', back: '#/doradztwo/dokumenty' });
    else if (view === 'doradztwo' && parts[1] === 'kalkulator' && hasModule('doradztwo')) c = await renderKalkulator(layout('m2:dokumenty'), { mod: 'm2' });
    else if (view === 'doradztwo' && parts[1] === 'wzory' && hasModule('doradztwo')) c = await renderWzory(layout('m2:dokumenty'), { mod: 'm2', params });
    else if (view === 'doradztwo' && hasModule('doradztwo')) c = await renderM2(layout(m2key), parts, params);
    else if (!hasModule('rozliczenia') && view !== 'zespol') c = await renderM2(layout('m2:'), ['doradztwo'], params);
    else if (view === 'jpk') c = await renderJpk(layout('sprawozdania'), { mod: 'rkdp', back: '#/dokumenty' });
    else if (view === 'klienci') c = await renderKlienci(layout('klienci'), params);
    else if (view === 'informacje') c = await renderInformacje(layout('klienci'));
    else if (view === 'klient') c = await renderKlient(layout('klienci'), parts[1]);
    else if (view === 'watek' && parts[1]) { c = await renderKlient(layout('klienci'), parts[1]); history.replaceState(null, '', `#/klient/${parts[1]}`); import('./watek.js').then(m => m.openThread({ client: { id: parts[1] }, period: params.get('okres') || undefined })); }
    else if (view === 'aml') c = await renderAml(layout('klienci'), 'rkdp');
    else if (view === 'oferty') c = await renderOferty(layout('klienci'), parts[1], 'rkdp');
    else if (view === 'pulpit') c = await renderPulpit(layout('pulpit'), params);
    else if (view === 'dzis') c = await renderPulpit(layout('pulpit'), new URLSearchParams('widok=dzis'));
    else if (view === 'terminy') c = await renderTerminy(layout('rozliczenia'), params);
    else if (view === 'zamkniecie-roku') c = await renderRok(layout('rozliczenia'), params);
    else if (view === 'raport' && state.me.role === 'admin') c = await renderRaport(layout('pulpit'), params);
    else if (view === 'rozmowy') c = await renderRozmowy(layout('rozmowy'), params);
    else if (view === 'zgloszenia' && parts[1] && parts[1] !== 'cykliczne' && !params.has('pelne') && (tkRes = await openTicketInThread(parts[1]))) c = tkRes.c;
    else if (view === 'zgloszenia' && !parts[1]) { const f = params.get('f'); history.replaceState(null, '', '#/rozmowy' + (f ? '?f=' + f : '')); c = await renderRozmowy(layout('rozmowy'), new URLSearchParams(f ? { f } : {})); }
    else if (view === 'zgloszenia') c = await renderZgloszenia(layout('rozmowy'), parts[1], params);
    else if (view === 'dokumenty') c = await renderDokumenty(layout('sprawozdania'));
    else if (view === 'sprawozdanie-finansowe') c = await renderEsf(layout('sprawozdania'), params);
    else if (view === 'kalkulator') c = await renderKalkulator(layout('sprawozdania'), { mod: 'rkdp' });
    else if (view === 'wzory') c = await renderWzory(layout('sprawozdania'), { mod: 'rkdp', params });
    else if (view === 'sprawozdania') c = await renderSprawozdania(layout('sprawozdania'), parts[1]);
    else if (view === 'zespol' && state.me.role === 'admin') c = await renderZespol(layout('zespol'));
    else c = await renderRozliczenia(layout('rozliczenia'), params);
  } catch (err) {
    console.error(err);
    toast('Nie udało się wczytać danych: ' + (err.message || err), true);
  }
  done();
}

// zadanie (zgłoszenie) RKDP przypisane do klienta otwieramy w rozmowie klienta – to jedno miejsce na uwagi, pytania i zadania
async function openTicketInThread(id) {
  const { data: t } = await sb.from('rkdp_tickets').select('id,client_id,period,created_at,module').eq('id', id).maybeSingle();
  if (!t?.client_id || t.module !== 'rkdp') return null;
  history.replaceState(null, '', '#/rozmowy');
  const c = await renderRozmowy(layout('rozmowy'), new URLSearchParams());
  const { data: client } = await sb.from('clients').select('*').eq('id', t.client_id).maybeSingle();
  if (client) import('./watek.js').then(m => m.openThread({ client, period: (t.period || t.created_at).slice(0, 7), focus: 't' + t.id }));
  return { c };
}

async function start() {
  // publiczny podgląd wyniku (link dla klienta) – bez logowania
  if (/^#\/wynik\/[\w-]{20,}/.test(location.hash)) { const m = await import('./udostepnij.js'); return m.renderShared(app, location.hash.split('/')[2].split('?')[0]); }
  const reason = takeLogoutReason();
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { renderLogin(app, reason); return; }
  // nowe logowanie (hasło + kod): baza musi potwierdzić, że sesja przeszła oba kroki i nie wygasła
  let idleMinutes = null;
  state.session = session;
  // tryb logowania, stan sesji i dane zespołu pobieramy równolegle (zamiast po kolei)
  const [{ data: mode }, stRes, ctx, tsRes] = await Promise.all([
    sb.rpc('login_mode'),
    sb.rpc('auth_state'),
    loadContext().then(() => null, err => err),
    sb.rpc('terms_status', { p_version: TERMS_VERSION }).then(r => r, () => ({ error: true })),
  ]);
  if (mode === 'haslo_kod') {
    const { data: st, error } = stRes;
    if (error || !st?.verified) {
      state.session = null;
      await sb.auth.signOut({ scope: 'local' });
      renderLogin(app, reason || (st?.member ? 'Sesja wygasła albo wymaga ponownego logowania hasłem i kodem.' : ''));
      return;
    }
    idleMinutes = st.idle_minutes;
  }
  if (ctx) {
    app.replaceChildren(h('div', { class: 'empty' }, 'Błąd połączenia z bazą: ' + ctx.message));
    return;
  }
  if (!state.me) {
    state.session = null;
    await sb.auth.signOut({ scope: 'local' });
    renderLogin(app, 'Ten adres nie ma dostępu do aplikacji.');
    return;
  }
  if (idleMinutes) { sb.rpc('auth_touch'); startIdleWatch(idleMinutes); }
  // regulamin: przy pierwszym logowaniu, co 30 dni i po zmianie wersji – bez akceptacji brak dostępu
  if (!tsRes?.error && tsRes?.data?.needs) {
    const { termsGate } = await import('./views/regulamin.js');
    if (!(await termsGate({ onLogout: logout, first: !tsRes.data.last }))) return;
  }
  window.addEventListener('hashchange', () => route());
  initShortcuts();
  // dane w bazie zmieniły się od ostatniej wizyty – przerysuj widok po cichu, o ile użytkownik nic teraz nie wpisuje
  let lastAuto = 0;
  setStaleHandler(() => {
    if (routing || !autoRefreshRoute() || Date.now() - lastAuto < 5000) return;
    const ae = document.activeElement;
    if (document.querySelector('.modal-back, .pop') || document.body.classList.contains('focus-mode')) return;
    if (ae && ae.closest('main') && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
    lastAuto = Date.now();
    route({ silent: true, keepScroll: true });
  });
  route().then(prefetchViews);
}

sb.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT' && state.session) location.reload();
});

document.addEventListener('click', () => { document.querySelectorAll('.mod-menu').forEach(m => { m.hidden = true; }); document.querySelectorAll('.mod-switch').forEach(b => b.setAttribute('aria-expanded', 'false')); });
initTooltips();
initMobileTables();
initPanelLinks();
start();
// instalacja jako aplikacja, powiadomienia push, ekran „brak internetu”
if (document.readyState === 'complete') registerSW(); else window.addEventListener('load', () => registerSW());
