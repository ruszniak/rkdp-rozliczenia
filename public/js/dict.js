// Słowniki i terminy

export const STATUS = {
  todo:         { label: 'Do zrobienia',    mark: '',  color: '#FFFFFF' },
  in_progress:  { label: 'Do zrobienia',    mark: '',  color: '#FFFFFF' },
  missing_docs: { label: 'Brak dokumentów', mark: '!', color: '#A4462F' },
  reminded:     { label: 'Wysłano przypomnienie', mark: '@', color: '#B7862F' },
  done:         { label: 'Zrobione',        mark: '✓', color: '#3E6B47' },
  na:           { label: 'Nie dotyczy',     mark: '–', color: '#D8CFC1' },
};
export const STATUS_ORDER = ['done', 'na', 'missing_docs', 'reminded', 'todo'];

export const LEGAL_FORM = {
  jdg: 'JDG',
  spolka_cywilna: 'Spółka cywilna',
  spolka_jawna: 'Spółka jawna',
  spolka_partnerska: 'Spółka partnerska',
  spolka_komandytowa: 'Spółka komandytowa',
  spzoo: 'Sp. z o.o.',
  spolka_akcyjna: 'Spółka akcyjna / PSA',
  fundacja_stowarzyszenie: 'Fundacja / stowarzyszenie',
  wspolnota: 'Wspólnota mieszkaniowa',
  inna: 'Inna',
};
export const LEGAL_SHORT = {
  jdg: 'JDG', spolka_cywilna: 'S.C.', spolka_jawna: 'Sp. j.', spolka_partnerska: 'Sp. p.',
  spolka_komandytowa: 'Sp. k.', spzoo: 'Sp. z o.o.', spolka_akcyjna: 'S.A./PSA',
  fundacja_stowarzyszenie: 'Fund./Stow.', wspolnota: 'Wspólnota', inna: 'Inna',
};
export const FORM_GROUP = {
  jdg: 'jdg', spolka_cywilna: 'osobowe', spolka_jawna: 'osobowe', spolka_partnerska: 'osobowe',
  spolka_komandytowa: 'osobowe', spzoo: 'kapitalowe', spolka_akcyjna: 'kapitalowe',
};
export const isPartnership = f => FORM_GROUP[f] === 'osobowe';
// do której tabeli księgowej trafia klient (tak samo jak client_section w bazie)
export const sectionOf = c => FORM_GROUP[c.legal_form] === 'kapitalowe' ? 'kapitalowe'
  : (c.legal_form === 'jdg' || FORM_GROUP[c.legal_form] === 'osobowe') ? 'osobowe'
  : c.bookkeeping === 'pelna' ? 'kapitalowe' : 'osobowe';
export const isCompany = f => FORM_GROUP[f] === 'kapitalowe';

export const CLIENT_STATUS = { aktywny: 'Aktywny', zawieszony: 'Zawieszony', zakonczony: 'Współpraca zakończona' };
export const BOOKKEEPING = { kpir: 'KPiR', ryczalt: 'Ewidencja przychodów (ryczałt)', pelna: 'Pełna księgowość (KH)' };
export const PIT_FORM = { skala: 'Skala podatkowa (12/32%)', liniowy: 'Podatek liniowy 19%', ryczalt: 'Ryczałt od przychodów ewidencjonowanych', karta: 'Karta podatkowa' };
export const PIT_SHORT = { skala: 'Skala', liniowy: 'Liniowy', ryczalt: 'Ryczałt', karta: 'Karta' };
export const ADVANCES = { miesieczne: 'Miesięczne', kwartalne: 'Kwartalne', uproszczone: 'Uproszczone' };
export const CIT_ADVANCES = { ...ADVANCES, brak: 'Brak zaliczek' };
export const ZUS_TYPE = {
  ulga_na_start: 'Ulga na start (tylko zdrowotna, 6 mies.)',
  preferencyjny: 'Preferencyjny (mały ZUS, 24 mies.)',
  maly_zus_plus: 'Mały ZUS Plus',
  pelny: 'Pełny ZUS',
  zbieg_etat: 'Zbieg z etatem (tylko zdrowotna)',
  emeryt_rencista: 'Emeryt / rencista (zdrowotna)',
  tylko_zdrowotna: 'Tylko zdrowotna (inne)',
  brak: 'Nie płaci / nie dotyczy',
};
export const ZUS_SHORT = {
  ulga_na_start: 'Ulga na start', preferencyjny: 'Preferencyjny', maly_zus_plus: 'Mały ZUS+',
  pelny: 'Pełny', zbieg_etat: 'Zbieg z etatem', emeryt_rencista: 'Emeryt', tylko_zdrowotna: 'Zdrowotna', brak: '—',
};
export const CIT_TYPE = { estonski: 'Estoński CIT (ryczałt od dochodów spółek)', zwykly_19: 'CIT 19%', maly_podatnik_9: 'CIT 9% (mały podatnik)' };
export const CIT_SHORT = { estonski: 'Estoński', zwykly_19: 'CIT 19%', maly_podatnik_9: 'CIT 9%' };
export const VAT_STATUS = {
  czynny_miesieczny: 'Czynny – rozliczenie miesięczne',
  czynny_kwartalny: 'Czynny – rozliczenie kwartalne',
  zwolniony_podmiotowo: 'Zwolniony podmiotowo (limit, art. 113)',
  zwolniony_przedmiotowo: 'Zwolniony przedmiotowo (rodzaj usług, art. 43)',
  niezarejestrowany: 'Niezarejestrowany / nie dotyczy',
};
export const VAT_SHORT = {
  czynny_miesieczny: 'VAT mies.', czynny_kwartalny: 'VAT kwart.', zwolniony_podmiotowo: 'Zw. – limit',
  zwolniony_przedmiotowo: 'Zw. – usługi', niezarejestrowany: 'Bez VAT',
};
export const ROLE = { admin: 'Administrator', full: 'Pełny dostęp', limited: 'Tylko przypisani klienci' };
export const RULE = {
  always: 'Zawsze', payroll: 'Gdy są pracownicy', zus: 'ZUS (właściciel / pracownicy / wspólnicy)',
  income_tax: 'PIT/CIT (wg zaliczek)', vat_return: 'VAT (wg okresu rozliczeń)', jpk: 'JPK (czynni VAT)',
};

export const FIELD_LABELS = {
  name: 'Nazwa', status: 'Status', legal_form: 'Forma prawna', bookkeeping: 'Księgowość', nip: 'NIP',
  regon: 'REGON', krs: 'KRS', address: 'Adres', contact_person: 'Osoba kontaktowa', email: 'E-mail',
  phone: 'Telefon', docs_channel: 'Dokumenty', pit_form: 'Forma opodatkowania', ryczalt_rates: 'Stawki ryczałtu',
  pit_advances: 'Zaliczki PIT', zus_type: 'Rodzaj ZUS', zus_sickness: 'Chorobowe', has_employees: 'Pracownicy',
  employees_count: 'Liczba pracowników', ppk: 'PPK', cit_type: 'CIT', cit_advances: 'Zaliczki CIT',
  fiscal_year: 'Rok podatkowy', vat_status: 'VAT', vat_ue: 'VAT-UE', cash_register: 'Kasa fiskalna',
  ksef_access: 'Uprawnienia KSeF', contract_signed: 'Umowa', contract_date: 'Data umowy',
  monthly_fee: 'Wynagrodzenie biura', upl1: 'UPL-1', zus_pel: 'ZUS PEL', crbr_reported: 'CRBR', notes: 'Notatki',
  status_entry: 'Status', notes_p: 'Uwagi', questions: 'Pytania', assignee_id: 'Osoba', full_name: 'Wspólnik',
};

// ---- Terminy (dzień roboczy wg Ordynacji podatkowej: sobota i święta przesuwają termin) ----
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4,
    f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), hh = (19 * a + b - d - g + 15) % 30,
    i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - hh - k) % 7, m = Math.floor((a + 11 * hh + 22 * l) / 451),
    month = Math.floor((hh + l - 7 * m + 114) / 31), day = ((hh + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}
function holidays(y) {
  const e = easter(y), add = n => { const d = new Date(e); d.setDate(d.getDate() + n); return d; };
  const fixed = ['01-01', '01-06', '05-01', '05-03', '08-15', '11-01', '11-11', '12-24', '12-25', '12-26'];
  const set = new Set(fixed.map(s => `${y}-${s}`));
  [e, add(1), add(49), add(60)].forEach(d => set.add(iso(d)));
  return set;
}
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function businessDay(d) {
  const hol = holidays(d.getFullYear());
  while (d.getDay() === 0 || d.getDay() === 6 || hol.has(iso(d))) d.setDate(d.getDate() + 1);
  return d;
}

export function deadlinesFor(period, area = 'ksiegowosc') {
  const [y, m] = period.split('-').map(Number);
  const mk = (day) => {
    const nominal = new Date(y, m, day); // miesiąc po okresie
    const real = businessDay(new Date(nominal));
    return { date: real, moved: real.getDate() !== day };
  };
  return area === 'kadry'
    ? [
      { label: 'ZUS – spółki z o.o.', ...mk(15) },
      { label: 'ZUS – JDG i spółki osobowe', ...mk(20) },
      { label: 'PIT-4 (zaliczki od wynagrodzeń)', ...mk(20) },
    ]
    : [
      { label: 'PIT / CIT', ...mk(20) },
      { label: 'VAT i JPK_V7', ...mk(25) },
    ];
}
