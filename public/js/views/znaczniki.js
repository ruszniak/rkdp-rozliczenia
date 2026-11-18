// Podpowiadacz znaczników kont JPK_CIT (JPK_KR_PD) – narzędzie POMOCNICZE.
// Na podstawie numeru i nazwy konta proponuje znacznik bilansowy / wynikowy (S_12_1, S_12_2) i podatkowy (S_12_3, PD).
// Plan kont z Excela (lub CSV) jest czytany wyłącznie w przeglądarce – nic nie trafia na serwer.
// Słownik: jednostki pozostałe (ZOiS7, zał. nr 1 do ustawy o rachunkowości) wg rozporządzenia MF w sprawie dodatkowych danych
// w księgach rachunkowych (JPK_KR_PD). Ostateczny wybór i weryfikacja należą do księgowego.
import { h, toast, icon, infoTip } from '../ui.js';
import { unzip } from '../docx.js';
import { downloadXlsx } from '../xlsx.js';

// ---------- słownik (kod → opis) ----------
const DICT = [
  // Aktywa
  ['BAAI1_W', 'Koszty zakończonych prac rozwojowych – wartość brutto', 'Aktywa'], ['BAAI1_U', 'Koszty zakończonych prac rozwojowych – umorzenie', 'Aktywa'],
  ['BAAI2_W', 'Wartość firmy – wartość brutto', 'Aktywa'], ['BAAI2_U', 'Wartość firmy – umorzenie', 'Aktywa'],
  ['BAAI3_W', 'Inne wartości niematerialne i prawne – wartość brutto', 'Aktywa'], ['BAAI3_U', 'Inne WNiP – umorzenie', 'Aktywa'], ['BAAI3_A', 'Inne WNiP – odpisy aktualizujące', 'Aktywa'],
  ['BAAI4_W', 'Zaliczki na wartości niematerialne i prawne', 'Aktywa'],
  ['BAAII1a_W', 'Grunty (w tym prawo użytkowania wieczystego) – wartość brutto', 'Aktywa'], ['BAAII1a_U', 'Grunty – umorzenie', 'Aktywa'],
  ['BAAII1b_W', 'Budynki, lokale, obiekty inżynierii lądowej i wodnej – wartość brutto', 'Aktywa'], ['BAAII1b_U', 'Budynki, lokale – umorzenie', 'Aktywa'],
  ['BAAII1c_W', 'Urządzenia techniczne i maszyny – wartość brutto', 'Aktywa'], ['BAAII1c_U', 'Urządzenia techniczne i maszyny – umorzenie', 'Aktywa'],
  ['BAAII1d_W', 'Środki transportu – wartość brutto', 'Aktywa'], ['BAAII1d_U', 'Środki transportu – umorzenie', 'Aktywa'],
  ['BAAII1e_W', 'Inne środki trwałe – wartość brutto', 'Aktywa'], ['BAAII1e_U', 'Inne środki trwałe – umorzenie', 'Aktywa'],
  ['BAAII2_W', 'Środki trwałe w budowie', 'Aktywa'], ['BAAII3_W', 'Zaliczki na środki trwałe w budowie', 'Aktywa'],
  ['BAAIII3_W', 'Należności długoterminowe od pozostałych jednostek', 'Aktywa'],
  ['BAAIV1_W', 'Inwestycje długoterminowe – nieruchomości', 'Aktywa'], ['BAAIV1_U', 'Inwestycje w nieruchomości – umorzenie', 'Aktywa'],
  ['BAAIV3a_ULA_W', 'Udziały lub akcje w jednostkach powiązanych (długoterminowe)', 'Aktywa'], ['BAAIV3c_ULA_W', 'Udziały lub akcje w pozostałych jednostkach (długoterminowe)', 'Aktywa'],
  ['BAAIV3c_UP_W', 'Udzielone pożyczki długoterminowe – pozostałe jednostki', 'Aktywa'], ['BAAIV4_W', 'Inne inwestycje długoterminowe', 'Aktywa'],
  ['BAAV1_W', 'Aktywa z tytułu odroczonego podatku dochodowego', 'Aktywa'], ['BAAV2_W', 'Inne długoterminowe rozliczenia międzyokresowe', 'Aktywa'],
  ['BABI1', 'Materiały', 'Aktywa'], ['BABI1_O', 'Materiały – odchylenia od cen ewidencyjnych', 'Aktywa'], ['BABI2', 'Półprodukty i produkty w toku', 'Aktywa'], ['BABI3', 'Produkty gotowe', 'Aktywa'],
  ['BABI4', 'Towary', 'Aktywa'], ['BABI4_O', 'Towary – odchylenia / narzut', 'Aktywa'], ['BABI4_A', 'Towary – odpisy aktualizujące', 'Aktywa'], ['BABI5', 'Zaliczki na dostawy i usługi', 'Aktywa'],
  ['BABII1a_D12', 'Należności od jednostek powiązanych z tytułu dostaw i usług (do 12 mies.)', 'Aktywa'], ['BABII1b', 'Należności od jednostek powiązanych – inne', 'Aktywa'],
  ['BABII3a_D12', 'Należności z tytułu dostaw i usług (do 12 mies.) – pozostałe jednostki', 'Aktywa'], ['BABII3a_P12', 'Należności z tytułu dostaw i usług (powyżej 12 mies.)', 'Aktywa'],
  ['BABII3a_A', 'Należności z tytułu dostaw i usług – odpisy aktualizujące', 'Aktywa'],
  ['BABII3bVAT', 'Należności z tytułu podatku VAT', 'Aktywa'], ['BABII3bPD', 'Należności z tytułu podatku dochodowego', 'Aktywa'], ['BABII3bPOZ', 'Należności z tytułu pozostałych podatków', 'Aktywa'],
  ['BABII3bUSZ', 'Należności z tytułu ubezpieczeń społecznych i zdrowotnych', 'Aktywa'], ['BABII3bCLO', 'Należności z tytułu ceł', 'Aktywa'], ['BABII3bDOT', 'Należności z tytułu dotacji', 'Aktywa'], ['BABII3bINN', 'Należności publicznoprawne – inne', 'Aktywa'],
  ['BABII3c', 'Należności – inne (pozostałe jednostki)', 'Aktywa'], ['BABII3d', 'Należności dochodzone na drodze sądowej', 'Aktywa'],
  ['BABIII1b_UP', 'Udzielone pożyczki krótkoterminowe – pozostałe jednostki', 'Aktywa'], ['BABIII1b_IPW', 'Inne papiery wartościowe krótkoterminowe', 'Aktywa'],
  ['BABIII1c1_SPKR', 'Środki pieniężne w kasie i na rachunkach', 'Aktywa'], ['BABIII1c2_ISP', 'Inne środki pieniężne (lokaty, środki w drodze)', 'Aktywa'], ['BABIII1c3_IAP', 'Inne aktywa pieniężne', 'Aktywa'],
  ['BABIII2_W', 'Inne inwestycje krótkoterminowe', 'Aktywa'], ['BABIV', 'Krótkoterminowe rozliczenia międzyokresowe (czynne)', 'Aktywa'],
  ['BAC', 'Należne wpłaty na kapitał (fundusz) podstawowy', 'Aktywa'], ['BAD', 'Udziały (akcje) własne', 'Aktywa'],
  // Pasywa
  ['BPAI', 'Kapitał (fundusz) podstawowy', 'Pasywa'], ['BPAIIPZ', 'Kapitał zapasowy – z podziału zysku', 'Pasywa'], ['BPAIIWS', 'Kapitał zapasowy – nadwyżka ze sprzedaży udziałów (agio)', 'Pasywa'], ['BPAII_INN', 'Kapitał zapasowy – inny', 'Pasywa'],
  ['BPAIII_INN', 'Kapitał z aktualizacji wyceny', 'Pasywa'], ['BPAIVPZ', 'Pozostałe kapitały rezerwowe – z podziału zysku', 'Pasywa'], ['BPAIV_INN', 'Pozostałe kapitały rezerwowe – inne', 'Pasywa'],
  ['BPAV', 'Zysk (strata) z lat ubiegłych', 'Pasywa'], ['BPAVI', 'Zysk (strata) netto', 'Pasywa'], ['BPAVII', 'Odpisy z zysku netto w ciągu roku obrotowego (zaliczki na dywidendę)', 'Pasywa'],
  ['BPBI1', 'Rezerwa z tytułu odroczonego podatku dochodowego', 'Pasywa'], ['BPBI2_K', 'Rezerwa na świadczenia emerytalne – krótkoterminowa', 'Pasywa'], ['BPBI2_D', 'Rezerwa na świadczenia emerytalne – długoterminowa', 'Pasywa'],
  ['BPBI3_K', 'Pozostałe rezerwy – krótkoterminowe', 'Pasywa'], ['BPBI3_D', 'Pozostałe rezerwy – długoterminowe', 'Pasywa'],
  ['BPBII1', 'Zobowiązania długoterminowe wobec jednostek powiązanych', 'Pasywa'], ['BPBII3a', 'Kredyty i pożyczki długoterminowe', 'Pasywa'], ['BPBII3c', 'Inne zobowiązania finansowe długoterminowe (np. leasing)', 'Pasywa'], ['BPBII3e', 'Inne zobowiązania długoterminowe', 'Pasywa'],
  ['BPBIII1a_D12', 'Zobowiązania wobec jednostek powiązanych z tytułu dostaw i usług', 'Pasywa'], ['BPBIII1b', 'Zobowiązania wobec jednostek powiązanych – inne', 'Pasywa'],
  ['BPBIII3a', 'Kredyty i pożyczki krótkoterminowe (także debet na rachunku)', 'Pasywa'], ['BPBIII3c', 'Inne zobowiązania finansowe krótkoterminowe (np. leasing)', 'Pasywa'],
  ['BPBIII3d_D12', 'Zobowiązania z tytułu dostaw i usług (do 12 mies.)', 'Pasywa'], ['BPBIII3d_P12', 'Zobowiązania z tytułu dostaw i usług (powyżej 12 mies.)', 'Pasywa'],
  ['BPBIII3e', 'Zaliczki otrzymane na dostawy i usługi', 'Pasywa'], ['BPBIII3f', 'Zobowiązania wekslowe', 'Pasywa'],
  ['BPBIII3gVAT', 'Zobowiązania z tytułu podatku VAT', 'Pasywa'], ['BPBIII3gPD', 'Zobowiązania z tytułu podatku dochodowego (CIT)', 'Pasywa'], ['BPBIII3gPOZ', 'Zobowiązania z tytułu pozostałych podatków (np. PIT pracowników)', 'Pasywa'],
  ['BPBIII3gUSZ', 'Zobowiązania z tytułu ubezpieczeń społecznych i zdrowotnych (ZUS)', 'Pasywa'], ['BPBIII3gCLO', 'Zobowiązania z tytułu ceł', 'Pasywa'], ['BPBIII3g_INN', 'Zobowiązania publicznoprawne – inne (np. PFRON)', 'Pasywa'],
  ['BPBIII3h', 'Zobowiązania z tytułu wynagrodzeń', 'Pasywa'], ['BPBIII3i', 'Inne zobowiązania krótkoterminowe', 'Pasywa'], ['BPBIII4', 'Fundusze specjalne (np. ZFŚS)', 'Pasywa'],
  ['BPBIV1', 'Ujemna wartość firmy', 'Pasywa'], ['BPBIV2_K', 'Inne rozliczenia międzyokresowe – krótkoterminowe (bierne / przychody przyszłych okresów)', 'Pasywa'], ['BPBIV2_D', 'Inne rozliczenia międzyokresowe – długoterminowe', 'Pasywa'],
  // Rachunek zysków i strat (porównawczy RP / kalkulacyjny RK)
  ['RPAI_RKAI_POZ', 'Przychody netto ze sprzedaży produktów (usług) – pozostałe jednostki', 'RZiS'], ['RPAI_RKAI_POW', 'Przychody netto ze sprzedaży produktów – jednostki powiązane', 'RZiS'],
  ['RPAII', 'Zmiana stanu produktów', 'RZiS'], ['RPAIII', 'Koszt wytworzenia produktów na własne potrzeby', 'RZiS'],
  ['RPAIV_RKAII_POZ', 'Przychody netto ze sprzedaży towarów i materiałów – pozostałe jednostki', 'RZiS'], ['RPAIV_RKAII_POW', 'Przychody ze sprzedaży towarów i materiałów – jednostki powiązane', 'RZiS'],
  ['RPBI', 'Amortyzacja', 'RZiS'], ['RPBII', 'Zużycie materiałów i energii', 'RZiS'], ['RPBIII', 'Usługi obce', 'RZiS'], ['RPBIV_POZ', 'Podatki i opłaty', 'RZiS'], ['RPBIV_AKC', 'Podatek akcyzowy', 'RZiS'],
  ['RPBV', 'Wynagrodzenia', 'RZiS'], ['RPBVI', 'Ubezpieczenia społeczne i inne świadczenia', 'RZiS'], ['RPBVII', 'Pozostałe koszty rodzajowe', 'RZiS'],
  ['RPBVIII_RKBII_POZ', 'Wartość sprzedanych towarów i materiałów – pozostałe jednostki', 'RZiS'], ['RKBI_POZ', 'Koszt wytworzenia sprzedanych produktów', 'RZiS'], ['RKD', 'Koszty sprzedaży', 'RZiS'], ['RKE', 'Koszty ogólnego zarządu', 'RZiS'],
  ['RPDI_RKGI_POZ', 'Zysk z tytułu rozchodu niefinansowych aktywów trwałych', 'RZiS'], ['RPDII_RKGII', 'Dotacje', 'RZiS'], ['RPDIII_RKGIII_P', 'Aktualizacja wartości aktywów niefinansowych (przychód)', 'RZiS'],
  ['RPDIV_RKGIV_P', 'Inne przychody operacyjne', 'RZiS'],
  ['RPEI_RKHI_POZ', 'Strata z tytułu rozchodu niefinansowych aktywów trwałych', 'RZiS'], ['RPEII_RKHII_N', 'Aktualizacja wartości aktywów niefinansowych – odpisy na należności', 'RZiS'], ['RPEII_RKHII_P', 'Aktualizacja wartości aktywów niefinansowych – inne', 'RZiS'],
  ['RPEIII_RKHIII_P', 'Inne koszty operacyjne', 'RZiS'],
  ['RPGII_RKJII_POZ', 'Przychody finansowe – odsetki', 'RZiS'], ['RPGIII_RKJIII_POZ', 'Zysk z tytułu rozchodu aktywów finansowych', 'RZiS'], ['RPGIV_RKJIV', 'Aktualizacja wartości aktywów finansowych (przychód)', 'RZiS'],
  ['RPGV_RKJV_RK', 'Przychody finansowe – dodatnie różnice kursowe', 'RZiS'], ['RPGV_RKJV_POZ', 'Przychody finansowe – inne', 'RZiS'],
  ['RPHI_RKKI_POZ', 'Koszty finansowe – odsetki', 'RZiS'], ['RPHII_RKKII_POZ', 'Strata z tytułu rozchodu aktywów finansowych', 'RZiS'], ['RPHIII_RKKIII', 'Aktualizacja wartości aktywów finansowych (koszt)', 'RZiS'],
  ['RPHIV_RKKIV_RK', 'Koszty finansowe – ujemne różnice kursowe', 'RZiS'], ['RPHIV_RKKIV_POZ', 'Koszty finansowe – inne', 'RZiS'],
  ['RPJ_RKM_B', 'Podatek dochodowy – część bieżąca', 'RZiS'], ['RPJ_RKM_O', 'Podatek dochodowy – część odroczona', 'RZiS'], ['RPK_RKN', 'Pozostałe obowiązkowe zmniejszenia zysku (zwiększenia straty)', 'RZiS'],
  ['INNE', 'Inne – konto bez pozycji w bilansie / RZiS (np. konta pozabilansowe, rozliczeniowe)', 'Inne'],
  // Podatkowe (S_12_3)
  ['PD1', 'Przychody – różnica trwała (ogólna), gdy nie pasuje PD1_1–PD1_3', 'PD'], ['PD1_1', 'Przychody, do których nie stosuje się ustawy o CIT (np. działalność rolnicza, leśna)', 'PD'],
  ['PD1_2', 'Przychody niezaliczane do przychodów podatkowych (np. zwrot nadpłaty podatku, wymiana kryptowalut)', 'PD'], ['PD1_3', 'Dochody wolne (np. decyzja o wsparciu, zwolnienia art. 17)', 'PD'],
  ['PD2', 'Przychody niepodlegające opodatkowaniu w roku bieżącym – różnica przejściowa (np. naliczone, niezapłacone odsetki, wycena)', 'PD'],
  ['PD3_PB', 'Przychody podatkowe roku bieżącego ujęte w księgach lat ubiegłych (konto pozabilansowe)', 'PD'],
  ['PD4', 'Koszty niestanowiące kosztów uzyskania przychodów – różnica trwała (art. 16 ustawy o CIT)', 'PD'], ['PD4_1', 'Koszty związane z przychodami PD1_1', 'PD'], ['PD4_2', 'Koszty związane z przychodami PD1_2', 'PD'], ['PD4_3', 'Koszty związane z dochodami wolnymi PD1_3', 'PD'],
  ['PD5', 'Koszty nieuznawane za KUP w roku bieżącym – różnica przejściowa (np. rezerwy, niezapłacone wynagrodzenia / ZUS, odsetki naliczone)', 'PD'],
  ['PD6_PB', 'KUP roku bieżącego ujęte w księgach lat ubiegłych (konto pozabilansowe)', 'PD'],
];
const DESC = Object.fromEntries(DICT.map(([c, d]) => [c, d]));

// ---------- reguły: numer konta (zespół / syntetyka) + słowa w nazwie ----------
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/\s+/g, ' ').trim();
// [numer (początek syntetyki), słowa kluczowe (fragmenty nazwy), S_12_1, S_12_2?, opis powodu]
const R = [
  // zespół 0
  ['010', ['grunt', 'uzytkowanie wieczyste'], 'BAAII1a_W'], ['010', ['budyn', 'lokal', 'obiekt'], 'BAAII1b_W'], ['010', ['maszyn', 'urzadzen', 'komputer', 'sprzet'], 'BAAII1c_W'],
  ['010', ['samochod', 'transport', 'pojazd', 'auto'], 'BAAII1d_W'], ['010', ['inne srodki', 'wyposazen', 'meble'], 'BAAII1e_W'], ['010', ['srodki trwale'], 'BAAII1e_W'],
  ['020', ['wartosci niematerialne', 'oprogramowan', 'licencj', 'wnip'], 'BAAI3_W'], ['020', ['wartosc firmy'], 'BAAI2_W'], ['020', ['prac rozwojowych'], 'BAAI1_W'],
  ['030', ['udzial', 'akcj'], 'BAAIV3c_ULA_W'], ['030', ['pozyczk'], 'BAAIV3c_UP_W'], ['030', ['nieruchomos'], 'BAAIV1_W'], ['030', ['dlugoterminowe aktywa', 'inwestycje dlugoterminowe'], 'BAAIV4_W'],
  ['070', ['budyn', 'lokal'], 'BAAII1b_U'], ['070', ['maszyn', 'urzadzen', 'komputer'], 'BAAII1c_U'], ['070', ['samochod', 'transport', 'pojazd'], 'BAAII1d_U'],
  ['070', ['inne srodki', 'wyposazen'], 'BAAII1e_U'], ['070', ['umorzeni', 'srodkow trwalych'], 'BAAII1e_U'], ['071', ['umorzeni', 'wnip', 'niematerialn'], 'BAAI3_U'], ['075', ['umorzeni', 'niematerialn'], 'BAAI3_U'],
  ['080', ['srodki trwale w budowie', 'inwestycje rozpoczete', 'w budowie'], 'BAAII2_W'], ['081', ['zaliczk'], 'BAAII3_W'],
  // zespół 1
  ['100', ['kasa', 'kasy'], 'BABIII1c1_SPKR'], ['101', ['kasa'], 'BABIII1c1_SPKR'],
  ['130', ['rachun', 'bank', 'biezac'], 'BABIII1c1_SPKR', 'BPBIII3a'], ['131', ['rachun', 'bank', 'biezac'], 'BABIII1c1_SPKR', 'BPBIII3a'], ['132', ['rachun', 'walut'], 'BABIII1c1_SPKR', 'BPBIII3a'],
  ['133', ['lokat'], 'BABIII1c2_ISP'], ['134', ['kredyt'], 'BPBIII3a'], ['135', ['vat', 'podzielon'], 'BABIII1c1_SPKR'], ['138', ['lokat', 'specjaln'], 'BABIII1c2_ISP'],
  ['139', ['w drodze', 'srodki pieniezne w drodze'], 'BABIII1c2_ISP'], ['140', ['krotkoterminowe aktywa', 'pozyczk', 'papiery'], 'BABIII1b_UP'], ['145', ['w drodze'], 'BABIII1c2_ISP'],
  // zespół 2
  ['200', ['odbiorc', 'naleznosci z tytulu dostaw'], 'BABII3a_D12', 'BPBIII3e'], ['201', ['odbiorc', 'dostawc', 'rozrachunki krajowe'], 'BABII3a_D12', 'BPBIII3d_D12'],
  ['202', ['dostawc', 'zobowiazania z tytulu dostaw'], 'BPBIII3d_D12', 'BABI5'], ['203', ['zagranicz', 'odbiorc', 'dostawc'], 'BABII3a_D12', 'BPBIII3d_D12'], ['204', ['dostawc', 'zagranicz'], 'BPBIII3d_D12', 'BABI5'],
  ['210', ['dostawc'], 'BPBIII3d_D12', 'BABI5'], ['220', ['budzet', 'publicznopraw'], 'BABII3bINN', 'BPBIII3g_INN'],
  ['221', ['vat'], 'BABII3bVAT', 'BPBIII3gVAT'], ['221', ['budzet', 'podatk'], 'BABII3bPOZ', 'BPBIII3gPOZ'], ['222', ['vat'], 'BABII3bVAT', 'BPBIII3gVAT'],
  ['222', ['pit', 'podatek dochodowy od osob fizycznych', 'zaliczk', 'pracownik'], 'BABII3bPOZ', 'BPBIII3gPOZ'], ['223', ['cit', 'osob prawnych', 'podatek dochodowy'], 'BABII3bPD', 'BPBIII3gPD'],
  ['224', ['pit', 'pracownik'], 'BABII3bPOZ', 'BPBIII3gPOZ'], ['225', ['zus', 'ubezpiecze'], 'BABII3bUSZ', 'BPBIII3gUSZ'], ['226', ['pfron'], 'BABII3bINN', 'BPBIII3g_INN'],
  ['227', ['urzad celny', 'cl'], 'BABII3bCLO', 'BPBIII3gCLO'], ['229', ['publicznopraw', 'inne'], 'BABII3bINN', 'BPBIII3g_INN'],
  ['230', ['wynagrodzen'], 'BABII3c', 'BPBIII3h'], ['231', ['wynagrodzen'], 'BABII3c', 'BPBIII3h'], ['234', ['pracownik', 'rozrachunki z pracownikami'], 'BABII3c', 'BPBIII3i'],
  ['240', ['pozostale rozrachunki', 'rozrachunki'], 'BABII3c', 'BPBIII3i'], ['245', ['wspolnik', 'udzialowc'], 'BABII3c', 'BPBIII3i'], ['249', ['wspolnik', 'udzialowc', 'czlonk', 'zarzad'], 'BABII3c', 'BPBIII3i'],
  ['250', ['pozyczk', 'kredyt'], 'BPBIII3a', 'BABIII1b_UP'], ['260', ['kredyt', 'pozyczk'], 'BPBIII3a'], ['240', ['leasing'], 'BPBIII3c'], ['248', ['sadow', 'sporn'], 'BABII3d'],
  ['290', ['odpis', 'aktualizuj'], 'BABII3a_A'],
  // zespół 3
  ['300', ['rozliczenie zakupu', 'zakup'], 'BABI4'], ['310', ['material'], 'BABI1'], ['330', ['towar'], 'BABI4'], ['340', ['odchylen', 'narzut', 'marza'], 'BABI4_O'], ['311', ['material'], 'BABI1'],
  // zespół 4 – koszty rodzajowe (wariant porównawczy)
  ['400', ['amortyzac'], 'RPBI'], ['401', ['zuzycie material', 'energi', 'material'], 'RPBII'], ['402', ['uslugi obce', 'usług'], 'RPBIII'], ['403', ['podatki', 'oplaty'], 'RPBIV_POZ'],
  ['404', ['wynagrodzen'], 'RPBV'], ['405', ['ubezpieczen', 'swiadczenia', 'zus'], 'RPBVI'], ['409', ['pozostale koszty', 'podroz', 'reprezentac', 'ubezpieczenia majatk'], 'RPBVII'],
  ['490', ['rozliczenie kosztow'], 'INNE'],
  // zespół 5 – wariant kalkulacyjny
  ['500', ['dzialalnosci podstawowej', 'koszty dzialalnosci'], 'RKBI_POZ'], ['520', ['sprzedazy'], 'RKD'], ['527', ['sprzedazy'], 'RKD'], ['550', ['zarzad'], 'RKE'],
  // zespół 6
  ['600', ['produkty gotowe', 'wyrob'], 'BABI3'], ['601', ['produkcj w toku', 'polprodukt'], 'BABI2'],
  ['640', ['rozliczenia miedzyokresowe kosztow czynne', 'czynne', 'koszty przyszlych'], 'BABIV'], ['641', ['czynne'], 'BABIV'],
  ['642', ['bierne', 'rezerw'], 'BPBI3_K'], ['645', ['bierne'], 'BPBI3_K'], ['650', ['przychod', 'przyszlych okresow'], 'BPBIV2_K'], ['840', ['przychod', 'przyszlych okresow', 'dotac'], 'BPBIV2_K'],
  // zespół 7
  ['700', ['sprzedaz', 'przychody ze sprzedazy', 'uslug', 'produkt'], 'RPAI_RKAI_POZ'], ['701', ['koszt', 'wlasny'], 'RKBI_POZ'], ['701', ['sprzedaz', 'uslug', 'przychod'], 'RPAI_RKAI_POZ'],
  ['702', ['sprzedaz', 'przychod'], 'RPAI_RKAI_POZ'], ['730', ['towar', 'material', 'sprzedaz'], 'RPAIV_RKAII_POZ'], ['731', ['wartosc sprzedanych', 'towar', 'koszt'], 'RPBVIII_RKBII_POZ'],
  ['732', ['wartosc sprzedanych', 'koszt'], 'RPBVIII_RKBII_POZ'], ['735', ['wartosc sprzedanych', 'towar'], 'RPBVIII_RKBII_POZ'],
  ['750', ['odsetk'], 'RPGII_RKJII_POZ'], ['750', ['roznic kursow', 'roznice kursowe'], 'RPGV_RKJV_RK'], ['750', ['przychody finansowe', 'finansow'], 'RPGV_RKJV_POZ'],
  ['751', ['odsetk'], 'RPHI_RKKI_POZ'], ['751', ['roznic kursow', 'roznice kursowe'], 'RPHIV_RKKIV_RK'], ['751', ['koszty finansowe', 'finansow', 'prowizj', 'leasing'], 'RPHIV_RKKIV_POZ'],
  ['760', ['sprzedaz srodk', 'rozchod', 'niefinansowych aktywow'], 'RPDI_RKGI_POZ'], ['760', ['dotac', 'dofinansow', 'subwencj'], 'RPDII_RKGII'], ['760', ['rozwiaz', 'odpis', 'aktualiz'], 'RPDIII_RKGIII_P'],
  ['760', ['pozostale przychody operacyjne', 'operacyjn', 'umorzen', 'odszkodowan', 'zaokraglen'], 'RPDIV_RKGIV_P'],
  ['761', ['sprzedaz srodk', 'rozchod', 'likwidac'], 'RPEI_RKHI_POZ'], ['761', ['odpis', 'aktualizuj', 'naleznosci'], 'RPEII_RKHII_N'], ['761', ['pozostale koszty operacyjne', 'operacyjn', 'kary', 'darowizn', 'zaokraglen'], 'RPEIII_RKHIII_P'],
  ['770', ['zyski nadzwyczajne'], 'RPDIV_RKGIV_P'], ['771', ['straty nadzwyczajne'], 'RPEIII_RKHIII_P'],
  // zespół 8
  ['800', ['kapital podstawowy', 'zakladowy', 'kapital'], 'BPAI'], ['801', ['zakladowy', 'podstawowy'], 'BPAI'], ['802', ['zapasowy'], 'BPAIIPZ'], ['803', ['rezerwowy'], 'BPAIV_INN'],
  ['804', ['aktualizacji wyceny'], 'BPAIII_INN'], ['810', ['zapasowy'], 'BPAIIPZ'], ['810', ['rezerwowy'], 'BPAIV_INN'], ['810', ['aktualizacji wyceny'], 'BPAIII_INN'],
  ['820', ['rozliczenie wyniku', 'lat ubieglych', 'wynik lat'], 'BPAV'], ['830', ['rozliczenie wyniku', 'lat ubieglych'], 'BPAV'], ['850', ['zfss', 'fundusz socjaln', 'fundusze specjalne'], 'BPBIII4'],
  ['851', ['zfss', 'socjaln'], 'BPBIII4'], ['840', ['rezerw'], 'BPBI3_K'], ['841', ['rezerw', 'odroczon'], 'BPBI1'], ['842', ['rezerw'], 'BPBI3_K'],
  ['860', ['wynik finansowy', 'wynik'], 'BPAVI'], ['870', ['podatek dochodowy', 'cit', 'obciazenia wyniku'], 'RPJ_RKM_B'], ['871', ['odroczon'], 'RPJ_RKM_O'],
  // zespół 9 – pozabilansowe
  ['9', ['pozabilans', 'ewidencj'], 'INNE'],
];
// sama nazwa (bez pasującego numeru) – słowa o dużej sile
const NAME_ONLY = [
  [['kasa'], 'BABIII1c1_SPKR'], [['rachunek bankowy', 'rachunek biezacy', 'rachunki bankowe'], 'BABIII1c1_SPKR', 'BPBIII3a'], [['lokat'], 'BABIII1c2_ISP'],
  [['odbiorc'], 'BABII3a_D12', 'BPBIII3e'], [['dostawc'], 'BPBIII3d_D12', 'BABI5'], [['vat nalezny', 'vat naliczony', 'rozrachunki z tytulu vat', 'podatek vat'], 'BABII3bVAT', 'BPBIII3gVAT'],
  [['zus', 'ubezpieczen spolecznych'], 'BABII3bUSZ', 'BPBIII3gUSZ'], [['podatek dochodowy od osob prawnych', 'cit-8', 'zaliczka cit'], 'BABII3bPD', 'BPBIII3gPD'],
  [['wynagrodzen'], 'BABII3c', 'BPBIII3h'], [['kredyt'], 'BPBIII3a'], [['leasing'], 'BPBIII3c'], [['amortyzac'], 'RPBI'], [['umorzeni'], 'BAAII1e_U'],
  [['zuzycie material', 'energi'], 'RPBII'], [['uslugi obce'], 'RPBIII'], [['podatki i oplaty'], 'RPBIV_POZ'], [['ubezpieczenia spoleczne', 'swiadczenia na rzecz pracownik'], 'RPBVI'],
  [['koszty ogolnego zarzadu'], 'RKE'], [['koszty sprzedazy'], 'RKD'], [['przychody ze sprzedazy towar', 'sprzedaz towar'], 'RPAIV_RKAII_POZ'], [['przychody ze sprzedazy', 'sprzedaz uslug', 'sprzedaz produkt'], 'RPAI_RKAI_POZ'],
  [['wartosc sprzedanych towar'], 'RPBVIII_RKBII_POZ'], [['dodatnie roznice kursowe'], 'RPGV_RKJV_RK'], [['ujemne roznice kursowe'], 'RPHIV_RKKIV_RK'],
  [['odsetki otrzymane', 'odsetki od lokat', 'przychody z odsetek'], 'RPGII_RKJII_POZ'], [['odsetki zaplacone', 'odsetki od kredyt', 'odsetki budzetowe', 'koszty odsetek'], 'RPHI_RKKI_POZ'],
  [['pozostale przychody operacyjne'], 'RPDIV_RKGIV_P'], [['pozostale koszty operacyjne'], 'RPEIII_RKHIII_P'], [['dotac'], 'RPDII_RKGII'],
  [['kapital zakladowy', 'kapital podstawowy'], 'BPAI'], [['kapital zapasowy'], 'BPAIIPZ'], [['wynik finansowy'], 'BPAVI'], [['towary'], 'BABI4'], [['materialy'], 'BABI1'],
  [['rozliczenia miedzyokresowe czynne'], 'BABIV'], [['rozliczenia miedzyokresowe bierne', 'rezerwy na koszty'], 'BPBI3_K'], [['zfss'], 'BPBIII4'],
];
// znacznik podatkowy (S_12_3) – tylko dla kont wynikowych (4, 5, 7) i pozabilansowych (9)
const PD_RULES = [
  [['nkup', 'niestanowiace kosztow', 'niestanowiace kup', 'nie stanowiace kosztow', 'niekup', 'reprezentac', 'kary umowne', 'kary i grzywny', 'grzywn', 'mandat', 'odsetki budzetowe', 'odsetki od zaleglosci podatkowych', 'pfron', 'darowizn', 'podatek dochodowy', 'koszty nkup'], 'PD4'],
  [['niezaplacon', 'nkup przejsciow', 'rezerw', 'naliczone odsetki', 'nieuznane w roku', 'przejsciow', 'odpis aktualizujacy', 'odpisy aktualizujace', 'wycena', 'zus pracodawcy niezaplac'], 'PD5'],
  [['niepodatkow', 'zwrot nadplaty', 'nie stanowiace przychodu', 'niestanowiace przychodu', 'rozwiazanie rezerw', 'rozwiazanie odpisu'], 'PD1_2'],
  [['zwolnion', 'wolne od podatku', 'strefa ekonomiczna', 'decyzja o wsparciu', 'sse'], 'PD1_3'],
  [['rolnicz', 'lesn'], 'PD1_1'],
  [['naliczone niezaplacone odsetki', 'odsetki naliczone', 'przychody nieopodatkowane w roku', 'dodatnie roznice kursowe niezrealizowane', 'niezrealizowane'], 'PD2'],
];

const synth = n => (String(n || '').match(/\d+/) || [''])[0];
const hits = (name, kws) => kws.filter(k => name.includes(k)).length;

// Propozycje dla jednego konta: lista { s1, s2, score, why }, PD i poziom pewności
export function suggest(numRaw, nameRaw) {
  const num = synth(numRaw), name = norm(nameRaw);
  const out = new Map();
  const add = (s1, s2, score, why) => { const k = s1 + '|' + (s2 || ''); const cur = out.get(k); if (!cur || cur.score < score) out.set(k, { s1, s2: s2 || '', score, why }); };
  for (const [pre, kws, s1, s2] of R) {
    const numOk = num && (pre.length === 1 ? num.startsWith(pre) : num.slice(0, 3) === pre || (num.length < 3 && pre.startsWith(num)));
    const k = name ? hits(name, kws) : 0;
    if (numOk && k) add(s1, s2, 7, `konto ${pre} + nazwa`);   // przy remisie wygrywa reguła wcześniejsza (bardziej szczegółowa)
    else if (numOk && !name) add(s1, s2, 3, `konto ${pre} (typowo)`);
    else if (numOk) add(s1, s2, 2, `konto ${pre} (typowo)`);
    else if (k && name.length > 2) add(s1, s2, 1 + k, 'nazwa konta');
  }
  for (const [kws, s1, s2] of NAME_ONLY) { const k = name ? hits(name, kws) : 0; if (k) add(s1, s2, 3 + k, 'nazwa konta'); }
  if (num.startsWith('9')) add('INNE', '', 9, 'konto pozabilansowe (zespół 9)');
  const all = [...out.values()].sort((a, b) => b.score - a.score);
  const list = all.filter((x, i) => i === 0 || (x.score >= 3 && x.score >= all[0].score - 3)).slice(0, 4);
  let pd = '';
  const resultAcc = /^([4579]|87)/.test(num) || (!num && list[0] && /^(RP|RK|INNE)/.test(list[0].s1));
  if (resultAcc && name) for (const [kws, code] of PD_RULES) if (hits(name, kws)) { pd = code; break; }
  if (num.startsWith('9') && /lat(ach)? ubieglych|poprzednich lat|lat poprzednich/.test(name)) pd = /przych/.test(name) ? 'PD3_PB' : 'PD6_PB';
  else if (pd && num.startsWith('9')) pd = { PD2: 'PD3_PB', PD5: 'PD6_PB' }[pd] || pd;
  const top = list[0];
  const level = !top ? 'brak' : top.score >= 7 ? 'wysoka' : top.score >= 4 ? 'średnia' : 'niska';
  return { list, pd, level };
}

// ---------- odczyt planu kont: .xlsx / .csv ----------
async function readSheet(file) {
  if (/\.csv$|\.txt$/i.test(file.name)) {
    const t = await file.text(); const sep = (t.split('\n')[0].match(/;/g) || []).length >= (t.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
    return t.split(/\r?\n/).filter(l => l.trim()).map(l => l.split(sep).map(x => x.replace(/^"|"$/g, '').trim()));
  }
  if (!/\.xlsx$/i.test(file.name)) throw new Error('Obsługiwane pliki: Excel .xlsx albo .csv (stary format .xls zapisz w Excelu jako .xlsx).');
  const files = await unzip(await file.arrayBuffer());
  const dec = new TextDecoder(); const get = n => { const f = files.find(x => x.name === n); return f ? dec.decode(f.data) : ''; };
  const P = s => new DOMParser().parseFromString(s, 'application/xml');
  const ss = [...P(get('xl/sharedStrings.xml')).getElementsByTagName('si')].map(si => [...si.getElementsByTagName('t')].map(t => t.textContent).join(''));
  const wbRels = P(get('xl/_rels/workbook.xml.rels')), wb = P(get('xl/workbook.xml'));
  const first = wb.getElementsByTagName('sheet')[0];
  const rid = first?.getAttribute('r:id') || first?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
  const target = [...wbRels.getElementsByTagName('Relationship')].find(r => r.getAttribute('Id') === rid)?.getAttribute('Target') || 'worksheets/sheet1.xml';
  const sheet = P(get('xl/' + target.replace(/^\/?xl\//, '').replace(/^\//, '')));
  const col = ref => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  return [...sheet.getElementsByTagName('row')].map(row => {
    const out = [];
    for (const c of row.getElementsByTagName('c')) {
      const t = c.getAttribute('t'), v = c.getElementsByTagName('v')[0]?.textContent ?? '';
      out[col(c.getAttribute('r') || 'A')] = t === 's' ? ss[+v] ?? '' : t === 'inlineStr' ? [...c.getElementsByTagName('t')].map(x => x.textContent).join('') : v;
    }
    return [...out].map(x => x ?? '');
  });
}
// kolumny: numer konta, nazwa, ewentualnie już nadany znacznik
function detect(rows) {
  const hi = rows.slice(0, 15).findIndex(r => r.some(c => /konto|numer|symbol|nr/i.test(c)) && r.some(c => /nazwa|opis/i.test(c)));
  if (hi >= 0) {
    const r = rows[hi].map(c => norm(c));
    const num = r.findIndex(c => /^(nr|numer|symbol|konto|nr konta|numer konta|symbol konta)$/.test(c) || /numer|symbol|^konto|nr konta/.test(c));
    const name = r.findIndex((c, i) => i !== num && /nazwa|opis/.test(c));
    const tag = r.findIndex(c => /znacznik|s_12|jpk/.test(c));
    return { start: hi + 1, num: num < 0 ? 0 : num, name: name < 0 ? 1 : name, tag };
  }
  // bez nagłówka: kolumna z numerami (cyfry/separatory) i kolumna z najdłuższym tekstem
  const sample = rows.slice(0, 40);
  const width = Math.max(...sample.map(r => r.length));
  let num = 0, name = 1, best = -1, bestLen = -1;
  for (let c = 0; c < width; c++) {
    const vals = sample.map(r => String(r[c] || '').trim()).filter(Boolean);
    const numeric = vals.filter(v => /^\d[\d\-./ ]*$/.test(v)).length;
    if (numeric > best) { best = numeric; num = c; }
  }
  for (let c = 0; c < width; c++) { if (c === num) continue; const len = sample.reduce((a, r) => a + String(r[c] || '').length, 0); if (len > bestLen) { bestLen = len; name = c; } }
  return { start: 0, num, name, tag: -1 };
}

// ---------- widok ----------
const HELP = `Narzędzie pomocnicze do nadawania znaczników kont w JPK_CIT (JPK_KR_PD):
• Wyszukiwarka: wpisz numer konta (np. 131, 402-01) albo nazwę lub jej część (np. „usługi obce”, „ZUS”, „różnice kursowe”) – pojawią się proponowane znaczniki.
• Plan kont z Excela: wczytaj plik .xlsx albo .csv z numerami i nazwami kont – aplikacja zaproponuje znacznik dla każdego konta. Wynik pobierzesz do Excela.
• S_12_1 – znacznik bilansu lub RZiS; S_12_2 – drugi znacznik (np. rozrachunki: strona aktywów i pasywów, rachunek bankowy z debetem); S_12_3 – znacznik podatkowy PD (konta wynikowe i pozabilansowe).
• Słownik dla jednostek pozostałych (ZOiS7, ustawa o rachunkowości) wg rozporządzenia MF w sprawie dodatkowych danych w księgach rachunkowych. Banki, ubezpieczyciele, fundusze, MSSF i jednostki z uproszczonymi wzorami mogą mieć inne słowniki.
• To podpowiedź, nie decyzja: sprawdź każdą propozycję z treścią konta i listą znaczników w programie księgowym. Plik zostaje na Twoim komputerze.`;

export async function renderZnaczniki(main, params = {}) {
  let rows = [];          // [{ num, name, tag, s }]
  const out = h('div');
  const q = h('input', { class: 'input', type: 'search', placeholder: 'Numer albo nazwa konta – np. 402, „usługi obce”, „rozrachunki z ZUS”…', style: { width: '100%' } });
  const res = h('div', { class: 'zn-res' });
  const chip = code => h('code', { class: 'zn-code', title: DESC[code] || '' }, code);
  const sugBox = (s) => s.list.length ? h('div', { class: 'zn-sug' }, ...s.list.map((x, i) => h('div', { class: 'zn-opt' + (i === 0 ? ' top' : '') },
    h('div', {}, chip(x.s1), x.s2 ? [' + ', chip(x.s2)] : null, h('span', { class: 'small muted' }, `  ${x.why}`)),
    h('div', { class: 'small' }, DESC[x.s1] || '', x.s2 ? h('span', { class: 'muted' }, ` · drugi znacznik (gdy saldo po drugiej stronie): ${DESC[x.s2] || ''}`) : null))),
    s.pd ? h('div', { class: 'zn-opt pd' }, h('div', {}, 'S_12_3: ', chip(s.pd)), h('div', { class: 'small' }, DESC[s.pd])) : null)
    : h('p', { class: 'hint' }, 'Brak propozycji – spróbuj innego słowa albo poszukaj w słowniku poniżej.');
  const drawSearch = () => {
    const v = q.value.trim();
    if (!v) { res.replaceChildren(); return; }
    const num = (v.match(/^\s*(\d[\d\-./ ]*)/) || [])[1] || '';
    const name = v.replace(num, '').trim();
    const s = suggest(num, name || (num ? '' : v));
    const nv = norm(v);
    const dictHits = DICT.filter(([c, d]) => norm(d).includes(nv) || c.toLowerCase().includes(nv.replace(/\s/g, ''))).slice(0, 12);
    res.replaceChildren(
      h('div', { class: 'card section' }, h('div', { class: 'section-head' }, h('h2', {}, 'Proponowane znaczniki'), h('span', { class: 'badge' }, `pewność: ${s.level}`)), sugBox(s)),
      dictHits.length ? h('div', { class: 'card section' }, h('div', { class: 'section-head' }, h('h2', {}, 'W słowniku')),
        h('table', { class: 'list' }, h('tbody', {}, ...dictHits.map(([c, d, g]) => h('tr', {}, h('td', { style: { whiteSpace: 'nowrap' } }, chip(c)), h('td', {}, d), h('td', { class: 'small muted' }, g)))))) : null);
  };
  let t; q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(drawSearch, 150); });

  const input = h('input', { type: 'file', accept: '.xlsx,.csv,.txt', hidden: true, onchange: () => { load(input.files[0]); input.value = ''; } });
  const zone = h('div', { class: 'tk-drop' },
    h('div', {}, h('b', {}, 'Plan kont z Excela'), h('span', { class: 'muted' }, ' · .xlsx albo .csv: numer i nazwa konta (opcjonalnie kolumna ze znacznikiem) · plik zostaje na Twoim komputerze')),
    h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: () => input.click() }, icon('plus'), 'Wybierz plik'), input);
  ['dragenter', 'dragover'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.remove('over'); }));
  zone.addEventListener('drop', e => load(e.dataTransfer?.files?.[0]));

  let fileName = '';
  async function load(file) {
    if (!file) return;
    try {
      const all = await readSheet(file);
      const d = detect(all);
      rows = all.slice(d.start).map(r => ({ num: String(r[d.num] ?? '').trim(), name: String(r[d.name] ?? '').trim(), tag: d.tag >= 0 ? String(r[d.tag] ?? '').trim() : '' }))
        .filter(r => r.num || r.name).filter(r => /\d/.test(r.num) || r.name.length > 2);
      rows.forEach(r => { r.s = suggest(r.num, r.name); });
      fileName = file.name.replace(/\.[^.]+$/, '');
      if (!rows.length) return toast('Nie znalazłem kont w pliku – pierwsza kolumna: numer konta, druga: nazwa.', true);
      toast(`Wczytano ${rows.length} kont – sprawdź propozycje`);
      draw();
    } catch (e) { console.error(e); toast('Nie udało się odczytać pliku: ' + (e.message || e), true); }
  }
  let filter = '';
  function draw() {
    if (!rows.length) { out.replaceChildren(); return; }
    const cnt = { wysoka: 0, 'średnia': 0, niska: 0, brak: 0 }; rows.forEach(r => cnt[r.s.level]++);
    const shown = rows.filter(r => !filter || r.s.level === filter || (filter === 'inny' && r.tag && r.s.list[0] && r.tag.toUpperCase() !== r.s.list[0].s1.toUpperCase()));
    const fbtn = (k, l) => h('button', { type: 'button', class: 'zl-chip' + (filter === k ? ' on' : ''), onclick: () => { filter = filter === k ? '' : k; draw(); } }, l);
    const diff = rows.filter(r => r.tag && r.s.list[0] && r.tag.toUpperCase() !== r.s.list[0].s1.toUpperCase()).length;
    out.replaceChildren(h('section', { class: 'card section' },
      h('div', { class: 'section-head' }, h('h2', {}, `Plan kont: ${rows.length} kont`),
        h('button', { class: 'btn btn-outline btn-sm', onclick: exportX }, icon('download'), 'Pobierz Excel')),
      h('div', { class: 'zl-chips', style: { marginBottom: '10px' } }, fbtn('', 'Wszystkie'), fbtn('wysoka', `Pewne ${cnt.wysoka}`), fbtn('średnia', `Do sprawdzenia ${cnt['średnia']}`),
        fbtn('niska', `Niepewne ${cnt.niska}`), fbtn('brak', `Bez propozycji ${cnt.brak}`), diff ? fbtn('inny', `Inny niż w pliku ${diff}`) : null),
      h('div', { class: 'zn-scroll' }, h('table', { class: 'list zn-tbl' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Konto'), h('th', {}, 'Nazwa'), rows.some(r => r.tag) ? h('th', {}, 'W pliku') : null, h('th', {}, 'S_12_1'), h('th', {}, 'S_12_2'), h('th', {}, 'S_12_3 (PD)'), h('th', {}, 'Pewność'), h('th', {}, 'Inne propozycje'))),
        h('tbody', {}, ...shown.slice(0, 1500).map(r => {
          const [a, ...rest] = r.s.list;
          return h('tr', { class: 'zn-' + r.s.level.replace('ś', 's') },
            h('td', { style: { whiteSpace: 'nowrap', fontWeight: 600 } }, r.num), h('td', {}, r.name),
            rows.some(x => x.tag) ? h('td', {}, r.tag ? chip(r.tag) : '') : null,
            h('td', {}, a ? chip(a.s1) : h('span', { class: 'muted' }, '—')), h('td', {}, a?.s2 ? chip(a.s2) : ''), h('td', {}, r.s.pd ? chip(r.s.pd) : ''),
            h('td', { class: 'small' }, r.s.level), h('td', { class: 'small' }, ...rest.map(x => h('span', { style: { marginRight: '6px' } }, chip(x.s1)))));
        })))),
      shown.length > 1500 ? h('p', { class: 'hint' }, `Pokazano 1500 z ${shown.length} – pełna lista w pliku Excel.`) : null));
  }
  function exportX() {
    const head = ['Konto', 'Nazwa konta', 'Znacznik w pliku', 'Proponowany S_12_1', 'Opis S_12_1', 'Proponowany S_12_2', 'Proponowany S_12_3 (PD)', 'Pewność', 'Inne propozycje', 'Uwaga'];
    downloadXlsx(`${fileName || 'plan_kont'}_znaczniki_propozycja.xlsx`, [{ name: 'Znaczniki – propozycja', cols: [12, 40, 16, 20, 44, 18, 16, 10, 30, 30],
      rows: [head.map(v => ({ v, s: 'header' })), ...rows.map(r => {
        const [a, ...rest] = r.s.list;
        return [r.num, r.name, r.tag, a?.s1 || '', a ? DESC[a.s1] || '' : '', a?.s2 || '', r.s.pd, r.s.level, rest.map(x => x.s1).join(', '), 'propozycja pomocnicza – do weryfikacji'];
      })] },
      { name: 'Słownik', cols: [22, 80, 10], rows: [['Kod', 'Opis', 'Grupa'].map(v => ({ v, s: 'header' })), ...DICT.map(([c, d, g]) => [c, d, g])] }]);
  }

  main.replaceChildren(
    params.back ? h('a', { href: params.back, class: 'small', style: { fontWeight: 600, textDecoration: 'none' } }, '← Dokumenty') : '',
    h('div', { class: 'page-head', style: params.back ? { marginTop: '10px' } : null }, h('div', {},
      h('h1', { style: { marginTop: '6px', display: 'flex', alignItems: 'center' } }, 'Znaczniki JPK CIT – podpowiedzi', infoTip(HELP, 'Znaczniki JPK CIT – instrukcja')),
      h('p', { class: 'sub' }, 'Propozycje znaczników kont dla JPK_KR_PD na podstawie numeru i nazwy konta – z wyszukiwarki albo z planu kont w Excelu.'))),
    h('div', { class: 'zn-warn' }, h('b', {}, 'Narzędzie pomocnicze. '), 'Propozycje są automatyczne (zasady typowego planu kont i słowa w nazwie konta). Przed wpisaniem do programu księgowego sprawdź każdy znacznik z treścią ekonomiczną konta i aktualnym słownikiem w programie. Słownik: jednostki pozostałe (ZOiS7); trwają prace MF nad nowymi znacznikami PD.'),
    h('section', { class: 'card section' }, h('div', { class: 'section-head' }, h('h2', {}, 'Wyszukaj znacznik')), q), res,
    zone, out);
  setTimeout(() => q.focus(), 50);
}
