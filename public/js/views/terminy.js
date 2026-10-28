// Kalendarz obowiązków klientów RKDP: mapa miesiąca, lista terminów z klientami i statusem kratek, widok roku.
import { h, icon } from '../ui.js';
import { sb, state, memberById } from '../store.js';
import { fetchAll, fetchSoft, loadClients, todayIso, fmtShort, weekday } from '../data.js';
import { obligationsInMonth, obligationStatus, KINDS, MONTHS_NOM, fmtDue } from '../obowiazki.js';
import { STATUS } from '../dict.js';
import { emptyState } from '../puste.js';

const pad = n => String(n).padStart(2, '0');
const DONE = s => s === 'done' || s === 'na';

export async function renderTerminy(main, params) {
  const now = todayIso();
  let y = +(params.get('rok') || now.slice(0, 4)), m = +(params.get('m') || now.slice(5, 7));
  if (!(y > 2000 && m >= 1 && m <= 12)) { y = +now.slice(0, 4); m = +now.slice(5, 7); }
  const mode = params.get('widok') === 'rok' ? 'rok' : 'miesiac';
  const limited = state.me.role === 'limited';
  let scope = params.get('kto') || (limited ? 'moi' : 'wszyscy');
  let dayFilter = params.get('dzien') || '';

  main.replaceChildren(h('div', { class: 'spinner' }, 'Wczytywanie terminów…'));
  // kratki z rozliczeń: dla miesiąca – okres poprzedni; dla roku – cały rok wstecz
  const fromP = mode === 'rok' ? `${y - 1}-12-01` : `${m === 1 ? y - 1 : y}-${pad(m === 1 ? 12 : m - 1)}-01`;
  const toP = mode === 'rok' ? `${y}-11-01` : fromP;
  const [clients, entries, yEntries] = await Promise.all([
    loadClients(),
    fetchAll(() => sb.from('checklist_entries').select('client_id,period,task_code,status').gte('period', fromP).lte('period', toP)),
    fetchSoft(() => sb.from('year_close_entries').select('client_id,year,task_code,status').gte('year', y - 1).lte('year', y)),
  ]);
  const eMap = new Map(), yMap = new Map();
  for (const e of entries) { if (!eMap.has(e.client_id)) eMap.set(e.client_id, new Map()); eMap.get(e.client_id).set(`${e.period.slice(0, 7)}|${e.task_code}`, e.status); }
  for (const e of yEntries) { if (!yMap.has(e.client_id)) yMap.set(e.client_id, new Map()); yMap.get(e.client_id).set(`${e.year}|${e.task_code}`, e.status); }

  const mine = c => [c.accountant_id, c.hr_id].includes(state.me.id);
  const visibleClients = () => clients.filter(c => c.status === 'aktywny' && (scope !== 'moi' || mine(c)));
  const monthObl = (yy, mm) => visibleClients().flatMap(c => obligationsInMonth(c, yy, mm)).map(o => ({ ...o, status: obligationStatus(o, eMap, yMap) }));

  const href = (p) => {
    const q = new URLSearchParams({ rok: p.rok ?? y, m: p.m ?? m, ...(p.widok ?? mode) === 'rok' ? { widok: 'rok' } : {}, ...(p.kto ?? scope) !== (limited ? 'moi' : 'wszyscy') ? { kto: p.kto ?? scope } : {}, ...(p.dzien ? { dzien: p.dzien } : {}) });
    return '#/terminy?' + q.toString();
  };
  const prev = mode === 'rok' ? { rok: y - 1 } : { rok: m === 1 ? y - 1 : y, m: m === 1 ? 12 : m - 1 };
  const next = mode === 'rok' ? { rok: y + 1 } : { rok: m === 12 ? y + 1 : y, m: m === 12 ? 1 : m + 1 };

  const head = h('div', { class: 'page-head' },
    h('div', {}, h('p', { class: 'eyebrow' }, 'Rozliczenia · obowiązki klientów'),
      h('h1', { style: { marginTop: '6px' } }, 'Kalendarz obowiązków'),
      h('p', { class: 'sub' }, 'Terminy wyliczone z profilu klienta: VAT, PIT/CIT, ZUS, PIT-4 oraz obowiązki roczne. Status bierze się z kratek w rozliczeniach i w zamknięciu roku.')),
    h('div', { class: 'tabs', role: 'tablist' },
      h('a', { class: 'tab-a' + (mode === 'miesiac' ? ' on' : ''), href: href({ widok: 'miesiac' }) }, 'Miesiąc'),
      h('a', { class: 'tab-a' + (mode === 'rok' ? ' on' : ''), href: href({ widok: 'rok' }) }, 'Rok')));

  const nav = h('div', { class: 'top-bar' },
    h('div', { class: 'tabs', role: 'tablist' },
      h('a', { class: 'tab-a' + (scope === 'moi' ? ' on' : ''), href: href({ kto: 'moi' }) }, 'Moi klienci'),
      limited ? null : h('a', { class: 'tab-a' + (scope === 'wszyscy' ? ' on' : ''), href: href({ kto: 'wszyscy' }) }, 'Wszyscy')),
    h('div'),
    h('div', { class: 'month' },
      h('a', { class: 'icon-btn', href: href(prev), 'aria-label': 'Wcześniej' }, icon('left')),
      h('span', { class: 'label' }, mode === 'rok' ? String(y) : `${MONTHS_NOM[m - 1][0].toUpperCase() + MONTHS_NOM[m - 1].slice(1)} ${y}`),
      h('a', { class: 'icon-btn', href: href(next), 'aria-label': 'Później' }, icon('right'))));

  if (mode === 'rok') {
    const months = Array.from({ length: 12 }, (_, i) => ({ m: i + 1, list: monthObl(y, i + 1) }));
    const yearly = months.flatMap(x => x.list.filter(o => o.kind === 'roczne'));
    const byCode = new Map();
    yearly.forEach(o => { const k = o.label + '|' + o.date; if (!byCode.has(k)) byCode.set(k, []); byCode.get(k).push(o); });
    main.replaceChildren(head, nav,
      h('div', { class: 'yr-grid' }, months.map(({ m: mm, list }) => {
        const done = list.filter(o => DONE(o.status)).length;
        const late = list.filter(o => o.status && !DONE(o.status) && o.date < now && !o.opt).length;
        const kinds = Object.keys(KINDS).map(k => [k, list.filter(o => o.kind === k).length]).filter(x => x[1]);
        return h('a', { class: 'card yr-m' + (late ? ' late' : '') + (`${y}-${pad(mm)}` === now.slice(0, 7) ? ' now' : ''), href: href({ widok: 'miesiac', m: mm }) },
          h('div', { class: 'yr-h' }, h('b', {}, MONTHS_NOM[mm - 1]), h('span', { class: 'ring', style: `--p:${list.length ? Math.round(done * 100 / list.length) : 0}` })),
          h('div', { class: 'yr-n' }, String(list.length), h('span', {}, ' terminów')),
          h('div', { class: 'yr-k' }, kinds.map(([k, n]) => h('span', { class: 'kchip', style: `--k:${KINDS[k].color}` }, `${KINDS[k].short} ${n}`))),
          late ? h('div', { class: 'yr-late' }, `${late} po terminie`) : null);
      })),
      h('div', { class: 'table-title' }, h('h2', {}, `Obowiązki roczne w ${y}`), h('span', { class: 'muted small' }, 'status z zakładki „Zamknięcie roku”')),
      byCode.size ? h('div', { class: 'card', style: { padding: '6px 0' } }, [...byCode.entries()].sort((a, b) => a[1][0].date.localeCompare(b[1][0].date)).map(([, list]) => {
        const o = list[0], done = list.filter(x => DONE(x.status)).length;
        return h('a', { class: 'ob-row' + (o.date < now && list.some(x => x.status && !DONE(x.status)) && !o.opt ? ' late' : ''), href: `#/zamkniecie-roku?rok=${o.year}`, 'data-tip': o.tip || null },
          h('span', { class: 'ob-date' }, fmtShort(o.date), h('small', {}, weekday(o.date))),
          h('span', { class: 'ob-lbl' }, h('b', {}, o.label), o.opt ? h('span', { class: 'muted small' }, ' · jeśli dotyczy') : null),
          h('span', { class: 'frac' + (done === list.length ? ' full' : '') }, h('span', { class: 'ring', style: `--p:${Math.round(done * 100 / list.length)}` }), `${done}/${list.length}`));
      })) : emptyState('Brak obowiązków rocznych', 'Uzupełnij profil klientów (forma, VAT, PIT/CIT), aby kalendarz wyliczył terminy.'));
    return;
  }

  // ---------- miesiąc ----------
  const list = monthObl(y, m);
  const byDay = new Map();
  list.forEach(o => { if (!byDay.has(o.date)) byDay.set(o.date, []); byDay.get(o.date).push(o); });
  const maxN = Math.max(1, ...[...byDay.values()].map(v => v.length));

  // mapa miesiąca
  const first = new Date(y, m - 1, 1), days = new Date(y, m, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(h('div', { class: 'mm-c pad' }));
  for (let d = 1; d <= days; d++) {
    const iso = `${y}-${pad(m)}-${pad(d)}`, ds = byDay.get(iso) || [];
    const done = ds.filter(o => DONE(o.status)).length;
    const late = iso < now && ds.some(o => o.status && !DONE(o.status) && !o.opt);
    const wd = new Date(y, m - 1, d).getDay();
    cells.push(h(ds.length ? 'button' : 'div', {
      class: 'mm-c' + (iso === now ? ' today' : '') + (wd === 0 || wd === 6 ? ' we' : '') + (ds.length ? ' has' : '') + (late ? ' late' : '') + (dayFilter === iso ? ' sel' : '') + (ds.length && done === ds.length ? ' ok' : ''),
      'data-day': iso, style: ds.length ? `--i:${(0.18 + 0.82 * ds.length / maxN).toFixed(2)}` : null, type: ds.length ? 'button' : null,
      'data-tip': ds.length ? `${fmtDue(iso)}\n${ds.length} terminów · zrobione ${done}` : null,
      onclick: ds.length ? () => { dayFilter = dayFilter === iso ? '' : iso; history.replaceState(null, '', href({ dzien: dayFilter })); drawList(); markSel(); } : null },
    h('span', { class: 'mm-d' }, d),
    ds.length ? h('span', { class: 'mm-n' }, ds.length) : null,
    ds.length ? h('span', { class: 'mm-dots' }, [...new Set(ds.map(o => o.kind))].map(k => h('i', { style: `background:${KINDS[k].color}` }))) : null));
  }
  const map = h('div', { class: 'card mm' },
    h('div', { class: 'mm-head' }, h('h2', {}, 'Mapa miesiąca'), h('span', { class: 'muted small' }, 'im ciemniejszy dzień, tym więcej terminów · kliknij dzień, aby zawęzić listę')),
    h('div', { class: 'mm-w' }, ['pn', 'wt', 'śr', 'cz', 'pt', 'sb', 'nd'].map(x => h('span', {}, x))),
    h('div', { class: 'mm-g' }, cells),
    h('div', { class: 'mm-leg' }, Object.entries(KINDS).filter(([k]) => list.some(o => o.kind === k)).map(([, k]) => h('span', {}, h('i', { style: `background:${k.color}` }), k.label))));
  const markSel = () => map.querySelectorAll('.mm-c.has').forEach(b => b.classList.toggle('sel', b.dataset.day === dayFilter));

  // kafelki
  const doneAll = list.filter(o => DONE(o.status)).length;
  const lateAll = list.filter(o => o.status && !DONE(o.status) && o.date < now && !o.opt);
  const next7 = list.filter(o => !DONE(o.status) && o.date >= now && o.date <= addD(now, 7));
  const tiles = h('div', { class: 'tiles' },
    h('div', { class: 'card tile' }, h('span', { class: 'num' }, String(list.length)), h('span', { class: 'lbl' }, 'Terminów w miesiącu'),
      h('div', { class: 'bar' }, h('i', { style: { width: (list.length ? Math.round(doneAll * 100 / list.length) : 0) + '%' } }))),
    h('div', { class: 'card tile' + (lateAll.length ? ' dark alert' : '') }, h('span', { class: 'num' }, String(lateAll.length)), h('span', { class: 'lbl' }, 'Po terminie, niezrobione')),
    h('div', { class: 'card tile' }, h('span', { class: 'num' }, String(next7.length)), h('span', { class: 'lbl' }, 'Do zrobienia w 7 dni')),
    h('div', { class: 'card tile' }, h('span', { class: 'num' }, String(new Set(list.map(o => o.client.id)).size)), h('span', { class: 'lbl' }, 'Klientów z terminami')));

  const listBox = h('div');
  function drawList() {
    const ds = [...byDay.keys()].sort().filter(d => !dayFilter || d === dayFilter);
    if (!ds.length) { listBox.replaceChildren(emptyState('Brak terminów', scope === 'moi' ? 'Twoi klienci nie mają terminów w tym miesiącu.' : 'Brak terminów w tym miesiącu – uzupełnij profile klientów.')); return; }
    listBox.replaceChildren(...ds.map(d => {
      const os = byDay.get(d);
      const groups = new Map();
      os.forEach(o => { const k = o.label; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(o); });
      return h('section', { class: 'card ob-day' + (d < now ? ' past' : '') + (d === now ? ' today' : '') },
        h('div', { class: 'ob-dh' }, h('span', { class: 'ob-big' }, d.slice(8, 10)), h('div', {}, h('b', {}, fmtDue(d)), h('div', { class: 'muted small' }, weekday(d) + (os.some(o => o.moved) ? ' · termin przesunięty na dzień roboczy' : '')))),
        [...groups.entries()].map(([lbl, gs]) => {
          const done = gs.filter(o => DONE(o.status)).length;
          const k = KINDS[gs[0].kind];
          const det = h('details', { class: 'ob-g', open: gs.length <= 6 || dayFilter ? true : null },
            h('summary', {}, h('span', { class: 'kchip', style: `--k:${k.color}` }, k.short), h('b', {}, lbl), gs[0].opt ? h('span', { class: 'muted small' }, ' · jeśli dotyczy') : null,
              h('span', { class: 'frac' + (done === gs.length ? ' full' : ''), style: { marginLeft: 'auto' } }, h('span', { class: 'ring', style: `--p:${Math.round(done * 100 / gs.length)}` }), `${done}/${gs.length}`)),
            h('div', { class: 'ob-cl' }, gs.sort((a, b) => (DONE(a.status) - DONE(b.status)) || a.client.name.localeCompare(b.client.name, 'pl')).map(o => {
              const st = o.status, who = memberById(k.area === 'kadry' ? o.client.hr_id : o.client.accountant_id);
              const link = o.kind === 'roczne' ? `#/zamkniecie-roku?rok=${o.year}` : `#/rozliczenia?okres=${o.period}${k.area === 'kadry' ? '&widok=kadry' : ''}`;
              return h('div', { class: 'ob-c' },
                h('a', { href: `#/klient/${o.client.id}`, 'data-panel': o.client.id }, o.client.name),
                who ? h('span', { class: 'muted small' }, who.short_name) : null,
                h('a', { class: 'st st-' + (st || 'none'), href: link, 'data-tip': st ? `Status kratki: ${STATUS[st]?.label}` : 'Brak kratki w rozliczeniach – otwórz miesiąc' }, st ? STATUS[st].label : '—'));
            })));
          return det;
        }));
    }));
  }
  drawList();
  main.replaceChildren(head, nav, tiles, h('div', { class: 'ob-layout' }, map, h('div', { class: 'ob-list' }, listBox)));
  if (dayFilter) markSel();
}
function addD(s, n) { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); }
