import { h } from '../ui.js';
import { sb } from '../store.js';

function plError(err) {
  const m = (err?.message || '').toLowerCase();
  if (m.includes('database error') || m.includes('signups not allowed') || m.includes('nie ma dostępu'))
    return 'Ten adres nie ma dostępu do aplikacji.';
  if (m.includes('rate') || m.includes('seconds') || err?.status === 429)
    return 'Zbyt wiele prób. Odczekaj chwilę i spróbuj ponownie.';
  if (m.includes('expired') || m.includes('invalid') || m.includes('token'))
    return 'Kod jest nieprawidłowy albo wygasł. Wyślij nowy kod.';
  return 'Nie udało się: ' + (err?.message || 'spróbuj ponownie');
}

export function renderLogin(app, initialError = '') {
  let email = '';
  const errBox = h('p', { class: 'err', role: 'alert' }, initialError);
  const box = h('div', { class: 'login-box' });

  function stepEmail() {
    const input = h('input', { class: 'input', type: 'email', autocomplete: 'email', required: true,
      placeholder: 'imie.nazwisko@rkdp.pl', value: email, 'aria-label': 'Adres e-mail' });
    const btn = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Wyślij kod logowania');
    const form = h('form', { class: 'login-box', style: { gap: '14px' }, onsubmit: async (e) => {
      e.preventDefault();
      email = input.value.trim().toLowerCase();
      if (!email) return;
      btn.disabled = true; btn.textContent = 'Wysyłanie…'; errBox.textContent = '';
      const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
      btn.disabled = false; btn.textContent = 'Wyślij kod logowania';
      if (error) { errBox.textContent = plError(error); return; }
      stepCode();
    } }, input, btn);
    box.replaceChildren(
      h('img', { src: '/logo-rkdp.png', alt: 'RKDP' }),
      h('div', {}, h('p', { class: 'eyebrow' }, 'Aplikacja wewnętrzna'), h('h1', { style: { marginTop: '8px' } }, 'Zaloguj się')),
      h('p', { class: 'muted' }, 'Podaj służbowy adres e-mail. Wyślemy na niego jednorazowy kod.'),
      form, errBox);
    input.focus();
  }

  function stepCode() {
    const input = h('input', { class: 'input code-input', inputmode: 'numeric', autocomplete: 'one-time-code',
      pattern: '[0-9]*', maxlength: '10', required: true, placeholder: '••••••', 'aria-label': 'Kod z e-maila' });
    const btn = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Zaloguj');
    const form = h('form', { class: 'login-box', style: { gap: '14px' }, onsubmit: async (e) => {
      e.preventDefault();
      const token = input.value.replace(/\D/g, '');
      if (token.length < 6) { errBox.textContent = 'Wpisz cały kod z wiadomości.'; return; }
      btn.disabled = true; btn.textContent = 'Sprawdzanie…'; errBox.textContent = '';
      const { error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
      if (error) { btn.disabled = false; btn.textContent = 'Zaloguj'; errBox.textContent = plError(error); return; }
      location.hash = '#/rozliczenia';
      location.reload();
    } }, input, btn);
    box.replaceChildren(
      h('img', { src: '/logo-rkdp.png', alt: 'RKDP' }),
      h('div', {}, h('p', { class: 'eyebrow' }, 'Krok 2 z 2'), h('h1', { style: { marginTop: '8px' } }, 'Wpisz kod')),
      h('p', { class: 'muted' }, 'Kod wysłaliśmy na ', h('b', {}, email), '. Sprawdź też folder spam.'),
      form, errBox,
      h('button', { class: 'btn btn-ghost btn-sm', style: { alignSelf: 'flex-start' }, onclick: () => { errBox.textContent = ''; stepEmail(); } }, '← Zmień adres lub wyślij ponownie'));
    input.focus();
  }

  app.replaceChildren(h('div', { class: 'login' },
    h('aside', { class: 'login-side' },
      h('p', { class: 'eyebrow', style: { color: 'var(--gold)' } }, 'RKDP spółka doradztwa podatkowego'),
      h('div', {},
        h('h2', {}, 'Rozliczenia klientów ', h('em', {}, 'w jednym miejscu.')),
        h('p', {}, 'Statusy księgowań, ZUS, PIT/CIT, VAT i JPK dla każdego klienta, miesiąc po miesiącu. Dostęp tylko dla zespołu RKDP.')),
      h('p', { style: { fontSize: '13px' } }, '© RKDP · dane objęte tajemnicą doradcy podatkowego')),
    h('section', { class: 'login-main' }, box)));
  stepEmail();
}
