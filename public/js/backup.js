// Ręczna kopia wszystkich danych (tylko administrator): ZIP z plikiem JSON (do odtworzenia) i Excelem (do przeglądania)
import { sb } from './store.js';
import { zip, buildXlsx } from './xlsx.js';
import { fetchAll } from './views/rozliczenia.js';

// tabela -> kolumny porządkujące (stabilne stronicowanie)
export const BACKUP_TABLES = [
  ['team_members', ['id']], ['clients', ['id']], ['client_partners', ['id']], ['client_assignments', ['client_id', 'member_id']],
  ['task_types', ['code']], ['checklist_entries', ['id']], ['period_notes', ['client_id', 'period']], ['app_settings', ['key']],
  ['m2_signers', ['id']], ['m2_clients', ['id']], ['m2_contacts', ['id']], ['m2_matters', ['id']], ['m2_deadlines', ['id']],
  ['m2_journal', ['id']], ['m2_time', ['id']], ['m2_orders', ['id']], ['audit_log', ['id']],
  // nowsze tabele (brak tabeli = pomijamy, kopia się nie przerywa)
  ['member_profiles', ['member_id']], ['member_private', ['member_id']], ['member_prefs', ['member_id']], ['attendance', ['id']], ['terms_acceptances', ['id']],
  ['client_files', ['id']], ['client_messages', ['id']], ['client_monitor', ['id']], ['client_time', ['id']], ['doc_requests', ['id']],
  ['period_comments', ['id']], ['period_files', ['id']], ['year_close_entries', ['id']], ['fin_statements', ['id']], ['thread_reads', ['member_id', 'client_id']],
  ['rkdp_tickets', ['id']], ['rkdp_ticket_comments', ['id']], ['rkdp_ticket_files', ['id']], ['rkdp_ticket_templates', ['id']], ['rkdp_protocols', ['id']],
  ['offers', ['id']], ['aml_cases', ['id']], ['aml_checks', ['id']], ['monitor_alerts', ['id']], ['m2_history', ['id']], ['m2_deadlines', ['id']],
].filter((x, i, a) => a.findIndex(y => y[0] === x[0]) === i);

const plural = n => n === 1 ? 'wiersz' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'wiersze' : 'wierszy';
const cellOf = v => v === null || v === undefined ? '' : typeof v === 'boolean' ? (v ? 'TAK' : 'NIE')
  : typeof v === 'object' ? JSON.stringify(v) : v;

export async function downloadBackup(onProgress = () => {}) {
  const data = {};
  for (const [i, [table, keys]] of BACKUP_TABLES.entries()) {
    onProgress(`${i + 1}/${BACKUP_TABLES.length}: ${table}`);
    try { data[table] = await fetchAll(() => keys.reduce((q, k) => q.order(k), sb.from(table).select('*'))); }
    catch (e) { console.warn('kopia: pomijam', table, e?.message); }
  }
  const stamp = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Warsaw' }).replace(' ', '_').replace(/:/g, '-').slice(0, 16);
  const json = JSON.stringify({ app: 'rkdp-rozliczenia', created_at: new Date().toISOString(), tables: data }, null, 1);
  const sheets = Object.entries(data).map(([table, rows]) => {
    const cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
    return { name: table, rows: [cols.map(c => ({ v: c, s: 'header' })), ...rows.map(r => cols.map(c => cellOf(r[c])))], widths: cols.map(() => 18) };
  });
  const readme = `Kopia danych aplikacji RKDP Rozliczenia z ${stamp.replace('_', ' ')}.\n\n` +
    `dane.json  – pełne dane wszystkich tabel (do odtworzenia bazy)\n` +
    `dane.xlsx  – te same dane do przeglądania, jedna tabela na arkusz\n\n` +
    Object.entries(data).map(([t, r]) => `${t}: ${r.length} ${plural(r.length)}`).join('\n') +
    `\n\nPlik zawiera dane osobowe klientów – przechowuj go w bezpiecznym miejscu (zaszyfrowany dysk) i nie wysyłaj e-mailem.\n`;
  const blob = new Blob([zip([
    { name: 'CZYTAJ.txt', data: readme }, { name: 'dane.json', data: json }, { name: 'dane.xlsx', data: buildXlsx(sheets) },
  ])], { type: 'application/zip' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `rkdp-kopia-${stamp}.zip`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return Object.values(data).reduce((n, r) => n + r.length, 0);
}

// Kopia wszystkich wgranych plików (archiwum klienta, załączniki rozliczeń i rozmów, pliki od klientów, załączniki zadań):
// ZIP z folderami Klienci/<klient>/…; plik CZYTAJ.txt zawiera spis i ewentualne błędy pobierania.
const safe = s => String(s || 'bez-nazwy').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120) || 'bez-nazwy';
export async function downloadFilesBackup(onProgress = () => {}) {
  const soft = p => p.then(r => r.data || [], () => []);
  const [clients, cf, pf, tf, tickets, m2c] = await Promise.all([
    fetchAll(() => sb.from('clients').select('id,name')),
    soft(sb.from('client_files').select('client_id,category,name,path,created_at').limit(20000)),
    soft(sb.from('period_files').select('client_id,period,name,path,created_at').limit(20000)),
    soft(sb.from('rkdp_ticket_files').select('ticket_id,name,path,created_at').limit(20000)),
    soft(sb.from('rkdp_tickets').select('id,no,module,client_id,m2_client_id,title').limit(20000)),
    soft(sb.from('m2_clients').select('id,name').limit(20000)),
  ]);
  const cn = new Map(clients.map(c => [c.id, c.name])), mn = new Map(m2c.map(c => [c.id, c.name])), tk = new Map(tickets.map(t => [t.id, t]));
  const jobs = [
    ...cf.map(f => ({ bucket: 'klienci', path: f.path, out: `Klienci/${safe(cn.get(f.client_id))}/Archiwum/${safe(f.category)}/${safe(f.name)}` })),
    ...pf.map(f => ({ bucket: 'rozliczenia', path: f.path, out: `Klienci/${safe(cn.get(f.client_id))}/Rozliczenia/${String(f.period).slice(0, 7)}/${safe(f.name)}` })),
    ...tf.map(f => { const t = tk.get(f.ticket_id) || {}; const who = t.module === 'm2' ? `M2 TAX/${safe(mn.get(t.m2_client_id) || 'bez klienta')}` : `Klienci/${safe(cn.get(t.client_id) || 'Zadania wewnętrzne')}`;
      return { bucket: 'zgloszenia', path: f.path, out: `${who}/Zadania/#${t.no || '?'} ${safe(t.title).slice(0, 60)}/${safe(f.name)}` }; }),
  ];
  const files = [], errs = [], used = new Set();
  for (const [i, j] of jobs.entries()) {
    onProgress(`${i + 1}/${jobs.length}`);
    const { data, error } = await sb.storage.from(j.bucket).download(j.path);
    if (error || !data) { errs.push(`${j.out} – ${error?.message || 'brak pliku'}`); continue; }
    let name = j.out, k = 2; while (used.has(name)) name = j.out.replace(/(\.[^./]+)?$/, m => ` (${k++})${m}`); used.add(name);
    files.push({ name, data: new Uint8Array(await data.arrayBuffer()) });
  }
  const stamp = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Warsaw' }).replace(' ', '_').replace(/:/g, '-').slice(0, 16);
  const readme = `Kopia plików aplikacji RKDP z ${stamp.replace('_', ' ')}.\nPlików: ${files.length}` + (errs.length ? `\n\nNie udało się pobrać (${errs.length}):\n${errs.join('\n')}` : '') +
    `\n\nPliki zawierają dane klientów – przechowuj kopię na zaszyfrowanym dysku i nie wysyłaj e-mailem.\n`;
  const blob = new Blob([zip([{ name: 'CZYTAJ.txt', data: readme }, ...files])], { type: 'application/zip' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `rkdp-pliki-${stamp}.zip`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return { n: files.length, errors: errs.length };
}
