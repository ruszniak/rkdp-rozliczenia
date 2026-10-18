import { h } from '../ui.js';
import { sb } from '../store.js';
import { deviceToken, saveDeviceToken, deviceLabel, markActive } from '../session.js';

const MIN_PASSWORD = 10;
const PW_RULES = [
  [`co najmniej ${MIN_PASSWORD} znaków`, pw => pw.length >= MIN_PASSWORD],
  ['litera', pw => /[a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(pw)],
  ['cyfra', pw => /\d/.test(pw)],
  ['znak specjalny (np. ! ? # @ - _ .)', pw => /[^a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ\s]/.test(pw)],
];
const PW_TEXT = `co najmniej ${MIN_PASSWORD} znaków, litery, cyfry i znak specjalny`;

function plError(err) {
  const m = (err?.message || '').toLowerCase();
  if (m.includes('invalid login credentials')) return 'Nieprawidłowy e-mail lub hasło.';
  if (m.includes('wymaga zgody') || (m.includes('database error') && m.includes('updating')))
    return 'Hasło zostało już ustawione. Nowe hasło możesz ustawić dopiero, gdy administrator na to zezwoli.';
  if (m.includes('database error') || m.includes('signups not allowed') || m.includes('nie ma dostępu') || m.includes('user not found'))
    return 'Ten adres nie ma dostępu do aplikacji.';
  if (m.includes('rate') || m.includes('seconds') || err?.status === 429)
    return 'Zbyt wiele prób. Odczekaj chwilę i spróbuj ponownie.';
  if (m.includes('najpierw podaj hasło')) return 'Minęło za dużo czasu od podania hasła. Zaloguj się jeszcze raz.';
  if (m.includes('same_password') || m.includes('different from the old')) return 'Nowe hasło musi się różnić od poprzedniego.';
  if (m.includes('weak') || m.includes('at least')) return `Hasło jest za słabe – wymagane: ${PW_TEXT}.`;
  if (m.includes('expired') || m.includes('invalid') || m.includes('token'))
    return 'Kod jest nieprawidłowy albo wygasł. Wyślij nowy kod.';
  return 'Nie udało się: ' + (err?.message || 'spróbuj ponownie');
}

const go = () => { markActive(); if (!location.hash || location.hash === '#/') location.hash = '#/rozliczenia'; location.reload(); };

async function newMode() {
  const { data, error } = await sb.rpc('login_mode');
  return !error && data === 'haslo_kod';
}

export async function renderLogin(app, initialError = '') {
  let email = '', nonce = null;
  const errBox = h('p', { class: 'err', role: 'alert' }, initialError);
  const box = h('div', { class: 'login-box' });
  const head = (eyebrow, title, text) => [
    h('img', { src: '/logo-rkdp.png', alt: 'RKDP' }),
    h('div', {}, h('p', { class: 'eyebrow' }, eyebrow), h('h1', { style: { marginTop: '8px' } }, title)),
    text ? h('p', { class: 'muted' }, ...[].concat(text)) : null];
  const linkBtn = (label, fn) => h('button', { class: 'btn btn-ghost btn-sm', type: 'button', style: { alignSelf: 'flex-start', width: 'auto' },
    onclick: () => { errBox.textContent = ''; fn(); } }, label);
  const busy = (btn, on, label) => { btn.disabled = on; btn.textContent = label; };
  const emailInput = () => h('input', { class: 'input', type: 'email', autocomplete: 'username', required: true,
    placeholder: 'imie.nazwisko@rkdp.pl', value: email, 'aria-label': 'Adres e-mail' });
  const rememberBox = () => h('input', { type: 'checkbox', checked: true });

  // ---------- logowanie: e-mail + hasło ----------
  function stepPassword() {
    const mail = emailInput();
    const pass = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', required: true, placeholder: 'Hasło', 'aria-label': 'Hasło' });
    const btn = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Dalej');
    const form = h('form', { class: 'login-box', style: { gap: '14px' }, onsubmit: async (e) => {
      e.preventDefault();
      email = mail.value.trim().toLowerCase();
      busy(btn, true, 'Sprawdzanie…'); errBox.textContent = '';
      const { error } = await sb.auth.signInWithPassword({ email, password: pass.value });
      if (error) {
        busy(btn, false, 'Dalej');
        errBox.textContent = plError(error) + (error.message?.toLowerCase().includes('invalid login') ? ' Jeśli logujesz się pierwszy raz, kliknij „Pierwsze logowanie”.' : '');
        return;
      }
      const { data, error: e2 } = await sb.rpc('auth_password_step', { p_device_token: deviceToken(email) });
      if (e2) { busy(btn, false, 'Dalej'); errBox.textContent = plError(e2); await sb.auth.signOut({ scope: 'local' }); return; }
      if (data?.verified) return go();
      nonce = data.nonce;
      // drugi składnik: zamykamy sesję z samym hasłem i wysyłamy kod na e-mail
      await sb.auth.signOut({ scope: 'local' });
      const { error: e3 } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
      busy(btn, false, 'Dalej');
      if (e3) { errBox.textContent = plError(e3); return; }
      stepCode('login');
    } }, mail, pass, btn);
    box.replaceChildren(...head('Aplikacja wewnętrzna', 'Zaloguj się', 'Podaj służbowy e-mail i hasło. Potem wyślemy kod na e-mail (chyba że ta przeglądarka jest zapamiętana).'),
      form, errBox,
      linkBtn('Pierwsze logowanie / ustaw nowe hasło', stepSetupEmail));
    (email ? pass : mail).focus();
  }

  // ---------- ustawienie hasła: e-mail → kod → nowe hasło ----------
  function stepSetupEmail() {
    const mail = emailInput();
    const btn = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Wyślij kod');
    const form = h('form', { class: 'login-box', style: { gap: '14px' }, onsubmit: async (e) => {
      e.preventDefault();
      email = mail.value.trim().toLowerCase();
      busy(btn, true, 'Wysyłanie…'); errBox.textContent = '';
      const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
      busy(btn, false, 'Wyślij kod');
      if (error) { errBox.textContent = plError(error); return; }
      stepCode('setup');
    } }, mail, btn);
    box.replaceChildren(...head('Pierwsze logowanie', 'Ustaw hasło',
      'Wyślemy kod na służbowy e-mail, a potem ustawisz własne hasło. Nowe hasło (gdy zapomnisz poprzedniego) da się ustawić tylko za zgodą administratora.'),
      form, errBox, linkBtn('← Mam już hasło', stepPassword));
    mail.focus();
  }

  // ---------- kod z e-maila ----------
  function stepCode(mode) {
    const input = h('input', { class: 'input code-input', inputmode: 'numeric', autocomplete: 'one-time-code',
      pattern: '[0-9]*', maxlength: '10', required: true, placeholder: '••••••', 'aria-label': 'Kod z e-maila' });
    const remember = rememberBox();
    const btn = h('button', { class: 'btn btn-primary', type: 'submit' }, mode === 'login' ? 'Zaloguj' : 'Dalej');
    const form = h('form', { class: 'login-box', style: { gap: '14px' }, onsubmit: async (e) => {
      e.preventDefault();
      const token = input.value.replace(/\D/g, '');
      if (token.length < 6) { errBox.textContent = 'Wpisz cały kod z wiadomości.'; return; }
      busy(btn, true, 'Sprawdzanie…'); errBox.textContent = '';
      const { error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
      if (error) { busy(btn, false, 'Spróbuj ponownie'); errBox.textContent = plError(error); return; }
      if (mode === 'login') {
        const { data, error: e2 } = await sb.rpc('auth_code_step', { p_nonce: nonce, p_remember: remember.checked, p_label: deviceLabel() });
        if (e2) { await sb.auth.signOut({ scope: 'local' }); errBox.textContent = plError(e2); stepPassword(); return; }
        if (data?.device_token) saveDeviceToken(email, data.device_token);
        return go();
      }
      const { data: st } = await sb.rpc('auth_state');
      if (!st?.member) { await sb.auth.signOut({ scope: 'local' }); errBox.textContent = 'Ten adres nie ma dostępu do aplikacji.'; stepSetupEmail(); return; }
      if (!st.can_set_password) {
        await sb.auth.signOut({ scope: 'local' });
        errBox.textContent = 'Masz już ustawione hasło – zaloguj się nim. Jeśli go nie pamiętasz, poproś administratora o zgodę na ustawienie nowego.';
        stepPassword(); return;
      }
      stepNewPassword(remember.checked);
    } }, input,
      h('label', { class: 'check small' }, remember, 'Zapamiętaj tę przeglądarkę (nie zaznaczaj na cudzym komputerze)'),
      btn);
    box.replaceChildren(...head(mode === 'login' ? 'Krok 2 z 2' : 'Krok 2 z 3', 'Wpisz kod', ['Kod wysłaliśmy na ', h('b', {}, email), '. Sprawdź też folder spam.']),
      form, errBox, linkBtn('← Wróć', mode === 'login' ? stepPassword : stepSetupEmail));
    input.focus();
  }

  function stepNewPassword(remember) {
    const p1 = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', required: true, placeholder: `Nowe hasło (min. ${MIN_PASSWORD} znaków)`, 'aria-label': 'Nowe hasło' });
    const p2 = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', required: true, placeholder: 'Powtórz hasło', 'aria-label': 'Powtórz hasło' });
    const btn = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Ustaw hasło i zaloguj');
    const items = PW_RULES.map(([label]) => h('li', {}, label));
    const same = h('li', {}, 'oba hasła takie same');
    const rules = h('ul', { class: 'pw-rules', 'aria-live': 'polite' }, ...items, same);
    const check = () => {
      PW_RULES.forEach(([, ok], i) => items[i].classList.toggle('ok', ok(p1.value)));
      same.classList.toggle('ok', !!p1.value && p1.value === p2.value);
      errBox.textContent = '';
    };
    p1.addEventListener('input', check); p2.addEventListener('input', check);
    const form = h('form', { class: 'login-box', style: { gap: '14px' }, onsubmit: async (e) => {
      e.preventDefault();
      const pw = p1.value;
      if (!PW_RULES.every(([, ok]) => ok(pw))) { errBox.textContent = `Hasło musi mieć ${PW_TEXT}.`; return; }
      if (pw.toLowerCase().includes(email.split('@')[0].split('.')[0])) { errBox.textContent = 'Hasło nie może zawierać Twojego imienia z adresu e-mail.'; return; }
      if (pw !== p2.value) { errBox.textContent = 'Hasła nie są takie same.'; return; }
      busy(btn, true, 'Zapisywanie…'); errBox.textContent = '';
      const { error } = await sb.auth.updateUser({ password: pw });
      if (error) { busy(btn, false, 'Ustaw hasło i zaloguj'); errBox.textContent = plError(error); return; }
      const { data, error: e2 } = await sb.rpc('auth_setup_step', { p_remember: remember, p_label: deviceLabel() });
      if (e2) { await sb.auth.signOut({ scope: 'local' }); errBox.textContent = 'Hasło ustawione. Zaloguj się nim.'; stepPassword(); return; }
      if (data?.device_token) saveDeviceToken(email, data.device_token);
      go();
    } }, p1, p2, rules, btn);
    box.replaceChildren(...head('Krok 3 z 3', 'Nowe hasło',
      'Wymyśl własne hasło – nikt inny go nie zna, także administrator. Nie używaj hasła z innych serwisów.'),
      form, errBox);
    p1.focus();
  }

  // ---------- dotychczasowy sposób (gdy baza nie ma jeszcze nowego logowania) ----------
  function legacyEmail() {
    const input = emailInput();
    const btn = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Wyślij kod logowania');
    const form = h('form', { class: 'login-box', style: { gap: '14px' }, onsubmit: async (e) => {
      e.preventDefault();
      email = input.value.trim().toLowerCase();
      busy(btn, true, 'Wysyłanie…'); errBox.textContent = '';
      const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
      busy(btn, false, 'Wyślij kod logowania');
      if (error) { errBox.textContent = plError(error); return; }
      legacyCode();
    } }, input, btn);
    box.replaceChildren(...head('Aplikacja wewnętrzna', 'Zaloguj się', 'Podaj służbowy adres e-mail. Wyślemy na niego jednorazowy kod.'), form, errBox);
    input.focus();
  }
  function legacyCode() {
    const input = h('input', { class: 'input code-input', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '10', required: true, placeholder: '••••••' });
    const btn = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Zaloguj');
    const form = h('form', { class: 'login-box', style: { gap: '14px' }, onsubmit: async (e) => {
      e.preventDefault();
      busy(btn, true, 'Sprawdzanie…'); errBox.textContent = '';
      const { error } = await sb.auth.verifyOtp({ email, token: input.value.replace(/\D/g, ''), type: 'email' });
      if (error) { busy(btn, false, 'Zaloguj'); errBox.textContent = plError(error); return; }
      go();
    } }, input, btn);
    box.replaceChildren(...head('Krok 2 z 2', 'Wpisz kod', ['Kod wysłaliśmy na ', h('b', {}, email), '.']), form, errBox, linkBtn('← Wróć', legacyEmail));
    input.focus();
  }

  app.replaceChildren(h('div', { class: 'login' },
    h('aside', { class: 'login-side' },
      h('p', { class: 'eyebrow', style: { color: 'var(--gold)' } }, 'RKDP spółka doradztwa podatkowego'),
      h('div', {},
        h('h2', {}, 'Rozliczenia klientów ', h('em', {}, 'w jednym miejscu.')),
        h('p', {}, 'Statusy księgowań, ZUS, PIT/CIT, VAT i JPK dla każdego klienta, miesiąc po miesiącu. Dostęp tylko dla zespołu RKDP.')),
      h('p', { style: { fontSize: '13px' } }, `© ${new Date().getFullYear()} Właściciel oprogramowania: Michał Ruszniak. Wszelkie prawa zastrzeżone.`, h('br'), 'Dane objęte tajemnicą doradcy podatkowego.')),
    h('section', { class: 'login-main' }, box)));
  box.replaceChildren(h('div', { class: 'spinner' }, 'Wczytywanie…'));
  if (await newMode()) stepPassword(); else legacyEmail();
}

