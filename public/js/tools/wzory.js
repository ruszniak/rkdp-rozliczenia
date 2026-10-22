// Wzory umów, uchwał i pism dla klientów (RKDP i M2 TAX) – bez papieru firmowego biura.
// Pola do uzupełnienia oznaczone są [w nawiasach] – w Wordzie mają żółte wyróżnienie.
import { dateLong, zl, slownie } from '../m2/order.js';

const F = t => `[${t}]`;
const v = (x, ph) => (String(x ?? '').trim() ? String(x).trim() : F(ph));
const n = x => { const r = Number(String(x ?? '').replace(/[\s ]/g, '').replace(',', '.')); return String(x ?? '').trim() && !isNaN(r) ? r : null; };
const kw = (x, ph = 'kwota') => n(x) === null ? `${F(ph)} zł (słownie: ${F('kwota słownie')})` : `${zl(n(x))} (słownie: ${slownie(n(x))})`;
const dt = (x, ph = 'data') => x ? dateLong(x) : F(ph);
const lines = s => String(s || '').split('\n').map(x => x.trim()).filter(Boolean);
const HL = { t: 'opts', highlight: true };

const party = (label, name, addr, ids, role) => ({ t: 'party', label, lines: [v(name, 'nazwa / imię i nazwisko'), ...(lines(addr).length ? lines(addr) : [F('adres')]), ...(ids ? [ids] : [])], bold: [0], lead: null, role });
const zwana = text => ({ t: 'p', text });

export const GROUPS = ['Umowy cywilnoprawne', 'Spółka – uchwały', 'Wspólnik i zarząd', 'CIT estoński'];

export const WZORY = {
  // ======================================================================
  pozyczka: {
    group: 'Umowy cywilnoprawne', label: 'Umowa pożyczki: wspólnik → spółka',
    desc: 'Pożyczka od wspólnika dla spółki z o.o. – oprocentowanie, zwrot, zwolnienie z PCC.',
    fields: [
      ['miejsce', 'Miejsce zawarcia'], ['data', 'Data zawarcia', 'date'],
      ['spolka', 'Spółka (pożyczkobiorca)', 'wide'], ['spolkaAdres', 'Adres siedziby', 'area'], ['spolkaId', 'KRS / NIP'],
      ['repr', 'Reprezentacja spółki', 'select', [['zarzad', 'zarząd'], ['pelnomocnik', 'pełnomocnik z uchwały (art. 210 § 1 KSH)']]],
      ['reprOsoba', 'Imię, nazwisko i funkcja reprezentanta', 'wide'],
      ['wspolnik', 'Wspólnik (pożyczkodawca)', 'wide'], ['wspolnikAdres', 'Adres wspólnika', 'area'],
      ['kwota', 'Kwota pożyczki (zł)', 'money'], ['oproc', 'Oprocentowanie roczne (%) – puste = nieoprocentowana'],
      ['zwrot', 'Termin zwrotu', 'date'], ['cel', 'Cel pożyczki (opcjonalnie)', 'wide'],
    ],
    defaults: { repr: 'zarzad' },
    hints: [
      'Pożyczka od wspólnika dla spółki kapitałowej jest zwolniona z PCC (art. 9 pkt 10 lit. i ustawy o PCC).',
      'Jeżeli wspólnik jest też członkiem zarządu, spółkę reprezentuje rada nadzorcza albo pełnomocnik powołany uchwałą wspólników (art. 210 § 1 KSH). Gdy jest jedynym wspólnikiem i jedynym członkiem zarządu – umowa wymaga aktu notarialnego (art. 210 § 2 KSH).',
      'Od odsetek wypłacanych wspólnikowi spółka jako płatnik pobiera 19% zryczałtowanego podatku.',
      'Pożyczka nieoprocentowana może u spółki powodować przychód z nieodpłatnego świadczenia, a przy dużych kwotach – obowiązki w zakresie cen transferowych. Odsetki są kosztem spółki w dacie zapłaty, z limitem z art. 15c ustawy o CIT.',
    ],
    build: d => {
      const oproc = n(d.oproc);
      const reprTxt = d.repr === 'pelnomocnik'
        ? `reprezentowaną przez ${v(d.reprOsoba, 'imię i nazwisko')} – pełnomocnika powołanego uchwałą Zgromadzenia Wspólników z dnia ${F('data uchwały')} (art. 210 § 1 KSH)`
        : `reprezentowaną przez ${v(d.reprOsoba, 'imię, nazwisko i funkcja w zarządzie')}`;
      const B = [HL,
        { t: 'title', text: 'UMOWA POŻYCZKI' },
        { t: 'meta', text: `zawarta w dniu ${dt(d.data)} w ${v(d.miejsce, 'miejscowość')} pomiędzy:` },
        party(null, d.spolka, d.spolkaAdres, d.spolkaId ? d.spolkaId : `KRS ${F('……')}, NIP ${F('……')}`),
        zwana(`${reprTxt}, zwaną dalej „Pożyczkobiorcą”,`),
        { t: 'center', text: 'a' },
        party(null, d.wspolnik, d.wspolnikAdres, `PESEL ${F('……')}`),
        zwana('wspólnikiem Pożyczkobiorcy, zwanym dalej „Pożyczkodawcą”.'),
        { t: 'h', text: '§ 1. Przedmiot umowy' },
        { t: 'ust', n: '1.', text: `Pożyczkodawca udziela Pożyczkobiorcy pożyczki w kwocie ${kw(d.kwota)}, a Pożyczkobiorca zobowiązuje się zwrócić ją na warunkach określonych w umowie.` },
        { t: 'ust', n: '2.', text: `Pożyczka zostanie przeznaczona na ${v(d.cel, 'cel, np. bieżącą działalność gospodarczą Pożyczkobiorcy')}.` },
        { t: 'h', text: '§ 2. Wypłata pożyczki' },
        { t: 'ust', n: '1.', text: `Pożyczkodawca przekaże kwotę pożyczki przelewem na rachunek bankowy Pożyczkobiorcy nr ${F('numer rachunku')} w terminie ${F('7')} dni od dnia zawarcia umowy.` },
        { t: 'ust', n: '2.', text: 'Za dzień udzielenia pożyczki uważa się dzień uznania rachunku bankowego Pożyczkobiorcy.' },
        { t: 'h', text: '§ 3. Oprocentowanie' },
        ...(oproc ? [
          { t: 'ust', n: '1.', text: `Pożyczka jest oprocentowana według stałej stopy ${String(oproc).replace('.', ',')}% w skali roku. Odsetki nalicza się od dnia udzielenia pożyczki do dnia jej zwrotu.` },
          { t: 'ust', n: '2.', text: `Odsetki są płatne ${F('łącznie ze zwrotem pożyczki / za każdy rok kalendarzowy do 31 stycznia roku następnego')}.` },
          { t: 'ust', n: '3.', text: 'Pożyczkobiorca jako płatnik pobiera od wypłacanych odsetek zryczałtowany podatek dochodowy zgodnie z art. 30a i art. 41 ust. 4 ustawy o podatku dochodowym od osób fizycznych i wypłaca Pożyczkodawcy odsetki pomniejszone o ten podatek.' },
        ] : [{ t: 'p', text: 'Pożyczka jest nieoprocentowana.' }]),
        { t: 'h', text: '§ 4. Zwrot pożyczki' },
        { t: 'ust', n: '1.', text: `Pożyczkobiorca zwróci pożyczkę${oproc ? ' wraz z należnymi odsetkami' : ''} w terminie do dnia ${dt(d.zwrot, 'termin zwrotu')}, przelewem na rachunek bankowy Pożyczkodawcy nr ${F('numer rachunku')}.` },
        { t: 'ust', n: '2.', text: `Pożyczkobiorca może zwrócić pożyczkę w całości lub w części przed terminem, bez dodatkowych opłat${oproc ? '; odsetki nalicza się wówczas do dnia faktycznego zwrotu' : ''}.` },
        { t: 'ust', n: '3.', text: 'Za dzień zwrotu uważa się dzień obciążenia rachunku bankowego Pożyczkobiorcy.' },
        { t: 'ust', n: '4.', text: 'W razie opóźnienia w zwrocie pożyczki Pożyczkodawcy przysługują odsetki ustawowe za opóźnienie.' },
        { t: 'h', text: '§ 5. Podatek od czynności cywilnoprawnych' },
        { t: 'p', text: 'Strony oświadczają, że pożyczka jest udzielana spółce kapitałowej przez jej wspólnika i korzysta ze zwolnienia od podatku od czynności cywilnoprawnych na podstawie art. 9 pkt 10 lit. i ustawy z dnia 9 września 2000 r. o podatku od czynności cywilnoprawnych.' },
        { t: 'h', text: '§ 6. Postanowienia końcowe' },
        { t: 'ust', n: '1.', text: 'Zmiany umowy wymagają formy pisemnej pod rygorem nieważności.' },
        { t: 'ust', n: '2.', text: 'W sprawach nieuregulowanych umową stosuje się przepisy Kodeksu cywilnego oraz Kodeksu spółek handlowych.' },
        { t: 'ust', n: '3.', text: 'Spory wynikające z umowy rozstrzyga sąd właściwy dla siedziby Pożyczkobiorcy.' },
        { t: 'ust', n: '4.', text: 'Umowę sporządzono w dwóch jednobrzmiących egzemplarzach, po jednym dla każdej ze stron.' },
        { t: 'sign', left: { label: 'Pożyczkobiorca', lines: [v(d.spolka, 'spółka')] }, right: { label: 'Pożyczkodawca', lines: [v(d.wspolnik, 'wspólnik')] } },
      ];
      return B;
    },
  },

  // ======================================================================
  dywidenda: {
    group: 'Spółka – uchwały', label: 'Uchwała o podziale zysku i dywidendzie',
    desc: 'Podział zysku: dywidenda i kapitał zapasowy, dzień i termin wypłaty. Wariant dla CIT klasycznego i estońskiego.',
    fields: [
      ['wariant', 'Opodatkowanie spółki', 'select', [['ogolne', 'CIT na zasadach ogólnych'], ['estonski', 'CIT estoński (ryczałt od dochodów spółek)']]],
      ['nr', 'Numer uchwały'], ['data', 'Data zgromadzenia', 'date'],
      ['spolka', 'Spółka', 'wide'], ['siedziba', 'Siedziba (miejscowość)'], ['rok', 'Rok obrotowy'],
      ['zysk', 'Zysk netto (zł)', 'money'], ['dyw', 'Na dywidendę (zł)', 'money'],
      ['dzien', 'Dzień dywidendy', 'date'], ['wyplata', 'Termin wypłaty', 'date'],
    ],
    defaults: { wariant: 'ogolne', rok: String(new Date().getFullYear() - 1) },
    hints: [
      'Kwota na dywidendę nie może przekroczyć zysku za ostatni rok obrotowy powiększonego o niepodzielone zyski z lat ubiegłych i kapitały utworzone z zysku (art. 192 KSH).',
      'Dzień dywidendy może przypadać w dniu uchwały albo w ciągu kolejnych trzech miesięcy (art. 193 § 2 KSH).',
      'Od dywidendy spółka pobiera 19% PIT. W CIT estońskim spółka płaci ryczałt od podzielonego zysku, a PIT wspólnika pomniejsza o 90% (mały podatnik) albo 70% ryczałtu przypadającego na wspólnika (art. 30a ust. 19 ustawy o PIT).',
      'Uchwałę o podziale zysku podejmuje zwyczajne zgromadzenie wspólników razem z zatwierdzeniem sprawozdania – pełny protokół ZZW przygotujesz w kafelku „Protokół zgromadzenia wspólników”.',
    ],
    build: d => {
      const zysk = n(d.zysk), dyw = n(d.dyw);
      const zap = zysk !== null && dyw !== null ? zysk - dyw : null;
      const est = d.wariant === 'estonski';
      const B = [HL,
        { t: 'title', text: `UCHWAŁA NR ${v(d.nr, 'nr')}` },
        { t: 'subtitle', text: `Zwyczajnego Zgromadzenia Wspólników spółki ${v(d.spolka, 'nazwa spółki')} z siedzibą w ${v(d.siedziba, 'miejscowość')} z dnia ${dt(d.data)} w sprawie podziału zysku za rok obrotowy ${v(d.rok, 'rok')}` },
        { t: 'p', text: `Działając na podstawie art. 191 § 1, art. 193 i art. 231 § 2 pkt 2 Kodeksu spółek handlowych ${F('oraz § … umowy spółki')}, Zwyczajne Zgromadzenie Wspólników postanawia, co następuje:` },
        { t: 'h', text: '§ 1' },
        { t: 'ust', n: '1.', text: `Zysk netto Spółki za rok obrotowy ${v(d.rok, 'rok')} w kwocie ${kw(d.zysk)} przeznacza się:` },
        { t: 'pkt', n: '1)', text: `kwotę ${kw(d.dyw)} – na wypłatę dywidendy dla wspólników,` },
        { t: 'pkt', n: '2)', text: `kwotę ${zap !== null ? `${zl(zap)} (słownie: ${slownie(zap)})` : kw(null)} – na kapitał zapasowy.` },
        { t: 'ust', n: '2.', text: `Dywidenda przypada wspólnikom w stosunku do liczby posiadanych udziałów (art. 191 § 2 KSH)${F(', chyba że umowa spółki stanowi inaczej')}.` },
        ...(est ? [{ t: 'ust', n: '3.', text: 'Zysk przeznaczony do podziału jest zyskiem netto osiągniętym w okresie opodatkowania Spółki ryczałtem od dochodów spółek (rozdział 6b ustawy o podatku dochodowym od osób prawnych).' }] : []),
        { t: 'h', text: '§ 2' },
        { t: 'ust', n: '1.', text: `Dzień dywidendy ustala się na ${dt(d.dzien, 'dzień dywidendy')}.` },
        { t: 'ust', n: '2.', text: `Termin wypłaty dywidendy ustala się na ${dt(d.wyplata, 'termin wypłaty')}.` },
        { t: 'h', text: '§ 3' },
        ...(est ? [
          { t: 'ust', n: '1.', text: 'Zobowiązuje się Zarząd do wypłaty dywidendy z potrąceniem zryczałtowanego podatku dochodowego, pomniejszonego zgodnie z art. 30a ust. 19 ustawy o podatku dochodowym od osób fizycznych o odpowiednią część ryczałtu od dochodów spółek przypadającą na wspólnika.' },
          { t: 'ust', n: '2.', text: 'Zobowiązuje się Zarząd do obliczenia, zadeklarowania i wpłaty ryczałtu od dochodu z tytułu podzielonego zysku w terminach określonych w ustawie o podatku dochodowym od osób prawnych.' },
        ] : [{ t: 'p', text: 'Zobowiązuje się Zarząd do wypłaty dywidendy z potrąceniem zryczałtowanego podatku dochodowego, o ile przepisy wymagają jego poboru.' }]),
        { t: 'h', text: '§ 4' },
        { t: 'p', text: 'Uchwała wchodzi w życie z dniem podjęcia.' },
        { t: 'gap' },
        { t: 'p', text: `Uchwała została podjęta w głosowaniu jawnym. Oddano ${F('…')} głosów „za”, ${F('…')} głosów „przeciw”, ${F('…')} głosów „wstrzymujących się”.` },
        { t: 'sign', left: { label: 'Przewodniczący Zgromadzenia', lines: [F('imię i nazwisko')] }, right: { label: 'Protokolant', lines: [F('imię i nazwisko')] } },
      ];
      return B;
    },
  },

  // ======================================================================
  zarzad: {
    group: 'Wspólnik i zarząd', label: 'Uchwała o wynagrodzeniu członka zarządu',
    desc: 'Wynagrodzenie z powołania (bez składek społecznych) albo zgoda na umowę o pracę z pełnomocnikiem z art. 210 KSH.',
    fields: [
      ['wariant', 'Podstawa wynagrodzenia', 'select', [['powolanie', 'powołanie (art. 13 pkt 7 ustawy o PIT)'], ['uop', 'umowa o pracę']]],
      ['nr', 'Numer uchwały'], ['data', 'Data zgromadzenia', 'date'],
      ['spolka', 'Spółka', 'wide'], ['siedziba', 'Siedziba (miejscowość)'],
      ['osoba', 'Członek zarządu (imię i nazwisko)'], ['funkcja', 'Funkcja w zarządzie'],
      ['kwota', 'Wynagrodzenie brutto miesięcznie (zł)', 'money'], ['od', 'Od dnia', 'date'],
      ['stanowisko', 'Stanowisko (umowa o pracę)'], ['pelnomocnik', 'Pełnomocnik do zawarcia umowy (umowa o pracę)'],
    ],
    defaults: { wariant: 'powolanie', funkcja: 'Prezes Zarządu' },
    hints: [
      'Wynagrodzenie z powołania to przychód z działalności wykonywanej osobiście (art. 13 pkt 7 ustawy o PIT) – spółka pobiera zaliczki na PIT i składkę zdrowotną 9%; składek społecznych nie ma, jeśli brak innego tytułu.',
      'Umowę o pracę z członkiem zarządu w imieniu spółki zawiera rada nadzorcza albo pełnomocnik powołany uchwałą wspólników (art. 210 § 1 KSH). Jedyny wspólnik będący jedynym członkiem zarządu – forma aktu notarialnego (art. 210 § 2 KSH).',
      'ZUS może kwestionować umowę o pracę z jedynym (lub niemal jedynym) wspólnikiem – podlega on wtedy ubezpieczeniom jako wspólnik jednoosobowej spółki.',
      'Sprawdź w umowie spółki, który organ ustala wynagrodzenie zarządu (zgromadzenie wspólników czy rada nadzorcza).',
    ],
    build: d => {
      const uop = d.wariant === 'uop';
      const head = [HL,
        { t: 'title', text: `UCHWAŁA NR ${v(d.nr, 'nr')}` },
        { t: 'subtitle', text: `Nadzwyczajnego Zgromadzenia Wspólników spółki ${v(d.spolka, 'nazwa spółki')} z siedzibą w ${v(d.siedziba, 'miejscowość')} z dnia ${dt(d.data)} ${uop ? 'w sprawie wyrażenia zgody na zawarcie umowy o pracę z członkiem zarządu oraz powołania pełnomocnika' : 'w sprawie ustalenia wynagrodzenia członka zarządu'}` },
      ];
      const tail = [
        { t: 'gap' },
        { t: 'p', text: `Uchwała została podjęta w głosowaniu tajnym. Oddano ${F('…')} głosów „za”, ${F('…')} głosów „przeciw”, ${F('…')} głosów „wstrzymujących się”.` },
        { t: 'sign', left: { label: 'Przewodniczący Zgromadzenia', lines: [F('imię i nazwisko')] }, right: { label: 'Protokolant', lines: [F('imię i nazwisko')] } },
      ];
      if (uop) return [...head,
        { t: 'p', text: 'Działając na podstawie art. 210 § 1 Kodeksu spółek handlowych, Nadzwyczajne Zgromadzenie Wspólników postanawia, co następuje:' },
        { t: 'h', text: '§ 1' },
        { t: 'p', text: `Wyraża się zgodę na zawarcie przez Spółkę z ${v(d.osoba, 'imię i nazwisko')}, pełniącym funkcję ${v(d.funkcja, 'funkcja')}, umowy o pracę na stanowisku ${v(d.stanowisko, 'stanowisko')}, w pełnym wymiarze czasu pracy, na czas ${F('nieokreślony')}, z wynagrodzeniem zasadniczym w kwocie ${kw(d.kwota)} brutto miesięcznie, od dnia ${dt(d.od, 'data rozpoczęcia pracy')}.` },
        { t: 'h', text: '§ 2' },
        { t: 'p', text: `Na podstawie art. 210 § 1 Kodeksu spółek handlowych powołuje się ${v(d.pelnomocnik, 'imię i nazwisko pełnomocnika')} na pełnomocnika do zawarcia w imieniu Spółki umowy, o której mowa w § 1, a także do dokonywania wszelkich czynności związanych z tą umową, w tym jej zmiany i rozwiązania.` },
        { t: 'h', text: '§ 3' },
        { t: 'p', text: 'Uchwała wchodzi w życie z dniem podjęcia.' }, ...tail];
      return [...head,
        { t: 'p', text: `Działając na podstawie ${F('§ … umowy spółki')}, Nadzwyczajne Zgromadzenie Wspólników postanawia, co następuje:` },
        { t: 'h', text: '§ 1' },
        { t: 'ust', n: '1.', text: `Ustala się wynagrodzenie ${v(d.osoba, 'imię i nazwisko')} z tytułu pełnienia funkcji ${v(d.funkcja, 'funkcja')} na podstawie powołania w kwocie ${kw(d.kwota)} brutto miesięcznie, począwszy od dnia ${dt(d.od, 'data')}.` },
        { t: 'ust', n: '2.', text: `Wynagrodzenie jest płatne z dołu, do ${F('10.')} dnia miesiąca następującego po miesiącu, za który przysługuje, na rachunek bankowy wskazany przez członka zarządu.` },
        { t: 'ust', n: '3.', text: 'Za niepełny miesiąc pełnienia funkcji wynagrodzenie przysługuje w wysokości proporcjonalnej do liczby dni pełnienia funkcji.' },
        { t: 'h', text: '§ 2' },
        { t: 'p', text: 'Prawo do wynagrodzenia wygasa z dniem wygaśnięcia mandatu, w tym wskutek odwołania lub rezygnacji, bez okresu wypowiedzenia i bez prawa do odprawy.' },
        { t: 'h', text: '§ 3' },
        { t: 'p', text: 'Spółka jako płatnik pobiera od wynagrodzenia zaliczki na podatek dochodowy od osób fizycznych oraz składkę na ubezpieczenie zdrowotne zgodnie z obowiązującymi przepisami.' },
        { t: 'h', text: '§ 4' },
        { t: 'p', text: 'Uchwała wchodzi w życie z dniem podjęcia.' }, ...tail];
    },
  },

  // ======================================================================
  najem: {
    group: 'Umowy cywilnoprawne', label: 'Umowa najmu lokalu użytkowego',
    desc: 'Czynsz z VAT, waloryzacja, media (refaktura albo ryczałt), kaucja, wypowiedzenie i zwrot lokalu.',
    fields: [
      ['miejsce', 'Miejsce zawarcia'], ['data', 'Data zawarcia', 'date'],
      ['wynajmujacy', 'Wynajmujący', 'wide'], ['wynAdres', 'Adres wynajmującego', 'area'], ['wynId', 'NIP / PESEL wynajmującego'],
      ['najemca', 'Najemca', 'wide'], ['najAdres', 'Adres najemcy', 'area'], ['najId', 'NIP najemcy'],
      ['lokal', 'Adres lokalu', 'wide'], ['pow', 'Powierzchnia (m²)'], ['kw', 'Księga wieczysta nr'], ['cel', 'Przeznaczenie lokalu'],
      ['od', 'Najem od', 'date'], ['do', 'Najem do (puste = czas nieokreślony)', 'date'],
      ['czynsz', 'Czynsz netto miesięcznie (zł)', 'money'],
      ['vat', 'VAT od czynszu', 'select', [['23', 'czynsz + 23% VAT'], ['zw', 'wynajmujący zwolniony z VAT'], ['prywatny', 'najem prywatny – bez VAT']]],
      ['media', 'Media', 'select', [['liczniki', 'osobno wg liczników (refaktura)'], ['ryczalt', 'w czynszu (ryczałt)']]],
      ['kaucja', 'Kaucja (zł)', 'money'], ['wypow', 'Okres wypowiedzenia (miesiące)'],
    ],
    defaults: { vat: '23', media: 'liczniki', wypow: '3', cel: 'prowadzenie działalności gospodarczej – biuro' },
    hints: [
      'Najem lokalu użytkowego podlega VAT 23%. Kaucja zwrotna nie jest wynagrodzeniem – nie podlega VAT.',
      'Media rozliczane według faktycznego zużycia (podliczniki, wpływ najemcy na zużycie) mogą być odrębnym świadczeniem; ryczałt w czynszu – opodatkowany jak najem (wyrok TSUE C-42/14).',
      'Wynajmujący prywatnie rozlicza najem ryczałtem: 8,5% do 100 000 zł przychodu rocznie i 12,5% od nadwyżki.',
      'Umowa na czas dłuższy niż rok zawarta bez formy pisemnej uważana jest za zawartą na czas nieokreślony (art. 660 KC).',
    ],
    build: d => {
      const vatTxt = d.vat === '23' ? ', powiększony o podatek VAT według obowiązującej stawki (obecnie 23%)' : d.vat === 'zw' ? '; Wynajmujący korzysta ze zwolnienia z VAT' : '';
      const okres = !!d.do;
      const B = [HL,
        { t: 'title', text: 'UMOWA NAJMU LOKALU UŻYTKOWEGO' },
        { t: 'meta', text: `zawarta w dniu ${dt(d.data)} w ${v(d.miejsce, 'miejscowość')} pomiędzy:` },
        party(null, d.wynajmujacy, d.wynAdres, d.wynId ? d.wynId : `NIP / PESEL ${F('……')}`),
        zwana(`reprezentowanym przez ${F('imię i nazwisko, funkcja')}, zwanym dalej „Wynajmującym”,`),
        { t: 'center', text: 'a' },
        party(null, d.najemca, d.najAdres, d.najId ? `NIP ${d.najId}` : `NIP ${F('……')}`),
        zwana(`reprezentowanym przez ${F('imię i nazwisko, funkcja')}, zwanym dalej „Najemcą”.`),
        { t: 'h', text: '§ 1. Przedmiot najmu' },
        { t: 'ust', n: '1.', text: `Wynajmujący oświadcza, że jest ${F('właścicielem')} lokalu użytkowego położonego w ${v(d.lokal, 'adres lokalu')}, o powierzchni ${v(d.pow, '…')} m², dla którego Sąd Rejonowy ${F('…')} prowadzi księgę wieczystą nr ${v(d.kw, '…')} (dalej „Lokal”).` },
        { t: 'ust', n: '2.', text: `Wynajmujący oddaje Najemcy Lokal do używania na cele: ${v(d.cel, 'przeznaczenie')}, a Najemca zobowiązuje się płacić czynsz i opłaty określone w umowie.` },
        { t: 'ust', n: '3.', text: 'Wynajmujący oświadcza, że Lokal może być wykorzystywany zgodnie z przeznaczeniem określonym w ust. 2 i nie jest obciążony prawami osób trzecich, które uniemożliwiałyby najem.' },
        { t: 'h', text: '§ 2. Wydanie Lokalu' },
        { t: 'p', text: `Wydanie Lokalu nastąpi w dniu ${dt(d.od, 'data wydania')} na podstawie protokołu zdawczo-odbiorczego, określającego stan Lokalu i jego wyposażenia, stany liczników oraz liczbę przekazanych kluczy.` },
        { t: 'h', text: '§ 3. Okres najmu' },
        { t: 'p', text: okres ? `Umowa zostaje zawarta na czas określony od dnia ${dt(d.od)} do dnia ${dt(d.do)}.` : `Umowa zostaje zawarta na czas nieokreślony od dnia ${dt(d.od, 'data')}.` },
        { t: 'h', text: '§ 4. Czynsz' },
        { t: 'ust', n: '1.', text: `Najemca będzie płacił Wynajmującemu czynsz w kwocie ${kw(d.czynsz)} netto miesięcznie${vatTxt}.` },
        { t: 'ust', n: '2.', text: `Czynsz płatny jest z góry, do ${F('10.')} dnia każdego miesiąca, przelewem na rachunek bankowy Wynajmującego nr ${F('numer rachunku')}${d.vat === '23' ? ', na podstawie faktury wystawionej przez Wynajmującego' : ''}. Czynsz za niepełny miesiąc oblicza się proporcjonalnie.` },
        { t: 'ust', n: '3.', text: `Czynsz będzie waloryzowany raz w roku, od ${F('1 marca')}, o średnioroczny wskaźnik cen towarów i usług konsumpcyjnych za poprzedni rok ogłaszany przez Prezesa GUS. Waloryzacja nie wymaga zmiany umowy – Wynajmujący zawiadamia o niej Najemcę na piśmie.` },
        { t: 'h', text: '§ 5. Media i opłaty' },
        ...(d.media === 'ryczalt'
          ? [{ t: 'p', text: 'Czynsz obejmuje opłaty za energię elektryczną, ogrzewanie, wodę, odprowadzanie ścieków i wywóz odpadów. Strony nie rozliczają tych opłat odrębnie.' }]
          : [
            { t: 'ust', n: '1.', text: 'Najemca pokrywa koszty energii elektrycznej, wody i odprowadzania ścieków oraz ogrzewania według faktycznego zużycia wskazanego przez liczniki i podliczniki Lokalu, a koszty wywozu odpadów – według stawek dostawcy.' },
            { t: 'ust', n: '2.', text: `Wynajmujący obciąża Najemcę kosztami mediów raz w miesiącu, a Najemca płaci je w terminie ${F('14')} dni od otrzymania dokumentu obciążeniowego. Najemca może zawrzeć umowy z dostawcami we własnym imieniu za zgodą Wynajmującego.` },
          ]),
        { t: 'h', text: '§ 6. Kaucja' },
        { t: 'ust', n: '1.', text: `Najemca wpłaci kaucję w kwocie ${kw(d.kaucja)} w terminie ${F('7')} dni od zawarcia umowy, na zabezpieczenie roszczeń Wynajmującego z tytułu umowy.` },
        { t: 'ust', n: '2.', text: 'Kaucja podlega zwrotowi w terminie 14 dni od zwrotu Lokalu, po potrąceniu należności Wynajmującego z tytułu umowy. Kaucja nie jest oprocentowana.' },
        { t: 'h', text: '§ 7. Obowiązki stron' },
        { t: 'ust', n: '1.', text: 'Najemca zobowiązuje się używać Lokalu zgodnie z przeznaczeniem, utrzymywać go w należytym stanie i dokonywać drobnych nakładów połączonych ze zwykłym używaniem (art. 681 Kodeksu cywilnego).' },
        { t: 'ust', n: '2.', text: 'Najemca nie może oddać Lokalu w podnajem ani do bezpłatnego używania bez pisemnej zgody Wynajmującego.' },
        { t: 'ust', n: '3.', text: 'Zmiany i adaptacje Lokalu wymagają pisemnej zgody Wynajmującego. Ulepszenia dokonane bez takiej zgody przechodzą na Wynajmującego bez prawa do zwrotu ich wartości.' },
        { t: 'ust', n: '4.', text: 'Wynajmujący dokonuje napraw niezbędnych do zachowania Lokalu w stanie przydatnym do umówionego użytku, z wyjątkiem napraw obciążających Najemcę.' },
        { t: 'ust', n: '5.', text: `Najemca zawrze umowę ubezpieczenia odpowiedzialności cywilnej z tytułu prowadzonej w Lokalu działalności ${F('na kwotę …')}.` },
        { t: 'h', text: '§ 8. Rozwiązanie umowy' },
        ...(okres
          ? [{ t: 'ust', n: '1.', text: `Każda ze stron może wypowiedzieć umowę z zachowaniem ${v(d.wypow, '3')}-miesięcznego okresu wypowiedzenia ze skutkiem na koniec miesiąca kalendarzowego wyłącznie w przypadkach: ${F('np. sprzedaży Lokalu, likwidacji działalności Najemcy')}.` }]
          : [{ t: 'ust', n: '1.', text: `Każda ze stron może wypowiedzieć umowę z zachowaniem ${v(d.wypow, '3')}-miesięcznego okresu wypowiedzenia ze skutkiem na koniec miesiąca kalendarzowego.` }]),
        { t: 'ust', n: '2.', text: 'Wynajmujący może wypowiedzieć umowę bez zachowania terminów wypowiedzenia, jeżeli Najemca używa Lokalu niezgodnie z umową lub przeznaczeniem albo zalega z zapłatą czynszu za co najmniej dwa pełne okresy płatności i nie zapłaci zaległości w dodatkowym terminie miesięcznym (art. 687 Kodeksu cywilnego).' },
        { t: 'h', text: '§ 9. Zwrot Lokalu' },
        { t: 'p', text: 'Po zakończeniu najmu Najemca zwróci Lokal w stanie niepogorszonym, z uwzględnieniem zużycia wynikającego z prawidłowego używania, na podstawie protokołu zdawczo-odbiorczego.' },
        { t: 'h', text: '§ 10. Postanowienia końcowe' },
        { t: 'ust', n: '1.', text: 'Zmiany umowy wymagają formy pisemnej pod rygorem nieważności.' },
        { t: 'ust', n: '2.', text: 'W sprawach nieuregulowanych stosuje się przepisy Kodeksu cywilnego.' },
        { t: 'ust', n: '3.', text: 'Spory rozstrzyga sąd właściwy dla miejsca położenia Lokalu.' },
        { t: 'ust', n: '4.', text: 'Umowę sporządzono w dwóch jednobrzmiących egzemplarzach, po jednym dla każdej ze stron.' },
        { t: 'sign', left: { label: 'Wynajmujący', lines: [v(d.wynajmujacy, 'wynajmujący')] }, right: { label: 'Najemca', lines: [v(d.najemca, 'najemca')] } },
      ];
      return B;
    },
  },

  // ======================================================================
  dzielo: {
    group: 'Umowy cywilnoprawne', label: 'Umowa o dzieło z przeniesieniem praw autorskich',
    desc: 'Pola eksploatacji, prawa zależne i część wynagrodzenia za prawa – pod 50% koszty uzyskania przychodu.',
    fields: [
      ['miejsce', 'Miejsce zawarcia'], ['data', 'Data zawarcia', 'date'],
      ['zamawiajacy', 'Zamawiający', 'wide'], ['zamAdres', 'Adres zamawiającego', 'area'], ['zamId', 'NIP zamawiającego'],
      ['wykonawca', 'Wykonawca (imię i nazwisko)', 'wide'], ['wykAdres', 'Adres wykonawcy', 'area'],
      ['dzielo', 'Opis dzieła', 'area'], ['termin', 'Termin wykonania', 'date'],
      ['kwota', 'Wynagrodzenie brutto (zł)', 'money'], ['proc', 'Część za prawa autorskie (%)'],
    ],
    defaults: { proc: '80' },
    hints: [
      '50% koszty uzyskania przychodu przysługują tylko od części wynagrodzenia za przeniesienie praw autorskich i tylko przy działalności wymienionej w art. 22 ust. 9b ustawy o PIT; limit kosztów 120 000 zł w roku (art. 22 ust. 9a).',
      'Przeniesienie autorskich praw majątkowych wymaga formy pisemnej pod rygorem nieważności i obejmuje tylko pola eksploatacji wyraźnie wymienione w umowie (art. 41 ust. 2 i art. 53 ustawy o prawie autorskim).',
      'Umowę o dzieło zgłasza się do ZUS na formularzu RUD w ciągu 7 dni od zawarcia. Umowa o dzieło z własnym pracownikiem lub w praktyce będąca zleceniem – ryzyko oskładkowania.',
    ],
    build: d => {
      const kwota = n(d.kwota), proc = n(d.proc);
      const czesc = kwota !== null && proc !== null ? Math.round(kwota * proc) / 100 : null;
      const B = [HL,
        { t: 'title', text: 'UMOWA O DZIEŁO' },
        { t: 'subtitle', text: 'z przeniesieniem autorskich praw majątkowych' },
        { t: 'meta', text: `zawarta w dniu ${dt(d.data)} w ${v(d.miejsce, 'miejscowość')} pomiędzy:` },
        party(null, d.zamawiajacy, d.zamAdres, d.zamId ? `NIP ${d.zamId}` : `NIP ${F('……')}`),
        zwana(`reprezentowanym przez ${F('imię i nazwisko, funkcja')}, zwanym dalej „Zamawiającym”,`),
        { t: 'center', text: 'a' },
        party(null, d.wykonawca, d.wykAdres, `PESEL ${F('……')}`),
        zwana('zwanym dalej „Wykonawcą”.'),
        { t: 'h', text: '§ 1. Przedmiot umowy' },
        { t: 'ust', n: '1.', text: `Zamawiający zamawia, a Wykonawca zobowiązuje się wykonać dzieło polegające na: ${v(d.dzielo, 'szczegółowy opis dzieła – rezultat, forma, parametry')} (dalej „Dzieło”).` },
        { t: 'ust', n: '2.', text: 'Dzieło będzie utworem w rozumieniu art. 1 ustawy z dnia 4 lutego 1994 r. o prawie autorskim i prawach pokrewnych, stanowiącym rezultat twórczej pracy Wykonawcy.' },
        { t: 'h', text: '§ 2. Wykonanie Dzieła' },
        { t: 'ust', n: '1.', text: `Wykonawca wykona Dzieło osobiście, z własnych materiałów i przy użyciu własnych narzędzi, w terminie do dnia ${dt(d.termin, 'termin')}.` },
        { t: 'ust', n: '2.', text: 'Wykonawca wykonuje Dzieło samodzielnie, bez podporządkowania co do miejsca i czasu pracy.' },
        { t: 'h', text: '§ 3. Odbiór' },
        { t: 'ust', n: '1.', text: `Zamawiający dokona odbioru Dzieła w terminie ${F('7')} dni od jego przekazania, co strony potwierdzą protokołem odbioru.` },
        { t: 'ust', n: '2.', text: 'W razie stwierdzenia wad Zamawiający wskaże je w protokole, a Wykonawca usunie je w uzgodnionym terminie.' },
        { t: 'h', text: '§ 4. Wynagrodzenie' },
        { t: 'ust', n: '1.', text: `Za wykonanie Dzieła i przeniesienie autorskich praw majątkowych Wykonawcy przysługuje łączne wynagrodzenie w kwocie ${kw(d.kwota)} brutto.` },
        { t: 'ust', n: '2.', text: `Z wynagrodzenia określonego w ust. 1 kwota ${czesc !== null ? `${zl(czesc)} (${String(proc).replace('.', ',')}%)` : `${F('kwota')} zł (${F('…')}%)`} stanowi wynagrodzenie za przeniesienie autorskich praw majątkowych do Dzieła i korzystanie z niego, a pozostała część – wynagrodzenie za wykonanie Dzieła.` },
        { t: 'ust', n: '3.', text: `Wynagrodzenie jest płatne w terminie ${F('14')} dni od podpisania protokołu odbioru bez zastrzeżeń, na podstawie rachunku, przelewem na rachunek Wykonawcy nr ${F('numer rachunku')}. Zamawiający jako płatnik pobierze należną zaliczkę na podatek dochodowy.` },
        { t: 'h', text: '§ 5. Przeniesienie autorskich praw majątkowych' },
        { t: 'ust', n: '1.', text: 'Z chwilą odbioru Dzieła Wykonawca przenosi na Zamawiającego autorskie prawa majątkowe do Dzieła, bez ograniczeń czasowych i terytorialnych, na następujących polach eksploatacji:' },
        { t: 'pkt', n: '1)', text: 'utrwalanie i zwielokrotnianie Dzieła każdą techniką, w tym drukarską, reprograficzną, zapisu magnetycznego oraz techniką cyfrową;' },
        { t: 'pkt', n: '2)', text: 'wprowadzanie do obrotu, użyczenie lub najem oryginału albo egzemplarzy;' },
        { t: 'pkt', n: '3)', text: 'publiczne wykonanie, wystawienie, wyświetlenie, odtworzenie, nadawanie i reemitowanie, a także publiczne udostępnianie Dzieła w taki sposób, aby każdy mógł mieć do niego dostęp w miejscu i w czasie przez siebie wybranym, w tym w internecie;' },
        { t: 'pkt', n: '4)', text: 'wprowadzanie do pamięci komputera i sieci teleinformatycznych;' },
        { t: 'pkt', n: '5)', text: F('inne pola eksploatacji, np. wykorzystanie w materiałach reklamowych') + ';' },
        { t: 'ust', n: '2.', text: 'Wykonawca zezwala Zamawiającemu na wykonywanie zależnych praw autorskich do Dzieła, w tym na dokonywanie opracowań, zmian i adaptacji, oraz przenosi na Zamawiającego prawo do udzielania takich zezwoleń.' },
        { t: 'ust', n: '3.', text: 'Wykonawca zobowiązuje się nie wykonywać wobec Zamawiającego i jego następców prawnych autorskich praw osobistych do Dzieła, w tym prawa do nadzoru autorskiego i oznaczania Dzieła swoim nazwiskiem, chyba że Zamawiający postanowi inaczej.' },
        { t: 'ust', n: '4.', text: 'Z chwilą przeniesienia praw Zamawiający nabywa własność egzemplarzy i nośników, na których Dzieło utrwalono.' },
        { t: 'h', text: '§ 6. Oświadczenia Wykonawcy' },
        { t: 'p', text: 'Wykonawca oświadcza, że Dzieło będzie wynikiem jego oryginalnej twórczości, nie będzie naruszało praw osób trzecich i że prawa do Dzieła nie będą obciążone. W razie zgłoszenia przez osobę trzecią roszczeń związanych z Dziełem Wykonawca zwolni Zamawiającego z odpowiedzialności i pokryje wynikłe z tego koszty.' },
        { t: 'h', text: '§ 7. Postanowienia końcowe' },
        { t: 'ust', n: '1.', text: 'Zmiany umowy wymagają formy pisemnej pod rygorem nieważności.' },
        { t: 'ust', n: '2.', text: 'W sprawach nieuregulowanych stosuje się przepisy Kodeksu cywilnego oraz ustawy o prawie autorskim i prawach pokrewnych.' },
        { t: 'ust', n: '3.', text: 'Umowę sporządzono w dwóch jednobrzmiących egzemplarzach, po jednym dla każdej ze stron.' },
        { t: 'sign', left: { label: 'Zamawiający', lines: [v(d.zamawiajacy, 'zamawiający')] }, right: { label: 'Wykonawca', lines: [v(d.wykonawca, 'wykonawca')] } },
      ];
      return B;
    },
  },

  // ======================================================================
  estinfo: {
    group: 'CIT estoński', label: 'Informacja dla wspólnika – dywidenda w CIT estońskim',
    desc: 'Wyliczenie podatku od dywidendy z odliczeniem 90% / 70% ryczałtu przypadającego na wspólnika i kwoty wypłaty.',
    fields: [
      ['spolka', 'Spółka', 'wide'], ['spolkaAdres', 'Adres spółki', 'area'],
      ['wspolnik', 'Wspólnik', 'wide'], ['uchwala', 'Data uchwały o podziale zysku', 'date'], ['data', 'Data wypłaty', 'date'],
      ['dyw', 'Dywidenda dla wspólnika – brutto (zł)', 'money'], ['udzial', 'Udział wspólnika w zysku (%)'],
      ['ryczalt', 'Ryczałt spółki od podzielonego zysku – łącznie (zł)', 'money'],
      ['maly', 'Stawka ryczałtu spółki', 'select', [['10', '10% – mały podatnik (odliczenie 90%)'], ['20', '20% – pozostali (odliczenie 70%)']]],
    ],
    defaults: { maly: '10', udzial: '100' },
    hints: [
      'Spółka jako płatnik pobiera 19% PIT od dywidendy i pomniejsza go o 90% (ryczałt 10%) albo 70% (ryczałt 20%) ryczałtu przypadającego na wspólnika proporcjonalnie do jego udziału w zysku (art. 30a ust. 19 ustawy o PIT). Podatek nie może być ujemny.',
      'Kwoty podatku zaokrąglono do pełnych złotych. Sprawdź, czy ryczałt od tej wypłaty został zadeklarowany i zapłacony.',
    ],
    build: d => {
      const dyw = n(d.dyw), ud = n(d.udzial), ry = n(d.ryczalt);
      const ded = d.maly === '20' ? 0.7 : 0.9;
      const ryW = ry !== null && ud !== null ? ry * ud / 100 : null;
      const pit = dyw !== null ? Math.round(dyw * 0.19) : null;
      const odl = pit !== null && ryW !== null ? Math.min(pit, Math.round(ryW * ded)) : null;
      const pob = pit !== null && odl !== null ? pit - odl : null;
      const net = dyw !== null && pob !== null ? dyw - pob : null;
      const z = x => x === null ? F('kwota') : zl(x);
      return [HL,
        party(null, d.spolka, d.spolkaAdres, null),
        { t: 'place', text: `${F('miejscowość')}, ${dt(d.data, 'data')}` },
        { t: 'addr', lines: [v(d.wspolnik, 'imię i nazwisko wspólnika'), F('adres')] },
        { t: 'title', text: 'INFORMACJA DLA WSPÓLNIKA' },
        { t: 'subtitle', text: 'o wypłacie zysku i poborze podatku od dywidendy (ryczałt od dochodów spółek)' },
        { t: 'p', text: `Spółka informuje, że na podstawie uchwały Zgromadzenia Wspólników z dnia ${dt(d.uchwala, 'data uchwały')} w sprawie podziału zysku wypłaciła w dniu ${dt(d.data, 'data wypłaty')} dywidendę z zysku netto osiągniętego w okresie opodatkowania ryczałtem od dochodów spółek. Podatek od dywidendy pobrano zgodnie z art. 30a ust. 1 pkt 4 i ust. 19 ustawy o podatku dochodowym od osób fizycznych:` },
        { t: 'kv', head: ['Pozycja', 'Kwota'], rows: [
          ['Dywidenda przypadająca na wspólnika (brutto)', z(dyw)],
          ['Udział wspólnika w podzielonym zysku', ud === null ? F('…%') : `${String(ud).replace('.', ',')}%`],
          ['Ryczałt od dochodów spółek od podzielonego zysku – łącznie', z(ry)],
          ['Ryczałt przypadający na wspólnika', z(ryW)],
          ['Podatek 19% od dywidendy', z(pit)],
          [`Odliczenie – ${Math.round(ded * 100)}% ryczałtu przypadającego na wspólnika`, z(odl)],
          ['Podatek pobrany przez spółkę', z(pob)],
          ['Kwota wypłacona wspólnikowi', z(net)],
        ] },
        { t: 'p', text: 'Pobrany podatek spółka wpłaci na rachunek urzędu skarbowego w terminie wynikającym z art. 42 ustawy o podatku dochodowym od osób fizycznych i wykaże w rocznej deklaracji PIT-8AR.' },
        { t: 'signR', lines: ['za Spółkę', F('imię, nazwisko i funkcja')] },
      ];
    },
  },
};
