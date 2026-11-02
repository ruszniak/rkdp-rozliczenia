import { AMOUNT_CODES, openAmounts } from '../kwoty.js';
import { h, icon, infoTip, toast, toastAction, fail, periodLabel, shiftPeriod, defaultPeriod, downloadCsv, initials, printHtml, ava } from '../ui.js';
import { sb, state, memberById, canEditClients } from '../store.js';
import { STATUS, STATUS_ORDER, LEGAL_SHORT, sectionOf, deadlinesFor } from '../dict.js';
import { downloadXlsx } from '../xlsx.js';
import { openDocRequest } from '../prosba.js';
import { openMessage } from '../wiadomosc.js';
import { celebrate } from '../efekty.js';
import { sparkline } from '../wykres.js';
import { loadMemberPrefs, saveMemberPrefs, settledHistory, lastPeriods } from '../data.js';
import { setDensity } from '../motyw.js';

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
  kadry: { label: 'Płace', person: 'hr_id', personLabel: 'Kadrowa' },
  // wyciągi bankowe – osobna lista, narastająco od początku roku (miesiące w kolumnach)
  wyciagi: { label: 'Wyciągi', person: 'accountant_id', personLabel: 'Księgowa' },
};
const MONTHS_SHORT = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
const MONTHS_FULL = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
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
  wyciagi: { groups: ['osobowe', 'kapitalowe', 'nieaktywni'], mode: 'active_one' },
};
const SECTIONS = {
  osobowe: { title: 'JDG i spółki osobowe', pitLabel: 'PIT' },
  kapitalowe: { title: 'Spółki z o.o. i pełna księgowość', pitLabel: 'CIT' },
};
const ICON_NOTE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

const PHONE = () => window.matchMedia('(max-width: 700px)').matches;

export async function renderRozliczenia(main, params) {
  const period = /^\d{4}-\d{2}$/.test(params.get('okres') || '') ? params.get('okres') : defaultPeriod();
  const pdate = period + '-01';
  const prefs = { area: 'ksiegowosc', q: '', person: '', show: '', ...loadPrefs() };
  if (params.get('widok') && AREAS[params.get('widok')]) prefs.area = params.get('widok');
  const editClients = canEditClients();

  main.replaceChildren(h('div', { class: 'spinner' }, 'Wczytywanie rozliczeń…'));
  const [clients, entries, notes, pEntries, partners] = await Promise.all([
    fetchAll(() => sb.from('clients')
      .select('id,name,status,legal_form,bookkeeping,has_employees,accountant_id,hr_id,email').order('name')),
    fetchAll(() => sb.from('checklist_entries').select('id,client_id,task_code,status,updated_by,updated_at,amount,due_date').eq('period', pdate)),
    fetchAll(() => sb.from('period_notes').select('client_id,notes,questions').eq('period', pdate)),
    // kratki wspólników spółek osobowych (PIT, ZUS każdego wspólnika) – tabela może jeszcze nie istnieć
    sb.from('partner_entries').select('id,partner_id,client_id,task_code,status,updated_by,updated_at').eq('period', pdate).then(r => r.data || [], () => []),
    sb.from('client_partners').select('id,client_id,full_name').eq('settled_by_us', true).order('created_at').then(r => r.data || [], () => []),
  ]);
  // wspólnik → jego kratki (task_code → kratka); klient → lista wspólników z kratkami w tym miesiącu
  const partnerById = new Map(partners.map(p => [p.id, p]));
  const byPartner = new Map();
  for (const e of pEntries) {
    e._pe = true;
    if (!byPartner.has(e.partner_id)) byPartner.set(e.partner_id, new Map());
    byPartner.get(e.partner_id).set(e.task_code, e);
  }
  const partnersOf = cid => partners.filter(p => p.client_id === cid && byPartner.has(p.id));
  // załączniki do uwag (tabela może jeszcze nie istnieć – wtedy po prostu brak plików)
  const fileCount = new Map();
  sb.from('period_files').select('client_id').eq('period', pdate).then(({ data }) => {
    (data || []).forEach(r => fileCount.set(r.client_id, (fileCount.get(r.client_id) || 0) + 1));
    fileCount.forEach((_, id) => { try { refreshRow(id); } catch { /* tabela jeszcze się rysuje */ } });
  });

  // otwarte zadania o kliencie (licznik w kolumnie „Rozmowa”)
  const taskCount = new Map();
  const loadTaskCount = (cid = null) => { let q = sb.from('rkdp_tickets').select('client_id').eq('module', 'rkdp').in('status', ['nowe', 'w_toku', 'czeka']).not('client_id', 'is', null);
    if (cid) q = q.eq('client_id', cid);
    return q.then(({ data }) => { if (cid) taskCount.delete(cid); else taskCount.clear(); (data || []).forEach(r => taskCount.set(r.client_id, (taskCount.get(r.client_id) || 0) + 1)); }, () => {}); };
  loadTaskCount().then(() => taskCount.forEach((_, id) => { try { refreshRow(id); } catch { /* */ } }));
  // wakacje składkowe w tym miesiącu (karta klienta → ZUS) – znaczek przy nazwie klienta
  const zusHoliday = new Set();
  sb.from('client_zus').select('client_id').eq('kind', 'wakacje').eq('valid_from', pdate)
    .then(({ data }) => { (data || []).forEach(r => { zusHoliday.add(r.client_id); try { refreshRow(r.client_id); } catch { /* */ } }); }, () => {});

  const tasksAll = state.taskTypes.filter(t => t.active);
  // trend rozliczeń z 6 miesięcy (dociągany w tle – nie opóźnia tabeli)
  let hist = null;
  const histPeriods = lastPeriods(period, 6);
  const activeIds = new Set(clients.filter(c => c.status === 'aktywny').map(c => c.id));
  settledHistory(histPeriods, tasksAll, id => activeIds.has(id)).then(r => { hist = r; try { renderTiles(); } catch { /* */ } });
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
      const ts = area === 'kadry' ? tasksFor('kadry') : tasksFor(area, sectionOf(c));
      v = !m ? [] : ts.map(t => m.get(t.code)).filter(Boolean);
      for (const p of partnersOf(c.id)) v.push(...ts.map(t => byPartner.get(p.id).get(t.code)).filter(Boolean));
      cellsCache.set(k, v);
    }
    return v;
  };
  const rowsCache = new Map();
  // do statusu „rozliczony” liczą się tylko kolumny oznaczone counts_to_settled (np. bez wyciągów bankowych)
  const countsCode = new Set(tasksAll.filter(t => t.counts_to_settled !== false).map(t => t.code));
  const requiredOf = (c, area) => area === 'wyciagi' ? cellsOf(c, area) : cellsOf(c, area).filter(e => countsCode.has(e.task_code));
  const isSettled = (c, area) => { const cs = requiredOf(c, area); return cs.length > 0 && cs.every(e => e.status === 'done' || e.status === 'na'); };
  const hasMissing = (c, area) => cellsOf(c, area).some(e => ['missing_docs', 'reminded'].includes(e.status));
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
    if (area === 'wyciagi') return tasksFor('wyciagi', 'kapitalowe');
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
    if (area === 'wyciagi') return tasksFor('wyciagi', 'kapitalowe');
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
  const head = h('div', { class: 'top-bar' },
    h('div', { class: 'tb-links' },
      h('a', { class: 'btn btn-ghost btn-sm', href: `#/terminy?rok=${+period.slice(0, 4) + (period.slice(5) === '12' ? 1 : 0)}&m=${period.slice(5) === '12' ? 1 : +period.slice(5) + 1}`, 'data-tip': 'Kalendarz obowiązków klientów – terminy z profilu klienta' }, icon('calendar'), 'Kalendarz obowiązków'),
      h('a', { class: 'btn btn-ghost btn-sm', href: '#/zamkniecie-roku', 'data-tip': 'Zamknięcie roku: sprawozdania, CIT-8, PIT roczny, PIT-11, KRS' }, 'Zamknięcie roku')),
    tabsBox, monthNav);
  const tiles = h('div', { class: 'tiles' });
  const deadlines = h('div', { class: 'panel deadlines' });
  const banner = h('div', { class: 'card', style: { padding: '18px 22px', marginBottom: '18px', display: 'flex', gap: '16px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' } });
  const body = h('div');

  // ---------- filtry ----------
  const search = h('input', { class: 'input grow', type: 'search', placeholder: 'Szukaj klienta…', value: prefs.q, 'aria-label': 'Szukaj klienta' });
  const personSel = h('select', { class: 'select', 'aria-label': 'Osoba' });
  const showSel = h('select', { class: 'select', 'aria-label': 'Pokaż' },
    h('option', { value: '' }, 'Wszyscy klienci'), h('option', { value: 'nierozliczeni' }, 'Tylko do rozliczenia'),
    h('option', { value: 'braki' }, 'Z brakiem dokumentów'), h('option', { value: 'uwagi' }, 'Z uwagami / pytaniami'));
  showSel.value = prefs.show;
  const exportBtn = h('button', { class: 'btn btn-outline btn-sm btn-ico', 'aria-label': 'Pobierz (Excel, CSV, PDF)', 'data-tip': 'Pobierz tabelę – Excel, CSV, PDF', onclick: (ev) => exportMenu(ev.currentTarget) }, icon('download'));
  const ICON_LAYOUT = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/></svg>';
  const layoutBtn = h('button', { class: 'btn btn-outline btn-sm btn-ico', 'aria-label': 'Układ tabel', 'data-tip': 'Układ tabel – wybierz grupy klientów i czy mają być w jednej tabeli', onclick: (ev) => layoutMenu(ev.currentTarget) },
    h('span', { html: ICON_LAYOUT, style: { display: 'inline-flex' } }));
  const ICON_FS = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
  const ICON_FS_EXIT = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>';
  const fsBtn = h('button', { class: 'btn btn-outline btn-sm btn-ico', 'data-tip': 'Tabela na cały ekran (Esc – wyjście)' });
  const setFs = (on) => {
    document.body.classList.toggle('focus-mode', on);
    fsBtn.replaceChildren(h('span', { html: on ? ICON_FS_EXIT : ICON_FS, style: { display: 'inline-flex' } }));
    fsBtn.setAttribute('aria-label', on ? 'Zamknij pełny ekran' : 'Pełny ekran');
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
  const msgBtn = h('button', { class: 'btn btn-outline btn-sm', type: 'button', 'data-tip': 'E-mail do jednego lub wielu klientów z kancelaria@rkdp.pl\nFaktury KSeF w Saldeo, wyciąg bankowy, inne dokumenty',
    onclick: () => openMessage({ clients: [], kind: 'ksef', period }) }, icon('mail'), 'Wiadomość');
  const toolbar = h('div', { class: 'toolbar' }, search, personSel, showSel, h('span', { class: 'sel-wrap' }), msgBtn, h('span', { class: 'tb-icons' }, layoutBtn, exportBtn, fsBtn));

  // ---------- zapisane widoki (wspólne dla wszystkich urządzeń) ----------
  const viewsBar = h('div', { class: 'views-bar' });
  let views = [];
  const viewOf = () => ({ area: prefs.area, q: prefs.q, person: prefs.person, show: prefs.show, layout: prefs.layout?.[prefs.area] || null });
  const sameView = v => v.area === prefs.area && (v.q || '') === (prefs.q || '') && (v.person || '') === (prefs.person || '') && (v.show || '') === (prefs.show || '');
  function drawViews() {
    viewsBar.replaceChildren(h('span', { class: 'vb-l' }, 'Widoki:'),
      ...views.map((v, i) => h('span', { class: 'vchip' + (sameView(v) ? ' on' : '') },
        h('button', { type: 'button', onclick: () => {
          Object.assign(prefs, { area: v.area, q: v.q || '', person: v.person || '', show: v.show || '' });
          if (v.layout) prefs.layout = { ...(prefs.layout || {}), [v.area]: v.layout };
          search.value = prefs.q; savePrefs(prefs); renderAll(); } }, v.name),
        h('button', { type: 'button', class: 'vx', 'aria-label': `Usuń widok ${v.name}`, onclick: async () => { if (!confirm(`Usunąć widok „${v.name}”?`)) return; views.splice(i, 1); await saveMemberPrefs({ views_rozliczenia: views }, state.me.id); drawViews(); } }, '×'))),
      h('button', { type: 'button', class: 'vchip add', onclick: async () => {
        const name = prompt('Nazwa widoku (np. „Moi klienci z VAT”, „Spółki – braki”):', '');
        if (!name?.trim()) return;
        views.push({ name: name.trim().slice(0, 40), ...viewOf() });
        await saveMemberPrefs({ views_rozliczenia: views }, state.me.id); drawViews(); toast('Zapisano widok');
      } }, '+ Zapisz bieżący'));
  }
  loadMemberPrefs().then(p => { views = Array.isArray(p.views_rozliczenia) ? p.views_rozliczenia : []; drawViews(); });
  const onFilter = () => { Object.assign(prefs, { q: search.value, person: personSel.value, show: showSel.value }); savePrefs(prefs); renderBody(); };
  let searchTimer;
  search.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(onFilter, 180); });
  personSel.addEventListener('change', onFilter);
  showSel.addEventListener('change', onFilter);

  const legend = h('div', { class: 'legend' },
    ['done', 'na', 'missing_docs', 'reminded', 'todo'].map(s => h('span', {}, h('span', { class: `cb cb-${s}` }, STATUS[s].mark), STATUS[s].label)),
    h('span', {}, h('span', { class: 'cb cb-todo cb-pill cb-pill-saved' }, '2 509,00'), 'kwota zapisana'),
    h('span', {}, h('span', { class: 'cb cb-done cb-pill cb-pill-sent' }, '✓ 2 509,00'), 'kwota wysłana klientowi'),
    infoTip('Kliknij kratkę, aby zmienić status. Najedź na nagłówek kolumny, aby zobaczyć opis.\nKlawiatura: strzałki – przejście, spacja – zrobione, N – nie dotyczy, B – brak dokumentów.\nCtrl/⌘ + klik – zaznaczenie wielu kratek naraz.', 'Jak zaznaczać'));

  function renderTabs() {
    tabsBox.replaceChildren(...Object.entries(AREAS).map(([k, a]) => {
      const rows = rowsIn(k);
      const open = k === 'wyciagi' && yearData ? clients.filter(c => c.status === 'aktywny' && yearData.get(c.id) && [...yearData.get(c.id).values()].some(yearOpen)).length : rows.filter(c => !isSettled(c, k)).length;
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
    if (area === 'wyciagi') return renderYearTiles();
    const rows = selectedActive(area);
    const settled = rows.filter(c => isSettled(c, area)).length;
    const toSend = rows.filter(c => pendingSend(c, area)).length;
    const miss = rows.filter(c => hasMissing(c, area)).length;
    const nts = rows.filter(hasNote).length;
    const pct = rows.length ? Math.round(settled / rows.length * 100) : 0;
    const tile = (n, lbl, show) => h('button', { class: 'card tile tile-btn' + (prefs.show === show ? ' on dark' : ''), type: 'button', 'aria-pressed': String(prefs.show === show),
      'data-tip': prefs.show === show ? 'Kliknij, aby pokazać wszystkich' : 'Kliknij, aby pokazać tylko tych klientów',
      onclick: () => { prefs.show = prefs.show === show ? '' : show; showSel.value = prefs.show; savePrefs(prefs); renderBody(); } },
    h('span', { class: 'lbl' }, lbl), h('span', { class: 'num' }, n));
    tiles.replaceChildren(
      h('button', { class: 'card tile tile-btn' + (prefs.show === 'nierozliczeni' ? ' on dark' : ''), type: 'button', 'aria-pressed': String(prefs.show === 'nierozliczeni'),
        'data-tip': prefs.show === 'nierozliczeni' ? 'Pokaż wszystkich klientów' : 'Pokaż tylko klientów do rozliczenia',
        onclick: () => { prefs.show = prefs.show === 'nierozliczeni' ? '' : 'nierozliczeni'; showSel.value = prefs.show; savePrefs(prefs); renderBody(); } },
        h('span', { class: 'lbl' }, `Rozliczeni – ${AREAS[area].label.toLowerCase()}`),
        h('span', { class: 'num' }, rows.length ? `${settled} / ${rows.length}` : '—',
          hist?.[area] ? h('span', { class: 'tile-spark', 'data-tip': 'Odsetek rozliczonych klientów w ostatnich 6 miesiącach' }, sparkline(hist[area].map((v, i) => i === hist[area].length - 1 ? pct : v), { labels: histPeriods.map(periodLabel) })) : null),
        h('div', { class: 'bar' }, h('i', { style: { width: pct + '%' } })),
        h('span', { class: 'tile-more' }, !rows.length ? 'Lista na ten miesiąc nie jest jeszcze otwarta' : prefs.show === 'nierozliczeni' ? '✕ pokaż wszystkich' : `Do rozliczenia: ${rows.length - settled} →`)),
      tile(toSend, area === 'kadry' ? 'ZUS do wysłania' : 'JPK VAT do wysłania', 'do_wyslania'),
      tile(miss, 'Klientów z brakiem dokumentów', 'braki'),
      tile(nts, 'Klientów z uwagami', 'uwagi'));
  }

  function renderDeadlines() {
    deadlines.hidden = prefs.area === 'wyciagi';
    if (deadlines.hidden) return;
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
    const tip = `${headerLabel}: ${st.label}` + (entry.amount != null ? `\nKwota: ${(+entry.amount).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł${entry.due_date ? ', termin ' + entry.due_date.split('-').reverse().join('.') : ''}` : '') + (who ? `\nZmienił(a): ${who}, ${new Date(entry.updated_at).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : '');
    // kwota przy kratce (VAT, PIT/CIT, ZUS, PIT-4): wpisana, a jeszcze nie podana klientowi = złota kratka „zł”; podana = zwykłe „Zrobione”; kwota pod kratką
    const amt = entry.amount != null && AMOUNT_CODES.includes(entry.task_code) && entry.status !== 'na';
    // kwota w kratce: zapisana (niewysłana) = jasna z kwotą; wysłana / zrobiona = kolorowa z ✓ i kwotą
    const amtTxt = amt ? (+entry.amount).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
    const pill = amt && ['todo', 'in_progress', 'done'].includes(entry.status);
    const btn = h('button', { class: `cb cb-${entry.status === 'in_progress' ? 'todo' : entry.status}` + (pill ? (entry.status === 'done' ? ' cb-pill cb-pill-sent' : ' cb-pill cb-pill-saved') : '') + (selected.has(entry.id) ? ' sel' : ''), 'data-tip': tip, 'aria-label': tip, 'data-eid': entry._pe ? null : entry.id,
      onclick: (ev) => {
        if (!entry._pe && ev.shiftKey && anchorId) return selectRange(ev.currentTarget);
        if (!entry._pe && (ev.ctrlKey || ev.metaKey || selectMode)) return toggleSel(entry.id, ev.currentTarget);
        // telefon: jedno dotknięcie = „Zrobione” (z „Cofnij”); przytrzymanie albo dotknięcie zrobionej kratki = wszystkie statusy
        if (PHONE() && !['done', 'na'].includes(entry.status)) return setStatus(entry, 'done');
        statusMenu(ev.currentTarget, entry, headerLabel);
      },
      oncontextmenu: (ev) => { if (!PHONE()) return; ev.preventDefault(); statusMenu(ev.currentTarget, entry, headerLabel); } }, pill ? (entry.status === 'done' ? '✓ ' + amtTxt : amtTxt) : st.mark);
    if (!amt || pill) return btn;
    return h('span', { class: 'cb-amtwrap' }, btn, h('span', { class: 'cb-sum' }, amtTxt));
  }

  function personCell(c, area) {
    const field = AREAS[area].person;
    const m = c[field] ? memberById(c[field]) : null;
    const b = h('button', { class: 'person' + (m ? '' : ' unassigned'), disabled: !editClients,
      'data-tip': editClients ? `Kliknij, aby zmienić: ${AREAS[area].personLabel.toLowerCase()}` : null,
      onclick: (ev) => personMenu(ev.currentTarget, c, field) },
    h('span', { class: 'av' }, m ? ava(m) : '+'), m ? m.short_name : 'przypisz');
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
    if (cs.some(e => ['missing_docs', 'reminded'].includes(e.status))) return h('button', { class: 'sum bad', type: 'button', 'data-tip': 'Brakuje dokumentów – kliknij, aby poprosić klienta (link do wgrania plików)',
      onclick: () => requestDocs(c, area) }, `! ${done}/${cs.length}`, h('span', { class: 'mail-ico', html: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>' }));
    return h('span', { class: 'sum no', 'data-tip': `Zrobione ${done} z ${cs.length}` },
      h('span', { class: 'ring', style: `--p:${cs.length ? Math.round(done * 100 / cs.length) : 0}`, 'aria-hidden': 'true' }), `${done}/${cs.length}`);
  }

  function noteCell(c) {
    const n = noteMap.get(c.id) || {};
    const has = !!(n.notes?.trim()), q = !!(n.questions?.trim());
    const qn = q ? n.questions.split('\n').filter(x => x.trim()).length : 0;
    const fc = fileCount.get(c.id) || 0, tc = taskCount.get(c.id) || 0, cnt = tc + qn;
    const tip = [has ? `Uwagi: ${n.notes}` : '', q ? `Pytania: ${n.questions}` : '', tc ? `Otwarte zadania: ${tc}` : '', fc ? `Załączniki: ${fc}` : ''].filter(Boolean).join('\n') || 'Rozmowa o kliencie – uwaga, pytanie, zadanie, zrzut ekranu';
    return h('button', { class: 'note-btn' + (has || q || fc || tc ? ' has' : '') + (q ? ' q' : ''), 'data-tip': tip, 'aria-label': 'Rozmowa o kliencie',
      html: ICON_NOTE + (cnt ? `<span class="cnt">${cnt}</span>` : '') + (fc ? `<span class="clip">${fc}</span>` : ''),
      onclick: () => import('../watek.js').then(m => m.openThread({ client: c, period, onChange: () => { syncClientNotes(c.id); loadTaskCount(c.id).then(() => refreshRow(c.id)); } })) });
  }

  function rowFor(c, area, cols) {
    const settled = isSettled(c, area);
    return h('tr', { class: settled ? 'settled' : null, 'data-client': c.id, 'data-area': area },
      h('td', { class: 'c-name' }, h('div', { class: 'cname' },
        h('a', { href: `#/klient/${c.id}`, 'data-panel': c.id }, c.name),
        h('div', { class: 'meta' }, h('span', { class: 'badge' }, LEGAL_SHORT[c.legal_form] || '?'),
          c.status !== 'aktywny' ? h('span', { class: 'badge warn' }, c.status === 'zawieszony' ? 'zawieszony' : 'zakończony') : null,
          h('button', { type: 'button', class: 'ph-cam', 'aria-label': `Zdjęcie dokumentu – ${c.name}`, onclick: () => photoDoc(c) }, '📷'),
          zusHoliday.has(c.id) ? h('span', { class: 'badge zus-hol', 'data-tip': 'Wakacje składkowe w tym miesiącu – bez składek społecznych właściciela (zdrowotna płatna)' }, 'wakacje ZUS') : null))),
      h('td', { class: 'c-person' }, personCell(c, area)),
      area === 'kadry' ? h('td', {}, employeesCell(c)) : null,
      cols.map(col => h('td', { class: 'c-task', 'data-label': col.label }, (col.applies_to && col.applies_to !== 'all' && col.applies_to !== sectionOf(c))
        ? h('span', { class: 'muted small', 'data-tip': 'Nie dotyczy tej formy' }, '·')
        : checkbox(byClient.get(c.id)?.get(col.code), col, col.label))),
      h('td', { class: 'c-sum' }, sumCell(c, area)),
      h('td', {}, noteCell(c)));
  }

  // wiersz wspólnika pod spółką: tylko jego kratki (PIT w księgowości, ZUS w kadrach)
  function partnerRow(c, p, area, cols) {
    const m = byPartner.get(p.id) || new Map();
    const cells = cols.map(col => m.get(col.code)).filter(Boolean);
    if (!cells.length) return null;
    const done = cells.every(e => e.status === 'done' || e.status === 'na');
    return h('tr', { class: 'partner-row' + (done ? ' settled' : ''), 'data-client': c.id, 'data-partner': p.id, 'data-area': area },
      h('td', { class: 'c-name' }, h('div', { class: 'cname' }, h('span', { class: 'pr-name' }, '↳ ', p.full_name || 'wspólnik'), h('div', { class: 'meta' }, h('span', { class: 'badge' }, 'wspólnik')))),
      h('td', { class: 'c-person' }),
      area === 'kadry' ? h('td', {}) : null,
      cols.map(col => { const e = m.get(col.code); return h('td', { class: 'c-task', 'data-label': col.label }, e ? checkbox(e, col, `${col.label} – ${p.full_name}`) : h('span', { class: 'muted small' }, '')); }),
      h('td', { class: 'c-sum' }), h('td', {}));
  }
  const rowsWithPartners = (c, area, cols) => [rowFor(c, area, cols), ...partnersOf(c.id).map(p => partnerRow(c, p, area, cols))].filter(Boolean);

  // telefon: zdjęcie dokumentu prosto do klienta i miesiąca (załącznik w rozmowie klienta)
  function photoDoc(c) {
    const inp = h('input', { type: 'file', accept: 'image/*,application/pdf', capture: 'environment', multiple: true, hidden: true });
    inp.addEventListener('change', async () => {
      const files = [...inp.files]; inp.remove(); if (!files.length) return;
      let ok = 0;
      for (const f of files) {
        if (f.size > 25 * 1048576) { toast(`„${f.name}” jest większy niż 25 MB`, true); continue; }
        const name = /^image\.(jpe?g|png|heic)$/i.test(f.name) || !f.name ? `zdjecie-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.${(f.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')}` : f.name;
        const path = `${c.id}/${period}/${crypto.randomUUID().slice(0, 8)}-${name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.\-]+/g, '_').slice(-80)}`;
        const { error } = await sb.storage.from('rozliczenia').upload(path, f, { contentType: f.type || 'application/octet-stream' });
        if (error) { fail(error); continue; }
        const { error: e2 } = await sb.from('period_files').insert({ client_id: c.id, period: pdate, path, name, mime: f.type || null, size: f.size, uploaded_by: state.me.id });
        if (e2) { await sb.storage.from('rozliczenia').remove([path]); fail(e2); continue; }
        ok++;
      }
      if (ok) { toast(`Dodano ${ok === 1 ? 'zdjęcie' : `pliki (${ok})`} – ${c.name}, ${periodLabel(period).toLowerCase()}`); fileCount.set(c.id, (fileCount.get(c.id) || 0) + ok); refreshRow(c.id); }
    });
    document.body.append(inp); inp.click();
  }

  function tableFor(area, t) {
    const cols = t.cols;
    const stat = (col) => {
      const rel = t.all.map(c => byClient.get(c.id)?.get(col.code)).filter(e => e && e.status !== 'na');
      const d = rel.filter(e => e.status === 'done').length;
      return { txt: `${d}/${rel.length}`, pct: rel.length ? Math.round(d * 100 / rel.length) : 0 };
    };
    const thead = h('thead', {}, h('tr', {},
      h('th', { class: 'c-name' }, 'Klient'),
      h('th', { class: 'c-person' }, AREAS[area].personLabel),
      area === 'kadry' ? h('th', { 'data-tip': 'Czy firma zatrudnia pracowników lub zleceniobiorców' }, 'Pracownicy') : null,
      cols.map(col => h('th', { class: 'c-task' + (col.counts_to_settled === false ? ' optional' : ''), 'data-tip': (col.description || col.label) + (col.counts_to_settled === false ? '\nNie wpływa na status „Klient rozliczony”.' : '') },
        col.label, (() => { const st = stat(col); return [h('span', { class: 'sub' }, st.txt + (col.counts_to_settled === false ? ' · info' : '')),
          h('span', { class: 'colbar' + (st.pct === 100 ? ' full' : ''), 'aria-hidden': 'true' }, h('i', { style: { width: st.pct + '%' } }))]; })())),
      h('th', { class: 'c-sum', 'data-tip': 'Rozliczony = wszystkie kratki „Zrobione” albo „Nie dotyczy”' }, 'Klient rozliczony'),
      h('th', { 'data-tip': 'Rozmowa o kliencie: uwagi, pytania i zadania. Liczba = otwarte zadania + otwarte pytania w tym miesiącu' }, 'Rozmowa')));
    const tbody = h('tbody', {}, t.rows.flatMap(c => rowsWithPartners(c, area, cols)));
    const table = h('table', { class: 'grid' }, thead, tbody);
    table._cols = cols;
    return h('div', { class: 'grid-wrap' + (t.inactiveOnly ? ' inactive' : '') }, table);
  }

  function renderBody() {
    const area = prefs.area;
    toolbar.querySelector('.tb-icons')?.toggleAttribute('hidden', area === 'wyciagi');
    if (area === 'wyciagi') { renderYear(); renderTabs(); if (views) drawViews(); return; }
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
    renderTiles(); renderTabs(); if (views) drawViews();
  }
  const emptyBox = () => h('div', { class: 'card empty' }, entries.length ? 'Żaden klient nie pasuje do filtrów.' : 'Brak listy na ten miesiąc – użyj przycisku „Otwórz miesiąc”.');

  let summaryQueued = false;
  const queueSummary = () => {
    if (summaryQueued) return; summaryQueued = true;
    requestAnimationFrame(() => { summaryQueued = false; renderTiles(); renderTabs(); });
  };
  function refreshRow(clientId) {
    if (prefs.area === 'wyciagi' && yearData) { renderYear(); queueSummary(); return; }
    const c = clientMap.get(clientId);
    body.querySelectorAll(`tr[data-client="${clientId}"]`).forEach(tr => {
      const area = tr.dataset.area;
      if (tr.dataset.partner) { const pr = partnerRow(c, partnerById.get(tr.dataset.partner), area, tr.closest('table')._cols); if (pr) tr.replaceWith(pr); return; }
      const nr = rowFor(c, area, tr.closest('table')._cols);
      if (!tr.classList.contains('settled') && nr.classList.contains('settled')) nr.classList.add('flash');
      tr.replaceWith(nr);
    });
    queueSummary();
    if (selected.size) paintSel();
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
    renderShowSel(); renderPersonSel(); renderDeadlines(); renderBanner(); renderBody(); drawViews();
  }

  // ---------- wyciągi bankowe: narastająco od stycznia do wybranego miesiąca ----------
  const year = period.slice(0, 4), monthNo = +period.slice(5);
  let yearData = null, yearLoading = null;
  const loadYear = () => yearLoading ||= fetchAll(() => sb.from('checklist_entries')
    .select('id,client_id,period,task_code,status,updated_by,updated_at').eq('task_code', 'wb').gte('period', `${year}-01-01`).lte('period', pdate))
    .then(rows => {
      // bieżący miesiąc – te same obiekty co w tabeli miesięcznej (zmiany widać od razu w obu miejscach)
      const cur = new Map(entries.filter(e => e.task_code === 'wb').map(e => [e.id, e]));
      const m = new Map();
      for (const r of rows) {
        const e = cur.get(r.id) || r;
        if (!m.has(e.client_id)) m.set(e.client_id, new Map());
        m.get(e.client_id).set(+e.period.slice(5, 7), e);
      }
      yearData = m; return m;
    }, err => { yearLoading = null; throw err; });
  const yearOpen = e => e && !['done', 'na'].includes(e.status);
  const yearClients = () => {
    if (!yearData) return [];
    const field = AREAS.wyciagi.person, q = prefs.q.trim().toLowerCase();
    return clients.filter(c => yearData.has(c.id)).filter(c => {
      if (q && !c.name.toLowerCase().includes(q)) return false;
      if (prefs.person === 'me' && c[field] !== state.me.id) return false;
      if (prefs.person === 'none' && c[field]) return false;
      if (prefs.person && !['me', 'none'].includes(prefs.person) && c[field] !== prefs.person) return false;
      const ms = [...yearData.get(c.id).values()];
      if (prefs.show === 'nierozliczeni' && !ms.some(yearOpen)) return false;
      if (prefs.show === 'braki' && !ms.some(e => ['missing_docs', 'reminded'].includes(e.status))) return false;
      if (prefs.show === 'uwagi' && !hasNote(c)) return false;
      return true;
    }).sort((a, b) => (a.status === 'aktywny' ? 0 : 1) - (b.status === 'aktywny' ? 0 : 1) || a.name.localeCompare(b.name, 'pl'));
  };
  function yearCell(e, c, mi) {
    if (!e) return h('td', { class: 'c-task', 'data-label': MONTHS_SHORT[mi - 1] }, h('span', { class: 'muted small' }, ''));
    const label = `Wyciąg – ${MONTHS_FULL[mi - 1]} ${year}`;
    const b = h('button', { class: `cb cb-${e.status === 'in_progress' ? 'todo' : e.status}`, 'aria-label': `${c.name}: ${label} – ${STATUS[e.status].label}`, 'data-tip': `${label}: ${STATUS[e.status].label}`,
      onclick: ev => { if (PHONE() && !['done', 'na'].includes(e.status)) return setStatus(e, 'done'); statusMenu(ev.currentTarget, e, label); },
      oncontextmenu: ev => { if (!PHONE()) return; ev.preventDefault(); statusMenu(ev.currentTarget, e, label); } }, STATUS[e.status].mark);
    return h('td', { class: 'c-task' + (mi === monthNo ? ' wb-cur' : ''), 'data-label': MONTHS_SHORT[mi - 1] }, b);
  }
  function renderYear() {
    if (!yearData) {
      body.replaceChildren(h('div', { class: 'spinner' }, 'Wczytywanie wyciągów…'));
      loadYear().then(() => { if (prefs.area === 'wyciagi') { renderYear(); renderYearTiles(); renderTabs(); } }, e => fail(e));
      return;
    }
    const months = Array.from({ length: monthNo }, (_, i) => i + 1);
    const list = yearClients();
    const act = list.filter(c => c.status === 'aktywny');
    const full = act.filter(c => ![...yearData.get(c.id).values()].some(yearOpen)).length;
    const table = h('table', { class: 'grid wb-year' },
      h('thead', {}, h('tr', {}, h('th', { class: 'c-name' }, 'Klient'), h('th', { class: 'c-person' }, 'Księgowa'),
        ...months.map(mi => h('th', { class: 'c-task' + (mi === monthNo ? ' wb-cur' : ''), 'data-tip': `${MONTHS_FULL[mi - 1]} ${year}` }, MONTHS_SHORT[mi - 1])),
        h('th', { 'data-tip': 'Miesiące od początku roku bez wyciągu (do zrobienia, brak dokumentów, przypomniano)' }, 'Brakuje'))),
      h('tbody', {}, ...list.map(c => {
        const ms = yearData.get(c.id);
        const open = [...ms.values()].filter(yearOpen).length;
        return h('tr', { class: (open ? '' : 'settled') + (c.status === 'aktywny' ? '' : ' inactive') },
          h('td', { class: 'c-name' }, h('a', { href: `#/klient/${c.id}`, class: 'cname' }, c.name), c.status === 'aktywny' ? null : h('span', { class: 'badge' }, c.status)),
          h('td', { class: 'c-person' }, personCell(c, 'wyciagi')),
          ...months.map(mi => yearCell(ms.get(mi), c, mi)),
          h('td', { class: 'wb-open' }, open ? h('span', { class: 'wb-miss' }, String(open)) : h('span', { class: 'wb-ok' }, '✓ komplet')));
      })));
    body.replaceChildren(
      h('div', { class: 'table-title' }, h('h2', {}, `Wyciągi bankowe – ${year} narastająco (styczeń–${MONTHS_FULL[monthNo - 1]})`),
        h('span', { class: 'muted small' }, `komplet ${full} z ${act.length} aktywnych`)),
      list.length ? h('div', { class: 'card grid-wrap wb-wrap' }, table) : h('div', { class: 'card empty' }, 'Brak klientów z wyciągami w tym roku (wyciągi dotyczą spółek i pełnej księgowości) albo żaden nie pasuje do filtrów.'));
  }
  function renderYearTiles() {
    if (!yearData) { tiles.replaceChildren(); return; }
    const act = clients.filter(c => c.status === 'aktywny' && yearData.has(c.id));
    const curDone = act.filter(c => !yearOpen(yearData.get(c.id).get(monthNo))).length;
    const withGaps = act.filter(c => [...yearData.get(c.id).values()].some(yearOpen)).length;
    const gaps = act.reduce((n, c) => n + [...yearData.get(c.id).values()].filter(yearOpen).length, 0);
    const miss = act.filter(c => [...yearData.get(c.id).values()].some(e => ['missing_docs', 'reminded'].includes(e.status))).length;
    const tile = (n, lbl, show, sub) => h('button', { class: 'card tile tile-btn' + (show && prefs.show === show ? ' on dark' : ''), type: 'button',
      onclick: show ? () => { prefs.show = prefs.show === show ? '' : show; showSel.value = prefs.show; savePrefs(prefs); renderBody(); } : null },
    h('span', { class: 'lbl' }, lbl), h('span', { class: 'num' }, n), sub ? h('span', { class: 'tile-more' }, sub) : null);
    tiles.replaceChildren(
      tile(`${curDone} / ${act.length}`, `Wyciągi za ${MONTHS_FULL[monthNo - 1]}`, null, 'zrobione lub nie dotyczy'),
      tile(withGaps, 'Klientów z brakami od stycznia', 'nierozliczeni', `${gaps} brakujących miesięcy`),
      tile(miss, 'Brak dokumentów / przypomniano', 'braki'),
      tile(act.length - withGaps, 'Komplet od początku roku', null));
  }

  // ---------- zapisy ----------
  const taskLabel = code => tasksAll.find(t => t.code === code)?.label || code;
  const allSettled = () => { const rs = selectedActive(prefs.area); return rs.length > 0 && rs.every(c => isSettled(c, prefs.area)); };
  async function setStatus(entry, status, { silent = false } = {}) {
    const before = entry.status, wasAll = allSettled();
    entry.status = status; entry.updated_by = state.me.email; entry.updated_at = new Date().toISOString();
    refreshRow(entry.client_id);
    const { error } = await sb.from(entry._pe ? 'partner_entries' : 'checklist_entries').update({ status }).eq('id', entry.id);
    if (error) { entry.status = before; refreshRow(entry.client_id); return fail(error, 'Nie zapisano'); }
    if (!silent) toastAction(`${entry._pe ? (partnerById.get(entry.partner_id)?.full_name || 'wspólnik') : (clientMap.get(entry.client_id)?.name || '')} · ${taskLabel(entry.task_code)}: ${STATUS[status].label}`, 'Cofnij', () => setStatus(entry, before, { silent: true }));
    if (!wasAll && allSettled()) celebrate(`Wszyscy klienci rozliczeni – ${AREAS[prefs.area].label.toLowerCase()}, ${periodLabel(period).toLowerCase()}!`);
  }
  // zmiana wielu kratek naraz (jedno „Cofnij” dla całej operacji)
  async function setMany(list, status) {
    const prev = list.map(e => [e, e.status]).filter(([e]) => e.status !== status);
    if (!prev.length) return;
    const wasAll = allSettled();
    prev.forEach(([e]) => { e.status = status; e.updated_by = state.me.email; e.updated_at = new Date().toISOString(); });
    [...new Set(prev.map(([e]) => e.client_id))].forEach(refreshRow);
    const { error } = await sb.from('checklist_entries').update({ status }).in('id', prev.map(([e]) => e.id));
    if (error) { prev.forEach(([e, b]) => { e.status = b; }); [...new Set(prev.map(([e]) => e.client_id))].forEach(refreshRow); return fail(error, 'Nie zapisano'); }
    toastAction(`Zmieniono ${prev.length} ${prev.length === 1 ? 'kratkę' : prev.length < 5 ? 'kratki' : 'kratek'}: ${STATUS[status].label}`, 'Cofnij', async () => {
      const groups = new Map(); prev.forEach(([e, b]) => { if (!groups.has(b)) groups.set(b, []); groups.get(b).push(e); });
      for (const [b, es] of groups) {
        es.forEach(e => { e.status = b; });
        const { error: e2 } = await sb.from('checklist_entries').update({ status: b }).in('id', es.map(e => e.id));
        if (e2) fail(e2);
      }
      [...new Set(prev.map(([e]) => e.client_id))].forEach(refreshRow);
      toast('Cofnięto');
    });
    if (!wasAll && allSettled()) celebrate(`Wszyscy klienci rozliczeni – ${AREAS[prefs.area].label.toLowerCase()}, ${periodLabel(period).toLowerCase()}!`);
  }

  // ---------- zaznaczanie wielu kratek ----------
  const selected = new Set();
  let anchorId = null, selectMode = false;
  const entryById = id => entries.find(e => e.id === id);
  const bulkBar = h('div', { class: 'bulkbar', hidden: true, role: 'toolbar', 'aria-label': 'Zaznaczone kratki' });
  function drawBulk() {
    if (!selected.size && !selectMode) { bulkBar.hidden = true; return; }
    bulkBar.hidden = false;
    const act = (st, lbl) => h('button', { class: 'bb-btn', type: 'button', disabled: !selected.size, onclick: async () => { const list = [...selected].map(entryById).filter(Boolean); clearSel(); await setMany(list, st); } },
      h('span', { class: `cb cb-${st}` }, STATUS[st].mark), lbl);
    bulkBar.replaceChildren(h('b', {}, selected.size ? `Zaznaczono: ${selected.size}` : 'Kliknij kratki do zaznaczenia'),
      act('done', 'Zrobione'), act('na', 'Nie dotyczy'), act('missing_docs', 'Brak dok.'), act('reminded', 'Przypomniano'), act('todo', 'Wyczyść'),
      h('button', { class: 'bb-btn', type: 'button', disabled: !selected.size, 'data-tip': 'Wiadomość e-mail do klientów zaznaczonych kratek (z kancelaria@rkdp.pl)', onclick: () => {
        const list = [...selected].map(entryById).filter(Boolean);
        const codes = new Set(list.map(e => e.task_code));
        const cls = [...new Set(list.map(e => e.client_id))].map(id => clientMap.get(id)).filter(Boolean);
        openMessage({ clients: cls, kind: codes.has('wb') && !codes.has('saldeo') ? 'wyciag' : codes.has('saldeo') ? 'ksef' : 'dokumenty', period });
      } }, h('span', { html: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>', style: { display: 'inline-flex' } }), 'Wiadomość'),
      h('button', { class: 'bb-x', type: 'button', onclick: () => { selectMode = false; selBtn.classList.remove('on'); clearSel(); } }, 'Zakończ'));
  }
  function paintSel() { body.querySelectorAll('.cb[data-eid]').forEach(b => b.classList.toggle('sel', selected.has(b.dataset.eid))); drawBulk(); }
  function toggleSel(id, el) { if (selected.has(id)) selected.delete(id); else selected.add(id); anchorId = id; el?.classList.toggle('sel', selected.has(id)); drawBulk(); }
  function clearSel() { selected.clear(); anchorId = null; paintSel(); }
  // Shift+klik: zakres w tej samej kolumnie tabeli
  function selectRange(el) {
    const a = body.querySelector(`.cb[data-eid="${anchorId}"]`);
    if (!a) return toggleSel(el.dataset.eid, el);
    const ta = a.closest('table'), tb = el.closest('table');
    const col = el.closest('td').cellIndex;
    if (ta !== tb || a.closest('td').cellIndex !== col) return toggleSel(el.dataset.eid, el);
    const rows = [...tb.tBodies[0].rows];
    let i1 = rows.indexOf(a.closest('tr')), i2 = rows.indexOf(el.closest('tr'));
    if (i1 > i2) [i1, i2] = [i2, i1];
    for (let i = i1; i <= i2; i++) { const b = rows[i].cells[col]?.querySelector('.cb[data-eid]'); if (b) selected.add(b.dataset.eid); }
    paintSel();
  }
  const selBtn = h('button', { class: 'btn btn-outline btn-sm', type: 'button', 'data-tip': 'Zaznacz wiele kratek i zmień je naraz\nNa komputerze: Ctrl/⌘ + klik, Shift + klik – zakres w kolumnie',
    onclick: () => { selectMode = !selectMode; selBtn.classList.toggle('on', selectMode); if (!selectMode) clearSel(); else drawBulk(); } },
  h('span', { html: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="m14.5 17.5 2 2 4-4"/></svg>', style: { display: 'inline-flex' } }), 'Zaznacz');

  // ---------- klawiatura: strzałki, spacja (zrobione / wyczyść), N – nie dotyczy, B – brak dok., Enter – menu, X – zaznacz ----------
  function onGridKey(e) {
    const b = e.target.closest?.('.grid .cb[data-eid]');
    if (!b || document.querySelector('.pop, .modal-back')) return;
    const td = b.closest('td'), tr = td.parentElement, col = td.cellIndex;
    const move = (dr, dc) => {
      e.preventDefault();
      if (dc) { let c = td; do { c = dc > 0 ? c.nextElementSibling : c.previousElementSibling; } while (c && !c.querySelector('.cb[data-eid]')); c?.querySelector('.cb[data-eid]')?.focus(); return; }
      const rows = [...tr.parentElement.rows]; let i = rows.indexOf(tr);
      for (i += dr; rows[i]; i += dr) { const n = rows[i].cells[col]?.querySelector('.cb[data-eid]'); if (n) { n.focus(); n.scrollIntoView({ block: 'nearest' }); return; } }
    };
    const entry = entryById(b.dataset.eid);
    const k = e.key;
    if (k === 'ArrowRight') return move(0, 1);
    if (k === 'ArrowLeft') return move(0, -1);
    if (k === 'ArrowDown') return move(1, 0);
    if (k === 'ArrowUp') return move(-1, 0);
    if (!entry || e.ctrlKey || e.metaKey || e.altKey) return;
    const keep = () => requestAnimationFrame(() => body.querySelector(`.cb[data-eid="${entry.id}"]`)?.focus());
    if (k === ' ') { e.preventDefault(); setStatus(entry, entry.status === 'done' ? 'todo' : 'done'); keep(); }
    else if (k.toLowerCase() === 'n') { e.preventDefault(); setStatus(entry, 'na'); keep(); }
    else if (k.toLowerCase() === 'b') { e.preventDefault(); setStatus(entry, 'missing_docs'); keep(); }
    else if (k.toLowerCase() === 'x') { e.preventDefault(); toggleSel(entry.id, b); }
  }

  function requestDocs(c, area) {
    const codes = cellsOf(c, area).filter(e => ['missing_docs', 'reminded'].includes(e.status)).map(e => e.task_code);
    openDocRequest(c, period, codes);
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
      s === 'todo' ? 'Wyczyść (do zrobienia)' : STATUS[s].label)),
      AMOUNT_CODES.includes(entry.task_code) && !entry._pe ? h('button', { class: 'opt', role: 'menuitem', onclick: () => { closePop(); openAmounts({ client: clientMap.get(entry.client_id), period, entries: byClient.get(entry.client_id) || new Map(), onDone: () => refreshRow(entry.client_id) }); } },
        h('span', { class: 'cb', style: { width: '22px', height: '22px', fontSize: '12px' } }, 'zł'), entry.amount != null ? `Kwoty do zapłaty (${(+entry.amount).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł)…` : 'Kwoty do zapłaty – wyślij klientowi…') : null]);
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
        h('span', { class: 'person', style: { padding: 0 } }, h('span', { class: 'av' }, ava(m))), m.full_name)),
      h('div', { class: 'sep' }),
      h('button', { class: 'opt', onclick: () => pick(null) }, 'Usuń przypisanie')]);
  }

  // Uwagi do klienta w miesiącu jako czat: na górze rozmowa (uwagi, pytania, wysłane e-maile), na dole pole do pisania.
  // Każdy wpis ma autora i godzinę; pytanie można oznaczyć jako wyjaśnione. Podsumowanie (kropka w tabeli, eksport) liczy baza.
  // po zmianach w wątku klienta: podsumowanie uwag (kropka) i liczba załączników w wierszu
  async function syncClientNotes(cid) {
    const [{ data: n }, { count }] = await Promise.all([
      sb.from('period_notes').select('client_id,notes,questions').eq('client_id', cid).eq('period', pdate).maybeSingle(),
      sb.from('period_files').select('id', { count: 'exact', head: true }).eq('client_id', cid).eq('period', pdate)]);
    noteMap.set(cid, n || { client_id: cid }); if (count != null) fileCount.set(cid, count); refreshRow(cid);
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
      h('div', { class: 'sep' }),
      h('label', {}, 'Gęstość tabel (cała aplikacja)'),
      [['comfort', 'Wygodna'], ['compact', 'Kompaktowa – więcej wierszy na ekranie']].map(([v, t]) => {
        const rb = h('input', { type: 'radio', name: 'density', checked: (document.documentElement.dataset.density || 'comfort') === v });
        rb.addEventListener('change', () => setDensity(v));
        return h('label', { class: 'check', style: chkStyle }, rb, t);
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
  const statusStyle = (e) => !e ? 'normal' : ({ done: 'done', na: 'na', missing_docs: 'missing', reminded: 'missing' }[e.status] || 'todo');
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
            isSettled(c, area) ? { v: 'Rozliczony', s: 'settled' } : { v: `${done}/${cs.length}`, s: cs.some(e => ['missing_docs', 'reminded'].includes(e.status)) ? 'missing' : 'todo' },
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
header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #806341;padding-bottom:6px;margin-bottom:8px}
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
.m-reminded{background:#F7ECD6;border-color:#B7862F;color:#8A6420}
.s{color:#3E6B47}.legend{margin-top:8px;color:#6A6157;font-size:8.5px}
</style></head><body>
<header><div><h1>${esc(AREAS[area].label)} – ${esc(periodLabel(period))}</h1><p>${esc(filterInfo())} · wygenerowano ${esc(new Date().toLocaleString('pl-PL'))}</p></div>
<img src="${location.origin}/logo-rkdp.png" alt="RKDP"></header>
${tables || '<p>Brak danych.</p>'}
<p class="legend"><span class="m m-done">✓</span> zrobione &nbsp; <span class="m m-na">–</span> nie dotyczy &nbsp; <span class="m m-missing_docs">!</span> brak dokumentów &nbsp; <span class="m m-reminded">@</span> wysłano przypomnienie &nbsp; <span class="m"></span> do zrobienia</p>
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

  toolbar.querySelector('.sel-wrap').replaceWith(selBtn);
  body.addEventListener('keydown', onGridKey);
  main.replaceChildren(head, tiles, deadlines, banner, toolbar, viewsBar, legend, body, bulkBar);
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
    sb.removeChannel(channel); closePop(); body.removeEventListener('keydown', onGridKey);
    document.removeEventListener('fullscreenchange', onFsChange); document.removeEventListener('keydown', onKey);
    document.body.classList.remove('focus-mode');
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  };
}
