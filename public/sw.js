// Service worker aplikacji RKDP: powiadomienia push, instalacja jako aplikacja (PWA) i ekran „brak internetu”.
// Danych z bazy NIE zapisujemy w pamięci urządzenia – w trybie offline pokazujemy tylko komunikat.
const OFFLINE = '/offline.html';
const CACHE = 'rkdp-shell-v1';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll([OFFLINE, '/icon-192.png', '/logo-rkdp.png'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// tylko nawigacja (otwarcie strony): gdy brak sieci – ekran offline; reszta idzie zwykłą drogą przez przeglądarkę
self.addEventListener('fetch', e => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(() => caches.match(OFFLINE)));
});

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'RKDP', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'RKDP', {
    body: d.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: d.tag || undefined,
    renotify: !!d.tag,
    data: { url: d.url || '/' },
    lang: 'pl',
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '/', self.location.origin).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const same = wins.find(w => new URL(w.url).origin === self.location.origin);
    if (same) { await same.focus(); try { await same.navigate(url); } catch { same.postMessage({ type: 'open', url }); } return; }
    await self.clients.openWindow(url);
  })());
});
