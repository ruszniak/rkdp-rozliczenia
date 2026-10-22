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
  return { aktywa: rowsFrom(A, AKTYWA, ['A', 'B', 'C', 'D']), pasywa: rowsFrom(P, PASYWA, ['A', 'B']), tA, tP, warnings, unclosed: r2(rEnd) };
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
  const turn = new Map();
  for (const p of m.postings) {
    if (p._d !== null && p._d !== undefined && closing.has(p._d)) continue;
    const t = turn.get(p.Z_3) || { wn: 0, ma: 0 }; t.wn += num(p.Z_4); t.ma += num(p.Z_7); turn.set(p.Z_3, t);
  }
  const usePostings = m.postings.length > 0;
  const sign = Object.fromEntries(T.rows.filter(r => r[2]).map(r => [r[0], r[2]]));
  const acc = new Map();
  for (const a of m.accounts) {
    const mk = accMarkers(a).find(x => x.kind === variant);
    if (!mk) continue;
    const t = usePostings ? (turn.get(a.S_1) || { wn: 0, ma: 0 }) : { wn: num(a.S_8), ma: num(a.S_9) };
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
  return { variant: T.name, rows, net: r2(vals[T.result]), closingEntries: closing.size, fromPostings: usePostings };
}
