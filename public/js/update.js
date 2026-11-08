// Automatyczne aktualizacje: otwarta aplikacja (także zainstalowana na telefonie) sprawdza, czy jest nowa wersja,
// i sama się przeładowuje – gdy wracasz do niej z tła albo gdy nic w niej nie robisz. Po przeładowaniu pokazuje „Zaktualizowano app.R”.
import { toast } from './ui.js';

const current = document.querySelector('meta[name="app-build"]')?.content || null;   // brak w wersji ze źródeł (testy) – wtedy nic nie robimy
let pending = null, banner = null, lastCheck = 0;

async function latest() {
  try {
    const r = await fetch('/version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return null;
    return (await r.json()).build || null;
  } catch { return null; }
}
// czy można przeładować bez ryzyka utraty tego, co ktoś właśnie wpisuje
function busy() {
  if (document.querySelector('.modal-back, dialog[open], body.panel-open')) return true;
  const a = document.activeElement;
  return !!(a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && !['button', 'checkbox', 'radio'].includes(a.type)) || a.isContentEditable));
}
function reloadNow() {
  try { sessionStorage.setItem('rkdp_updated', '1'); } catch { /* */ }
  location.reload();
}
function showBanner() {
  if (banner) return;
  banner = document.createElement('div');
  banner.className = 'upd-banner';
  banner.innerHTML = '<span>Jest nowa wersja app.R</span>';
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = 'Odśwież';
  b.onclick = reloadNow;
  banner.append(b);
  document.body.append(banner);
}
async function check() {
  if (!current || Date.now() - lastCheck < 30_000) return;
  lastCheck = Date.now();
  const v = await latest();
  if (!v || v === current) return;
  pending = v;
  // aplikacja w tle albo nic nie jest otwarte – przeładuj od razu; inaczej pasek z przyciskiem (i przeładowanie przy następnym powrocie)
  if (document.visibilityState === 'hidden' || !busy()) reloadNow();
  else showBanner();
}

export function initUpdates() {
  try { if (sessionStorage.getItem('rkdp_updated')) { sessionStorage.removeItem('rkdp_updated'); setTimeout(() => toast('Zaktualizowano app.R do najnowszej wersji'), 800); } } catch { /* */ }
  if (!current) return;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { if (pending) reloadNow(); else check(); }
    else if (pending) reloadNow();
  });
  window.addEventListener('focus', check);
  window.addEventListener('online', check);
  setInterval(check, 5 * 60_000);
  // ktoś skończył pisać / zamknął okno – przeładuj wtedy, gdy czeka nowa wersja
  setInterval(() => { if (pending && !busy()) reloadNow(); }, 20_000);
  setTimeout(check, 10_000);
}
