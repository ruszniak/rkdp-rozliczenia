// Raport miesięczny dla zarządu: rozliczenia (z porównaniem m/m i trendem), obciążenie zespołu, zaległości,
// zgłoszenia, czas pracy, nowe sprawy M2, monitoring. Jedna strona – podgląd w aplikacji i PDF na papierze firmowym.
import { h, icon, printHtml, periodLabel, shiftPeriod } from '../ui.js';
import { sb, state, hasModule } from '../store.js';
import { fetchAll, fetchSoft, loadClients, todayIso, settledHistory, lastPeriods, fmtMin } from '../data.js';
import { sectionOf } from '../dict.js';
import { sparkline, delta } from '../wykres.js';
import { paper, esc } from '../papier.js';

export async function renderRaport(main, params) {
  const today = todayIso();
  const M = /^\d{4}-\d{2}$/.test(params.get('miesiac') || '') ? params.get('miesiac') : today.slice(0, 7);
  const P = shiftPeriod(M, -1); // okres rozliczany w tym miesiącu
  const mFrom = M + '-01', mTo = new Date(+M.slice(0, 4), +M.slice(5, 7), 0).toLocaleDateString('sv-SE');
  main.replaceChildren(h('div', { class: 'spinner' }, 'Przygotowanie raportu…'));
  const tasks = state.taskTypes.filter(t => t.active);
  const [clients, entries, tickets, times, hist, matters, alerts] = await Promise.all([
    loadClients(),
    fetchAll(() => sb.from('checklist_entries').select('client_id,task_code,status').eq('period', P + '-01')),
    fetchSoft(() => sb.from('rkdp_tickets').select('id,status,assignee_id,created_at,done_at,due_date,done_by').eq('module', 'rkdp')),
    fetchSoft(() => sb.from('client_time').select('member_id,minutes,work_date').gte('work_date', mFrom).lte('work_date', mTo)),
    settledHistory(lastPeriods(P, 6), tasks),
    hasModule('doradztwo') ? fetchSoft(() => sb.from('m2_matters').select('id,number,title,opened_at,status').gte('opened_at', mFrom).lte('opened_at', mTo)) : [],
    fetchSoft(() => sb.from('monitor_alerts').select('id,created_at,resolved_at').gte('created_at', mFrom).lte('created_at', mTo + 'T23:59:59')),
  ]);
  const tBy = new Map(tasks.map(t => [t.code, t]));
  const active = clients.filter(c => c.status === 'aktywny');
  const ent = new Map(); entries.forEach(e => { if (!ent.has(e.client_id)) ent.set(e.client_id, []); ent.get(e.client_id).push(e); });
  const settle = (c, area) => {
    const cells = (ent.get(c.id) || []).filter(e => { const t = tBy.get(e.task_code); return t && t.area === area && (area === 'kadry' || t.applies_to === 'all' || t.applies_to === sectionOf(c)); });
    const req = cells.filter(e => tBy.get(e.task_code).counts_to_settled !== false);
    return { has: cells.length > 0, settled: req.length > 0 && req.every(e => e.status === 'done' || e.status === 'na'), open: cells.filter(e => !['done', 'na'].includes(e.status)).length, missing: cells.some(e => e.status === 'missing_docs') };
  };
  const area = a => { const l = active.map(c => ({ c, s: settle(c, a) })).filter(x => x.s.has); const ok = l.filter(x => x.s.settled).length; return { n: l.length, ok, pct: l.length ? ok * 100 / l.length : 0, list: l }; };
  const A = area('ksiegowosc'), K = area('kadry');
  const prevA = hist.ksiegowosc.at(-2), prevK = hist.kadry.at(-2);
  const created = tickets.filter(t => t.created_at?.slice(0, 7) === M).length;
  const closed = tickets.filter(t => t.status === 'zrobione' && t.done_at?.slice(0, 7) === M).length;
  const openLate = tickets.filter(t => ['nowe', 'w_toku', 'czeka'].includes(t.status) && t.due_date && t.due_date < today).length;
  const missing = [...A.list, ...K.list].filter(x => x.s.missing).length;
  const team = state.members.filter(m => m.active && (m.modules || ['rozliczenia']).includes('rozliczenia'));
  const people = team.map(m => {
    const a = A.list.filter(x => x.c.accountant_id === m.id), k = K.list.filter(x => x.c.hr_id === m.id);
    const ok = a.filter(x => x.s.settled).length + k.filter(x => x.s.settled).length, n = a.length + k.length;
    const open = a.reduce((s, x) => s + x.s.open, 0) + k.reduce((s, x) => s + x.s.open, 0);
    const tk = tickets.filter(t => ['nowe', 'w_toku', 'czeka'].includes(t.status) && t.assignee_id === m.id).length;
    const dn = tickets.filter(t => t.status === 'zrobione' && t.done_at?.slice(0, 7) === M && (t.done_by || t.assignee_id) === m.id).length;
    const min = times.filter(t => t.member_id === m.id).reduce((s, t) => s + t.minutes, 0);
    return { m, n, ok, open, tk, dn, min };
  }).filter(p => p.n || p.tk || p.dn || p.min);
  const totalMin = times.reduce((s, t) => s + t.minutes, 0);
  const pct = v => `${Math.round(v)}%`;

  const kpi = (val, lbl, d) => h('div', { class: 'card tile' }, h('span', { class: 'num' }, val), h('span', { class: 'lbl' }, lbl, d ? [' ', d] : null));
  const exportPdf = () => printHtml(paper({ title: `Raport miesięczny – ${periodLabel(M)}`, subtitle: `rozliczenia za ${periodLabel(P).toLowerCase()}`, body: `
<div class="kpis">
 <div class="kpi"><b>${A.ok}/${A.n}</b><span>księgowość rozliczona (${pct(A.pct)}${prevA != null ? `, m/m ${A.pct - prevA >= 0 ? '+' : ''}${Math.round(A.pct - prevA)} p.p.` : ''})</span><div class="bar"><i style="width:${A.pct}%"></i></div></div>
 <div class="kpi"><b>${K.ok}/${K.n}</b><span>kadry rozliczone (${pct(K.pct)}${prevK != null ? `, m/m ${K.pct - prevK >= 0 ? '+' : ''}${Math.round(K.pct - prevK)} p.p.` : ''})</span><div class="bar"><i style="width:${K.pct}%"></i></div></div>
 <div class="kpi"><b>${created} / ${closed}</b><span>zgłoszenia nowe / zamknięte</span></div>
 <div class="kpi"><b class="${openLate ? 'warn' : ''}">${openLate}</b><span>zgłoszeń po terminie · braki dokumentów: ${missing}</span></div>
</div>
<h2>Trend rozliczeń <small>% rozliczonych klientów, ostatnie 6 miesięcy</small></h2>
<table><thead><tr><th class="l">Obszar</th>${lastPeriods(P, 6).map(p => `<th>${esc(periodLabel(p))}</th>`).join('')}</tr></thead><tbody>
<tr><td class="l">Księgowość</td>${hist.ksiegowosc.map((v, i, a) => `<td>${i === a.length - 1 ? pct(A.pct) : v == null ? '—' : pct(v)}</td>`).join('')}</tr>
<tr><td class="l">Kadry i ZUS</td>${hist.kadry.map((v, i, a) => `<td>${i === a.length - 1 ? pct(K.pct) : v == null ? '—' : pct(v)}</td>`).join('')}</tr></tbody></table>
<h2>Obciążenie zespołu</h2>
<table><thead><tr><th class="l">Osoba</th><th>Klienci rozliczeni</th><th>Kratki otwarte</th><th>Zgłoszenia otwarte</th><th>Zamknięte w miesiącu</th><th>Czas pracy</th></tr></thead><tbody>
${people.map(p => `<tr><td class="l">${esc(p.m.full_name)}</td><td>${p.n ? `${p.ok}/${p.n}` : '—'}</td><td>${p.open}</td><td>${p.tk}</td><td>${p.dn}</td><td>${p.min ? esc(fmtMin(p.min)) : '—'}</td></tr>`).join('')}
</tbody></table>
${matters.length ? `<h2>Nowe sprawy M2 TAX <small>(${matters.length})</small></h2><table><tbody>${matters.map(x => `<tr><td class="l">${esc(x.number || '')}</td><td class="l">${esc(x.title)}</td><td>${esc(x.opened_at)}</td></tr>`).join('')}</tbody></table>` : ''}
<h2>Pozostałe</h2>
<table><tbody><tr><td class="l">Czas pracy zapisany przy klientach</td><td class="r">${esc(fmtMin(totalMin))}</td></tr>
<tr><td class="l">Zmiany wykryte przez monitoring (VAT / KRS)</td><td class="r">${alerts.length}${alerts.filter(a => !a.resolved_at).length ? ` (niesprawdzone: ${alerts.filter(a => !a.resolved_at).length})` : ''}</td></tr>
<tr><td class="l">Aktywni klienci</td><td class="r">${active.length}</td></tr></tbody></table>` }));

  main.replaceChildren(
    h('div', { class: 'page-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, 'Zarząd · raport'), h('h1', { style: { marginTop: '6px' } }, `Raport miesięczny – ${periodLabel(M).toLowerCase()}`),
        h('p', { class: 'sub' }, `Rozliczenia za ${periodLabel(P).toLowerCase()}, praca zespołu, zaległości i nowe sprawy. Pobierz jako PDF na papierze firmowym.`)),
      h('div', { class: 'ph-actions' },
        h('div', { class: 'month' },
          h('a', { class: 'icon-btn', href: `#/raport?miesiac=${shiftPeriod(M, -1)}`, 'aria-label': 'Poprzedni miesiąc' }, icon('left')),
          h('span', { class: 'label' }, periodLabel(M)),
          h('a', { class: 'icon-btn', href: `#/raport?miesiac=${shiftPeriod(M, 1)}`, 'aria-label': 'Następny miesiąc' }, icon('right'))),
        h('button', { class: 'btn btn-primary btn-sm', onclick: exportPdf }, icon('download'), 'Pobierz PDF'))),
    h('div', { class: 'tiles' },
      h('div', { class: 'card tile' }, h('span', { class: 'num' }, `${A.ok}/${A.n}`, h('span', { class: 'tile-spark' }, sparkline(hist.ksiegowosc.map((v, i, a) => i === a.length - 1 ? A.pct : v), { labels: lastPeriods(P, 6).map(periodLabel) }))),
        h('span', { class: 'lbl' }, 'Księgowość rozliczona ', delta(A.pct, prevA)), h('div', { class: 'bar' }, h('i', { style: { width: A.pct + '%' } }))),
      h('div', { class: 'card tile' }, h('span', { class: 'num' }, `${K.ok}/${K.n}`, h('span', { class: 'tile-spark' }, sparkline(hist.kadry.map((v, i, a) => i === a.length - 1 ? K.pct : v), { labels: lastPeriods(P, 6).map(periodLabel) }))),
        h('span', { class: 'lbl' }, 'Kadry rozliczone ', delta(K.pct, prevK)), h('div', { class: 'bar' }, h('i', { style: { width: K.pct + '%' } }))),
      kpi(`${created} / ${closed}`, 'Zgłoszenia nowe / zamknięte'),
      h('div', { class: 'card tile' + (openLate ? ' dark alert' : '') }, h('span', { class: 'num' }, String(openLate)), h('span', { class: 'lbl' }, `Zgłoszeń po terminie · braki dok.: ${missing}`))),
    h('section', { class: 'card section' }, h('div', { class: 'section-head' }, h('h2', {}, 'Obciążenie zespołu')),
      h('div', { class: 'list-wrap' }, h('table', { class: 'list pl-team' },
        h('thead', {}, h('tr', {}, ...['Osoba', 'Klienci rozliczeni', 'Kratki otwarte', 'Zgłoszenia otwarte', 'Zamknięte w miesiącu', 'Czas pracy'].map(x => h('th', {}, x)))),
        h('tbody', {}, people.map(p => h('tr', {}, h('td', {}, h('b', {}, p.m.full_name)),
          h('td', {}, p.n ? h('span', { class: 'frac' + (p.ok === p.n ? ' full' : '') }, h('span', { class: 'ring', style: `--p:${Math.round(p.ok * 100 / p.n)}` }), `${p.ok}/${p.n}`) : '—'),
          h('td', {}, String(p.open)), h('td', {}, String(p.tk)), h('td', {}, String(p.dn)), h('td', {}, p.min ? fmtMin(p.min) : '—'))))))),
    h('div', { class: 'two' },
      h('section', { class: 'card section' }, h('div', { class: 'section-head' }, h('h2', {}, `Nowe sprawy M2 TAX (${matters.length})`)),
        ...(matters.length ? matters.map(x => h('a', { class: 'tk-mini', href: `#/doradztwo/sprawa/${x.id}` }, h('span', {}, `${x.number || ''} ${x.title}`), h('span', { class: 'small muted' }, x.opened_at))) : [h('p', { class: 'hint' }, hasModule('doradztwo') ? 'Brak nowych spraw w tym miesiącu.' : 'Brak dostępu do modułu M2 TAX.')])),
      h('section', { class: 'card section' }, h('div', { class: 'section-head' }, h('h2', {}, 'Pozostałe')),
        h('div', { class: 'pl-dl' }, h('span', {}, 'Czas pracy przy klientach'), h('b', {}, fmtMin(totalMin))),
        h('div', { class: 'pl-dl' }, h('span', {}, 'Zmiany z monitoringu (VAT / KRS)'), h('b', {}, String(alerts.length))),
        h('div', { class: 'pl-dl' }, h('span', {}, 'Aktywni klienci'), h('b', {}, String(active.length))))));
}
