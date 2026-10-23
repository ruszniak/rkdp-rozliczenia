// Regulamin aplikacji: strona z treścią i historią akceptacji, okno akceptacji przy logowaniu.
import { h, toast, fail, icon, printHtml } from '../ui.js';
import { sb, state } from '../store.js';
import { TERMS, TERMS_TITLE, TERMS_VERSION, TERMS_DATE, termsHash, termsBlocks } from '../regulamin.js';
import { printableHtml, buildOrderDocx, RKDP_BRAND } from '../m2/order.js';
import { downloadBytes } from '../docx.js';

const dt = iso => iso ? new Date(iso).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const dShort = iso => new Date(iso + 'T12:00:00').toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
export const browserName = ua => {
  ua = ua || '';
  const b = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'przeglądarka';
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${b} · ${os}` : b;
};

function termsBody() {
  return h('div', { class: 'tr-body' },
    h('p', { class: 'small muted' }, `Wersja ${TERMS_VERSION} · obowiązuje od ${dShort(TERMS_DATE)}`),
    ...TERMS.map(([hd, items]) => h('section', {}, h('h3', {}, hd), h('ol', {}, ...items.map(t => h('li', {}, t))))));
}

const brand = () => ({ ...RKDP_BRAND, foot2: `${TERMS_TITLE} · wersja ${TERMS_VERSION}` });
const pdf = () => printHtml(printableHtml(termsBlocks(), `Regulamin_aplikacji_v${TERMS_VERSION}`, location.origin + RKDP_BRAND.logo, brand()));
const word = async () => { try { downloadBytes(await buildOrderDocx(termsBlocks(), brand()), `Regulamin_aplikacji_v${TERMS_VERSION}.docx`); } catch (e) { fail(e); } };

// okno akceptacji – blokuje aplikację do czasu akceptacji albo wylogowania
export function termsGate({ onLogout, first = false } = {}) {
  return new Promise(resolve => {
    const cb = h('input', { type: 'checkbox' });
    const accept = h('button', { class: 'btn btn-primary', type: 'button', disabled: true }, 'Akceptuję regulamin');
    const scroll = h('div', { class: 'tr-scroll', tabindex: '0' }, termsBody());
    cb.addEventListener('change', () => { accept.disabled = !cb.checked; });
    accept.addEventListener('click', async () => {
      accept.disabled = true; accept.textContent = 'Zapisywanie…';
      const { error } = await sb.rpc('accept_terms', { p_version: TERMS_VERSION, p_hash: await termsHash(), p_ua: navigator.userAgent });
      if (error) { accept.disabled = false; accept.textContent = 'Akceptuję regulamin'; return fail(error, 'Nie udało się zapisać akceptacji'); }
      back.remove(); document.body.classList.remove('tr-locked');
      toast('Dziękujemy – akceptacja regulaminu zapisana');
      resolve(true);
    });
    const back = h('div', { class: 'tr-back', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'tr-title' },
      h('div', { class: 'tr-modal' },
        h('div', { class: 'tr-head' },
          h('img', { src: '/logo-rkdp.png', alt: 'RKDP', class: 'tr-logo' }),
          h('h2', { id: 'tr-title' }, TERMS_TITLE),
          h('p', { class: 'small muted' }, first
            ? 'Przed rozpoczęciem pracy przeczytaj i zaakceptuj regulamin. Akceptację powtarzamy co najmniej raz na 30 dni.'
            : 'Minęło 30 dni od ostatniej akceptacji albo regulamin się zmienił – zaakceptuj go ponownie, aby kontynuować.')),
        scroll,
        h('div', { class: 'tr-foot' },
          h('label', { class: 'check' }, cb, 'Przeczytałem(-am) regulamin i akceptuję jego postanowienia, w tym informacyjny charakter treści i dokumentów z aplikacji (§ 4) oraz zasady odpowiedzialności (§ 5).'),
          h('div', { class: 'tr-btns' },
            h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: pdf }, icon('download'), 'PDF'),
            h('span', { style: { flex: 1 } }),
            h('button', { class: 'btn btn-outline', type: 'button', onclick: () => { back.remove(); document.body.classList.remove('tr-locked'); onLogout?.(); resolve(false); } }, 'Wyloguj'),
            accept))));
    document.body.classList.add('tr-locked');
    document.body.append(back);
    setTimeout(() => scroll.focus(), 50);
  });
}

// strona #/regulamin – treść, pobranie i własna historia akceptacji
export async function renderRegulamin(main) {
  const hist = h('div', {}, h('p', { class: 'hint' }, 'Wczytywanie…'));
  sb.from('terms_acceptances').select('accepted_at,version,user_agent').eq('member_id', state.me.id).order('accepted_at', { ascending: false }).limit(50)
    .then(({ data, error }) => {
      if (error) return hist.replaceChildren(h('p', { class: 'hint' }, 'Historia akceptacji jest niedostępna.'));
      hist.replaceChildren(data.length ? h('table', { class: 'tr-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Data i godzina'), h('th', {}, 'Wersja'), h('th', {}, 'Urządzenie'))),
        h('tbody', {}, ...data.map(r => h('tr', {}, h('td', {}, dt(r.accepted_at)), h('td', {}, r.version), h('td', {}, browserName(r.user_agent))))))
        : h('p', { class: 'hint' }, 'Brak zapisanych akceptacji.'));
    });
  main.replaceChildren(
    h('div', { class: 'page-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, 'Aplikacja'), h('h1', { style: { marginTop: '6px' } }, 'Regulamin'),
        h('p', { class: 'sub' }, TERMS_TITLE)),
      h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
        h('button', { class: 'btn btn-outline btn-sm', onclick: word }, icon('download'), 'Word'),
        h('button', { class: 'btn btn-primary btn-sm', onclick: pdf }, icon('download'), 'PDF'))),
    h('div', { class: 'tr-layout' },
      h('section', { class: 'card section' }, termsBody()),
      h('aside', { class: 'card section tr-side' }, h('h2', { style: { margin: '0 0 10px', fontSize: '17px' } }, 'Twoje akceptacje'), hist,
        h('p', { class: 'small muted', style: { marginTop: '10px' } }, 'Regulamin akceptujesz przy pierwszym logowaniu, co najmniej raz na 30 dni i po każdej zmianie.'))));
}

// panel administratora w „Zespół i ustawienia”
export async function termsAdminSection(members) {
  const box = h('div', {}, h('p', { class: 'hint' }, 'Wczytywanie…'));
  const { data, error } = await sb.from('terms_acceptances').select('member_id,full_name,email,accepted_at,version,user_agent,content_hash').order('accepted_at', { ascending: false }).limit(500);
  if (error) { box.replaceChildren(h('p', { class: 'hint' }, 'Historia akceptacji jest niedostępna.')); return box; }
  const last = new Map();
  data.forEach(r => { if (r.version === TERMS_VERSION && !last.has(r.member_id)) last.set(r.member_id, r); });
  const ok = r => r && Date.now() - new Date(r.accepted_at).getTime() < 30 * 86400000;
  const summary = h('table', { class: 'tr-table' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Osoba'), h('th', {}, `Ostatnia akceptacja (wersja ${TERMS_VERSION})`), h('th', {}, 'Stan'))),
    h('tbody', {}, ...members.filter(m => m.active).map(m => { const r = last.get(m.id); return h('tr', {},
      h('td', {}, m.full_name), h('td', {}, r ? dt(r.accepted_at) : '—'),
      h('td', {}, h('span', { class: 'aml-st ' + (ok(r) ? 'ok' : 'warn') }, ok(r) ? 'aktualna' : r ? 'do ponowienia przy wejściu' : 'przy najbliższym logowaniu')));
    })));
  const log = h('details', { style: { marginTop: '12px' } }, h('summary', { style: { cursor: 'pointer', fontWeight: 600 } }, `Pełna historia akceptacji (${data.length})`),
    h('div', { style: { overflowX: 'auto', marginTop: '8px' } }, h('table', { class: 'tr-table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Data i godzina'), h('th', {}, 'Osoba'), h('th', {}, 'E-mail'), h('th', {}, 'Wersja'), h('th', {}, 'Urządzenie'), h('th', {}, 'Suma kontrolna treści'))),
      h('tbody', {}, ...data.map(r => h('tr', {}, h('td', {}, dt(r.accepted_at)), h('td', {}, r.full_name || '—'), h('td', {}, r.email), h('td', {}, r.version), h('td', {}, browserName(r.user_agent)), h('td', { class: 'small muted', title: r.content_hash || '' }, (r.content_hash || '—').slice(0, 12))))))));
  const csv = h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: () => {
    const rows = [['Data i godzina', 'Osoba', 'E-mail', 'Wersja', 'Przeglądarka', 'Suma kontrolna SHA-256'], ...data.map(r => [dt(r.accepted_at), r.full_name || '', r.email, r.version, r.user_agent || '', r.content_hash || ''])];
    const txt = '﻿' + rows.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    downloadBytes(new TextEncoder().encode(txt), `Akceptacje_regulaminu_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8');
  } }, icon('download'), 'CSV');
  box.replaceChildren(summary, log, h('div', { style: { display: 'flex', gap: '8px', marginTop: '12px' } }, h('a', { class: 'btn btn-outline btn-sm', href: '#/regulamin' }, 'Treść regulaminu'), csv));
  return box;
}
