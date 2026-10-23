// Regulamin korzystania z aplikacji – treść, wersja i bloki do PDF.
// Zmiana treści = nowa wersja (TERMS_VERSION) → każdy użytkownik akceptuje ponownie przy wejściu do aplikacji.
export const TERMS_VERSION = '1.0';
export const TERMS_DATE = '2026-10-23';
export const TERMS_TITLE = 'Regulamin korzystania z aplikacji „RKDP Rozliczenia”';

const OWNER = 'RKDP spółka doradztwa podatkowego sp. z o.o. z siedzibą w Ozorzycach (ul. Czereśniowa 28d, 55-010 Ozorzyce), wpisana do rejestru przedsiębiorców KRS pod numerem 0000812185, NIP 8992871126, REGON 384812329';
const M2 = 'M2 TAX Doradcy Podatkowi Otręba Ruszniak spółka partnerska z siedzibą we Wrocławiu (KRS 0001238577)';

export const TERMS = [
  ['§ 1. Postanowienia ogólne', [
    'Regulamin określa zasady korzystania z aplikacji internetowej „RKDP Rozliczenia”, dostępnej pod adresem rozliczenia.rkdp.pl (dalej „Aplikacja”).',
    `Właścicielem Aplikacji i podmiotem uprawnionym z autorskich praw majątkowych do Aplikacji jest ${OWNER} (dalej „Właściciel”).`,
    'Aplikacja jest narzędziem wewnętrznym wspierającym organizację pracy: ewidencję rozliczeń klientów, zgłoszenia i zadania, obsługę spraw doradczych, generowanie dokumentów, listę obecności, weryfikację klientów, podgląd plików JPK oraz narzędzia pomocnicze (wzory dokumentów, kalkulator formy opodatkowania).',
    `Z Aplikacji korzystają osoby, którym Właściciel nadał dostęp (dalej „Użytkownik”), w szczególności pracownicy i współpracownicy Właściciela, ${M2} (dalej „M2 TAX”) oraz jej pracownicy i współpracownicy – na podstawie udostępnienia Aplikacji przez Właściciela – a także osoby z dostępem ograniczonym, np. wyłącznie do podglądu plików JPK.`,
    'Korzystanie z Aplikacji jest możliwe wyłącznie po zaakceptowaniu aktualnej wersji Regulaminu.',
  ]],
  ['§ 2. Konto i bezpieczeństwo dostępu', [
    'Konto Użytkownika zakłada i zarządza nim osoba z uprawnieniami administratora wyznaczona przez Właściciela (dalej „Administrator”). Dostęp jest imienny i ograniczony do zakresu nadanego przez Administratora (moduły, rola, przypisani klienci).',
    'Użytkownik loguje się służbowym adresem e-mail z hasłem lub kodem jednorazowym. Użytkownik nie udostępnia nikomu danych logowania ani kodów, nie pozostawia zalogowanej Aplikacji na urządzeniu dostępnym dla osób trzecich i wylogowuje się po zakończeniu pracy.',
    'Użytkownik niezwłocznie zgłasza Administratorowi utratę urządzenia, ujawnienie hasła lub podejrzenie nieuprawnionego dostępu.',
    'Aplikacja automatycznie kończy sesję po okresie bezczynności.',
    'Właściciel może ograniczyć, zawiesić lub odebrać dostęp, w szczególności po zakończeniu współpracy albo w razie naruszenia Regulaminu.',
    'Aplikacja rejestruje działania Użytkowników, w tym logowania, zmiany danych i akceptacje Regulaminu, w celu zapewnienia bezpieczeństwa i rozliczalności.',
  ]],
  ['§ 3. Poufność i ochrona danych', [
    'Informacje dostępne w Aplikacji, w szczególności dane klientów, są objęte tajemnicą zawodową doradcy podatkowego (art. 37 ustawy z dnia 5 lipca 1996 r. o doradztwie podatkowym) oraz tajemnicą przedsiębiorstwa.',
    'Użytkownik korzysta z danych wyłącznie w zakresie niezbędnym do wykonywania obowiązków służbowych. Nie kopiuje, nie eksportuje i nie przekazuje danych osobom nieuprawnionym ani w celach innych niż służbowe.',
    'Pliki pobrane z Aplikacji (Word, PDF, Excel, CSV, kopie zapasowe) Użytkownik przechowuje na zabezpieczonych urządzeniach i usuwa, gdy przestają być potrzebne.',
    'Dane osobowe są przetwarzane zgodnie z RODO. Administratorem danych osobowych klientów jest Właściciel albo M2 TAX – każdy w zakresie obsługiwanych przez siebie klientów. Użytkownik przetwarza dane wyłącznie na polecenie administratora danych.',
    'Pliki JPK otwierane w podglądzie JPK są przetwarzane wyłącznie w przeglądarce Użytkownika – nie są przesyłane na serwer ani w nim zapisywane. Przycisk „Wyczyść dane” usuwa plik z podglądu.',
    'Obowiązek zachowania poufności trwa także po zakończeniu korzystania z Aplikacji.',
  ]],
  ['§ 4. Informacyjny charakter treści i dokumentów', [
    'Treści i dokumenty wygenerowane lub pobrane z Aplikacji – w szczególności wzory umów, uchwał, protokołów, pism i pełnomocnictw, oferty, wyliczenia kalkulatora formy opodatkowania, pomocniczy bilans i rachunek zysków i strat, wyniki kontroli plików JPK, raporty i zestawienia, dane pobrane z rejestrów publicznych (KRS, CEIDG, GUS, Biała lista VAT) oraz wyniki weryfikacji klientów – mają wyłącznie charakter pomocniczy i informacyjny.',
    'Treści te nie stanowią porady podatkowej, prawnej ani księgowej, opinii, interpretacji ani rekomendacji. Nie są podejmowaniem decyzji i nie mogą być jedyną podstawą decyzji – nie zastępują samodzielnej, profesjonalnej oceny stanu faktycznego i prawnego.',
    'Przed wykorzystaniem treści – w szczególności przed przekazaniem dokumentu klientowi, jego podpisaniem, złożeniem w urzędzie lub sądzie albo przyjęciem wyliczenia – Użytkownik samodzielnie sprawdza jej poprawność, kompletność i aktualność (stan prawny, stawki, terminy), dostosowuje ją do konkretnej sprawy i uzupełnia pola oznaczone [w nawiasach].',
    'Decyzję o wykorzystaniu treści podejmuje Użytkownik albo osoba, której treść przekazano – na własną odpowiedzialność.',
    'Dane z rejestrów i serwisów zewnętrznych pochodzą od podmiotów trzecich. Właściciel nie odpowiada za ich prawdziwość, kompletność, aktualność ani dostępność.',
  ]],
  ['§ 5. Odpowiedzialność', [
    'W najszerszym zakresie dopuszczalnym przez przepisy prawa Właściciel nie ponosi odpowiedzialności za: (a) skutki pobrania lub wykorzystania dokumentów i treści wygenerowanych w Aplikacji, w tym za szkody wynikające z ich błędów, nieaktualności lub niedostosowania do sprawy; (b) decyzje podjęte na podstawie treści z Aplikacji; (c) przerwy w działaniu Aplikacji, utratę lub opóźnienie danych spowodowane czynnikami od niego niezależnymi, w tym awariami usług dostawców (hosting, baza danych, poczta, rejestry publiczne); (d) skutki udostępnienia danych logowania lub innego naruszenia Regulaminu przez Użytkownika.',
    'Aplikacja jest udostępniana w stanie, w jakim się znajduje. Właściciel dokłada starań, aby działała prawidłowo, lecz nie gwarantuje jej nieprzerwanej i bezbłędnej pracy.',
    'Postanowienia Regulaminu nie wyłączają odpowiedzialności za szkodę wyrządzoną umyślnie ani odpowiedzialności, której nie można wyłączyć na podstawie bezwzględnie obowiązujących przepisów. Odpowiedzialność pracowników wobec pracodawcy regulują przepisy Kodeksu pracy.',
    'Odpowiedzialność wobec klientów za usługi świadczone z wykorzystaniem Aplikacji określają umowy zawarte z klientami przez Właściciela albo M2 TAX.',
  ]],
  ['§ 6. Zasady korzystania', [
    'Użytkownik korzysta z Aplikacji zgodnie z prawem, Regulaminem i poleceniami przełożonych.',
    'Zabronione jest w szczególności: obchodzenie zabezpieczeń, próby dostępu do danych spoza nadanego zakresu, wprowadzanie treści bezprawnych lub złośliwego oprogramowania, automatyczne pobieranie danych oraz udostępnianie Aplikacji osobom trzecim.',
    'Użytkownik odpowiada za poprawność danych, które wprowadza do Aplikacji.',
    'Błędy działania Aplikacji i podejrzenia naruszeń Użytkownik niezwłocznie zgłasza Administratorowi.',
  ]],
  ['§ 7. Prawa autorskie', [
    'Aplikacja, jej kod źródłowy, wygląd, wzory dokumentów i dokumentacja są utworami chronionymi prawem autorskim. Autorskie prawa majątkowe przysługują Właścicielowi.',
    'Użytkownik może korzystać z Aplikacji wyłącznie w celu wykonywania obowiązków na rzecz Właściciela albo M2 TAX i wyłącznie w czasie posiadania dostępu. Kopiowanie, modyfikowanie, dekompilowanie i udostępnianie Aplikacji jest zabronione.',
    'Wzory dokumentów mogą być wykorzystywane w obsłudze klientów Właściciela i M2 TAX. Nie mogą być rozpowszechniane w innym celu.',
  ]],
  ['§ 8. Akceptacja i zmiany Regulaminu', [
    'Użytkownik akceptuje Regulamin przy pierwszym logowaniu, a następnie co najmniej raz na 30 dni oraz po każdej zmianie Regulaminu. Do czasu akceptacji korzystanie z Aplikacji jest zablokowane – Użytkownik może jedynie się wylogować.',
    'Każda akceptacja jest zapisywana w historii akceptacji: data i godzina, Użytkownik, wersja Regulaminu, skrót (suma kontrolna) treści oraz przeglądarka. Wpisów w historii nie można zmienić ani usunąć. Użytkownik widzi swoją historię, Administrator – historię wszystkich Użytkowników.',
    'Właściciel może zmienić Regulamin z ważnych przyczyn, w szczególności w razie zmiany przepisów, funkcji Aplikacji lub wymogów bezpieczeństwa. Zmieniony Regulamin wiąże Użytkownika od jego akceptacji.',
    'Aktualny Regulamin jest dostępny w Aplikacji pod linkiem „Regulamin” w stopce strony.',
  ]],
  ['§ 9. Postanowienia końcowe', [
    'W sprawach nieuregulowanych stosuje się przepisy prawa polskiego, w szczególności Kodeksu cywilnego, ustawy o prawie autorskim i prawach pokrewnych, RODO oraz ustawy o doradztwie podatkowym.',
    'Spory związane z korzystaniem z Aplikacji rozstrzyga sąd właściwy dla siedziby Właściciela, z zastrzeżeniem przepisów o właściwości sądów pracy.',
    'Kontakt w sprawach Aplikacji i Regulaminu: kancelaria@rkdp.pl.',
    'Regulamin obowiązuje od dnia 23 października 2026 r.',
  ]],
];

export const termsText = () => [TERMS_TITLE, `Wersja ${TERMS_VERSION} z ${TERMS_DATE}`, ...TERMS.flatMap(([hd, items]) => [hd, ...items])].join('\n');

export async function termsHash() {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(termsText()));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  } catch { return null; }
}

// bloki dokumentu (podgląd, PDF, Word) – ten sam format co pozostałe dokumenty aplikacji
export function termsBlocks() {
  const B = [
    { t: 'title', text: 'REGULAMIN KORZYSTANIA Z APLIKACJI' },
    { t: 'subtitle', text: '„RKDP Rozliczenia” (rozliczenia.rkdp.pl)' },
    { t: 'meta', text: `Wersja ${TERMS_VERSION} · obowiązuje od 23 października 2026 r.` },
  ];
  for (const [hd, items] of TERMS) {
    B.push({ t: 'h', text: hd });
    items.forEach((tx, i) => B.push({ t: 'ust', n: `${i + 1}.`, text: tx }));
  }
  return B;
}
