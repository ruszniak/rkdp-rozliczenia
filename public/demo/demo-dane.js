// Wersja demonstracyjna aplikacji (rozliczenia.rkdp.pl/demo/) – WYŁĄCZNIE FIKCYJNE DANE generowane w przeglądarce.
// Nic nie łączy się z prawdziwą bazą; zmiany trwają do odświeżenia strony.
(function () {
  // ---- osobna „pamięć przeglądarki” dla wersji demo (żeby nie mieszała się z prawdziwą aplikacją na tym samym adresie) ----
  try {
    const SP = Storage.prototype, P = 'demo:', g = SP.getItem, set = SP.setItem, rm = SP.removeItem;
    SP.getItem = function (k) { return g.call(this, P + k); };
    SP.setItem = function (k, v) { return set.call(this, P + k, v); };
    SP.removeItem = function (k) { return rm.call(this, P + k); };
    ['getItem', 'setItem', 'removeItem'].forEach(k => { try { rm.call(localStorage, k); rm.call(sessionStorage, k); } catch { /* */ } });
  } catch { /* tryb prywatny */ }
  window.RKDP_CONFIG = { supabaseUrl: 'https://demo.invalid', supabaseAnonKey: 'demo' };
  window.RKDP_DEMO = true;

  // ---- generator pseudolosowy (stały – za każdym razem te same dane) ----
  let seed = 20261029;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const pick = a => a[Math.floor(rnd() * a.length)];
  const uuid = () => crypto.randomUUID();
  const now = new Date();
  const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const daysAgo = (n, h = 10) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(h, (n * 7) % 60, 0, 0); return d.toISOString(); };
  const addDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
  const per = k => { const d = new Date(now.getFullYear(), now.getMonth() - k, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };
  const nip = n => { const b = String(7770000000 + n * 104729).slice(0, 9); const w = [6, 5, 7, 2, 3, 4, 5, 6, 7]; let s = 0; for (let k = 0; k < 9; k++) s += +b[k] * w[k]; const c = s % 11; return c === 10 ? nip(n + 1) : b + c; };

  // ---- zespół (fikcyjny) ----
  const T = [
    { id: 'demo-anna', email: 'demo@przyklad.pl', full_name: 'Anna Kowalska', short_name: 'Anna', role: 'admin', modules: ['rozliczenia', 'doradztwo'], job_title: 'Doradca podatkowy', attendance: true },
    { id: 'demo-kasia', email: 'k.wisniewska@przyklad.pl', full_name: 'Katarzyna Wiśniewska', short_name: 'Kasia', role: 'full', modules: ['rozliczenia'], job_title: 'Główna księgowa', attendance: true },
    { id: 'demo-tomek', email: 't.zielinski@przyklad.pl', full_name: 'Tomasz Zieliński', short_name: 'Tomek', role: 'limited', modules: ['rozliczenia'], job_title: 'Księgowy', attendance: true },
    { id: 'demo-magda', email: 'm.lis@przyklad.pl', full_name: 'Magdalena Lis', short_name: 'Magda', role: 'full', modules: ['rozliczenia'], job_title: 'Specjalistka ds. kadr i płac', attendance: true },
    { id: 'demo-piotr', email: 'p.mazur@przyklad.pl', full_name: 'Piotr Mazur', short_name: 'Piotr', role: 'full', modules: ['doradztwo'], job_title: 'Doradca podatkowy', attendance: false },
  ].map(m => ({ active: true, created_at: daysAgo(200), license_no: null, avatar: null, ...m }));
  const ACC = ['demo-kasia', 'demo-tomek', 'demo-anna'], HR = 'demo-magda';

  const task_types = [
    ['saldeo', 'Saldeo', 10, 'always', 'ksiegowosc', 'Czy klient zatwierdził dokumenty w Saldeo', true],
    ['ksiegowanie', 'Księgowanie', 20, 'always', 'ksiegowosc', 'Czy dokumenty zostały zaksięgowane', true],
    ['pit_cit', 'PIT / CIT', 30, 'income_tax', 'ksiegowosc', 'Czy podatek dochodowy został podany klientowi', true],
    ['vat', 'VAT', 40, 'vat_return', 'ksiegowosc', 'Czy kwota VAT została podana klientowi', true],
    ['jpk', 'JPK VAT', 50, 'jpk', 'ksiegowosc', 'Czy plik JPK_V7 został wysłany', true],
    ['wb', 'Wyciągi bankowe', 60, 'always', 'ksiegowosc', 'Czy wyciągi bankowe zostały zaksięgowane', false],
    ['zus_podany', 'ZUS podany', 110, 'zus', 'kadry', 'Czy kwota składek ZUS została podana klientowi', true],
    ['pit4', 'PIT-4 podany', 120, 'payroll', 'kadry', 'Czy zaliczka PIT-4 została podana klientowi', true],
    ['zus_wyslany', 'ZUS wysłany', 130, 'zus', 'kadry', 'Czy deklaracja ZUS DRA została wysłana', true],
  ].map(([code, label, sort, rule, area, description, counts]) => ({ code, label, sort, rule, active: true, area, applies_to: code === 'wb' ? 'kapitalowe' : 'all', description, counts_to_settled: counts }));

  // ---- klienci (fikcyjni) ----
  const FN = ['Adam', 'Barbara', 'Cezary', 'Dorota', 'Emil', 'Ewa', 'Grzegorz', 'Halina', 'Igor', 'Joanna', 'Krzysztof', 'Lidia', 'Marek', 'Natalia', 'Oskar', 'Paulina', 'Robert', 'Sylwia', 'Wojciech', 'Zuzanna'];
  const LN = ['Nowicki', 'Zawadzka', 'Wójcik', 'Kamińska', 'Lewicki', 'Dąbek', 'Kozłowski', 'Jasińska', 'Mazurek', 'Krawiec', 'Piotrowicz', 'Grabska', 'Pawlik', 'Michalak', 'Królik', 'Wieczorek', 'Jabłońska', 'Wróblewski', 'Majka', 'Olszak', 'Stępniak', 'Malinowska', 'Sikora', 'Baran', 'Duda', 'Szulc', 'Kubiak', 'Czarnecka'];
  const CO = ['Alfa Bud', 'Beta Logistyka', 'Cortex Medical', 'Delta Instal', 'Eko Ogrody', 'Fenix Studio', 'Granit Development', 'Horyzont Trans', 'Iskra Elektro', 'Jantar Gastro', 'Lumen Beauty', 'Meblex Produkcja', 'Nova Dental', 'Orbita IT', 'Panorama Nieruchomości', 'Rubin Catering', 'Sigma Consulting', 'Uniwersum Druk', 'Wektor Automatyka', 'Zenit Motors'];
  const STREETS = ['Kwiatowa', 'Lipowa', 'Słoneczna', 'Polna', 'Leśna', 'Ogrodowa', 'Klonowa', 'Brzozowa', 'Spacerowa', 'Kolejowa'];
  const CITIES = [['Wrocław', '50-'], ['Siechnice', '55-011'], ['Kobierzyce', '55-040'], ['Oława', '55-200'], ['Wrocław', '53-'], ['Trzebnica', '55-100']];
  const clients = [];
  let co = 0;
  for (let i = 0; i < 46; i++) {
    const company = i % 5 === 1 || i % 7 === 3;
    const form = company ? (i % 11 === 3 ? 'spolka_komandytowa' : 'spzoo') : (i % 13 === 5 ? 'spolka_cywilna' : 'jdg');
    const city = pick(CITIES);
    const kap = ['spzoo'].includes(form);
    const name = form === 'jdg' ? `${pick(LN)} ${pick(FN)}` : form === 'spolka_cywilna' ? `${CO[co++ % CO.length]} s.c. ${pick(LN)}, ${pick(LN)}` : `${CO[co++ % CO.length]}${form === 'spzoo' ? ' sp. z o.o.' : ' sp.k.'}`;
    const emp = rnd() < (kap ? 0.7 : 0.3);
    const vat = rnd() < 0.15 ? 'zwolniony_podmiotowo' : rnd() < 0.25 ? 'czynny_kwartalny' : 'czynny_miesieczny';
    clients.push({
      id: uuid(), name, status: i === 44 ? 'zawieszony' : i === 45 ? 'zakonczony' : 'aktywny', legal_form: form,
      bookkeeping: kap || form === 'spolka_komandytowa' ? 'pelna' : rnd() < 0.4 ? 'ryczalt' : 'kpir',
      nip: nip(i + 3), regon: String(380000000 + i * 37), krs: kap || form === 'spolka_komandytowa' ? String(900000 + i * 13).padStart(10, '0') : null,
      address: `ul. ${pick(STREETS)} ${1 + (i * 7) % 60}, ${city[1].length > 3 ? city[1] : city[1] + String(100 + i * 3).slice(0, 3)} ${city[0]}`,
      contact_person: form === 'jdg' ? null : `${pick(FN)} ${pick(LN)}`, email: `kontakt${i + 1}@przyklad.pl`, phone: `600 ${String(200 + i * 3).padStart(3, '0')} ${String(100 + i * 7).slice(-3)}`,
      docs_channel: 'saldeo', vat_status: vat, vat_ue: rnd() < 0.2, cash_register: !kap && rnd() < 0.25,
      pit_form: kap ? null : rnd() < 0.4 ? 'liniowy' : rnd() < 0.5 ? 'ryczalt' : 'skala', pit_advances: kap ? null : rnd() < 0.2 ? 'kwartalne' : 'miesieczne',
      ryczalt_rates: null, zus_type: kap ? null : pick(['pelny', 'pelny', 'preferencyjny', 'maly_zus_plus', 'zbieg_etat']), zus_sickness: false,
      cit_type: kap ? (rnd() < 0.3 ? 'estonski' : rnd() < 0.5 ? 'maly_podatnik_9' : 'zwykly_19') : null, cit_advances: kap ? 'miesieczne' : null,
      fiscal_year: 'kalendarzowy', has_employees: emp, employees_count: emp ? 1 + Math.floor(rnd() * 14) : 0, ppk: emp && rnd() < 0.3,
      ksef_access: true, contract_signed: true, contract_date: iso(new Date(2025, i % 12, 1 + (i % 27))), monthly_fee: kap ? 900 + (i % 6) * 150 : 350 + (i % 5) * 80,
      upl1: true, zus_pel: true, crbr_reported: kap ? true : null, notes: null, created_at: daysAgo(300 - i), updated_at: daysAgo(10),
      accountant_id: ACC[i % 3], hr_id: emp ? HR : null,
    });
  }
  clients.forEach(c => { if (c.bookkeeping === 'ryczalt') c.pit_form = 'ryczalt'; if (c.pit_form === 'ryczalt') { c.bookkeeping = 'ryczalt'; c.ryczalt_rates = pick(['8,5%', '12%', '15%', '3%']); } });
  const act = clients.filter(c => c.status === 'aktywny');

  // ---- kratki rozliczeń: 7 miesięcy ----
  const applies = (c, t) => {
    const kap = ['spzoo', 'spolka_akcyjna'].includes(c.legal_form);
    if (t.code === 'wb') return kap || c.bookkeeping === 'pelna';
    if (t.rule === 'vat_return' || t.rule === 'jpk') return c.vat_status?.startsWith('czynny');
    if (t.rule === 'payroll') return c.has_employees;
    if (t.rule === 'zus') return c.has_employees || ['pelny', 'preferencyjny', 'maly_zus_plus'].includes(c.zus_type);
    return true;
  };
  const checklist_entries = [], audit_log = [];
  let aid = 1;
  for (let k = 7; k >= 0; k--) {
    const p = per(k);
    act.forEach((c, ci) => task_types.forEach((t, ti) => {
      let st;
      if (!applies(c, t)) st = 'na';
      else if (k >= 2) st = (ci + ti + k) % 29 === 0 ? 'todo' : 'done';
      else if (k === 1) { const r = (ci * 7 + ti * 3) % 20; st = r < 13 ? 'done' : r < 15 ? 'missing_docs' : r < 16 ? 'reminded' : 'todo'; }
      else { const r = (ci * 5 + ti) % 10; st = r < 2 ? 'done' : 'todo'; }
      const who = t.area === 'kadry' ? HR : c.accountant_id;
      const e = { id: uuid(), client_id: c.id, period: p, task_code: t.code, status: st, assignee_id: who, updated_by: who, updated_at: daysAgo(k * 30 + (ci % 9)) };
      checklist_entries.push(e);
      if (k === 1 && st !== 'na' && st !== 'todo' && ci % 3 === 0) audit_log.push({ id: aid++, at: daysAgo(3 + (ci % 9), 9 + (ti % 8)), actor: T.find(m => m.id === who).email, table_name: 'checklist_entries', client_id: c.id, period: p, action: 'update', detail: { task_code: t.code, status: { z: 'todo', na: st } } });
    }));
  }

  // ---- rozmowy: uwagi, pytania, zadania ----
  const UW = ['Zaimportować faktury sprzedażowe z KSeF', 'Klient dośle wyciągi bankowe do piątku', 'Sprawdzić korektę faktury od dostawcy', 'Brak umowy leasingu – poprosić klienta', 'Zaksięgowane, czekamy na zatwierdzenie w Saldeo', 'Nowy pracownik od 1-go – zgłoszenie do ZUS', 'Faktura zaliczkowa – rozliczyć w kolejnym miesiącu', 'Klient zmienia formę opodatkowania od stycznia'];
  const PY = ['Jak ująć fakturę za samochód w leasingu – 50% czy 100% VAT?', 'Czy koszt szkolenia wspólnika jest kosztem spółki?', 'Faktura bez NIP nabywcy – czy możemy odliczyć VAT?', 'Czy ulga na powrót przysługuje od tego miesiąca?'];
  const period_comments = [];
  act.slice(0, 26).forEach((c, i) => {
    const p1 = per(1), author = i % 4 === 0 ? 'demo-anna' : c.accountant_id;
    period_comments.push({ id: uuid(), client_id: c.id, period: p1, kind: 'uwaga', body: UW[i % UW.length], author, created_at: daysAgo(1 + (i % 12), 9 + (i % 7)), resolved_at: i % 3 === 0 ? daysAgo(i % 5) : null, resolved_by: i % 3 === 0 ? author : null, parent_id: null, pinned: false, mentions: [], history: [], deleted_at: null });
    if (i % 4 === 1) period_comments.push({ id: uuid(), client_id: c.id, period: p1, kind: 'pytanie', body: PY[i % PY.length], author: c.accountant_id, created_at: daysAgo(2 + (i % 6), 13), resolved_at: null, parent_id: null, pinned: false, mentions: ['demo-anna'], history: [], deleted_at: null });
    if (i % 6 === 2) period_comments.push({ id: uuid(), client_id: c.id, period: p1, kind: 'uwaga', body: 'Faktury kosztowe przychodzą zawsze z opóźnieniem – przypominać do 5. dnia miesiąca', author: 'demo-kasia', created_at: daysAgo(40), resolved_at: null, parent_id: null, pinned: true, mentions: [], history: [], deleted_at: null });
  });
  period_comments.filter(x => x.kind === 'pytanie').slice(0, 3).forEach((q, k) => period_comments.push({ id: uuid(), client_id: q.client_id, period: q.period, kind: 'uwaga', body: ['Przy leasingu operacyjnym 50% VAT, jeśli auto jest też używane prywatnie. Proszę dopytać klienta o VAT-26.', 'Tak, jeżeli szkolenie jest związane z działalnością spółki – podstawa: art. 15 ust. 1 ustawy o CIT.', 'Nie odliczamy – poprosić o fakturę korygującą z NIP.'][k], author: 'demo-anna', parent_id: q.id, created_at: new Date(Date.parse(q.created_at) + 3600e3).toISOString(), resolved_at: null, pinned: false, mentions: [], history: [], deleted_at: null }));
  const period_notes = [];
  for (const c of act) {
    const top = period_comments.filter(x => x.client_id === c.id && !x.parent_id && x.period === per(1));
    if (!top.length) continue;
    const n = top.filter(x => x.kind === 'uwaga' && !x.resolved_at).map(x => x.body).join('\n') || null, q = top.filter(x => x.kind === 'pytanie' && !x.resolved_at).map(x => x.body).join('\n') || null;
    period_notes.push({ client_id: c.id, period: per(1), notes: n, questions: q, updated_by: 'system', updated_at: daysAgo(1) });
  }
  const TK = [['Korekta deklaracji VAT za poprzedni miesiąc', 'korekta', 'pilny', -2, 'w_toku'], ['Brak faktur kosztowych – poprosić klienta', 'dokumenty', 'normalny', 1, 'czeka'], ['Odpowiedź na wezwanie z urzędu skarbowego', 'urzad', 'wysoki', 3, 'nowe'], ['Zgłoszenie nowego pracownika do ZUS', 'kadry', 'normalny', 5, 'nowe'], ['Aktualizacja danych w CEIDG', 'rejestr', 'niski', 14, 'zrobione'], ['Przygotować sprawozdanie finansowe za rok poprzedni', 'inne', 'wysoki', 20, 'w_toku'], ['Rozliczenie roczne PIT wspólników', 'inne', 'normalny', 9, 'nowe'], ['Wezwanie ZUS – różnica w składkach', 'urzad', 'pilny', 0, 'w_toku']];
  const rkdp_tickets = TK.map((r, i) => ({ id: uuid(), module: 'rkdp', no: i + 1, title: r[0], description: null, client_id: act[i * 3 + 1].id, period: per(1), category: r[1], priority: r[2], due_date: addDays(r[3]), status: r[4], assignee_id: [T[1], T[2], T[0], T[3], T[1], T[0], T[2], T[3]][i].id, created_by: i % 2 ? 'demo-anna' : 'demo-kasia', created_at: daysAgo(8 - i), updated_at: daysAgo(1), source: 'wątek klienta' }));
  rkdp_tickets.push({ id: uuid(), module: 'rkdp', no: 9, title: 'Zamówić nowy czytnik do podpisu kwalifikowanego', description: null, client_id: null, period: null, category: 'inne', priority: 'niski', due_date: addDays(10), status: 'nowe', assignee_id: 'demo-anna', created_by: 'demo-anna', created_at: daysAgo(2), updated_at: daysAgo(2), source: null });
  const rkdp_ticket_comments = [
    { id: uuid(), ticket_id: rkdp_tickets[1].id, author_id: 'demo-tomek', body: 'Napisałem do klienta, obiecał dosłać do jutra.', kind: 'komentarz', created_at: daysAgo(1, 11) },
    { id: uuid(), ticket_id: rkdp_tickets[0].id, author_id: 'demo-anna', body: 'Korekta przygotowana, do wysyłki po akceptacji klienta.', kind: 'komentarz', created_at: daysAgo(0, 9) },
  ];

  // ---- e-maile do klientów, obecność, czas pracy, prośby o dokumenty ----
  const client_messages = act.slice(2, 7).map((c, i) => ({ id: uuid(), client_id: c.id, kind: 'dokumenty', subject: 'Prośba o dokumenty za ' + new Date(per(1)).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' }), email: c.email, period: per(1), sent_at: daysAgo(3 + i, 10), sent_by: c.accountant_id, sender_name: T.find(m => m.id === c.accountant_id).full_name, status: 'wyslano', body: 'Dzień dobry,\n\nuprzejmie prosimy o przekazanie brakujących dokumentów za poprzedni miesiąc.\n\nPozdrawiamy', error: null }));
  const attendance = [];
  T.filter(m => m.attendance).forEach((m, k) => {
    for (let d = 1; d <= now.getDate(); d++) {
      const dt = new Date(now.getFullYear(), now.getMonth(), d); if ([0, 6].includes(dt.getDay())) continue;
      const kind = (d + k) % 13 === 0 ? 'urlop' : (d + k) % 5 === 0 ? 'zdalna' : 'praca', today = d === now.getDate();
      attendance.push({ id: `at${k}-${d}`, member_id: m.id, day: iso(dt), kind, start_time: kind === 'urlop' ? null : `0${7 + (k % 2)}:${k % 2 ? '30' : '55'}:00`, end_time: kind === 'urlop' || today ? null : `1${5 + (k % 2)}:${k % 2 ? '35' : '05'}:00`, break_min: kind === 'urlop' ? 0 : 15, note: null });
    }
  });
  const client_time = [];
  act.slice(0, 20).forEach((c, i) => [3, 9, 16, 23].slice(0, 1 + (i % 4)).forEach((d, k) => client_time.push({ id: uuid(), client_id: c.id, member_id: c.accountant_id, work_date: addDays(-d), minutes: 30 + ((i * 37 + k * 13) % 180), description: pick(['księgowanie', 'deklaracje VAT', 'rozmowa z klientem', 'kadry i płace']) })));
  const miss = checklist_entries.find(e => e.period === per(1) && e.status === 'missing_docs');
  const doc_requests = miss ? [{ id: uuid(), client_id: miss.client_id, period: per(1), token: 'd'.repeat(48), items: [{ code: miss.task_code, label: 'Faktury kosztowe' }], email: 'klient@przyklad.pl', created_at: daysAgo(4), expires_at: addDays(26) + 'T09:00:00Z', sent_at: daysAgo(4), files_count: 0, reminded_at: null, closed_at: null }] : [];

  // ---- M2 / doradztwo (fikcyjne sprawy) ----
  const MC = [['Granit Development sp. z o.o.', 'firma', 'abonament'], ['Ewa Zawadzka', 'osoba', 'godzinowa'], ['Orbita IT sp. z o.o.', 'firma', 'abonament'], ['Marek Pawlik', 'osoba', 'godzinowa'], ['Lumen Beauty sp. z o.o.', 'firma', 'godzinowa'], ['Biuro Rachunkowe Przykład sp. z o.o.', 'firma', 'abonament']];
  const m2_clients = MC.map(([name, kind, billing], i) => ({ id: uuid(), kind, name, nip: kind === 'firma' ? nip(300 + i) : null, regon: null, krs: kind === 'firma' ? String(950000 + i).padStart(10, '0') : null, address: `ul. ${STREETS[i]} ${i + 5}, 53-0${10 + i} Wrocław`, mail_address: null, email: `doradztwo${i + 1}@przyklad.pl`, phone: `601 ${300 + i} ${400 + i}`, contact_person: kind === 'firma' ? `${FN[i]} ${LN[i + 5]}` : null, industry: pick(['budowlana', 'IT', 'beauty', 'nieruchomości']), source: 'polecenie', billing_type: billing, hourly_rate: 450, subscription: billing === 'abonament' ? 'Doradztwo podatkowe (2 h / mies.)' : null, monthly_fee: billing === 'abonament' ? 900 : null, rate_notes: null, aml_verified_at: daysAgo(60), aml_risk: 'standardowe', beneficial_owner: null, aml_notes: null, status: 'aktywny', notes: null, created_by: 'demo-anna', created_at: daysAgo(120 - i * 10), updated_at: daysAgo(5) }));
  const MM = [['Kontrola podatkowa VAT za 2024 r.', 'kontrola_podatkowa', 'w_toku', 'VAT'], ['Interpretacja – sprzedaż działki budowlanej', 'interpretacja', 'oczekuje_organ', 'VAT'], ['Estoński CIT – analiza warunków', 'konsultacja', 'w_toku', 'CIT'], ['Odwołanie od decyzji – PIT 2022', 'odwolanie', 'nowa', 'PIT'], ['Czynności sprawdzające – JPK_V7', 'czynnosci_sprawdzajace', 'zakonczona', 'VAT']];
  const m2_orders = [], m2_matters = MM.map((r, i) => {
    const o = { id: uuid(), number: `Z/2026/0${10 + i}`, client_id: m2_clients[i].id, order_date: addDays(-40 + i * 6), subject: r[0], scope: null, fee_type: 'godzinowa', fee_amount: 450, fee_notes: null, payment_days: 7, term_text: null, extra_terms: null, signer_id: 'demo-sig-1', status: i < 3 ? 'podpisane' : 'projekt', doc_type: 'zlecenie', params: {}, created_by: 'demo-anna', created_at: daysAgo(40 - i * 6), updated_at: daysAgo(3) };
    m2_orders.push(o);
    return { id: uuid(), number: `S/2026/0${20 + i}`, order_id: o.id, client_id: m2_clients[i].id, title: r[0], matter_type: r[1], authority: i === 1 ? 'Dyrektor Krajowej Informacji Skarbowej' : 'Urząd Skarbowy', case_ref: i === 0 ? '0201-IOV.4103.15.2026' : null, tax_kind: r[3], tax_period: '2024', value_in_dispute: i === 0 ? 84500 : null, status: r[2], stage: null, lead_id: 'demo-anna', second_id: 'demo-piotr', assistant_id: null, poa_type: 'szczegolne', poa_date: addDays(-35 + i * 6), opened_at: addDays(-40 + i * 6), closed_at: r[2] === 'zakonczona' ? addDays(-3) : null, fee_type: 'godzinowa', fee_amount: 450, estimated_hours: 10 + i * 4, description: null, outcome: null, created_by: 'demo-anna', created_at: daysAgo(40 - i * 6), updated_at: daysAgo(2) };
  });
  const m2_deadlines = [
    { title: 'Zastrzeżenia do protokołu kontroli', kind: 'procesowy', d: 6, m: 0 }, { title: 'Spotkanie z klientem – omówienie protokołu', kind: 'spotkanie', d: 2, m: 0 },
    { title: 'Termin na wydanie interpretacji', kind: 'organ', d: 25, m: 1 }, { title: 'Przygotować analizę warunków estońskiego CIT', kind: 'wewnetrzny', d: 4, m: 2 }, { title: 'Odwołanie do DIAS', kind: 'procesowy', d: 9, m: 3 },
  ].map((x, i) => ({ id: uuid(), matter_id: m2_matters[x.m].id, client_id: m2_matters[x.m].client_id, title: x.title, kind: x.kind, due_date: addDays(x.d), due_time: x.kind === 'spotkanie' ? '10:00' : null, served_at: null, basis: null, assignee_id: i % 2 ? 'demo-piotr' : 'demo-anna', done: false, done_at: null, notes: null, created_by: 'demo-anna', created_at: daysAgo(10) }));
  const m2_journal = [{ id: uuid(), matter_id: m2_matters[0].id, entry_date: addDays(-12), kind: 'pismo_otrzymane', title: 'Upoważnienie do przeprowadzenia kontroli', body: null, author: 'demo-anna', created_at: daysAgo(12) }, { id: uuid(), matter_id: m2_matters[0].id, entry_date: addDays(-5), kind: 'czynnosc', title: 'Udział w czynnościach kontrolnych w siedzibie klienta', body: null, author: 'demo-piotr', created_at: daysAgo(5) }];
  const m2_time = m2_matters.slice(0, 4).flatMap((m, i) => [1, 2].map(k => ({ id: uuid(), matter_id: m.id, member_id: k === 1 ? 'demo-anna' : 'demo-piotr', work_date: addDays(-(i * 3 + k)), minutes: 45 + i * 30 + k * 15, description: pick(['analiza dokumentów', 'przygotowanie pisma', 'spotkanie z klientem', 'udział w kontroli']), billable: true, created_at: daysAgo(i * 3 + k) })));
  const m2_signers = [{ id: 'demo-sig-1', full_name: 'Anna Kowalska', title: 'Doradca podatkowy', license_no: '00001', role_label: 'Partner', active: true, sort: 1 }, { id: 'demo-sig-2', full_name: 'Piotr Mazur', title: 'Doradca podatkowy', license_no: '00002', role_label: 'Partner', active: true, sort: 2 }];

  window.MOCK_DATA = {
    team_members: T, clients, client_partners: [], client_assignments: act.filter(c => c.accountant_id === 'demo-tomek').map(c => ({ client_id: c.id, member_id: 'demo-tomek' })),
    task_types, checklist_entries, period_notes, audit_log, period_comments, rkdp_tickets, rkdp_ticket_comments, rkdp_ticket_templates: [], rkdp_ticket_files: [],
    app_settings: [{ key: 'mail_from', value: 'biuro@przyklad.pl' }], client_messages, attendance, client_time, doc_requests,
    m2_signers, m2_clients, m2_contacts: [], m2_matters, m2_deadlines, m2_journal, m2_time, m2_orders, m2_history: [], m2_offers: [],
    offers: [], shared_docs: [], member_profiles: [], member_private: [], member_prefs: [], period_files: [], client_files: [], fin_statements: [], thread_reads: [],
    year_close_entries: [], client_monitor: [], monitor_alerts: [], aml_cases: [], aml_checks: [], rkdp_protocols: [], terms_acceptances: [], auth_devices: [],
  };
})();
