// Rozmowy – jedno miejsce na uwagi, pytania i zadania o klientach (zastępuje zakładkę „Zgłoszenia” w RKDP).
// Lista klientów z ostatnią aktywnością, nieprzeczytanymi, otwartymi zadaniami i pytaniami; filtry zadań.
// Kliknięcie zawsze otwiera rozmowę klienta (szuflada z prawej). Zadania bez klienta (wewnętrzne) – osobna sekcja.
import { h, icon, toast, fail, periodLabel, defaultPeriod, initials, infoTip, modal, ava } from '../ui.js';
import { sb, state, memberById } from '../store.js';
import { fetchAll } from './rozliczenia.js';
import { TK_STATUS, TK_OPEN, newTicketDialog, generateRecurring } from './zgloszenia.js';
import { openThread } from '../watek.js';

const HELP = `Rozmowy to jedno miejsce na wszystko, co dotyczy klienta:
• uwagi, pytania i zadania (dawne zgłoszenia), odpowiedzi, załączniki, wysłane e-maile i zmiany kratek,
• kliknij klienta – otworzy się jego rozmowa; zadanie tworzysz w rozmowie przełącznikiem „Zadanie” (osoba, termin, priorytet),
• rozmowa z klientem jest jedna – bez podziału na miesiące; to, co załatwione, odznaczasz „✓ Zrobione” / „✓ Wyjaśnione”,
• podświetleni na górze są klienci z wpisami, których jeszcze nie przeczytałeś(-aś) – każdy ma własne „przeczytane”,
• zadania bez klienta (wewnętrzne) są w osobnej sekcji na dole.`;
const ago = t => { const m = Math.round((Date.now() - new Date(t)) / 60000);
  if (m < 1) return 'teraz'; if (m < 60) return `${m} min temu`; const hh = Math.round(m / 60); if (hh < 24) return `${hh} godz. temu`;
  const d = Math.round(hh / 24); return d === 1 ? 'wczoraj' : d < 7 ? `${d} dni temu` : new Date(t).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' }); };
const who = id => id ? (memberById(id)?.short_name || 'ktoś') : 'autor nieznany';
const today = () => new Date().toLocaleDateString('sv-SE');

export async function renderRozmowy(main, params) {
  const me = state.me.id;
  let filter = params?.get('f') || 'aktywnosc', q = '', mine = params?.get('moi') === '1';
  const since = new Date(Date.now() - 90 * 86400000).toISOString();
  const list = h('div', { class: 'rz-list' }, h('div', { class: 'spinner' }, 'Wczytywanie…'));
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Szukaj klienta…' });
  search.addEventListener('input', () => { q = search.value.trim().toLowerCase(); draw(); });
  let showDone = false;
  const mineCb = h('input', { type: 'checkbox', checked: mine });
  mineCb.addEventListener('change', () => { mine = mineCb.checked; draw(); });
  let D = null;

  main.replaceChildren(
    h('div', { class: 'page-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, 'RKDP'),
        h('h1', { style: { marginTop: '6px', display: 'flex', alignItems: 'center' } }, 'Rozmowy', infoTip(HELP, 'Rozmowy – jak to działa')),
        h('p', { class: 'sub' }, 'Uwagi, pytania i zadania o klientach – w jednym miejscu.')),
      h('div', { class: 'row-btns' },
        h('a', { class: 'btn btn-ghost btn-sm', href: '#/zgloszenia/cykliczne' }, 'Zadania cykliczne'),
        h('button', { class: 'btn btn-primary btn-sm', onclick: () => newTask() }, icon('plus'), 'Nowe zadanie'))),
    h('div', { class: 'rz-bar' }, search, h('label', { class: 'check' }, mineCb, 'Tylko moi klienci (księgowa / kadry) i moje zadania')),
    list);

  let recurringDone = false;
  async function load() {
    if (!recurringDone) { recurringDone = true; const n = await generateRecurring().catch(() => 0); if (n) toast(`Utworzono zadania cykliczne: ${n}`); }
    const soft = p => p.then(r => r.data || [], () => []);
    const [clients, cm, openQ, tickets, unread] = await Promise.all([
      fetchAll(() => sb.from('clients').select('id,name,accountant_id,hr_id,status').order('name')),
      soft(sb.from('period_comments').select('client_id,period,author,body,kind,created_at,imported').is('deleted_at', null).gte('created_at', since).order('created_at', { ascending: false }).limit(3000)),
      soft(sb.from('period_comments').select('id,client_id,period,kind').is('resolved_at', null).is('deleted_at', null).is('parent_id', null).limit(3000)),
      fetchAll(() => sb.from('rkdp_tickets').select('id,no,title,client_id,status,due_date,assignee_id,created_by,period,priority,created_at,updated_at').eq('module', 'rkdp').order('created_at', { ascending: false })),
      sb.rpc('unread_threads').then(r => r.data || [], () => []),
    ]);
    const tc = await soft(sb.from('rkdp_ticket_comments').select('ticket_id,author_id,body,kind,created_at').neq('kind', 'zmiana').gte('created_at', since).order('created_at', { ascending: false }).limit(3000));
    const tById = new Map(tickets.map(t => [t.id, t]));
    const byC = new Map();
    const get = id => { if (!byC.has(id)) byC.set(id, { last: null, openT: [], lateT: 0, waitT: 0, q: 0, u: 0 }); return byC.get(id); };
    const bump = (cid, ev) => { const x = get(cid); if (!x.last || ev.at > x.last.at) x.last = ev; };
    cm.forEach(c => bump(c.client_id, { at: c.created_at, who: c.author, imp: c.imported, txt: c.body, per: c.period.slice(0, 7), kind: c.kind }));
    tickets.forEach(t => {
      if (!t.client_id) return;
      bump(t.client_id, { at: t.created_at, who: t.created_by, txt: `Zadanie #${t.no}: ${t.title}`, per: (t.period || t.created_at).slice(0, 7), kind: 'zadanie' });
      if (TK_OPEN.includes(t.status)) { const x = get(t.client_id); x.openT.push(t); if (t.due_date && t.due_date < today()) x.lateT++; if (t.status === 'czeka') x.waitT++; }
    });
    tc.forEach(c => { const t = tById.get(c.ticket_id); if (t?.client_id) bump(t.client_id, { at: c.created_at, who: c.author_id, txt: `#${t.no}: ${c.body}`, per: (t.period || t.created_at).slice(0, 7), kind: 'odp' }); });
    openQ.forEach(x => { if (x.kind === 'pytanie') get(x.client_id).q++; else get(x.client_id).u++; });
    D = { clients, byC, tickets, unread: new Map(unread.map(u => [u.client_id, u])) };
    draw();
  }

  const isMine = c => c.accountant_id === me || c.hr_id === me;
  function draw() {
    if (!D) return;
    const { clients, byC, tickets, unread } = D;
    const myT = tickets.filter(t => TK_OPEN.includes(t.status) && t.assignee_id === me);
    const openT = tickets.filter(t => TK_OPEN.includes(t.status) && (!mine || t.assignee_id === me || t.created_by === me || isMine(clients.find(c => c.id === t.client_id) || {})));
    const cMatch = c => !q || c.name.toLowerCase().includes(q);
    // widoki zadań
    if (['moje', 'po_terminie', 'czeka', 'otwarte', 'nieprzypisane', 'zrobione'].includes(filter)) {
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const src = filter === 'moje' ? myT : filter === 'otwarte' ? openT : filter === 'nieprzypisane' ? tickets.filter(t => TK_OPEN.includes(t.status) && !t.assignee_id)
        : filter === 'zrobione' ? tickets.filter(t => t.status === 'zrobione' && (t.updated_at || t.created_at) >= weekAgo)
        : openT.filter(t => filter === 'czeka' ? t.status === 'czeka' : t.due_date && t.due_date < today());
      const extra = { moje: 'Moje zadania', po_terminie: 'Zadania po terminie', czeka: 'Czeka na klienta', otwarte: 'Wszystkie otwarte zadania', nieprzypisane: 'Zadania bez osoby odpowiedzialnej', zrobione: 'Zadania zamknięte w ostatnich 7 dniach' }[filter];
      const rows = src.filter(t => !q || (clients.find(c => c.id === t.client_id)?.name || '').toLowerCase().includes(q) || t.title.toLowerCase().includes(q))
        .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'));
      list.replaceChildren(...[extra ? h('div', { class: 'rz-view' }, h('b', {}, extra), h('button', { type: 'button', class: 'chat-a', onclick: () => { filter = 'aktywnosc'; history.replaceState(null, '', '#/rozmowy'); draw(); } }, '× pokaż rozmowy')) : null,
        ...(rows.length ? rows.map(t => taskRow(t, clients.find(c => c.id === t.client_id))) : [h('p', { class: 'hint rz-empty' }, 'Brak zadań w tym widoku. 👍')])].filter(Boolean));
      return;
    }
    let rows = clients.filter(c => byC.has(c.id) || unread.has(c.id)).map(c => ({ c, x: byC.get(c.id) || { last: null, openT: [], lateT: 0, waitT: 0, q: 0, u: 0 }, u: unread.get(c.id) }));
    // na liście zostają tylko klienci z czymś do zrobienia (otwarta uwaga, pytanie, zadanie) albo z nieprzeczytanymi wpisami
    const pending = r => r.u || r.x.q || r.x.u || r.x.openT.length;
    const doneCount = rows.filter(r => !pending(r)).length;
    if (!showDone) rows = rows.filter(pending);
    if (filter === 'nieprzeczytane') rows = rows.filter(r => r.u);
    else if (filter === 'pytania') rows = rows.filter(r => r.x.q);
    if (mine && filter !== 'nieprzeczytane') rows = rows.filter(r => isMine(r.c) || r.x.openT.some(t => t.assignee_id === me || t.created_by === me));
    rows = rows.filter(r => cMatch(r.c)).sort((a, b) => (b.u ? 1 : 0) - (a.u ? 1 : 0) || (b.x.last?.at || '').localeCompare(a.x.last?.at || ''));
    const internal = tickets.filter(t => !t.client_id && TK_OPEN.includes(t.status) && (!mine || t.assignee_id === me || t.created_by === me));
    list.replaceChildren(...[
      ...(rows.length ? rows.slice(0, 200).map(clientRow) : [h('p', { class: 'hint rz-empty' }, q ? 'Brak klientów pasujących do wyszukiwania.' : filter === 'nieprzeczytane' ? 'Wszystko przeczytane. 👍' : 'Wszystko załatwione – nie ma otwartych uwag, pytań ani zadań. 👍')]),
      doneCount ? h('button', { type: 'button', class: 'chat-a rz-donebtn', onclick: () => { showDone = !showDone; draw(); } }, showDone ? 'Ukryj załatwione' : `Pokaż załatwione (${doneCount})`) : null,
      internal.length && filter === 'aktywnosc' ? h('div', { class: 'rz-internal' }, h('h2', {}, `Zadania wewnętrzne – bez klienta (${internal.length})`), ...internal.map(t => taskRow(t, null))) : null].filter(Boolean));
  }

  function clientRow({ c, x, u }) {
    const l = x.last;
    return h('button', { type: 'button', class: 'rz-row' + (u ? ' unread' : ''), onclick: () => openThread({ client: c, period: u ? String(u.period).slice(0, 7) : l?.per || defaultPeriod(), onChange: load, onClose: load }) },
      h('span', { class: 'av rz-av' }, initials(c.name)),
      h('span', { class: 'rz-main' },
        h('span', { class: 'rz-top' }, h('b', { class: 'rz-name' }, c.name), l ? h('span', { class: 'small muted' }, ago(l.at)) : null),
        l ? h('span', { class: 'rz-last' }, h('b', {}, (l.who ? who(l.who) : l.imp ? 'z arkusza Excel' : 'autor nieznany') + ': '), l.txt.length > 140 ? l.txt.slice(0, 139) + '…' : l.txt, h('span', { class: 'muted' }, ` · ${periodLabel(l.per).toLowerCase()}`)) : h('span', { class: 'rz-last muted' }, 'Brak wpisów'),
        h('span', { class: 'rz-badges' },
          u ? h('span', { class: 'rz-b new' }, `${u.n} nowe${u.mentioned ? ' · @Ty' : ''}`) : null,
          x.openT.length ? h('span', { class: 'rz-b' }, `${x.openT.length} ${x.openT.length === 1 ? 'zadanie' : x.openT.length < 5 ? 'zadania' : 'zadań'}`) : null,
          x.lateT ? h('span', { class: 'rz-b late' }, `${x.lateT} po terminie`) : null,
          x.waitT ? h('span', { class: 'rz-b' }, `czeka na klienta: ${x.waitT}`) : null,
          x.q ? h('span', { class: 'rz-b q' }, `${x.q} ${x.q === 1 ? 'pytanie' : 'pytania'}`) : null,
          x.u ? h('span', { class: 'rz-b' }, `${x.u} ${x.u === 1 ? 'uwaga' : x.u < 5 ? 'uwagi' : 'uwag'} do zrobienia`) : null,
          !x.q && !x.u && !x.openT.length && !u ? h('span', { class: 'rz-b ok' }, '✓ wszystko załatwione') : null)));
  }
  function taskRow(t, c) {
    const late = t.due_date && t.due_date < today();
    return h('button', { type: 'button', class: 'rz-row rz-task', onclick: () => c ? openThread({ client: c, period: (t.period || t.created_at).slice(0, 7), focus: 't' + t.id, onChange: load, onClose: load }) : (location.hash = `#/zgloszenia/${t.id}`) },
      h('span', { class: 'av rz-av' }, t.assignee_id ? ava(memberById(t.assignee_id) || { full_name: '?' }) : '?'),
      h('span', { class: 'rz-main' },
        h('span', { class: 'rz-top' }, h('b', { class: 'rz-name' }, t.title), h('span', { class: 'tk-st ' + t.status }, TK_STATUS[t.status])),
        h('span', { class: 'rz-last' }, `#${t.no} · ${c ? c.name : 'wewnętrzne'} · ${t.assignee_id ? who(t.assignee_id) : 'nieprzypisane'}`,
          t.due_date ? h('span', { class: late ? 'wt-late' : 'muted' }, ` · termin ${t.due_date.split('-').reverse().join('.')}`) : null)));
  }
  // nowe zadanie: wybór klienta → rozmowa z przełącznikiem „Zadanie”; bez klienta – formularz zadania wewnętrznego
  function newTask() {
    const inp = h('input', { class: 'input', type: 'search', placeholder: 'Wpisz nazwę klienta…', autofocus: true });
    const res = h('div', { class: 'rz-pick' });
    const drawRes = () => { const s = inp.value.trim().toLowerCase(); res.replaceChildren(...(D?.clients || []).filter(c => !s || c.name.toLowerCase().includes(s)).slice(0, 12)
      .map(c => h('button', { type: 'button', class: 'opt', onclick: () => { close(); openThread({ client: c, onChange: load }).then(() => document.querySelector('.wt .chat-kind[data-k="zadanie"]')?.click()); } }, c.name))); };
    inp.addEventListener('input', drawRes);
    const close = modal('Nowe zadanie – dla którego klienta?', h('div', {}, inp, res), c2 => [
      h('button', { class: 'btn btn-ghost', onclick: () => { c2(); newTicketDialog({ module: 'rkdp', onSaved: load }).catch(e => fail(e)); } }, 'Zadanie wewnętrzne (bez klienta)'),
      h('button', { class: 'btn btn-outline', onclick: c2 }, 'Anuluj')]);
    drawRes(); setTimeout(() => inp.focus(), 50);
  }

  await load();
}
