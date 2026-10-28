// RKDP – pulpit: dla pracownika (moje zgłoszenia, moje rozliczenia, terminy) i pulpit doradcy dla administratora.
import { h, fail, icon, periodLabel, defaultPeriod, initials, infoTip } from '../ui.js';
import { sb, state, memberById } from '../store.js';
import { fetchAll } from './rozliczenia.js';
import { sectionOf, deadlinesFor } from '../dict.js';
import { todayWidget, teamTodayCard, canSeeTeam } from './obecnosc.js';
import { amlDashCard } from '../aml/aml.js';
import { TK_OPEN, TK_CAT, statusTag, dueTag, newTicketDialog, generateRecurring } from './zgloszenia.js';

const PREF = 'rkdp-pulpit-widok';
const today = () => new Date().toISOString().slice(0, 10);
const addDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const isLate = t => TK_OPEN.includes(t.status) && t.due_date && t.due_date < today();
const who = id => memberById(id)?.full_name || '—';
const first = n => (n || '').split(/\s+/)[0];
const daysTo = d => Math.round((new Date(d.toISOString().slice(0, 10)) - new Date(today())) / 86400000);
const fmtD = d => d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' });
const PRIO_ORDER = { pilny: 0, wysoki: 1, normalny: 2, niski: 3 };
const byDue = (a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999') || PRIO_ORDER[a.priority] - PRIO_ORDER[b.priority];

const HELP_ME = `Twój pulpit – najważniejsze rzeczy na dziś:
• Kafelki: Twoje otwarte zgłoszenia, zgłoszenia po terminie, Twoi klienci rozliczeni za bieżący miesiąc i klienci z brakiem dokumentów.
• Moje zgłoszenia: przypisane do Ciebie, od najpilniejszego terminu. „Przekazane innym” – zgłoszenia, które utworzyłeś(-aś) dla kogoś innego.
• Rozliczenia: klienci, przy których jesteś księgową lub kadrową – kto jest jeszcze nierozliczony za bieżący miesiąc i gdzie brakuje dokumentów.
• Terminy ustawowe: najbliższe terminy PIT/CIT, VAT i JPK oraz ZUS za bieżący miesiąc rozliczeniowy.`;
const HELP_ADMIN = `Pulpit doradcy – podsumowanie całego biura:
• Kafelki: wszystkie otwarte zgłoszenia, po terminie, pilne i wysokie, czekające na klienta oraz stan rozliczeń (księgowość i kadry) za bieżący miesiąc.
• Zespół: dla każdej osoby – otwarte i zaległe zgłoszenia, zamknięte w ostatnich 7 dniach, klienci rozliczeni / wszyscy i braki dokumentów.
• Wymaga uwagi: zgłoszenia po terminie i pilne w całym biurze, nieprzypisane zgłoszenia, klienci bez księgowej, nieotwarty miesiąc.
• Ostatnio zamknięte: co zespół zrobił w ostatnich 7 dniach (z opisem wykonania w zgłoszeniu).`;

async function loadData(period) {
  const pdate = period + '-01';
  const [tickets, clients, entries] = await Promise.all([
    fetchAll(() => sb.from('rkdp_tickets').select('id,no,title,client_id,category,priority,status,due_date,assignee_id,created_by,done_at,done_by,updated_at').eq('module', 'rkdp').order('due_date')).catch(() => []),
    fetchAll(() => sb.from('clients').select('id,name,status,legal_form,bookkeeping,accountant_id,hr_id').order('name')),
    fetchAll(() => sb.from('checklist_entries').select('client_id,task_code,status').eq('period', pdate)),
  ]);
  const tasks = state.taskTypes.filter(t => t.active);
  const tByCode = new Map(tasks.map(t => [t.code, t]));
  const ent = new Map();
  for (const e of entries) { if (!ent.has(e.client_id)) ent.set(e.client_id, []); ent.get(e.client_id).push(e); }
  // stan rozliczenia klienta w obszarze (jak w zakładce Rozliczenia)
  const settle = (c, area) => {
    const sect = sectionOf(c);
    const cells = (ent.get(c.id) || []).filter(e => { const t = tByCode.get(e.task_code); return t && t.area === area && (area === 'kadry' || t.applies_to === 'all' || t.applies_to === sect); });
    const req = cells.filter(e => tByCode.get(e.task_code).counts_to_settled !== false);
    const done = req.filter(e => e.status === 'done' || e.status === 'na').length;
    return { has: cells.length > 0, total: req.length, done, settled: req.length > 0 && done === req.length, missing: cells.some(e => e.status === 'missing_docs') };
  };
  const active = clients.filter(c => c.status === 'aktywny');
  return { tickets, clients, active, settle, cname: Object.fromEntries(clients.map(c => [c.id, c.name])), opened: new Set(entries.map(e => e.client_id)) };
}

const tile = (n, lbl, href, o = {}) => h('a', { class: 'card tile' + (o.dark ? ' alert' : ''), href, style: { textDecoration: 'none', color: 'inherit' } },
  h('span', { class: 'num' }, String(n)), h('span', { class: 'lbl' }, lbl), o.bar !== undefined ? h('div', { class: 'bar' }, h('i', { style: { width: `${Math.round(o.bar * 100)}%` } })) : null);
const ticketRow = (t, cname, showWho) => h('a', { class: 'tk-mini', href: `#/zgloszenia/${t.id}` },
  h('div', { style: { minWidth: 0 } }, h('b', {}, t.title), h('div', { class: 'small muted' }, [`#${t.no}`, cname[t.client_id], showWho ? (t.assignee_id ? who(t.assignee_id) : 'nieprzypisane') : TK_CAT[t.category]].filter(Boolean).join(' · '))),
  h('div', { style: { textAlign: 'right', flex: 'none' } }, statusTag(t.status), h('div', {}, dueTag(t))));
const card = (title, extra, ...body) => h('section', { class: 'card section' }, h('div', { class: 'section-head' }, h('h2', {}, title), extra || null), ...body.filter(Boolean));
const empty = txt => h('p', { class: 'hint' }, txt);

function deadlinesCard(period) {
  const all = [...deadlinesFor(period, 'ksiegowosc'), ...deadlinesFor(period, 'kadry')]
    .sort((a, b) => a.date - b.date).filter((d, i, arr) => arr.findIndex(x => x.label === d.label) === i);
  return card(`Terminy ustawowe – za ${periodLabel(period).toLowerCase()}`, null,
    ...all.map(d => { const n = daysTo(d.date); return h('div', { class: 'pl-dl' + (n < 0 ? ' past' : n <= 3 ? ' soon' : '') },
      h('span', {}, d.label), h('b', {}, fmtD(d.date)), h('span', { class: 'small muted' }, n < 0 ? 'minął' : n === 0 ? 'dziś' : n === 1 ? 'jutro' : `za ${n} dni`)); }));
}

// ---------- pulpit pracownika ----------
function myDashboard(D, period) {
  const me = state.me.id;
  const mine = D.tickets.filter(t => TK_OPEN.includes(t.status) && t.assignee_id === me).sort(byDue);
  const late = mine.filter(isLate);
  const delegated = D.tickets.filter(t => TK_OPEN.includes(t.status) && t.created_by === me && t.assignee_id !== me).sort(byDue);
  const areas = [['ksiegowosc', 'Księgowość', 'accountant_id'], ['kadry', 'Kadry i ZUS', 'hr_id']]
    .map(([area, label, field]) => {
      const list = D.active.filter(c => c[field] === me).map(c => ({ c, s: D.settle(c, area) })).filter(x => x.s.has);
      return { area, label, list, settled: list.filter(x => x.s.settled).length, missing: list.filter(x => x.s.missing) };
    }).filter(a => a.list.length);
  const totalMine = areas.reduce((a, x) => a + x.list.length, 0), settledMine = areas.reduce((a, x) => a + x.settled, 0);
  const missingMine = areas.reduce((a, x) => a + x.missing.length, 0);

  const settleCards = areas.length ? areas.map(a => card(`${a.label} – ${periodLabel(period)}`,
    h('a', { class: 'btn btn-ghost btn-sm', href: `#/rozliczenia?okres=${period}&widok=${a.area}` }, 'Rozliczenia →'),
    h('div', { class: 'pl-prog' }, h('div', { class: 'bar' }, h('i', { style: { width: `${a.list.length ? Math.round(a.settled / a.list.length * 100) : 0}%` } })),
      h('span', { class: 'small' }, h('b', {}, `${a.settled} z ${a.list.length}`), ' klientów rozliczonych')),
    ...a.list.filter(x => !x.s.settled).sort((x, y) => Number(y.s.missing) - Number(x.s.missing) || x.c.name.localeCompare(y.c.name, 'pl')).slice(0, 12)
      .map(x => h('a', { class: 'tk-mini', href: `#/klient/${x.c.id}` }, h('span', {}, x.c.name),
        h('span', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, x.s.missing ? h('span', { class: 'badge warn' }, 'brak dokumentów') : null, h('span', { class: 'small muted' }, `${x.s.done}/${x.s.total}`)))),
    a.list.length - a.settled > 12 ? h('p', { class: 'hint', style: { marginTop: '8px' } }, `… i ${a.list.length - a.settled - 12} więcej`) : null,
    a.settled === a.list.length ? empty('Wszyscy Twoi klienci są rozliczeni. 🎉') : null))
    : [card(`Rozliczenia – ${periodLabel(period)}`, null, empty('Nie jesteś przypisany(-a) jako księgowa ani kadrowa do żadnego klienta.'))];

  return [
    h('div', { class: 'tiles' },
      tile(mine.length, 'Moje otwarte zgłoszenia', '#/zgloszenia?f=moje'),
      tile(late.length, 'Moje po terminie', '#/zgloszenia?f=moje', { dark: late.length > 0 }),
      tile(totalMine ? `${settledMine}/${totalMine}` : '—', `Moi klienci rozliczeni (${periodLabel(period).toLowerCase()})`, `#/rozliczenia?okres=${period}`, { bar: totalMine ? settledMine / totalMine : undefined }),
      tile(missingMine, 'Klienci z brakiem dokumentów', `#/rozliczenia?okres=${period}`, { dark: false })),
    h('div', { class: 'two' },
      h('div', {},
        card(`Moje zgłoszenia (${mine.length})`, h('button', { class: 'btn btn-outline btn-sm', onclick: () => newTicketDialog().catch(e => fail(e)) }, icon('plus'), 'Nowe'),
          ...(mine.length ? mine.slice(0, 12).map(t => ticketRow(t, D.cname)) : [empty('Nie masz otwartych zgłoszeń.')]),
          mine.length > 12 ? h('a', { class: 'small', href: '#/zgloszenia?f=moje', style: { display: 'block', marginTop: '10px' } }, `Wszystkie (${mine.length}) →`) : null),
        delegated.length ? card(`Przekazane innym (${delegated.length})`, null, ...delegated.slice(0, 8).map(t => ticketRow(t, D.cname, true))) : null),
      h('div', {}, todayWidget(), deadlinesCard(period), ...settleCards)),
  ];
}

// ---------- pulpit doradcy (administrator) ----------
function adminDashboard(D, period) {
  const open = D.tickets.filter(t => TK_OPEN.includes(t.status));
  const late = open.filter(isLate).sort(byDue);
  const hot = open.filter(t => ['pilny', 'wysoki'].includes(t.priority));
  const wait = open.filter(t => t.status === 'czeka');
  const unassigned = open.filter(t => !t.assignee_id).sort(byDue);
  const weekAgo = addDays(-7);
  const doneWeek = D.tickets.filter(t => t.status === 'zrobione' && t.done_at && t.done_at.slice(0, 10) >= weekAgo).sort((a, b) => b.done_at.localeCompare(a.done_at));
  const acc = D.active.map(c => ({ c, s: D.settle(c, 'ksiegowosc') })).filter(x => x.s.has);
  const hr = D.active.map(c => ({ c, s: D.settle(c, 'kadry') })).filter(x => x.s.has);
  const accOk = acc.filter(x => x.s.settled).length, hrOk = hr.filter(x => x.s.settled).length;
  const missing = [...acc.filter(x => x.s.missing).map(x => ({ ...x, area: 'księgowość', person: x.c.accountant_id })), ...hr.filter(x => x.s.missing).map(x => ({ ...x, area: 'kadry', person: x.c.hr_id }))];
  const noAcc = D.active.filter(c => !c.accountant_id);
  const notOpened = D.active.filter(c => !D.opened.has(c.id));

  const team = state.members.filter(m => m.active && (m.modules || ['rozliczenia']).includes('rozliczenia'));
  const row = m => {
    const o = open.filter(t => t.assignee_id === m.id), l = o.filter(isLate);
    const dw = doneWeek.filter(t => t.done_by === m.id || (!t.done_by && t.assignee_id === m.id)).length;
    const a = acc.filter(x => x.c.accountant_id === m.id), k = hr.filter(x => x.c.hr_id === m.id);
    const ms = a.filter(x => x.s.missing).length + k.filter(x => x.s.missing).length;
    const frac = (arr) => {
      if (!arr.length) return h('span', { class: 'muted' }, '—');
      const d = arr.filter(x => x.s.settled).length, p = Math.round(d * 100 / arr.length);
      return h('span', { class: 'frac' + (p === 100 ? ' full' : ''), 'data-tip': `Rozliczeni: ${d} z ${arr.length}` },
        h('span', { class: 'ring', style: `--p:${p}`, 'aria-hidden': 'true' }), `${d}/${arr.length}`);
    };
    const num = (n, cls) => n ? h('span', { class: 'cnt ' + cls }, String(n)) : h('span', { class: 'cnt zero' }, '0');
    return h('tr', {},
      h('td', {}, h('span', { class: 'person', style: { padding: 0 } }, h('span', { class: 'av' }, initials(m.full_name)), m.full_name)),
      h('td', {}, num(o.length, 'open')), h('td', {}, num(l.length, 'late')), h('td', {}, num(dw, 'done')),
      h('td', {}, frac(a)), h('td', {}, frac(k)), h('td', {}, num(ms, 'late')));
  };
  const attention = [
    ...late.slice(0, 10).map(t => ticketRow(t, D.cname, true)),
    ...hot.filter(t => !isLate(t)).sort(byDue).slice(0, 6).map(t => ticketRow(t, D.cname, true)),
  ];
  const info = [
    unassigned.length ? h('a', { class: 'pl-info', href: '#/zgloszenia' }, h('b', {}, String(unassigned.length)), ' nieprzypisanych zgłoszeń') : null,
    noAcc.length ? h('a', { class: 'pl-info', href: '#/klienci' }, h('b', {}, String(noAcc.length)), ' aktywnych klientów bez przypisanej księgowej') : null,
    notOpened.length ? h('a', { class: 'pl-info', href: `#/rozliczenia?okres=${period}` }, h('b', {}, String(notOpened.length)), ` klientów bez otwartego miesiąca ${periodLabel(period).toLowerCase()}`) : null,
  ].filter(Boolean);

  return [
    h('div', { class: 'tiles' },
      tile(open.length, 'Otwarte zgłoszenia', '#/zgloszenia?f=otwarte'),
      tile(late.length, 'Po terminie', '#/zgloszenia?f=po_terminie', { dark: late.length > 0 }),
      tile(hot.length, 'Pilne i wysokie', '#/zgloszenia?f=otwarte'),
      tile(wait.length, 'Czeka na klienta', '#/zgloszenia?f=czeka')),
    h('div', { class: 'tiles' },
      tile(acc.length ? `${accOk}/${acc.length}` : '—', `Księgowość rozliczona – ${periodLabel(period).toLowerCase()}`, `#/rozliczenia?okres=${period}&widok=ksiegowosc`, { bar: acc.length ? accOk / acc.length : 0 }),
      tile(hr.length ? `${hrOk}/${hr.length}` : '—', `Kadry rozliczone – ${periodLabel(period).toLowerCase()}`, `#/rozliczenia?okres=${period}&widok=kadry`, { bar: hr.length ? hrOk / hr.length : 0 }),
      tile(missing.length, 'Brak dokumentów', `#/rozliczenia?okres=${period}`, { dark: false }),
      tile(doneWeek.length, 'Zgłoszenia zamknięte w 7 dni', '#/zgloszenia?f=zrobione')),
    card('Zespół', null, h('div', { class: 'list-wrap' }, h('table', { class: 'list pl-team' },
      h('thead', {}, h('tr', {}, ...['Osoba', 'Zgłoszenia otwarte', 'Po terminie', 'Zamknięte (7 dni)', 'Księgowość', 'Kadry', 'Brak dok.'].map(x => h('th', {}, x)))),
      h('tbody', {}, ...team.map(row))))),
    h('div', { class: 'two' },
      h('div', {},
        card('Wymaga uwagi', null, ...(info.length ? [h('div', { class: 'pl-infos' }, ...info)] : []),
          ...(attention.length ? attention : [empty('Brak zgłoszeń po terminie i pilnych. 👍')])),
        missing.length ? card(`Brak dokumentów – ${periodLabel(period).toLowerCase()} (${missing.length})`, null,
          ...missing.slice(0, 15).map(x => h('a', { class: 'tk-mini', href: `#/klient/${x.c.id}` }, h('span', {}, x.c.name), h('span', { class: 'small muted' }, `${x.area} · ${x.person ? who(x.person) : 'nieprzypisany'}`)))) : null),
      h('div', {},
        canSeeTeam() ? teamTodayCard() : null,
        amlDashCard('rkdp'),
        deadlinesCard(period),
        card(`Ostatnio zamknięte (${doneWeek.length})`, null, ...(doneWeek.length ? doneWeek.slice(0, 10).map(t => h('a', { class: 'tk-mini', href: `#/zgloszenia/${t.id}` },
          h('div', { style: { minWidth: 0 } }, h('b', {}, t.title), h('div', { class: 'small muted' }, [D.cname[t.client_id], who(t.done_by || t.assignee_id)].filter(Boolean).join(' · '))),
          h('span', { class: 'small muted', style: { flex: 'none' } }, new Date(t.done_at).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' }))))
          : [empty('W ostatnich 7 dniach nie zamknięto zgłoszeń.')])))),
  ];
}

export async function renderPulpit(main) {
  const period = defaultPeriod();
  const admin = state.me.role === 'admin';
  let view = admin ? (() => { try { return localStorage.getItem(PREF) || 'doradca'; } catch { return 'doradca'; } })() : 'moj';
  main.replaceChildren(h('div', { class: 'spinner' }, 'Wczytywanie pulpitu…'));
  // zadania cykliczne i dane pulpitu równolegle; gdy powstały nowe zgłoszenia – odświeżamy dane
  let [created, D] = await Promise.all([generateRecurring(), loadData(period)]);
  if (created > 0) D = await loadData(period);
  const body = h('div');
  const switcher = admin ? h('div', { class: 'tabs', style: { margin: 0 } }) : null;
  const draw = () => {
    if (switcher) switcher.replaceChildren(...[['doradca', 'Pulpit doradcy'], ['moj', 'Mój pulpit']].map(([k, l]) => h('button', { class: view === k ? 'on' : '', type: 'button', onclick: () => { view = k; try { localStorage.setItem(PREF, k); } catch { /* */ } draw(); } }, l)));
    body.replaceChildren(...(view === 'doradca' ? adminDashboard(D, period) : myDashboard(D, period)).filter(Boolean));
    title.replaceChildren(view === 'doradca' ? 'Pulpit doradcy' : `Dzień dobry, ${first(state.me.full_name)}`, infoTip(view === 'doradca' ? HELP_ADMIN : HELP_ME, 'Pulpit – instrukcja'));
  };
  const title = h('h1', { style: { marginTop: '6px', display: 'flex', alignItems: 'center' } });
  main.replaceChildren(
    h('div', { class: 'page-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, new Date().toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })), title,
        h('p', { class: 'sub' }, `Bieżący miesiąc rozliczeniowy: ${periodLabel(period).toLowerCase()}.`)),
      switcher),
    body);
  draw();
}
