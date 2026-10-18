// Sesja: zapamiętane przeglądarki i wylogowanie po bezczynności
import { sb } from './store.js';

const DEV_KEY = 'rkdp_devices', ACT_KEY = 'rkdp_last_activity', REASON_KEY = 'rkdp_logout_reason';
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* brak pamięci przeglądarki */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* */ } },
};
const devices = () => { try { return JSON.parse(ls.get(DEV_KEY) || '{}'); } catch { return {}; } };

export const deviceToken = email => devices()[email] || null;
export function saveDeviceToken(email, token) { const d = devices(); d[email] = token; ls.set(DEV_KEY, JSON.stringify(d)); }
export function forgetDeviceToken(email) { const d = devices(); delete d[email]; ls.set(DEV_KEY, JSON.stringify(d)); }

export function deviceLabel() {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Przeglądarka';
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
  return [browser, os].filter(Boolean).join(' · ');
}

export const markActive = () => ls.set(ACT_KEY, String(Date.now()));

export function takeLogoutReason() {
  let r = null; try { r = sessionStorage.getItem(REASON_KEY); sessionStorage.removeItem(REASON_KEY); } catch { /* */ }
  return r || '';
}

export async function logout(reason = '', { forgetBrowser = false, email = '' } = {}) {
  try { await sb.rpc('auth_logout', { p_device_token: forgetBrowser ? deviceToken(email) : null }); } catch { /* */ }
  if (forgetBrowser && email) forgetDeviceToken(email);
  if (reason) { try { sessionStorage.setItem(REASON_KEY, reason); } catch { /* */ } }
  ls.del(ACT_KEY);
  await sb.auth.signOut({ scope: 'local' });
  location.reload();
}

const fmtIdle = min => min % 60 ? `${min} min` : `${min / 60} h`;

// Śledzi aktywność (wspólnie dla wszystkich kart), podtrzymuje sesję na serwerze, wylogowuje po bezczynności
export function startIdleWatch(idleMinutes) {
  const limit = Math.max(5, Number(idleMinutes) || 240) * 60000;
  const last = () => Number(ls.get(ACT_KEY)) || Date.now();
  if (Date.now() - last() > limit) { logout(`Wylogowano po ${fmtIdle(limit / 60000)} bezczynności.`); return; }
  let lastWrite = 0, lastTouch = Date.now();
  const mark = () => {
    const now = Date.now();
    if (now - lastWrite > 15000) { lastWrite = now; ls.set(ACT_KEY, String(now)); }
  };
  ls.set(ACT_KEY, String(Date.now()));
  ['pointerdown', 'keydown', 'scroll', 'mousemove', 'touchstart', 'focus'].forEach(ev =>
    window.addEventListener(ev, mark, { passive: true, capture: true }));
  setInterval(async () => {
    const now = Date.now();
    if (now - last() > limit) return logout(`Wylogowano po ${fmtIdle(limit / 60000)} bezczynności.`);
    // przy aktywności co 5 minut przedłużamy sesję w bazie
    if (now - last() < 5 * 60000 && now - lastTouch > 5 * 60000) {
      lastTouch = now;
      const { data, error } = await sb.rpc('auth_touch');
      if (!error && data === false) logout('Sesja wygasła – zaloguj się ponownie.');
    }
  }, 30000);
}
