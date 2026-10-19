// Historia zmian M2 TAX – karta „Historia zmian” na stronie klienta i sprawy.
import { h } from '../ui.js';
import { sb, memberById } from '../store.js';
import { MATTER_TYPE, MATTER_STATUS, FEE_TYPE, BILLING_TYPE, AML_RISK, DEADLINE_KIND, JOURNAL_KIND, ORDER_STATUS, fmtDate, money } from './dict.js';

const WHAT = {
  m2_clients: 'klienta', m2_matters: 'sprawę', m2_contacts: 'osobę kontaktową', m2_deadlines: 'termin',
  m2_journal: 'wpis w dzienniku', m2_time: 'czas pracy', m2_orders: 'zlecenie / umowę',
};
const ACT = { insert: 'dodano', update: 'zmieniono', delete: 'usunięto' };
const FIELD = {
  kind: 'Rodzaj', name: 'Nazwa', nip: 'NIP', regon: 'REGON', krs: 'KRS', address: 'Adres', mail_address: 'Adres korespondencyjny', email: 'E-mail', phone: 'Telefon',
  contact_person: 'Osoba kontaktowa', industry: 'Branża', source: 'Źródło', billing_type: 'Rozliczenie', hourly_rate: 'Stawka godzinowa', subscription: 'Abonament',
  monthly_fee: 'Opłata miesięczna', rate_notes: 'Uwagi do stawek', aml_verified_at: 'Weryfikacja AML', aml_risk: 'Ryzyko AML', beneficial_owner: 'Beneficjent rzeczywisty',
  aml_notes: 'Uwagi AML', status: 'Status', notes: 'Uwagi', number: 'Numer', client_id: 'Klient', title: 'Tytuł', matter_type: 'Rodzaj sprawy', authority: 'Organ',
  case_ref: 'Sygnatura', tax_kind: 'Podatek', tax_period: 'Okres', value_in_dispute: 'Wartość sporu', stage: 'Etap', lead_id: 'Prowadzący', second_id: 'Drugi doradca',
  assistant_id: 'Asystent', poa_type: 'Pełnomocnictwo', poa_date: 'Data pełnomocnictwa', opened_at: 'Otwarta', closed_at: 'Zamknięta', fee_type: 'Wynagrodzenie',
  fee_amount: 'Kwota wynagrodzenia', estimated_hours: 'Szacowane godziny', description: 'Opis', outcome: 'Rozstrzygnięcie', order_id: 'Zlecenie', full_name: 'Imię i nazwisko',
  role: 'Funkcja', matter_id: 'Sprawa', due_date: 'Termin', due_time: 'Godzina', served_at: 'Data doręczenia', basis: 'Podstawa', assignee_id: 'Odpowiada', done: 'Wykonany',
  entry_date: 'Data', body: 'Treść', author: 'Autor', member_id: 'Osoba', work_date: 'Data pracy', minutes: 'Czas', billable: 'Do rozliczenia', order_date: 'Data zlecenia',
  subject: 'Przedmiot', scope: 'Zakres', fee_notes: 'Uwagi do wynagrodzenia', payment_days: 'Termin płatności (dni)', term_text: 'Czas trwania', extra_terms: 'Dodatkowe warunki',
  signer_id: 'Podpisujący', signer_ids: 'Podpisujący', doc_type: 'Rodzaj dokumentu', params: 'Treść dokumentu',
};
const DICT = { status: { ...MATTER_STATUS, ...ORDER_STATUS }, matter_type: MATTER_TYPE, fee_type: FEE_TYPE, billing_type: BILLING_TYPE, aml_risk: AML_RISK };
const lbl = v => (v && typeof v === 'object' ? v.label || v.name : v);

function fmtVal(table, k, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (/_id$/.test(k) && /^[0-9a-f-]{36}$/.test(v)) return k === 'client_id' || k === 'matter_id' || k === 'order_id' ? '(zmieniono powiązanie)' : (memberById(v)?.full_name || '—');
  if (v === 'true' || v === 'false') return v === 'true' ? 'tak' : 'nie';
  if (k === 'kind') return lbl((table === 'm2_deadlines' ? DEADLINE_KIND : table === 'm2_journal' ? JOURNAL_KIND : {})[v]) || v;
  if (DICT[k]?.[v]) return lbl(DICT[k][v]);
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return fmtDate(v);
  if (k === 'minutes') return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')} h`;
  if (/amount|fee$|rate$|value_in_dispute/.test(k) && !isNaN(+v)) return money(v);
  return v.length > 140 ? v.slice(0, 140) + '…' : v;
}

function entry(e, ctx) {
  const when = new Date(e.at);
  const self = (ctx === 'client' && e.table_name === 'm2_clients') || (ctx === 'matter' && e.table_name === 'm2_matters');
  const changes = e.action === 'update' && e.changes ? Object.entries(e.changes) : [];
  return h('div', { class: 'hist-row' },
    h('div', { class: 'hist-when' }, h('b', {}, when.toLocaleDateString('pl-PL')), h('span', {}, when.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }))),
    h('div', { class: 'hist-what' },
      h('div', {}, h('b', {}, e.actor || 'system'), ' · ', `${ACT[e.action]} ${self ? (ctx === 'client' ? 'dane klienta' : 'dane sprawy') : WHAT[e.table_name] || e.table_name}`,
        !self && e.label ? [': ', h('i', {}, e.label)] : null),
      changes.length ? h('ul', { class: 'hist-ch' }, ...changes.map(([k, [a, b]]) => h('li', {},
        h('span', { class: 'muted' }, (FIELD[k] || k) + ': '),
        k === 'params' ? 'zaktualizowano' : [h('s', {}, fmtVal(e.table_name, k, a)), ' → ', h('span', {}, fmtVal(e.table_name, k, b))]))) : null));
}

// filtr: { client: id } albo { matter: id }
export function historyCard({ client, matter }) {
  let limit = 15;
  const list = h('div', { class: 'hist' }, h('p', { class: 'hint' }, 'Wczytywanie…'));
  const more = h('button', { class: 'btn btn-ghost btn-sm', hidden: true, onclick: () => { limit += 30; load(); } }, 'Pokaż starsze');
  const body = h('div', { hidden: true }, list, more);
  const toggle = h('button', { class: 'btn btn-ghost btn-sm', 'aria-expanded': 'false', onclick: () => {
    body.hidden = !body.hidden; toggle.textContent = body.hidden ? 'Pokaż' : 'Ukryj'; toggle.setAttribute('aria-expanded', String(!body.hidden));
    if (!body.hidden && !loaded) load();
  } }, 'Pokaż');
  let loaded = false;
  async function load() {
    loaded = true;
    let q = sb.from('m2_history').select('*').order('at', { ascending: false }).limit(limit + 1);
    q = matter ? q.eq('matter_id', matter) : q.eq('client_id', client);
    const { data, error } = await q;
    if (error) { list.replaceChildren(h('p', { class: 'hint' }, 'Historia zmian będzie dostępna po aktualizacji bazy danych.')); return; }
    more.hidden = data.length <= limit;
    const rows = data.slice(0, limit);
    list.replaceChildren(...(rows.length ? rows.map(e => entry(e, matter ? 'matter' : 'client')) : [h('p', { class: 'hint' }, 'Brak zapisanych zmian. Historia jest prowadzona od momentu jej włączenia.')]));
  }
  return h('section', { class: 'card section' },
    h('div', { class: 'section-head' }, h('h2', {}, 'Historia zmian'), toggle), body);
}
