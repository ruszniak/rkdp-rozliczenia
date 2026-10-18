import { h, icon, fail, toast, modal, downloadCsv } from '../ui.js';
import { sb, state, memberById, canEditClients } from '../store.js';
import { LEGAL_SHORT, FORM_GROUP, VAT_SHORT, PIT_SHORT, CIT_SHORT, ZUS_SHORT, CLIENT_STATUS, isCompany, isPartnership,
  LEGAL_FORM, BOOKKEEPING, PIT_FORM, ADVANCES, ZUS_TYPE, CIT_TYPE, VAT_STATUS } from '../dict.js';
import { fetchAll } from './rozliczenia.js';
import { lookupNip, validNip, cleanNip } from '../nip.js';
import { dokumentyDialog } from '../rkdp/docs.js';

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
      const acc = memberById(c.accountant_id)?.short_name, hr = memberById(c.hr_id)?.short_name;
      return h('tr', { class: 'click', onclick: () => { location.hash = `#/klient/${c.id}`; } },
        h('td', {}, h('a', { href: `#/klient/${c.id}`, style: { fontWeight: 600, color: 'var(--ink)', textDecoration: 'none' } }, c.name),
          c.status !== 'aktywny' ? h('div', {}, h('span', { class: 'badge warn' }, CLIENT_STATUS[c.status])) : null),
        h('td', {}, h('span', { class: 'badge' }, LEGAL_SHORT[c.legal_form] || '?')),
        h('td', { class: 'small' }, taxSummary(c) || h('span', { class: 'muted' }, '—')),
        h('td', { class: 'small' }, c.phone ? h('a', { href: 'tel:' + c.phone.replace(/\s/g, ''), onclick: e => e.stopPropagation() }, c.phone) : '',
          c.email ? h('div', {}, h('a', { href: 'mailto:' + c.email, onclick: e => e.stopPropagation() }, c.email)) : ''),
        h('td', { class: 'small' }, acc ? h('div', {}, 'Księgowość: ', h('b', {}, acc)) : null, hr ? h('div', {}, 'Kadry: ', h('b', {}, hr)) : null,
          !acc && !hr ? h('span', { class: 'muted' }, '—') : null),
        h('td', {}, h('span', { class: 'pct', title: comp.missing ? `Brakuje ${comp.missing} pól` : 'Profil kompletny' },
          h('span', { class: 'bar' }, h('i', { style: { width: comp.pct + '%' } })), comp.pct + '%')));
    }));
  };

  const onFilter = () => { Object.assign(prefs, { q: search.value, status: statusSel.value, group: groupSel.value }); savePrefs(prefs); render(); };
  let searchTimer;
  search.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(onFilter, 180); });
  statusSel.addEventListener('change', onFilter);
  groupSel.addEventListener('change', onFilter);

  const exportBtn = h('button', { class: 'btn btn-outline btn-sm', onclick: () => {
    const opt = (d, v) => (v ? d[v] || v : '');
    const yn = v => v === true ? 'tak' : v === false ? 'nie' : '';
    downloadCsv('klienci_rkdp.csv', [
      ['Nazwa', 'Status', 'Forma', 'Księgowość', 'NIP', 'REGON', 'KRS', 'Adres', 'Osoba kontaktowa', 'E-mail', 'Telefon',
        'PIT', 'Zaliczki PIT', 'ZUS', 'CIT', 'VAT', 'VAT-UE', 'Pracownicy', 'Umowa', 'UPL-1', 'Wynagrodzenie netto', 'Księgowa', 'Kadrowa'],
      ...list().map(c => [c.name, CLIENT_STATUS[c.status], opt(LEGAL_FORM, c.legal_form), opt(BOOKKEEPING, c.bookkeeping),
        c.nip, c.regon, c.krs, c.address, c.contact_person, c.email, c.phone, opt(PIT_FORM, c.pit_form), opt(ADVANCES, c.pit_advances),
        opt(ZUS_TYPE, c.zus_type), opt(CIT_TYPE, c.cit_type), opt(VAT_STATUS, c.vat_status), yn(c.vat_ue), yn(c.has_employees),
        yn(c.contract_signed), yn(c.upl1), c.monthly_fee ?? '',
        memberById(c.accountant_id)?.short_name || '', memberById(c.hr_id)?.short_name || '']),
    ]);
  } }, icon('download'), 'Eksport');

  const addBtn = canEditClients()
    ? h('button', { class: 'btn btn-primary', onclick: async () => {
      const val = prompt('Podaj NIP (dane pobiorę z Białej listy VAT) albo nazwę nowego klienta:');
      if (!val?.trim()) return;
      let row = { name: val.trim() };
      if (validNip(val)) {
        try {
          const r = await lookupNip(val);
          if (r.found) row = { name: r.name, nip: r.nip, regon: r.regon, krs: r.krs, address: r.address };
          else { const n = prompt('Nie znaleziono tego NIP w wykazie VAT. Podaj nazwę klienta:'); if (!n?.trim()) return; row = { name: n.trim(), nip: cleanNip(val) }; }
        } catch (e) { return fail(e); }
      }
      const { data, error } = await sb.from('clients').insert(row).select('id').single();
      if (error) return fail(error);
      location.hash = `#/klient/${data.id}`;
    } }, icon('plus'), 'Dodaj klienta')
    : null;

  // ---- masowa aktualizacja z Białej listy VAT ----
  const wlBtn = canEditClients() ? h('button', { class: 'btn btn-outline btn-sm', onclick: async () => {
    const withNip = clients.filter(c => validNip(c.nip || ''));
    if (!withNip.length) return toast('Żaden klient nie ma poprawnego NIP', true);
    wlBtn.disabled = true; wlBtn.textContent = `Sprawdzam ${withNip.length} NIP…`;
    const { data, error } = await sb.functions.invoke('nip-lookup', { body: { nips: withNip.map(c => cleanNip(c.nip)) } });
    wlBtn.disabled = false; wlBtn.replaceChildren(icon('download'), 'Biała lista VAT');
    if (error || data?.error) return fail(data?.error || error, 'Biała lista');
    const res = data.results || {};
    const changes = withNip.map(c => {
      const r = res[cleanNip(c.nip)];
      if (!r?.found) return { c, notFound: true, set: {} };
      const set = {};
      for (const k of ['address', 'regon', 'krs']) if (r[k] && (c[k] || '').trim() !== r[k]) set[k] = r[k];
      return { c, r, set };
    });
    const rows = changes.filter(x => Object.keys(x.set).length || x.notFound);
    const tbody = h('tbody', {}, ...(rows.length ? rows.map(x => {
      const cb = h('input', { type: 'checkbox', checked: !x.notFound, disabled: x.notFound });
      x.cb = cb;
      const diff = Object.entries(x.set).map(([k, v]) => h('div', { class: 'small' }, h('b', {}, { address: 'Adres', regon: 'REGON', krs: 'KRS' }[k] + ': '),
        x.c[k] ? h('span', { class: 'muted', style: { textDecoration: 'line-through' } }, x.c[k] + ' ') : '', v));
      return h('tr', {}, h('td', {}, cb), h('td', {}, h('b', {}, x.c.name), h('div', { class: 'small muted' }, 'NIP ' + x.c.nip),
          x.r && x.r.name ? h('div', { class: 'small muted' }, 'w rejestrze: ' + x.r.name) : null),
        h('td', {}, x.notFound ? h('span', { class: 'badge warn' }, 'brak w wykazie VAT') : diff),
        h('td', { class: 'small' }, x.r?.statusVat || ''));
    }) : [h('tr', {}, h('td', { colspan: 4, class: 'empty' }, 'Wszystkie dane są aktualne.'))]));
    modal(`Biała lista VAT – ${data.checkedAt}`, h('div', {},
      h('p', { class: 'hint', style: { marginBottom: '10px' } }, `Sprawdzono ${withNip.length} klientów. Zaznaczone zmiany zostaną zapisane (adres, REGON, KRS). Nazwy klientów nie zmieniam. „Brak w wykazie VAT” oznacza podmiot niezarejestrowany jako podatnik VAT albo wykreślony.`),
      h('div', { class: 'list-wrap', style: { maxHeight: '60vh', overflow: 'auto' } }, h('table', { class: 'list' },
        h('thead', {}, h('tr', {}, ['', 'Klient', 'Zmiana', 'Status VAT'].map(t => h('th', {}, t)))), tbody))),
    (close) => [
      h('button', { class: 'btn btn-ghost btn-sm', onclick: close }, 'Anuluj'),
      rows.some(x => !x.notFound) ? h('button', { class: 'btn btn-primary btn-sm', onclick: async (e) => {
        const todo = rows.filter(x => x.cb?.checked && Object.keys(x.set).length);
        e.currentTarget.disabled = true;
        let ok = 0;
        for (const x of todo) { const { error: e2 } = await sb.from('clients').update(x.set).eq('id', x.c.id); if (e2) { fail(e2); break; } Object.assign(x.c, x.set); ok++; }
        toast(`Zaktualizowano ${ok} klientów`); close(); render();
      } }, 'Zapisz zaznaczone') : null,
    ], { wide: true });
  } }, icon('download'), 'Biała lista VAT') : null;

  main.replaceChildren(
    h('div', { class: 'page-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, 'Baza klientów'), h('h1', { style: { marginTop: '6px' } }, 'Klienci'),
        h('p', { class: 'sub' }, 'Dane kontaktowe i profil rozliczeń: PIT, CIT, VAT, ZUS, wspólnicy.')),
      h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
        h('button', { class: 'btn btn-outline', onclick: () => dokumentyDialog().catch(e => fail(e)) }, 'Umowy i pełnomocnictwa'), addBtn)),
    h('div', { class: 'toolbar' }, search, statusSel, groupSel, counter, exportBtn, wlBtn),
    h('div', { class: 'list-wrap' }, h('table', { class: 'list' },
      h('thead', {}, h('tr', {}, ['Klient', 'Forma', 'Rozliczenia', 'Kontakt', 'Księgowa / kadrowa', 'Profil'].map(t => h('th', {}, t)))),
      tbody)));
  render();
  if (!clients.length) tbody.replaceChildren(h('tr', {}, h('td', { colspan: 6, class: 'empty' }, 'Nie masz jeszcze przypisanych klientów.')));
}
