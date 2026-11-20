// Wnioski urlopowe: pracownik składa wniosek, administrator (albo osoba z attendance_scope, np. Marcin – M2 TAX) akceptuje
// lub odrzuca. Po akceptacji dni robocze z wniosku trafiają do listy obecności. Wniosek można pobrać jako PDF do podpisu.
import { h, toast, fail, modal, infoTip, printHtml } from '../ui.js';
import { sb, state, memberById, isAdmin } from '../store.js';
import { KINDS, holidays, visibleMembers } from './obecnosc.js';

export const LEAVE_KINDS = ['urlop', 'urlop_zadanie', 'okolicznosciowy', 'opieka', 'bezplatny', 'wolne'];
const STATUS = { oczekuje: ['Czeka na decyzję', 'warn'], zaakceptowany: ['Zaakceptowany', 'ok'], odrzucony: ['Odrzucony', ''], wycofany: ['Wycofany', ''] };
const HELP = `Wnioski urlopowe:
• „Nowy wniosek” – wybierz rodzaj (wypoczynkowy, na żądanie, okolicznościowy…), daty od–do i ewentualnie uwagi. Dni robocze liczą się same (bez weekendów i świąt).
• Wniosek trafia do akceptacji – przełożony dostaje powiadomienie. Dopóki czeka na decyzję, możesz go wycofać.
• Po akceptacji dni urlopu wpisują się same do Twojej listy obecności, a Ty dostajesz powiadomienie.
• „PDF” – wniosek do wydruku i podpisu (np. do akt osobowych).
• Akceptujący widzą na górze sekcję „Do akceptacji” z przyciskami Akceptuj / Odrzuć.`;

const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayIso = () => iso(new Date());
const fd = s => s ? s.split('-').reverse().join('.') : '';
const range = r => r.date_from === r.date_to ? fd(r.date_from) : `${fd(r.date_from)} – ${fd(r.date_to)}`;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const firmOf = m => /@m2tax\.pl$/i.test(m?.email || '') ? 'M2 TAX Doradcy Podatkowi Otręba Ruszniak sp. p.' : 'RKDP spółka doradztwa podatkowego sp. z o.o.';
const daysWord = n => n === 1 ? 'dzień' : 'dni';

// dni robocze w zakresie (bez sobót, niedziel i świąt)
export function workDays(from, to) {
  const out = [];
  if (!from || !to || to < from) return out;
  for (let d = new Date(from + 'T12:00:00'); iso(d) <= to; d.setDate(d.getDate() + 1)) {
    const k = iso(d), dow = d.getDay();
    if (dow !== 0 && dow !== 6 && !holidays(d.getFullYear()).has(k)) out.push(k);
    if (out.length > 120) break;
  }
  return out;
}

const canDecide = r => isAdmin() || (r.member_id !== state.me.id && visibleMembers().some(m => m.id === r.member_id));

export function leavePdf(r) {
  const m = memberById(r.member_id) || {}, dec = r.decided_by ? memberById(r.decided_by) : null;
  const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Wniosek_urlopowy_${esc((m.full_name || '').replace(/\s+/g, '_'))}_${r.date_from}</title><style>
    @page{size:A4;margin:22mm 20mm}*{box-sizing:border-box}body{font:11pt/1.5 "Segoe UI",Arial,sans-serif;color:#1d1a16;margin:0}
    .top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:34px}.firm{font-size:9.5pt;color:#7A5A37;max-width:60%}
    h1{font-size:16pt;text-align:center;margin:10px 0 26px;font-weight:600}table{width:100%;border-collapse:collapse;margin:0 0 20px}
    td{padding:7px 4px;border-bottom:1px solid #e3d9ca;vertical-align:top}td:first-child{color:#676b73;width:38%}
    .sign{display:flex;justify-content:space-between;margin-top:56px}.sign div{width:42%;border-top:1px solid #777;text-align:center;font-size:9pt;color:#666;padding-top:4px}
    .dec{margin-top:30px;padding:12px 14px;background:#f7f3ec;border-left:2px solid #7A5A37;font-size:10pt}.foot{margin-top:40px;font-size:8pt;color:#9a8f80}</style></head><body>
    <div class="top"><div class="firm">${esc(firmOf(m))}</div><div>Wrocław, ${fd(r.created_at?.slice(0, 10) || todayIso())}</div></div>
    <h1>Wniosek o ${r.kind === 'wolne' ? 'dzień wolny' : 'udzielenie urlopu'}</h1>
    <table>
      <tr><td>Pracownik</td><td><b>${esc(m.full_name || '')}</b></td></tr>
      <tr><td>Rodzaj</td><td>${esc(KINDS[r.kind]?.label || r.kind)}</td></tr>
      <tr><td>Termin</td><td>${esc(range(r))}</td></tr>
      <tr><td>Liczba dni roboczych</td><td>${r.days}</td></tr>
      ${r.note ? `<tr><td>Uwagi</td><td>${esc(r.note)}</td></tr>` : ''}
    </table>
    <p>Proszę o udzielenie: ${esc((KINDS[r.kind]?.label || r.kind).toLowerCase())} w terminie ${esc(range(r))}.</p>
    <div class="sign"><div>podpis pracownika</div><div>podpis pracodawcy</div></div>
    ${r.status !== 'oczekuje' ? `<div class="dec">Decyzja w rdp.app: <b>${esc(STATUS[r.status]?.[0] || r.status)}</b>${dec ? ` · ${esc(dec.full_name)}` : ''}${r.decided_at ? ` · ${new Date(r.decided_at).toLocaleString('pl-PL')}` : ''}${r.decision_note ? `<br>${esc(r.decision_note)}` : ''}</div>` : ''}
    <div class="foot">Wniosek złożony w rdp.app ${r.created_at ? new Date(r.created_at).toLocaleString('pl-PL') : ''}</div></body></html>`;
  printHtml(html);
}

export function newLeaveDialog(onDone) {
  const t = todayIso();
  const kind = h('select', { class: 'input' }, ...LEAVE_KINDS.map(k => h('option', { value: k }, KINDS[k].label)));
  const from = h('input', { class: 'input', type: 'date', value: t, min: `${+t.slice(0, 4) - 1}-01-01` });
  const to = h('input', { class: 'input', type: 'date', value: t });
  const note = h('textarea', { class: 'input', rows: 2, maxlength: 1000, placeholder: 'np. zastępstwo: Anna – pilne sprawy klientów' });
  const info = h('p', { class: 'small', style: { margin: '4px 0 0' } });
  const upd = () => {
    if (to.value < from.value) to.value = from.value;
    to.min = from.value;
    const n = workDays(from.value, to.value).length;
    info.replaceChildren(n ? h('span', {}, 'Dni robocze: ', h('b', {}, String(n)), ' (bez weekendów i świąt)') : h('span', { class: 'muted' }, 'W tym zakresie nie ma dni roboczych.'));
  };
  from.addEventListener('change', upd); to.addEventListener('change', upd); upd();
  modal('Nowy wniosek urlopowy', h('div', {},
    h('label', { class: 'field' }, h('span', {}, 'Rodzaj'), kind),
    h('div', { class: 'form-grid' }, h('label', { class: 'field' }, h('span', {}, 'Od'), from), h('label', { class: 'field' }, h('span', {}, 'Do'), to)),
    info,
    h('label', { class: 'field', style: { marginTop: '10px' } }, h('span', {}, 'Uwagi (opcjonalnie)'), note)),
  close => [h('button', { class: 'btn btn-ghost btn-sm', onclick: close }, 'Anuluj'), h('button', { class: 'btn btn-primary btn-sm', onclick: async (e) => {
    const days = workDays(from.value, to.value).length;
    if (!from.value || !to.value) return toast('Podaj daty', true);
    if (!days) return toast('W wybranym zakresie nie ma dni roboczych', true);
    if (days > 60) return toast('Wniosek może obejmować najwyżej 60 dni roboczych', true);
    e.target.disabled = true;
    const { error } = await sb.from('leave_requests').insert({ member_id: state.me.id, status: 'oczekuje', kind: kind.value, date_from: from.value, date_to: to.value, days, note: note.value.trim() || null });
    e.target.disabled = false;
    if (error) return fail(error);
    close(); toast('Wniosek wysłany do akceptacji'); onDone?.();
  } }, 'Wyślij wniosek')]);
}

function decideDialog(r, approve, onDone) {
  const m = memberById(r.member_id);
  const note = h('textarea', { class: 'input', rows: 2, maxlength: 1000, placeholder: approve ? 'opcjonalnie' : 'np. proszę o inny termin – koniec miesiąca' });
  modal(approve ? 'Akceptuj wniosek' : 'Odrzuć wniosek', h('div', {},
    h('p', { style: { marginTop: 0 } }, h('b', {}, m?.full_name || ''), ` · ${KINDS[r.kind]?.label || r.kind} · ${range(r)} · ${r.days} ${daysWord(r.days)} rob.`),
    approve ? h('p', { class: 'small muted' }, 'Dni robocze z wniosku wpiszą się do listy obecności pracownika.') : null,
    h('label', { class: 'field' }, h('span', {}, approve ? 'Komentarz (opcjonalnie)' : 'Powód (pracownik go zobaczy)'), note)),
  close => [h('button', { class: 'btn btn-ghost btn-sm', onclick: close }, 'Anuluj'), h('button', { class: 'btn btn-primary btn-sm', onclick: async (e) => {
    e.target.disabled = true;
    const { error } = await sb.rpc('leave_decide', { p_id: r.id, p_approve: approve, p_note: note.value.trim() || null, p_days: approve ? workDays(r.date_from, r.date_to) : null });
    e.target.disabled = false;
    if (error) return fail(error);
    close(); toast(approve ? 'Wniosek zaakceptowany' : 'Wniosek odrzucony'); onDone?.();
  } }, approve ? 'Akceptuj' : 'Odrzuć')]);
}

export async function renderUrlopy(main, params) {
  const year = /^\d{4}$/.test(params?.get('rok') || '') ? +params.get('rok') : new Date().getFullYear();
  const { data, error } = await sb.from('leave_requests').select('*').or(`and(date_from.gte.${year}-01-01,date_from.lte.${year}-12-31),status.eq.oczekuje`).order('date_from', { ascending: false });
  if (error) throw error;
  const rows = data || [];
  const reload = () => renderUrlopy(main, params).catch(fail);
  const mine = rows.filter(r => r.member_id === state.me.id);
  const pending = rows.filter(r => r.status === 'oczekuje' && r.member_id !== state.me.id && canDecide(r));
  const others = rows.filter(r => r.member_id !== state.me.id && r.status !== 'oczekuje');
  const used = k => mine.filter(r => r.status === 'zaakceptowany' && k.includes(r.kind) && r.date_from.startsWith(String(year))).reduce((n, r) => n + r.days, 0);

  const stat = r => h('span', { class: 'badge ' + (STATUS[r.status]?.[1] || '') }, STATUS[r.status]?.[0] || r.status);
  const row = (r, who) => h('tr', {},
    who ? h('td', { 'data-label': 'Pracownik' }, h('b', {}, memberById(r.member_id)?.full_name || '—')) : null,
    h('td', { 'data-label': 'Rodzaj' }, KINDS[r.kind]?.label || r.kind),
    h('td', { 'data-label': 'Termin' }, range(r)),
    h('td', { 'data-label': 'Dni rob.' }, String(r.days)),
    h('td', { 'data-label': 'Status' }, stat(r), r.decided_by ? h('div', { class: 'small muted' }, memberById(r.decided_by)?.full_name || '') : null),
    h('td', { 'data-label': 'Uwagi' }, r.note ? h('div', { class: 'small' }, r.note) : null, r.decision_note ? h('div', { class: 'small muted' }, 'Odpowiedź: ', r.decision_note) : null),
    h('td', {}, h('div', { class: 'ob-btns' },
      r.status === 'oczekuje' && canDecide(r) && r.member_id !== state.me.id ? h('button', { class: 'btn btn-primary btn-sm', onclick: () => decideDialog(r, true, reload) }, 'Akceptuj') : null,
      r.status === 'oczekuje' && canDecide(r) && r.member_id !== state.me.id ? h('button', { class: 'btn btn-ghost btn-sm', onclick: () => decideDialog(r, false, reload) }, 'Odrzuć') : null,
      r.status === 'oczekuje' && r.member_id === state.me.id && isAdmin() ? h('button', { class: 'btn btn-ghost btn-sm', onclick: () => decideDialog(r, true, reload) }, 'Zatwierdź') : null,
      r.status === 'oczekuje' && r.member_id === state.me.id ? h('button', { class: 'btn btn-ghost btn-sm', onclick: async () => {
        const { error: e } = await sb.rpc('leave_cancel', { p_id: r.id }); if (e) return fail(e); toast('Wniosek wycofany'); reload();
      } }, 'Wycofaj') : null,
      h('button', { class: 'btn btn-ghost btn-sm', onclick: () => leavePdf(r) }, 'PDF'))));
  const table = (list, who, empty) => list.length
    ? h('div', { class: 'card list-wrap' }, h('table', { class: 'list' },
        h('thead', {}, h('tr', {}, ...[who ? 'Pracownik' : null, 'Rodzaj', 'Termin', 'Dni rob.', 'Status', 'Uwagi', ''].filter(x => x !== null).map(x => h('th', {}, x)))),
        h('tbody', {}, ...list.map(r => row(r, who)))))
    : h('p', { class: 'hint' }, empty);
  const tile = (n, l, alert) => h('div', { class: 'card tile' + (alert ? ' dark alert' : '') }, h('span', { class: 'lbl' }, l), h('span', { class: 'num' }, n));
  const sec = (t, ...c) => h('section', { style: { marginTop: '22px' } }, h('h2', { style: { margin: '0 0 10px', fontSize: '17px' } }, t), ...c);

  main.replaceChildren(...[
    h('div', { class: 'page-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, 'Lista obecności'),
        h('h1', { style: { marginTop: '6px', display: 'flex', alignItems: 'center' } }, 'Urlopy', infoTip(HELP, 'Urlopy – instrukcja')),
        h('p', { class: 'sub' }, `Wnioski urlopowe ${year} – składanie, akceptacja i PDF do podpisu.`)),
      h('div', { class: 'ob-actions' },
        h('a', { class: 'btn btn-outline btn-sm', href: '#/obecnosc' }, 'Lista obecności'),
        h('button', { class: 'btn btn-primary btn-sm', onclick: () => newLeaveDialog(reload) }, 'Nowy wniosek'))),
    h('div', { class: 'ob-bar' }, h('div', { class: 'ob-month' },
      h('button', { class: 'icon-btn', 'aria-label': 'Poprzedni rok', onclick: () => { location.hash = `#/obecnosc/urlopy?rok=${year - 1}`; } }, '‹'),
      h('b', {}, String(year)),
      h('button', { class: 'icon-btn', 'aria-label': 'Następny rok', onclick: () => { location.hash = `#/obecnosc/urlopy?rok=${year + 1}`; } }, '›'))),
    h('div', { class: 'tiles' },
      tile(String(used(['urlop', 'urlop_zadanie'])), `Urlop wypoczynkowy ${year} – wykorzystane dni`),
      tile(`${used(['urlop_zadanie'])} / 4`, 'W tym na żądanie'),
      tile(String(mine.filter(r => r.status === 'oczekuje').length), 'Moje wnioski czekające'),
      ...(pending.length ? [tile(String(pending.length), 'Do akceptacji', true)] : [])),
    pending.length ? sec('Do akceptacji', table(pending, true, '')) : null,
    sec('Moje wnioski', table(mine, false, 'Nie masz jeszcze wniosków w tym roku. Kliknij „Nowy wniosek”.')),
    others.length ? sec('Wnioski zespołu', table(others, true, '')) : null].filter(Boolean));
}
