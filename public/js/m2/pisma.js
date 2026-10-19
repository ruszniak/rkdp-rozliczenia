// Wzory pism procesowych M2 TAX – na papierze firmowym, z wybranym pełnomocnikiem.
// Pola do uzupełnienia oznaczone są [w nawiasach kwadratowych] – w Wordzie mają żółte wyróżnienie.
import { FIRM } from './dict.js';
import { M2_BRAND, dateLong } from './order.js';

const F = t => `[${t}]`;
const OP = 'ustawy z dnia 29 sierpnia 1997 r. – Ordynacja podatkowa (t.j. Dz.U. z [rok] r. poz. [……] ze zm.; dalej: „Ordynacja podatkowa” lub „o.p.”)';
const PPSA = 'ustawy z dnia 30 sierpnia 2002 r. – Prawo o postępowaniu przed sądami administracyjnymi (t.j. Dz.U. z [rok] r. poz. [……] ze zm.; dalej: „p.p.s.a.”)';

export const ADDR = {
  us: 'Naczelnik [……] Urzędu Skarbowego w [……]\n[ulica i numer]\n[kod pocztowy, miejscowość]',
  dias: 'Dyrektor Izby Administracji Skarbowej we Wrocławiu\nul. Powstańców Śląskich 24\n53-333 Wrocław',
  wsa: 'Wojewódzki Sąd Administracyjny we Wrocławiu\nul. Jedności Narodowej 6c\n50-260 Wrocław',
  nsa: 'Naczelny Sąd Administracyjny\nul. gen. Józefa Bema 2\n01-244 Warszawa',
  kis: 'Dyrektor Krajowej Informacji Skarbowej\nul. Teodora Sixta 17\n43-300 Bielsko-Biała',
};

// Pola formularza: client, poa, addr, via, ref, actOrg, actDate, actNo, served, subject, value, poaWhere
export const PISMA = {
  pismo: {
    group: 'Postępowanie podatkowe', label: 'Pismo ogólne do organu', desc: 'Wniosek, oświadczenie, przedłożenie dokumentów – dowolne pismo w toczącej się sprawie.',
    party: 'Strona', addr: ADDR.us, fields: ['ref', 'subject'], subjectLabel: 'Przedmiot pisma (krótko)',
    build: (d, X) => [
      { t: 'title', text: 'PISMO STRONY' },
      { t: 'subtitle', text: `w sprawie ${d.subject || F('przedmiot sprawy')}` },
      { t: 'p', text: `Działając w imieniu i na rzecz Strony, na podstawie pełnomocnictwa ${X.poaTxt}, ${X.v('niniejszym wnoszę o', 'niniejszym wnosimy o')} ${F('treść żądania / wniosku')}.` },
      { t: 'subtitle', text: 'UZASADNIENIE' },
      { t: 'p', text: F('Opis okoliczności sprawy oraz argumentacja uzasadniająca wniosek.') },
      { t: 'p', text: F('Powołanie podstawy prawnej i ewentualnych dowodów.') },
      { t: 'p', text: `Mając powyższe na uwadze, ${X.v('wnoszę', 'wnosimy')} jak na wstępie.` },
    ],
  },
  wezwanie: {
    group: 'Postępowanie podatkowe', label: 'Odpowiedź na wezwanie / wyjaśnienia', desc: 'Wyjaśnienia i dokumenty w odpowiedzi na wezwanie organu (czynności sprawdzające, postępowanie).',
    party: 'Strona', addr: ADDR.us, fields: ['ref', 'actDate', 'actNo', 'served'], actLabel: 'wezwania',
    build: (d, X) => [
      { t: 'title', text: 'WYJAŚNIENIA' },
      { t: 'subtitle', text: `w odpowiedzi na wezwanie z dnia ${X.date(d.actDate)}${d.actNo ? `, nr ${d.actNo}` : ''}` },
      { t: 'p', text: `Działając w imieniu i na rzecz Strony, na podstawie pełnomocnictwa ${X.poaTxt}, w odpowiedzi na wezwanie z dnia ${X.date(d.actDate)}, doręczone w dniu ${X.date(d.served)}, ${X.v('przedkładam', 'przedkładamy')} następujące wyjaśnienia:` },
      { t: 'ust', n: '1.', text: `Ad pkt 1 wezwania – ${F('wyjaśnienia')}.` },
      { t: 'ust', n: '2.', text: `Ad pkt 2 wezwania – ${F('wyjaśnienia')}.` },
      { t: 'ust', n: '3.', text: `Ad pkt 3 wezwania – ${F('wyjaśnienia')}.` },
      { t: 'p', text: `Jednocześnie ${X.v('przedkładam', 'przedkładamy')} dokumenty wskazane w wykazie załączników. ${X.v('Wnoszę', 'Wnosimy')} o uznanie wezwania za wykonane w całości.` },
    ],
    atts: ['[dokumenty wskazane w wezwaniu]'],
  },
  zastrzezenia: {
    group: 'Postępowanie podatkowe', label: 'Zastrzeżenia do protokołu kontroli', desc: 'Art. 291 § 1 o.p. – 14 dni od doręczenia protokołu.',
    party: 'Kontrolowany', addr: ADDR.us, fields: ['ref', 'actDate', 'served', 'subject'], actLabel: 'protokołu', subjectLabel: 'Zakres kontroli (np. VAT za 2024 r.)',
    build: (d, X) => [
      { t: 'title', text: 'ZASTRZEŻENIA DO PROTOKOŁU KONTROLI PODATKOWEJ' },
      { t: 'subtitle', text: `z dnia ${X.date(d.actDate)} – w zakresie ${d.subject || F('podatek i okres')}` },
      { t: 'p', text: `Działając w imieniu i na rzecz Kontrolowanego, na podstawie pełnomocnictwa ${X.poaTxt}, na podstawie art. 291 § 1 ${OP}, w terminie 14 dni od dnia doręczenia protokołu (doręczenie: ${X.date(d.served)}) ${X.v('przedstawiam', 'przedstawiamy')} następujące zastrzeżenia do ustaleń zawartych w protokole kontroli:` },
      { t: 'h', text: 'Zastrzeżenie 1' },
      { t: 'p', text: `Ustalenie protokołu (str. ${F('…')}): ${F('przytoczenie ustalenia')}.` },
      { t: 'p', text: `Stanowisko Kontrolowanego: ${F('dlaczego ustalenie jest nieprawidłowe, z powołaniem dowodów i przepisów')}.` },
      { t: 'h', text: 'Zastrzeżenie 2' },
      { t: 'p', text: `Ustalenie protokołu (str. ${F('…')}): ${F('przytoczenie ustalenia')}.` },
      { t: 'p', text: `Stanowisko Kontrolowanego: ${F('argumentacja')}.` },
      { t: 'h', text: 'Wnioski dowodowe' },
      { t: 'p', text: `Na podstawie art. 291 § 1 w zw. z art. 188 o.p. ${X.v('wnoszę', 'wnosimy')} o przeprowadzenie dowodu z ${F('dokumentów / przesłuchania świadka …')} na okoliczność ${F('…')}.` },
      { t: 'p', text: `Mając powyższe na uwadze, ${X.v('wnoszę', 'wnosimy')} o uwzględnienie zastrzeżeń i odpowiednią zmianę ustaleń protokołu.` },
    ],
  },
  akta: {
    group: 'Postępowanie podatkowe', label: 'Wniosek o wgląd w akta', desc: 'Art. 178 o.p. – przegląd akt, notatki, kopie i odpisy.',
    party: 'Strona', addr: ADDR.us, fields: ['ref', 'subject'], subjectLabel: 'Postępowanie (np. w sprawie VAT za 2024 r.)',
    build: (d, X) => [
      { t: 'title', text: 'WNIOSEK O UDOSTĘPNIENIE AKT SPRAWY' },
      { t: 'p', text: `Działając w imieniu i na rzecz Strony, na podstawie pełnomocnictwa ${X.poaTxt}, na podstawie art. 178 § 1 ${OP}, ${X.v('wnoszę', 'wnosimy')} o umożliwienie zapoznania się z aktami ${d.subject ? `postępowania ${d.subject}` : `sprawy ${F('oznaczenie postępowania')}`} oraz sporządzenia z nich notatek, kopii i odpisów, w tym przy użyciu własnych urządzeń utrwalających obraz.` },
      { t: 'p', text: `Jednocześnie, na podstawie art. 178 § 2 o.p., ${X.v('wnoszę', 'wnosimy')} o wydanie uwierzytelnionych kopii ${F('wskazanie dokumentów')}.` },
      { t: 'p', text: `${X.v('Proszę', 'Prosimy')} o wyznaczenie terminu przeglądania akt i przekazanie informacji pod adresem e-mail ${FIRM.email} lub telefonicznie: ${FIRM.phones}.` },
    ],
  },
  przywrocenie: {
    group: 'Postępowanie podatkowe', label: 'Wniosek o przywrócenie terminu', desc: 'Art. 162 o.p. – 7 dni od ustania przyczyny uchybienia, z dopełnieniem czynności.',
    party: 'Strona', addr: ADDR.us, fields: ['ref', 'subject'], subjectLabel: 'Czynność, której termin uchybiono (np. do wniesienia odwołania)',
    build: (d, X) => [
      { t: 'title', text: 'WNIOSEK O PRZYWRÓCENIE TERMINU' },
      { t: 'subtitle', text: d.subject || F('do dokonania czynności') },
      { t: 'p', text: `Działając w imieniu i na rzecz Strony, na podstawie pełnomocnictwa ${X.poaTxt}, na podstawie art. 162 § 1 i § 2 ${OP}, ${X.v('wnoszę', 'wnosimy')} o przywrócenie terminu ${d.subject || F('do dokonania czynności')}.` },
      { t: 'p', text: `Jednocześnie z niniejszym wnioskiem, zgodnie z art. 162 § 2 zd. 2 o.p., ${X.v('dokonuję', 'dokonujemy')} uchybionej czynności – ${F('np. wnoszę odwołanie stanowiące załącznik do wniosku')}.` },
      { t: 'subtitle', text: 'UZASADNIENIE' },
      { t: 'ust', n: '1.', text: `Termin do ${F('czynność')} upływał w dniu ${F('data')}.` },
      { t: 'ust', n: '2.', text: `Uchybienie terminu nastąpiło bez winy Strony z następującej przyczyny: ${F('opis przeszkody, np. choroba, zdarzenie losowe')}. Okoliczność tę uprawdopodobniają ${F('dokumenty')}.` },
      { t: 'ust', n: '3.', text: `Przyczyna uchybienia ustała w dniu ${F('data')}, zatem wniosek wniesiono w terminie 7 dni, o którym mowa w art. 162 § 2 o.p.` },
      { t: 'p', text: `Mając na uwadze, że Strona uprawdopodobniła brak winy w uchybieniu terminu, a wniosek spełnia wymogi art. 162 § 2 o.p., ${X.v('wnoszę', 'wnosimy')} jak na wstępie.` },
    ],
    atts: ['[dokument uprawdopodobniający brak winy]', '[pismo, którym dokonano uchybionej czynności]'],
  },
  ponaglenie: {
    group: 'Postępowanie podatkowe', label: 'Ponaglenie (bezczynność / przewlekłość)', desc: 'Art. 141 o.p. – do organu wyższego stopnia za pośrednictwem organu prowadzącego.',
    party: 'Strona', addr: ADDR.dias, via: ADDR.us, fields: ['ref', 'subject'], subjectLabel: 'Sprawa (np. wniosek o zwrot VAT z dnia …)',
    build: (d, X) => [
      { t: 'title', text: 'PONAGLENIE' },
      { t: 'subtitle', text: `na ${F('bezczynność / przewlekłe prowadzenie postępowania')} ${F('nazwa organu w dopełniaczu')}` },
      { t: 'p', text: `Działając w imieniu i na rzecz Strony, na podstawie pełnomocnictwa ${X.poaTxt}, na podstawie art. 141 § 1 i § 2 ${OP}, ${X.v('wnoszę', 'wnosimy')} ponaglenie w sprawie ${d.subject || F('oznaczenie sprawy')} i ${X.v('wnoszę', 'wnosimy')} o:` },
      { t: 'pkt', n: '1)', text: `stwierdzenie, że organ ${F('dopuścił się bezczynności / prowadzi postępowanie przewlekle')}${F(', przy czym miało to miejsce z rażącym naruszeniem prawa')};` },
      { t: 'pkt', n: '2)', text: 'wyznaczenie dodatkowego terminu załatwienia sprawy;' },
      { t: 'pkt', n: '3)', text: 'zarządzenie wyjaśnienia przyczyn i ustalenia osób winnych niezałatwienia sprawy w terminie oraz podjęcia środków zapobiegających naruszaniu terminów w przyszłości.' },
      { t: 'subtitle', text: 'UZASADNIENIE' },
      { t: 'p', text: `${F('Przebieg sprawy: data wszczęcia, kolejne czynności organu, zawiadomienia o nowym terminie (art. 140 o.p.).')}` },
      { t: 'p', text: `Ustawowy termin załatwienia sprawy (art. 139 o.p.) upłynął w dniu ${F('data')}. Do dnia wniesienia ponaglenia sprawa nie została załatwiona, a organ nie wskazał przyczyn zwłoki ani nowego terminu. ${F('Dodatkowa argumentacja.')}` },
    ],
  },
  nadplata: {
    group: 'Postępowanie podatkowe', label: 'Wniosek o stwierdzenie nadpłaty', desc: 'Art. 75 o.p. – wraz z korektą deklaracji.',
    party: 'Wnioskodawca', addr: ADDR.us, fields: ['subject', 'value'], subjectLabel: 'Podatek i okres (np. PIT-36L za 2025 r.)', valueLabel: 'Kwota nadpłaty (zł)',
    build: (d, X) => [
      { t: 'title', text: 'WNIOSEK O STWIERDZENIE NADPŁATY' },
      { t: 'subtitle', text: `w ${d.subject ? `podatku ${d.subject}` : F('podatek i okres')}` },
      { t: 'p', text: `Działając w imieniu i na rzecz Wnioskodawcy, na podstawie pełnomocnictwa ${X.poaTxt}, na podstawie art. 75 § 1, § 2 pkt 1 lit. ${F('a/b/c')} i § 3 ${OP}, ${X.v('wnoszę', 'wnosimy')} o stwierdzenie nadpłaty w ${d.subject ? `podatku ${d.subject}` : F('podatek i okres')} w wysokości ${d.value ? `${d.value} zł` : F('kwota zł')} oraz o jej zwrot na rachunek bankowy Wnioskodawcy nr ${F('numer rachunku')} ${F('/ zaliczenie na poczet …')}.` },
      { t: 'p', text: 'Jednocześnie, zgodnie z art. 75 § 3 o.p., do wniosku dołączono skorygowaną deklarację (zeznanie).' },
      { t: 'subtitle', text: 'UZASADNIENIE' },
      { t: 'p', text: F('Przyczyna powstania nadpłaty, sposób jej wyliczenia oraz podstawa prawna.') },
      { t: 'p', text: `Wobec powyższego ${X.v('wnoszę', 'wnosimy')} jak na wstępie.` },
    ],
    atts: ['korekta deklaracji (zeznania) [symbol formularza]', 'wyjaśnienie przyczyn złożenia korekty'],
  },
  ulga: {
    group: 'Postępowanie podatkowe', label: 'Wniosek o ulgę w spłacie (raty, odroczenie, umorzenie)', desc: 'Art. 67a § 1 o.p. – ważny interes podatnika lub interes publiczny.',
    party: 'Wnioskodawca', addr: ADDR.us, fields: ['subject', 'value'], subjectLabel: 'Zaległość / podatek (np. VAT za lipiec 2026 r.)', valueLabel: 'Kwota (zł)',
    build: (d, X) => [
      { t: 'title', text: 'WNIOSEK O UDZIELENIE ULGI W SPŁACIE ZOBOWIĄZANIA PODATKOWEGO' },
      { t: 'subtitle', text: `${F('rozłożenie na raty / odroczenie terminu płatności / umorzenie zaległości')} – ${d.subject || F('podatek i okres')}` },
      { t: 'p', text: `Działając w imieniu i na rzecz Wnioskodawcy, na podstawie pełnomocnictwa ${X.poaTxt}, na podstawie art. 67a § 1 pkt ${F('1 / 2 / 3')} ${OP}, ${X.v('wnoszę', 'wnosimy')} o ${F('rozłożenie na raty zapłaty / odroczenie terminu płatności / umorzenie w całości lub w części')} ${d.subject ? `zobowiązania (zaległości) w ${d.subject}` : F('wskazanie zobowiązania')} w kwocie ${d.value ? `${d.value} zł` : F('kwota zł')}${F(' wraz z odsetkami za zwłokę / opłatą prolongacyjną')}.` },
      { t: 'p', text: `${X.v('Proponuję', 'Proponujemy')} następujący harmonogram spłaty: ${F('liczba rat, wysokość i terminy')}.` },
      { t: 'subtitle', text: 'UZASADNIENIE' },
      { t: 'h', text: 'I. Ważny interes podatnika' },
      { t: 'p', text: F('Sytuacja majątkowa, rodzinna i zdrowotna Wnioskodawcy, przyczyny powstania zaległości, zdarzenia losowe.') },
      { t: 'h', text: 'II. Interes publiczny' },
      { t: 'p', text: F('Np. zachowanie miejsc pracy, możliwość dalszego regulowania zobowiązań publicznoprawnych.') },
      { t: 'h', text: 'III. Sytuacja finansowa' },
      { t: 'p', text: F('Przychody, koszty, zadłużenie, posiadany majątek – w nawiązaniu do załączonych dokumentów.') },
      { t: 'p', text: `Mając powyższe na uwadze, ${X.v('wnoszę', 'wnosimy')} jak na wstępie.` },
    ],
    atts: ['oświadczenie o stanie majątkowym i sytuacji finansowej', '[dokumenty potwierdzające sytuację finansową]', '[formularz informacji o pomocy publicznej – jeśli dotyczy]'],
  },
  zawieszenie: {
    group: 'Postępowanie podatkowe', label: 'Wniosek o zawieszenie postępowania', desc: 'Art. 201 § 1 / art. 205 § 1 o.p. – np. zagadnienie wstępne.',
    party: 'Strona', addr: ADDR.us, fields: ['ref', 'subject'], subjectLabel: 'Postępowanie (np. w sprawie VAT za 2024 r.)',
    build: (d, X) => [
      { t: 'title', text: 'WNIOSEK O ZAWIESZENIE POSTĘPOWANIA' },
      { t: 'p', text: `Działając w imieniu i na rzecz Strony, na podstawie pełnomocnictwa ${X.poaTxt}, na podstawie art. ${F('201 § 1 pkt 2 / 205 § 1')} ${OP}, ${X.v('wnoszę', 'wnosimy')} o zawieszenie postępowania ${d.subject || F('oznaczenie postępowania')} do czasu ${F('rozstrzygnięcia zagadnienia wstępnego przez … / ustania przyczyny')}.` },
      { t: 'subtitle', text: 'UZASADNIENIE' },
      { t: 'p', text: F('Wskazanie zagadnienia wstępnego (organ / sąd, sygnatura) i jego wpływu na rozstrzygnięcie sprawy.') },
      { t: 'p', text: `Mając powyższe na uwadze, ${X.v('wnoszę', 'wnosimy')} jak na wstępie.` },
    ],
  },
  wstrzymanie: {
    group: 'Środki zaskarżenia', label: 'Wniosek o wstrzymanie wykonania decyzji (WSA)', desc: 'Art. 61 § 3 p.p.s.a. – znaczna szkoda lub trudne do odwrócenia skutki.',
    party: 'Skarżący', organParty: true, court: true, addr: ADDR.wsa, fields: ['ref', 'actOrg', 'actDate', 'actNo', 'subject'], actLabel: 'decyzji', refLabel: 'Sygn. akt',
    actOrgDefault: 'Dyrektora Izby Administracji Skarbowej we Wrocławiu', subjectLabel: 'Przedmiot decyzji',
    build: (d, X) => [
      { t: 'title', text: 'WNIOSEK O WSTRZYMANIE WYKONANIA ZASKARŻONEJ DECYZJI' },
      { t: 'p', text: `Działając w imieniu Skarżącego, na podstawie pełnomocnictwa ${X.poaTxt}, na podstawie art. 61 § 3 ${PPSA}, ${X.v('wnoszę', 'wnosimy')} o wstrzymanie wykonania w całości decyzji ${d.actOrg || F('organ w dopełniaczu')} z dnia ${X.date(d.actDate)}${d.actNo ? `, nr ${d.actNo}` : ''}, w przedmiocie ${d.subject || F('przedmiot decyzji')}.` },
      { t: 'subtitle', text: 'UZASADNIENIE' },
      { t: 'p', text: 'Zgodnie z art. 61 § 3 p.p.s.a. po przekazaniu sądowi skargi sąd może na wniosek skarżącego wydać postanowienie o wstrzymaniu wykonania aktu w całości lub w części, jeżeli zachodzi niebezpieczeństwo wyrządzenia znacznej szkody lub spowodowania trudnych do odwrócenia skutków.' },
      { t: 'p', text: `W niniejszej sprawie wykonanie decyzji ${F('spowoduje / grozi …: opis konkretnych skutków finansowych, utraty płynności, zajęcia rachunków, upadłości')}.` },
      { t: 'p', text: F('Wykazanie sytuacji majątkowej Skarżącego – dokumenty finansowe w załączeniu.') },
      { t: 'p', text: `Mając powyższe na uwadze, ${X.v('wnoszę', 'wnosimy')} jak na wstępie.` },
    ],
    atts: ['[dokumenty finansowe uprawdopodobniające szkodę]'],
  },
  odwolanie: {
    group: 'Środki zaskarżenia', label: 'Odwołanie od decyzji', desc: 'Art. 220–223 o.p. – 14 dni, do DIAS za pośrednictwem organu I instancji.',
    party: 'Strona', addr: ADDR.dias, via: ADDR.us, fields: ['ref', 'actOrg', 'actDate', 'actNo', 'served', 'subject'], actLabel: 'decyzji',
    actOrgDefault: 'Naczelnika [……] Urzędu Skarbowego w [……]', subjectLabel: 'Przedmiot decyzji (np. podatek od towarów i usług za 2024 r.)',
    build: (d, X) => [
      { t: 'title', text: 'ODWOŁANIE' },
      { t: 'subtitle', text: `od decyzji ${d.actOrg || F('organ w dopełniaczu')} z dnia ${X.date(d.actDate)}${d.actNo ? `, nr ${d.actNo}` : ''}, w przedmiocie ${d.subject || F('przedmiot decyzji')}` },
      { t: 'p', text: `Działając w imieniu i na rzecz Strony, na podstawie pełnomocnictwa ${X.poaTxt}, na podstawie art. 220 § 1 w zw. z art. 223 § 1 i § 2 pkt 1 ${OP}, ${X.v('wnoszę', 'wnosimy')} odwołanie od powyższej decyzji, doręczonej w dniu ${X.date(d.served)}, zaskarżając ją w całości.` },
      { t: 'p', text: `Zaskarżonej decyzji ${X.v('zarzucam', 'zarzucamy')} naruszenie:` },
      { t: 'pkt', n: '1)', text: `przepisów prawa materialnego, tj. art. ${F('…')} ustawy ${F('…')}, poprzez ${F('błędną wykładnię / niewłaściwe zastosowanie')} polegające na ${F('…')};` },
      { t: 'pkt', n: '2)', text: `przepisów postępowania, tj. art. 120, art. 121 § 1, art. 122, art. 187 § 1 i art. 191 o.p., poprzez ${F('niewyczerpujące zebranie i rozpatrzenie materiału dowodowego / dowolną ocenę dowodów')}, co miało istotny wpływ na wynik sprawy;` },
      { t: 'pkt', n: '3)', text: `art. 210 § 1 pkt 6 i § 4 o.p., poprzez ${F('wadliwe uzasadnienie decyzji')}.` },
      { t: 'p', text: `Wskazując na powyższe zarzuty, ${X.v('wnoszę', 'wnosimy')} o:` },
      { t: 'pkt', n: '1)', text: 'uchylenie zaskarżonej decyzji w całości i umorzenie postępowania w sprawie (art. 233 § 1 pkt 2 lit. a o.p.), ewentualnie:' },
      { t: 'pkt', n: '2)', text: 'uchylenie zaskarżonej decyzji w całości i przekazanie sprawy do ponownego rozpatrzenia przez organ pierwszej instancji (art. 233 § 2 o.p.);' },
      { t: 'pkt', n: '3)', text: `przeprowadzenie dowodu z ${F('…')} na okoliczność ${F('…')} (art. 188 o.p.).` },
      { t: 'subtitle', text: 'UZASADNIENIE' },
      { t: 'h', text: 'I. Stan faktyczny' },
      { t: 'p', text: F('Przebieg postępowania i ustalenia organu pierwszej instancji.') },
      { t: 'h', text: 'II. Naruszenie przepisów prawa materialnego' },
      { t: 'p', text: F('Argumentacja, orzecznictwo, interpretacje.') },
      { t: 'h', text: 'III. Naruszenie przepisów postępowania' },
      { t: 'p', text: F('Argumentacja dotycząca postępowania dowodowego i uzasadnienia decyzji.') },
      { t: 'h', text: 'IV. Termin' },
      { t: 'p', text: `Decyzja została doręczona w dniu ${X.date(d.served)}, zatem odwołanie wniesiono z zachowaniem terminu, o którym mowa w art. 223 § 2 pkt 1 o.p.` },
      { t: 'p', text: `Mając powyższe na uwadze, ${X.v('wnoszę', 'wnosimy')} jak na wstępie.` },
    ],
  },
  zazalenie: {
    group: 'Środki zaskarżenia', label: 'Zażalenie na postanowienie', desc: 'Art. 236 i 239 o.p. – 7 dni od doręczenia postanowienia.',
    party: 'Strona', addr: ADDR.dias, via: ADDR.us, fields: ['ref', 'actOrg', 'actDate', 'actNo', 'served', 'subject'], actLabel: 'postanowienia',
    actOrgDefault: 'Naczelnika [……] Urzędu Skarbowego w [……]', subjectLabel: 'Przedmiot postanowienia (np. odmowa przeprowadzenia dowodu)',
    build: (d, X) => [
      { t: 'title', text: 'ZAŻALENIE' },
      { t: 'subtitle', text: `na postanowienie ${d.actOrg || F('organ w dopełniaczu')} z dnia ${X.date(d.actDate)}${d.actNo ? `, nr ${d.actNo}` : ''}, w przedmiocie ${d.subject || F('przedmiot postanowienia')}` },
      { t: 'p', text: `Działając w imieniu i na rzecz Strony, na podstawie pełnomocnictwa ${X.poaTxt}, na podstawie art. 236 § 1 i § 2 pkt 1 w zw. z art. 239 i art. 223 § 1 ${OP}, ${X.v('wnoszę', 'wnosimy')} zażalenie na powyższe postanowienie, doręczone w dniu ${X.date(d.served)}, zaskarżając je w całości.` },
      { t: 'p', text: `Zaskarżonemu postanowieniu ${X.v('zarzucam', 'zarzucamy')} naruszenie:` },
      { t: 'pkt', n: '1)', text: `art. ${F('…')} poprzez ${F('…')};` },
      { t: 'pkt', n: '2)', text: `art. 124 w zw. z art. 219 o.p. poprzez ${F('niewyjaśnienie zasadności przesłanek, którymi kierował się organ')}.` },
      { t: 'p', text: `Wskazując na powyższe, ${X.v('wnoszę', 'wnosimy')} o uchylenie zaskarżonego postanowienia w całości ${F('i orzeczenie co do istoty sprawy / i przekazanie sprawy do ponownego rozpatrzenia')} (art. 233 w zw. z art. 239 o.p.).` },
      { t: 'subtitle', text: 'UZASADNIENIE' },
      { t: 'p', text: F('Stan faktyczny i argumentacja.') },
      { t: 'p', text: `Postanowienie doręczono w dniu ${X.date(d.served)}, zatem zażalenie wniesiono w terminie 7 dni (art. 236 § 2 pkt 1 o.p.). Mając powyższe na uwadze, ${X.v('wnoszę', 'wnosimy')} jak na wstępie.` },
    ],
  },
  wsa: {
    group: 'Środki zaskarżenia', label: 'Skarga do WSA', desc: 'Art. 50, 53 § 1, 54 § 1 p.p.s.a. – 30 dni, za pośrednictwem organu.',
    party: 'Skarżący', organParty: true, court: true, addr: ADDR.wsa, via: ADDR.dias, fields: ['ref', 'actOrg', 'actDate', 'actNo', 'served', 'subject', 'value'], actLabel: 'decyzji',
    actOrgDefault: 'Dyrektora Izby Administracji Skarbowej we Wrocławiu', subjectLabel: 'Przedmiot decyzji (np. podatek od towarów i usług za 2024 r.)', valueLabel: 'Wartość przedmiotu zaskarżenia (zł)',
    build: (d, X) => [
      { t: 'title', text: 'SKARGA' },
      { t: 'subtitle', text: `na decyzję ${d.actOrg || F('organ w dopełniaczu')} z dnia ${X.date(d.actDate)}${d.actNo ? `, nr ${d.actNo}` : ''}, w przedmiocie ${d.subject || F('przedmiot decyzji')}` },
      { t: 'ref', label: 'Wartość przedmiotu zaskarżenia:', text: d.value ? `${d.value} zł` : F('kwota zł') },
      { t: 'gap' },
      { t: 'p', text: `Działając w imieniu Skarżącego, na podstawie pełnomocnictwa ${X.poaTxt}, na podstawie art. 3 § 2 pkt 1, art. 50 § 1, art. 53 § 1 i art. 54 § 1 ${PPSA}, ${X.v('wnoszę', 'wnosimy')} skargę na powyższą decyzję, doręczoną w dniu ${X.date(d.served)}, zaskarżając ją w całości.` },
      { t: 'p', text: `Zaskarżonej decyzji ${X.v('zarzucam', 'zarzucamy')} naruszenie:` },
      { t: 'pkt', n: '1)', text: `przepisów prawa materialnego, tj. art. ${F('…')} ustawy ${F('…')}, poprzez ${F('błędną wykładnię / niewłaściwe zastosowanie')}, co miało wpływ na wynik sprawy;` },
      { t: 'pkt', n: '2)', text: `przepisów postępowania, tj. art. 120, art. 121 § 1, art. 122, art. 187 § 1 i art. 191 ustawy z dnia 29 sierpnia 1997 r. – Ordynacja podatkowa (dalej: „o.p.”), poprzez ${F('…')}, co mogło mieć istotny wpływ na wynik sprawy.` },
      { t: 'p', text: `Wskazując na powyższe zarzuty, ${X.v('wnoszę', 'wnosimy')} o:` },
      { t: 'pkt', n: '1)', text: 'uchylenie zaskarżonej decyzji oraz poprzedzającej ją decyzji organu pierwszej instancji (art. 145 § 1 pkt 1 lit. a i c oraz art. 135 p.p.s.a.);' },
      { t: 'pkt', n: '2)', text: 'zasądzenie od organu na rzecz Skarżącego zwrotu kosztów postępowania, w tym kosztów zastępstwa procesowego według norm przepisanych (art. 200 i art. 205 § 2 p.p.s.a.);' },
      { t: 'pkt', n: '3)', text: `${F('rozpoznanie sprawy na rozprawie / w trybie uproszczonym (art. 119 pkt 2 p.p.s.a.)')}.` },
      { t: 'subtitle', text: 'UZASADNIENIE' },
      { t: 'h', text: 'I. Stan faktyczny i przebieg postępowania' },
      { t: 'p', text: F('Opis sprawy, decyzje organów obu instancji.') },
      { t: 'h', text: 'II. Zarzuty naruszenia prawa materialnego' },
      { t: 'p', text: F('Argumentacja i orzecznictwo sądów administracyjnych.') },
      { t: 'h', text: 'III. Zarzuty naruszenia przepisów postępowania' },
      { t: 'p', text: F('Argumentacja.') },
      { t: 'h', text: 'IV. Dopuszczalność i termin skargi' },
      { t: 'p', text: `Skarżący wyczerpał środki zaskarżenia przysługujące w postępowaniu podatkowym (art. 52 § 1 p.p.s.a.). Decyzję doręczono w dniu ${X.date(d.served)}, zatem skargę wniesiono w terminie 30 dni (art. 53 § 1 p.p.s.a.).` },
    ],
    atts: ['odpis skargi', '[dowód uiszczenia wpisu – po wezwaniu sądu]'],
  },
  nsa: {
    group: 'Środki zaskarżenia', label: 'Skarga kasacyjna do NSA', desc: 'Art. 173–177 p.p.s.a. – 30 dni od doręczenia wyroku z uzasadnieniem, za pośrednictwem WSA.',
    party: 'Skarżący kasacyjnie', organParty: true, court: true, addr: ADDR.nsa, via: ADDR.wsa, fields: ['ref', 'actDate', 'served', 'subject'], actLabel: 'wyroku', refLabel: 'Sygn. akt',
    subjectLabel: 'Przedmiot sprawy (np. podatek dochodowy od osób prawnych za 2019 r.)',
    build: (d, X) => [
      { t: 'title', text: 'SKARGA KASACYJNA' },
      { t: 'subtitle', text: `od wyroku Wojewódzkiego Sądu Administracyjnego we Wrocławiu z dnia ${X.date(d.actDate)}, sygn. akt ${d.ref || F('…')}${d.subject ? `, w sprawie ${d.subject}` : ''}` },
      { t: 'p', text: `Działając w imieniu Skarżącego kasacyjnie, na podstawie pełnomocnictwa ${X.poaTxt}, na podstawie art. 173 § 1, art. 175 § 2, art. 176 i art. 177 § 1 ${PPSA}, ${X.v('wnoszę', 'wnosimy')} skargę kasacyjną od powyższego wyroku, doręczonego wraz z uzasadnieniem w dniu ${X.date(d.served)}, zaskarżając go w całości.` },
      { t: 'p', text: `Na podstawie art. 174 pkt 1 i 2 p.p.s.a. zaskarżonemu wyrokowi ${X.v('zarzucam', 'zarzucamy')}:` },
      { t: 'pkt', n: '1)', text: `naruszenie prawa materialnego, tj. art. ${F('…')} ustawy ${F('…')}, poprzez ${F('błędną wykładnię polegającą na … / niewłaściwe zastosowanie polegające na …')};` },
      { t: 'pkt', n: '2)', text: `naruszenie przepisów postępowania, które mogło mieć istotny wpływ na wynik sprawy, tj. art. 145 § 1 pkt 1 lit. c w zw. z art. 151 p.p.s.a. w zw. z art. ${F('…')} o.p., poprzez ${F('oddalenie skargi pomimo …')}, a także art. 141 § 4 p.p.s.a. poprzez ${F('…')}.` },
      { t: 'p', text: `Wskazując na powyższe zarzuty, ${X.v('wnoszę', 'wnosimy')} o:` },
      { t: 'pkt', n: '1)', text: 'uchylenie zaskarżonego wyroku w całości i rozpoznanie skargi (art. 188 p.p.s.a.), ewentualnie uchylenie zaskarżonego wyroku w całości i przekazanie sprawy do ponownego rozpoznania Wojewódzkiemu Sądowi Administracyjnemu we Wrocławiu (art. 185 § 1 p.p.s.a.);' },
      { t: 'pkt', n: '2)', text: 'zasądzenie od organu na rzecz Skarżącego kasacyjnie zwrotu kosztów postępowania kasacyjnego, w tym kosztów zastępstwa procesowego według norm przepisanych (art. 203 pkt 1 p.p.s.a.).' },
      { t: 'p', text: `Na podstawie art. 176 § 2 p.p.s.a. ${X.v('oświadczam', 'oświadczamy')}, że Skarżący kasacyjnie ${F('zrzeka się rozprawy / wnosi o rozpoznanie skargi kasacyjnej na rozprawie')}.` },
      { t: 'subtitle', text: 'UZASADNIENIE' },
      { t: 'h', text: 'I. Przebieg postępowania' },
      { t: 'p', text: F('Decyzje organów, skarga, rozstrzygnięcie i motywy WSA.') },
      { t: 'h', text: 'II. Uzasadnienie zarzutu naruszenia prawa materialnego' },
      { t: 'p', text: F('Argumentacja.') },
      { t: 'h', text: 'III. Uzasadnienie zarzutu naruszenia przepisów postępowania' },
      { t: 'p', text: F('Argumentacja oraz wykazanie istotnego wpływu naruszenia na wynik sprawy.') },
      { t: 'p', text: `Skarga kasacyjna została sporządzona przez doradcę podatkowego (art. 175 § 2 p.p.s.a.) i wniesiona w terminie 30 dni od doręczenia wyroku z uzasadnieniem (art. 177 § 1 p.p.s.a.). Mając powyższe na uwadze, ${X.v('wnoszę', 'wnosimy')} jak na wstępie.` },
    ],
    atts: ['odpis skargi kasacyjnej', '[dowód uiszczenia wpisu]'],
  },
  interpretacja: {
    group: 'Interpretacje', label: 'Wniosek o interpretację indywidualną', desc: 'Art. 14b o.p. – treść wniosku (opis, pytanie, stanowisko) do formularza ORD-IN, opłata 40 zł.',
    party: 'Wnioskodawca', addr: ADDR.kis, fields: ['subject'], subjectLabel: 'Zakres (np. podatek od towarów i usług – sprzedaż działki)',
    build: (d, X) => [
      { t: 'title', text: 'WNIOSEK O WYDANIE INTERPRETACJI INDYWIDUALNEJ' },
      { t: 'subtitle', text: `w zakresie ${d.subject || F('podatek / zagadnienie')}` },
      { t: 'p', text: `Działając w imieniu i na rzecz Wnioskodawcy, na podstawie pełnomocnictwa ${X.poaTxt}, na podstawie art. 14b § 1 ${OP}, ${X.v('wnoszę', 'wnosimy')} o wydanie interpretacji indywidualnej przepisów prawa podatkowego w zakresie ${d.subject || F('…')}. Wniosek dotyczy ${F('stanu faktycznego / zdarzenia przyszłego')}.` },
      { t: 'h', text: `I. Opis ${F('stanu faktycznego / zdarzenia przyszłego')}` },
      { t: 'p', text: F('Wyczerpujący opis – wszystkie elementy istotne dla rozstrzygnięcia (art. 14b § 3 o.p.).') },
      { t: 'h', text: 'II. Pytanie' },
      { t: 'p', text: F('Czy … ?') },
      { t: 'h', text: 'III. Stanowisko Wnioskodawcy' },
      { t: 'p', text: `Zdaniem Wnioskodawcy ${F('jednoznaczne stanowisko w sprawie oceny prawnej')}.` },
      { t: 'p', text: F('Uzasadnienie stanowiska – przepisy, orzecznictwo, interpretacje.') },
      { t: 'h', text: 'IV. Oświadczenie' },
      { t: 'p', text: 'Na podstawie art. 14b § 4 o.p. Wnioskodawca oświadcza, że elementy stanu faktycznego (zdarzenia przyszłego) objęte wnioskiem o wydanie interpretacji w dniu złożenia wniosku nie są przedmiotem toczącego się postępowania podatkowego, kontroli podatkowej, kontroli celno-skarbowej oraz że w tym zakresie sprawa nie została rozstrzygnięta co do jej istoty w decyzji lub postanowieniu organu podatkowego. Wnioskodawca jest świadomy odpowiedzialności karnej za złożenie fałszywego oświadczenia.' },
      { t: 'h', text: 'V. Opłata' },
      { t: 'p', text: `Opłatę od wniosku w wysokości ${F('40 zł × liczba stanów faktycznych / zdarzeń przyszłych')} (art. 14f § 1 o.p.) uiszczono na rachunek Krajowej Informacji Skarbowej – dowód wpłaty w załączeniu.` },
    ],
    atts: ['dowód uiszczenia opłaty od wniosku'],
  },
};

export function pismoBlocks(type, d, signers) {
  const T = PISMA[type];
  const sg = signers.length ? signers : [{ full_name: '[……]', license_no: '[……]' }];
  const many = sg.length > 1;
  const X = {
    v: (one, more) => many ? more : one,
    date: iso => iso ? dateLong(iso) : '[data]',
    poaTxt: T.court
      ? (d.poaWhere === 'akta' ? 'procesowego znajdującego się w aktach sprawy' : 'procesowego, które przedkładam w załączeniu')
      : (d.poaWhere === 'akta' ? 'szczególnego znajdującego się w aktach sprawy' : 'szczególnego, które przedkładam w załączeniu'),
  };
  if (many) X.poaTxt = X.poaTxt.replace('przedkładam', 'przedkładamy');
  const lines = s => (s || '').split('\n').map(x => x.trim()).filter(Boolean);
  const c = d.client || {};
  const idLine = c.nip ? `NIP: ${c.nip}` : (c.kind === 'osoba' ? 'PESEL: [……]' : 'NIP: [……]');
  const B = [{ t: 'opts', highlight: true }];
  B.push({ t: 'place', text: `${d.place || 'Wrocław'}, dnia ${d.date ? dateLong(d.date) : '[data]'}` });
  const fem = /\b(sp\.|spółka|s\.a\.|fundacja|spółdzielnia)/i.test(c.name || '') || c.kind === 'firma';
  // pisma do sądu: oznaczenie roli strony (Skarżący); do urzędu – same dane strony
  B.push({ t: 'party', label: T.court ? T.party : null, lines: [c.name || '[imię i nazwisko / nazwa]', c.address || '[adres]', idLine] });
  B.push({ t: 'party', lead: `${fem ? 'reprezentowana' : 'reprezentowany'} przez:`, lines: [
    ...sg.map(s => `${s.full_name} – doradca podatkowy, nr wpisu ${s.license_no || '[……]'}`),
    FIRM.address,
    !many && sg[0].ae_address ? `adres do doręczeń elektronicznych: ${sg[0].ae_address}` : null,
  ].filter(Boolean) });
  if (T.organParty) B.push({ t: 'party', label: 'Organ', lines: [d.actOrgNom || (type === 'nsa' ? 'Dyrektor Izby Administracji Skarbowej we Wrocławiu' : (d.actOrg ? d.actOrg.replace(/^Dyrektora/, 'Dyrektor').replace(/^Naczelnika/, 'Naczelnik') : '[organ]'))] });
  B.push({ t: 'addr', lines: lines(d.addr || T.addr), via: T.via && d.via !== '' ? lines(d.via ?? T.via) : null });
  if (T.fields.includes('ref')) B.push({ t: 'ref', label: (T.refLabel || 'Znak sprawy') + ':', text: d.ref || '[……]' });
  B.push({ t: 'gap' });
  B.push(...T.build(d, X));
  // podpis
  B.push({ t: 'signR', lines: many ? [sg.map(s => s.full_name).join(' · '), 'doradcy podatkowi – pełnomocnicy'] : [sg[0].full_name, `doradca podatkowy, nr wpisu ${sg[0].license_no || '[……]'}`] });
  const atts = [
    d.poaWhere === 'akta' ? null : `pełnomocnictwo ${T.court ? 'procesowe' : 'szczególne (PPS-1)'} wraz z dowodem uiszczenia opłaty skarbowej`,
    ...(T.atts || []), '[……]',
  ].filter(Boolean);
  B.push({ t: 'h', text: 'Załączniki:' });
  atts.forEach((a, i) => B.push({ t: 'pkt', n: `${i + 1})`, text: a }));
  return B;
}

// papier firmowy z nazwiskiem wybranego pełnomocnika w nagłówku
export function pismoBrand(signers) {
  const sg = signers.filter(Boolean);
  const top = sg.length === 1 ? `${sg[0].full_name} · doradca podatkowy nr ${sg[0].license_no || '[……]'}`
    : sg.length > 1 ? `${sg.map(s => `${s.full_name} (nr ${s.license_no || '…'})`).join(' · ')} – doradcy podatkowi` : null;
  return { ...M2_BRAND, lines: [top, ...M2_BRAND.lines].filter(Boolean) };
}
