import { h, initials, toast, initTooltips } from './ui.js';
import { sb, state } from './store.js';
import { renderLogin } from './views/login.js';
import { renderRozliczenia } from './views/rozliczenia.js';
import { renderKlienci } from './views/klienci.js';
import { renderKlient } from './views/klient.js';
import { renderZespol } from './views/zespol.js';

const app = document.getElementById('app');
let cleanup = null;

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  return { parts, params: new URLSearchParams(query) };
}

function layout(active) {
  const me = state.me;
  const link = (href, label, key) => h('a', { href, class: active === key ? 'active' : null }, label);
  const header = h('header', { class: 'site-header' },
    h('div', { class: 'wrap nav' },
      h('a', { class: 'nav-brand', href: '#/rozliczenia' },
        h('img', { src: '/logo-rkdp.png', alt: 'RKDP spółka doradztwa podatkowego' }),
        h('span', {}, 'Rozliczenia')),
      h('nav', { class: 'nav-links' },
        link('#/rozliczenia', 'Rozliczenia', 'rozliczenia'),
        link('#/klienci', 'Klienci', 'klienci'),
        me.role === 'admin' ? link('#/zespol', 'Zespół i ustawienia', 'zespol') : null),
      h('div', { class: 'nav-user' },
        h('span', { class: 'who' }, me.full_name),
        h('span', { class: 'avatar', title: me.email }, initials(me.full_name)),
        h('button', { class: 'btn btn-ghost btn-sm', onclick: logout }, 'Wyloguj'))));
  const main = h('main', { class: 'wrap' });
  const foot = h('footer', { class: 'wrap foot' },
    'RKDP spółka doradztwa podatkowego sp. z o.o. · aplikacja wewnętrzna · wykonanie: ',
    h('a', { href: 'https://ruszniak.io', target: '_blank', rel: 'noopener' }, 'druslak'));
  app.replaceChildren(header, main, foot);
  return main;
}

async function logout() {
  await sb.auth.signOut();
  location.hash = '';
  location.reload();
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
  const view = parts[0] || 'rozliczenia';
  try {
    if (view === 'klienci') cleanup = await renderKlienci(layout('klienci'), params);
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
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { renderLogin(app); return; }
  state.session = session;
  try {
    await loadContext();
  } catch (err) {
    app.replaceChildren(h('div', { class: 'empty' }, 'Błąd połączenia z bazą: ' + err.message));
    return;
  }
  if (!state.me) {
    await sb.auth.signOut();
    renderLogin(app, 'Ten adres nie ma dostępu do aplikacji.');
    return;
  }
  window.addEventListener('hashchange', route);
  route();
}

sb.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT' && state.session) location.reload();
});

initTooltips();
start();
