// Lista obecności / ewidencja czasu pracy – każdy pracownik prowadzi swoją,
// administrator widzi wszystkich, osoba z attendance_scope (np. Marcin – m2tax.pl) widzi listy pracowników z tej domeny.
import { h, toast, fail, icon, infoTip, modal, MONTHS, printHtml } from '../ui.js';
import { sb, state, memberById, isAdmin } from '../store.js';
import { downloadXlsx } from '../xlsx.js';

export const KINDS = {
  praca: { label: 'Praca w biurze', short: 'P', work: true },
  zdalna: { label: 'Praca zdalna', short: 'PZ', work: true },
  delegacja: { label: 'Wyjazd służbowy', short: 'D', work: true },
  szkolenie: { label: 'Szkolenie', short: 'S', work: true },
  urlop: { label: 'Urlop wypoczynkowy', short: 'UW', leave: true },
  urlop_zadanie: { label: 'Urlop na żądanie', short: 'UŻ', leave: true },
  okolicznosciowy: { label: 'Urlop okolicznościowy', short: 'UO' },
  opieka: { label: 'Opieka nad dzieckiem', short: 'OP' },
  bezplatny: { label: 'Urlop bezpłatny', short: 'UB' },
  l4: { label: 'Zwolnienie lekarskie', short: 'L4' },
  wolne: { label: 'Dzień wolny / odbiór', short: 'W' },
  nieobecnosc: { label: 'Nieobecność', short: 'N' },
};
const WD = ['nd', 'pn', 'wt', 'śr', 'cz', 'pt', 'sb'];
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayIso = () => iso(new Date());
const curMonth = () => todayIso().slice(0, 7);
const monthLabel = m => `${MONTHS[+m.slice(5) - 1]} ${m.slice(0, 4)}`;
const shiftMonth = (m, d) => { const x = new Date(+m.slice(0, 4), +m.slice(5) - 1 + d, 1); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}`; };
const hhmm = t => (t || '').slice(0, 5);
const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const toMin = t => { if (!t) return null; const [a, b] = t.split(':').map(Number); return a * 60 + b; };
export const fmtH = min => `${Math.floor(min / 60)}:${pad(min % 60)}`;
const firmOf = m => /@m2tax\.pl$/i.test(m?.email || '') ? 'M2 TAX Doradcy Podatkowi Otręba Ruszniak sp. p.' : 'RKDP spółka doradztwa podatkowego sp. z o.o.';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- święta i dni robocze ----------
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const hh = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - hh - k) % 7, m = Math.floor((a + 11 * hh + 22 * l) / 451);
  const month = Math.floor((hh + l - 7 * m + 114) / 31), day = ((hh + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}
const holCache = new Map();
export function holidays(y) {
  if (holCache.has(y)) return holCache.get(y);
  const e = easter(y), add = n => { const d = new Date(e); d.setDate(d.getDate() + n); return iso(d); };
  const H = new Map([
    [`${y}-01-01`, 'Nowy Rok'], [`${y}-01-06`, 'Trzech Króli'], [add(0), 'Wielkanoc'], [add(1), 'Poniedziałek Wielkanocny'],
    [`${y}-05-01`, 'Święto Pracy'], [`${y}-05-03`, 'Święto Konstytucji 3 Maja'], [add(49), 'Zesłanie Ducha Świętego'], [add(60), 'Boże Ciało'],
    [`${y}-08-15`, 'Wniebowzięcie NMP'], [`${y}-11-01`, 'Wszystkich Świętych'], [`${y}-11-11`, 'Święto Niepodległości'],
    [`${y}-12-25`, 'Boże Narodzenie'], [`${y}-12-26`, 'Drugi dzień Bożego Narodzenia'],
  ]);
  if (y >= 2025) H.set(`${y}-12-24`, 'Wigilia');
  holCache.set(y, H); return H;
}
export function monthDays(m) {
  const y = +m.slice(0, 4), mo = +m.slice(5) - 1, H = holidays(y), out = [];
  for (let d = new Date(y, mo, 1); d.getMonth() === mo; d.setDate(d.getDate() + 1)) {
    const k = iso(d), dow = d.getDay();
    out.push({ day: k, dow, weekend: dow === 0 || dow === 6, holiday: H.get(k) || null, workday: dow !== 0 && dow !== 6 && !H.has(k) });
  }
  return out;
}

// ---------- obliczenia ----------
export const workMin = r => {
  if (!r || !KINDS[r.kind]?.work) return 0;
  const a = toMin(hhmm(r.start_time)), b = toMin(hhmm(r.end_time));
  if (a === null || b === null || b <= a) return 0;
  return Math.max(0, b - a - (r.break_min || 0));
};
export function summarize(m, rows) {
  const days = monthDays(m), by = new Map(rows.map(r => [r.day, r]));
  const s = { norm: days.filter(d => d.workday).length * 8 * 60, workDays: 0, workMin: 0, remote: 0, kinds: {} };
  for (const r of rows) {
    s.kinds[r.kind] = (s.kinds[r.kind] || 0) + 1;
    if (KINDS[r.kind]?.work) { s.workDays++; s.workMin += workMin(r); if (r.kind === 'zdalna') s.remote++; }
  }
  s.missing = days.filter(d => d.workday && d.day <= todayIso() && !by.has(d.day)).length;
  return s;
}

// kogo lista obecności jest dostępna dla zalogowanego (zgodnie z RLS)
export function visibleMembers() {
  const me = state.me;
  const scope = (me.attendance_scope || '').trim().toLowerCase();
  return state.members.filter(m => m.active && (m.id === me.id || isAdmin() || (scope && (m.email || '').toLowerCase().endsWith('@' + scope))));
}
export const canSeeTeam = () => visibleMembers().length > 1;
const canEdit = memberId => memberId === state.me.id || isAdmin();

async function loadMonth(memberIds, m) {
  const from = m + '-01', to = shiftMonth(m, 1) + '-01';
  const { data, error } = await sb.from('attendance').select('*').in('member_id', memberIds).gte('day', from).lt('day', to).order('day');
  if (error) throw error;
  return data || [];
}

// ---------- widżet „dzisiaj” (pulpit i lista) ----------
export function todayWidget({ onChange, link = true } = {}) {
  const box = h('section', { class: 'card section ob-today' }, h('div', { class: 'spinner' }, 'Wczytywanie…'));
  const draw = async () => {
    const { data: r, error } = await sb.from('attendance').select('*').eq('member_id', state.me.id).eq('day', todayIso()).maybeSingle();
    if (error) { box.replaceChildren(h('p', { class: 'muted small' }, 'Lista obecności niedostępna.')); return; }
    const save = async patch => {
      const row = { member_id: state.me.id, day: todayIso(), kind: r?.kind || 'praca', ...patch };
      const { error: e } = await sb.from('attendance').upsert(row, { onConflict: 'member_id,day' });
      if (e) return fail(e);
      toast('Zapisano w liście obecności'); await draw(); onChange?.();
    };
    const work = !r || KINDS[r.kind]?.work;
    let status, btns = [];
    if (!r) {
      status = 'Nie rozpocząłeś(-aś) jeszcze dziś pracy.';
      btns = [h('button', { class: 'btn btn-primary btn-sm', onclick: () => save({ kind: 'praca', start_time: nowTime() }) }, 'Rozpoczynam pracę w biurze'),
        h('button', { class: 'btn btn-outline btn-sm', onclick: () => save({ kind: 'zdalna', start_time: nowTime() }) }, 'Rozpoczynam pracę zdalną')];
    } else if (!work) {
      status = `Dziś: ${KINDS[r.kind]?.label || r.kind}.`;
    } else if (!r.end_time) {
      status = `${KINDS[r.kind].label} od ${hhmm(r.start_time) || '—'}.`;
      btns = [h('button', { class: 'btn btn-primary btn-sm', onclick: () => save({ end_time: nowTime() }) }, 'Kończę pracę')];
      if (!r.start_time) btns.unshift(h('button', { class: 'btn btn-outline btn-sm', onclick: () => save({ start_time: nowTime() }) }, 'Rozpoczynam pracę'));
    } else {
      status = `${KINDS[r.kind].label}: ${hhmm(r.start_time)}–${hhmm(r.end_time)} (${fmtH(workMin(r))} h).`;
      btns = [h('button', { class: 'btn btn-ghost btn-sm', onclick: () => save({ end_time: null }) }, 'Wróciłem(-am) – wznów')];
    }
    box.replaceChildren(
      h('div', { class: 'section-head' }, h('h2', {}, 'Moja obecność dziś'), link ? h('a', { href: '#/obecnosc', class: 'small' }, 'Lista obecności →') : null),
      h('p', { style: { margin: '0 0 12px' } }, status),
      h('div', { class: 'ob-btns' }, ...btns));
  };
  draw();
  return box;
}

// ---------- karta zespołu na pulpit (administrator, Marcin) ----------
export function teamTodayCard() {
  const members = visibleMembers();
  const box = h('section', { class: 'card section' }, h('div', { class: 'section-head' }, h('h2', {}, 'Obecność dziś'), h('a', { href: '#/obecnosc/zespol', class: 'small' }, 'Listy obecności →')));
  (async () => {
    const { data, error } = await sb.from('attendance').select('*').in('member_id', members.map(m => m.id)).eq('day', todayIso());
    if (error) return box.append(h('p', { class: 'muted small' }, 'Nie udało się wczytać listy obecności.'));
    const by = new Map((data || []).map(r => [r.member_id, r]));
    box.append(...members.map(m => {
      const r = by.get(m.id);
      return h('a', { class: 'tk-mini', href: `#/obecnosc?osoba=${m.id}` }, h('span', {}, m.full_name), h('span', { class: 'small ' + (r ? '' : 'muted') }, statusText(r)));
    }));
  })();
  return box;
}
function statusText(r) {
  if (!r) return 'brak wpisu';
  const k = KINDS[r.kind];
  if (!k?.work) return k?.label || r.kind;
  if (r.start_time && !r.end_time) return `${k.short === 'PZ' ? 'zdalnie' : 'w pracy'} od ${hhmm(r.start_time)}`;
  if (r.end_time) return `${hhmm(r.start_time)}–${hhmm(r.end_time)}${r.kind === 'zdalna' ? ' (zdalnie)' : ''}`;
  return k.label;
}

// ---------- eksport ----------
function personTableRows(m, rows) {
  const by = new Map(rows.map(r => [r.day, r]));
  return monthDays(m).map(d => ({ d, r: by.get(d.day) }));
}
function sumLines(s) {
  const k = s.kinds, line = [];
  line.push(['Dni pracy', String(s.workDays) + (s.remote ? ` (w tym zdalnie: ${s.remote})` : '')]);
  line.push(['Przepracowane godziny', fmtH(s.workMin)]);
  line.push(['Wymiar czasu pracy w miesiącu', fmtH(s.norm)]);
  for (const key of Object.keys(KINDS)) if (!KINDS[key].work && k[key]) line.push([KINDS[key].label, `${k[key]} dn.`]);
  return line;
}
export function exportPdf(m, people) {
  const pages = people.map(({ member, rows }) => {
    const s = summarize(m, rows);
    const body = personTableRows(m, rows).map(({ d, r }) => `<tr class="${d.workday ? '' : 'off'}">
      <td>${d.day.slice(8)}.${d.day.slice(5, 7)}</td><td>${WD[d.dow]}</td>
      <td>${r ? esc(KINDS[r.kind]?.label || r.kind) : (d.holiday ? esc(d.holiday) : d.weekend ? 'dzień wolny' : '')}</td>
      <td class="c">${r && KINDS[r.kind]?.work ? hhmm(r.start_time) : ''}</td><td class="c">${r && KINDS[r.kind]?.work ? hhmm(r.end_time) : ''}</td>
      <td class="c">${r && KINDS[r.kind]?.work && r.break_min ? r.break_min : ''}</td><td class="c">${r && workMin(r) ? fmtH(workMin(r)) : ''}</td>
      <td>${esc(r?.note || '')}</td><td></td></tr>`).join('');
    return `<section class="page">
      <div class="top"><div><div class="firm">${esc(firmOf(member))}</div><h1>Lista obecności – ewidencja czasu pracy</h1></div>
      <div class="meta"><b>${esc(member.full_name)}</b><br>${esc(monthLabel(m))}</div></div>
      <table><thead><tr><th>Data</th><th>Dzień</th><th>Rodzaj</th><th>Od</th><th>Do</th><th>Przerwa [min]</th><th>Godziny</th><th>Uwagi</th><th>Podpis</th></tr></thead><tbody>${body}</tbody></table>
      <table class="sum">${sumLines(s).map(([a, b]) => `<tr><td>${esc(a)}</td><td><b>${esc(b)}</b></td></tr>`).join('')}</table>
      <div class="sign"><div>podpis pracownika</div><div>podpis pracodawcy</div></div>
      <div class="foot">Wygenerowano ${new Date().toLocaleString('pl-PL')} · ${esc(state.me.full_name)}</div></section>`;
  }).join('');
  const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Lista_obecnosci_${m}</title><style>
    @page{size:A4;margin:12mm 12mm 14mm}*{box-sizing:border-box}body{font:9.5pt/1.35 "Segoe UI",Arial,sans-serif;color:#1d1a16;margin:0}
    .page{page-break-after:always}.page:last-child{page-break-after:auto}
    .top{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #8a6a3f;padding-bottom:8px;margin-bottom:10px}
    .firm{font-size:8.5pt;color:#8a6a3f;letter-spacing:.06em;text-transform:uppercase}h1{font-size:14pt;margin:3px 0 0}.meta{text-align:right}
    table{width:100%;border-collapse:collapse}th{background:#f0e9de;font-size:8pt;text-align:left;padding:4px 5px;border:1px solid #d9cdbb}
    td{padding:2.6px 5px;border:1px solid #e3d9ca;font-size:8.6pt}td.c{text-align:center}tr.off td{background:#f7f3ec;color:#8b8073}
    table.sum{width:55%;margin-top:10px}table.sum td{border:none;border-bottom:1px solid #eee5d8;padding:3px 5px}
    .sign{display:flex;justify-content:space-between;margin-top:34px}.sign div{width:42%;border-top:1px solid #777;text-align:center;font-size:8pt;color:#666;padding-top:3px}
    .foot{margin-top:14px;font-size:7.5pt;color:#9a8f80}</style></head><body>${pages}</body></html>`;
  printHtml(html);
}
export function exportXlsx(m, people) {
  const sheets = [];
  if (people.length > 1) {
    const kindKeys = Object.keys(KINDS).filter(k => !KINDS[k].work);
    sheets.push({ name: 'Zestawienie', widths: [28, 10, 12, 12, ...kindKeys.map(() => 12)], freeze: { row: 3, col: 1 },
      rows: [[{ v: `Listy obecności – ${monthLabel(m)}`, s: 'title' }], [],
        ['Pracownik', 'Dni pracy', 'Godziny', 'Wymiar', ...kindKeys.map(k => KINDS[k].label)].map(v => ({ v, s: 'header' })),
        ...people.map(({ member, rows }) => { const s = summarize(m, rows); return [member.full_name, s.workDays, fmtH(s.workMin), fmtH(s.norm), ...kindKeys.map(k => s.kinds[k] || '')]; })] });
  }
  for (const { member, rows } of people) {
    const s = summarize(m, rows);
    sheets.push({ name: member.full_name, widths: [12, 6, 24, 8, 8, 10, 10, 40], freeze: { row: 4, col: 0 },
      rows: [[{ v: `Lista obecności – ${member.full_name}`, s: 'title' }], [{ v: `${firmOf(member)} · ${monthLabel(m)}`, s: 'sub' }], [],
        ['Data', 'Dzień', 'Rodzaj', 'Od', 'Do', 'Przerwa [min]', 'Godziny', 'Uwagi'].map(v => ({ v, s: 'header' })),
        ...personTableRows(m, rows).map(({ d, r }) => {
          const st = d.workday ? 'normal' : 'na', w = r && KINDS[r.kind]?.work;
          return [{ v: d.day, s: st }, { v: WD[d.dow], s: st }, { v: r ? (KINDS[r.kind]?.label || r.kind) : (d.holiday || (d.weekend ? 'dzień wolny' : '')), s: st },
            { v: w ? hhmm(r.start_time) : '', s: st }, { v: w ? hhmm(r.end_time) : '', s: st }, { v: w && r.break_min ? r.break_min : '', s: st },
            { v: w && workMin(r) ? fmtH(workMin(r)) : '', s: st }, { v: r?.note || '', s: st }];
        }),
        [], ...sumLines(s).map(([a, b]) => [{ v: a, s: 'sub' }, '', b])] });
  }
  downloadXlsx(`Lista_obecnosci_${m}${people.length === 1 ? '_' + people[0].member.full_name.replace(/\s+/g, '_') : ''}.xlsx`, sheets);
}

const HELP = `Lista obecności (ewidencja czasu pracy):
• „Rozpoczynam pracę” / „Kończę pracę” zapisuje bieżącą godzinę w dzisiejszym dniu.
• W tabeli możesz uzupełnić lub poprawić każdy dzień: rodzaj (praca w biurze, zdalna, urlop, L4…), godziny od–do, przerwę i uwagi. Zmiany zapisują się od razu.
• „Wypełnij dni robocze” uzupełnia puste dni robocze do dziś standardowymi godzinami.
• Weekendy i święta są wyszarzone. Wymiar czasu pracy = dni robocze × 8 h.
• Swoją listę widzisz Ty i administrator. Listy pracowników M2 TAX (adres @m2tax.pl) widzi także Marcin Otręba.
• Pobierz PDF (do podpisu) albo Excel za wybrany miesiąc.`;

// ---------- widok ----------
export async function renderObecnosc(main, sub, params) {
  if (sub === 'zespol') return renderTeam(main, params);
  const vis = visibleMembers();
  let member = vis.find(x => x.id === params.get('osoba')) || state.me;
  let m = /^\d{4}-\d{2}$/.test(params.get('m') || '') ? params.get('m') : curMonth();
  const editable = canEdit(member.id);
  const rows = await loadMonth([member.id], m);
  const by = new Map(rows.map(r => [r.day, r]));
  const go = (p = {}) => {
    const q = new URLSearchParams({ ...(member.id !== state.me.id ? { osoba: member.id } : {}), m, ...p }), hash = `#/obecnosc?${q}`;
    if (location.hash === hash) renderObecnosc(main, null, q).catch(fail); else location.hash = hash;
  };

  const sumBox = h('div', { class: 'tiles' });
  const drawSum = () => {
    const s = summarize(m, [...by.values()]);
    const tile = (n, l, dark) => h('div', { class: 'card tile' + (dark ? ' dark' : '') }, h('span', { class: 'lbl' }, l), h('span', { class: 'num' }, n));
    const leave = Object.keys(KINDS).filter(k => !KINDS[k].work).reduce((a, k) => a + (s.kinds[k] || 0), 0);
    sumBox.replaceChildren(tile(String(s.workDays), s.remote ? `Dni pracy (zdalnie: ${s.remote})` : 'Dni pracy'), tile(fmtH(s.workMin), `Godziny / wymiar ${fmtH(s.norm)}`),
      tile(String(leave), 'Urlopy i nieobecności'), tile(String(s.missing), 'Dni robocze bez wpisu', s.missing > 0 && m <= curMonth()));
  };

  async function saveDay(day, patch, tr) {
    const cur = by.get(day);
    const next = { member_id: member.id, day, kind: cur?.kind || 'praca', start_time: cur?.start_time || null, end_time: cur?.end_time || null, break_min: cur?.break_min || 0, note: cur?.note || null, ...patch };
    if (!next.kind) {
      if (!cur) return;
      const { error } = await sb.from('attendance').delete().eq('id', cur.id); if (error) return fail(error);
      by.delete(day);
    } else {
      const { data, error } = await sb.from('attendance').upsert(next, { onConflict: 'member_id,day' }).select().single();
      if (error) return fail(error);
      by.set(day, data);
    }
    tr.replaceWith(dayRow(monthDays(m).find(x => x.day === day)));
    drawSum();
  }
  function dayRow(d) {
    const r = by.get(d.day), work = r && KINDS[r.kind]?.work;
    const tr = h('tr', { class: (d.workday ? '' : 'ob-off') + (d.day === todayIso() ? ' ob-now' : '') });
    const dateCell = h('td', { 'data-label': 'Data' }, h('b', {}, `${d.day.slice(8)}.${d.day.slice(5, 7)}`), ' ', h('span', { class: 'muted small' }, WD[d.dow]),
      d.holiday ? h('div', { class: 'small muted' }, d.holiday) : null);
    if (!editable) {
      tr.append(dateCell, h('td', { 'data-label': 'Rodzaj' }, r ? KINDS[r.kind]?.label || r.kind : ''), h('td', { 'data-label': 'Od' }, work ? hhmm(r.start_time) : ''),
        h('td', { 'data-label': 'Do' }, work ? hhmm(r.end_time) : ''), h('td', { 'data-label': 'Przerwa' }, work && r.break_min ? `${r.break_min} min` : ''),
        h('td', { 'data-label': 'Godziny' }, work && workMin(r) ? fmtH(workMin(r)) : ''), h('td', { 'data-label': 'Uwagi' }, r?.note || ''));
      return tr;
    }
    const sel = h('select', { class: 'input ob-kind' }, h('option', { value: '' }, '—'), ...Object.entries(KINDS).map(([k, v]) => h('option', { value: k, selected: r?.kind === k }, v.label)));
    sel.addEventListener('change', () => saveDay(d.day, { kind: sel.value }, tr));
    const time = (key) => { const i = h('input', { class: 'input ob-time', type: 'time', step: 60, value: hhmm(r?.[key]), disabled: r && !work });
      i.addEventListener('change', () => saveDay(d.day, { [key]: i.value || null, ...(r ? {} : { kind: 'praca' }) }, tr)); return i; };
    const brk = h('input', { class: 'input ob-brk', type: 'number', min: 0, max: 600, step: 5, value: r?.break_min || '', placeholder: '0', disabled: r && !work });
    brk.addEventListener('change', () => saveDay(d.day, { break_min: Math.min(600, Math.max(0, parseInt(brk.value, 10) || 0)), ...(r ? {} : { kind: 'praca' }) }, tr));
    const note = h('input', { class: 'input ob-note', value: r?.note || '', placeholder: '' });
    note.addEventListener('change', () => { if (!r && !note.value.trim()) return; saveDay(d.day, { note: note.value.trim() || null }, tr); });
    tr.append(dateCell, h('td', { 'data-label': 'Rodzaj' }, sel), h('td', { 'data-label': 'Od' }, time('start_time')), h('td', { 'data-label': 'Do' }, time('end_time')),
      h('td', { 'data-label': 'Przerwa (min)' }, brk), h('td', { 'data-label': 'Godziny', class: 'ob-h' }, work && workMin(r) ? fmtH(workMin(r)) : ''), h('td', { 'data-label': 'Uwagi' }, note));
    return tr;
  }

  const fillDialog = () => {
    const from = h('input', { class: 'input', type: 'time', value: '08:00' }), to = h('input', { class: 'input', type: 'time', value: '16:00' });
    const kind = h('select', { class: 'input' }, h('option', { value: 'praca' }, KINDS.praca.label), h('option', { value: 'zdalna' }, KINDS.zdalna.label));
    const empty = monthDays(m).filter(d => d.workday && d.day <= todayIso() && !by.has(d.day));
    if (!empty.length) return toast('Wszystkie dni robocze do dziś są już uzupełnione.');
    modal('Wypełnij dni robocze', h('div', {}, h('p', { class: 'muted small', style: { marginTop: 0 } }, `Uzupełni ${empty.length} pustych dni roboczych do dziś. Istniejące wpisy zostaną bez zmian.`),
      h('div', { class: 'form-grid' }, h('label', { class: 'field' }, h('span', {}, 'Od'), from), h('label', { class: 'field' }, h('span', {}, 'Do'), to),
        h('label', { class: 'field' }, h('span', {}, 'Rodzaj'), kind))),
    close => [h('button', { class: 'btn btn-ghost btn-sm', onclick: close }, 'Anuluj'), h('button', { class: 'btn btn-primary btn-sm', onclick: async () => {
      const ins = empty.map(d => ({ member_id: member.id, day: d.day, kind: kind.value, start_time: from.value || null, end_time: to.value || null, break_min: 0 }));
      const { error } = await sb.from('attendance').upsert(ins, { onConflict: 'member_id,day', ignoreDuplicates: true });
      if (error) return fail(error);
      close(); toast(`Uzupełniono ${ins.length} dni`); go();
    } }, 'Wypełnij')]);
  };

  const people = [{ member, rows: [...by.values()] }];
  const pick = vis.length > 1 ? h('select', { class: 'input', style: { width: 'auto' }, onchange: e => { member = vis.find(x => x.id === e.target.value); location.hash = `#/obecnosc?${new URLSearchParams({ ...(member.id !== state.me.id ? { osoba: member.id } : {}), m })}`; } },
    ...vis.map(x => h('option', { value: x.id, selected: x.id === member.id }, x.full_name))) : null;
  const tbody = h('tbody', {}, ...monthDays(m).map(dayRow));
  drawSum();
  main.replaceChildren(
    h('div', { class: 'page-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, member.id === state.me.id ? 'Moja lista obecności' : 'Lista obecności'),
        h('h1', { style: { marginTop: '6px', display: 'flex', alignItems: 'center' } }, member.full_name, infoTip(HELP, 'Lista obecności – instrukcja')),
        h('p', { class: 'sub' }, firmOf(member))),
      h('div', { class: 'ob-actions' },
        canSeeTeam() ? h('a', { class: 'btn btn-outline btn-sm', href: `#/obecnosc/zespol?m=${m}` }, 'Zespół') : null,
        h('button', { class: 'btn btn-outline btn-sm', onclick: () => exportPdf(m, people) }, icon('download'), 'PDF'),
        h('button', { class: 'btn btn-outline btn-sm', onclick: () => exportXlsx(m, people) }, icon('download'), 'Excel'))),
    member.id === state.me.id && m === curMonth() ? todayWidget({ onChange: () => go(), link: false }) : null,
    h('div', { class: 'ob-bar' },
      h('div', { class: 'ob-month' },
        h('button', { class: 'icon-btn', 'aria-label': 'Poprzedni miesiąc', onclick: () => { m = shiftMonth(m, -1); go(); } }, icon('left')),
        h('b', {}, monthLabel(m)),
        h('button', { class: 'icon-btn', 'aria-label': 'Następny miesiąc', onclick: () => { m = shiftMonth(m, 1); go(); } }, icon('right'))),
      pick,
      editable ? h('button', { class: 'btn btn-ghost btn-sm', onclick: fillDialog }, 'Wypełnij dni robocze') : null),
    sumBox,
    h('div', { class: 'card list-wrap', style: { marginTop: '14px' } }, h('table', { class: 'list ob-table' },
      h('thead', {}, h('tr', {}, ...['Data', 'Rodzaj', 'Od', 'Do', 'Przerwa (min)', 'Godziny', 'Uwagi'].map(x => h('th', {}, x)))), tbody)));
}

async function renderTeam(main, params) {
  const vis = visibleMembers();
  if (vis.length < 2) { location.hash = '#/obecnosc'; return; }
  let m = /^\d{4}-\d{2}$/.test(params.get('m') || '') ? params.get('m') : curMonth();
  const rows = await loadMonth(vis.map(x => x.id), m);
  const per = vis.map(member => ({ member, rows: rows.filter(r => r.member_id === member.id) }));
  const today = todayIso();
  const go = () => { location.hash = `#/obecnosc/zespol?m=${m}`; };
  const leaveTxt = s => Object.keys(KINDS).filter(k => !KINDS[k].work && s.kinds[k]).map(k => `${KINDS[k].short} ${s.kinds[k]}`).join(', ');
  main.replaceChildren(
    h('div', { class: 'page-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, 'Listy obecności'), h('h1', { style: { marginTop: '6px', display: 'flex', alignItems: 'center' } }, 'Obecność zespołu', infoTip(HELP, 'Lista obecności – instrukcja')),
        h('p', { class: 'sub' }, isAdmin() ? 'Wszyscy pracownicy.' : 'Pracownicy, których listy możesz przeglądać.')),
      h('div', { class: 'ob-actions' },
        h('a', { class: 'btn btn-outline btn-sm', href: '#/obecnosc' }, 'Moja lista'),
        h('button', { class: 'btn btn-outline btn-sm', onclick: () => exportPdf(m, per) }, icon('download'), 'PDF – wszyscy'),
        h('button', { class: 'btn btn-outline btn-sm', onclick: () => exportXlsx(m, per) }, icon('download'), 'Excel – wszyscy'))),
    h('div', { class: 'ob-bar' }, h('div', { class: 'ob-month' },
      h('button', { class: 'icon-btn', 'aria-label': 'Poprzedni miesiąc', onclick: () => { m = shiftMonth(m, -1); go(); } }, icon('left')),
      h('b', {}, monthLabel(m)),
      h('button', { class: 'icon-btn', 'aria-label': 'Następny miesiąc', onclick: () => { m = shiftMonth(m, 1); go(); } }, icon('right')))),
    h('div', { class: 'card list-wrap' }, h('table', { class: 'list' },
      h('thead', {}, h('tr', {}, ...['Pracownik', m === curMonth() ? 'Dziś' : null, 'Dni pracy', 'Godziny / wymiar', 'Urlopy i nieobecności', 'Dni bez wpisu', ''].filter(x => x !== null).map(x => h('th', {}, x)))),
      h('tbody', {}, ...per.map(({ member, rows: rr }) => {
        const s = summarize(m, rr);
        return h('tr', {},
          h('td', { 'data-label': 'Pracownik' }, h('a', { href: `#/obecnosc?osoba=${member.id}&m=${m}` }, h('b', {}, member.full_name)), h('div', { class: 'small muted' }, /@m2tax\.pl$/i.test(member.email) ? 'M2 TAX' : 'RKDP')),
          m === curMonth() ? h('td', { 'data-label': 'Dziś' }, statusText(rr.find(r => r.day === today))) : null,
          h('td', { 'data-label': 'Dni pracy' }, String(s.workDays) + (s.remote ? ` (zdalnie ${s.remote})` : '')),
          h('td', { 'data-label': 'Godziny' }, `${fmtH(s.workMin)} / ${fmtH(s.norm)}`),
          h('td', { 'data-label': 'Urlopy' }, leaveTxt(s) || '—'),
          h('td', { 'data-label': 'Bez wpisu' }, s.missing ? h('span', { class: 'tag warn' }, String(s.missing)) : '0'),
          h('td', {}, h('div', { class: 'ob-btns' },
            h('button', { class: 'btn btn-ghost btn-sm', onclick: () => exportPdf(m, [{ member, rows: rr }]) }, 'PDF'),
            h('button', { class: 'btn btn-ghost btn-sm', onclick: () => exportXlsx(m, [{ member, rows: rr }]) }, 'Excel'))));
      })))));
}
