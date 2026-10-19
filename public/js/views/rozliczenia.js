import { h, icon, toast, fail, periodLabel, shiftPeriod, defaultPeriod, downloadCsv, initials, printHtml } from '../ui.js';
import { sb, state, memberById, canEditClients } from '../store.js';
import { STATUS, STATUS_ORDER, LEGAL_SHORT, sectionOf, deadlinesFor } from '../dict.js';
import { downloadXlsx } from '../xlsx.js';
import { fileTile, dropZone, pastedFiles, named, safeName } from './zgloszenia.js';

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
const GROUPS = {
  osobowe: 'JDG i spółki osobowe',
  kapitalowe: 'Spółki z o.o. i pełna księgowość',
  nieaktywni: 'Zawieszeni i zakończeni',
};
const LAYOUT_MODES = {
  separate: 'Osobna tabela dla każdej grupy',
  active_one: 'Aktywni w jednej tabeli, zawieszeni osobno',
  all_one: 'Wszystko w jednej tabeli',
};
const DEFAULT_LAYOUT = {
  ksiegowosc: { groups: ['osobowe', 'kapitalowe', 'nieaktywni'], mode: 'separate' },
  kadry: { groups: ['osobowe', 'kapitalowe', 'nieaktywni'], mode: 'active_one' },
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
  // załączniki do uwag (tabela może jeszcze nie istnieć – wtedy po prostu brak plików)
  const fileCount = new Map();
  sb.from('period_files').select('client_id').eq('period', pdate).then(({ data }) => {
    (data || []).forEach(r => fileCount.set(r.client_id, (fileCount.get(r.client_id) || 0) + 1));
    fileCount.forEach((_, id) => { try { refreshRow(id); } catch { /* tabela jeszcze się rysuje */ } });
  });

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
  // pamięć podręczna obliczeń – tabela przerysowuje się bez ponownego liczenia wszystkiego
  const tasksCache = new Map();
  const tasksFor = (area, section) => {
    const k = area + '|' + (area === 'kadry' ? '' : section);
    if (!tasksCache.has(k)) tasksCache.set(k, tasksAll.filter(t => t.area === area && (area === 'kadry' || t.applies_to === 'all' || t.applies_to === section)));
    return tasksCache.get(k);
  };
  const cellsCache = new Map();
  const cellsOf = (c, area) => {
    const k = c.id + '|' + area;
    let v = cellsCache.get(k);
    if (!v) {
      const m = byClient.get(c.id);
      v = !m ? [] : (area === 'kadry' ? tasksFor('kadry') : tasksFor('ksiegowosc', sectionOf(c))).map(t => m.get(t.code)).filter(Boolean);
      cellsCache.set(k, v);
    }
    return v;
  };
  const rowsCache = new Map();
  // do statusu „rozliczony” liczą się tylko kolumny oznaczone counts_to_settled (np. bez wyciągów bankowych)
  const countsCode = new Set(tasksAll.filter(t => t.counts_to_settled !== false).map(t => t.code));
  const requiredOf = (c, area) => cellsOf(c, area).filter(e => countsCode.has(e.task_code));
  const isSettled = (c, area) => { const cs = requiredOf(c, area); return cs.length > 0 && cs.every(e => e.status === 'done' || e.status === 'na'); };
  const hasMissing = (c, area) => cellsOf(c, area).some(e => e.status === 'missing_docs');
  // JPK VAT (księgowość) / ZUS (kadry) jeszcze niewysłane: kratka nie jest „Zrobione” ani „Nie dotyczy”
  const pendingSend = (c, area) => {
    const e = byClient.get(c.id)?.get(area === 'kadry' ? 'zus_wyslany' : 'jpk');
    return !!e && e.status !== 'done' && e.status !== 'na';
  };
  const hasNote = c => !!(noteMap.get(c.id)?.notes?.trim() || noteMap.get(c.id)?.questions?.trim());
  // aktywni liczą się do podsumowań; zawieszeni i zakończeni idą do osobnej tabeli
  const withCells = (area) => {
    if (!rowsCache.has(area)) rowsCache.set(area, clients.filter(c => cellsOf(c, area).length > 0).sort((a, b) => a.name.localeCompare(b.name, 'pl')));
    return rowsCache.get(area);
  };
  const rowsIn = (area) => withCells(area).filter(c => c.status === 'aktywny');
  const inactiveIn = (area) => withCells(area).filter(c => c.status !== 'aktywny');
  const colsFor = (area, section) => {
    if (area === 'kadry') return tasksFor('kadry');
    if (section === 'nieaktywni') return tasksFor('ksiegowosc', 'kapitalowe');
    return tasksFor('ksiegowosc', section).map(t => t.code === 'pit_cit' ? { ...t, label: SECTIONS[section].pitLabel } : t);
  };

  // ---------- układ tabel (wybór grup, osobno / razem) ----------
  const layout = () => {
    const l = { ...DEFAULT_LAYOUT[prefs.area], ...(prefs.layout?.[prefs.area] || {}) };
    l.groups = Object.keys(GROUPS).filter(g => l.groups.includes(g));
    return l;
  };
  const setLayout = (patch) => {
    prefs.layout = { ...(prefs.layout || {}), [prefs.area]: { ...layout(), ...patch } };
    savePrefs(prefs); renderBody();
  };
  const groupRows = (area, g) => g === 'nieaktywni' ? inactiveIn(area) : rowsIn(area).filter(c => sectionOf(c) === g);
  const colsForGroups = (area, groups) => {
    if (area === 'kadry') return tasksFor('kadry');
    const act = groups.filter(g => g !== 'nieaktywni');
    if (act.length === 1) return colsFor('ksiegowosc', act[0]);
    return tasksFor('ksiegowosc', 'kapitalowe'); // wspólna: PIT / CIT + wyciągi bankowe
  };
  // Lista tabel do pokazania / pobrania: [{ key, title, groups, all, rows, cols }]
  function tablesModel() {
    const area = prefs.area, l = layout();
    const sorted = list => [...list].sort((a, b) => a.name.localeCompare(b.name, 'pl'));
    const make = (groups) => {
      const all = sorted(groups.flatMap(g => groupRows(area, g)));
      return { key: groups.join('+'), groups, title: groups.map(g => GROUPS[g]).join(' + '),
        all, rows: filtered(all, area), cols: colsForGroups(area, groups),
        inactiveOnly: groups.length === 1 && groups[0] === 'nieaktywni' };
    };
    const active = l.groups.filter(g => g !== 'nieaktywni');
    if (l.mode === 'all_one') return l.groups.length ? [make(l.groups)] : [];
    if (l.mode === 'active_one') return [...(active.length ? [make(active)] : []), ...(l.groups.includes('nieaktywni') ? [make(['nieaktywni'])] : [])];
    return l.groups.map(g => make([g]));
  }
  // aktywni klienci w wybranych grupach – do kafelków
  const selectedActive = (area) => {
    const gs = layout().groups.filter(g => g !== 'nieaktywni');
    return rowsIn(area).filter(c => gs.includes(sectionOf(c)));
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
  const exportBtn = h('button', { class: 'btn btn-outline btn-sm', onclick: (ev) => exportMenu(ev.currentTarget) }, icon('download'), 'Pobierz');
  const ICON_LAYOUT = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/></svg>';
  const layoutBtn = h('button', { class: 'btn btn-outline btn-sm', 'data-tip': 'Wybierz grupy klientów i czy mają być w jednej tabeli', onclick: (ev) => layoutMenu(ev.currentTarget) },
    h('span', { html: ICON_LAYOUT, style: { display: 'inline-flex' } }), 'Układ tabel');
  const ICON_FS = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
  const ICON_FS_EXIT = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>';
  const fsBtn = h('button', { class: 'btn btn-primary btn-sm', 'data-tip': 'Tabela na cały ekran (Esc – wyjście)' });
  const setFs = (on) => {
    document.body.classList.toggle('focus-mode', on);
    fsBtn.replaceChildren(h('span', { html: on ? ICON_FS_EXIT : ICON_FS, style: { display: 'inline-flex' } }), on ? 'Zamknij pełny ekran' : 'Pełny ekran');
  };
  fsBtn.addEventListener('click', async () => {
    const on = !document.body.classList.contains('focus-mode');
    setFs(on);
    try {
      if (on && !document.fullscreenElement) await document.documentElement.requestFullscreen?.();
      if (!on && document.fullscreenElement) await document.exitFullscreen?.();
    } catch { /* przeglądarka nie pozwala – zostaje tryb w oknie */ }
  });
  const onFsChange = () => { if (!document.fullscreenElement && document.body.classList.contains('focus-mode')) setFs(false); };
  const onKey = (e) => { if (e.key === 'Escape' && document.body.classList.contains('focus-mode') && !document.querySelector('.pop')) setFs(false); };
  document.addEventListener('fullscreenchange', onFsChange);
  document.addEventListener('keydown', onKey);
  setFs(false);
  const toolbar = h('div', { class: 'toolbar' }, search, personSel, showSel, layoutBtn, exportBtn, fsBtn);
  const onFilter = () => { Object.assign(prefs, { q: search.value, person: personSel.value, show: showSel.value }); savePrefs(prefs); renderBody(); };
  let searchTimer;
  search.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(onFilter, 180); });
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
    const rows = selectedActive(area);
    const settled = rows.filter(c => isSettled(c, area)).length;
    const toSend = rows.filter(c => pendingSend(c, area)).length;
    const miss = rows.filter(c => hasMissing(c, area)).length;
    const nts = rows.filter(hasNote).length;
    const pct = rows.length ? Math.round(settled / rows.length * 100) : 0;
    const tile = (n, lbl, show) => h('button', { class: 'card tile' + (prefs.show === show ? ' on' : ''), style: { textAlign: 'left', cursor: 'pointer' },
      onclick: () => { prefs.show = prefs.show === show ? '' : show; showSel.value = prefs.show; savePrefs(prefs); renderBody(); } },
    h('span', { class: 'lbl' }, lbl), h('span', { class: 'num' }, n));
    tiles.replaceChildren(
      h('div', { class: 'card tile dark' }, h('span', { class: 'lbl' }, `Rozliczeni – ${AREAS[area].label.toLowerCase()}`),
        h('span', { class: 'num' }, `${settled} / ${rows.length}`), h('div', { class: 'bar' }, h('i', { style: { width: pct + '%' } }))),
      tile(toSend, area === 'kadry' ? 'ZUS do wysłania' : 'JPK VAT do wysłania', 'do_wyslania'),
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
      if (prefs.show === 'do_wyslania' && !pendingSend(c, area)) return false;
      if (prefs.show === 'z_prac' && c.has_employees !== true) return false;
      if (prefs.show === 'jdg_bez' && !(c.has_employees === false && sectionOf(c) === 'osobowe')) return false;
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

  const empLabel = (c, v) => v === true ? 'Tak' : v === false ? (sectionOf(c) === 'osobowe' ? 'JDG bez pracowników' : 'Nie') : '?';
  function employeesCell(c) {
    const v = c.has_employees;
    const cls = v === true || (v === false && sectionOf(c) === 'osobowe') ? 'yes' : v === false ? 'no' : 'unk';
    return h('button', { class: `pill ${cls}`, disabled: !editClients,
      'data-tip': (v === false && sectionOf(c) === 'osobowe' ? 'JDG bez pracowników – rozliczamy tylko ZUS właściciela, PIT-4 nie dotyczy' : 'Czy firma zatrudnia pracowników / zleceniobiorców') + (editClients ? ' · kliknij, aby zmienić' : ''),
      onclick: (ev) => employeesMenu(ev.currentTarget, c) }, empLabel(c, v));
  }
  function employeesMenu(anchor, c) {
    const pick = async (next) => {
      closePop();
      if (c.has_employees === next) return;
      const { error } = await sb.from('clients').update({ has_employees: next }).eq('id', c.id);
      if (error) return fail(error);
      c.has_employees = next;
      // PIT-4 w tym miesiącu idzie za odpowiedzią
      const e = byClient.get(c.id)?.get('pit4');
      if (e && ((next === false && e.status === 'todo') || (next === true && e.status === 'na'))) await setStatus(e, next ? 'todo' : 'na');
      else refreshRow(c.id);
    };
    const opt = (val, label, cls) => h('button', { class: 'opt' + (c.has_employees === val ? ' cur' : ''), onclick: () => pick(val) },
      h('span', { class: `pill ${cls}`, style: { minWidth: '18px', height: '18px', padding: 0 } }), label);
    openPop(anchor, [h('label', {}, 'Pracownicy'),
      opt(true, 'Tak – ma pracowników', 'yes'),
      opt(false, sectionOf(c) === 'osobowe' ? 'JDG bez pracowników' : 'Nie – bez pracowników', 'no'),
      opt(null, 'Nie wiadomo', 'unk')]);
  }

  function sumCell(c, area) {
    const cs = requiredOf(c, area);
    const done = cs.filter(e => e.status === 'done' || e.status === 'na').length;
    if (cs.length && done === cs.length) return h('span', { class: 'sum ok' }, '✓ Rozliczony');
    if (cs.some(e => e.status === 'missing_docs')) return h('span', { class: 'sum bad', 'data-tip': 'Brakuje dokumentów' }, `! ${done}/${cs.length}`);
    return h('span', { class: 'sum no', 'data-tip': `Zrobione ${done} z ${cs.length}` }, `${done}/${cs.length}`);
  }

  function noteCell(c) {
    const n = noteMap.get(c.id) || {};
    const has = !!(n.notes?.trim()), q = !!(n.questions?.trim());
    const fc = fileCount.get(c.id) || 0;
    const tip = ((has ? `Uwagi: ${n.notes}` : '') + (has && q ? '\n' : '') + (q ? `Pytania: ${n.questions}` : '') + (fc ? `${has || q ? '\n' : ''}Załączniki: ${fc}` : '')) || 'Dodaj uwagę, pytanie lub zrzut ekranu';
    return h('button', { class: 'note-btn' + (has || q || fc ? ' has' : '') + (q ? ' q' : ''), 'data-tip': tip, 'aria-label': 'Uwagi',
      html: ICON_NOTE + (q ? '<span class="dot"></span>' : '') + (fc ? `<span class="clip">${fc}</span>` : ''), onclick: (ev) => notesMenu(ev.currentTarget, c) });
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
      cols.map(col => h('td', { class: 'c-task' }, (col.applies_to && col.applies_to !== 'all' && col.applies_to !== sectionOf(c))
        ? h('span', { class: 'muted small', 'data-tip': 'Nie dotyczy tej formy' }, '·')
        : checkbox(byClient.get(c.id)?.get(col.code), col, col.label))),
      h('td', { class: 'c-sum' }, sumCell(c, area)),
      h('td', {}, noteCell(c)));
  }

  function tableFor(area, t) {
    const cols = t.cols;
    const stat = (col) => {
      const rel = t.all.map(c => byClient.get(c.id)?.get(col.code)).filter(e => e && e.status !== 'na');
      return `${rel.filter(e => e.status === 'done').length}/${rel.length}`;
    };
    const thead = h('thead', {}, h('tr', {},
      h('th', { class: 'c-name' }, 'Klient'),
      h('th', { class: 'c-person' }, AREAS[area].personLabel),
      area === 'kadry' ? h('th', { 'data-tip': 'Czy firma zatrudnia pracowników lub zleceniobiorców' }, 'Pracownicy') : null,
      cols.map(col => h('th', { class: 'c-task' + (col.counts_to_settled === false ? ' optional' : ''), 'data-tip': (col.description || col.label) + (col.counts_to_settled === false ? '\nNie wpływa na status „Klient rozliczony”.' : '') },
        col.label, h('span', { class: 'sub' }, stat(col) + (col.counts_to_settled === false ? ' · info' : '')))),
      h('th', { class: 'c-sum', 'data-tip': 'Rozliczony = wszystkie kratki „Zrobione” albo „Nie dotyczy”' }, 'Klient rozliczony'),
      h('th', { 'data-tip': 'Uwagi i pytania do klienta w tym miesiącu' }, 'Uwagi')));
    const tbody = h('tbody', {}, t.rows.map(c => rowFor(c, area, cols)));
    const table = h('table', { class: 'grid' }, thead, tbody);
    table._cols = cols;
    return h('div', { class: 'grid-wrap' + (t.inactiveOnly ? ' inactive' : '') }, table);
  }

  function renderBody() {
    const area = prefs.area;
    const model = tablesModel();
    const out = [];
    if (!model.length) out.push(h('div', { class: 'card empty' }, 'Nie wybrano żadnej grupy – zaznacz grupy w „Układ tabel”.'));
    for (const t of model) {
      const act = t.all.filter(c => c.status === 'aktywny');
      const settled = act.filter(c => isSettled(c, area)).length;
      const collapsible = t.inactiveOnly;
      const open = !collapsible || prefs.showInactive !== false;
      out.push(h('div', { class: 'table-title' }, h('h2', {}, t.title),
        h('span', { class: 'muted small' }, t.inactiveOnly ? `${t.all.length} · nie liczą się do podsumowań`
          : `rozliczeni ${settled} z ${act.length}` + (act.length !== t.all.length ? ` · ${t.all.length - act.length} zawieszonych/zakończonych poza podsumowaniem` : '')),
        collapsible ? h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { prefs.showInactive = !open; savePrefs(prefs); renderBody(); } }, open ? 'Zwiń' : 'Pokaż') : null));
      if (open) out.push(t.rows.length ? tableFor(area, t) : emptyBox());
    }
    body.replaceChildren(...out);
    renderTiles(); renderTabs();
  }
  const emptyBox = () => h('div', { class: 'card empty' }, entries.length ? 'Żaden klient nie pasuje do filtrów.' : 'Brak listy na ten miesiąc – użyj przycisku „Otwórz miesiąc”.');

  let summaryQueued = false;
  const queueSummary = () => {
    if (summaryQueued) return; summaryQueued = true;
    requestAnimationFrame(() => { summaryQueued = false; renderTiles(); renderTabs(); });
  };
  function refreshRow(clientId) {
    const c = clientMap.get(clientId);
    body.querySelectorAll(`tr[data-client="${clientId}"]`).forEach(tr => {
      const area = tr.dataset.area;
      tr.replaceWith(rowFor(c, area, tr.closest('table')._cols));
    });
    queueSummary();
  }

  function renderShowSel() {
    const opts = [['', 'Wszyscy klienci'], ['nierozliczeni', 'Tylko nierozliczeni'],
      ['do_wyslania', prefs.area === 'kadry' ? 'ZUS do wysłania' : 'JPK VAT do wysłania'],
      ['braki', 'Z brakiem dokumentów'], ['uwagi', 'Z uwagami / pytaniami']];
    if (prefs.area === 'kadry') opts.push(['z_prac', 'Firmy z pracownikami'], ['jdg_bez', 'JDG bez pracowników']);
    else if (['z_prac', 'jdg_bez'].includes(prefs.show)) prefs.show = '';
    showSel.replaceChildren(...opts.map(([v, l]) => h('option', { value: v }, l)));
    showSel.value = prefs.show;
  }

  function renderAll() {
    renderShowSel(); renderPersonSel(); renderDeadlines(); renderBanner(); renderBody();
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
      if (e.type === 'mousedown' && (pop.contains(e.target) || e.target.closest?.('.modal-back'))) return;
      if (e.type === 'keydown' && document.querySelector('.modal-back')) return;
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
    const files = h('div', { class: 'tk-files pf-files' });
    const pop = openPop(anchor, h('div', { class: 'pop-body pop-notes' },
      h('label', {}, `Uwagi – ${c.name}`), ta1,
      h('label', {}, 'Pytania / problemy'), ta2,
      h('label', {}, 'Załączniki – zrzuty ekranu, PDF, inne pliki'),
      dropZone(fs => addFiles(fs), 'albo wklej zrzut Ctrl+V / ⌘V'), files,
      h('div', { class: 'row' }, h('button', { class: 'btn btn-ghost btn-sm', onclick: closePop }, 'Anuluj'),
        h('button', { class: 'btn btn-primary btn-sm', onclick: save }, 'Zapisz'))));
    const ar = anchor.getBoundingClientRect();
    const place = () => { const r = ar, ph = pop.offsetHeight; pop.style.top = Math.max(8, Math.min(r.bottom + 6, innerHeight - ph - 8)) + 'px'; };
    async function loadFiles() {
      const { data, error } = await sb.from('period_files').select('*').eq('client_id', c.id).eq('period', pdate).order('created_at');
      if (error) { files.replaceChildren(h('p', { class: 'hint' }, 'Załączniki będą dostępne po aktualizacji bazy danych.')); return; }
      fileCount.set(c.id, data.length); refreshRow(c.id);
      files.replaceChildren(...data.map(f => fileTile({ ...f, bucket: 'rozliczenia' }, { onDelete: (f.uploaded_by === state.me.id || state.me.role === 'admin') ? async () => {
        if (!confirm(`Usunąć załącznik „${f.name}”?`)) return;
        const { error: e1 } = await sb.from('period_files').delete().eq('id', f.id);
        if (e1) return fail(e1);
        await sb.storage.from('rozliczenia').remove([f.path]);
        loadFiles();
      } : null })));
      place();
    }
    async function addFiles(fs) {
      pop.classList.add('busy');
      let ok = 0;
      for (const raw of fs) {
        const f = named(raw);
        if (f.size > 25 * 1048576) { toast(`„${f.name}” jest większy niż 25 MB`, true); continue; }
        const path = `${c.id}/${period}/${crypto.randomUUID().slice(0, 8)}-${safeName(f.name)}`;
        const { error } = await sb.storage.from('rozliczenia').upload(path, f, { contentType: f.type || 'application/octet-stream', upsert: false });
        if (error) { fail(error, `Nie udało się wysłać „${f.name}”`); continue; }
        const { error: e2 } = await sb.from('period_files').insert({ client_id: c.id, period: pdate, path, name: f.name, mime: f.type || null, size: f.size, uploaded_by: state.me.id });
        if (e2) { await sb.storage.from('rozliczenia').remove([path]); fail(e2); continue; }
        ok++;
      }
      pop.classList.remove('busy');
      if (ok) toast(ok === 1 ? 'Dodano załącznik' : `Dodano załączniki: ${ok}`);
      loadFiles();
    }
    pop.addEventListener('paste', e => { const fs = pastedFiles(e); if (fs.length) { e.preventDefault(); addFiles(fs); } });
    loadFiles();
  }

  // ---------- menu układu ----------
  const chkStyle = { textTransform: 'none', letterSpacing: 0, fontSize: '13.5px', fontWeight: 500, color: 'var(--ink)', padding: '5px 0' };
  function layoutMenu(anchor) {
    const l = layout();
    const box = h('div', { class: 'pop-body' },
      h('label', {}, 'Pokaż grupy'),
      Object.entries(GROUPS).map(([g, title]) => {
        const cb = h('input', { type: 'checkbox', checked: l.groups.includes(g) });
        cb.addEventListener('change', () => {
          const groups = cb.checked ? [...layout().groups, g] : layout().groups.filter(x => x !== g);
          setLayout({ groups });
        });
        return h('label', { class: 'check', style: chkStyle }, cb, title);
      }),
      h('div', { class: 'sep' }),
      h('label', {}, 'Układ'),
      Object.entries(LAYOUT_MODES).map(([m, title]) => {
        const rb = h('input', { type: 'radio', name: 'layout-mode', checked: l.mode === m });
        rb.addEventListener('change', () => setLayout({ mode: m }));
        return h('label', { class: 'check', style: chkStyle }, rb, title);
      }),
      h('div', { class: 'row', style: { marginTop: '8px' } },
        h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { setLayout({ ...DEFAULT_LAYOUT[prefs.area] }); closePop(); } }, 'Przywróć domyślny'),
        h('button', { class: 'btn btn-primary btn-sm', onclick: closePop }, 'Gotowe')));
    openPop(anchor, box);
  }

  function exportMenu(anchor) {
    const item = (label, sub, fn) => h('button', { class: 'opt', onclick: () => { closePop(); fn(); } },
      h('span', {}, h('b', {}, label), h('div', { class: 'small muted' }, sub)));
    openPop(anchor, [h('label', {}, 'Pobierz widoczne tabele'),
      item('Excel (.xlsx)', 'kolory statusów, każda tabela w osobnym arkuszu', exportXlsx),
      item('PDF', 'wydruk poziomy – wybierz „Zapisz jako PDF”', exportPdf),
      item('CSV', 'prosty plik tekstowy (średniki)', exportCsv)]);
  }

  // ---------- eksport ----------
  const statusText = (e) => !e ? '' : (e.status === 'todo' || e.status === 'in_progress') ? '' : STATUS[e.status].label;
  const statusStyle = (e) => !e ? 'normal' : ({ done: 'done', na: 'na', missing_docs: 'missing' }[e.status] || 'todo');
  const empText = (c) => c.has_employees === true ? 'Tak' : c.has_employees === false ? (sectionOf(c) === 'osobowe' ? 'JDG bez pracowników' : 'Nie') : '';
  const filterInfo = () => {
    const parts = [];
    if (prefs.q) parts.push(`szukaj: „${prefs.q}”`);
    if (prefs.person) parts.push(`${AREAS[prefs.area].personLabel.toLowerCase()}: ${prefs.person === 'me' ? 'moi klienci' : prefs.person === 'none' ? 'bez przypisania' : memberById(prefs.person)?.short_name}`);
    if (prefs.show) parts.push(showSel.options[showSel.selectedIndex]?.text?.toLowerCase());
    return parts.length ? 'Filtry: ' + parts.join(', ') : 'Bez filtrów';
  };
  const fileBase = () => `rozliczenia_${prefs.area === 'kadry' ? 'kadry-zus' : 'ksiegowosc'}_${period}`;

  function exportXlsx() {
    const area = prefs.area;
    const sheets = tablesModel().map(t => {
      const header = ['Klient', 'Forma', AREAS[area].personLabel, ...(area === 'kadry' ? ['Pracownicy'] : []), ...t.cols.map(c => c.label), 'Klient rozliczony', 'Uwagi', 'Pytania / problemy'];
      const rows = [
        [{ v: `${AREAS[area].label} – ${t.title} – ${periodLabel(period)}`, s: 'title' }],
        [{ v: `RKDP · wygenerowano ${new Date().toLocaleString('pl-PL')} · ${filterInfo()}`, s: 'sub' }],
        header.map(v => ({ v, s: 'header' })),
        ...t.rows.map(c => {
          const m = byClient.get(c.id);
          const cs = requiredOf(c, area), done = cs.filter(e => e.status === 'done' || e.status === 'na').length;
          return [
            { v: c.name + (c.status !== 'aktywny' ? ` (${c.status === 'zawieszony' ? 'zawieszony' : 'zakończony'})` : ''), s: 'wrap' },
            LEGAL_SHORT[c.legal_form] || '', memberById(c[AREAS[area].person])?.short_name || '',
            ...(area === 'kadry' ? [empText(c)] : []),
            ...t.cols.map(col => { const e = m?.get(col.code); return { v: statusText(e), s: e ? statusStyle(e) : 'normal' }; }),
            isSettled(c, area) ? { v: 'Rozliczony', s: 'settled' } : { v: `${done}/${cs.length}`, s: cs.some(e => e.status === 'missing_docs') ? 'missing' : 'todo' },
            { v: noteMap.get(c.id)?.notes || '', s: 'wrap' }, { v: noteMap.get(c.id)?.questions || '', s: 'wrap' }];
        })];
      const widths = [38, 11, 14, ...(area === 'kadry' ? [20] : []), ...t.cols.map(() => 16), 18, 40, 40];
      const short = { osobowe: 'JDG i osobowe', kapitalowe: 'Sp. z o.o.', nieaktywni: 'Zawieszeni' };
      return { name: t.groups.map(g => short[g]).join(' + '), rows, widths, freeze: { row: 3, col: 1 } };
    });
    if (!sheets.length) return toast('Brak tabel do pobrania', true);
    downloadXlsx(fileBase() + '.xlsx', sheets);
  }

  function exportPdf() {
    const area = prefs.area;
    const esc = (v) => String(v ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    const mark = (e) => !e ? '' : `<span class="m m-${e.status === 'in_progress' ? 'todo' : e.status}">${STATUS[e.status].mark || ''}</span>`;
    const tables = tablesModel().map(t => {
      const head = `<tr><th class="l">Klient</th><th class="l">${AREAS[area].personLabel}</th>${area === 'kadry' ? '<th>Pracownicy</th>' : ''}${t.cols.map(c => `<th>${esc(c.label)}</th>`).join('')}<th>Rozliczony</th><th class="l">Uwagi</th></tr>`;
      const rows = t.rows.map(c => {
        const m = byClient.get(c.id);
        const cs = requiredOf(c, area), done = cs.filter(e => e.status === 'done' || e.status === 'na').length;
        const n = noteMap.get(c.id) || {};
        return `<tr class="${isSettled(c, area) ? 'ok' : ''}"><td class="l"><b>${esc(c.name)}</b> <span class="f">${esc(LEGAL_SHORT[c.legal_form] || '')}${c.status !== 'aktywny' ? ' · ' + esc(c.status) : ''}</span></td>
          <td class="l">${esc(memberById(c[AREAS[area].person])?.short_name || '')}</td>
          ${area === 'kadry' ? `<td>${esc(empText(c))}</td>` : ''}
          ${t.cols.map(col => `<td>${mark(m?.get(col.code))}</td>`).join('')}
          <td>${isSettled(c, area) ? '<b class="s">✓</b>' : `${done}/${cs.length}`}</td>
          <td class="l n">${esc([n.notes, n.questions && 'Pytania: ' + n.questions].filter(Boolean).join(' · '))}</td></tr>`;
      }).join('');
      return `<h2>${esc(t.title)} <small>${t.rows.length} klientów</small></h2><table><thead>${head}</thead><tbody>${rows}</tbody></table>`;
    }).join('');
    const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>${esc(fileBase())}</title>
<style>
@page{size:A4 landscape;margin:10mm}
*{box-sizing:border-box}body{font-family:Montserrat,Arial,sans-serif;color:#1D1A16;font-size:9.5px;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #7A5A37;padding-bottom:6px;margin-bottom:8px}
header h1{font-size:16px;margin:0}header p{margin:2px 0 0;color:#6A6157}
header img{height:28px}
h2{font-size:12px;margin:12px 0 4px}h2 small{font-weight:400;color:#6A6157}
table{width:100%;border-collapse:collapse;page-break-inside:auto}
thead{display:table-header-group}tr{page-break-inside:avoid}
th{background:#F0E9DE;color:#4A433B;font-size:8.5px;padding:4px;border-bottom:1px solid #DCCFBC}
td{padding:3px 4px;border-bottom:1px solid #E3D9CA;text-align:center;vertical-align:middle}
.l{text-align:left}.f{color:#8F8579;font-size:8px}.n{font-size:8px;color:#4A433B;max-width:220px}
tr.ok td{background:#EAF2E5}
.m{display:inline-block;width:14px;height:14px;line-height:12px;border-radius:3px;border:1.2px solid #CFC4B4;font-weight:700;font-size:10px}
.m-done{background:#3E6B47;border-color:#3E6B47;color:#fff}.m-na{background:#EFE9E0;color:#A79C8E}
.m-missing_docs{background:#F6E1DA;border-color:#A4462F;color:#A4462F}
.s{color:#3E6B47}.legend{margin-top:8px;color:#6A6157;font-size:8.5px}
</style></head><body>
<header><div><h1>${esc(AREAS[area].label)} – ${esc(periodLabel(period))}</h1><p>${esc(filterInfo())} · wygenerowano ${esc(new Date().toLocaleString('pl-PL'))}</p></div>
<img src="${location.origin}/logo-rkdp.png" alt="RKDP"></header>
${tables || '<p>Brak danych.</p>'}
<p class="legend"><span class="m m-done">✓</span> zrobione &nbsp; <span class="m m-na">–</span> nie dotyczy &nbsp; <span class="m m-missing_docs">!</span> brak dokumentów &nbsp; <span class="m"></span> do zrobienia</p>
</body></html>`;
    printHtml(html);
  }

  function exportCsv() {
    const area = prefs.area;
    const out = [[`${AREAS[area].label} – ${periodLabel(period)}`], [filterInfo()], []];
    for (const t of tablesModel()) {
      out.push([t.title]);
      out.push(['Klient', 'Forma', AREAS[area].personLabel, ...(area === 'kadry' ? ['Pracownicy'] : []), ...t.cols.map(c => c.label), 'Rozliczony', 'Uwagi', 'Pytania']);
      t.rows.forEach(c => {
        const m = byClient.get(c.id);
        out.push([c.name, LEGAL_SHORT[c.legal_form] || '', memberById(c[AREAS[area].person])?.short_name || '',
          ...(area === 'kadry' ? [empText(c)] : []),
          ...t.cols.map(col => statusText(m?.get(col.code))),
          isSettled(c, area) ? 'tak' : 'nie', noteMap.get(c.id)?.notes || '', noteMap.get(c.id)?.questions || '']);
      });
      out.push([]);
    }
    downloadCsv(fileBase() + '.csv', out);
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
      if (cur && cur.status === row.status) return; // własna zmiana – już narysowana
      if (cur) Object.assign(cur, row);
      else { byClient.get(row.client_id).set(row.task_code, row); entries.push(row); cellsCache.clear(); rowsCache.clear(); }
      if (!document.querySelector('.pop')) refreshRow(row.client_id);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'period_notes', filter: `period=eq.${pdate}` }, (p) => {
      const row = p.new;
      if (!row?.client_id || !clientMap.has(row.client_id)) return;
      noteMap.set(row.client_id, row);
      if (!document.querySelector('.pop')) refreshRow(row.client_id);
    })
    .subscribe();

  return () => {
    sb.removeChannel(channel); closePop();
    document.removeEventListener('fullscreenchange', onFsChange); document.removeEventListener('keydown', onKey);
    document.body.classList.remove('focus-mode');
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  };
}
