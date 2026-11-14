// „Co nowego” po zalogowaniu: nieprzeczytane ogłoszenia dla tej osoby (tabela ogloszenia, lista odbiorców w audience).
// Okno znika na stałe po „Rozumiem” (zapis w ogloszenia_odczyty); zamknięte krzyżykiem pokaże się przy kolejnym wejściu.
import { h, modal } from './ui.js';
import { sb, state } from './store.js';

export async function showAnnouncements() {
  const me = state.me?.id;
  if (!me) return;
  try {
    const [{ data: list }, { data: reads }] = await Promise.all([
      sb.from('ogloszenia').select('id, title, items, url, created_at').contains('audience', [me]).order('created_at', { ascending: true }).limit(10),
      sb.from('ogloszenia_odczyty').select('ogloszenie_id').eq('member_id', me),
    ]);
    const seen = new Set((reads || []).map(r => r.ogloszenie_id));
    const fresh = (list || []).filter(o => !seen.has(o.id));
    if (!fresh.length) return;
    const date = d => new Date(d).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' });
    const body = h('div', { class: 'og-box' }, ...fresh.map(o => h('section', { class: 'og-item' },
      h('p', { class: 'small muted', style: { margin: '0 0 2px' } }, date(o.created_at)),
      h('h3', { style: { margin: '0 0 8px', fontSize: '16.5px' } }, o.title),
      h('ul', { style: { margin: '0 0 6px', paddingLeft: '20px', lineHeight: 1.5 } }, ...(Array.isArray(o.items) ? o.items : []).map(t => h('li', { style: { marginBottom: '7px' } }, String(t)))),
      o.url ? h('p', {}, h('a', { href: o.url, target: o.url.startsWith('#') ? null : '_blank', rel: 'noopener' }, 'Więcej')) : null)));
    modal('Co nowego w rdp.app', body, close => [
      h('button', { class: 'btn btn-primary', onclick: async () => {
        close();
        await sb.from('ogloszenia_odczyty').insert(fresh.map(o => ({ ogloszenie_id: o.id, member_id: me }))).then(() => {}, () => {});
      } }, 'Rozumiem'),
    ]);
  } catch { /* ogłoszenia nie blokują aplikacji */ }
}
