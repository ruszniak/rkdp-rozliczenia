import { h, initials, toast, initTooltips, initMobileTables, ava } from './ui.js';
import { sb, state, hasModule, isJpkOnly, setStaleHandler, autoRefreshRoute, invalidateCache } from './store.js';
import { renderLogin } from './views/login.js';
import { TERMS_VERSION } from './regulamin.js';
import { registerSW, isStandalone, isIOS } from './push.js';
import { openCmdk, initShortcuts } from './cmdk.js';
import { getTheme, toggleTheme, onThemeChange, ICON_MOON, ICON_SUN } from './motyw.js';
import { initPanelLinks, closePanel } from './panel.js';
// logo w aplikacji: RKDP – granatowe (logotyp aplikacji), M2 TAX – zwykłe; w motywie ciemnym rozjaśniane w CSS
const LIGHT_LOGO = src => src.replace('/logo-rkdp.png', '/logo-app.svg');
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
const renderZlecenia = lazy(() => import('./views/zlecenia.js'), 'renderZlecenia');
const renderCzas = lazy(() => import('./czas.js'), 'renderCzas');
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
    // RKDP = pełna aplikacja (rozliczenia + doradztwo); M2 TAX to dodatek – jego klienci są w Klientach (przełącznik), sprawy w Sprawach
    tabs: [['#/pulpit', 'Pulpit', 'pulpit'], ['#/klienci', 'Klienci', 'klienci'], ['#/rozliczenia', 'Rozliczenia', 'rozliczenia'], ['#/doradztwo/sprawy', 'Sprawy', 'm2:sprawy']],
    // „Więcej” – rzadziej używane miejsca (też w wyszukiwarce Ctrl K)
    more: [['#/doradztwo/zlecenia', 'Zlecenia i umowy (doradztwo)', 'm2:zlecenia'], ['#/rozmowy', 'Rozmowy – wszystkie wątki o klientach', 'rozmowy'], ['#/dokumenty', 'Dokumenty i narzędzia (JPK, sprawozdania, wzory, kalkulator)', 'sprawozdania'], ['#/terminy', 'Kalendarz obowiązków', 'terminy'],
      ['#/zamkniecie-roku', 'Zamknięcie roku', 'rok'], ['#/informacje', 'Informacja do klientów (e-mail zbiorczy)', 'informacje'], ['#/oferty', 'Oferty', 'oferty'], ['#/aml', 'AML – weryfikacja klientów', 'aml'],
      ['#/doradztwo/dokumenty', 'Pisma procesowe – wzory (RKDP i M2 TAX)', 'm2:dokumenty'], ['#/doradztwo', 'Pulpit doradcy M2 TAX (spotkania, terminy)', 'm2:', 'm2'], ['#/czas', 'Czas pracy i rentowność', 'm2:czas', 'admin'],
      ['#/raport', 'Raport miesięczny', 'raport', 'admin'], ['#/zespol', 'Zespół i ustawienia', 'zespol', 'admin'], ['#/o-aplikacji', 'O aplikacji i RODO', 'oaplikacji'], ['#/', 'Wyloguj się', 'logout']] },
  m2: { label: 'M2 TAX', full: 'M2 TAX · Doradztwo podatkowe', logo: '/m2tax-logo.png', alt: 'M2 TAX Doradcy Podatkowi', home: '#/doradztwo', need: 'doradztwo',
    tabs: [['#/doradztwo', 'Pulpit', 'm2:'], ['#/doradztwo/sprawy', 'Sprawy', 'm2:sprawy'], ['#/doradztwo/klienci', 'Klienci', 'm2:klienci'],
      ['#/doradztwo/dokumenty', 'Dokumenty', 'm2:dokumenty'], ['#/doradztwo/zlecenia', 'Zlecenia', 'm2:zlecenia']],
    more: [['#/czas', 'Czas pracy i rentowność', 'm2:czas', 'admin'], ['#/zespol', 'Zespół i ustawienia', 'zespol', 'admin'], ['#/o-aplikacji', 'O aplikacji i RODO', 'oaplikacji'], ['#/', 'Wyloguj się', 'logout']] },
};
// konto „tylko podgląd JPK” – widzi wyłącznie zakładkę JPK
MODULES.jpk = { label: 'RKDP', full: 'RKDP · Podgląd JPK', logo: '/logo-rkdp.png', alt: 'RKDP spółka doradztwa podatkowego', home: '#/jpk', need: 'jpk', tabs: [['#/jpk', 'JPK', 'jpk']] };
const M2_PARENT = { sprawa: 'sprawy', klient: 'klienci', aml: 'klienci', dokumenty: 'dokumenty', zlecenie: 'zlecenia', oferty: 'zlecenia' };
const remembered = () => { try { return localStorage.getItem('rkdp_module'); } catch { return null; } };
const remember = m => { try { localStorage.setItem('rkdp_module', m); } catch { /* */ } };

// ikony zakładek – własny zestaw RKDP (dwa tony: kontur w kolorze tekstu + wypełnienie z litery „R” logo)
const duo = (fill, line) => `<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path class="duo" d="${fill}"/><path d="${line}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const I = {
  pulpit: duo('M5 11.5V20h14v-8.5L12 6z', 'M3 12l9-8 9 8M5 10.5V20h5v-5h4v5h5v-9.5'),
  rozliczenia: duo('M6 3h9l4 4v14H6z', 'M6 3h9l4 4v14H6zM15 3v4h4M9 12l2 2 4-4M9 17h6'),
  klienci: duo('M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6z', 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 4.6a3.5 3.5 0 010 6.8M18 14.4c1.8.8 3 2.6 3 4.6'),
  rozmowy: duo('M9 9h11v8h-3l-3 3v-3H9z', 'M4 4h11v8H8l-4 4zM9 12v5h5l3 3v-3h3V9h-5'),
  zlecenia: duo('M6 5h12v16H6z', 'M9 5V3h6v2M6 5h12v16H6zM9 11h6M9 15h4M15 15l1 1 2-2'),
  terminy: duo('M4 9h16v11H4z', 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M14.5 15.5h1'),
  dokumenty: duo('M3 9h18v11H3z', 'M3 6h6l2 2h10v12H3zM3 10h18'),
  aml: duo('M12 3l8 3.5v5.5c0 4.6-3.4 8-8 9-4.6-1-8-4.4-8-9V6.5z', 'M12 3l8 3.5v5.5c0 4.6-3.4 8-8 9-4.6-1-8-4.4-8-9V6.5zM8.5 12l2.5 2.5 4.5-5'),
  jpk: duo('M5 13l14-8-5 15z', 'M5 13l14-8-5 15-2.5-6zM11.5 14L19 5'),
  notatki: duo('M5 4h14v12l-4 4H5z', 'M5 4h14v12l-4 4H5zM15 20v-4h4M9 9h6M9 13h4'),
  wiecej: duo('M4 4h7v7H4zM13 13h7v7h-7z', 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z'),
  zespol: duo('M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z', 'M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1'),
  zegar: duo('M12 20.5a8.5 8.5 0 100-17 8.5 8.5 0 000 17z', 'M12 20.5a8.5 8.5 0 100-17 8.5 8.5 0 000 17zM12 7.5V12l3 2'),
  skrzynka: duo('M3 13h5l1.5 3h5l1.5-3h5v6H3z', 'M3 13h5l1.5 3h5l1.5-3h5M5.5 5h13L21 13v6H3v-6z'),
  wyloguj: duo('M4 4h9v16H4z', 'M13 4H4v16h9M17 8l4 4-4 4M21 12H10'),
  info: duo('M12 21a9 9 0 100-18 9 9 0 000 18z', 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v6M12 7.5v.5'),
  profil: duo('M4 21c0-4 3.6-7 8-7s8 3 8 7z', 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 3.6-7 8-7s8 3 8 7'),
  motyw: duo('M12 3a9 9 0 109 9 7 7 0 01-9-9z', 'M12 3a9 9 0 109 9 7 7 0 01-9-9z'),
};
const TAB_ICONS = {
  moje: I.zlecenia, more: I.wiecej, rozmowy: I.rozmowy, pulpit: I.pulpit, rozliczenia: I.rozliczenia, klienci: I.klienci,
  zgloszenia: I.skrzynka, sprawozdania: I.dokumenty, zespol: I.zespol, 'm2:': I.pulpit, 'm2:sprawy': I.dokumenty, 'm2:klienci': I.klienci,
  'm2:kalendarz': I.terminy, 'm2:zlecenia': I.zlecenia, 'm2:zgloszenia': I.skrzynka, 'm2:spotkania': I.zegar, 'm2:dokumenty': I.dokumenty,
  jpk: I.jpk, logout: I.wyloguj, default: I.info,
  zlecenia: I.zlecenia, terminy: I.terminy, rok: I.notatki, informacje: I.rozmowy, oferty: I.notatki, aml: I.aml, raport: I.rozliczenia,
  oaplikacji: I.info, 'm2:czas': I.zegar,
};
TAB_ICONS['m2:jpk'] = TAB_ICONS.jpk;
const TAB_SHORT = { moje: 'Sprawy', 'm2:jpk': 'JPK', rozliczenia: 'Rozliczenia', sprawozdania: 'Dokumenty', zespol: 'Ustawienia', 'm2:': 'Pulpit', 'm2:kalendarz': 'Kalendarz', 'm2:zgloszenia': 'Zgłoszenia', 'm2:dokumenty': 'Dokumenty', 'm2:spotkania': 'Spotkania' };

let themeOff = null;
// szeroki widok (duże monitory) – zapamiętany w tej przeglądarce
try { if (localStorage.getItem('rkdp-wide') === '1') document.documentElement.classList.add('wide'); } catch {}
const ICON_WIDE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"/></svg>';
const ICON_NARROW = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h7M14 12h7M7 8l4 4-4 4M17 8l-4 4 4 4"/></svg>';
// active: 'rozliczenia' | 'klienci' | 'zespol' | 'm2:<podstrona>'
// menu „Więcej” w pasku zakładek
let lastMore = [];
const isPhoneWidth = () => matchMedia('(max-width: 820px)').matches;
function moreMenu(items, active) {
  lastMore = items;
  const ico = h('span', { class: 'tab-ico', 'aria-hidden': 'true' }); ico.innerHTML = TAB_ICONS.more;
  const on = items.some(x => x[2] === active) || /wiecej$/.test(active);
  const item = ([href, label, key]) => {
    const i = h('span', { class: 'mm-ico', 'aria-hidden': 'true' }); i.innerHTML = TAB_ICONS[key] || TAB_ICONS.default;
    if (key === 'logout') return h('a', { href: '#/', role: 'menuitem', class: 'mm-logout', onclick: (e) => { e.preventDefault(); menu.hidden = true; logout(); } }, i, label);
    return h('a', { href, role: 'menuitem', class: key === active ? 'on' : null, onclick: () => { menu.hidden = true; } }, i, label);
  };
  const menu = h('div', { class: 'more-menu', role: 'menu', hidden: true }, ...items.map(item));
  const btn = h('button', { type: 'button', class: 'more-btn' + (on ? ' active' : ''), 'aria-haspopup': 'menu', 'aria-expanded': 'false',
    onclick: e => { e.stopPropagation(); if (isPhoneWidth()) { location.hash = '#/wiecej'; return; } menu.hidden = !menu.hidden; btn.setAttribute('aria-expanded', String(!menu.hidden)); if (!menu.hidden) setTimeout(() => document.addEventListener('click', function off(ev) { if (!menu.contains(ev.target)) { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); } document.removeEventListener('click', off); }), 0); } },
    ico, h('span', { class: 'tab-full' }, 'Więcej'), h('span', { class: 'tab-short' }, 'Więcej'));
  return h('div', { class: 'more-wrap' }, btn, menu);
}
// „Więcej” na telefonie – cała strona z listą (moduły, ustawienia i pomoc, wylogowanie)
function renderWiecej(main) {
  const items = lastMore.filter(x => !['logout', 'oaplikacji', 'zespol'].includes(x[2]));
  const row = (href, key, label, onclick, cls) => {
    const i = h('span', { class: 'wq-ico', 'aria-hidden': 'true' }); i.innerHTML = I[key] || TAB_ICONS[key] || TAB_ICONS.default;
    const chev = h('span', { class: 'wq-chev', 'aria-hidden': 'true' }); chev.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="m9 6 6 6-6 6"/></svg>';
    return h('a', { href, class: 'wq-row' + (cls ? ' ' + cls : ''), onclick }, i, h('span', { class: 'wq-t' }, label), onclick ? null : chev);
  };
  const me = state.me;
  const obec = !isJpkOnly() && (me.attendance || me.role === 'admin' || me.attendance_scope);
  const themeRow = row('#/wiecej', 'motyw', getTheme() === 'dark' ? 'Motyw jasny' : 'Motyw ciemny', (e) => { e.preventDefault(); toggleTheme(); e.currentTarget.querySelector('.wq-t').textContent = getTheme() === 'dark' ? 'Motyw jasny' : 'Motyw ciemny'; });
  main.replaceChildren(
    h('h1', { class: 'wq-h' }, 'Więcej'),
    h('p', { class: 'wq-lbl' }, 'Moduły'),
    h('div', { class: 'card wq-list' }, ...items.map(([href, label, key]) => row(href, key, label))),
    h('p', { class: 'wq-lbl' }, 'Ustawienia i pomoc'),
    h('div', { class: 'card wq-list' },
      row('#/profil', 'profil', 'Mój profil, Face ID, powiadomienia'),
      obec ? row('#/obecnosc', 'zegar', 'Lista obecności') : null,
      lastMore.some(x => x[2] === 'zespol') ? row('#/zespol', 'zespol', 'Zespół i ustawienia') : null,
      themeRow,
      row('#/o-aplikacji', 'info', 'O aplikacji i RODO')),
    h('div', { class: 'card wq-list', style: { marginTop: '16px' } },
      row('#/', 'wyloguj', 'Wyloguj się', (e) => { e.preventDefault(); logout(); }, 'wq-out')));
}
let timerMod = null;
function timerPillEl() { const box = h('span', { class: 'tm-slot' }); (timerMod ||= import('./czas.js')).then(m => box.replaceChildren(m.timerPill())).catch(() => {}); return box; }
function layout(active) {
  const me = state.me;
  const jpkOnly = isJpkOnly();
  const mine = jpkOnly ? ['jpk'] : Object.keys(MODULES).filter(k => k !== 'jpk' && hasModule(MODULES[k].need));
  let mod = jpkOnly ? 'jpk' : hasModule('rozliczenia') ? 'rkdp' : active.startsWith('m2:') ? 'm2' : active === 'zespol' ? (remembered() || mine[0]) : 'rkdp';
  // jedna aplikacja: widoki doradztwa podświetlają zakładki RKDP
  if (mod === 'rkdp' && active.startsWith('m2:')) active = active === 'm2:klienci' ? 'klienci' : ['m2:zlecenia', 'm2:dokumenty', 'm2:', 'm2:czas'].includes(active) ? active : 'm2:sprawy';
  if (!mine.includes(mod)) mod = mine[0] || 'rkdp';
  if (active !== 'zespol' && !jpkOnly) remember(mod);
  const M = MODULES[mod];

  const switcher = (() => {
    if (mod === 'rkdp') return null;
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
        (() => { const more = (M.more || []).filter(x => (x[3] !== 'admin' || me.role === 'admin') && (x[3] !== 'm2' || hasModule('doradztwo')) && (x[2] !== 'm2:czas' || hasModule('doradztwo'))); return more.length ? moreMenu(more, active) : null; })()),
      h('div', { class: 'nav-user' },
        jpkOnly ? null : timerPillEl(),
        (() => { const b = h('button', { type: 'button', class: 'hdr-search', onclick: () => openCmdk(), 'aria-label': 'Szukaj (Ctrl K)', 'data-tip': 'Szukaj klienta, sprawy, zgłoszenia, narzędzia' });
          b.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><span>Szukaj…</span><kbd>' + (/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl') + ' K</kbd>'; return b; })(),
        (() => { const b = h('button', { type: 'button', class: 'hdr-icon', onclick: () => toggleTheme() });
          const draw = () => { const d = getTheme() === 'dark'; b.innerHTML = d ? ICON_SUN : ICON_MOON; b.setAttribute('aria-label', d ? 'Motyw jasny' : 'Motyw ciemny'); b.setAttribute('data-tip', d ? 'Przełącz na motyw jasny' : 'Przełącz na motyw ciemny'); };
          draw(); themeOff?.(); themeOff = onThemeChange(draw); return b; })(),
        (() => { const b = h('button', { type: 'button', class: 'hdr-icon hdr-wide' });
          const draw = () => { const w = document.documentElement.classList.contains('wide'); b.innerHTML = w ? ICON_NARROW : ICON_WIDE; b.setAttribute('aria-label', w ? 'Zwykła szerokość' : 'Pełna szerokość ekranu'); b.setAttribute('data-tip', w ? 'Zwykła szerokość strony' : 'Rozciągnij na całą szerokość ekranu'); b.setAttribute('aria-pressed', String(w)); };
          b.onclick = () => { const w = document.documentElement.classList.toggle('wide'); try { localStorage.setItem('rkdp-wide', w ? '1' : '0'); } catch {} draw(); };
          draw(); return b; })(),
        !jpkOnly && hasModule('rozliczenia') && mod === 'rkdp' ? unreadBadgeEl() : null,
        jpkOnly || !(state.me.attendance || state.me.role === 'admin' || state.me.attendance_scope) ? null : (() => { const i = h('a', { href: '#/obecnosc', class: 'ob-link' + (active.endsWith('obecnosc') ? ' on' : ''), 'aria-label': 'Lista obecności', 'data-tip': 'Lista obecności' }); i.innerHTML = TAB_ICONS['m2:spotkania']; return i; })(),
        jpkOnly ? h('span', { class: 'who' }, me.full_name) : h('a', { href: '#/profil', class: 'who', 'data-tip': 'Mój profil – dane do pełnomocnictw', style: { textDecoration: 'none', color: 'inherit' } }, me.full_name),
        jpkOnly ? h('span', { class: 'avatar', title: me.email }, ava(me)) : h('a', { href: '#/profil', class: 'avatar', title: me.email, style: { textDecoration: 'none' } }, ava(me)),
        h('button', { class: 'btn btn-ghost btn-sm logout', onclick: logout, 'aria-label': 'Wyloguj' }, (() => { const i = h('span', { class: 'logout-ico', 'aria-hidden': 'true' }); i.innerHTML = TAB_ICONS.logout; return i; })(), h('span', { class: 'logout-txt' }, 'Wyloguj')))));
  document.body.classList.toggle('has-tabbar', true);
  const main = h('main', { class: 'wrap' });
  const foot = h('footer', { class: 'wrap foot' },
    mod === 'm2' ? 'M2 TAX Doradcy Podatkowi Otręba Ruszniak sp. p.' : 'RKDP spółka doradztwa podatkowego sp. z o.o.',
    ' · aplikacja wewnętrzna · ', h('a', { href: '#/o-aplikacji' }, 'O aplikacji i RODO'), ' · wykonanie: ',
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
  document.body.classList.remove('nav-mini'); placeNavInd();
}
// telefon: podświetlenie aktywnej zakładki przesuwa się płynnie między ikonami (jak w aplikacji Facebook)
let lastInd = null;
function placeNavInd() {
  const nav = document.querySelector('.nav-links');
  if (!nav || window.innerWidth > 820) return;
  let ind = nav.querySelector('.nav-ind');
  if (!ind) { ind = document.createElement('span'); ind.className = 'nav-ind'; nav.prepend(ind); }
  const a = nav.querySelector('a.active, .more-btn.active');
  if (!a) { ind.style.opacity = '0'; return; }
  const box = { l: a.offsetLeft + 3, w: a.offsetWidth - 6 };
  if (lastInd && (lastInd.l !== box.l || lastInd.w !== box.w)) {
    ind.style.transition = 'none'; ind.style.transform = `translateX(${lastInd.l}px)`; ind.style.width = lastInd.w + 'px'; ind.getBoundingClientRect(); ind.style.transition = '';
  }
  ind.style.opacity = '1'; ind.style.transform = `translateX(${box.l}px)`; ind.style.width = box.w + 'px';
  lastInd = box;
}
window.addEventListener('resize', () => { lastInd = null; placeNavInd(); });
// przewijanie w dół – pasek lekko się chowa (zmniejsza), w górę – wraca
let lastY = 0;
window.addEventListener('scroll', () => {
  const y = window.scrollY, d = y - lastY;
  if (Math.abs(d) < 6) return;
  document.body.classList.toggle('nav-mini', d > 0 && y > 80);
  lastY = y;
}, { passive: true });
// od razu podświetl klikniętą zakładkę – nie czekając na dane
function markActiveTab() {
  const cur = location.hash.split('?')[0] || '#/';
  const links = [...document.querySelectorAll('.nav-links a')];
  const fit = links.filter(a => { const hr = a.getAttribute('href'); return cur === hr || cur.startsWith(hr + '/'); }).sort((x, y) => y.getAttribute('href').length - x.getAttribute('href').length)[0];
  if (fit) { links.forEach(a => a.classList.toggle('active', a === fit)); placeNavInd(); }
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
  const m2only = remembered() === 'm2' && hasModule('doradztwo') && !hasModule('rozliczenia');
  const startMod = m2only ? 'doradztwo' : null;
  const canDor = hasModule('doradztwo') || hasModule('rozliczenia');
  const view = parts[0] || startMod || (hasModule('rozliczenia') ? 'pulpit' : 'doradztwo');
  const m2key = 'm2:' + (M2_PARENT[parts[1]] || parts[1] || '');
  try {
    if (view === 'obecnosc') c = await renderObecnosc(layout(m2only ? 'm2:obecnosc' : 'obecnosc'), parts[1], params);
    else if (view === 'regulamin') c = await renderRegulamin(layout('regulamin'));
    else if (view === 'o-aplikacji') { const m = await import('./views/oaplikacji.js'); c = await m.renderOAplikacji(layout('oaplikacji'), parts[1]); }
    else if (view === 'wiecej') { const m2 = m2only; renderWiecej(layout(m2 ? 'm2:wiecej' : 'wiecej')); }
    else if (view === 'profil') c = await renderProfil(layout(m2only ? 'm2:profil' : 'profil'));
    else if (view === 'doradztwo' && parts[1] === 'jpk' && hasModule('doradztwo')) c = await renderJpk(layout('m2:dokumenty'), { mod: 'm2', back: '#/doradztwo/dokumenty' });
    else if (view === 'doradztwo' && parts[1] === 'kalkulator' && hasModule('doradztwo')) c = await renderKalkulator(layout('m2:dokumenty'), { mod: 'm2' });
    else if (view === 'doradztwo' && parts[1] === 'wzory' && hasModule('doradztwo')) c = await renderWzory(layout('m2:dokumenty'), { mod: 'm2', params });
    // pulpit doradcy M2 – dla zespołu RKDP bez M2 TAX zamiast niego lista spraw
    else if (view === 'doradztwo' && !parts[1] && !hasModule('doradztwo') && canDor) { history.replaceState(null, '', '#/doradztwo/sprawy'); c = await renderM2(layout('m2:sprawy'), ['doradztwo', 'sprawy'], params); }
    else if (view === 'doradztwo' && parts[1] === 'klienci' && !hasModule('doradztwo') && canDor) { history.replaceState(null, '', '#/klienci'); c = await renderKlienci(layout('klienci'), params); }
    else if (view === 'doradztwo' && canDor && (hasModule('doradztwo') || !['zgloszenia', 'aml', 'oferty'].includes(parts[1]))) c = await renderM2(layout(m2key), parts, params);
    else if (!hasModule('rozliczenia') && view !== 'zespol') c = await renderM2(layout('m2:'), ['doradztwo'], params);
    else if (view === 'jpk') c = await renderJpk(layout('sprawozdania'), { mod: 'rkdp', back: '#/dokumenty' });
    else if (view === 'klienci') c = await renderKlienci(layout('klienci'), params);
    else if (view === 'informacje') c = await renderInformacje(layout('informacje'));
    else if (view === 'klient') c = await renderKlient(layout('klienci'), parts[1]);
    else if (view === 'watek' && parts[1]) { c = await renderKlient(layout('klienci'), parts[1]); history.replaceState(null, '', `#/klient/${parts[1]}`); import('./watek.js').then(m => m.openThread({ client: { id: parts[1] }, period: params.get('okres') || undefined })); }
    else if (view === 'aml') c = await renderAml(layout('aml'), 'rkdp');
    else if (view === 'oferty') c = await renderOferty(layout('oferty'), parts[1], 'rkdp');
    else if (view === 'pulpit') c = await renderPulpit(layout('pulpit'), params);
    // „Moje sprawy” są teraz zakładką „Sprawy” na Pulpicie – stare linki (powiadomienia, maile) prowadzą tam
    else if (view === 'moje') { const q = new URLSearchParams(params || ''); history.replaceState(null, '', '#/pulpit' + (q.toString() ? '?' + q : '')); c = await renderPulpit(layout('pulpit'), q); }
    // „Zadania dla zespołu” połączone z „Moimi sprawami” – stare linki (także z powiadomień) prowadzą tutaj
    else if (view === 'zlecenia') { const q = new URLSearchParams(state.me.role === 'admin' && !parts[1] ? 'f=zespol' : ''); if (parts[1]) q.set('zl', parts[1]); history.replaceState(null, '', '#/pulpit' + (q.toString() ? '?' + q : '')); c = await renderPulpit(layout('pulpit'), q); }
    else if (view === 'czas' && state.me.role === 'admin' && hasModule('doradztwo')) c = await renderCzas(layout('m2:czas'), params);
    else if (view === 'dzis') c = await renderPulpit(layout('pulpit'), new URLSearchParams('widok=dzis'));
    else if (view === 'terminy') c = await renderTerminy(layout('terminy'), params);
    else if (view === 'zamkniecie-roku') c = await renderRok(layout('rok'), params);
    else if (view === 'raport' && state.me.role === 'admin') c = await renderRaport(layout('raport'), params);
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
  // aplikacja zainstalowana na telefonie: bez wylogowania po bezczynności (do 30 dni) – telefon ma własną blokadę, a powiadomienia i otwieranie z nich mają działać od razu
  const phoneApp = isStandalone() && (isIOS() || /Android/i.test(navigator.userAgent));
  if (idleMinutes && phoneApp) { const { data: ok } = await sb.rpc('auth_app_session').then(r => r, () => ({})); if (ok) idleMinutes = 30 * 24 * 60; }
  if (idleMinutes) { sb.rpc('auth_touch'); startIdleWatch(idleMinutes); }
  // aplikacja na telefonie: przy każdym uruchomieniu Face ID / odcisk palca (albo włączenie go po pierwszym logowaniu)
  if (phoneApp && mode === 'haslo_kod') {
    const { phoneGate } = await import('./faceid.js');
    await phoneGate(state.me.email, r => endSession(r));
  }
  // regulamin: przy pierwszym logowaniu, co 30 dni i po zmianie wersji – bez akceptacji brak dostępu
  if (!tsRes?.error && tsRes?.data?.needs) {
    const { termsGate } = await import('./views/regulamin.js');
    if (!(await termsGate({ onLogout: logout, first: !tsRes.data.last }))) return;
  }
  window.addEventListener('hashchange', () => route());
// iPhone: bez powiększania gestem szczypania (Safari ignoruje user-scalable=no)
['gesturestart', 'gesturechange'].forEach(t => document.addEventListener(t, e => e.preventDefault(), { passive: false }));

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
