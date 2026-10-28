// Motyw jasny / ciemny – zapamiętywany na urządzeniu (pierwsze ustawienie robi /theme.js przed narysowaniem strony).
export const getTheme = () => document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
const listeners = new Set();
export const onThemeChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
export function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('rkdp_theme', t); } catch { /* tryb prywatny */ }
  listeners.forEach(f => f(t));
}
export const toggleTheme = () => setTheme(getTheme() === 'dark' ? 'light' : 'dark');
export const ICON_MOON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
export const ICON_SUN = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
