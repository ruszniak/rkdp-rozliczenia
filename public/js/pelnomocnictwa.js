// Pełnomocnictwa klienta z terminami: UPL-1, PEL (ZUS), PPO-1, PPS-1, KSeF – kto je ma, zakres, ważność, alert przed wygaśnięciem.
import { h, toast, fail, modal } from './ui.js';
import { sb, state, memberById } from './store.js';
// bez „null” w treści: puste elementy (null/false) są pomijane
const put = (el, ...k) => el.replaceChildren(...k.flat().filter(x => x != null && x !== false));

export const POA = {
  'UPL-1': 'UPL-1 – podpisywanie deklaracji (e-Deklaracje / e-US)',
  PEL: 'PEL – ZUS (PUE / eZUS)',
  'PPO-1': 'PPO-1 – ogólne pełnomocnictwo podatkowe',
  'PPS-1': 'PPS-1 – szczególne w sprawach podatkowych',
  'ZAW-FA': 'ZAW-FA – uprawnienia KSeF (zawiadomienie)',
  KSeF: 'Uprawnienia nadane w KSeF',
  inne: 'Inne',
};
const today = () => new Date().toLocaleDateString('sv-SE');
const plus = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
const fmt = d => d ? d.split('-').reverse().join('.') : '';
export const poaState = p => p.revoked_at ? 'revoked' : p.valid_to && p.valid_to < today() ? 'expired' : p.valid_to && p.valid_to <= plus(30) ? 'soon' : 'ok';
const holder = p => memberById(p.holder_id)?.full_name || p.holder_name || '—';

// ostrzeżenia do Pulpitu: wygasające w 30 dni i wygasłe w ostatnich 30 dniach (nieodwołane)
export function poaAlerts(rows, cname) {
  return rows.filter(p => !p.revoked_at && p.valid_to && p.valid_to >= plus(-30) && p.valid_to <= plus(30)).map(p => ({
    level: p.valid_to < today() ? 'err' : 'warn', client_id: p.client_id,
    title: `${p.kind}${p.valid_to < today() ? ' wygasło' : ' wygasa'} ${fmt(p.valid_to)}`,
    text: `${cname ? cname(p.client_id) + ' · ' : ''}${holder(p)}${p.scope ? ' · ' + p.scope : ''}`,
  }));
}

export function poaCard(c, { editable = true } = {}) {
  const box = h('section', { class: 'card section poa-card' }, h('div', { class: 'section-head' }, h('h2', {}, 'Pełnomocnictwa')), h('p', { class: 'hint' }, 'Wczytywanie…'));
  async function draw() {
    const { data, error } = await sb.from('client_poa').select('*').eq('client_id', c.id).order('valid_to', { ascending: true, nullsFirst: false });
    if (error) { put(box, h('div', { class: 'section-head' }, h('h2', {}, 'Pełnomocnictwa')), h('p', { class: 'hint' }, 'Niedostępne.')); return; }
    const rows = [...data].sort((a, b) => ({ expired: 0, soon: 1, ok: 2, revoked: 3 })[poaState(a)] - ({ expired: 0, soon: 1, ok: 2, revoked: 3 })[poaState(b)]);
    const ST = { ok: ['ważne', 'ok'], soon: ['wygasa wkrótce', 'soon'], expired: ['wygasło', 'exp'], revoked: ['odwołane', 'rev'] };
    put(box, 
      h('div', { class: 'section-head' }, h('h2', {}, 'Pełnomocnictwa'), editable ? h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: () => edit({}) }, '+ Dodaj') : null),
      rows.length ? h('div', { class: 'poa-list' }, ...rows.map(p => { const s = poaState(p);
        return h('button', { type: 'button', class: 'poa-row', onclick: () => editable && edit(p) },
          h('span', { class: 'poa-kind' }, p.kind),
          h('span', { class: 'poa-main' }, h('b', {}, holder(p)), h('span', { class: 'small muted' }, [p.scope, p.office].filter(Boolean).join(' · ') || POA[p.kind])),
          h('span', { class: 'small' }, p.valid_to ? `do ${fmt(p.valid_to)}` : 'bezterminowo'),
          h('span', { class: 'poa-st poa-' + ST[s][1] }, ST[s][0]));
      })) : h('p', { class: 'small muted' }, 'Brak wpisanych pełnomocnictw. Dodaj UPL-1, PEL, PPO-1 itd. – z terminem ważności, karta przypomni przed wygaśnięciem.'));
  }
  function edit(p) {
    const kind = h('select', { class: 'select' }, ...Object.entries(POA).map(([k, v]) => h('option', { value: k, selected: k === (p.kind || 'UPL-1') }, v)));
    const team = state.members.filter(m => m.active !== false);
    const who = h('select', { class: 'select' }, h('option', { value: '' }, '— osoba spoza zespołu —'), ...team.map(m => h('option', { value: m.id, selected: m.id === p.holder_id }, m.full_name)));
    const whoName = h('input', { class: 'input', maxlength: 200, placeholder: 'imię i nazwisko / firma', value: p.holder_name || '' });
    const scope = h('input', { class: 'input', maxlength: 500, placeholder: 'np. VAT, PIT, CIT; podpisywanie deklaracji', value: p.scope || '' });
    const office = h('input', { class: 'input', maxlength: 200, placeholder: 'np. US Wrocław-Fabryczna / ZUS', value: p.office || '' });
    const from = h('input', { class: 'input', type: 'date', value: p.valid_from || '' });
    const to = h('input', { class: 'input', type: 'date', value: p.valid_to || '' });
    const rev = h('input', { class: 'input', type: 'date', value: p.revoked_at || '' });
    const note = h('input', { class: 'input', maxlength: 500, value: p.note || '' });
    const syncWho = () => { whoName.closest('label').hidden = !!who.value; };
    who.addEventListener('change', syncWho);
    const close = modal(p.id ? `Pełnomocnictwo ${p.kind}` : 'Nowe pełnomocnictwo', h('div', { class: 'form-grid' },
      h('label', { class: 'field' }, h('span', {}, 'Rodzaj'), kind),
      h('label', { class: 'field' }, h('span', {}, 'Pełnomocnik'), who),
      h('label', { class: 'field' }, h('span', {}, 'Pełnomocnik spoza zespołu'), whoName),
      h('label', { class: 'field' }, h('span', {}, 'Zakres'), scope),
      h('label', { class: 'field' }, h('span', {}, 'Urząd / organ'), office),
      h('label', { class: 'field' }, h('span', {}, 'Ważne od'), from),
      h('label', { class: 'field' }, h('span', {}, 'Ważne do (puste = bezterminowo)'), to),
      h('label', { class: 'field' }, h('span', {}, 'Odwołane dnia'), rev),
      h('label', { class: 'field' }, h('span', {}, 'Notatka'), note)),
    c2 => [p.id ? h('button', { class: 'btn btn-ghost', onclick: async () => { if (!confirm('Usunąć wpis o pełnomocnictwie?')) return; const { error } = await sb.from('client_poa').delete().eq('id', p.id); if (error) return fail(error); c2(); toast('Usunięto'); draw(); } }, 'Usuń') : null,
      h('button', { class: 'btn btn-ghost', onclick: c2 }, 'Anuluj'),
      h('button', { class: 'btn btn-primary', onclick: async () => {
        if (to.value && from.value && to.value < from.value) return toast('Data „do” jest wcześniejsza niż „od”', true);
        const rec = { client_id: c.id, kind: kind.value, holder_id: who.value || null, holder_name: who.value ? null : (whoName.value.trim() || null), scope: scope.value.trim() || null, office: office.value.trim() || null, valid_from: from.value || null, valid_to: to.value || null, revoked_at: rev.value || null, note: note.value.trim() || null };
        const { error } = p.id ? await sb.from('client_poa').update(rec).eq('id', p.id) : await sb.from('client_poa').insert(rec);
        if (error) return fail(error); c2(); toast('Zapisano'); draw();
      } }, 'Zapisz')], { wide: true });
    syncWho();
    return close;
  }
  draw();
  return box;
}
