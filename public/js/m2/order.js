// Dokumenty M2 TAX na papierze firmowym: ZLECENIE (krótkie, 1 strona) i UMOWA (wg wzoru kancelarii).
// Jedna treść (lista bloków) → podgląd, PDF (druk) i Word (.docx).
import { FIRM, MATTER_TYPE } from './dict.js';
import { zip } from '../xlsx.js';

const P = '[……]';

// Papier firmowy: M2 TAX (domyślny) albo RKDP
export const M2_BRAND = {
  key: 'm2', logo: '/m2tax-logo.png', ratio: 302 / 900, alt: 'M2 TAX',
  lines: [FIRM.name, `${FIRM.address} · ${FIRM.web}`, `${FIRM.email} · tel. ${FIRM.phones}`],
  foot1: `KRS ${FIRM.krs} · NIP ${FIRM.nip} · REGON ${FIRM.regon}`, foot2: FIRM.court,
  firmName: FIRM.name, firmAddress: FIRM.address, city: 'Wrocław',
};
export const RKDP_BRAND = {
  key: 'rkdp', logo: '/logo-rkdp.png', ratio: 189 / 640, alt: 'RKDP',
  lines: ['RKDP spółka doradztwa podatkowego sp. z o.o.', 'ul. Beaty Artemskiej 11/44, 52-234 Wrocław · www.rkdp.pl', 'kancelaria@rkdp.pl'],
  foot1: 'KRS 0000812185 · NIP 8992871126 · REGON 384812329 · kapitał zakładowy 50 000 zł',
  foot2: 'Siedziba: ul. Czereśniowa 28d, 55-010 Ozorzyce · Sąd Rejonowy dla Wrocławia-Fabrycznej we Wrocławiu, VI Wydział Gospodarczy KRS',
  firmName: 'RKDP spółka doradztwa podatkowego sp. z o.o.', firmAddress: 'ul. Beaty Artemskiej 11/44, 52-234 Wrocław', city: 'Wrocław',
};
const MONTHS_GEN = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];

export function dateLong(iso) {
  if (!iso) return P;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS_GEN[m - 1]} ${y} r.`;
}
const dateShort = iso => iso ? iso.slice(0, 10).split('-').reverse().join('.') : P;

// 24000 → „24 000,00 zł” (z odstępem tysięcy także dla 4 cyfr, jak w umowach)
export function zl(v) {
  if (v === null || v === undefined || v === '' || isNaN(Number(v))) return null;
  const [i, f] = Number(v).toFixed(2).split('.');
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',' + f + ' zł';
}

// ---------- kwota słownie ----------
const U = ['', 'jeden', 'dwa', 'trzy', 'cztery', 'pięć', 'sześć', 'siedem', 'osiem', 'dziewięć'];
const T = ['dziesięć', 'jedenaście', 'dwanaście', 'trzynaście', 'czternaście', 'piętnaście', 'szesnaście', 'siedemnaście', 'osiemnaście', 'dziewiętnaście'];
const D = ['', '', 'dwadzieścia', 'trzydzieści', 'czterdzieści', 'pięćdziesiąt', 'sześćdziesiąt', 'siedemdziesiąt', 'osiemdziesiąt', 'dziewięćdziesiąt'];
const H = ['', 'sto', 'dwieście', 'trzysta', 'czterysta', 'pięćset', 'sześćset', 'siedemset', 'osiemset', 'dziewięćset'];
const G = [null, ['tysiąc', 'tysiące', 'tysięcy'], ['milion', 'miliony', 'milionów']];
const form = (n, f) => n === 1 ? f[0] : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? f[1] : f[2];
function words999(n) {
  const out = [H[Math.floor(n / 100)]];
  const r = n % 100;
  if (r >= 10 && r < 20) out.push(T[r - 10]); else out.push(D[Math.floor(r / 10)], U[r % 10]);
  return out.filter(Boolean).join(' ');
}
export function slownie(v) {
  const total = Math.round(Number(v) * 100);
  let n = Math.floor(total / 100);
  const gr = String(total % 100).padStart(2, '0');
  if (n === 0) return `zero złotych ${gr}/100`;
  const parts = []; let g = 0;
  const intPart = n;
  while (n > 0) {
    const k = n % 1000;
    if (k) parts.unshift(g === 0 ? words999(k) : (k === 1 ? G[g][0] : `${words999(k)} ${form(k, G[g])}`));
    n = Math.floor(n / 1000); g++;
  }
  return `${parts.join(' ')} ${form(intPart % 1000 === 0 && intPart > 0 ? 5 : intPart, ['złoty', 'złote', 'złotych'])} ${gr}/100`;
}
const kwota = v => zl(v) ? `${zl(v)} netto (słownie: ${slownie(v)})` : `${P} zł netto (słownie: ${P})`;

// odmiana „Michał Ruszniak” → „Michała Ruszniaka” (gdy brak gotowej formy w bazie)
function accName(full) {
  return (full || '').split(/\s+/).map(w => /ska$/i.test(w) ? w.slice(0, -1) + 'ą' : /cka$/i.test(w) ? w.slice(0, -1) + 'ą'
    : /a$/i.test(w) ? w.slice(0, -1) + 'ę' : /ek$/i.test(w) ? w.slice(0, -2) + 'ka' : /[bcćdfghjklłmnńprsśtwzźż]$/i.test(w) ? w + 'a' : w).join(' ');
}
const signerAcc = s => `${s.name_acc || accName(s.full_name)} – ${s.role_acc || 'partnera zarządzającego'}, doradcę podatkowego (nr wpisu ${s.license_no || P})`;
const signerCap = s => `${s.full_name} – ${(s.role_label || 'partner zarządzający').toLowerCase()}`;
const listPl = arr => arr.length <= 1 ? (arr[0] || '') : arr.slice(0, -1).join(', ') + ' lub ' + arr[arr.length - 1];

// ===================== ZLECENIE (minimum, 1 strona) =====================
export function orderBlocks(o, client, signer) {
  const c = client || {};
  const B = [];
  B.push({ t: 'title', text: 'ZLECENIE' });
  B.push({ t: 'meta', text: `nr ${o.number || '(nadany po zapisaniu)'} z dnia ${dateLong(o.order_date)}` });
  B.push({ t: 'parties', left: { label: 'Zleceniodawca', lines: [c.name || P, c.address, c.nip ? `NIP ${c.nip}` : null].filter(Boolean) },
    right: { label: 'Zleceniobiorca', lines: [FIRM.name, FIRM.address, `NIP ${FIRM.nip} · KRS ${FIRM.krs}`] } });
  let s = 0;
  const sec = t => { B.push({ t: 'h', text: `§ ${++s}. ${t}` }); n = 0; };
  let n = 0;
  const ust = text => text && B.push({ t: 'ust', n: `${++n}.`, text });

  sec('Przedmiot');
  ust(`Zleceniodawca zleca, a Zleceniobiorca przyjmuje do wykonania: ${(o.subject || P).trim().replace(/[.\s]+$/, '')}.`);
  const points = (o.scope || '').split('\n').map(x => x.replace(/^\s*[-•*\d.)]+\s*/, '').trim()).filter(Boolean);
  if (points.length) { ust('Zakres zlecenia obejmuje:'); points.forEach((x, i) => B.push({ t: 'pkt', n: `${i + 1})`, text: x })); }
  ust((o.term_text ? `Termin wykonania: ${o.term_text.trim().replace(/[.\s]+$/, '')}. ` : '') + 'Czynności nieobjęte zleceniem wymagają odrębnego uzgodnienia.');

  sec('Wynagrodzenie');
  const a = zl(o.fee_amount);
  ust({
    godzinowa: `Wynagrodzenie wynosi ${a || P} netto za godzinę pracy, rozliczaną z dokładnością do 15 minut według zestawienia czynności dołączanego do faktury.`,
    ryczalt: `Wynagrodzenie ryczałtowe wynosi ${a || P} netto.`,
    abonament: `Wynagrodzenie wynosi ${a || P} netto miesięcznie.`,
    success_fee: `Wynagrodzenie ustalane jest na zasadach z ust. 2${a ? `; wynagrodzenie podstawowe wynosi ${a} netto` : ''}.`,
    mieszana: `Wynagrodzenie ustalane jest na zasadach z ust. 2${a ? `; kwota bazowa wynosi ${a} netto` : ''}.`,
  }[o.fee_type] || (a ? `Wynagrodzenie wynosi ${a} netto.` : 'Wynagrodzenie strony ustalą w formie dokumentowej przed rozpoczęciem prac.'));
  ust(o.fee_notes?.trim());
  ust(`Do wynagrodzenia dolicza się VAT. Wynagrodzenie płatne jest w terminie ${o.payment_days || 14} dni od doręczenia faktury. Opłaty urzędowe (np. opłatę skarbową od pełnomocnictwa) ponosi Zleceniodawca.`);

  sec('Zasady wykonania');
  ust('Zleceniobiorca wykonuje zlecenie z należytą starannością zawodową, przez doradców podatkowych, i nie gwarantuje określonego rozstrzygnięcia organu lub sądu.');
  ust('Zleceniodawca przekazuje kompletne i prawdziwe informacje i dokumenty, a w razie potrzeby udziela pełnomocnictwa. Zleceniobiorca nie odpowiada za skutki przekazania informacji niepełnych lub nieprawdziwych.');
  ust('Odpowiedzialność Zleceniobiorcy, z wyjątkiem szkody wyrządzonej umyślnie, ograniczona jest do wysokości wynagrodzenia netto z tytułu zlecenia. Zleceniobiorca posiada obowiązkowe ubezpieczenie OC doradców podatkowych.');

  sec('Postanowienia końcowe');
  ust('Zleceniobiorca zachowuje tajemnicę zawodową (art. 37 ustawy o doradztwie podatkowym), a dane osobowe przetwarza jako administrator w celu wykonania zlecenia i obowiązków prawnych, w tym z ustawy o przeciwdziałaniu praniu pieniędzy oraz finansowaniu terroryzmu.');
  (o.extra_terms || '').split('\n').map(x => x.trim()).filter(Boolean).forEach(ust);
  ust('Zmiany zlecenia wymagają formy dokumentowej. W sprawach nieuregulowanych stosuje się przepisy Kodeksu cywilnego o umowie zlecenia (art. 750 k.c.).');

  B.push({ t: 'sign', left: { label: 'Zleceniodawca', lines: [c.contact_person || c.name || ''] },
    right: { label: 'Zleceniobiorca', lines: signer ? [`${signer.full_name}, doradca podatkowy nr ${signer.license_no || P}`] : [P] } });
  return B;
}

// ===================== UMOWA (ogólna – dla każdej sprawy podatkowej) =====================
// Zakres (§ 2 ust. 2), czas trwania (§ 11 ust. 1) i domyślne pełnomocnictwo zależą od rodzaju sprawy.
const KONTROLA = [
  'analizuje zawiadomienie o zamiarze wszczęcia kontroli lub upoważnienie do jej przeprowadzenia, w tym jego prawidłowość formalną, zakres przedmiotowy i podmiotowy oraz terminy;',
  'doradza Zleceniodawcy w kwestii skorzystania – przed wszczęciem kontroli lub w terminach wynikających z przepisów – z uprawnienia do złożenia korekty deklaracji (art. 81b Ordynacji podatkowej), z zastrzeżeniem ust. 4;',
  'przygotowuje Zleceniodawcę do kontroli, w tym przeprowadza przegląd dokumentacji objętej Zakresem Sprawy i wskazuje obszary ryzyka;',
  'uczestniczy, jako pełnomocnik, w czynnościach kontrolnych, w tym w badaniu ksiąg i dokumentów, oględzinach, przesłuchaniach świadków i Zleceniodawcy (lub osób go reprezentujących), w miejscu prowadzenia kontroli lub w siedzibie Organu;',
  'przygotowuje i składa w imieniu Zleceniodawcy pisma, wyjaśnienia, wnioski dowodowe, zażalenia i inne pisma procesowe, w tym wnioski o przedłużenie terminów oraz sprzeciw wobec czynności kontrolnych podejmowanych z naruszeniem przepisów (art. 59 ustawy – Prawo przedsiębiorców);',
  'weryfikuje przestrzeganie przez Organ ograniczeń czasu trwania kontroli (art. 55 ustawy – Prawo przedsiębiorców) oraz zakazu równoczesnego prowadzenia kontroli (art. 54 tej ustawy);',
  'analizuje protokół z badania ksiąg sporządzony w toku kontroli i w razie potrzeby składa do niego zastrzeżenia (art. 193 Ordynacji podatkowej);',
  'analizuje protokół kontroli (lub wynik kontroli celno-skarbowej), przygotowuje i składa zastrzeżenia lub wyjaśnienia w ustawowym terminie (art. 291 Ordynacji podatkowej / art. 83 ustawy o KAS) oraz doradza w zakresie złożenia korekty deklaracji po zakończeniu kontroli (art. 81b Ordynacji podatkowej / art. 82 ustawy o KAS);',
  'informuje Zleceniodawcę o przebiegu kontroli, jej skutkach i dalszych możliwych działaniach.',
];
const PPS1 = 'szczególne (PPS-1)';
export const MATTER_TEMPLATES = {
  konsultacja: { poa: 'nie dotyczy', organ: false, end: 'do przekazania Zleceniodawcy opinii (analizy) podatkowej i udzielenia wyjaśnień do niej w terminie 14 dni od jej przekazania', scope: [
    'analizuje stan faktyczny oraz dokumenty przekazane przez Zleceniodawcę;',
    'identyfikuje skutki podatkowe i ryzyka oraz wskazuje możliwe rozwiązania;',
    'sporządza i przekazuje Zleceniodawcy opinię (analizę) podatkową w formie dokumentowej;',
    'udziela wyjaśnień do opinii, w tym podczas spotkania lub konsultacji telefonicznej.'] },
  interpretacja: { poa: PPS1, organ: true, end: 'do doręczenia interpretacji indywidualnej albo innego rozstrzygnięcia kończącego postępowanie w sprawie jej wydania', scope: [
    'analizuje stan faktyczny lub zdarzenie przyszłe i ustala z Zleceniodawcą zakres pytań;',
    'przygotowuje wniosek o wydanie interpretacji indywidualnej wraz ze stanowiskiem Zleceniodawcy i jego uzasadnieniem;',
    'składa wniosek do Dyrektora Krajowej Informacji Skarbowej w imieniu Zleceniodawcy;',
    'odpowiada na wezwania do uzupełnienia braków wniosku;',
    'analizuje wydaną interpretację i informuje Zleceniodawcę o jej skutkach oraz o możliwości jej zaskarżenia.'] },
  wis: { poa: PPS1, organ: true, end: 'do doręczenia wiążącej informacji stawkowej albo innego rozstrzygnięcia kończącego postępowanie w sprawie jej wydania', scope: [
    'analizuje towar lub usługę oraz ich klasyfikację;',
    'przygotowuje wniosek o wydanie wiążącej informacji stawkowej (WIS) wraz z opisem towaru lub usługi;',
    'składa wniosek do Dyrektora Krajowej Informacji Skarbowej w imieniu Zleceniodawcy i odpowiada na wezwania;',
    'analizuje wydaną WIS i informuje Zleceniodawcę o jej skutkach oraz o możliwości jej zaskarżenia.'] },
  czynnosci_sprawdzajace: { poa: PPS1, organ: true, served: true, end: 'do zakończenia czynności sprawdzających', scope: [
    'analizuje wezwanie Organu i jego podstawę prawną;',
    'przygotowuje i składa odpowiedzi, wyjaśnienia oraz zestawienia dokumentów;',
    'reprezentuje Zleceniodawcę w kontaktach z Organem jako pełnomocnik;',
    'doradza w zakresie ewentualnej korekty deklaracji;',
    'informuje Zleceniodawcę o wyniku czynności i dalszych możliwych działaniach.'] },
  kontrola_podatkowa: { poa: PPS1, organ: true, served: true, end: 'do dnia złożenia zastrzeżeń lub wyjaśnień do protokołu kontroli (lub wyniku kontroli celno-skarbowej), a jeżeli nie zostaną złożone – do dnia upływu terminu na ich złożenie', scope: KONTROLA, kontrola: true },
  kontrola_ucs: { poa: PPS1, organ: true, served: true, end: 'do dnia złożenia zastrzeżeń do wyniku kontroli celno-skarbowej, a jeżeli nie zostaną złożone – do dnia upływu terminu na ich złożenie', scope: KONTROLA, kontrola: true },
  postepowanie_podatkowe: { poa: PPS1, organ: true, served: true, end: 'do doręczenia decyzji organu pierwszej instancji albo innego rozstrzygnięcia kończącego postępowanie w tej instancji', scope: [
    'analizuje postanowienie o wszczęciu postępowania, akta sprawy i zgromadzony materiał dowodowy;',
    'przygotowuje i składa pisma, wyjaśnienia, wnioski dowodowe oraz zażalenia na postanowienia;',
    'uczestniczy jako pełnomocnik w czynnościach postępowania, w tym w przesłuchaniach i przeglądaniu akt;',
    'wypowiada się w sprawie zebranego materiału dowodowego (art. 200 Ordynacji podatkowej);',
    'analizuje decyzję Organu i informuje Zleceniodawcę o możliwości i zasadności jej zaskarżenia.'] },
  odwolanie: { poa: PPS1, organ: true, served: true, end: 'do doręczenia rozstrzygnięcia organu drugiej instancji', scope: [
    'analizuje decyzję (postanowienie) organu pierwszej instancji oraz akta sprawy;',
    'przygotowuje i wnosi odwołanie (zażalenie) w ustawowym terminie;',
    'reprezentuje Zleceniodawcę w postępowaniu odwoławczym, w tym składa pisma i wnioski dowodowe;',
    'wypowiada się w sprawie zebranego materiału dowodowego;',
    'analizuje rozstrzygnięcie organu drugiej instancji i informuje o możliwości wniesienia skargi do sądu administracyjnego.'] },
  wsa: { poa: 'procesowe (art. 35 p.p.s.a.)', organ: true, served: true, end: 'do doręczenia wyroku wojewódzkiego sądu administracyjnego wraz z uzasadnieniem albo innego orzeczenia kończącego postępowanie', scope: [
    'analizuje rozstrzygnięcie Organu i akta sprawy pod kątem zasadności skargi;',
    'przygotowuje i wnosi skargę do wojewódzkiego sądu administracyjnego za pośrednictwem Organu, w tym – jeżeli jest to uzasadnione – wniosek o wstrzymanie wykonania;',
    'reprezentuje Zleceniodawcę przed sądem, składa pisma procesowe i uczestniczy w rozprawie;',
    'analizuje wyrok wraz z uzasadnieniem i informuje o możliwości wniesienia skargi kasacyjnej.'] },
  nsa: { poa: 'procesowe (art. 35 p.p.s.a.)', organ: true, served: true, end: 'do doręczenia orzeczenia Naczelnego Sądu Administracyjnego kończącego postępowanie', scope: [
    'analizuje wyrok wojewódzkiego sądu administracyjnego wraz z uzasadnieniem;',
    'przygotowuje i wnosi skargę kasacyjną albo odpowiedź na skargę kasacyjną;',
    'reprezentuje Zleceniodawcę przed Naczelnym Sądem Administracyjnym, składa pisma procesowe i uczestniczy w rozprawie;',
    'informuje Zleceniodawcę o rozstrzygnięciu i jego skutkach.'] },
  egzekucja: { poa: PPS1, organ: true, served: true, end: 'do rozpatrzenia środków i wniosków złożonych w Zakresie Sprawy przez organ ostatniej instancji', scope: [
    'analizuje tytuł wykonawczy, zawiadomienia i czynności egzekucyjne lub zabezpieczające;',
    'przygotowuje i składa zarzuty, wnioski (w szczególności o umorzenie, zawieszenie, odroczenie lub rozłożenie na raty) oraz zażalenia;',
    'reprezentuje Zleceniodawcę przed organem egzekucyjnym i wierzycielem;',
    'informuje Zleceniodawcę o rozstrzygnięciach i dalszych możliwych działaniach.'] },
  podatki_lokalne: { poa: PPS1, organ: true, served: true, end: 'do doręczenia rozstrzygnięcia organu pierwszej instancji w Zakresie Sprawy', scope: [
    'analizuje decyzję, wezwanie lub informację organu podatkowego oraz stan faktyczny nieruchomości;',
    'przygotowuje i składa pisma, wyjaśnienia, korekty informacji lub deklaracji oraz wnioski;',
    'reprezentuje Zleceniodawcę przed Organem jako pełnomocnik;',
    'informuje Zleceniodawcę o rozstrzygnięciu i o możliwości jego zaskarżenia.'] },
  nadplata: { poa: PPS1, organ: true, end: 'do doręczenia rozstrzygnięcia w sprawie stwierdzenia nadpłaty lub zwrotu podatku', scope: [
    'analizuje rozliczenia i dokumenty pod kątem powstania nadpłaty lub prawa do zwrotu podatku;',
    'przygotowuje wniosek o stwierdzenie nadpłaty (zwrot podatku) wraz z korektą deklaracji i uzasadnieniem;',
    'reprezentuje Zleceniodawcę w postępowaniu w sprawie stwierdzenia nadpłaty lub zwrotu;',
    'informuje Zleceniodawcę o rozstrzygnięciu i o możliwości jego zaskarżenia.'] },
  optymalizacja: { poa: 'nie dotyczy', organ: false, end: 'do przekazania Zleceniodawcy raportu z rekomendacją i zakończenia wsparcia we wdrożeniu, nie dłużej jednak niż 3 miesiące od przekazania raportu', scope: [
    'analizuje sytuację podatkową, strukturę działalności i planowane zdarzenia;',
    'przedstawia warianty rozwiązań wraz z oceną skutków podatkowych i ryzyk, w tym w zakresie klauzuli przeciwko unikaniu opodatkowania i raportowania schematów podatkowych (MDR);',
    'sporządza raport z rekomendacją;',
    'wspiera Zleceniodawcę we wdrożeniu wybranego rozwiązania w zakresie doradztwa podatkowego.'] },
  abonament: { poa: 'nie dotyczy (w razie potrzeby szczególne PPS-1)', organ: false, end: 'na czas nieokreślony', scope: [
    'udziela bieżących konsultacji podatkowych telefonicznie, w formie dokumentowej i na spotkaniach;',
    'analizuje dokumenty i zdarzenia gospodarcze przedstawione przez Zleceniodawcę;',
    'sporządza krótkie opinie i odpowiedzi na pytania podatkowe;',
    'współpracuje z księgową lub biurem rachunkowym Zleceniodawcy w zakresie rozliczeń podatkowych.'] },
  inne: { poa: PPS1, organ: false, end: 'do wykonania czynności objętych Zakresem Sprawy', scope: [
    'analizuje stan faktyczny oraz dokumenty przekazane przez Zleceniodawcę;',
    'wykonuje czynności doradztwa podatkowego opisane w Załączniku nr 1;',
    'informuje Zleceniodawcę o wynikach i dalszych możliwych działaniach.'] },
};
export const matterTemplate = t => MATTER_TEMPLATES[t] || MATTER_TEMPLATES.inne;

export const CONTRACT_DEFAULTS = {
  place: 'Wrocław',
  matter_type: 'konsultacja',
  variant: 'A',
  lump_sum: null, lump_days: 7,
  hourly_rate: 500, advance: null, advance_days: 7,
  monthly_fee: null, monthly_hours: 2,
  travel_pct: '100',
  liability: 'trzykrotnosc', liability_amount: null,
  rate_partner: 500, rate_consultant: 500,
  payment_days: 7,
};

export function defaultClientParty(c) {
  if (!c?.name) return '';
  if (c.kind === 'osoba') return `${c.name}${c.address ? `, adres: ${c.address}` : ''}${c.nip ? `, NIP ${c.nip}` : ''}`;
  const reg = c.krs ? `, wpisaną do rejestru przedsiębiorców Krajowego Rejestru Sądowego pod nr KRS ${c.krs}` : '';
  return `${c.name} z siedzibą pod adresem: ${c.address || P}${reg}, NIP ${c.nip || P}${c.regon ? `, REGON ${c.regon}` : ''}`;
}

export function contractSubject(p) {
  return `${MATTER_TYPE[p.matter_type] || 'Doradztwo podatkowe'}${p.tax ? ` – ${p.tax}` : ''}${p.period ? ` ${p.period}` : ''}`;
}

export function contractBlocks(o, client, signers) {
  const p = { ...CONTRACT_DEFAULTS, ...(o.params || {}) };
  const tpl = matterTemplate(p.matter_type);
  const c = client || {};
  const sg = (signers || []).length ? signers : [{ full_name: P, license_no: P }];
  const reps = (p.client_reps || '').split('\n').map(x => x.trim()).filter(Boolean);
  const v = p.variant || 'A';
  const isA = v === 'A' || v === 'AB', isB = v === 'B' || v === 'AB', isC = v === 'C', both = v === 'AB';
  const scope = (p.scope || '').split('\n').map(x => x.replace(/^\s*[-•*\d.)]+\s*/, '').trim()).filter(Boolean);
  const scopeList = scope.length ? scope.map((x, i) => x.replace(/[.;]$/, '') + (i === scope.length - 1 ? '.' : ';')) : tpl.scope;
  const endText = (p.end_text || '').trim().replace(/[.\s]+$/, '') || tpl.end;
  const B = [];
  let s = 0, n = 0;
  const sec = t => { B.push({ t: 'h', text: `§ ${++s}. ${t}` }); n = 0; };
  const ust = (text, k) => { B.push({ t: 'ust', n: `${++n}.`, text }); (k || []).forEach((x, i) => B.push({ t: 'pkt', n: `${i + 1})`, text: x })); };
  const intro = text => B.push({ t: 'intro', text });

  B.push({ t: 'title', text: 'UMOWA O ŚWIADCZENIE USŁUG DORADZTWA PODATKOWEGO' });
  intro(`zawarta w dniu ${dateLong(o.order_date)} ${p.place === 'Wrocław' ? 'we Wrocławiu' : `w miejscowości ${p.place || P}`} (dalej: Umowa) pomiędzy:`);
  intro(`${FIRM.name} z siedzibą we Wrocławiu, ${FIRM.address}, wpisaną do rejestru przedsiębiorców Krajowego Rejestru Sądowego prowadzonego przez ${FIRM.court}, pod nr KRS ${FIRM.krs}, NIP ${FIRM.nip}, REGON ${FIRM.regon}, reprezentowaną przez:`);
  sg.forEach(x => B.push({ t: 'bullet', text: signerAcc(x) + ',' }));
  intro('zwaną dalej Zleceniobiorcą lub M2 TAX,');
  B.push({ t: 'center', text: 'a' });
  const party = (p.client_party || defaultClientParty(c) || P).trim().replace(/[,.\s]+$/, '');
  if (c.kind === 'osoba') { intro(`${party},`); intro('zwanym dalej Zleceniodawcą,'); }
  else { intro(`${party}, reprezentowaną przez ${reps.length ? reps.join(' oraz ') : P},`); intro('zwaną dalej Zleceniodawcą,'); }
  intro('łącznie zwanymi Stronami, a każda z osobna Stroną.');
  intro('Strony zawierają Umowę na podstawie art. 734 i n. w zw. z art. 750 Kodeksu cywilnego oraz ustawy z dnia 5 lipca 1996 r. o doradztwie podatkowym.');

  sec('Definicje');
  B.push({ t: 'p', text: 'Ilekroć w Umowie jest mowa o:' });
  [
    'Sprawie – rozumie się przez to sprawę podatkową Zleceniodawcy określoną w Załączniku nr 1, w szczególności postępowanie, kontrolę, czynności sprawdzające, postępowanie przed sądem administracyjnym lub inną czynność doradztwa podatkowego.',
    'Organie – rozumie się przez to organ podatkowy, organ Krajowej Administracji Skarbowej, Dyrektora Krajowej Informacji Skarbowej lub inny organ właściwy w Sprawie, a w postępowaniu sądowoadministracyjnym – także sąd administracyjny.',
    'Zakresie Sprawy – rozumie się przez to podatek (podatki), okres (okresy) rozliczeniowe i czynności objęte Sprawą, określone w Załączniku nr 1.',
    'Doradcy – rozumie się przez to doradcę podatkowego będącego partnerem Zleceniobiorcy lub zatrudnionego przez Zleceniobiorcę, wpisanego na listę doradców podatkowych.',
    'Dniach roboczych – rozumie się przez to dni od poniedziałku do piątku, z wyłączeniem dni ustawowo wolnych od pracy.',
    'Ordynacji podatkowej – rozumie się przez to ustawę z dnia 29 sierpnia 1997 r. – Ordynacja podatkowa (t.j. z uwzględnieniem zmian).',
    'Formie dokumentowej – rozumie się przez to korespondencję prowadzoną na adresy e-mail wskazane w § 13 ust. 2.',
  ].forEach((x, i) => B.push({ t: 'ust', n: `${i + 1}.`, text: x }));

  sec('Przedmiot Umowy');
  ust('Zleceniodawca zleca, a Zleceniobiorca przyjmuje do wykonania usługę doradztwa podatkowego w Sprawie, w Zakresie Sprawy wskazanym w Załączniku nr 1, polegającą na udzielaniu Zleceniodawcy porad i opinii podatkowych oraz – w zakresie, w jakim wymaga tego Sprawa – na reprezentowaniu go przed Organem.');
  ust('W ramach Umowy Zleceniobiorca, w szczególności:', scopeList);
  ust('Umowa nie obejmuje – i wymaga zawarcia odrębnej umowy lub aneksu oraz odrębnego wynagrodzenia – w szczególności: (a) reprezentacji w innych postępowaniach i instancjach niż wskazane w Załączniku nr 1, w tym w postępowaniu odwoławczym i przed sądami administracyjnymi, jeżeli nie są objęte Zakresem Sprawy; (b) obrony lub reprezentacji w postępowaniu karnym skarbowym, w tym sporządzenia zawiadomienia o korekcie (czynnego żalu, art. 16 Kodeksu karnego skarbowego); (c) prowadzenia ksiąg rachunkowych, podatkowej księgi przychodów i rozchodów lub innych ewidencji, w tym ich odtwarzania lub korekty; (d) sporządzania deklaracji i korekt deklaracji, jeżeli nie są objęte Zakresem Sprawy; (e) opinii w sprawach nieobjętych Zakresem Sprawy.');
  ust('Decyzję o złożeniu korekty deklaracji, zapłacie podatku, złożeniu czynnego żalu, wniesieniu środka zaskarżenia lub zastosowaniu się do zaleceń Organu podejmuje wyłącznie Zleceniodawca. Zleceniobiorca przedstawia rekomendację wraz z oceną skutków.');
  ust('Zleceniobiorca zobowiązuje się do starannego działania, przy uwzględnieniu zawodowego charakteru swojej działalności (art. 355 § 2 Kodeksu cywilnego). Zleceniobiorca nie gwarantuje określonego wyniku Sprawy ani rozstrzygnięcia Organu lub sądu.');
  ust('Zleceniobiorca wykonuje Umowę zgodnie z przepisami prawa, Zasadami Etyki Doradców Podatkowych i z zachowaniem niezależności zawodowej. Zleceniobiorca może odmówić wykonania polecenia Zleceniodawcy, jeżeli jego wykonanie byłoby sprzeczne z prawem lub zasadami etyki zawodowej.');

  sec('Pełnomocnictwa i osoby wykonujące Umowę');
  ust(`Czynności doradztwa podatkowego, w tym czynności pełnomocnika, wykonują w imieniu Zleceniobiorcy Doradcy: ${listPl([...sg.map(x => x.full_name), 'inny Doradca wskazany przez Zleceniobiorcę'])}. Strony przyjmują do wiadomości, że pełnomocnikiem w postępowaniu podatkowym, kontroli podatkowej i czynnościach sprawdzających może być wyłącznie osoba fizyczna (art. 138a Ordynacji podatkowej).`);
  ust('Jeżeli wykonanie Umowy wymaga reprezentowania Zleceniodawcy, Zleceniodawca – w terminie 2 Dni roboczych od zawarcia Umowy albo od wezwania Zleceniobiorcy – udzieli Doradcom wskazanym przez Zleceniobiorcę pełnomocnictwa określonego w Załączniku nr 1, obejmującego umocowanie do ustanowienia pełnomocnika substytucyjnego.');
  ust('Opłatę skarbową od pełnomocnictwa (17 zł) ponosi Zleceniodawca. Zleceniobiorca może ją uiścić w imieniu Zleceniodawcy i obciążyć go jej kwotą na zasadach § 6 ust. 6.');
  ust('Zleceniobiorca może powierzyć wykonywanie czynności pomocniczych (analiza dokumentów, przygotowanie projektów pism) swoim pracownikom i współpracownikom, w tym konsultantom podatkowym, działającym pod nadzorem Doradcy. Za ich działania Zleceniobiorca odpowiada jak za własne.');
  ust('Zleceniodawca zobowiązuje się nie odwoływać pełnomocnictwa bez jednoczesnego wypowiedzenia Umowy i niezwłocznego zawiadomienia o tym Zleceniobiorcy; odwołanie pełnomocnictwa wszystkich Doradców bez wypowiedzenia Umowy traktuje się jako wypowiedzenie Umowy przez Zleceniodawcę ze skutkiem na dzień zawiadomienia Organu.');
  ust('Zleceniodawca przyjmuje do wiadomości, że ustanowienie pełnomocnika powoduje, że doręczenia pism w Sprawie są kierowane do pełnomocnika, a czynności dokonane przez Organ z udziałem pełnomocnika wywołują skutki wobec Zleceniodawcy.');

  sec('Obowiązki Zleceniodawcy');
  ust('Zleceniodawca zobowiązuje się:', [
    'przekazać Zleceniobiorcy niezwłocznie, nie później niż w terminie 1 Dnia roboczego od otrzymania, kopię każdego pisma Organu dotyczącego Sprawy, jeżeli zostało doręczone bezpośrednio Zleceniodawcy;',
    'przekazywać Zleceniobiorcy kompletne, rzetelne i zgodne ze stanem faktycznym informacje, dokumenty, księgi, ewidencje i wyjaśnienia – w terminach uzgodnionych przez Strony, a jeżeli termin nie został uzgodniony – nie później niż na 3 Dni robocze przed upływem terminu wyznaczonego przez Organ;',
    'niezwłocznie informować Zleceniobiorcę o wszelkich okolicznościach mogących mieć wpływ na przebieg lub wynik Sprawy, w tym o innych toczących się kontrolach, postępowaniach i czynnościach sprawdzających;',
    'zapewnić Zleceniobiorcy kontakt z biurem rachunkowym / główną księgową i osobami posiadającymi wiedzę o zdarzeniach objętych Sprawą oraz zwolnić je z obowiązku zachowania poufności wobec Zleceniobiorcy;',
    'uzgadniać ze Zleceniobiorcą przed dokonaniem: składanie pism i wyjaśnień do Organu, przekazywanie Organowi dokumentów, składanie korekt deklaracji i zapłatę podatku w Zakresie Sprawy, a w razie samodzielnego kontaktu z Organem – niezwłocznie informować o nim Zleceniobiorcę;',
    'wskazać osobę do kontaktu, wymienioną w Załączniku nr 1, umocowaną do przekazywania informacji i podejmowania decyzji w imieniu Zleceniodawcy;',
    ...(tpl.kontrola ? ['zapewnić osobie kontrolującej i Doradcy warunki do wykonywania czynności w miejscu prowadzenia kontroli (art. 286 § 3 Ordynacji podatkowej);'] : []),
    'terminowo zapłacić wynagrodzenie i zwrócić koszty.',
  ]);
  ust('Zleceniobiorca nie odpowiada za skutki opóźnienia lub niewykonania czynności spowodowane naruszeniem przez Zleceniodawcę obowiązków z ust. 1, w tym za skutki przekazania informacji niepełnych lub nieprawdziwych. Zleceniobiorca nie ma obowiązku weryfikowania prawdziwości dokumentów i informacji otrzymanych od Zleceniodawcy, chyba że ich nieprawdziwość jest oczywista.');
  ust('Jeżeli Zleceniodawca przekaże dokumenty z naruszeniem terminu z ust. 1 pkt 2, Zleceniobiorca dołoży starań, aby wykonać czynność w terminie, a dodatkowy nakład pracy może zostać rozliczony według stawek godzinowych z Załącznika nr 2.');

  sec('Obowiązki Zleceniobiorcy');
  ust('Zleceniobiorca zobowiązuje się:', [
    'wykonywać Umowę z należytą starannością, przez Doradców posiadających odpowiednie kwalifikacje;',
    'pilnować terminów wynikających z pism Organu doręczonych pełnomocnikowi oraz informować Zleceniodawcę o terminach wymagających jego działania;',
    'przekazywać Zleceniodawcy kopie pism składanych do Organu oraz pism otrzymanych od Organu, w terminie 2 Dni roboczych od ich złożenia lub doręczenia;',
    'przedstawiać Zleceniodawcy do akceptacji projekty pism zawierających oświadczenia co do stanu faktycznego, w miarę możliwości na co najmniej 2 Dni robocze przed upływem terminu ich złożenia;',
    'po zakończeniu Sprawy przekazać Zleceniodawcy podsumowanie jej wyniku wraz z rekomendacją dalszych działań;',
    'przechowywać powierzone dokumenty z należytą starannością i zwrócić oryginały niezwłocznie po wykonaniu Umowy lub na żądanie Zleceniodawcy.',
  ]);
  ust('Zleceniobiorca może prowadzić dokumentację wykonania Umowy (akta sprawy), w tym kopie dokumentów, przez okres niezbędny do ochrony przed roszczeniami i wykonania obowiązków prawnych, nie krócej niż 5 lat od końca roku, w którym zakończono wykonywanie Umowy.');
  ust('Zleceniobiorca oświadcza, że na dzień zawarcia Umowy nie występuje konflikt interesów uniemożliwiający jej wykonanie. W razie jego powstania Zleceniobiorca niezwłocznie poinformuje o tym Zleceniodawcę i może wypowiedzieć Umowę z ważnych powodów.');

  sec('Wynagrodzenie i koszty');
  const wA = `Wariant A – ryczałt: ${kwota(p.lump_sum)} za wykonanie Umowy w Zakresie Sprawy, płatne z góry, w całości, w terminie ${p.lump_days || 7} dni od zawarcia Umowy. Ryczałt obejmuje wszystkie czynności określone w § 2 ust. 2, bez względu na liczbę godzin pracy, w okresie wskazanym w § 11 ust. 1. Ryczałt nie obejmuje czynności wskazanych w § 2 ust. 3.`;
  const wB = `Wariant B – stawka godzinowa: ${kwota(p.hourly_rate)} za każdą godzinę pracy, rozliczane w okresach miesięcznych, na podstawie zestawienia czynności (z dokładnością do 15 minut) przekazywanego wraz z fakturą.` +
    (zl(p.advance) ? ` Zleceniodawca wpłaci zaliczkę w wysokości ${kwota(p.advance)} w terminie ${p.advance_days || 7} dni od zawarcia Umowy, rozliczaną z kolejnymi fakturami; niewykorzystana część zaliczki podlega zwrotowi po rozliczeniu Umowy.` : '');
  const wC = `Wariant C – abonament: ${kwota(p.monthly_fee)} miesięcznie, obejmujący do ${p.monthly_hours || P} godzin pracy w miesiącu kalendarzowym, płatny z góry do 10. dnia każdego miesiąca. Czas pracy ponad limit rozliczany jest według stawek z Załącznika nr 2; niewykorzystane godziny nie przechodzą na kolejne miesiące.`;
  if (both) ust('Z tytułu wykonania Umowy Zleceniobiorcy przysługuje wynagrodzenie ustalone według wariantu zaznaczonego poniżej (niezaznaczony wariant skreślić):', [wA, wB]);
  else ust(`Z tytułu wykonania Umowy Zleceniobiorcy przysługuje wynagrodzenie według ${isA ? 'Wariantu A' : isB ? 'Wariantu B' : 'Wariantu C'}:`, [isA ? wA : isB ? wB : wC]);
  ust('Do wynagrodzenia dolicza się podatek od towarów i usług według obowiązującej stawki.');
  const payExc = both ? 'z zastrzeżeniem terminów płatności ryczałtu (Wariant A) i zaliczki (Wariant B) określonych w ust. 1'
    : isA ? 'z zastrzeżeniem terminu płatności ryczałtu określonego w ust. 1' : isC ? 'z zastrzeżeniem terminu płatności abonamentu określonego w ust. 1' : (zl(p.advance) ? 'z zastrzeżeniem terminu płatności zaliczki określonego w ust. 1' : null);
  ust(`Wynagrodzenie płatne jest przelewem na rachunek bankowy Zleceniobiorcy wskazany na fakturze, w terminie ${p.payment_days || 7} dni od dnia wystawienia faktury${payExc ? `, ${payExc}` : ''}. Zleceniodawca akceptuje wystawianie i otrzymywanie faktur za pośrednictwem Krajowego Systemu e-Faktur, a gdy nie jest to obowiązkowe – w formie elektronicznej na adres e-mail wskazany w § 13.`);
  ust(`Czas pracy obejmuje w szczególności: analizę dokumentów, przygotowanie pism, udział w czynnościach przed Organem, czas dojazdu do miejsca czynności (rozliczany w ${p.travel_pct || 100}% stawki), korespondencję i spotkania ze Zleceniodawcą.`);
  ust('Wynagrodzenie należy się Zleceniobiorcy niezależnie od wyniku Sprawy.');
  ust('Niezależnie od wynagrodzenia Zleceniodawca zwraca Zleceniobiorcy udokumentowane koszty poniesione w związku z wykonaniem Umowy, w szczególności: opłaty skarbowe, sądowe i administracyjne, koszty tłumaczeń, opinii biegłych i ekspertyz zleconych za zgodą Zleceniodawcy, koszty przejazdów poza Wrocław (2,00 zł netto za każdy kilometr lub cena biletu) oraz noclegów. Pojedynczy koszt przekraczający 300,00 zł netto wymaga uprzedniej akceptacji Zleceniodawcy w formie dokumentowej.');
  ust('W razie opóźnienia w zapłacie Zleceniobiorcy przysługują odsetki ustawowe za opóźnienie w transakcjach handlowych oraz rekompensata za koszty odzyskiwania należności na zasadach ustawy o przeciwdziałaniu nadmiernym opóźnieniom w transakcjach handlowych. Przy opóźnieniu przekraczającym 14 dni Zleceniobiorca może – po uprzednim wezwaniu – wstrzymać się z wykonywaniem dalszych czynności, z wyjątkiem czynności niecierpiących zwłoki, a następnie wypowiedzieć Umowę z ważnych powodów, zachowując obowiązki z § 12 ust. 2.');

  sec('Odpowiedzialność i ubezpieczenie');
  ust('Zleceniobiorca odpowiada wobec Zleceniodawcy za szkodę wyrządzoną niewykonaniem lub nienależytym wykonaniem Umowy na zasadach ogólnych Kodeksu cywilnego, z ograniczeniami wskazanymi w niniejszym paragrafie.');
  ust('Zleceniobiorca posiada obowiązkowe ubezpieczenie odpowiedzialności cywilnej doradców podatkowych (art. 44 ustawy o doradztwie podatkowym). Na żądanie Zleceniodawcy Zleceniobiorca okaże aktualny dokument ubezpieczenia.');
  const cap = p.liability === 'kwota' ? `kwoty ${zl(p.liability_amount) || `${P} zł`}` : 'trzykrotności wynagrodzenia netto należnego za wykonanie Umowy';
  ust('Z zastrzeżeniem ust. 6, odpowiedzialność Zleceniobiorcy:', [
    'ograniczona jest do szkody rzeczywistej (damnum emergens) i nie obejmuje utraconych korzyści;',
    `ograniczona jest do ${cap}, a w zakresie przewyższającym – do sumy gwarancyjnej ubezpieczenia OC, o ile ubezpieczyciel wypłaci odszkodowanie.`,
  ]);
  ust('Zleceniobiorca nie ponosi odpowiedzialności za:', [
    'zaległości podatkowe, odsetki za zwłokę i inne należności publicznoprawne, które powstałyby niezależnie od działań Zleceniobiorcy (w szczególności wynikające z rozliczeń sporządzonych przed zawarciem Umowy);',
    'szkody wynikające z przekazania przez Zleceniodawcę informacji lub dokumentów niepełnych, nieprawdziwych lub nieterminowych, albo z działań Zleceniodawcy podjętych bez uzgodnienia ze Zleceniobiorcą lub wbrew jego rekomendacji;',
    'rozstrzygnięcia Organu lub sądu, w tym wynikające z odmiennej wykładni przepisów niż przyjęta przez Zleceniobiorcę, o ile wykładnia Zleceniobiorcy była uzasadniona w świetle orzecznictwa lub stanowiska doktryny;',
    'skutki zmian przepisów, objaśnień lub linii orzeczniczej po dniu wykonania danej czynności.',
  ]);
  ust('Roszczenia z tytułu nienależytego wykonania Umowy Zleceniodawca zgłasza na piśmie, niezwłocznie po powzięciu wiadomości o szkodzie.');
  ust('Ograniczenia z ust. 3 i 4 nie dotyczą szkody wyrządzonej umyślnie.');
  ust('Strony przyjmują do wiadomości, że zgodnie z art. 95 Kodeksu spółek handlowych partner nie ponosi odpowiedzialności za zobowiązania spółki powstałe w związku z wykonywaniem przez pozostałych partnerów wolnego zawodu.');

  sec('Tajemnica zawodowa i poufność');
  ust('Zleceniobiorca, Doradcy oraz osoby, przy pomocy których Zleceniobiorca wykonuje Umowę, są obowiązani do zachowania w tajemnicy faktów i informacji, z którymi zapoznali się w związku z wykonywaniem Umowy, na zasadach art. 37 ustawy o doradztwie podatkowym. Obowiązek ten trwa bezterminowo, także po rozwiązaniu Umowy.');
  ust('Zleceniobiorca może ujawnić informacje objęte tajemnicą wyłącznie w zakresie, w jakim zwolnienie z tajemnicy lub obowiązek ich ujawnienia wynika z przepisów prawa, lub za zgodą Zleceniodawcy.');
  ust('Zleceniodawca zobowiązuje się nie udostępniać osobom trzecim (z wyjątkiem swoich doradców, biegłych rewidentów i organów) opinii, analiz i projektów pism przygotowanych przez Zleceniobiorcę bez jego zgody. Prawa autorskie do tych opracowań przysługują Zleceniobiorcy; Zleceniodawca może z nich korzystać na potrzeby własne w Sprawie.');

  sec('Ochrona danych osobowych');
  ust('W zakresie danych osobowych przetwarzanych w związku z wykonywaniem Umowy, w tym danych pracowników, kontrahentów i reprezentantów Zleceniodawcy, Zleceniobiorca działa jako samodzielny administrator danych, wykonujący czynności doradztwa podatkowego na podstawie przepisów prawa i w warunkach tajemnicy zawodowej, a nie jako podmiot przetwarzający.');
  ust('Zleceniodawca oświadcza, że jest uprawniony do przekazania Zleceniobiorcy danych osobowych w celu wykonania Umowy, i zobowiązuje się przekazać osobom, których dane dotyczą, informację o przekazaniu danych Zleceniobiorcy, której treść stanowi Załącznik nr 3.');
  ust('Klauzula informacyjna dla osób reprezentujących Zleceniodawcę i osób kontaktowych stanowi Załącznik nr 3.');

  sec('Przeciwdziałanie praniu pieniędzy (AML)');
  ust('Zleceniodawca przyjmuje do wiadomości, że Zleceniobiorca jest instytucją obowiązaną w rozumieniu ustawy z dnia 1 marca 2018 r. o przeciwdziałaniu praniu pieniędzy oraz finansowaniu terroryzmu i stosuje środki bezpieczeństwa finansowego, w tym identyfikację i weryfikację tożsamości Zleceniodawcy, osób działających w jego imieniu oraz beneficjenta rzeczywistego.');
  ust('Zleceniodawca zobowiązuje się przekazać, przed rozpoczęciem wykonywania Umowy i na każde żądanie, informacje i dokumenty niezbędne do zastosowania środków bezpieczeństwa finansowego, w tym oświadczenie o beneficjencie rzeczywistym i statusie osoby zajmującej eksponowane stanowisko polityczne.');
  ust('Brak możliwości zastosowania środków bezpieczeństwa finansowego uprawnia Zleceniobiorcę do odmowy zawarcia lub rozwiązania Umowy ze skutkiem natychmiastowym, bez odpowiedzialności odszkodowawczej.');

  sec('Czas trwania i wypowiedzenie');
  ust(endText === 'na czas nieokreślony' ? 'Umowa zostaje zawarta na czas nieokreślony.' : `Umowa zostaje zawarta na czas wykonania zlecenia, tj. ${endText}.`);
  ust('Jeżeli w toku Sprawy jej zakres ulegnie rozszerzeniu (w szczególności w razie rozszerzenia kontroli, wszczęcia kolejnego postępowania lub potrzeby wniesienia środka zaskarżenia), Strony uzgodnią rozszerzenie Umowy w drodze aneksu, w tym w formie dokumentowej (e-mail).');
  ust('Każda ze Stron może wypowiedzieć Umowę w każdym czasie (art. 746 Kodeksu cywilnego), w formie dokumentowej' + (isC ? ', przy czym abonament należny jest do końca miesiąca kalendarzowego, w którym nastąpiło wypowiedzenie' : '') + '. Zleceniobiorca może wypowiedzieć Umowę z ważnych powodów, w szczególności w razie: naruszenia przez Zleceniodawcę § 4 ust. 1, opóźnienia w zapłacie, o którym mowa w § 6 ust. 7, utraty zaufania, konfliktu interesów lub żądania działania sprzecznego z prawem lub zasadami etyki zawodowej.');
  ust('W razie wypowiedzenia Umowy przez którąkolwiek ze Stron Zleceniobiorcy przysługuje wynagrodzenie za czynności wykonane do dnia rozwiązania Umowy' +
    (isA ? ' (w Wariancie A wynagrodzenie ryczałtowe nie podlega zwrotowi, chyba że Umowa została rozwiązana z przyczyn leżących po stronie Zleceniobiorcy – wówczas Zleceniobiorca zwraca część ryczałtu proporcjonalną do niewykonanej części Umowy)' : '') +
    ' oraz zwrot poniesionych kosztów.');

  sec('Skutki rozwiązania Umowy');
  ust('Po rozwiązaniu Umowy Zleceniobiorca niezwłocznie zawiadomi Organ o wypowiedzeniu pełnomocnictwa (chyba że uczyni to Zleceniodawca), zwróci Zleceniodawcy oryginały dokumentów i przekaże pisma doręczone mu jako pełnomocnikowi.');
  ust('Do czasu skutecznego zawiadomienia Organu, nie dłużej jednak niż przez 14 dni od rozwiązania Umowy, Zleceniobiorca podejmuje wyłącznie czynności niecierpiące zwłoki, niezbędne do ochrony praw Zleceniodawcy, chyba że Zleceniodawca na piśmie zwolni go z tego obowiązku.');

  sec('Komunikacja');
  ust('Strony porozumiewają się w formie dokumentowej (e-mail), telefonicznie lub na spotkaniach. Ustalenia istotne dla przebiegu Sprawy Strony potwierdzają w formie dokumentowej.');
  ust('Adresy do korespondencji:', [
    `Zleceniobiorca: ${FIRM.email}, tel. ${FIRM.phones.split('·')[0].trim()};`,
    `Zleceniodawca: ${p.client_email || c.email || P}, tel. ${p.client_phone || c.phone || P}, osoba do kontaktu: ${p.contact_person || c.contact_person || P};`,
  ]);
  ust('Zmiana danych kontaktowych wymaga zawiadomienia drugiej Strony i nie stanowi zmiany Umowy. Korespondencję wysłaną na ostatni wskazany adres uważa się za doręczoną.');

  sec('Postanowienia końcowe');
  ust('Zmiany Umowy wymagają formy dokumentowej pod rygorem nieważności, z wyjątkiem zmian wskazanych w Umowie jako dopuszczalne w inny sposób.');
  ust('Zleceniobiorca może przelać wierzytelności z Umowy wyłącznie za zgodą Zleceniodawcy, z wyjątkiem wierzytelności o wynagrodzenie wymagalne.');
  ust('Umowa podlega prawu polskiemu. W sprawach nieuregulowanych stosuje się przepisy Kodeksu cywilnego, ustawy o doradztwie podatkowym oraz Ordynacji podatkowej.');
  ust('Spory wynikające z Umowy rozstrzyga sąd powszechny właściwy miejscowo dla siedziby Zleceniobiorcy.');
  if (c.kind !== 'osoba') ust('Zleceniodawca oświadcza, że jest przedsiębiorcą i zawiera Umowę w bezpośrednim związku ze swoją działalnością gospodarczą, a Umowa ma dla niego charakter zawodowy, wynikający w szczególności z przedmiotu tej działalności i obowiązków podatkowych z nią związanych. W konsekwencji do Umowy nie stosuje się przepisów o ochronie konsumentów, w tym art. 385(5) Kodeksu cywilnego ani przepisów ustawy o prawach konsumenta.');
  (o.extra_terms || '').split('\n').map(x => x.trim()).filter(Boolean).forEach(x => ust(x));
  ust('Umowę sporządzono w dwóch jednobrzmiących egzemplarzach, po jednym dla każdej ze Stron, albo w formie elektronicznej opatrzonej kwalifikowanymi podpisami elektronicznymi Stron.');

  B.push({ t: 'sign2',
    left: { label: 'ZLECENIOBIORCA', firm: null, people: sg.map(signerCap) },
    right: { label: 'ZLECENIODAWCA', firm: c.kind === 'osoba' ? null : (c.name || P), people: c.kind === 'osoba' ? [c.name || P] : (reps.length ? reps : [`${P} – ${P}`]) } });

  // Załączniki
  B.push({ t: 'pb' });
  B.push({ t: 'att', text: 'Załącznik nr 1 – Zakres Sprawy' });
  B.push({ t: 'kv', head: ['Pole', 'Treść'], rows: att1Rows(o, c, sg) });
  B.push({ t: 'gap' });
  B.push({ t: 'att', text: 'Załącznik nr 2 – Stawki za czynności dodatkowe' });
  B.push({ t: 'kv', head: ['Czynność', 'Stawka netto'], rows: att2Rows(o) });
  B.push({ t: 'gap' });
  B.push({ t: 'att', text: 'Załącznik nr 3 – Klauzula informacyjna RODO' });
  [
    `Administratorem danych osobowych jest ${FIRM.name}, ${FIRM.address}, e-mail: ${FIRM.email}.`,
    'Dane przetwarzane są w celu zawarcia i wykonania Umowy oraz reprezentacji Zleceniodawcy w Sprawie (art. 6 ust. 1 lit. b i c RODO), wykonania obowiązków prawnych, w tym podatkowych i wynikających z ustawy o przeciwdziałaniu praniu pieniędzy (art. 6 ust. 1 lit. c RODO), a także dochodzenia roszczeń i kontaktu z osobami reprezentującymi Zleceniodawcę (art. 6 ust. 1 lit. f RODO).',
    'Odbiorcami danych mogą być organy podatkowe i organy KAS, sądy, dostawcy usług IT, poczty elektronicznej, księgowi i ubezpieczyciel OC Zleceniobiorcy.',
    'Dane przechowywane są przez czas wykonywania Umowy, a następnie przez okres przedawnienia roszczeń i okres wymagany przepisami podatkowymi i AML (co najmniej 5 lat).',
    'Osobie, której dane dotyczą, przysługuje prawo dostępu do danych, ich sprostowania, usunięcia, ograniczenia przetwarzania, sprzeciwu oraz skargi do Prezesa Urzędu Ochrony Danych Osobowych – z ograniczeniami wynikającymi z tajemnicy zawodowej doradcy podatkowego.',
    'Podanie danych jest warunkiem zawarcia i wykonania Umowy.',
  ].forEach((x, i) => B.push({ t: 'ust', n: `${i + 1}.`, text: x }));
  const poa = p.poa_type || tpl.poa;
  const att4 = att4Mode(p);
  if (att4 === 'firmowe') { B.push({ t: 'pb' }); B.push(...poaBlocks(o, c, sg)); }
  else if (att4 === 'urzedowy') {
    B.push({ t: 'gap' });
    B.push({ t: 'att', text: `Załącznik nr 4 – Pełnomocnictwo ${poa}` });
    B.push({ t: 'small', text: /PPS-1/.test(poa) ? 'Urzędowy formularz PPS-1 – dołączany odrębnie.' : 'Dokument pełnomocnictwa – dołączany odrębnie.' });
  }
  return B;
}

// ---- Załącznik nr 1 i 2: wiersze automatyczne albo poprawione ręcznie (params.att1 / params.att2) ----
const cleanRows = rows => (rows || []).filter(r => r && (String(r[0] || '').trim() || String(r[1] || '').trim())).map(r => [String(r[0] || ''), String(r[1] || '')]);

export function att1AutoRows(o, client, signers) {
  const p = { ...CONTRACT_DEFAULTS, ...(o.params || {}) };
  const tpl = matterTemplate(p.matter_type);
  const c = client || {};
  const sg = (signers || []).length ? signers : [{ full_name: P }];
  const v = p.variant || 'A';
  const row = (label, val, relevant = true) => (val ? [label, val] : relevant ? [label, P] : null);
  return [
    row('Rodzaj sprawy', MATTER_TYPE[p.matter_type]),
    row('Opis Sprawy i zakres czynności', p.description, false),
    row('Organ / sąd', p.authority, tpl.organ),
    row('Sygnatura / znak pisma / nr upoważnienia', p.ref_no, false),
    row('Data doręczenia pisma, od którego biegnie termin', p.served_date ? dateShort(p.served_date) : null, !!tpl.served),
    row('Podatek', p.tax, tpl.organ),
    row('Okres', p.period, tpl.organ),
    ['Doradcy', sg.map(x => x.full_name).join(', ')],
    ['Rodzaj pełnomocnictwa', p.poa_type || tpl.poa],
    ['Osoba do kontaktu po stronie Zleceniodawcy', [p.contact_person || c.contact_person, p.client_email || c.email, p.client_phone || c.phone].filter(Boolean).join(', ') || '[imię i nazwisko, stanowisko, e-mail, tel.]'],
    row('Biuro rachunkowe Zleceniodawcy', p.accounting_office, false),
    ['Wybrany wariant wynagrodzenia', v === 'AB' ? 'A / B' : v === 'A' ? 'A – ryczałt' : v === 'B' ? 'B – stawka godzinowa' : 'C – abonament'],
  ].filter(Boolean);
}
export function att2AutoRows(o) {
  const p = { ...CONTRACT_DEFAULTS, ...(o.params || {}) };
  return [
    ['Godzina pracy partnera / doradcy podatkowego', zl(p.rate_partner) || P],
    ['Godzina pracy konsultanta podatkowego', zl(p.rate_consultant) || P],
    ['Udział w czynnościach poza Wrocławiem', `${zl(p.rate_partner) || P} za godzinę + koszty z § 6 ust. 6`],
  ];
}
export const att1Rows = (o, c, sg) => (o.params?.att1?.length ? cleanRows(o.params.att1) : att1AutoRows(o, c, sg));
export const att2Rows = o => (o.params?.att2?.length ? cleanRows(o.params.att2) : att2AutoRows(o));

// ---- Załącznik nr 4: pełnomocnictwo na papierze firmowym ----
export const att4Mode = p => p.att4 || (/^nie dotyczy/.test(p.poa_type || matterTemplate(p.matter_type).poa) ? 'brak' : 'firmowe');

export function poaDefaultScope(p) {
  const tpl = matterTemplate(p.matter_type);
  const lc = x => /^.[A-ZĄĆĘŁŃÓŚŹŻ]/.test(x) ? x : x.charAt(0).toLowerCase() + x.slice(1);
  const what = [MATTER_TYPE[p.matter_type] ? `rodzaj: ${lc(MATTER_TYPE[p.matter_type])}` : null,
    p.tax ? `podatek: ${p.tax}` : null, p.period ? `okres: ${p.period}` : null, p.ref_no ? `sygnatura / znak: ${p.ref_no}` : null].filter(Boolean).join('; ');
  const named = p.authority || (tpl.organ ? P : null);
  if (named) return `przed organem (sądem): ${named}${what ? `, w sprawie (${what})` : ''}`;
  return `przed organami podatkowymi, organami Krajowej Administracji Skarbowej i sądami administracyjnymi${what ? ` w sprawie (${what})` : ''}`;
}

export function poaBlocks(o, client, signers, { standalone = false, brand = M2_BRAND } = {}) {
  const p = { ...CONTRACT_DEFAULTS, ...(o.params || {}) };
  const c = client || {};
  const sg = (signers || []).length ? signers : [{ full_name: P, license_no: P }];
  const reps = (p.client_reps || '').split('\n').map(x => x.trim()).filter(Boolean);
  const party = (p.client_party || defaultClientParty(c) || P).trim().replace(/[,.\s]+$/, '');
  const court = /p\.p\.s\.a|procesow/i.test(p.poa_type || matterTemplate(p.matter_type).poa);
  const scope = (p.poa_scope || '').trim().replace(/[.\s]+$/, '') || poaDefaultScope({ ...p, matter_type: o.params?.matter_type });
  const B = [];
  if (!standalone) B.push({ t: 'att', text: 'Załącznik nr 4 – Pełnomocnictwo' });
  B.push({ t: 'title', text: court ? 'PEŁNOMOCNICTWO PROCESOWE' : 'PEŁNOMOCNICTWO SZCZEGÓLNE' });
  B.push({ t: 'meta', text: `${p.place || brand.city}, dnia ${dateLong(o.order_date)}` });
  B.push({ t: 'intro', text: c.kind === 'osoba' ? `${party} (dalej: Mocodawca),` : `${party}, reprezentowana przez ${reps.length ? reps.join(' oraz ') : P} (dalej: Mocodawca),` });
  B.push({ t: 'intro', text: `udziela niniejszym pełnomocnictwa ${court ? 'procesowego' : 'szczególnego'} następującym doradcom podatkowym działającym w ramach ${brand.firmName}, ${brand.firmAddress}:` });
  sg.forEach(x => B.push({ t: 'bullet', text: `${x.full_name} – doradca podatkowy, nr wpisu na listę doradców podatkowych ${x.license_no || P};` }));
  B.push({ t: 'intro', text: `każdemu z nich do samodzielnego działania, do reprezentowania Mocodawcy ${scope}.` });
  B.push({ t: 'intro', text: 'Pełnomocnictwo obejmuje umocowanie do dokonywania wszelkich czynności w tej sprawie, w szczególności do:' });
  [
    'składania i odbierania pism, wniosków, wyjaśnień, oświadczeń i dokumentów oraz do doręczeń;',
    'przeglądania akt sprawy, sporządzania z nich notatek, odpisów i kopii;',
    'udziału w czynnościach dowodowych, przesłuchaniach i rozprawach;',
    court ? 'wnoszenia skarg, skarg kasacyjnych, zażaleń, wniosków i innych pism procesowych;' : 'wnoszenia odwołań, zażaleń, zastrzeżeń, wniosków i innych środków przewidzianych w przepisach;',
    'udzielania dalszych pełnomocnictw (substytucji) doradcom podatkowym.',
  ].forEach((x, i) => B.push({ t: 'pkt', n: `${i + 1})`, text: x }));
  B.push({ t: 'intro', text: 'Pełnomocnictwo jest ważne do zakończenia sprawy albo do jego odwołania.' });
  B.push({ t: 'sign2', left: { label: 'MOCODAWCA', firm: c.kind === 'osoba' ? null : (c.name || P), people: c.kind === 'osoba' ? [c.name || P] : (reps.length ? reps : [`${P} – ${P}`]) },
    right: { label: 'PEŁNOMOCNICY (przyjęcie)', firm: null, people: sg.map(x => `${x.full_name} – doradca podatkowy`) } });
  B.push({ t: 'gap' });
  B.push({ t: 'small', text: 'Opłata skarbowa od pełnomocnictwa: 17 zł (art. 1 ust. 1 pkt 2 ustawy o opłacie skarbowej), chyba że zachodzi zwolnienie.' });
  return B;
}

export const docBlocks = (o, client, signers) => o.doc_type === 'umowa'
  ? contractBlocks(o, client, signers) : orderBlocks(o, client, signers[0]);

// ===================== HTML (podgląd i PDF) =====================
const esc = v => String(v ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

export const ORDER_CSS = `
.doc{font-family:'Source Sans 3',Calibri,'Segoe UI',Arial,sans-serif;color:#1c1d21;font-size:10.5pt;line-height:1.45}
.doc.compact{font-size:10pt;line-height:1.38}
.doc .lh{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;border-bottom:1.5px solid #B08D57;padding-bottom:7px;margin-bottom:14px}
.doc .lh img{height:40px;width:auto}
.doc .lh .firm{text-align:right;font-size:7.5pt;color:#5d6068;line-height:1.4}
.doc .ft{border-top:1px solid #d6d2ca;padding-top:5px;margin-top:18px;font-size:7pt;color:#8a8c92;line-height:1.4}
.doc h1{font-family:Montserrat,Arial,sans-serif;font-size:13pt;text-align:center;margin:4px 0 10px;color:#16171a;letter-spacing:.02em;line-height:1.3}
.doc.compact h1{font-size:17pt;letter-spacing:.14em;margin:0}
.doc .meta{text-align:center;color:#5d6068;margin:0 0 12px}
.doc .parties{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:6px;font-size:.95em}
.doc .lbl{font-family:Montserrat,Arial,sans-serif;font-size:7.5pt;letter-spacing:.14em;text-transform:uppercase;color:#7A5A37;font-weight:700;margin-bottom:2px}
.doc h2{font-family:Montserrat,Arial,sans-serif;font-size:10.5pt;margin:13px 0 4px;color:#16171a;break-after:avoid}
.doc.compact h2{margin:9px 0 3px;font-size:10pt}
.doc p{margin:0 0 6px;text-align:justify}
.doc .intro{margin:0 0 7px}
.doc .center{text-align:center;margin:0 0 7px}
.doc .bul{margin:0 0 5px 18px;display:grid;grid-template-columns:14px 1fr}
.doc .ust{display:grid;grid-template-columns:22px 1fr;margin:0 0 5px}
.doc .pkt{display:grid;grid-template-columns:24px 1fr;margin:0 0 4px 22px}
.doc .ust>span:last-child,.doc .pkt>span:last-child{text-align:justify}
.doc.compact .ust{margin-bottom:3px}.doc.compact .pkt{margin-bottom:2px}
.doc .att{font-family:Montserrat,Arial,sans-serif;font-weight:700;font-size:10.5pt;margin:0 0 8px}
.doc .gap{height:14px}
.doc .small{font-size:9pt;color:#5d6068}
.doc table.kv{width:100%;border-collapse:collapse;margin:0 0 6px;font-size:9.5pt}
.doc table.kv th,.doc table.kv td{border:1px solid #cfc9bf;padding:5px 8px;text-align:left;vertical-align:top}
.doc table.kv th{background:#f3eee6;font-family:Montserrat,Arial,sans-serif;font-size:8pt;letter-spacing:.06em;text-transform:uppercase;color:#5d4a33}
.doc table.kv td:first-child{width:42%;color:#3b3d42}
.doc table.rt{width:100%;border-collapse:collapse;margin:2px 0 8px;font-size:9pt;page-break-inside:auto}
.doc table.rt tr{page-break-inside:avoid}
.doc table.rt th,.doc table.rt td{border-bottom:1px solid #ddd6ca;padding:5px 6px;text-align:left;vertical-align:top}
.doc table.rt th{background:#f3eee6;font-family:Montserrat,Arial,sans-serif;font-size:7.5pt;letter-spacing:.05em;text-transform:uppercase;color:#5d4a33;border-bottom:1px solid #cfc9bf}
.doc table.rt td.num,.doc table.rt th.num{text-align:right;white-space:nowrap}
.doc table.rt td.nw{white-space:nowrap}
.doc table.rt tr.sum td{font-weight:700;border-top:1.5px solid #8a7458;border-bottom:0;background:#faf7f2}
.doc table.rt .sub{display:block;color:#5d6068;font-size:8.5pt;white-space:pre-wrap;margin-top:2px}
.doc table.rt .late{color:#a4462f;font-weight:700}
.doc table.rt .ok{color:#3e6b47}
.doc .sign{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:30px;break-inside:avoid}
.doc .sign .line{border-top:1px solid #1c1d21;padding-top:5px;margin-top:40px;font-size:9.5pt}
.doc .sign2{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:26px;break-inside:avoid}
.doc .sign2 .firmname{font-weight:600;margin-top:4px}
.doc .sign2 .person{margin-top:34px;font-size:9.5pt}
.doc .sign2 .person::before{content:"";display:block;border-top:1px dotted #1c1d21;margin-bottom:4px;width:85%}
.doc .pb{border-top:1px dashed #cfc9bf;margin:22px 0;position:relative}
.doc .pb::after{content:"nowa strona";position:absolute;top:-8px;left:50%;transform:translateX(-50%);background:#fffdf9;padding:0 8px;font-size:7pt;color:#a29d93;letter-spacing:.1em;text-transform:uppercase}
@media print{.doc .pb{border:0;margin:0;break-before:page}.doc .pb::after{display:none}}
`;

function letterhead(logoUrl, brand = M2_BRAND) {
  if (brand.plain) return '';
  return `<div class="lh"><img src="${esc(logoUrl)}" alt="${esc(brand.alt)}"><div class="firm">${brand.lines.map(esc).join('<br>')}</div></div>`;
}
const footer = (brand = M2_BRAND) => `<div class="ft">${esc(brand.foot1)}<br>${esc(brand.foot2)}</div>`;

function bodyHtml(blocks) {
  let html = '';
  for (const b of blocks) {
    if (b.t === 'title') html += `<h1>${esc(b.text)}</h1>`;
    else if (b.t === 'meta') html += `<div class="meta">${esc(b.text)}</div>`;
    else if (b.t === 'intro') html += `<p class="intro">${esc(b.text)}</p>`;
    else if (b.t === 'center') html += `<p class="center">${esc(b.text)}</p>`;
    else if (b.t === 'bullet') html += `<div class="bul"><span>–</span><span>${esc(b.text)}</span></div>`;
    else if (b.t === 'parties') html += `<div class="parties">${[b.left, b.right].map(x => `<div><div class="lbl">${esc(x.label)}</div>${x.lines.map(esc).join('<br>')}</div>`).join('')}</div>`;
    else if (b.t === 'h') html += `<h2>${esc(b.text)}</h2>`;
    else if (b.t === 'p') html += `<p>${esc(b.text)}</p>`;
    else if (b.t === 'pre') html += `<p style="white-space:pre-wrap;text-align:left">${esc(b.text)}</p>`;
    else if (b.t === 'ust') html += `<div class="ust"><span>${esc(b.n)}</span><span>${esc(b.text)}</span></div>`;
    else if (b.t === 'pkt') html += `<div class="pkt"><span>${esc(b.n)}</span><span>${esc(b.text)}</span></div>`;
    else if (b.t === 'att') html += `<div class="att">${esc(b.text)}</div>`;
    else if (b.t === 'gap') html += '<div class="gap"></div>';
    else if (b.t === 'small') html += `<p class="small">${esc(b.text)}</p>`;
    else if (b.t === 'pb') html += '<div class="pb"></div>';
    else if (b.t === 'table') html += `<table class="rt"><thead><tr>${b.head.map((x, i) => `<th class="${(b.cls || [])[i] || ''}">${esc(x)}</th>`).join('')}</tr></thead><tbody>${b.rows.map(r => `<tr class="${r.cls || ''}">${(r.cells || r).map((c, i) => `<td class="${(b.cls || [])[i] || ''}">${c && typeof c === 'object' ? `${c.cls ? `<span class="${c.cls}">` : ''}${esc(c.text)}${c.cls ? '</span>' : ''}${c.sub ? `<span class="sub">${esc(c.sub)}</span>` : ''}` : esc(c ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    else if (b.t === 'kv') html += `<table class="kv"><thead><tr>${b.head.map(x => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${b.rows.map(r => `<tr>${r.map(x => `<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    else if (b.t === 'sign') html += `<div class="sign">${[b.left, b.right].map(x => `<div><div class="lbl">${esc(x.label)}</div><div class="line">${x.lines.map(esc).join('<br>')}</div></div>`).join('')}</div>`;
    else if (b.t === 'sign2') html += `<div class="sign2">${[b.left, b.right].map(x => `<div><div class="lbl">${esc(x.label)}</div>${x.firm ? `<div class="firmname">${esc(x.firm)}</div>` : ''}${x.people.map(pp => `<div class="person">${esc(pp)}</div>`).join('')}</div>`).join('')}</div>`;
  }
  return html;
}

const isCompact = blocks => blocks[0]?.text === 'ZLECENIE';

// podgląd w aplikacji
export function orderHtml(blocks, logoUrl, brand = M2_BRAND) {
  return `<div class="doc${isCompact(blocks) ? ' compact' : ''}">${letterhead(logoUrl, brand)}${bodyHtml(blocks)}${footer(brand)}</div>`;
}

// pełny dokument do druku/PDF: nagłówek i stopka powtarzają się na każdej stronie
export function printableHtml(blocks, title, logoUrl, brand = M2_BRAND) {
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>${esc(title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700&family=Source+Sans+3:wght@400;600;700&display=swap">
<style>@page{size:A4;margin:12mm 17mm 16mm;
@bottom-left{content:"${brand.foot1}\\A ${brand.foot2}";white-space:pre;font:6.5pt Arial,sans-serif;color:#8a8c92;vertical-align:top;padding-top:4mm;border-top:.4pt solid #d6d2ca}
@bottom-right{content:"Strona " counter(page) " z " counter(pages);font:6.5pt Arial,sans-serif;color:#8a8c92;vertical-align:top;padding-top:4mm;border-top:.4pt solid #d6d2ca}}
body{margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
table.page{width:100%;border-collapse:collapse}table.page>thead>tr>td,table.page>tfoot>tr>td,table.page>tbody>tr>td{padding:0}
${ORDER_CSS}
.doc .lh{margin-bottom:10px}.doc .ft{margin-top:10px}</style></head>
<body><div class="doc${isCompact(blocks) ? ' compact' : ''}"><table class="page"><thead><tr><td>${letterhead(logoUrl, brand)}</td></tr></thead>
<tbody><tr><td>${bodyHtml(blocks)}</td></tr></tbody></table></div></body></html>`;
}

export function printOrder(blocks, title) {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open();
  w.document.write(printableHtml(blocks, title, location.origin + '/m2tax-logo.png'));
  w.document.close();
  const go = () => { w.focus(); w.print(); };
  const img = w.document.querySelector('img');
  setTimeout(() => (img && !img.complete) ? (img.onload = img.onerror = go) : go(), 500);
  return true;
}

// ===================== Word (.docx) =====================
const x = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const run = (text, o = {}) => `<w:r><w:rPr>${o.font ? `<w:rFonts w:ascii="${o.font}" w:hAnsi="${o.font}" w:cs="${o.font}"/>` : ''}${o.b ? '<w:b/>' : ''}${o.color ? `<w:color w:val="${o.color}"/>` : ''}${o.sz ? `<w:sz w:val="${o.sz}"/><w:szCs w:val="${o.sz}"/>` : ''}${o.spacing ? `<w:spacing w:val="${o.spacing}"/>` : ''}${o.caps ? '<w:caps/>' : ''}</w:rPr><w:t xml:space="preserve">${x(text)}</w:t></w:r>`;
const tab = () => '<w:r><w:tab/></w:r>';
function para(runs, o = {}) {
  const ind = o.ind ? `<w:ind w:left="${o.ind[0]}" w:hanging="${o.ind[1]}"/>` : '';
  return `<w:p><w:pPr>${o.keep ? '<w:keepNext/>' : ''}${o.pbb ? '<w:pageBreakBefore/>' : ''}<w:spacing w:before="${o.before ?? 0}" w:after="${o.after ?? 80}"/>${ind}${o.jc ? `<w:jc w:val="${o.jc}"/>` : ''}${o.tabs ? `<w:tabs>${o.tabs.map(t => `<w:tab w:val="left" w:pos="${t}"/>`).join('')}</w:tabs>` : ''}</w:pPr>${runs}</w:p>`;
}
const lines = (arr, o) => arr.map((l, i) => run(l, o) + (i < arr.length - 1 ? '<w:r><w:br/></w:r>' : '')).join('');
const NOB = '<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>';
const W = 9638;

function twoColTable(cells) {
  const cw = Math.floor(W / 2);
  return `<w:tbl><w:tblPr><w:tblW w:w="${W}" w:type="dxa"/>${NOB}<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="${cw}"/><w:gridCol w:w="${cw}"/></w:tblGrid><w:tr><w:cantSplit/>${cells.map(c => `<w:tc><w:tcPr><w:tcW w:w="${cw}" w:type="dxa"/></w:tcPr>${c}</w:tc>`).join('')}</w:tr></w:tbl>`;
}
const label = t => para(run(t, { b: true, color: '7A5A37', sz: 15, spacing: 30, caps: true, font: 'Montserrat' }), { after: 30, keep: true });

function kvTable(b) {
  const c1 = Math.round(W * 0.42), c2 = W - c1;
  const bd = '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(s => `<w:${s} w:val="single" w:sz="4" w:color="CFC9BF"/>`).join('') + '</w:tblBorders>';
  const cell = (t, w, head) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${head ? '<w:shd w:val="clear" w:color="auto" w:fill="F3EEE6"/>' : ''}<w:tcMar><w:top w:w="60" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/></w:tcMar></w:tcPr>${para(run(t, head ? { b: true, sz: 16, color: '5D4A33', font: 'Montserrat' } : { sz: 19 }), { after: 0 })}</w:tc>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="${W}" w:type="dxa"/>${bd}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="110" w:type="dxa"/><w:right w:w="110" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w="${c1}"/><w:gridCol w:w="${c2}"/></w:tblGrid>`
    + `<w:tr><w:trPr><w:tblHeader/></w:trPr>${cell(b.head[0], c1, true)}${cell(b.head[1], c2, true)}</w:tr>`
    + b.rows.map(r => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${cell(r[0], c1)}${cell(r[1], c2)}</w:tr>`).join('') + '</w:tbl>';
}

function docxBody(blocks) {
  const compact = isCompact(blocks);
  const sz = compact ? 20 : 21;
  let body = '', pendingPB = false;
  const add = (xml) => { body += xml; };
  for (const b of blocks) {
    const pb = pendingPB; pendingPB = false;
    if (b.t === 'title') add(para(run(b.text, { b: true, sz: compact ? 34 : 26, spacing: compact ? 60 : 10, font: 'Montserrat' }), { jc: 'center', after: compact ? 20 : 200 }));
    else if (b.t === 'meta') add(para(run(b.text, { color: '5D6068', sz: 19 }), { jc: 'center', after: 200 }));
    else if (b.t === 'intro') add(para(run(b.text, { sz }), { jc: 'both', after: 120 }));
    else if (b.t === 'center') add(para(run(b.text, { sz }), { jc: 'center', after: 120 }));
    else if (b.t === 'bullet') add(para(run('–', { sz }) + tab() + run(b.text, { sz }), { ind: [567, 283], after: 60, jc: 'both' }));
    else if (b.t === 'parties') add(twoColTable([b.left, b.right].map(c => label(c.label) + para(lines(c.lines, { sz: 19 }), { after: 0 }))) + para('', { after: 60 }));
    else if (b.t === 'h') add(para(run(b.text, { b: true, sz: compact ? 20 : 21, font: 'Montserrat' }), { before: compact ? 140 : 220, after: 60, keep: true }));
    else if (b.t === 'p') add(para(run(b.text, { sz }), { jc: 'both', after: 80 }));
    else if (b.t === 'ust') add(para(run(b.n, { sz }) + tab() + run(b.text, { sz }), { ind: [397, 397], after: compact ? 40 : 70, jc: 'both' }));
    else if (b.t === 'pkt') add(para(run(b.n, { sz }) + tab() + run(b.text, { sz }), { ind: [794, 397], after: compact ? 30 : 50, jc: 'both' }));
    else if (b.t === 'att') add(para(run(b.text, { b: true, sz: 21, font: 'Montserrat' }), { after: 140, keep: true, pbb: pb }));
    else if (b.t === 'gap') add(para('', { after: 160 }));
    else if (b.t === 'small') add(para(run(b.text, { sz: 18, color: '5D6068' }), { after: 60 }));
    else if (b.t === 'pb') pendingPB = true;
    else if (b.t === 'kv') add(kvTable(b) + para('', { after: 60 }));
    else if (b.t === 'sign') add(para('', { after: 360 }) + twoColTable([b.left, b.right].map(c => label(c.label) + para('', { after: 520 }) + para(run('……………………………………', { sz: 19 }), { after: 20 }) + para(lines(c.lines, { sz: 18 }), { after: 0 }))));
    else if (b.t === 'sign2') add(para('', { after: 300 }) + twoColTable([b.left, b.right].map(c => label(c.label)
      + (c.firm ? para(run(c.firm, { b: true, sz: 19 }), { after: 0 }) : '')
      + c.people.map(pp => para('', { after: 420 }) + para(run('……………………………………', { sz: 19 }), { after: 10 }) + para(run(pp, { sz: 18 }), { after: 0 })).join(''))));
  }
  return body;
}

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

function headerXml(hasLogo, brand = M2_BRAND) {
  if (brand.plain) return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${NS}>${para('', { after: 0 })}</w:hdr>`;
  const cx = 1530000, cy = Math.round(cx * brand.ratio);
  const logo = hasLogo ? `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="10" name="Logo M2 TAX"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="10" name="logo.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdLogo"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>` : run('M2 TAX', { b: true, sz: 32, font: 'Montserrat' });
  const small = t => run(t, { sz: 14, color: '5D6068' });
  const right = `<w:tc><w:tcPr><w:tcW w:w="5638" w:type="dxa"/><w:vAlign w:val="bottom"/></w:tcPr>${brand.lines.map(l => para(small(l), { jc: 'right', after: 0 })).join('')}</w:tc>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${NS}><w:tbl><w:tblPr><w:tblW w:w="${W}" w:type="dxa"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/><w:bottom w:val="single" w:sz="12" w:space="0" w:color="B08D57"/></w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/><w:bottom w:w="90" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w="4000"/><w:gridCol w:w="5638"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/><w:vAlign w:val="bottom"/></w:tcPr>${para(logo, { after: 0 })}</w:tc>${right}</w:tr></w:tbl>${para('', { after: 0 })}</w:hdr>`;
}
function footerXml(brand = M2_BRAND) {
  const r = t => run(t, { sz: 14, color: '8A8C92' });
  const fld = code => `<w:r><w:rPr><w:color w:val="8A8C92"/><w:sz w:val="14"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:color w:val="8A8C92"/><w:sz w:val="14"/></w:rPr><w:instrText xml:space="preserve"> ${code} </w:instrText></w:r><w:r><w:rPr><w:color w:val="8A8C92"/><w:sz w:val="14"/></w:rPr><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:color w:val="8A8C92"/><w:sz w:val="14"/></w:rPr><w:t>1</w:t></w:r><w:r><w:rPr><w:color w:val="8A8C92"/><w:sz w:val="14"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${NS}><w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="4" w:space="5" w:color="D6D2CA"/></w:pBdr><w:tabs><w:tab w:val="right" w:pos="${W}"/></w:tabs><w:spacing w:after="0"/></w:pPr>${r(brand.foot1.replace(/ · /g, '  |  '))}<w:r><w:tab/></w:r>${r('Strona ')}${fld('PAGE')}${r(' z ')}${fld('NUMPAGES')}</w:p>${para(r(brand.foot2), { after: 0 })}</w:ftr>`;
}

export async function buildOrderDocx(blocks, brand = M2_BRAND) {
  let logo = null;
  if (brand.logo) try { logo = new Uint8Array(await (await fetch(brand.logo)).arrayBuffer()); } catch { /* bez logo */ }
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${NS}><w:body>${docxBody(blocks)}<w:sectPr><w:headerReference w:type="default" r:id="rIdHdr"/><w:footerReference w:type="default" r:id="rIdFtr"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1650" w:right="1134" w:bottom="1250" w:left="1134" w:header="500" w:footer="420" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/><w:color w:val="1C1D21"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="pl-PL"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;
  const rels = (extra = '') => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${extra}</Relationships>`;
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
  const files = [
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>` },
    { name: '_rels/.rels', data: rels(`<Relationship Id="rId1" Type="${R}officeDocument" Target="word/document.xml"/>`) },
    { name: 'word/_rels/document.xml.rels', data: rels(`<Relationship Id="rIdStyles" Type="${R}styles" Target="styles.xml"/><Relationship Id="rIdHdr" Type="${R}header" Target="header1.xml"/><Relationship Id="rIdFtr" Type="${R}footer" Target="footer1.xml"/>`) },
    { name: 'word/_rels/header1.xml.rels', data: rels(logo ? `<Relationship Id="rIdLogo" Type="${R}image" Target="media/logo.png"/>` : '') },
    { name: 'word/document.xml', data: doc },
    { name: 'word/styles.xml', data: styles },
    { name: 'word/header1.xml', data: headerXml(!!logo, brand) },
    { name: 'word/footer1.xml', data: footerXml(brand) },
    ...(logo ? [{ name: 'word/media/logo.png', data: logo }] : []),
  ];
  return zip(files);
}

export async function downloadOrderDocx(blocks, filename) {
  const bytes = await buildOrderDocx(blocks);
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
