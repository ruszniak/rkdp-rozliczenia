// Instrukcje dla klientów – jedno miejsce z linkami do stron dla klientów (kopiuj, otwórz, wyślij e-mailem).
import { h, modal, toast } from '../ui.js';
import { sb, state, memberById } from '../store.js';

// adres w domenie biura: imię.nazwisko@rkdp.pl (bez polskich znaków) – do poprawienia w oknie
const alias = m => m?.full_name ? m.full_name.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').split(/\s+/).slice(0, 2).join('.') + '@rkdp.pl' : '';
const OFFICE_TEL = '883 643 565';

export const INSTRUKCJE = [
  { key: 'po-rejestracji', title: 'Po rejestracji spółki w KRS', path: '/po-rejestracji/', personal: true,
    desc: 'CRBR, rachunek bankowy spółki (NIP-8, kapitał) i PCC-3 – kroki z terminami.',
    subject: 'Spółka zarejestrowana w KRS – kolejne kroki',
    body: (link) => `Szanowni Państwo,\n\ngratuluję rejestracji spółki w KRS. W związku z tym proszę o realizację kilku niezbędnych kroków organizacyjnych:\n\n1. Zgłoszenie spółki do Centralnego Rejestru Beneficjentów Rzeczywistych (CRBR) – w ciągu 14 dni od wpisu do KRS. Bez zgłoszenia w CRBR nie będzie możliwe otwarcie rachunku bankowego spółki.\n2. Założenie rachunku bankowego spółki – po założeniu proszę o przesłanie skanu potwierdzenia otwarcia rachunku na mój adres e-mail.\n3. PCC-3 – złożenie deklaracji i zapłata podatku (spółki założone przez S24) – w ciągu 14 dni od zawarcia umowy spółki.\n\nInstrukcja krok po kroku: ${link}\n\nW razie problemów proszę o kontakt – pomogę krok po kroku.` },
  { key: 'saldeo-ksef', title: 'Na start: KSeF w SaldeoSMART', path: '/saldeo-ksef/',
    desc: 'Po nawiązaniu współpracy: własny certyfikat KSeF w Saldeo (bez uprawnień dla biura), pobranie wcześniejszych faktur, zatwierdzanie i wystawianie faktur; kto jest księgową i kadrową klienta.',
    fields: [['firma', 'Nazwa klienta (na górze strony)', {}, true], ['k', 'Księgowa / księgowy'], ['ke', 'E-mail księgowej', { type: 'email' }], ['kt', 'Telefon księgowej', { type: 'tel' }],
      ['h', 'Kadry i płace (puste – bez kadr)'], ['he', 'E-mail kadrowej', { type: 'email' }], ['ht', 'Telefon kadrowej', { type: 'tel' }]],
    prefill: c => { const a = memberById(c.accountant_id), r = memberById(c.hr_id);
      return { firma: c.name || '', k: a?.full_name || '', ke: alias(a), kt: a ? OFFICE_TEL : '', h: r?.full_name || '', he: alias(r), ht: r ? OFFICE_TEL : '' }; },
    subject: 'Na start: KSeF w SaldeoSMART',
    body: (link) => `Dzień dobry,\n\ndziękujemy za rozpoczęcie współpracy. Faktury z KSeF będziemy otrzymywać przez SaldeoSMART. Prosimy o połączenie Saldeo z KSeF własnym certyfikatem KSeF firmy – nie trzeba nadawać w KSeF uprawnień dla naszego biura.\n\nW instrukcji opisaliśmy krok po kroku:\n1. wygenerowanie certyfikatów KSeF,\n2. dodanie ich w SaldeoSMART,\n3. pobranie faktur, które trafiły do KSeF przed podłączeniem certyfikatu,\n4. zatwierdzanie faktur kosztowych,\n5. wystawianie faktur sprzedaży do KSeF.\nZnajdą tam Państwo także dane kontaktowe swojej księgowej i osoby od kadr.\n\nInstrukcja: ${link}\n\nW razie pytań jesteśmy do dyspozycji.` },
  { key: 'upl-1', title: 'Jak złożyć UPL-1', path: '/upl-1/',
    desc: 'Trzy sposoby złożenia pełnomocnictwa UPL-1: e-Urząd Skarbowy, podpis zaufany + e-Doręczenia, papier.',
    subject: 'Pełnomocnictwo UPL-1 – instrukcja',
    body: (link) => `Dzień dobry,\n\nprzesyłamy instrukcję złożenia pełnomocnictwa UPL-1 – dzięki niemu będziemy mogli wysyłać w Państwa imieniu deklaracje i pliki JPK do urzędu skarbowego. Złożenie UPL-1 jest bezpłatne.\n\nInstrukcja krok po kroku: ${link}\n\nW razie pytań jesteśmy do dyspozycji.` },
  { key: 'zus-pel', title: 'Jak złożyć ZUS PEL', path: '/zus-pel/',
    desc: 'Trzy sposoby złożenia pełnomocnictwa PEL: eZUS, podpis zaufany + e-Doręczenia, osobiście lub pocztą.',
    subject: 'Pełnomocnictwo ZUS PEL – instrukcja',
    body: (link) => `Dzień dobry,\n\nprzesyłamy instrukcję złożenia pełnomocnictwa ZUS PEL – dzięki niemu będziemy mogli wysyłać w Państwa imieniu deklaracje i dokumenty do ZUS oraz załatwiać sprawy przez eZUS.\n\nInstrukcja krok po kroku: ${link}\n\nW razie pytań jesteśmy do dyspozycji.` },
  { key: 'umow', title: 'Umów spotkanie z doradcą', path: '/umow/',
    desc: 'Rezerwacja konsultacji online – klient sam wybiera termin.',
    subject: 'Umówienie spotkania',
    body: (link) => `Dzień dobry,\n\ntermin spotkania można wybrać samodzielnie pod linkiem: ${link}\n\nPozdrawiam` },
];

const PERSONAL = [['firma', 'Nazwa klienta (na górze strony)', {}, true], ['osoba', 'Opiekun'], ['email', 'E-mail opiekuna (tu klient wyśle potwierdzenia)', { type: 'email' }], ['tel', 'Telefon opiekuna', { type: 'tel' }]];
let CLIENTS = null;
const firstMail = c => String(c?.email || '').split(/[;,\s]+/).find(x => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)) || '';

export function instrukcjaDialog(item) {
  const me = state.me || {};
  const fields = item.fields || (item.personal ? PERSONAL : []);
  const f = { firma: '', osoba: me.full_name || '', email: me.email || '', tel: OFFICE_TEL, to: '', subject: item.subject, body: '' };
  fields.forEach(([k]) => { f[k] ??= ''; });
  let client = null, bodyEdited = false;
  const link = () => {
    const q = new URLSearchParams();
    for (const [k] of fields) if (String(f[k] || '').trim()) q.set(k, String(f[k]).trim());
    return `${location.origin}${item.path}${q.toString() ? '?' + q : ''}`;
  };
  const out = h('input', { class: 'input', readonly: true, onfocus: e => e.target.select() });
  const bodyTa = h('textarea', { class: 'input', rows: 10, maxlength: 7000, oninput: e => { f.body = e.target.value; bodyEdited = true; } });
  const upd = () => { out.value = link(); if (!bodyEdited) { f.body = item.body(link()); bodyTa.value = f.body; } };
  const field = (label, k, attrs = {}) => h('label', { class: 'field' }, h('span', {}, label),
    h('input', { class: 'input', value: f[k], maxlength: 120, ...attrs, oninput: e => { f[k] = e.target.value; upd(); } }));
  const copy = async () => { try { await navigator.clipboard.writeText(link()); toast('Link skopiowany'); } catch { out.select(); toast('Zaznaczono link – skopiuj Ctrl+C'); } };
  const grid = (...c) => h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '0 12px' } }, ...c);
  const custom = h('div');
  const drawCustom = () => {
    const full = fields.filter(x => x[3]), rest = fields.filter(x => !x[3]);
    custom.replaceChildren(...full.map(([k, l, a]) => field(l, k, a)), ...(rest.length ? [grid(...rest.slice(0, 3).map(([k, l, a]) => field(l, k, a)))] : []), ...(rest.length > 3 ? [grid(...rest.slice(3).map(([k, l, a]) => field(l, k, a)))] : []));
    upd();
  };
  // klient: wymagany do wysyłki z aplikacji (e-mail zapisze się w historii klienta); uzupełnia dane na stronie
  const dl = h('datalist', { id: 'inst-clients' });
  const fillList = list => dl.replaceChildren(...list.map(c => h('option', { value: c.name })));
  if (CLIENTS) fillList(CLIENTS);
  else sb.from('clients').select('id,name,email,accountant_id,hr_id,status').order('name').limit(3000).then(({ data }) => { CLIENTS = data || []; fillList(CLIENTS); });
  const toInput = h('input', { class: 'input', type: 'email', value: f.to, placeholder: 'klient@firma.pl', maxlength: 160, oninput: e => { f.to = e.target.value; } });
  const subjInput = h('input', { class: 'input', value: f.subject, maxlength: 200, oninput: e => { f.subject = e.target.value; } });
  const picker = h('label', { class: 'field' }, h('span', {}, item.prefill ? 'Klient (uzupełni dane z karty klienta)' : 'Klient'),
    h('input', { class: 'input', list: 'inst-clients', placeholder: 'Zacznij pisać nazwę klienta…', onchange: e => {
      client = (CLIENTS || []).find(x => x.name === e.target.value) || null; if (!client) return;
      Object.assign(f, item.prefill ? item.prefill(client) : ('firma' in f && fields.some(x => x[0] === 'firma') ? { firma: client.name } : {}));
      f.to = firstMail(client) || f.to; toInput.value = f.to;
      f.subject = `${item.subject} – ${client.name}`.slice(0, 200); subjInput.value = f.subject;
      drawCustom();
    } }), dl);
  drawCustom();
  const send = async (btn, close) => {
    if (!client) return toast('Wybierz klienta z listy – e-mail zapisze się w jego historii', true);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.to.trim())) return toast('Wpisz poprawny e-mail klienta', true);
    btn.disabled = true; btn.textContent = 'Wysyłam…';
    try {
      const { data: r, error } = await sb.functions.invoke('mail', { body: { action: 'send_file', client_id: client.id, to: f.to.trim(), subject: f.subject.trim(), body: f.body } });
      if (error || r?.error) throw new Error(r?.detail || r?.error || error.message);
      toast(`Wysłano do ${f.to.trim()}`); close();
    } catch (err) { toast('Nie udało się wysłać: ' + String(err.message || err).slice(0, 160), true); btn.disabled = false; btn.textContent = 'Wyślij z aplikacji'; }
  };
  const body = h('div', {},
    h('p', { class: 'small muted', style: { margin: '0 0 12px' } }, item.desc),
    picker, custom,
    h('label', { class: 'field' }, h('span', {}, 'Do (e-mail klienta)'), toInput),
    h('label', { class: 'field' }, h('span', {}, 'Temat'), subjInput),
    h('label', { class: 'field' }, h('span', {}, 'Treść (pod spodem dopisze się Twoja stopka)'), bodyTa),
    h('label', { class: 'field' }, h('span', {}, 'Link dla klienta'), out),
    h('p', { class: 'hint', style: { marginTop: '6px' } }, 'E-mail wyjdzie z kancelaria@rkdp.pl i zapisze się w historii klienta.'));
  modal(item.title, body, close => [
    h('a', { class: 'btn btn-sm', href: link(), target: '_blank', rel: 'noopener', onclick: e => { e.currentTarget.href = link(); } }, 'Otwórz'),
    h('button', { class: 'btn btn-sm', onclick: copy }, 'Kopiuj link'),
    h('button', { class: 'btn btn-primary btn-sm', onclick: e => send(e.currentTarget, close) }, 'Wyślij z aplikacji'),
  ], { wide: true });
}
