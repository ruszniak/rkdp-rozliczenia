// RKDP – rejestr zgłoszeń (CRM zadań): zgłoszenie, termin, opis, odpowiedzialny, status, komentarze i historia.
import { h, toast, fail, icon, modal, fmtDateTime, initials, infoTip } from '../ui.js';
import { sb, state, isAdmin, memberById, hasModule } from '../store.js';
import { fetchAll } from './rozliczenia.js';

const BASE = '#/zgloszenia';
export const TK_STATUS = { nowe: 'Nowe', w_toku: 'W toku', czeka: 'Czeka na klienta', zrobione: 'Zrobione', anulowane: 'Anulowane' };
export const TK_OPEN = ['nowe', 'w_toku', 'czeka'];
export const TK_PRIO = { pilny: 'Pilny', wysoki: 'Wysoki', normalny: 'Normalny', niski: 'Niski' };
export const TK_CAT = {
  klient: 'Pytanie / prośba klienta', dokumenty: 'Brakujące dokumenty', deklaracja: 'Deklaracja / rozliczenie', kadry: 'Kadry i płace',
  korekta: 'Korekta', urzad: 'Pismo z urzędu (US, ZUS)', rejestr: 'Zmiany rejestrowe (KRS, CEIDG)', umowa: 'Umowa / pełnomocnictwo', wewn: 'Sprawa wewnętrzna', inne: 'Inne',
};
const TK_SOURCE = { '': '—', telefon: 'Telefon', email: 'E-mail', osobiscie: 'Osobiście', saldeo: 'Saldeo', komunikator: 'SMS / komunikator', wewn: 'Wewnętrzne', cykliczne: 'Zadanie cykliczne' };
const PRIO_ORDER = { pilny: 0, wysoki: 1, normalny: 2, niski: 3 };

const HELP = `Rejestr zgłoszeń to lista spraw do załatwienia w biurze – od prośby klienta przez brakujące dokumenty po pisma z urzędu.

• Zgłoszenie: tytuł, opis co zrobić, klient (opcjonalnie), kategoria, priorytet, skąd przyszło, termin realizacji i osoba odpowiedzialna.
• Statusy: Nowe → W toku → (Czeka na klienta) → Zrobione. Można też Anulować albo Otworzyć ponownie.
• „Zrobione” – przy zamknięciu wpisujesz, co zostało zrobione; zostaje to w historii.
• Komentarze: każdy może dopisać notatkę. Zmiany statusu, terminu, priorytetu i odpowiedzialnego zapisują się same.
• Kafelki u góry filtrują listę: otwarte, moje, po terminie, na dziś.
• Zgłoszenia klienta widać też na jego karcie.
• Zadania cykliczne (przycisk „↻ Zadania cykliczne”): np. „co miesiąc do 10. – zebrać dokumenty od klienta X”. Zgłoszenie tworzy się samo kilka dni przed terminem.
• Kto widzi: osoby z pełnym dostępem wszystko; pozostali – zgłoszenia swoich klientów, utworzone przez siebie i przypisane do siebie. Usuwa tylko administrator.`;

const today = () => new Date().toISOString().slice(0, 10);
const addDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const dShort = iso => iso ? iso.slice(0, 10).split('-').reverse().join('.') : '';
const isLate = t => TK_OPEN.includes(t.status) && t.due_date && t.due_date < today();
const isSoon = t => TK_OPEN.includes(t.status) && t.due_date && t.due_date >= today() && t.due_date <= addDays(2);
const who = id => memberById(id)?.full_name || '—';
const teamOpts = () => state.members.filter(m => m.active && (m.modules || ['rozliczenia']).includes('rozliczenia'));

export const statusTag = s => h('span', { class: 'tk-st ' + s }, TK_STATUS[s] || s);
const prioTag = p => p === 'normalny' ? null : h('span', { class: 'tk-pr ' + p }, TK_PRIO[p]);
export const dueTag = t => t.due_date ? h('span', { class: 'tk-due' + (isLate(t) ? ' late' : isSoon(t) ? ' soon' : '') },
  dShort(t.due_date) + (isLate(t) ? ' · po terminie' : t.due_date === today() && TK_OPEN.includes(t.status) ? ' · dziś' : '')) : h('span', { class: 'muted small' }, 'bez terminu');
const avatar = id => id ? h('span', { class: 'person', style: { padding: 0 }, 'data-tip': who(id) }, h('span', { class: 'av' }, initials(who(id)))) : h('span', { class: 'person unassigned', style: { padding: 0 } }, h('span', { class: 'av' }, '?'));

// ---------- wspólne pola formularza ----------
function fieldsGrid(t, clients, onChange = () => {}) {
  const mk = (key, label, el, wide) => {
    el.value = t[key] ?? '';
    el.addEventListener(el.tagName === 'SELECT' || el.type === 'date' ? 'change' : 'input', () => { t[key] = el.value; onChange(key); });
    return h('label', { class: 'field' + (wide ? ' wide' : '') }, h('span', {}, label), el);
  };
  const sel = (opts) => h('select', { class: 'select' }, ...Object.entries(opts).map(([k, v]) => h('option', { value: k }, v)));
  const cl = h('select', { class: 'select' }, h('option', { value: '' }, '— bez klienta —'), ...clients.map(c => h('option', { value: c.id }, c.name)));
  return h('div', { class: 'form-grid' },
    mk('title', 'Zgłoszenie (krótko, co trzeba zrobić)', h('input', { class: 'input', placeholder: 'np. Korekta VAT za wrzesień' }), true),
    mk('description', 'Opis – co zrobić, szczegóły', h('textarea', { class: 'input', rows: 4 }), true),
    mk('client_id', 'Klient', cl),
    mk('category', 'Kategoria', sel(TK_CAT)),
    mk('due_date', 'Termin realizacji', h('input', { class: 'input', type: 'date' })),
    mk('priority', 'Priorytet', sel(TK_PRIO)),
    mk('assignee_id', 'Odpowiedzialny', sel({ '': '— nieprzypisane —', ...Object.fromEntries(teamOpts().map(m => [m.id, m.full_name])) })),
    mk('source', 'Skąd zgłoszenie', sel(TK_SOURCE)));
}

const loadClients = () => fetchAll(() => sb.from('clients').select('id, name').order('name'));

export async function newTicketDialog({ client = null, onSaved } = {}) {
  const clients = client ? [client] : await loadClients();
  const t = { title: '', description: '', client_id: client?.id || '', category: client ? 'klient' : 'inne', priority: 'normalny', due_date: addDays(7), assignee_id: state.me.id, source: '' };
  const close = modal('Nowe zgłoszenie', fieldsGrid(t, clients), (close) => [
    h('button', { class: 'btn btn-ghost btn-sm', onclick: close }, 'Anuluj'),
    h('button', { class: 'btn btn-primary btn-sm', onclick: async () => {
      if (!t.title.trim()) return toast('Wpisz, czego dotyczy zgłoszenie', true);
      const row = { ...t, title: t.title.trim(), description: t.description.trim() || null, client_id: t.client_id || null, assignee_id: t.assignee_id || null, due_date: t.due_date || null, source: t.source || null, created_by: state.me.id };
      const { data, error } = await sb.from('rkdp_tickets').insert(row).select('*').single();
      if (error) return fail(error);
      close(); toast(`Dodano zgłoszenie #${data.no}`);
      if (onSaved) onSaved(data); else location.hash = `${BASE}/${data.id}`;
    } }, 'Dodaj zgłoszenie'),
  ], { wide: true });
  return close;
}

// ---------- lista ----------
export const generateRecurring = () => sb.rpc('rkdp_generate_recurring').then(r => r.data || 0, () => 0);

export async function renderZgloszenia(main, id, params) {
  if (id === 'cykliczne') return renderTemplates(main);
  if (id) return renderTicket(main, id);
  const created = await generateRecurring();
  if (created) toast(`Utworzono zgłoszenia cykliczne: ${created}`);
  const [tickets, clients] = await Promise.all([
    fetchAll(() => sb.from('rkdp_tickets').select('*').order('created_at', { ascending: false })),
    loadClients(),
  ]);
  const cname = Object.fromEntries(clients.map(c => [c.id, c.name]));
  const me = state.me.id;
  const F = {
    otwarte: ['Otwarte', t => TK_OPEN.includes(t.status)],
    moje: ['Moje otwarte', t => TK_OPEN.includes(t.status) && t.assignee_id === me],
    po_terminie: ['Po terminie', isLate],
    dzis: ['Na dziś i jutro', t => TK_OPEN.includes(t.status) && t.due_date && t.due_date <= addDays(1)],
    czeka: ['Czeka na klienta', t => t.status === 'czeka'],
    zrobione: ['Zrobione', t => t.status === 'zrobione'],
    wszystkie: ['Wszystkie', () => true],
  };
  let filter = params?.get('f') && F[params.get('f')] ? params.get('f') : 'otwarte';
  let q = '', person = '', cat = '';

  const tile = (key, dark) => {
    const n = tickets.filter(F[key][1]).length;
    return h('button', { class: 'card tile tk-tile' + (dark && n ? ' dark' : '') + (filter === key ? ' on' : ''), type: 'button', onclick: () => { filter = key; history.replaceState(null, '', `${BASE}?f=${key}`); draw(); } },
      h('span', { class: 'num' }, String(n)), h('span', { class: 'lbl' }, F[key][0]));
  };
  const tiles = h('div', { class: 'tiles' });
  const search = h('input', { class: 'input grow', type: 'search', placeholder: 'Szukaj w tytule, opisie, kliencie, numerze…', oninput: e => { q = e.target.value.toLowerCase(); draw(); } });
  const personSel = h('select', { class: 'select', onchange: e => { person = e.target.value; draw(); } }, h('option', { value: '' }, 'Wszyscy odpowiedzialni'), h('option', { value: 'none' }, 'Nieprzypisane'), ...teamOpts().map(m => h('option', { value: m.id }, m.full_name)));
  const catSel = h('select', { class: 'select', onchange: e => { cat = e.target.value; draw(); } }, h('option', { value: '' }, 'Wszystkie kategorie'), ...Object.entries(TK_CAT).map(([k, v]) => h('option', { value: k }, v)));
  const filterSel = h('select', { class: 'select', onchange: e => { filter = e.target.value; draw(); } }, ...Object.entries(F).map(([k, [l]]) => h('option', { value: k }, l)));
  const tbody = h('tbody');
  const counter = h('span', { class: 'small muted' });

  function draw() {
    tiles.replaceChildren(tile('otwarte'), tile('moje'), tile('po_terminie', true), tile('dzis'));
    filterSel.value = filter;
    const rows = tickets.filter(F[filter][1])
      .filter(t => !person || (person === 'none' ? !t.assignee_id : t.assignee_id === person))
      .filter(t => !cat || t.category === cat)
      .filter(t => !q || `#${t.no} ${t.title} ${t.description || ''} ${cname[t.client_id] || ''}`.toLowerCase().includes(q))
      .sort((a, b) => TK_OPEN.includes(a.status) && TK_OPEN.includes(b.status)
        ? ((a.due_date || '9999') < (b.due_date || '9999') ? -1 : (a.due_date || '9999') > (b.due_date || '9999') ? 1 : PRIO_ORDER[a.priority] - PRIO_ORDER[b.priority])
        : (b.updated_at || '').localeCompare(a.updated_at || ''));
    counter.textContent = `${rows.length} z ${tickets.length}`;
    tbody.replaceChildren(...(rows.length ? rows.map(t => h('tr', { class: 'click' + (isLate(t) ? ' tk-late-row' : ''), onclick: () => { location.hash = `${BASE}/${t.id}`; } },
      h('td', { class: 'small muted' }, `#${t.no}`),
      h('td', {}, h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } }, h('b', {}, t.title), prioTag(t.priority)),
        h('div', { class: 'small muted' }, [cname[t.client_id], TK_CAT[t.category]].filter(Boolean).join(' · '))),
      h('td', {}, dueTag(t)),
      h('td', {}, avatar(t.assignee_id)),
      h('td', {}, statusTag(t.status))))
      : [h('tr', {}, h('td', { colspan: 5, class: 'empty' }, tickets.length ? 'Brak zgłoszeń dla tego filtra.' : 'Nie ma jeszcze zgłoszeń. Dodaj pierwsze przyciskiem „Nowe zgłoszenie”.'))]));
  }
  draw();

  main.replaceChildren(
    h('div', { class: 'page-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, 'Rejestr zgłoszeń'),
        h('h1', { style: { marginTop: '6px', display: 'flex', alignItems: 'center' } }, 'Zgłoszenia', infoTip(HELP, 'Zgłoszenia – instrukcja')),
        h('p', { class: 'sub' }, 'Sprawy do załatwienia: kto, co, do kiedy – z komentarzami i historią.')),
      h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
        h('a', { class: 'btn btn-outline', href: `${BASE}/cykliczne` }, '↻ Zadania cykliczne'),
        h('button', { class: 'btn btn-primary', onclick: () => newTicketDialog().catch(e => fail(e)) }, icon('plus'), 'Nowe zgłoszenie'))),
    tiles,
    h('div', { class: 'toolbar' }, search, filterSel, personSel, catSel, counter),
    h('div', { class: 'list-wrap' }, h('table', { class: 'list' },
      h('thead', {}, h('tr', {}, ...['#', 'Zgłoszenie', 'Termin', 'Kto', 'Status'].map(x => h('th', {}, x)))), tbody)));
}

// ---------- szczegóły ----------
async function renderTicket(main, id) {
  const [{ data: t0, error }, { data: comments, error: e2 }, clients] = await Promise.all([
    sb.from('rkdp_tickets').select('*').eq('id', id).single(),
    sb.from('rkdp_ticket_comments').select('*').eq('ticket_id', id).order('created_at'),
    loadClients(),
  ]);
  if (error) throw error;
  if (e2) throw e2;
  let t = t0;
  const draft = { ...t, description: t.description || '', client_id: t.client_id || '', assignee_id: t.assignee_id || '', due_date: t.due_date || '', source: t.source || '' };
  let dirty = false;
  const saveInfo = h('span', { class: 'small muted' }, `Utworzono ${fmtDateTime(t.created_at)} · ${who(t.created_by)}`);
  const saveBtn = h('button', { class: 'btn btn-primary', disabled: true, onclick: () => save() }, 'Zapisz zmiany');
  const markDirty = () => { dirty = true; saveBtn.disabled = false; saveInfo.textContent = 'Niezapisane zmiany'; };

  async function save(extra = {}) {
    if (!draft.title.trim()) return toast('Tytuł nie może być pusty', true);
    const row = { title: draft.title.trim(), description: draft.description.trim() || null, client_id: draft.client_id || null, category: draft.category, priority: draft.priority,
      due_date: draft.due_date || null, assignee_id: draft.assignee_id || null, source: draft.source || null, ...extra };
    const { data, error: er } = await sb.from('rkdp_tickets').update(row).eq('id', t.id).select('*').single();
    if (er) { fail(er); return false; }
    t = data; dirty = false;
    toast('Zapisano');
    renderTicket(main, t.id);
    return true;
  }
  async function addComment(body, kind = 'komentarz') {
    const { error: er } = await sb.from('rkdp_ticket_comments').insert({ ticket_id: t.id, body, kind, author_id: state.me.id });
    if (er) { fail(er); return false; }
    return true;
  }
  const setStatus = async (status) => {
    if (dirty && !confirm('Masz niezapisane zmiany – zapisać je razem ze zmianą statusu?')) return;
    await save({ status });
  };
  function doneDialog() {
    const ta = h('textarea', { class: 'input', rows: 4, placeholder: 'np. Złożono korektę VAT-7 za 09/2026, UPO w Saldeo; klient poinformowany mailem.' });
    modal('Zgłoszenie zrobione', h('div', {}, h('label', { class: 'field wide' }, h('span', {}, 'Co zostało zrobione?'), ta),
      h('p', { class: 'hint' }, 'Opis zostanie w historii zgłoszenia.')), (close) => [
      h('button', { class: 'btn btn-ghost btn-sm', onclick: close }, 'Anuluj'),
      h('button', { class: 'btn btn-primary btn-sm', onclick: async () => {
        const body = ta.value.trim();
        if (!body) return toast('Wpisz krótko, co zostało zrobione', true);
        if (!(await addComment(body, 'wykonanie'))) return;
        close(); await save({ status: 'zrobione' });
      } }, 'Zamknij zgłoszenie'),
    ]);
  }

  const open = TK_OPEN.includes(t.status);
  const actions = h('div', { class: 'tk-actions' },
    t.status === 'nowe' ? h('button', { class: 'btn btn-outline btn-sm', onclick: () => setStatus('w_toku') }, 'Rozpocznij') : null,
    t.status !== 'czeka' && open ? h('button', { class: 'btn btn-outline btn-sm', onclick: () => setStatus('czeka') }, 'Czeka na klienta') : null,
    t.status === 'czeka' ? h('button', { class: 'btn btn-outline btn-sm', onclick: () => setStatus('w_toku') }, 'Wróć do realizacji') : null,
    open ? h('button', { class: 'btn btn-primary btn-sm', onclick: doneDialog }, '✓ Zrobione') : null,
    open ? h('button', { class: 'btn btn-ghost btn-sm', onclick: async () => { const why = prompt('Powód anulowania (opcjonalnie):'); if (why === null) return; if (why.trim()) await addComment('Anulowano: ' + why.trim()); setStatus('anulowane'); } }, 'Anuluj zgłoszenie') : null,
    !open ? h('button', { class: 'btn btn-outline btn-sm', onclick: () => setStatus('w_toku') }, 'Otwórz ponownie') : null,
    isAdmin() ? h('button', { class: 'btn btn-danger btn-sm', onclick: async () => {
      if (!confirm(`Usunąć zgłoszenie #${t.no} razem z komentarzami? Tego nie da się cofnąć.`)) return;
      const { error: er } = await sb.from('rkdp_tickets').delete().eq('id', t.id);
      if (er) return fail(er);
      toast('Usunięto'); location.hash = BASE;
    } }, 'Usuń') : null);

  // komentarze
  const ta = h('textarea', { class: 'input', rows: 3, placeholder: 'Dopisz komentarz, ustalenie z klientem, notatkę…' });
  const sendBtn = h('button', { class: 'btn btn-outline btn-sm', onclick: async () => {
    const body = ta.value.trim(); if (!body) return;
    sendBtn.disabled = true;
    if (await addComment(body)) { ta.value = ''; renderTicket(main, t.id); }
    sendBtn.disabled = false;
  } }, 'Dodaj komentarz');
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) sendBtn.click(); });
  const items = [{ kind: 'utworzenie', body: 'Utworzono zgłoszenie', author_id: t.created_by, created_at: t.created_at }, ...(comments || [])];
  const timeline = h('div', { class: 'tk-timeline' }, ...items.slice().reverse().map(c => h('div', { class: 'tk-c ' + c.kind },
    h('span', { class: 'av' }, initials(who(c.author_id))),
    h('div', { class: 'tk-c-body' },
      h('div', { class: 'small muted' }, h('b', { style: { color: 'var(--ink)' } }, who(c.author_id)), ' · ', fmtDateTime(c.created_at),
        c.kind === 'wykonanie' ? h('span', { class: 'tk-st zrobione', style: { marginLeft: '8px' } }, 'wykonanie') : null,
        c.kind === 'komentarz' && c.id && (c.author_id === state.me.id || isAdmin()) ? h('button', { class: 'tk-del', 'aria-label': 'Usuń komentarz', onclick: async () => {
          if (!confirm('Usunąć komentarz?')) return;
          const { error: er } = await sb.from('rkdp_ticket_comments').delete().eq('id', c.id);
          if (er) return fail(er); renderTicket(main, t.id);
        } }, 'usuń') : null),
      h('div', { class: c.kind === 'zmiana' || c.kind === 'utworzenie' ? 'small muted' : 'tk-text' }, c.body)))));

  const clientName = clients.find(c => c.id === t.client_id)?.name;
  main.replaceChildren(
    h('a', { href: BASE, class: 'small', style: { fontWeight: 600, textDecoration: 'none' } }, '← Wszystkie zgłoszenia'),
    h('div', { class: 'page-head', style: { marginTop: '10px' } },
      h('div', {}, h('p', { class: 'eyebrow' }, `Zgłoszenie #${t.no}${clientName ? ' · ' + clientName : ''}`),
        h('h1', { style: { marginTop: '6px' } }, t.title),
        h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginTop: '8px' } },
          statusTag(t.status), prioTag(t.priority), dueTag(t), h('span', { class: 'small muted' }, 'Odpowiada: ' + (t.assignee_id ? who(t.assignee_id) : 'nikt')),
          t.done_at ? h('span', { class: 'small muted' }, `Zrobione ${fmtDateTime(t.done_at)} · ${who(t.done_by)}`) : null)),
      actions),
    h('div', { class: 'two' },
      h('div', {},
        h('section', { class: 'card section' }, h('div', { class: 'section-head' }, h('h2', {}, 'Szczegóły')),
          fieldsGrid(draft, clients, markDirty),
          t.client_id && hasModule('rozliczenia') ? h('p', { class: 'small', style: { marginTop: '10px' } }, h('a', { href: `#/klient/${t.client_id}` }, 'Karta klienta →')) : null),
        h('div', { class: 'savebar' }, saveInfo, saveBtn)),
      h('div', {},
        h('section', { class: 'card section' }, h('div', { class: 'section-head' }, h('h2', {}, `Komentarze i historia (${(comments || []).length})`)),
          ta, h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0 14px' } }, h('span', { class: 'hint' }, 'Ctrl+Enter – wyślij'), sendBtn),
          timeline))));
  const beforeUnload = e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', beforeUnload);
  return () => window.removeEventListener('beforeunload', beforeUnload);
}

// ---------- karta klienta: zgłoszenia klienta ----------
export function clientTicketsBox(client) {
  const box = h('section', { class: 'card section' });
  async function load() {
    const { data, error } = await sb.from('rkdp_tickets').select('*').eq('client_id', client.id).order('created_at', { ascending: false }).limit(50);
    if (error) { box.replaceChildren(); return; }
    const open = (data || []).filter(t => TK_OPEN.includes(t.status)).sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'));
    const done = (data || []).filter(t => !TK_OPEN.includes(t.status)).slice(0, 5);
    const row = t => h('a', { class: 'tk-mini', href: `${BASE}/${t.id}` },
      h('div', {}, h('b', {}, t.title), h('div', { class: 'small muted' }, `#${t.no} · ${TK_CAT[t.category] || ''}`)),
      h('div', { style: { textAlign: 'right' } }, statusTag(t.status), h('div', {}, TK_OPEN.includes(t.status) ? dueTag(t) : null)));
    box.replaceChildren(
      h('div', { class: 'section-head' }, h('h2', {}, `Zgłoszenia (${open.length} otwartych)`),
        h('button', { class: 'btn btn-outline btn-sm', onclick: () => newTicketDialog({ client, onSaved: () => load() }).catch(e => fail(e)) }, icon('plus'), 'Nowe')),
      ...(open.length ? open.map(row) : [h('p', { class: 'hint' }, 'Brak otwartych zgłoszeń.')]),
      ...(done.length ? [h('details', { style: { marginTop: '10px' } }, h('summary', { class: 'small muted', style: { cursor: 'pointer' } }, `Ostatnio zamknięte (${done.length})`), ...done.map(row))] : []));
  }
  load();
  return box;
}

// ---------- zadania cykliczne ----------
const FREQ = { miesiac: 'Co miesiąc', kwartal: 'Co kwartał', rok: 'Co roku', tydzien: 'Co tydzień' };
const WEEKDAY = { 1: 'poniedziałek', 2: 'wtorek', 3: 'środa', 4: 'czwartek', 5: 'piątek', 6: 'sobota', 7: 'niedziela' };
const MONTH_GEN = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
export function freqText(t) {
  const d = Number(t.due_day), m = Number(t.due_month);
  if (t.frequency === 'tydzien') return `co tydzień – ${WEEKDAY[d] || ''}`;
  if (t.frequency === 'kwartal') return `co kwartał – ${d}. dnia ${m}. miesiąca kwartału`;
  if (t.frequency === 'rok') return `co roku – ${d} ${MONTH_GEN[m - 1] || ''}`;
  return `co miesiąc – do ${d}. dnia`;
}
const TPL_HELP = `Zadanie cykliczne samo tworzy zgłoszenie w rejestrze – np. „co miesiąc do 10. – zebrać dokumenty od klienta X”.

• Częstotliwość: co tydzień, co miesiąc, co kwartał albo co roku – z dniem terminu.
• „Utwórz … dni przed terminem” – zgłoszenie pojawi się na liście z wyprzedzeniem (np. 7 dni przed terminem).
• Zgłoszenie dostaje osobę odpowiedzialną, klienta, kategorię i priorytet z szablonu; dalej obsługujesz je jak każde inne.
• Zgłoszenia tworzą się przy wejściu do aplikacji (pulpit lub zgłoszenia) – nic nie trzeba uruchamiać ręcznie.
• Szablon można wstrzymać (odznacz „aktywne”) albo usunąć – już utworzone zgłoszenia zostają.`;

function templateDialog(tpl, clients, onSaved) {
  const t = tpl ? { ...tpl, client_id: tpl.client_id || '', assignee_id: tpl.assignee_id || '', description: tpl.description || '' }
    : { title: '', description: '', client_id: '', category: 'dokumenty', priority: 'normalny', assignee_id: state.me.id, frequency: 'miesiac', due_day: 10, due_month: 1, lead_days: 7, active: true };
  const box = h('div');
  const sel = (key, opts, label, wide) => {
    const el = h('select', { class: 'select' }, ...Object.entries(opts).map(([k, v]) => h('option', { value: k }, v)));
    el.value = String(t[key] ?? '');
    el.addEventListener('change', () => { t[key] = el.value; if (key === 'frequency') { if (el.value === 'tydzien' && t.due_day > 7) t.due_day = 1; if (el.value === 'kwartal' && t.due_month > 3) t.due_month = 1; draw(); } else preview(); });
    return h('label', { class: 'field' + (wide ? ' wide' : '') }, h('span', {}, label), el);
  };
  const inp = (key, label, o = {}) => {
    const el = o.area ? h('textarea', { class: 'input', rows: 3 }, t[key] ?? '') : h('input', { class: 'input', type: o.type || 'text', min: o.min, max: o.max, value: t[key] ?? '', placeholder: o.ph || '' });
    el.addEventListener('input', () => { t[key] = o.type === 'number' ? Number(el.value) : el.value; preview(); });
    return h('label', { class: 'field' + (o.wide || o.area ? ' wide' : '') }, h('span', {}, label), el);
  };
  const pv = h('p', { class: 'hint wide', style: { marginTop: '4px' } });
  const preview = () => { pv.textContent = `Termin: ${freqText(t)}. Zgłoszenie pojawi się ${Number(t.lead_days) || 0} dni przed terminem.`; };
  const days = Object.fromEntries(Array.from({ length: 31 }, (_, i) => [i + 1, `${i + 1}.`]));
  function draw() {
    const act = h('input', { type: 'checkbox', checked: t.active !== false });
    act.addEventListener('change', () => { t.active = act.checked; });
    box.replaceChildren(h('div', { class: 'form-grid' },
      inp('title', 'Co trzeba zrobić', { wide: true, ph: 'np. Zebrać dokumenty za poprzedni miesiąc' }),
      inp('description', 'Opis (opcjonalnie)', { area: true }),
      sel('client_id', { '': '— bez klienta —', ...Object.fromEntries(clients.map(c => [c.id, c.name])) }, 'Klient'),
      sel('assignee_id', { '': '— nieprzypisane —', ...Object.fromEntries(teamOpts().map(m => [m.id, m.full_name])) }, 'Odpowiedzialny'),
      sel('category', TK_CAT, 'Kategoria'), sel('priority', TK_PRIO, 'Priorytet'),
      sel('frequency', FREQ, 'Jak często'),
      t.frequency === 'tydzien' ? sel('due_day', WEEKDAY, 'Dzień tygodnia') : sel('due_day', days, 'Dzień miesiąca (termin)'),
      t.frequency === 'rok' ? sel('due_month', Object.fromEntries(MONTH_GEN.map((m, i) => [i + 1, m])), 'Miesiąc') : null,
      t.frequency === 'kwartal' ? sel('due_month', { 1: '1. miesiąc kwartału (sty, kwi, lip, paź)', 2: '2. miesiąc kwartału (lut, maj, sie, lis)', 3: '3. miesiąc kwartału (mar, cze, wrz, gru)' }, 'Miesiąc kwartału') : null,
      inp('lead_days', 'Utwórz zgłoszenie … dni przed terminem', { type: 'number', min: 0, max: 60 }),
      h('label', { class: 'check', style: { alignSelf: 'end' } }, act, 'aktywne'),
      pv));
    preview();
  }
  draw();
  modal(tpl ? 'Zadanie cykliczne' : 'Nowe zadanie cykliczne', box, (close) => [
    tpl ? h('button', { class: 'btn btn-danger btn-sm', onclick: async () => {
      if (!confirm('Usunąć zadanie cykliczne? Utworzone już zgłoszenia zostaną.')) return;
      const { error } = await sb.from('rkdp_ticket_templates').delete().eq('id', tpl.id);
      if (error) return fail(error);
      close(); toast('Usunięto'); onSaved();
    } }, 'Usuń') : null,
    h('button', { class: 'btn btn-ghost btn-sm', onclick: close }, 'Anuluj'),
    h('button', { class: 'btn btn-primary btn-sm', onclick: async () => {
      if (!String(t.title).trim()) return toast('Wpisz, co trzeba zrobić', true);
      const row = { title: t.title.trim(), description: (t.description || '').trim() || null, client_id: t.client_id || null, assignee_id: t.assignee_id || null,
        category: t.category, priority: t.priority, frequency: t.frequency, due_day: Number(t.due_day), due_month: Number(t.due_month) || 1,
        lead_days: Math.max(0, Math.min(60, Number(t.lead_days) || 0)), active: t.active !== false };
      const q = tpl ? sb.from('rkdp_ticket_templates').update({ ...row, next_due: null }).eq('id', tpl.id) : sb.from('rkdp_ticket_templates').insert({ ...row, created_by: state.me.id });
      const { error } = await q;
      if (error) return fail(error);
      close(); toast('Zapisano'); await generateRecurring(); onSaved();
    } }, 'Zapisz'),
  ], { wide: true });
}

async function renderTemplates(main) {
  const [rows, clients] = await Promise.all([
    fetchAll(() => sb.from('rkdp_ticket_templates').select('*').order('next_due')),
    loadClients(),
  ]);
  const cname = Object.fromEntries(clients.map(c => [c.id, c.name]));
  const reload = () => renderTemplates(main);
  const canEdit = t => t.created_by === state.me.id || ['admin', 'full'].includes(state.me.role);
  main.replaceChildren(
    h('a', { href: BASE, class: 'small', style: { fontWeight: 600, textDecoration: 'none' } }, '← Wszystkie zgłoszenia'),
    h('div', { class: 'page-head', style: { marginTop: '10px' } },
      h('div', {}, h('p', { class: 'eyebrow' }, 'Rejestr zgłoszeń'),
        h('h1', { style: { marginTop: '6px', display: 'flex', alignItems: 'center' } }, 'Zadania cykliczne', infoTip(TPL_HELP, 'Zadania cykliczne – instrukcja')),
        h('p', { class: 'sub' }, 'Szablony, z których zgłoszenia tworzą się same – co tydzień, miesiąc, kwartał albo rok.')),
      h('button', { class: 'btn btn-primary', onclick: () => templateDialog(null, clients, reload) }, icon('plus'), 'Nowe zadanie cykliczne')),
    h('div', { class: 'list-wrap' }, h('table', { class: 'list' },
      h('thead', {}, h('tr', {}, ...['Zadanie', 'Kiedy', 'Następny termin', 'Kto', ''].map(x => h('th', {}, x)))),
      h('tbody', {}, ...(rows.length ? rows.map(t => h('tr', { class: 'click' + (t.active ? '' : ' tk-off'), onclick: () => canEdit(t) ? templateDialog(t, clients, reload) : toast('Ten szablon może zmienić autor albo osoba z pełnym dostępem', true) },
        h('td', {}, h('b', {}, t.title), h('div', { class: 'small muted' }, [cname[t.client_id], TK_CAT[t.category]].filter(Boolean).join(' · '))),
        h('td', { class: 'small' }, freqText(t), h('div', { class: 'muted' }, `zgłoszenie ${t.lead_days} dni wcześniej`)),
        h('td', {}, t.active ? (t.next_due ? dShort(t.next_due) : '—') : h('span', { class: 'tk-st anulowane' }, 'wstrzymane')),
        h('td', {}, avatar(t.assignee_id)),
        h('td', { class: 'small muted' }, t.last_created ? `ostatnio: ${dShort(t.last_created)}` : '')))
        : [h('tr', {}, h('td', { colspan: 5, class: 'empty' }, 'Brak zadań cyklicznych. Dodaj pierwsze – np. „co miesiąc do 10. – zebrać dokumenty od klienta X”.'))])))));
}
