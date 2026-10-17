import { h, icon, toast, fail, periodLabel, shiftPeriod, defaultPeriod, downloadCsv } from '../ui.js';
import { sb, state, memberById, activeTasks } from '../store.js';
import { STATUS, STATUS_ORDER, LEGAL_SHORT, FORM_GROUP, deadlinesFor } from '../dict.js';

const PREF_KEY = 'rkdp-rozliczenia-filtry';
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

const GROUP_ORDER = { jdg: 0, osobowe: 1, kapitalowe: 2 };
const groupOf = c => FORM_GROUP[c.legal_form] || 'inne';

export async function renderRozliczenia(main, params) {
  const period = /^\d{4}-\d{2}$/.test(params.get('okres') || '') ? params.get('okres') : defaultPeriod();
  const pdate = period + '-01';
  const prefs = { q: '', group: '', person: '', show: '', ...loadPrefs() };
  const tasks = activeTasks();

  main.replaceChildren(h('div', { class: 'spinner' }, 'Wczytywanie rozliczeń…'));

  const [clients, entries, notes] = await Promise.all([
    fetchAll(() => sb.from('clients')
      .select('id,name,status,legal_form,bookkeeping,vat_status,pit_form,cit_type,client_assignments(member_id)')
      .order('name')),
    fetchAll(() => sb.from('checklist_entries').select('id,client_id,task_code,status,assignee_id,updated_by,updated_at').eq('period', pdate)),
    fetchAll(() => sb.from('period_notes').select('client_id,notes,questions').eq('period', pdate)),
  ]);

  // indeksy
  const byClient = new Map();          // client_id -> Map(task_code -> entry)
  for (const e of entries) {
    if (!byClient.has(e.client_id)) byClient.set(e.client_id, new Map());
    byClient.get(e.client_id).set(e.task_code, e);
  }
  const noteMap = new Map(notes.map(n => [n.client_id, n]));
  const clientMap = new Map(clients.map(c => [c.id, c]));
  const missing = clients.filter(c => c.status === 'aktywny' && !byClient.has(c.id));

  const rowsAll = () => clients.filter(c => byClient.has(c.id))
    .sort((a, b) => (GROUP_ORDER[groupOf(a)] ?? 3) - (GROUP_ORDER[groupOf(b)] ?? 3) || a.name.localeCompare(b.name, 'pl'));

  const isSettled = c => {
    const m = byClient.get(c.id);
    return m && m.size > 0 && [...m.values()].every(e => e.status === 'done' || e.status === 'na');
  };
  const hasMissing = c => [...(byClient.get(c.id)?.values() || [])].some(e => e.status === 'missing_docs');
  const hasQuestion = c => !!noteMap.get(c.id)?.questions?.trim();

  // ---------- nagłówek ----------
  const monthNav = h('div', { class: 'month' },
    h('a', { class: 'icon-btn', href: `#/rozliczenia?okres=${shiftPeriod(period, -1)}`, title: 'Poprzedni miesiąc', 'aria-label': 'Poprzedni miesiąc' }, icon('left')),
    h('span', { class: 'label' }, periodLabel(period)),
    h('a', { class: 'icon-btn', href: `#/rozliczenia?okres=${shiftPeriod(period, 1)}`, title: 'Następny miesiąc', 'aria-label': 'Następny miesiąc' }, icon('right')));

  const head = h('div', { class: 'page-head' },
    h('div', {}, h('p', { class: 'eyebrow' }, 'Rozliczenia miesięczne'),
      h('h1', { style: { marginTop: '6px' } }, 'Kto jest rozliczony?')),
    monthNav);

  // ---------- kafelki ----------
  const tiles = h('div', { class: 'tiles' });
  const renderTiles = () => {
    const rows = rowsAll();
    const settled = rows.filter(isSettled).length;
    const open = entries.filter(e => e.status === 'todo' || e.status === 'in_progress').length;
    const miss = rows.filter(hasMissing).length;
    const q = rows.filter(hasQuestion).length;
    const pct = rows.length ? Math.round(settled / rows.length * 100) : 0;
    tiles.replaceChildren(
      h('div', { class: 'card tile dark' }, h('span', { class: 'lbl' }, 'Klienci rozliczeni'),
        h('span', { class: 'num' }, `${settled} / ${rows.length}`),
        h('div', { class: 'bar' }, h('i', { style: { width: pct + '%' } }))),
      tileBtn(open, 'Zadań do zrobienia', 'nierozliczeni'),
      tileBtn(miss, 'Klientów z brakiem dokumentów', 'braki'),
      tileBtn(q, 'Pytań do wyjaśnienia', 'pytania'));
  };
  const tileBtn = (n, lbl, show) => h('button', { class: 'card tile', style: { textAlign: 'left', cursor: 'pointer' },
    onclick: () => { prefs.show = prefs.show === show ? '' : show; showSel.value = prefs.show; savePrefs(prefs); renderBody(); } },
  h('span', { class: 'lbl' }, lbl), h('span', { class: 'num' }, n));

  // ---------- terminy ----------
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const deadlines = h('div', { class: 'panel deadlines' },
    h('b', {}, 'Terminy za ' + periodLabel(period).toLowerCase() + ':'),
    deadlinesFor(period).map(d => h('span', { class: 'dl' + (d.date < today ? ' late' : '') },
      d.label, h('b', {}, d.date.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })),
      d.moved ? h('span', { class: 'small muted' }, '(przesunięty)') : null)));

  // ---------- baner otwierania miesiąca ----------
  const banner = h('div', { class: 'card', style: { padding: '18px 22px', marginBottom: '18px', display: 'flex', gap: '16px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' } });
  const renderBanner = () => {
    if (!missing.length) { banner.hidden = true; return; }
    banner.hidden = false;
    const none = entries.length === 0;
    banner.replaceChildren(
      h('div', {}, h('h3', {}, none ? `Lista na ${periodLabel(period).toLowerCase()} nie jest jeszcze otwarta` : `${missing.length} aktywnych klientów nie ma jeszcze listy w tym miesiącu`),
        h('p', { class: 'hint', style: { marginTop: '4px' } },
          'Pozycje „nie dotyczy” ustawią się automatycznie według profilu klienta (VAT, PIT/CIT, ZUS, pracownicy). Gdy profil nie jest uzupełniony, przejmiemy układ z poprzedniego miesiąca.')),
      h('button', { class: 'btn btn-primary', onclick: async (e) => {
        e.target.disabled = true;
        const { data, error } = await sb.rpc('generate_period', { p_period: pdate });
        if (error) { e.target.disabled = false; return fail(error); }
        toast(`Utworzono ${data} pozycji`);
        renderRozliczenia(main, params);
      } }, none ? 'Otwórz miesiąc' : 'Dodaj brakujących klientów'));
  };

  // ---------- filtry ----------
  const search = h('input', { class: 'input grow', type: 'search', placeholder: 'Szukaj klienta…', value: prefs.q, 'aria-label': 'Szukaj klienta' });
  const groupSel = h('select', { class: 'select', 'aria-label': 'Forma' },
    h('option', { value: '' }, 'Wszystkie formy'), h('option', { value: 'jdg' }, 'JDG'),
    h('option', { value: 'osobowe' }, 'Spółki osobowe'), h('option', { value: 'kapitalowe' }, 'Sp. z o.o. / S.A.'),
    h('option', { value: 'inne' }, 'Pozostałe'));
  groupSel.value = prefs.group;
  const personSel = h('select', { class: 'select', 'aria-label': 'Osoba' }, h('option', { value: '' }, 'Wszyscy pracownicy'),
    state.members.filter(m => m.active).map(m => h('option', { value: m.id }, m.short_name)));
  personSel.value = prefs.person;
  const showSel = h('select', { class: 'select', 'aria-label': 'Pokaż' },
    h('option', { value: '' }, 'Wszyscy klienci'), h('option', { value: 'nierozliczeni' }, 'Tylko nierozliczeni'),
    h('option', { value: 'braki' }, 'Z brakiem dokumentów'), h('option', { value: 'pytania' }, 'Z pytaniami'));
  showSel.value = prefs.show;
  const onFilter = () => {
    Object.assign(prefs, { q: search.value, group: groupSel.value, person: personSel.value, show: showSel.value });
    savePrefs(prefs); renderBody();
  };
  search.addEventListener('input', onFilter);
  [groupSel, personSel, showSel].forEach(s => s.addEventListener('change', onFilter));

  const exportBtn = h('button', { class: 'btn btn-outline btn-sm', onclick: () => exportCsv() }, icon('download'), 'Eksport do Excela');
  const toolbar = h('div', { class: 'toolbar' }, search, groupSel, personSel, showSel, exportBtn);

  // ---------- tabela ----------
  const thead = h('thead');
  const tbody = h('tbody');
  const table = h('table', { class: 'grid' }, thead, tbody);
  const gridWrap = h('div', { class: 'grid-wrap' }, table);
  const emptyBox = h('div', { class: 'card empty', hidden: true });

  const filtered = () => {
    const q = prefs.q.trim().toLowerCase();
    return rowsAll().filter(c => {
      if (q && !c.name.toLowerCase().includes(q)) return false;
      if (prefs.group && groupOf(c) !== prefs.group) return false;
      if (prefs.person) {
        const assigned = c.client_assignments?.some(a => a.member_id === prefs.person);
        const inCells = [...byClient.get(c.id).values()].some(e => e.assignee_id === prefs.person);
        if (!assigned && !inCells) return false;
      }
      if (prefs.show === 'nierozliczeni' && isSettled(c)) return false;
      if (prefs.show === 'braki' && !hasMissing(c)) return false;
      if (prefs.show === 'pytania' && !hasQuestion(c)) return false;
      return true;
    });
  };

  function renderHead() {
    const rows = rowsAll();
    thead.replaceChildren(h('tr', {},
      h('th', { class: 'c-name' }, 'Klient'),
      tasks.map(t => {
        const relevant = rows.map(c => byClient.get(c.id).get(t.code)).filter(e => e && e.status !== 'na');
        const done = relevant.filter(e => e.status === 'done').length;
        return h('th', {}, t.label, h('div', { class: 'small', style: { fontWeight: 500, marginTop: '2px' } }, `${done}/${relevant.length}`));
      }),
      h('th', { class: 'c-note' }, 'Uwagi'),
      h('th', { class: 'c-note' }, 'Pytania / problemy')));
  }

  function statusButton(entry) {
    if (!entry) return h('span', { class: 'muted small' }, '—');
    const st = STATUS[entry.status];
    const who = entry.assignee_id ? memberById(entry.assignee_id)?.short_name : null;
    let text = st.short || st.label;
    if ((entry.status === 'todo') && who) text = who;
    else if (entry.status === 'in_progress' && who) text = `W toku · ${who}`;
    const b = h('button', {
      class: `st st-${entry.status}` + (entry.status === 'todo' && who ? ' assigned' : ''),
      title: `${st.label}${who ? ' · ' + who : ''}${entry.updated_by && entry.updated_by !== 'system' ? '\nZmienione: ' + entry.updated_by + ', ' + new Date(entry.updated_at).toLocaleString('pl-PL') : ''}`,
      onclick: (ev) => openMenu(ev.currentTarget, entry),
    }, text);
    b.dataset.entry = entry.id;
    return b;
  }

  function noteCell(c, field) {
    const n = noteMap.get(c.id) || {};
    const div = h('div', { class: 'note-cell' + (field === 'questions' ? ' q' : ''), tabindex: '0', role: 'button',
      'data-ph': field === 'questions' ? '' : '', title: 'Kliknij, aby edytować' }, n[field] || '');
    const edit = () => {
      const ta = h('textarea', { class: 'note-edit' }, n[field] || '');
      div.replaceWith(ta); ta.focus();
      ta.addEventListener('keydown', e => { if (e.key === 'Escape') { ta.replaceWith(div); } });
      ta.addEventListener('blur', async () => {
        const val = ta.value.trim() || null;
        if ((n[field] || null) === val) { ta.replaceWith(div); return; }
        const cur = noteMap.get(c.id) || { client_id: c.id };
        const payload = { client_id: c.id, period: pdate, notes: cur.notes ?? null, questions: cur.questions ?? null, [field]: val };
        const { error } = await sb.from('period_notes').upsert(payload, { onConflict: 'client_id,period' });
        if (error) { fail(error); ta.replaceWith(div); return; }
        noteMap.set(c.id, { ...cur, [field]: val });
        const fresh = noteCell(c, field); ta.replaceWith(fresh);
        renderTiles();
      });
    };
    div.addEventListener('click', edit);
    div.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); edit(); } });
    return div;
  }

  function rowFor(c) {
    const m = byClient.get(c.id);
    const settled = isSettled(c);
    const owners = (c.client_assignments || []).map(a => memberById(a.member_id)?.short_name).filter(Boolean);
    const tr = h('tr', { class: settled ? 'settled' : null, 'data-client': c.id },
      h('td', { class: 'c-name' }, h('div', { class: 'cname' },
        h('span', { class: 'tick ' + (settled ? 'ok' : 'no'), title: settled ? 'Rozliczony' : 'Nierozliczony' }, settled ? '✓' : ''),
        h('div', {}, h('a', { href: `#/klient/${c.id}` }, c.name),
          h('div', { class: 'meta' },
            h('span', { class: 'badge' }, LEGAL_SHORT[c.legal_form] || '?'),
            c.status !== 'aktywny' ? h('span', { class: 'badge warn' }, c.status === 'zawieszony' ? 'zawieszony' : 'zakończony') : null,
            owners.length ? h('span', { class: 'small muted' }, owners.join(', ')) : null)))),
      tasks.map(t => h('td', {}, statusButton(m.get(t.code)))),
      h('td', { class: 'c-note' }, noteCell(c, 'notes')),
      h('td', { class: 'c-note' }, noteCell(c, 'questions')));
    return tr;
  }

  function renderBody() {
    const rows = filtered();
    tbody.replaceChildren(...rows.map(rowFor));
    const totalRows = rowsAll().length;
    emptyBox.hidden = rows.length > 0;
    gridWrap.hidden = rows.length === 0;
    emptyBox.textContent = totalRows === 0
      ? 'Brak listy na ten miesiąc. Użyj przycisku „Otwórz miesiąc” powyżej.'
      : 'Żaden klient nie pasuje do filtrów.';
    renderHead();
  }

  function refreshRow(clientId) {
    const tr = tbody.querySelector(`tr[data-client="${clientId}"]`);
    const c = clientMap.get(clientId);
    if (tr && c) tr.replaceWith(rowFor(c));
    renderTiles(); renderHead();
  }

  // ---------- menu statusu ----------
  function openMenu(anchor, entry) {
    document.querySelector('.pop')?.remove();
    const pop = h('div', { class: 'pop', role: 'menu' });
    const set = async (patch) => {
      pop.remove();
      const before = { status: entry.status, assignee_id: entry.assignee_id };
      Object.assign(entry, patch);
      refreshRow(entry.client_id);
      const { error } = await sb.from('checklist_entries').update(patch).eq('id', entry.id);
      if (error) { Object.assign(entry, before); refreshRow(entry.client_id); fail(error, 'Nie zapisano'); }
    };
    STATUS_ORDER.forEach(s => pop.append(h('button', { class: 'opt' + (entry.status === s ? ' cur' : ''), role: 'menuitem',
      onclick: () => set({ status: s }) }, h('span', { class: 'dot', style: { background: STATUS[s].color } }), STATUS[s].label)));
    pop.append(h('div', { class: 'sep' }), h('label', {}, 'Kto się zajmuje'));
    const sel = h('select', { class: 'select', onchange: () => set({ assignee_id: sel.value || null }) },
      h('option', { value: '' }, '— nikt —'),
      state.members.filter(m => m.active).map(m => h('option', { value: m.id }, m.full_name)));
    sel.value = entry.assignee_id || '';
    pop.append(sel);
    document.body.append(pop);
    const r = anchor.getBoundingClientRect();
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    pop.style.left = Math.max(8, Math.min(r.left, innerWidth - pw - 8)) + 'px';
    pop.style.top = (r.bottom + ph + 8 > innerHeight ? Math.max(8, r.top - ph - 6) : r.bottom + 6) + 'px';
    pop.querySelector('.opt.cur, .opt')?.focus();
    const close = (e) => {
      if (e.type === 'keydown' && e.key !== 'Escape') return;
      if (e.type === 'mousedown' && pop.contains(e.target)) return;
      pop.remove(); cleanupPop();
    };
    const cleanupPop = () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); gridWrap.removeEventListener('scroll', close2); };
    const close2 = () => { pop.remove(); cleanupPop(); };
    setTimeout(() => { document.addEventListener('mousedown', close); document.addEventListener('keydown', close); gridWrap.addEventListener('scroll', close2, { passive: true }); });
  }

  // ---------- eksport ----------
  function exportCsv() {
    const rows = filtered();
    const out = [['Lp.', 'Nazwa firmy', 'Forma', ...tasks.map(t => t.label), 'Rozliczony', 'Uwagi', 'Pytania / problemy']];
    rows.forEach((c, i) => {
      const m = byClient.get(c.id);
      out.push([i + 1, c.name, LEGAL_SHORT[c.legal_form] || '',
        ...tasks.map(t => {
          const e = m.get(t.code); if (!e) return '';
          const who = e.assignee_id ? memberById(e.assignee_id)?.short_name : '';
          return e.status === 'todo' ? (who || 'do zrobienia') : STATUS[e.status].label + (e.status === 'in_progress' && who ? ` (${who})` : '');
        }),
        isSettled(c) ? 'tak' : 'nie', noteMap.get(c.id)?.notes || '', noteMap.get(c.id)?.questions || '']);
    });
    downloadCsv(`rozliczenia_${period}.csv`, out);
  }

  main.replaceChildren(head, tiles, deadlines, banner, toolbar, gridWrap, emptyBox);
  renderBanner(); renderTiles(); renderBody();

  // ---------- zmiany na żywo od innych osób ----------
  const channel = sb.channel('rozliczenia-' + period)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'checklist_entries', filter: `period=eq.${pdate}` }, (p) => {
      const row = p.new;
      if (!row || !row.client_id || !clientMap.has(row.client_id)) return;
      if (p.eventType === 'DELETE') return;
      if (!byClient.has(row.client_id)) byClient.set(row.client_id, new Map());
      const cur = byClient.get(row.client_id).get(row.task_code);
      if (cur) Object.assign(cur, row); else { byClient.get(row.client_id).set(row.task_code, row); entries.push(row); }
      if (document.querySelector('.pop')) return; // nie przerywaj otwartego menu
      refreshRow(row.client_id);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'period_notes', filter: `period=eq.${pdate}` }, (p) => {
      const row = p.new;
      if (!row?.client_id || !clientMap.has(row.client_id)) return;
      noteMap.set(row.client_id, row);
      if (document.activeElement?.classList.contains('note-edit')) return;
      refreshRow(row.client_id);
    })
    .subscribe();

  return () => { sb.removeChannel(channel); document.querySelector('.pop')?.remove(); };
}
