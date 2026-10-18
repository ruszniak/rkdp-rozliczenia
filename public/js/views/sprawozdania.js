// RKDP – zatwierdzanie sprawozdań finansowych: dane z KRS + protokół ZZW z uchwałami (Word / PDF).
import { h, toast, fail, icon, infoTip } from '../ui.js';

const HELP = {
  all: `Co wpisujesz:
• Spółka: wybierasz spółkę z bazy klientów i klikasz „Pobierz z KRS”. Uzupełnia się firma, adres, kapitał, wspólnicy z liczbą udziałów i zarząd z funkcjami. Pokazuje się też, za jaki okres złożono ostatnie sprawozdanie.
• Zgromadzenie: rok obrotowy, data, miejscowość i przewodniczący. Do wyboru tryb: bez formalnego zwołania (art. 240 KSH) albo zwołane przez zarząd.
• Sprawozdanie: suma bilansowa i wynik netto (stratę wpisujesz z minusem). Przy zysku wybierasz kapitał zapasowy, dywidendę, pokrycie strat z lat ubiegłych albo własną treść. Przy stracie: pokrycie z zysków lat przyszłych, z kapitału zapasowego albo własną treść.
• Dwa pola do zaznaczenia: uchwała o sprawozdaniu zarządu z działalności oraz pełny zakres sprawozdania (zmiany w kapitale, przepływy pieniężne).

Co powstaje:
• Protokół z porządkiem obrad i uchwałami: wybór przewodniczącego, porządek obrad, zatwierdzenie sprawozdania, podział zysku albo pokrycie straty i osobne absolutorium dla każdego członka zarządu.
• Głosy liczą się same. Wspólnik, który jest też w zarządzie, nie głosuje nad własnym absolutorium (art. 244 KSH).
• Na końcu jest lista obecności do podpisu.
• Przy jednym wspólniku dokument przyjmuje formę uchwał jedynego wspólnika (art. 156 KSH), bez głosowań.
• Dokument jest bez papieru RKDP, bo to dokument spółki. W stopce jest jej nazwa, KRS i NIP.
• Protokoły zapisują się na liście w zakładce. Usuwać je może tylko administrator.

Dwa ograniczenia KRS:
• Zamaskowane nazwiska: darmowe API KRS ukrywa imiona i nazwiska (np. „R*******, M*****”). Wpisujesz je raz, a przy kolejnym protokole tej spółki podpowiedzą się same. Jeśli ta sama osoba jest wspólnikiem i członkiem zarządu, wystarczy ją wpisać w jednym miejscu.
• Brakujący wspólnicy: KRS pokazuje tylko wspólników mających co najmniej 10% kapitału. Gdy udziały nie sumują się do kapitału, aplikacja ostrzega i podaje, ilu brakuje.`,
  company: `Wybierz spółkę z bazy klientów i kliknij „Pobierz z KRS”. Uzupełnia się firma, adres, kapitał, wspólnicy z liczbą udziałów i zarząd z funkcjami. Pod polami pokaże się, za jaki okres złożono ostatnie sprawozdanie.`,
  shareholders: `• Zamaskowane nazwiska: darmowe API KRS ukrywa imiona i nazwiska (np. „R*******, M*****”). Wpisujesz je raz, a przy kolejnym protokole tej spółki podpowiedzą się same. Jeśli ta sama osoba jest wspólnikiem i członkiem zarządu, wystarczy ją wpisać w jednym miejscu.
• Brakujący wspólnicy: KRS pokazuje tylko wspólników mających co najmniej 10% kapitału. Gdy udziały nie sumują się do kapitału, aplikacja ostrzega i podaje, ilu brakuje.
• Przy jednym wspólniku dokument przyjmuje formę uchwał jedynego wspólnika (art. 156 KSH), bez głosowań i listy obecności.`,
  board: `Każdy członek zarządu dostaje osobną uchwałę o absolutorium. Głosy liczą się same – wspólnik, który jest też w zarządzie, nie głosuje nad własnym absolutorium (art. 244 KSH).`,
  meeting: `Rok obrotowy, data, miejscowość i przewodniczący. Tryb do wyboru: bez formalnego zwołania, gdy reprezentowany jest cały kapitał i nikt nie zgłasza sprzeciwu (art. 240 KSH), albo zwołane przez zarząd (art. 238 KSH) – wtedy podaj datę wysłania zawiadomień.`,
  fs: `• Suma bilansowa i wynik netto (stratę wpisujesz z minusem).
• Przy zysku: kapitał zapasowy, dywidenda, pokrycie strat z lat ubiegłych albo własna treść. Przy stracie: pokrycie z zysków lat przyszłych, z kapitału zapasowego albo własna treść.
• Zaznacz uchwałę o sprawozdaniu zarządu z działalności, jeśli spółka je sporządza, oraz pełny zakres sprawozdania (zmiany w kapitale, przepływy pieniężne) dla jednostek badanych.`,
};
const head2 = (text, tip, extra) => h('div', { class: 'section-head' }, h('h2', { style: { display: 'flex', alignItems: 'center' } }, text, infoTip(tip)), extra || null);
import { sb, state, isAdmin } from '../store.js';
import { fetchAll } from './rozliczenia.js';
import { printableHtml, buildOrderDocx, zl } from '../m2/order.js';
import { downloadBytes } from '../docx.js';
import { ZZW_DEFAULTS, zzwBlocks, companyBrand, parseShares, matchKnown, isMasked } from '../rkdp/zzw.js';

const BASE = '#/sprawozdania';
const title = s => String(s || '').toLowerCase().replace(/(^|[\s\-–(])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
const shortCo = s => String(s || '').replace(/SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ/i, 'sp. z o.o.');
const dShort = iso => iso ? iso.slice(0, 10).split('-').reverse().join('.') : '—';

export async function renderSprawozdania(main, id) {
  if (id) return renderEditor(main, id === 'nowy' ? null : id);
  const [{ data: rows, error }, clients] = await Promise.all([
    sb.from('rkdp_protocols').select('id, client_id, period_to, meeting_date, params, updated_at').order('updated_at', { ascending: false }),
    fetchAll(() => sb.from('clients').select('id, name').order('name')),
  ]);
  if (error) throw error;
  const cname = Object.fromEntries(clients.map(c => [c.id, c.name]));
  main.replaceChildren(
    h('div', { class: 'page-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, 'Sprawozdania finansowe'), h('h1', { style: { marginTop: '6px', display: 'flex', alignItems: 'center' } }, 'Zatwierdzenie sprawozdania', infoTip(HELP.all, 'Zatwierdzenie sprawozdania – instrukcja')),
        h('p', { class: 'sub' }, 'Protokół zwyczajnego zgromadzenia wspólników sp. z o.o. z uchwałami: sprawozdanie, podział zysku albo pokrycie straty, absolutoria. Dane spółki, wspólników i zarządu pobierane z KRS.')),
      h('a', { class: 'btn btn-primary', href: `${BASE}/nowy` }, icon('plus'), 'Nowy protokół')),
    h('div', { class: 'list-wrap' }, h('table', { class: 'list' },
      h('thead', {}, h('tr', {}, ...['Spółka', 'Rok obrotowy', 'Data zgromadzenia', 'Wynik netto', 'Zmieniono', ''].map(x => h('th', {}, x)))),
      h('tbody', {}, ...((rows || []).length ? rows.map(r => {
        const R = Number(String(r.params?.result ?? '').replace(',', '.'));
        return h('tr', { class: 'click', onclick: () => { location.hash = `${BASE}/${r.id}`; } },
          h('td', {}, h('b', {}, cname[r.client_id] || r.params?.company || '—')),
          h('td', {}, r.period_to ? r.period_to.slice(0, 4) : '—'), h('td', {}, dShort(r.meeting_date)),
          h('td', {}, r.params?.result === '' || r.params?.result == null || isNaN(R) ? '—' : (R < 0 ? 'strata ' : 'zysk ') + zl(Math.abs(R))),
          h('td', { class: 'small' }, dShort(r.updated_at)),
          h('td', {}, isAdmin() ? h('button', { class: 'btn btn-ghost btn-sm', onclick: async (e) => {
            e.stopPropagation();
            if (!confirm('Usunąć zapisany protokół?')) return;
            const { error: er } = await sb.from('rkdp_protocols').delete().eq('id', r.id);
            if (er) return fail(er);
            toast('Usunięto'); renderSprawozdania(main);
          } }, 'Usuń') : null));
      }) : [h('tr', {}, h('td', { colspan: 6, class: 'empty' }, 'Brak protokołów. Utwórz pierwszy przyciskiem „Nowy protokół”.'))]))))
  );
}

async function renderEditor(main, id) {
  const clients = (await fetchAll(() => sb.from('clients').select('id, name, legal_form, nip, regon, krs, address').order('name'))).filter(c => c.legal_form !== 'jdg');
  let row = null;
  if (id) {
    const { data, error } = await sb.from('rkdp_protocols').select('*').eq('id', id).single();
    if (error) throw error;
    row = data;
  }
  let clientId = row?.client_id || new URLSearchParams(location.hash.split('?')[1] || '').get('client') || '';
  const p = { ...ZZW_DEFAULTS(), ...(row?.params || {}) };
  let dirty = false;
  const markDirty = () => { dirty = true; saveInfo.textContent = 'Niezapisane zmiany'; };
  const personEls = new WeakMap();   // osoba → { first, last, g } pola formularza

  // znane osoby z poprzednich protokołów tej spółki – do odmaskowania danych z KRS
  async function knownPeople(cid) {
    if (!cid) return [];
    const { data } = await sb.from('rkdp_protocols').select('params').eq('client_id', cid).order('updated_at', { ascending: false }).limit(5);
    return (data || []).flatMap(r => [...(r.params?.shareholders || []), ...(r.params?.board || [])]).filter(x => x.first && x.last && !isMasked(x));
  }
  const fillFromClient = c => {
    if (!c) return;
    Object.assign(p, { company: p.company || c.name, nip: p.nip || c.nip || '', regon: p.regon || c.regon || '', krs: p.krs || c.krs || '', address: p.address || c.address || '' });
  };

  const krsInfo = h('p', { class: 'hint', style: { margin: '6px 0 0' } });
  async function pullKrs() {
    if (!p.krs) return toast('Wpisz numer KRS spółki', true);
    krsBtn.disabled = true; krsBtn.textContent = 'Pobieram z KRS…';
    try {
      const { data: r, error } = await sb.functions.invoke('nip-lookup', { body: { krs: p.krs } });
      if (error) throw error;
      if (r?.error) throw new Error(r.error);
      if (!r?.found) { toast('Nie znaleziono spółki o tym numerze KRS', true); return; }
      const known = await knownPeople(clientId);
      const unmask = x => { const k = matchKnown(x, known); const krs_mask = `${x.last}|${x.first}`; return k ? { first: k.first, last: k.last, g: k.g || 'm', krs_mask } : { first: x.first ? title(x.first) : '', last: x.last ? title(x.last) : '', g: 'm', krs_mask }; };
      const a = r.address || {};
      Object.assign(p, {
        company: shortCo(r.name || p.company), krs: r.krs, nip: r.nip || p.nip, regon: r.regon || p.regon,
        seat: r.seat?.miejscowosc ? title(r.seat.miejscowosc) : p.seat,
        address: [a.ulica ? `ul. ${title(a.ulica)} ${a.nrDomu || ''}${a.nrLokalu ? '/' + a.nrLokalu : ''}`.trim() : '', `${a.kodPocztowy || ''} ${title(a.miejscowosc || '')}`.trim()].filter(Boolean).join(', ') || p.address,
        capital: r.capital ? r.capital.replace(/\s/g, '') : p.capital,
        shareholders: (r.shareholders || []).map(s => {
          const { shares, value } = parseShares(s.shares);
          return s.entity ? { entity: s.entity, rep: '', shares, value, present: true, krs_text: s.shares } : { ...unmask(s), shares, value, present: true, krs_text: s.shares };
        }),
        board: (r.board || []).map(b => ({ ...unmask(b), role: title(b.role).replace('Zarządu', 'zarządu') })),
      });
      if (!p.place && p.seat) p.place = p.seat;
      const last = (r.filings || [])[0];
      krsInfo.textContent = `Pobrano z KRS (stan na ${r.stanZDnia || r.checkedAt}). ${last ? `Ostatnie złożone sprawozdanie: ${last.period?.toLowerCase()} (złożone ${last.filed}).` : ''} Uzupełnij zamaskowane imiona i nazwiska (z gwiazdkami).`;
      markDirty(); build();
    } catch (e) { fail(e, 'Nie udało się pobrać odpisu z KRS'); }
    finally { krsBtn.disabled = false; krsBtn.replaceChildren(icon('download'), 'Pobierz z KRS'); }
  }
  const krsBtn = h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: pullKrs }, icon('download'), 'Pobierz z KRS');

  const inp = (obj, key, label, o = {}) => {
    const el = o.type === 'select' ? h('select', { class: 'select' }, ...Object.entries(o.opts).map(([k, v]) => h('option', { value: k }, v)))
      : o.type === 'textarea' ? h('textarea', { class: 'input', rows: 2 }, obj[key] ?? '')
        : h('input', { class: 'input', type: o.type || 'text', value: obj[key] ?? '', placeholder: o.ph || '', inputmode: o.num ? 'decimal' : null });
    if (o.type === 'select') el.value = obj[key] ?? '';
    if (o.sync) { const m = personEls.get(obj) || {}; m[key] = el; personEls.set(obj, m); }
    el.addEventListener(o.type === 'select' ? 'change' : 'input', () => { obj[key] = el.value; markDirty(); if (o.sync) syncPerson(obj); if (o.rebuild) build(); });
    return h('label', { class: 'field' + (o.wide ? ' wide' : '') }, h('span', {}, label), el);
  };
  const chk = (obj, key, label, rebuild) => {
    const el = h('input', { type: 'checkbox', checked: obj[key] !== false && !!obj[key] });
    el.addEventListener('change', () => { obj[key] = el.checked; markDirty(); if (rebuild) build(); });
    return h('label', { class: 'check' }, el, label);
  };
  const G = { m: 'Pan', k: 'Pani' };
  // ta sama osoba w KRS (wspólnik i członek zarządu mają tę samą maskę) – uzupełnij dane w obu miejscach
  function syncPerson(src) {
    if (!src.krs_mask) return;
    [...p.shareholders, ...p.board].forEach(x => {
      if (x === src || x.krs_mask !== src.krs_mask) return;
      Object.assign(x, { first: src.first, last: src.last, g: src.g });
      const m = personEls.get(x) || {};
      for (const k of ['first', 'last', 'g']) if (m[k]) m[k].value = x[k] ?? '';
    });
  }

  const box = h('div');
  function personRows(list, kind) {
    return h('div', { class: 'rows-ed' }, ...list.map((x, i) => h('div', { class: 'form-grid', style: { borderTop: i ? '1px solid var(--line, #e6e1d8)' : null, paddingTop: i ? '10px' : null, marginTop: i ? '10px' : null } },
      x.entity ? inp(x, 'entity', 'Wspólnik – nazwa', { wide: true }) : null,
      x.entity ? inp(x, 'rep', 'Reprezentowana przez (imię, nazwisko – funkcja)', { wide: true }) : inp(x, 'first', 'Imię (imiona)', { sync: true }),
      x.entity ? null : inp(x, 'last', 'Nazwisko', { sync: true }),
      x.entity ? null : inp(x, 'g', 'Forma', { type: 'select', opts: G, sync: true }),
      kind === 'sh' ? inp(x, 'shares', 'Liczba udziałów (= głosów)', { num: true }) : inp(x, 'role', 'Funkcja w zarządzie'),
      kind === 'sh' ? h('div', { style: { alignSelf: 'end', display: 'flex', gap: '14px', alignItems: 'center' } }, chk(x, 'present', 'obecny na zgromadzeniu'),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { list.splice(i, 1); markDirty(); build(); } }, 'Usuń'))
        : h('div', { style: { alignSelf: 'end' } }, h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { list.splice(i, 1); markDirty(); build(); } }, 'Usuń')),
      isMasked(x) ? h('p', { class: 'hint wide', style: { margin: 0, color: '#a0522d' } }, 'Uzupełnij pełne imię i nazwisko (KRS podaje je zamaskowane).') : null,
    )),
    h('div', { style: { display: 'flex', gap: '8px', marginTop: '10px' } },
      h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: () => { list.push(kind === 'sh' ? { first: '', last: '', g: 'm', shares: '', present: true } : { first: '', last: '', g: 'm', role: 'Prezes zarządu' }); markDirty(); build(); } }, icon('plus'), kind === 'sh' ? 'Wspólnik – osoba' : 'Członek zarządu'),
      kind === 'sh' ? h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: () => { list.push({ entity: '', rep: '', shares: '', present: true }); markDirty(); build(); } }, icon('plus'), 'Wspólnik – spółka') : null));
  }

  // KRS pokazuje tylko wspólników mających co najmniej 10% kapitału – sprawdź, czy udziały sumują się do kapitału
  function sharesWarn() {
    const cap = Number(String(p.capital || '').replace(/\s/g, '').replace(',', '.'));
    const withVal = p.shareholders.find(s => Number(s.shares) && Number(s.value));
    const sum = p.shareholders.reduce((a, s) => a + (Number(s.shares) || 0), 0);
    if (!cap || !withVal) return null;
    const expected = Math.round(cap / (Number(withVal.value) / Number(withVal.shares)));
    if (!expected || expected === sum) return null;
    return h('p', { class: 'hint', style: { color: '#a0522d' } }, `Kapitał ${String(p.capital)} zł odpowiada ${expected} udziałom, a wspólnicy na liście mają razem ${sum}. KRS pokazuje tylko wspólników z co najmniej 10% kapitału – dodaj pozostałych (brakuje ${expected - sum} udziałów).`);
  }

  function build() {
    const people = [...p.shareholders.filter(s => !s.entity), ...p.board].map(x => `${x.first || ''} ${x.last || ''}`.trim()).filter(x => x && !/\*/.test(x));
    const uniq = [...new Set(people)];
    const R = Number(String(p.result || '').replace(/\s/g, '').replace(',', '.'));
    const sole = p.shareholders.length === 1;
    const clientSel = h('select', { class: 'select' }, h('option', { value: '' }, '— wybierz spółkę —'), ...clients.map(c => h('option', { value: c.id }, c.name)));
    clientSel.value = clientId;
    clientSel.addEventListener('change', () => {
      clientId = clientSel.value; const c = clients.find(x => x.id === clientId);
      Object.assign(p, { company: '', nip: '', regon: '', krs: '', address: '' }); fillFromClient(c); markDirty(); build();
    });
    const datalist = h('datalist', { id: 'zzw-people' }, ...uniq.map(n => h('option', { value: n })));
    const chairInp = inp(p, 'chair', sole ? 'Jedyny wspólnik podpisuje sam – pole nieużywane' : 'Przewodniczący zgromadzenia');
    chairInp.querySelector('input').setAttribute('list', 'zzw-people');
    const recInp = inp(p, 'recorder', 'Protokolant (puste = przewodniczący)'); recInp.querySelector('input').setAttribute('list', 'zzw-people');

    box.replaceChildren(datalist,
      h('section', { class: 'card section' }, head2('Spółka', HELP.company, krsBtn),
        h('div', { class: 'form-grid' },
          h('label', { class: 'field wide' }, h('span', {}, 'Klient (spółka z bazy)'), clientSel),
          inp(p, 'krs', 'Numer KRS'), inp(p, 'nip', 'NIP'),
          inp(p, 'company', 'Firma spółki (jak w KRS)', { wide: true }),
          inp(p, 'seat', 'Siedziba (miejscowość)'), inp(p, 'capital', 'Kapitał zakładowy (zł)', { num: true }),
          inp(p, 'address', 'Adres', { wide: true })),
        krsInfo),
      h('section', { class: 'card section' }, head2(`Wspólnicy (${p.shareholders.length})`, HELP.shareholders),
        sharesWarn(),
        sole ? h('p', { class: 'hint' }, 'Jeden wspólnik – dokument przyjmie formę uchwał jedynego wspólnika (art. 156 KSH), bez głosowań i listy obecności.') : null,
        personRows(p.shareholders, 'sh')),
      h('section', { class: 'card section' }, head2(`Zarząd – absolutoria (${p.board.length})`, HELP.board),
        h('p', { class: 'hint' }, 'Każdy członek zarządu dostaje osobną uchwałę. Jeśli jest też wspólnikiem, nie głosuje nad własnym absolutorium (art. 244 KSH) – liczba głosów policzy się sama.'),
        personRows(p.board, 'board')),
      h('section', { class: 'card section' }, head2('Zgromadzenie', HELP.meeting),
        h('div', { class: 'form-grid' },
          inp(p, 'period_from', 'Rok obrotowy od', { type: 'date' }), inp(p, 'period_to', 'Rok obrotowy do', { type: 'date' }),
          inp(p, 'meeting_date', 'Data zgromadzenia', { type: 'date' }), inp(p, 'time', 'Godzina (opcjonalnie)', { ph: 'np. 10:00' }),
          inp(p, 'place', 'Miejscowość zgromadzenia'),
          sole ? null : inp(p, 'convening', 'Tryb', { type: 'select', opts: { art240: 'bez formalnego zwołania – cały kapitał (art. 240 KSH)', zwolane: 'zwołane przez zarząd (art. 238 KSH)' }, rebuild: true }),
          !sole && p.convening === 'zwolane' ? inp(p, 'convened_on', 'Data wysłania zawiadomień', { type: 'date' }) : null,
          sole ? null : chairInp, sole ? null : inp(p, 'chair_g', 'Forma', { type: 'select', opts: { m: 'Przewodniczący', k: 'Przewodnicząca' } }),
          sole ? null : recInp, sole ? null : inp(p, 'recorder_g', 'Forma', { type: 'select', opts: { m: 'Protokolant', k: 'Protokolantka' } }))),
      h('section', { class: 'card section' }, head2('Sprawozdanie finansowe', HELP.fs),
        h('div', { class: 'form-grid' },
          inp(p, 'total', 'Suma bilansowa (zł)', { num: true, ph: 'np. 1250000,00' }),
          inp(p, 'result', 'Wynik finansowy netto (zł) – stratę wpisz z minusem', { num: true, ph: 'np. 84320,15 albo -12500,00', rebuild: true }),
          !isNaN(R) && R > 0 ? inp(p, 'profit_use', 'Zysk przeznaczyć na', { type: 'select', opts: { zapasowy: 'kapitał zapasowy', dywidenda: 'dywidendę dla wspólników', straty_lat: 'pokrycie straty z lat ubiegłych', inne: 'inne – wpiszę treść' }, rebuild: true }) : null,
          !isNaN(R) && R < 0 ? inp(p, 'loss_cover', 'Stratę pokryć', { type: 'select', opts: { przyszle: 'z zysków lat przyszłych', zapasowy: 'z kapitału zapasowego', inne: 'inne – wpiszę treść' }, rebuild: true }) : null,
          !isNaN(R) && R > 0 && p.profit_use === 'dywidenda' ? inp(p, 'div_day', 'Dzień dywidendy (opcjonalnie)', { type: 'date' }) : null,
          !isNaN(R) && R > 0 && p.profit_use === 'dywidenda' ? inp(p, 'div_pay', 'Termin wypłaty (opcjonalnie)', { type: 'date' }) : null,
          (!isNaN(R) && R > 0 && p.profit_use === 'inne') || (!isNaN(R) && R < 0 && p.loss_cover === 'inne') ? inp(p, 'custom_use', 'Treść – np. „przeznaczyć kwotę X zł na kapitał zapasowy, a kwotę Y zł na dywidendę”', { type: 'textarea', wide: true }) : null,
          h('div', { class: 'wide', style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
            chk(p, 'mgmt_report', 'Spółka sporządza sprawozdanie zarządu z działalności – dodaj uchwałę o jego zatwierdzeniu', true),
            chk(p, 'full_scope', 'Sprawozdanie obejmuje też zestawienie zmian w kapitale i rachunek przepływów pieniężnych (jednostki badane)', true)))),
    );
  }

  const saveInfo = h('span', { class: 'small muted' }, row ? `Zapisano ${dShort(row.updated_at)}` : 'Nowy protokół – niezapisany');
  async function save() {
    if (!clientId) { toast('Wybierz spółkę z bazy klientów', true); return false; }
    const rec = { client_id: clientId, period_to: p.period_to || null, meeting_date: p.meeting_date || null, params: p };
    const q = row?.id ? sb.from('rkdp_protocols').update(rec).eq('id', row.id).select('*').single() : sb.from('rkdp_protocols').insert(rec).select('*').single();
    const { data, error } = await q;
    if (error) { fail(error); return false; }
    const isNew = !row?.id; row = data; dirty = false; saveInfo.textContent = 'Zapisano';
    if (isNew) history.replaceState(null, '', `${BASE}/${row.id}`);
    return true;
  }
  const warnMasked = () => [...p.shareholders, ...p.board].some(isMasked) && !confirm('Część imion i nazwisk jest nadal zamaskowana (z gwiazdkami). Wygenerować mimo to?');
  const fname = ext => `Protokol_ZZW_${(p.period_to || '').slice(0, 4)}_${(p.company || 'spolka').replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 40)}.${ext}`;
  async function gen(kind) {
    if (warnMasked()) return;
    if (dirty || !row) await save();
    const blocks = zzwBlocks(p), brand = companyBrand(p);
    if (kind === 'docx') return downloadBytes(await buildOrderDocx(blocks, brand), fname('docx'));
    const w = window.open('', '_blank'); if (!w) return toast('Zezwól na wyskakujące okna, aby zapisać PDF', true);
    w.document.open(); w.document.write(printableHtml(blocks, fname('pdf'), '', brand)); w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 600);
  }

  if (!row) fillFromClient(clients.find(c => c.id === clientId));
  build();
  main.replaceChildren(
    h('a', { href: BASE, class: 'small', style: { fontWeight: 600, textDecoration: 'none' } }, '← Wszystkie protokoły'),
    h('div', { class: 'page-head', style: { marginTop: '10px' } },
      h('div', {}, h('p', { class: 'eyebrow' }, 'Zatwierdzenie sprawozdania finansowego'), h('h1', { style: { marginTop: '6px', display: 'flex', alignItems: 'center' } }, p.company || 'Nowy protokół ZZW', infoTip(HELP.all, 'Zatwierdzenie sprawozdania – instrukcja')),
        h('p', { class: 'sub' }, 'Zgromadzenie odbywa się w ciągu 6 miesięcy po zakończeniu roku obrotowego (art. 231 § 1 KSH); sprawozdanie z uchwałą składa się do KRS w ciągu 15 dni od zatwierdzenia.'))),
    box,
    h('div', { class: 'savebar' }, saveInfo,
      h('button', { class: 'btn btn-outline', onclick: () => save().then(ok => ok && toast('Zapisano')) }, 'Zapisz'),
      h('button', { class: 'btn btn-outline', onclick: () => gen('docx').catch(e => fail(e)) }, icon('download'), 'Word'),
      h('button', { class: 'btn btn-primary', onclick: () => gen('pdf').catch(e => fail(e)) }, icon('download'), 'PDF')));
  const beforeUnload = e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', beforeUnload);
  return () => window.removeEventListener('beforeunload', beforeUnload);
}
