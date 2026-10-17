// Słowniki modułu Doradztwo podatkowe (M2 TAX)
import { businessDay } from '../dict.js';

export const FIRM = {
  name: 'M2 TAX Doradcy Podatkowi Otręba Ruszniak spółka partnerska',
  short: 'M2 TAX Doradcy Podatkowi',
  address: 'ul. Zwycięska 3, 53-033 Wrocław',
  nip: '8993058189',
  krs: '0001238577',
  email: 'kancelaria@m2tax.pl',
  phones: '883 643 565 · 534 909 534',
  web: 'www.m2tax.pl',
};

export const MATTER_TYPE = {
  konsultacja: 'Konsultacja / opinia podatkowa',
  interpretacja: 'Interpretacja indywidualna',
  wis: 'Wiążąca informacja stawkowa (WIS)',
  czynnosci_sprawdzajace: 'Czynności sprawdzające',
  kontrola_podatkowa: 'Kontrola podatkowa',
  kontrola_ucs: 'Kontrola celno-skarbowa',
  postepowanie_podatkowe: 'Postępowanie podatkowe',
  odwolanie: 'Odwołanie / zażalenie (II instancja)',
  wsa: 'Skarga do WSA',
  nsa: 'Skarga kasacyjna do NSA',
  egzekucja: 'Egzekucja / zabezpieczenie',
  podatki_lokalne: 'Podatek od nieruchomości / podatki lokalne',
  nadplata: 'Nadpłata / korekta / zwrot',
  optymalizacja: 'Optymalizacja / restrukturyzacja',
  abonament: 'Obsługa stała (abonament)',
  inne: 'Inne',
};

export const MATTER_STATUS = {
  nowa: { label: 'Nowa', cls: 'unk' },
  w_toku: { label: 'W toku', cls: 'yes' },
  oczekuje_organ: { label: 'Czeka na organ', cls: 'wait' },
  oczekuje_klient: { label: 'Czeka na klienta', cls: 'wait' },
  zawieszona: { label: 'Zawieszona', cls: 'no' },
  zakonczona: { label: 'Zakończona', cls: 'done' },
};
export const OPEN_STATUSES = ['nowa', 'w_toku', 'oczekuje_organ', 'oczekuje_klient', 'zawieszona'];

export const AUTHORITIES = ['Urząd Skarbowy', 'Urząd Celno-Skarbowy', 'Dyrektor Izby Administracji Skarbowej',
  'Dyrektor KIS', 'Wójt / Burmistrz / Prezydent miasta', 'Samorządowe Kolegium Odwoławcze', 'WSA we Wrocławiu', 'NSA', 'ZUS', 'Inny'];
export const TAX_KINDS = ['VAT', 'CIT', 'PIT', 'PCC', 'Podatek od nieruchomości', 'Akcyza', 'Podatek od spadków i darowizn', 'Składki ZUS', 'Inny'];

export const FEE_TYPE = {
  godzinowa: 'Stawka godzinowa',
  ryczalt: 'Ryczałt',
  abonament: 'Abonament miesięczny',
  success_fee: 'Success fee',
  mieszana: 'Mieszane',
};
export const BILLING_TYPE = { godzinowa: 'Stawka godzinowa', ryczalt: 'Ryczałt za sprawę', abonament: 'Abonament', mieszana: 'Mieszane' };
export const SUBSCRIPTIONS = ['Doradztwo podatkowe (2 h / mies.)', 'Doradztwo podatkowe + Wsparcie Twojej księgowości'];
export const AML_RISK = { niskie: 'Niskie', standardowe: 'Standardowe', podwyzszone: 'Podwyższone' };

export const DEADLINE_KIND = {
  procesowy: { label: 'Termin procesowy', color: '#A4462F' },
  organ: { label: 'Termin organu', color: '#7A5A37' },
  przedawnienie: { label: 'Przedawnienie', color: '#5C4228' },
  wewnetrzny: { label: 'Wewnętrzny', color: '#6A6157' },
  spotkanie: { label: 'Spotkanie', color: '#3E6B47' },
};

export const JOURNAL_KIND = {
  pismo_otrzymane: 'Pismo otrzymane',
  pismo_wyslane: 'Pismo wysłane',
  czynnosc: 'Czynność / udział w czynności',
  telefon: 'Telefon / e-mail',
  spotkanie: 'Spotkanie',
  notatka: 'Notatka',
};

export const ORDER_STATUS = {
  projekt: { label: 'Projekt', cls: 'unk' },
  wyslane: { label: 'Wysłane do klienta', cls: 'wait' },
  podpisane: { label: 'Podpisane', cls: 'done' },
  anulowane: { label: 'Anulowane', cls: 'no' },
};

// ---- Kalkulator terminów (od daty doręczenia) ----
// Termin przypadający na sobotę lub dzień ustawowo wolny przesuwa się na najbliższy dzień roboczy
// (art. 12 § 5 Ordynacji podatkowej, art. 83 § 2 p.p.s.a.). Wynik zawsze zweryfikuj.
export const DEADLINE_RULES = {
  odwolanie:   { label: 'Odwołanie od decyzji', days: 14, basis: 'art. 223 § 2 pkt 1 Ordynacji podatkowej', kind: 'procesowy' },
  zazalenie:   { label: 'Zażalenie na postanowienie', days: 7, basis: 'art. 236 § 2 pkt 1 Ordynacji podatkowej', kind: 'procesowy' },
  art200:      { label: 'Wypowiedzenie się co do materiału dowodowego', days: 7, basis: 'art. 200 § 1 Ordynacji podatkowej', kind: 'procesowy' },
  protokol:    { label: 'Zastrzeżenia do protokołu kontroli podatkowej', days: 14, basis: 'art. 291 § 1 Ordynacji podatkowej', kind: 'procesowy' },
  wynik_ucs:   { label: 'Zastrzeżenia do wyniku kontroli celno-skarbowej', days: 14, basis: 'art. 84 ust. 1 ustawy o KAS', kind: 'procesowy' },
  korekta_ucs: { label: 'Korekta deklaracji po wyniku kontroli celno-skarbowej', days: 14, basis: 'art. 82 ust. 3 ustawy o KAS', kind: 'procesowy' },
  wsa:         { label: 'Skarga do WSA (wnoszona przez organ)', days: 30, basis: 'art. 53 § 1 p.p.s.a.', kind: 'procesowy' },
  uzasadnienie:{ label: 'Wniosek o uzasadnienie wyroku WSA', days: 7, basis: 'art. 141 § 2 p.p.s.a.', kind: 'procesowy' },
  nsa:         { label: 'Skarga kasacyjna do NSA', days: 30, basis: 'art. 177 § 1 p.p.s.a.', kind: 'procesowy' },
  interpretacja: { label: 'Termin wydania interpretacji (od wpływu wniosku)', months: 3, basis: 'art. 14d § 1 Ordynacji podatkowej', kind: 'organ', noShift: true },
  wis:         { label: 'Termin wydania WIS (od wpływu wniosku)', months: 3, basis: 'art. 42b ustawy o VAT', kind: 'organ', noShift: true },
  wezwanie:    { label: 'Odpowiedź na wezwanie organu (liczba dni z wezwania)', days: null, basis: 'termin wyznaczony w wezwaniu', kind: 'procesowy' },
};

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function computeDeadline(ruleKey, servedIso, customDays) {
  const r = DEADLINE_RULES[ruleKey];
  if (!r || !servedIso) return null;
  const [y, m, d] = servedIso.split('-').map(Number);
  const base = new Date(y, m - 1, d);
  let due;
  if (r.months) { due = new Date(base); due.setMonth(due.getMonth() + r.months); }
  else {
    const days = r.days ?? Number(customDays);
    if (!days) return null;
    due = new Date(base); due.setDate(due.getDate() + days); // dzień doręczenia się nie wlicza
  }
  const nominal = iso(due);
  const shifted = r.noShift ? due : businessDay(new Date(due));
  return { date: iso(shifted), moved: iso(shifted) !== nominal, nominal, rule: r };
}

// Przedawnienie zobowiązania: 5 lat od końca roku, w którym upłynął termin płatności (art. 70 § 1 OP)
export function limitationDate(paymentYear) {
  const y = Number(paymentYear);
  return y ? `${y + 5}-12-31` : null;
}

export const fmtDate = (isoStr) => isoStr ? new Date(isoStr + (isoStr.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('pl-PL') : '';
export const todayIso = () => iso(new Date());
export const addDaysIso = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
export const money = (v) => v === null || v === undefined || v === '' ? '' : Number(v).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';
export const hours = (min) => (Math.round(min / 6) / 10).toLocaleString('pl-PL') + ' h';
