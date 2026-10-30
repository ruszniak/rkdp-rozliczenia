// RKDP – rejestr zgłoszeń (CRM zadań): zgłoszenie, termin, opis, odpowiedzialny, status, komentarze i historia.
import { h, toast, fail, icon, modal, fmtDateTime, initials, infoTip, ava } from '../ui.js';
import { sb, state, isAdmin, memberById, hasModule } from '../store.js';
import { fetchAll } from './rozliczenia.js';

// ---------- moduły: RKDP (klienci biura) i M2 TAX (klienci i sprawy doradztwa) ----------
const CFG = {
  rkdp: { key: 'rkdp', base: '#/zgloszenia', team: 'rozliczenia', clientField: 'client_id', clientTable: 'clients', clientHref: id => `#/klient/${id}`, eyebrow: 'Rejestr zgłoszeń · RKDP' },
  m2: { key: 'm2', base: '#/doradztwo/zgloszenia', team: 'doradztwo', clientField: 'm2_client_id', clientTable: 'm2_clients', clientHref: id => `#/doradztwo/klient/${id}`, eyebrow: 'Rejestr zgłoszeń · M2 TAX' },
};
let cur = CFG.rkdp;
const use = mod => { cur = CFG[mod] || CFG.rkdp; return cur; };
let BASE = cur.base;
const setMod = mod => { use(mod); BASE = cur.base; };
export const TK_STATUS = { nowe: 'Nowe', w_toku: 'W toku', czeka: 'Czeka na klienta', zrobione: 'Zrobione', anulowane: 'Anulowane' };
export const TK_OPEN = ['nowe', 'w_toku', 'czeka'];
export const TK_PRIO = { pilny: 'Pilny', wysoki: 'Wysoki', normalny: 'Normalny', niski: 'Niski' };
export const TK_CAT = {
  klient: 'Pytanie / prośba klienta', dokumenty: 'Brakujące dokumenty', deklaracja: 'Deklaracja / rozliczenie', kadry: 'Kadry i płace',
  korekta: 'Korekta', urzad: 'Pismo z urzędu (US, ZUS)', rejestr: 'Zmiany rejestrowe (KRS, CEIDG)', umowa: 'Umowa / pełnomocnictwo', wewn: 'Sprawa wewnętrzna', inne: 'Inne',
};
export const TK_CAT_M2 = {
  klient: 'Pytanie / prośba klienta', pismo: 'Pismo / wezwanie z urzędu', postepowanie: 'Postępowanie / kontrola', sad: 'WSA / NSA',
  opinia: 'Opinia / analiza', interpretacja: 'Interpretacja / WIS', dokumenty: 'Dokumenty od klienta', oferta: 'Oferta / umowa / pełnomocnictwo', wewn: 'Sprawa wewnętrzna', inne: 'Inne',
};
const cats = () => cur.key === 'm2' ? TK_CAT_M2 : TK_CAT;
export const catLabel = (t) => (t.module === 'm2' ? TK_CAT_M2 : TK_CAT)[t.category] || TK_CAT[t.category] || TK_CAT_M2[t.category] || '';
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
• Załączniki: dodaj zrzut ekranu (Ctrl+V / ⌘V na stronie zgłoszenia), PDF albo dowolny plik – przeciągnij go na kartę „Załączniki” albo kliknij „Dodaj plik”. Na telefonie możesz dodać zdjęcie z aparatu.
• Kto widzi: osoby z pełnym dostępem wszystko; pozostali – zgłoszenia swoich klientów, utworzone przez siebie i przypisane do siebie. Usuwa tylko administrator.`;
const HELP_M2 = `Rejestr zgłoszeń M2 TAX – sprawy do załatwienia w doradztwie: pytania klientów, pisma z urzędów, opinie, przygotowanie ofert i umów.

• Zgłoszenie: tytuł, opis co zrobić, klient i sprawa (opcjonalnie), kategoria, priorytet, termin realizacji i osoba odpowiedzialna.
• Statusy: Nowe → W toku → (Czeka na klienta) → Zrobione. Przy zamknięciu wpisujesz, co zostało zrobione.
• Komentarze i historia zmian zapisują się przy zgłoszeniu.
• Załączniki: zrzut ekranu (Ctrl+V / ⌘V), PDF albo dowolny plik – przeciągnij na kartę „Załączniki” albo „Dodaj plik”.
• Zadania cykliczne: np. „co kwartał – przegląd abonamentu klienta X”.
• Zgłoszenia widać też na karcie klienta i sprawy. Widzą je wszyscy z modułem Doradztwo; usuwa tylko administrator.`;

const today = () => new Date().toISOString().slice(0, 10);
const addDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const dShort = iso => iso ? iso.slice(0, 10).split('-').reverse().join('.') : '';
const isLate = t => TK_OPEN.includes(t.status) && t.due_date && t.due_date < today();
const isSoon = t => TK_OPEN.includes(t.status) && t.due_date && t.due_date >= today() && t.due_date <= addDays(2);
const who = id => memberById(id)?.full_name || '—';
const teamOpts = () => state.members.filter(m => m.active && (m.modules || ['rozliczenia']).includes(cur.team));

export const statusTag = s => h('span', { class: 'tk-st ' + s }, TK_STATUS[s] || s);
const prioTag = p => p === 'normalny' ? null : h('span', { class: 'tk-pr ' + p }, TK_PRIO[p]);
export const dueTag = t => t.due_date ? h('span', { class: 'tk-due' + (isLate(t) ? ' late' : isSoon(t) ? ' soon' : '') },
  dShort(t.due_date) + (isLate(t) ? ' · po terminie' : t.due_date === today() && TK_OPEN.includes(t.status) ? ' · dziś' : '')) : h('span', { class: 'muted small' }, 'bez terminu');
const avatar = id => id ? h('span', { class: 'person', style: { padding: 0 }, 'data-tip': who(id) }, h('span', { class: 'av' }, ava(memberById(id) || { full_name: who(id) }))) : h('span', { class: 'person unassigned', style: { padding: 0 } }, h('span', { class: 'av' }, '?'));

// ---------- wspólne pola formularza ----------
function fieldsGrid(t, ctx, onChange = () => {}) {
  const clients = Array.isArray(ctx) ? ctx : ctx.clients;
  const matters = Array.isArray(ctx) ? [] : (ctx.matters || []);
  const CF = cur.clientField;
  const mk = (key, label, el, wide) => {
    el.value = t[key] ?? '';
    el.addEventListener(el.tagName === 'SELECT' || el.type === 'date' ? 'change' : 'input', () => { t[key] = el.value; onChange(key); });
    return h('label', { class: 'field' + (wide ? ' wide' : '') }, h('span', {}, label), el);
  };
  const sel = (opts) => h('select', { class: 'select' }, ...Object.entries(opts).map(([k, v]) => h('option', { value: k }, v)));
  const cl = h('select', { class: 'select' }, h('option', { value: '' }, '— bez klienta —'), ...clients.map(c => h('option', { value: c.id }, c.name)));
  const mt = cur.key === 'm2' ? h('select', { class: 'select' }, h('option', { value: '' }, '— bez sprawy —'), ...matters.map(m => h('option', { value: m.id }, `${m.number || ''} · ${m.title}`))) : null;
  if (mt) mt.addEventListener('change', () => { const m = matters.find(x => x.id === mt.value); if (m && !t[CF]) { t[CF] = m.client_id; cl.value = m.client_id; } });
  return h('div', { class: 'form-grid' },
    mk('title', 'Zgłoszenie (krótko, co trzeba zrobić)', h('input', { class: 'input', placeholder: 'np. Korekta VAT za wrzesień' }), true),
    mk('description', 'Opis – co zrobić, szczegóły', h('textarea', { class: 'input', rows: 4 }), true),
    mk(CF, 'Klient', cl),
    mt ? mk('m2_matter_id', 'Sprawa', mt) : null,
    mk('category', 'Kategoria', sel(cats())),
    mk('due_date', 'Termin realizacji', h('input', { class: 'input', type: 'date' })),
    mk('priority', 'Priorytet', sel(TK_PRIO)),
    mk('assignee_id', 'Odpowiedzialny', sel({ '': '— nieprzypisane —', ...Object.fromEntries(teamOpts().map(m => [m.id, m.full_name])) })),
    mk('source', 'Skąd zgłoszenie', sel(TK_SOURCE)));
}

const clientCache = new Map();
const loadClients = () => {
  const k = cur.clientTable, hit = clientCache.get(k);
  if (hit && Date.now() - hit.t < 120000) return Promise.resolve(hit.rows);
  return fetchAll(() => sb.from(k).select('id, name').order('name')).then(rows => { clientCache.set(k, { t: Date.now(), rows }); return rows; });
};
const loadCtx = async () => {
  const [clients, matters] = await Promise.all([loadClients(), cur.key === 'm2' ? fetchAll(() => sb.from('m2_matters').select('id, number, title, client_id').order('opened_at', { ascending: false })) : Promise.resolve([])]);
  return { clients, matters };
};
const clientOf = t => t[cur.clientField] || t.client_id || t.m2_client_id;

export async function newTicketDialog({ client = null, matter = null, module = 'rkdp', onSaved } = {}) {
  setMod(module);
  const ctx = await loadCtx();
  if (client && !ctx.clients.some(c => c.id === client.id)) ctx.clients.unshift(client);
  const CF = cur.clientField;
  const t = { title: '', description: '', [CF]: client?.id || matter?.client_id || '', m2_matter_id: matter?.id || '', category: client || matter ? 'klient' : 'inne', priority: 'normalny', due_date: addDays(7), assignee_id: state.me.id, source: '' };
  const pending = [];
  const att = pendingFilesBox(pending);
  const close = modal('Nowe zgłoszenie', h('div', {}, fieldsGrid(t, ctx), att), (close) => [
    h('button', { class: 'btn btn-ghost btn-sm', onclick: close }, 'Anuluj'),
    h('button', { class: 'btn btn-primary btn-sm', onclick: async () => {
      if (!t.title.trim()) return toast('Wpisz, czego dotyczy zgłoszenie', true);
      const row = { module: cur.key, title: t.title.trim(), description: t.description.trim() || null, [CF]: t[CF] || null, category: t.category, priority: t.priority,
        assignee_id: t.assignee_id || null, due_date: t.due_date || null, source: t.source || null, created_by: state.me.id };
      if (cur.key === 'm2') row.m2_matter_id = t.m2_matter_id || null;
      const { data, error } = await sb.from('rkdp_tickets').insert(row).select('*').single();
      if (error) return fail(error);
      if (pending.length) await uploadFiles(data.id, pending);
      close(); toast(`Dodano zgłoszenie #${data.no}`);
      if (onSaved) onSaved(data); else location.hash = `${BASE}/${data.id}`;
    } }, 'Dodaj zgłoszenie'),
  ], { wide: true });
  return close;
}

// ---------- lista ----------
// zadania cykliczne sprawdzamy najwyżej co 10 minut (nie przy każdym przełączeniu zakładki)
let lastGen = 0;
export const generateRecurring = () => {
  if (Date.now() - lastGen < 10 * 60000) return Promise.resolve(0);
  lastGen = Date.now();
  return sb.rpc('rkdp_generate_recurring').then(r => r.data || 0, () => 0);
};

export async function renderZgloszenia(main, id, params, module = 'rkdp') {
  setMod(module);
  if (id === 'cykliczne') return renderTemplates(main);
  if (id) return renderTicket(main, id);
  const loadT = () => fetchAll(() => sb.from('rkdp_tickets').select('*, rkdp_ticket_files(count)').eq('module', cur.key).order('created_at', { ascending: false }));
  // zgłoszenia cykliczne generują się równolegle z wczytywaniem listy; gdy coś powstało – lista wczytuje się ponownie
  let [created, tickets, clients] = await Promise.all([generateRecurring(), loadT(), loadClients()]);
  if (created) { toast(`Utworzono zgłoszenia cykliczne: ${created}`); tickets = await loadT(); }
  const cname = Object.fromEntries(clients.map(c => [c.id, c.name]));
  const fileCount = Object.fromEntries(tickets.map(t => [t.id, t.rkdp_ticket_files?.[0]?.count || 0]));
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
    return h('button', { class: 'card tile tk-tile tile-btn' + (dark && n ? ' dark alert' : '') + (filter === key ? ' on dark' : ''), type: 'button', 'aria-pressed': String(filter === key), onclick: () => { filter = key; history.replaceState(null, '', `${BASE}?f=${key}`); draw(); } },
      h('span', { class: 'num' }, String(n)), h('span', { class: 'lbl' }, F[key][0]));
  };
  const tiles = h('div', { class: 'tiles' });
  const search = h('input', { class: 'input grow', type: 'search', placeholder: 'Szukaj w tytule, opisie, kliencie, numerze…', oninput: e => { q = e.target.value.toLowerCase(); draw(); } });
  const personSel = h('select', { class: 'select', onchange: e => { person = e.target.value; draw(); } }, h('option', { value: '' }, 'Wszyscy odpowiedzialni'), h('option', { value: 'none' }, 'Nieprzypisane'), ...teamOpts().map(m => h('option', { value: m.id }, m.full_name)));
  const catSel = h('select', { class: 'select', onchange: e => { cat = e.target.value; draw(); } }, h('option', { value: '' }, 'Wszystkie kategorie'), ...Object.entries(cats()).map(([k, v]) => h('option', { value: k }, v)));
  const filterSel = h('select', { class: 'select', onchange: e => { filter = e.target.value; draw(); } }, ...Object.entries(F).map(([k, [l]]) => h('option', { value: k }, l)));
  const tbody = h('tbody');
  const counter = h('span', { class: 'small muted' });

  function draw() {
    tiles.replaceChildren(tile('otwarte'), tile('moje'), tile('po_terminie', true), tile('dzis'));
    filterSel.value = filter;
    const rows = tickets.filter(F[filter][1])
      .filter(t => !person || (person === 'none' ? !t.assignee_id : t.assignee_id === person))
      .filter(t => !cat || t.category === cat)
      .filter(t => !q || `#${t.no} ${t.title} ${t.description || ''} ${cname[clientOf(t)] || ''}`.toLowerCase().includes(q))
      .sort((a, b) => TK_OPEN.includes(a.status) && TK_OPEN.includes(b.status)
        ? ((a.due_date || '9999') < (b.due_date || '9999') ? -1 : (a.due_date || '9999') > (b.due_date || '9999') ? 1 : PRIO_ORDER[a.priority] - PRIO_ORDER[b.priority])
        : (b.updated_at || '').localeCompare(a.updated_at || ''));
    counter.textContent = `${rows.length} z ${tickets.length}`;
    tbody.replaceChildren(...(rows.length ? rows.map(t => h('tr', { class: 'click' + (isLate(t) ? ' tk-late-row' : ''), onclick: () => { location.hash = `${BASE}/${t.id}`; } },
      h('td', { class: 'small muted' }, `#${t.no}`),
      h('td', {}, h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } }, h('b', {}, t.title), prioTag(t.priority),
          fileCount[t.id] ? h('span', { class: 'tk-clip', 'data-tip': `Załączniki: ${fileCount[t.id]}` }, `📎 ${fileCount[t.id]}`) : null),
        h('div', { class: 'small muted' }, [cname[clientOf(t)], catLabel(t)].filter(Boolean).join(' · '))),
      h('td', {}, dueTag(t)),
      h('td', {}, avatar(t.assignee_id)),
      h('td', {}, statusTag(t.status))))
      : [h('tr', {}, h('td', { colspan: 5, class: 'empty' }, tickets.length ? 'Brak zgłoszeń dla tego filtra.' : 'Nie ma jeszcze zgłoszeń. Dodaj pierwsze przyciskiem „Nowe zgłoszenie”.'))]));
  }
  draw();

  main.replaceChildren(
    h('div', { class: 'page-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, cur.eyebrow),
        h('h1', { style: { marginTop: '6px', display: 'flex', alignItems: 'center' } }, cur.key === 'm2' ? 'Zgłoszenia' : 'Tabela zadań', infoTip(cur.key === 'm2' ? HELP_M2 : HELP, 'Zgłoszenia – instrukcja')),
        h('p', { class: 'sub' }, 'Sprawy do załatwienia: kto, co, do kiedy – z komentarzami i historią.')),
      h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
        h('a', { class: 'btn btn-outline', href: `${BASE}/cykliczne` }, '↻ Zadania cykliczne'),
        h('button', { class: 'btn btn-primary', onclick: () => newTicketDialog({ module: cur.key }).catch(e => fail(e)) }, icon('plus'), 'Nowe zgłoszenie'))),
    tiles,
    h('div', { class: 'toolbar' }, search, filterSel, personSel, catSel, counter),
    h('div', { class: 'list-wrap' }, h('table', { class: 'list' },
      h('thead', {}, h('tr', {}, ...['#', 'Zgłoszenie', 'Termin', 'Kto', 'Status'].map(x => h('th', {}, x)))), tbody)));
}

// ---------- szczegóły ----------
async function renderTicket(main, id) {
  const [{ data: t0, error }, { data: comments, error: e2 }, ctx] = await Promise.all([
    sb.from('rkdp_tickets').select('*').eq('id', id).single(),
    sb.from('rkdp_ticket_comments').select('*').eq('ticket_id', id).order('created_at'),
    loadCtx(),
  ]);
  if (error) throw error;
  if (e2) throw e2;
  let t = t0;
  if (t.module && t.module !== cur.key) setMod(t.module);
  const clients = ctx.clients, CF = cur.clientField;
  const draft = { ...t, description: t.description || '', [CF]: t[CF] || '', m2_matter_id: t.m2_matter_id || '', assignee_id: t.assignee_id || '', due_date: t.due_date || '', source: t.source || '' };
  let dirty = false;
  const saveInfo = h('span', { class: 'small muted' }, `Utworzono ${fmtDateTime(t.created_at)} · ${who(t.created_by)}`);
  const saveBtn = h('button', { class: 'btn btn-primary', disabled: true, onclick: () => save() }, 'Zapisz zmiany');
  const markDirty = () => { dirty = true; saveBtn.disabled = false; saveInfo.textContent = 'Niezapisane zmiany'; };

  async function save(extra = {}) {
    if (!draft.title.trim()) return toast('Tytuł nie może być pusty', true);
    const row = { title: draft.title.trim(), description: draft.description.trim() || null, [CF]: draft[CF] || null, category: draft.category, priority: draft.priority,
      due_date: draft.due_date || null, assignee_id: draft.assignee_id || null, source: draft.source || null, ...extra };
    if (cur.key === 'm2') row.m2_matter_id = draft.m2_matter_id || null;
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
    t.module !== 'm2' && t.client_id ? h('button', { class: 'btn btn-ghost btn-sm', onclick: () => import('../watek.js').then(m => m.openThread({ client: { id: t.client_id }, period: (t.period || t.created_at).slice(0, 7), focus: 't' + t.id })) }, 'Pokaż w rozmowie klienta') : null,
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
    h('span', { class: 'av' }, ava(memberById(c.author_id) || { full_name: who(c.author_id) })),
    h('div', { class: 'tk-c-body' },
      h('div', { class: 'small muted' }, h('b', { style: { color: 'var(--ink)' } }, who(c.author_id)), ' · ', fmtDateTime(c.created_at),
        c.kind === 'wykonanie' ? h('span', { class: 'tk-st zrobione', style: { marginLeft: '8px' } }, 'wykonanie') : null,
        c.kind === 'komentarz' && c.id && (c.author_id === state.me.id || isAdmin()) ? h('button', { class: 'tk-del', 'aria-label': 'Usuń komentarz', onclick: async () => {
          if (!confirm('Usunąć komentarz?')) return;
          const { error: er } = await sb.from('rkdp_ticket_comments').delete().eq('id', c.id);
          if (er) return fail(er); renderTicket(main, t.id);
        } }, 'usuń') : null),
      h('div', { class: c.kind === 'zmiana' || c.kind === 'utworzenie' ? 'small muted' : 'tk-text' }, c.body)))));

  const clientName = clients.find(c => c.id === t[CF])?.name;
  const matter = cur.key === 'm2' && t.m2_matter_id ? ctx.matters.find(m => m.id === t.m2_matter_id) : null;
  const filesCard = attachmentsCard(t);
  main.replaceChildren(
    h('a', { href: BASE, class: 'small', style: { fontWeight: 600, textDecoration: 'none' } }, cur.key === 'm2' ? '← Wszystkie zgłoszenia' : '← Rozmowy'),
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
          fieldsGrid(draft, ctx, markDirty),
          h('p', { class: 'small', style: { marginTop: '10px', display: 'flex', gap: '14px', flexWrap: 'wrap' } },
            t[CF] && hasModule(cur.team) ? h('a', { href: cur.clientHref(t[CF]) }, 'Karta klienta →') : null,
            matter ? h('a', { href: `#/doradztwo/sprawa/${matter.id}` }, `Sprawa ${matter.number || ''} →`) : null)),
        filesCard,
        h('div', { class: 'savebar' }, saveInfo, saveBtn)),
      h('div', {},
        h('section', { class: 'card section' }, h('div', { class: 'section-head' }, h('h2', {}, `Komentarze i historia (${(comments || []).length})`)),
          ta, h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0 14px' } }, h('span', { class: 'hint' }, 'Ctrl+Enter – wyślij'), sendBtn),
          timeline))));
  const beforeUnload = e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', beforeUnload);
  return () => { window.removeEventListener('beforeunload', beforeUnload); filesCard._cleanup?.(); };
}

// ---------- karta klienta: zgłoszenia klienta ----------
export function clientTicketsBox(client, { module = 'rkdp', matter = null } = {}) {
  const C = CFG[module];
  const box = h('section', { class: 'card section' });
  async function load() {
    let q = sb.from('rkdp_tickets').select('*').eq('module', module);
    q = matter ? q.eq('m2_matter_id', matter.id) : q.eq(C.clientField, client.id);
    const { data, error } = await q.order('created_at', { ascending: false }).limit(50);
    if (error) { box.replaceChildren(); return; }
    const open = (data || []).filter(t => TK_OPEN.includes(t.status)).sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'));
    const done = (data || []).filter(t => !TK_OPEN.includes(t.status)).slice(0, 5);
    const row = t => h('a', { class: 'tk-mini', href: `${C.base}/${t.id}` },
      h('div', {}, h('b', {}, t.title), h('div', { class: 'small muted' }, `#${t.no} · ${catLabel(t)}`)),
      h('div', { style: { textAlign: 'right' } }, statusTag(t.status), h('div', {}, TK_OPEN.includes(t.status) ? dueTag(t) : null)));
    box.replaceChildren(
      h('div', { class: 'section-head' }, h('h2', {}, `Zgłoszenia (${open.length} otwartych)`),
        h('button', { class: 'btn btn-outline btn-sm', onclick: () => newTicketDialog({ client, matter, module, onSaved: () => load() }).catch(e => fail(e)) }, icon('plus'), 'Nowe')),
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
  const CF = cur.clientField;
  const t = tpl ? { ...tpl, [CF]: tpl[CF] || '', assignee_id: tpl.assignee_id || '', description: tpl.description || '' }
    : { title: '', description: '', [CF]: '', category: 'dokumenty', priority: 'normalny', assignee_id: state.me.id, frequency: 'miesiac', due_day: 10, due_month: 1, lead_days: 7, active: true };
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
      sel(CF, { '': '— bez klienta —', ...Object.fromEntries(clients.map(c => [c.id, c.name])) }, 'Klient'),
      sel('assignee_id', { '': '— nieprzypisane —', ...Object.fromEntries(teamOpts().map(m => [m.id, m.full_name])) }, 'Odpowiedzialny'),
      sel('category', cats(), 'Kategoria'), sel('priority', TK_PRIO, 'Priorytet'),
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
      const row = { title: t.title.trim(), description: (t.description || '').trim() || null, [CF]: t[CF] || null, assignee_id: t.assignee_id || null,
        category: t.category, priority: t.priority, frequency: t.frequency, due_day: Number(t.due_day), due_month: Number(t.due_month) || 1,
        lead_days: Math.max(0, Math.min(60, Number(t.lead_days) || 0)), active: t.active !== false };
      const q = tpl ? sb.from('rkdp_ticket_templates').update({ ...row, next_due: null }).eq('id', tpl.id) : sb.from('rkdp_ticket_templates').insert({ ...row, module: cur.key, created_by: state.me.id });
      const { error } = await q;
      if (error) return fail(error);
      close(); toast('Zapisano'); await generateRecurring(); onSaved();
    } }, 'Zapisz'),
  ], { wide: true });
}

async function renderTemplates(main) {
  const [rows, clients] = await Promise.all([
    fetchAll(() => sb.from('rkdp_ticket_templates').select('*').eq('module', cur.key).order('next_due')),
    loadClients(),
  ]);
  const cname = Object.fromEntries(clients.map(c => [c.id, c.name]));
  const reload = () => renderTemplates(main);
  const canEdit = t => cur.key === 'm2' || t.created_by === state.me.id || ['admin', 'full'].includes(state.me.role);
  main.replaceChildren(
    h('a', { href: BASE, class: 'small', style: { fontWeight: 600, textDecoration: 'none' } }, cur.key === 'm2' ? '← Wszystkie zgłoszenia' : '← Rozmowy'),
    h('div', { class: 'page-head', style: { marginTop: '10px' } },
      h('div', {}, h('p', { class: 'eyebrow' }, cur.eyebrow),
        h('h1', { style: { marginTop: '6px', display: 'flex', alignItems: 'center' } }, 'Zadania cykliczne', infoTip(TPL_HELP, 'Zadania cykliczne – instrukcja')),
        h('p', { class: 'sub' }, 'Szablony, z których zgłoszenia tworzą się same – co tydzień, miesiąc, kwartał albo rok.')),
      h('button', { class: 'btn btn-primary', onclick: () => templateDialog(null, clients, reload) }, icon('plus'), 'Nowe zadanie cykliczne')),
    h('div', { class: 'list-wrap' }, h('table', { class: 'list' },
      h('thead', {}, h('tr', {}, ...['Zadanie', 'Kiedy', 'Następny termin', 'Kto', ''].map(x => h('th', {}, x)))),
      h('tbody', {}, ...(rows.length ? rows.map(t => h('tr', { class: 'click' + (t.active ? '' : ' tk-off'), onclick: () => canEdit(t) ? templateDialog(t, clients, reload) : toast('Ten szablon może zmienić autor albo osoba z pełnym dostępem', true) },
        h('td', {}, h('b', {}, t.title), h('div', { class: 'small muted' }, [cname[t[cur.clientField]], catLabel(t)].filter(Boolean).join(' · '))),
        h('td', { class: 'small' }, freqText(t), h('div', { class: 'muted' }, `zgłoszenie ${t.lead_days} dni wcześniej`)),
        h('td', {}, t.active ? (t.next_due ? dShort(t.next_due) : '—') : h('span', { class: 'tk-st anulowane' }, 'wstrzymane')),
        h('td', {}, avatar(t.assignee_id)),
        h('td', { class: 'small muted' }, t.last_created ? `ostatnio: ${dShort(t.last_created)}` : '')))
        : [h('tr', {}, h('td', { colspan: 5, class: 'empty' }, 'Brak zadań cyklicznych. Dodaj pierwsze – np. „co miesiąc do 10. – zebrać dokumenty od klienta X”.'))])))));
}

// ---------- załączniki (zrzuty ekranu, PDF, dowolne pliki) ----------
const BUCKET = 'zgloszenia';
const MAX_MB = 25;
const isImg = f => /^image\//.test(f.mime || f.type || '') || /\.(png|jpe?g|gif|webp|heic)$/i.test(f.name || '');
const isPdf = f => /pdf/.test(f.mime || f.type || '') || /\.pdf$/i.test(f.name || '');
export const fmtSize = n => n > 1048576 ? `${(n / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };
export const safeName = n => (n || 'plik').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').replace(/[^\w.\-]+/g, '_').slice(-80);
// wklejony obraz ze schowka ma nazwę „image.png” – nadaj czytelną
export const named = f => (/^image\.(png|jpe?g|gif|webp)$/i.test(f.name || '') || !f.name) && isImg(f)
  ? new File([f], `zrzut_ekranu_${stamp()}.${(f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, { type: f.type }) : f;

export async function countFiles(ids) {
  if (!ids.length) return {};
  const { data } = await sb.from('rkdp_ticket_files').select('ticket_id').in('ticket_id', ids.slice(0, 1000));
  const out = {}; (data || []).forEach(r => { out[r.ticket_id] = (out[r.ticket_id] || 0) + 1; });
  return out;
}

export async function uploadFiles(ticketId, files) {
  let ok = 0;
  for (const raw of files) {
    const f = named(raw);
    if (f.size > MAX_MB * 1048576) { toast(`„${f.name}” jest większy niż ${MAX_MB} MB`, true); continue; }
    const path = `${ticketId}/${crypto.randomUUID().slice(0, 8)}-${safeName(f.name)}`;
    const { error } = await sb.storage.from(BUCKET).upload(path, f, { contentType: f.type || 'application/octet-stream', upsert: false });
    if (error) { fail(error, `Nie udało się wysłać „${f.name}”`); continue; }
    const { error: e2 } = await sb.from('rkdp_ticket_files').insert({ ticket_id: ticketId, path, name: f.name, mime: f.type || null, size: f.size, uploaded_by: state.me.id });
    if (e2) { await sb.storage.from(BUCKET).remove([path]); fail(e2); continue; }
    ok++;
  }
  if (ok) toast(ok === 1 ? 'Dodano załącznik' : `Dodano załączniki: ${ok}`);
  return ok;
}

const blobCache = new Map();
async function fileUrl(path, bucket = BUCKET) {
  if (blobCache.has(path)) return blobCache.get(path);
  const { data, error } = await sb.storage.from(bucket).download(path);
  if (error) throw error;
  const url = URL.createObjectURL(data);
  blobCache.set(path, url);
  return url;
}
function saveAs(url, name) { const a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); }

async function openFile(f) {
  try {
    const url = await fileUrl(f.path, f.bucket);
    if (isImg(f)) {
      modal(f.name, h('div', { class: 'tk-lightbox' }, h('img', { src: url, alt: f.name })), close => [
        h('button', { class: 'btn btn-outline btn-sm', onclick: () => saveAs(url, f.name) }, icon('download'), 'Pobierz'),
        h('button', { class: 'btn btn-primary btn-sm', onclick: close }, 'Zamknij')], { wide: true });
    } else if (isPdf(f)) {
      const w = window.open(url, '_blank');
      if (!w) saveAs(url, f.name);
    } else saveAs(url, f.name);
  } catch (e) { fail(e, 'Nie udało się otworzyć pliku'); }
}

const fileIcon = f => isPdf(f) ? 'PDF' : /sheet|excel|\.xlsx?$|\.csv$/i.test(`${f.mime} ${f.name}`) ? 'XLS' : /word|\.docx?$/i.test(`${f.mime} ${f.name}`) ? 'DOC' : /zip|\.zip$/i.test(`${f.mime} ${f.name}`) ? 'ZIP' : (f.name.split('.').pop() || 'PLIK').slice(0, 4).toUpperCase();

export function fileTile(f, { onDelete } = {}) {
  const thumb = h('div', { class: 'tk-thumb' + (isImg(f) ? ' img' : '') }, isImg(f) ? '' : h('span', { class: 'tk-ext' }, fileIcon(f)));
  if (isImg(f)) fileUrl(f.path, f.bucket).then(u => { thumb.style.backgroundImage = `url("${u}")`; }).catch(() => { thumb.textContent = 'IMG'; });
  return h('div', { class: 'tk-file' },
    h('button', { type: 'button', class: 'tk-file-open', onclick: () => openFile(f), title: f.name }, thumb,
      h('span', { class: 'tk-file-name' }, f.name),
      h('span', { class: 'tk-file-meta' }, [f.size ? fmtSize(f.size) : '', who(f.uploaded_by), f.created_at ? new Date(f.created_at).toLocaleDateString('pl-PL') : ''].filter(Boolean).join(' · '))),
    onDelete ? h('button', { type: 'button', class: 'tk-file-del', 'aria-label': 'Usuń załącznik', onclick: onDelete }, '✕') : null);
}

export function dropZone(onFiles, hint) {
  const input = h('input', { type: 'file', multiple: true, hidden: true, onchange: () => { if (input.files.length) onFiles([...input.files]); input.value = ''; } });
  const zone = h('div', { class: 'tk-drop' },
    h('div', {}, h('b', {}, 'Przeciągnij pliki tutaj'), h('span', { class: 'muted' }, ` · ${hint}`)),
    h('button', { type: 'button', class: 'btn btn-outline btn-sm', onclick: () => input.click() }, icon('plus'), 'Dodaj plik'), input);
  ['dragenter', 'dragover'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.remove('over'); }));
  zone.addEventListener('drop', e => { const fs = [...(e.dataTransfer?.files || [])]; if (fs.length) onFiles(fs); });
  return zone;
}
export const pastedFiles = e => [...(e.clipboardData?.items || [])].filter(i => i.kind === 'file').map(i => i.getAsFile()).filter(Boolean);

// pliki dodawane w oknie „Nowe zgłoszenie” – wysyłane po zapisaniu zgłoszenia
function pendingFilesBox(pending) {
  const list = h('div', { class: 'tk-files' });
  const draw = () => list.replaceChildren(...pending.map((f, i) => h('div', { class: 'tk-file' },
    h('div', { class: 'tk-file-open' }, h('div', { class: 'tk-thumb' + (isImg(f) ? ' img' : '') }, isImg(f) ? '' : h('span', { class: 'tk-ext' }, fileIcon({ name: f.name, mime: f.type }))),
      h('span', { class: 'tk-file-name' }, f.name), h('span', { class: 'tk-file-meta' }, fmtSize(f.size))),
    h('button', { type: 'button', class: 'tk-file-del', onclick: () => { pending.splice(i, 1); draw(); } }, '✕'))));
  const add = fs => { fs.map(named).forEach(f => pending.push(f)); draw(); list.querySelectorAll('.tk-thumb.img').forEach((t, i) => { const f = pending.filter(isImg)[i]; if (f) t.style.backgroundImage = `url("${URL.createObjectURL(f)}")`; }); };
  const box = h('div', { class: 'tk-att-new' }, h('p', { class: 'field-label' }, 'Załączniki (opcjonalnie)'), dropZone(add, 'zrzut ekranu wklej Ctrl+V / ⌘V'), list);
  box.addEventListener('paste', e => { const fs = pastedFiles(e); if (fs.length) { e.preventDefault(); add(fs); } });
  // wklejanie, gdy kursor jest w dowolnym polu okna
  setTimeout(() => box.closest('.modal')?.addEventListener('paste', e => { if (e.target.closest('.tk-att-new')) return; const fs = pastedFiles(e); if (fs.length) { e.preventDefault(); add(fs); } }), 0);
  return box;
}

// karta „Załączniki” na stronie zgłoszenia
function attachmentsCard(t) {
  const list = h('div', { class: 'tk-files' });
  const count = h('span', { class: 'small muted' });
  const card = h('section', { class: 'card section' },
    h('div', { class: 'section-head' }, h('h2', {}, 'Załączniki'), count),
    dropZone(fs => add(fs), 'albo wklej zrzut ekranu Ctrl+V / ⌘V'), list);
  async function load() {
    const { data, error } = await sb.from('rkdp_ticket_files').select('*').eq('ticket_id', t.id).order('created_at');
    if (error) { list.replaceChildren(h('p', { class: 'hint' }, 'Załączniki niedostępne: ' + error.message)); return; }
    count.textContent = data.length ? `${data.length}` : '';
    list.replaceChildren(...(data.length ? data.map(f => fileTile(f, { onDelete: (f.uploaded_by === state.me.id || isAdmin()) ? async () => {
      if (!confirm(`Usunąć załącznik „${f.name}”? Trafi do kosza – administrator może go przywrócić przez 30 dni.`)) return;
      const { error: e1 } = await sb.from('rkdp_ticket_files').delete().eq('id', f.id);
      if (e1) return fail(e1);
      load();
    } : null })) : [h('p', { class: 'hint' }, 'Brak załączników.')]));
  }
  async function add(fs) {
    card.classList.add('busy');
    await uploadFiles(t.id, fs);
    card.classList.remove('busy');
    load();
  }
  const onPaste = e => {
    if (document.querySelector('.modal-back')) return;
    const fs = pastedFiles(e);
    if (fs.length) { e.preventDefault(); add(fs); }
  };
  document.addEventListener('paste', onPaste);
  card._cleanup = () => document.removeEventListener('paste', onPaste);
  load();
  return card;
}
