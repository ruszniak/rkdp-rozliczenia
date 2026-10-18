import { h, initials, toast, initTooltips } from './ui.js';
import { sb, state, hasModule } from './store.js';
import { renderLogin } from './views/login.js';
import { renderRozliczenia } from './views/rozliczenia.js';
import { renderKlienci } from './views/klienci.js';
import { renderKlient } from './views/klient.js';
import { renderZespol } from './views/zespol.js';
import { renderM2 } from './views/m2.js';
import { logout as endSession, startIdleWatch, takeLogoutReason } from './session.js';

const app = document.getElementById('app');
let cleanup = null;

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  return { parts, params: new URLSearchParams(query) };
}

const MODULES = {
  rkdp: { label: 'RKDP', full: 'RKDP · Rozliczenia', logo: '/logo-rkdp.png', alt: 'RKDP spółka doradztwa podatkowego', home: '#/rozliczenia', need: 'rozliczenia',
    tabs: [['#/rozliczenia', 'Rozliczenia', 'rozliczenia'], ['#/klienci', 'Klienci', 'klienci']] },
  m2: { label: 'M2 TAX', full: 'M2 TAX · Doradztwo podatkowe', logo: '/m2tax-logo.png', alt: 'M2 TAX Doradcy Podatkowi', home: '#/doradztwo', need: 'doradztwo',
    tabs: [['#/doradztwo', 'Pulpit', 'm2:'], ['#/doradztwo/sprawy', 'Sprawy', 'm2:sprawy'], ['#/doradztwo/klienci', 'Klienci', 'm2:klienci'],
      ['#/doradztwo/kalendarz', 'Kalendarz', 'm2:kalendarz'], ['#/doradztwo/zlecenia', 'Zlecenia', 'm2:zlecenia'], ['#/doradztwo/spotkania', 'Spotkania', 'm2:spotkania']] },
};
const M2_PARENT = { sprawa: 'sprawy', klient: 'klienci', zlecenie: 'zlecenia' };
const remembered = () => { try { return localStorage.getItem('rkdp_module'); } catch { return null; } };
const remember = m => { try { localStorage.setItem('rkdp_module', m); } catch { /* */ } };

// active: 'rozliczenia' | 'klienci' | 'zespol' | 'm2:<podstrona>'
function layout(active) {
  const me = state.me;
  const mine = Object.keys(MODULES).filter(k => hasModule(MODULES[k].need));
  let mod = active.startsWith('m2:') ? 'm2' : active === 'zespol' ? (remembered() || mine[0]) : 'rkdp';
  if (!mine.includes(mod)) mod = mine[0] || 'rkdp';
  if (active !== 'zespol') remember(mod);
  const M = MODULES[mod];

  const switcher = (() => {
    if (mine.length < 2) return h('span', { class: 'mod-label' }, M.label);
    const menu = h('div', { class: 'mod-menu', role: 'menu', hidden: true }, ...mine.map(k => h('a', {
      href: MODULES[k].home, role: 'menuitem', class: k === mod ? 'on' : null,
      onclick: () => { remember(k); menu.hidden = true; },
      'aria-label': MODULES[k].full, title: MODULES[k].full },
      h('img', { src: MODULES[k].logo, alt: MODULES[k].label }))));
    const btn = h('button', { class: 'mod-switch', type: 'button', 'aria-haspopup': 'menu', title: 'Zmień moduł',
      onclick: (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; e.currentTarget.setAttribute('aria-expanded', String(!menu.hidden)); } }, M.label, h('span', { class: 'caret' }, '▾'));
    return h('div', { class: 'mod-wrap' }, btn, menu);
  })();

  const link = ([href, label, key]) => h('a', { href, class: active === key ? 'active' : null }, label);
  const header = h('header', { class: 'site-header' },
    h('div', { class: 'wrap nav' },
      h('div', { class: 'nav-brand' },
        h('a', { href: M.home, class: 'brand-logo' }, h('img', { src: M.logo, alt: M.alt })),
        switcher),
      h('nav', { class: 'nav-links' },
        ...M.tabs.map(link),
        me.role === 'admin' ? link(['#/zespol', 'Zespół i ustawienia', 'zespol']) : null),
      h('div', { class: 'nav-user' },
        h('span', { class: 'who' }, me.full_name),
        h('span', { class: 'avatar', title: me.email }, initials(me.full_name)),
        h('button', { class: 'btn btn-ghost btn-sm', onclick: logout }, 'Wyloguj'))));
  const main = h('main', { class: 'wrap' });
  const foot = h('footer', { class: 'wrap foot' },
    mod === 'm2' ? 'M2 TAX Doradcy Podatkowi Otręba Ruszniak sp. p.' : 'RKDP spółka doradztwa podatkowego sp. z o.o.',
    ' · aplikacja wewnętrzna · wykonanie: ',
    h('a', { href: 'https://ruszniak.io', target: '_blank', rel: 'noopener' }, 'druslak'),
    h('div', { class: 'owner' }, `© ${new Date().getFullYear()} Właściciel oprogramowania: RKDP spółka doradztwa podatkowego sp. z o.o. Wszelkie prawa zastrzeżone.`));
  app.replaceChildren(header, main, foot);
  return main;
}

async function logout() {
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

async function route() {
  if (cleanup) { try { cleanup(); } catch { /* */ } cleanup = null; }
  document.querySelector('.pop')?.remove();
  const { parts, params } = parseHash();
  const startMod = remembered() === 'm2' && hasModule('doradztwo') ? 'doradztwo' : null;
  const view = parts[0] || startMod || (hasModule('rozliczenia') ? 'rozliczenia' : 'doradztwo');
  const m2key = 'm2:' + (M2_PARENT[parts[1]] || parts[1] || '');
  try {
    if (view === 'doradztwo' && hasModule('doradztwo')) cleanup = await renderM2(layout(m2key), parts, params);
    else if (!hasModule('rozliczenia') && view !== 'zespol') cleanup = await renderM2(layout('m2:'), ['doradztwo'], params);
    else if (view === 'klienci') cleanup = await renderKlienci(layout('klienci'), params);
    else if (view === 'klient') cleanup = await renderKlient(layout('klienci'), parts[1]);
    else if (view === 'zespol' && state.me.role === 'admin') cleanup = await renderZespol(layout('zespol'));
    else cleanup = await renderRozliczenia(layout('rozliczenia'), params);
  } catch (err) {
    console.error(err);
    toast('Nie udało się wczytać danych: ' + (err.message || err), true);
  }
  window.scrollTo(0, 0);
}

async function start() {
  const reason = takeLogoutReason();
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { renderLogin(app, reason); return; }
  // nowe logowanie (hasło + kod): baza musi potwierdzić, że sesja przeszła oba kroki i nie wygasła
  let idleMinutes = null;
  const { data: mode } = await sb.rpc('login_mode');
  if (mode === 'haslo_kod') {
    const { data: st, error } = await sb.rpc('auth_state');
    if (error || !st?.verified) {
      await sb.auth.signOut({ scope: 'local' });
      renderLogin(app, reason || (st?.member ? 'Sesja wygasła albo wymaga ponownego logowania hasłem i kodem.' : ''));
      return;
    }
    idleMinutes = st.idle_minutes;
  }
  state.session = session;
  try {
    await loadContext();
  } catch (err) {
    app.replaceChildren(h('div', { class: 'empty' }, 'Błąd połączenia z bazą: ' + err.message));
    return;
  }
  if (!state.me) {
    await sb.auth.signOut({ scope: 'local' });
    renderLogin(app, 'Ten adres nie ma dostępu do aplikacji.');
    return;
  }
  if (idleMinutes) { await sb.rpc('auth_touch'); startIdleWatch(idleMinutes); }
  window.addEventListener('hashchange', route);
  route();
}

sb.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT' && state.session) location.reload();
});

document.addEventListener('click', () => { document.querySelectorAll('.mod-menu').forEach(m => { m.hidden = true; }); document.querySelectorAll('.mod-switch').forEach(b => b.setAttribute('aria-expanded', 'false')); });
initTooltips();
start();
