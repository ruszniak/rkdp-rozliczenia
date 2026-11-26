// Historia klienta – jedna oś czasu: e-maile, podpisy, pliki, spotkania, oferty, zlecenia/umowy i sprawy.
// Działa na karcie klienta RKDP i M2 TAX; każde źródło czyta przez RLS (czego ktoś nie widzi, tego nie ma na osi).
import { h } from './ui.js';
import { sb } from './store.js';

const KINDS = { mail: 'E-maile', sign: 'Podpisy', file: 'Pliki', meet: 'Spotkania', offer: 'Oferty', doc: 'Umowy i zlecenia', matter: 'Sprawy' };
const DOT = { mail: '#2563EB', sign: '#7A5A37', file: '#6B7280', meet: '#0E9F6E', offer: '#C27803', doc: '#7E3AF2', matter: '#E02424' };
const SIGN = { wyslano: 'czeka na podpis', podpisano: 'podpisano', anulowano: 'anulowano' };
const MEET = { confirmed: 'umówione', cancelled: 'odwołane' };
const OFFER = { projekt: 'projekt', wyslana: 'wysłana', zaakceptowana: 'zaakceptowana', odrzucona: 'odrzucona' };
const when = d => new Date(d).toLocaleString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

async function collect({ rk, m2 }) {
  const ids = m2.filter(Boolean);
  const q = (p, map) => p.then(({ data, error }) => error ? [] : (data || []).map(map)).catch(() => []);
  const both = (t, sel) => {
    const parts = [rk ? `client_id.eq.${rk}` : null, ids.length ? `m2_client_id.in.(${ids.join(',')})` : null].filter(Boolean).join(',');
    return parts ? sb.from(t).select(sel).or(parts) : Promise.resolve({ data: [] });
  };
  const lists = await Promise.all([
    rk ? q(sb.from('client_messages').select('id, subject, status, sent_at, sender_name, email').eq('client_id', rk).order('sent_at', { ascending: false }).limit(80),
      r => ({ k: 'mail', at: r.sent_at, t: r.subject || 'Wiadomość', s: [r.status === 'blad' ? 'nie wysłano' : 'wysłano', r.email, r.sender_name].filter(Boolean).join(' · ') })) : [],
    rk ? q(sb.from('client_files').select('id, name, category, created_at').eq('client_id', rk).order('created_at', { ascending: false }).limit(80),
      r => ({ k: 'file', at: r.created_at, t: r.name, s: 'plik w archiwum' })) : [],
    q(both('sign_requests', 'id, title, status, created_at, signed_at, email'), r => ({ k: 'sign', at: r.signed_at || r.created_at, t: r.title, s: [SIGN[r.status] || r.status, r.email].filter(Boolean).join(' · ') })),
    q(both('meetings', 'id, title, start_at, status, private'), r => r.private ? null : ({ k: 'meet', at: r.start_at, t: r.title || 'Spotkanie', s: MEET[r.status] || r.status, href: `#/spotkania/${r.id}` })),
    q(both('offers', 'id, number, brand, status, created_at'), r => ({ k: 'offer', at: r.created_at, t: `Oferta ${r.number || ''}`.trim(), s: [r.brand === 'm2' ? 'M2 TAX' : 'RKDP', OFFER[r.status] || r.status].join(' · '), href: `${r.brand === 'm2' ? '#/doradztwo/oferty' : '#/oferty'}/${r.id}` })),
    ids.length ? q(sb.from('m2_orders').select('id, number, doc_type, subject, status, created_at, firm').in('client_id', ids),
      r => ({ k: 'doc', at: r.created_at, t: `${r.doc_type === 'umowa' ? 'Umowa' : 'Zlecenie'} ${r.number || ''}`.trim(), s: [r.firm === 'rkdp' ? 'RKDP' : 'M2 TAX', r.status, r.subject].filter(Boolean).join(' · '), href: `#/doradztwo/zlecenie/${r.id}` })) : [],
    ids.length ? q(sb.from('m2_matters').select('id, number, title, status, opened_at, created_at').in('client_id', ids),
      r => ({ k: 'matter', at: r.opened_at || r.created_at, t: `Sprawa ${r.number || ''} – ${r.title || ''}`.replace(/ – $/, ''), s: r.status, href: `#/doradztwo/sprawa/${r.id}` })) : [],
  ]);
  return lists.flat().filter(x => x && x.at).sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

// rk – id klienta RKDP (clients), m2 – id klienta w module doradztwa (m2_clients); brakujące dociągamy po powiązaniu
export function timelineCard({ rk = null, m2 = null } = {}) {
  const list = h('div', { class: 'tl-list' }, h('p', { class: 'hint' }, 'Wczytywanie…'));
  const chips = h('div', { class: 'tl-chips' });
  const card = h('section', { class: 'card section tl-card' }, h('div', { class: 'section-head' }, h('h2', {}, 'Historia klienta')), chips, list);
  let all = [], filter = '', limit = 12;
  const draw = () => {
    const have = new Set(all.map(x => x.k));
    chips.replaceChildren(...[['', 'Wszystko'], ...Object.entries(KINDS).filter(([k]) => have.has(k))].map(([k, t]) =>
      h('button', { type: 'button', class: 'tl-chip' + (filter === k ? ' on' : ''), onclick: () => { filter = k; limit = 12; draw(); } }, t)));
    const rows = all.filter(x => !filter || x.k === filter);
    if (!rows.length) return list.replaceChildren(h('p', { class: 'hint' }, all.length ? 'Brak wpisów tego rodzaju.' : 'Brak historii – pojawią się tu e-maile, podpisy, pliki, spotkania, oferty i sprawy.'));
    list.replaceChildren(...[...rows.slice(0, limit).map(x => h(x.href ? 'a' : 'div', { class: 'tl-row', href: x.href || null },
      h('span', { class: 'tl-dot', style: { background: DOT[x.k] } }),
      h('div', { class: 'tl-body' }, h('b', {}, x.t), h('span', { class: 'small muted' }, `${KINDS[x.k]} · ${when(x.at)}${x.s ? ' · ' + x.s : ''}`)))),
      rows.length > limit ? h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => { limit += 25; draw(); } }, `Pokaż więcej (${rows.length - limit})`) : null].filter(Boolean));
  };
  (async () => {
    let rkId = rk, m2Ids = m2 ? [m2] : [];
    if (rk) { const { data } = await sb.from('m2_clients').select('id').eq('rkdp_client_id', rk); m2Ids = [...new Set([...m2Ids, ...(data || []).map(x => x.id)])]; }
    if (m2 && !rk) { const { data } = await sb.from('m2_clients').select('rkdp_client_id').eq('id', m2).maybeSingle(); rkId = data?.rkdp_client_id || null; }
    all = await collect({ rk: rkId, m2: m2Ids });
    draw();
  })().catch(() => list.replaceChildren(h('p', { class: 'hint' }, 'Nie udało się wczytać historii.')));
  return card;
}
