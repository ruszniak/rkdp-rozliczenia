// Rentowność klientów: czas pracy zespołu zestawiony z honorarium (wynagrodzenie biura z karty klienta).
import { h, icon, toast, printHtml, downloadCsv } from '../ui.js';
import { sb, state, memberById } from '../store.js';
import { fetchSoft, loadClients, todayIso, fmtMin, plMoney } from '../data.js';
import { paper, esc } from '../papier.js';
import { emptyState } from '../puste.js';
import { LEGAL_SHORT } from '../dict.js';

const Q = ['I', 'II', 'III', 'IV'];
export async function renderRentownosc(main, params) {
  const now = todayIso();
  let y = +(params.get('rok') || now.slice(0, 4));
  let q = params.get('kw') ? +params.get('kw') : Math.floor((+now.slice(5, 7) - 1) / 3) + 1; // 0 = cały rok
  const from = q ? `${y}-${String((q - 1) * 3 + 1).padStart(2, '0')}-01` : `${y}-01-01`;
  const to = q ? new Date(y, q * 3, 0).toLocaleDateString('sv-SE') : `${y}-12-31`;
  const months = q ? 3 : 12;
  let threshold = (() => { try { return +localStorage.getItem('rkdp_prog_stawki') || 150; } catch { return 150; } })();

  main.replaceChildren(h('div', { class: 'spinner' }, 'Liczenie rentowności…'));
  const [clients, times] = await Promise.all([
    loadClients(),
    fetchSoft(() => sb.from('client_time').select('client_id,member_id,minutes,work_date').gte('work_date', from).lte('work_date', to)),
  ]);
  const byC = new Map();
  times.forEach(t => { const x = byC.get(t.client_id) || { min: 0, people: new Map() }; x.min += t.minutes; x.people.set(t.member_id, (x.people.get(t.member_id) || 0) + t.minutes); byC.set(t.client_id, x); });
  const rows = clients.filter(c => c.status === 'aktywny' || byC.has(c.id)).map(c => {
    const t = byC.get(c.id), min = t?.min || 0, fee = (+c.monthly_fee || 0) * months;
    return { c, min, fee, rate: min ? fee / (min / 60) : null, people: t?.people || new Map() };
  });
  const totalMin = rows.reduce((a, r) => a + r.min, 0), totalFee = rows.reduce((a, r) => a + r.fee, 0);
  let sort = 'rate';

  const href = (yy, qq) => `#/rentownosc?rok=${yy}&kw=${qq}`;
  const thr = h('input', { class: 'input', type: 'number', min: 0, step: 10, value: threshold, style: { width: '90px' }, 'aria-label': 'Próg stawki' });
  thr.addEventListener('change', () => { threshold = +thr.value || 0; try { localStorage.setItem('rkdp_prog_stawki', threshold); } catch { /* */ } draw(); });
  const table = h('div');
  const sorted = () => [...rows].sort((a, b) => sort === 'rate' ? ((a.rate ?? 1e9) - (b.rate ?? 1e9)) : sort === 'time' ? b.min - a.min : sort === 'fee' ? b.fee - a.fee : a.c.name.localeCompare(b.c.name, 'pl'));
  function draw() {
    const list = sorted().filter(r => r.min || r.fee);
    if (!list.length) { table.replaceChildren(emptyState('Brak danych o czasie pracy', 'Zapisuj czas przy kliencie w panelu klienta albo na ekranie „Dziś” – tu pojawi się zestawienie z honorarium.')); return; }
    const th = (k, l) => h('th', { class: (k === 'name' ? 'l ' : '') + 'sortable' + (sort === k ? ' on' : ''), onclick: () => { sort = k; draw(); } }, l);
    table.replaceChildren(h('div', { class: 'list-wrap' }, h('table', { class: 'list rent' },
      h('thead', {}, h('tr', {}, th('name', 'Klient'), h('th', {}, 'Księgowa'), th('fee', `Honorarium (${months} mies.)`), th('time', 'Czas pracy'), th('rate', 'Stawka efektywna'), h('th', {}, 'Udział w czasie'), h('th', {}, 'Kto pracował'))),
      h('tbody', {}, list.map(r => {
        const low = r.rate != null && r.rate < threshold, noFee = r.min && !r.fee;
        return h('tr', { class: low || noFee ? 'rent-low' : '' },
          h('td', { class: 'l' }, h('a', { href: `#/klient/${r.c.id}`, 'data-panel': r.c.id }, h('b', {}, r.c.name)), h('div', { class: 'small muted' }, LEGAL_SHORT[r.c.legal_form] || '')),
          h('td', {}, memberById(r.c.accountant_id)?.short_name || '—'),
          h('td', {}, r.fee ? plMoney(r.fee) : h('span', { class: 'muted' }, 'brak stawki')),
          h('td', {}, r.min ? fmtMin(r.min) : h('span', { class: 'muted' }, '—')),
          h('td', {}, r.rate != null ? h('span', { class: 'cnt ' + (low ? 'late' : 'open') }, plMoney(r.rate) + '/h') : noFee ? h('span', { class: 'cnt late' }, 'bez honorarium') : h('span', { class: 'muted' }, '—')),
          h('td', {}, totalMin ? h('span', { class: 'pct' }, h('span', { class: 'bar' }, h('i', { style: { width: Math.round(r.min * 100 / totalMin) + '%' } })), Math.round(r.min * 100 / totalMin) + '%') : '—'),
          h('td', { class: 'small' }, [...r.people.entries()].sort((a, b) => b[1] - a[1]).map(([id, m]) => `${memberById(id)?.short_name || '?'} ${fmtMin(m)}`).join(', ') || '—'));
      })))));
  }
  const low = rows.filter(r => r.rate != null && r.rate < threshold).length;
  const exportPdf = () => {
    const list = sorted().filter(r => r.min || r.fee);
    printHtml(paper({ title: `Rentowność klientów – ${q ? Q[q - 1] + ' kwartał ' : ''}${y}`, subtitle: `próg stawki ${threshold} zł/h`, body: `
<div class="kpis"><div class="kpi"><b>${esc(fmtMin(totalMin))}</b><span>czas pracy</span></div><div class="kpi"><b>${esc(plMoney(totalFee))}</b><span>honoraria w okresie</span></div>
<div class="kpi"><b>${totalMin ? esc(plMoney(totalFee / (totalMin / 60))) : '—'}</b><span>średnia stawka / h</span></div><div class="kpi"><b>${low}</b><span>klientów poniżej progu</span></div></div>
<table><thead><tr><th class="l">Klient</th><th>Księgowa</th><th>Honorarium</th><th>Czas</th><th>Stawka / h</th></tr></thead><tbody>
${list.map(r => `<tr><td class="l">${esc(r.c.name)}</td><td>${esc(memberById(r.c.accountant_id)?.short_name || '')}</td><td>${r.fee ? esc(plMoney(r.fee)) : '—'}</td><td>${r.min ? esc(fmtMin(r.min)) : '—'}</td><td class="${r.rate != null && r.rate < threshold ? 'warn' : ''}">${r.rate != null ? esc(plMoney(r.rate)) : '—'}</td></tr>`).join('')}
</tbody></table>` }));
  };
  main.replaceChildren(
    h('div', { class: 'page-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, 'Klienci · analiza'), h('h1', { style: { marginTop: '6px' } }, 'Rentowność klientów'),
        h('p', { class: 'sub' }, 'Czas pracy zapisany przy klientach zestawiony z wynagrodzeniem biura z karty klienta. Najniższe stawki na górze – kandydaci do zmiany ceny.')),
      h('div', { class: 'month' },
        h('a', { class: 'icon-btn', href: q ? href(q === 1 ? y - 1 : y, q === 1 ? 4 : q - 1) : href(y - 1, 0), 'aria-label': 'Wcześniej' }, icon('left')),
        h('span', { class: 'label' }, q ? `${Q[q - 1]} kw. ${y}` : `Rok ${y}`),
        h('a', { class: 'icon-btn', href: q ? href(q === 4 ? y + 1 : y, q === 4 ? 1 : q + 1) : href(y + 1, 0), 'aria-label': 'Później' }, icon('right')))),
    h('div', { class: 'tiles' },
      h('div', { class: 'card tile' }, h('span', { class: 'num' }, fmtMin(totalMin)), h('span', { class: 'lbl' }, 'Czas pracy w okresie')),
      h('div', { class: 'card tile' }, h('span', { class: 'num' }, plMoney(totalFee)), h('span', { class: 'lbl' }, `Honoraria (${months} mies.)`)),
      h('div', { class: 'card tile' }, h('span', { class: 'num' }, totalMin ? plMoney(totalFee / (totalMin / 60)) : '—'), h('span', { class: 'lbl' }, 'Średnia stawka za godzinę')),
      h('div', { class: 'card tile' + (low ? ' dark alert' : '') }, h('span', { class: 'num' }, String(low)), h('span', { class: 'lbl' }, `Klientów poniżej ${threshold} zł/h`))),
    h('div', { class: 'toolbar' },
      h('div', { class: 'tabs' }, h('a', { class: 'tab-a' + (q ? ' on' : ''), href: href(y, q || 1) }, 'Kwartał'), h('a', { class: 'tab-a' + (!q ? ' on' : ''), href: href(y, 0) }, 'Cały rok')),
      h('label', { class: 'small muted', style: { display: 'flex', alignItems: 'center', gap: '8px' } }, 'Próg stawki', thr, 'zł/h'),
      h('span', { style: { flex: 1 } }),
      h('button', { class: 'btn btn-outline btn-sm', onclick: exportPdf }, icon('download'), 'PDF'),
      h('button', { class: 'btn btn-outline btn-sm', onclick: () => { downloadCsv(`rentownosc_${y}${q ? '_Q' + q : ''}.csv`, [['Klient', 'Księgowa', 'Honorarium', 'Minuty', 'Stawka zł/h'], ...sorted().filter(r => r.min || r.fee).map(r => [r.c.name, memberById(r.c.accountant_id)?.short_name || '', r.fee, r.min, r.rate != null ? Math.round(r.rate) : ''])]); toast('Pobrano CSV'); } }, 'CSV')),
    table);
  draw();
}
