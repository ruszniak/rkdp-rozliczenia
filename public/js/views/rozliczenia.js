import { h, icon, toast, fail, periodLabel, shiftPeriod, defaultPeriod, downloadCsv, initials } from '../ui.js';
import { sb, state, memberById, canEditClients } from '../store.js';
import { STATUS, STATUS_ORDER, LEGAL_SHORT, sectionOf, deadlinesFor } from '../dict.js';

const PREF_KEY = 'rkdp-rozliczenia-v2';
const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch { return {}; } };
const savePrefs = p => { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* prywatne okno */ } };

export async function fetchAll(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

const AREAS = {
  ksiegowosc: { label: 'Księgowość', person: 'accountant_id', personLabel: 'Księgowa' },
  kadry: { label: 'Kadry i ZUS', person: 'hr_id', personLabel: 'Kadrowa' },
};
const SECTIONS = {
  osobowe: { title: 'JDG i spółki osobowe', pitLabel: 'PIT' },
  kapitalowe: { title: 'Spółki z o.o. i pełna księgowość', pitLabel: 'CIT' },
};
const ICON_NOTE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

export async function renderRozliczenia(main, params) {
  const period = /^\d{4}-\d{2}$/.test(params.get('okres') || '') ? params.get('okres') : defaultPeriod();
  const pdate = period + '-01';
  const prefs = { area: 'ksiegowosc', q: '', person: '', show: '', ...loadPrefs() };
  if (params.get('widok') && AREAS[params.get('widok')]) prefs.area = params.get('widok');
  const editClients = canEditClients();

  main.replaceChildren(h('div', { class: 'spinner' }, 'Wczytywanie rozliczeń…'));
  const [clients, entries, notes] = await Promise.all([
    fetchAll(() => sb.from('clients')
      .select('id,name,status,legal_form,bookkeeping,has_employees,accountant_id,hr_id').order('name')),
    fetchAll(() => sb.from('checklist_entries').select('id,client_id,task_code,status,updated_by,updated_at').eq('period', pdate)),
    fetchAll(() => sb.from('period_notes').select('client_id,notes,questions').eq('period', pdate)),
  ]);

  const tasksAll = state.taskTypes.filter(t => t.active);
  const byClient = new Map();
  for (const e of entries) {
    if (!byClient.has(e.client_id)) byClient.set(e.client_id, new Map());
    byClient.get(e.client_id).set(e.task_code, e);
  }
  const noteMap = new Map(notes.map(n => [n.client_id, n]));
  const clientMap = new Map(clients.map(c => [c.id, c]));
  const missing = clients.filter(c => c.status === 'aktywny' && !byClient.has(c.id));

  // kolumny dla obszaru / sekcji
  const tasksFor = (area, section) => tasksAll.filter(t => t.area === area && (area === 'kadry' || t.applies_to === 'all' || t.applies_to === section));
  const cellsOf = (c, area) => {
    const m = byClient.get(c.id); if (!m) return [];
    const list = area === 'kadry' ? tasksFor('kadry') : tasksFor('ksiegowosc', sectionOf(c));
    return list.map(t => m.get(t.code)).filter(Boolean);
  };
  const isSettled = (c, area) => { const cs = cellsOf(c, area); return cs.length > 0 && cs.every(e => e.status === 'done' || e.status === 'na'); };
  const hasMissing = (c, area) => cellsOf(c, area).some(e => e.status === 'missing_docs');
  const hasNote = c => !!(noteMap.get(c.id)?.notes?.trim() || noteMap.get(c.id)?.questions?.trim());
  // aktywni liczą się do podsumowań; zawieszeni i zakończeni idą do osobnej tabeli
  const withCells = (area) => clients.filter(c => cellsOf(c, area).length > 0).sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  const rowsIn = (area) => withCells(area).filter(c => c.status === 'aktywny');
  const inactiveIn = (area) => withCells(area).filter(c => c.status !== 'aktywny');
  const colsFor = (area, section) => {
    if (area === 'kadry') return tasksFor('kadry');
    if (section === 'nieaktywni') return tasksFor('ksiegowosc', 'kapitalowe');
    return tasksFor('ksiegowosc', section).map(t => t.code === 'pit_cit' ? { ...t, label: SECTIONS[section].pitLabel } : t);
  };

  // ---------- nagłówek ----------
  const monthNav = h('div', { class: 'month' },
      h('a', { class: 'icon-btn', href: `#/rozliczenia?okres=${shiftPeriod(period, -1)}`, 'aria-label': 'Poprzedni miesiąc', 'data-tip': 'Poprzedni miesiąc' }, icon('left')),
      h('span', { class: 'label' }, periodLabel(period)),
      h('a', { class: 'icon-btn', href: `#/rozliczenia?okres=${shiftPeriod(period, 1)}`, 'aria-label': 'Następny miesiąc', 'data-tip': 'Następny miesiąc' }, icon('right')));

  const tabsBox = h('div', { class: 'tabs', role: 'tablist' });
  const head = h('div', { class: 'top-bar' }, h('div'), tabsBox, monthNav);
  const tiles = h('div', { class: 'tiles' });
  const deadlines = h('div', { class: 'panel deadlines' });
  const banner = h('div', { class: 'card', style: { padding: '18px 22px', marginBottom: '18px', display: 'flex', gap: '16px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' } });
  const body = h('div');

  // ---------- filtry ----------
  const search = h('input', { class: 'input grow', type: 'search', placeholder: 'Szukaj klienta…', value: prefs.q, 'aria-label': 'Szukaj klienta' });
  const personSel = h('select', { class: 'select', 'aria-label': 'Osoba' });
  const showSel = h('select', { class: 'select', 'aria-label': 'Pokaż' },
    h('option', { value: '' }, 'Wszyscy klienci'), h('option', { value: 'nierozliczeni' }, 'Tylko nierozliczeni'),
    h('option', { value: 'braki' }, 'Z brakiem dokumentów'), h('option', { value: 'uwagi' }, 'Z uwagami / pytaniami'));
  showSel.value = prefs.show;
  const exportBtn = h('button', { class: 'btn btn-outline btn-sm', onclick: () => exportCsv() }, icon('download'), 'Eksport');
  const toolbar = h('div', { class: 'toolbar' }, search, personSel, showSel, exportBtn);
  const onFilter = () => { Object.assign(prefs, { q: search.value, person: personSel.value, show: showSel.value }); savePrefs(prefs); renderBody(); };
  search.addEventListener('input', onFilter);
  personSel.addEventListener('change', onFilter);
  showSel.addEventListener('change', onFilter);

  const legend = h('div', { class: 'legend' },
    ['done', 'na', 'missing_docs', 'todo'].map(s => h('span', {}, h('span', { class: `cb cb-${s}` }, STATUS[s].mark), STATUS[s].label)),
    h('span', { class: 'muted' }, '· kliknij kratkę, aby zmienić · najedź na nagłówek, aby zobaczyć opis'));

  function renderTabs() {
    tabsBox.replaceChildren(...Object.entries(AREAS).map(([k, a]) => {
      const rows = rowsIn(k);
      const open = rows.filter(c => !isSettled(c, k)).length;
      return h('button', { class: prefs.area === k ? 'on' : '', role: 'tab', 'aria-selected': String(prefs.area === k),
        onclick: () => { prefs.area = k; prefs.person = ''; savePrefs(prefs); renderAll(); } },
      a.label, h('span', { class: 'n', 'data-tip': 'Nierozliczeni klienci' }, open));
    }));
  }

  function renderPersonSel() {
    const a = AREAS[prefs.area];
    personSel.replaceChildren(
      h('option', { value: '' }, `${a.personLabel}: wszyscy`),
      h('option', { value: 'me' }, 'Moi klienci'),
      h('option', { value: 'none' }, 'Bez przypisanej osoby'),
      h('optgroup', { label: `${a.personLabel}:` },
        state.members.filter(m => m.active).map(m => h('option', { value: m.id }, m.full_name))));
    personSel.value = prefs.person || '';
  }

  function renderTiles() {
    const area = prefs.area;
    const rows = rowsIn(area);
    const settled = rows.filter(c => isSettled(c, area)).length;
    const todo = rows.reduce((n, c) => n + cellsOf(c, area).filter(e => e.status === 'todo' || e.status === 'in_progress').length, 0);
    const miss = rows.filter(c => hasMissing(c, area)).length;
    const nts = rows.filter(hasNote).length;
    const pct = rows.length ? Math.round(settled / rows.length * 100) : 0;
    const tile = (n, lbl, show) => h('button', { class: 'card tile' + (prefs.show === show ? ' on' : ''), style: { textAlign: 'left', cursor: 'pointer' },
      onclick: () => { prefs.show = prefs.show === show ? '' : show; showSel.value = prefs.show; savePrefs(prefs); renderBody(); } },
    h('span', { class: 'lbl' }, lbl), h('span', { class: 'num' }, n));
    tiles.replaceChildren(
      h('div', { class: 'card tile dark' }, h('span', { class: 'lbl' }, `Rozliczeni – ${AREAS[area].label.toLowerCase()}`),
        h('span', { class: 'num' }, `${settled} / ${rows.length}`), h('div', { class: 'bar' }, h('i', { style: { width: pct + '%' } }))),
      tile(todo, 'Kratek do zrobienia', 'nierozliczeni'),
      tile(miss, 'Klientów z brakiem dokumentów', 'braki'),
      tile(nts, 'Klientów z uwagami', 'uwagi'));
  }

  function renderDeadlines() {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    deadlines.replaceChildren(h('b', {}, `Terminy za ${periodLabel(period).toLowerCase()}:`), ...
      deadlinesFor(period, prefs.area).map(d => h('span', { class: 'dl' + (d.date < today ? ' late' : ''), 'data-tip': d.moved ? 'Termin przesunięty na najbliższy dzień roboczy' : null },
        d.label, h('b', {}, d.date.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' }) + (d.moved ? '*' : '')))));
  }

  function renderBanner() {
    if (!missing.length) { banner.hidden = true; return; }
    banner.hidden = false;
    const none = entries.length === 0;
    banner.replaceChildren(
      h('div', {}, h('h3', {}, none ? `Lista na ${periodLabel(period).toLowerCase()} nie jest jeszcze otwarta` : `${missing.length} aktywnych klientów nie ma jeszcze listy w tym miesiącu`),
        h('p', { class: 'hint', style: { marginTop: '4px' } },
          '„Nie dotyczy” ustawi się samo według profilu klienta (VAT, PIT/CIT, ZUS, pracownicy). Gdy profil nie jest uzupełniony, przejmiemy układ z poprzedniego miesiąca.')),
      h('button', { class: 'btn btn-primary', onclick: async (e) => {
        e.target.disabled = true;
        const { data, error } = await sb.rpc('generate_period', { p_period: pdate });
        if (error) { e.target.disabled = false; return fail(error); }
        toast(`Utworzono ${data} pozycji`);
        renderRozliczenia(main, params);
      } }, none ? 'Otwórz miesiąc' : 'Dodaj brakujących klientów'));
  }

  // ---------- filtrowanie ----------
  const filtered = (rows, area) => {
    const q = prefs.q.trim().toLowerCase();
    const field = AREAS[area].person;
    return rows.filter(c => {
      if (q && !c.name.toLowerCase().includes(q)) return false;
      if (prefs.person === 'me' && c[field] !== state.me.id) return false;
      if (prefs.person === 'none' && c[field]) return false;
      if (prefs.person && !['me', 'none'].includes(prefs.person) && c[field] !== prefs.person) return false;
      if (prefs.show === 'nierozliczeni' && isSettled(c, area)) return false;
      if (prefs.show === 'braki' && !hasMissing(c, area)) return false;
      if (prefs.show === 'uwagi' && !hasNote(c)) return false;
      return true;
    });
  };

  // ---------- komórki ----------
  function checkbox(entry, task, headerLabel) {
    if (!entry) return h('span', { class: 'muted small' }, '');
    const st = STATUS[entry.status];
    const who = entry.updated_by && entry.updated_by !== 'system'
      ? (state.members.find(m => m.email === entry.updated_by)?.short_name || entry.updated_by) : null;
    const tip = `${headerLabel}: ${st.label}` + (who ? `\nZmienił(a): ${who}, ${new Date(entry.updated_at).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : '');
    return h('button', { class: `cb cb-${entry.status === 'in_progress' ? 'todo' : entry.status}`, 'data-tip': tip, 'aria-label': tip,
      onclick: (ev) => statusMenu(ev.currentTarget, entry, headerLabel) }, st.mark);
  }

  function personCell(c, area) {
    const field = AREAS[area].person;
    const m = c[field] ? memberById(c[field]) : null;
    const b = h('button', { class: 'person' + (m ? '' : ' unassigned'), disabled: !editClients,
      'data-tip': editClients ? `Kliknij, aby zmienić: ${AREAS[area].personLabel.toLowerCase()}` : null,
      onclick: (ev) => personMenu(ev.currentTarget, c, field) },
    h('span', { class: 'av' }, m ? initials(m.full_name) : '+'), m ? m.short_name : 'przypisz');
    return b;
  }

  function employeesCell(c) {
    const v = c.has_employees;
    const cls = v === true ? 'yes' : v === false ? 'no' : 'unk';
    return h('button', { class: `pill ${cls}`, disabled: !editClients,
      'data-tip': 'Czy firma zatrudnia pracowników / zleceniobiorców' + (editClients ? ' · kliknij, aby zmienić' : ''),
      onclick: async () => {
        const next = v === true ? false : true;
        const { error } = await sb.from('clients').update({ has_employees: next }).eq('id', c.id);
        if (error) return fail(error);
        c.has_employees = next;
        // PIT-4 w tym miesiącu idzie za odpowiedzią
        const e = byClient.get(c.id)?.get('pit4');
        if (e && ((next === false && e.status === 'todo') || (next === true && e.status === 'na'))) {
          await setStatus(e, next ? 'todo' : 'na');
        } else refreshRow(c.id);
      } }, v === true ? 'Tak' : v === false ? 'Nie' : '?');
  }

  function sumCell(c, area) {
    const cs = cellsOf(c, area);
    const done = cs.filter(e => e.status === 'done' || e.status === 'na').length;
    if (cs.length && done === cs.length) return h('span', { class: 'sum ok' }, '✓ Rozliczony');
    if (cs.some(e => e.status === 'missing_docs')) return h('span', { class: 'sum bad', 'data-tip': 'Brakuje dokumentów' }, `! ${done}/${cs.length}`);
    return h('span', { class: 'sum no', 'data-tip': `Zrobione ${done} z ${cs.length}` }, `${done}/${cs.length}`);
  }

  function noteCell(c) {
    const n = noteMap.get(c.id) || {};
    const has = !!(n.notes?.trim()), q = !!(n.questions?.trim());
    const tip = (has ? `Uwagi: ${n.notes}` : '') + (has && q ? '\n' : '') + (q ? `Pytania: ${n.questions}` : '') || 'Dodaj uwagę lub pytanie';
    return h('button', { class: 'note-btn' + (has || q ? ' has' : '') + (q ? ' q' : ''), 'data-tip': tip, 'aria-label': 'Uwagi',
      html: ICON_NOTE + (q ? '<span class="dot"></span>' : ''), onclick: (ev) => notesMenu(ev.currentTarget, c) });
  }

  function rowFor(c, area, cols) {
    const settled = isSettled(c, area);
    return h('tr', { class: settled ? 'settled' : null, 'data-client': c.id, 'data-area': area },
      h('td', { class: 'c-name' }, h('div', { class: 'cname' },
        h('a', { href: `#/klient/${c.id}` }, c.name),
        h('div', { class: 'meta' }, h('span', { class: 'badge' }, LEGAL_SHORT[c.legal_form] || '?'),
          c.status !== 'aktywny' ? h('span', { class: 'badge warn' }, c.status === 'zawieszony' ? 'zawieszony' : 'zakończony') : null))),
      h('td', { class: 'c-person' }, personCell(c, area)),
      area === 'kadry' ? h('td', {}, employeesCell(c)) : null,
      cols.map(col => h('td', { class: 'c-task' }, checkbox(byClient.get(c.id)?.get(col.code), col, col.label))),
      h('td', { class: 'c-sum' }, sumCell(c, area)),
      h('td', {}, noteCell(c)));
  }

  function tableFor(area, section, rows) {
    const cols = colsFor(area, section);
    const allRows = section === 'nieaktywni' ? inactiveIn(area)
      : area === 'kadry' ? rowsIn('kadry') : rowsIn('ksiegowosc').filter(c => sectionOf(c) === section);
    const stat = (col) => {
      const rel = allRows.map(c => byClient.get(c.id)?.get(col.code)).filter(e => e && e.status !== 'na');
      return `${rel.filter(e => e.status === 'done').length}/${rel.length}`;
    };
    const thead = h('thead', {}, h('tr', {},
      h('th', { class: 'c-name' }, 'Klient'),
      h('th', { class: 'c-person' }, AREAS[area].personLabel),
      area === 'kadry' ? h('th', { 'data-tip': 'Czy firma zatrudnia pracowników lub zleceniobiorców' }, 'Pracownicy') : null,
      cols.map(col => h('th', { class: 'c-task', 'data-tip': col.description || col.label }, col.label, h('span', { class: 'sub' }, stat(col)))),
      h('th', { class: 'c-sum', 'data-tip': 'Rozliczony = wszystkie kratki „Zrobione” albo „Nie dotyczy”' }, 'Klient rozliczony'),
      h('th', { 'data-tip': 'Uwagi i pytania do klienta w tym miesiącu' }, 'Uwagi')));
    const tbody = h('tbody', {}, rows.map(c => rowFor(c, area, cols)));
    return h('div', { class: 'grid-wrap' + (section === 'nieaktywni' ? ' inactive' : '') }, h('table', { class: 'grid', 'data-section': section || 'kadry' }, thead, tbody));
  }

  function renderBody() {
    const area = prefs.area;
    const out = [];
    if (area === 'kadry') {
      const rows = filtered(rowsIn('kadry'), 'kadry');
      out.push(rows.length ? tableFor('kadry', null, rows) : emptyBox());
    } else {
      for (const section of ['osobowe', 'kapitalowe']) {
        const all = rowsIn('ksiegowosc').filter(c => sectionOf(c) === section);
        const rows = filtered(all, 'ksiegowosc');
        const settled = all.filter(c => isSettled(c, 'ksiegowosc')).length;
        out.push(h('div', { class: 'table-title' }, h('h2', {}, SECTIONS[section].title),
          h('span', { class: 'muted small' }, `rozliczeni ${settled} z ${all.length}`)));
        out.push(rows.length ? tableFor('ksiegowosc', section, rows) : emptyBox());
      }
    }
    // zawieszeni i zakończeni – osobno, bez wpływu na podsumowania
    const inactive = filtered(inactiveIn(area), area);
    if (inactiveIn(area).length) {
      const open = prefs.showInactive !== false;
      out.push(h('div', { class: 'table-title' },
        h('h2', {}, 'Zawieszeni i zakończeni'),
        h('span', { class: 'muted small' }, `${inactiveIn(area).length} · nie liczą się do podsumowań`),
        h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { prefs.showInactive = !open; savePrefs(prefs); renderBody(); } }, open ? 'Zwiń' : 'Pokaż')));
      if (open) out.push(inactive.length ? tableFor(area, 'nieaktywni', inactive) : emptyBox());
    }
    body.replaceChildren(...out);
    renderTiles(); renderTabs();
  }
  const emptyBox = () => h('div', { class: 'card empty' }, entries.length ? 'Żaden klient nie pasuje do filtrów.' : 'Brak listy na ten miesiąc – użyj przycisku „Otwórz miesiąc”.');

  function refreshRow(clientId) {
    const c = clientMap.get(clientId);
    body.querySelectorAll(`tr[data-client="${clientId}"]`).forEach(tr => {
      const area = tr.dataset.area;
      const section = tr.closest('table').dataset.section;
      tr.replaceWith(rowFor(c, area, colsFor(area, section === 'kadry' ? null : section)));
    });
    renderTiles(); renderTabs();
  }

  function renderAll() {
    renderPersonSel(); renderDeadlines(); renderBanner(); renderBody();
  }

  // ---------- zapisy ----------
  async function setStatus(entry, status) {
    const before = entry.status;
    entry.status = status; entry.updated_by = state.me.email; entry.updated_at = new Date().toISOString();
    refreshRow(entry.client_id);
    const { error } = await sb.from('checklist_entries').update({ status }).eq('id', entry.id);
    if (error) { entry.status = before; refreshRow(entry.client_id); fail(error, 'Nie zapisano'); }
  }

  // ---------- menu ----------
  function openPop(anchor, content) {
    closePop();
    const pop = h('div', { class: 'pop', role: 'menu' }, content);
    document.body.append(pop);
    const r = anchor.getBoundingClientRect();
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    pop.style.left = Math.max(8, Math.min(r.left, innerWidth - pw - 8)) + 'px';
    pop.style.top = (r.bottom + ph + 8 > innerHeight ? Math.max(8, r.top - ph - 6) : r.bottom + 6) + 'px';
    const close = (e) => {
      if (e.type === 'keydown' && e.key !== 'Escape') return;
      if (e.type === 'mousedown' && pop.contains(e.target)) return;
      closePop();
    };
    pop._cleanup = () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
    setTimeout(() => { document.addEventListener('mousedown', close); document.addEventListener('keydown', close); });
    (pop.querySelector('textarea, .opt.cur, .opt') || pop).focus?.();
    return pop;
  }
  function closePop() { const p = document.querySelector('.pop'); if (p) { p._cleanup?.(); p.remove(); } }

  function statusMenu(anchor, entry, label) {
    openPop(anchor, [h('label', {}, label),
      STATUS_ORDER.map(s => h('button', { class: 'opt' + (entry.status === s ? ' cur' : ''), role: 'menuitem',
        onclick: () => { closePop(); if (entry.status !== s) setStatus(entry, s); } },
      h('span', { class: `cb cb-${s}`, style: { width: '22px', height: '22px', fontSize: '12px' } }, STATUS[s].mark),
      s === 'todo' ? 'Wyczyść (do zrobienia)' : STATUS[s].label))]);
  }

  function personMenu(anchor, c, field) {
    const label = field === 'accountant_id' ? 'Księgowa' : 'Kadrowa';
    const pick = async (id) => {
      closePop();
      const before = c[field];
      c[field] = id; refreshRow(c.id);
      const { error } = await sb.from('clients').update({ [field]: id }).eq('id', c.id);
      if (error) { c[field] = before; refreshRow(c.id); fail(error); } else toast(`${label}: ${id ? memberById(id).short_name : 'brak'}`);
    };
    openPop(anchor, [h('label', {}, label),
      state.members.filter(m => m.active).map(m => h('button', { class: 'opt' + (c[field] === m.id ? ' cur' : ''), onclick: () => pick(m.id) },
        h('span', { class: 'person', style: { padding: 0 } }, h('span', { class: 'av' }, initials(m.full_name))), m.full_name)),
      h('div', { class: 'sep' }),
      h('button', { class: 'opt', onclick: () => pick(null) }, 'Usuń przypisanie')]);
  }

  function notesMenu(anchor, c) {
    const n = noteMap.get(c.id) || {};
    const ta1 = h('textarea', { placeholder: 'Np. trzeba zrobić w piątek, zaimportuj faktury…' }, n.notes || '');
    const ta2 = h('textarea', { placeholder: 'Np. jak ująć straty? brak pełnomocnictwa…' }, n.questions || '');
    const save = async () => {
      const payload = { client_id: c.id, period: pdate, notes: ta1.value.trim() || null, questions: ta2.value.trim() || null };
      const { error } = await sb.from('period_notes').upsert(payload, { onConflict: 'client_id,period' });
      if (error) return fail(error);
      noteMap.set(c.id, payload); closePop(); refreshRow(c.id); toast('Zapisano');
    };
    openPop(anchor, h('div', { class: 'pop-body' },
      h('label', {}, `Uwagi – ${c.name}`), ta1,
      h('label', {}, 'Pytania / problemy'), ta2,
      h('div', { class: 'row' }, h('button', { class: 'btn btn-ghost btn-sm', onclick: closePop }, 'Anuluj'),
        h('button', { class: 'btn btn-primary btn-sm', onclick: save }, 'Zapisz'))));
  }

  // ---------- eksport ----------
  function exportCsv() {
    const area = prefs.area;
    const out = [];
    const sections = [...(area === 'kadry' ? [null] : ['osobowe', 'kapitalowe']), 'nieaktywni'];
    for (const section of sections) {
      const cols = colsFor(area, section);
      const rows = filtered(section === 'nieaktywni' ? inactiveIn(area)
        : area === 'kadry' ? rowsIn('kadry') : rowsIn('ksiegowosc').filter(c => sectionOf(c) === section), area);
      if (section === 'nieaktywni' && !rows.length) continue;
      if (section) out.push([section === 'nieaktywni' ? 'Zawieszeni i zakończeni' : SECTIONS[section].title]);
      out.push(['Klient', AREAS[area].personLabel, ...(area === 'kadry' ? ['Pracownicy'] : []),
        ...cols.map(t => t.label), 'Rozliczony', 'Uwagi', 'Pytania']);
      rows.forEach(c => {
        const m = byClient.get(c.id);
        out.push([c.name, memberById(c[AREAS[area].person])?.short_name || '',
          ...(area === 'kadry' ? [c.has_employees === true ? 'tak' : c.has_employees === false ? 'nie' : ''] : []),
          ...cols.map(t => { const e = m?.get(t.code); return e ? (e.status === 'todo' || e.status === 'in_progress' ? '' : STATUS[e.status].label) : ''; }),
          isSettled(c, area) ? 'tak' : 'nie', noteMap.get(c.id)?.notes || '', noteMap.get(c.id)?.questions || '']);
      });
      out.push([]);
    }
    downloadCsv(`rozliczenia_${area}_${period}.csv`, out);
  }

  main.replaceChildren(head, tiles, deadlines, banner, toolbar, legend, body);
  renderAll();

  // ---------- zmiany na żywo od innych osób ----------
  const channel = sb.channel('rozliczenia-' + period)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'checklist_entries', filter: `period=eq.${pdate}` }, (p) => {
      const row = p.new;
      if (!row?.client_id || !clientMap.has(row.client_id) || p.eventType === 'DELETE') return;
      if (!byClient.has(row.client_id)) byClient.set(row.client_id, new Map());
      const cur = byClient.get(row.client_id).get(row.task_code);
      if (cur) Object.assign(cur, row); else { byClient.get(row.client_id).set(row.task_code, row); entries.push(row); }
      if (!document.querySelector('.pop')) refreshRow(row.client_id);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'period_notes', filter: `period=eq.${pdate}` }, (p) => {
      const row = p.new;
      if (!row?.client_id || !clientMap.has(row.client_id)) return;
      noteMap.set(row.client_id, row);
      if (!document.querySelector('.pop')) refreshRow(row.client_id);
    })
    .subscribe();

  return () => { sb.removeChannel(channel); closePop(); };
}
