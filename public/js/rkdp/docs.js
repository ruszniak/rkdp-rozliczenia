// RKDP – dokumenty dla klientów: umowy (wg wzorów biura), UPL-1, PEL (ZUS), PPS-1, pełnomocnictwo procesowe.
import { h, toast, fail, icon, modal, printHtml } from '../ui.js';
import { sb, state, canEditClients } from '../store.js';
import { sendForSignature, rkdpContractPreview } from '../podpisy.js';
import { fillDocx, docxToHtml, downloadBytes } from '../docx.js';
import { upl1Defaults, upl1Items, pelDefaults, pelItems, zawDefaults, zawItems, ZAW_PAGES, ukoDefaults, ukoItems, UKO_PAGES, printOverlay, overlayHtml, UPL1_PAGES, PEL_PAGES, RKDP_DELIVERY, RKDP_CONTACT, rkSplit } from './forms.js';
import { pps1Defaults, printPps1, parseAddress, BOX4_LABELS } from '../m2/pps1.js';
import { US_NAMES, OFFICE_NAMES } from '../urzedy.js';
import { poaBlocks, printableHtml, buildOrderDocx, RKDP_BRAND } from '../m2/order.js';
import { lookupNip, validNip, cleanNip } from '../nip.js';
import { fetchAll } from '../views/rozliczenia.js';
import { loadTeamPoa } from '../views/profil.js';
import { deliveryOf, contactOf } from './forms.js';

const MONTHS_NOM = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
const nextMonth = () => { const d = new Date(); d.setMonth(d.getMonth() + 1); return `${MONTHS_NOM[d.getMonth()]} ${d.getFullYear()}`; };
const amount = v => (v === null || v === undefined || v === '' || isNaN(Number(String(v).replace(',', '.')))) ? '[KWOTA]'
  : Number(String(v).replace(',', '.')).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const isJdg = c => c?.legal_form === 'jdg';

export const DOC_TYPES = {
  umowa: 'Umowa o usługi księgowe (wzór RKDP)',
  upl1: 'UPL-1 – pełnomocnictwo do podpisywania deklaracji (US)',
  pel: 'PEL – pełnomocnictwo ZUS',
  zawfa: 'ZAW-FA – uprawnienia KSeF (osoba po stronie klienta)',
  uko: 'Wniosek o dostęp do konta organizacji w e-Urzędzie Skarbowym (UKO)',
  pps1: 'PPS-1 – pełnomocnictwo szczególne (US)',
  procesowe: 'Pełnomocnictwo procesowe (WSA, NSA) – papier firmowy RKDP',
};
const TEMPLATES = {
  ryczalt: { label: 'Ryczałt od przychodów ewidencjonowanych', url: '/rkdp/umowa-ryczalt.docx', sub: '[ryczałt od przychodów ewidencjonowanych]' },
  kpir: { label: 'Podatkowa księga przychodów i rozchodów', url: '/rkdp/umowa-kpir.docx', sub: '[podatkowa księga przychodów i rozchodów]' },
  ksiegi: { label: 'Księgi rachunkowe (spółki)', url: '/rkdp/umowa-ksiegi.docx', sub: '[księgi rachunkowe]' },
  fundacja: { label: 'Księgi rachunkowe (fundacja rodzinna)', url: '/rkdp/umowa-fundacja.docx', sub: '[księgi rachunkowe – fundacja rodzinna]' },
};

// prosty formularz pól: [klucz, etykieta, typ, opcje, szerokie]
function grid(defs, obj, onChange) {
  return h('div', { class: 'form-grid' }, ...defs.filter(Boolean).map(([key, label, type, opts, wide]) => {
    let el;
    if (type === 'select') { el = h('select', { class: 'select' }, ...Object.entries(opts).map(([k, v]) => h('option', { value: k }, v))); el.value = obj[key] ?? ''; }
    else if (type === 'textarea') el = h('textarea', { class: 'input', rows: 3 }, obj[key] ?? '');
    else if (type === 'check') { el = h('input', { type: 'checkbox', checked: !!obj[key] }); }
    else if (type === 'list') {   // pole z podpowiedziami (np. urzędy skarbowe) – można też wpisać własną wartość
      const id = 'dl-' + key + '-' + Math.random().toString(36).slice(2, 7);
      el = h('input', { class: 'input', list: id, value: obj[key] ?? '', placeholder: 'zacznij pisać, np. Krzyki, Oława…' });
      const lbl = h('label', { class: 'field' + (wide ? ' wide' : '') }, h('span', {}, label), el, h('datalist', { id }, ...opts.map(o => h('option', { value: o }))));
      el.addEventListener('input', () => { obj[key] = el.value; onChange?.(key); });
      return lbl;
    }
    else el = h('input', { class: 'input', type: type || 'text', value: obj[key] ?? '' });
    el.addEventListener(type === 'select' || type === 'check' ? 'change' : 'input', () => { obj[key] = type === 'check' ? el.checked : el.value; onChange?.(key); });
    if (type === 'check') return h('label', { class: 'check' + (wide ? ' wide' : ''), style: { alignSelf: 'end' } }, el, label);
    return h('label', { class: 'field' + (wide || type === 'textarea' ? ' wide' : '') }, h('span', {}, label), el);
  }));
}

async function loadAdvisor() {
  const { data } = await sb.from('app_settings').select('value').eq('key', 'rkdp_doradca').maybeSingle();
  try { return { mode: 'doradca', ...(JSON.parse(data?.value || '{}')) }; } catch { return { mode: 'doradca', full_name: 'Michał Ruszniak', license_no: '15009' }; }
}

// ---------- umowa: wartości pól wzoru ----------
function contractDefaults(c) {
  const a = parseAddress(c?.address);
  const tpl = c?.legal_form === 'fundacja_rodzinna' ? 'fundacja' : c?.bookkeeping === 'ryczalt' ? 'ryczalt' : c?.bookkeeping === 'kpir' ? 'kpir' : (c && !isJdg(c)) ? 'ksiegi' : (c?.pit_form === 'ryczalt' ? 'ryczalt' : 'kpir');
  const n = rkSplit(c?.name);
  return {
    tpl, gender: 'm',
    person: isJdg(c) ? `${n.first} ${n.last}`.trim() : '', firm: isJdg(c) ? c?.name || '' : '',
    address: c?.address || '', nip: c?.nip || '', email: c?.email || '', month: nextMonth(),
    foundation: c?.name || '',
    company: (c?.name || '').replace(/\s*(sp\.?\s*z\s*o\.?\s*o\.?|spółka z ograniczoną odpowiedzialnością)\s*$/i, '').trim(),
    seat_loc: a.city ? `${a.city}` : '', street: [a.street, a.house + (a.flat ? '/' + a.flat : '')].filter(Boolean).join(' '), zip: a.zip, city: a.city,
    krs: c?.krs || '', regon: c?.regon || '', rep: c?.contact_person || '',
    fee: c?.monthly_fee ?? '', docs_limit: c?.fee_docs ?? '', fee_extra: c?.fee_extra_doc ?? '', fee_year: '', fee_hr: c?.fee_employee ?? '',
  };
}
function contractReplacements(v) {
  const T = TEMPLATES[v.tpl];
  const common = [['[MIESIĄC ROK]', v.month || '[MIESIĄC ROK]'], ['[ADRES E-MAIL]', v.email || '[ADRES E-MAIL]'],
    ['[KWOTA]', amount(v.fee)], ['[LICZBA]', v.docs_limit || '[LICZBA]'], ['[KWOTA]', amount(v.fee_extra)], ['[KWOTA]', amount(v.fee_year)], ['[KWOTA]', amount(v.fee_hr)]];
  if (v.tpl === 'fundacja') return [[T.sub, T.sub.slice(1, -1)],
    ['[NAZWA FUNDACJI RODZINNEJ]', v.foundation || '[NAZWA FUNDACJI RODZINNEJ]'], ['[MIEJSCOWOŚĆ]', v.seat_loc || '[MIEJSCOWOŚĆ]'], ['[ULICA, NR]', v.street || '[ULICA, NR]'],
    ['[KOD POCZTOWY]', v.zip || '[KOD POCZTOWY]'], ['[MIEJSCOWOŚĆ]', v.city || '[MIEJSCOWOŚĆ]'], ['[NUMER RFR]', v.krs || '[NUMER RFR]'],
    ['[REGON]', v.regon || '[REGON]'], ['[NIP]', v.nip || '[NIP]'], ['[IMIĘ I NAZWISKO – STANOWISKO]', v.rep || '[IMIĘ I NAZWISKO – STANOWISKO]'], ...common];
  if (v.tpl === 'ksiegi') return [[T.sub, T.sub.slice(1, -1)],
    ['[NAZWA SPÓŁKI]', v.company || '[NAZWA SPÓŁKI]'], ['[MIEJSCOWOŚĆ]', v.seat_loc || '[MIEJSCOWOŚĆ]'], ['[ULICA, NR]', v.street || '[ULICA, NR]'],
    ['[KOD POCZTOWY]', v.zip || '[KOD POCZTOWY]'], ['[MIEJSCOWOŚĆ]', v.city || '[MIEJSCOWOŚĆ]'], ['[NUMER KRS]', v.krs || '[NUMER KRS]'],
    ['[REGON]', v.regon || '[REGON]'], ['[NIP]', v.nip || '[NIP]'], ['[IMIĘ I NAZWISKO – STANOWISKO]', v.rep || '[IMIĘ I NAZWISKO – STANOWISKO]'], ...common];
  const f = v.gender === 'k';
  return [[T.sub, T.sub.slice(1, -1)],
    ['[IMIĘ I NAZWISKO / NAZWA ZLECENIODAWCY]', v.person || '[IMIĘ I NAZWISKO / NAZWA ZLECENIODAWCY]'], ['prowadzącym/ą', f ? 'prowadzącą' : 'prowadzącym'],
    ['[NAZWA FIRMY]', v.firm || '[NAZWA FIRMY]'], ['[ADRES: ULICA, NR, KOD POCZTOWY, MIEJSCOWOŚĆ]', v.address || '[ADRES]'], ['[NIP]', v.nip || '[NIP]'],
    ['zwanym/ą', f ? 'zwaną' : 'zwanym'], ...common];
}
// ---------- okno dokumentów ----------
export async function dokumentyDialog({ client = null, type = 'umowa' } = {}) {
  const [advisor, clients] = await Promise.all([
    loadAdvisor(),
    client ? Promise.resolve([client]) : fetchAll(() => sb.from('clients').select('*').order('name')),
  ]);
  const employees = state.members.filter(m => m.active && (m.modules || ['rozliczenia']).includes('rozliczenia') && m.full_name !== advisor.full_name);
  let cl = client;
  const d = { type, who: 'doradca' };
  let v = {};
  // PESEL-e osób klienta (PEL, ZAW-FA, UKO) – zapisane na stałe w client_person_pesel; PESEL pełnomocnika – w „Mój profil” (member_private)
  let pesels = [];
  const pKey = (f, l) => `${String(f || '').trim().toLowerCase()}|${String(l || '').trim().toLowerCase()}`;
  const peselOf = (f, l) => (f || l) ? pesels.find(x => pKey(x.first_name, x.last_name) === pKey(f, l))?.pesel || '' : '';
  const PERSONS = [['pel', 'g_first', 'g_last', 'g_pesel'], ['zawfa', 'u_first', 'u_last', 'u_id'], ['uko', 'u_first', 'u_last', 'u_pesel']];
  const fillPesels = () => PERSONS.forEach(([k, f, l, pf]) => { const x = v[k]; if (x && !x[pf] && (k !== 'zawfa' || x.u_idtype === 'pesel')) x[pf] = peselOf(x[f], x[l]); });
  const loadPesels = async () => {
    pesels = [];
    if (!cl?.id) return;
    const { data } = await sb.from('client_person_pesel').select('id,first_name,last_name,pesel').eq('client_id', cl.id);
    pesels = data || [];
    fillPesels(); build();
  };
  const savePesels = async () => {
    if (!cl?.id) return;
    const t = d.type;
    for (const [k, f, l, pf] of PERSONS) {
      if (k !== t) continue;
      const x = v[k], pesel = String(x[pf] || '').replace(/\D/g, '');
      if (k === 'zawfa' && x.u_idtype !== 'pesel') continue;
      const first = String(x[f] || '').trim(), last = String(x[l] || '').trim();
      if (!/^\d{11}$/.test(pesel) || !first || !last) continue;
      const cur = pesels.find(y => pKey(y.first_name, y.last_name) === pKey(first, last));
      if (cur?.pesel === pesel) continue;
      const row = { client_id: cl.id, first_name: first, last_name: last, pesel, updated_by: state.me.id, updated_at: new Date().toISOString() };
      const { data, error } = cur ? await sb.from('client_person_pesel').update(row).eq('id', cur.id).select('id,first_name,last_name,pesel').single()
        : await sb.from('client_person_pesel').insert(row).select('id,first_name,last_name,pesel').single();
      if (error) { console.warn('pesel', error); continue; }
      pesels = [...pesels.filter(y => y.id !== data.id), data];
    }
    // PEL: PESEL pełnomocnika – zapis tylko własny (Mój profil); cudzy widać przy pesel_share, ale go nie zmieniamy
    if (t === 'pel') {
      const pp = String(v.pel.p_pesel || '').replace(/\D/g, '');
      const meEmp = d.who === 'emp:' + state.me.id || (d.who === 'doradca' && advisor.full_name === state.me.full_name);
      if (meEmp && /^\d{11}$/.test(pp)) {
        const { data: cur } = await sb.from('member_private').select('pesel').eq('member_id', state.me.id).maybeSingle();
        if (cur?.pesel !== pp) await sb.from('member_private').upsert({ member_id: state.me.id, pesel: pp }, { onConflict: 'member_id' });
      }
    }
  };
  const reset = () => {
    const kind = isJdg(cl) ? 'osoba' : 'firma';
    const repsText = cl?.contact_person || '';
    v = {
      contract: contractDefaults(cl),
      upl1: upl1Defaults({ client: cl || {} }),
      pel: pelDefaults({ client: cl || {} }),
      zawfa: zawDefaults({ client: cl || {} }),
      uko: ukoDefaults({ client: cl || {} }),
      pps1: (() => {
        const x = pps1Defaults({ client: { ...(cl || {}), kind }, params: {}, signer: null, scope: 'Reprezentowanie Mocodawcy w sprawie podatkowej – we wszystkich czynnościach w tej sprawie, w tym do składania i odbioru pism, przeglądania akt, składania wyjaśnień, wniosków i środków zaskarżenia.' });
        if (kind === 'osoba') { const n = rkSplit(cl?.name); x.client_name = `${n.last}, ${n.first}`; x.reps = `${n.first} ${n.last}`.trim(); } else x.reps = repsText;
        return x;
      })(),
      proc: { organ: 'Wojewódzki Sąd Administracyjny we Wrocławiu', scope: '', reps: repsText, date: new Date().toISOString().slice(0, 10) },
    };
  };
  reset();

  const box = h('div');
  const clientRow = client ? h('p', { class: 'small', style: { margin: '0 0 12px' } }, 'Klient: ', h('b', {}, cl.name)) : (() => {
    const sel = h('select', { class: 'select', style: { flex: '1' } });
    const fill = () => { sel.replaceChildren(h('option', { value: '' }, '— wybierz klienta —'), ...clients.map(c => h('option', { value: c.id }, c.name + (c.nip ? ` (NIP ${c.nip})` : '')))); sel.value = cl?.id || ''; };
    fill();
    sel.addEventListener('change', () => { cl = clients.find(c => c.id === sel.value) || null; reset(); build(); loadPesels(); });
    const add = canEditClients() ? h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: async () => {
      const val = prompt('Nowy klient – podaj NIP (dane pobiorę z Białej listy VAT) albo nazwę:');
      if (!val?.trim()) return;
      let row = { name: val.trim() };
      if (validNip(val)) {
        try { const r = await lookupNip(val); row = r.found ? { name: r.name, nip: r.nip, regon: r.regon, krs: r.krs, address: r.address } : { name: prompt('Nie ma tego NIP w wykazie VAT. Nazwa klienta:') || val, nip: cleanNip(val) }; }
        catch (e) { return fail(e); }
      }
      const { data, error } = await sb.from('clients').insert(row).select('*').single();
      if (error) return fail(error);
      clients.push(data); clients.sort((a, b) => a.name.localeCompare(b.name, 'pl')); cl = data; fill(); reset(); build(); loadPesels();
      toast('Dodano klienta – uzupełnij jego profil na karcie klienta');
    } }, icon('plus'), 'Nowy klient') : null;
    return h('label', { class: 'field wide', style: { marginBottom: '12px' } }, h('span', {}, 'Klient'), h('div', { style: { display: 'flex', gap: '8px' } }, sel, add));
  })();

  const teamPoaReady = m => !!teamPoa[m.id]?.filled;
  const whoOpts = () => ({ doradca: `${advisor.full_name} – doradca podatkowy (dane uzupełnione)`,
    ...Object.fromEntries(employees.map(m => ['emp:' + m.id, `${m.full_name} – pracownik${teamPoaReady(m) ? ' (dane z profilu)' : ' (brak danych w profilu)'}`])), puste: 'Puste pola pełnomocnika' });
  const teamPoa = await loadTeamPoa(employees).catch(() => ({}));
  const pelnomocnik = () => {
    if (d.who === 'doradca') return advisor;
    if (d.who.startsWith('emp:')) { const m = employees.find(x => 'emp:' + x.id === d.who); return teamPoa[m?.id] || { mode: 'pracownik', full_name: m?.full_name || '' }; }
    return { mode: 'puste', full_name: '' };
  };
  const whoHint = () => {
    if (!d.who.startsWith('emp:')) return null;
    const x = pelnomocnik();
    const me = employees.find(m => 'emp:' + m.id === d.who)?.id === state.me?.id;
    if (!x.filled) return h('p', { class: 'hint', style: { margin: '-4px 0 10px', color: '#a0522d' } }, me ? 'Nie masz jeszcze uzupełnionych danych – wpisz je w „Mój profil” (kliknij swoje nazwisko w prawym górnym rogu).' : 'Ta osoba nie uzupełniła jeszcze danych w „Mój profil” – wpisze się tylko imię i nazwisko.');
    return h('p', { class: 'hint', style: { margin: '-4px 0 10px' } }, `Dane z „Mój profil”: ${[x.nip ? 'NIP' : x.pesel ? 'PESEL' : null, x.ae_address ? 'adres elektroniczny' : null, x.delivery === 'biuro' ? 'doręczenia na biuro' : 'własny adres', x.phone ? 'telefon' : null].filter(Boolean).join(', ')}.${!x.nip && !x.pesel && !me ? ' Brak PESEL – ta osoba nie ma wspólnych danych do pełnomocnictw albo nie wpisała PESEL w „Mój profil”.' : ''}`);
  };

  let build = function () {
    const t = d.type;
    const parts = [clientRow, grid([['type', 'Dokument', 'select', DOC_TYPES, true]], d, () => build())];
    if (t === 'umowa') {
      const c = v.contract;
      parts.push(grid([['tpl', 'Wzór umowy', 'select', Object.fromEntries(Object.entries(TEMPLATES).map(([k, x]) => [k, x.label])), true]], c, () => build()));
      if (c.tpl === 'fundacja') parts.push(grid([
        ['foundation', 'Pełna nazwa fundacji rodzinnej (z „fundacja rodzinna”)', 'text', null, true],
        ['seat_loc', 'Siedziba – „z siedzibą w …” (np. Wrocławiu)', 'text'], ['street', 'Ulica i numer (bez „ul.”)', 'text'],
        ['zip', 'Kod pocztowy', 'text'], ['city', 'Miejscowość', 'text'],
        ['krs', 'Numer w Rejestrze Fundacji Rodzinnych (RFR)', 'text'], ['regon', 'REGON', 'text'], ['nip', 'NIP', 'text'],
        ['rep', 'Reprezentacja – „imię i nazwisko – członek zarządu”', 'text', null, true],
      ], c));
      else if (c.tpl === 'ksiegi') parts.push(grid([
        ['company', 'Nazwa spółki (bez „Sp. z o.o.” – wzór dopisuje sam)', 'text', null, true],
        ['seat_loc', 'Siedziba – „z siedzibą w …” (np. Wrocławiu)', 'text'], ['street', 'Ulica i numer (bez „ul.”)', 'text'],
        ['zip', 'Kod pocztowy', 'text'], ['city', 'Miejscowość', 'text'],
        ['krs', 'KRS', 'text'], ['regon', 'REGON', 'text'], ['nip', 'NIP', 'text'],
        ['rep', 'Reprezentacja – „imię i nazwisko – stanowisko”', 'text', null, true],
      ], c));
      else parts.push(grid([
        ['person', 'Imię i nazwisko przedsiębiorcy', 'text'], ['gender', 'Forma', 'select', { m: 'prowadzącym / zwanym', k: 'prowadzącą / zwaną' }],
        ['firm', 'Nazwa firmy (CEIDG)', 'text', null, true], ['address', 'Adres głównego miejsca działalności', 'text', null, true], ['nip', 'NIP', 'text'],
      ], c));
      parts.push(grid([
        ['month', 'Pierwszy miesiąc współpracy (np. listopad 2026)', 'text'], ['email', 'E-mail(e) osób kontaktowych', 'text'],
        ['fee', 'Abonament (zł netto)', 'text'], ['docs_limit', 'Abonament obejmuje do (liczba dokumentów)', 'text'],
        ['fee_extra', 'Dokument nadwyżkowy (zł netto / szt.)', 'text'], ['fee_year', ['ksiegi', 'fundacja'].includes(c.tpl) ? 'Sprawozdanie finansowe (zł netto)' : 'Zeznanie roczne PIT (zł netto)', 'text'],
        ['fee_hr', 'Kadry – 1 tytuł zatrudnienia (zł netto)', 'text'],
      ], c), h('p', { class: 'hint', style: { marginTop: '8px' } }, 'Puste pola zostaną w umowie jako [POLE] do uzupełnienia. Treść umowy jest dokładnie z Twojego wzoru.'));
    } else if (t === 'upl1' || t === 'pel' || t === 'pps1') {
      const x = v[t];
      parts.push(grid([['who', 'Pełnomocnik', 'select', whoOpts(), true]], d, () => build()), whoHint());
      if (t === 'upl1') parts.push(grid([
        ['office', 'Poz. 4 – urząd skarbowy (właściwy w sprawach ewidencji podatnika)', 'list', US_NAMES, true],
        ['client_kind', 'Poz. 6 – rodzaj podmiotu', 'select', { firma: 'Podmiot niebędący osobą fizyczną', osoba: 'Osoba fizyczna' }],
        ['client_nip', 'Poz. 1 – NIP', 'text'], ['client_name', 'Poz. 7 – nazwa pełna / „Nazwisko, imię”', 'text', null, true],
        ['c_voiv', '9. Województwo', 'text'], ['c_county', '10. Powiat', 'text'], ['c_commune', '11. Gmina', 'text'], ['c_street', '12. Ulica', 'text'],
        ['c_house', '13. Nr domu', 'text'], ['c_flat', '14. Nr lokalu', 'text'], ['c_city', '15. Miejscowość', 'text'], ['c_zip', '16. Kod pocztowy', 'text'], ['c_post', '17. Poczta', 'text'],
        ['client_phone', '18. Telefon', 'text'], ['client_email', '20. E-mail', 'text'],
        ['valid_from', '41. Ważne od (puste = od złożenia)', 'date'], ['valid_to', '42. Ważne do (puste = bezterminowo)', 'date'],
        ['reps', 'Podpisujący (max 3) – „Jan Kowalski – prezes zarządu”, każda osoba w osobnej linii', 'textarea'], ['date', '55. Data', 'date'],
      ], x));
      if (t === 'pel') parts.push(grid([
        ['acting', 'Działam w imieniu', 'select', { wlasne: 'własnym', firma: 'mojej firmy (JDG) – NIP', podmiot: 'innego podmiotu (spółka) – NIP i dane' }],
        ['client_nip', 'NIP firmy / podmiotu', 'text'], ['entity', 'Podmiot: nazwa, adres siedziby, REGON', 'text', null, true],
        ['g_first', 'Osoba udzielająca – imię', 'text'], ['g_last', 'Nazwisko', 'text'], ['g_pesel', 'PESEL (zapisze się przy kliencie)', 'text'],
        ['g_street', 'Ulica', 'text'], ['g_house', 'Nr domu', 'text'], ['g_flat', 'Nr lokalu', 'text'], ['g_zip', 'Kod pocztowy', 'text'], ['g_city', 'Miejscowość', 'text'], ['g_phone', 'Telefon', 'text'],
        ['p_pesel', 'PESEL pełnomocnika (puste = z „Mój profil”; Twój zapisze się w profilu)', 'text'],
        ['scope_all', 'do załatwiania wszystkich spraw w ZUS', 'check'], ['scope_pit', 'do otrzymywania deklaracji PIT', 'check'],
        ['scope_task', 'do konkretnej czynności (opis)', 'text', null, true],
        ['ezus', 'dostęp przez eZUS', 'check'], ['ezus_role', 'Rola eZUS', 'select', { platnik: 'Płatnik składek (w swoim imieniu)', platnik_inny: 'Płatnik składek (inny podmiot)', ubezpieczony: 'Ubezpieczony', swiadczeniobiorca: 'Świadczeniobiorca', komornik: 'Komornik' }],
        ['ezus_corr_only', 'eZUS – tylko korespondencja', 'check'], ['ezla', 'E-ZLA', 'check'],
        ['valid_from', 'Ważne od', 'date'], ['valid_to', 'Ważne do', 'date'], ['date', 'Data', 'date'],
      ], x));
      if (t === 'pps1') {
        const b4 = h('div', { class: 'field wide', style: { marginBottom: '10px' } }, h('span', {}, 'Poz. 4 – podmiot składający (zaznacz)'),
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px 18px' } }, ...Object.entries(BOX4_LABELS).map(([n, l]) => {
            const cb = h('input', { type: 'checkbox', checked: (x.box4 || []).includes(Number(n)) });
            cb.addEventListener('change', () => { const s = new Set(x.box4 || []); cb.checked ? s.add(Number(n)) : s.delete(Number(n)); x.box4 = [...s].sort(); });
            return h('label', { class: 'check small' }, cb, `${n}. ${l}`);
          })));
        parts.push(b4, grid([
          ['delivery', 'Poz. 35 – pełnomocnik do doręczeń', 'check'], ['further', 'E.2 – dalsze pełnomocnictwo', 'select', { tak: 'tak', nie: 'nie' }],
          ['organ', 'Poz. 3 – organ podatkowy (np. naczelnik urzędu skarbowego)', 'list', OFFICE_NAMES, true], ['scope', 'Poz. 71 – sprawa i zakres', 'textarea'],
          ['client_kind', 'Poz. 5 – rodzaj podmiotu', 'select', { firma: 'Podmiot niebędący osobą fizyczną', osoba: 'Osoba fizyczna' }],
          ['client_nip', 'Poz. 1 – NIP', 'text'], ['client_name', 'Poz. 6 – nazwa / „Nazwisko, imię”', 'text', null, true],
          ['c_voiv', '14. Województwo', 'text'], ['c_county', '15. Powiat', 'text'], ['c_commune', '16. Gmina', 'text'], ['c_street', '17. Ulica', 'text'],
          ['c_house', '18. Nr domu', 'text'], ['c_flat', '19. Nr lokalu', 'text'], ['c_city', '20. Miejscowość', 'text'], ['c_zip', '21. Kod pocztowy', 'text'],
          ['client_phone', '22. Telefon', 'text'], ['client_email', '23. E-mail', 'text'],
          ['reps', 'Podpisujący (max 3) – „Jan Kowalski – prezes zarządu”', 'textarea'], ['date', '76. Data', 'date'],
          ['fee', '80. Opłata skarbowa', 'select', { dolaczono: 'dołączono dowód zapłaty', w3dni: 'dowód w ciągu 3 dni', brak: 'nie zaznaczaj' }],
        ], x));
      }
    } else if (t === 'zawfa') {
      parts.push(h('p', { class: 'hint', style: { margin: '0 0 10px' } }, 'ZAW-FA składa klient (spółka bez pieczęci elektronicznej). W części C wpisz osobę po stronie klienta – zwykle członka zarządu – która dostanie uprawnienia w KSeF i wygeneruje certyfikat firmy. Nie wpisuj tu księgowej.'),
        grid([
          ['office', 'Poz. 5 – urząd skarbowy klienta', 'list', US_NAMES, true],
          ['purpose', 'Poz. 6 – cel', 'select', { nadanie: '1. nadanie uprawnień', odebranie: '2. odebranie uprawnień', wszystkie: '3. odebranie wszelkich nadanych uprawnień' }],
          ['client_kind', 'Poz. 7 – rodzaj podmiotu', 'select', { firma: 'Podmiot niebędący osobą fizyczną', osoba: 'Osoba fizyczna (nie zaznaczaj)' }],
          ['client_nip', 'Poz. 1 – NIP klienta', 'text'], ['client_name', 'Poz. 8 – nazwa pełna', 'text', null, true],
          ['client_phone', 'Poz. 9 – telefon firmy', 'text'], ['client_email', 'Poz. 10 – e-mail firmy (obowiązkowy)', 'text'],
          ['u_first', 'Poz. 14 – osoba uprawniona: imię', 'text'], ['u_last', 'Poz. 13 – nazwisko', 'text'],
          ['u_idtype', 'Poz. 11 – identyfikator', 'select', { pesel: 'PESEL', nip: 'NIP' }], ['u_id', 'Poz. 12 – PESEL / NIP (PESEL zapisze się przy kliencie)', 'text'],
          ['u_phone', 'Poz. 19 – telefon osoby', 'text'], ['u_email', 'Poz. 20 – e-mail osoby (obowiązkowy)', 'text'],
          ['reps', 'Część E – podpisujący (max 3) – „Jan Kowalski – prezes zarządu”, każda osoba w osobnej linii', 'textarea'],
        ], v.zawfa));
    } else if (t === 'uko') {
      parts.push(h('p', { class: 'hint', style: { margin: '0 0 10px' } }, 'Wniosek składa klient (organizacja). W części D wpisz osobę, która ma dostać dostęp do konta organizacji w e-US – zwykle członka zarządu klienta. Podpisują wszystkie osoby zgodnie z reprezentacją (KRS).'),
        grid([
          ['office', 'Poz. 1 – urząd skarbowy klienta (ewidencja)', 'list', US_NAMES, true],
          ['purpose', 'B – cel', 'select', { przyznanie: 'B.1 Przyznanie dostępu', odebranie: 'B.2 Odebranie dostępu' }],
          ['access', 'C.2 – rodzaj dostępu', 'select', { rozszerzony: 'Rozszerzony (może nadawać dostęp innym)', podstawowy: 'Podstawowy' }],
          ['client_nip', 'Poz. 2 – NIP', 'text'], ['client_name', 'Poz. 3 – nazwa pełna', 'text', null, true],
          ['c_street', '4. Ulica', 'text'], ['c_house', '5. Nr domu', 'text'], ['c_flat', '6. Nr lokalu', 'text'],
          ['c_zip', '7. Kod pocztowy', 'text'], ['c_city', '8. Miejscowość', 'text'], ['client_phone', '9. Telefon', 'text'],
          ['u_first', '12. Użytkownik – imię', 'text'], ['u_last', '11. Nazwisko', 'text'], ['u_pesel', '10. PESEL (zapisze się przy kliencie)', 'text'],
          ['reps', 'Część E – reprezentanci (max 3) – „Jan Kowalski – prezes zarządu”, każda osoba w osobnej linii', 'textarea'],
        ], v.uko));
    } else if (t === 'procesowe') {
      parts.push(h('p', { class: 'small', style: { margin: '0 0 10px' } }, 'Pełnomocnik: ', h('b', {}, `${advisor.full_name} – doradca podatkowy, nr wpisu ${advisor.license_no || '—'}`)),
        grid([['organ', 'Sąd', 'text', null, true], ['scope', 'Zakres – „do reprezentowania Mocodawcy …” (puste = przed wskazanym sądem)', 'textarea'],
          ['reps', isJdg(cl) ? 'Mocodawca' : 'Reprezentanci – „Jan Kowalski – prezes zarządu”', 'textarea'], ['date', 'Data', 'date']], v.proc));
    }
    box.replaceChildren(...parts.filter(Boolean));
  };
  build();
  loadPesels();

  const fname = (prefix, ext) => `${prefix}_${(cl?.name || 'klient').replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 40)}.${ext}`;
  async function generate(format) {
    if (!cl) return toast('Wybierz klienta', true);
    const t = d.type;
    fillPesels(); savePesels().catch(e => console.warn(e));
    try {
      if (t === 'umowa') {
        const c = v.contract, T = TEMPLATES[c.tpl];
        const { loadEdit } = await import('../docedit.js');
        const saved = await loadEdit(`rkdp:umowa:${cl.id}:${c.tpl}`).catch(() => null);
        if (saved) toast('Umowa z zapisanymi ręcznymi poprawkami (od nowa: „Wyślij do podpisu” → „Od nowa”)');
        const { bytes, documentXml } = await fillDocx(T.url, contractReplacements(c), { overrideXml: saved?.xml });
        if (format === 'docx') return downloadBytes(bytes, fname('Umowa_RKDP', 'docx'));
        const { downloadContractPdf } = await import('../umowapdf.js');
        return downloadContractPdf(documentXml, fname('Umowa_RKDP', 'pdf'));
      }
      if (format === 'docx' && t !== 'procesowe') return toast('Formularz urzędowy pobierasz jako PDF', true);
      if (t === 'upl1') return printOverlay(UPL1_PAGES, upl1Items(v.upl1, pelnomocnik()), fname('UPL-1', 'pdf')) || toast('Zezwól na wyskakujące okna', true);
      if (t === 'pel') return printOverlay(PEL_PAGES, pelItems(v.pel, pelnomocnik()), fname('PEL', 'pdf')) || toast('Zezwól na wyskakujące okna', true);
      if (t === 'uko') return printOverlay(UKO_PAGES, ukoItems(v.uko), fname('Wniosek_UKO', 'pdf')) || toast('Zezwól na wyskakujące okna', true);
      if (t === 'zawfa') return printOverlay(ZAW_PAGES, zawItems(v.zawfa), fname('ZAW-FA', 'pdf')) || toast('Zezwól na wyskakujące okna', true);
      if (t === 'pps1') {
        const p = pelnomocnik();
        const signer = p.mode === 'doradca' ? p : { full_name: p.full_name, nip: p.nip, pesel: p.pesel, ae_address: p.ae_address };
        const C = contactOf(p);
        const opts = { delivery: deliveryOf(p) || {}, phone: C.phone, email: C.email };
        return printPps1(v.pps1, signer, opts) || toast('Zezwól na wyskakujące okna', true);
      }
      if (t === 'procesowe') {
        const pr = v.proc;
        const o = { order_date: pr.date, params: { authority: pr.organ, client_reps: pr.reps, poa_type: 'procesowe (art. 35 p.p.s.a.)', poa_scope: (pr.scope || '').trim() || null } };
        const n = rkSplit(cl.name);
        const party = isJdg(cl) ? { ...cl, kind: 'osoba', name: `${n.first} ${n.last}`.trim() } : { ...cl, kind: 'firma' };
        const blocks = poaBlocks(o, party, [advisor], { standalone: true, brand: RKDP_BRAND });
        if (format === 'docx') return downloadBytes(await buildOrderDocx(blocks, RKDP_BRAND), fname('Pelnomocnictwo_procesowe', 'docx'));
        printHtml(printableHtml(blocks, fname('Pelnomocnictwo_procesowe', 'pdf'), location.origin + RKDP_BRAND.logo, RKDP_BRAND));
      }
    } catch (e) { fail(e, 'Nie udało się wygenerować dokumentu'); }
  }

  // UPL-1: e-mail do klienta z wypełnionym formularzem (PDF do pobrania linkiem ważnym 30 dni) i linkiem do instrukcji złożenia
  const sendBtn = h('button', { class: 'btn btn-outline btn-sm', onclick: () => { if (!cl) return toast('Wybierz klienta', true); fillPesels(); savePesels().catch(e => console.warn(e));
    return d.type === 'pel' ? sendUpl1(cl, v.pel, pelnomocnik(), fname('PEL', 'pdf'), 'pel') : d.type === 'zawfa' ? sendUpl1(cl, v.zawfa, null, fname('ZAW-FA', 'pdf'), 'zawfa') : d.type === 'uko' ? sendUpl1(cl, v.uko, null, fname('Wniosek_UKO', 'pdf'), 'uko') : sendUpl1(cl, v.upl1, pelnomocnik(), fname('UPL-1', 'pdf')); } }, icon('mail'), 'Wyślij klientowi');
  // umowa: e-mail z linkiem do strony podpisu (podgląd, uwagi, profil zaufany / kwalifikowany / odręcznie); podpisany plik wraca do archiwum klienta
  const signBtn = h('button', { class: 'btn btn-outline btn-sm', onclick: async () => {
    if (!cl) return toast('Wybierz klienta', true);
    if (d.type === 'pel') {   // ZUS PEL: formularz urzędowy – PDF z wzoru ZUS, podgląd stron formularza
      fillPesels(); savePesels().catch(e => console.warn(e));
      const title = `Pełnomocnictwo ZUS PEL – ${cl.name}`.slice(0, 150);
      const html = overlayHtml(PEL_PAGES, pelItems(v.pel, pelnomocnik()), title);
      const preview = html.replace('</style>', '@media(max-width:820px){.pg{zoom:.75}}@media(max-width:640px){.pg{zoom:.55}}@media(max-width:460px){.pg{zoom:.42}}html,body{background:#E9EAEE}.pg{margin:14px auto;box-shadow:0 2px 10px rgba(0,0,0,.08)}</style>');
      return sendForSignature({ client: cl, target: { client_id: cl.id }, firm: 'rkdp', kind: 'pel', title,
        buildPdf: async () => { const { buildPdf } = await import('../pdfdoc.js'); return buildPdf(html, title); }, preview });
    }
    const c = v.contract, T = TEMPLATES[c.tpl];
    try {
      const { documentXml } = await fillDocx(T.url, contractReplacements(c));
      const gaps = [...new Set((docxToHtml(documentXml).replace(/<[^>]+>/g, '').match(/\[[A-ZĄĆĘŁŃÓŚŹŻ][A-ZĄĆĘŁŃÓŚŹŻ ,.\/–-]{2,}\]/g) || []))];
      if (gaps.length && !confirm(`W umowie zostały niewypełnione pola:\n${gaps.slice(0, 8).join('\n')}\n\nWysłać mimo to?`)) return;
      const { contractPdf } = await import('../umowapdf.js');
      const title = `Umowa o usługi księgowe – ${cl.name}`.slice(0, 150);
      sendForSignature({ client: cl, target: { client_id: cl.id }, firm: 'rkdp', kind: 'umowa', title,
        buildPdf: () => contractPdf(documentXml, title), preview: rkdpContractPreview(docxToHtml(documentXml)),
        editable: { xml: documentXml, key: `rkdp:umowa:${cl.id}:${c.tpl}`, ids: { client_id: cl.id }, pdf: x => contractPdf(x, title), preview: x => rkdpContractPreview(docxToHtml(x)) } });
    } catch (e) { fail(e, 'Nie udało się przygotować umowy'); }
  } }, icon('mail'), 'Wyślij do podpisu');
  const syncSend = () => { sendBtn.hidden = !['upl1', 'pel', 'zawfa', 'uko'].includes(d.type); signBtn.hidden = d.type !== 'umowa'; };
  const build0 = build; build = () => { build0(); syncSend(); }; syncSend();
  modal('Dokumenty klienta', box, (close) => [
    h('button', { class: 'btn btn-ghost btn-sm', onclick: close }, 'Zamknij'),
    sendBtn, signBtn,
    h('button', { class: 'btn btn-outline btn-sm', onclick: () => generate('docx') }, icon('download'), 'Word'),
    h('button', { class: 'btn btn-primary btn-sm', onclick: () => generate('pdf') }, icon('download'), 'PDF'),
  ]);
}

// ---------- UPL-1 do klienta e-mailem ----------
const UPL_WAYS = {
  wszystkie: 'Wszystkie trzy sposoby – klient wybiera',
  ezus: 'Online w e-Urzędzie Skarbowym (profil zaufany, bank, e-dowód)',
  edoreczenia: 'Podpis zaufany na PDF + e-Doręczenia lub pismo ogólne w e-US',
  papier: 'Na papierze – wydruk, podpis, oryginał do biura lub urzędu',
};
const UPL_TXT = {
  wszystkie: 'Pełnomocnictwo można złożyć na jeden z trzech sposobów:\n• online w e-Urzędzie Skarbowym (podatki.gov.pl) – najszybciej, logowanie profilem zaufanym, e-dowodem albo przez bank; dane do wpisania są w pobranym formularzu,\n• podpisując pobrany PDF podpisem zaufanym i wysyłając go do urzędu skarbowego przez e-Doręczenia albo jako pismo ogólne w e-Urzędzie Skarbowym,\n• na papierze – po wydrukowaniu i podpisaniu prosimy odesłać lub przekazać oryginał do naszego biura (złożymy go w urzędzie) albo złożyć go w urzędzie skarbowym.',
  ezus: 'Najszybciej złożyć je samodzielnie online w e-Urzędzie Skarbowym (podatki.gov.pl) – logowanie profilem zaufanym, e-dowodem albo przez bank. Dane do wpisania (m.in. dane pełnomocnika) są w pobranym formularzu. Po wysłaniu prosimy o przesłanie nam potwierdzenia UPO.',
  edoreczenia: 'Prosimy podpisać pobrany PDF podpisem zaufanym (gov.pl – „Podpisz dokument elektronicznie”) i wysłać podpisany plik do urzędu skarbowego przez e-Doręczenia albo jako pismo ogólne w e-Urzędzie Skarbowym, a potwierdzenie przesłać nam.',
  papier: 'Prosimy wydrukować formularz, podpisać go w części E i odesłać lub przekazać oryginał do naszego biura – złożymy go w urzędzie skarbowym. Można też złożyć go samodzielnie w urzędzie skarbowym.',
};
// ---------- ZUS PEL do klienta e-mailem – klient składa sam (eZUS, e-Doręczenia, osobiście / pocztą) ----------
const PEL_WAYS = {
  wszystkie: 'Wszystkie trzy sposoby – klient wybiera',
  ezus: 'Online w eZUS (profil zaufany, bank, e-dowód)',
  edoreczenia: 'Podpis zaufany na PDF + wysyłka do ZUS przez e-Doręczenia',
  papier: 'Osobiście w ZUS lub pocztą – wydruk i podpis odręczny',
};
const PEL_TXT = {
  wszystkie: 'Pełnomocnictwo można złożyć na jeden z trzech sposobów:\n• online w eZUS (zus.pl) – najszybciej, logowanie profilem zaufanym, e-dowodem albo przez bank; dane do wpisania są w pobranym formularzu,\n• podpisując pobrany PDF podpisem zaufanym i wysyłając go do ZUS przez e-Doręczenia,\n• osobiście w dowolnej placówce ZUS albo listem poleconym – po wydrukowaniu i podpisaniu (podpisany oryginał można też przekazać do naszego biura).',
  ezus: 'Najszybciej złożyć je samodzielnie online w eZUS (zus.pl → eZUS → Katalog usług → „PEL”) – logowanie profilem zaufanym, e-dowodem albo przez bank. Dane do wpisania (m.in. dane pełnomocnika) są w pobranym formularzu. Po wysłaniu prosimy o przesłanie nam potwierdzenia UPO.',
  edoreczenia: 'Prosimy podpisać pobrany PDF podpisem zaufanym (gov.pl – „Podpisz dokument elektronicznie”) i wysłać podpisany plik do Zakładu Ubezpieczeń Społecznych przez e-Doręczenia, a dowód nadania przesłać nam.',
  papier: 'Prosimy wydrukować formularz, podpisać go i złożyć osobiście w dowolnej placówce ZUS albo wysłać listem poleconym (podpisany oryginał można też przekazać do naszego biura – złożymy go za Państwa).',
};
const ZAW_WAYS = {
  wszystkie: 'Wszystkie trzy sposoby – klient wybiera',
  ezus: 'Online w e-Urzędzie Skarbowym (formularz ZAW-FA)',
  edoreczenia: 'Podpisany PDF (podpis zaufany) – pismo ogólne w e-US lub e-Doręczenia',
  papier: 'Na papierze – podpis zarządu, oryginał do urzędu skarbowego',
};
const ZAW_TXT = {
  wszystkie: 'Zawiadomienie można złożyć na jeden z trzech sposobów:\n• online w e-Urzędzie Skarbowym (Dokumenty → Złóż dokument → ZAW-FA) – dane do wpisania są w pobranym formularzu,\n• podpisując pobrany PDF podpisem zaufanym lub kwalifikowanym i wysyłając go do urzędu skarbowego jako pismo ogólne w e-Urzędzie Skarbowym albo przez e-Doręczenia,\n• na papierze – po wydrukowaniu i podpisaniu przez osoby uprawnione do reprezentacji (zgodnie z KRS) w urzędzie skarbowym albo listem poleconym.',
  ezus: 'Najprościej złożyć je online w e-Urzędzie Skarbowym (Dokumenty → Złóż dokument → ZAW-FA). Dane do wpisania są w pobranym formularzu. Po wysłaniu prosimy o przesłanie nam UPO.',
  edoreczenia: 'Prosimy podpisać pobrany PDF podpisem zaufanym lub kwalifikowanym (osoby uprawnione do reprezentacji zgodnie z KRS) i wysłać go do urzędu skarbowego jako pismo ogólne w e-Urzędzie Skarbowym albo przez e-Doręczenia, a potwierdzenie przesłać nam.',
  papier: 'Prosimy wydrukować formularz, podpisać go w części E (osoby uprawnione do reprezentacji zgodnie z KRS) i złożyć w urzędzie skarbowym albo wysłać listem poleconym.',
};
const UKO_WAYS = {
  wszystkie: 'Oba sposoby – klient wybiera',
  edoreczenia: 'Podpisany PDF (profil zaufany / kwalifikowany) – pismo ogólne w e-US lub e-Doręczenia',
  papier: 'Na papierze – podpis reprezentantów, oryginał do urzędu skarbowego',
};
const UKO_TXT = {
  wszystkie: 'Wniosek można złożyć:\n• elektronicznie – podpisując pobrany PDF profilem zaufanym lub podpisem kwalifikowanym (wszystkie osoby zgodnie z reprezentacją w KRS) i wysyłając go do urzędu skarbowego jako załącznik do pisma ogólnego w e-Urzędzie Skarbowym albo przez e-Doręczenia,\n• na papierze – po wydrukowaniu i podpisaniu przez osoby uprawnione do reprezentacji w urzędzie skarbowym właściwym w sprawach ewidencji (osobiście lub pocztą).',
  edoreczenia: 'Prosimy podpisać pobrany PDF profilem zaufanym lub podpisem kwalifikowanym (wszystkie osoby zgodnie z reprezentacją w KRS) i wysłać go do urzędu skarbowego jako załącznik do pisma ogólnego w e-Urzędzie Skarbowym albo przez e-Doręczenia, a potwierdzenie (UPO lub dowód nadania) przesłać nam.',
  papier: 'Prosimy wydrukować wniosek, podpisać go (osoby uprawnione do reprezentacji zgodnie z KRS) i złożyć w urzędzie skarbowym właściwym w sprawach ewidencji – osobiście albo listem poleconym.',
};
const MAIL_DOCS = {
  uko: { label: 'wniosek UKO', title: 'Dostęp do konta organizacji w e-Urzędzie Skarbowym', path: '/e-us-dostep/', ways: UKO_WAYS, txt: UKO_TXT,
    intro: 'przesyłamy wypełniony wniosek o przyznanie dostępu do konta organizacji w e-Urzędzie Skarbowym. Po jego rozpatrzeniu wskazana osoba będzie mogła załatwiać sprawy spółki w e-Urzędzie Skarbowym (a przy dostępie rozszerzonym – nadawać dostęp kolejnym osobom). Plik PDF pobiorą Państwo przyciskiem „Pobierz PDF” w tej wiadomości – link działa przez 30 dni. Prosimy o sprawdzenie danych.',
    outro: 'W razie pytań jesteśmy do dyspozycji.' },
  zawfa: { label: 'ZAW-FA', title: 'ZAW-FA – dostęp do KSeF', path: '/zaw-fa/', ways: ZAW_WAYS, txt: ZAW_TXT,
    intro: 'przesyłamy wypełnione zawiadomienie ZAW-FA. Wskazuje ono osobę z Państwa firmy uprawnioną do korzystania z Krajowego Systemu e-Faktur (KSeF) w imieniu spółki – po jego przetworzeniu ta osoba zaloguje się do KSeF i wygeneruje certyfikat firmy. Plik PDF pobiorą Państwo przyciskiem „Pobierz PDF” w tej wiadomości – link działa przez 30 dni. Prosimy o sprawdzenie danych.',
    outro: 'W razie pytań jesteśmy do dyspozycji.' },
  upl1: { label: 'UPL-1', title: 'Pełnomocnictwo UPL-1', path: '/upl-1/', ways: UPL_WAYS, txt: UPL_TXT,
    intro: 'przesyłamy wypełnione pełnomocnictwo UPL-1. Dzięki niemu będziemy mogli podpisywać i wysyłać w Państwa imieniu deklaracje podatkowe i pliki JPK do urzędu skarbowego. Plik PDF pobiorą Państwo przyciskiem „Pobierz PDF” w tej wiadomości – link działa przez 30 dni. Prosimy o sprawdzenie danych.',
    outro: 'Złożenie UPL-1 jest bezpłatne – nie podlega opłacie skarbowej. W razie pytań jesteśmy do dyspozycji.' },
  pel: { label: 'PEL', title: 'Pełnomocnictwo ZUS PEL', path: '/zus-pel/', ways: PEL_WAYS, txt: PEL_TXT,
    intro: 'przesyłamy wypełnione pełnomocnictwo ZUS PEL. Dzięki niemu będziemy mogli wysyłać w Państwa imieniu deklaracje i dokumenty do ZUS oraz załatwiać sprawy przez eZUS. Plik PDF pobiorą Państwo przyciskiem „Pobierz PDF” w tej wiadomości – link działa przez 30 dni. Prosimy o sprawdzenie danych.',
    outro: 'W razie pytań jesteśmy do dyspozycji.' },
};
async function sendUpl1(cl, data, pelnomocnik, filename, kind = 'upl1') {
  const D = MAIL_DOCS[kind];
  const s = { way: 'wszystkie', to: String(cl.email || '').split(/[;,\s]+/).find(x => x.includes('@')) || '' };
  const link = () => {
    const q = new URLSearchParams();
    if (s.way !== 'wszystkie') q.set('sposob', s.way);
    if (['upl1', 'zawfa', 'uko'].includes(kind) && data.office) q.set('us', data.office.replace(/^Naczelnik /, ''));
    return `${location.origin}${D.path}${q.toString() ? '?' + q : ''}`;
  };
  const text = () => `Dzień dobry,\n\n${D.intro}\n\n${D.txt[s.way]}\n\nInstrukcja krok po kroku: ${link()}\n\n${D.outro}`;
  s.subject = kind === 'uko' ? `Wniosek o dostęp do konta organizacji w e-US – ${cl.name}` : kind === 'zawfa' ? `Zawiadomienie ZAW-FA (KSeF) – ${cl.name}` : `Pełnomocnictwo ${kind === 'pel' ? 'ZUS PEL' : 'UPL-1'} – ${cl.name}`; s.body = text();
  const body = h('div');
  const draw = () => body.replaceChildren(
    h('p', { class: 'small', style: { margin: '0 0 12px' } }, 'Klient: ', h('b', {}, cl.name), ' · plik do pobrania linkiem (30 dni, bez załącznika): ', h('b', {}, filename)),
    grid([['way', 'Sposób złożenia (zmienia treść e-maila i instrukcji)', 'select', D.ways, true], ['to', 'Do (e-mail klienta)', 'email', null, true],
      ['subject', 'Temat', 'text', null, true], ['body', 'Treść – e-mail wyjdzie z rdp.app z logo RKDP, odpowiedź klienta wróci do Ciebie', 'textarea']], s, k => { if (k === 'way') { s.body = text(); draw(); } }),
    h('p', { class: 'hint', style: { marginTop: '8px' } }, 'Link do instrukcji: ', h('a', { href: link(), target: '_blank', rel: 'noopener' }, 'podgląd instrukcji'), ' · e-mail wyjdzie z kancelaria@rkdp.pl, a wiadomość zapisze się w historii klienta.'));
  draw();
  body.querySelector('textarea')?.setAttribute('rows', '12');
  modal(`Wyślij ${D.label} klientowi`, body, close => [
    h('button', { class: 'btn btn-ghost btn-sm', onclick: close }, 'Anuluj'),
    h('button', { class: 'btn btn-primary btn-sm', onclick: async e => {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.to.trim())) return toast('Wpisz poprawny e-mail klienta', true);
      const b = e.currentTarget; b.disabled = true; b.textContent = 'Przygotowuję PDF…';
      try {
        const { overlayPdfBytes } = await import('./forms.js');
        const bytes = kind === 'uko' ? await overlayPdfBytes(UKO_PAGES, ukoItems(data)) : kind === 'zawfa' ? await overlayPdfBytes(ZAW_PAGES, zawItems(data)) : kind === 'pel' ? await overlayPdfBytes(PEL_PAGES, pelItems(data, pelnomocnik)) : await overlayPdfBytes(UPL1_PAGES, upl1Items(data, pelnomocnik));
        let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        b.textContent = 'Wysyłam…';
        const { data: r, error } = await sb.functions.invoke('podpis', { body: { action: 'doc_mail', client_id: cl.id, to: s.to.trim(), subject: s.subject, body: s.body,
          attachment: { name: filename.replace(/_/g, ' '), base64: btoa(bin) },
          doc: { kicker: kind === 'uko' ? 'Wniosek do złożenia' : kind === 'zawfa' ? 'Zawiadomienie do złożenia' : 'Pełnomocnictwo do złożenia', title: D.title || D.label, button: { url: link(), label: `Instrukcja: jak złożyć ${D.label}` } } } });
        if (error || r?.error) throw new Error(r?.detail || r?.error || error.message);
        toast(`Wysłano ${D.label} do ${s.to.trim()}`); close();
      } catch (err) { fail(err, 'Nie udało się wysłać e-maila'); b.disabled = false; b.textContent = 'Wyślij e-mail'; }
    } }, icon('mail'), 'Wyślij e-mail'),
  ]);
}
