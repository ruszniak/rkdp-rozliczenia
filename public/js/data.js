// Wspólne pobieranie danych (stronicowanie po 1000 wierszy) i drobne pomocnicze funkcje dat.
import { sb } from './store.js';

export async function fetchAll(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}
// zapytanie do tabeli, która mogła jeszcze nie zostać utworzona w bazie – wtedy pusta lista zamiast błędu
export async function fetchSoft(build) {
  try { return await fetchAll(build); } catch (e) { console.warn(e); return []; }
}

export const CLIENT_COLS = 'id,name,status,legal_form,bookkeeping,nip,krs,email,phone,contact_person,pit_form,pit_advances,zus_type,has_employees,cit_type,cit_advances,vat_status,vat_ue,monthly_fee,accountant_id,hr_id';
export const loadClients = () => fetchAll(() => sb.from('clients').select(CLIENT_COLS).order('name'));

export const todayIso = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' });
export const isoOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return isoOf(d); };
export const fmtShort = s => s ? `${s.slice(8, 10)}.${s.slice(5, 7)}` : '';
export const fmtFull = s => s ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}` : '';
const WD = ['nd', 'pn', 'wt', 'śr', 'cz', 'pt', 'sb'];
export const weekday = s => WD[new Date(s + 'T12:00:00').getDay()];
export const fmtMin = m => { const hh = Math.floor(m / 60), mm = m % 60; return hh ? `${hh} h${mm ? ' ' + mm + ' min' : ''}` : `${mm} min`; };
export const plMoney = v => (Math.round((+v || 0) * 100) / 100).toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' zł';

// ustawienia osobiste zapisywane w bazie (wspólne dla wszystkich urządzeń); w razie braku tabeli – lokalnie
let prefsCache = null;
export async function loadMemberPrefs() {
  if (prefsCache) return prefsCache;
  let local = {};
  try { local = JSON.parse(localStorage.getItem('rkdp_member_prefs') || '{}'); } catch { /* */ }
  try {
    const { data, error } = await sb.from('member_prefs').select('prefs').maybeSingle();
    if (error) throw error;
    prefsCache = { ...local, ...(data?.prefs || {}) };
  } catch { prefsCache = local; }
  return prefsCache;
}
export async function saveMemberPrefs(patch, memberId) {
  prefsCache = { ...(prefsCache || {}), ...patch };
  try { localStorage.setItem('rkdp_member_prefs', JSON.stringify(prefsCache)); } catch { /* */ }
  try { await sb.from('member_prefs').upsert({ member_id: memberId, prefs: prefsCache, updated_at: new Date().toISOString() }); } catch { /* tylko lokalnie */ }
  return prefsCache;
}

// Historia: jaki odsetek aktywnych klientów był rozliczony w kolejnych miesiącach (księgowość / kadry)
// periods: ['YYYY-MM', …] od najstarszego; zwraca { ksiegowosc: [..%], kadry: [..%] } (null = brak listy)
export async function settledHistory(periods, taskTypes, filterClient = () => true) {
  const from = periods[0] + '-01', to = periods.at(-1) + '-01';
  const rows = await fetchSoft(() => sb.from('checklist_entries').select('client_id,period,task_code,status').gte('period', from).lte('period', to));
  const area = new Map(taskTypes.map(t => [t.code, t.area]));
  const counts = new Set(taskTypes.filter(t => t.counts_to_settled !== false).map(t => t.code));
  const by = new Map(); // period|area|client -> [statuses]
  for (const r of rows) {
    if (!counts.has(r.task_code) || !filterClient(r.client_id)) continue;
    const k = `${r.period.slice(0, 7)}|${area.get(r.task_code)}|${r.client_id}`;
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(r.status);
  }
  const out = { ksiegowosc: [], kadry: [] };
  for (const a of ['ksiegowosc', 'kadry']) {
    for (const p of periods) {
      let n = 0, ok = 0;
      for (const [k, sts] of by) if (k.startsWith(`${p}|${a}|`)) { n++; if (sts.every(s => s === 'done' || s === 'na')) ok++; }
      out[a].push(n ? (ok * 100) / n : null);
    }
  }
  return out;
}
export const lastPeriods = (period, n) => { const [y, m] = period.split('-').map(Number); return Array.from({ length: n }, (_, i) => { const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1)); return d.toISOString().slice(0, 7); }); };
