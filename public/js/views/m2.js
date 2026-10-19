// Moduł Doradztwo podatkowe (M2 TAX)
import { todayWidget as obTodayWidget, teamTodayCard, canSeeTeam } from './obecnosc.js';
import { h, toast, fail, icon, initials, MONTHS, printHtml } from '../ui.js';
import { sb, state, memberById, isAdmin } from '../store.js';
import {
  MATTER_TYPE, MATTER_STATUS, OPEN_STATUSES, AUTHORITIES, TAX_KINDS, FEE_TYPE, BILLING_TYPE, SUBSCRIPTIONS, AML_RISK,
  DEADLINE_KIND, JOURNAL_KIND, ORDER_STATUS, DEADLINE_RULES, computeDeadline, limitationDate, fmtDate, todayIso, addDaysIso, money, hours,
} from '../m2/dict.js';
import { docBlocks, orderHtml, ORDER_CSS, printOrder, downloadOrderDocx, CONTRACT_DEFAULTS, defaultClientParty, contractSubject, matterTemplate, att1AutoRows, att2AutoRows, att4Mode, poaDefaultScope } from '../m2/order.js';
import { fetchAll } from './rozliczenia.js';
import { pps1Defaults, pps1Scope, printPps1, BOX4_LABELS } from '../m2/pps1.js';
import { poaBlocks, printableHtml, buildOrderDocx } from '../m2/order.js';
import { nipLookupBar, mergeNipData, vatLine } from '../nip.js';
import { printMatterReport } from '../m2/report.js';
import { renderZgloszenia, clientTicketsBox } from './zgloszenia.js';
import { modal as uiModal } from '../ui.js';
import { renderOferty } from './oferty.js';

const BASE = '#/doradztwo';
const members = () => state.members.filter(m => m.active && (m.modules || []).includes('doradztwo'));
const who = id => memberById(id)?.short_name || '';
const memberOpts = () => Object.fromEntries(members().map(m => [m.id, m.full_name]));

// ---------- wspólne elementy ----------
function header(active, title, sub, actions) {
  return [
    h('div', { class: 'page-head', style: { marginTop: '28px' } },
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

// ---------- Kalendarz Google: terminy z aplikacji trafiają do kalendarza M2 TAX ----------
export function gcalSync(ids) {
  if (!ids?.length) return;
  sb.functions.invoke('gcal', { body: { action: 'sync', ids } }).then(({ data }) => {
    if (data?.errors?.length) toast('Kalendarz Google: ' + data.errors[0], true);
  }).catch(() => { /* kalendarz niepodłączony – bez komunikatu */ });
}
export function gcalDelete(ids) {
  if (!ids?.length) return Promise.resolve();
  return sb.functions.invoke('gcal', { body: { action: 'delete', ids } }).catch(() => {});
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
      const { data: ins, error } = await sb.from('m2_deadlines').insert(row).select('id').single();
      if (error) return fail(error);
      gcalSync([ins.id]);
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
    dl.done = cb.checked; gcalSync([dl.id]); onChange?.();
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

const DOC = { zlecenie: 'Zlecenie', umowa: 'Umowa' };
const docLabel = o => `${DOC[o.doc_type] || 'Zlecenie'} ${o.number || ''}`.trim();

// Każda sprawa musi należeć do zlecenia albo umowy
async function newMatterDialog({ clientId = null } = {}) {
  const orders = await fetchAll(() => sb.from('m2_orders').select('id,number,subject,doc_type,client_id,status,m2_clients(name)').neq('status', 'anulowane').order('order_date', { ascending: false }));
  const list = clientId ? orders.filter(o => o.client_id === clientId) : orders;
  const sel = h('select', { class: 'select', style: { width: '100%' } }, ...list.map(o => h('option', { value: o.id }, `${docLabel(o)} · ${o.m2_clients?.name || ''} · ${o.subject}`)));
  const q = clientId ? `&klient=${clientId}` : '';
  modal('Nowa sprawa', h('div', {},
    h('p', { class: 'hint', style: { marginBottom: '12px' } }, 'Każda sprawa należy do zlecenia albo umowy. Wybierz istniejące albo utwórz nowe – sprawa założy się wtedy automatycznie.'),
    list.length ? h('label', { class: 'field wide' }, h('span', {}, 'Zlecenie / umowa'), sel) : h('p', { class: 'empty', style: { padding: '10px 0' } }, 'Brak zleceń i umów' + (clientId ? ' tego klienta.' : '.'))),
  (close) => [
    h('a', { class: 'btn btn-ghost btn-sm', href: `${BASE}/zlecenie/nowe?typ=zlecenie${q}`, onclick: close }, '+ Nowe zlecenie'),
    h('a', { class: 'btn btn-ghost btn-sm', href: `${BASE}/zlecenie/nowe?typ=umowa${q}`, onclick: close }, '+ Nowa umowa'),
    list.length ? h('button', { class: 'btn btn-primary btn-sm', onclick: () => { close(); location.hash = `${BASE}/sprawa/nowa?zlecenie=${sel.value}`; } }, 'Dodaj sprawę do wybranego') : null,
  ].filter(Boolean));
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
    [h('button', { class: 'btn btn-outline btn-sm', onclick: () => newMatterDialog() }, icon('plus'), 'Nowa sprawa'),
      h('button', { class: 'btn btn-primary btn-sm', onclick: () => deadlineDialog({ onSaved: () => viewDashboard(main) }) }, icon('plus'), 'Nowy termin')]),
  h('div', { class: 'tiles' },
    tile(late.length, 'Terminy po czasie', `${BASE}/kalendarz`, late.length > 0),
    tile(week.length, 'Terminy w 7 dni', `${BASE}/kalendarz`),
    tile(open.length, 'Otwarte sprawy', `${BASE}/sprawy`),
    tile(orders.filter(o => o.status === 'projekt' || o.status === 'wyslane').length, 'Zlecenia i umowy niepodpisane', `${BASE}/zlecenia`)),
  h('div', { class: 'two' },
    h('div', {}, h('div', { class: 'table-title' }, h('h2', {}, 'Najbliższe terminy'), h('span', { class: 'muted small' }, 'zaległe i 30 dni naprzód')), list),
    h('div', {}, obTodayWidget(), canSeeTeam() ? teamTodayCard() : null, h('div', { class: 'table-title' }, h('h2', {}, 'Moje sprawy'), h('span', { class: 'muted small' }, `${mine.length} otwartych`)),
      h('div', { class: 'card', style: { padding: '6px 0' } }, ...(mine.length ? mine.slice(0, 12).map(m => h('a', { class: 'mini-matter', href: `${BASE}/sprawa/${m.id}` },
        h('div', {}, h('b', {}, m.number), ' ', m.title, h('div', { class: 'small muted' }, m.m2_clients?.name || '')), statusPill(m.status)))
        : [h('p', { class: 'empty' }, 'Nie prowadzisz otwartych spraw.')])))));
}

// ================= SPRAWY =================
async function viewMatters(main, params) {
  const [matters, deadlines] = await Promise.all([
    fetchAll(() => sb.from('m2_matters').select('*, m2_clients(name), m2_orders(number,doc_type)').order('opened_at', { ascending: false })),
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
      if (q && ![m.number, m.title, m.m2_clients?.name, m.case_ref, m.authority, m.m2_orders?.number].some(v => (v || '').toLowerCase().includes(q))) return false;
      return true;
    });
    const today = todayIso();
    tbody.replaceChildren(...(rows.length ? rows.map(m => {
      const n = next.get(m.id);
      return h('tr', { class: 'click', onclick: () => { location.hash = `${BASE}/sprawa/${m.id}`; } },
        h('td', {}, h('b', {}, m.number)),
        h('td', {}, h('div', { style: { fontWeight: 600 } }, m.title), h('div', { class: 'small muted' }, MATTER_TYPE[m.matter_type] || m.matter_type, m.m2_orders ? ` · ${docLabel(m.m2_orders)}` : '')),
        h('td', {}, m.m2_clients?.name || ''),
        h('td', { class: 'small' }, m.authority || '', m.case_ref ? h('div', { class: 'muted' }, m.case_ref) : null),
        h('td', {}, statusPill(m.status)),
        h('td', {}, personChips([m.lead_id, m.second_id, m.assistant_id])),
        h('td', { class: 'small' }, n ? h('span', { class: n.due_date < today ? 'err' : '' }, h('b', {}, fmtDate(n.due_date)), h('div', { class: 'muted' }, n.title)) : h('span', { class: 'muted' }, '—')));
    }) : [h('tr', {}, h('td', { colspan: 7, class: 'empty' }, matters.length ? 'Brak spraw dla wybranych filtrów.' : 'Nie ma jeszcze spraw. Sprawa zakłada się automatycznie przy nowym zleceniu lub umowie.'))]));
  };
  let st1; search.addEventListener('input', () => { clearTimeout(st1); st1 = setTimeout(() => { f.q = search.value; render(); }, 180); });
  st.addEventListener('change', () => { f.status = st.value; render(); });
  ty.addEventListener('change', () => { f.type = ty.value; render(); });
  pe.addEventListener('change', () => { f.person = pe.value; render(); });
  main.replaceChildren(...header('sprawy', 'Sprawy', 'Postępowania, kontrole, interpretacje, optymalizacje – z terminami i czasem pracy.',
    h('button', { class: 'btn btn-primary btn-sm', onclick: () => newMatterDialog() }, icon('plus'), 'Nowa sprawa')),
  h('div', { class: 'toolbar' }, search, st, ty, pe),
  h('div', { class: 'list-wrap' }, h('table', { class: 'list' },
    h('thead', {}, h('tr', {}, ...['Nr', 'Sprawa', 'Klient', 'Organ / sygnatura', 'Status', 'Zespół', 'Najbliższy termin'].map(t => h('th', {}, t)))), tbody)));
  render();
}

// Szybkie dodanie klienta (np. przy zakładaniu sprawy) – pełne dane uzupełnisz później na karcie klienta
function quickClientDialog(onCreated) {
  const c = { kind: 'firma' };
  const grid = h('div');
  const build = () => grid.replaceChildren(fieldsGrid([['name', 'Nazwa / imię i nazwisko', 'text', null, true], ['kind', 'Rodzaj', 'select', { firma: 'Firma', osoba: 'Osoba fizyczna' }],
      ['nip', 'NIP', 'text'], ['address', 'Adres', 'text', null, true], ['contact_person', 'Osoba kontaktowa', 'text'],
      ['phone', 'Telefon', 'tel'], ['email', 'E-mail', 'email'],
      ['billing_type', 'Rozliczenie', 'select', BILLING_TYPE], ['hourly_rate', 'Stawka godzinowa (zł netto)', 'number']], c));
  build();
  modal('Nowy klient M2 TAX', h('div', {},
    nipLookupBar('', (r) => { mergeNipData(c, r); c.aml_notes = vatLine(r); build(); }), grid,
    h('p', { class: 'hint', style: { marginTop: '10px' } }, 'Pozostałe dane (AML, abonament, kontakty) uzupełnisz później na karcie klienta.')),
  (close) => [
    h('button', { class: 'btn btn-ghost btn-sm', onclick: close }, 'Anuluj'),
    h('button', { class: 'btn btn-primary btn-sm', onclick: async () => {
      if (!c.name) return toast('Podaj nazwę klienta', true);
      const { data, error } = await sb.from('m2_clients').insert({ ...c, kind: c.kind || 'firma' }).select('*').single();
      if (error) return fail(error);
      toast(`Dodano klienta: ${data.name}`); close(); onCreated(data);
    } }, 'Dodaj klienta')]);
}

async function viewMatter(main, id, params) {
  const isNew = id === 'nowa';
  const orders = await fetchAll(() => sb.from('m2_orders').select('id,number,subject,doc_type,client_id,fee_type,fee_amount,m2_clients(name)').order('order_date', { ascending: false }));
  let m;
  if (isNew) {
    const ord = orders.find(o => o.id === params.get('zlecenie'));
    if (!ord) {
      main.replaceChildren(...header('sprawy', 'Nowa sprawa', 'Każda sprawa należy do zlecenia albo umowy.'),
        h('div', { class: 'card empty' }, h('button', { class: 'btn btn-primary btn-sm', onclick: () => newMatterDialog({ clientId: params.get('klient') }) }, 'Wybierz zlecenie lub umowę')));
      newMatterDialog({ clientId: params.get('klient') });
      return;
    }
    m = { order_id: ord.id, client_id: ord.client_id, title: '', matter_type: 'konsultacja', status: 'nowa', lead_id: state.me.id, opened_at: todayIso(), fee_type: ord.fee_type, fee_amount: ord.fee_amount };
  } else {
    const { data, error } = await sb.from('m2_matters').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) { main.replaceChildren(h('div', { class: 'card empty' }, 'Nie znaleziono sprawy.')); return; }
    m = data;
  }
  const draft = { ...m };
  const orderOpts = Object.fromEntries(orders.map(o => [o.id, `${docLabel(o)} · ${o.m2_clients?.name || ''} · ${o.subject}`]));
  const defs = [
    ['title', 'Tytuł sprawy', 'text', null, true],
    ['order_id', 'Zlecenie / umowa (klient sprawy = klient zlecenia)', 'select', orderOpts, true], ['matter_type', 'Rodzaj', 'select', MATTER_TYPE],
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
    if (!draft.title || !draft.order_id) return toast('Podaj tytuł i wybierz zlecenie lub umowę', true);
    const row = {}; defs.forEach(([k]) => { row[k] = draft[k] ?? null; });
    if (row.status === 'zakonczona' && !row.closed_at) row.closed_at = todayIso();
    saveBtn.disabled = true;
    const q = isNew ? sb.from('m2_matters').insert(row).select('id').single() : sb.from('m2_matters').update(row).eq('id', id).select('id').single();
    const { data, error } = await q;
    saveBtn.disabled = false;
    if (error) return fail(error);
    toast(isNew ? 'Utworzono sprawę' : 'Zapisano');
    if (isNew) location.hash = `${BASE}/sprawa/${data.id}`;
    else if (row.order_id !== m.order_id) viewMatter(main, id, params);
    else Object.assign(m, row);
  }
  const gridBox = h('div');
  const buildGrid = () => gridBox.replaceChildren(fieldsGrid(defs, draft));
  buildGrid();
  const formCard = h('section', { class: 'card section' }, h('div', { class: 'section-head' }, h('h2', {}, 'Dane sprawy')),
    gridBox, h('div', { class: 'savebar' }, saveBtn));
  const ord = orders.find(o => o.id === m.order_id);

  if (isNew) {
    main.replaceChildren(...header('sprawy', 'Nowa sprawa', `${docLabel(ord)} · klient: ${ord.m2_clients?.name || ''}`), formCard);
    return;
  }

  // ---- karta istniejącej sprawy ----
  const [deadlines, journal, time, siblings] = await Promise.all([
    fetchAll(() => sb.from('m2_deadlines').select('*').eq('matter_id', id).order('due_date')),
    fetchAll(() => sb.from('m2_journal').select('*').eq('matter_id', id).order('entry_date', { ascending: false }).order('created_at', { ascending: false })),
    fetchAll(() => sb.from('m2_time').select('*').eq('matter_id', id).order('work_date', { ascending: false })),
    fetchAll(() => sb.from('m2_matters').select('id,number,title,status').eq('order_id', m.order_id).order('opened_at')),
  ]);
  const client = (await sb.from('m2_clients').select('id,name,hourly_rate,billing_type').eq('id', m.client_id).maybeSingle()).data;
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

  const others = siblings.filter(x => x.id !== m.id);
  const ordersCard = h('section', { class: 'card section' }, h('div', { class: 'section-head' }, h('h2', {}, ord?.doc_type === 'umowa' ? 'Umowa' : 'Zlecenie'),
    h('a', { class: 'btn btn-outline btn-sm', href: `${BASE}/sprawa/nowa?zlecenie=${m.order_id}` }, '+ Sprawa w tym zleceniu')),
  ord ? h('a', { class: 'mini-matter', href: `${BASE}/zlecenie/${ord.id}` }, h('div', {}, h('b', {}, docLabel(ord)), ' ', ord.subject)) : null,
  others.length ? h('p', { class: 'small muted', style: { margin: '10px 0 4px' } }, 'Inne sprawy w tym zleceniu:') : null,
  ...others.map(x => h('a', { class: 'mini-matter', href: `${BASE}/sprawa/${x.id}` }, h('div', {}, h('b', {}, x.number), ' ', x.title), statusPill(x.status))));

  const delMatter = isAdmin() ? h('button', { class: 'btn btn-danger btn-sm', onclick: async () => {
    if (!confirm(`Usunąć sprawę ${m.number} razem z terminami, dziennikiem i czasem pracy? Tego nie da się cofnąć.`)) return;
    await gcalDelete(deadlines.map(d => d.id));
    const { error } = await sb.from('m2_matters').delete().eq('id', id); if (error) return fail(error);
    toast('Usunięto sprawę'); location.hash = `${BASE}/sprawy`;
  } }, 'Usuń sprawę') : null;

  const poaBtn = h('button', { class: 'btn btn-outline btn-sm', onclick: async () => {
    const { data: cl } = await sb.from('m2_clients').select('*').eq('id', m.client_id).maybeSingle();
    const { data: od } = await sb.from('m2_orders').select('params').eq('id', m.order_id).maybeSingle();
    pelnomocnictwoDialog({ client: cl, kind: ['wsa', 'nsa'].includes(m.matter_type) ? 'procesowe' : 'pps1', params: { ...(od?.params || {}), matter_type: m.matter_type, authority: m.authority || od?.params?.authority, tax: m.tax_kind || od?.params?.tax, period: m.tax_period || od?.params?.period, ref_no: m.case_ref || od?.params?.ref_no } });
  } }, 'Pełnomocnictwo');
  const reportBtn = h('button', { class: 'btn btn-outline btn-sm', onclick: () => {
    const o = { kind: 'pelny', from: '', to: '', billableOnly: false };
    const box = h('div');
    const draw = () => {
      const radio = (k, label, hint) => {
        const el = h('input', { type: 'radio', name: 'rk', checked: o.kind === k });
        el.addEventListener('change', () => { o.kind = k; draw(); });
        return h('label', { class: 'check', style: { alignItems: 'flex-start', marginBottom: '8px' } }, el, h('span', {}, h('b', {}, label), h('div', { class: 'hint' }, hint)));
      };
      const dt = (key, label) => { const el = h('input', { class: 'input', type: 'date', value: o[key] }); el.addEventListener('change', () => { o[key] = el.value; }); return h('label', { class: 'field' }, h('span', {}, label), el); };
      const bo = h('input', { type: 'checkbox', checked: o.billableOnly }); bo.addEventListener('change', () => { o.billableOnly = bo.checked; });
      box.replaceChildren(
        radio('pelny', 'Raport sprawy – pełne podsumowanie', 'Dane sprawy, opis, terminy, dziennik i czas pracy z sumami.'),
        radio('godziny', 'Zestawienie godzin', `Sam czas pracy z sumą${rate ? ' i wartością wg stawki' : ''} – np. do rozliczenia z klientem.`),
        radio('dziennik', 'Dziennik sprawy', 'Same wpisy dziennika: korespondencja, czynności, notatki.'),
        h('div', { class: 'form-grid', style: { marginTop: '6px' } }, dt('from', 'Od (opcjonalnie)'), dt('to', 'Do (opcjonalnie)')),
        o.kind === 'godziny' ? h('label', { class: 'check', style: { marginTop: '10px' } }, bo, 'tylko czas do rozliczenia') : null,
        h('p', { class: 'hint', style: { marginTop: '8px' } }, o.kind === 'pelny' ? 'Okres zawęża dziennik i czas pracy; terminy są pokazane wszystkie.' : 'Puste daty = cały okres sprawy.'));
    };
    draw();
    modal('Raport PDF', box, close => [
      h('button', { class: 'btn btn-ghost btn-sm', onclick: close }, 'Anuluj'),
      h('button', { class: 'btn btn-primary btn-sm', onclick: () => {
        if (!printMatterReport(o.kind, { m, client, ord, deadlines, journal, time, rate, from: o.from, to: o.to, billableOnly: o.billableOnly })) return toast('Zezwól na wyskakujące okna, aby zapisać PDF', true);
        close();
      } }, icon('download'), 'PDF'),
    ]);
  } }, icon('download'), 'Raport PDF');
  main.replaceChildren(...header('sprawy', `${m.number} · ${m.title}`, null,
    [statusPill(m.status), reportBtn, poaBtn, delMatter].filter(Boolean)),
  h('p', { class: 'sub', style: { marginTop: '-12px', marginBottom: '18px' } }, 'Klient: ', h('a', { href: `${BASE}/klient/${m.client_id}` }, client?.name || ''),
    ' · ', MATTER_TYPE[m.matter_type] || '', m.case_ref ? ` · ${m.case_ref}` : ''),
  h('div', { class: 'two' }, h('div', {}, formCard, journalCard), h('div', {}, dlCard, clientTicketsBox(client || { id: m.client_id }, { module: 'm2', matter: m }), timeCard, ordersCard)));
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
  let st2; search.addEventListener('input', () => { clearTimeout(st2); st2 = setTimeout(render, 180); }); st.addEventListener('change', render);
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
  const sectionsBox = h('div');
  const buildSections = () => sectionsBox.replaceChildren(...sections.map(([title, defs]) => h('section', { class: 'card section' },
    h('div', { class: 'section-head' }, h('h2', {}, title)),
    title.startsWith('AML') ? h('p', { class: 'hint', style: { marginBottom: '12px' } }, 'Doradca podatkowy jest instytucją obowiązaną – przed rozpoczęciem współpracy zidentyfikuj klienta i beneficjenta rzeczywistego oraz oceń ryzyko.') : null,
    fieldsGrid(defs, draft))));
  buildSections();
  const nipBar = nipLookupBar(draft.nip, (r) => {
    mergeNipData(draft, r);
    if (draft.kind !== 'osoba') draft.kind = 'firma';
    const line = vatLine(r) + (r.representatives?.length ? ` · reprezentacja: ${r.representatives.join(', ')}` : '');
    draft.aml_notes = [draft.aml_notes, line].filter(Boolean).join('\n');
    buildSections();
  });
  const form = h('div', {}, nipBar, sectionsBox, h('div', { class: 'savebar' }, saveBtn));
  if (isNew) { main.replaceChildren(...header('klienci', 'Nowy klient'), form); return; }

  const [contacts, matters, orders] = await Promise.all([
    fetchAll(() => sb.from('m2_contacts').select('*').eq('client_id', id).order('full_name')),
    fetchAll(() => sb.from('m2_matters').select('id,number,title,status').eq('client_id', id).order('opened_at', { ascending: false })),
    fetchAll(() => sb.from('m2_orders').select('id,number,subject,status,order_date,doc_type').eq('client_id', id).order('order_date', { ascending: false })),
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
    h('button', { class: 'btn btn-outline btn-sm', onclick: () => newMatterDialog({ clientId: id }) }, '+ Sprawa')),
  ...(matters.length ? matters.map(m => h('a', { class: 'mini-matter', href: `${BASE}/sprawa/${m.id}` }, h('div', {}, h('b', {}, m.number), ' ', m.title), statusPill(m.status))) : [h('p', { class: 'hint' }, 'Brak spraw.')]));
  const ordersCard = h('section', { class: 'card section' }, h('div', { class: 'section-head' }, h('h2', {}, 'Zlecenia i umowy'),
    h('div', { style: { display: 'flex', gap: '6px' } },
      h('a', { class: 'btn btn-outline btn-sm', href: `${BASE}/zlecenie/nowe?typ=zlecenie&klient=${id}` }, '+ Zlecenie'),
      h('a', { class: 'btn btn-outline btn-sm', href: `${BASE}/zlecenie/nowe?typ=umowa&klient=${id}` }, '+ Umowa'))),
  ...(orders.length ? orders.map(o => h('a', { class: 'mini-matter', href: `${BASE}/zlecenie/${o.id}` }, h('div', {}, h('b', {}, docLabel(o)), ' ', o.subject), orderPill(o.status))) : [h('p', { class: 'hint' }, 'Brak zleceń i umów.')]));
  main.replaceChildren(...header('klienci', c.name, [c.kind === 'osoba' ? 'Osoba fizyczna' : 'Firma', c.nip ? `NIP ${c.nip}` : null].filter(Boolean).join(' · ')),
    h('div', { class: 'two' }, form, h('div', {}, mattersCard, clientTicketsBox(c, { module: 'm2' }), contactsCard, ordersCard)));
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
  // wydarzenia z Kalendarza Google M2 TAX (spotkania, Zoho itd.) – bez terminów, które aplikacja sama tam wysłała
  const gByDay = new Map();
  let gInfo = null;
  try {
    const { data: gl, error: ge } = await sb.functions.invoke('gcal', { body: { action: 'list', from: iso(start), to: iso(end) } });
    if (ge) throw ge;
    if (gl?.configured === false) gInfo = { off: true, reason: gl.reason };
    else if (gl?.error) gInfo = { error: gl.error };
    else (gl?.events || []).forEach(e => {
      const s0 = new Date(e.allDay ? e.start + 'T00:00:00' : e.start), e0 = new Date(e.allDay ? e.end + 'T00:00:00' : e.end);
      if (e.allDay) e0.setDate(e0.getDate() - 1);
      for (let d = new Date(s0.getFullYear(), s0.getMonth(), s0.getDate()); d <= e0; d.setDate(d.getDate() + 1)) {
        const k = iso(d); if (!gByDay.has(k)) gByDay.set(k, []); gByDay.get(k).push(e);
        if (!e.allDay) break;
      }
    });
  } catch (e) { gInfo = { error: e.message || String(e) }; }
  const gTime = e => e.allDay ? '' : new Date(e.start).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) + ' ';
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
    }),
    ...(gByDay.get(key) || []).map(e => h('a', { class: 'cal-chip g', href: e.link || null, target: '_blank', rel: 'noopener',
      'data-tip': `Kalendarz Google: ${gTime(e)}${e.title}${e.location ? `\n${e.location}` : ''}` }, gTime(e) + e.title))));
  }
  let gsrc = settings.m2_google_calendar_src || '';
  const gid = /^https?:/.test(gsrc) ? (new URL(gsrc).searchParams.get('src') || '') : gsrc;
  const gOpen = gid ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(gid)}` : null;
  const zoho = settings.m2_zoho_bookings_url || '';

  // ---- agenda: najbliższe 14 dni (terminy z aplikacji + Kalendarz Google) ----
  const agTo = addDaysIso(13);
  const [agDl, agG] = await Promise.all([
    fetchAll(() => sb.from('m2_deadlines').select('*').gte('due_date', today).lte('due_date', agTo).order('due_date')),
    gInfo ? Promise.resolve([]) : sb.functions.invoke('gcal', { body: { action: 'list', from: today, to: agTo } }).then(r => r.data?.events || [], () => []),
  ]);
  const lateDl = await fetchAll(() => sb.from('m2_deadlines').select('*').eq('done', false).lt('due_date', today).order('due_date'));
  const agenda = new Map();
  const put = (day, item) => { if (!agenda.has(day)) agenda.set(day, []); agenda.get(day).push(item); };
  agDl.forEach(d => put(d.due_date, { t: d.due_time ? d.due_time.slice(0, 5) : '', dl: d }));
  agG.forEach(e => { const day = e.allDay ? e.start : iso(new Date(e.start)); if (day >= today && day <= agTo) put(day, { t: e.allDay ? '' : gTime(e).trim(), g: e }); });
  const dayName = k => { const d = new Date(k + 'T00:00:00'); const n = Math.round((d - new Date(today + 'T00:00:00')) / 86400000);
    return (n === 0 ? 'Dziś' : n === 1 ? 'Jutro' : d.toLocaleDateString('pl-PL', { weekday: 'long' })) + ', ' + d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' }); };
  const agItem = it => {
    if (it.g) return h('a', { class: 'ag-item g', href: it.g.link || null, target: '_blank', rel: 'noopener' },
      h('span', { class: 'ag-time' }, it.t || 'cały dzień'), h('span', { class: 'ag-dot', style: { background: '#4285F4' } }),
      h('span', { class: 'ag-main' }, h('b', {}, it.g.title), h('span', { class: 'small muted' }, ['Kalendarz Google', it.g.location].filter(Boolean).join(' · '))),
      it.g.meet ? h('span', { class: 'badge' }, 'Meet') : null);
    const d = it.dl, k = DEADLINE_KIND[d.kind] || DEADLINE_KIND.wewnetrzny, m = d.matter_id ? mmAll.get(d.matter_id) : null;
    return h(m ? 'a' : 'div', { class: 'ag-item' + (d.done ? ' done' : ''), href: m ? `${BASE}/sprawa/${m.id}` : null },
      h('span', { class: 'ag-time' }, it.t || '—'), h('span', { class: 'ag-dot', style: { background: k.color } }),
      h('span', { class: 'ag-main' }, h('b', {}, d.title), h('span', { class: 'small muted' }, [k.label, m ? `${m.number} · ${m.title}` : null, d.assignee_id ? who(d.assignee_id) : null].filter(Boolean).join(' · '))),
      d.done ? h('span', { class: 'badge ok' }, 'wykonany') : null);
  };
  const mmAll = new Map(matters.map(m => [m.id, m]));
  const agendaCard = h('section', { class: 'card section' },
    h('div', { class: 'section-head' }, h('h2', {}, 'Najbliższe 14 dni'), h('span', { class: 'small muted' }, 'terminy i spotkania')),
    lateDl.length ? h('div', { class: 'ag-day late' }, h('div', { class: 'ag-date' }, `Zaległe terminy (${lateDl.length})`),
      ...lateDl.slice(0, 8).map(d => agItem({ t: fmtDate(d.due_date).slice(0, 5), dl: d }))) : null,
    ...([...agenda.keys()].sort().map(k => h('div', { class: 'ag-day' + (k === today ? ' today' : '') }, h('div', { class: 'ag-date' }, dayName(k)),
      ...agenda.get(k).sort((a, b) => (a.t || '00:00').localeCompare(b.t || '00:00')).map(agItem)))),
    !agenda.size && !lateDl.length ? h('p', { class: 'hint' }, 'Brak terminów i spotkań w najbliższych dwóch tygodniach.') : null);

  // ---- spotkania (Zoho Bookings) ----
  const bookDialog = () => uiModal('Umów spotkanie – Zoho Bookings', h('div', {},
    h('iframe', { class: 'zoho', src: zoho, title: 'Zoho Bookings M2 TAX', loading: 'lazy' }),
    h('p', { class: 'hint', style: { marginTop: '8px' } }, 'Rezerwacja trafi do kalendarza doradcy w Google (gdy Zoho jest połączone z Kalendarzem Google) i pokaże się tutaj na niebiesko.')),
  close => [h('a', { class: 'btn btn-ghost btn-sm', href: zoho, target: '_blank', rel: 'noopener' }, 'Otwórz w nowej karcie'), h('button', { class: 'btn btn-primary btn-sm', onclick: close }, 'Zamknij')], { wide: true });
  const meetCard = h('section', { class: 'card section meet-card' },
    h('div', { class: 'section-head' }, h('h2', {}, 'Spotkania z klientami')),
    h('p', { class: 'small', style: { marginBottom: '12px' } }, 'Klienci umawiają się sami przez Zoho Bookings (link na stronie m2tax.pl). Spotkanie umówione telefonicznie wpisz tutaj w imieniu klienta.'),
    zoho ? h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
      h('button', { class: 'btn btn-primary btn-sm', onclick: bookDialog }, icon('plus'), 'Umów spotkanie'),
      h('button', { class: 'btn btn-outline btn-sm', onclick: () => { navigator.clipboard?.writeText(zoho).then(() => toast('Skopiowano link do rezerwacji')); } }, 'Kopiuj link dla klienta'))
      : h('p', { class: 'hint' }, 'Brak adresu Zoho Bookings – ustaw go w Zespół i ustawienia.'),
    h('div', { class: 'meet-sep' }),
    h('p', { class: 'small', style: { marginBottom: '8px' } }, h('b', {}, 'Kalendarz Google M2 TAX')),
    gInfo ? h('p', { class: 'hint' }, gInfo.off ? `Niepodłączony: ${gInfo.reason || ''} ${isAdmin() ? 'Instrukcja: Zespół i ustawienia → Kalendarz Google.' : ''}` : `Nie udało się pobrać wydarzeń: ${gInfo.error}`)
      : h('p', { class: 'hint' }, 'Połączony – spotkania i wydarzenia z Google widać na niebiesko, a terminy z aplikacji trafiają do Google automatycznie.'),
    gOpen ? h('a', { class: 'btn btn-ghost btn-sm', href: gOpen, target: '_blank', rel: 'noopener', style: { marginTop: '6px', paddingLeft: 0 } }, 'Otwórz Kalendarz Google →') : null);

  main.replaceChildren(...header('kalendarz', 'Kalendarz i spotkania', 'Terminy spraw, spotkania z klientami i Kalendarz Google w jednym miejscu. Kliknij dwukrotnie dzień, aby dodać termin.',
    [h('a', { class: 'icon-btn', href: `${BASE}/kalendarz?m=${shift(-1)}`, 'aria-label': 'Poprzedni miesiąc' }, icon('left')),
      h('span', { class: 'month' }, h('span', { class: 'label' }, MONTHS[mo - 1][0].toUpperCase() + MONTHS[mo - 1].slice(1) + ' ' + y)),
      h('a', { class: 'icon-btn', href: `${BASE}/kalendarz?m=${shift(1)}`, 'aria-label': 'Następny miesiąc' }, icon('right')),
      zoho ? h('button', { class: 'btn btn-outline btn-sm', onclick: bookDialog }, 'Umów spotkanie') : null,
      h('button', { class: 'btn btn-primary btn-sm', onclick: () => deadlineDialog({ onSaved: () => viewCalendar(main, params) }) }, icon('plus'), 'Termin')].filter(Boolean)),
  h('div', { class: 'legend' }, ...Object.values(DEADLINE_KIND).map(k => h('span', {}, h('span', { class: 'dot', style: { background: k.color } }), k.label)),
    gInfo ? null : h('span', {}, h('span', { class: 'dot', style: { background: '#4285F4' } }), 'Kalendarz Google (spotkania, Zoho)')),
  h('div', { class: 'cal-layout' }, h('div', { class: 'cal-wrap' }, grid), h('div', { class: 'cal-side' }, meetCard)),
  agendaCard);
}

// ================= ZLECENIA I UMOWY =================
async function viewOrders(main, params) {
  const [orders, signers, matters] = await Promise.all([
    fetchAll(() => sb.from('m2_orders').select('*, m2_clients(name)').order('order_date', { ascending: false })),
    fetchAll(() => sb.from('m2_signers').select('*')),
    fetchAll(() => sb.from('m2_matters').select('order_id')),
  ]);
  const sg = new Map(signers.map(s => [s.id, s]));
  const cnt = new Map(); matters.forEach(m => cnt.set(m.order_id, (cnt.get(m.order_id) || 0) + 1));
  const f = { q: '', type: params.get('typ') || '', status: '' };
  const search = h('input', { class: 'input grow', type: 'search', placeholder: 'Szukaj: numer, klient, przedmiot…' });
  const ty = h('select', { class: 'select' }, h('option', { value: '' }, 'Zlecenia i umowy'), h('option', { value: 'zlecenie' }, 'Tylko zlecenia'), h('option', { value: 'umowa' }, 'Tylko umowy'));
  ty.value = f.type;
  const st = h('select', { class: 'select' }, h('option', { value: '' }, 'Każdy status'), ...Object.entries(ORDER_STATUS).map(([k, v]) => h('option', { value: k }, v.label)));
  const tbody = h('tbody');
  const signerNames = o => (o.doc_type === 'umowa' ? (o.signer_ids || []) : [o.signer_id]).map(i => sg.get(i)?.full_name).filter(Boolean).join(', ');
  const render = () => {
    const q = f.q.toLowerCase();
    const rows = orders.filter(o => (!f.type || (o.doc_type || 'zlecenie') === f.type) && (!f.status || o.status === f.status)
      && (!q || [o.number, o.subject, o.m2_clients?.name].some(v => (v || '').toLowerCase().includes(q))));
    tbody.replaceChildren(...(rows.length ? rows.map(o => h('tr', { class: 'click', onclick: () => { location.hash = `${BASE}/zlecenie/${o.id}`; } },
      h('td', {}, h('b', {}, o.number)), h('td', {}, h('span', { class: 'badge' + (o.doc_type === 'umowa' ? ' ok' : '') }, DOC[o.doc_type] || 'Zlecenie')),
      h('td', { class: 'small' }, fmtDate(o.order_date)), h('td', {}, o.m2_clients?.name || ''),
      h('td', { class: 'small' }, o.subject), h('td', { class: 'small' }, String(cnt.get(o.id) || 0)),
      h('td', { class: 'small' }, FEE_TYPE[o.fee_type] || '', o.fee_amount ? h('div', {}, money(o.fee_amount)) : null),
      h('td', { class: 'small' }, signerNames(o)), h('td', {}, orderPill(o.status)),
      isAdmin() ? h('td', {}, h('button', { class: 'btn btn-ghost btn-sm', 'aria-label': 'Usuń', 'data-tip': 'Usuń (tylko administrator)', onclick: async (e) => {
        e.stopPropagation();
        const n = cnt.get(o.id) || 0;
        if (!confirm(`Usunąć ${docLabel(o).toLowerCase()}${n ? ` razem z ${n} ${n === 1 ? 'sprawą' : 'sprawami'} (terminy, dziennik, czas pracy)` : ''}? Tego nie da się cofnąć.`)) return;
        const { error } = await sb.from('m2_orders').delete().eq('id', o.id); if (error) return fail(error);
        toast('Usunięto'); viewOrders(main, params);
      } }, '✕')) : null))
      : [h('tr', {}, h('td', { colspan: isAdmin() ? 10 : 9, class: 'empty' }, orders.length ? 'Brak wyników.' : 'Brak zleceń i umów. Utwórz pierwsze przyciskiem powyżej.'))]));
  };
  let t1; search.addEventListener('input', () => { clearTimeout(t1); t1 = setTimeout(() => { f.q = search.value; render(); }, 180); });
  ty.addEventListener('change', () => { f.type = ty.value; render(); });
  st.addEventListener('change', () => { f.status = st.value; render(); });
  main.replaceChildren(...header('zlecenia', 'Zlecenia i umowy',
    'Zlecenie – krótkie, na jedną stronę, do mniejszych tematów. Umowa – pełny wzór M2 TAX. Oba na papierze firmowym, do pobrania jako PDF lub Word.',
    [h('a', { class: 'btn btn-outline btn-sm', href: `${BASE}/zlecenie/nowe?typ=zlecenie` }, icon('plus'), 'Nowe zlecenie'),
      h('a', { class: 'btn btn-primary btn-sm', href: `${BASE}/zlecenie/nowe?typ=umowa` }, icon('plus'), 'Nowa umowa'),
      h('a', { class: 'btn btn-outline btn-sm', href: `${BASE}/oferty` }, 'Oferty'),
      h('button', { class: 'btn btn-outline btn-sm', onclick: () => pelnomocnictwoDialog({ kind: 'pps1' }) }, 'Pełnomocnictwo PPS-1'),
      h('button', { class: 'btn btn-outline btn-sm', onclick: () => pelnomocnictwoDialog({ kind: 'procesowe' }) }, 'Pełnomocnictwo procesowe')]),
  h('div', { class: 'toolbar' }, search, ty, st),
  h('div', { class: 'list-wrap' }, h('table', { class: 'list' },
    h('thead', {}, h('tr', {}, ...['Nr', 'Rodzaj', 'Data', 'Klient', 'Przedmiot', 'Sprawy', 'Wynagrodzenie', 'Podpisuje', 'Status', isAdmin() ? '' : null].filter(x => x !== null).map(t => h('th', {}, t)))), tbody)));
  render();
}

const VARIANTS = { A: 'Wariant A – ryczałt', B: 'Wariant B – stawka godzinowa', AB: 'A albo B – klient wybiera (drugi skreśla)', C: 'Wariant C – abonament miesięczny' };

// Edytowalna tabela załącznika: wiersze automatyczne, a po pierwszej zmianie – własne (zapisywane w params[key])
function rowsEditor(P, key, autoFn, onChange) {
  const box = h('div', { class: 'rows-ed' });
  const custom = () => Array.isArray(P[key]) && P[key].length > 0;
  const render = () => {
    const rows = custom() ? P[key] : autoFn();
    const tbody = h('tbody');
    const collect = () => [...tbody.querySelectorAll('tr')].map(tr => [...tr.querySelectorAll('input')].map(i => i.value));
    rows.forEach((r, i) => {
      const a = h('input', { class: 'input', value: r[0] ?? '', 'aria-label': 'Pole' });
      const b = h('input', { class: 'input', value: r[1] ?? '', 'aria-label': 'Treść' });
      [a, b].forEach(el => el.addEventListener('input', () => { const was = custom(); P[key] = collect(); if (!was) status.replaceChildren(...statusEls()); onChange(); }));
      tbody.append(h('tr', {}, h('td', {}, a), h('td', {}, b), h('td', {}, h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Usuń wiersz', onclick: () => {
        const cur = collect(); cur.splice(i, 1); P[key] = cur.length ? cur : [['', '']]; render(); onChange();
      } }, '✕'))));
    });
    const statusEls = () => custom()
      ? [h('span', { class: 'hint' }, 'Tabela zmieniona ręcznie – zmiany w polach powyżej już do niej nie trafiają.'),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { delete P[key]; render(); onChange(); } }, 'Przywróć automatyczną')]
      : [h('span', { class: 'hint' }, 'Wypełnia się automatycznie z pól powyżej. Możesz zmienić dowolną komórkę.')];
    const status = h('span', { style: { display: 'contents' } }, ...statusEls());
    box.replaceChildren(h('table', {}, tbody), h('div', { class: 'bar' },
      h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: () => { P[key] = [...collect(), ['', '']]; render(); onChange(); box.querySelector('tr:last-child input')?.focus(); } }, '+ Wiersz'),
      status));
  };
  render();
  box.refresh = () => { if (!custom()) render(); };
  return box;
}

// ---- Pełnomocnictwo: PPS-1 (urzędowy formularz) albo szczególne / procesowe na papierze firmowym M2 TAX ----
// Można je wygenerować ze sprawy, z umowy/zlecenia albo samodzielnie (zakładka Zlecenia) – wtedy wybierasz klienta.
async function pelnomocnictwoDialog({ client = null, params = {}, defaultSignerId = null, kind = 'pps1' } = {}) {
  const [signers, clients] = await Promise.all([
    fetchAll(() => sb.from('m2_signers').select('*').eq('active', true).order('sort')),
    client ? Promise.resolve([client]) : fetchAll(() => sb.from('m2_clients').select('*').eq('status', 'aktywny').order('name')),
  ]);
  const mine = signers.find(x => x.full_name === state.me.full_name);
  const first = signers.find(x => x.id === defaultSignerId) || mine || signers[0];
  let cl = client;
  let d = {};
  const reset = () => {
    const keep = { kind: d.kind || kind, who: d.who || first?.id || '', whoMany: d.whoMany || [first?.id].filter(Boolean), date: d.date };
    d = { ...pps1Defaults({ client: cl || {}, params, signer: first, scope: pps1Scope(params) }), ...keep };
    if (!d.date) d.date = todayIso();
  };
  reset();

  const box = h('div');
  const clientBox = client ? null : (() => {
    const sel = h('select', { class: 'select', style: { flex: '1' } });
    const fill = () => { sel.replaceChildren(h('option', { value: '' }, '— wybierz klienta —'), ...clients.map(c => h('option', { value: c.id }, c.name + (c.nip ? ` (NIP ${c.nip})` : '')))); sel.value = cl?.id || ''; };
    fill();
    sel.addEventListener('change', () => { cl = clients.find(c => c.id === sel.value) || null; reset(); build(); });
    const add = h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: () => quickClientDialog((c) => {
      clients.push(c); clients.sort((a, b) => a.name.localeCompare(b.name, 'pl')); cl = c; fill(); reset(); build();
    }) }, icon('plus'), 'Nowy klient');
    return h('label', { class: 'field wide', style: { marginBottom: '12px' } }, h('span', {}, 'Mocodawca (klient)'), h('div', { style: { display: 'flex', gap: '8px' } }, sel, add));
  })();

  const KINDS = { pps1: 'PPS-1 – urzędowy formularz (organy podatkowe)', szczegolne: 'Szczególne – na papierze firmowym M2 TAX', procesowe: 'Procesowe – na papierze firmowym M2 TAX (WSA, NSA)' };
  function build() {
    const pps = d.kind === 'pps1';
    if (!pps && d.scope === pps1Scope(params)) d.scope = '';
    if (pps && !d.scope) d.scope = pps1Scope(params);
    const sg = signers.find(x => x.id === d.who);
    const warn = pps && sg && (!sg.nip || !sg.ae_address)
      ? h('p', { class: 'err small', style: { margin: '0 0 10px' } }, `Brak NIP lub adresu do doręczeń elektronicznych dla: ${sg.full_name}. Uzupełnij w Zespół i ustawienia → Podpisujący.`) : null;
    const whoBox = pps
      ? fieldsGrid([['who', 'Pełnomocnik (na PPS-1 – jedna osoba)', 'select', Object.fromEntries(signers.map(x => [x.id, `${x.full_name} (nr ${x.license_no || '—'})`]))]], d, () => build())
      : h('div', { class: 'field wide', style: { margin: '0 0 12px' } }, h('span', {}, 'Kogo upoważniamy (każdy działa samodzielnie)'),
        h('div', { style: { display: 'flex', gap: '18px', flexWrap: 'wrap' } }, ...signers.map(x => {
          const cb = h('input', { type: 'checkbox', checked: d.whoMany.includes(x.id) });
          cb.addEventListener('change', () => { const set = new Set(d.whoMany); cb.checked ? set.add(x.id) : set.delete(x.id); d.whoMany = signers.map(y => y.id).filter(i => set.has(i)); });
          return h('label', { class: 'check' }, cb, `${x.full_name} (nr ${x.license_no || '—'})`);
        })));
    const deliveryCb = h('input', { type: 'checkbox', checked: d.delivery === true });
    deliveryCb.addEventListener('change', () => { d.delivery = deliveryCb.checked; });
    box.replaceChildren(
      clientBox || h('p', { class: 'small', style: { margin: '0 0 12px' } }, 'Mocodawca: ', h('b', {}, cl?.name || '—')),
      fieldsGrid([['kind', 'Rodzaj pełnomocnictwa', 'select', KINDS, true]], d, () => build()),
      whoBox,
      fieldsGrid([
        ['date', 'Data', 'date'],
        ['organ', d.kind === 'procesowe' ? 'Sąd (np. Wojewódzki Sąd Administracyjny we Wrocławiu)' : 'Organ, do którego składane jest pełnomocnictwo', 'list',
          d.kind === 'procesowe' ? ['Wojewódzki Sąd Administracyjny we Wrocławiu', 'Naczelny Sąd Administracyjny'] : AUTHORITIES, true],
        ['scope', pps ? 'Poz. 71 – wskazanie sprawy i zakresu' : 'Zakres – „do reprezentowania Mocodawcy …” (puste = z danych sprawy)', 'textarea'],
        ['reps', d.client_kind === 'osoba' ? 'Mocodawca (imię i nazwisko)' : 'Reprezentanci mocodawcy (max 3) – każda osoba w osobnej linii: „Jan Kowalski – prezes zarządu”', 'textarea'],
      ], d),
      warn || '',
      pps ? h('div', {},
        h('p', { class: 'eyebrow', style: { margin: '14px 0 8px' } }, 'Dane do formularza PPS-1'),
        h('div', { class: 'field wide', style: { marginBottom: '12px' } }, h('span', {}, 'Poz. 4 – podmiot składający pełnomocnictwo (zaznacz właściwe kwadraty)'),
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px 18px' } }, ...Object.entries(BOX4_LABELS).map(([n, l]) => {
            const cb = h('input', { type: 'checkbox', checked: (d.box4 || []).includes(Number(n)) });
            cb.addEventListener('change', () => { const set = new Set(d.box4 || []); cb.checked ? set.add(Number(n)) : set.delete(Number(n)); d.box4 = [...set].sort(); });
            return h('label', { class: 'check small' }, cb, `${n}. ${l}`);
          }))),
        h('label', { class: 'check', style: { margin: '0 0 12px' } }, deliveryCb, 'Poz. 35 – pełnomocnik do doręczeń'),
        fieldsGrid([
          ['client_kind', 'Poz. 5 – rodzaj podmiotu', 'select', { firma: 'Podmiot niebędący osobą fizyczną', osoba: 'Osoba fizyczna' }],
          ['client_nip', 'Poz. 1 – NIP mocodawcy', 'text'], ['client_name', 'Poz. 6 – nazwa pełna / nazwisko, imię', 'text', null, true],
          ['c_country', '13. Kraj', 'text'], ['c_voiv', '14. Województwo', 'text'], ['c_county', '15. Powiat', 'text'], ['c_commune', '16. Gmina', 'text'],
          ['c_street', '17. Ulica', 'text'], ['c_house', '18. Nr domu', 'text'], ['c_flat', '19. Nr lokalu', 'text'],
          ['c_city', '20. Miejscowość', 'text'], ['c_zip', '21. Kod pocztowy', 'text'],
          ['client_phone', '22. Telefon (nieobowiązkowe)', 'text'], ['client_email', '23. E-mail (nieobowiązkowe)', 'text'], ['client_ae', '24. Adres elektroniczny mocodawcy (nieobowiązkowe)', 'text'],
          ['further', 'E.2 – dalsze pełnomocnictwo', 'select', { tak: 'tak', nie: 'nie' }],
          ['fee', '80. Opłata skarbowa', 'select', { dolaczono: 'dołączono dowód zapłaty', w3dni: 'dowód zostanie dołączony w ciągu 3 dni', brak: 'nie zaznaczaj' }],
        ], d, (k) => { if (k === 'client_kind') build(); }))
        : '');
  }
  build();

  const fileBase = () => `Pelnomocnictwo_${{ pps1: 'PPS-1_', szczegolne: 'szczegolne_', procesowe: 'procesowe_' }[d.kind]}${(cl?.name || '').replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 40)}`;
  const firmDoc = () => {
    const chosen = signers.filter(x => d.whoMany.includes(x.id));
    const scope = (d.scope || '').trim();
    const o = { order_date: d.date, params: { ...params, authority: d.organ, client_reps: d.reps,
      poa_type: d.kind === 'procesowe' ? 'procesowe (art. 35 p.p.s.a.)' : 'szczególne',
      poa_scope: scope && scope !== pps1Scope(params) ? scope.replace(/^(do\s+)?reprezentowania\s+Mocodawcy\s*/i, '') : null } };
    return poaBlocks(o, cl, chosen, { standalone: true });
  };
  const ready = () => {
    if (!cl) { toast('Wybierz albo dodaj klienta (mocodawcę)', true); return false; }
    if (d.kind !== 'pps1' && !d.whoMany.length) { toast('Zaznacz, kogo upoważniamy', true); return false; }
    return true;
  };
  modal('Pełnomocnictwo', box, (close) => [
    h('button', { class: 'btn btn-ghost btn-sm', onclick: close }, 'Zamknij'),
    h('button', { class: 'btn btn-outline btn-sm', onclick: async () => {
      if (!ready()) return;
      if (d.kind === 'pps1') return toast('Formularz PPS-1 pobierasz jako PDF', true);
      const bytes = await buildOrderDocx(firmDoc());
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
      a.download = fileBase() + '.docx'; document.body.append(a); a.click(); a.remove();
    } }, icon('download'), 'Word'),
    h('button', { class: 'btn btn-primary btn-sm', onclick: () => {
      if (!ready()) return;
      if (d.kind === 'pps1') { if (!printPps1(d, signers.find(x => x.id === d.who))) toast('Zezwól na wyskakujące okna, aby zapisać PDF', true); return; }
      printHtml(printableHtml(firmDoc(), fileBase(), location.origin + '/m2tax-logo.png'));
    } }, icon('download'), 'PDF'),
  ]);
}

let orderCssInjected = false;
async function viewOrder(main, id, params) {
  if (!orderCssInjected) { document.head.append(h('style', {}, ORDER_CSS)); orderCssInjected = true; }
  const isNew = id === 'nowe';
  const [clients, signers] = await Promise.all([
    fetchAll(() => sb.from('m2_clients').select('*').order('name')),
    fetchAll(() => sb.from('m2_signers').select('*').eq('active', true).order('sort')),
  ]);
  const mySigner = signers.find(x => x.full_name === state.me.full_name) || signers[0];
  let o;
  if (isNew) {
    const type = params.get('typ') === 'umowa' ? 'umowa' : 'zlecenie';
    o = { doc_type: type, order_date: todayIso(), status: 'projekt', payment_days: 14, signer_id: mySigner?.id,
      signer_ids: signers.map(x => x.id), client_id: params.get('klient') || '', params: type === 'umowa' ? { ...CONTRACT_DEFAULTS } : {} };
    const cl = clients.find(c => c.id === o.client_id);
    if (cl && type === 'zlecenie') {
      if (cl.billing_type === 'godzinowa') Object.assign(o, { fee_type: 'godzinowa', fee_amount: cl.hourly_rate });
      else if (cl.billing_type === 'abonament') Object.assign(o, { fee_type: 'abonament', fee_amount: cl.monthly_fee });
    }
    if (cl && type === 'umowa') Object.assign(o.params, { client_party: defaultClientParty(cl), contact_person: cl.contact_person, client_email: cl.email, client_phone: cl.phone, ...(cl.hourly_rate ? { hourly_rate: cl.hourly_rate } : {}) });
  } else {
    const { data, error } = await sb.from('m2_orders').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) { main.replaceChildren(h('div', { class: 'card empty' }, 'Nie znaleziono zlecenia ani umowy.')); return; }
    o = data;
  }
  const draft = { ...o, params: { ...(o.params || {}) } };
  const P = draft.params;
  let matterType = 'konsultacja';
  let subjectTouched = !!o.subject;
  const isUmowa = () => draft.doc_type === 'umowa';
  let refreshEditors = () => {};
  // podpisujący: osoba przygotowująca dokument jako pierwsza (jak we wzorze umowy)
  const chosenSigners = () => (isUmowa() ? signers.filter(x => (draft.signer_ids || []).includes(x.id)) : signers.filter(x => x.id === draft.signer_id))
    .sort((a, b) => (b.full_name === state.me.full_name) - (a.full_name === state.me.full_name));
  const client = () => clients.find(c => c.id === draft.client_id);

  // ---- podgląd ----
  const preview = h('div', { class: 'paper' });
  const renderPreview = () => { preview.innerHTML = orderHtml(docBlocks(draft, client(), chosenSigners()), '/m2tax-logo.png'); };

  // ---- przedmiot umowy z danych kontroli ----
  const autoSubject = () => {
    if (!isUmowa() || subjectTouched) return;
    draft.subject = contractSubject(P);
  };

  // ---- klient ----
  const clientSel = h('select', { class: 'select' });
  const fillClients = () => {
    clientSel.replaceChildren(h('option', { value: '' }, '— wybierz klienta —'), ...clients.map(c => h('option', { value: c.id }, c.name + (c.nip ? ` (NIP ${c.nip})` : ''))));
    clientSel.value = draft.client_id || '';
  };
  fillClients();
  const applyClient = (prevId) => {
    const cl = client(), prev = clients.find(c => c.id === prevId);
    if (isUmowa() && cl) {
      if (!P.client_party || P.client_party === defaultClientParty(prev)) P.client_party = defaultClientParty(cl);
      for (const [k, ck] of [['contact_person', 'contact_person'], ['client_email', 'email'], ['client_phone', 'phone']]) if (!P[k] || P[k] === prev?.[ck]) P[k] = cl[ck] || null;
    }
    if (!isUmowa() && cl && !draft.fee_amount) {
      if (cl.billing_type === 'godzinowa') Object.assign(draft, { fee_type: 'godzinowa', fee_amount: cl.hourly_rate });
      else if (cl.billing_type === 'abonament') Object.assign(draft, { fee_type: 'abonament', fee_amount: cl.monthly_fee });
    }
    buildForm(); renderPreview();
  };
  clientSel.addEventListener('change', () => { const prev = draft.client_id; draft.client_id = clientSel.value || null; applyClient(prev); });
  const newClientBtn = h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: () => quickClientDialog((c) => {
    clients.push(c); clients.sort((a, b) => a.name.localeCompare(b.name, 'pl'));
    const prev = draft.client_id; draft.client_id = c.id; fillClients(); applyClient(prev);
  }) }, icon('plus'), 'Nowy klient');
  const clientBox = h('div', { class: 'field wide' }, h('span', {}, isUmowa() ? 'Zleceniodawca (klient)' : 'Klient (zleceniodawca)'),
    h('div', { style: { display: 'flex', gap: '8px' } }, clientSel, newClientBtn));
  clientSel.style.flex = '1';

  // ---- formularze ----
  const statusOpts = Object.fromEntries(Object.entries(ORDER_STATUS).map(([k, v]) => [k, v.label]));
  const signerOpts = Object.fromEntries(signers.map(x => [x.id, `${x.full_name} (nr wpisu ${x.license_no})`]));
  const formBox = h('div');
  const onAny = () => renderPreview();
  const sub = (title, ...els) => [h('p', { class: 'eyebrow', style: { margin: '18px 0 10px' } }, title), ...els];

  function buildForm() {
    clientBox.querySelector('span').textContent = isUmowa() ? 'Zleceniodawca (klient)' : 'Klient (zleceniodawca)';
    if (!isUmowa()) {
      const defs = [
        ['order_date', 'Data', 'date'], ['status', 'Status', 'select', statusOpts],
        ['subject', 'Przedmiot (np. „opinia w sprawie stawki VAT na usługi budowlane”)', 'text', null, true],
        ['scope', 'Zakres – każda linia to osobny punkt (opcjonalnie)', 'textarea'],
        ['term_text', 'Termin wykonania (opcjonalnie, np. „do 30 listopada 2026 r.”)', 'text', null, true],
        ['fee_type', 'Wynagrodzenie', 'select', FEE_TYPE], ['fee_amount', 'Kwota (zł netto)', 'number'], ['payment_days', 'Termin płatności (dni)', 'number'],
        ['fee_notes', 'Dodatkowe zasady wynagrodzenia (opcjonalnie)', 'textarea'],
        ['extra_terms', 'Dodatkowe postanowienia (opcjonalnie)', 'textarea'],
        ['signer_id', 'Podpisuje w imieniu M2 TAX', 'select', signerOpts],
      ];
      const extra = isNew && !draft.id ? fieldsGrid([['matter_type', 'Rodzaj sprawy (założy się automatycznie)', 'select', MATTER_TYPE]], { get matter_type() { return matterType; }, set matter_type(v) { matterType = v || 'konsultacja'; } }) : null;
      formBox.replaceChildren(h('div', { class: 'form-grid' }, clientBox), fieldsGrid(defs, draft, onAny), extra || '');
      return;
    }
    autoSubject();
    const signerBoxes = h('div', { class: 'field wide' }, h('span', {}, 'Podpisują w imieniu M2 TAX'),
      h('div', { style: { display: 'flex', gap: '18px', flexWrap: 'wrap' } }, ...signers.map(x => {
        const cb = h('input', { type: 'checkbox', checked: (draft.signer_ids || []).includes(x.id) });
        cb.addEventListener('change', () => {
          const set = new Set(draft.signer_ids || []); cb.checked ? set.add(x.id) : set.delete(x.id);
          draft.signer_ids = signers.map(y => y.id).filter(i => set.has(i)); refreshEditors(); renderPreview();
        });
        return h('label', { class: 'check' }, cb, `${x.full_name} (nr ${x.license_no})`);
      })));
    const subjEl = fieldsGrid([['subject', 'Przedmiot (na liście i jako tytuł sprawy)', 'text', null, true]], draft, () => { subjectTouched = true; renderPreview(); });
    const onParam = (k) => {
      if (['matter_type', 'tax', 'period'].includes(k)) { autoSubject(); subjEl.querySelector('input').value = draft.subject || ''; }
      if (k === 'matter_type') {
        if (P.matter_type === 'abonament' && P.variant !== 'C') P.variant = 'C';
        else if (P.matter_type !== 'abonament' && P.variant === 'C') P.variant = 'A';
        buildForm();
      }
      refreshEditors(); renderPreview();
    };
    const tpl = matterTemplate(P.matter_type);
    const ed1 = rowsEditor(P, 'att1', () => att1AutoRows(draft, client(), chosenSigners()), renderPreview);
    const ed2 = rowsEditor(P, 'att2', () => att2AutoRows(draft), renderPreview);
    refreshEditors = () => { ed1.refresh(); ed2.refresh(); };
    const att4Sel = h('select', { class: 'select' }, ...Object.entries({ firmowe: 'Pełnomocnictwo na papierze firmowym M2 TAX (do podpisu klienta)', urzedowy: 'Urzędowy formularz (np. PPS-1) – dołączany odrębnie', brak: 'Bez załącznika nr 4' }).map(([k, v]) => h('option', { value: k }, v)));
    att4Sel.value = att4Mode(P);
    const poaScope = h('textarea', { class: 'input', rows: 3, placeholder: poaDefaultScope(P) }, P.poa_scope || '');
    poaScope.addEventListener('input', () => { P.poa_scope = poaScope.value.trim() || null; renderPreview(); });
    const poaBox = h('label', { class: 'field wide', hidden: att4Sel.value !== 'firmowe' }, h('span', {}, 'Zakres pełnomocnictwa – „do reprezentowania Mocodawcy …” (puste = jak w podpowiedzi, z danych sprawy)'), poaScope);
    att4Sel.addEventListener('change', () => { P.att4 = att4Sel.value; poaBox.hidden = att4Sel.value !== 'firmowe'; renderPreview(); });
    const attSection = [
      h('p', { class: 'small', style: { fontWeight: 600, margin: '4px 0 6px' } }, 'Załącznik nr 1 – Zakres Sprawy'), ed1,
      h('p', { class: 'small', style: { fontWeight: 600, margin: '16px 0 6px' } }, 'Załącznik nr 2 – Stawki za czynności dodatkowe'), ed2,
      h('div', { class: 'form-grid', style: { marginTop: '16px' } }, h('label', { class: 'field wide' }, h('span', {}, 'Załącznik nr 4 – pełnomocnictwo'), att4Sel), poaBox)];
    formBox.replaceChildren(
      h('div', { class: 'form-grid' }, clientBox),
      fieldsGrid([['order_date', 'Data zawarcia', 'date'], ['status', 'Status', 'select', statusOpts]], draft, onAny),
      ...sub('Strony umowy',
        fieldsGrid([
          ['client_party', 'Opis Zleceniodawcy w komparycji (uzupełnia się z karty klienta – popraw w razie potrzeby)', 'textarea'],
          ['client_reps', 'Reprezentanci Zleceniodawcy – każda osoba w osobnej linii, np. „Jan Kowalski – prezes zarządu”', 'textarea'],
        ], P, onParam), signerBoxes),
      ...sub('Sprawa – Załącznik nr 1',
        fieldsGrid([['matter_type', 'Rodzaj sprawy (od niego zależy zakres, czas trwania i pełnomocnictwo)', 'select', MATTER_TYPE, true]], P, onParam),
        (() => {
          const g = fieldsGrid([
            ['description', 'Opis sprawy (opcjonalnie – trafi do Załącznika nr 1)', 'textarea'],
            ['authority', 'Organ / sąd', 'list', AUTHORITIES], ['ref_no', 'Sygnatura / znak pisma / nr upoważnienia', 'text'],
            ['served_date', 'Data doręczenia pisma (od którego biegnie termin)', 'date'],
            ['tax', 'Podatek', 'list', ['podatek od towarów i usług (VAT)', 'podatek dochodowy od osób prawnych (CIT)', 'podatek dochodowy od osób fizycznych (PIT)', 'podatek od czynności cywilnoprawnych (PCC)', 'podatek od nieruchomości']],
            ['period', 'Okres (np. 01/2023–12/2023 albo 2024 r.)', 'text'],
            ['poa_type', `Rodzaj pełnomocnictwa (puste = ${tpl.poa})`, 'text', null, true],
            ['scope', 'Zakres czynności – każda linia to punkt § 2 ust. 2 (puste = standardowy zakres dla rodzaju sprawy, widoczny w podglądzie)', 'textarea'],
            ['end_text', `Czas trwania umowy (puste = „${tpl.end}”)`, 'text', null, true],
            ['contact_person', 'Osoba do kontaktu u Zleceniodawcy', 'text'], ['client_email', 'E-mail Zleceniodawcy', 'email'], ['client_phone', 'Telefon Zleceniodawcy', 'tel'],
            ['accounting_office', 'Biuro rachunkowe Zleceniodawcy (nazwa, osoba, kontakt)', 'text', null, true],
          ], P, onParam);
          const ta = [...g.querySelectorAll('label')].find(l => l.textContent.startsWith('Zakres czynności'))?.querySelector('textarea');
          if (ta) { ta.placeholder = tpl.scope.map(x => '• ' + x).join('\n'); ta.rows = 6; }
          return g;
        })(), subjEl),
      ...sub('Wynagrodzenie – § 6 i Załącznik nr 2',
        fieldsGrid([
          ['variant', 'Wariant', 'select', VARIANTS],
          ['lump_sum', 'Wariant A: ryczałt (zł netto)', 'number'], ['lump_days', 'Ryczałt płatny w ciągu (dni)', 'number'],
          ['hourly_rate', 'Wariant B: stawka godzinowa (zł netto)', 'number'], ['advance', 'Wariant B: zaliczka (zł netto, opcjonalnie)', 'number'],
          ['advance_days', 'Zaliczka płatna w ciągu (dni)', 'number'], ['payment_days', 'Faktury płatne w ciągu (dni)', 'number'],
          ['monthly_fee', 'Wariant C: abonament (zł netto / mies.)', 'number'], ['monthly_hours', 'Wariant C: godzin w abonamencie', 'number'],
          ['travel_pct', 'Czas dojazdu rozliczany w', 'select', { 100: '100% stawki', 50: '50% stawki' }],
          ['liability', 'Limit odpowiedzialności (§ 7)', 'select', { trzykrotnosc: 'trzykrotność wynagrodzenia netto', kwota: 'kwota' }],
          ['liability_amount', 'Limit – kwota (zł)', 'number'],
          ['rate_partner', 'Stawka partnera / doradcy (zł netto/h)', 'number'], ['rate_consultant', 'Stawka konsultanta (zł netto/h)', 'number'],
        ], P, onParam)),
      ...sub('Załączniki', ...attSection),
      ...sub('Inne', fieldsGrid([['extra_terms', 'Dodatkowe postanowienia (trafią do § 14) – każda linia to osobny ustęp', 'textarea']], draft, onAny)));
  }

  // ---- typ dokumentu (tylko dla nowego) ----
  const typeSwitch = isNew ? h('div', { class: 'tabs', style: { marginBottom: '16px' } }, ...Object.entries(DOC).map(([k, v]) => h('button', {
    type: 'button', class: draft.doc_type === k ? 'on' : '',
    onclick: (e) => {
      if (draft.doc_type === k) return;
      draft.doc_type = k;
      if (k === 'umowa') { Object.assign(P, { ...CONTRACT_DEFAULTS, ...P }); const cl = client(); if (cl) applyClient(null); }
      e.currentTarget.parentNode.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === e.currentTarget));
      const h1 = main.querySelector('h1'); if (h1) h1.textContent = k === 'umowa' ? 'Nowa umowa' : 'Nowe zlecenie';
      if (!subjectTouched) draft.subject = '';
      buildForm(); renderPreview();
    } }, v))) : null;

  // ---- zapis ----
  function rowOf() {
    const r = {
      doc_type: draft.doc_type, client_id: draft.client_id || null, order_date: draft.order_date || todayIso(), status: draft.status || 'projekt',
      subject: draft.subject || null, scope: draft.scope || null, fee_notes: draft.fee_notes || null, term_text: draft.term_text || null,
      extra_terms: draft.extra_terms || null, signer_id: draft.signer_id || null, signer_ids: draft.signer_ids || null, params: isUmowa() ? P : {},
      fee_type: draft.fee_type || null, fee_amount: draft.fee_amount ?? null, payment_days: draft.payment_days ?? 14,
    };
    if (isUmowa()) {
      r.fee_type = P.variant === 'B' ? 'godzinowa' : P.variant === 'AB' ? 'mieszana' : P.variant === 'C' ? 'abonament' : 'ryczalt';
      r.fee_amount = P.variant === 'B' ? (P.hourly_rate ?? null) : P.variant === 'C' ? (P.monthly_fee ?? null) : (P.lump_sum ?? null);
      r.payment_days = P.payment_days ?? 7;
      r.signer_id = r.signer_ids?.[0] || null;
    }
    return r;
  }
  async function save(silent) {
    if (!draft.client_id) { if (!silent) toast('Wybierz albo dodaj klienta', true); return false; }
    if (!draft.subject) { if (!silent) toast(isUmowa() ? 'Uzupełnij przedmiot (podatek i okres kontroli)' : 'Podaj przedmiot zlecenia', true); return false; }
    if (isUmowa() && !(draft.signer_ids || []).length) { if (!silent) toast('Zaznacz, kto podpisuje umowę', true); return false; }
    const row = rowOf();
    const first = !draft.id;
    const q = first ? sb.from('m2_orders').insert(row).select('*').single() : sb.from('m2_orders').update(row).eq('id', draft.id).select('*').single();
    const { data, error } = await q;
    if (error) { fail(error); return false; }
    Object.assign(draft, data, { params: { ...(data.params || {}) } }); Object.assign(P, draft.params); draft.params = P;
    if (first) {
      // automatyczna sprawa do nowego zlecenia / umowy
      const memberOf = sgn => members().find(mm => mm.full_name === sgn?.full_name)?.id || null;
      const sgs = chosenSigners();
      const lead = memberOf(sgs[0]) || state.me.id;
      const matter = {
        order_id: data.id, title: data.subject, status: 'nowa', opened_at: data.order_date,
        matter_type: isUmowa() ? (P.matter_type || 'inne') : matterType,
        lead_id: lead, second_id: (sgs.map(memberOf).find(x => x && x !== lead)) || null,
        fee_type: data.fee_type, fee_amount: data.fee_amount,
        ...(isUmowa() ? { authority: P.authority || null, case_ref: P.ref_no || null, tax_kind: P.tax || null, tax_period: P.period || null,
          poa_type: /^nie dotyczy/.test(P.poa_type || matterTemplate(P.matter_type).poa) ? null : (P.poa_type || matterTemplate(P.matter_type).poa), description: P.description || null } : {}),
      };
      const { data: mt, error: e2 } = await sb.from('m2_matters').insert(matter).select('id,number').single();
      if (e2) fail(e2, 'Zapisano dokument, ale nie udało się założyć sprawy');
      toast(`Zapisano ${docLabel(data).toLowerCase()}${mt ? ` i założono sprawę ${mt.number}` : ''}`);
      location.hash = `${BASE}/zlecenie/${data.id}`;
      return true;
    }
    if (!silent) toast('Zapisano ' + docLabel(data).toLowerCase());
    renderPreview();
    return true;
  }
  const fileName = (ext) => `${isUmowa() ? 'Umowa' : 'Zlecenie'}_${(draft.number || 'projekt').replace(/\//g, '-')}_${(client()?.name || '').replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 40)}.${ext}`;
  const pdfBtn = h('button', { class: 'btn btn-outline btn-sm', onclick: async () => {
    if (draft.id && !(await save(true))) return;
    if (!draft.id) return toast('Najpierw zapisz dokument', true);
    if (!printOrder(docBlocks(draft, client(), chosenSigners()), fileName('pdf').replace(/\.pdf$/, ''))) toast('Zezwól na wyskakujące okna, aby zapisać PDF', true);
  } }, icon('download'), 'PDF');
  const docxBtn = h('button', { class: 'btn btn-outline btn-sm', onclick: async () => {
    if (draft.id && !(await save(true))) return;
    if (!draft.id) return toast('Najpierw zapisz dokument', true);
    await downloadOrderDocx(docBlocks(draft, client(), chosenSigners()), fileName('docx'));
  } }, icon('download'), 'Word (.docx)');
  const delBtn = draft.id && isAdmin() ? h('button', { class: 'btn btn-danger btn-sm', onclick: async () => {
    const { data: ms } = await sb.from('m2_matters').select('id').eq('order_id', draft.id);
    const n = ms?.length || 0;
    if (!confirm(`Usunąć ${docLabel(draft).toLowerCase()}${n ? ` razem z ${n} ${n === 1 ? 'sprawą' : 'sprawami'} (terminy, dziennik, czas pracy)` : ''}? Tego nie da się cofnąć.`)) return;
    const { error } = await sb.from('m2_orders').delete().eq('id', draft.id); if (error) return fail(error);
    toast('Usunięto'); location.hash = `${BASE}/zlecenia`;
  } }, 'Usuń') : null;

  // ---- sprawy w zleceniu ----
  let mattersCard = null;
  if (draft.id) {
    const ms = await fetchAll(() => sb.from('m2_matters').select('id,number,title,status').eq('order_id', draft.id).order('opened_at'));
    mattersCard = h('section', { class: 'card section', style: { marginTop: '16px' } },
      h('div', { class: 'section-head' }, h('h2', {}, `Sprawy w ${isUmowa() ? 'tej umowie' : 'tym zleceniu'}`),
        h('a', { class: 'btn btn-outline btn-sm', href: `${BASE}/sprawa/nowa?zlecenie=${draft.id}` }, '+ Dodaj sprawę')),
      ...(ms.length ? ms.map(m => h('a', { class: 'mini-matter', href: `${BASE}/sprawa/${m.id}` }, h('div', {}, h('b', {}, m.number), ' ', m.title), statusPill(m.status)))
        : [h('p', { class: 'hint' }, 'Brak spraw. Dodaj sprawę przyciskiem powyżej.')]));
  }

  buildForm(); renderPreview();
  const title = draft.id ? docLabel(draft) : (isUmowa() ? 'Nowa umowa' : 'Nowe zlecenie');
  const subTitle = draft.id ? `Klient: ${client()?.name || '—'}` : 'Wybierz rodzaj dokumentu. Po zapisaniu automatycznie założy się sprawa – możesz ją potem edytować.';
  main.replaceChildren(...header('zlecenia', title, subTitle,
    [h('button', { class: 'btn btn-primary btn-sm', onclick: () => save(false) }, draft.id ? 'Zapisz' : 'Zapisz i załóż sprawę'), pdfBtn, docxBtn,
      h('button', { class: 'btn btn-outline btn-sm', onclick: () => pelnomocnictwoDialog({ client: client(), params: isUmowa() ? P : {}, defaultSignerId: chosenSigners()[0]?.id, kind: isUmowa() && /procesow|p\.p\.s\.a/i.test(P.poa_type || matterTemplate(P.matter_type).poa) ? 'procesowe' : 'pps1' }) }, 'Pełnomocnictwo'),
      delBtn].filter(Boolean)),
  typeSwitch || '',
  h('div', { class: 'order-layout' }, h('div', {}, h('section', { class: 'card section' }, formBox), mattersCard || ''), h('div', { class: 'paper-wrap' }, preview)));
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
  if (sub === 'zlecenia') return viewOrders(main, params);
  if (sub === 'zlecenie') return viewOrder(main, parts[2], params);
  if (sub === 'spotkania') { history.replaceState(null, '', `${BASE}/kalendarz`); return viewCalendar(main, params); }
  if (sub === 'zgloszenia') return renderZgloszenia(main, parts[2], params, 'm2');
  if (sub === 'oferty') return renderOferty(main, parts[2], 'm2');
  return viewDashboard(main);
}
