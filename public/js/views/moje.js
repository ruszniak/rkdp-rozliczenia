// „Moje sprawy” – jedno miejsce na wszystko, co czeka na mnie: zadania w zespole, zadania przy klientach,
// pytania w rozmowach moich klientów i terminy (sprawy M2 TAX, pełnomocnictwa). Pracownik nie musi wiedzieć, skąd zadanie przyszło.
import { h, fail, infoTip, icon, ava } from '../ui.js';
import { sb, state, hasModule, memberById } from '../store.js';
import { TK_OPEN } from './zgloszenia.js';
import { pushNudge } from '../pushnudge.js';
// bez „null” w treści: puste elementy (null/false) są pomijane
const put = (el, ...k) => el.replaceChildren(...k.flat().filter(x => x != null && x !== false));

const today = () => new Date().toLocaleDateString('sv-SE');
const plus = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
const fmtD = d => d ? d.slice(0, 10).split('-').reverse().join('.') : '';
const KINDS = { zamkniete: ['Zakończone', 'mj-done'], zlecenie: ['Zadanie', 'mj-zl'], zadanie: ['Przy kliencie', 'mj-tk'], pytanie: ['Pytanie', 'mj-q'], termin: ['Termin', 'mj-dl'] };
const HELP = `Wszystko, co czeka na Ciebie, w jednym miejscu:
• Zadania – dodatkowe zadania w zespole; każdy może dodać zadanie dla siebie lub innej osoby, także dla Michała (po wykonaniu kliknij „Zrobione – zgłaszam”); zlecający widzi tu wszystkie swoje aktywne zadania i ich etap,
• Przy kliencie – zadania przy klientach z rozmów,
• Pytania – nierozwiązane pytania w rozmowach Twoich klientów albo takie, w których Cię oznaczono,
• Terminy – terminy spraw M2 TAX i wygasające pełnomocnictwa (14 dni).
Kliknij pozycję, aby ją otworzyć. Najpierw rzeczy po terminie i na dziś.`;

async function collect() {
  const me = state.me.id, admin = state.me.role === 'admin', out = [];
  const soft = async q => { const { data, error } = await q; return error ? [] : (data || []); };
  const [zl, tk, cs] = await Promise.all([
    soft(sb.from('zlecenia').select('id,no,title,status,due_date,priority,assignee_id,created_by,created_at,helpers').in('status', ['nowe', 'w_toku', 'pytanie', 'zgloszone'])),
    soft(sb.from('rkdp_tickets').select('id,no,title,status,due_date,priority,client_id,m2_client_id,module,created_at').eq('assignee_id', me).in('status', TK_OPEN)),
    soft(sb.from('clients').select('id,name,accountant_id,hr_id').eq('status', 'aktywny')),
  ]);
  const cname = new Map(cs.map(c => [c.id, c.name]));
  const myClients = new Set(cs.filter(c => c.accountant_id === me || c.hr_id === me).map(c => c.id));
  // zlecenia: pracownik – swoje do zrobienia; zlecający (administrator) – wszystkie aktywne, które zlecił (u kogo i na jakim etapie)
  const ZS = { nowe: 'nowe – jeszcze nie rozpoczęte', w_toku: 'w trakcie', pytanie: 'pytanie od pracownika – odpowiedz', zgloszone: 'zgłoszone – do sprawdzenia' };
  const helps = z => Array.isArray(z.helpers) && z.helpers.includes(me);
  zl.filter(z => (z.assignee_id === me && z.created_by !== me) || (helps(z) && z.created_by !== me) ? ['nowe', 'w_toku', 'pytanie'].includes(z.status) : (z.created_by === me || admin)).forEach(z => out.push({
    kind: 'zlecenie', id: z.id, title: z.title, due: z.due_date, hot: z.priority === 'pilne' || (z.assignee_id !== me && ['zgloszone', 'pytanie'].includes(z.status)), created: z.created_at,
    sub: z.assignee_id !== me && helps(z) ? `razem z: ${(memberById(z.assignee_id)?.full_name || '').split(' ')[0]} · ${ZS[z.status] || z.status}` : z.assignee_id === me ? (z.status === 'pytanie' ? 'czeka na odpowiedź' : z.status === 'zgloszone' ? 'zgłoszone – czeka na akceptację' : z.status === 'nowe' ? (z.created_by && z.created_by !== me ? `nowe – od ${(memberById(z.created_by)?.full_name || '').split(' ')[0]}` : 'nowe – jeszcze nie rozpoczęte') : 'w trakcie') : (ZS[z.status] || z.status),
    person: z.assignee_id === me ? memberById(z.created_by) : memberById(z.assignee_id), personRole: z.assignee_id === me ? 'zleca' : 'wykonuje',
    open: () => import('./zlecenia.js').then(m => m.openZlecenie(z.id, reload)) }));
  tk.forEach(t => out.push({ kind: 'zadanie', id: t.id, title: t.title, due: t.due_date, hot: ['pilny', 'wysoki'].includes(t.priority), created: t.created_at,
    sub: [t.client_id ? cname.get(t.client_id) : t.module === 'm2' ? 'M2 TAX' : '', t.status === 'czeka' ? 'czeka' : ''].filter(Boolean).join(' · '),
    href: t.module === 'm2' ? `#/doradztwo/zgloszenia/${t.id}` : `#/zgloszenia/${t.id}` }));
  // pytania: nierozwiązane, w ostatnich 90 dniach – u moich klientów albo z oznaczeniem mnie
  const qs = await soft(sb.from('period_comments').select('id,client_id,period,body,author,mentions,created_at').eq('kind', 'pytanie').is('resolved_at', null).is('deleted_at', null).is('parent_id', null).gte('created_at', new Date(Date.now() - 90 * 86400000).toISOString()).limit(500));
  qs.filter(q => q.author !== me && ((q.mentions || []).includes(me) || myClients.has(q.client_id))).forEach(q => out.push({
    kind: 'pytanie', id: q.id, title: q.body.length > 120 ? q.body.slice(0, 119) + '…' : q.body, created: q.created_at, sub: `${cname.get(q.client_id) || 'klient'} · ${fmtD(q.created_at)}`,
    href: `#/watek/${q.client_id}?okres=${String(q.period).slice(0, 7)}` }));
  // terminy: sprawy M2 TAX (moje) i pełnomocnictwa moich klientów (administrator – wszystkie) w ciągu 14 dni
  if (hasModule('doradztwo')) {
    const dl = await soft(sb.from('m2_deadlines').select('id,matter_id,title,due_date,assignee_id,done').eq('done', false).lte('due_date', plus(14)).eq('assignee_id', me));
    dl.forEach(d => out.push({ kind: 'termin', id: d.id, title: d.title || 'Termin w sprawie', due: d.due_date, sub: 'M2 TAX – sprawa', href: `#/doradztwo/sprawa/${d.matter_id}` }));
  }
  const poa = await soft(sb.from('client_poa').select('id,client_id,kind,valid_to,revoked_at').is('revoked_at', null).not('valid_to', 'is', null).gte('valid_to', plus(-30)).lte('valid_to', plus(14)));
  poa.filter(p => admin || myClients.has(p.client_id)).forEach(p => out.push({ kind: 'termin', id: p.id, title: `${p.kind} – ${p.valid_to < today() ? 'wygasło' : 'wygasa'}`, due: p.valid_to, sub: cname.get(p.client_id) || '', href: `#/klient/${p.client_id}` }));
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
export async function renderMoje(main, params) {
  let filter = params?.get('f') || 'all', items = [], closed = null;
  const chips = h('div', { class: 'zl-chips' }), list = h('div', { class: 'mj-list' }, h('div', { class: 'spinner' }, 'Wczytywanie…'));
  const order = it => { const d = it.due; return d && d < today() ? 0 : d === today() ? 1 : it.hot ? 2 : d && d <= plus(3) ? 3 : 4; };
  function draw() {
    const F = [['all', 'Wszystko'], ['zlecenie', 'Zadania'], ['zadanie', 'Zadania przy klientach'], ['pytanie', 'Pytania'], ['termin', 'Terminy']];
    const go = k => { filter = k; history.replaceState(null, '', '#/moje' + (k === 'all' ? '' : '?f=' + k)); draw(); };
    put(chips, ...F.map(([k, l]) => { const n = k === 'all' ? items.length : items.filter(i => i.kind === k).length; if (k !== 'all' && k !== filter && !n) return null;
      return h('button', { type: 'button', class: 'zl-chip' + (filter === k ? ' on' : ''), onclick: () => go(k) }, l, h('span', {}, String(n))); }).filter(Boolean),
      h('button', { type: 'button', class: 'zl-chip zl-chip-done' + (filter === 'zamkniete' ? ' on' : ''), onclick: () => go('zamkniete') }, 'Zakończone', closed ? h('span', {}, String(closed.length)) : null));
    if (filter === 'zamkniete') {
      if (!closed) { put(list, h('div', { class: 'spinner' }, 'Wczytywanie…')); collectClosed().then(c => { closed = c; draw(); }, e => { fail(e); closed = []; draw(); }); return; }
      if (!closed.length) { put(list, h('p', { class: 'hint', style: { padding: '18px 0' } }, 'Brak zakończonych zadań i zgłoszeń z ostatnich 90 dni.')); return; }
      put(list, ...closed.map(it => {
        const inner = [h('span', { class: 'mj-kind ' + KINDS.zamkniete[1] }, KINDS.zamkniete[0]),
          h('span', { class: 'mj-main' }, h('b', {}, it.title), h('span', { class: 'small muted' }, it.sub)),
          h('span', { class: 'zl-due' }, fmtD(it.closed)),
          it.person ? h('span', { class: 'mj-who', title: `${it.personRole}: ${it.person.full_name}` }, h('span', { class: 'avatar mj-av' }, ava(it.person)), h('span', { class: 'mj-who-n' }, (it.person.full_name || '').split(' ')[0])) : h('span')];
        return it.href ? h('a', { class: 'mj-row mj-closed', href: it.href }, ...inner) : h('button', { type: 'button', class: 'mj-row mj-closed', onclick: it.open }, ...inner);
      }));
      return;
    }
    const rows = items.filter(i => filter === 'all' || i.kind === filter).sort((a, b) => order(a) - order(b) || (a.due || '9999').localeCompare(b.due || '9999') || (b.created || '').localeCompare(a.created || ''));
    if (!rows.length) { put(list, h('p', { class: 'hint', style: { padding: '18px 0' } }, 'Nic na Ciebie nie czeka. 👍')); return; }
    put(list, ...rows.map(it => {
      const late = it.due && it.due < today(), td = it.due === today();
      const inner = [h('span', { class: 'mj-kind ' + KINDS[it.kind][1] }, KINDS[it.kind][0]),
        h('span', { class: 'mj-main' }, h('b', {}, it.title, it.hot ? h('span', { class: 'zl-hot' }, 'pilne') : null), it.sub ? h('span', { class: 'small muted' }, it.sub) : null),
        it.due ? h('span', { class: 'zl-due' + (late ? ' late' : td ? ' today' : '') }, late ? `po terminie · ${fmtD(it.due)}` : td ? 'dziś' : fmtD(it.due)) : h('span'),
        it.person ? h('span', { class: 'mj-who', title: `${it.personRole}: ${it.person.full_name}` }, h('span', { class: 'avatar mj-av' }, ava(it.person)), h('span', { class: 'mj-who-n' }, (it.person.full_name || '').split(' ')[0])) : h('span')];
      return it.href ? h('a', { class: 'mj-row', href: it.href }, ...inner) : h('button', { type: 'button', class: 'mj-row', onclick: it.open }, ...inner);
    }));
  }
  reload = async () => { closed = null; try { items = await collect(); } catch (e) { fail(e); items = []; } draw(); };
  put(main, 
    h('div', { class: 'page-head' }, h('div', {}, h('p', { class: 'eyebrow' }, 'RKDP'),
      h('h1', { style: { marginTop: '6px', display: 'flex', alignItems: 'center' } }, 'Moje sprawy', infoTip(HELP, 'Moje sprawy')),
      h('p', { class: 'sub' }, 'Zadania, pytania i terminy – wszystko, co czeka na Ciebie.')),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => import('./zlecenia.js').then(m => m.newZlecenie(reload)) }, icon('plus'), 'Zadanie')),
    pushNudge(),
    h('section', { class: 'card section' }, chips, list));
  await reload();
}

// licznik do zakładki „Moje sprawy” (po terminie + na dziś + nowe zlecenia)
export async function mineCount() {
  try { const it = await collect(); return it.length; } catch { return 0; }
}
