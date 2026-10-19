// M2 TAX – raporty sprawy do PDF: pełne podsumowanie, samo zestawienie godzin, sam dziennik.
import { printHtml } from '../ui.js';
import { printableHtml, M2_BRAND, dateLong } from './order.js';
import { MATTER_TYPE, MATTER_STATUS, FEE_TYPE, DEADLINE_KIND, JOURNAL_KIND, fmtDate, money, hours, todayIso } from './dict.js';
import { state, memberById } from '../store.js';

const who = id => memberById(id)?.full_name || '';
const byEmail = e => state.members.find(m => m.email === e)?.full_name || e || '';
const inRange = (d, from, to) => (!from || d >= from) && (!to || d <= to);
const rangeText = (from, to) => from || to ? `${from ? 'od ' + fmtDate(from) : ''}${from && to ? ' ' : ''}${to ? 'do ' + fmtDate(to) : ''}` : 'cały okres sprawy';

function matterRows(m, client, ord) {
  const rows = [
    ['Sprawa', `${m.number || ''} – ${m.title}`],
    ['Klient', client?.name || ''],
    ['Rodzaj sprawy', MATTER_TYPE[m.matter_type] || m.matter_type || ''],
    ['Status', (MATTER_STATUS[m.status]?.label || m.status) + (m.stage ? ` – ${m.stage}` : '')],
    m.authority ? ['Organ', m.authority] : null,
    m.case_ref ? ['Sygnatura / znak sprawy', m.case_ref] : null,
    m.tax_kind || m.tax_period ? ['Podatek i okres', [m.tax_kind, m.tax_period].filter(Boolean).join(', ')] : null,
    m.value_in_dispute ? ['Kwota sporu', money(m.value_in_dispute)] : null,
    ord ? ['Zlecenie / umowa', `${ord.number || ''} – ${ord.subject || ''}`] : null,
    ['Prowadzący', [who(m.lead_id), who(m.second_id)].filter(Boolean).join(', ') + (m.assistant_id ? ` (asystent: ${who(m.assistant_id)})` : '')],
    m.poa_type ? ['Pełnomocnictwo', `${m.poa_type}${m.poa_date ? ` z ${fmtDate(m.poa_date)}` : ''}`] : null,
    ['Okres prowadzenia', `od ${fmtDate(m.opened_at)}${m.closed_at ? ` do ${fmtDate(m.closed_at)}` : ' (w toku)'}`],
    m.fee_type ? ['Wynagrodzenie', `${FEE_TYPE[m.fee_type] || m.fee_type}${m.fee_amount ? ` – ${money(m.fee_amount)} netto${m.fee_type === 'godzinowa' ? ' / h' : ''}` : ''}`] : null,
  ].filter(Boolean);
  return { t: 'kv', head: ['Dane sprawy', ''], rows };
}

function timeBlocks(time, rate, { from, to, billableOnly } = {}) {
  const list = time.filter(t => inRange(t.work_date, from, to) && (!billableOnly || t.billable)).sort((a, b) => a.work_date.localeCompare(b.work_date));
  if (!list.length) return [{ t: 'p', text: 'Brak wpisów czasu pracy w wybranym okresie.' }];
  const total = list.reduce((n, t) => n + t.minutes, 0), bill = list.filter(t => t.billable).reduce((n, t) => n + t.minutes, 0);
  const rows = list.map(t => [fmtDate(t.work_date), who(t.member_id), { text: t.description || '—' }, hours(t.minutes), t.billable ? 'tak' : 'nie']);
  rows.push({ cls: 'sum', cells: ['', '', 'Razem', hours(total), ''] });
  if (bill !== total) rows.push({ cls: 'sum', cells: ['', '', 'Do rozliczenia', hours(bill), ''] });
  if (rate) rows.push({ cls: 'sum', cells: ['', '', `Wartość (stawka ${money(rate)} netto / h)`, money(Math.round(bill / 60 * rate * 100) / 100), ''] });
  const per = {};
  list.forEach(t => { const k = who(t.member_id) || '—'; per[k] = (per[k] || 0) + t.minutes; });
  const B = [{ t: 'table', head: ['Data', 'Osoba', 'Czynność', 'Czas', 'Rozl.'], cls: ['nw', 'nw', '', 'num', ''], rows }];
  if (Object.keys(per).length > 1) B.push({ t: 'kv', head: ['Czas według osób', ''], rows: Object.entries(per).map(([k, v]) => [k, hours(v)]) });
  return B;
}

function journalBlocks(journal, { from, to } = {}) {
  const list = journal.filter(j => inRange(j.entry_date, from, to)).sort((a, b) => a.entry_date.localeCompare(b.entry_date) || (a.created_at || '').localeCompare(b.created_at || ''));
  if (!list.length) return [{ t: 'p', text: 'Brak wpisów w dzienniku w wybranym okresie.' }];
  return [{ t: 'table', head: ['Data', 'Rodzaj', 'Wpis', 'Autor'], cls: ['nw', '', '', 'nw'],
    rows: list.map(j => [fmtDate(j.entry_date), JOURNAL_KIND[j.kind] || j.kind, { text: j.title, sub: j.body || '' }, byEmail(j.author)]) }];
}

function deadlineBlocks(deadlines) {
  if (!deadlines.length) return [{ t: 'p', text: 'Brak terminów.' }];
  const today = todayIso();
  return [{ t: 'table', head: ['Termin', 'Czynność', 'Rodzaj', 'Odpowiada', 'Stan'], cls: ['nw', '', '', 'nw', 'nw'],
    rows: [...deadlines].sort((a, b) => a.due_date.localeCompare(b.due_date)).map(d => [
      `${fmtDate(d.due_date)}${d.due_time ? ' ' + d.due_time.slice(0, 5) : ''}`,
      { text: d.title, sub: [d.basis, d.served_at ? `doręczono ${fmtDate(d.served_at)}` : '', d.notes].filter(Boolean).join(' · ') },
      DEADLINE_KIND[d.kind]?.label || d.kind, who(d.assignee_id),
      d.done ? { text: `wykonany${d.done_at ? ' ' + fmtDate(d.done_at.slice(0, 10)) : ''}`, cls: 'ok' } : d.due_date < today ? { text: 'po terminie', cls: 'late' } : 'otwarty',
    ]) }];
}

// kind: 'pelny' | 'godziny' | 'dziennik'
export function matterReportBlocks(kind, { m, client, ord, deadlines = [], journal = [], time = [], rate = null, from = '', to = '', billableOnly = false }) {
  const title = { pelny: 'RAPORT SPRAWY', godziny: 'ZESTAWIENIE CZASU PRACY', dziennik: 'DZIENNIK SPRAWY' }[kind];
  const B = [{ t: 'title', text: title },
    { t: 'meta', text: `${m.number || ''} · ${client?.name || ''} · stan na ${dateLong(todayIso())}${kind !== 'pelny' || from || to ? ` · ${rangeText(from, to)}` : ''}` }];
  if (kind === 'pelny') {
    B.push(matterRows(m, client, ord));
    if (m.description) B.push({ t: 'h', text: 'Opis sprawy i stan faktyczny' }, { t: 'pre', text: m.description });
    if (m.outcome) B.push({ t: 'h', text: 'Rozstrzygnięcie / wynik' }, { t: 'pre', text: m.outcome });
    B.push({ t: 'h', text: `Terminy (${deadlines.length})` }, ...deadlineBlocks(deadlines));
    B.push({ t: 'h', text: 'Dziennik sprawy' }, ...journalBlocks(journal, { from, to }));
    B.push({ t: 'h', text: 'Czas pracy' }, ...timeBlocks(time, rate, { from, to }));
  } else {
    B.push({ t: 'kv', head: ['Sprawa', ''], rows: [['Sprawa', `${m.number || ''} – ${m.title}`], ['Klient', client?.name || ''], m.case_ref ? ['Sygnatura / znak sprawy', m.case_ref] : null, ['Okres zestawienia', rangeText(from, to)]].filter(Boolean) });
    if (kind === 'godziny') B.push({ t: 'h', text: 'Czas pracy' + (billableOnly ? ' (do rozliczenia)' : '') }, ...timeBlocks(time, rate, { from, to, billableOnly }));
    else B.push({ t: 'h', text: 'Wpisy' }, ...journalBlocks(journal, { from, to }));
  }
  B.push({ t: 'gap' }, { t: 'small', text: `Wygenerowano ${new Date().toLocaleString('pl-PL')} · ${state.me?.full_name || ''} · ${M2_BRAND.firmName}` });
  return B;
}

export function printMatterReport(kind, data) {
  const blocks = matterReportBlocks(kind, data);
  const name = { pelny: 'Raport', godziny: 'Godziny', dziennik: 'Dziennik' }[kind];
  return printHtml(printableHtml(blocks, `${name}_${(data.m.number || 'sprawa').replace(/\//g, '-')}`, location.origin + M2_BRAND.logo, M2_BRAND));
}
