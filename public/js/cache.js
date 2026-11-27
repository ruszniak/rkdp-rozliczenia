// Pamięć podręczna odczytów z Supabase (stale-while-revalidate) – wpinana jako fetch klienta Supabase.
// ---------- pamięć podręczna odczytów (stale-while-revalidate) ----------
// Listy i pulpity przy ponownym wejściu pokazują się od razu z pamięci, a dane pobierają się w tle.
// Jeśli w bazie coś się zmieniło, widok odświeża się sam. Każdy zapis (insert/update/delete/rpc) czyści pamięć.
// Widoki edycji (karta klienta, umowy, protokoły itp.) zawsze czytają prosto z bazy.
const CACHE_MAX_AGE = 10 * 60 * 1000;
const READ_RPC = new Set(['auth_touch', 'auth_state', 'login_mode', 'terms_status']);
const cache = new Map(); // key -> { t, status, headers, body }
// tryb offline: ostatnie odczyty z bazy trzymane TYLKO w pamięci otwartej aplikacji (nic nie trafia do pamięci telefonu);
// gdy zniknie zasięg, listy i karty już raz otwarte pokazują się z tej kopii – do odczytu
const lastGood = new Map(); // key -> entry (bez czyszczenia przy zapisach)
const LAST_MAX = 400;
const keep = (key, e) => { lastGood.delete(key); lastGood.set(key, e); if (lastGood.size > LAST_MAX) lastGood.delete(lastGood.keys().next().value); };
let offlineHook = null;
export const setOfflineHandler = fn => { offlineHook = fn; };
const isNetErr = e => e instanceof TypeError || (typeof navigator !== 'undefined' && navigator.onLine === false);
const inflight = new Map();
let onStale = null;
let gen = 0; // rośnie przy każdym zapisie – odpowiedź pobrana sprzed zapisu nie trafi do pamięci
export const setStaleHandler = fn => { onStale = fn; };
export const invalidateCache = () => { cache.clear(); gen++; };
export const clearOfflineCopy = () => lastGood.clear();
// trasy, na których wolno pokazać dane z pamięci (listy i pulpity – bez formularzy edycji)
export function cacheableRoute(hash = location.hash) {
  const [path] = hash.replace(/^#\/?/, '').split('?');
  const p = path.split('/').filter(Boolean);
  if (p.length === 0) return true;
  if (p.length === 1) return ['pulpit', 'rozliczenia', 'klienci', 'zgloszenia', 'dokumenty', 'doradztwo'].includes(p[0]);
  return p.length === 2 && p[0] === 'doradztwo' && ['sprawy', 'klienci', 'zlecenia', 'zgloszenia', 'dokumenty'].includes(p[1]);
}
// trasy, które po wykryciu zmian w bazie można przerysować bez ryzyka utraty wpisywanych danych
export function autoRefreshRoute(hash = location.hash) {
  const [path] = hash.replace(/^#\/?/, '').split('?');
  const p = path.split('/').filter(Boolean);
  return cacheableRoute(hash) && !p.includes('dokumenty');
}
// każde zapytanie ma limit czasu – zawieszone połączenie nie blokuje ekranu w nieskończoność („Wczytywanie…”);
// długie i przerwane zapytania trafiają do dziennika błędów (bez treści, tylko nazwa tabeli/funkcji i czas)
const LIMIT = { rest: 30000, auth: 30000, functions: 120000, storage: 180000 };
const rawFetch = (...a) => (globalThis.__cacheBaseFetch || fetch)(...a);
async function baseFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : input.url;
  const kind = (url.match(/\/(rest|auth|functions|storage)\/v1\//) || [])[1];
  if (!kind || typeof AbortController === 'undefined') return rawFetch(input, init);
  const ctl = new AbortController();
  const outer = init.signal;
  if (outer) { if (outer.aborted) ctl.abort(outer.reason); else outer.addEventListener('abort', () => ctl.abort(outer.reason), { once: true }); }
  let timedOut = false;
  const t0 = performance.now();
  const timer = setTimeout(() => { timedOut = true; ctl.abort(new DOMException('Przekroczono czas oczekiwania na odpowiedź serwera', 'TimeoutError')); }, LIMIT[kind]);
  try {
    const res = await rawFetch(input, { ...init, signal: ctl.signal });
    const ms = performance.now() - t0;
    if (ms > 10000) import('./errlog.js').then(m => m.logIssue('slow', `Wolne zapytanie: ${m.shortUrl(url)}`, '', ms)).catch(() => {});
    return res;
  } catch (e) {
    if (timedOut) {
      import('./errlog.js').then(m => m.logIssue('timeout', `Brak odpowiedzi po ${LIMIT[kind] / 1000} s: ${m.shortUrl(url)}`, '', LIMIT[kind])).catch(() => {});
      throw new Error('Serwer nie odpowiada – sprawdź połączenie i spróbuj ponownie.');
    }
    throw e;
  } finally { clearTimeout(timer); }
}
function hdr(init, name) {
  const hs = init?.headers; if (!hs) return '';
  if (hs instanceof Headers) return hs.get(name) || '';
  const k = Object.keys(hs).find(x => x.toLowerCase() === name.toLowerCase());
  return k ? hs[k] : '';
}
async function grab(url, init) {
  const r = await baseFetch(url, init);
  const body = await r.text();
  return { t: Date.now(), status: r.status, statusText: r.statusText, headers: [...r.headers.entries()], body };
}
const toResponse = e => new Response(e.status === 204 ? null : e.body, { status: e.status, statusText: e.statusText, headers: e.headers });
let staleTimer = null;
// funkcje serwerowe (Edge Functions) uruchamiane zawsze w regionie bazy – Irlandia (UE), a nie w regionie najbliższym użytkownikowi
export const FN_REGION = 'eu-west-1';
const pinRegion = u => u.includes('/functions/v1/') && !u.includes('forceFunctionRegion=') ? u + (u.includes('?') ? '&' : '?') + 'forceFunctionRegion=' + FN_REGION : u;
export async function cachedFetch(input, init = {}) {
  if (typeof input === 'string') input = pinRegion(input);
  else if (input instanceof URL) input = pinRegion(input.href);
  const url = typeof input === 'string' ? input : input.url;
  const method = (init.method || (typeof input === 'object' && input.method) || 'GET').toUpperCase();
  const isRest = url.includes('/rest/v1/'), isStorage = url.includes('/storage/v1/'), isFn = url.includes('/functions/v1/');
  if (method !== 'GET' && method !== 'HEAD') {
    const rpc = (url.match(/\/rest\/v1\/rpc\/([a-z0-9_]+)/i) || [])[1];
    const write = (isRest && !READ_RPC.has(rpc)) || isStorage || isFn || url.includes('/auth/v1/logout');
    if (write) invalidateCache();
    let res;
    try { res = await baseFetch(input, init); } catch (e) {
      if (isNetErr(e) && isRest && !url.includes('/rpc/auth_touch')) { offlineHook?.(true); throw new Error('Brak internetu – zmiana nie została zapisana. Spróbuj ponownie, gdy wróci zasięg.'); }
      throw e;
    }
    if (write) invalidateCache();
    return res;
  }
  const key = [method, url, hdr(init, 'Range'), hdr(init, 'Prefer'), hdr(init, 'Accept'), hdr(init, 'Authorization').slice(-24)].join('|');
  if (!isRest) return baseFetch(input, init);
  if (!cacheableRoute()) {
    try {
      const e = await grab(url, init);
      if (e.status >= 200 && e.status < 300) { keep(key, e); offlineHook?.(false); }
      return toResponse(e);
    } catch (err) {
      const old = isNetErr(err) && lastGood.get(key);
      if (old) { offlineHook?.(true, old.t); return toResponse(old); }
      throw err;
    }
  }
  const hit = cache.get(key);
  const load = () => {
    if (inflight.has(key)) return inflight.get(key);
    const g = gen;
    const p = grab(url, init).then(e => { if (e.status >= 200 && e.status < 300) { keep(key, e); offlineHook?.(false); if (g === gen) cache.set(key, e); } return e; }).finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  };
  if (hit && Date.now() - hit.t < CACHE_MAX_AGE) {
    // od razu z pamięci, w tle sprawdzenie, czy coś się zmieniło
    load().then(e => {
      if (e.body !== hit.body && onStale) { clearTimeout(staleTimer); staleTimer = setTimeout(() => onStale(), 120); }
    }).catch(() => { /* brak sieci – zostaje wersja z pamięci */ });
    return toResponse(hit);
  }
  try { return toResponse(await load()); } catch (err) {
    const old = isNetErr(err) && lastGood.get(key);
    if (old) { offlineHook?.(true, old.t); return toResponse(old); }
    throw err;
  }
}

