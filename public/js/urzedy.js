// Urzędy skarbowe (woj. dolnośląskie) i inne organy KAS – do wyboru w pełnomocnictwach (UPL-1, PPS-1) i pismach.
// Nazwa = organ w mianowniku („Naczelnik Urzędu Skarbowego …”), tak jak wpisuje się go na formularzach i w adresie pisma.
// Adresy wg wykazu urzędów skarbowych (XI 2026) – przed wysyłką warto sprawdzić, czy urząd się nie przeniósł.
const US = [
  ['Pierwszego Urzędu Skarbowego we Wrocławiu', 'ul. Ks. Czesława Klimasa 34', '50-515 Wrocław'],
  ['Dolnośląskiego Urzędu Skarbowego we Wrocławiu', 'ul. Żmigrodzka 141', '51-130 Wrocław'],
  ['Urzędu Skarbowego Wrocław-Fabryczna', 'ul. Aleksandra Ostrowskiego 5', '53-238 Wrocław'],
  ['Urzędu Skarbowego Wrocław-Krzyki', 'ul. Sztabowa 100', '53-310 Wrocław'],
  ['Urzędu Skarbowego Wrocław-Psie Pole', 'ul. Trzebnicka 33', '50-231 Wrocław'],
  ['Urzędu Skarbowego Wrocław-Stare Miasto', 'ul. Inowrocławska 4', '53-654 Wrocław'],
  ['Urzędu Skarbowego Wrocław-Śródmieście', 'ul. marsz. Józefa Piłsudskiego 27-29', '50-044 Wrocław'],
  ['Urzędu Skarbowego w Bolesławcu', 'ul. Garncarska 10', '59-700 Bolesławiec'],
  ['Urzędu Skarbowego w Bystrzycy Kłodzkiej', 'ul. Adama Mickiewicza 5', '57-500 Bystrzyca Kłodzka'],
  ['Urzędu Skarbowego w Dzierżoniowie', 'ul. Pocztowa 14', '58-200 Dzierżoniów'],
  ['Urzędu Skarbowego w Głogowie', 'ul. Adama Mickiewicza 53', '67-200 Głogów'],
  ['Urzędu Skarbowego w Górze', 'ul. Poznańska 4', '56-200 Góra'],
  ['Urzędu Skarbowego w Jaworze', 'ul. Jurija Gagarina 5', '59-400 Jawor'],
  ['Urzędu Skarbowego w Jeleniej Górze', 'ul. Adama Thebesiusa 1', '58-506 Jelenia Góra'],
  ['Urzędu Skarbowego w Kamiennej Górze', 'ul. Papieża Jana Pawła II 18', '58-400 Kamienna Góra'],
  ['Urzędu Skarbowego w Kłodzku', 'ul. Stanisławy Walasiewiczówny 1', '57-300 Kłodzko'],
  ['Urzędu Skarbowego w Legnicy', 'ul. Wrocławska 37', '59-220 Legnica'],
  ['Urzędu Skarbowego w Lubaniu', 'ul. Stara 1', '59-800 Lubań'],
  ['Urzędu Skarbowego w Lubinie', 'ul. Marii Skłodowskiej-Curie 94', '59-300 Lubin'],
  ['Urzędu Skarbowego w Lwówku Śląskim', 'ul. Budowlanych 1', '59-600 Lwówek Śląski'],
  ['Urzędu Skarbowego w Miliczu', 'ul. Składowa 2', '56-300 Milicz'],
  ['Urzędu Skarbowego w Nowej Rudzie', 'ul. Kolejowa 23', '57-400 Nowa Ruda'],
  ['Urzędu Skarbowego w Oleśnicy', 'ul. Lwowska 34-38', '56-400 Oleśnica'],
  ['Urzędu Skarbowego w Oławie', 'ul. Lwowska 1', '55-200 Oława'],
  ['Urzędu Skarbowego w Polkowicach', 'ul. Zachodnia 10', '59-100 Polkowice'],
  ['Urzędu Skarbowego w Środzie Śląskiej', 'ul. Oławska 5A', '55-300 Środa Śląska'],
  ['Urzędu Skarbowego w Strzelinie', 'ul. Bolka I Świdnickiego 14', '57-100 Strzelin'],
  ['Urzędu Skarbowego w Świdnicy', 'ul. Marii Skłodowskiej-Curie 1-3', '58-100 Świdnica'],
  ['Urzędu Skarbowego w Trzebnicy', 'ul. Prusicka 2', '55-100 Trzebnica'],
  ['Urzędu Skarbowego w Wałbrzychu', 'ul. Uczniowska 21', '58-306 Wałbrzych'],
  ['Urzędu Skarbowego w Wołowie', 'ul. Tadeusza Kościuszki 17', '56-100 Wołów'],
  ['Urzędu Skarbowego w Ząbkowicach Śląskich', 'ul. Ludwika Waryńskiego 2A', '57-200 Ząbkowice Śląskie'],
  ['Urzędu Skarbowego w Zgorzelcu', 'ul. Bohaterów II Armii Wojska Polskiego 8B', '59-900 Zgorzelec'],
  ['Urzędu Skarbowego w Złotoryi', 'ul. Rynek 42', '59-500 Złotoryja'],
  ['Drugiego Urzędu Skarbowego Warszawa-Śródmieście', 'ul. Lindleya 14', '02-013 Warszawa'],
].map(([n, street, city]) => ({ name: 'Naczelnik ' + n, gen: 'Naczelnika ' + n, street, city }));

export const OFFICES = [
  ...US,
  { name: 'Dyrektor Izby Administracji Skarbowej we Wrocławiu', gen: 'Dyrektora Izby Administracji Skarbowej we Wrocławiu', street: 'ul. Powstańców Śląskich 24-26', city: '53-333 Wrocław' },
  { name: 'Naczelnik Dolnośląskiego Urzędu Celno-Skarbowego we Wrocławiu', gen: 'Naczelnika Dolnośląskiego Urzędu Celno-Skarbowego we Wrocławiu', street: 'ul. Stacyjna 10', city: '53-613 Wrocław' },
  { name: 'Dyrektor Krajowej Informacji Skarbowej', gen: 'Dyrektora Krajowej Informacji Skarbowej', street: 'ul. Teodora Sixta 17', city: '43-300 Bielsko-Biała' },
];
export const US_NAMES = US.map(o => o.name);
export const OFFICE_NAMES = OFFICES.map(o => o.name);
export const officeOf = name => OFFICES.find(o => o.name.toLowerCase() === String(name || '').trim().toLowerCase()) || null;
// adres do pisma: organ, ulica, kod i miejscowość
export const officeAddr = o => [o.name, o.street, o.city].join('\n');
