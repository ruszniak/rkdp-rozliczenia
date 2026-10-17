import { h, icon, fail, downloadCsv } from '../ui.js';
import { sb, state, memberById, canEditClients } from '../store.js';
import { LEGAL_SHORT, FORM_GROUP, VAT_SHORT, PIT_SHORT, CIT_SHORT, ZUS_SHORT, CLIENT_STATUS, isCompany, isPartnership,
  LEGAL_FORM, BOOKKEEPING, PIT_FORM, ADVANCES, ZUS_TYPE, CIT_TYPE, VAT_STATUS } from '../dict.js';
import { fetchAll } from './rozliczenia.js';

const PREF_KEY = 'rkdp-klienci-filtry';
const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch { return {}; } };
const savePrefs = p => { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* */ } };

// Co powinno być uzupełnione w profilu — zależnie od formy
export function requiredFields(c) {
  const f = ['legal_form', 'bookkeeping', 'nip', 'email', 'phone', 'vat_status', 'has_employees', 'contract_signed', 'upl1'];
  if (c.legal_form === 'jdg') f.push('pit_form', 'pit_advances', 'zus_type');
  if (isCompany(c.legal_form)) f.push('cit_type', 'krs', 'crbr_reported');
  if (isPartnership(c.legal_form)) f.push('partners');
  return f;
}
export function completeness(c, partnersCount = 0) {
  const req = requiredFields(c);
  const done = req.filter(k => k === 'partners' ? partnersCount > 0 : c[k] !== null && c[k] !== undefined && c[k] !== '').length;
  return { pct: Math.round(done / req.length * 100), missing: req.length - done };
}

export function taxSummary(c) {
  const out = [];
  if (c.legal_form === 'jdg' && c.pit_form) out.push(PIT_SHORT[c.pit_form] + (c.pit_advances === 'kwartalne' ? ' (kw.)' : ''));
  if (isCompany(c.legal_form) && c.cit_type) out.push(CIT_SHORT[c.cit_type] + (c.cit_advances === 'kwartalne' ? ' (kw.)' : ''));
  if (c.vat_status) out.push(VAT_SHORT[c.vat_status]);
  if (c.legal_form === 'jdg' && c.zus_type) out.push('ZUS: ' + ZUS_SHORT[c.zus_type]);
  if (c.has_employees) out.push('Pracownicy');
  return out.join(' · ');
}

export async function renderKlienci(main) {
  const prefs = { q: '', status: 'aktywny', group: '', ...loadPrefs() };
  main.replaceChildren(h('div', { class: 'spinner' }, 'Wczytywanie klientów…'));
  const clients = await fetchAll(() => sb.from('clients').select('*, client_assignments(member_id), client_partners(id)').order('name'));

  const search = h('input', { class: 'input grow', type: 'search', placeholder: 'Szukaj po nazwie, NIP, e-mailu, telefonie…', value: prefs.q, 'aria-label': 'Szukaj' });
  const statusSel = h('select', { class: 'select', 'aria-label': 'Status' }, h('option', { value: '' }, 'Wszystkie statusy'),
    Object.entries(CLIENT_STATUS).map(([k, v]) => h('option', { value: k }, v)));
  statusSel.value = prefs.status;
  const groupSel = h('select', { class: 'select', 'aria-label': 'Forma' },
    h('option', { value: '' }, 'Wszystkie formy'), h('option', { value: 'jdg' }, 'JDG'),
    h('option', { value: 'osobowe' }, 'Spółki osobowe'), h('option', { value: 'kapitalowe' }, 'Sp. z o.o. / S.A.'),
    h('option', { value: 'inne' }, 'Pozostałe'), h('option', { value: 'niekompletne' }, 'Profil do uzupełnienia'));
  groupSel.value = prefs.group;

  const tbody = h('tbody');
  const counter = h('span', { class: 'muted small' });

  const list = () => {
    const q = prefs.q.trim().toLowerCase();
    return clients.filter(c => {
      if (prefs.status && c.status !== prefs.status) return false;
      if (prefs.group === 'niekompletne') { if (completeness(c, c.client_partners?.length).pct === 100) return false; }
      else if (prefs.group && (FORM_GROUP[c.legal_form] || 'inne') !== prefs.group) return false;
      if (q && ![c.name, c.nip, c.email, c.phone, c.contact_person].some(v => (v || '').toLowerCase().includes(q))) return false;
      return true;
    });
  };

  const render = () => {
    const rows = list();
    counter.textContent = `${rows.length} z ${clients.length}`;
    tbody.replaceChildren(...rows.map(c => {
      const comp = completeness(c, c.client_partners?.length);
      const owners = (c.client_assignments || []).map(a => memberById(a.member_id)?.short_name).filter(Boolean);
      return h('tr', { class: 'click', onclick: () => { location.hash = `#/klient/${c.id}`; } },
        h('td', {}, h('a', { href: `#/klient/${c.id}`, style: { fontWeight: 600, color: 'var(--ink)', textDecoration: 'none' } }, c.name),
          c.status !== 'aktywny' ? h('div', {}, h('span', { class: 'badge warn' }, CLIENT_STATUS[c.status])) : null),
        h('td', {}, h('span', { class: 'badge' }, LEGAL_SHORT[c.legal_form] || '?')),
        h('td', { class: 'small' }, taxSummary(c) || h('span', { class: 'muted' }, '—')),
        h('td', { class: 'small' }, c.phone ? h('a', { href: 'tel:' + c.phone.replace(/\s/g, ''), onclick: e => e.stopPropagation() }, c.phone) : '',
          c.email ? h('div', {}, h('a', { href: 'mailto:' + c.email, onclick: e => e.stopPropagation() }, c.email)) : ''),
        h('td', { class: 'small' }, owners.join(', ')),
        h('td', {}, h('span', { class: 'pct', title: comp.missing ? `Brakuje ${comp.missing} pól` : 'Profil kompletny' },
          h('span', { class: 'bar' }, h('i', { style: { width: comp.pct + '%' } })), comp.pct + '%')));
    }));
  };

  const onFilter = () => { Object.assign(prefs, { q: search.value, status: statusSel.value, group: groupSel.value }); savePrefs(prefs); render(); };
  search.addEventListener('input', onFilter);
  statusSel.addEventListener('change', onFilter);
  groupSel.addEventListener('change', onFilter);

  const exportBtn = h('button', { class: 'btn btn-outline btn-sm', onclick: () => {
    const opt = (d, v) => (v ? d[v] || v : '');
    const yn = v => v === true ? 'tak' : v === false ? 'nie' : '';
    downloadCsv('klienci_rkdp.csv', [
      ['Nazwa', 'Status', 'Forma', 'Księgowość', 'NIP', 'REGON', 'KRS', 'Adres', 'Osoba kontaktowa', 'E-mail', 'Telefon',
        'PIT', 'Zaliczki PIT', 'ZUS', 'CIT', 'VAT', 'VAT-UE', 'Pracownicy', 'Umowa', 'UPL-1', 'Wynagrodzenie netto', 'Opiekunowie'],
      ...list().map(c => [c.name, CLIENT_STATUS[c.status], opt(LEGAL_FORM, c.legal_form), opt(BOOKKEEPING, c.bookkeeping),
        c.nip, c.regon, c.krs, c.address, c.contact_person, c.email, c.phone, opt(PIT_FORM, c.pit_form), opt(ADVANCES, c.pit_advances),
        opt(ZUS_TYPE, c.zus_type), opt(CIT_TYPE, c.cit_type), opt(VAT_STATUS, c.vat_status), yn(c.vat_ue), yn(c.has_employees),
        yn(c.contract_signed), yn(c.upl1), c.monthly_fee ?? '',
        (c.client_assignments || []).map(a => memberById(a.member_id)?.short_name).filter(Boolean).join(', ')]),
    ]);
  } }, icon('download'), 'Eksport');

  const addBtn = canEditClients()
    ? h('button', { class: 'btn btn-primary', onclick: async () => {
      const name = prompt('Nazwa nowego klienta:');
      if (!name?.trim()) return;
      const { data, error } = await sb.from('clients').insert({ name: name.trim() }).select('id').single();
      if (error) return fail(error);
      location.hash = `#/klient/${data.id}`;
    } }, icon('plus'), 'Dodaj klienta')
    : null;

  main.replaceChildren(
    h('div', { class: 'page-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, 'Baza klientów'), h('h1', { style: { marginTop: '6px' } }, 'Klienci'),
        h('p', { class: 'sub' }, 'Dane kontaktowe i profil rozliczeń: PIT, CIT, VAT, ZUS, wspólnicy.')),
      addBtn),
    h('div', { class: 'toolbar' }, search, statusSel, groupSel, counter, exportBtn),
    h('div', { class: 'list-wrap' }, h('table', { class: 'list' },
      h('thead', {}, h('tr', {}, ['Klient', 'Forma', 'Rozliczenia', 'Kontakt', 'Obsługuje', 'Profil'].map(t => h('th', {}, t)))),
      tbody)));
  render();
  if (!clients.length) tbody.replaceChildren(h('tr', {}, h('td', { colspan: 6, class: 'empty' }, 'Nie masz jeszcze przypisanych klientów.')));
}
