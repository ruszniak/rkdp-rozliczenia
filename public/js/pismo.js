// Odczyt pisma z urzędu (PDF) w przeglądarce: tekst przez pdf.js, rozpoznanie rodzaju pisma, daty pisma / doręczenia,
// terminu („w terminie 7 dni od dnia doręczenia”), sygnatury i organu. Plik nie opuszcza komputera.
const MONTHS = { stycznia: 1, lutego: 2, marca: 3, kwietnia: 4, maja: 5, czerwca: 6, lipca: 7, sierpnia: 8, września: 9, wrzesnia: 9, października: 10, pazdziernika: 10, listopada: 11, grudnia: 12 };
const WORDS = { jednego: 1, dwóch: 2, dwoch: 2, trzech: 3, czterech: 4, pięciu: 5, pieciu: 5, sześciu: 6, szesciu: 6, siedmiu: 7, ośmiu: 8, osmiu: 8, dziewięciu: 9, dziesięciu: 10, dziesieciu: 10, czternastu: 14, piętnastu: 15, pietnastu: 15, dwudziestu: 20, trzydziestu: 30, sześćdziesięciu: 60 };
const pad = n => String(n).padStart(2, '0');
const isoOk = (y, m, d) => y > 2000 && y < 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(m)}-${pad(d)}` : null;

let pdfjs = null;
async function loadPdfJs() {
  if (pdfjs) return pdfjs;
  const url = '/lib/pdfjs/pdf.min.mjs'; // zmienna – bundler nie dołącza biblioteki do głównego pakietu
  pdfjs = await import(/* @vite-ignore */ url);
  pdfjs.GlobalWorkerOptions.workerSrc = '/lib/pdfjs/pdf.worker.min.mjs';
  return pdfjs;
}

export async function pdfText(file, maxPages = 6) {
  const lib = await loadPdfJs();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, disableFontFace: true }).promise;
  let text = '';
  for (let p = 1; p <= Math.min(doc.numPages, maxPages); p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    let lastY = null;
    for (const it of tc.items) {
      const y = it.transform?.[5];
      if (lastY !== null && Math.abs(y - lastY) > 3) text += '\n';
      text += it.str + (it.hasEOL ? '\n' : ' ');
      lastY = y;
    }
    text += '\n';
  }
  return { text: text.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n'), pages: doc.numPages };
}

function datesIn(t) {
  const out = [];
  const re1 = /\b(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})\s*(?:r\.?)?/g, re2 = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
  const re3 = new RegExp(`\\b(\\d{1,2})\\s+(${Object.keys(MONTHS).join('|')})\\s+(\\d{4})`, 'gi');
  let m;
  while ((m = re1.exec(t))) { const v = isoOk(+m[3], +m[2], +m[1]); if (v) out.push({ v, i: m.index }); }
  while ((m = re2.exec(t))) { const v = isoOk(+m[1], +m[2], +m[3]); if (v) out.push({ v, i: m.index }); }
  while ((m = re3.exec(t))) { const v = isoOk(+m[3], MONTHS[m[2].toLowerCase()], +m[1]); if (v) out.push({ v, i: m.index }); }
  return out.sort((a, b) => a.i - b.i);
}

// rodzaj pisma -> reguła z kalkulatora terminów (m2/dict.js DEADLINE_RULES)
const KINDS = [
  [/zawiadomienie[^.]{0,120}art\.?\s*200|wypowiedzenia się co do zebranego materiału/i, 'art200', 'Zawiadomienie (art. 200 OP)'],
  [/protok[oó]ł\s+(z\s+)?kontroli|protokołu kontroli podatkowej/i, 'protokol', 'Protokół kontroli podatkowej'],
  [/wynik\s+kontroli\s+celno/i, 'wynik_ucs', 'Wynik kontroli celno-skarbowej'],
  [/\bdecyzj[ai]\b/i, 'odwolanie', 'Decyzja'],
  [/\bpostanowieni[ea]\b[^.]{0,200}(zażalenie|zazalenie)/i, 'zazalenie', 'Postanowienie (zażalenie)'],
  [/\bwezwani[ea]\b/i, 'wezwanie', 'Wezwanie'],
  [/\bupomnieni[ea]\b/i, 'wezwanie', 'Upomnienie'],
];

export function analyzeLetter(text) {
  const t = text.replace(/­/g, '');
  const low = t.toLowerCase();
  const dates = datesIn(t);
  // data doręczenia (ePUAP/e-Doręczenia: „Data doręczenia”, „doręczono dnia”), inaczej data pisma („…, dnia 12.10.2026”)
  let served = null, letterDate = null;
  const sv = /(dat[ai]\s+doręczenia|doręczon[oaey]\s+(?:w\s+)?dni[au]|data\s+odbioru|data\s+wpływu)[^\d]{0,30}/i.exec(t);
  if (sv) served = dates.find(d => d.i >= sv.index && d.i - sv.index < 80)?.v || null;
  const ld = /,\s*(?:dnia|dn\.)?\s*(?=\d)/.exec(t.slice(0, 1500));
  letterDate = (ld ? dates.find(d => d.i >= ld.index && d.i - ld.index < 25)?.v : null) || dates[0]?.v || null;
  // termin w dniach
  let days = null, daysText = '';
  const dm = /w\s+terminie\s+(\d{1,3}|[a-ząćęłńóśźż]+)\s+dni(?:\s+od\s+dnia\s+(doręczenia|otrzymania)[^.\n]{0,40})?/i.exec(t);
  if (dm) { days = /^\d+$/.test(dm[1]) ? +dm[1] : WORDS[dm[1].toLowerCase()] || null; daysText = dm[0].trim(); }
  if (!days) { const wm = /w\s+terminie\s+(\d+|dwóch|dwoch)\s+tygodni/i.exec(t); if (wm) { days = (/^\d+$/.test(wm[1]) ? +wm[1] : 2) * 7; daysText = wm[0]; } }
  // rodzaj pisma
  let rule = null, kind = '';
  for (const [re, r, l] of KINDS) if (re.test(t.slice(0, 4000))) { rule = r; kind = l; break; }
  if (rule !== 'wezwanie' && days && /wezwani|zawiadomi|upomnieni/.test(low.slice(0, 3000)) && rule !== 'art200') rule = 'wezwanie';
  // sygnatura i organ
  const sig = /(?:znak(?:\s+sprawy)?|sygn(?:\.|atura)?(?:\s+akt)?|nr\s+sprawy)\s*:?\s*([A-Z0-9][A-Z0-9.\-/ ]{5,60})/i.exec(t)?.[1]?.trim().replace(/\s{2,}.*/, '') || '';
  const org = /(Naczelnik[^\n]{3,80}|Dyrektor\s+Izby\s+Administracji\s+Skarbowej[^\n]{0,60}|Urząd\s+Skarbowy[^\n]{0,60}|Urząd\s+Celno-Skarbowy[^\n]{0,60}|Wójt[^\n]{0,60}|Burmistrz[^\n]{0,60}|Prezydent\s+Miasta[^\n]{0,60})/i.exec(t)?.[1]?.trim() || '';
  const orgN = org && org === org.toUpperCase() ? org.toLowerCase().replace(/(^|\s)(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/\b(We|W|Ds\.?)\b/g, w => w.toLowerCase()) : org;
  return { served, letterDate, days, daysText, rule, kind, sig, org: orgN, dates: dates.map(d => d.v) };
}
