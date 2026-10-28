// Zamknięcie roku: kratki roczne dla każdego klienta (sprawozdanie, CIT-8, PIT roczny, PIT-11, KRS…) z terminami.
import { h, icon, toast, fail, initials } from '../ui.js';
import { sb, state, memberById, canEditClients } from '../store.js';
import { fetchSoft, loadClients, todayIso, fmtShort } from '../data.js';
import { STATUS, STATUS_ORDER, LEGAL_SHORT } from '../dict.js';
import { YEAR_TASKS, yearGroup, yearApplies, yearLabel, fmtDue } from '../obowiazki.js';
import { openPop, closePop } from '../pop.js';
import { emptyState } from '../puste.js';
import { celebrate } from '../efekty.js';

const GROUPS = { kapitalowe: 'Spółki (CIT) – sprawozdanie i CIT-8', osobowe: 'JDG i spółki osobowe – PIT roczny' };
const DONE = s => s === 'done' || s === 'na';

export async function renderRok(main, params) {
  const now = todayIso();
  const defY = +now.slice(0, 4) - (+now.slice(5, 7) <= 8 ? 1 : 0); // do sierpnia – rok poprzedni (sprawozdania, KRS); od września – przygotowanie bieżącego
  const y = +(params.get('rok') || defY);
  const prefs = (() => { try { return JSON.parse(localStorage.getItem('rkdp-rok') || '{}'); } catch { return {}; } })();
  const save = () => { try { localStorage.setItem('rkdp-rok', JSON.stringify(prefs)); } catch { /* */ } };
  prefs.q ??= ''; prefs.person ??= state.me.role === 'limited' ? 'me' : ''; prefs.show ??= '';
  const edit = canEditClients() || state.me.role === 'limited';

  main.replaceChildren(h('div', { class: 'spinner' }, 'Wczytywanie zamknięcia roku…'));
  const [clients, rows] = await Promise.all([
    loadClients(),
    fetchSoft(() => sb.from('year_close_entries').select('id,client_id,year,task_code,status,updated_by,updated_at').eq('year', y)),
  ]);
  const map = new Map();
  rows.forEach(r => { if (!map.has(r.client_id)) map.set(r.client_id, new Map()); map.get(r.client_id).set(r.task_code, r); });
  const active = clients.filter(c => c.status === 'aktywny');
  const tasksOf = g => YEAR_TASKS.filter(t => t.group === 'all' || t.group === g);
  const req = (c) => tasksOf(yearGroup(c)).filter(t => !t.opt).map(t => map.get(c.id)?.get(t.code)).filter(Boolean);
  const closed = c => { const r = req(c); return r.length > 0 && r.every(e => DONE(e.status)); };
  const missing = c => [...(map.get(c.id)?.values() || [])].some(e => e.status === 'missing_docs');
  const lateOf = c => tasksOf(yearGroup(c)).filter(t => !t.opt && t.due(y).date < now && map.get(c.id)?.get(t.code) && !DONE(map.get(c.id).get(t.code).status));
  const notOpened = active.filter(c => !map.has(c.id));

  const head = h('div', { class: 'page-head' },
    h('div', {}, h('p', { class: 'eyebrow' }, 'Rozliczenia · rok podatkowy'),
      h('h1', { style: { marginTop: '6px' } }, `Zamknięcie roku ${y}`),
      h('p', { class: 'sub' }, 'Inwentaryzacja, sprawozdanie, CIT-8 / PIT roczny, PIT-11, KRS – w tej samej logice kratek co rozliczenia miesięczne.')),
    h('div', { class: 'month' },
      h('a', { class: 'icon-btn', href: `#/zamkniecie-roku?rok=${y - 1}`, 'aria-label': 'Poprzedni rok' }, icon('left')),
      h('span', { class: 'label' }, String(y)),
      h('a', { class: 'icon-btn', href: `#/zamkniecie-roku?rok=${y + 1}`, 'aria-label': 'Następny rok' }, icon('right'))));

  const tiles = h('div', { class: 'tiles' });
  const banner = h('div');
  const body = h('div');
  const search = h('input', { class: 'input grow', type: 'search', placeholder: 'Szukaj klienta…', value: prefs.q });
  const personSel = h('select', { class: 'select' }, h('option', { value: '' }, 'Księgowa: wszyscy'), h('option', { value: 'me' }, 'Moi klienci'),
    ...state.members.filter(m => m.active).map(m => h('option', { value: m.id }, m.full_name)));
  personSel.value = prefs.person;
  const onF = () => { prefs.q = search.value; prefs.person = personSel.value; save(); draw(); };
  search.addEventListener('input', onF); personSel.addEventListener('change', onF);

  const filtered = list => list.filter(c => (!prefs.q || c.name.toLowerCase().includes(prefs.q.toLowerCase()))
    && (!prefs.person || (prefs.person === 'me' ? c.accountant_id === state.me.id : c.accountant_id === prefs.person))
    && (prefs.show !== 'otwarte' || !closed(c)) && (prefs.show !== 'braki' || missing(c)) && (prefs.show !== 'po_terminie' || lateOf(c).length));

  function drawTiles() {
    const opened = active.filter(c => map.has(c.id));
    const n = opened.filter(closed).length, pct = opened.length ? Math.round(n * 100 / opened.length) : 0;
    const nextT = YEAR_TASKS.filter(t => !t.opt).map(t => ({ t, d: t.due(y).date })).filter(x => x.d >= now).sort((a, b) => a.d.localeCompare(b.d))[0];
    const tb = (key, num, lbl, extra) => h('button', { class: 'card tile tile-btn' + (prefs.show === key ? ' on dark' : '') + (extra?.alert ? ' dark alert' : ''), type: 'button',
      onclick: () => { prefs.show = prefs.show === key ? '' : key; save(); draw(); } }, h('span', { class: 'lbl' }, lbl), h('span', { class: 'num' }, num), extra?.bar != null ? h('div', { class: 'bar' }, h('i', { style: { width: extra.bar + '%' } })) : null);
    const late = opened.filter(c => lateOf(c).length).length;
    tiles.replaceChildren(
      tb('otwarte', `${n} / ${opened.length}`, 'Klienci z zamkniętym rokiem', { bar: pct }),
      tb('po_terminie', String(late), 'Klienci po terminie', { alert: late > 0 }),
      tb('braki', String(opened.filter(missing).length), 'Z brakiem dokumentów'),
      h('div', { class: 'card tile' }, h('span', { class: 'lbl' }, 'Najbliższy termin'), h('span', { class: 'num', style: { fontSize: '22px' } }, nextT ? fmtShort(nextT.d) : '—'), h('span', { class: 'lbl' }, nextT ? nextT.t.label : 'wszystkie minęły')));
  }

  function drawBanner() {
    if (!notOpened.length || !edit) { banner.replaceChildren(); return; }
    banner.replaceChildren(h('div', { class: 'card', style: { padding: '18px 22px', marginBottom: '18px', display: 'flex', gap: '16px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' } },
      h('div', {}, h('h3', {}, rows.length ? `${notOpened.length} aktywnych klientów nie ma jeszcze listy za ${y}` : `Zamknięcie roku ${y} nie jest jeszcze otwarte`),
        h('p', { class: 'hint', style: { marginTop: '4px' } }, 'Kratki „Nie dotyczy” ustawią się same według profilu klienta (np. PIT-11 tylko przy pracownikach, JPK_CIT według roku i VAT).')),
      h('button', { class: 'btn btn-primary', onclick: async (e) => {
        e.target.disabled = true;
        const ins = notOpened.flatMap(c => tasksOf(yearGroup(c)).map(t => ({ client_id: c.id, year: y, task_code: t.code, status: yearApplies(t, c, y) ? 'todo' : 'na' })));
        const { error } = await sb.from('year_close_entries').upsert(ins, { onConflict: 'client_id,year,task_code', ignoreDuplicates: true });
        if (error) { e.target.disabled = false; return fail(error); }
        toast(`Otwarto zamknięcie roku ${y} – ${notOpened.length} klientów`);
        renderRok(main, params);
      } }, rows.length ? 'Dodaj brakujących klientów' : `Otwórz zamknięcie roku ${y}`)));
  }

  function cell(c, t) {
    const e = map.get(c.id)?.get(t.code);
    if (!e) return h('span', { class: 'muted small' }, '');
    const tip = `${yearLabel(t, c)} · termin ${fmtDue(t.due(y).date)}\n${STATUS[e.status].label}` + (e.updated_by && e.updated_by !== 'system' ? ` · ${state.members.find(m => m.email === e.updated_by)?.short_name || e.updated_by}` : '');
    return h('button', { class: `cb cb-${e.status === 'in_progress' ? 'todo' : e.status}`, 'data-tip': tip, 'aria-label': tip, disabled: !edit,
      onclick: ev => openPop(ev.currentTarget, [h('label', {}, `${yearLabel(t, c)} – ${c.name}`),
        STATUS_ORDER.map(s => h('button', { class: 'opt' + (e.status === s ? ' cur' : ''), onclick: () => { closePop(); setStatus(c, e, s); } },
          h('span', { class: `cb cb-${s}`, style: { width: '22px', height: '22px', fontSize: '12px' } }, STATUS[s].mark), s === 'todo' ? 'Wyczyść (do zrobienia)' : STATUS[s].label))]) }, STATUS[e.status].mark);
  }
  async function setStatus(c, e, s) {
    const before = e.status, wasClosed = closed(c);
    e.status = s; e.updated_by = state.me.email; draw();
    const { error } = await sb.from('year_close_entries').update({ status: s }).eq('id', e.id);
    if (error) { e.status = before; draw(); return fail(error, 'Nie zapisano'); }
    if (!wasClosed && closed(c)) toast(`${c.name} – rok ${y} zamknięty`);
    const opened = active.filter(x => map.has(x.id));
    if (opened.length && opened.every(closed)) celebrate(`Wszyscy klienci mają zamknięty rok ${y}!`);
  }

  function table(g, list) {
    const ts = tasksOf(g);
    return h('div', { class: 'grid-wrap' }, h('table', { class: 'grid' },
      h('thead', {}, h('tr', {}, h('th', { class: 'c-name' }, 'Klient'), h('th', { class: 'c-person' }, 'Księgowa'),
        ts.map(t => {
          const rel = list.map(c => map.get(c.id)?.get(t.code)).filter(e => e && e.status !== 'na');
          const d = rel.filter(e => e.status === 'done').length, pct = rel.length ? Math.round(d * 100 / rel.length) : 0;
          const due = t.due(y).date;
          return h('th', { class: 'c-task' + (t.opt ? ' optional' : ''), 'data-tip': `${t.label}\n${t.tip}${t.opt ? '\nInformacyjnie – nie wpływa na „zamknięty”.' : ''}` },
            t.label, h('span', { class: 'sub' + (due < now && d < rel.length && !t.opt ? ' late-t' : '') }, `do ${fmtShort(due)} · ${d}/${rel.length}`),
            h('span', { class: 'colbar' + (pct === 100 ? ' full' : '') }, h('i', { style: { width: pct + '%' } })));
        }),
        h('th', { class: 'c-sum' }, 'Rok zamknięty'))),
      h('tbody', {}, list.map(c => {
        const r = req(c), dn = r.filter(e => DONE(e.status)).length, ok = closed(c);
        const m = memberById(c.accountant_id);
        return h('tr', { class: ok ? 'settled' : null },
          h('td', { class: 'c-name' }, h('div', { class: 'cname' }, h('a', { href: `#/klient/${c.id}`, 'data-panel': c.id }, c.name), h('div', { class: 'meta' }, h('span', { class: 'badge' }, LEGAL_SHORT[c.legal_form] || '?')))),
          h('td', { class: 'c-person' }, h('span', { class: 'person' + (m ? '' : ' unassigned'), style: { cursor: 'default' } }, h('span', { class: 'av' }, m ? initials(m.full_name) : '–'), m ? m.short_name : 'brak')),
          ts.map(t => h('td', { class: 'c-task' }, cell(c, t))),
          h('td', { class: 'c-sum' }, ok ? h('span', { class: 'sum ok' }, '✓ Zamknięty') : r.some(e => e.status === 'missing_docs') ? h('span', { class: 'sum bad' }, `! ${dn}/${r.length}`)
            : h('span', { class: 'sum no' }, h('span', { class: 'ring', style: `--p:${r.length ? Math.round(dn * 100 / r.length) : 0}` }), `${dn}/${r.length}`)));
      }))));
  }

  function draw() {
    drawTiles(); drawBanner();
    const out = [];
    for (const g of Object.keys(GROUPS)) {
      const all = active.filter(c => yearGroup(c) === g && map.has(c.id));
      const list = filtered(all);
      out.push(h('div', { class: 'table-title' }, h('h2', {}, GROUPS[g]), h('span', { class: 'muted small' }, `zamknięci ${all.filter(closed).length} z ${all.length}`)));
      out.push(list.length ? table(g, list) : emptyState(all.length ? 'Nikt nie pasuje do filtrów' : 'Brak listy', all.length ? 'Zmień wyszukiwanie lub filtr.' : `Otwórz zamknięcie roku ${y}, aby utworzyć kratki.`));
    }
    body.replaceChildren(...out);
  }
  main.replaceChildren(head, tiles, banner, h('div', { class: 'toolbar' }, search, personSel,
    h('a', { class: 'btn btn-outline btn-sm', href: `#/terminy?rok=${y + 1}&widok=rok` }, 'Kalendarz obowiązków')),
  h('div', { class: 'legend' }, ['done', 'na', 'missing_docs', 'todo'].map(s => h('span', {}, h('span', { class: `cb cb-${s}` }, STATUS[s].mark), STATUS[s].label)),
    h('span', { class: 'muted' }, '· terminy w nagłówkach kolumn · najedź, aby zobaczyć opis obowiązku')), body);
  draw();
  return () => closePop();
}
