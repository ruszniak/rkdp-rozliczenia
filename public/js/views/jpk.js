// Podgląd plików JPK – JPK_KR_PD (JPK_CIT: księgi rachunkowe), JPK_ST_KR (środki trwałe) oraz dowolny inny JPK (tabele ogólne).
// Plik jest czytany wyłącznie w przeglądarce – nic nie jest wysyłane na serwer ani zapisywane w bazie.
import { h, toast, infoTip, printHtml, modal, icon } from '../ui.js';
import { downloadXlsx } from '../xlsx.js';
import { buildBilans, buildRzis, hasVariant, validateKr, WZORY, bilansSimple, rzisSimple } from './jpk-fin.js';

const HELP = `Podgląd plików JPK (JPK_CIT):
• Przeciągnij plik XML albo kliknij „Wybierz plik”. Obsługiwane: JPK_KR_PD (księgi rachunkowe), JPK_ST_KR (środki trwałe), a także inne pliki JPK – jako tabele.
• Plik jest otwierany tylko na Twoim komputerze – nie trafia na serwer ani do bazy.
• Podsumowanie pokazuje dane podmiotu, okres, sumy kontrolne i kontrolę bilansu (Wn = Ma).
• Konta: kliknij konto, aby zobaczyć jego zapisy. Dziennik: kliknij zapis, aby zobaczyć dekretację.
• Znaczniki: sumy obrotów i sald według znaczników kont (S_12_1, S_12_2, S_12_3 – znacznik podatkowy).
• Bilans i RZiS: zestawienia pomocnicze wyliczane przez aplikację ze znaczników kont i sald – nie są częścią pliku JPK ani sprawozdaniem finansowym. Konto z dwoma znacznikami (aktywa i pasywa) trafia saldem Wn do aktywów, a saldem Ma do pasywów.
• „Pobierz Excel” zapisuje wszystkie tabele, „PDF” – raport z podsumowaniem i zestawieniem obrotów i sald.`;

// ---------- opisy pól ----------
const L = {
  // Naglowek
  KodFormularza: 'Kod formularza', WariantFormularza: 'Wariant', CelZlozenia: 'Cel złożenia', DataWytworzeniaJPK: 'Data wytworzenia',
  DataOd: 'Okres od', DataDo: 'Okres do', RokDataOd: 'Rok obrotowy od', RokDataDo: 'Rok obrotowy do', RokPdDataOd: 'Rok podatkowy od', RokPdDataDo: 'Rok podatkowy do',
  DomyslnyKodWaluty: 'Waluta', KodUrzedu: 'Kod urzędu skarbowego', NIP: 'NIP', PelnaNazwa: 'Nazwa', REGON: 'REGON', Znacznik_EST: 'CIT estoński', Znacznik_MSSF: 'MSSF',
  // ZOiS
  S_1: 'Konto', S_2: 'Nazwa konta', S_3: 'Konto nadrzędne', S_4: 'BO Wn', S_5: 'BO Ma', S_6: 'Obroty Wn (okres)', S_7: 'Obroty Ma (okres)',
  S_8: 'Obroty Wn narast.', S_9: 'Obroty Ma narast.', S_10: 'Saldo Wn', S_11: 'Saldo Ma', S_12_1: 'Znacznik 1', S_12_2: 'Znacznik 2', S_12_3: 'Znacznik PD',
  // Dziennik
  D_1: 'Nr zapisu', D_2: 'Dziennik częściowy', D_3: 'Kontrahent', D_4: 'Nr dowodu', D_5: 'Rodzaj dowodu', D_6: 'Data operacji', D_7: 'Data dowodu',
  D_8: 'Data księgowania', D_9: 'Osoba odpowiedzialna', D_10: 'Opis operacji', D_11: 'Kwota operacji', D_12: 'Nr KSeF',
  // KontoZapis
  Z_1: 'Nr pozycji', Z_2: 'Opis pozycji', Z_3: 'Konto', Z_4: 'Wn', Z_5: 'Wn w walucie', Z_6: 'Waluta Wn', Z_7: 'Ma', Z_8: 'Ma w walucie', Z_9: 'Waluta Ma',
  // Kontrahent
  T_1: 'Kod kontrahenta', T_2: 'Kraj', T_3: 'NIP / nr identyfikacyjny',
  // Ctrl
  C_1: 'Liczba zapisów w dzienniku', C_2: 'Suma kwot operacji (D_11)', C_3: 'Liczba pozycji na kontach', C_4: 'Suma Wn (Z_4)', C_5: 'Suma Ma (Z_7)',
  // RPD
  K_1: 'Przychody zwolnione (różnice trwałe)', K_2: 'Przychody niepodlegające opodatkowaniu w roku bieżącym', K_3: 'Przychody podatkowe ujęte w księgach lat ubiegłych',
  K_4: 'Koszty niestanowiące KUP (różnice trwałe)', K_5: 'Koszty nieuznane za KUP w roku bieżącym', K_6: 'KUP roku bieżącego ujęte w księgach lat ubiegłych',
  K_7: 'Przychody podatkowe nieujęte w księgach', K_8: 'KUP nieujęte w księgach',
  // ST_KR
  E_1: 'Nr inwentarzowy', E_2: 'Data nabycia (ŚT)', E_3: 'Data nabycia (WNiP)', E_4: 'Data przyjęcia do używania', E_5: 'Dokument OT', E_6: 'Rodzaj dokumentu nabycia',
  E_7: 'Nazwa', E_8: 'KŚT', E_9_1: 'Metoda amort. podatk.', E_9_2: 'Metoda 2', E_9_3: 'Metoda 3', E_10A: 'Stawka podatk. %', E_10B: 'Stawka podatk. kwota',
  E_11: 'Stawka podatk. skorygowana %', E_12: 'Wartość pocz. podatkowa', E_13: 'Wart. pocz. podatk. po aktualizacji', E_14: 'Umorzenie podatk. po aktualizacji',
  E_15: 'Zmiana wart. pocz. podatk.', E_16: 'Umorzenie podatk. przed ewidencją', E_17: 'Częstotliwość amortyzacji', E_18: 'Amortyzacja niebędąca KUP',
  E_19: 'Amortyzacja podatkowa w roku', E_20: 'Umorzenie podatkowe narastająco', E_21: 'Wartość pocz. bilansowa', E_22: 'Wart. pocz. bil. po aktualizacji',
  E_23: 'Umorzenie bil. po aktualizacji', E_24: 'Zmiana wart. pocz. bil.', E_25A: 'Stawka bilansowa %', E_25B: 'Stawka bilansowa kwota',
  E_26: 'Amortyzacja bilansowa w roku', E_27: 'Umorzenie bilansowe narastająco', E_28: 'Data wykreślenia', E_29: 'Przyczyna wykreślenia',
  E_30: 'Dokument wykreślenia', E_31: 'Nr KSeF', E_32: 'Przeklasyfikowanie (1 tak / 2 nie)',
};
const NUM = new Set(['S_4', 'S_5', 'S_6', 'S_7', 'S_8', 'S_9', 'S_10', 'S_11', 'D_11', 'Z_4', 'Z_5', 'Z_7', 'Z_8', 'C_1', 'C_2', 'C_3', 'C_4', 'C_5',
  'K_1', 'K_2', 'K_3', 'K_4', 'K_5', 'K_6', 'K_7', 'K_8', 'E_10A', 'E_10B', 'E_11', 'E_12', 'E_13', 'E_14', 'E_15', 'E_16', 'E_18', 'E_19', 'E_20',
  'E_21', 'E_22', 'E_23', 'E_24', 'E_25A', 'E_25B', 'E_26', 'E_27']);
const CEL = { 1: 'złożenie pliku', 2: 'korekta' };
const lbl = k => L[k] || k.replace(/_/g, ' ');

// ---------- liczby i formaty ----------
const num = v => { if (v === undefined || v === null || v === '') return 0; const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const r2 = n => Math.round(n * 100) / 100;
const fmtN = (n, dec = 2) => (n === '' || n === undefined || n === null) ? '' : (Math.abs(Number(n)) < 0.005 ? 0 : Number(n)).toLocaleString('pl-PL', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const fmtInt = n => Number(n).toLocaleString('pl-PL');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- czytanie XML ----------
const kids = el => [...el.children];
const leafObj = el => { const o = {}; for (const c of kids(el)) if (!c.children.length) o[c.localName] = c.textContent.trim(); return o; };
const all = (doc, name) => [...doc.getElementsByTagNameNS('*', name)];
const first = (doc, name) => doc.getElementsByTagNameNS('*', name)[0] || null;

async function readText(file) {
  const buf = await file.arrayBuffer();
  const head = new TextDecoder('latin1').decode(buf.slice(0, 300));
  const enc = (head.match(/encoding=["']([\w-]+)["']/i) || [])[1] || 'utf-8';
  try { return new TextDecoder(enc.toLowerCase()).decode(buf); } catch { return new TextDecoder('utf-8').decode(buf); }
}

function parseJpk(text, fileName) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('To nie jest poprawny plik XML.');
  const kf = first(doc, 'KodFormularza');
  const code = (kf?.getAttribute('kodSystemowy') || kf?.textContent || doc.documentElement.localName || '').trim();
  const nag = first(doc, 'Naglowek');
  const header = nag ? leafObj(nag) : {};
  if (kf) header.KodFormularza = code + (kf.getAttribute('wersjaSchemy') ? ` · schemat ${kf.getAttribute('wersjaSchemy')}` : '');
  const pod = first(doc, 'Podmiot1');
  const subject = {};
  if (pod) {
    const id = first(pod, 'IdentyfikatorPodmiotu') || pod;
    Object.assign(subject, leafObj(id));
    const adr = first(pod, 'AdresPol') || first(pod, 'AdresZagr');
    if (adr) {
      const a = leafObj(adr);
      subject.Adres = [[a.Ulica, [a.NrDomu, a.NrLokalu].filter(Boolean).join('/')].filter(Boolean).join(' '), [a.KodPocztowy, a.Miejscowosc].filter(Boolean).join(' '), a.KodKraju && a.KodKraju !== 'PL' ? a.KodKraju : ''].filter(Boolean).join(', ');
    }
    for (const k of ['Znacznik_EST', 'Znacznik_MSSF']) { const e = first(pod, k); if (e) subject[k] = e.textContent.trim() || 'tak'; }
  }
  const base = { fileName, code, header, subject };
  if (/KR_PD/i.test(code) || first(doc, 'ZOiS')) return { ...base, kind: 'kr_pd', ...parseKrPd(doc) };
  if (/ST_KR/i.test(code) || (first(doc, 'E_1') && first(doc, 'E_21'))) return { ...base, kind: 'st_kr', ...parseStKr(doc) };
  return { ...base, kind: 'generic', groups: parseGeneric(doc) };
}

function parseKrPd(doc) {
  // ZOiS: wiersze kont w węzłach ZOiS1…ZOiS8 (każdy węzeł z polem S_1)
  const accounts = all(doc, 'S_1').map(s1 => s1.parentNode).filter((p, i, a) => a.indexOf(p) === i).map(p => ({ _typ: p.localName, ...leafObj(p) }));
  const contractors = all(doc, 'T_1').map(t => leafObj(t.parentNode));
  const journal = [], postings = [];
  for (const d of all(doc, 'D_1').map(x => x.parentNode)) {
    const o = leafObj(d); o._i = journal.length; o._z = [];
    for (const z of kids(d).filter(c => c.localName === 'KontoZapis' || first(c, 'Z_3'))) {
      const zo = { ...leafObj(z), _d: o._i, D_1: o.D_1, D_8: o.D_8, D_3: o.D_3 };
      o._z.push(postings.length); postings.push(zo);
    }
    journal.push(o);
  }
  // pozycje KontoZapis zapisane poza Dziennikiem (gdyby plik miał je jako osobne elementy)
  if (!postings.length) for (const z of all(doc, 'Z_3').map(x => x.parentNode)) postings.push({ ...leafObj(z), _d: null });
  const ctrlEl = first(doc, 'Ctrl'); const ctrl = ctrlEl ? leafObj(ctrlEl) : {};
  const rpdEl = first(doc, 'RPD'); const rpd = rpdEl ? leafObj(rpdEl) : null;
  return { accounts, contractors, journal, postings, ctrl, rpd };
}

function parseStKr(doc) {
  const assets = all(doc, 'E_1').map(e => e.parentNode).filter((p, i, a) => a.indexOf(p) === i).map(p => {
    const o = leafObj(p);
    const ksef = all(p, 'E_31').map(x => x.textContent.trim()).filter(Boolean);
    if (ksef.length) o.E_31 = ksef.join(', ');
    return o;
  });
  const ctrlEl = first(doc, 'Ctrl') || first(doc, 'ST_KRCtrl');
  return { assets, ctrl: ctrlEl ? leafObj(ctrlEl) : {} };
}

// inne JPK: elementy, których dzieci są polami, zgrupowane po nazwie (np. SprzedazWiersz, ZakupWiersz, Faktura, PKPIRWiersz)
function parseGeneric(doc) {
  const skip = new Set(['Naglowek', 'Podmiot1', 'IdentyfikatorPodmiotu', 'AdresPol', 'AdresZagr', 'Adres', 'OsobaFizyczna', 'OsobaNiefizyczna', 'KodFormularza']);
  const groups = new Map();
  const walk = el => {
    for (const c of kids(el)) {
      const leafs = kids(c).filter(x => !x.children.length);
      if (c.children.length && leafs.length >= Math.max(1, c.children.length / 2) && !skip.has(c.localName)) {
        if (!groups.has(c.localName)) groups.set(c.localName, []);
        groups.get(c.localName).push(leafObj(c));
      }
      if (c.children.length && !skip.has(c.localName)) walk(c);
    }
  };
  walk(doc.documentElement);
  return [...groups.entries()].map(([name, rows]) => {
    const keys = []; for (const r of rows) for (const k of Object.keys(r)) if (!keys.includes(k)) keys.push(k);
    const numeric = keys.filter(k => rows.every(r => r[k] === undefined || r[k] === '' || /^-?\d+\.\d{1,2}$/.test(r[k])) && rows.some(r => r[k]));
    return { name, rows, cols: keys.map(k => ({ key: k, label: lbl(k), num: numeric.includes(k) })) };
  }).sort((a, b) => b.rows.length - a.rows.length);
}

// ---------- analiza KR_PD ----------
function analyzeKr(m) {
  const sum = (rows, k) => r2(rows.reduce((s, r) => s + num(r[k]), 0));
  const acc = m.accounts;
  const t = Object.fromEntries(['S_4', 'S_5', 'S_6', 'S_7', 'S_8', 'S_9', 'S_10', 'S_11'].map(k => [k, sum(acc, k)]));
  const computed = { C_1: m.journal.length, C_2: sum(m.journal, 'D_11'), C_3: m.postings.length, C_4: sum(m.postings, 'Z_4'), C_5: sum(m.postings, 'Z_7') };
  const ctrlRows = ['C_1', 'C_2', 'C_3', 'C_4', 'C_5'].map(k => ({ k, file: m.ctrl[k], calc: computed[k], ok: m.ctrl[k] === undefined ? null : Math.abs(num(m.ctrl[k]) - computed[k]) < 0.005 }));
  const balance = [
    ['Bilans otwarcia', t.S_4, t.S_5], ['Obroty za okres', t.S_6, t.S_7], ['Obroty narastająco', t.S_8, t.S_9], ['Salda końcowe', t.S_10, t.S_11],
    ['Zapisy na kontach (Wn / Ma)', computed.C_4, computed.C_5],
  ].map(([name, wn, ma]) => ({ name, wn, ma, diff: r2(wn - ma) }));
  // zapisy dziennika, w których Wn ≠ Ma albo kwota operacji ≠ Wn
  const bad = m.journal.filter(j => j._z.length && (Math.abs(sum(j._z.map(i => m.postings[i]), 'Z_4') - sum(j._z.map(i => m.postings[i]), 'Z_7')) >= 0.005));
  // konta w zapisach, których brak w ZOiS
  const known = new Set(acc.map(a => a.S_1));
  const unknown = [...new Set(m.postings.map(p => p.Z_3).filter(k => k && !known.has(k)))];
  return { totals: t, computed, ctrlRows, balance, unbalanced: bad, unknownAccounts: unknown };
}

function markerGroups(accounts, key) {
  const g = new Map();
  for (const a of accounts) {
    const k = a[key] || '(brak znacznika)';
    if (!g.has(k)) g.set(k, { marker: k, n: 0, S_4: 0, S_5: 0, S_6: 0, S_7: 0, S_8: 0, S_9: 0, S_10: 0, S_11: 0 });
    const o = g.get(k); o.n++;
    for (const f of ['S_4', 'S_5', 'S_6', 'S_7', 'S_8', 'S_9', 'S_10', 'S_11']) o[f] = r2(o[f] + num(a[f]));
  }
  return [...g.values()].map(o => ({ ...o, saldo: r2(o.S_10 - o.S_11) })).sort((a, b) => a.marker.localeCompare(b.marker, 'pl', { numeric: true }));
}

// ---------- tabela danych: wyszukiwanie, sortowanie, stronicowanie, sumy ----------
function dataTable({ cols, rows, onRow, pageSize = 100, filters = [], empty = 'Brak danych.', initialQuery = '' }) {
  let q = initialQuery, sortKey = null, sortDir = 1, page = 0;
  const search = h('input', { type: 'search', class: 'jpk-search', placeholder: 'Szukaj…', value: q, oninput: () => { q = search.value; page = 0; draw(); } });
  const info = h('span', { class: 'small muted' });
  const wrap = h('div', { class: 'jpk-scroll' });
  const pager = h('div', { class: 'jpk-pager' });
  const view = () => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    let r = rows.filter(row => filters.every(f => f(row)));
    if (words.length) r = r.filter(row => { const s = cols.map(c => row[c.key] ?? '').join(' ').toLowerCase(); return words.every(w => s.includes(w)); });
    if (sortKey) {
      const c = cols.find(x => x.key === sortKey);
      r = [...r].sort((a, b) => c.num ? (num(a[sortKey]) - num(b[sortKey])) * sortDir : String(a[sortKey] ?? '').localeCompare(String(b[sortKey] ?? ''), 'pl', { numeric: true }) * sortDir);
    }
    return r;
  };
  const draw = () => {
    const r = view();
    const pages = Math.max(1, Math.ceil(r.length / pageSize)); if (page >= pages) page = pages - 1;
    const slice = r.slice(page * pageSize, page * pageSize + pageSize);
    info.textContent = `${fmtInt(r.length)} z ${fmtInt(rows.length)} wierszy`;
    const th = c => h('th', { class: (c.num ? 'n' : '') + (sortKey === c.key ? ' s' : ''), style: c.w ? { minWidth: c.w + 'px' } : null, title: c.key,
      onclick: () => { if (sortKey === c.key) sortDir = -sortDir; else { sortKey = c.key; sortDir = 1; } draw(); } }, c.label, sortKey === c.key ? (sortDir > 0 ? ' ▲' : ' ▼') : '');
    const tot = cols.some(c => c.num && c.sum !== false) ? h('tr', { class: 'tot' }, ...cols.map((c, i) => h('td', { class: c.num ? 'n' : '' },
      c.num && c.sum !== false ? fmtN(r.reduce((s, x) => s + num(x[c.key]), 0), c.dec ?? 2) : i === 0 ? 'Razem' : ''))) : null;
    wrap.replaceChildren(r.length ? h('table', { class: 'jpk-table' },
      h('thead', {}, h('tr', {}, ...cols.map(th))),
      h('tbody', {}, ...slice.map(row => h('tr', { class: onRow ? 'click' : null, onclick: onRow ? () => onRow(row) : null },
        ...cols.map(c => h('td', { class: (c.num ? 'n' : '') + (c.wrap ? ' w' : '') }, c.fmt ? c.fmt(row[c.key], row) : c.num ? fmtN(num(row[c.key]), c.dec ?? 2) : (row[c.key] ?? '')))))),
      tot ? h('tfoot', {}, tot) : null) : h('p', { class: 'hint', style: { padding: '16px' } }, empty));
    pager.replaceChildren(...(pages > 1 ? [
      h('button', { class: 'btn btn-outline btn-sm', disabled: page === 0, onclick: () => { page--; draw(); wrap.scrollTop = 0; } }, '‹ Poprzednia'),
      h('span', { class: 'small muted' }, `Strona ${page + 1} z ${pages}`),
      h('button', { class: 'btn btn-outline btn-sm', disabled: page >= pages - 1, onclick: () => { page++; draw(); wrap.scrollTop = 0; } }, 'Następna ›')] : []));
  };
  draw();
  return { el: h('div', { class: 'jpk-tbl' }, h('div', { class: 'jpk-tbl-bar' }, search, info), wrap, pager), redraw: draw, setQuery: v => { q = search.value = v; page = 0; draw(); } };
}

// ---------- widok ----------
let current = null; // ostatnio otwarty plik – tylko w pamięci karty przeglądarki
let onClear = () => {};

export async function renderJpk(main, params) {
  const area = h('div');
  const loadFile = async (file) => {
    if (!file) return;
    if (!/\.xml$/i.test(file.name) && file.type !== 'text/xml' && file.type !== 'application/xml') return toast('Wybierz plik JPK w formacie XML.', true);
    area.replaceChildren(h('div', { class: 'spinner' }, `Wczytywanie ${file.name}…`));
    await new Promise(r => setTimeout(r, 30));
    try {
      const t0 = performance.now();
      current = parseJpk(await readText(file), file.name);
      current.size = file.size; current.ms = Math.round(performance.now() - t0);
      draw();
      if (current.kind === 'kr_pd') {
        const iss = issuesOf(current), e = iss.filter(i => i.level === 'error').length;
        if (e) toast(`Kontrola pliku: wykryto ${e} ${e === 1 ? 'błąd' : e < 5 ? 'błędy' : 'błędów'} – szczegóły nad zakładkami.`, true);
        else if (iss.length) toast(`Kontrola pliku: ${iss.length} ${iss.length === 1 ? 'ostrzeżenie' : 'ostrzeżenia'} – sprawdź znaczniki.`);
      }
    } catch (e) { console.error(e); current = null; area.replaceChildren(h('div', { class: 'card empty' }, 'Nie udało się odczytać pliku: ' + e.message)); }
  };
  const input = h('input', { type: 'file', accept: '.xml,text/xml,application/xml', hidden: true, onchange: () => { loadFile(input.files[0]); input.value = ''; } });
  const zone = h('div', { class: 'tk-drop jpk-drop' },
    h('div', {}, h('b', {}, 'Przeciągnij plik JPK (XML) tutaj'), h('span', { class: 'muted' }, ' · JPK_KR_PD, JPK_ST_KR i inne · plik zostaje na Twoim komputerze')),
    h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: () => input.click() }, icon('plus'), 'Wybierz plik'), input);
  ['dragenter', 'dragover'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.remove('over'); }));
  zone.addEventListener('drop', e => loadFile(e.dataTransfer?.files?.[0]));

  // „Wyczyść dane”: usuwa wczytany plik z pamięci aplikacji (w tym ukrytą ramkę wydruku PDF z danymi)
  onClear = () => {
    if (!current) return;
    if (!confirm(`Usunąć z aplikacji dane pliku ${current.fileName}? Plik na Twoim dysku pozostaje bez zmian.`)) return;
    current = null; input.value = '';
    document.querySelectorAll('iframe[aria-hidden="true"]').forEach(f => f.remove());
    draw(); toast('Dane pliku usunięto z aplikacji.');
  };
  const draw = () => {
    if (!current) { area.replaceChildren(h('div', { class: 'card empty' }, 'Otwórz plik, aby zobaczyć jego zawartość. Dane z pliku są tylko w tej karcie przeglądarki – „Wyczyść dane” usuwa je od razu, a zamknięcie karty lub wylogowanie także.')); return; }
    area.replaceChildren(current.kind === 'kr_pd' ? viewKr(current) : current.kind === 'st_kr' ? viewSt(current) : viewGeneric(current));
  };

  main.replaceChildren(
    h('div', { class: 'page-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, params?.mod === 'm2' ? 'Doradztwo podatkowe · M2 TAX' : 'RKDP'),
        h('h1', { style: { marginTop: '6px', display: 'flex', alignItems: 'center' } }, 'Podgląd JPK', infoTip(HELP, 'Podgląd JPK – instrukcja')),
        h('p', { class: 'sub' }, 'JPK_CIT: księgi rachunkowe (JPK_KR_PD) i środki trwałe (JPK_ST_KR) – podgląd, kontrola, Excel i PDF.'))),
    zone, area);
  draw();
}

const metaCard = (m) => {
  const H = m.header, S = m.subject;
  const row = (k, v) => v ? h('div', { class: 'jpk-kv' }, h('span', {}, k), h('b', {}, v)) : null;
  return h('section', { class: 'card section jpk-meta' },
    h('div', { class: 'section-head' }, h('h2', {}, S.PelnaNazwa || m.fileName), h('span', { class: 'badge' }, m.code || 'JPK')),
    h('div', { class: 'jpk-kvs' },
      row('NIP', S.NIP), row('REGON', S.REGON), row('Adres', S.Adres), row('Kod urzędu skarbowego', H.KodUrzedu),
      row('Okres', H.DataOd || H.DataDo ? `${H.DataOd || '…'} – ${H.DataDo || '…'}` : ''), row('Rok obrotowy', H.RokDataOd ? `${H.RokDataOd} – ${H.RokDataDo}` : ''),
      row('Rok podatkowy', H.RokPdDataOd ? `${H.RokPdDataOd} – ${H.RokPdDataDo}` : ''), row('Cel złożenia', CEL[H.CelZlozenia] || H.CelZlozenia),
      row('Data wytworzenia', (H.DataWytworzeniaJPK || '').replace('T', ' ').slice(0, 19)), row('Waluta', H.DomyslnyKodWaluty), row('Formularz', H.KodFormularza),
      row('CIT estoński', S.Znacznik_EST ? 'tak' : ''), row('MSSF', S.Znacznik_MSSF ? 'tak' : ''),
      row('Plik', `${m.fileName} · ${m.size >= 1048576 ? (m.size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(m.size / 1024)) + ' kB'}`)));
};

const tabsBar = (defs, onPick, cur) => h('div', { class: 'tabs jpk-tabs', role: 'tablist' },
  ...defs.filter(Boolean).map(([k, label, n]) => h('button', { class: cur === k ? 'on' : '', type: 'button', onclick: () => onPick(k) }, label, n !== undefined ? h('span', { class: 'n' }, fmtInt(n)) : null)));

const ok = v => v === null ? h('span', { class: 'muted' }, '—') : h('span', { class: 'jpk-ok ' + (v ? 'y' : 'n') }, v ? '✓ zgodne' : '✗ różnica');

function exportBar(m, extra = []) {
  return h('div', { class: 'jpk-actions' }, ...extra,
    h('button', { class: 'btn btn-outline btn-sm', onclick: () => exportExcel(m) }, icon('download'), 'Pobierz Excel'),
    h('button', { class: 'btn btn-outline btn-sm', onclick: () => exportPdfDialog(m) }, icon('download'), 'PDF'),
    h('button', { class: 'btn btn-outline btn-sm jpk-clear', onclick: () => onClear(), 'data-tip': 'Usuwa wczytany plik z aplikacji (podgląd, bilans, RZiS, kontrola). Plik na dysku pozostaje.' }, '✕ Wyczyść dane'));
}

// ----- kontrola pliku -----
const issuesOf = m => m._iss || (m._iss = validateKr(m, m._a || (m._a = analyzeKr(m)), m._bil || (m._bil = buildBilans(m))));
function issuesPanel(m, goTo) {
  const list = issuesOf(m);
  const err = list.filter(i => i.level === 'error').length, warn = list.length - err;
  if (!list.length) return h('div', { class: 'jpk-check ok' }, h('b', {}, '✓ Kontrola pliku: nie wykryto problemów'), h('span', { class: 'small' }, ' – sumy kontrolne, bilans Wn = Ma, salda kont, znaczniki oraz bilans i RZiS są spójne.'));
  let open = err > 0;
  const body = h('div', { class: 'jpk-check-list' });
  const draw = () => {
    body.hidden = !open;
    body.replaceChildren(...list.map(i => h('div', { class: 'jpk-issue ' + i.level },
      h('div', { class: 'jpk-issue-head' }, h('span', { class: 'jpk-lvl' }, i.level === 'error' ? 'Błąd' : 'Uwaga'), h('b', {}, i.title),
        i.go ? h('button', { class: 'btn btn-ghost btn-sm', onclick: () => goTo(i.go, i.query) }, 'Pokaż →') : null),
      i.text ? h('p', { class: 'small' }, i.text) : null,
      i.accounts.length ? h('ul', { class: 'jpk-issue-acc' }, ...i.accounts.slice(0, 12).map(a => h('li', {},
        h('button', { class: 'linklike', onclick: () => goTo('acc', a.S_1) }, a.S_1), ` ${a.S_2 || ''}`, a.info ? h('span', { class: 'muted' }, ` – ${a.info}`) : null)),
        i.accounts.length > 12 ? h('li', { class: 'muted' }, `… i ${i.accounts.length - 12} więcej (pełna lista w Excelu, arkusz „Kontrola”)`) : null) : null)));
  };
  const head = h('button', { class: 'jpk-check-head', onclick: () => { open = !open; draw(); arrow.textContent = open ? '▾' : '▸'; } });
  const arrow = h('span', {}, open ? '▾' : '▸');
  head.append(arrow, h('b', {}, ` ${err ? '⚠' : 'ℹ'} Kontrola pliku: `), [err ? `${err} ${err === 1 ? 'błąd' : err < 5 ? 'błędy' : 'błędów'}` : '', warn ? `${warn} ${warn === 1 ? 'ostrzeżenie' : warn < 5 ? 'ostrzeżenia' : 'ostrzeżeń'}` : ''].filter(Boolean).join(' i '), h('span', { class: 'small muted' }, open ? '' : ' – kliknij, aby zobaczyć'));
  draw();
  return h('div', { class: 'jpk-check ' + (err ? 'err' : 'warn') }, head, body);
}

// ----- JPK_KR_PD -----
function viewKr(m) {
  const A = m._a || (m._a = analyzeKr(m));
  let tab = 'sum';
  const body = h('div');
  const accCols = ['S_1', 'S_2', 'S_3', 'S_4', 'S_5', 'S_6', 'S_7', 'S_8', 'S_9', 'S_10', 'S_11', 'S_12_1', 'S_12_2', 'S_12_3']
    .filter(k => ['S_1', 'S_2'].includes(k) || m.accounts.some(a => a[k]))
    .map(k => ({ key: k, label: lbl(k), num: NUM.has(k), w: k === 'S_2' ? 220 : null, wrap: k === 'S_2' }));
  const jCols = ['D_1', 'D_2', 'D_3', 'D_4', 'D_5', 'D_6', 'D_7', 'D_8', 'D_9', 'D_10', 'D_11', 'D_12'].filter(k => ['D_1', 'D_10', 'D_11'].includes(k) || m.journal.some(a => a[k]))
    .map(k => ({ key: k, label: lbl(k), num: NUM.has(k), w: k === 'D_10' ? 260 : null, wrap: k === 'D_10' }));
  const pCols = [{ key: 'D_1', label: 'Nr zapisu' }, { key: 'D_8', label: 'Data księgowania' },
    ...['Z_1', 'Z_2', 'Z_3', 'Z_4', 'Z_7', 'Z_5', 'Z_6', 'Z_8', 'Z_9'].filter(k => ['Z_3', 'Z_4', 'Z_7'].includes(k) || m.postings.some(a => a[k]))
      .map(k => ({ key: k, label: lbl(k), num: NUM.has(k), w: k === 'Z_2' ? 240 : null, wrap: k === 'Z_2' }))];
  const accName = new Map(m.accounts.map(a => [a.S_1, a.S_2]));
  let accFilter = '';

  const showJournal = (j) => {
    const zs = j._z.map(i => m.postings[i]);
    modal(`Zapis ${j.D_1 || ''}`, h('div', {},
      h('div', { class: 'jpk-kvs', style: { marginBottom: '12px' } }, ...jCols.filter(c => j[c.key]).map(c => h('div', { class: 'jpk-kv' }, h('span', {}, c.label), h('b', {}, c.num ? fmtN(num(j[c.key])) : j[c.key])))),
      h('div', { class: 'jpk-scroll' }, h('table', { class: 'jpk-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Konto'), h('th', {}, 'Nazwa konta'), h('th', {}, 'Opis'), h('th', { class: 'n' }, 'Wn'), h('th', { class: 'n' }, 'Ma'))),
        h('tbody', {}, ...zs.map(z => h('tr', {}, h('td', {}, z.Z_3 || ''), h('td', { class: 'w' }, accName.get(z.Z_3) || ''), h('td', { class: 'w' }, z.Z_2 || ''), h('td', { class: 'n' }, num(z.Z_4) ? fmtN(num(z.Z_4)) : ''), h('td', { class: 'n' }, num(z.Z_7) ? fmtN(num(z.Z_7)) : '')))),
        h('tfoot', {}, h('tr', { class: 'tot' }, h('td', {}, 'Razem'), h('td'), h('td'), h('td', { class: 'n' }, fmtN(zs.reduce((s, z) => s + num(z.Z_4), 0))), h('td', { class: 'n' }, fmtN(zs.reduce((s, z) => s + num(z.Z_7), 0)))))))),
    close => [h('button', { class: 'btn btn-primary btn-sm', onclick: close }, 'Zamknij')], { wide: true });
  };

  const render = () => {
    tabs.replaceWith(tabs = tabsBar([['sum', 'Podsumowanie'], ['acc', 'Konta (ZOiS)', m.accounts.length], ['jr', 'Dziennik', m.journal.length], ['zp', 'Zapisy na kontach', m.postings.length],
      ['mk', 'Znaczniki'], ['bil', 'Bilans'], ['rzis', 'RZiS'], m.contractors.length ? ['kt', 'Kontrahenci', m.contractors.length] : null, m.rpd ? ['rpd', 'RPD'] : null], k => { tab = k; render(); }, tab));
    if (tab === 'sum') body.replaceChildren(...summaryKr(m, A));
    if (tab === 'acc') body.replaceChildren(h('p', { class: 'hint' }, 'Kliknij konto, aby zobaczyć jego zapisy.'), dataTable({ cols: accCols, rows: m.accounts, onRow: a => { accFilter = a.S_1; tab = 'zp'; render(); } }).el);
    if (tab === 'jr') body.replaceChildren(h('p', { class: 'hint' }, 'Kliknij zapis, aby zobaczyć dekretację na kontach.'), dataTable({ cols: jCols, rows: m.journal, onRow: showJournal }).el);
    if (tab === 'zp') {
      const sel = h('select', { class: 'jpk-sel', onchange: () => { accFilter = sel.value; render(); } },
        h('option', { value: '' }, 'Wszystkie konta'), ...m.accounts.map(a => h('option', { value: a.S_1, selected: a.S_1 === accFilter }, `${a.S_1} ${a.S_2 || ''}`.slice(0, 90))));
      const acc = m.accounts.find(a => a.S_1 === accFilter);
      body.replaceChildren(h('div', { class: 'jpk-filter' }, sel, acc ? h('span', { class: 'small muted' }, `BO: ${fmtN(num(acc.S_4) - num(acc.S_5))} · Obroty Wn ${fmtN(num(acc.S_6))} / Ma ${fmtN(num(acc.S_7))} · Saldo: ${fmtN(num(acc.S_10) - num(acc.S_11))}`) : null),
        dataTable({ cols: pCols, rows: m.postings, filters: accFilter ? [p => p.Z_3 === accFilter] : [], onRow: p => p._d !== null && p._d !== undefined && showJournal(m.journal[p._d]) }).el);
    }
    if (tab === 'mk') {
      let key = m._mk || 'S_12_3';
      const pick = h('div', { class: 'tabs', style: { marginBottom: '10px' } }, ...['S_12_1', 'S_12_2', 'S_12_3'].map(k => h('button', { class: key === k ? 'on' : '', onclick: () => { m._mk = k; render(); } }, lbl(k) + ` (${k})`)));
      const groups = markerGroups(m.accounts, key);
      body.replaceChildren(pick, h('p', { class: 'hint' }, 'Sumy obrotów i sald kont według znacznika. Kliknij wiersz, aby zobaczyć konta z tym znacznikiem.'),
        dataTable({ cols: [{ key: 'marker', label: 'Znacznik', w: 160 }, { key: 'n', label: 'Kont', num: true, dec: 0 }, ...['S_4', 'S_5', 'S_6', 'S_7', 'S_10', 'S_11'].map(k => ({ key: k, label: lbl(k), num: true })), { key: 'saldo', label: 'Saldo (Wn − Ma)', num: true }],
          rows: groups, pageSize: 500, onRow: g => { tab = 'acc'; render(); setTimeout(() => { const s = body.querySelector('.jpk-search'); if (s && g.marker !== '(brak znacznika)') { s.value = g.marker; s.dispatchEvent(new Event('input')); } }, 0); } }).el);
    }
    if (tab === 'bil') body.replaceChildren(...bilansView(m, () => render()).filter(Boolean));
    if (tab === 'rzis') body.replaceChildren(...rzisView(m, () => render()).filter(Boolean));
    if (tab === 'kt') body.replaceChildren(dataTable({ cols: ['T_1', 'T_2', 'T_3'].map(k => ({ key: k, label: lbl(k) })), rows: m.contractors }).el);
    if (tab === 'rpd') body.replaceChildren(rpdCard(m.rpd));
  };
  let tabs = h('div');
  const goTo = (t, q) => {
    tab = t === 'acc' && q ? 'acc' : t; if (t === 'zp') accFilter = '';
    render();
    if (q) setTimeout(() => { const sEl = body.querySelector('.jpk-search'); if (sEl) { sEl.value = q; sEl.dispatchEvent(new Event('input')); } }, 0);
    el.querySelector('.jpk-bar')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const el = h('div', {}, metaCard(m), issuesPanel(m, goTo), h('div', { class: 'jpk-bar' }, tabs, exportBar(m)), body);
  render();
  return el;
}

function summaryKr(m, A) {
  const cards = [];
  cards.push(h('div', { class: 'jpk-tiles' },
    ...[['Konta', m.accounts.length], ['Zapisy w dzienniku', m.journal.length], ['Pozycje na kontach', m.postings.length], ['Kontrahenci', m.contractors.length]]
      .map(([l, n]) => h('div', { class: 'card tile' }, h('span', { class: 'num' }, fmtInt(n)), h('span', { class: 'lbl' }, l)))));
  cards.push(h('section', { class: 'card section' }, h('div', { class: 'section-head' }, h('h2', {}, 'Sumy kontrolne')),
    h('div', { class: 'jpk-scroll' }, h('table', { class: 'jpk-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Pole'), h('th', {}, 'Opis'), h('th', { class: 'n' }, 'W pliku (Ctrl)'), h('th', { class: 'n' }, 'Wyliczone z danych'), h('th', {}, 'Wynik'))),
      h('tbody', {}, ...A.ctrlRows.map(r => h('tr', {}, h('td', {}, r.k), h('td', {}, lbl(r.k)), h('td', { class: 'n' }, r.file === undefined ? '—' : (['C_1', 'C_3'].includes(r.k) ? fmtInt(num(r.file)) : fmtN(num(r.file)))),
        h('td', { class: 'n' }, ['C_1', 'C_3'].includes(r.k) ? fmtInt(r.calc) : fmtN(r.calc)), h('td', {}, ok(r.ok)))))))));
  cards.push(h('section', { class: 'card section' }, h('div', { class: 'section-head' }, h('h2', {}, 'Kontrola bilansu (Wn = Ma)')),
    h('div', { class: 'jpk-scroll' }, h('table', { class: 'jpk-table' }, h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', { class: 'n' }, 'Winien'), h('th', { class: 'n' }, 'Ma'), h('th', { class: 'n' }, 'Różnica'), h('th', {}, 'Wynik'))),
      h('tbody', {}, ...A.balance.map(b => h('tr', {}, h('td', {}, b.name), h('td', { class: 'n' }, fmtN(b.wn)), h('td', { class: 'n' }, fmtN(b.ma)), h('td', { class: 'n' }, fmtN(b.diff)), h('td', {}, ok(Math.abs(b.diff) < 0.005))))))),
    A.unbalanced.length ? h('p', { class: 'jpk-warn' }, `Zapisy w dzienniku, w których Wn ≠ Ma: ${A.unbalanced.length} (np. ${A.unbalanced.slice(0, 5).map(j => j.D_1).join(', ')}).`) : null,
    A.unknownAccounts.length ? h('p', { class: 'jpk-warn' }, `Konta użyte w zapisach, których nie ma w zestawieniu obrotów i sald: ${A.unknownAccounts.slice(0, 10).join(', ')}${A.unknownAccounts.length > 10 ? '…' : ''}.`) : null,
    !A.unbalanced.length && !A.unknownAccounts.length ? h('p', { class: 'small muted', style: { marginTop: '8px' } }, 'Każdy zapis w dzienniku jest zbilansowany, a wszystkie konta z zapisów występują w zestawieniu obrotów i sald.') : null));
  if (m.rpd) cards.push(rpdCard(m.rpd));
  cards.push(h('p', { class: 'small muted' }, `Plik odczytano w ${m.ms} ms. Dane są przetwarzane wyłącznie w tej karcie przeglądarki.`));
  return cards;
}

// ----- Bilans i RZiS (zestawienia pomocnicze) -----
const WZ_KEY = 'rkdp_jpk_wzor';
// warianty RZiS do eksportu: mikro – jeden (porównawczy, a przy samych znacznikach kalkulacyjnych – kalkulacyjny)
const rzisVariants = (m, wz) => { const rp = hasVariant(m, 'RP'), rk = hasVariant(m, 'RK', ['B', 'D', 'E']); return wz === 'mikro' ? (rp ? ['RP'] : hasVariant(m, 'RK') ? ['RK'] : []) : [rp ? 'RP' : null, rk ? 'RK' : null].filter(Boolean); };
const getWz = m => m._wz || (() => { try { return localStorage.getItem(WZ_KEY); } catch { return null; } })() || 'pelny';
const wzPicker = (m, rerender) => h('div', { class: 'jpk-wz' }, h('span', { class: 'small muted' }, 'Wzór sprawozdania:'),
  h('div', { class: 'tabs', style: { margin: 0 } }, ...Object.entries(WZORY).map(([k, l]) => h('button', { class: getWz(m) === k ? 'on' : '', type: 'button',
    onclick: () => { m._wz = k; try { localStorage.setItem(WZ_KEY, k); } catch { /* */ } rerender(); } }, l))));
const FIN_NOTE = 'Zestawienie pomocnicze wygenerowane przez aplikację na podstawie znaczników kont (S_12_1, S_12_2) i sald z pliku JPK_KR_PD. Nie jest częścią pliku JPK ani sprawozdaniem finansowym – służy do kontroli i analizy.';
const finNote = (extra) => h('div', { class: 'jpk-note' }, h('b', {}, 'Informacyjnie. '), FIN_NOTE, extra ? h('div', { style: { marginTop: '4px' } }, extra) : null);
function finTable(rows, cols, opts = {}) {
  const tb = h('tbody');
  const draw = () => tb.replaceChildren(...rows.flatMap(r => {
    const open = r._open;
    const tr = h('tr', { class: `fin-d${Math.min(r.depth, 5)}${r.wt ? ' fin-wt' : ''}${r.calc ? ' fin-calc' : ''}${r.accounts?.length ? ' click' : ''}`, onclick: r.accounts?.length ? () => { r._open = !r._open; draw(); } : null },
      h('td', { class: 'fin-key' }, r.key), h('td', { class: 'fin-name' }, r.accounts?.length ? h('span', { class: 'fin-tw' }, open ? '▾ ' : '▸ ') : null, r.name || h('span', { class: 'muted' }, 'pozycja ze znacznika')),
      ...cols.map(c => h('td', { class: 'n' + (r[c.key] < 0 ? ' neg' : '') }, fmtN(r[c.key]))));
    if (!open) return [tr];
    return [tr, ...r.accounts.map(a => h('tr', { class: 'fin-acc' }, h('td', {}), h('td', {}, h('span', { class: 'fin-accno' }, a.S_1), ' ', a.S_2 || '', a.how ? h('span', { class: 'muted small' }, ` · ${a.how}`) : null, opts.accInfo ? h('span', { class: 'muted small' }, ' · ' + opts.accInfo(a)) : null),
      ...cols.map(c => h('td', { class: 'n' }, fmtN(a[c.acc || c.key])))))];
  }));
  draw();
  return h('div', { class: 'jpk-scroll' }, h('table', { class: 'jpk-table fin-table' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Poz.'), h('th', {}, 'Wyszczególnienie'), ...cols.map(c => h('th', { class: 'n' }, c.label)))), tb,
    opts.foot ? h('tfoot', {}, opts.foot) : null));
}
function bilansView(m, rerender) {
  const B = m._bil || (m._bil = buildBilans(m));
  const wz = getWz(m), S = wz === 'pelny' ? B : bilansSimple(B, wz);
  const H = m.header;
  const cols = [{ key: 'start', label: `Stan na początek${H.RokDataOd ? ' ' + H.RokDataOd : ''}` }, { key: 'end', label: `Stan na koniec${H.DataDo ? ' ' + H.DataDo : ''}` }];
  const foot = (label, t) => h('tr', { class: 'tot' }, h('td'), h('td', {}, label), h('td', { class: 'n' }, fmtN(t.start)), h('td', { class: 'n' }, fmtN(t.end)));
  const dS = r2(B.tA.start - B.tP.start), dE = r2(B.tA.end - B.tP.end);
  const W = B.warnings;
  const out = [finNote(B.unclosed ? `Konta wynikowe nie są zamknięte na wynik finansowy – ich saldo (${fmtN(B.unclosed)}) pokazano w pasywach w pozycji A.VI „Zysk (strata) netto”.` : null),
    h('div', { class: 'jpk-tiles' },
      ...[['Suma aktywów', B.tA.end], ['Suma pasywów', B.tP.end], ['Różnica (koniec)', dE], ['Różnica (początek)', dS]].map(([l, n]) => h('div', { class: 'card tile' + (/Różnica/.test(l) && Math.abs(n) >= 0.005 ? ' jpk-bad' : '') }, h('span', { class: 'num', style: { fontSize: '22px' } }, fmtN(n)), h('span', { class: 'lbl' }, l)))),
    h('section', { class: 'card section' }, h('div', { class: 'section-head' }, h('h2', {}, `Aktywa – ${WZORY[wz].toLowerCase()}`), h('span', { class: 'small muted' }, 'kliknij pozycję, aby zobaczyć konta')), finTable(S.aktywa, cols, { foot: foot('Aktywa razem', B.tA) })),
    h('section', { class: 'card section' }, h('div', { class: 'section-head' }, h('h2', {}, `Pasywa – ${WZORY[wz].toLowerCase()}`)), finTable(S.pasywa, cols, { foot: foot('Pasywa razem', B.tP) }))];
  const warn = [];
  if (Math.abs(dE) >= 0.005 || Math.abs(dS) >= 0.005) warn.push(h('p', { class: 'jpk-warn' }, `Suma aktywów różni się od sumy pasywów (koniec: ${fmtN(dE)}, początek: ${fmtN(dS)}). Najczęstsze przyczyny: konta z saldem bez znacznika bilansowego albo konta z saldem przeciwnym do znacznika.`));
  if (W.unmarked.length) warn.push(h('p', { class: 'jpk-warn' }, `Konta z saldem bez znacznika bilansu ani RZiS (${W.unmarked.length}): ${W.unmarked.slice(0, 12).map(a => `${a.S_1} (${fmtN(a.saldo)})`).join(', ')}${W.unmarked.length > 12 ? '…' : ''}.`));
  if (W.opposite.length) warn.push(h('p', { class: 'small muted' }, `Konta z saldem przeciwnym do strony znacznika – wykazane jako pomniejszenie pozycji (np. umorzenie, odpisy aktualizujące) (${W.opposite.length}): ${W.opposite.slice(0, 12).map(a => `${a.S_1} (${a.side}: ${fmtN(a.saldo)})`).join(', ')}${W.opposite.length > 12 ? '…' : ''}. Jeśli to rozrachunek, który może mieć saldo po obu stronach, powinien mieć drugi znacznik (aktywa i pasywa).`));
  if (W.dual) warn.push(h('p', { class: 'small muted' }, `Konta z dwoma znacznikami (aktywa i pasywa): ${W.dual} – saldo Wn wykazano w aktywach, saldo Ma w pasywach.`));
  if (!B.aktywa.some(r => r.accounts.length) && !B.pasywa.some(r => r.accounts.length)) warn.unshift(h('p', { class: 'jpk-warn' }, 'W pliku nie ma znaczników bilansowych (BA…/BP…) w polach S_12_1 i S_12_2 – bilansu nie da się wygenerować.'));
  if (wz !== 'pelny') warn.push(h('p', { class: 'small muted' }, 'Pozycje wzoru uproszczonego wyliczono jako sumy pozycji pełnego wzoru, na które wskazują znaczniki kont. Podział należności i zobowiązań z tytułu dostaw i usług na okresy wymagalności (do / powyżej 12 miesięcy) nie wynika z pliku JPK.'));
  return [wzPicker(m, rerender), ...out.slice(0, 2), ...warn, ...out.slice(2)];
}
function rzisView(m, rerender) {
  // wariant kalkulacyjny pokazujemy tylko, gdy są znaczniki kosztów RK (B, D, E) – inaczej byłby niepełny
  const hasRP = hasVariant(m, 'RP'), hasRK = hasVariant(m, 'RK', ['B', 'D', 'E']);
  if (!hasRP && !hasRK) return [finNote(), h('p', { class: 'jpk-warn' }, 'W pliku nie ma znaczników RZiS (RP…/RK…) w polach S_12_1 i S_12_2 – rachunku zysków i strat nie da się wygenerować.')];
  const wz = getWz(m);
  const v = wz === 'mikro' ? (hasRP ? 'RP' : 'RK') : m._rzv && ((m._rzv === 'RK' && hasRK) || (m._rzv === 'RP' && hasRP)) ? m._rzv : hasRP ? 'RP' : 'RK';
  m._rz = m._rz || {};
  const RF = m._rz[v] || (m._rz[v] = buildRzis(m, v));
  const R = wz === 'pelny' ? RF : { ...rzisSimple(RF, wz, v), variant: wz === 'mikro' ? 'jednostki mikro' : RF.variant };
  const pick = hasRP && hasRK && wz !== 'mikro' ? h('div', { class: 'tabs', style: { marginBottom: '10px' } }, ...[['RP', 'Wariant porównawczy'], ['RK', 'Wariant kalkulacyjny']].map(([k, l]) => h('button', { class: v === k ? 'on' : '', onclick: () => { m._rzv = k; rerender(); } }, l))) : null;
  const B = m._bil || (m._bil = buildBilans(m));
  return [wzPicker(m, rerender), finNote(R.fromPostings ? `Kwoty to obroty z dziennika za okres pliku${R.closingEntries ? ` z pominięciem ${R.closingEntries} zapisów przeksięgowania na wynik finansowy` : ''}: przychody = Ma − Wn, koszty = Wn − Ma.` : 'Kwoty to obroty narastająco z zestawienia obrotów i sald.'),
    pick,
    h('div', { class: 'jpk-tiles' }, ...[['Zysk (strata) netto', R.net], [`Wariant`, null]].map(([l, n]) => n === null ? h('div', { class: 'card tile' }, h('span', { class: 'num', style: { fontSize: '22px' } }, R.variant), h('span', { class: 'lbl' }, 'Wariant RZiS')) : h('div', { class: 'card tile' + (n < 0 ? ' jpk-bad' : '') }, h('span', { class: 'num', style: { fontSize: '22px' } }, fmtN(n)), h('span', { class: 'lbl' }, l)))),
    wz === 'mikro' && v === 'RK' ? h('p', { class: 'jpk-warn' }, 'Plik ma tylko znaczniki wariantu kalkulacyjnego – koszty w RZiS jednostki mikro pokazano bez podziału na rodzaje (amortyzacja, materiały, wynagrodzenia, pozostałe).') : null,
    h('section', { class: 'card section' }, h('div', { class: 'section-head' }, h('h2', {}, `Rachunek zysków i strat – ${wz === 'mikro' ? WZORY.mikro.toLowerCase() : `wariant ${R.variant}${wz === 'mala' ? ' (jednostka mała)' : ''}`}`), h('span', { class: 'small muted' }, 'kliknij pozycję, aby zobaczyć konta')),
      finTable(R.rows, [{ key: 'v', label: `Kwota za okres${m.header.DataOd ? ` ${m.header.DataOd} – ${m.header.DataDo}` : ''}` }], { accInfo: a => `Wn ${fmtN(a.wn)} / Ma ${fmtN(a.ma)}` })),
    B.unclosed && Math.abs(B.unclosed - R.net) >= 0.01 ? h('p', { class: 'small muted' }, `Saldo niezamkniętych kont wynikowych w bilansie: ${fmtN(B.unclosed)} – różnica względem RZiS może wynikać z kont wynikowych bez znacznika RZiS lub ze znacznikiem tylko jednego wariantu.`) : null];
}

const rpdCard = rpd => h('section', { class: 'card section' }, h('div', { class: 'section-head' }, h('h2', {}, 'Rozliczenie podatku dochodowego (RPD)')),
  h('div', { class: 'jpk-scroll' }, h('table', { class: 'jpk-table' }, h('tbody', {}, ...Object.keys(rpd).map(k => h('tr', {}, h('td', {}, k), h('td', { class: 'w' }, lbl(k)), h('td', { class: 'n' }, fmtN(num(rpd[k])))))))));

// ----- JPK_ST_KR -----
const ST_COLS = ['E_1', 'E_7', 'E_8', 'E_2', 'E_3', 'E_4', 'E_5', 'E_6', 'E_9_1', 'E_10A', 'E_10B', 'E_11', 'E_12', 'E_13', 'E_14', 'E_15', 'E_16', 'E_17', 'E_18', 'E_19', 'E_20',
  'E_21', 'E_22', 'E_23', 'E_24', 'E_25A', 'E_25B', 'E_26', 'E_27', 'E_28', 'E_29', 'E_30', 'E_31', 'E_32'];
function viewSt(m) {
  const cols = ST_COLS.filter(k => ['E_1', 'E_7', 'E_12', 'E_19', 'E_20', 'E_21', 'E_26', 'E_27'].includes(k) || m.assets.some(a => a[k]))
    .map(k => ({ key: k, label: lbl(k), num: NUM.has(k), sum: !['E_10A', 'E_11', 'E_25A'].includes(k), w: k === 'E_7' ? 220 : null, wrap: k === 'E_7' }));
  const s = k => r2(m.assets.reduce((a, x) => a + num(x[k]), 0));
  let tab = 'sum'; const body = h('div'); let tabs = h('div');
  const render = () => {
    tabs.replaceWith(tabs = tabsBar([['sum', 'Podsumowanie'], ['list', 'Ewidencja', m.assets.length]], k => { tab = k; render(); }, tab));
    if (tab === 'list') return body.replaceChildren(dataTable({ cols, rows: m.assets, onRow: a => modal(a.E_7 || a.E_1, h('div', { class: 'jpk-kvs' }, ...Object.keys(a).map(k => h('div', { class: 'jpk-kv' }, h('span', {}, lbl(k)), h('b', {}, NUM.has(k) ? fmtN(num(a[k])) : a[k])))), c => [h('button', { class: 'btn btn-primary btn-sm', onclick: c }, 'Zamknij')], { wide: true }) }).el);
    const out = m.assets.filter(a => a.E_28).length;
    body.replaceChildren(
      h('div', { class: 'jpk-tiles' }, ...[['Pozycje w ewidencji', fmtInt(m.assets.length)], ['Wykreślone w roku', fmtInt(out)], ['Wartość pocz. podatkowa', fmtN(s('E_12'))], ['Amortyzacja podatkowa w roku', fmtN(s('E_19'))]]
        .map(([l, n]) => h('div', { class: 'card tile' }, h('span', { class: 'num', style: { fontSize: '22px' } }, n), h('span', { class: 'lbl' }, l)))),
      h('section', { class: 'card section' }, h('div', { class: 'section-head' }, h('h2', {}, 'Zestawienie wartości')),
        h('div', { class: 'jpk-scroll' }, h('table', { class: 'jpk-table' }, h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', { class: 'n' }, 'Ujęcie podatkowe'), h('th', { class: 'n' }, 'Ujęcie bilansowe'))),
          h('tbody', {}, ...[['Wartość początkowa', 'E_12', 'E_21'], ['Wartość początkowa po aktualizacji', 'E_13', 'E_22'], ['Zmiana wartości początkowej', 'E_15', 'E_24'], ['Amortyzacja w roku', 'E_19', 'E_26'], ['Umorzenie narastająco', 'E_20', 'E_27'], ['Amortyzacja niebędąca KUP', 'E_18', null]]
            .map(([n, a, b]) => h('tr', {}, h('td', {}, n), h('td', { class: 'n' }, fmtN(s(a))), h('td', { class: 'n' }, b ? fmtN(s(b)) : '—'))))))));
  };
  const el = h('div', {}, metaCard(m), h('div', { class: 'jpk-bar' }, tabs, exportBar(m)), body);
  render();
  return el;
}

// ----- inne JPK -----
function viewGeneric(m) {
  let tab = m.groups[0]?.name || 'sum'; const body = h('div'); let tabs = h('div');
  const render = () => {
    tabs.replaceWith(tabs = tabsBar([['sum', 'Nagłówek'], ...m.groups.map(g => [g.name, g.name, g.rows.length])], k => { tab = k; render(); }, tab));
    const g = m.groups.find(x => x.name === tab);
    body.replaceChildren(g ? dataTable({ cols: g.cols, rows: g.rows }).el : h('section', { class: 'card section' }, h('div', { class: 'jpk-kvs' }, ...Object.entries(m.header).map(([k, v]) => h('div', { class: 'jpk-kv' }, h('span', {}, lbl(k)), h('b', {}, v))))));
  };
  const el = h('div', {}, metaCard(m), h('p', { class: 'hint' }, 'Ten rodzaj JPK jest wyświetlany w postaci tabel z polami pliku (kody pól jak w schemacie).'), h('div', { class: 'jpk-bar' }, tabs, exportBar(m)), body);
  render();
  return el;
}

// ---------- eksport: Excel ----------
const baseName = m => (m.fileName || 'JPK').replace(/\.xml$/i, '');
function infoRows(m) {
  const H = m.header, S = m.subject;
  return [['Nazwa', S.PelnaNazwa], ['NIP', S.NIP], ['REGON', S.REGON], ['Adres', S.Adres], ['Formularz', H.KodFormularza], ['Cel złożenia', CEL[H.CelZlozenia] || H.CelZlozenia],
    ['Okres od', H.DataOd], ['Okres do', H.DataDo], ['Rok obrotowy', H.RokDataOd ? `${H.RokDataOd} – ${H.RokDataDo}` : ''], ['Rok podatkowy', H.RokPdDataOd ? `${H.RokPdDataOd} – ${H.RokPdDataDo}` : ''],
    ['Kod urzędu', H.KodUrzedu], ['Waluta', H.DomyslnyKodWaluty], ['Data wytworzenia', H.DataWytworzeniaJPK], ['CIT estoński', S.Znacznik_EST ? 'tak' : ''], ['Plik', m.fileName]].filter(r => r[1]);
}
const cell = (v, isNum) => isNum ? (v === undefined || v === '' ? '' : { v: num(v), s: 'money' }) : (v ?? '');
const sheetFrom = (name, cols, rows, title) => ({
  name, freeze: { row: title ? 3 : 1, col: 1 }, widths: cols.map(c => c.wrap ? 48 : c.num ? 16 : Math.min(30, Math.max(10, c.label.length + 2))),
  rows: [...(title ? [[{ v: title, s: 'title' }], []] : []), cols.map(c => ({ v: c.label, s: 'header' })), ...rows.map(r => cols.map(c => cell(r[c.key], c.num)))],
});

function exportExcel(m) {
  const sheets = [{ name: 'Informacje', widths: [26, 70], rows: [[{ v: `${m.code || 'JPK'} – ${m.subject.PelnaNazwa || ''}`, s: 'title' }], [], ...infoRows(m).map(([k, v]) => [{ v: k, s: 'header' }, v])] }];
  const C = keys => keys.map(k => ({ key: k, label: `${lbl(k)} (${k})`, num: NUM.has(k), wrap: ['S_2', 'D_10', 'Z_2', 'E_7'].includes(k) }));
  if (m.kind === 'kr_pd') {
    const A = m._a || (m._a = analyzeKr(m));
    sheets[0].rows.push([], [{ v: 'Sumy kontrolne', s: 'header' }, { v: 'W pliku', s: 'header' }, { v: 'Wyliczone', s: 'header' }, { v: 'Wynik', s: 'header' }],
      ...A.ctrlRows.map(r => [`${r.k} ${lbl(r.k)}`, r.file === undefined ? '' : num(r.file), r.calc, r.ok === null ? '' : r.ok ? 'zgodne' : 'RÓŻNICA']),
      [], [{ v: 'Kontrola bilansu', s: 'header' }, { v: 'Winien', s: 'header' }, { v: 'Ma', s: 'header' }, { v: 'Różnica', s: 'header' }],
      ...A.balance.map(b => [b.name, { v: b.wn, s: 'money' }, { v: b.ma, s: 'money' }, { v: b.diff, s: 'money' }]));
    sheets.push(sheetFrom('Konta ZOiS', C(['S_1', 'S_2', 'S_3', 'S_4', 'S_5', 'S_6', 'S_7', 'S_8', 'S_9', 'S_10', 'S_11', 'S_12_1', 'S_12_2', 'S_12_3']), m.accounts));
    sheets.push(sheetFrom('Dziennik', C(['D_1', 'D_2', 'D_3', 'D_4', 'D_5', 'D_6', 'D_7', 'D_8', 'D_9', 'D_10', 'D_11', 'D_12']), m.journal));
    sheets.push(sheetFrom('Zapisy na kontach', [{ key: 'D_1', label: 'Nr zapisu w dzienniku (D_1)' }, { key: 'D_8', label: 'Data księgowania (D_8)' }, ...C(['Z_1', 'Z_2', 'Z_3']), { key: '_n', label: 'Nazwa konta' }, ...C(['Z_4', 'Z_7', 'Z_5', 'Z_6', 'Z_8', 'Z_9'])],
      (() => { const n = new Map(m.accounts.map(a => [a.S_1, a.S_2])); return m.postings.map(p => ({ ...p, _n: n.get(p.Z_3) || '' })); })()));
    for (const k of ['S_12_1', 'S_12_2', 'S_12_3']) if (m.accounts.some(a => a[k]))
      sheets.push(sheetFrom(`Znaczniki ${k}`, [{ key: 'marker', label: lbl(k) }, { key: 'n', label: 'Liczba kont' }, ...['S_4', 'S_5', 'S_6', 'S_7', 'S_8', 'S_9', 'S_10', 'S_11'].map(f => ({ key: f, label: lbl(f), num: true })), { key: 'saldo', label: 'Saldo (Wn − Ma)', num: true }], markerGroups(m.accounts, k)));
    const iss = issuesOf(m);
    sheets.splice(1, 0, { name: 'Kontrola', widths: [10, 60, 14, 40, 60], rows: [[{ v: 'Kontrola pliku', s: 'title' }], [],
      ['Poziom', 'Problem', 'Konto', 'Nazwa konta', 'Szczegóły'].map(v => ({ v, s: 'header' })),
      ...(iss.length ? iss.flatMap(i => [[{ v: i.level === 'error' ? 'BŁĄD' : 'uwaga', s: i.level === 'error' ? 'missing' : 'normal' }, { v: i.title, s: 'wrap' }, '', '', { v: i.text || '', s: 'wrap' }],
        ...i.accounts.map(a => ['', '', a.S_1, a.S_2 || '', a.info || ''])]) : [['', 'Nie wykryto problemów']])] });
    const B = m._bil || (m._bil = buildBilans(m));
    const wz = getWz(m), SB = wz === 'pelny' ? B : bilansSimple(B, wz);
    const finRows = (rows, cols) => rows.map(r => [r.key, { v: '   '.repeat(r.depth - 1) + (r.name || ''), s: (r.depth === 1 || r.calc) && !r.wt ? 'header' : 'normal' }, ...cols.map(c => ({ v: r[c], s: 'money' }))]);
    sheets.push({ name: 'Bilans (pomocniczo)', widths: [12, 70, 20, 20], rows: [[{ v: `Bilans – ${WZORY[wz]} – zestawienie pomocnicze ze znaczników kont (nie jest częścią JPK)`, s: 'title' }], [],
      ['Poz.', 'AKTYWA', 'Stan na początek', 'Stan na koniec'].map(v => ({ v, s: 'header' })), ...finRows(SB.aktywa, ['start', 'end']), ['', { v: 'Aktywa razem', s: 'header' }, { v: r2(B.tA.start), s: 'money' }, { v: r2(B.tA.end), s: 'money' }], [],
      ['Poz.', 'PASYWA', 'Stan na początek', 'Stan na koniec'].map(v => ({ v, s: 'header' })), ...finRows(SB.pasywa, ['start', 'end']), ['', { v: 'Pasywa razem', s: 'header' }, { v: r2(B.tP.start), s: 'money' }, { v: r2(B.tP.end), s: 'money' }]] });
    for (const v of rzisVariants(m, wz)) {
      const R = wz === 'pelny' ? buildRzis(m, v) : { ...rzisSimple(buildRzis(m, v), wz, v), variant: wz === 'mikro' ? 'mikro' : buildRzis(m, v).variant };
      sheets.push({ name: `RZiS ${R.variant} (pomocniczo)`, widths: [12, 70, 20], rows: [[{ v: `Rachunek zysków i strat – ${WZORY[wz]} – ${wz === 'mikro' ? '' : 'wariant ' + R.variant + ' – '}zestawienie pomocnicze (nie jest częścią JPK)`, s: 'title' }], [],
        ['Poz.', 'Wyszczególnienie', 'Kwota'].map(x => ({ v: x, s: 'header' })), ...finRows(R.rows, ['v'])] });
    }
    if (m.contractors.length) sheets.push(sheetFrom('Kontrahenci', C(['T_1', 'T_2', 'T_3']), m.contractors));
    if (m.rpd) sheets.push({ name: 'RPD', widths: [8, 60, 18], rows: [['Pole', 'Opis', 'Kwota'].map(v => ({ v, s: 'header' })), ...Object.keys(m.rpd).map(k => [k, lbl(k), { v: num(m.rpd[k]), s: 'money' }])] });
  } else if (m.kind === 'st_kr') {
    sheets.push(sheetFrom('Ewidencja ŚT i WNiP', C(ST_COLS.filter(k => m.assets.some(a => a[k]))), m.assets));
  } else {
    for (const g of m.groups) sheets.push(sheetFrom(g.name, g.cols, g.rows));
  }
  downloadXlsx(`${baseName(m)}.xlsx`, sheets);
}

// ---------- eksport: PDF ----------
function exportPdfDialog(m) {
  if (m.kind !== 'kr_pd') return printReport(m, {});
  const cb = (label, checked) => { const i = h('input', { type: 'checkbox', checked }); return [i, h('label', { class: 'check', style: { display: 'flex', gap: '8px', alignItems: 'center', margin: '6px 0' } }, i, label)]; };
  const [zo, zoL] = cb('Zestawienie obrotów i sald (konta)', true);
  const [mk, mkL] = cb('Sumy według znaczników kont', true);
  const [fin, finL] = cb(`Bilans i RZiS – ${WZORY[getWz(m)].toLowerCase()} (zestawienia pomocnicze)`, true);
  const [jr, jrL] = cb(`Dziennik z dekretacją (${fmtInt(m.journal.length)} zapisów)`, m.journal.length <= 300);
  modal('Raport PDF', h('div', {}, h('p', { class: 'small muted' }, 'Raport zawsze zawiera dane podmiotu, sumy kontrolne i kontrolę bilansu.'), finL, zoL, mkL, jrL,
    m.journal.length > 2000 ? h('p', { class: 'small muted' }, 'Dziennik jest duży – wydruk może mieć kilkaset stron. Do analizy lepiej użyć Excela.') : null),
  close => [h('button', { class: 'btn btn-outline btn-sm', onclick: close }, 'Anuluj'), h('button', { class: 'btn btn-primary btn-sm', onclick: () => { close(); printReport(m, { fin: fin.checked, zois: zo.checked, markers: mk.checked, journal: jr.checked }); } }, 'Utwórz PDF')]);
}

function printReport(m, o) {
  const tbl = (head, rows, numCols = []) => `<table><thead><tr>${head.map((x, i) => `<th class="${numCols.includes(i) ? 'n' : ''}">${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr${r._cls ? ` class="${r._cls}"` : ''}>${r.map((x, i) => `<td class="${numCols.includes(i) ? 'n' : ''}">${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const parts = [`<h1>${esc(m.code || 'JPK')}</h1><p class="sub">${esc(m.subject.PelnaNazwa || '')}${m.subject.NIP ? ' · NIP ' + esc(m.subject.NIP) : ''}</p>`,
    `<div class="kv">${infoRows(m).map(([k, v]) => `<span>${esc(k)}</span><b>${esc(v)}</b>`).join('')}</div>`];
  if (m.kind === 'kr_pd') {
    const A = m._a || (m._a = analyzeKr(m));
    const iss = issuesOf(m);
    parts.push('<h2>Kontrola pliku</h2>' + (iss.length ? iss.map(i => `<div class="iss ${i.level}"><b>${i.level === 'error' ? 'Błąd' : 'Uwaga'}: ${esc(i.title)}</b><div>${esc(i.text || '')}</div>${i.accounts.length ? `<div class="acc">${i.accounts.slice(0, 30).map(a => `${esc(a.S_1)} ${esc(a.S_2 || '')}${a.info ? ' – ' + esc(a.info) : ''}`).join('<br>')}${i.accounts.length > 30 ? `<br>… i ${i.accounts.length - 30} więcej` : ''}</div>` : ''}</div>`).join('') : '<p>✓ Nie wykryto problemów.</p>'));
    parts.push('<h2>Sumy kontrolne</h2>' + tbl(['Pole', 'Opis', 'W pliku', 'Wyliczone', 'Wynik'], A.ctrlRows.map(r => [r.k, lbl(r.k), r.file === undefined ? '—' : fmtN(num(r.file), ['C_1', 'C_3'].includes(r.k) ? 0 : 2), fmtN(r.calc, ['C_1', 'C_3'].includes(r.k) ? 0 : 2), r.ok === null ? '—' : r.ok ? '✓ zgodne' : '✗ różnica']), [2, 3]));
    parts.push('<h2>Kontrola bilansu</h2>' + tbl(['', 'Winien', 'Ma', 'Różnica'], A.balance.map(b => [b.name, fmtN(b.wn), fmtN(b.ma), fmtN(b.diff)]), [1, 2, 3]));
    if (m.rpd) parts.push('<h2>Rozliczenie podatku dochodowego (RPD)</h2>' + tbl(['Pole', 'Opis', 'Kwota'], Object.keys(m.rpd).map(k => [k, lbl(k), fmtN(num(m.rpd[k]))]), [2]));
    if (o.fin) {
      const B0 = m._bil || (m._bil = buildBilans(m));
      const wz = getWz(m), B = wz === 'pelny' ? B0 : { ...bilansSimple(B0, wz), tA: B0.tA, tP: B0.tP };
      const fr = (rows, cols) => rows.map(r => { const x = [r.key, '\u00a0'.repeat((r.depth - 1) * 3) + (r.name || r.key), ...cols.map(c => fmtN(r[c]))]; x._cls = (r.depth === 1 || r.calc) && !r.wt ? 'tot' : ''; return x; });
      const note = '<p class="note">Zestawienie pomocnicze wygenerowane przez aplikację na podstawie znaczników kont i sald z pliku JPK_KR_PD – nie jest częścią pliku JPK ani sprawozdaniem finansowym.</p>';
      const tA = ['', 'Aktywa razem', fmtN(B.tA.start), fmtN(B.tA.end)]; tA._cls = 'tot'; const tP = ['', 'Pasywa razem', fmtN(B.tP.start), fmtN(B.tP.end)]; tP._cls = 'tot';
      parts.push(`<h2 class="pb">Bilans – ${esc(WZORY[wz])} (zestawienie pomocnicze)</h2>` + note + tbl(['Poz.', 'Aktywa', 'Stan na początek', 'Stan na koniec'], [...fr(B.aktywa, ['start', 'end']), tA], [2, 3]) + tbl(['Poz.', 'Pasywa', 'Stan na początek', 'Stan na koniec'], [...fr(B.pasywa, ['start', 'end']), tP], [2, 3]));
      for (const v of rzisVariants(m, wz)) { const RF = buildRzis(m, v), R = wz === 'pelny' ? RF : rzisSimple(RF, wz, v); parts.push(`<h2 class="pb">Rachunek zysków i strat – ${esc(WZORY[wz])}${wz === 'mikro' ? '' : ' – wariant ' + RF.variant} (zestawienie pomocnicze)</h2>` + note + tbl(['Poz.', 'Wyszczególnienie', 'Kwota'], fr(R.rows, ['v']), [2])); }
    }
    if (o.markers) for (const k of ['S_12_1', 'S_12_2', 'S_12_3']) if (m.accounts.some(a => a[k]))
      parts.push(`<h2>Sumy według znacznika: ${esc(lbl(k))} (${k})</h2>` + tbl(['Znacznik', 'Kont', 'BO Wn', 'BO Ma', 'Obroty Wn', 'Obroty Ma', 'Saldo Wn', 'Saldo Ma'], markerGroups(m.accounts, k).map(g => [g.marker, g.n, fmtN(g.S_4), fmtN(g.S_5), fmtN(g.S_6), fmtN(g.S_7), fmtN(g.S_10), fmtN(g.S_11)]), [1, 2, 3, 4, 5, 6, 7]));
    if (o.zois) {
      const rows = m.accounts.map(a => [a.S_1, a.S_2, fmtN(num(a.S_4)), fmtN(num(a.S_5)), fmtN(num(a.S_6)), fmtN(num(a.S_7)), fmtN(num(a.S_10)), fmtN(num(a.S_11)), [a.S_12_1, a.S_12_3].filter(Boolean).join(' / ')]);
      const t = A.totals; const tot = ['Razem', '', fmtN(t.S_4), fmtN(t.S_5), fmtN(t.S_6), fmtN(t.S_7), fmtN(t.S_10), fmtN(t.S_11), '']; tot._cls = 'tot';
      parts.push('<h2 class="pb">Zestawienie obrotów i sald</h2>' + tbl(['Konto', 'Nazwa', 'BO Wn', 'BO Ma', 'Obroty Wn', 'Obroty Ma', 'Saldo Wn', 'Saldo Ma', 'Znaczniki'], [...rows, tot], [2, 3, 4, 5, 6, 7]));
    }
    if (o.journal) {
      const nm = new Map(m.accounts.map(a => [a.S_1, a.S_2]));
      parts.push('<h2 class="pb">Dziennik</h2>' + m.journal.map(j => `<div class="jr"><div class="jh"><b>${esc(j.D_1)}</b> · ${esc(j.D_8 || j.D_6 || '')} · ${esc(j.D_4 || '')} · ${esc(j.D_10 || '')}<span>${fmtN(num(j.D_11))}</span></div>` +
        tbl(['Konto', 'Nazwa konta', 'Opis', 'Wn', 'Ma'], j._z.map(i => m.postings[i]).map(z => [z.Z_3, nm.get(z.Z_3) || '', z.Z_2 || '', num(z.Z_4) ? fmtN(num(z.Z_4)) : '', num(z.Z_7) ? fmtN(num(z.Z_7)) : '']), [3, 4]) + '</div>').join(''));
    }
  } else if (m.kind === 'st_kr') {
    const s = k => r2(m.assets.reduce((a, x) => a + num(x[k]), 0));
    parts.push('<h2>Zestawienie wartości</h2>' + tbl(['', 'Podatkowo', 'Bilansowo'], [['Wartość początkowa', fmtN(s('E_12')), fmtN(s('E_21'))], ['Amortyzacja w roku', fmtN(s('E_19')), fmtN(s('E_26'))], ['Umorzenie narastająco', fmtN(s('E_20')), fmtN(s('E_27'))]], [1, 2]));
    parts.push('<h2 class="pb">Ewidencja środków trwałych i WNiP</h2>' + tbl(['Nr inw.', 'Nazwa', 'KŚT', 'Przyjęcie', 'Wart. pocz. podatk.', 'Amort. podatk. w roku', 'Umorz. podatk.', 'Wart. pocz. bil.', 'Amort. bil. w roku', 'Wykreślenie'],
      m.assets.map(a => [a.E_1, a.E_7, a.E_8 || '', a.E_4 || '', fmtN(num(a.E_12)), fmtN(num(a.E_19)), fmtN(num(a.E_20)), fmtN(num(a.E_21)), fmtN(num(a.E_26)), a.E_28 || '']), [4, 5, 6, 7, 8]));
  } else {
    for (const g of m.groups.slice(0, 6)) parts.push(`<h2 class="pb">${esc(g.name)} (${g.rows.length})</h2>` + tbl(g.cols.map(c => c.key), g.rows.slice(0, 2000).map(r => g.cols.map(c => c.num ? fmtN(num(r[c.key])) : (r[c.key] ?? ''))), g.cols.map((c, i) => c.num ? i : -1).filter(i => i >= 0)));
  }
  const now = new Date().toLocaleString('pl-PL');
  const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>${esc(baseName(m))}</title><style>
@page{size:A4 landscape;margin:12mm 10mm 14mm}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:Montserrat,Arial,sans-serif;font-size:8.6pt;color:#1D1A16;margin:0}
h1{font-size:16pt;margin:0 0 2px}.sub{color:#6b6157;margin:0 0 10px;font-size:10pt}
h2{font-size:11pt;margin:14px 0 6px;color:#1D1A16;break-after:avoid}.pb{break-before:page}
.kv{display:grid;grid-template-columns:150px 1fr 150px 1fr;gap:3px 10px;background:#F7F3EC;padding:8px 10px;border-radius:6px}.kv span{color:#7d7368}
table{width:100%;border-collapse:collapse;margin-bottom:6px}th{background:#1D1A16;color:#efe7da;text-align:left;padding:4px 5px;font-weight:600;font-size:7.8pt}
td{padding:3px 5px;border-bottom:.4pt solid #e3d9ca;vertical-align:top}th.n,td.n{text-align:right;white-space:nowrap}tr{break-inside:avoid}tr.tot td{font-weight:700;border-top:1pt solid #1D1A16}
.jr{break-inside:avoid;margin-bottom:6px}.jh{background:#F3EEE6;padding:3px 6px;display:flex;gap:4px}.jh span{margin-left:auto;font-weight:700}
.foot{margin-top:10px;font-size:7pt;color:#8a8178}.note{font-size:7.6pt;color:#7d7368;margin:0 0 6px}.iss{padding:4px 8px;margin:0 0 4px;border-left:3px solid #B08D57;background:#F7F3EC}.iss.error{border-color:#A4462F;background:#FBEDE7}.iss .acc{font-size:7.6pt;color:#4a433b;margin-top:2px}
</style></head><body>${parts.join('')}<div class="foot">Raport z pliku ${esc(m.fileName)} · wygenerowano ${esc(now)} w aplikacji RKDP / M2 TAX</div></body></html>`;
  printHtml(html, baseName(m));
}
