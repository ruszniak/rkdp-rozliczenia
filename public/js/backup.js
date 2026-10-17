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
];

const plural = n => n === 1 ? 'wiersz' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'wiersze' : 'wierszy';
const cellOf = v => v === null || v === undefined ? '' : typeof v === 'boolean' ? (v ? 'TAK' : 'NIE')
  : typeof v === 'object' ? JSON.stringify(v) : v;

export async function downloadBackup(onProgress = () => {}) {
  const data = {};
  for (const [i, [table, keys]] of BACKUP_TABLES.entries()) {
    onProgress(`${i + 1}/${BACKUP_TABLES.length}: ${table}`);
    data[table] = await fetchAll(() => keys.reduce((q, k) => q.order(k), sb.from(table).select('*')));
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
