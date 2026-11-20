// Koszt pracowników księgowości (tylko administrator): ile kosztuje mnie dany księgowy / kadrowa.
// Wynagrodzenie: procent przychodu z klientów (abonament księgowy / kadry) albo stała kwota miesięcznie.
// Analiza na bieżących abonamentach klientów (karta klienta → Stawki). Eksport do Excela i PDF.
import { h, toast, fail, modal, infoTip } from '../ui.js';
import { sb, state, memberById, isAdmin } from '../store.js';
import { fetchAll } from './rozliczenia.js';

const zl = n => (Math.round((n || 0) * 100) / 100).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';
const pct = n => isFinite(n) ? (Math.round(n * 10) / 10).toLocaleString('pl-PL') + '%' : '—';
const num = v => { const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return isFinite(n) ? n : 0; };
const esc = v => String(v ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const BASIS = { ksiegowa: 'klienci jako księgowa', kadrowa: 'klienci jako kadrowa', obie: 'księgowa i kadrowa' };
const HELP = `Koszt księgowych – widoczne tylko dla administratora.
• Dla każdej osoby wpisz, jak jej płacisz: procent przychodu z jej klientów albo stałą kwotę miesięcznie (np. pensja + ZUS pracodawcy albo faktura).
• Przychód = abonament z karty klienta (Stawki → Abonament) dla klientów, przy których osoba jest księgową; dla kadrowej – obsługa pracownika × liczba osób na liście płac.
• Analiza: przychód, koszt, marża i udział kosztu w przychodzie – na osobę i na klienta. Stała kwota rozkłada się na klientów proporcjonalnie do przychodu.
• Liczą się tylko klienci aktywni. Brak abonamentu w karcie = przychód 0 (lista „bez abonamentu” pod tabelą).
• Eksport: Excel (osoby + klienci) albo PDF.`;

export async function renderKoszty(main) {
  if (!isAdmin()) { main.replaceChildren(h('p', { class: 'hint' }, 'Brak dostępu.')); return; }
  const [clients, payRows] = await Promise.all([
    fetchAll(() => sb.from('clients').select('id,name,status,accountant_id,hr_id,monthly_fee,fee_employee,employees_count,has_employees,service_scope').order('name')),
    sb.from('staff_pay').select('*').then(r => { if (r.error) throw r.error; return r.data || []; }),
  ]);
  const pay = new Map(payRows.map(r => [r.member_id, r]));
  const active = clients.filter(c => c.status === 'aktywny');
  const accRev = c => num(c.monthly_fee);
  const hrRev = c => c.has_employees === false ? 0 : num(c.fee_employee) * num(c.employees_count);
  const ids = [...new Set(active.flatMap(c => [c.accountant_id, c.hr_id]).filter(Boolean)), ...pay.keys()];
  const people = [...new Set(ids)].map(id => memberById(id)).filter(Boolean).sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'pl'));

  // analiza
  const analyse = () => people.map(m => {
    const p = pay.get(m.id) || { mode: 'procent', value: 0, basis: 'ksiegowa' };
    const rows = [];
    if (p.basis !== 'kadrowa') active.filter(c => c.accountant_id === m.id).forEach(c => rows.push({ c, role: 'księgowość', rev: accRev(c) }));
    if (p.basis !== 'ksiegowa') active.filter(c => c.hr_id === m.id).forEach(c => rows.push({ c, role: 'kadry', rev: hrRev(c) }));
    const rev = rows.reduce((s, r) => s + r.rev, 0);
    const cost = p.mode === 'procent' ? rev * num(p.value) / 100 : num(p.value);
    rows.forEach(r => { r.cost = p.mode === 'procent' ? r.rev * num(p.value) / 100 : rev > 0 ? cost * r.rev / rev : rows.length ? cost / rows.length : 0; r.margin = r.rev - r.cost; });
    const nClients = new Set(rows.map(r => r.c.id)).size;
    return { m, p, rows, rev, cost, margin: rev - cost, share: rev ? cost / rev * 100 : NaN, perClient: nClients ? cost / nClients : 0, nClients, noFee: rows.filter(r => !r.rev) };
  });

  const saveTimers = new Map();
  const savePay = (id, patch) => {
    const cur = { member_id: id, mode: 'procent', value: 0, basis: 'ksiegowa', ...(pay.get(id) || {}), ...patch };
    pay.set(id, cur);
    clearTimeout(saveTimers.get(id));
    saveTimers.set(id, setTimeout(async () => {
      const { error } = await sb.from('staff_pay').upsert({ member_id: id, mode: cur.mode, value: num(cur.value), basis: cur.basis, note: cur.note || null }, { onConflict: 'member_id' });
      if (error) fail(error); else toast('Zapisano');
    }, 600));
    draw();
  };

  const body = h('div');
  const draw = () => {
    const A = analyse();
    const T = A.reduce((t, a) => ({ rev: t.rev + a.rev, cost: t.cost + a.cost }), { rev: 0, cost: 0 });
    const settings = h('div', { class: 'card list-wrap' }, h('table', { class: 'list' },
      h('thead', {}, h('tr', {}, ...['Osoba', 'Jak płacę', 'Wartość', 'Podstawa', 'Uwagi'].map(x => h('th', {}, x)))),
      h('tbody', {}, ...A.map(({ m, p }) => h('tr', {},
        h('td', { 'data-label': 'Osoba' }, h('b', {}, m.full_name)),
        h('td', { 'data-label': 'Jak płacę' }, (() => { const s = h('select', { class: 'select', onchange: e => savePay(m.id, { mode: e.target.value }) },
          h('option', { value: 'procent' }, '% przychodu z klientów'), h('option', { value: 'kwota' }, 'stała kwota / mies.')); s.value = p.mode; return s; })()),
        h('td', { 'data-label': 'Wartość' }, h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
          h('input', { class: 'input', inputmode: 'decimal', style: { maxWidth: '120px' }, value: p.value ? String(p.value).replace('.', ',') : '', placeholder: '0',
            onchange: e => savePay(m.id, { value: num(e.target.value) }) }), h('span', { class: 'muted' }, p.mode === 'procent' ? '%' : 'zł'))),
        h('td', { 'data-label': 'Podstawa' }, (() => { const s = h('select', { class: 'select', onchange: e => savePay(m.id, { basis: e.target.value }) },
          ...Object.entries(BASIS).map(([k, l]) => h('option', { value: k }, l))); s.value = p.basis; return s; })()),
        h('td', { 'data-label': 'Uwagi' }, h('input', { class: 'input', value: p.note || '', maxlength: 500, placeholder: 'np. umowa B2B, z ZUS pracodawcy', onchange: e => savePay(m.id, { note: e.target.value }) })))))));
    const summary = h('div', { class: 'card list-wrap' }, h('table', { class: 'list' },
      h('thead', {}, h('tr', {}, ...['Osoba', 'Klientów', 'Przychód / mies.', 'Koszt / mies.', 'Marża', 'Koszt / przychód', 'Koszt na klienta'].map(x => h('th', {}, x)))),
      h('tbody', {}, ...A.map(a => h('tr', {},
        h('td', {}, h('b', {}, a.m.full_name), h('div', { class: 'small muted' }, a.p.mode === 'procent' ? `${String(a.p.value || 0).replace('.', ',')}% · ${BASIS[a.p.basis]}` : `${zl(a.p.value)} · ${BASIS[a.p.basis]}`)),
        h('td', { 'data-label': 'Klientów' }, String(a.nClients)),
        h('td', { 'data-label': 'Przychód' }, zl(a.rev)),
        h('td', { 'data-label': 'Koszt' }, zl(a.cost)),
        h('td', { 'data-label': 'Marża', style: { color: a.margin < 0 ? '#A4462F' : '' } }, zl(a.margin)),
        h('td', { 'data-label': 'Koszt / przychód' }, pct(a.share)),
        h('td', { 'data-label': 'Na klienta' }, zl(a.perClient)))),
        h('tr', { style: { fontWeight: 700 } }, h('td', {}, 'Razem'), h('td', {}, ''), h('td', {}, zl(T.rev)), h('td', {}, zl(T.cost)), h('td', {}, zl(T.rev - T.cost)), h('td', {}, pct(T.rev ? T.cost / T.rev * 100 : NaN)), h('td', {}, '')))));
    const details = A.filter(a => a.rows.length).map(a => h('details', { class: 'card', style: { padding: '12px 16px', marginTop: '10px' } },
      h('summary', { style: { cursor: 'pointer', fontWeight: 600 } }, `${a.m.full_name} – ${a.nClients} klientów · koszt ${zl(a.cost)} · marża ${zl(a.margin)}`),
      h('table', { class: 'list', style: { marginTop: '8px' } },
        h('thead', {}, h('tr', {}, ...['Klient', 'Rola', 'Przychód', 'Koszt', 'Marża'].map(x => h('th', {}, x)))),
        h('tbody', {}, ...a.rows.sort((x, y) => y.rev - x.rev).map(r => h('tr', {},
          h('td', {}, h('a', { href: `#/klient/${r.c.id}` }, r.c.name)), h('td', {}, r.role), h('td', {}, r.rev ? zl(r.rev) : h('span', { class: 'muted' }, 'brak abonamentu')),
          h('td', {}, zl(r.cost)), h('td', { style: { color: r.margin < 0 ? '#A4462F' : '' } }, zl(r.margin))))))));
    body.replaceChildren(
      h('div', { class: 'tiles' },
        ...[[zl(T.rev), 'Przychód z abonamentów / mies.'], [zl(T.cost), 'Koszt księgowych / mies.'], [zl(T.rev - T.cost), 'Marża / mies.'], [pct(T.rev ? T.cost / T.rev * 100 : NaN), 'Koszt / przychód']]
          .map(([n, l]) => h('div', { class: 'card tile' }, h('span', { class: 'lbl' }, l), h('span', { class: 'num' }, n)))),
      h('h2', { style: { margin: '22px 0 10px', fontSize: '17px' } }, 'Jak płacę'), settings,
      h('h2', { style: { margin: '22px 0 10px', fontSize: '17px' } }, 'Analiza'), summary,
      h('h2', { style: { margin: '22px 0 4px', fontSize: '17px' } }, 'Na klienta'), ...details);
  };

  const exportXlsx = async () => {
    const A = analyse();
    const { downloadXlsx } = await import('../xlsx.js');
    const H = a => a.map(v => ({ v, s: 'header' }));
    const r2 = n => Math.round((n || 0) * 100) / 100;
    downloadXlsx(`Koszt_ksiegowych_${new Date().toLocaleDateString('sv-SE')}.xlsx`, [
      { name: 'Osoby', widths: [26, 16, 10, 20, 10, 16, 16, 16, 14, 16], freeze: { row: 1, col: 1 }, rows: [
        H(['Osoba', 'Jak płacę', 'Wartość', 'Podstawa', 'Klientów', 'Przychód/mies.', 'Koszt/mies.', 'Marża', 'Koszt/przychód %', 'Koszt na klienta']),
        ...A.map(a => [a.m.full_name, a.p.mode === 'procent' ? '% przychodu' : 'stała kwota', num(a.p.value), BASIS[a.p.basis], a.nClients,
          { v: r2(a.rev), s: 'money' }, { v: r2(a.cost), s: 'money' }, { v: r2(a.margin), s: 'money' }, isFinite(a.share) ? r2(a.share) : '', { v: r2(a.perClient), s: 'money' }])] },
      { name: 'Klienci', widths: [26, 40, 12, 14, 14, 14], freeze: { row: 1, col: 2 }, rows: [
        H(['Osoba', 'Klient', 'Rola', 'Przychód/mies.', 'Koszt/mies.', 'Marża']),
        ...A.flatMap(a => a.rows.map(r => [a.m.full_name, r.c.name, r.role, { v: r2(r.rev), s: 'money' }, { v: r2(r.cost), s: 'money' }, { v: r2(r.margin), s: 'money' }]))] },
    ]);
  };
  const exportPdf = async (btn) => {
    const A = analyse(), T = A.reduce((t, a) => ({ rev: t.rev + a.rev, cost: t.cost + a.cost }), { rev: 0, cost: 0 });
    const tr = cells => `<tr>${cells.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`;
    const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Koszt księgowych</title><style>
      @page{size:A4;margin:14mm}body{font:9pt/1.4 Arial,Helvetica,sans-serif;color:#1d1a16;margin:0}h1{font-size:15pt;margin:0 0 2px}h2{font-size:11pt;margin:16px 0 6px}
      p.m{color:#676b73;margin:0 0 12px}table{width:100%;border-collapse:collapse}th{text-align:left;font-size:8pt;color:#5e564c;border-bottom:1.2pt solid #7A5A37;padding:4px}
      td{border-bottom:.5pt solid #e3d9ca;padding:4px;vertical-align:top}tr{break-inside:avoid}tr.t td{font-weight:700}</style></head><body>
      <h1>Koszt księgowych</h1><p class="m">RKDP · abonamenty aktywnych klientów · stan na ${new Date().toLocaleDateString('pl-PL')} · dokument wewnętrzny</p>
      <table><thead><tr><th>Osoba</th><th>Jak płacę</th><th>Klientów</th><th>Przychód / mies.</th><th>Koszt / mies.</th><th>Marża</th><th>Koszt / przychód</th></tr></thead><tbody>
      ${A.map(a => tr([a.m.full_name, a.p.mode === 'procent' ? `${String(a.p.value || 0).replace('.', ',')}% (${BASIS[a.p.basis]})` : `${zl(a.p.value)} (${BASIS[a.p.basis]})`, a.nClients, zl(a.rev), zl(a.cost), zl(a.margin), pct(a.share)])).join('')}
      <tr class="t"><td>Razem</td><td></td><td></td><td>${zl(T.rev)}</td><td>${zl(T.cost)}</td><td>${zl(T.rev - T.cost)}</td><td>${pct(T.rev ? T.cost / T.rev * 100 : NaN)}</td></tr></tbody></table>
      ${A.filter(a => a.rows.length).map(a => `<h2>${esc(a.m.full_name)}</h2><table><thead><tr><th>Klient</th><th>Rola</th><th>Przychód</th><th>Koszt</th><th>Marża</th></tr></thead><tbody>
        ${a.rows.slice().sort((x, y) => y.rev - x.rev).map(r => tr([r.c.name, r.role, r.rev ? zl(r.rev) : 'brak abonamentu', zl(r.cost), zl(r.margin)])).join('')}</tbody></table>`).join('')}
      </body></html>`;
    btn.disabled = true;
    try { const { downloadPdf } = await import('../pdfdoc.js'); await downloadPdf(html, `Koszt_ksiegowych_${new Date().toLocaleDateString('sv-SE')}`); }
    catch (e) { fail(e, 'Nie udało się przygotować PDF'); }
    btn.disabled = false;
  };

  main.replaceChildren(
    h('div', { class: 'page-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, 'Zarządzanie · tylko Ty'),
        h('h1', { style: { marginTop: '6px', display: 'flex', alignItems: 'center' } }, 'Koszt księgowych', infoTip(HELP, 'Koszt księgowych – instrukcja')),
        h('p', { class: 'sub' }, 'Ile kosztuje Cię każda osoba w stosunku do przychodu z jej klientów.')),
      h('div', { class: 'ob-actions' },
        h('button', { class: 'btn btn-outline btn-sm', onclick: e => exportPdf(e.currentTarget) }, 'PDF'),
        h('button', { class: 'btn btn-primary btn-sm', onclick: () => exportXlsx().catch(fail) }, 'Excel'))),
    body);
  draw();
}
