// Moduł Doradztwo podatkowe (M2 TAX)
import { h, toast, fail, icon, initials, MONTHS } from '../ui.js';
import { sb, state, memberById, isAdmin } from '../store.js';
import {
  MATTER_TYPE, MATTER_STATUS, OPEN_STATUSES, AUTHORITIES, TAX_KINDS, FEE_TYPE, BILLING_TYPE, SUBSCRIPTIONS, AML_RISK,
  DEADLINE_KIND, JOURNAL_KIND, ORDER_STATUS, DEADLINE_RULES, computeDeadline, limitationDate, fmtDate, todayIso, addDaysIso, money, hours,
} from '../m2/dict.js';
import { orderBlocks, orderHtml, ORDER_CSS, printOrder, downloadOrderDocx } from '../m2/order.js';
import { fetchAll } from './rozliczenia.js';

const BASE = '#/doradztwo';
const SUBNAV = [
  ['', 'Pulpit'], ['sprawy', 'Sprawy'], ['klienci', 'Klienci'], ['kalendarz', 'Kalendarz'], ['zlecenia', 'Zlecenia'], ['spotkania', 'Spotkania'],
];
const members = () => state.members.filter(m => m.active && (m.modules || []).includes('doradztwo'));
const who = id => memberById(id)?.short_name || '';
const memberOpts = () => Object.fromEntries(members().map(m => [m.id, m.full_name]));

// ---------- wspólne elementy ----------
function header(active, title, sub, actions) {
  return [
    h('div', { class: 'm2-top' },
      h('img', { src: '/m2tax-logo.png', alt: 'M2 TAX', class: 'm2-logo' }),
      h('nav', { class: 'tabs m2-tabs' }, ...SUBNAV.map(([k, l]) => h('a', { href: k ? `${BASE}/${k}` : BASE, class: active === k ? 'on' : '' }, l)))),
    h('div', { class: 'page-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, 'Doradztwo podatkowe · M2 TAX'), h('h1', { style: { marginTop: '6px' } }, title),
        sub ? h('p', { class: 'sub' }, sub) : null),
      actions ? h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, ...[].concat(actions)) : null),
  ];
}

const statusPill = (s) => { const st = MATTER_STATUS[s] || { label: s, cls: 'unk' }; return h('span', { class: `pill ${st.cls}` }, st.label); };
const orderPill = (s) => { const st = ORDER_STATUS[s] || { label: s, cls: 'unk' }; return h('span', { class: `pill ${st.cls}` }, st.label); };

function personChips(ids) {
  return h('span', { style: { display: 'inline-flex', gap: '4px' } }, ...ids.filter(Boolean).map(id => {
    const m = memberById(id); if (!m) return null;
    return h('span', { class: 'person', style: { padding: 0 }, 'data-tip': m.full_name }, h('span', { class: 'av' }, initials(m.full_name)));
  }));
}

// Pola formularza: [klucz, etykieta, typ, opcje, szerokie]
function fieldsGrid(defs, obj, onChange) {
  return h('div', { class: 'form-grid' }, ...defs.map(([key, label, type, opts, wide]) => {
    let el;
    if (type === 'select') {
      el = h('select', { class: 'select' }, h('option', { value: '' }, '—'), ...Object.entries(opts).map(([k, v]) => h('option', { value: k }, v)));
      el.value = obj[key] ?? '';
    } else if (type === 'textarea') {
      el = h('textarea', { class: 'input', rows: 4 }, obj[key] ?? '');
    } else if (type === 'list') {
      const id = 'dl-' + key + Math.random().toString(36).slice(2, 7);
      el = h('input', { class: 'input', list: id, value: obj[key] ?? '' });
      el._dl = h('datalist', { id }, ...opts.map(o => h('option', { value: o })));
    } else {
      el = h('input', { class: 'input', type: type || 'text', step: type === 'number' ? 'any' : null, value: obj[key] ?? '' });
    }
    el.addEventListener(type === 'select' ? 'change' : 'input', () => {
      let v = el.value.trim();
      if (v === '') v = null; else if (type === 'number') v = Number(v.replace(',', '.'));
      obj[key] = v; onChange?.(key, v);
    });
    return h('label', { class: 'field' + (wide || type === 'textarea' ? ' wide' : '') }, h('span', {}, label), el, el._dl || null);
  }));
}

function modal(title, body, actions) {
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const back = h('div', { class: 'modal-back', onmousedown: (e) => { if (e.target === back) close(); } },
    h('div', { class: 'modal', role: 'dialog', 'aria-label': title },
      h('div', { class: 'section-head' }, h('h2', {}, title), h('button', { class: 'icon-btn', 'aria-label': 'Zamknij', onclick: close }, '✕')),
      body, h('div', { class: 'row', style: { justifyContent: 'flex-end', display: 'flex', gap: '8px', marginTop: '16px' } }, ...actions(close))));
  document.body.append(back);
  document.addEventListener('keydown', onKey);
  back.querySelector('input, select, textarea')?.focus();
  return close;
}

async function loadSettings() {
  const { data } = await sb.from('app_settings').select('key,value');
  return Object.fromEntries((data || []).map(r => [r.key, r.value]));
}

// ---------- dodawanie terminu (z kalkulatorem) ----------
export function deadlineDialog({ matter = null, clientId = null, date = null, onSaved }) {
  const d = { kind: 'procesowy', title: '', due_date: date || '', assignee_id: matter?.lead_id || state.me.id, notes: '', basis: null, served_at: null };
  const calcBox = h('div', { class: 'panel', style: { padding: '14px 16px', marginBottom: '14px' } });
  const result = h('p', { class: 'small', style: { marginTop: '8px' } });
  const ruleSel = h('select', { class: 'select' }, h('option', { value: '' }, '— wybierz czynność —'),
    ...Object.entries(DEADLINE_RULES).map(([k, r]) => h('option', { value: k }, `${r.label}${r.days ? ` (${r.days} dni)` : r.months ? ` (${r.months} mies.)` : ''}`)),
    h('option', { value: 'przedawnienie' }, 'Przedawnienie zobowiązania (art. 70 § 1 OP)'));
  const served = h('input', { class: 'input', type: 'date' });
  const custom = h('input', { class: 'input', type: 'number', placeholder: 'dni', style: { width: '90px' } });
  const year = h('input', { class: 'input', type: 'number', placeholder: 'np. 2021', style: { width: '120px' } });
  const servedLbl = h('label', { class: 'field' }, h('span', {}, 'Data doręczenia / wpływu'), served);
  const customLbl = h('label', { class: 'field', hidden: true }, h('span', {}, 'Termin z wezwania'), custom);
  const yearLbl = h('label', { class: 'field', hidden: true }, h('span', {}, 'Rok, w którym upłynął termin płatności'), year);
  const recalc = () => {
    const k = ruleSel.value;
    customLbl.hidden = k !== 'wezwanie'; yearLbl.hidden = k !== 'przedawnienie'; servedLbl.hidden = k === 'przedawnienie';
    if (!k) { result.textContent = ''; return; }
    if (k === 'przedawnienie') {
      const dt = limitationDate(year.value);
      if (!dt) { result.textContent = ''; return; }
      Object.assign(d, { kind: 'przedawnienie', due_date: dt, basis: `art. 70 § 1 Ordynacji podatkowej – 5 lat od końca ${year.value} r.`, served_at: null });
      if (!d.title || d._auto) { d.title = `Przedawnienie zobowiązania (termin płatności w ${year.value} r.)`; d._auto = true; }
    } else {
      const r = computeDeadline(k, served.value, custom.value);
      if (!r) { result.textContent = ''; return; }
      Object.assign(d, { kind: r.rule.kind, due_date: r.date, basis: r.rule.basis + (r.moved ? ` · przesunięto z ${fmtDate(r.nominal)} (dzień wolny)` : ''), served_at: served.value });
      if (!d.title || d._auto) { d.title = r.rule.label; d._auto = true; }
    }
    result.replaceChildren('Termin: ', h('b', {}, fmtDate(d.due_date)), ` · ${d.basis}`, h('br'),
      h('span', { class: 'muted' }, 'Wyliczenie pomocnicze – zweryfikuj z pismem i przepisami.'));
    syncForm();
  };
  [ruleSel, served, custom, year].forEach(e => e.addEventListener('input', recalc));
  calcBox.append(h('p', { class: 'eyebrow', style: { marginBottom: '10px' } }, 'Kalkulator terminu'),
    h('div', { class: 'form-grid' }, h('label', { class: 'field wide' }, h('span', {}, 'Czynność'), ruleSel), servedLbl, customLbl, yearLbl), result);

  const formBox = h('div');
  const syncForm = () => formBox.replaceChildren(fieldsGrid([
    ['title', 'Czego dotyczy', 'text', null, true], ['due_date', 'Termin', 'date'], ['due_time', 'Godzina (opcjonalnie)', 'time'],
    ['kind', 'Rodzaj', 'select', Object.fromEntries(Object.entries(DEADLINE_KIND).map(([k, v]) => [k, v.label]))],
    ['assignee_id', 'Odpowiada', 'select', memberOpts()], ['notes', 'Notatka', 'textarea'],
  ], d, (k) => { if (k === 'title') d._auto = false; }));
  syncForm();
  modal(matter ? `Nowy termin – ${matter.number}` : 'Nowy termin', h('div', {}, calcBox, formBox), (close) => [
    h('button', { class: 'btn btn-ghost btn-sm', onclick: close }, 'Anuluj'),
    h('button', { class: 'btn btn-primary btn-sm', onclick: async () => {
      if (!d.title || !d.due_date) return toast('Podaj czego dotyczy termin i datę', true);
      const row = { title: d.title, due_date: d.due_date, due_time: d.due_time || null, kind: d.kind || 'wewnetrzny', assignee_id: d.assignee_id || null,
        notes: d.notes || null, basis: d.basis, served_at: d.served_at, matter_id: matter?.id || null, client_id: matter?.client_id || clientId || null };
      const { error } = await sb.from('m2_deadlines').insert(row);
      if (error) return fail(error);
      toast('Dodano termin'); close(); onSaved?.();
    } }, 'Zapisz termin')]);
}

function deadlineRow(dl, matters, onChange) {
  const today = todayIso();
  const late = !dl.done && dl.due_date < today;
  const soon = !dl.done && !late && dl.due_date <= addDaysIso(3);
  const cb = h('input', { type: 'checkbox', checked: dl.done, 'aria-label': 'Wykonane' });
  cb.addEventListener('change', async () => {
    const { error } = await sb.from('m2_deadlines').update({ done: cb.checked, done_at: cb.checked ? new Date().toISOString() : null }).eq('id', dl.id);
    if (error) { cb.checked = !cb.checked; return fail(error); }
    dl.done = cb.checked; onChange?.();
  });
  const m = dl.matter_id ? matters?.get(dl.matter_id) : null;
  const k = DEADLINE_KIND[dl.kind] || DEADLINE_KIND.wewnetrzny;
  return h('div', { class: 'dl-row' + (dl.done ? ' done' : '') + (late ? ' late' : '') + (soon ? ' soon' : '') },
    cb,
    h('div', { class: 'dl-date' }, h('b', {}, fmtDate(dl.due_date)), dl.due_time ? h('span', { class: 'small muted' }, dl.due_time.slice(0, 5)) : null),
    h('span', { class: 'dot', style: { background: k.color }, 'data-tip': k.label }),
    h('div', { class: 'dl-main' }, h('div', {}, dl.title),
      h('div', { class: 'small muted' }, m ? h('a', { href: `${BASE}/sprawa/${m.id}` }, `${m.number} · ${m.title}`) : null,
        dl.basis ? h('span', { 'data-tip': dl.basis }, (m ? ' · ' : '') + dl.basis) : null)),
    h('div', { class: 'small' }, who(dl.assignee_id)),
    late ? h('span', { class: 'badge warn' }, 'po terminie') : soon ? h('span', { class: 'badge' }, 'wkrótce') : null);
}

// ================= PULPIT =================
async function viewDashboard(main) {
  const [matters, deadlines, orders] = await Promise.all([
    fetchAll(() => sb.from('m2_matters').select('id,number,title,status,lead_id,second_id,assistant_id,client_id,m2_clients(name)').order('opened_at', { ascending: false })),
    fetchAll(() => sb.from('m2_deadlines').select('*').eq('done', false).lte('due_date', addDaysIso(30)).order('due_date')),
    fetchAll(() => sb.from('m2_orders').select('id,status')),
  ]);
  const mm = new Map(matters.map(m => [m.id, m]));
  const open = matters.filter(m => OPEN_STATUSES.includes(m.status));
  const today = todayIso();
  const late = deadlines.filter(d => d.due_date < today);
  const week = deadlines.filter(d => d.due_date >= today && d.due_date <= addDaysIso(7));
  const mine = open.filter(m => [m.lead_id, m.second_id, m.assistant_id].includes(state.me.id));
  const tile = (n, lbl, href, dark) => h('a', { class: 'card tile' + (dark ? ' dark' : ''), href, style: { textDecoration: 'none', color: 'inherit' } },
    h('span', { class: 'lbl' }, lbl), h('span', { class: 'num' }, n));
  const list = h('div', { class: 'card', style: { padding: '8px 0' } });
  const renderList = () => list.replaceChildren(...(deadlines.length
    ? deadlines.map(d => deadlineRow(d, mm, () => viewDashboard(main)))
    : [h('p', { class: 'empty' }, 'Brak terminów w najbliższych 30 dniach.')]));
  renderList();
  main.replaceChildren(...header('', 'Pulpit doradcy', `Dzień dobry, ${state.me.short_name}. Terminy, sprawy i zlecenia w jednym miejscu.`,
    [h('a', { class: 'btn btn-outline btn-sm', href: `${BASE}/sprawa/nowa` }, icon('plus'), 'Nowa sprawa'),
      h('button', { class: 'btn btn-primary btn-sm', onclick: () => deadlineDialog({ onSaved: () => viewDashboard(main) }) }, icon('plus'), 'Nowy termin')]),
  h('div', { class: 'tiles' },
    tile(late.length, 'Terminy po czasie', `${BASE}/kalendarz`, late.length > 0),
    tile(week.length, 'Terminy w 7 dni', `${BASE}/kalendarz`),
    tile(open.length, 'Otwarte sprawy', `${BASE}/sprawy`),
    tile(orders.filter(o => o.status === 'projekt' || o.status === 'wyslane').length, 'Zlecenia niepodpisane', `${BASE}/zlecenia`)),
  h('div', { class: 'two' },
    h('div', {}, h('div', { class: 'table-title' }, h('h2', {}, 'Najbliższe terminy'), h('span', { class: 'muted small' }, 'zaległe i 30 dni naprzód')), list),
    h('div', {}, h('div', { class: 'table-title' }, h('h2', {}, 'Moje sprawy'), h('span', { class: 'muted small' }, `${mine.length} otwartych`)),
      h('div', { class: 'card', style: { padding: '6px 0' } }, ...(mine.length ? mine.slice(0, 12).map(m => h('a', { class: 'mini-matter', href: `${BASE}/sprawa/${m.id}` },
        h('div', {}, h('b', {}, m.number), ' ', m.title, h('div', { class: 'small muted' }, m.m2_clients?.name || '')), statusPill(m.status)))
        : [h('p', { class: 'empty' }, 'Nie prowadzisz otwartych spraw.')])))));
}

// ================= SPRAWY =================
async function viewMatters(main, params) {
  const [matters, deadlines] = await Promise.all([
    fetchAll(() => sb.from('m2_matters').select('*, m2_clients(name)').order('opened_at', { ascending: false })),
    fetchAll(() => sb.from('m2_deadlines').select('matter_id,due_date,title').eq('done', false).order('due_date')),
  ]);
  const next = new Map(); deadlines.forEach(d => { if (d.matter_id && !next.has(d.matter_id)) next.set(d.matter_id, d); });
  const f = { q: params.get('q') || '', status: 'otwarte', type: '', person: '' };
  const search = h('input', { class: 'input grow', type: 'search', placeholder: 'Szukaj: numer, tytuł, klient, sygnatura…' });
  const st = h('select', { class: 'select' }, h('option', { value: 'otwarte' }, 'Otwarte'), h('option', { value: '' }, 'Wszystkie'),
    ...Object.entries(MATTER_STATUS).map(([k, v]) => h('option', { value: k }, v.label)));
  const ty = h('select', { class: 'select' }, h('option', { value: '' }, 'Każdy rodzaj'), ...Object.entries(MATTER_TYPE).map(([k, v]) => h('option', { value: k }, v)));
  const pe = h('select', { class: 'select' }, h('option', { value: '' }, 'Wszyscy doradcy'), h('option', { value: 'me' }, 'Moje sprawy'),
    ...members().map(m => h('option', { value: m.id }, m.full_name)));
  const tbody = h('tbody');
  const render = () => {
    const q = f.q.toLowerCase();
    const rows = matters.filter(m => {
      if (f.status === 'otwarte' && !OPEN_STATUSES.includes(m.status)) return false;
      if (f.status && f.status !== 'otwarte' && m.status !== f.status) return false;
      if (f.type && m.matter_type !== f.type) return false;
      const ids = [m.lead_id, m.second_id, m.assistant_id];
      if (f.person === 'me' && !ids.includes(state.me.id)) return false;
      if (f.person && f.person !== 'me' && !ids.includes(f.person)) return false;
      if (q && ![m.number, m.title, m.m2_clients?.name, m.case_ref, m.authority].some(v => (v || '').toLowerCase().includes(q))) return false;
      return true;
    });
    const today = todayIso();
    tbody.replaceChildren(...(rows.length ? rows.map(m => {
      const n = next.get(m.id);
      return h('tr', { class: 'click', onclick: () => { location.hash = `${BASE}/sprawa/${m.id}`; } },
        h('td', {}, h('b', {}, m.number)),
        h('td', {}, h('div', { style: { fontWeight: 600 } }, m.title), h('div', { class: 'small muted' }, MATTER_TYPE[m.matter_type] || m.matter_type)),
        h('td', {}, m.m2_clients?.name || ''),
        h('td', { class: 'small' }, m.authority || '', m.case_ref ? h('div', { class: 'muted' }, m.case_ref) : null),
        h('td', {}, statusPill(m.status)),
        h('td', {}, personChips([m.lead_id, m.second_id, m.assistant_id])),
        h('td', { class: 'small' }, n ? h('span', { class: n.due_date < today ? 'err' : '' }, h('b', {}, fmtDate(n.due_date)), h('div', { class: 'muted' }, n.title)) : h('span', { class: 'muted' }, '—')));
    }) : [h('tr', {}, h('td', { colspan: 7, class: 'empty' }, matters.length ? 'Brak spraw dla wybranych filtrów.' : 'Nie ma jeszcze spraw. Dodaj pierwszą przyciskiem „Nowa sprawa”.'))]));
  };
  search.addEventListener('input', () => { f.q = search.value; render(); });
  st.addEventListener('change', () => { f.status = st.value; render(); });
  ty.addEventListener('change', () => { f.type = ty.value; render(); });
  pe.addEventListener('change', () => { f.person = pe.value; render(); });
  main.replaceChildren(...header('sprawy', 'Sprawy', 'Postępowania, kontrole, interpretacje, optymalizacje – z terminami i czasem pracy.',
    h('a', { class: 'btn btn-primary btn-sm', href: `${BASE}/sprawa/nowa` }, icon('plus'), 'Nowa sprawa')),
  h('div', { class: 'toolbar' }, search, st, ty, pe),
  h('div', { class: 'list-wrap' }, h('table', { class: 'list' },
    h('thead', {}, h('tr', {}, ...['Nr', 'Sprawa', 'Klient', 'Organ / sygnatura', 'Status', 'Zespół', 'Najbliższy termin'].map(t => h('th', {}, t)))), tbody)));
  render();
}

// Szybkie dodanie klienta (np. przy zakładaniu sprawy) – pełne dane uzupełnisz później na karcie klienta
function quickClientDialog(onCreated) {
  const c = { kind: 'firma' };
  modal('Nowy klient M2 TAX', h('div', {},
    fieldsGrid([['name', 'Nazwa / imię i nazwisko', 'text', null, true], ['kind', 'Rodzaj', 'select', { firma: 'Firma', osoba: 'Osoba fizyczna' }],
      ['nip', 'NIP', 'text'], ['address', 'Adres', 'text', null, true], ['contact_person', 'Osoba kontaktowa', 'text'],
      ['phone', 'Telefon', 'tel'], ['email', 'E-mail', 'email'],
      ['billing_type', 'Rozliczenie', 'select', BILLING_TYPE], ['hourly_rate', 'Stawka godzinowa (zł netto)', 'number']], c),
    h('p', { class: 'hint', style: { marginTop: '10px' } }, 'Pozostałe dane (AML, abonament, kontakty) uzupełnisz później na karcie klienta.')),
  (close) => [
    h('button', { class: 'btn btn-ghost btn-sm', onclick: close }, 'Anuluj'),
    h('button', { class: 'btn btn-primary btn-sm', onclick: async () => {
      if (!c.name) return toast('Podaj nazwę klienta', true);
      const { data, error } = await sb.from('m2_clients').insert({ ...c, kind: c.kind || 'firma' }).select('id,name,hourly_rate,billing_type').single();
      if (error) return fail(error);
      toast(`Dodano klienta: ${data.name}`); close(); onCreated(data);
    } }, 'Dodaj klienta')]);
}

async function viewMatter(main, id, params) {
  const isNew = id === 'nowa';
  const clients = await fetchAll(() => sb.from('m2_clients').select('id,name,hourly_rate,billing_type').eq('status', 'aktywny').order('name'));
  let m;
  if (isNew) {
    m = { client_id: params.get('klient') || '', title: '', matter_type: 'konsultacja', status: 'nowa', lead_id: state.me.id, opened_at: todayIso() };
  } else {
    const { data, error } = await sb.from('m2_matters').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) { main.replaceChildren(h('div', { class: 'card empty' }, 'Nie znaleziono sprawy.')); return; }
    m = data;
  }
  const draft = { ...m };
  const clientOpts = Object.fromEntries(clients.map(c => [c.id, c.name]));
  const defs = [
    ['title', 'Tytuł sprawy', 'text', null, true],
    ['client_id', 'Klient', 'select', clientOpts], ['matter_type', 'Rodzaj', 'select', MATTER_TYPE],
    ['status', 'Status', 'select', Object.fromEntries(Object.entries(MATTER_STATUS).map(([k, v]) => [k, v.label]))], ['stage', 'Etap (opis)', 'text'],
    ['authority', 'Organ', 'list', AUTHORITIES], ['case_ref', 'Sygnatura / znak sprawy', 'text'],
    ['tax_kind', 'Podatek', 'list', TAX_KINDS], ['tax_period', 'Okres', 'text'],
    ['value_in_dispute', 'Kwota sporu (zł)', 'number'],
    ['lead_id', 'Doradca prowadzący', 'select', memberOpts()], ['second_id', 'Drugi doradca', 'select', memberOpts()], ['assistant_id', 'Asystent(ka)', 'select', memberOpts()],
    ['poa_type', 'Pełnomocnictwo (np. PPS-1, UPL-1)', 'text'], ['poa_date', 'Data pełnomocnictwa', 'date'],
    ['opened_at', 'Data rozpoczęcia', 'date'], ['closed_at', 'Data zakończenia', 'date'],
    ['fee_type', 'Wynagrodzenie', 'select', FEE_TYPE], ['fee_amount', 'Kwota / stawka (zł netto)', 'number'], ['estimated_hours', 'Szacowany czas (h)', 'number'],
    ['description', 'Opis sprawy, stan faktyczny', 'textarea'], ['outcome', 'Rozstrzygnięcie / wynik', 'textarea'],
  ];
  const saveBtn = h('button', { class: 'btn btn-primary', onclick: save }, isNew ? 'Utwórz sprawę' : 'Zapisz zmiany');
  async function save() {
    if (!draft.title || !draft.client_id) return toast('Podaj tytuł i klienta', true);
    const row = {}; defs.forEach(([k]) => { row[k] = draft[k] ?? null; });
    if (row.status === 'zakonczona' && !row.closed_at) row.closed_at = todayIso();
    saveBtn.disabled = true;
    const q = isNew ? sb.from('m2_matters').insert(row).select('id').single() : sb.from('m2_matters').update(row).eq('id', id).select('id').single();
    const { data, error } = await q;
    saveBtn.disabled = false;
    if (error) return fail(error);
    toast(isNew ? 'Utworzono sprawę' : 'Zapisano');
    if (isNew) location.hash = `${BASE}/sprawa/${data.id}`; else Object.assign(m, row);
  }
  const gridBox = h('div');
  const buildGrid = () => gridBox.replaceChildren(fieldsGrid(defs, draft));
  buildGrid();
  const addClientBtn = h('button', { class: 'btn btn-outline btn-sm', onclick: () => quickClientDialog((c) => {
    clients.push(c); clients.sort((a, b) => a.name.localeCompare(b.name, 'pl'));
    defs[1][3] = Object.fromEntries(clients.map(x => [x.id, x.name]));
    draft.client_id = c.id; buildGrid();
  }) }, icon('plus'), 'Nowy klient');
  const formCard = h('section', { class: 'card section' }, h('div', { class: 'section-head' }, h('h2', {}, 'Dane sprawy'), addClientBtn),
    gridBox, h('div', { class: 'savebar' }, saveBtn));

  if (isNew) {
    main.replaceChildren(...header('sprawy', 'Nowa sprawa', clients.length ? 'Wybierz klienta z listy albo dodaj nowego przyciskiem „Nowy klient”.' : 'Dodaj klienta przyciskiem „Nowy klient” – zapisze się w bazie klientów M2 TAX.'), formCard);
    return;
  }

  // ---- karta istniejącej sprawy ----
  const [deadlines, journal, time, orders] = await Promise.all([
    fetchAll(() => sb.from('m2_deadlines').select('*').eq('matter_id', id).order('due_date')),
    fetchAll(() => sb.from('m2_journal').select('*').eq('matter_id', id).order('entry_date', { ascending: false }).order('created_at', { ascending: false })),
    fetchAll(() => sb.from('m2_time').select('*').eq('matter_id', id).order('work_date', { ascending: false })),
    fetchAll(() => sb.from('m2_orders').select('id,number,subject,status,order_date').eq('matter_id', id).order('order_date', { ascending: false })),
  ]);
  const client = clients.find(c => c.id === m.client_id) || (await sb.from('m2_clients').select('id,name,hourly_rate,billing_type').eq('id', m.client_id).maybeSingle()).data;
  const reload = () => viewMatter(main, id, params);

  const dlCard = h('section', { class: 'card section' }, h('div', { class: 'section-head' }, h('h2', {}, 'Terminy'),
    h('button', { class: 'btn btn-outline btn-sm', onclick: () => deadlineDialog({ matter: m, onSaved: reload }) }, '+ Termin')),
  ...(deadlines.length ? deadlines.map(d => deadlineRow(d, new Map([[m.id, null]]), reload)) : [h('p', { class: 'hint' }, 'Brak terminów. Dodaj termin – kalkulator policzy go od daty doręczenia.')]));

  // czas pracy
  const totalMin = time.reduce((n, t) => n + t.minutes, 0);
  const billMin = time.filter(t => t.billable).reduce((n, t) => n + t.minutes, 0);
  const rate = m.fee_type === 'godzinowa' && m.fee_amount ? m.fee_amount : client?.billing_type === 'godzinowa' ? client?.hourly_rate : null;
  const tNew = { work_date: todayIso(), minutes: '', description: '', member_id: state.me.id, billable: true };
  const tDate = h('input', { class: 'input', type: 'date', value: tNew.work_date });
  const tH = h('input', { class: 'input', type: 'number', step: '0.25', min: '0.25', placeholder: 'h', style: { width: '80px' } });
  const tDesc = h('input', { class: 'input grow', placeholder: 'Co zrobiono (np. analiza protokołu, pismo)' });
  const tBill = h('input', { type: 'checkbox', checked: true });
  const timeCard = h('section', { class: 'card section' },
    h('div', { class: 'section-head' }, h('h2', {}, 'Czas pracy'),
      h('span', { class: 'small' }, h('b', {}, hours(totalMin)), billMin !== totalMin ? ` (do rozliczenia ${hours(billMin)})` : '',
        rate ? ` · ${money(billMin / 60 * rate)} netto` : '', m.estimated_hours ? ` · szac. ${m.estimated_hours} h` : '')),
    h('form', { class: 'toolbar', onsubmit: async (e) => {
      e.preventDefault();
      const min = Math.round(Number(String(tH.value).replace(',', '.')) * 60);
      if (!min) return toast('Podaj liczbę godzin', true);
      const { error } = await sb.from('m2_time').insert({ matter_id: id, member_id: state.me.id, work_date: tDate.value, minutes: min, description: tDesc.value.trim() || null, billable: tBill.checked });
      if (error) return fail(error); toast('Dodano czas'); reload();
    } }, tDate, tH, tDesc, h('label', { class: 'check small' }, tBill, 'do rozliczenia'), h('button', { class: 'btn btn-outline btn-sm', type: 'submit' }, 'Dodaj')),
    ...(time.length ? [h('table', { class: 'list' }, h('tbody', {}, ...time.slice(0, 30).map(t => h('tr', {},
      h('td', { class: 'small' }, fmtDate(t.work_date)), h('td', { class: 'small' }, who(t.member_id)),
      h('td', { class: 'small' }, hours(t.minutes), t.billable ? '' : h('span', { class: 'muted' }, ' (nierozl.)')),
      h('td', { class: 'small' }, t.description || ''),
      h('td', {}, h('button', { class: 'btn btn-ghost btn-sm', onclick: async () => { if (!confirm('Usunąć wpis czasu?')) return; const { error } = await sb.from('m2_time').delete().eq('id', t.id); if (error) return fail(error); reload(); } }, '✕'))))))] : []));

  // dziennik
  const jNew = { kind: 'notatka', entry_date: todayIso(), title: '', body: '' };
  const journalCard = h('section', { class: 'card section' },
    h('div', { class: 'section-head' }, h('h2', {}, 'Dziennik sprawy'), h('span', { class: 'hint' }, 'korespondencja, czynności, notatki')),
    fieldsGrid([['kind', 'Rodzaj', 'select', JOURNAL_KIND], ['entry_date', 'Data', 'date'], ['title', 'Tytuł (np. „Wezwanie z US z 10.10”)', 'text', null, true], ['body', 'Treść / ustalenia', 'textarea']], jNew),
    h('div', { class: 'row', style: { display: 'flex', justifyContent: 'flex-end', gap: '8px', margin: '10px 0 16px' } },
      h('span', { class: 'hint', style: { alignSelf: 'center' } }, 'Przy piśmie otrzymanym od razu dodaj termin na odpowiedź.'),
      h('button', { class: 'btn btn-outline btn-sm', onclick: async () => {
        if (!jNew.title) return toast('Podaj tytuł wpisu', true);
        const { error } = await sb.from('m2_journal').insert({ matter_id: id, ...jNew, title: jNew.title });
        if (error) return fail(error);
        toast('Dodano wpis');
        if (jNew.kind === 'pismo_otrzymane' && confirm('Dodać termin liczony od doręczenia tego pisma?')) deadlineDialog({ matter: m, onSaved: reload });
        else reload();
      } }, 'Dodaj wpis')),
    h('div', { class: 'timeline' }, ...(journal.length ? journal.map(j => h('div', { class: 'tl-item' },
      h('div', { class: 'tl-date' }, fmtDate(j.entry_date)),
      h('div', {}, h('span', { class: 'badge' }, JOURNAL_KIND[j.kind] || j.kind), ' ', h('b', {}, j.title),
        j.body ? h('p', { class: 'small', style: { whiteSpace: 'pre-wrap', marginTop: '4px' } }, j.body) : null,
        h('div', { class: 'small muted' }, (state.members.find(x => x.email === j.author)?.short_name || j.author || ''))))) : [h('p', { class: 'hint' }, 'Brak wpisów.')])));

  const ordersCard = h('section', { class: 'card section' }, h('div', { class: 'section-head' }, h('h2', {}, 'Zlecenia'),
    h('a', { class: 'btn btn-outline btn-sm', href: `${BASE}/zlecenie/nowe?sprawa=${id}` }, '+ Zlecenie')),
  ...(orders.length ? orders.map(o => h('a', { class: 'mini-matter', href: `${BASE}/zlecenie/${o.id}` },
    h('div', {}, h('b', {}, o.number), ' ', o.subject, h('div', { class: 'small muted' }, fmtDate(o.order_date))), orderPill(o.status)))
    : [h('p', { class: 'hint' }, 'Brak zleceń do tej sprawy.')]));

  main.replaceChildren(...header('sprawy', `${m.number} · ${m.title}`, null,
    [statusPill(m.status)]),
  h('p', { class: 'sub', style: { marginTop: '-12px', marginBottom: '18px' } }, 'Klient: ', h('a', { href: `${BASE}/klient/${m.client_id}` }, client?.name || ''),
    ' · ', MATTER_TYPE[m.matter_type] || '', m.case_ref ? ` · ${m.case_ref}` : ''),
  h('div', { class: 'two' }, h('div', {}, formCard, journalCard), h('div', {}, dlCard, timeCard, ordersCard)));
}

// ================= KLIENCI =================
async function viewClients(main) {
  const [clients, matters] = await Promise.all([
    fetchAll(() => sb.from('m2_clients').select('*').order('name')),
    fetchAll(() => sb.from('m2_matters').select('client_id,status')),
  ]);
  const openCount = new Map(); matters.forEach(m => { if (OPEN_STATUSES.includes(m.status)) openCount.set(m.client_id, (openCount.get(m.client_id) || 0) + 1); });
  const search = h('input', { class: 'input grow', type: 'search', placeholder: 'Szukaj: nazwa, NIP, e-mail, telefon…' });
  const st = h('select', { class: 'select' }, h('option', { value: 'aktywny' }, 'Aktywni'), h('option', { value: 'archiwum' }, 'Archiwum'), h('option', { value: '' }, 'Wszyscy'));
  const tbody = h('tbody');
  const render = () => {
    const q = search.value.toLowerCase();
    const rows = clients.filter(c => (!st.value || c.status === st.value) && (!q || [c.name, c.nip, c.email, c.phone, c.contact_person].some(v => (v || '').toLowerCase().includes(q))));
    tbody.replaceChildren(...(rows.length ? rows.map(c => h('tr', { class: 'click', onclick: () => { location.hash = `${BASE}/klient/${c.id}`; } },
      h('td', {}, h('b', {}, c.name), h('div', { class: 'small muted' }, c.kind === 'osoba' ? 'osoba fizyczna' : 'firma', c.nip ? ` · NIP ${c.nip}` : '')),
      h('td', { class: 'small' }, c.contact_person || '', c.phone ? h('div', {}, c.phone) : null, c.email ? h('div', {}, c.email) : null),
      h('td', { class: 'small' }, BILLING_TYPE[c.billing_type] || '—', c.hourly_rate ? h('div', {}, money(c.hourly_rate) + ' / h') : null, c.monthly_fee ? h('div', {}, money(c.monthly_fee) + ' / mies.') : null),
      h('td', {}, c.aml_verified_at ? h('span', { class: 'badge ok', 'data-tip': `Ryzyko: ${AML_RISK[c.aml_risk] || '—'}` }, 'AML ' + fmtDate(c.aml_verified_at)) : h('span', { class: 'badge warn' }, 'brak AML')),
      h('td', { class: 'small' }, String(openCount.get(c.id) || 0))))
      : [h('tr', {}, h('td', { colspan: 5, class: 'empty' }, clients.length ? 'Brak wyników.' : 'Dodaj pierwszego klienta M2 TAX.'))]));
  };
  search.addEventListener('input', render); st.addEventListener('change', render);
  main.replaceChildren(...header('klienci', 'Klienci M2 TAX', 'Osobna baza klientów doradztwa – dane, kontakty, stawki i weryfikacja AML.',
    h('a', { class: 'btn btn-primary btn-sm', href: `${BASE}/klient/nowy` }, icon('plus'), 'Nowy klient')),
  h('div', { class: 'toolbar' }, search, st),
  h('div', { class: 'list-wrap' }, h('table', { class: 'list' },
    h('thead', {}, h('tr', {}, ...['Klient', 'Kontakt', 'Rozliczenie', 'AML', 'Otwarte sprawy'].map(t => h('th', {}, t)))), tbody)));
  render();
}

async function viewClient(main, id) {
  const isNew = id === 'nowy';
  let c = { kind: 'firma', status: 'aktywny' };
  if (!isNew) {
    const { data, error } = await sb.from('m2_clients').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) { main.replaceChildren(h('div', { class: 'card empty' }, 'Nie znaleziono klienta.')); return; }
    c = data;
  }
  const draft = { ...c };
  const sections = [
    ['Dane', [['name', 'Nazwa / imię i nazwisko', 'text', null, true], ['kind', 'Rodzaj', 'select', { firma: 'Firma', osoba: 'Osoba fizyczna' }],
      ['status', 'Status', 'select', { aktywny: 'Aktywny', archiwum: 'Archiwum' }], ['nip', 'NIP', 'text'], ['regon', 'REGON', 'text'], ['krs', 'KRS', 'text'],
      ['address', 'Adres', 'text', null, true], ['mail_address', 'Adres do korespondencji (jeśli inny)', 'text', null, true],
      ['industry', 'Branża', 'list', ['budowlana', 'medyczna', 'beauty', 'produkcyjna', 'nieruchomości', 'handel', 'usługi', 'osoba prywatna']],
      ['source', 'Skąd klient', 'list', ['polecenie', 'strona m2tax.pl', 'podatkiwroclaw.pl', 'Zoho Bookings', 'RKDP', 'KIDP']]]],
    ['Kontakt', [['contact_person', 'Osoba kontaktowa', 'text'], ['email', 'E-mail', 'email'], ['phone', 'Telefon', 'tel']]],
    ['Stawki', [['billing_type', 'Rozliczenie', 'select', BILLING_TYPE], ['hourly_rate', 'Stawka godzinowa (zł netto)', 'number'],
      ['subscription', 'Pakiet abonamentu', 'list', SUBSCRIPTIONS], ['monthly_fee', 'Abonament (zł netto / mies.)', 'number'], ['rate_notes', 'Ustalenia dot. wynagrodzenia', 'textarea']]],
    ['AML – środki bezpieczeństwa finansowego', [['aml_verified_at', 'Data identyfikacji i weryfikacji', 'date'], ['aml_risk', 'Ocena ryzyka', 'select', AML_RISK],
      ['beneficial_owner', 'Beneficjent rzeczywisty', 'text', null, true], ['aml_notes', 'Notatki AML (źródło weryfikacji, CRBR, PEP)', 'textarea']]],
    ['Notatki', [['notes', 'Notatki', 'textarea']]],
  ];
  const saveBtn = h('button', { class: 'btn btn-primary', onclick: save }, isNew ? 'Dodaj klienta' : 'Zapisz zmiany');
  async function save() {
    if (!draft.name) return toast('Podaj nazwę klienta', true);
    const row = {}; sections.forEach(([, defs]) => defs.forEach(([k]) => { row[k] = draft[k] ?? null; }));
    row.kind = row.kind || 'firma'; row.status = row.status || 'aktywny';
    saveBtn.disabled = true;
    const q = isNew ? sb.from('m2_clients').insert(row).select('id').single() : sb.from('m2_clients').update(row).eq('id', id).select('id').single();
    const { data, error } = await q; saveBtn.disabled = false;
    if (error) return fail(error);
    toast(isNew ? 'Dodano klienta' : 'Zapisano');
    if (isNew) location.hash = `${BASE}/klient/${data.id}`;
  }
  const form = h('div', {}, ...sections.map(([title, defs]) => h('section', { class: 'card section' },
    h('div', { class: 'section-head' }, h('h2', {}, title)),
    title.startsWith('AML') ? h('p', { class: 'hint', style: { marginBottom: '12px' } }, 'Doradca podatkowy jest instytucją obowiązaną – przed rozpoczęciem współpracy zidentyfikuj klienta i beneficjenta rzeczywistego oraz oceń ryzyko.') : null,
    fieldsGrid(defs, draft))), h('div', { class: 'savebar' }, saveBtn));
  if (isNew) { main.replaceChildren(...header('klienci', 'Nowy klient'), form); return; }

  const [contacts, matters, orders] = await Promise.all([
    fetchAll(() => sb.from('m2_contacts').select('*').eq('client_id', id).order('full_name')),
    fetchAll(() => sb.from('m2_matters').select('id,number,title,status').eq('client_id', id).order('opened_at', { ascending: false })),
    fetchAll(() => sb.from('m2_orders').select('id,number,subject,status,order_date').eq('client_id', id).order('order_date', { ascending: false })),
  ]);
  const reload = () => viewClient(main, id);
  const cNew = { full_name: '', role: '', email: '', phone: '' };
  const contactsCard = h('section', { class: 'card section' }, h('div', { class: 'section-head' }, h('h2', {}, 'Osoby kontaktowe')),
    ...contacts.map(p => h('div', { class: 'mini-matter' }, h('div', {}, h('b', {}, p.full_name), p.role ? ` · ${p.role}` : '',
      h('div', { class: 'small muted' }, [p.phone, p.email].filter(Boolean).join(' · '))),
    h('button', { class: 'btn btn-ghost btn-sm', onclick: async () => { if (!confirm('Usunąć osobę?')) return; const { error } = await sb.from('m2_contacts').delete().eq('id', p.id); if (error) return fail(error); reload(); } }, '✕'))),
    fieldsGrid([['full_name', 'Imię i nazwisko', 'text'], ['role', 'Funkcja', 'text'], ['phone', 'Telefon', 'tel'], ['email', 'E-mail', 'email']], cNew),
    h('div', { style: { textAlign: 'right', marginTop: '8px' } }, h('button', { class: 'btn btn-outline btn-sm', onclick: async () => {
      if (!cNew.full_name) return toast('Podaj imię i nazwisko', true);
      const { error } = await sb.from('m2_contacts').insert({ client_id: id, ...cNew }); if (error) return fail(error); reload();
    } }, '+ Dodaj osobę')));
  const mattersCard = h('section', { class: 'card section' }, h('div', { class: 'section-head' }, h('h2', {}, 'Sprawy'),
    h('a', { class: 'btn btn-outline btn-sm', href: `${BASE}/sprawa/nowa?klient=${id}` }, '+ Sprawa')),
  ...(matters.length ? matters.map(m => h('a', { class: 'mini-matter', href: `${BASE}/sprawa/${m.id}` }, h('div', {}, h('b', {}, m.number), ' ', m.title), statusPill(m.status))) : [h('p', { class: 'hint' }, 'Brak spraw.')]));
  const ordersCard = h('section', { class: 'card section' }, h('div', { class: 'section-head' }, h('h2', {}, 'Zlecenia'),
    h('a', { class: 'btn btn-outline btn-sm', href: `${BASE}/zlecenie/nowe?klient=${id}` }, '+ Zlecenie')),
  ...(orders.length ? orders.map(o => h('a', { class: 'mini-matter', href: `${BASE}/zlecenie/${o.id}` }, h('div', {}, h('b', {}, o.number), ' ', o.subject), orderPill(o.status))) : [h('p', { class: 'hint' }, 'Brak zleceń.')]));
  main.replaceChildren(...header('klienci', c.name, [c.kind === 'osoba' ? 'Osoba fizyczna' : 'Firma', c.nip ? `NIP ${c.nip}` : null].filter(Boolean).join(' · ')),
    h('div', { class: 'two' }, form, h('div', {}, mattersCard, contactsCard, ordersCard)));
}

// ================= KALENDARZ =================
async function viewCalendar(main, params) {
  const now = new Date();
  const ym = /^\d{4}-\d{2}$/.test(params.get('m') || '') ? params.get('m') : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [y, mo] = ym.split('-').map(Number);
  const first = new Date(y, mo - 1, 1), last = new Date(y, mo, 0);
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const start = new Date(first); start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  const end = new Date(last); end.setDate(last.getDate() + (6 - ((last.getDay() + 6) % 7)));
  const [deadlines, matters, settings] = await Promise.all([
    fetchAll(() => sb.from('m2_deadlines').select('*').gte('due_date', iso(start)).lte('due_date', iso(end)).order('due_date')),
    fetchAll(() => sb.from('m2_matters').select('id,number,title')),
    loadSettings(),
  ]);
  const mm = new Map(matters.map(m => [m.id, m]));
  const byDay = new Map(); deadlines.forEach(d => { if (!byDay.has(d.due_date)) byDay.set(d.due_date, []); byDay.get(d.due_date).push(d); });
  const shift = (n) => { const d = new Date(y, mo - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const today = todayIso();
  const grid = h('div', { class: 'cal' }, ...['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'].map(d => h('div', { class: 'cal-h' }, d)));
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = iso(d);
    const items = byDay.get(key) || [];
    grid.append(h('div', { class: 'cal-d' + (d.getMonth() !== mo - 1 ? ' out' : '') + (key === today ? ' today' : '') + (d.getDay() % 6 === 0 ? ' we' : ''),
      ondblclick: () => deadlineDialog({ date: key, onSaved: () => viewCalendar(main, params) }) },
    h('div', { class: 'cal-n' }, d.getDate()),
    ...items.map(it => {
      const k = DEADLINE_KIND[it.kind] || DEADLINE_KIND.wewnetrzny;
      const m = it.matter_id ? mm.get(it.matter_id) : null;
      return h(m ? 'a' : 'span', { class: 'cal-chip' + (it.done ? ' done' : ''), href: m ? `${BASE}/sprawa/${m.id}` : null,
        style: { borderLeftColor: k.color }, 'data-tip': `${k.label}: ${it.title}${m ? `\n${m.number} · ${m.title}` : ''}${it.assignee_id ? `\nOdpowiada: ${who(it.assignee_id)}` : ''}` },
      (it.due_time ? it.due_time.slice(0, 5) + ' ' : '') + it.title);
    })));
  }
  let gsrc = settings.m2_google_calendar_src || '';
  if (gsrc && !/^https?:/.test(gsrc)) gsrc = `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(gsrc)}&ctz=Europe%2FWarsaw&mode=WEEK`;
  const google = h('section', { class: 'card section', style: { marginTop: '18px' } },
    h('div', { class: 'section-head' }, h('h2', {}, 'Kalendarz Google M2 TAX'), gsrc ? h('a', { class: 'btn btn-ghost btn-sm', href: gsrc.replace('/embed', '/r'), target: '_blank', rel: 'noopener' }, 'Otwórz w Google') : null),
    gsrc ? h('iframe', { class: 'gcal', src: gsrc, title: 'Kalendarz Google M2 TAX', loading: 'lazy' })
      : h('p', { class: 'hint' }, isAdmin() ? 'Wklej link do osadzenia kalendarza (Google Kalendarz → Ustawienia kalendarza → Integracja kalendarza → „Kod do umieszczenia” lub „Identyfikator kalendarza”) w Zespół i ustawienia → M2 TAX.' : 'Administrator nie podpiął jeszcze kalendarza Google.'),
    gsrc ? h('p', { class: 'hint', style: { marginTop: '8px' } }, 'Wydarzenia prywatnego kalendarza widać, gdy jesteś zalogowany w przeglądarce na konto Google z dostępem do kalendarza M2 TAX.') : null);
  main.replaceChildren(...header('kalendarz', 'Kalendarz terminów', 'Kliknij dwukrotnie dzień, aby dodać termin.',
    [h('a', { class: 'icon-btn', href: `${BASE}/kalendarz?m=${shift(-1)}`, 'aria-label': 'Poprzedni miesiąc' }, icon('left')),
      h('span', { class: 'month' }, h('span', { class: 'label' }, MONTHS[mo - 1][0].toUpperCase() + MONTHS[mo - 1].slice(1) + ' ' + y)),
      h('a', { class: 'icon-btn', href: `${BASE}/kalendarz?m=${shift(1)}`, 'aria-label': 'Następny miesiąc' }, icon('right')),
      h('button', { class: 'btn btn-primary btn-sm', onclick: () => deadlineDialog({ onSaved: () => viewCalendar(main, params) }) }, icon('plus'), 'Termin')]),
  h('div', { class: 'legend' }, ...Object.values(DEADLINE_KIND).map(k => h('span', {}, h('span', { class: 'dot', style: { background: k.color } }), k.label))),
  h('div', { class: 'cal-wrap' }, grid), google);
}

// ================= ZLECENIA =================
async function viewOrders(main) {
  const [orders, signers] = await Promise.all([
    fetchAll(() => sb.from('m2_orders').select('*, m2_clients(name)').order('order_date', { ascending: false })),
    fetchAll(() => sb.from('m2_signers').select('*')),
  ]);
  const sg = new Map(signers.map(s => [s.id, s]));
  main.replaceChildren(...header('zlecenia', 'Zlecenia', 'Generowane automatycznie w szacie M2 TAX – do pobrania jako PDF lub Word.',
    h('a', { class: 'btn btn-primary btn-sm', href: `${BASE}/zlecenie/nowe` }, icon('plus'), 'Nowe zlecenie')),
  h('div', { class: 'list-wrap' }, h('table', { class: 'list' },
    h('thead', {}, h('tr', {}, ...['Nr', 'Data', 'Klient', 'Przedmiot', 'Wynagrodzenie', 'Podpisuje', 'Status'].map(t => h('th', {}, t)))),
    h('tbody', {}, ...(orders.length ? orders.map(o => h('tr', { class: 'click', onclick: () => { location.hash = `${BASE}/zlecenie/${o.id}`; } },
      h('td', {}, h('b', {}, o.number)), h('td', { class: 'small' }, fmtDate(o.order_date)), h('td', {}, o.m2_clients?.name || ''),
      h('td', { class: 'small' }, o.subject), h('td', { class: 'small' }, FEE_TYPE[o.fee_type] || '', o.fee_amount ? h('div', {}, money(o.fee_amount)) : null),
      h('td', { class: 'small' }, sg.get(o.signer_id)?.full_name || ''), h('td', {}, orderPill(o.status))))
      : [h('tr', {}, h('td', { colspan: 7, class: 'empty' }, 'Brak zleceń.'))])))));
}

let orderCssInjected = false;
async function viewOrder(main, id, params) {
  if (!orderCssInjected) { document.head.append(h('style', {}, ORDER_CSS)); orderCssInjected = true; }
  const isNew = id === 'nowe';
  const [clients, signers] = await Promise.all([
    fetchAll(() => sb.from('m2_clients').select('*').order('name')),
    fetchAll(() => sb.from('m2_signers').select('*').eq('active', true).order('sort')),
  ]);
  let o;
  if (isNew) {
    o = { order_date: todayIso(), status: 'projekt', payment_days: 14, signer_id: signers[0]?.id, client_id: params.get('klient') || '', matter_id: params.get('sprawa') || '' };
    if (o.matter_id) {
      const { data: m } = await sb.from('m2_matters').select('*').eq('id', o.matter_id).maybeSingle();
      if (m) Object.assign(o, { client_id: m.client_id, subject: m.title, fee_type: m.fee_type, fee_amount: m.fee_amount });
    }
    const cl = clients.find(c => c.id === o.client_id);
    if (cl && !o.fee_type) { if (cl.billing_type === 'godzinowa') Object.assign(o, { fee_type: 'godzinowa', fee_amount: cl.hourly_rate }); else if (cl.billing_type === 'abonament') Object.assign(o, { fee_type: 'abonament', fee_amount: cl.monthly_fee }); }
  } else {
    const { data, error } = await sb.from('m2_orders').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) { main.replaceChildren(h('div', { class: 'card empty' }, 'Nie znaleziono zlecenia.')); return; }
    o = data;
  }
  const matters = o.client_id ? await fetchAll(() => sb.from('m2_matters').select('id,number,title').eq('client_id', o.client_id).order('opened_at', { ascending: false })) : [];
  const draft = { ...o };
  const preview = h('div', { class: 'paper' });
  const renderPreview = () => {
    const client = clients.find(c => c.id === draft.client_id);
    const signer = signers.find(s => s.id === draft.signer_id);
    preview.innerHTML = orderHtml(orderBlocks(draft, client, signer), '/m2tax-logo.png');
  };
  const defs = [
    ['client_id', 'Klient (zleceniodawca)', 'select', Object.fromEntries(clients.map(c => [c.id, c.name]))],
    ['matter_id', 'Sprawa (opcjonalnie)', 'select', Object.fromEntries(matters.map(m => [m.id, `${m.number} · ${m.title}`]))],
    ['order_date', 'Data zlecenia', 'date'], ['status', 'Status', 'select', Object.fromEntries(Object.entries(ORDER_STATUS).map(([k, v]) => [k, v.label]))],
    ['subject', 'Przedmiot zlecenia (np. „reprezentacja w kontroli podatkowej VAT za 2024 r.”)', 'text', null, true],
    ['scope', 'Zakres – każda linia to osobny punkt', 'textarea'],
    ['fee_type', 'Wynagrodzenie', 'select', FEE_TYPE], ['fee_amount', 'Kwota (zł netto)', 'number'], ['payment_days', 'Termin płatności (dni)', 'number'],
    ['fee_notes', 'Dodatkowe zasady wynagrodzenia (np. success fee, zaliczka)', 'textarea'],
    ['term_text', 'Termin wykonania (puste = standardowa formuła)', 'textarea'],
    ['extra_terms', 'Postanowienia dodatkowe – każda linia to osobny akapit', 'textarea'],
    ['signer_id', 'Podpisuje w imieniu M2 TAX', 'select', Object.fromEntries(signers.map(s => [s.id, `${s.full_name} (nr wpisu ${s.license_no})`]))],
  ];
  const formBox = h('div');
  const buildForm = () => formBox.replaceChildren(fieldsGrid(defs, draft, async (k) => {
    if (k === 'client_id') {
      draft.matter_id = null;
      const ms = draft.client_id ? await fetchAll(() => sb.from('m2_matters').select('id,number,title').eq('client_id', draft.client_id).order('opened_at', { ascending: false })) : [];
      defs[1][3] = Object.fromEntries(ms.map(m => [m.id, `${m.number} · ${m.title}`]));
      const cl = clients.find(c => c.id === draft.client_id);
      if (cl && !draft.fee_amount) {
        if (cl.billing_type === 'godzinowa') Object.assign(draft, { fee_type: 'godzinowa', fee_amount: cl.hourly_rate });
        else if (cl.billing_type === 'abonament') Object.assign(draft, { fee_type: 'abonament', fee_amount: cl.monthly_fee });
      }
      buildForm();
    }
    renderPreview();
  }));
  async function save(silent) {
    if (!draft.client_id) { if (!silent) toast('Wybierz klienta', true); return false; }
    if (!draft.subject) { if (!silent) toast('Podaj przedmiot zlecenia', true); return false; }
    const row = {}; defs.forEach(([k]) => { row[k] = draft[k] === '' ? null : draft[k] ?? null; });
    const q = draft.id ? sb.from('m2_orders').update(row).eq('id', draft.id).select('*').single() : sb.from('m2_orders').insert(row).select('*').single();
    const { data, error } = await q;
    if (error) { fail(error); return false; }
    Object.assign(draft, data);
    if (!silent) toast('Zapisano zlecenie ' + data.number);
    renderPreview();
    if (!o.id) {
      o.id = data.id; history.replaceState(null, '', `${BASE}/zlecenie/${data.id}`);
      const h1 = main.querySelector('h1'); if (h1) h1.textContent = `Zlecenie ${data.number}`;
    }
    return true;
  }
  const pdfBtn = h('button', { class: 'btn btn-outline btn-sm', onclick: async () => {
    if (!(await save(true)) && !draft.id) return toast('Uzupełnij klienta i przedmiot', true);
    const client = clients.find(c => c.id === draft.client_id); const signer = signers.find(s => s.id === draft.signer_id);
    if (!printOrder(orderBlocks(draft, client, signer), `Zlecenie ${draft.number}`)) toast('Zezwól na wyskakujące okna, aby zapisać PDF', true);
  } }, icon('download'), 'PDF');
  const docxBtn = h('button', { class: 'btn btn-outline btn-sm', onclick: async () => {
    if (!(await save(true)) && !draft.id) return toast('Uzupełnij klienta i przedmiot', true);
    const client = clients.find(c => c.id === draft.client_id); const signer = signers.find(s => s.id === draft.signer_id);
    await downloadOrderDocx(orderBlocks(draft, client, signer), `Zlecenie_${(draft.number || 'projekt').replace(/\//g, '-')}_${(client?.name || '').replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 40)}.docx`);
  } }, icon('download'), 'Word (.docx)');
  const delBtn = draft.id ? h('button', { class: 'btn btn-danger btn-sm', onclick: async () => {
    if (!confirm('Usunąć to zlecenie?')) return;
    const { error } = await sb.from('m2_orders').delete().eq('id', draft.id); if (error) return fail(error);
    location.hash = `${BASE}/zlecenia`;
  } }, 'Usuń') : null;
  buildForm(); renderPreview();
  main.replaceChildren(...header('zlecenia', draft.number ? `Zlecenie ${draft.number}` : 'Nowe zlecenie', 'Projekt treści – przed wysłaniem przeczytaj i dostosuj do sprawy.',
    [h('button', { class: 'btn btn-primary btn-sm', onclick: () => save(false) }, 'Zapisz'), pdfBtn, docxBtn, delBtn].filter(Boolean)),
  h('div', { class: 'order-layout' }, h('section', { class: 'card section' }, formBox), h('div', { class: 'paper-wrap' }, preview)));
}

// ================= SPOTKANIA (Zoho) =================
async function viewMeetings(main) {
  const s = await loadSettings();
  const zoho = s.m2_zoho_bookings_url;
  main.replaceChildren(...header('spotkania', 'Spotkania', 'Rezerwacje klientów przez Zoho Bookings.',
    zoho ? h('a', { class: 'btn btn-outline btn-sm', href: zoho, target: '_blank', rel: 'noopener' }, 'Otwórz Zoho Bookings') : null),
  zoho ? h('section', { class: 'card section' }, h('iframe', { class: 'zoho', src: zoho, title: 'Zoho Bookings M2 TAX', loading: 'lazy' }),
    h('p', { class: 'hint', style: { marginTop: '8px' } }, 'Tu możesz umówić spotkanie w imieniu klienta (np. przez telefon). Zarezerwowane spotkania zobaczysz w kalendarzu Google M2 TAX w zakładce Kalendarz.'))
    : h('div', { class: 'card empty' }, 'Brak adresu Zoho Bookings – ustaw go w Zespół i ustawienia.'));
}

// ================= ROUTER =================
export async function renderM2(main, parts, params) {
  main.replaceChildren(h('div', { class: 'spinner' }, 'Wczytywanie…'));
  const sub = parts[1] || '';
  if (sub === 'sprawy') return viewMatters(main, params);
  if (sub === 'sprawa') return viewMatter(main, parts[2], params);
  if (sub === 'klienci') return viewClients(main);
  if (sub === 'klient') return viewClient(main, parts[2]);
  if (sub === 'kalendarz') return viewCalendar(main, params);
  if (sub === 'zlecenia') return viewOrders(main);
  if (sub === 'zlecenie') return viewOrder(main, parts[2], params);
  if (sub === 'spotkania') return viewMeetings(main);
  return viewDashboard(main);
}
