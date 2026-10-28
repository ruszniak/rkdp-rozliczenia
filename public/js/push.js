// Instalacja jako aplikacja (PWA) i powiadomienia push na tym urządzeniu.
import { sb } from './store.js';

// klucz publiczny VAPID (jawny) – para do klucza prywatnego w sekretach funkcji „push”
export const VAPID_PUBLIC = 'BPfiCsdPngPhEqu7gFew-9p2Z9suTlIZZYrs6W3UdCtHgo9REdafPd5m5MPjv41sVapNAJNPmorYm1olaseBxns';
export const DEFAULT_PREFS = { zgloszenia: true, komentarze: true, terminy: true };

const ua = navigator.userAgent || '';
export const isIOS = () => /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

// ---------- service worker ----------
let regPromise = null;
export function registerSW() {
  if (!('serviceWorker' in navigator)) return Promise.resolve(null);
  if (!regPromise) regPromise = navigator.serviceWorker.register('/sw.js').catch(err => { console.warn('SW', err); return null; });
  return regPromise;
}
// kliknięcie powiadomienia, gdy aplikacja jest już otwarta
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', e => {
  if (e.data?.type === 'open' && e.data.url) { const u = new URL(e.data.url); location.hash = u.hash || '#/'; }
});

// ---------- instalacja ----------
let installEvt = null;
const installListeners = new Set();
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; installListeners.forEach(f => f()); });
window.addEventListener('appinstalled', () => { installEvt = null; installListeners.forEach(f => f()); });
export const canInstall = () => !!installEvt;
export const onInstallChange = fn => { installListeners.add(fn); return () => installListeners.delete(fn); };
export async function promptInstall() {
  if (!installEvt) return false;
  installEvt.prompt();
  const { outcome } = await installEvt.userChoice;
  installEvt = null; installListeners.forEach(f => f());
  return outcome === 'accepted';
}

// ---------- powiadomienia ----------
const keyBytes = b64 => { const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - b64.length % 4) % 4)); return Uint8Array.from(s, c => c.charCodeAt(0)); };
export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await registerSW();
  return reg ? reg.pushManager.getSubscription() : null;
}
export async function enablePush(prefs = DEFAULT_PREFS) {
  if (!pushSupported()) throw new Error('Ta przeglądarka nie obsługuje powiadomień.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(perm === 'denied' ? 'Powiadomienia są zablokowane w ustawieniach przeglądarki – odblokuj je dla tej strony i spróbuj ponownie.' : 'Nie udzielono zgody na powiadomienia.');
  const reg = await registerSW();
  if (!reg) throw new Error('Nie udało się uruchomić obsługi powiadomień.');
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC) });
  const j = sub.toJSON();
  const { error } = await sb.rpc('push_subscribe', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_ua: ua.slice(0, 300), p_prefs: prefs });
  if (error) throw error;
  return sub;
}
export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await sb.rpc('push_unsubscribe', { p_endpoint: sub.endpoint });
  await sub.unsubscribe();
}
export async function savePrefs(prefs) {
  const sub = await currentSubscription();
  if (!sub) return;
  const { error } = await sb.rpc('push_set_prefs', { p_endpoint: sub.endpoint, p_prefs: prefs });
  if (error) throw error;
}
export async function loadPrefs() {
  const sub = await currentSubscription();
  if (!sub) return null;
  const { data } = await sb.from('push_subscriptions').select('prefs').eq('endpoint', sub.endpoint).maybeSingle();
  return data?.prefs || null;
}
export async function sendTest() {
  const { data, error } = await sb.functions.invoke('push', { body: { event: 'test' } });
  if (error) throw error;
  return data?.sent || 0;
}
