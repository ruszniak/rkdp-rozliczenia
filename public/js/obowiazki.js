// Obowiązki podatkowe i ZUS klientów RKDP – wyliczane z profilu klienta (forma, VAT, PIT/CIT, ZUS, pracownicy).
// Terminy przesuwane na najbliższy dzień roboczy (Ordynacja podatkowa). Zamknięcie roku – kratki roczne.
import { businessDay, sectionOf } from './dict.js';

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const lastDay = (y, m) => new Date(y, m + 1, 0).getDate(); // m: 0–11
// termin: rok, miesiąc (0–11), dzień (0 = ostatni dzień miesiąca)
const due = (y, m, d) => {
  const nominal = new Date(y, m, d || lastDay(y, m));
  const real = businessDay(new Date(nominal));
  return { date: iso(real), moved: real.getTime() !== nominal.getTime() };
};
const MONTH_GEN = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
const MONTH_NOM = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
export const fmtDue = s => { const [y, m, d] = s.split('-').map(Number); return `${d} ${MONTH_GEN[m - 1]} ${y}`; };

// spółka komandytowa jest podatnikiem CIT – rozliczamy jak spółkę kapitałową
export const isCitPayer = c => sectionOf(c) === 'kapitalowe' || c.legal_form === 'spolka_komandytowa';
const vatActive = c => /^czynny/.test(c.vat_status || '');
const zusOwner = c => c.legal_form === 'jdg' || ['spolka_cywilna', 'spolka_jawna', 'spolka_partnerska'].includes(c.legal_form);
const hasZusOwner = c => zusOwner(c) && c.zus_type && c.zus_type !== 'brak';

// Rodzaje obowiązków – kod, nazwa, kratka miesięczna w rozliczeniach (status)
export const KINDS = {
  vat:     { label: 'VAT i JPK_V7', short: 'JPK_V7', task: 'jpk', color: '#806341' },
  vat_ue:  { label: 'VAT-UE', short: 'VAT-UE', color: '#9C7A52' },
  pit:     { label: 'Zaliczka PIT / ryczałt', short: 'PIT', task: 'pit_cit', color: '#B38F62' },
  cit:     { label: 'Zaliczka CIT', short: 'CIT', task: 'pit_cit', color: '#B38F62' },
  zus:     { label: 'ZUS (DRA)', short: 'ZUS', task: 'zus_wyslany', area: 'kadry', color: '#5E4529' },
  pit4:    { label: 'PIT-4 – zaliczki od wynagrodzeń', short: 'PIT-4', task: 'pit4', area: 'kadry', color: '#6F5534' },
  roczne:  { label: 'Obowiązek roczny', short: 'Rok', color: '#1D1A16' },
};

// Zamknięcie roku: kratki dla roku podatkowego `year` (terminy w roku year+1, chyba że opisano inaczej)
// group: 'kapitalowe' | 'osobowe' | 'all' · opt: informacyjne (nie liczą się do „zamknięty”)
export const YEAR_TASKS = [
  { code: 'inwentaryzacja', label: 'Inwentaryzacja', group: 'kapitalowe', due: y => due(y, 11, 31), tip: 'Inwentaryzacja na dzień bilansowy (art. 26 ustawy o rachunkowości).' },
  { code: 'spis_natury', label: 'Spis z natury', group: 'osobowe', due: y => due(y, 11, 31), tip: 'Spis z natury na koniec roku podatkowego (KPiR) – wpis do księgi.', when: c => c.bookkeeping === 'kpir' },
  { code: 'pit11', label: 'PIT-11 / PIT-4R', group: 'all', due: y => due(y + 1, 0, 0), tip: 'Informacje PIT-11 dla pracowników i zleceniobiorców oraz deklaracja PIT-4R – do końca stycznia.', when: c => c.has_employees === true },
  { code: 'sf', label: 'Sprawozdanie finansowe', group: 'kapitalowe', due: y => due(y + 1, 2, 0), tip: 'Sporządzenie i podpisanie sprawozdania finansowego – do końca 3. miesiąca po dniu bilansowym.' },
  { code: 'cit8', label: 'CIT-8', group: 'kapitalowe', due: y => due(y + 1, 2, 0), tip: 'Zeznanie CIT-8 (przy estońskim CIT – CIT-8E) – do końca 3. miesiąca następnego roku.', labelFor: c => c.cit_type === 'estonski' ? 'CIT-8E' : 'CIT-8' },
  { code: 'jpk_cit', label: 'JPK_CIT', group: 'kapitalowe', due: y => due(y + 1, 2, 0), tip: 'Ewidencja JPK_KR_PD składana w terminie zeznania CIT: za lata od 2026 przez czynnych podatników VAT, od 2027 przez wszystkich podatników CIT prowadzących księgi.',
    when: (c, y) => y >= 2027 || (y >= 2026 && vatActive(c)) },
  { code: 'ift2r', label: 'IFT-2R', group: 'kapitalowe', opt: true, due: y => due(y + 1, 2, 0), tip: 'Tylko gdy były wypłaty dla nierezydentów (np. licencje, usługi niematerialne) – do końca 3. miesiąca.' },
  { code: 'pit_roczny', label: 'PIT roczny', group: 'osobowe', due: y => due(y + 1, 3, 30), tip: 'Zeznanie PIT-36 / PIT-36L / PIT-28 – do 30 kwietnia.', labelFor: c => c.pit_form === 'liniowy' ? 'PIT-36L' : c.pit_form === 'ryczalt' ? 'PIT-28' : 'PIT-36' },
  { code: 'zdrowotna', label: 'Roczna zdrowotna', group: 'osobowe', due: y => due(y + 1, 4, 20), tip: 'Roczne rozliczenie składki zdrowotnej przedsiębiorcy w deklaracji ZUS za kwiecień – do 20 maja.', when: hasZusOwner },
  { code: 'zatwierdzenie', label: 'Zatwierdzenie SF', group: 'kapitalowe', due: y => due(y + 1, 5, 30), tip: 'Uchwała zgromadzenia wspólników zatwierdzająca sprawozdanie i podział zysku – do 30 czerwca.' },
  { code: 'krs_sf', label: 'SF do KRS / KAS', group: 'kapitalowe', due: y => due(y + 1, 6, 15), tip: 'Złożenie sprawozdania, uchwał i sprawozdania z działalności do Repozytorium Dokumentów Finansowych (KRS) – 15 dni od zatwierdzenia.' },
  { code: 'tpr', label: 'TPR', group: 'kapitalowe', opt: true, due: y => due(y + 1, 10, 30), tip: 'Informacja o cenach transferowych TPR – tylko gdy transakcje z podmiotami powiązanymi przekroczyły progi – do końca 11. miesiąca.' },
  { code: 'crbr', label: 'CRBR', group: 'kapitalowe', opt: true, due: y => due(y + 1, 5, 30), tip: 'Sprawdzenie aktualności wpisu w CRBR (beneficjenci rzeczywiści) – zgłoszenie zmian w 14 dni.' },
];
export const yearGroup = c => isCitPayer(c) ? 'kapitalowe' : 'osobowe';
export const yearTasksFor = (c, y) => YEAR_TASKS.filter(t => (t.group === 'all' || t.group === yearGroup(c)));
export const yearApplies = (t, c, y) => !t.when || t.when(c, y);
export const yearLabel = (t, c) => (t.labelFor ? t.labelFor(c) : t.label);

// Obowiązki klienta w miesiącu kalendarzowym (rok y, miesiąc m: 1–12) – terminy przypadające w tym miesiącu
export function obligationsInMonth(c, y, m) {
  const out = [];
  if (c.status !== 'aktywny') return out;
  const prevY = m === 1 ? y - 1 : y, prevM = m === 1 ? 12 : m - 1; // okres, którego dotyczy termin
  const per = `${prevY}-${String(prevM).padStart(2, '0')}`;
  const add = (kind, d, extra = {}) => out.push({ kind, client: c, date: d.date, moved: d.moved, period: per, ...extra });
  const q = [3, 6, 9, 12].includes(prevM);
  // VAT
  if (c.vat_status === 'czynny_miesieczny') add('vat', due(y, m - 1, 25), { label: 'JPK_V7M – ewidencja i deklaracja' });
  else if (c.vat_status === 'czynny_kwartalny') add('vat', due(y, m - 1, 25), { label: q ? 'JPK_V7K – ewidencja i deklaracja za kwartał' : 'JPK_V7K – ewidencja' });
  if (c.vat_ue && vatActive(c)) add('vat_ue', due(y, m - 1, 25), { label: 'VAT-UE (gdy były transakcje)', opt: true });
  // podatek dochodowy
  if (isCitPayer(c)) {
    if (c.cit_type !== 'estonski' && c.cit_advances !== 'brak') {
      if (c.cit_advances === 'kwartalne') { if (q) add('cit', due(y, m - 1, 20), { label: 'Zaliczka CIT za kwartał' }); }
      else add('cit', due(y, m - 1, 20), { label: 'Zaliczka CIT' });
    }
  } else if (c.pit_form && c.pit_form !== 'karta') {
    const lbl = c.pit_form === 'ryczalt' ? 'Ryczałt od przychodów' : 'Zaliczka PIT';
    if (c.pit_advances === 'kwartalne') { if (q) add('pit', due(y, m - 1, 20), { label: lbl + ' za kwartał' }); }
    else add('pit', due(y, m - 1, 20), { label: lbl });
  }
  // ZUS i wynagrodzenia
  if (hasZusOwner(c) || c.has_employees) add('zus', due(y, m - 1, isCitPayer(c) && !hasZusOwner(c) ? 15 : 20), { label: hasZusOwner(c) ? 'ZUS – składki właściciela' + (c.has_employees ? ' i pracowników' : '') : 'ZUS – składki pracowników' });
  if (c.has_employees) add('pit4', due(y, m - 1, 20), { label: 'PIT-4 – zaliczki od wynagrodzeń' });
  // roczne (za rok y-1 albo bieżący) z terminem w tym miesiącu
  for (const yy of [y - 1, y]) {
    for (const t of yearTasksFor(c, yy)) {
      if (!yearApplies(t, c, yy)) continue;
      const d = t.due(yy);
      if (+d.date.slice(0, 4) === y && +d.date.slice(5, 7) === m) add('roczne', d, { label: `${yearLabel(t, c)} za ${yy}`, year: yy, code: t.code, opt: !!t.opt, tip: t.tip });
    }
  }
  return out;
}

export function obligationsInYear(c, y) {
  const out = [];
  for (let m = 1; m <= 12; m++) out.push(...obligationsInMonth(c, y, m));
  return out;
}

// Status obowiązku na podstawie kratek (miesięcznych z rozliczeń albo rocznych z zamknięcia roku)
// entries: Map client_id -> Map(period|code -> status) ; yearEntries: Map client_id -> Map(year|code -> status)
export function obligationStatus(o, entries, yearEntries) {
  if (o.kind === 'roczne') return yearEntries.get(o.client.id)?.get(`${o.year}|${o.code}`) || null;
  const k = KINDS[o.kind];
  if (!k.task) return null;
  return entries.get(o.client.id)?.get(`${o.period}|${k.task}`) || null;
}
export const MONTHS_NOM = MONTH_NOM;
