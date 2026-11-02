// „O aplikacji i RODO”: wersja, dokumenty (regulamin, polityka prywatności, klauzula informacyjna dla zespołu), pomoc.
import { h } from '../ui.js';
import { state } from '../store.js';
import { TERMS_VERSION } from '../regulamin.js';

export const APP_VERSION = '2.0.0';
export const APP_DATE = '2026-11-02';
const DOCS_DATE = '2 listopada 2026 r.';

const OWNER = 'RKDP spółka doradztwa podatkowego sp. z o.o. z siedzibą w Ozorzycach (ul. Czereśniowa 28d, 55-010 Ozorzyce), KRS 0000812185, NIP 8992871126, REGON 384812329';
const CONTACT = 'kancelaria@rkdp.pl';

// ---------- treści ----------
export const PRIVACY = [
  ['1. Czego dotyczy polityka', [
    'Polityka opisuje, jakie informacje zapisuje i przetwarza aplikacja „RKDP Rozliczenia” (rozliczenia.rkdp.pl) – w przeglądarce, w aplikacji zainstalowanej na komputerze lub telefonie oraz na serwerach.',
    `Właścicielem aplikacji jest ${OWNER} (dalej „RKDP”).`,
    'Aplikacja jest narzędziem wewnętrznym – korzystają z niej wyłącznie osoby, którym RKDP nadało dostęp. Nie służy do sprzedaży, reklamy ani profilowania.',
  ]],
  ['2. Gdzie są przechowywane dane', [
    'Dane aplikacji (klienci, rozliczenia, zgłoszenia, rozmowy, pliki, konta użytkowników) są przechowywane w bazie danych i magazynie plików Supabase, w centrum danych na terenie Unii Europejskiej (Irlandia). Pliki strony aplikacji są udostępniane przez Vercel.',
    'Połączenia z aplikacją są szyfrowane (HTTPS). Dostęp do danych jest ograniczony regułami w bazie danych – każdy użytkownik widzi wyłącznie dane w zakresie nadanym przez administratora (np. tylko swoich klientów).',
    'Codziennie tworzona jest zaszyfrowana kopia zapasowa bazy danych.',
    'Pliki JPK otwierane w podglądzie JPK są przetwarzane wyłącznie w przeglądarce – nie trafiają na serwer.',
  ]],
  ['3. Co aplikacja zapisuje na urządzeniu', [
    'Aplikacja nie używa plików cookies do celów reklamowych ani statystycznych i nie korzysta z narzędzi analitycznych (np. Google Analytics). Nie wyświetla banera cookies, bo zapisuje wyłącznie informacje niezbędne do działania.',
    'W pamięci przeglądarki (localStorage) zapisywane są: dane sesji logowania, znacznik „zapamiętanej przeglądarki” (jeśli go wybrano), preferencje widoku (motyw jasny/ciemny, układ tabel, filtry), czas ostatniej aktywności (do automatycznego wylogowania) oraz identyfikator klucza Face ID na tym telefonie.',
    'Aplikacja zainstalowana na urządzeniu zapisuje kopię plików strony (service worker), aby szybko się uruchamiała i pokazywała komunikat przy braku internetu. Dane klientów nie są w tej kopii zapisywane.',
    'Wylogowanie usuwa dane sesji z urządzenia. Pełne wyczyszczenie: ustawienia przeglądarki → dane witryny rozliczenia.rkdp.pl.',
  ]],
  ['4. Logowanie, Face ID i powiadomienia', [
    'Logowanie wymaga hasła i jednorazowego kodu wysyłanego na służbowy e-mail. Hasła są przechowywane wyłącznie w postaci zabezpieczonego skrótu – nikt, także administrator, ich nie zna.',
    'Face ID / odcisk palca działa na zasadzie klucza dostępu (passkey). Obraz twarzy i odcisk palca nigdy nie opuszczają telefonu – sprawdza je telefon. Aplikacja zapisuje jedynie klucz publiczny, nazwę urządzenia oraz datę dodania i ostatniego użycia. Klucz można usunąć w „Mój profil”.',
    'Powiadomienia push są wysyłane za pośrednictwem usług producenta przeglądarki lub systemu (Apple, Google, Microsoft, Mozilla). Treść jest szyfrowana dla konkretnego urządzenia i zawiera tylko krótką informację (np. tytuł zadania). Powiadomienia można wyłączyć w „Mój profil”.',
  ]],
  ['5. Rejestr działań i bezpieczeństwo', [
    'Aplikacja rejestruje logowania, zmiany danych, wysłane wiadomości i akceptacje regulaminu (kto, kiedy, co). Służy to bezpieczeństwu, rozliczalności i wyjaśnianiu pomyłek.',
    'Sesja wygasa po okresie bezczynności na komputerze; w aplikacji na telefonie chroni ją Face ID (odblokowanie ważne 24 godziny).',
    'Utratę telefonu lub komputera, ujawnienie hasła albo podejrzenie nieuprawnionego dostępu należy niezwłocznie zgłosić administratorowi.',
  ]],
  ['6. Wiadomości e-mail wysyłane z aplikacji', [
    'Wiadomości do klientów (np. kwoty do zapłaty, prośby o dokumenty) są wysyłane ze służbowych skrzynek RKDP w Google Workspace. Treść wysłanej wiadomości i lista odbiorców są zapisywane w aplikacji jako ślad korespondencji.',
  ]],
  ['7. Zmiany i kontakt', [
    'O zmianach polityki informujemy w aplikacji („Co nowego”). Aktualna wersja jest zawsze dostępna w „Więcej → O aplikacji i RODO”.',
    `Pytania dotyczące danych i prywatności: ${CONTACT}.`,
  ]],
];

export const RODO = [
  ['Klauzula informacyjna dla użytkowników aplikacji (pracowników i współpracowników)', [
    'Zgodnie z art. 13 rozporządzenia Parlamentu Europejskiego i Rady (UE) 2016/679 (RODO) informujemy:',
  ]],
  ['1. Administrator danych', [
    `Administratorem Twoich danych osobowych przetwarzanych w aplikacji „RKDP Rozliczenia” jest ${OWNER}. Kontakt: ${CONTACT} lub pisemnie na adres siedziby.`,
    'Jeżeli współpracujesz z M2 TAX Doradcy Podatkowi Otręba Ruszniak spółka partnerska, M2 TAX pozostaje administratorem danych związanych z Twoim zatrudnieniem lub współpracą z M2 TAX; w aplikacji Twoje dane przetwarza RKDP jako jej właściciel, w zakresie opisanym poniżej.',
  ]],
  ['2. Jakie dane przetwarzamy', [
    'Dane konta: imię i nazwisko, służbowy adres e-mail, stanowisko, rola i zakres uprawnień, zdjęcie lub inicjały, telefon.',
    'Dane do pełnomocnictw (UPL-1, PEL, PPS-1), które wpisujesz sam(a) w „Mój profil”: NIP, PESEL, seria i numer dowodu, adres do doręczeń, adres do e-Doręczeń. PESEL i numer dowodu widzisz wyłącznie Ty – nie widzi ich nikt z zespołu ani administrator.',
    'Dane o korzystaniu z aplikacji: logowania, urządzenia i przeglądarki, rejestr zmian i działań, akceptacje regulaminu, ustawienia powiadomień, klucze Face ID (bez danych biometrycznych).',
    'Dane organizacyjne: przypisani klienci, zadania, komentarze i wiadomości, lista obecności i rejestr czasu pracy (jeżeli z nich korzystasz).',
  ]],
  ['3. Cele i podstawy przetwarzania', [
    'Zapewnienie dostępu do aplikacji i organizacja pracy przy obsłudze klientów – w związku z umową o pracę lub umową o współpracę (art. 6 ust. 1 lit. b RODO) oraz w prawnie uzasadnionym interesie administratora polegającym na sprawnej organizacji pracy (art. 6 ust. 1 lit. f RODO).',
    'Przygotowanie pełnomocnictw, w których jesteś pełnomocnikiem (UPL-1, PEL, PPS-1) – w zakresie wymaganym przez wzory urzędowe (art. 6 ust. 1 lit. c RODO w zw. z przepisami Ordynacji podatkowej i ustawy o systemie ubezpieczeń społecznych) oraz w związku z wykonywaną umową (art. 6 ust. 1 lit. b RODO).',
    'Ewidencja obecności i czasu pracy – w zakresie wymaganym przepisami prawa pracy (art. 6 ust. 1 lit. c RODO), a przy współpracy cywilnoprawnej – w uzasadnionym interesie administratora (art. 6 ust. 1 lit. f RODO).',
    'Bezpieczeństwo aplikacji, rozliczalność działań, ochrona tajemnicy doradcy podatkowego oraz ustalenie, dochodzenie lub obrona roszczeń – prawnie uzasadniony interes administratora (art. 6 ust. 1 lit. f RODO).',
    'Face ID / odcisk palca – wyłącznie na Twoje żądanie (włączasz je sam(a)); aplikacja nie przetwarza danych biometrycznych, a jedynie klucz publiczny urządzenia.',
  ]],
  ['4. Odbiorcy danych', [
    'Dostawcy usług technicznych działający na zlecenie administratora: Supabase (baza danych i pliki, serwery w UE – Irlandia), Vercel (udostępnianie aplikacji), Google (poczta Google Workspace), usługi powiadomień producentów systemów i przeglądarek.',
    'Inni użytkownicy aplikacji – w zakresie potrzebnym do współpracy (np. imię, nazwisko i zdjęcie przy zadaniach i klientach).',
    'Klienci i organy (urząd skarbowy, ZUS, sąd) – w zakresie danych zamieszczonych w pełnomocnictwie, w którym jesteś pełnomocnikiem.',
    'Część dostawców może przetwarzać dane poza Europejskim Obszarem Gospodarczym (np. w USA). Odbywa się to na podstawie standardowych klauzul umownych zatwierdzonych przez Komisję Europejską lub decyzji o adekwatności (EU-US Data Privacy Framework).',
  ]],
  ['5. Okres przechowywania', [
    'Dane konta – przez okres współpracy, a po jej zakończeniu przez okres przedawnienia ewentualnych roszczeń.',
    'Dane w pełnomocnictwach – przez okres przechowywania dokumentacji sprawy klienta.',
    'Ewidencja czasu pracy – przez okres wymagany przepisami prawa pracy.',
    'Rejestr działań i logowań – przez okres potrzebny do zapewnienia bezpieczeństwa i rozliczalności, nie dłużej niż przez okres przedawnienia roszczeń.',
    'Klucze Face ID i ustawienia powiadomień – do czasu ich usunięcia przez Ciebie lub zakończenia dostępu do aplikacji.',
  ]],
  ['6. Twoje prawa', [
    'Masz prawo dostępu do swoich danych, ich sprostowania, usunięcia lub ograniczenia przetwarzania, prawo do przenoszenia danych oraz prawo wniesienia sprzeciwu wobec przetwarzania opartego na prawnie uzasadnionym interesie administratora.',
    'Większość swoich danych możesz sam(a) poprawić w „Mój profil”. W pozostałych sprawach napisz na ' + CONTACT + '.',
    'Masz prawo wnieść skargę do Prezesa Urzędu Ochrony Danych Osobowych (ul. Stawki 2, 00-193 Warszawa).',
  ]],
  ['7. Dobrowolność podania danych', [
    'Podanie danych konta jest warunkiem korzystania z aplikacji. Podanie danych do pełnomocnictw jest dobrowolne, ale bez nich nie wygenerujesz pełnomocnictwa ze swoimi danymi. Włączenie Face ID i powiadomień jest dobrowolne.',
    'Dane nie są wykorzystywane do zautomatyzowanego podejmowania decyzji ani profilowania.',
  ]],
];

// historia zmian – od pierwszej wersji (najnowsze na górze)
const NEWS = [
  ['2.0', '2 listopada 2026', [
    'Kwoty do zapłaty: „+ Dodaj pozycję” – dodatkowe wiersze (np. kwota rozdzielona na części, osobna płatność) z własną nazwą, terminem, rachunkiem i tytułem przelewu; zapamiętują się dla klienta i miesiąca.',
    'Powiadomienia: własny adres e-mail do powiadomień oraz godziny i dni, w których mogą przychodzić (np. bez weekendów) – to, co przyjdzie poza nimi, dostajesz zbiorczo na początku kolejnego okna. Face ID ważne 24 godziny.',
    'Zadania: każdy użytkownik RKDP może dodać zadanie – dla siebie albo dla innej osoby (także dla Michała); zlecający akceptuje wykonanie, odpowiada na pytania i może zamknąć zadanie.',
    'Duże monitory: przycisk ↔ w nagłówku rozciąga stronę na całą szerokość ekranu (zapamiętywany w przeglądarce); kliknięcie powiadomienia push otwiera właściwe miejsce w aplikacji.',
    'Rozliczenia: nowa lista „Wyciągi” – wyciągi bankowe narastająco od początku roku (miesiące obok siebie, licznik braków).',
    'Karta klienta: dane w podglądzie, zmiany dopiero po kliknięciu „Edytuj dane” – nic nie zmieni się przez przypadek.',
    '„Zlecenia” dla zespołu nazywają się teraz „Zadania”, a „Kadry i ZUS” – „Płace”; na telefonie „Więcej” otwiera się jako cała strona.',
    'Nowy wygląd: jasny układ z granatowym akcentem i logo RKDP, górny pasek zakładek na komputerze, własne ikony RKDP.',
    'Czytelne kolory statusów: zielony – zrobione, bursztynowy – brak dokumentów, fioletowy – przypomniano, czerwony – po terminie.',
    'Menu „Więcej” z ikonami, wylogowanie w menu; krótszy pasek narzędzi w Rozliczeniach, instrukcja zaznaczania pod ikonką „i”.',
    'Ekran „O aplikacji i RODO”: polityka prywatności, klauzula informacyjna dla zespołu, historia zmian, zgłaszanie problemu.',
    'Nowa ikona aplikacji (granatowa „R”), ciemny motyw w granacie.',
  ]],
  ['1.8', '2 listopada 2026', [
    'Face ID / odcisk palca w aplikacji na telefonie – logowanie bez hasła i kodu, odblokowanie twarzą ważne 24 godziny.',
    'Aplikacja na telefonie nie wylogowuje po bezczynności (sesja do 30 dni) – powiadomienia działają cały czas.',
    'Kwoty podatków w kratkach rozliczeń: kwota zapisana (jasna) i wysłana klientowi (zaznaczona ✓).',
    'Zadania: czytelny widok z krokami i „co teraz”, zlecający może zamknąć zadanie jako wykonane.',
    'Telefon: długie nazwy klientów nie nachodzą na wiersz z księgową.',
  ]],
  ['1.7', '1 listopada 2026', [
    'Zadania dla zespołu (dodatkowe zadania od administratora) z akceptacją wykonania, załącznikami, powiadomieniami push i e-mail (e-maile można wyłączyć w profilu).',
    'Moje sprawy: jedna lista zadań, pytań i terminów ze zdjęciem osoby; nowe menu: Pulpit, Moje sprawy, Rozliczenia, Klienci, Rozmowy i „Więcej”.',
    'Kwoty do zapłaty: kwota i termin przy kratce, rachunki klienta, e-mail z kwotami w szacie RKDP z podpisem i automatycznym odhaczeniem.',
    'Karta klienta: stawki (abonament, dokumenty, pracownicy, usługi dodatkowe), zakres usług (księgowość / tylko doradztwo), spółka komandytowa jako podatnik CIT, fundacja rodzinna.',
    'Wspólnicy spółek osobowych: osobne kratki PIT i ZUS dla każdego wspólnika.',
    'Limity i progi 2026 z ostrzeżeniami, pełnomocnictwa z terminami ważności; UPL-1 i ZUS PEL domyślnie TAK, KSeF domyślnie NIE.',
    'Telefon: Rozliczenia jako karty klientów, kratka jednym dotknięciem, zdjęcie dokumentu do klienta.',
    'Czas pracy przy kliencie (M2 TAX): licznik start/stop, pakiety godzin, raport rentowności; kolumna klientów na liście obecności.',
    'Kratki przeliczają się same po zmianie ustawień klienta.',
  ]],
  ['1.6', '30 października 2026', [
    'Informacja do klientów: zbiorczy e-mail z kancelarii (adresaci w UDW, grupy klientów, gotowy mail HTML, historia wysyłek).',
    'Karta klienta: historia składek ZUS, wakacje składkowe, Mały ZUS Plus.',
    'Kosz na usunięte pliki – 30 dni na przywrócenie.',
  ]],
  ['1.5', '29 października 2026', [
    'Rozmowy zamiast zgłoszeń: uwagi, pytania i zadania przy kliencie w jednej rozmowie, @wzmianki z powiadomieniem, załączniki, przypięte ustalenia.',
    'Wiadomości do klientów z kancelaria@rkdp.pl i „Otwórz w Gmailu”, status „Wysłano przypomnienie”, prośby o dokumenty z linkiem dla klienta.',
    'Dziś, kalendarz obowiązków z mapą miesiąca, zamknięcie roku, panel klienta.',
    'Archiwum dokumentów klienta ze skanowaniem telefonem do PDF.',
    'e-Sprawozdanie finansowe mikro: z JPK_KR_PD i KRS, XML do eKRS i PDF.',
    'Weryfikacja JPK_PKPIR i JPK_EWP, link do oferty dla klienta, oferta Program Partner (M2 TAX), zdjęcia profilowe.',
  ]],
  ['1.4', '28 października 2026', [
    'Instalacja jako aplikacja na telefonie i komputerze, powiadomienia push, ekran „brak internetu”.',
    'Pierwsza nowa szata graficzna: motyw jasny i ciemny, wyszukiwarka Ctrl+K, pierścienie i paski postępu w rozliczeniach.',
    'Kafelek „Rozliczeni” jako filtr klientów do rozliczenia.',
  ]],
  ['1.3', '23 października 2026', [
    'Regulamin aplikacji z akceptacją przy logowaniu.',
    'Podgląd JPK (JPK_KR_PD, JPK_ST_KR i inne) z kontrolą pliku, pomocniczym bilansem i RZiS – plik nie opuszcza przeglądarki.',
    'Kalkulator formy opodatkowania oraz wzory umów i uchwał dla klientów; konto „tylko podgląd JPK”.',
    'Szybsze działanie i przełączanie zakładek.',
  ]],
  ['1.2', '19 października 2026', [
    'AML: karta weryfikacji klienta – CRBR, KRS, Biała lista VAT, listy sankcyjne, raport PDF.',
    'Oferty RKDP i M2 TAX z cennikiem i szatą graficzną firmy.',
    'Lista obecności (ewidencja czasu pracy) z PDF i Excelem.',
    'Zakładka Dokumenty: umowy, pełnomocnictwa, protokoły i wzory pism procesowych M2 TAX w jednym miejscu.',
    'Załączniki w uwagach klienta, historia zmian w M2 TAX.',
  ]],
  ['1.1', '18 października 2026', [
    'Logowanie hasłem i kodem z e-maila, zapamiętane przeglądarki, wylogowanie po bezczynności.',
    'Moduły RKDP / M2 TAX z przełącznikiem przy logo.',
    'Umowy i pełnomocnictwa (UPL-1, PEL, PPS-1, procesowe) wg wzorów biura; Mój profil z danymi do pełnomocnictw.',
    'Sprawozdania: dane z KRS i protokół ZZW z uchwałami.',
    'Pulpit pracownika i doradcy, rejestr zgłoszeń z zadaniami cyklicznymi.',
    'Wersja na telefon: dolny pasek zakładek, karty zamiast tabel.',
  ]],
  ['1.0', '17 października 2026', [
    'Pierwsza wersja: rozliczenia klientów (Księgowość oraz Kadry i ZUS) zamiast arkusza Excel, kratki statusów, księgowa i kadrowa przy kliencie.',
    'Filtry, układ tabel, tryb pełnego ekranu, pobieranie Excel / PDF / CSV.',
    'Moduł Doradztwo podatkowe (M2 TAX), dane kontrahenta po NIP z Białej listy VAT.',
    'Nocna zaszyfrowana kopia zapasowa bazy.',
  ]],
];

// ---------- widok ----------
const ICO = {
  doc: '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path class="duo" d="M6 3h9l4 4v14H6z"/><path d="M6 3h9l4 4v14H6zM15 3v4h4M9 12h6M9 16h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  shield: '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path class="duo" d="M12 3l8 3.5v5.5c0 4.6-3.4 8-8 9-4.6-1-8-4.4-8-9V6.5z"/><path d="M12 3l8 3.5v5.5c0 4.6-3.4 8-8 9-4.6-1-8-4.4-8-9V6.5zM8.5 12l2.5 2.5 4.5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  lock: '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path class="duo" d="M5 11h14v10H5z"/><path d="M5 11h14v10H5zM8 11V8a4 4 0 018 0v3M12 15v2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  star: '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path class="duo" d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"/><path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  mail: '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path class="duo" d="M4 6h16v12H4z"/><path d="M4 6h16v12H4zM4 7l8 6 8-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  user: '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path class="duo" d="M4 21c0-4 3.6-7 8-7s8 3 8 7z"/><path d="M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 3.6-7 8-7s8 3 8 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};
const ico = k => h('span', { class: 'oa-ico', html: ICO[k] });
const row = (href, k, title, sub, extra) => h('a', { class: 'oa-row', href, target: href.startsWith('mailto:') ? null : null },
  ico(k), h('span', { class: 'oa-t' }, h('b', {}, title), sub ? h('span', { class: 'small muted' }, sub) : null), extra || null,
  h('span', { class: 'oa-chev', html: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>' }));

function docPage(main, title, sections) {
  main.replaceChildren(
    h('a', { href: '#/o-aplikacji', class: 'btn btn-ghost btn-sm', style: { marginBottom: '6px' } }, '← O aplikacji'),
    h('div', { class: 'page-head' }, h('div', {}, h('p', { class: 'eyebrow' }, 'RKDP Rozliczenia'), h('h1', { style: { marginTop: '6px' } }, title),
      h('p', { class: 'sub' }, `Obowiązuje od ${DOCS_DATE}`)),
      h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: () => window.print() }, 'Drukuj / PDF')),
    h('section', { class: 'card section oa-doc' }, ...sections.map(([hd, items]) => h('div', {},
      h('h3', {}, hd), items.length > 1 ? h('ul', {}, ...items.map(t => h('li', {}, t))) : h('p', {}, items[0])))));
}

export async function renderOAplikacji(main, sub) {
  if (sub === 'prywatnosc') return docPage(main, 'Polityka prywatności', PRIVACY);
  if (sub === 'rodo') return docPage(main, 'Klauzula informacyjna RODO', RODO);
  main.replaceChildren(
    h('div', { class: 'page-head' }, h('div', {}, h('p', { class: 'eyebrow' }, 'Więcej'), h('h1', { style: { marginTop: '6px' } }, 'O aplikacji'),
      h('p', { class: 'sub' }, 'Wersja, dokumenty i pomoc.'))),
    h('div', { class: 'oa-grid' },
      h('section', { class: 'card section oa-app' },
        h('img', { src: '/icon-192-v4.png', alt: '', class: 'oa-logo', width: 72, height: 72 }),
        h('h2', {}, 'RKDP Rozliczenia'),
        h('p', { class: 'muted' }, `Wersja ${APP_VERSION} · ${new Date(APP_DATE + 'T12:00:00').toLocaleDateString('pl-PL')}`),
        h('p', { class: 'small muted', style: { marginTop: '10px' } }, 'Właściciel: RKDP spółka doradztwa podatkowego sp. z o.o.', h('br'), 'Dane objęte tajemnicą doradcy podatkowego.'),
        h('p', { class: 'small muted', style: { marginTop: '6px' } }, 'Wykonanie: ', h('a', { href: 'https://ruszniak.io', target: '_blank', rel: 'noopener' }, 'druslak'))),
      h('div', { class: 'oa-col' },
        h('p', { class: 'oa-lbl' }, 'Dokumenty'),
        h('div', { class: 'card oa-list' },
          row('#/regulamin', 'doc', 'Regulamin korzystania', `wersja ${TERMS_VERSION}`, h('span', { class: 'oa-ok' }, 'zaakceptowany')),
          row('#/o-aplikacji/prywatnosc', 'lock', 'Polityka prywatności', 'co aplikacja zapisuje i gdzie są dane'),
          row('#/o-aplikacji/rodo', 'shield', 'Klauzula informacyjna RODO', 'dla pracowników i współpracowników')),
        h('p', { class: 'oa-lbl' }, 'Pomoc'),
        h('div', { class: 'card oa-list' },
          row('#/profil', 'user', 'Mój profil, Face ID, powiadomienia', state.me?.email || ''),
          row(`mailto:${CONTACT}?subject=${encodeURIComponent('RKDP Rozliczenia – zgłoszenie problemu')}&body=${encodeURIComponent(`\n\n---\nWersja ${APP_VERSION} · ${navigator.userAgent}`)}`, 'mail', 'Zgłoś problem', 'e-mail z opisem i wersją aplikacji')),
        h('p', { class: 'oa-lbl' }, 'Co nowego'),
        h('div', { class: 'card oa-news' }, ...NEWS.map(([v, d, items], i) => h('details', { class: 'oa-new', open: i === 0 ? true : null },
          h('summary', {}, h('span', { class: 'oa-v' }, v), h('b', {}, i === 0 ? 'Aktualna wersja' : `Wersja ${v}`), h('span', { class: 'small muted' }, d)),
          h('ul', {}, ...items.map(t => h('li', {}, t)))))))));
}
