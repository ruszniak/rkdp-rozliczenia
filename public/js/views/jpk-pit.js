// JPK dla PIT: JPK_PKPIR (podatkowa księga przychodów i rozchodów, wariant 3 od 2026; też wariant 2) oraz JPK_EWP (ewidencja przychodów – ryczałt, wariant 4).
// Czysta logika: odczyt pliku, sumy kontrolne, kontrole wierszy i zestawienia (miesiące, stawki, kontrahenci). Plik nie opuszcza przeglądarki.

const num = v => { if (v === undefined || v === null || v === '') return 0; const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const r2 = n => Math.round(n * 100) / 100;
const kids = el => [...el.children];
const leafObj = el => { const o = {}; for (const c of kids(el)) if (!c.children.length) o[c.localName] = c.textContent.trim(); return o; };
const all = (doc, name) => [...doc.getElementsByTagNameNS('*', name)];
const first = (doc, name) => doc.getElementsByTagNameNS('*', name)[0] || null;
const fmt = n => (Math.abs(n) < 0.005 ? 0 : n).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---------- opisy pól ----------
export const PKPIR_L = {
  K_1: 'Lp.', K_2: 'Data zdarzenia', K_3A: 'Nr dowodu', K_3B: 'Nr KSeF', K_3: 'Nr dowodu', K_4A: 'Kraj (kontrahent)', K_4B: 'NIP / id kontrahenta',
  K_4: 'Kontrahent', K_5A: 'Kontrahent', K_5B: 'Adres kontrahenta', K_5: 'Adres kontrahenta', K_6: 'Opis zdarzenia',
  K_7: 'Przychód ze sprzedaży (7)', K_8: 'Pozostałe przychody (8)', K_9: 'Razem przychód (9)', K_9A: 'Przychód – rolnik (nie wypełnia się)',
  K_10: 'Zakup towarów i materiałów (10)', K_11: 'Koszty uboczne zakupu (11)', K_12: 'Wynagrodzenia (12)', K_13: 'Pozostałe wydatki (13)',
  K_14: 'Razem wydatki (14)', K_14A: 'Wydatki – rolnik (nie wypełnia się)', K_15: 'Wolna kolumna (15)', K_16A: 'Koszty B+R – opis', K_16B: 'Koszty B+R – wartość', K_17: 'Uwagi',
  P_1: 'Remanent na początek roku', P_2: 'Remanent na koniec roku', P_3: 'Koszty uzyskania przychodu (wg objaśnień do KPiR)', P_4: 'Dochód w roku podatkowym',
  P_5A: 'Data spisu z natury', P_5B: 'Wartość spisu z natury',
  LiczbaWierszy: 'Liczba wierszy', SumaPrzychodow: 'Suma przychodów',
};
export const EWP_L = {
  K_1: 'Lp.', K_2: 'Data wpisu', K_3: 'Data uzyskania przychodu', K_4: 'Nr dowodu', K_5: 'Nr KSeF', K_6: 'Kraj (kontrahent)', K_7: 'NIP / id kontrahenta',
  K_8: 'Kwota przychodu', K_9: 'Stawka ryczałtu (%)', K_10: 'Uwagi', LiczbaWierszy: 'Liczba wierszy', SumaPrzychodow: 'Suma przychodów',
};
export const PKPIR_NUM = new Set(['K_7', 'K_8', 'K_9', 'K_9A', 'K_10', 'K_11', 'K_12', 'K_13', 'K_14', 'K_14A', 'K_15', 'K_16B', 'P_1', 'P_2', 'P_3', 'P_4', 'P_5B']);
export const EWP_NUM = new Set(['K_8']);
// stawki ryczałtu (art. 12 ustawy o zryczałtowanym podatku dochodowym)
export const EWP_RATES = ['17', '15', '14', '12.5', '12', '10', '8.5', '5.5', '3', '2'];

const rateKey = v => { const n = num(String(v).replace('%', '')); return n > 0 && n < 1 ? String(r2(n * 100)) : String(n); };
const validNip = s => { const d = String(s || '').replace(/\D/g, ''); if (!/^\d{10}$/.test(d)) return false; const w = [6, 5, 7, 2, 3, 4, 5, 6, 7]; const c = w.reduce((a, x, i) => a + x * +d[i], 0) % 11; return c !== 10 && c === +d[9]; };
const KSEF_RE = /^\d{10}-\d{8}-[0-9A-F]{6}-[0-9A-F]{6}-[0-9A-F]{2}$|^\d{10}-\d{8}-[0-9A-Z]{6,}-[0-9A-Z]{2}$/i;
const month = d => String(d || '').slice(0, 7);
const MONTHS = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
export const monthLabel = ym => /^\d{4}-\d{2}$/.test(ym) ? `${MONTHS[+ym.slice(5) - 1]} ${ym.slice(0, 4)}` : (ym || 'bez daty');

// ---------- odczyt ----------
export function parsePit(doc, code) {
  const isEwp = /EWP/i.test(code) || !!first(doc, 'EWPWiersz');
  const rowName = isEwp ? 'EWPWiersz' : 'PKPIRWiersz';
  let rows = all(doc, rowName).map(leafObj);
  if (!rows.length) rows = all(doc, 'K_1').map(k => leafObj(k.parentNode)); // inne nazwy węzłów wierszy
  rows.forEach((r, i) => { r._i = i; });
  const ctrlEl = first(doc, isEwp ? 'EWPCtrl' : 'PKPIRCtrl') || first(doc, 'Ctrl');
  const info = first(doc, 'PKPIRInfo') ? leafObj(first(doc, 'PKPIRInfo')) : null;
  const spis = all(doc, 'PKPIRSpis').map(leafObj).filter(s => s.P_5A || s.P_5B);
  const pod = first(doc, 'Podmiot1');
  const flags = { Kasowy_PIT: pod && first(pod, 'Kasowy_PIT') ? first(pod, 'Kasowy_PIT').textContent.trim() : '', Rolnik_PIT: pod && first(pod, 'Rolnik_PIT') ? first(pod, 'Rolnik_PIT').textContent.trim() : '' };
  return { kind: isEwp ? 'ewp' : 'kpir', rows, ctrl: ctrlEl ? leafObj(ctrlEl) : {}, info, spis, flags };
}

// ---------- analiza ----------
const issue = (level, title, text, items = [], go = null) => ({ level, title, text, accounts: items, go });
const itemOf = (r, info) => ({ S_1: String(r.K_1 ?? r._i + 1), S_2: [r.K_3A || r.K_3 || r.K_4, r.K_5A || r.K_4 || r.K_7, r.K_6].filter(Boolean).join(' · ').slice(0, 120), info });

export function analyzePit(m) {
  if (m._pa) return m._pa;
  const ewp = m.kind === 'ewp', R = m.rows, H = m.header || {};
  const iss = [];
  const sum = k => r2(R.reduce((s, r) => s + num(r[k]), 0));
  // sumy kontrolne
  const sumKey = ewp ? 'K_8' : 'K_9';
  const calc = { LiczbaWierszy: R.length, SumaPrzychodow: sum(sumKey) };
  const ctrlRows = ['LiczbaWierszy', 'SumaPrzychodow'].map(k => ({ k, file: m.ctrl[k], calc: calc[k], ok: m.ctrl[k] === undefined ? null : Math.abs(num(m.ctrl[k]) - calc[k]) < 0.005 }));
  for (const c of ctrlRows) {
    if (c.ok === false) iss.push(issue('error', `Suma kontrolna ${c.k} nie zgadza się z danymi`, `W pliku: ${c.k === 'LiczbaWierszy' ? m.ctrl[c.k] : fmt(num(m.ctrl[c.k]))}, wyliczone z wierszy: ${c.k === 'LiczbaWierszy' ? c.calc : fmt(c.calc)}${c.k === 'SumaPrzychodow' ? ` (suma kolumny ${sumKey})` : ''}.`));
    if (c.ok === null) iss.push(issue('error', `Brak sumy kontrolnej ${c.k}`, `Plik nie zawiera elementu ${ewp ? 'EWPCtrl' : 'PKPIRCtrl'}/${c.k} – plik nie przejdzie walidacji schematu.`));
  }
  // numeracja (Lp.)
  const lps = R.map(r => num(r.K_1));
  const dupLp = [...new Set(lps.filter((x, i) => lps.indexOf(x) !== i))];
  if (dupLp.length) iss.push(issue('error', 'Powtórzone numery Lp. (K_1)', `Numery: ${dupLp.slice(0, 10).join(', ')}${dupLp.length > 10 ? '…' : ''}.`, R.filter(r => dupLp.includes(num(r.K_1))).slice(0, 40).map(r => itemOf(r))));
  const sorted = [...lps].sort((a, b) => a - b);
  const gaps = []; for (let i = 1; i < sorted.length; i++) if (sorted[i] - sorted[i - 1] > 1) gaps.push(`${sorted[i - 1] + 1}${sorted[i] - sorted[i - 1] > 2 ? '–' + (sorted[i] - 1) : ''}`);
  if (gaps.length) iss.push(issue('warn', 'Luki w numeracji Lp. (K_1)', `Brakujące numery: ${gaps.slice(0, 12).join(', ')}${gaps.length > 12 ? '…' : ''}. Numeracja wpisów powinna być ciągła.`));
  if (sorted.length && sorted[0] !== 1) iss.push(issue('warn', 'Numeracja nie zaczyna się od 1', `Pierwszy numer Lp.: ${sorted[0]}. Przy pliku za cały rok numeracja zaczyna się zwykle od 1.`));
  // daty
  const dKey = ewp ? 'K_2' : 'K_2';
  const out = R.filter(r => r[dKey] && ((H.DataOd && r[dKey] < H.DataOd) || (H.DataDo && r[dKey] > H.DataDo)));
  if (out.length) iss.push(issue('error', `Daty ${ewp ? 'wpisu' : 'zdarzenia'} poza okresem pliku`, `Okres pliku: ${H.DataOd || '…'} – ${H.DataDo || '…'}. Wierszy poza okresem: ${out.length}.`, out.slice(0, 40).map(r => itemOf(r, r[dKey]))));
  const noDate = R.filter(r => !r[dKey]);
  if (noDate.length) iss.push(issue('error', 'Wiersze bez daty', `Wierszy bez daty (${dKey}): ${noDate.length}.`, noDate.slice(0, 40).map(r => itemOf(r))));
  const byLp = [...R].sort((a, b) => num(a.K_1) - num(b.K_1)); const back = [];
  for (let i = 1; i < byLp.length; i++) if (byLp[i][dKey] && byLp[i - 1][dKey] && byLp[i][dKey] < byLp[i - 1][dKey]) back.push(byLp[i]);
  if (back.length) iss.push(issue('warn', 'Wpisy niechronologiczne', `Wierszy z datą wcześniejszą niż poprzedni wpis (wg Lp.): ${back.length}. Ewidencję prowadzi się w kolejności chronologicznej.`, back.slice(0, 40).map(r => itemOf(r, r[dKey]))));
  // kontrahenci: NIP, KSeF
  const ctryK = ewp ? 'K_6' : 'K_4A', idK = ewp ? 'K_7' : 'K_4B', ksefK = ewp ? 'K_5' : 'K_3B';
  const badNip = R.filter(r => r[idK] && (!r[ctryK] || r[ctryK] === 'PL') && /^\d{10}$/.test(String(r[idK]).replace(/\D/g, '')) && !validNip(r[idK]));
  if (badNip.length) iss.push(issue('warn', 'Nieprawidłowy NIP kontrahenta', `NIP z błędną sumą kontrolną: ${badNip.length}.`, badNip.slice(0, 40).map(r => itemOf(r, r[idK]))));
  const badKsef = R.filter(r => r[ksefK] && !KSEF_RE.test(r[ksefK]));
  if (badKsef.length) iss.push(issue('warn', 'Numer KSeF w nietypowym formacie', `Wierszy: ${badKsef.length}. Numer KSeF ma postać NIP-RRRRMMDD-XXXXXX-XXXXXX-XX.`, badKsef.slice(0, 40).map(r => itemOf(r, r[ksefK]))));
  const docKey = ewp ? 'K_4' : (R.some(r => r.K_3A) ? 'K_3A' : 'K_3');
  const seen = new Map(); const dupDoc = [];
  for (const r of R) { const k = [r[docKey], r[idK] || r.K_5A || r.K_4 || ''].join('|').toLowerCase(); if (!r[docKey]) continue; if (seen.has(k)) dupDoc.push(r); else seen.set(k, r); }
  if (dupDoc.length) iss.push(issue('warn', 'Ten sam dowód wpisany więcej niż raz', `Wierszy z powtórzonym numerem dowodu u tego samego kontrahenta: ${dupDoc.length}. Sprawdź, czy to nie podwójne zaksięgowanie (korekty i płatności częściowe są w porządku).`, dupDoc.slice(0, 40).map(r => itemOf(r))));

  let res;
  if (ewp) {
    const badRate = R.filter(r => !EWP_RATES.includes(rateKey(r.K_9)));
    if (badRate.length) iss.push(issue('error', 'Nieznana stawka ryczałtu (K_9)', `Wierszy: ${badRate.length}. Dozwolone stawki: ${EWP_RATES.join('%, ')}%.`, badRate.slice(0, 40).map(r => itemOf(r, r.K_9 || 'brak'))));
    const late = R.filter(r => r.K_2 && r.K_3 && r.K_2 < r.K_3);
    if (late.length) iss.push(issue('warn', 'Data wpisu wcześniejsza niż data uzyskania przychodu', `Wierszy: ${late.length} (K_2 < K_3).`, late.slice(0, 40).map(r => itemOf(r, `wpis ${r.K_2}, przychód ${r.K_3}`))));
    const noDoc = R.filter(r => !r.K_4);
    if (noDoc.length) iss.push(issue('error', 'Brak numeru dowodu (K_4)', `Wierszy: ${noDoc.length}.`, noDoc.slice(0, 40).map(r => itemOf(r))));
    const zero = R.filter(r => !num(r.K_8));
    if (zero.length) iss.push(issue('warn', 'Wiersze z kwotą 0', `Wierszy z zerową kwotą przychodu: ${zero.length}.`, zero.slice(0, 40).map(r => itemOf(r))));
    // zestawienia: stawki i miesiące
    const rates = new Map();
    for (const r of R) { const k = rateKey(r.K_9); const o = rates.get(k) || { rate: k, n: 0, przychod: 0 }; o.n++; o.przychod = r2(o.przychod + num(r.K_8)); rates.set(k, o); }
    const rateRows = [...rates.values()].map(o => ({ ...o, ryczalt: r2(o.przychod * num(o.rate) / 100) })).sort((a, b) => num(b.rate) - num(a.rate));
    const mon = new Map();
    for (const r of R) { const k = month(m.flags?.Kasowy_PIT === '1' ? r.K_3 : r.K_3 || r.K_2); const o = mon.get(k) || { month: k, n: 0, przychod: 0, ryczalt: 0 }; o.n++; o.przychod = r2(o.przychod + num(r.K_8)); o.ryczalt = r2(o.ryczalt + num(r.K_8) * num(rateKey(r.K_9)) / 100); mon.set(k, o); }
    let cum = 0; const months = [...mon.values()].sort((a, b) => a.month.localeCompare(b.month)).map(o => ({ ...o, label: monthLabel(o.month), narast: (cum = r2(cum + o.przychod)) }));
    res = { rateRows, months, totals: { przychod: calc.SumaPrzychodow, ryczalt: r2(rateRows.reduce((s, x) => s + x.ryczalt, 0)) } };
  } else {
    // K_9 = K_7 + K_8, K_14 = K_12 + K_13
    const b9 = R.filter(r => Math.abs(num(r.K_9) - num(r.K_7) - num(r.K_8)) >= 0.005);
    if (b9.length) iss.push(issue('error', 'Razem przychód ≠ sprzedaż + pozostałe (K_9 ≠ K_7 + K_8)', `Wierszy: ${b9.length}.`, b9.slice(0, 40).map(r => itemOf(r, `K_9 ${fmt(num(r.K_9))}, K_7+K_8 ${fmt(num(r.K_7) + num(r.K_8))}`))));
    const b14 = R.filter(r => Math.abs(num(r.K_14) - num(r.K_12) - num(r.K_13)) >= 0.005);
    if (b14.length) iss.push(issue('error', 'Razem wydatki ≠ wynagrodzenia + pozostałe (K_14 ≠ K_12 + K_13)', `Wierszy: ${b14.length}.`, b14.slice(0, 40).map(r => itemOf(r, `K_14 ${fmt(num(r.K_14))}, K_12+K_13 ${fmt(num(r.K_12) + num(r.K_13))}`))));
    const farm = R.filter(r => num(r.K_9A) || num(r.K_14A));
    if (farm.length || m.flags?.Rolnik_PIT) iss.push(issue('warn', 'Wypełnione pola dla rolników (K_9A / K_14A / Rolnik_PIT)', 'Te pola nie mają już zastosowania i nie powinny być wypełniane.', farm.slice(0, 40).map(r => itemOf(r))));
    const empty = R.filter(r => ['K_7', 'K_8', 'K_10', 'K_11', 'K_12', 'K_13', 'K_15', 'K_16B'].every(k => !num(r[k])));
    if (empty.length) iss.push(issue('warn', 'Wiersze bez żadnej kwoty', `Wierszy: ${empty.length}.`, empty.slice(0, 40).map(r => itemOf(r))));
    const noCp = R.filter(r => r.K_3A !== undefined && (!r.K_5A || !r.K_5B));
    if (noCp.length) iss.push(issue('warn', 'Brak nazwy lub adresu kontrahenta (K_5A / K_5B)', `Wierszy: ${noCp.length}. W wariancie 3 to pola obowiązkowe (dla zdarzeń bez kontrahenta, np. amortyzacji, wpisuje się np. „nie dotyczy”).`, noCp.slice(0, 40).map(r => itemOf(r))));
    const br = R.filter(r => (num(r.K_16B) && !r.K_16A) || (!num(r.K_16B) && r.K_16A));
    if (br.length) iss.push(issue('warn', 'Koszty B+R bez opisu lub opis bez kwoty (K_16A / K_16B)', `Wierszy: ${br.length}.`, br.slice(0, 40).map(r => itemOf(r))));
    const noDoc = R.filter(r => !(r.K_3A || r.K_3));
    if (noDoc.length) iss.push(issue('error', 'Brak numeru dowodu', `Wierszy: ${noDoc.length}.`, noDoc.slice(0, 40).map(r => itemOf(r))));
    // zestawienie miesięczne (jak podsumowanie KPiR)
    const mon = new Map();
    for (const r of R) {
      const k = month(r.K_2); const o = mon.get(k) || { month: k, n: 0, K_7: 0, K_8: 0, K_9: 0, K_10: 0, K_11: 0, K_12: 0, K_13: 0, K_14: 0, K_15: 0, K_16B: 0 };
      o.n++; for (const f of ['K_7', 'K_8', 'K_9', 'K_10', 'K_11', 'K_12', 'K_13', 'K_14', 'K_15', 'K_16B']) o[f] = r2(o[f] + num(r[f])); mon.set(k, o);
    }
    let cP = 0, cK = 0;
    const months = [...mon.values()].sort((a, b) => a.month.localeCompare(b.month)).map(o => {
      const koszty = r2(o.K_10 + o.K_11 + o.K_14);
      cP = r2(cP + o.K_9); cK = r2(cK + koszty);
      return { ...o, label: monthLabel(o.month), koszty, wynik: r2(o.K_9 - koszty), narastP: cP, narastK: cK, narastW: r2(cP - cK) };
    });
    const T = Object.fromEntries(['K_7', 'K_8', 'K_9', 'K_10', 'K_11', 'K_12', 'K_13', 'K_14', 'K_15', 'K_16B'].map(k => [k, sum(k)]));
    // dochód roczny wg objaśnień do KPiR: koszty = zakupy (10+11) + wydatki (14) + remanent początkowy − remanent końcowy
    let roczne = null;
    if (m.info && (m.info.P_1 !== undefined || m.info.P_3 !== undefined)) {
      const P1 = num(m.info.P_1), P2 = num(m.info.P_2);
      const kosztyCalc = r2(T.K_10 + T.K_11 + T.K_14 + P1 - P2), dochodCalc = r2(T.K_9 - num(m.info.P_3));
      roczne = { P1, P2, P3: num(m.info.P_3), P4: num(m.info.P_4), kosztyCalc, dochodCalc };
      if (m.info.P_3 !== undefined && Math.abs(num(m.info.P_3) - kosztyCalc) >= 0.005) iss.push(issue('warn', 'Koszty roczne (P_3) różnią się od wyliczenia z księgi', `P_3 w pliku: ${fmt(num(m.info.P_3))}; z księgi: zakupy ${fmt(T.K_10 + T.K_11)} + wydatki ${fmt(T.K_14)} + remanent początkowy ${fmt(P1)} − remanent końcowy ${fmt(P2)} = ${fmt(kosztyCalc)}. Różnica może wynikać z korekt kosztów (np. art. 24d) – sprawdź.`));
      if (m.info.P_4 !== undefined && Math.abs(num(m.info.P_4) - dochodCalc) >= 0.005) iss.push(issue('error', 'Dochód (P_4) ≠ przychody − koszty (P_3)', `P_4 w pliku: ${fmt(num(m.info.P_4))}; przychody (suma K_9) ${fmt(T.K_9)} − koszty P_3 ${fmt(num(m.info.P_3))} = ${fmt(dochodCalc)}.`));
    }
    res = { months, totals: { ...T, koszty: r2(T.K_10 + T.K_11 + T.K_14), wynik: r2(T.K_9 - T.K_10 - T.K_11 - T.K_14) }, roczne };
  }
  // kontrahenci
  const cp = new Map();
  for (const r of R) {
    const id = String(r[idK] || '').trim(), name = ewp ? '' : (r.K_5A || r.K_4 || '');
    const key = (id || name || '(brak)').toLowerCase();
    const o = cp.get(key) || { id, name, n: 0, przychod: 0, wydatki: 0 };
    o.n++; o.przychod = r2(o.przychod + num(ewp ? r.K_8 : r.K_9)); if (!ewp) o.wydatki = r2(o.wydatki + num(r.K_10) + num(r.K_11) + num(r.K_14)); if (!o.name && name) o.name = name;
    cp.set(key, o);
  }
  const contractors = [...cp.values()].sort((a, b) => (b.przychod + b.wydatki) - (a.przychod + a.wydatki));
  m._pa = { ctrlRows, issues: iss, contractors, ...res };
  return m._pa;
}
