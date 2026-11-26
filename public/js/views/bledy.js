// Dziennik błędów i zawieszeń z przeglądarek zespołu (administrator)
import { h, fail } from '../ui.js';
import { sb, memberById } from '../store.js';

const KIND = { error: 'Błąd', promise: 'Błąd', timeout: 'Brak odpowiedzi', slow: 'Wolno', freeze: 'Zawieszenie', offline: 'Offline' };
const when = d => new Date(d).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const device = ua => /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'inne';

export async function renderBledy(main) {
  const box = h('div', {}, h('p', { class: 'hint' }, 'Wczytywanie…'));
  main.replaceChildren(
    h('div', { class: 'page-head' }, h('div', {},
      h('h1', {}, 'Dziennik błędów aplikacji'),
      h('p', { class: 'sub' }, 'Błędy, zawieszenia i zbyt wolne odpowiedzi, które aplikacja zapisała sama u osób z zespołu (ostatnie 14 dni). Bez treści danych – tylko miejsce i czas.'))),
    box);
  const since = new Date(Date.now() - 14 * 86400000).toISOString();
  const { data, error } = await sb.from('client_errors').select('*').gte('at', since).order('at', { ascending: false }).limit(300);
  if (error) return fail(error);
  if (!data.length) return box.replaceChildren(h('div', { class: 'card empty' }, 'Brak zapisanych błędów w ostatnich 14 dniach.'));
  const by = {}; data.forEach(r => { by[r.kind] = (by[r.kind] || 0) + 1; });
  box.replaceChildren(
    h('p', { class: 'small muted', style: { margin: '0 0 10px' } }, Object.entries(by).map(([k, n]) => `${KIND[k] || k}: ${n}`).join(' · ')),
    h('div', { class: 'card', style: { padding: 0, overflowX: 'auto' } }, h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, ...['Kiedy', 'Kto', 'Rodzaj', 'Co', 'Gdzie', 'Urządzenie'].map(t => h('th', {}, t)))),
      h('tbody', {}, ...data.map(r => h('tr', { title: r.detail || '' },
        h('td', { style: { whiteSpace: 'nowrap' } }, when(r.at)),
        h('td', {}, memberById(r.member_id)?.full_name || '—'),
        h('td', {}, KIND[r.kind] || r.kind),
        h('td', {}, r.message, r.ms ? h('span', { class: 'small muted' }, ` (${(r.ms / 1000).toFixed(1)} s)`) : null),
        h('td', { class: 'small' }, r.route || '—'),
        h('td', { class: 'small' }, `${device(r.ua || '')} · ${r.build || ''}`)))))));
}
