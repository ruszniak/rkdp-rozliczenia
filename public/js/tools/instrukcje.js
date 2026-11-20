// Instrukcje dla klientów – jedno miejsce z linkami do stron dla klientów (kopiuj, otwórz, wyślij e-mailem).
import { h, modal, toast } from '../ui.js';
import { state } from '../store.js';

export const INSTRUKCJE = [
  { key: 'po-rejestracji', title: 'Po rejestracji spółki w KRS', path: '/po-rejestracji/', personal: true,
    desc: 'CRBR, rachunek bankowy spółki (NIP-8, kapitał) i PCC-3 – kroki z terminami.',
    subject: 'Spółka zarejestrowana w KRS – kolejne kroki',
    body: (link) => `Szanowni Państwo,\n\ngratuluję rejestracji spółki w KRS. W związku z tym proszę o realizację kilku niezbędnych kroków organizacyjnych:\n\n1. Zgłoszenie spółki do Centralnego Rejestru Beneficjentów Rzeczywistych (CRBR) – w ciągu 14 dni od wpisu do KRS. Bez zgłoszenia w CRBR nie będzie możliwe otwarcie rachunku bankowego spółki.\n2. Założenie rachunku bankowego spółki – po założeniu proszę o przesłanie skanu potwierdzenia otwarcia rachunku na mój adres e-mail.\n3. PCC-3 – złożenie deklaracji i zapłata podatku (spółki założone przez S24) – w ciągu 14 dni od zawarcia umowy spółki.\n\nInstrukcja krok po kroku: ${link}\n\nW razie problemów proszę o kontakt – pomogę krok po kroku.` },
  { key: 'upl-1', title: 'Jak złożyć UPL-1', path: '/upl-1/',
    desc: 'Trzy sposoby złożenia pełnomocnictwa UPL-1: e-Urząd Skarbowy, podpis zaufany + e-Doręczenia, papier.',
    subject: 'Pełnomocnictwo UPL-1 – instrukcja',
    body: (link) => `Dzień dobry,\n\nprzesyłamy instrukcję złożenia pełnomocnictwa UPL-1 – dzięki niemu będziemy mogli wysyłać w Państwa imieniu deklaracje i pliki JPK do urzędu skarbowego. Złożenie UPL-1 jest bezpłatne.\n\nInstrukcja krok po kroku: ${link}\n\nW razie pytań jesteśmy do dyspozycji.` },
  { key: 'umow', title: 'Umów spotkanie z doradcą', path: '/umow/',
    desc: 'Rezerwacja konsultacji online – klient sam wybiera termin.',
    subject: 'Umówienie spotkania',
    body: (link) => `Dzień dobry,\n\ntermin spotkania można wybrać samodzielnie pod linkiem: ${link}\n\nPozdrawiam` },
];

export function instrukcjaDialog(item) {
  const me = state.me || {};
  const f = { firma: '', osoba: me.full_name || '', email: me.email || '', tel: '', to: '' };
  const link = () => {
    const q = new URLSearchParams();
    if (item.personal) for (const k of ['firma', 'osoba', 'email', 'tel']) if (f[k].trim()) q.set(k, f[k].trim());
    return `${location.origin}${item.path}${q.toString() ? '?' + q : ''}`;
  };
  const out = h('input', { class: 'input', readonly: true, value: link(), onfocus: e => e.target.select() });
  const upd = () => { out.value = link(); };
  const field = (label, k, attrs = {}) => h('label', { class: 'field' }, h('span', {}, label),
    h('input', { class: 'input', value: f[k], maxlength: 120, ...attrs, oninput: e => { f[k] = e.target.value; upd(); } }));
  const copy = async () => { try { await navigator.clipboard.writeText(link()); toast('Link skopiowany'); } catch { out.select(); toast('Zaznaczono link – skopiuj Ctrl+C'); } };
  const mail = () => { location.href = `mailto:${encodeURIComponent(f.to.trim())}?subject=${encodeURIComponent(item.subject)}&body=${encodeURIComponent(item.body(link()))}`; };
  const body = h('div', {},
    h('p', { class: 'small muted', style: { margin: '0 0 12px' } }, item.desc),
    item.personal ? h('div', {},
      field('Nazwa klienta (opcjonalnie – pojawi się na górze strony)', 'firma', { placeholder: 'np. Alfa Bud sp. z o.o.' }),
      h('div', { class: 'grid2', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '0 12px' } },
        field('Opiekun', 'osoba'), field('E-mail opiekuna (tu klient wyśle potwierdzenia)', 'email', { type: 'email' }), field('Telefon (opcjonalnie)', 'tel', { type: 'tel' }))) : null,
    field('Adres e-mail klienta (do wiadomości)', 'to', { type: 'email', placeholder: 'klient@firma.pl' }),
    h('label', { class: 'field' }, h('span', {}, 'Link dla klienta'), out));
  modal(item.title, body, close => [
    h('a', { class: 'btn btn-sm', href: link(), target: '_blank', rel: 'noopener', onclick: e => { e.currentTarget.href = link(); } }, 'Otwórz'),
    h('button', { class: 'btn btn-sm', onclick: copy }, 'Kopiuj link'),
    h('button', { class: 'btn btn-primary btn-sm', onclick: () => { mail(); close(); } }, 'Wyślij e-mailem'),
  ]);
}
