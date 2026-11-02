// Face ID (iPhone) / odcisk palca lub twarz (Android) w aplikacji zainstalowanej na telefonie.
// Passkey (WebAuthn): klucz prywatny zostaje w telefonie, serwer (funkcja „passkey”) sprawdza podpis.
//  • po zalogowaniu w aplikacji na telefonie – włączenie Face ID na tym telefonie,
//  • przy każdym uruchomieniu aplikacji (i po powrocie po ponad minucie w tle) – ekran blokady, odblokowanie twarzą,
//  • na ekranie logowania – „Zaloguj Face ID” zamiast hasła i kodu z e-maila.
import { h } from './ui.js';
import { sb } from './store.js';
import { isIOS, isStandalone } from './push.js';
import { deviceLabel } from './session.js';

const KEY = 'rkdp_faceid', UNLOCK_KEY = 'rkdp_unlocked_at', SKIP_KEY = 'rkdp_faceid_skip';
const RELOCK_MS = 5 * 60 * 1000;
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* */ } },
};
const ss = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch { /* */ } },
};

export const bioName = () => isIOS() ? 'Face ID' : 'odcisk palca / twarz';
export const isPhoneApp = () => isStandalone() && (isIOS() || /Android/i.test(navigator.userAgent));
export async function faceIdAvailable() {
  try { return !!window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); } catch { return false; }
}
// klucz zapisany na tym telefonie: { email, credential_id }
export const localKey = () => { try { return JSON.parse(ls.get(KEY) || 'null'); } catch { return null; } };
const saveLocal = (email, credential_id) => ls.set(KEY, JSON.stringify({ email, credential_id }));
export const forgetLocal = () => ls.del(KEY);
// odblokowano przed chwilą (np. po zalogowaniu i przeładowaniu strony) – bez ponownego pytania
export const markUnlocked = () => ss.set(UNLOCK_KEY, String(Date.now()));
const recentlyUnlocked = () => Date.now() - (Number(ss.get(UNLOCK_KEY)) || 0) < 30000;

// ---------- konwersja JSON ⇄ WebAuthn ----------
const b2u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const u2b = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0)).buffer;
const credList = l => (l || []).map(c => ({ ...c, id: u2b(c.id) }));

async function call(action, body = {}) {
  const { data, error } = await sb.functions.invoke('passkey', { body: { action, ...body } });
  if (error) {
    let msg = error.message;
    try { const j = await error.context?.json?.(); if (j?.error) msg = j.error; } catch { /* */ }
    throw Object.assign(new Error(msg), { none: /Brak Face ID/.test(msg) });
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

function plBioError(e) {
  const n = e?.name || '';
  if (n === 'NotAllowedError' || n === 'AbortError') return 'Anulowano albo nie rozpoznano twarzy. Spróbuj ponownie.';
  if (n === 'InvalidStateError') return 'Face ID jest już włączone na tym telefonie.';
  if (n === 'SecurityError') return 'Face ID działa tylko w aplikacji pod adresem rozliczenia.rkdp.pl.';
  return e?.message || 'Nie udało się.';
}

async function getAssertion(options) {
  const pk = { ...options, challenge: u2b(options.challenge), allowCredentials: credList(options.allowCredentials) };
  const c = await navigator.credentials.get({ publicKey: pk });
  return {
    id: c.id, rawId: b2u(c.rawId), type: c.type, authenticatorAttachment: c.authenticatorAttachment || undefined,
    clientExtensionResults: c.getClientExtensionResults?.() || {},
    response: {
      clientDataJSON: b2u(c.response.clientDataJSON), authenticatorData: b2u(c.response.authenticatorData),
      signature: b2u(c.response.signature), userHandle: c.response.userHandle ? b2u(c.response.userHandle) : undefined,
    },
  };
}

// ---------- włączenie na tym telefonie ----------
export async function enableFaceId(email) {
  const { options, challenge_id } = await call('register_options');
  const pk = { ...options, challenge: u2b(options.challenge), user: { ...options.user, id: u2b(options.user.id) }, excludeCredentials: credList(options.excludeCredentials) };
  let c;
  try { c = await navigator.credentials.create({ publicKey: pk }); }
  catch (e) {
    // ten telefon ma już klucz dla tego konta (np. po ponownej instalacji aplikacji) – wystarczy go zapamiętać
    if (e?.name === 'InvalidStateError') { saveLocal(email, ''); return true; }
    throw e;
  }
  const response = {
    id: c.id, rawId: b2u(c.rawId), type: c.type, authenticatorAttachment: c.authenticatorAttachment || undefined,
    clientExtensionResults: c.getClientExtensionResults?.() || {},
    response: { clientDataJSON: b2u(c.response.clientDataJSON), attestationObject: b2u(c.response.attestationObject), transports: c.response.getTransports?.() || [] },
  };
  const r = await call('register_verify', { challenge_id, response, label: deviceLabel() });
  saveLocal(email, r.credential_id);
  markUnlocked();
  return true;
}

// ---------- logowanie twarzą (ekran logowania) ----------
export async function loginWithFaceId() {
  const lk = localKey();
  const { options, challenge_id } = await call('login_options', { credential_id: lk?.credential_id || undefined });
  const response = await getAssertion(options);
  const r = await call('login_verify', { challenge_id, response });
  const { error } = await sb.auth.verifyOtp({ token_hash: r.token_hash, type: 'magiclink' });
  if (error) throw error;
  const { error: e2 } = await sb.rpc('auth_passkey_step', { p_grant: r.grant, p_app: isPhoneApp() });
  if (e2) { await sb.auth.signOut({ scope: 'local' }); throw e2; }
  saveLocal(r.email, response.id);
  markUnlocked();
  return r.email;
}

// ---------- ekran blokady ----------
function screen({ title, text, primary, onPrimary, secondary, onSecondary, extra }) {
  const err = h('p', { class: 'err', role: 'alert' });
  const btn = h('button', { class: 'btn btn-primary fid-btn', type: 'button' }, primary);
  const el = h('div', { class: 'fid-lock', role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'fid-box' },
      h('img', { src: '/logo-rkdp.png', alt: 'RKDP', class: 'fid-logo' }),
      h('div', { class: 'fid-icon', 'aria-hidden': 'true' }, faceSvg()),
      h('h1', {}, title), h('p', { class: 'muted' }, text),
      btn, err,
      secondary ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: onSecondary }, secondary) : null,
      extra || null));
  // auto = próba bez stuknięcia (przy uruchomieniu) – gdy telefon jej nie pozwoli, nie pokazujemy błędu
  const run = async (auto = false) => {
    if (btn.disabled) return;
    btn.disabled = true; err.textContent = '';
    try { await onPrimary(); } catch (e) { if (!auto || !['NotAllowedError', 'AbortError'].includes(e?.name)) err.textContent = plBioError(e); }
    btn.disabled = false;
  };
  btn.addEventListener('click', () => run(false));
  return { el, btn, err, run };
}
function faceSvg() {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 48 48'); s.setAttribute('width', '56'); s.setAttribute('height', '56');
  s.innerHTML = '<g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15V10a4 4 0 0 1 4-4h5M33 6h5a4 4 0 0 1 4 4v5M42 33v5a4 4 0 0 1-4 4h-5M15 42h-5a4 4 0 0 1-4-4v-5"/><path d="M17 18v3M31 18v3M24 18v8h-2M18 32c3.5 3 8.5 3 12 0"/></g>';
  return s;
}

let lockEl = null;
// blokada: czeka na odblokowanie twarzą; „Zaloguj hasłem” = wylogowanie
export function lockApp(onLogout) {
  if (lockEl) return lockEl.promise;
  let done;
  const promise = new Promise(r => { done = r; });
  const unlock = async () => {
    const { options, challenge_id } = await call('unlock_options');
    const response = await getAssertion(options);
    await call('unlock_verify', { challenge_id, response });
    markUnlocked();
    lockEl.el.remove(); lockEl = null; document.documentElement.classList.remove('fid-locked');
    done(true);
  };
  const sc = screen({
    title: 'Aplikacja zablokowana', text: `Stuknij ekran, aby odblokować ${bioName()}.`,
    primary: isIOS() ? 'Odblokuj Face ID' : 'Odblokuj', onPrimary: async () => {
      try { await unlock(); } catch (e) {
        // klucz usunięty w profilu albo sesja wygasła – trzeba zalogować się od nowa
        if (e?.none) { forgetLocal(); onLogout('Face ID zostało wyłączone – zaloguj się hasłem i włącz je ponownie.'); return; }
        if (/Sesja wygas/.test(e?.message || '')) { onLogout('Sesja wygasła – zaloguj się ponownie.'); return; }
        throw e;
      }
    },
    secondary: 'Zaloguj się hasłem', onSecondary: () => onLogout(''),
  });
  lockEl = { ...sc, promise };
  document.documentElement.classList.add('fid-locked');
  document.body.append(sc.el);
  // od razu pokazujemy Face ID (gdy telefon pozwala bez stuknięcia); w razie odmowy czeka przycisk
  // stuknięcie w dowolnym miejscu ekranu (poza „Zaloguj się hasłem”) uruchamia Face ID
  sc.el.addEventListener('click', e => { if (!e.target.closest('button')) sc.run(false); });
  // próba bez stuknięcia: gdy aplikacja jest już na wierzchu, albo gdy na niego wróci
  // na iPhonie wywołanie bez stuknięcia pokazuje okno „Użyj klucza” (jedno stuknięcie i Face ID)
  const auto = () => { if (lockEl && document.visibilityState === 'visible') sc.run(true); };
  setTimeout(auto, 300);
  window.addEventListener('focus', auto, { once: true });
  window.addEventListener('pageshow', auto, { once: true });
  return promise;
}

// po zalogowaniu w aplikacji na telefonie: włączenie Face ID (wymagane; „Pomiń” dopiero po nieudanej próbie)
export function enrollScreen(email, onLogout) {
  return new Promise(resolve => {
    let failed = 0;
    const close = () => { sc.el.remove(); document.documentElement.classList.remove('fid-locked'); resolve(); };
    const skip = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', hidden: true, onclick: () => { ss.set(SKIP_KEY, '1'); close(); } }, 'Pomiń na razie');
    const sc = screen({
      title: `Włącz ${bioName()}`,
      text: `Aplikacja na telefonie jest chroniona ${isIOS() ? 'Face ID' : 'odciskiem palca lub twarzą'}: przy każdym uruchomieniu odblokujesz ją twarzą, a po wylogowaniu zalogujesz się bez hasła i kodu z e-maila. Twoja twarz nie jest nigdzie wysyłana – sprawdza ją telefon.`,
      primary: `Włącz ${bioName()}`, onPrimary: async () => {
        try { await enableFaceId(email); close(); }
        catch (e) { failed++; if (failed >= 1) skip.hidden = false; throw e; }
      },
      secondary: 'Wyloguj', onSecondary: () => onLogout(''),
      extra: skip,
    });
    document.documentElement.classList.add('fid-locked');
    document.body.append(sc.el);
  });
}

// uruchomienie aplikacji na telefonie (po potwierdzeniu sesji): blokada albo włączenie Face ID
export async function phoneGate(email, onLogout) {
  if (!isPhoneApp() || !(await faceIdAvailable())) return;
  const lk = localKey();
  if (lk && lk.email !== email) forgetLocal();
  if (localKey()) { if (!recentlyUnlocked()) await lockApp(onLogout); }
  else if (ss.get(SKIP_KEY) !== '1') await enrollScreen(email, onLogout);
  // powrót z tła po ponad 5 minutach = ponowne uruchomienie: znowu Face ID
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
    if (localKey() && hiddenAt && Date.now() - hiddenAt > RELOCK_MS) lockApp(onLogout);
  });
}

// lista kluczy w profilu
export async function myPasskeys(memberId) {
  const { data, error } = await sb.from('passkeys').select('id, credential_id, label, created_at, last_used_at').eq('member_id', memberId).order('created_at');
  if (error) throw error;
  return data || [];
}
export const removePasskey = id => call('remove', { id });
