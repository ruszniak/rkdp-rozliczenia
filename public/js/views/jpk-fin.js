// Bilans i rachunek zysków i strat generowane POMOCNICZO z pliku JPK_KR_PD – na podstawie znaczników kont (S_12_1, S_12_2)
// i sald / obrotów z zestawienia obrotów i sald. To nie jest część pliku JPK ani sprawozdanie finansowe.
//
// Format znaczników (rozporządzenie MF z 16.08.2024 r., Dz.U. poz. 1314): pierwsze dwie litery wskazują sprawozdanie
// (BA – bilans aktywa, BP – bilans pasywa, RP – RZiS porównawczy, RK – RZiS kalkulacyjny), dalej pozycja, np.
// BABIII1c1 = aktywa B.III.1.c (pierwszy podpunkt), BPBIII3a = pasywa B.III.3.a, RPGV_RKJV = RZiS porówn. G.V / kalk. J.V.
// Konto może mieć dwa znaczniki bilansowe (aktywa i pasywa) – wtedy saldo Wn idzie do aktywów, a saldo Ma do pasywów.

const num = v => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const r2 = n => Math.round(n * 100) / 100;

// ---------- wzory pozycji (załącznik nr 1 do ustawy o rachunkowości – jednostki pozostałe) ----------
const AKTYWA = {
  A: 'Aktywa trwałe',
  'A.I': 'Wartości niematerialne i prawne', 'A.I.1': 'Koszty zakończonych prac rozwojowych', 'A.I.2': 'Wartość firmy', 'A.I.3': 'Inne wartości niematerialne i prawne', 'A.I.4': 'Zaliczki na wartości niematerialne i prawne',
  'A.II': 'Rzeczowe aktywa trwałe', 'A.II.1': 'Środki trwałe', 'A.II.1.a': 'grunty (w tym prawo użytkowania wieczystego gruntu)', 'A.II.1.b': 'budynki, lokale, prawa do lokali i obiekty inżynierii lądowej i wodnej',
  'A.II.1.c': 'urządzenia techniczne i maszyny', 'A.II.1.d': 'środki transportu', 'A.II.1.e': 'inne środki trwałe', 'A.II.2': 'Środki trwałe w budowie', 'A.II.3': 'Zaliczki na środki trwałe w budowie',
  'A.III': 'Należności długoterminowe', 'A.III.1': 'Od jednostek powiązanych', 'A.III.2': 'Od pozostałych jednostek, w których jednostka posiada zaangażowanie w kapitale', 'A.III.3': 'Od pozostałych jednostek',
  'A.IV': 'Inwestycje długoterminowe', 'A.IV.1': 'Nieruchomości', 'A.IV.2': 'Wartości niematerialne i prawne', 'A.IV.3': 'Długoterminowe aktywa finansowe',
  'A.IV.3.a': 'w jednostkach powiązanych', 'A.IV.3.b': 'w pozostałych jednostkach, w których jednostka posiada zaangażowanie w kapitale', 'A.IV.3.c': 'w pozostałych jednostkach', 'A.IV.4': 'Inne inwestycje długoterminowe',
  'A.V': 'Długoterminowe rozliczenia międzyokresowe', 'A.V.1': 'Aktywa z tytułu odroczonego podatku dochodowego', 'A.V.2': 'Inne rozliczenia międzyokresowe',
  B: 'Aktywa obrotowe',
  'B.I': 'Zapasy', 'B.I.1': 'Materiały', 'B.I.2': 'Półprodukty i produkty w toku', 'B.I.3': 'Produkty gotowe', 'B.I.4': 'Towary', 'B.I.5': 'Zaliczki na dostawy i usługi',
  'B.II': 'Należności krótkoterminowe', 'B.II.1': 'Należności od jednostek powiązanych', 'B.II.1.a': 'z tytułu dostaw i usług', 'B.II.1.b': 'inne',
  'B.II.2': 'Należności od pozostałych jednostek, w których jednostka posiada zaangażowanie w kapitale', 'B.II.2.a': 'z tytułu dostaw i usług', 'B.II.2.b': 'inne',
  'B.II.3': 'Należności od pozostałych jednostek', 'B.II.3.a': 'z tytułu dostaw i usług', 'B.II.3.b': 'z tytułu podatków, dotacji, ceł, ubezpieczeń społecznych i zdrowotnych oraz innych tytułów publicznoprawnych',
  'B.II.3.c': 'inne', 'B.II.3.d': 'dochodzone na drodze sądowej',
  'B.III': 'Inwestycje krótkoterminowe', 'B.III.1': 'Krótkoterminowe aktywa finansowe', 'B.III.1.a': 'w jednostkach powiązanych', 'B.III.1.b': 'w pozostałych jednostkach',
  'B.III.1.c': 'środki pieniężne i inne aktywa pieniężne', 'B.III.1.c.1': 'środki pieniężne w kasie i na rachunkach', 'B.III.1.c.2': 'inne środki pieniężne', 'B.III.1.c.3': 'inne aktywa pieniężne',
  'B.III.2': 'Inne inwestycje krótkoterminowe',
  'B.IV': 'Krótkoterminowe rozliczenia międzyokresowe',
  C: 'Należne wpłaty na kapitał (fundusz) podstawowy',
  D: 'Udziały (akcje) własne',
};
const PASYWA = {
  A: 'Kapitał (fundusz) własny',
  'A.I': 'Kapitał (fundusz) podstawowy', 'A.II': 'Kapitał (fundusz) zapasowy', 'A.III': 'Kapitał (fundusz) z aktualizacji wyceny', 'A.IV': 'Pozostałe kapitały (fundusze) rezerwowe',
  'A.V': 'Zysk (strata) z lat ubiegłych', 'A.VI': 'Zysk (strata) netto', 'A.VII': 'Odpisy z zysku netto w ciągu roku obrotowego (wielkość ujemna)',
  B: 'Zobowiązania i rezerwy na zobowiązania',
  'B.I': 'Rezerwy na zobowiązania', 'B.I.1': 'Rezerwa z tytułu odroczonego podatku dochodowego', 'B.I.2': 'Rezerwa na świadczenia emerytalne i podobne', 'B.I.2.a': 'długoterminowa', 'B.I.2.b': 'krótkoterminowa',
  'B.I.3': 'Pozostałe rezerwy', 'B.I.3.a': 'długoterminowe', 'B.I.3.b': 'krótkoterminowe',
  'B.II': 'Zobowiązania długoterminowe', 'B.II.1': 'Wobec jednostek powiązanych', 'B.II.2': 'Wobec pozostałych jednostek, w których jednostka posiada zaangażowanie w kapitale',
  'B.II.3': 'Wobec pozostałych jednostek', 'B.II.3.a': 'kredyty i pożyczki', 'B.II.3.b': 'z tytułu emisji dłużnych papierów wartościowych', 'B.II.3.c': 'inne zobowiązania finansowe',
  'B.II.3.d': 'zobowiązania wekslowe', 'B.II.3.e': 'inne',
  'B.III': 'Zobowiązania krótkoterminowe', 'B.III.1': 'Zobowiązania wobec jednostek powiązanych', 'B.III.1.a': 'z tytułu dostaw i usług', 'B.III.1.b': 'inne',
  'B.III.2': 'Zobowiązania wobec pozostałych jednostek, w których jednostka posiada zaangażowanie w kapitale', 'B.III.2.a': 'z tytułu dostaw i usług', 'B.III.2.b': 'inne',
  'B.III.3': 'Zobowiązania wobec pozostałych jednostek', 'B.III.3.a': 'kredyty i pożyczki', 'B.III.3.b': 'z tytułu emisji dłużnych papierów wartościowych', 'B.III.3.c': 'inne zobowiązania finansowe',
  'B.III.3.d': 'z tytułu dostaw i usług', 'B.III.3.e': 'zaliczki otrzymane na dostawy i usługi', 'B.III.3.f': 'zobowiązania wekslowe',
  'B.III.3.g': 'z tytułu podatków, ceł, ubezpieczeń społecznych i zdrowotnych oraz innych tytułów publicznoprawnych', 'B.III.3.h': 'z tytułu wynagrodzeń', 'B.III.3.i': 'inne',
  'B.III.4': 'Fundusze specjalne',
  'B.IV': 'Rozliczenia międzyokresowe', 'B.IV.1': 'Ujemna wartość firmy', 'B.IV.2': 'Inne rozliczenia międzyokresowe', 'B.IV.2.a': 'długoterminowe', 'B.IV.2.b': 'krótkoterminowe',
};
// RZiS: znak +1 – pozycja przychodowa (Ma − Wn), −1 – kosztowa (Wn − Ma); calc – pozycja wyliczana z innych
const RZIS_P = {
  name: 'porównawczy', prefix: 'RP', result: 'L',
  rows: [
    ['A', 'Przychody netto ze sprzedaży i zrównane z nimi', 1], ['A.I', 'Przychody netto ze sprzedaży produktów'], ['A.II', 'Zmiana stanu produktów (zwiększenie – wartość dodatnia, zmniejszenie – wartość ujemna)'],
    ['A.III', 'Koszt wytworzenia produktów na własne potrzeby jednostki'], ['A.IV', 'Przychody netto ze sprzedaży towarów i materiałów'],
    ['B', 'Koszty działalności operacyjnej', -1], ['B.I', 'Amortyzacja'], ['B.II', 'Zużycie materiałów i energii'], ['B.III', 'Usługi obce'], ['B.IV', 'Podatki i opłaty, w tym podatek akcyzowy'],
    ['B.V', 'Wynagrodzenia'], ['B.VI', 'Ubezpieczenia społeczne i inne świadczenia, w tym emerytalne'], ['B.VII', 'Pozostałe koszty rodzajowe'], ['B.VIII', 'Wartość sprzedanych towarów i materiałów'],
    ['C', 'Zysk (strata) ze sprzedaży (A − B)', 0, v => v.A - v.B],
    ['D', 'Pozostałe przychody operacyjne', 1], ['D.I', 'Zysk z tytułu rozchodu niefinansowych aktywów trwałych'], ['D.II', 'Dotacje'], ['D.III', 'Aktualizacja wartości aktywów niefinansowych'], ['D.IV', 'Inne przychody operacyjne'],
    ['E', 'Pozostałe koszty operacyjne', -1], ['E.I', 'Strata z tytułu rozchodu niefinansowych aktywów trwałych'], ['E.II', 'Aktualizacja wartości aktywów niefinansowych'], ['E.III', 'Inne koszty operacyjne'],
    ['F', 'Zysk (strata) z działalności operacyjnej (C + D − E)', 0, v => v.C + v.D - v.E],
    ['G', 'Przychody finansowe', 1], ['G.I', 'Dywidendy i udziały w zyskach'], ['G.I.a', 'od jednostek powiązanych'], ['G.I.b', 'od jednostek pozostałych'], ['G.II', 'Odsetki'],
    ['G.III', 'Zysk z tytułu rozchodu aktywów finansowych'], ['G.IV', 'Aktualizacja wartości aktywów finansowych'], ['G.V', 'Inne'],
    ['H', 'Koszty finansowe', -1], ['H.I', 'Odsetki'], ['H.II', 'Strata z tytułu rozchodu aktywów finansowych'], ['H.III', 'Aktualizacja wartości aktywów finansowych'], ['H.IV', 'Inne'],
    ['I', 'Zysk (strata) brutto (F + G − H)', 0, v => v.F + v.G - v.H],
    ['J', 'Podatek dochodowy', -1],
    ['K', 'Pozostałe obowiązkowe zmniejszenia zysku (zwiększenia straty)', -1],
    ['L', 'Zysk (strata) netto (I − J − K)', 0, v => v.I - v.J - v.K],
  ],
};
const RZIS_K = {
  name: 'kalkulacyjny', prefix: 'RK', result: 'O',
  rows: [
    ['A', 'Przychody netto ze sprzedaży produktów, towarów i materiałów', 1], ['A.I', 'Przychody netto ze sprzedaży produktów'], ['A.II', 'Przychody netto ze sprzedaży towarów i materiałów'],
    ['B', 'Koszty sprzedanych produktów, towarów i materiałów', -1], ['B.I', 'Koszt wytworzenia sprzedanych produktów'], ['B.II', 'Wartość sprzedanych towarów i materiałów'],
    ['C', 'Zysk (strata) brutto ze sprzedaży (A − B)', 0, v => v.A - v.B],
    ['D', 'Koszty sprzedaży', -1], ['E', 'Koszty ogólnego zarządu', -1],
    ['F', 'Zysk (strata) ze sprzedaży (C − D − E)', 0, v => v.C - v.D - v.E],
    ['G', 'Pozostałe przychody operacyjne', 1], ['G.I', 'Zysk z tytułu rozchodu niefinansowych aktywów trwałych'], ['G.II', 'Dotacje'], ['G.III', 'Aktualizacja wartości aktywów niefinansowych'], ['G.IV', 'Inne przychody operacyjne'],
    ['H', 'Pozostałe koszty operacyjne', -1], ['H.I', 'Strata z tytułu rozchodu niefinansowych aktywów trwałych'], ['H.II', 'Aktualizacja wartości aktywów niefinansowych'], ['H.III', 'Inne koszty operacyjne'],
    ['I', 'Zysk (strata) z działalności operacyjnej (F + G − H)', 0, v => v.F + v.G - v.H],
    ['J', 'Przychody finansowe', 1], ['J.I', 'Dywidendy i udziały w zyskach'], ['J.I.a', 'od jednostek powiązanych'], ['J.I.b', 'od jednostek pozostałych'], ['J.II', 'Odsetki'],
    ['J.III', 'Zysk z tytułu rozchodu aktywów finansowych'], ['J.IV', 'Aktualizacja wartości aktywów finansowych'], ['J.V', 'Inne'],
    ['K', 'Koszty finansowe', -1], ['K.I', 'Odsetki'], ['K.II', 'Strata z tytułu rozchodu aktywów finansowych'], ['K.III', 'Aktualizacja wartości aktywów finansowych'], ['K.IV', 'Inne'],
    ['L', 'Zysk (strata) brutto (I + J − K)', 0, v => v.I + v.J - v.K],
    ['M', 'Podatek dochodowy', -1],
    ['N', 'Pozostałe obowiązkowe zmniejszenia zysku (zwiększenia straty)', -1],
    ['O', 'Zysk (strata) netto (L − M − N)', 0, v => v.L - v.M - v.N],
  ],
};

// ---------- odczyt znaczników ----------
const ROMAN = '(IX|IV|V?I{0,3})';
const POS = new RegExp(`^([A-O])${ROMAN}(\\d+)?([a-z])?(\\d+)?$`);
// „BABIII1c1_SPKR” → { kind: 'BA', path: 'B.III.1.c.1' }; zwraca listę rozpoznanych pozycji ze wszystkich członów znacznika
export function parseMarker(code) {
  const out = [];
  for (const tok of String(code || '').trim().split(/[_\s;,]+/)) {
    const k = tok.slice(0, 2).toUpperCase();
    if (!['BA', 'BP', 'RP', 'RK'].includes(k)) continue;
    const m = tok.slice(2).replace(/\./g, '').match(POS);
    if (!m) continue;
    out.push({ kind: k, path: [m[1], m[2], m[3], m[4], m[5]].filter(Boolean).join('.') });
  }
  return out;
}
const accMarkers = a => [a.S_12_1, a.S_12_2].flatMap(parseMarker);

// ---------- hierarchia kont: syntetyczne (np. 011) i analityczne (011-01, 011-01-02) ----------
// Konto nadrzędne pomijamy w bilansie / RZiS, jeśli jego analityki mają własne znaczniki (inaczej kwoty liczyłyby się podwójnie).
const SEP = /^[-./ _]/;
export function hierarchy(m) {
  if (m._h) return m._h;
  const sorted = [...m.accounts].filter(a => a.S_1).sort((a, b) => (a.S_1 < b.S_1 ? -1 : a.S_1 > b.S_1 ? 1 : 0));
  const parent = new Set(), markedB = new Set(), markedR = { RP: new Set(), RK: new Set() };
  const stack = [];
  for (const a of sorted) {
    while (stack.length && !(a.S_1.startsWith(stack.at(-1).S_1) && SEP.test(a.S_1.slice(stack.at(-1).S_1.length)))) stack.pop();
    const mk = accMarkers(a);
    const hasB = mk.some(x => x.kind === 'BA' || x.kind === 'BP');
    for (const anc of stack) {
      parent.add(anc.S_1);
      if (hasB) markedB.add(anc.S_1);
      for (const v of ['RP', 'RK']) if (mk.some(x => x.kind === v)) markedR[v].add(anc.S_1);
    }
    stack.push(a);
  }
  return (m._h = { parent, markedB, markedR, isLeaf: a => !parent.has(a.S_1) });
}
// czy konto pominąć w zestawieniu danego rodzaju ('B' – bilans, 'RP' / 'RK' – RZiS)
const skipAcc = (m, a, kind) => { const H = hierarchy(m); return kind === 'B' ? H.markedB.has(a.S_1) : H.markedR[kind].has(a.S_1); };
const parents = path => path.split('.').map((_, i, arr) => arr.slice(0, i + 1).join('.'));

// ---------- BILANS ----------
export function buildBilans(m) {
  const A = new Map(), P = new Map(); // path → { start, end, accounts: [...] }
  const add = (map, path, acc, start, end, how) => {
    for (const p of parents(path)) {
      if (!map.has(p)) map.set(p, { start: 0, end: 0, accounts: [] });
      const n = map.get(p); n.start += start; n.end += end;
      if (p === path) n.accounts.push({ S_1: acc.S_1, S_2: acc.S_2, start, end, how });
    }
  };
  const warnings = { opposite: [], unmarked: [], dual: 0 };
  let rStart = 0, rEnd = 0; // salda kont wynikowych (niezamknięty wynik)
  for (const a of m.accounts) {
    if (skipAcc(m, a, 'B')) continue;
    const mk = accMarkers(a);
    const ba = mk.find(x => x.kind === 'BA'), bp = mk.find(x => x.kind === 'BP');
    const sWn = num(a.S_4), sMa = num(a.S_5), eWn = num(a.S_10), eMa = num(a.S_11);
    if (ba && bp) {
      // konto rozrachunkowe z dwoma znacznikami: saldo Wn → aktywa, saldo Ma → pasywa (bez kompensowania)
      warnings.dual++;
      if (sWn || eWn) add(A, ba.path, a, sWn, eWn, 'saldo Wn');
      if (sMa || eMa) add(P, bp.path, a, sMa, eMa, 'saldo Ma');
    } else if (ba) {
      add(A, ba.path, a, sWn - sMa, eWn - eMa, 'Wn − Ma');
      if (eWn - eMa < -0.005) warnings.opposite.push({ ...a, side: 'aktywa', saldo: r2(eWn - eMa) });
    } else if (bp) {
      add(P, bp.path, a, sMa - sWn, eMa - eWn, 'Ma − Wn');
      if (eMa - eWn < -0.005) warnings.opposite.push({ ...a, side: 'pasywa', saldo: r2(eMa - eWn) });
    } else if (mk.some(x => x.kind === 'RP' || x.kind === 'RK')) {
      rStart += sMa - sWn; rEnd += eMa - eWn;
    } else if (Math.abs(eWn - eMa) >= 0.005 || Math.abs(sWn - sMa) >= 0.005) {
      warnings.unmarked.push({ ...a, saldo: r2(eWn - eMa) });
    }
  }
  // niezamknięte konta wynikowe → zysk (strata) netto w pasywach A.VI
  if (Math.abs(rEnd) >= 0.005 || Math.abs(rStart) >= 0.005) add(P, 'A.VI', { S_1: '—', S_2: 'Wynik na kontach wynikowych (niezamkniętych na wynik finansowy)' }, rStart, rEnd, 'z RZiS');
  const total = (map, keys) => keys.reduce((s, k) => ({ start: s.start + (map.get(k)?.start || 0), end: s.end + (map.get(k)?.end || 0) }), { start: 0, end: 0 });
  const tA = total(A, ['A', 'B', 'C', 'D']), tP = total(P, ['A', 'B']);
  return { aktywa: rowsFrom(A, AKTYWA, ['A', 'B', 'C', 'D']), pasywa: rowsFrom(P, PASYWA, ['A', 'B']), tA, tP, warnings, unclosed: r2(rEnd), mapA: A, mapP: P };
}

// kolejność wierszy: najpierw wzór (zawsze pozycje główne i rzymskie), potem dodatkowe pozycje z danych
function rowsFrom(map, tpl, top) {
  const depth = p => p.split('.').length;
  const keys = new Set([...Object.keys(tpl).filter(k => depth(k) <= 2 || map.has(k)), ...map.keys()]);
  const order = (a, b) => {
    const pa = a.split('.'), pb = b.split('.');
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      if (pa[i] === undefined) return -1; if (pb[i] === undefined) return 1;
      if (pa[i] !== pb[i]) return rank(pa[i], i) - rank(pb[i], i);
    }
    return 0;
  };
  return [...keys].filter(k => top.includes(k.split('.')[0])).sort(order).map(k => {
    const n = map.get(k) || { start: 0, end: 0, accounts: [] };
    return { key: k, depth: depth(k), name: tpl[k] || '', start: r2(n.start), end: r2(n.end), accounts: n.accounts };
  });
}
const ROMANS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
function rank(seg, level) {
  if (level === 0) return seg.charCodeAt(0);
  if (ROMANS.includes(seg)) return ROMANS.indexOf(seg);
  if (/^\d+$/.test(seg)) return +seg;
  return seg.charCodeAt(0);
}

// ---------- RZiS ----------
export function hasVariant(m, prefix, sections = null) { return m.accounts.some(a => accMarkers(a).some(x => x.kind === prefix && (!sections || sections.includes(x.path[0])))); }

export function buildRzis(m, variant = 'RP') {
  const T = variant === 'RK' ? RZIS_K : RZIS_P;
  // obroty z dziennika z pominięciem przeksięgowań na wynik finansowy (zapisy dotykające konta wyniku: znacznik BP A.VI albo konto 86x)
  const isResultAcc = a => accMarkers(a).some(x => x.kind === 'BP' && x.path === 'A.VI') || /^86/.test(a.S_1 || '');
  const resultAccs = new Set(m.accounts.filter(isResultAcc).map(a => a.S_1));
  const closing = new Set();
  if (resultAccs.size) for (const j of m.journal) if (j._z.some(i => resultAccs.has(m.postings[i].Z_3))) closing.add(j._i);
  // obroty kont z ZOiS (S_6 / S_7 – za okres pliku), pomniejszone o zapisy przeksięgowania wyniku z dziennika;
  // gdy ZOiS nie ma obrotów okresu – obroty z dziennika
  const closingTurn = new Map(), journalTurn = new Map();
  for (const p of m.postings) {
    const isClose = p._d !== null && p._d !== undefined && closing.has(p._d);
    const map = isClose ? closingTurn : journalTurn;
    const t = map.get(p.Z_3) || { wn: 0, ma: 0 }; t.wn += num(p.Z_4); t.ma += num(p.Z_7); map.set(p.Z_3, t);
  }
  const zoisHasTurn = m.accounts.some(a => String(a.S_6 ?? '').trim() !== '' || String(a.S_7 ?? '').trim() !== '');
  const turnOf = a => {
    const c = closingTurn.get(a.S_1) || { wn: 0, ma: 0 };
    if (zoisHasTurn) return { wn: num(a.S_6) - c.wn, ma: num(a.S_7) - c.ma };
    return journalTurn.get(a.S_1) || (m.postings.length ? { wn: 0, ma: 0 } : { wn: num(a.S_8), ma: num(a.S_9) });
  };
  const usePostings = !zoisHasTurn && m.postings.length > 0;
  const sign = Object.fromEntries(T.rows.filter(r => r[2]).map(r => [r[0], r[2]]));
  const acc = new Map();
  for (const a of m.accounts) {
    const mk = accMarkers(a).find(x => x.kind === variant);
    if (!mk || skipAcc(m, a, variant)) continue;
    const t = turnOf(a);
    const s = sign[mk.path.split('.')[0]] || 1;
    const v = s > 0 ? t.ma - t.wn : t.wn - t.ma;
    for (const p of parents(mk.path)) {
      if (!acc.has(p)) acc.set(p, { v: 0, accounts: [] });
      acc.get(p).v += v;
      if (p === mk.path) acc.get(p).accounts.push({ S_1: a.S_1, S_2: a.S_2, v: r2(v), wn: r2(t.wn), ma: r2(t.ma) });
    }
  }
  const vals = {};
  for (const [k, , , f] of T.rows) if (!k.includes('.')) vals[k] = f ? 0 : (acc.get(k)?.v || 0);
  for (const [k, , , f] of T.rows) if (f) vals[k] = f(vals);
  const tplKeys = new Set(T.rows.map(r => r[0]));
  const rows = T.rows.filter(r => !r[0].includes('.') || r[0].split('.').length === 2 || acc.has(r[0])).map(([k, name, , f]) => ({
    key: k, depth: k.split('.').length, name, calc: !!f, v: r2(f ? vals[k] : (acc.get(k)?.v || 0)), accounts: acc.get(k)?.accounts || [],
  }));
  // pozycje z danych spoza wzoru (np. dodatkowe podpozycje)
  for (const [k, n] of acc) if (!tplKeys.has(k)) rows.push({ key: k, depth: k.split('.').length, name: '', v: r2(n.v), accounts: n.accounts, extra: true });
  rows.sort((a, b) => {
    const pa = a.key.split('.'), pb = b.key.split('.');
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      if (pa[i] === undefined) return -1; if (pb[i] === undefined) return 1;
      if (pa[i] !== pb[i]) return rank(pa[i], i) - rank(pb[i], i);
    }
    return 0;
  });
  return { variant: T.name, rows, net: r2(vals[T.result]), closingEntries: closing.size, fromPostings: usePostings, fromZois: zoisHasTurn, acc, vals };
}

// ---------- KONTROLA PLIKU: błędy (error) i ostrzeżenia (warn) ----------
// Każdy problem: { level, title, text, accounts: [{ S_1, S_2, info }], go: zakładka do otwarcia, query: tekst do wyszukania }
const accClass = a => (String(a.S_1 || '').match(/\d/) || [''])[0];
const isResultNo = a => /^(4|5|7)/.test(String(a.S_1 || '').replace(/\D/g, '')) || /^87/.test(String(a.S_1 || '').replace(/\D/g, ''));
const isBalanceNo = a => /^[0-3]|^6|^8[0-6]/.test(String(a.S_1 || '').replace(/\D/g, ''));
const RZIS_KEYS = { RP: new Set(RZIS_P.rows.map(r => r[0])), RK: new Set(RZIS_K.rows.map(r => r[0])) };
const SIGN = { RP: Object.fromEntries(RZIS_P.rows.filter(r => r[2]).map(r => [r[0], r[2]])), RK: Object.fromEntries(RZIS_K.rows.filter(r => r[2]).map(r => [r[0], r[2]])) };
const inTemplate = (kind, path) => {
  const has = kind === 'BA' ? k => !!AKTYWA[k] : kind === 'BP' ? k => !!PASYWA[k] : k => RZIS_KEYS[kind].has(k);
  if (has(path)) return true;
  const par = parents(path).at(-2); // dodatkowe podpozycje (np. myślniki) pod istniejącą pozycją wzoru
  return !!par && has(par) && path.split('.').length >= 4;
};
const fmt = n => Number(Math.abs(n) < 0.005 ? 0 : n).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function validateKr(m, A, B) {
  const issues = [];
  const add = (level, title, text, accounts = [], go = null, query = null) => issues.push({ level, title, text, accounts, go, query });
  const accLine = (a, info) => ({ S_1: a.S_1, S_2: a.S_2 || '', info });

  // 1. sumy kontrolne
  const badCtrl = A.ctrlRows.filter(r => r.ok === false);
  if (badCtrl.length) add('error', 'Sumy kontrolne (Ctrl) nie zgadzają się z danymi', badCtrl.map(r => `${r.k}: w pliku ${fmt(num(r.file))}, z danych ${fmt(r.calc)}`).join('; ') + '. Plik może być niekompletny albo uszkodzony.', [], 'sum');
  // 1a. zdublowane zapisy dziennika
  if (m.dupJournal) add('error', `Plik zawiera zdublowane zapisy dziennika (${m.dupJournal.toLocaleString('pl-PL')})`, `Te same zapisy (ten sam numer, data, konta i kwoty) występują w pliku wielokrotnie – razem ${m.dupPostings.toLocaleString('pl-PL')} powtórzonych pozycji na kontach. Aplikacja pominęła powtórzenia w analizie, ale plik w tej postaci zawyża obroty w dzienniku – wygeneruj JPK ponownie albo zgłoś błąd dostawcy programu księgowego.${m.dupExamples?.length ? ' Np. ' + m.dupExamples.join(', ') + '.' : ''}`, [], 'jr', m.dupExamples?.[0]);
  // 2. bilans obrotów i sald (Wn = Ma)
  for (const b of A.balance) if (Math.abs(b.diff) >= 0.005) add('error', `${b.name}: Wn ≠ Ma`, `Różnica ${fmt(b.diff)} (Wn ${fmt(b.wn)}, Ma ${fmt(b.ma)}).`, [], 'sum');
  // 3. niezbilansowane zapisy
  if (A.unbalanced.length) add('error', `Zapisy w dzienniku, w których Wn ≠ Ma (${A.unbalanced.length})`, `Np. ${A.unbalanced.slice(0, 8).map(j => j.D_1).join(', ')}.`, [], 'jr', A.unbalanced[0]?.D_1);
  // 4. konta z zapisów, których brak w ZOiS
  if (A.unknownAccounts.length) add('error', `Konta użyte w zapisach, których nie ma w zestawieniu obrotów i sald (${A.unknownAccounts.length})`, A.unknownAccounts.slice(0, 15).join(', '), [], 'zp');

  // 5. spójność kont w ZOiS: saldo = BO + obroty narastająco; obroty okresu = zapisy w dzienniku
  const turn = new Map();
  for (const p of m.postings) { const t = turn.get(p.Z_3) || { wn: 0, ma: 0 }; t.wn += num(p.Z_4); t.ma += num(p.Z_7); turn.set(p.Z_3, t); }
  const badSaldo = [], badTurn = [];
  const H = hierarchy(m);
  for (const a of m.accounts) {
    const saldo = num(a.S_10) - num(a.S_11), bo = num(a.S_4) - num(a.S_5), nar = num(a.S_8) - num(a.S_9);
    if (!H.isLeaf(a)) { if (Math.abs(saldo - bo - nar) >= 0.01 && Math.abs(saldo - nar) >= 0.01) badSaldo.push(accLine(a, `saldo ${fmt(saldo)}, BO + obroty ${fmt(bo + nar)}`)); continue; }
    if (Math.abs(saldo - bo - nar) >= 0.01 && Math.abs(saldo - nar) >= 0.01) badSaldo.push(accLine(a, `saldo ${fmt(saldo)}, BO + obroty ${fmt(bo + nar)}`));
    if (m.postings.length) {
      const t = turn.get(a.S_1) || { wn: 0, ma: 0 };
      if (Math.abs(t.wn - num(a.S_6)) >= 0.01 || Math.abs(t.ma - num(a.S_7)) >= 0.01) badTurn.push(accLine(a, `ZOiS Wn ${fmt(num(a.S_6))} / Ma ${fmt(num(a.S_7))}, dziennik Wn ${fmt(t.wn)} / Ma ${fmt(t.ma)}`));
    }
  }
  if (badSaldo.length) add('error', `Saldo konta nie wynika z bilansu otwarcia i obrotów (${badSaldo.length})`, 'Saldo końcowe powinno być równe BO + obroty narastająco.', badSaldo, 'acc');
  if (badTurn.length) add('error', `Obroty kont w ZOiS różnią się od zapisów w dzienniku (${badTurn.length})`, 'Obroty za okres (S_6 / S_7) powinny być sumą pozycji z dziennika na tym koncie.', badTurn, 'acc');

  // 6. znaczniki
  const noMarker = [], unknown = [], outside = [], wrongType = [], singleOpp = [], negRzis = [];
  for (const a of m.accounts) {
    const active = [a.S_4, a.S_5, a.S_6, a.S_7, a.S_10, a.S_11].some(v => Math.abs(num(v)) >= 0.005);
    if (!active || (!H.isLeaf(a) && (H.markedB.has(a.S_1) || H.markedR.RP.has(a.S_1) || H.markedR.RK.has(a.S_1)) && !accMarkers(a).length)) continue;
    if (!String(a.S_12_1 || '').trim()) { noMarker.push(accLine(a, `saldo ${fmt(num(a.S_10) - num(a.S_11))}`)); continue; }
    for (const raw of [a.S_12_1, a.S_12_2].filter(x => String(x || '').trim())) {
      const parsed = parseMarker(raw);
      if (!parsed.length && !/^INNE$/i.test(String(raw).trim())) unknown.push(accLine(a, `„${raw}”`));
      for (const p of parsed) if (!inTemplate(p.kind, p.path)) outside.push(accLine(a, `${raw} → ${p.kind === 'BA' ? 'aktywa' : p.kind === 'BP' ? 'pasywa' : 'RZiS'} ${p.path}`));
    }
    const mk = accMarkers(a);
    const hasB = mk.some(x => x.kind === 'BA' || x.kind === 'BP'), hasR = mk.some(x => x.kind === 'RP' || x.kind === 'RK');
    if (isResultNo(a) && hasB && !hasR) wrongType.push(accLine(a, `konto wynikowe ze znacznikiem bilansu (${a.S_12_1})`));
    if (/^[0-3]/.test(String(a.S_1 || '').replace(/\D/g, '')) && hasR && !hasB) wrongType.push(accLine(a, `konto bilansowe ze znacznikiem RZiS (${a.S_12_1})`));
    const ba = mk.find(x => x.kind === 'BA'), bp = mk.find(x => x.kind === 'BP');
    const saldo = num(a.S_10) - num(a.S_11);
    if (accClass(a) === '2' && ((ba && !bp && saldo < -0.005) || (bp && !ba && saldo > 0.005)))
      singleOpp.push(accLine(a, `${ba ? 'znacznik aktywów' : 'znacznik pasywów'}, a saldo ${saldo > 0 ? 'Wn' : 'Ma'} ${fmt(Math.abs(saldo))}`));
  }
  if (noMarker.length) add('error', `Konta bez znacznika S_12_1 (${noMarker.length})`, 'Znacznik S_12_1 jest obowiązkowy dla każdego konta, które miało saldo lub obroty. Konta bez znacznika nie trafią do bilansu ani RZiS.', noMarker, 'acc');
  if (unknown.length) add('warn', `Nierozpoznane znaczniki (${unknown.length})`, 'Znacznik nie ma formatu BA…/BP…/RP…/RK… – aplikacja nie przypisze konta do bilansu ani RZiS (może to też być znacznik innego wzoru sprawozdania).', unknown, 'acc');
  if (outside.length) add('warn', `Znaczniki wskazujące pozycję spoza wzoru bilansu / RZiS (${outside.length})`, 'Pozycja nie występuje we wzorze z załącznika nr 1 do ustawy o rachunkowości – sprawdź znacznik (literówka?) albo to wzór dla jednostek małych / mikro.', outside, 'acc');
  if (wrongType.length) add('warn', `Możliwy zły znacznik – typ konta nie pasuje do sprawozdania (${wrongType.length})`, 'Konta zespołów 4, 5, 7 i 87 zwykle mają znaczniki RZiS, a konta zespołów 0–3 – znaczniki bilansu.', wrongType, 'acc');
  if (singleOpp.length) add('warn', `Rozrachunki z saldem po stronie przeciwnej do znacznika (${singleOpp.length})`, 'Konto ma tylko jeden znacznik, a saldo jest po drugiej stronie – prawdopodobnie brakuje drugiego znacznika (aktywa i pasywa). Teraz saldo pomniejsza pozycję zamiast trafić na drugą stronę bilansu.', singleOpp, 'bil');

  // 7. bilans: aktywa = pasywa
  const dE = r2(B.tA.end - B.tP.end), dS = r2(B.tA.start - B.tP.start);
  if (Math.abs(dE) >= 0.005 || Math.abs(dS) >= 0.005) {
    // podpowiedź: konta, których saldo równa się różnicy
    const d = Math.abs(dE || dS);
    const hint = d < 0.01 ? [] : m.accounts.filter(a => { const v = Math.abs(num(a.S_10) - num(a.S_11)); return v >= 0.01 && (Math.abs(v - d) < 0.01 || Math.abs(2 * v - d) < 0.01); })
      .slice(0, 10).map(a => accLine(a, `saldo ${fmt(num(a.S_10) - num(a.S_11))} – kwota pasuje do różnicy${Math.abs(2 * Math.abs(num(a.S_10) - num(a.S_11)) - d) < 0.01 ? ' (×2 – konto po złej stronie bilansu?)' : ''}`));
    add('error', 'Bilans się nie bilansuje (aktywa ≠ pasywa)', `Różnica na koniec ${fmt(dE)}, na początek ${fmt(dS)}. Najczęstsze przyczyny: konto bez znacznika, zły znacznik (np. pasywa zamiast aktywów – wtedy różnica to dwukrotność salda) albo rozrachunek z jednym znacznikiem.${hint.length ? ' Konta, których saldo odpowiada różnicy:' : ''}`, hint, 'bil');
  }
  // 8. RZiS: konta wynikowe bez znacznika RZiS, ujemne przychody / koszty
  const rp = hasVariant(m, 'RP') ? buildRzis(m, 'RP') : null;
  if (rp) for (const row of rp.rows) for (const ac of row.accounts) {
    const sec = row.key.split('.')[0]; if (row.key === 'A.II') continue; // zmiana stanu produktów może być ujemna
    if (ac.v < -0.005) negRzis.push({ S_1: ac.S_1, S_2: ac.S_2, info: `${SIGN.RP[sec] > 0 ? 'przychód' : 'koszt'} ujemny ${fmt(ac.v)} w poz. ${row.key}` });
  }
  if (negRzis.length) add('warn', `Ujemne kwoty w RZiS – możliwy zły znacznik (${negRzis.length})`, 'Konto przypisane do pozycji kosztowej ma przewagę obrotów Ma (albo do przychodowej – Wn). Sprawdź, czy znacznik nie wskazuje przychodu zamiast kosztu (lub odwrotnie).', negRzis, 'rzis');
  if (rp && B.unclosed && Math.abs(B.unclosed - rp.net) >= 0.01) add('warn', 'Wynik z RZiS różni się od salda kont wynikowych', `RZiS: ${fmt(rp.net)}, saldo niezamkniętych kont wynikowych: ${fmt(B.unclosed)}. Część kont wynikowych może nie mieć znacznika RZiS wariantu porównawczego.`, [], 'rzis');
  return issues.sort((a, b) => (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1));
}


// ---------- WZORY UPROSZCZONE: jednostki małe (załącznik nr 5) i mikro (załącznik nr 4) ----------
// Znaczniki JPK_KR_PD wskazują pozycje pełnego wzoru (załącznik nr 1), dlatego pozycje wzorów uproszczonych
// wyliczamy jako sumy pozycji pełnego wzoru. Wiersz: [klucz, nazwa, źródła (ścieżki pełnego wzoru) | funkcja, poziom, „w tym”]
export const WZORY = { pelny: 'Jednostka pozostała (zał. nr 1)', mala: 'Jednostka mała (zał. nr 5)', mikro: 'Jednostka mikro (zał. nr 4)' };

const BIL_MALA = {
  aktywa: [
    ['A', 'Aktywa trwałe', ['A'], 1], ['A.I', 'Wartości niematerialne i prawne', ['A.I'], 2], ['A.II', 'Rzeczowe aktywa trwałe', ['A.II'], 2],
    ['A.II.w1', 'środki trwałe', ['A.II.1'], 3, 1], ['A.II.w2', 'środki trwałe w budowie', ['A.II.2'], 3, 1],
    ['A.III', 'Należności długoterminowe', ['A.III'], 2], ['A.IV', 'Inwestycje długoterminowe', ['A.IV'], 2],
    ['A.IV.w1', 'nieruchomości', ['A.IV.1'], 3, 1], ['A.IV.w2', 'długoterminowe aktywa finansowe', ['A.IV.3'], 3, 1],
    ['A.V', 'Długoterminowe rozliczenia międzyokresowe', ['A.V'], 2],
    ['B', 'Aktywa obrotowe', ['B'], 1], ['B.I', 'Zapasy', ['B.I'], 2], ['B.II', 'Należności krótkoterminowe', ['B.II'], 2],
    ['B.II.w1', 'z tytułu dostaw i usług (bez podziału na okresy wymagalności)', ['B.II.1.a', 'B.II.2.a', 'B.II.3.a'], 3, 1],
    ['B.III', 'Inwestycje krótkoterminowe', ['B.III'], 2], ['B.III.w1', 'krótkoterminowe aktywa finansowe', ['B.III.1'], 3, 1],
    ['B.III.w2', 'środki pieniężne w kasie i na rachunkach', ['B.III.1.c.1|B.III.1.c'], 4, 1],
    ['B.IV', 'Krótkoterminowe rozliczenia międzyokresowe', ['B.IV'], 2],
    ['C', 'Należne wpłaty na kapitał (fundusz) podstawowy', ['C'], 1], ['D', 'Udziały (akcje) własne', ['D'], 1],
  ],
  pasywa: [
    ['A', 'Kapitał (fundusz) własny', ['A'], 1], ['A.I', 'Kapitał (fundusz) podstawowy', ['A.I'], 2], ['A.II', 'Kapitał (fundusz) zapasowy', ['A.II'], 2],
    ['A.III', 'Kapitał (fundusz) z aktualizacji wyceny', ['A.III'], 2], ['A.IV', 'Pozostałe kapitały (fundusze) rezerwowe', ['A.IV'], 2],
    ['A.V', 'Zysk (strata) z lat ubiegłych', ['A.V'], 2], ['A.VI', 'Zysk (strata) netto', ['A.VI'], 2], ['A.VII', 'Odpisy z zysku netto w ciągu roku obrotowego (wielkość ujemna)', ['A.VII'], 2],
    ['B', 'Zobowiązania i rezerwy na zobowiązania', ['B'], 1], ['B.I', 'Rezerwy na zobowiązania', ['B.I'], 2], ['B.I.w1', 'rezerwa na świadczenia emerytalne i podobne', ['B.I.2'], 3, 1],
    ['B.II', 'Zobowiązania długoterminowe', ['B.II'], 2], ['B.II.w1', 'z tytułu kredytów i pożyczek', ['B.II.3.a'], 3, 1],
    ['B.III', 'Zobowiązania krótkoterminowe', ['B.III'], 2], ['B.III.w1', 'z tytułu kredytów i pożyczek', ['B.III.3.a'], 3, 1],
    ['B.III.w2', 'z tytułu dostaw i usług (bez podziału na okresy wymagalności)', ['B.III.1.a', 'B.III.2.a', 'B.III.3.d'], 3, 1], ['B.III.w3', 'fundusze specjalne', ['B.III.4'], 3, 1],
    ['B.IV', 'Rozliczenia międzyokresowe', ['B.IV'], 2],
  ],
};
const BIL_MIKRO = {
  aktywa: [
    ['A', 'Aktywa trwałe', ['A'], 1], ['A.w1', 'środki trwałe', ['A.II.1'], 2, 1],
    ['B', 'Aktywa obrotowe', ['B'], 1], ['B.w1', 'zapasy', ['B.I'], 2, 1], ['B.w2', 'należności krótkoterminowe', ['B.II'], 2, 1],
    ['C', 'Należne wpłaty na kapitał (fundusz) podstawowy', ['C'], 1], ['D', 'Udziały (akcje) własne', ['D'], 1],
  ],
  pasywa: [
    ['A', 'Kapitał (fundusz) własny', ['A'], 1], ['A.w1', 'kapitał (fundusz) podstawowy', ['A.I'], 2, 1],
    ['B', 'Zobowiązania i rezerwy na zobowiązania', ['B'], 1], ['B.w1', 'rezerwy na zobowiązania', ['B.I'], 2, 1],
    ['B.w2', 'zobowiązania z tytułu kredytów i pożyczek', ['B.II.3.a', 'B.III.3.a'], 2, 1],
  ],
};
// RZiS: źródła z wariantu porównawczego (RP) albo kalkulacyjnego (RK) pełnego wzoru
const RZIS_MALA_RP = [
  ['A', 'Przychody netto ze sprzedaży i zrównane z nimi', ['A'], 1], ['A.I', 'Przychody netto ze sprzedaży', ['A.I', 'A.IV'], 2],
  ['A.II', 'Zmiana stanu produktów (zwiększenie – wartość dodatnia, zmniejszenie – wartość ujemna)', ['A.II'], 2], ['A.III', 'Koszt wytworzenia produktów na własne potrzeby jednostki', ['A.III'], 2],
  ['B', 'Koszty działalności operacyjnej', ['B'], 1], ['B.I', 'Amortyzacja', ['B.I'], 2], ['B.II', 'Zużycie materiałów i energii', ['B.II'], 2], ['B.III', 'Usługi obce', ['B.III'], 2],
  ['B.IV', 'Wynagrodzenia', ['B.V'], 2], ['B.V', 'Ubezpieczenia społeczne i inne świadczenia, w tym emerytalne', ['B.VI'], 2],
  ['B.VI', 'Pozostałe koszty (w tym podatki i opłaty)', ['B.IV', 'B.VII', 'B.VIII'], 2], ['B.VI.w1', 'wartość sprzedanych towarów i materiałów', ['B.VIII'], 3, 1],
  ['C', 'Zysk (strata) ze sprzedaży (A − B)', v => v.A - v.B, 1, 0, 1],
  ['D', 'Pozostałe przychody operacyjne', ['D'], 1], ['D.w1', 'aktualizacja wartości aktywów niefinansowych', ['D.III'], 2, 1],
  ['E', 'Pozostałe koszty operacyjne', ['E'], 1], ['E.w1', 'aktualizacja wartości aktywów niefinansowych', ['E.II'], 2, 1],
  ['F', 'Przychody finansowe', ['G'], 1], ['F.I', 'Dywidendy i udziały w zyskach', ['G.I'], 2], ['F.II', 'Odsetki', ['G.II'], 2],
  ['F.III', 'Zysk z tytułu rozchodu aktywów finansowych', ['G.III'], 2], ['F.IV', 'Aktualizacja wartości aktywów finansowych', ['G.IV'], 2],
  ['F.x', 'inne przychody finansowe (np. różnice kursowe) – ujęte w sumie F', ['G.V'], 2, 1],
  ['G', 'Koszty finansowe', ['H'], 1], ['G.I', 'Odsetki', ['H.I'], 2], ['G.II', 'Strata z tytułu rozchodu aktywów finansowych', ['H.II'], 2], ['G.III', 'Aktualizacja wartości aktywów finansowych', ['H.III'], 2],
  ['G.x', 'inne koszty finansowe (np. różnice kursowe) – ujęte w sumie G', ['H.IV'], 2, 1],
  ['H', 'Zysk (strata) brutto (C + D − E + F − G)', v => v.C + v.D - v.E + v.F - v.G, 1, 0, 1],
  ['I', 'Podatek dochodowy', ['J', 'K'], 1],
  ['J', 'Zysk (strata) netto (H − I)', v => v.H - v.I, 1, 0, 1],
];
const RZIS_MALA_RK = [
  ['A', 'Przychody netto ze sprzedaży produktów, towarów i materiałów', ['A'], 1], ['B', 'Koszty sprzedanych produktów, towarów i materiałów', ['B'], 1],
  ['C', 'Koszty sprzedaży', ['D'], 1], ['D', 'Koszty ogólnego zarządu', ['E'], 1],
  ['E', 'Zysk (strata) ze sprzedaży (A − B − C − D)', v => v.A - v.B - v.C - v.D, 1, 0, 1],
  ['F', 'Pozostałe przychody operacyjne', ['G'], 1], ['F.w1', 'aktualizacja wartości aktywów niefinansowych', ['G.III'], 2, 1],
  ['G', 'Pozostałe koszty operacyjne', ['H'], 1], ['G.w1', 'aktualizacja wartości aktywów niefinansowych', ['H.II'], 2, 1],
  ['H', 'Przychody finansowe', ['J'], 1], ['H.I', 'Dywidendy i udziały w zyskach', ['J.I'], 2], ['H.II', 'Odsetki', ['J.II'], 2],
  ['H.III', 'Zysk z tytułu rozchodu aktywów finansowych', ['J.III'], 2], ['H.IV', 'Aktualizacja wartości aktywów finansowych', ['J.IV'], 2],
  ['H.x', 'inne przychody finansowe – ujęte w sumie H', ['J.V'], 2, 1],
  ['I', 'Koszty finansowe', ['K'], 1], ['I.I', 'Odsetki', ['K.I'], 2], ['I.II', 'Strata z tytułu rozchodu aktywów finansowych', ['K.II'], 2], ['I.III', 'Aktualizacja wartości aktywów finansowych', ['K.III'], 2],
  ['I.x', 'inne koszty finansowe – ujęte w sumie I', ['K.IV'], 2, 1],
  ['J', 'Zysk (strata) brutto (E + F − G + H − I)', v => v.E + v.F - v.G + v.H - v.I, 1, 0, 1],
  ['K', 'Podatek dochodowy', ['M', 'N'], 1],
  ['L', 'Zysk (strata) netto (J − K)', v => v.J - v.K, 1, 0, 1],
];
const RZIS_MIKRO_RP = [
  ['A', 'Przychody podstawowej działalności operacyjnej i zrównane z nimi', ['A'], 1], ['A.w1', 'zmiana stanu produktów (zwiększenie – wartość dodatnia, zmniejszenie – wartość ujemna)', ['A.II'], 2, 1],
  ['B', 'Koszty podstawowej działalności operacyjnej', ['B'], 1], ['B.I', 'Amortyzacja', ['B.I'], 2], ['B.II', 'Zużycie materiałów i energii', ['B.II'], 2],
  ['B.III', 'Wynagrodzenia, ubezpieczenia społeczne i inne świadczenia', ['B.V', 'B.VI'], 2], ['B.IV', 'Pozostałe koszty', ['B.III', 'B.IV', 'B.VII', 'B.VIII'], 2],
  ['C', 'Pozostałe przychody i zyski', ['D', 'G'], 1], ['C.w1', 'aktualizacja wartości aktywów', ['D.III', 'G.IV'], 2, 1],
  ['D', 'Pozostałe koszty i straty', ['E', 'H'], 1], ['D.w1', 'aktualizacja wartości aktywów', ['E.II', 'H.III'], 2, 1],
  ['E', 'Podatek dochodowy', ['J', 'K'], 1],
  ['F', 'Zysk (strata) netto (A − B + C − D − E)', v => v.A - v.B + v.C - v.D - v.E, 1, 0, 1],
];
// mikro przy samych znacznikach kalkulacyjnych – bez podziału kosztów według rodzajów
const RZIS_MIKRO_RK = [
  ['A', 'Przychody podstawowej działalności operacyjnej i zrównane z nimi', ['A'], 1],
  ['B', 'Koszty podstawowej działalności operacyjnej (bez podziału na rodzaje – znaczniki kalkulacyjne)', ['B', 'D', 'E'], 1],
  ['C', 'Pozostałe przychody i zyski', ['G', 'J'], 1], ['C.w1', 'aktualizacja wartości aktywów', ['G.III', 'J.IV'], 2, 1],
  ['D', 'Pozostałe koszty i straty', ['H', 'K'], 1], ['D.w1', 'aktualizacja wartości aktywów', ['H.II', 'K.III'], 2, 1],
  ['E', 'Podatek dochodowy', ['M', 'N'], 1],
  ['F', 'Zysk (strata) netto (A − B + C − D − E)', v => v.A - v.B + v.C - v.D - v.E, 1, 0, 1],
];

// konta, które składają się na pozycje źródłowe (z pozycją pełnego wzoru i jej potomkami)
const collect = (map, srcs, pick) => {
  const out = [];
  for (const [k, n] of map) if (srcs.some(s => k === s)) for (const [kk, nn] of map) if ((kk === k || kk.startsWith(k + '.')) && nn.accounts.length) out.push(...nn.accounts.map(a => pick(a, kk)));
  const seen = new Set(); return out.filter(a => { const id = a.S_1 + '|' + a._p + '|' + (a.how || ''); if (seen.has(id)) return false; seen.add(id); return true; });
};

export function bilansSimple(B, wz) {
  const T = wz === 'mikro' ? BIL_MIKRO : BIL_MALA;
  const side = (rows, map) => rows.map(([key, name, srcs0, depth, wt]) => {
    // „X|Y” – pierwsza pozycja, która występuje w danych (np. środki pieniężne bez dalszego podziału)
    const srcs = srcs0.map(x => x.split('|').find(y => map.has(y)) || x.split('|')[0]);
    const start = srcs.reduce((s, p) => s + (map.get(p)?.start || 0), 0), end = srcs.reduce((s, p) => s + (map.get(p)?.end || 0), 0);
    return { key: wt ? '' : key, depth, name: wt ? `w tym: ${name}` : name, wt: !!wt, start: r2(start), end: r2(end),
      accounts: collect(map, srcs, (a, p) => ({ ...a, _p: p, how: [a.how, `poz. ${p}`].filter(Boolean).join(' · ') })) };
  });
  return { aktywa: side(T.aktywa, B.mapA), pasywa: side(T.pasywa, B.mapP), tA: B.tA, tP: B.tP };
}

export function rzisSimple(R, wz, variant) {
  const T = wz === 'mikro' ? (variant === 'RK' ? RZIS_MIKRO_RK : RZIS_MIKRO_RP) : (variant === 'RK' ? RZIS_MALA_RK : RZIS_MALA_RP);
  const v = {};
  const rows = T.map(([key, name, src, depth, wt, calc]) => {
    let val, accounts = [];
    if (typeof src === 'function') val = src(v);
    else {
      val = src.reduce((s, p) => s + (R.acc.get(p)?.v || 0), 0);
      accounts = collect(R.acc, src, (a, p) => ({ ...a, _p: p, how: `poz. ${p}` }));
    }
    if (!wt && !key.includes('.')) v[key] = val;
    return { key: wt ? '' : key.replace(/\.x$/, ''), depth, name: wt ? (key.endsWith('.x') ? name : `w tym: ${name}`) : name, wt: !!wt, calc: !!calc, v: r2(val), accounts };
  });
  const last = rows[rows.length - 1];
  return { variant: R.variant, rows, net: last.v, fromPostings: R.fromPostings, closingEntries: R.closingEntries };
}

// ---------- MAPOWANIE KONT: które konto, z jakim znacznikiem, trafia do której pozycji bilansu i RZiS ----------
const RZ_NAMES = { RP: Object.fromEntries(RZIS_P.rows.map(r => [r[0], r[1]])), RK: Object.fromEntries(RZIS_K.rows.map(r => [r[0], r[1]])) };
export function buildMapping(m, B = buildBilans(m), R = { RP: hasVariant(m, 'RP') ? buildRzis(m, 'RP') : null, RK: hasVariant(m, 'RK') ? buildRzis(m, 'RK') : null }) {
  const H = hierarchy(m);
  const rows = new Map(m.accounts.map(a => [a.S_1, {
    S_1: a.S_1, S_2: a.S_2 || '', S_12_1: a.S_12_1 || '', S_12_2: a.S_12_2 || '', S_12_3: a.S_12_3 || '',
    level: H.isLeaf(a) ? 'analityczne' : 'syntetyczne', saldo: r2(num(a.S_10) - num(a.S_11)),
    bil: [], rp: '', rk: '', note: '',
  }]));
  // kwoty z bilansu (konto może trafić do aktywów i pasywów – rozrachunki z dwoma znacznikami)
  const amt = new Map();
  for (const [map, side] of [[B.mapA, 'A'], [B.mapP, 'P']]) for (const n of map.values()) for (const ac of n.accounts) {
    const x = amt.get(ac.S_1) || { A: 0, P: 0 }; x[side] += ac.end; amt.set(ac.S_1, x);
  }
  for (const a of m.accounts) {
    const r = rows.get(a.S_1); if (!r || skipAcc(m, a, 'B')) continue;
    const mk = accMarkers(a), ba = mk.find(x => x.kind === 'BA'), bp = mk.find(x => x.kind === 'BP');
    const x = amt.get(a.S_1) || { A: 0, P: 0 };
    if (ba) r.bil.push(`Aktywa ${ba.path}${AKTYWA[ba.path] ? ' – ' + AKTYWA[ba.path] : ''} (${bp ? 'saldo Wn' : 'Wn − Ma'})`);
    if (bp) r.bil.push(`Pasywa ${bp.path}${PASYWA[bp.path] ? ' – ' + PASYWA[bp.path] : ''} (${ba ? 'saldo Ma' : 'Ma − Wn'})`);
    if (ba) r.bilA = r2(x.A);
    if (bp) r.bilP = r2(x.P);
  }
  for (const v of ['RP', 'RK']) if (R[v]) for (const [path, n] of R[v].acc) for (const ac of n.accounts) {
    const r = rows.get(ac.S_1); if (!r) continue;
    r[v.toLowerCase()] = `${path}${RZ_NAMES[v][path] ? ' – ' + RZ_NAMES[v][path] : ''}`; r[v.toLowerCase() + 'V'] = ac.v;
  }
  const accBy = new Map(m.accounts.map(a => [a.S_1, a]));
  for (const r of rows.values()) {
    const a = accBy.get(r.S_1);
    const active = [a.S_4, a.S_5, a.S_6, a.S_7, a.S_10, a.S_11].some(x => Math.abs(num(x)) >= 0.005);
    if (r.level === 'syntetyczne' && !r.bil.length && !r.rp && !r.rk) r.note = 'konto nadrzędne – kwoty liczone na kontach analitycznych';
    else if (!String(r.S_12_1).trim() && active) r.note = 'brak znacznika – poza bilansem i RZiS';
    else if (!r.bil.length && !r.rp && !r.rk && active) r.note = /^INNE$/i.test(String(r.S_12_1).trim()) ? 'znacznik INNE – poza bilansem i RZiS' : 'znacznik nie wskazuje pozycji bilansu ani RZiS';
    else if (!r.bil.length && (r.rp || r.rk)) r.note = 'konto wynikowe – w bilansie przez wynik (pasywa A.VI)';
    r.bilTxt = r.bil.join('; '); r.cat = r.bil.length ? (r.rp || r.rk ? 'oba' : 'bilans') : r.rp || r.rk ? 'rzis' : (r.note.startsWith('konto nadrzędne') ? 'synt' : 'brak');
    r.active = active;
  }
  return [...rows.values()];
}
