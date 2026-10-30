// Pamięć podręczna odczytów z Supabase (stale-while-revalidate) – wpinana jako fetch klienta Supabase.
// ---------- pamięć podręczna odczytów (stale-while-revalidate) ----------
// Listy i pulpity przy ponownym wejściu pokazują się od razu z pamięci, a dane pobierają się w tle.
// Jeśli w bazie coś się zmieniło, widok odświeża się sam. Każdy zapis (insert/update/delete/rpc) czyści pamięć.
// Widoki edycji (karta klienta, umowy, protokoły itp.) zawsze czytają prosto z bazy.
const CACHE_MAX_AGE = 10 * 60 * 1000;
const READ_RPC = new Set(['auth_touch', 'auth_state', 'login_mode', 'terms_status']);
const cache = new Map(); // key -> { t, status, headers, body }
const inflight = new Map();
let onStale = null;
let gen = 0; // rośnie przy każdym zapisie – odpowiedź pobrana sprzed zapisu nie trafi do pamięci
export const setStaleHandler = fn => { onStale = fn; };
export const invalidateCache = () => { cache.clear(); gen++; };
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
const baseFetch = (...a) => (globalThis.__cacheBaseFetch || fetch)(...a);
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
    const res = await baseFetch(input, init);
    if (write) invalidateCache();
    return res;
  }
  if (!isRest || !cacheableRoute()) return baseFetch(input, init);
  const key = [method, url, hdr(init, 'Range'), hdr(init, 'Prefer'), hdr(init, 'Accept'), hdr(init, 'Authorization').slice(-24)].join('|');
  const hit = cache.get(key);
  const load = () => {
    if (inflight.has(key)) return inflight.get(key);
    const g = gen;
    const p = grab(url, init).then(e => { if (e.status >= 200 && e.status < 300 && g === gen) cache.set(key, e); return e; }).finally(() => inflight.delete(key));
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
  return toResponse(await load());
}

