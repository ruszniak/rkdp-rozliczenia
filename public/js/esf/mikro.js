// e-Sprawozdanie finansowe jednostki mikro (wzór SFJMIZ(2), struktury MF 2025 – sprawozdania sporządzane od 01.01.2026).
// Czysty moduł (bez DOM): pozycje wzoru, dane domyślne, przeliczenie z JPK_KR_PD, kontrola i budowa pliku XML.
// Plik XML trzeba podpisać (kwalifikowany / zaufany / osobisty) i złożyć w eKRS – aplikacja tylko go przygotowuje.

export const NS = {
  tns: 'http://crd.gov.pl/wzor/2025/08/12/13821/',
  str: 'http://crd.gov.pl/xml/schematy/struktura/2009/11/16/',
  dtsf: 'http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2025/07/31/eD/StrukturyDanychSprFin/',
  jmi: 'http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2025/07/31/eD/JednostkaMikroStruktury/',
};

// [klucz XML, oznaczenie, nazwa, poziom, rodzic]
export const BILANS = [
  ['Aktywa_A', 'A.', 'Aktywa trwałe', 1, 'Aktywa'],
  ['Aktywa_B', 'B.', 'Aktywa obrotowe, w tym:', 1, 'Aktywa'],
  ['Aktywa_B_1', '–', 'zapasy', 2, 'Aktywa_B'],
  ['Aktywa_B_2', '–', 'należności krótkoterminowe', 2, 'Aktywa_B'],
  ['Aktywa_C', 'C.', 'Należne wpłaty na kapitał (fundusz) podstawowy', 1, 'Aktywa'],
  ['Aktywa_D', 'D.', 'Udziały (akcje) własne', 1, 'Aktywa'],
  ['Aktywa', '', 'Aktywa razem', 0, null],
  ['Pasywa_A', 'A.', 'Kapitał (fundusz) własny, w tym:', 1, 'Pasywa'],
  ['Pasywa_A_1', '–', 'kapitał (fundusz) podstawowy', 2, 'Pasywa_A'],
  ['Pasywa_B', 'B.', 'Zobowiązania i rezerwy na zobowiązania, w tym:', 1, 'Pasywa'],
  ['Pasywa_B_1', '–', 'rezerwy na zobowiązania', 2, 'Pasywa_B'],
  ['Pasywa_B_2', '–', 'zobowiązania z tytułu kredytów i pożyczek', 2, 'Pasywa_B'],
  ['Pasywa', '', 'Pasywa razem', 0, null],
];
export const RZIS = [
  ['A', 'A.', 'Przychody podstawowej działalności operacyjnej i zrównane z nimi, w tym:', 1],
  ['A_1', '–', 'zmiana stanu produktów (zwiększenie – wartość dodatnia, zmniejszenie – wartość ujemna)', 2],
  ['B', 'B.', 'Koszty podstawowej działalności operacyjnej', 1],
  ['B_I', 'I.', 'Amortyzacja', 2], ['B_II', 'II.', 'Zużycie materiałów i energii', 2],
  ['B_III', 'III.', 'Wynagrodzenia, ubezpieczenia społeczne i inne świadczenia', 2], ['B_IV', 'IV.', 'Pozostałe koszty', 2],
  ['C', 'C.', 'Pozostałe przychody i zyski, w tym:', 1], ['C_1', '–', 'aktualizacja wartości aktywów', 2],
  ['D', 'D.', 'Pozostałe koszty i straty, w tym:', 1], ['D_1', '–', 'aktualizacja wartości aktywów', 2],
  ['E', 'E.', 'Podatek dochodowy', 1],
  ['F', 'F.', 'Zysk/strata netto (A – B + C – D – E)', 1],
];
export const PID = [
  ['P_ID_1', 'A.', 'Zysk (strata) brutto za dany rok', 'kwota'],
  ['P_ID_2', 'B.', 'Przychody zwolnione z opodatkowania (trwałe różnice)', 'poz'],
  ['P_ID_3', 'C.', 'Przychody niepodlegające opodatkowaniu w roku bieżącym', 'poz'],
  ['P_ID_4', 'D.', 'Przychody podlegające opodatkowaniu w roku bieżącym, ujęte w księgach lat ubiegłych', 'poz'],
  ['P_ID_5', 'E.', 'Koszty niestanowiące kosztów uzyskania przychodów (trwałe różnice)', 'poz'],
  ['P_ID_6', 'F.', 'Koszty nieuznawane za koszty uzyskania przychodów w bieżącym roku', 'poz'],
  ['P_ID_7', 'G.', 'Koszty uznawane za koszty uzyskania przychodów w roku bieżącym, ujęte w księgach lat ubiegłych', 'poz'],
  ['P_ID_8', 'H.', 'Strata z lat ubiegłych', 'poz2'],
  ['P_ID_9', 'I.', 'Inne zmiany podstawy opodatkowania', 'poz'],
  ['P_ID_10', 'J.', 'Podstawa opodatkowania podatkiem dochodowym', 'kwota'],
  ['P_ID_11', 'K.', 'Podatek dochodowy', 'kwota'],
];
export const FORMY = { 17: 'spółka z ograniczoną odpowiedzialnością', 16: 'spółka akcyjna', PA: 'prosta spółka akcyjna', 20: 'spółka komandytowa', 21: 'spółka komandytowo-akcyjna', 18: 'spółka jawna', 15: 'spółka partnerska', 48: 'fundacja', 55: 'stowarzyszenie wpisane do KRS', FR: 'fundacja rodzinna', OG: 'osoba fizyczna prowadząca działalność gospodarczą', 19: 'spółka cywilna' };

export const TEKSTY = {
  p4: 'Sprawozdanie finansowe sporządzono zgodnie z ustawą o rachunkowości i załącznikiem nr 4 do ustawy – dla jednostek mikro. Jednostka korzysta z uproszczeń przewidzianych dla jednostek mikro: sporządza bilans i rachunek zysków i strat w uproszczonym zakresie, zamiast informacji dodatkowej przedstawia informacje uzupełniające do bilansu, nie sporządza zestawienia zmian w kapitale (funduszu) własnym ani rachunku przepływów pieniężnych, nie ustala aktywów i rezerw z tytułu odroczonego podatku dochodowego.',
  p6a: 'Wartości niematerialne i prawne oraz środki trwałe wycenia się według cen nabycia lub kosztu wytworzenia, pomniejszonych o odpisy amortyzacyjne. Amortyzacja naliczana jest metodą liniową według stawek przyjętych dla celów podatkowych; składniki o niskiej wartości odpisuje się jednorazowo w koszty. Należności i zobowiązania wycenia się w kwocie wymagającej zapłaty, z zachowaniem zasady ostrożności. Środki pieniężne wycenia się według wartości nominalnej. Zapasy wycenia się według cen nabycia nie wyższych od cen sprzedaży netto. Kapitały własne wycenia się w wartości nominalnej.',
  p6b: 'Wynik finansowy ustala się jako różnicę między przychodami a kosztami podstawowej działalności operacyjnej, z uwzględnieniem pozostałych przychodów i zysków, pozostałych kosztów i strat oraz podatku dochodowego. Rachunek zysków i strat sporządzono według wzoru dla jednostek mikro.',
  p6c: 'Sprawozdanie finansowe sporządzono w złotych, z dokładnością do grosza, zgodnie z wzorem określonym w załączniku nr 4 do ustawy o rachunkowości.',
  info: [
    'Jednostka nie posiada zobowiązań finansowych, w tym z tytułu dłużnych instrumentów finansowych, gwarancji i poręczeń lub zobowiązań warunkowych nieuwzględnionych w bilansie.',
    'Jednostka nie udzieliła zaliczek ani kredytów członkom organów administrujących, zarządzających i nadzorujących.',
    'Jednostka nie posiada udziałów (akcji) własnych. W roku obrotowym nie nabywała ani nie zbywała udziałów (akcji) własnych.',
  ],
};

const n2 = v => { const x = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(x) ? Math.round(x * 100) / 100 : 0; };
export const num = n2;

export function emptyData(year) {
  const y = Number(year) || new Date().getFullYear() - 1;
  const z = () => ({ a: 0, b: 0 });
  return {
    year: y, od: `${y}-01-01`, do: `${y}-12-31`, sporzadzenie: '',
    firma: { nazwa: '', nip: '', krs: '', forma: '17', woj: '', powiat: '', gmina: '', ulica: '', nrDomu: '', nrLokalu: '', miejscowosc: '', kod: '' },
    p2: { ograniczony: false, od: '', do: '' },
    p4: TEKSTY.p4, p5a: 1, p5b: 1, p5c: '',
    p6a: TEKSTY.p6a, p6b: TEKSTY.p6b, p6c: TEKSTY.p6c, p6d: '',
    p7: 0, p8: 2,
    bil: Object.fromEntries(BILANS.map(r => [r[0], z()])),
    rzis: Object.fromEntries(RZIS.map(r => [r[0], z()])),
    info: [...TEKSTY.info],
    cit: { on: false, ...Object.fromEntries(PID.map(r => [r[0], z()])) },
    zrodla: {},
  };
}

// sumy i wynik liczone z pozycji szczegółowych (pozycje „razem” nie są wpisywane ręcznie)
export function recompute(d) {
  for (const k of ['a', 'b']) {
    const B = d.bil, R = d.rzis;
    B.Aktywa[k] = n2(n2(B.Aktywa_A[k]) + n2(B.Aktywa_B[k]) + n2(B.Aktywa_C[k]) + n2(B.Aktywa_D[k]));
    B.Pasywa[k] = n2(n2(B.Pasywa_A[k]) + n2(B.Pasywa_B[k]));
    R.F[k] = n2(n2(R.A[k]) - n2(R.B[k]) + n2(R.C[k]) - n2(R.D[k]) - n2(R.E[k]));
  }
  return d;
}

// ---------- z JPK_KR_PD (funkcje z modułu jpk-fin przekazywane z zewnątrz, żeby ten plik był niezależny od DOM) ----------
export function fromJpk(d, m, fin) {
  const B0 = fin.buildBilans(m), S = fin.bilansSimple(B0, 'mikro');
  const ak = S.aktywa, pa = S.pasywa; // kolejność wierszy wzoru mikro w jpk-fin
  const setB = (key, row) => { d.bil[key] = { a: n2(row?.end), b: n2(row?.start) }; };
  setB('Aktywa_A', ak[0]); setB('Aktywa_B', ak[2]); setB('Aktywa_B_1', ak[3]); setB('Aktywa_B_2', ak[4]); setB('Aktywa_C', ak[5]); setB('Aktywa_D', ak[6]);
  setB('Pasywa_A', pa[0]); setB('Pasywa_A_1', pa[1]); setB('Pasywa_B', pa[2]); setB('Pasywa_B_1', pa[3]); setB('Pasywa_B_2', pa[4]);
  const variant = fin.hasVariant(m, 'RP') ? 'RP' : fin.hasVariant(m, 'RK') ? 'RK' : null;
  if (variant) {
    const R = fin.rzisSimple(fin.buildRzis(m, variant), 'mikro', variant).rows;
    const keys = variant === 'RP' ? ['A', 'A_1', 'B', 'B_I', 'B_II', 'B_III', 'B_IV', 'C', 'C_1', 'D', 'D_1', 'E', 'F'] : ['A', 'B', 'C', 'C_1', 'D', 'D_1', 'E', 'F'];
    keys.forEach((k, i) => { d.rzis[k].a = n2(R[i]?.v); });
    if (variant === 'RK') for (const k of ['A_1', 'B_I', 'B_II', 'B_III', 'B_IV']) d.rzis[k].a = 0;
  }
  const h = m.header || {}, s = m.subject || {};
  if (h.DataOd) d.od = h.DataOd; if (h.DataDo) { d.do = h.DataDo; d.year = Number(h.DataDo.slice(0, 4)); }
  d.firma.nip = d.firma.nip || s.NIP || '';
  d.firma.nazwa = d.firma.nazwa || s.PelnaNazwa || s.Nazwa || '';
  d.zrodla.jpk = { plik: m.fileName, wariant: variant, wynikBilans: n2(B0.unclosed), kiedy: new Date().toISOString() };
  return { variant, unclosed: n2(B0.unclosed), warnings: B0.warnings };
}

// ---------- z ubiegłorocznego sprawozdania (XML z Repozytorium KRS albo z aplikacji) ----------
// doc: Document z DOMParser. Kwoty roku bieżącego (KwotaA) tamtego sprawozdania = rok poprzedni (KwotaB) nowego.
export function fromPriorDoc(d, doc) {
  const by = (root, name) => [...root.getElementsByTagNameNS('*', name)];
  const kids = el => [...el.children];
  const sect = pre => [...doc.getElementsByTagNameNS('*', '*')].find(e => e.localName.startsWith(pre) && kids(e).some(c => /^(Aktywa|Pasywa|A|B|F)$/.test(c.localName)));
  const bil = sect('Bilans'), rz = sect('RZiS');
  const out = { bil: 0, rzis: 0, wzor: '', teksty: 0 };
  const kwA = el => { const k = kids(el).find(c => c.localName === 'KwotaA'); return k ? n2(k.textContent) : null; };
  const alias = k => [k, k.replace(/_I$/, '_1').replace(/_II$/, '_2').replace(/_III$/, '_3').replace(/_IV$/, '_4')];
  if (bil) {
    out.wzor = bil.localName;
    for (const [k] of BILANS) {
      const el = by(bil, k).find(e => kwA(e) !== null);
      if (el) { d.bil[k].b = kwA(el); out.bil++; }
    }
  }
  if (rz) {
    for (const [k] of RZIS) {
      const el = alias(k).map(a => kids(rz).find(e => e.localName === a) || by(rz, a)[0]).find(Boolean);
      if (el && kwA(el) !== null) { d.rzis[k].b = kwA(el); out.rzis++; }
    }
  }
  // teksty: zasady rachunkowości i informacje uzupełniające z poprzedniego roku jako punkt wyjścia
  const txt = name => { const e = by(doc, name)[0]; return e && !e.children.length ? e.textContent.trim() : ''; };
  const t4 = txt('P_4'); if (t4 && t4.length > 3) { d.p4 = t4; out.teksty++; }
  for (const [k, n] of [['p6a', 'P_6A'], ['p6b', 'P_6B'], ['p6c', 'P_6C'], ['p6d', 'P_6D']]) {
    const all = by(doc, n).map(e => e.textContent.trim()).filter(Boolean);
    if (all.length) { d[k] = all.join('\n'); out.teksty++; }
  }
  const info = [...doc.getElementsByTagNameNS('*', '*')].filter(e => /^(InformacjeUzupelniajaceDoBilansu|DodatkoweInformacjeIObjasnienia)$/.test(e.localName))
    .map(e => (kids(e).find(c => c.localName === 'Opis')?.textContent || '').trim()).filter(Boolean);
  if (info.length) { d.info = info; out.teksty++; }
  const name = by(doc, 'NazwaFirmy')[0]?.textContent.trim(); if (name && !d.firma.nazwa) d.firma.nazwa = name;
  const p7 = by(doc, 'P_7')[0]; if (p7 && !p7.children.length && /^\d/.test(p7.textContent.trim())) out.etaty = n2(p7.textContent);
  d.zrodla.poprzednie = { wzor: out.wzor, kiedy: new Date().toISOString() };
  return out;
}

// ---------- kontrola ----------
export function check(d) {
  const err = [], warn = [];
  const f = d.firma;
  if (!f.nazwa.trim()) err.push('Brak nazwy (firmy) jednostki.');
  if (!/^[1-9]((\d[1-9])|([1-9]\d))\d{7}$/.test(f.nip)) err.push('NIP jest nieprawidłowy (10 cyfr).');
  if (f.krs && !/^\d{10}$/.test(f.krs)) err.push('Numer KRS musi mieć 10 cyfr.');
  for (const [k, l] of [['woj', 'województwo'], ['powiat', 'powiat'], ['gmina', 'gmina'], ['miejscowosc', 'miejscowość'], ['nrDomu', 'numer domu'], ['kod', 'kod pocztowy']])
    if (!String(f[k] || '').trim()) err.push(`Adres siedziby: brak pola „${l}” (pobierz z KRS).`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.od) || !/^\d{4}-\d{2}-\d{2}$/.test(d.do) || d.od > d.do) err.push('Nieprawidłowy okres sprawozdania.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.sporzadzenie || '')) err.push('Podaj datę sporządzenia sprawozdania.');
  else if (d.sporzadzenie < d.do) err.push('Data sporządzenia nie może być wcześniejsza niż koniec roku obrotowego.');
  for (const [k, l] of [['p4', 'zasady rachunkowości (P_4)'], ['p6a', 'metody wyceny (P_6A)'], ['p6b', 'ustalenie wyniku (P_6B)'], ['p6c', 'sposób sporządzenia (P_6C)']])
    if (!String(d[k] || '').trim()) err.push(`Uzupełnij: ${l}.`);
  if (d.p5b === 2 && !d.p5c.trim()) err.push('Opisz okoliczności zagrażające kontynuacji działalności (P_5C).');
  if (!d.info.some(x => x.trim())) err.push('Dodaj co najmniej jedną informację uzupełniającą do bilansu.');
  if (d.p2.ograniczony && !d.p2.od) err.push('Czas trwania działalności: podaj datę początkową.');
  const B = d.bil, R = d.rzis;
  for (const k of ['a', 'b']) {
    const lbl = k === 'a' ? 'rok bieżący' : 'rok poprzedni';
    if (Math.abs(B.Aktywa[k] - B.Pasywa[k]) >= 0.005) err.push(`Bilans się nie bilansuje (${lbl}): aktywa ${fmt(B.Aktywa[k])} ≠ pasywa ${fmt(B.Pasywa[k])}.`);
    if (B.Aktywa_B_1[k] + B.Aktywa_B_2[k] > B.Aktywa_B[k] + 0.005) warn.push(`Aktywa obrotowe (${lbl}): „w tym” przekracza sumę pozycji B.`);
    if (B.Pasywa_B_1[k] + B.Pasywa_B_2[k] > B.Pasywa_B[k] + 0.005) warn.push(`Zobowiązania (${lbl}): „w tym” przekracza sumę pozycji B.`);
    const bs = R.B_I[k] + R.B_II[k] + R.B_III[k] + R.B_IV[k];
    if (Math.abs(bs) >= 0.005 && Math.abs(bs - R.B[k]) >= 0.005) warn.push(`RZiS (${lbl}): suma kosztów B.I–B.IV (${fmt(bs)}) różni się od pozycji B (${fmt(R.B[k])}).`);
  }
  // wynik w bilansie: kapitał własny musi zawierać wynik netto z RZiS – sprawdzamy tylko, gdy znamy go z JPK
  if (d.zrodla?.jpk && Math.abs(d.zrodla.jpk.wynikBilans) >= 0.005 && Math.abs(d.zrodla.jpk.wynikBilans - R.F.a) >= 0.01)
    warn.push(`Wynik z kont wynikowych w JPK (${fmt(d.zrodla.jpk.wynikBilans)}) różni się od wyniku netto RZiS (${fmt(R.F.a)}).`);
  if (!d.zrodla?.poprzednie && !B.Aktywa.b && !R.A.b) warn.push('Brak danych za rok poprzedni – wczytaj ubiegłoroczne sprawozdanie (XML z KRS) albo uzupełnij ręcznie. Przy pierwszym roku działalności zostaw zera.');
  if (d.cit.on && Math.abs(d.cit.P_ID_1.a - (R.F.a + R.E.a)) >= 0.01) warn.push(`Informacja o podatku: zysk brutto (A) ${fmt(d.cit.P_ID_1.a)} ≠ wynik netto + podatek z RZiS (${fmt(R.F.a + R.E.a)}).`);
  if (d.cit.on && Math.abs(d.cit.P_ID_11.a - R.E.a) >= 0.01) warn.push('Informacja o podatku: podatek (K) różni się od podatku dochodowego w RZiS (E).');
  return { err, warn };
}
export const fmt = v => Number(v || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---------- XML ----------
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const am = v => n2(v).toFixed(2);
const el = (p, name, inner) => `<${p}:${name}>${inner}</${p}:${name}>`;
const tx = (p, name, v) => el(p, name, esc(String(v).trim()));
const kw = v => el('dtsf', 'KwotaA', am(v.a)) + el('dtsf', 'KwotaB', am(v.b));
// tekst dłuższy niż 3500 znaków dzielony na kolejne wystąpienia elementu (pola wielokrotne)
const chunks = (s, max = 3500) => { const t = String(s || '').trim(); const out = []; for (let i = 0; i < t.length; i += max) out.push(t.slice(i, i + max)); return out; };
const multi = (p, name, s) => chunks(s).map(c => tx(p, name, c)).join('');

export function toXml(d) {
  recompute(d);
  const f = d.firma, B = d.bil, R = d.rzis;
  const adr = el('dtsf', 'AdresPol', tx('dtsf', 'KodKraju', 'PL') + tx('dtsf', 'Wojewodztwo', f.woj) + tx('dtsf', 'Powiat', f.powiat) + tx('dtsf', 'Gmina', f.gmina)
    + (f.ulica.trim() ? tx('dtsf', 'Ulica', f.ulica) : '') + tx('dtsf', 'NrDomu', f.nrDomu) + (String(f.nrLokalu).trim() ? tx('dtsf', 'NrLokalu', f.nrLokalu) : '')
    + tx('dtsf', 'Miejscowosc', f.miejscowosc) + tx('dtsf', 'KodPocztowy', f.kod));
  const forma = FORMY[f.forma] ? tx('tns', 'FormaPrawna', f.forma) : tx('tns', 'InneWybor', '1') + tx('tns', 'InneNazwa', f.forma);
  const p1 = el('tns', 'P_1', el('tns', 'P_1A', tx('dtsf', 'NazwaFirmy', f.nazwa) + el('dtsf', 'Siedziba', adr)) + el('tns', 'P_1B', forma)
    + tx('tns', 'P_1C', f.nip) + (f.krs ? tx('tns', 'P_1D', f.krs) : ''));
  const p2 = d.p2.ograniczony && d.p2.od ? el('tns', 'P_2', tx('dtsf', 'DataOd', d.p2.od) + (d.p2.do ? tx('dtsf', 'DataDo', d.p2.do) : tx('dtsf', 'DataDoOpis', 'czas nieokreślony'))) : '';
  const p5 = el('tns', 'P_5', tx('tns', 'P_5A', d.p5a) + tx('tns', 'P_5B', d.p5b) + (d.p5b === 2 && d.p5c.trim() ? multi('tns', 'P_5C', d.p5c) : ''));
  const p6 = el('tns', 'P_6', multi('tns', 'P_6A', d.p6a) + multi('tns', 'P_6B', d.p6b) + multi('tns', 'P_6C', d.p6c) + (d.p6d.trim() ? multi('tns', 'P_6D', d.p6d) : ''));
  const info = el('tns', 'InformacjeOgolneJednostkaMikro', p1 + p2 + el('tns', 'P_3', tx('dtsf', 'DataOd', d.od) + tx('dtsf', 'DataDo', d.do))
    + multi('tns', 'P_4', d.p4) + p5 + p6 + tx('tns', 'P_7', n2(d.p7).toFixed(2)) + tx('tns', 'P_8', d.p8));

  const J = (k, inner = '') => el('jmi', k, kw(B[k] || R[k]) + inner);
  const bil = el('tns', 'BilansJednostkaMikro',
    J('Aktywa', J('Aktywa_A') + J('Aktywa_B', J('Aktywa_B_1') + J('Aktywa_B_2')) + J('Aktywa_C') + J('Aktywa_D'))
    + J('Pasywa', J('Pasywa_A', J('Pasywa_A_1')) + J('Pasywa_B', J('Pasywa_B_1') + J('Pasywa_B_2'))));
  const rz = el('tns', 'RZiSJednostkaMikro', J('A', J('A_1')) + J('B', J('B_I') + J('B_II') + J('B_III') + J('B_IV')) + J('C', J('C_1')) + J('D', J('D_1')) + J('E') + J('F'));

  const opis = d.info.map(x => x.trim()).filter(Boolean).flatMap(x => chunks(x)).map(x => el('tns', 'InformacjeUzupelniajaceDoBilansu', tx('dtsf', 'Opis', x))).join('');
  const kwInf = v => el('dtsf', 'Kwota', el('dtsf', 'RB', el('dtsf', 'KwotaA', am(v.a))) + el('dtsf', 'RP', el('dtsf', 'KwotaA', am(v.b))));
  const cit = d.cit.on ? el('tns', 'InformacjaDodatkowaDotyczacaPodatkuDochodowego', PID.map(([k, , , t]) => t === 'kwota'
    ? el('dtsf', k, el('dtsf', 'RB', am(d.cit[k].a)) + el('dtsf', 'RP', am(d.cit[k].b)))
    : el('dtsf', k, kwInf(d.cit[k]))).join('')) : '';
  const uzup = el('tns', 'InformacjeUzupelniajaceDoBilansuJednostkaMikro', opis + cit);

  const nag = el('tns', 'Naglowek', tx('dtsf', 'OkresOd', d.od) + tx('dtsf', 'OkresDo', d.do) + tx('dtsf', 'DataSporzadzenia', d.sporzadzenie)
    + '<jmi:KodSprawozdania kodSystemowy="SFJMIZ (2)" wersjaSchemy="1-0E">SprFinJednostkaMikroWZlotych</jmi:KodSprawozdania>' + tx('jmi', 'WariantSprawozdania', '2'));
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + `<tns:Dokument xmlns:tns="${NS.tns}" xmlns:str="${NS.str}" xmlns:dtsf="${NS.dtsf}" xmlns:jmi="${NS.jmi}">`
    + '<tns:OpisDokumentu/><tns:DaneDokumentu/>'
    + `<tns:TrescDokumentu format="text/xml" kodowanie="XML">${el('tns', 'JednostkaMikro', nag + info + bil + rz + uzup)}</tns:TrescDokumentu>`
    + '</tns:Dokument>\n';
}
