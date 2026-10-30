// Karta klienta → „ZUS: składki i wakacje”: historia rodzajów składek właściciela (z kodem tytułu ubezpieczenia i datami),
// wakacje składkowe (jeden miesiąc w roku) oraz podpowiedź, kiedy można zgłosić Mały ZUS Plus.
import { h, toast, fail, modal } from './ui.js';
import { sb } from './store.js';
import { ZUS_TYPE, ZUS_SHORT } from './dict.js';

const CODE = { pelny: '05 10 00', preferencyjny: '05 70 00', maly_zus_plus: '05 90 00' };
const MON = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
const addM = (d, n) => { const [y, m] = d.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1 + n, 1)); return t.toISOString().slice(0, 10); };
const lastDay = d => { const n = addM(d, 1); const t = new Date(n + 'T00:00:00Z'); t.setUTCDate(0); return t.toISOString().slice(0, 10); };
const MON_G = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
const monGen = d => `${MON_G[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`;
const fmt = d => d ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : '';
const monLbl = d => `${MON[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`;
const today = () => new Date().toISOString().slice(0, 10);
// liczba miesięcy kalendarzowych okresu (każdy rozpoczęty miesiąc się liczy), do dziś gdy trwa
const months = (from, to) => { const end = to || today(); if (end < from) return 0; const [a, b] = [from, end].map(x => x.split('-').map(Number)); return (b[0] - a[0]) * 12 + (b[1] - a[1]) + 1; };

export const showsZus = c => ['jdg', 'spolka_cywilna', 'spolka_jawna', 'spolka_partnerska', 'spolka_komandytowa'].includes(c.legal_form) || !!c.zus_type;

export function zusCard(c, { editable = true, onTypeChange } = {}) {
  const box = h('section', { class: 'card section zus-card' }, h('div', { class: 'section-head' }, h('h2', {}, 'ZUS: składki i wakacje')), h('p', { class: 'hint' }, 'Wczytywanie…'));
  let rows = [];

  async function load() {
    const { data, error } = await sb.from('client_zus').select('*').eq('client_id', c.id).order('valid_from');
    if (error) { box.replaceChildren(h('div', { class: 'section-head' }, h('h2', {}, 'ZUS: składki i wakacje')), h('p', { class: 'hint' }, 'Historia ZUS będzie dostępna po aktualizacji bazy.')); return; }
    rows = data || []; draw();
  }

  function advice(sk) {
    const now = today(), cur = [...sk].reverse().find(r => r.valid_from <= now && (!r.valid_to || r.valid_to >= now));
    const mzp = sk.filter(r => r.zus_type === 'maly_zus_plus');
    const used = mzp.reduce((n, r) => n + months(r.valid_from, r.valid_to && r.valid_to < now ? r.valid_to : null), 0);
    const nextJan = `${+now.slice(0, 4) + 1}-01-01`;
    const cond = 'warunki: przychód z działalności w poprzednim roku ≤ 120 tys. zł (proporcjonalnie przy niepełnym roku) i działalność min. 60 dni w poprzednim roku';
    const out = [];
    if (!cur) out.push(['Brak bieżącego wpisu – dodaj obecne składki, żeby policzyć terminy.']);
    else if (cur.zus_type === 'ulga_na_start') {
      const d = new Date(cur.valid_from + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 6); d.setUTCDate(d.getUTCDate() - 1);
      const end = cur.valid_to || d.toISOString().slice(0, 10);
      out.push([`Ulga na start do ${fmt(end)} (6 mies. od rozpoczęcia działalności).`, `Potem preferencyjny ZUS przez 24 pełne miesiące kalendarzowe, a po nim Mały ZUS Plus (przy spełnieniu warunków).`]);
    } else if (cur.zus_type === 'preferencyjny') {
      const end = cur.valid_to || lastDay(addM(cur.valid_from.slice(0, 7) + '-01', 23));
      out.push([`Preferencyjny ZUS do ${fmt(end)} (24 mies.).`, `Mały ZUS Plus można zgłosić od ${monGen(addM(end.slice(0, 7) + '-01', 1))} – w ciągu 7 dni od końca preferencyjnego; ${cond}.`]);
    } else if (cur.zus_type === 'maly_zus_plus') {
      const left = Math.max(0, 36 - used);
      out.push([`Mały ZUS Plus: wykorzystano ${used} z 36 mies. – zostało ${left}.`, left ? `Przy ciągłym korzystaniu limit skończy się z końcem ${monGen(addM(now.slice(0, 7) + '-01', left - 1))}. Co roku do 31 stycznia trzeba rozliczyć dochód (ZUS DRA za styczeń).` : 'Limit wykorzystany – od następnego miesiąca pełny ZUS.']);
    } else if (cur.zus_type === 'pelny') {
      out.push([used >= 36 ? `Mały ZUS Plus: limit 36 mies. wykorzystany w tym 60-miesięcznym okresie.` : `Mały ZUS Plus najwcześniej od ${fmt(nextJan)} – zgłoszenie do 31 stycznia (wyrejestrowanie i zgłoszenie z kodem 05 90).`,
        used && used < 36 ? `W historii: ${used} mies. Małego ZUS Plus – zostało ${36 - used} w tym okresie.` : cond + '.']);
    } else out.push([`Obecnie: ${ZUS_SHORT[cur.zus_type] || cur.zus_type}.`]);
    return out;
  }

  function draw() {
    const sk = rows.filter(r => r.kind === 'skladki'), hol = rows.filter(r => r.kind === 'wakacje');
    const y = +today().slice(0, 4), holY = hol.find(r => +r.valid_from.slice(0, 4) === y);
    const del = r => editable ? h('button', { type: 'button', class: 'chat-a', 'aria-label': 'Usuń wpis', onclick: async () => {
      if (!confirm('Usunąć ten wpis z historii ZUS?')) return;
      const { error } = await sb.from('client_zus').delete().eq('id', r.id); if (error) return fail(error); toast('Usunięto'); load(); } }, 'usuń') : null;
    box.replaceChildren(
      h('div', { class: 'section-head' }, h('h2', {}, 'ZUS: składki i wakacje'),
        editable ? h('div', { class: 'row-btns' }, h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: addHoliday }, '+ Wakacje'), h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: addPeriod }, '+ Zmiana składek')) : null),
      h('div', { class: 'zus-hol-box' + (holY ? ' on' : '') },
        h('b', {}, 'Wakacje składkowe ' + y + ': '), holY ? monLbl(holY.valid_from) : 'nie wykorzystane',
        holY ? null : h('div', { class: 'small muted' }, +today().slice(5, 7) < 12 ? `Wniosek RWS składa się w miesiącu poprzedzającym wakacje (np. w listopadzie za grudzień). Raz w roku, jeden miesiąc.` : 'W tym roku już za późno – następna możliwość w przyszłym roku.'),
        hol.filter(r => r !== holY).length ? h('div', { class: 'small muted' }, 'Wcześniej: ' + hol.filter(r => r !== holY).map(r => monLbl(r.valid_from)).reverse().join(', ')) : null),
      ...advice(sk).map(lines => h('div', { class: 'zus-adv' }, ...lines.map((l, i) => h(i ? 'div' : 'b', { class: i ? 'small' : '' }, l)))),
      sk.length ? h('ol', { class: 'zus-hist' }, ...[...sk].reverse().map(r => h('li', {},
        h('div', {}, h('b', {}, ZUS_SHORT[r.zus_type] || r.zus_type), r.code ? h('span', { class: 'zus-code' }, r.code) : null),
        h('div', { class: 'small muted' }, `${fmt(r.valid_from)} – ${r.valid_to ? fmt(r.valid_to) : 'obecnie'} · ${months(r.valid_from, r.valid_to)} mies.`, r.note ? ` · ${r.note}` : ''),
        del(r))))
        : h('p', { class: 'hint' }, 'Brak historii składek. Dodaj, od kiedy klient jest na danym ZUS (np. preferencyjny od 01.03.2025), a karta policzy, kiedy można przejść na Mały ZUS Plus.'),
      hol.length && editable ? h('div', { class: 'small muted', style: { marginTop: '6px' } }, ...hol.map(r => h('span', { style: { marginRight: '10px' } }, monLbl(r.valid_from), ' ', del(r)))) : null);
  }

  function addPeriod() {
    const type = h('select', { class: 'select' }, ...Object.entries(ZUS_TYPE).map(([k, v]) => h('option', { value: k, selected: k === (c.zus_type || 'pelny') }, v)));
    const code = h('input', { class: 'input', placeholder: 'np. 05 90 00', maxlength: 20, value: CODE[type.value] || '' });
    type.addEventListener('change', () => { code.value = CODE[type.value] || ''; });
    const from = h('input', { class: 'input', type: 'date', value: today().slice(0, 8) + '01' });
    const to = h('input', { class: 'input', type: 'date' });
    const note = h('input', { class: 'input', maxlength: 500, placeholder: 'opcjonalnie' });
    const setCur = h('input', { type: 'checkbox', checked: true });
    modal('Zmiana składek ZUS', h('div', { class: 'form-grid' },
      h('label', { class: 'field' }, h('span', {}, 'Rodzaj składek'), type),
      h('label', { class: 'field' }, h('span', {}, 'Kod tytułu ubezpieczenia'), code),
      h('label', { class: 'field' }, h('span', {}, 'Od'), from),
      h('label', { class: 'field' }, h('span', {}, 'Do (puste = trwa)'), to),
      h('label', { class: 'field' }, h('span', {}, 'Notatka'), note),
      h('label', { class: 'check' }, setCur, 'Ustaw jako obecne składki w karcie klienta (gdy okres trwa)'),
      h('p', { class: 'small muted' }, 'Poprzedni trwający okres zamknie się automatycznie dzień przed nową datą „od”.')),
    close => [h('button', { class: 'btn btn-ghost', onclick: close }, 'Anuluj'), h('button', { class: 'btn btn-primary', onclick: async () => {
      if (!from.value) return toast('Podaj datę „od”', true);
      if (to.value && to.value < from.value) return toast('Data „do” jest wcześniejsza niż „od”', true);
      const open = rows.filter(r => r.kind === 'skladki' && !r.valid_to && r.valid_from < from.value);
      for (const r of open) { const d = new Date(from.value + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); const { error } = await sb.from('client_zus').update({ valid_to: d.toISOString().slice(0, 10) }).eq('id', r.id); if (error) return fail(error); }
      const { error } = await sb.from('client_zus').insert({ client_id: c.id, kind: 'skladki', zus_type: type.value, code: code.value.trim() || null, valid_from: from.value, valid_to: to.value || null, note: note.value.trim() || null });
      if (error) return fail(error);
      if (setCur.checked && !to.value && type.value !== c.zus_type) {
        const { error: e2 } = await sb.from('clients').update({ zus_type: type.value }).eq('id', c.id);
        if (e2) fail(e2); else { c.zus_type = type.value; onTypeChange?.(type.value); }
      }
      close(); toast('Zapisano'); load();
    } }, 'Zapisz')]);
  }

  function addHoliday() {
    const y = +today().slice(0, 4), m = +today().slice(5, 7);
    const def = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    const mon = h('input', { class: 'input', type: 'month', value: def });
    modal('Wakacje składkowe', h('div', {},
      h('label', { class: 'field' }, h('span', {}, 'Miesiąc wakacji (bez składek społecznych)'), mon),
      h('p', { class: 'small muted' }, 'Raz w roku kalendarzowym, jeden miesiąc. Wniosek RWS przez PUE/eZUS w miesiącu poprzedzającym. Składka zdrowotna płatna normalnie.')),
    close => [h('button', { class: 'btn btn-ghost', onclick: close }, 'Anuluj'), h('button', { class: 'btn btn-primary', onclick: async () => {
      if (!/^\d{4}-\d{2}$/.test(mon.value)) return toast('Wybierz miesiąc', true);
      const { error } = await sb.from('client_zus').insert({ client_id: c.id, kind: 'wakacje', valid_from: mon.value + '-01' });
      if (error) return /client_zus_wakacje_rok|duplicate/.test(error.message || '') ? toast('W tym roku wakacje są już wpisane (można raz w roku)', true) : fail(error);
      close(); toast('Zapisano wakacje: ' + monLbl(mon.value + '-01')); load();
    } }, 'Zapisz')]);
  }

  load();
  return box;
}
