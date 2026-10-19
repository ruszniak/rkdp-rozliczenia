// RKDP – dokumenty dla klientów: umowy (wg wzorów biura), UPL-1, PEL (ZUS), PPS-1, pełnomocnictwo procesowe.
import { h, toast, fail, icon, modal, printHtml } from '../ui.js';
import { sb, state, canEditClients } from '../store.js';
import { fillDocx, docxToHtml, downloadBytes } from '../docx.js';
import { upl1Defaults, upl1Items, pelDefaults, pelItems, printOverlay, UPL1_PAGES, PEL_PAGES, RKDP_DELIVERY, RKDP_CONTACT, rkSplit } from './forms.js';
import { pps1Defaults, printPps1, parseAddress, BOX4_LABELS } from '../m2/pps1.js';
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
  pps1: 'PPS-1 – pełnomocnictwo szczególne (US)',
  procesowe: 'Pełnomocnictwo procesowe (WSA, NSA) – papier firmowy RKDP',
};
const TEMPLATES = {
  ryczalt: { label: 'Ryczałt od przychodów ewidencjonowanych', url: '/rkdp/umowa-ryczalt.docx', sub: '[ryczałt od przychodów ewidencjonowanych]' },
  kpir: { label: 'Podatkowa księga przychodów i rozchodów', url: '/rkdp/umowa-kpir.docx', sub: '[podatkowa księga przychodów i rozchodów]' },
  ksiegi: { label: 'Księgi rachunkowe (spółki)', url: '/rkdp/umowa-ksiegi.docx', sub: '[księgi rachunkowe]' },
};

// prosty formularz pól: [klucz, etykieta, typ, opcje, szerokie]
function grid(defs, obj, onChange) {
  return h('div', { class: 'form-grid' }, ...defs.filter(Boolean).map(([key, label, type, opts, wide]) => {
    let el;
    if (type === 'select') { el = h('select', { class: 'select' }, ...Object.entries(opts).map(([k, v]) => h('option', { value: k }, v))); el.value = obj[key] ?? ''; }
    else if (type === 'textarea') el = h('textarea', { class: 'input', rows: 3 }, obj[key] ?? '');
    else if (type === 'check') { el = h('input', { type: 'checkbox', checked: !!obj[key] }); }
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
  const tpl = c?.bookkeeping === 'ryczalt' ? 'ryczalt' : c?.bookkeeping === 'kpir' ? 'kpir' : (c && !isJdg(c)) ? 'ksiegi' : (c?.pit_form === 'ryczalt' ? 'ryczalt' : 'kpir');
  const n = rkSplit(c?.name);
  return {
    tpl, gender: 'm',
    person: isJdg(c) ? `${n.first} ${n.last}`.trim() : '', firm: isJdg(c) ? c?.name || '' : '',
    address: c?.address || '', nip: c?.nip || '', email: c?.email || '', month: nextMonth(),
    company: (c?.name || '').replace(/\s*(sp\.?\s*z\s*o\.?\s*o\.?|spółka z ograniczoną odpowiedzialnością)\s*$/i, '').trim(),
    seat_loc: a.city ? `${a.city}` : '', street: [a.street, a.house + (a.flat ? '/' + a.flat : '')].filter(Boolean).join(' '), zip: a.zip, city: a.city,
    krs: c?.krs || '', regon: c?.regon || '', rep: c?.contact_person || '',
    fee: c?.monthly_fee ?? '', docs_limit: '', fee_extra: '', fee_year: '', fee_hr: '',
  };
}
function contractReplacements(v) {
  const T = TEMPLATES[v.tpl];
  const common = [['[MIESIĄC ROK]', v.month || '[MIESIĄC ROK]'], ['[ADRES E-MAIL]', v.email || '[ADRES E-MAIL]'],
    ['[KWOTA]', amount(v.fee)], ['[LICZBA]', v.docs_limit || '[LICZBA]'], ['[KWOTA]', amount(v.fee_extra)], ['[KWOTA]', amount(v.fee_year)], ['[KWOTA]', amount(v.fee_hr)]];
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
function contractPrintHtml(documentXml, title) {
  const body = docxToHtml(documentXml);
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>${title}</title>
<style>@page{size:A4;margin:14mm 24mm 18mm;
@bottom-center{content:"RKDP spółka doradztwa podatkowego sp. z o.o.  |  ul. Beaty Artemskiej 11/44, 52-234 Wrocław  |  kancelaria@rkdp.pl";font:7pt Calibri,Arial,sans-serif;color:#666}
@bottom-right{content:counter(page) "/" counter(pages);font:7pt Calibri,Arial,sans-serif;color:#999}}
body{margin:0;font-family:Calibri,Carlito,Arial,sans-serif;font-size:11pt;line-height:1.35;color:#1c1d21;-webkit-print-color-adjust:exact;print-color-adjust:exact}
table.page{width:100%;border-collapse:collapse}table.page td{padding:0}
.lh{text-align:center;padding-bottom:12pt}.lh img{width:165pt;height:auto}
p{margin:0}.tab{display:inline-block;width:36pt}</style></head>
<body><table class="page"><thead><tr><td><div class="lh"><img src="${location.origin}/logo-rkdp.png" alt="RKDP"></div></td></tr></thead>
<tbody><tr><td>${body}</td></tr></tbody></table></body></html>`;
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
  const reset = () => {
    const kind = isJdg(cl) ? 'osoba' : 'firma';
    const repsText = cl?.contact_person || '';
    v = {
      contract: contractDefaults(cl),
      upl1: upl1Defaults({ client: cl || {} }),
      pel: pelDefaults({ client: cl || {} }),
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
    sel.addEventListener('change', () => { cl = clients.find(c => c.id === sel.value) || null; reset(); build(); });
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
      clients.push(data); clients.sort((a, b) => a.name.localeCompare(b.name, 'pl')); cl = data; fill(); reset(); build();
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
    return h('p', { class: 'hint', style: { margin: '-4px 0 10px' } }, `Dane z „Mój profil”: ${[x.nip ? 'NIP' : x.pesel ? 'PESEL' : null, x.ae_address ? 'adres elektroniczny' : null, x.delivery === 'biuro' ? 'doręczenia na biuro' : 'własny adres', x.phone ? 'telefon' : null].filter(Boolean).join(', ')}.${!x.nip && !x.pesel && !me ? ' PESEL wpisze się tylko, gdy ta osoba wygeneruje dokument sama.' : ''}`);
  };

  function build() {
    const t = d.type;
    const parts = [clientRow, grid([['type', 'Dokument', 'select', DOC_TYPES, true]], d, () => build())];
    if (t === 'umowa') {
      const c = v.contract;
      parts.push(grid([['tpl', 'Wzór umowy', 'select', Object.fromEntries(Object.entries(TEMPLATES).map(([k, x]) => [k, x.label])), true]], c, () => build()));
      if (c.tpl === 'ksiegi') parts.push(grid([
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
        ['fee_extra', 'Dokument nadwyżkowy (zł netto / szt.)', 'text'], ['fee_year', c.tpl === 'ksiegi' ? 'Sprawozdanie finansowe (zł netto)' : 'Zeznanie roczne PIT (zł netto)', 'text'],
        ['fee_hr', 'Kadry – 1 tytuł zatrudnienia (zł netto)', 'text'],
      ], c), h('p', { class: 'hint', style: { marginTop: '8px' } }, 'Puste pola zostaną w umowie jako [POLE] do uzupełnienia. Treść umowy jest dokładnie z Twojego wzoru.'));
    } else if (t === 'upl1' || t === 'pel' || t === 'pps1') {
      const x = v[t];
      parts.push(grid([['who', 'Pełnomocnik', 'select', whoOpts(), true]], d, () => build()), whoHint());
      if (t === 'upl1') parts.push(grid([
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
        ['g_first', 'Osoba udzielająca – imię', 'text'], ['g_last', 'Nazwisko', 'text'], ['g_pesel', 'PESEL (opcjonalnie – nie zapisuje się)', 'text'],
        ['g_street', 'Ulica', 'text'], ['g_house', 'Nr domu', 'text'], ['g_flat', 'Nr lokalu', 'text'], ['g_zip', 'Kod pocztowy', 'text'], ['g_city', 'Miejscowość', 'text'], ['g_phone', 'Telefon', 'text'],
        ['p_pesel', 'PESEL pełnomocnika (opcjonalnie – nie zapisuje się)', 'text'],
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
          ['organ', 'Poz. 3 – organ', 'text', null, true], ['scope', 'Poz. 71 – sprawa i zakres', 'textarea'],
          ['client_kind', 'Poz. 5 – rodzaj podmiotu', 'select', { firma: 'Podmiot niebędący osobą fizyczną', osoba: 'Osoba fizyczna' }],
          ['client_nip', 'Poz. 1 – NIP', 'text'], ['client_name', 'Poz. 6 – nazwa / „Nazwisko, imię”', 'text', null, true],
          ['c_voiv', '14. Województwo', 'text'], ['c_county', '15. Powiat', 'text'], ['c_commune', '16. Gmina', 'text'], ['c_street', '17. Ulica', 'text'],
          ['c_house', '18. Nr domu', 'text'], ['c_flat', '19. Nr lokalu', 'text'], ['c_city', '20. Miejscowość', 'text'], ['c_zip', '21. Kod pocztowy', 'text'],
          ['client_phone', '22. Telefon', 'text'], ['client_email', '23. E-mail', 'text'],
          ['reps', 'Podpisujący (max 3) – „Jan Kowalski – prezes zarządu”', 'textarea'], ['date', '76. Data', 'date'],
          ['fee', '80. Opłata skarbowa', 'select', { dolaczono: 'dołączono dowód zapłaty', w3dni: 'dowód w ciągu 3 dni', brak: 'nie zaznaczaj' }],
        ], x));
      }
    } else if (t === 'procesowe') {
      parts.push(h('p', { class: 'small', style: { margin: '0 0 10px' } }, 'Pełnomocnik: ', h('b', {}, `${advisor.full_name} – doradca podatkowy, nr wpisu ${advisor.license_no || '—'}`)),
        grid([['organ', 'Sąd', 'text', null, true], ['scope', 'Zakres – „do reprezentowania Mocodawcy …” (puste = przed wskazanym sądem)', 'textarea'],
          ['reps', isJdg(cl) ? 'Mocodawca' : 'Reprezentanci – „Jan Kowalski – prezes zarządu”', 'textarea'], ['date', 'Data', 'date']], v.proc));
    }
    box.replaceChildren(...parts.filter(Boolean));
  }
  build();

  const fname = (prefix, ext) => `${prefix}_${(cl?.name || 'klient').replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 40)}.${ext}`;
  async function generate(format) {
    if (!cl) return toast('Wybierz klienta', true);
    const t = d.type;
    try {
      if (t === 'umowa') {
        const c = v.contract, T = TEMPLATES[c.tpl];
        const { bytes, documentXml } = await fillDocx(T.url, contractReplacements(c));
        if (format === 'docx') return downloadBytes(bytes, fname('Umowa_RKDP', 'docx'));
        printHtml(contractPrintHtml(documentXml, fname('Umowa_RKDP', 'pdf')));
        return;
      }
      if (format === 'docx' && t !== 'procesowe') return toast('Formularz urzędowy pobierasz jako PDF', true);
      if (t === 'upl1') return printOverlay(UPL1_PAGES, upl1Items(v.upl1, pelnomocnik()), fname('UPL-1', 'pdf')) || toast('Zezwól na wyskakujące okna', true);
      if (t === 'pel') return printOverlay(PEL_PAGES, pelItems(v.pel, pelnomocnik()), fname('PEL', 'pdf')) || toast('Zezwól na wyskakujące okna', true);
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

  modal('Dokumenty klienta', box, (close) => [
    h('button', { class: 'btn btn-ghost btn-sm', onclick: close }, 'Zamknij'),
    h('button', { class: 'btn btn-outline btn-sm', onclick: () => generate('docx') }, icon('download'), 'Word'),
    h('button', { class: 'btn btn-primary btn-sm', onclick: () => generate('pdf') }, icon('download'), 'PDF'),
  ]);
}
