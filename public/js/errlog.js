// Dziennik błędów i zawieszeń z przeglądarki (tabela client_errors, wgląd: administrator – #/bledy).
// Zapisuje: błędy JS, odrzucone obietnice, zapytania do bazy, które trwały za długo albo przerwano po czasie,
// i chwile, gdy strona „stała” (zablokowany wątek). Bez treści danych – tylko nazwa tabeli/funkcji, trasa i czas.
// Wysyłka zwykłym fetch (nie przez klienta Supabase), żeby dziennik działał także wtedy, gdy klient się zawiesi.
const cfg = window.RKDP_CONFIG || {};
const build = document.querySelector('meta[name="app-build"]')?.content || 'src';
const queue = [];
const seen = new Set();
let sent = 0, timer = null;
const MAX = 30;

function token() {
  try {
    const k = Object.keys(localStorage).find(x => /^sb-.+-auth-token$/.test(x));
    const v = k && JSON.parse(localStorage.getItem(k) || 'null');
    return v?.access_token || null;
  } catch { return null; }
}
// adres zapytania bez wartości filtrów: /rest/v1/clients, /functions/v1/podpis, rpc/…
export const shortUrl = u => {
  try { const x = new URL(u, location.href); return x.pathname.replace(/^\/(rest|functions|storage|auth)\/v1\//, '$1:').slice(0, 120); } catch { return String(u).slice(0, 120); }
};
const route = () => location.hash.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id').slice(0, 200);

export function logIssue(kind, message, detail = '', ms = null) {
  if (!cfg.supabaseUrl || sent + queue.length >= MAX) return;
  const msg = String(message || '').slice(0, 1000);
  const key = kind + '|' + msg.slice(0, 200);
  if (seen.has(key)) return;
  seen.add(key);
  queue.push({ kind, message: msg, detail: String(detail || '').slice(0, 4000) || null, route: route(), build, ua: navigator.userAgent.slice(0, 300), ms: ms == null ? null : Math.round(ms) });
  clearTimeout(timer); timer = setTimeout(flush, 4000);
}
async function flush() {
  const t = token();
  if (!t || !queue.length) return;
  const rows = queue.splice(0, queue.length);
  sent += rows.length;
  try {
    await fetch(`${cfg.supabaseUrl}/rest/v1/client_errors`, { method: 'POST', keepalive: true,
      headers: { apikey: cfg.supabaseAnonKey, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(rows) });
  } catch { /* brak sieci – trudno */ }
}

let started = false;
export function initErrLog() {
  if (started) return; started = true;
  const ignore = m => /ResizeObserver loop|Script error\.?$|extension:\/\/|AbortError|The user aborted|cancelled|NotAllowedError/i.test(m || '');
  window.addEventListener('error', e => {
    const m = e.message || String(e.error || '');
    if (!ignore(m)) logIssue('error', m, `${e.filename ? shortUrl(e.filename) : ''}:${e.lineno || ''}:${e.colno || ''}\n${e.error?.stack || ''}`.slice(0, 4000));
  });
  window.addEventListener('unhandledrejection', e => {
    const r = e.reason; const m = r?.message || String(r || '');
    if (!ignore(m)) logIssue('promise', m, r?.stack || '');
  });
  // „zawieszenie”: zegar co 1 s – jeśli przy widocznej stronie przerwa > 4 s, wątek był zablokowany
  let last = performance.now(), hiddenAt = document.hidden ? last : 0;
  document.addEventListener('visibilitychange', () => { hiddenAt = document.hidden ? performance.now() : 0; last = performance.now(); });
  setInterval(() => {
    const now = performance.now(), gap = now - last; last = now;
    if (!document.hidden && !hiddenAt && gap > 5000) logIssue('freeze', `Strona nie reagowała ${Math.round(gap / 1000)} s`, '', gap);
  }, 1000);
  try {
    new PerformanceObserver(l => l.getEntries().forEach(e => { if (e.duration > 3000) logIssue('freeze', `Długie zadanie ${Math.round(e.duration / 1000)} s`, '', e.duration); })).observe({ type: 'longtask', buffered: false });
  } catch { /* przeglądarka bez longtask (Safari) */ }
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
}
