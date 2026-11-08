// „Moje sprawy” – jedno miejsce na wszystko, co czeka na mnie: zadania w zespole, zadania przy klientach,
// pytania w rozmowach moich klientów i terminy (sprawy M2 TAX, pełnomocnictwa). Pracownik nie musi wiedzieć, skąd zadanie przyszło.
import { h, fail, infoTip, icon, ava, toast } from '../ui.js';
import { sb, state, hasModule, memberById } from '../store.js';
import { TK_OPEN } from './zgloszenia.js';
import { pushNudge } from '../pushnudge.js';
// bez „null” w treści: puste elementy (null/false) są pomijane
const put = (el, ...k) => el.replaceChildren(...k.flat().filter(x => x != null && x !== false));

const today = () => new Date().toLocaleDateString('sv-SE');
const plus = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
const fmtD = d => d ? d.slice(0, 10).split('-').reverse().join('.') : '';
const HELP = `Wszystko, co czeka na Ciebie, w jednym miejscu:
• Zadania – dodatkowe zadania w zespole (administrator: etykieta „Zespół” – wszystkie zadania zespołu według osób); każdy może dodać zadanie dla siebie lub innej osoby, także dla Michała (po wykonaniu kliknij „Zrobione – zgłaszam”); zlecający widzi tu wszystkie swoje aktywne zadania i ich etap,
• Przy kliencie – zadania przy klientach z rozmów,
• Pytania – nierozwiązane pytania w rozmowach Twoich klientów albo takie, w których Cię oznaczono,
• Terminy – terminy spraw M2 TAX i wygasające pełnomocnictwa (14 dni).
Sprawy są pogrupowane według tego, co trzeba zrobić: do sprawdzenia, pytania, w toku, nowe, czeka na kogoś, terminy. Kliknij kartę, aby ją otworzyć; na telefonie przesuń kartę w lewo, aby zgłosić wykonanie.`;

async function collect() {
  const me = state.me.id, admin = state.me.role === 'admin', out = [];
  const soft = async q => { const { data, error } = await q; return error ? [] : (data || []); };
  const [zl, tk, cs] = await Promise.all([
    soft(sb.from('zlecenia').select('id,no,title,status,due_date,priority,assignee_id,created_by,created_at,helpers,steps').in('status', ['nowe', 'w_toku', 'pytanie', 'zgloszone'])),
    soft(sb.from('rkdp_tickets').select('id,no,title,status,due_date,priority,client_id,m2_client_id,module,created_at').eq('assignee_id', me).in('status', TK_OPEN)),
    soft(sb.from('clients').select('id,name,accountant_id,hr_id').eq('status', 'aktywny')),
  ]);
  const cname = new Map(cs.map(c => [c.id, c.name]));
  const myClients = new Set(cs.filter(c => c.accountant_id === me || c.hr_id === me).map(c => c.id));
  // zlecenia: pracownik – swoje do zrobienia; zlecający (administrator) – wszystkie aktywne, które zlecił (u kogo i na jakim etapie)
  const ZS = { nowe: 'nowe – jeszcze nie rozpoczęte', w_toku: 'w trakcie', pytanie: 'pytanie od pracownika – odpowiedz', zgloszone: 'zgłoszone – do sprawdzenia' };
  const helps = z => Array.isArray(z.helpers) && z.helpers.includes(me);
  const fn = id => (memberById(id)?.full_name || '').split(' ')[0];
  const zact = (z, akcja, msg) => async () => { const { error } = await sb.rpc('zlecenie_akcja', { p_id: z.id, p_akcja: akcja, p_tekst: null }); if (error) return fail(error); toast(msg); reload(); };
  const openZ = z => () => import('./zlecenia.js').then(m => m.openZlecenie(z.id, reload));
  zl.filter(z => (z.assignee_id === me && z.created_by !== me) || (helps(z) && z.created_by !== me) ? ['nowe', 'w_toku', 'pytanie'].includes(z.status) : (z.created_by === me || admin)).forEach(z => {
    const mine = z.assignee_id === me, boss = !mine && !helps(z);
    // grupa wg tego, co trzeba zrobić: do sprawdzenia / pytanie do mnie / w toku / nowe / czeka na kogoś
    const group = z.status === 'zgloszone' ? (boss ? 'check' : 'wait') : z.status === 'pytanie' ? (boss ? 'ask' : 'wait') : z.status === 'w_toku' ? (mine || helps(z) ? 'prog' : 'wait') : (mine || helps(z) ? 'new' : 'wait');
    const st = Array.isArray(z.steps) ? z.steps : [];
    const actions = [];
    if (boss && z.status === 'zgloszone') actions.push({ label: '✓ Akceptuj', cls: 'ok', fn: zact(z, 'akceptuj', 'Zaakceptowano') }, { label: 'Do poprawy', fn: openZ(z) });
    if (boss && z.status === 'pytanie') actions.push({ label: 'Odpowiedz', cls: 'pri', fn: openZ(z) });
    if (mine && z.status === 'nowe') actions.push({ label: '▶ Zaczynam', cls: 'pri', fn: zact(z, 'start', 'Powodzenia!') });
    out.push({
      kind: 'zlecenie', group, id: z.id, no: z.no, title: z.title, due: z.due_date, hot: z.priority === 'pilne', created: z.created_at, byMe: z.created_by === me && !mine,
      label: 'Zadanie' + ({ nowe: ' · nowe', w_toku: '', pytanie: ' · pytanie', zgloszone: ' · zgłoszone' }[z.status] || ''),
      sub: mine ? (z.status === 'pytanie' ? 'czekasz na odpowiedź' : z.status === 'zgloszone' ? 'zgłoszone – czeka na akceptację' : z.created_by && z.created_by !== me ? `od ${fn(z.created_by)}` : '')
        : helps(z) ? `razem z: ${fn(z.assignee_id)}` : z.status === 'zgloszone' ? `${fn(z.assignee_id)} zgłasza wykonanie – sprawdź` : z.status === 'pytanie' ? `${fn(z.assignee_id)} ma pytanie` : `wykonuje: ${fn(z.assignee_id)}`,
      people: [mine ? memberById(z.created_by) : memberById(z.assignee_id), ...(Array.isArray(z.helpers) ? z.helpers.filter(x => x !== me).map(memberById) : [])].filter(Boolean),
      steps: st.length ? [st.filter(x => x.done).length, st.length] : null,
      actions,
      swipe: mine && ['nowe', 'w_toku'].includes(z.status) ? { label: '✓ Zrobione', fn: zact(z, 'zglos', `Zgłoszono wykonanie – ${fn(z.created_by)} dostanie powiadomienie`) } : null,
      open: openZ(z) });
  });
  tk.forEach(t => out.push({ kind: 'zadanie', group: t.status === 'w_toku' ? 'prog' : t.status === 'czeka' ? 'wait' : 'new', id: t.id, no: t.no, title: t.title, due: t.due_date, hot: ['pilny', 'wysoki'].includes(t.priority), created: t.created_at,
    label: 'Przy kliencie', sub: [t.client_id ? cname.get(t.client_id) : t.module === 'm2' ? 'M2 TAX' : '', t.status === 'czeka' ? 'czeka' : ''].filter(Boolean).join(' · '),
    href: t.module === 'm2' ? `#/doradztwo/zgloszenia/${t.id}` : `#/zgloszenia/${t.id}` }));
  // pytania: nierozwiązane, w ostatnich 90 dniach – u moich klientów albo z oznaczeniem mnie
  const qs = await soft(sb.from('period_comments').select('id,client_id,period,body,author,mentions,created_at').eq('kind', 'pytanie').is('resolved_at', null).is('deleted_at', null).is('parent_id', null).gte('created_at', new Date(Date.now() - 90 * 86400000).toISOString()).limit(500));
  qs.filter(q => q.author !== me && ((q.mentions || []).includes(me) || myClients.has(q.client_id))).forEach(q => out.push({
    kind: 'pytanie', group: 'ask', label: 'Pytanie w rozmowie', id: q.id, title: q.body.length > 120 ? q.body.slice(0, 119) + '…' : q.body, created: q.created_at, sub: `${cname.get(q.client_id) || 'klient'} · ${fmtD(q.created_at)}`,
    href: `#/watek/${q.client_id}?okres=${String(q.period).slice(0, 7)}` }));
  // terminy: sprawy M2 TAX (moje) i pełnomocnictwa moich klientów (administrator – wszystkie) w ciągu 14 dni
  if (hasModule('doradztwo')) {
    const dl = await soft(sb.from('m2_deadlines').select('id,matter_id,title,due_date,assignee_id,done').eq('done', false).lte('due_date', plus(14)).eq('assignee_id', me));
    dl.forEach(d => out.push({ kind: 'termin', group: 'dl', label: 'Termin · M2 TAX', id: d.id, title: d.title || 'Termin w sprawie', due: d.due_date, sub: 'sprawa M2 TAX', href: `#/doradztwo/sprawa/${d.matter_id}`,
      actions: [{ label: '✓ Zrealizowano', cls: 'ok', fn: async () => { const { error } = await sb.from('m2_deadlines').update({ done: true, done_at: new Date().toISOString() }).eq('id', d.id); if (error) return fail(error); toast('Oznaczono jako zrealizowane'); reload(); } }] }));
  }
  const poa = await soft(sb.from('client_poa').select('id,client_id,kind,valid_to,revoked_at').is('revoked_at', null).not('valid_to', 'is', null).gte('valid_to', plus(-30)).lte('valid_to', plus(14)));
  poa.filter(p => admin || myClients.has(p.client_id)).forEach(p => out.push({ kind: 'termin', group: 'dl', label: 'Termin · pełnomocnictwo', id: p.id, title: `${p.kind} – ${p.valid_to < today() ? 'wygasło' : 'wygasa'}`, due: p.valid_to, sub: cname.get(p.client_id) || '', href: `#/klient/${p.client_id}` }));
  return out;
}

// zakończone w ostatnich 90 dniach: zadania (zaakceptowane / anulowane), które wykonywałem albo zlecałem, i moje zgłoszenia przy klientach
async function collectClosed() {
  const me = state.me.id, since = new Date(Date.now() - 90 * 86400000).toISOString();
  const soft = async q => { const { data, error } = await q; return error ? [] : (data || []); };
  const [zl, tk] = await Promise.all([
    soft(sb.from('zlecenia').select('id,no,title,status,assignee_id,created_by,accepted_at,updated_at,helpers').in('status', ['zaakceptowane', 'anulowane']).or(`assignee_id.eq.${me},created_by.eq.${me},helpers.cs.{${me}}`).gte('updated_at', since).order('updated_at', { ascending: false }).limit(200)),
    soft(sb.from('rkdp_tickets').select('id,no,title,status,module,updated_at,done_at').eq('assignee_id', me).in('status', ['zrobione', 'anulowane']).gte('updated_at', since).order('updated_at', { ascending: false }).limit(200)),
  ]);
  return [
    ...zl.map(z => ({ kind: 'zamkniete', id: z.id, title: z.title, closed: z.accepted_at || z.updated_at,
      sub: `${z.status === 'anulowane' ? 'anulowane' : 'wykonane'} · zadanie #${z.no}${z.assignee_id !== me ? ' · wykonywał(a): ' + ((memberById(z.assignee_id)?.full_name || '').split(' ')[0]) : ''}`,
      person: memberById(z.assignee_id === me ? z.created_by : z.assignee_id), personRole: z.assignee_id === me ? 'zlecił(a)' : 'wykonywał(a)',
      open: () => import('./zlecenia.js').then(m => m.openZlecenie(z.id, reload)) })),
    ...tk.map(t => ({ kind: 'zamkniete', id: t.id, title: t.title, closed: t.done_at || t.updated_at, sub: `${t.status === 'anulowane' ? 'anulowane' : 'zrobione'} · zgłoszenie #${t.no}`,
      href: t.module === 'm2' ? `#/doradztwo/zgloszenia/${t.id}` : `#/zgloszenia/${t.id}` })),
  ].sort((a, b) => String(b.closed).localeCompare(String(a.closed)));
}

let reload = () => {};
const GROUPS = [
  ['check', 'Do sprawdzenia', '#D08A00', '<circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 1a6 6 0 0 1 0 12z" fill="currentColor"/>'],
  ['ask', 'Pytania do Ciebie', '#6B4FC4', '<circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" stroke-width="2"/><text x="7" y="10.4" text-anchor="middle" font-size="9" font-weight="800" fill="currentColor" font-family="Inter,sans-serif">?</text>'],
  ['prog', 'W toku', '#007A8C', '<circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 1a6 6 0 0 1 6 6H7z" fill="currentColor"/>'],
  ['new', 'Nowe', '#8AA0A5', '<circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 2"/>'],
  ['wait', 'Czeka na kogoś', '#6A8086', '<circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 4v3.2l2 1.3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'],
  ['dl', 'Terminy', '#C77800', '<rect x="1.5" y="2.5" width="11" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M1.5 6h11" stroke="currentColor" stroke-width="1.6"/>'],
];
const gIcon = g => h('span', { class: 'mj-gi', style: { color: g[2] }, html: `<svg width="15" height="15" viewBox="0 0 14 14" aria-hidden="true">${g[3]}</svg>` });
const short = d => { if (!d) return ''; const t = today(); if (d === t) return 'dziś'; if (d === plus(1)) return 'jutro'; const [y, m, dd] = d.slice(0, 10).split('-'); return `${+dd}.${m}${y !== t.slice(0, 4) ? '.' + y : ''}`; };

// przesunięcie karty w lewo (telefon) odsłania przycisk „Zrobione”
function swipeable(card, sw) {
  const wrap = h('div', { class: 'mj-sw' }, h('button', { type: 'button', class: 'mj-sw-act', onclick: e => { e.stopPropagation(); e.currentTarget.disabled = true; sw.fn(); } }, sw.label), card);
  let x0 = null, y0 = 0, dx = 0, open = false, horiz = null;
  card.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; horiz = null; card.style.transition = 'none'; }, { passive: true });
  card.addEventListener('touchmove', e => {
    if (x0 == null) return;
    const mx = e.touches[0].clientX - x0, my = e.touches[0].clientY - y0;
    if (horiz == null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) horiz = Math.abs(mx) > Math.abs(my);
    if (!horiz) return;
    dx = Math.max(-120, Math.min(0, mx + (open ? -104 : 0)));
    card.style.transform = `translateX(${dx}px)`;
  }, { passive: true });
  card.addEventListener('touchend', () => {
    if (x0 == null) return; x0 = null; card.style.transition = '';
    if (!horiz) return;
    open = dx < -52; card.style.transform = open ? 'translateX(-104px)' : '';
    card.dataset.swiped = '1'; setTimeout(() => { delete card.dataset.swiped; }, 50);
  });
  return wrap;
}

function card(it, color) {
  const late = it.due && it.due < today();
  const go = () => { if (it.href) location.hash = it.href; else it.open?.(); };
  const el = h('div', { class: 'mj-card', role: 'button', tabindex: '0',
    onclick: e => { if (e.currentTarget.dataset.swiped) return; go(); }, onkeydown: e => { if (e.key === 'Enter') go(); } },
    h('div', { class: 'mj-top' }, h('span', { class: 'mj-k' }, it.label || ''),
      h('span', { class: 'mj-r' }, it.no ? h('span', { class: 'mj-no' }, '#' + it.no) : null,
        it.due ? h('span', { class: 'mj-date' + (late ? ' late' : it.due === today() ? ' today' : '') }, late ? `po terminie · ${short(it.due)}` : short(it.due)) : null,
        it.closed ? h('span', { class: 'mj-date' }, fmtD(it.closed)) : null)),
    h('div', { class: 'mj-title' }, it.hot ? h('span', { class: 'mj-hot', title: 'pilne' }, '!') : null, h('span', {}, it.title)),
    it.sub ? h('div', { class: 'mj-sub' }, it.sub) : null,
    (it.steps || it.actions?.length || it.people?.length) ? h('div', { class: 'mj-foot' },
      ...(it.actions || []).map(a => h('button', { type: 'button', class: 'mj-btn' + (a.cls ? ' ' + a.cls : ''), onclick: e => { e.stopPropagation(); e.currentTarget.disabled = true; a.fn(); } }, a.label)),
      it.steps ? h('span', { class: 'mj-steps' }, h('span', { class: 'mj-bar' }, h('i', { style: { width: Math.round(it.steps[0] / it.steps[1] * 100) + '%' } })), `${it.steps[0]}/${it.steps[1]} kroki`) : null,
      it.people?.length ? h('span', { class: 'mj-avs' }, ...it.people.slice(0, 4).map(p => h('span', { class: 'avatar mj-av', title: p.full_name }, ava(p)))) : null) : null);
  el.style.setProperty('--k', color);
  return it.swipe ? swipeable(el, it.swipe) : el;
}

export async function renderMoje(main, params, { embed = false } = {}) {
  let filter = params?.get('f') || 'all', items = [], closed = null;
  const admin = state.me.role === 'admin';
  if (!['all', 'pilne', 'zlecilem', 'zamkniete', ...(admin ? ['zespol'] : [])].includes(filter)) filter = 'all';
  const openId = params?.get('zl');
  const chips = h('div', { class: 'zl-chips mj-chips' }), list = h('div', { class: 'mj-groups' }, h('div', { class: 'spinner' }, 'Wczytywanie…'));
  const order = it => { const d = it.due; return d && d < today() ? 0 : d === today() ? 1 : it.hot ? 2 : d && d <= plus(3) ? 3 : 4; };
  function draw() {
    const go = k => { filter = k; history.replaceState(null, '', (embed ? '#/pulpit?widok=sprawy' + (k === 'all' ? '' : '&f=' + k) : '#/moje' + (k === 'all' ? '' : '?f=' + k))); draw(); };
    const urgent = items.filter(i => i.hot || (i.due && i.due < today())).length, mineOut = items.filter(i => i.byMe).length;
    const chip = (k, l, n, pre) => h('button', { type: 'button', class: 'zl-chip' + (filter === k ? ' on' : ''), onclick: () => go(k) }, pre || null, l, n != null ? h('span', {}, String(n)) : null);
    list.classList.toggle('mj-team', filter === 'zespol');
    put(chips, chip('all', 'Wszystko', items.length), urgent || filter === 'pilne' ? chip('pilne', 'Pilne', urgent, h('b', { class: 'mj-hot' }, '!')) : null,
      mineOut || filter === 'zlecilem' ? chip('zlecilem', 'Zleciłem', mineOut) : null, admin ? chip('zespol', 'Zespół', null) : null, chip('zamkniete', 'Zakończone', closed ? closed.length : null));
    if (filter === 'zespol') { put(list, h('div', { class: 'spinner' }, 'Wczytywanie…')); import('./zlecenia.js').then(m => m.renderZlecenia(list, null, { embed: true })); return; }
    if (filter === 'zamkniete') {
      if (!closed) { put(list, h('div', { class: 'spinner' }, 'Wczytywanie…')); collectClosed().then(c => { closed = c; draw(); }, e => { fail(e); closed = []; draw(); }); return; }
      if (!closed.length) { put(list, h('p', { class: 'hint', style: { padding: '18px 0' } }, 'Brak zakończonych zadań i zgłoszeń z ostatnich 90 dni.')); return; }
      put(list, h('section', { class: 'mj-group' }, h('h3', { class: 'mj-gh' }, gIcon(['', '', '#1E7A44', '<circle cx="7" cy="7" r="6" fill="currentColor"/><path d="m4.2 7.2 2 2 3.8-4" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>']), 'Zakończone – ostatnie 90 dni', h('span', { class: 'n' }, String(closed.length))),
        ...closed.map(it => card({ ...it, label: it.sub.split(' · ')[0], sub: it.sub.split(' · ').slice(1).join(' · '), people: it.person ? [it.person] : [] }, '#1E7A44'))));
      return;
    }
    const rows = items.filter(i => filter === 'all' || (filter === 'pilne' ? i.hot || (i.due && i.due < today()) : i.byMe))
      .sort((a, b) => order(a) - order(b) || (a.due || '9999').localeCompare(b.due || '9999') || (b.created || '').localeCompare(a.created || ''));
    if (!rows.length) { put(list, h('p', { class: 'hint', style: { padding: '18px 0' } }, 'Nic na Ciebie nie czeka. 👍')); return; }
    put(list, ...GROUPS.map(g => {
      const gr = rows.filter(r => (r.group || 'new') === g[0]);
      if (!gr.length) return null;
      const late = gr.filter(r => r.due && r.due < today()).length;
      return h('section', { class: 'mj-group' }, h('h3', { class: 'mj-gh' }, gIcon(g), g[1], h('span', { class: 'n' }, String(gr.length)), late ? h('span', { class: 'mj-gl' }, `${late} po terminie`) : null),
        ...gr.map(it => card(it, g[0] === 'new' && it.kind !== 'zlecenie' ? '#8AA0A5' : g[2])));
    }));
  }
  reload = async () => { closed = null; try { items = await collect(); } catch (e) { fail(e); items = []; } draw(); };
  if (embed) {
    put(main, h('div', { class: 'mj-topbar' }, chips,
      h('button', { class: 'btn btn-primary mj-add', type: 'button', 'aria-label': 'Nowe zadanie', onclick: () => import('./zlecenia.js').then(m => m.newZlecenie(reload)) }, icon('plus'), h('span', { class: 'mj-add-t' }, 'Zadanie'))),
      pushNudge(), list);
    await reload();
    if (openId) import('./zlecenia.js').then(m => m.openZlecenie(openId, reload));
    return;
  }
  put(main,
    h('div', { class: 'mj-head' },
      h('h1', {}, 'Moje sprawy', infoTip(HELP, 'Moje sprawy')),
      h('button', { class: 'btn btn-primary mj-add', type: 'button', 'aria-label': 'Nowe zadanie', onclick: () => import('./zlecenia.js').then(m => m.newZlecenie(reload)) }, icon('plus'), h('span', { class: 'mj-add-t' }, 'Zadanie'))),
    pushNudge(),
    chips, list);
  await reload();
  if (openId) import('./zlecenia.js').then(m => m.openZlecenie(openId, reload));
}

// licznik do zakładki „Moje sprawy” (po terminie + na dziś + nowe zlecenia)
export async function mineCount() {
  try { const it = await collect(); return it.length; } catch { return 0; }
}
