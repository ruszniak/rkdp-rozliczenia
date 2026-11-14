// Gotowy plik PDF prosto z przeglądarki (bez okna drukowania) – dla wszystkich dokumentów w aplikacji.
// Dokument HTML (ten sam, który dotąd szedł do druku) renderujemy w ukrytej ramce z regułami „@media print”,
// dzielimy na strony według jego „@page” (format, orientacja, marginesy, stopka, numer strony) i składamy w PDF:
//  • obraz strony w wysokiej rozdzielczości (wygląd 1:1 z wydrukiem),
//  • pod spodem niewidoczna warstwa tekstu (jak w skanach z OCR) – tekst da się zaznaczyć, skopiować i wyszukać.
// Strony dzielimy tylko między wierszami tekstu, kartami i wierszami tabel; nagłówki tabel powtarzają się na kolejnych stronach.
const MM = 96 / 25.4;
const PT = 72 / 96;                          // px CSS → punkty PDF
const FONTS = [
  ['Montserrat', 400, 'Montserrat-Regular'], ['Montserrat', 500, 'Montserrat-Medium'], ['Montserrat', 600, 'Montserrat-SemiBold'], ['Montserrat', 700, 'Montserrat-Bold'],
  ['Plus Jakarta Sans', 600, 'PlusJakartaSans-SemiBold'], ['Plus Jakarta Sans', 700, 'PlusJakartaSans-Bold'], ['Plus Jakarta Sans', 800, 'PlusJakartaSans-ExtraBold'],
  ['Source Sans 3', 400, 'SourceSans3-Regular'], ['Source Sans 3', 600, 'SourceSans3-Semibold'], ['Source Sans 3', 700, 'SourceSans3-Bold'],
  ['Inter', 400, 'Inter-Regular'], ['Inter', 600, 'Inter-SemiBold'],
];
const fontUrl = file => `${location.origin}/fonts/pdf/${file}.woff2`;

// ---------- czcionki ----------
const dataCache = new Map();
const toDataUrl = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
function fontData(file) {
  if (!dataCache.has(file)) dataCache.set(file, fetch(fontUrl(file)).then(r => { if (!r.ok) throw new Error('font ' + file); return r.blob(); }).then(toDataUrl).catch(e => { dataCache.delete(file); throw e; }));
  return dataCache.get(file);
}
let docFontsP = null;
const docFonts = () => docFontsP ||= Promise.all(FONTS.filter(f => f[0] === 'Montserrat').map(async ([fam, w, file]) => {
  try { const ff = new FontFace(fam, `url(${await fontData(file)})`, { weight: String(w) }); await ff.load(); document.fonts.add(ff); } catch { /* */ }
}));
// tylko rodziny użyte w dokumencie (mniej danych w każdym obrazie)
const usedFonts = html => FONTS.filter(([fam]) => html.includes(fam) || html.includes(fam.replace(/ /g, '+')));
async function embedCss(list) {
  return (await Promise.all(list.map(async ([fam, w, file]) => `@font-face{font-family:'${fam}';font-weight:${w};font-style:normal;src:url(${await fontData(file)}) format('woff2');}`))).join('\n');
}

// ---------- ustawienia strony z „@page” ----------
const toPx = v => { const m = String(v).trim().match(/^(-?[\d.]+)(mm|cm|in|px|pt)?$/); if (!m) return 0; const n = +m[1]; return ({ mm: n * MM, cm: n * 10 * MM, in: n * 96, pt: n / PT, px: n })[m[2] || 'px'] ?? n; };
function pageSetup(html) {
  const m = html.match(/@page\s*\{((?:[^{}]|\{[^{}]*\})*)\}/);
  const body = m ? m[1] : '';
  const own = body.replace(/@[a-z-]+\s*\{[^}]*\}/g, '');
  const size = (own.match(/size\s*:\s*([^;]+)/) || [])[1] || 'A4';
  const land = /landscape/.test(size);
  const mg = ((own.match(/margin\s*:\s*([^;}]+)/) || [])[1] || '12mm').trim().split(/\s+/).map(toPx);
  const [t, r = t, b = t, l = r] = mg;
  const foot = ((body.match(/@bottom-left\s*\{[^}]*content\s*:\s*"([^"]*)"/) || [])[1] || '').replace(/&amp;/g, '&');
  return { W: (land ? 297 : 210) * MM, H: (land ? 210 : 297) * MM, mt: t, mr: r, mb: b, ml: l, foot, numbers: /counter\(page\)/.test(body) };
}

// ---------- tekst (niewidoczna warstwa): Helvetica z polskimi znakami przez /Differences ----------
const PL = 'ąćęłńśźżĄĆĘŁŃŚŹŻ';
const PL_NAMES = ['aogonek', 'cacute', 'eogonek', 'lslash', 'nacute', 'sacute', 'zacute', 'zdotaccent', 'Aogonek', 'Cacute', 'Eogonek', 'Lslash', 'Nacute', 'Sacute', 'Zacute', 'Zdotaccent'];
const PL_CODES = [0x81, 0x8D, 0x8F, 0x90, 0x9D, 0xA4, 0xA6, 0xA8, 0xAA, 0xAF, 0xB4, 0xB8, 0xB9, 0xBA, 0xBC, 0xBD];
const PL_BASE = 'acelnszzACELNSZZ';
const WIN = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99 };
function encodeText(s) {
  let hex = '', plain = '';
  for (const ch of s.normalize('NFC')) {
    let code, base = ch;
    const i = PL.indexOf(ch);
    if (i >= 0) { code = PL_CODES[i]; base = PL_BASE[i]; }
    else if (WIN[ch]) { code = WIN[ch]; base = ch === '–' || ch === '—' ? '-' : ch === '…' ? '.' : '"'; }
    else { const c = ch.codePointAt(0); if (c === 0xA0 || c === 0x202F) { code = 32; base = ' '; } else if (c >= 32 && c <= 255 && !(c >= 0x7F && c < 0xA0)) code = c; else { code = 0x3F; base = '?'; } }
    hex += code.toString(16).padStart(2, '0'); plain += base;
  }
  return { hex, plain };
}
// fragmenty tekstu z pozycją (px od lewego górnego rogu elementu „root”): jeden wpis na wiersz w danym węźle tekstowym
function textRuns(root) {
  const d = root.ownerDocument, w = d.defaultView, R = root.getBoundingClientRect(), out = [];
  const walker = d.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => {
    if (!n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
    const p = n.parentElement; if (!p || /^(STYLE|SCRIPT|TITLE)$/.test(p.tagName)) return NodeFilter.FILTER_REJECT;
    const cs = w.getComputedStyle(p); if (cs.visibility === 'hidden' || +cs.opacity === 0 || !p.getClientRects().length) return NodeFilter.FILTER_REJECT;
    return NodeFilter.FILTER_ACCEPT; } });
  const rg = d.createRange();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const txt = n.nodeValue, re = /\S+/g; let m, cur = null;
    while ((m = re.exec(txt))) {
      rg.setStart(n, m.index); rg.setEnd(n, m.index + m[0].length);
      const r = rg.getClientRects()[0]; if (!r || r.width < 0.5) continue;
      const x = r.left - R.left, y = r.top - R.top;
      if (cur && Math.abs(cur.y - y) < Math.max(2, r.height * 0.4) && x >= cur.x) { cur.text += ' ' + m[0]; cur.w = x + r.width - cur.x; cur.h = Math.max(cur.h, r.height); }
      else { cur && out.push(cur); cur = { x, y, w: r.width, h: r.height, text: m[0] }; }
    }
    cur && out.push(cur);
  }
  return out;
}

// ---------- podział na strony ----------
function layoutInfo(root, maxAtom) {
  const d = root.ownerDocument, w = d.defaultView, top0 = root.getBoundingClientRect().top;
  const ranges = [], forced = new Set(), heads = [];
  for (const e of root.querySelectorAll('*')) {
    const cs = w.getComputedStyle(e);
    if (cs.display === 'none' || cs.display === 'contents' || cs.position === 'fixed') continue;
    const r = e.getBoundingClientRect(), t = r.top - top0, b = r.bottom - top0;
    if (/page|always|left|right/.test(cs.breakBefore + ' ' + cs.pageBreakBefore) && t > 1) forced.add(t);
    if (/page|always|left|right/.test(cs.breakAfter + ' ' + cs.pageBreakAfter) && r.height > 0) forced.add(b);
    if (cs.display.startsWith('inline') || r.height < 1) continue;
    const boxed = !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor) || parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0;
    const leaf = ![...e.children].some(c => { const dd = w.getComputedStyle(c).display; return !dd.startsWith('inline') && dd !== 'none'; });
    const tag = e.tagName.toUpperCase();
    const atom = ['TR', 'LI', 'IMG', 'SVG', 'H1', 'H2', 'H3', 'H4', 'P', 'FIGURE'].includes(tag) || leaf || boxed || /avoid/.test(cs.breakInside + ' ' + cs.pageBreakInside);
    if (atom && r.height <= maxAtom) ranges.push([t, b]);
    if (/^H[1-4]$/.test(tag) || /avoid/.test(cs.breakAfter + ' ' + cs.pageBreakAfter)) ranges.push([t, Math.min(b + 70, t + maxAtom)]);
    if (tag === 'TR' && e.classList.contains('grp') && e.nextElementSibling) ranges.push([t, Math.min(e.nextElementSibling.getBoundingClientRect().bottom - top0, t + maxAtom)]);
    if (tag === 'TABLE' && e.tHead && e.tHead.offsetHeight && e.tHead.offsetHeight < maxAtom / 3) { const th = e.tHead.getBoundingClientRect(); heads.push({ top: t, bottom: b, hTop: th.top - top0, hH: th.height }); }
  }
  return { ranges, forced: [...forced].sort((a, b) => a - b), heads };
}
function nextCut(start, avail, total, ranges, forced) {
  const f = forced.find(y => y > start + 2);
  const target = start + avail;
  if (f !== undefined && f <= target + 1) return Math.min(f, total);
  if (target >= total) return total;
  const inside = y => ranges.some(([a, b]) => y > a + 0.5 && y < b - 0.5);
  const cands = new Set([target]);
  ranges.forEach(([a, b]) => { if (a > start && a <= target) cands.add(a); if (b > start && b <= target) cands.add(b); });
  const ok = [...cands].filter(y => y > start + avail * 0.35 && !inside(y)).sort((x, y) => y - x);
  return ok[0] ?? target;
}

const wait = ms => new Promise(r => setTimeout(r, ms));
const safeName = s => (s || 'dokument').replace(/[\\/:*?"<>|]+/g, '-').replace(/_/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150) || 'dokument';
const blankPage = (P, SCALE) => { const c = document.createElement('canvas'); c.width = Math.round(P.W * SCALE); c.height = Math.round(P.H * SCALE); const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); return c; };

// html – pełny dokument; filename – nazwa pliku bez „.pdf”; onStep(text) – opcjonalny postęp
// zwraca bajty PDF (np. do załącznika e-maila); downloadPdf – to samo + pobranie pliku
export async function buildPdf(html, filename, onStep = () => {}) {
  onStep('Przygotowuję PDF…');
  const fonts = usedFonts(html);
  const [V, fontEmbedCSS] = await Promise.all([import('./lib/pdf-vendor.js'), embedCss(fonts), docFonts()]);
  const P = pageSetup(html);
  const contentW = P.W - P.ml - P.mr, avail0 = P.H - P.mt - P.mb;
  const SCALE = 2;
  // druk jak w podglądzie wydruku: reguły @media print włączone, @media screen wyłączone; czcionki z /fonts/pdf
  const local = fonts.map(([fam, w, file]) => `@font-face{font-family:'${fam}';font-weight:${w};font-style:normal;src:url(${fontUrl(file)}) format('woff2');}`).join('');
  let prepared = html
    .replace(/<link[^>]+fonts\.googleapis\.com[^>]*>/g, '')
    .replace(/@media\s+print/g, '@media all').replace(/@media\s+screen/g, '@media rkdp-nie');
  const extra = `<style>${local}html,body{margin:0!important;padding:0!important;width:${contentW}px!important;min-width:0!important;max-width:none!important;background:#fff!important}</style>`;
  prepared = /<\/head>/i.test(prepared) ? prepared.replace(/<\/head>/i, extra + '</head>') : extra + prepared;
  const f = document.createElement('iframe');
  f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
  Object.assign(f.style, { position: 'fixed', left: '-20000px', top: '0', width: Math.ceil(contentW) + 'px', height: Math.ceil(P.H) + 'px', border: '0' });
  const loaded = new Promise(r => { f.onload = r; });
  f.srcdoc = prepared;
  document.body.append(f);
  try {
    await loaded;
    const d = f.contentDocument, w = f.contentWindow;
    await Promise.all([...d.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; setTimeout(r, 5000); })));
    try { await Promise.race([d.fonts.ready, wait(3000)]); } catch { /* */ }
    f.style.height = Math.ceil(Math.max(P.H, d.documentElement.scrollHeight)) + 'px';
    await wait(120);
    const opt = { pixelRatio: SCALE, fontEmbedCSS, backgroundColor: '#ffffff', cacheBust: false };
    const pages = []; // { canvas, text: [{x,y,w,h,text}] w px strony, bleed }

    // 1) strony „na spad” (element z nazwaną stroną, np. okładka oferty: @page cover{margin:0})
    const bleed = [];
    for (const e of d.body.querySelectorAll('*')) { const p = w.getComputedStyle(e).page; if (p && p !== 'auto' && !bleed.some(x => x.contains(e))) bleed.push(e); }
    for (const e of bleed) {
      onStep('Strona tytułowa…');
      const cv = await toCanvasSafe(V, e, { ...opt, width: e.offsetWidth, height: e.offsetHeight });
      const page = blankPage(P, SCALE);
      const sw = Math.min(cv.width, page.width), sh = Math.min(cv.height, page.height);
      page.getContext('2d').drawImage(cv, 0, 0, sw, sh, 0, 0, sw, sh);
      pages.push({ canvas: page, text: textRuns(e), bleed: true });
    }
    bleed.forEach(e => e.style.setProperty('display', 'none', 'important'));
    // 2) elementy przypięte do strony (position:fixed – np. stopka) – na każdej stronie
    const fixedImgs = [];
    for (const e of [...d.body.querySelectorAll('*')].filter(x => w.getComputedStyle(x).position === 'fixed' && x.offsetHeight)) {
      const rr = e.getBoundingClientRect(), atBottom = rr.bottom > w.innerHeight - 2 || rr.top > w.innerHeight / 2;
      e.style.setProperty('position', 'static', 'important'); e.style.setProperty('width', contentW + 'px', 'important');
      const cv = await toCanvasSafe(V, e, { ...opt, width: contentW, height: e.offsetHeight });
      fixedImgs.push({ cv, h: e.offsetHeight, atBottom });
      e.style.setProperty('display', 'none', 'important');
    }
    await wait(30);

    // 3) treść
    const root = d.body;
    const totalH = Math.max(0, Math.ceil(root.scrollHeight));
    const avail = avail0 - fixedImgs.filter(x => x.atBottom).reduce((s, x) => s + x.h, 0);
    const L = layoutInfo(root, avail * 0.9);
    const allText = textRuns(root);
    const slices = [];
    if (totalH > 4 && root.innerText.trim()) {
      for (let s = 0, guard = 0; s < totalH - 2 && guard < 500; guard++) {
        const heads = slices.length ? L.heads.filter(t => s > t.hTop + t.hH + 1 && s < t.bottom - 2).sort((a, b) => a.top - b.top) : [];
        const hH = heads.reduce((a, t) => a + t.hH, 0);
        let e = nextCut(s, avail - hH, totalH, L.ranges, L.forced);
        if (e <= s + 1) e = Math.min(totalH, s + avail - hH);
        slices.push({ s, e, heads }); s = e;
      }
    }
    onStep('Treść…');
    const whole = totalH * SCALE < 30000 ? await toCanvasSafe(V, root, { ...opt, width: contentW, height: totalH }) : null;
    const piece = async (y, h) => whole ? { cv: whole, sy: y * SCALE } : { cv: await toCanvasSafe(V, root, { ...opt, width: contentW, height: Math.ceil(h), style: { marginTop: `${-y}px` } }), sy: 0 };
    for (const sl of slices) {
      const page = blankPage(P, SCALE), g = page.getContext('2d'); g.scale(SCALE, SCALE);
      let y = P.mt;
      for (const t of sl.heads) { const p = await piece(t.hTop, t.hH); g.drawImage(p.cv, 0, p.sy, contentW * SCALE, t.hH * SCALE, P.ml, y, contentW, t.hH); y += t.hH; }
      const h = sl.e - sl.s, p = await piece(sl.s, h);
      g.drawImage(p.cv, 0, p.sy, contentW * SCALE, Math.min(h * SCALE, p.cv.height - p.sy), P.ml, y, contentW, Math.min(h, (p.cv.height - p.sy) / SCALE));
      for (const fx of fixedImgs) g.drawImage(fx.cv, P.ml, fx.atBottom ? P.H - P.mb - fx.h : P.mt, contentW, fx.h);
      const text = allText.filter(r => r.y + r.h / 2 >= sl.s && r.y + r.h / 2 < sl.e).map(r => ({ ...r, x: r.x + P.ml, y: r.y - sl.s + y }));
      pages.push({ canvas: page, text });
    }
    if (!pages.length) pages.push({ canvas: blankPage(P, SCALE), text: [] });
    // 4) stopka z „@page” (dane firmy) i numery stron
    const total = pages.length;
    pages.forEach((pg, i) => {
      if (pg.bleed || (!P.foot && !P.numbers)) return;
      const g = pg.canvas.getContext('2d'); g.setTransform(SCALE, 0, 0, SCALE, 0, 0);
      const fy = P.H - P.mb + 4 * MM;
      g.fillStyle = '#9A9085'; g.textBaseline = 'top';
      if (P.foot) {
        g.strokeStyle = '#E3D9CA'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(P.ml, fy); g.lineTo(P.W - P.mr, fy); g.stroke();
        g.font = '500 8.4px Montserrat, Arial, sans-serif'; g.textAlign = 'left'; g.fillText(P.foot, P.ml, fy + 3.5 * MM, contentW - 20 * MM);
        pg.text.push({ x: P.ml, y: fy + 3.5 * MM, w: Math.min(g.measureText(P.foot).width, contentW - 20 * MM), h: 10, text: P.foot });
      }
      if (P.numbers) { g.font = '500 9px Montserrat, Arial, sans-serif'; g.textAlign = 'right'; g.fillText(`${i + 1} / ${total}`, P.W - P.mr, fy + 3.5 * MM); }
    });

    // 5) PDF: obraz strony + niewidoczny tekst
    onStep('Zapisuję plik…');
    const pdf = await V.PDFDocument.create();
    pdf.setTitle(String(filename || 'Dokument')); pdf.setCreator('RKDP'); pdf.setProducer('RKDP – aplikacja'); pdf.setLanguage('pl-PL');
    const helv = await pdf.embedFont(V.StandardFonts.Helvetica);
    const diff = []; PL_CODES.forEach((c, i) => diff.push(c, V.PDFName.of(PL_NAMES[i])));
    const fontRef = pdf.context.register(pdf.context.obj({ Type: 'Font', Subtype: 'Type1', BaseFont: 'Helvetica',
      Encoding: pdf.context.obj({ Type: 'Encoding', BaseEncoding: 'WinAnsiEncoding', Differences: diff }) }));
    const pw = P.W * PT, ph = P.H * PT;
    for (const pg of pages) {
      const jpg = await new Promise(r => pg.canvas.toBlob(r, 'image/jpeg', 0.9));
      const img = await pdf.embedJpg(await jpg.arrayBuffer());
      const page = pdf.addPage([pw, ph]);
      page.drawImage(img, { x: 0, y: 0, width: pw, height: ph });
      if (!pg.text.length) continue;
      page.node.setFontDictionary(V.PDFName.of('FTxt'), fontRef);
      const ops = [V.pushGraphicsState(), V.beginText(), V.setTextRenderingMode(V.TextRenderingMode.Invisible)];
      for (const r of pg.text) {
        const { hex, plain } = encodeText(r.text);
        const size = Math.max(2, r.h * 0.78 * PT);
        let nat = 0; try { nat = helv.widthOfTextAtSize(plain, size); } catch { nat = plain.length * size * 0.5; }
        const squeeze = nat > 0 ? Math.max(20, Math.min(400, (r.w * PT / nat) * 100)) : 100;
        ops.push(V.setFontAndSize('FTxt', size), V.setCharacterSqueeze(squeeze),
          V.setTextMatrix(1, 0, 0, 1, r.x * PT, ph - (r.y + r.h * 0.8) * PT), V.showText(V.PDFHexString.of(hex)));
      }
      ops.push(V.endText(), V.popGraphicsState());
      page.pushOperators(...ops);
    }
    return await pdf.save();
  } finally { f.remove(); }
}
// html-to-image czasem nie wczyta pojedynczego obrazka (np. z innej domeny) – wtedy pomijamy go zamiast przerywać
async function toCanvasSafe(V, el, o) {
  try { return await V.toCanvas(el, o); }
  catch { return V.toCanvas(el, { ...o, imagePlaceholder: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', filter: n => !(n.tagName === 'IMG' && !/^(data:|blob:|\/|https?:\/\/(rozliczenia\.)?rkdp)/.test(n.getAttribute('src') || '') && !String(n.src).startsWith(location.origin)) }); }
}

export async function downloadPdf(html, filename, onStep = () => {}) {
  const bytes = await buildPdf(html, filename, onStep);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url; a.download = `${safeName(filename)}.pdf`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return true;
}
