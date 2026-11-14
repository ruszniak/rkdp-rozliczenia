// Dokument Word (document.xml z szablonu umowy albo ze zlecenia / umowy doradczej) → prawdziwy PDF z tekstem
// (jak „Zapisz jako PDF” w Wordzie), a nie obraz strony. Czcionka Carlito (metrycznie zgodna z Calibri) wbudowana
// jako podzbiór – polskie znaki, zaznaczanie, wyszukiwanie i kopiowanie działają, a plik nadaje się do podpisu
// (profil zaufany, PAdES, XAdES).
// Obsługa: akapity (wyrównanie, wcięcia, odstępy, interlinia, „trzymaj z następnym”, podział strony), pogrubienia,
// kursywa, podkreślenia, kolory, kapitaliki, tabulatory (wcięcia numeracji i do prawej), tabele (kolumny, obramowania,
// wypełnienie, powtarzany wiersz nagłówka), nagłówek z logo i stopka z numerem strony.
const TW = 1 / 20;                 // twip → pt
const PW = 595.28, PH = 841.89;    // A4
const STYLES = ['Regular', 'Bold', 'Italic', 'BoldItalic'];
const styleOf = (b, i) => STYLES[(b ? 1 : 0) + (i ? 2 : 0)];
const unXml = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const hexRgb = h => { const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => (v / 255).toFixed(3)).join(' '); };
const INK = '1C1D21';

// ---------- document.xml → akapity i tabele ----------
function parsePara(p, D) {
  const ppr = (p.match(/<w:pPr>([\s\S]*?)<\/w:pPr>/) || [, ''])[1];
  const num = (re, d) => { const m = ppr.match(re); return m ? Number(m[1]) : d; };
  const jc = (ppr.match(/<w:jc w:val="(\w+)"/) || [])[1];
  const runs = [];
  for (const r of p.match(/<w:r[ >][\s\S]*?<\/w:r>/g) || []) {
    const rpr = (r.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/) || [, ''])[1];
    const on = tag => new RegExp(`<w:${tag}/>|<w:${tag} w:val="(true|1|on)"/>`).test(rpr);
    const st = { b: on('b'), i: on('i'), u: /<w:u w:val="(?!none)[a-z]+"/.test(rpr), caps: on('caps'),
      sz: Number((rpr.match(/<w:sz w:val="(\d+)"/) || [])[1] || D.sz * 2) / 2, color: (rpr.match(/<w:color w:val="([0-9A-Fa-f]{6})"/) || [])[1] || null };
    for (const m of r.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>/g)) {
      let t = m[0] === '<w:tab/>' ? '\t' : m[0] === '<w:br/>' ? '\n' : unXml(m[1]);
      if (st.caps) t = t.toLocaleUpperCase('pl-PL');
      if (t) runs.push({ ...st, t });
    }
  }
  const tabs = [...ppr.matchAll(/<w:tab w:val="(left|right|center)" w:pos="(\d+)"\/>/g)].map(m => ({ kind: m[1], pos: +m[2] * TW }));
  return {
    t: 'p', align: jc === 'both' ? 'justify' : jc === 'center' ? 'center' : jc === 'right' ? 'right' : 'left',
    ind: num(/<w:ind [^>]*w:left="(\d+)"/, 0) * TW, hang: num(/<w:ind [^>]*w:hanging="(\d+)"/, 0) * TW, first: num(/<w:ind [^>]*w:firstLine="(\d+)"/, 0) * TW,
    before: num(/<w:spacing [^>]*w:before="(\d+)"/, 0) * TW, after: num(/<w:spacing [^>]*w:after="(\d+)"/, D.after) * TW,
    line: num(/<w:spacing [^>]*w:line="(\d+)"/, D.line) / 240,
    keep: /<w:keepNext\/>/.test(ppr), pbb: /<w:pageBreakBefore\/>/.test(ppr),
    tabs, tabRight: tabs.some(x => x.kind === 'right'), runs, sz: D.sz,
  };
}
function parseTable(x, D) {
  const tpr = (x.match(/<w:tblPr>([\s\S]*?)<\/w:tblPr>/) || [, ''])[1];
  const cols = [...x.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map(m => +m[1] * TW);
  const borders = /<w:tblBorders>[\s\S]*?w:val="single"/.test(tpr);
  const bColor = (tpr.match(/<w:top w:val="single"[^>]*w:color="([0-9A-Fa-f]{6})"/) || [])[1] || 'CFC9BF';
  const marL = Number((tpr.match(/<w:tblCellMar>[\s\S]*?<w:left w:w="(\d+)"/) || [])[1] ?? 108) * TW;
  const marR = Number((tpr.match(/<w:tblCellMar>[\s\S]*?<w:right w:w="(\d+)"/) || [])[1] ?? 108) * TW;
  const rows = (x.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || []).map(tr => ({
    header: /<w:tblHeader\/>/.test(tr),
    cells: (tr.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || []).map((tc, i) => {
      const tcp = (tc.match(/<w:tcPr>([\s\S]*?)<\/w:tcPr>/) || [, ''])[1];
      return { w: Number((tcp.match(/<w:tcW w:w="(\d+)"/) || [])[1] || 0) * TW || cols[i] || 0,
        fill: (tcp.match(/<w:shd [^>]*w:fill="([0-9A-Fa-f]{6})"/) || [])[1] || null,
        mt: Number((tcp.match(/<w:tcMar>[\s\S]*?<w:top w:w="(\d+)"/) || [])[1] || 0) * TW,
        mb: Number((tcp.match(/<w:tcMar>[\s\S]*?<w:bottom w:w="(\d+)"/) || [])[1] || 0) * TW,
        paras: (tc.match(/<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g) || []).map(p => parsePara(p, D)) };
    }),
  }));
  return { t: 'tbl', cols, borders, bColor, marL, marR, rows };
}
export function docxItems(documentXml, D = { sz: 11, line: 240, after: 0 }) {
  const body = (documentXml.match(/<w:body>([\s\S]*)<\/w:body>/) || [, ''])[1];
  return (body.match(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g) || []).map(x => x.startsWith('<w:tbl>') ? parseTable(x, D) : parsePara(x, D));
}
function pageMargins(documentXml) {
  const m = (documentXml.match(/<w:pgMar ([^>]*)\/>/) || [, ''])[1];
  const g = k => Number((m.match(new RegExp(`w:${k}="(\\d+)"`)) || [])[1] || 1417) * TW;
  return { top: g('top'), right: g('right'), bottom: g('bottom'), left: g('left') };
}

// ---------- czcionki ----------
let metricsP = null;
const metrics = () => metricsP ||= fetch('/fonts/pdf/carlito.json').then(r => { if (!r.ok) throw new Error('Brak czcionki do PDF'); return r.json(); })
  .then(M => { for (const k of STYLES) { const cm = new Map(); for (const [c, g] of Object.entries(M[k].cmap)) cm.set(+c, g); M[k].map = cm; } return M; })
  .catch(e => { metricsP = null; throw e; });
const SUBST = { 0xA0: 0x20, 0x202F: 0x20, 0x2011: 0x2D, 0x2212: 0x2D, 0x2010: 0x2D };
function glyphs(M, style, text) {
  const f = M[style], out = [];
  for (const ch of text.normalize('NFC')) {
    let c = ch.codePointAt(0); c = SUBST[c] ?? c;
    let g = f.map.get(c); if (g === undefined) { g = f.map.get(0x3F); c = 0x3F; }
    out.push({ g, c, w: f.w[g] || 0 });
  }
  return out;
}
const textW = (M, style, sz, s) => glyphs(M, style, s).reduce((a, g) => a + g.w, 0) * sz / 1000;

// ---------- łamanie wierszy ----------
// słowo = ciąg fragmentów (różne style) bez spacji; między słowami spacja w stylu poprzedniego fragmentu
function tokens(M, runs) {
  const out = []; let cur = null, sp = null;
  const flush = () => { if (cur) out.push(cur); cur = null; };
  for (const r of runs) {
    const style = styleOf(r.b, r.i);
    for (const piece of r.t.split(/( +|\t|\n)/)) {
      if (!piece) continue;
      if (piece === '\t' || piece === '\n') { flush(); out.push({ brk: piece, sz: r.sz }); sp = null; continue; }
      if (/^ +$/.test(piece)) { flush(); sp = { style, sz: r.sz }; continue; }
      if (!cur) { cur = { parts: [], w: 0, spaceBefore: sp ? textW(M, sp.style, sp.sz, ' ') : 0 }; sp = null; }
      const gl = glyphs(M, style, piece), w = gl.reduce((s, x) => s + x.w, 0) * r.sz / 1000;
      cur.parts.push({ style, sz: r.sz, u: r.u, color: r.color, gl, w }); cur.w += w;
    }
  }
  flush();
  return out;
}
// pozycje x liczone od lewego marginesu kolumny; tabulatory: własne pozycje, wcięcie wiszące, domyślnie co 35,4 pt
function breakLines(M, p, width) {
  const toks = tokens(M, p.runs);
  const lines = [];
  const startX = first => Math.max(0, first ? p.ind - p.hang + p.first : p.ind);
  let line = null;
  const open = first => { line = { items: [], x0: startX(first), x: startX(first), justFrom: 0, sz: 0 }; };
  const close = last => { line.last = last; lines.push(line); };
  open(true);
  for (const t of toks) {
    if (t.brk === '\n') { line.sz ||= t.sz; close(true); open(false); continue; }
    if (t.brk === '\t') {
      const own = p.tabs.filter(s => s.kind === 'left' && s.pos > line.x + 0.5).map(s => s.pos);
      const hangStop = p.hang && p.ind > line.x + 0.5 ? [p.ind] : [];
      const def = Math.floor(line.x / 35.4 + 1) * 35.4;
      const right = p.tabs.find(s => s.kind === 'right');
      if (right && !own.length) { line.items.push({ tab: 'right', pos: Math.min(right.pos, width) }); line.justFrom = line.items.length; continue; }
      line.x = Math.min(...own, ...hangStop, def);
      line.items.push({ tab: 'left' }); line.justFrom = line.items.length;
      continue;
    }
    const prev = line.items[line.items.length - 1];
    const gap = prev && prev.word ? t.spaceBefore : 0;
    if (line.items.some(i => i.word) && line.x + gap + t.w > width + 0.01 && !line.items.some(i => i.tab === 'right')) {
      close(false); open(false);
      line.items.push({ word: t, x: line.x }); line.x += t.w; continue;
    }
    line.items.push({ word: t, x: line.x + gap }); line.x += gap + t.w;
  }
  close(true);
  const LH = 1.221;    // Calibri/Carlito: ascent + descent w em
  for (const l of lines) {
    const sz = Math.max(0, ...l.items.filter(x => x.word).flatMap(x => x.word.parts.map(pp => pp.sz))) || l.sz || p.sz;
    l.h = sz * LH * Math.max(1, p.line); l.asc = sz * 0.952 + (l.h - sz * LH) * 0.25;
    // wyrównanie
    const words = l.items.filter(x => x.word);
    if (!words.length) continue;
    const rt = l.items.find(x => x.tab === 'right');
    if (rt) {   // tekst po tabulatorze do prawej krawędzi
      const idx = l.items.indexOf(rt), after = l.items.slice(idx + 1).filter(x => x.word);
      if (after.length) { const last = after[after.length - 1], d = rt.pos - (last.x + last.word.w); after.forEach(x => { x.x += d; }); }
      continue;
    }
    const end = words[words.length - 1].x + words[words.length - 1].word.w;
    const seg = l.items.slice(l.justFrom).filter(x => x.word);
    if (p.align === 'center') { const start = words[0].x, d = l.x0 + (width - l.x0 - (end - start)) / 2 - start; words.forEach(x => { x.x += d; }); }
    else if (p.align === 'right') words.forEach(x => { x.x += width - end; });
    else if (p.align === 'justify' && !l.last && seg.length > 1) { const extra = (width - end) / (seg.length - 1); seg.forEach((x, i) => { x.x += extra * i; }); }
  }
  return lines;
}

// ---------- układ stron ----------
const isEmpty = p => p.t === 'p' && !p.runs.some(r => r.t.trim());
const paraH = (p, lines) => lines.reduce((s, l) => s + l.h, 0);

function layoutDoc(M, items, G) {
  const W = PW - G.left - G.right, bottom = PH - G.bottom;
  const explicitKeep = items.some(x => x.t === 'p' && x.keep);
  const keepOf = p => p.t === 'p' && (p.keep || (!explicitKeep && (p.align === 'center' || isEmpty(p) || p.tabRight || (p.runs.length && p.runs.every(r => r.b) && p.runs.reduce((s, r) => s + r.t.length, 0) < 90))));
  // przygotowanie: wiersze akapitów, wysokości wierszy tabel
  const prep = items.map(it => {
    if (it.t === 'p') return { ...it, lines: breakLines(M, it, W) };
    const rows = it.rows.map(r => {
      let x = 0;
      const cells = r.cells.map(c => {
        const cw = c.w - it.marL - it.marR;
        const ps = c.paras.map(p => ({ ...p, lines: breakLines(M, p, cw) }));
        const h = c.mt + c.mb + ps.reduce((s, p, i) => s + (i ? p.before : 0) + paraH(p, p.lines) + (i < ps.length - 1 ? p.after : 0), 0);
        const cell = { ...c, x, cw, ps, h }; x += c.w; return cell;
      });
      return { header: r.header, cells, h: Math.max(...cells.map(c => c.h), 4) };
    });
    return { ...it, prows: rows, h: rows.reduce((s, r) => s + r.h, 0) };
  });
  const pages = [[]];
  let y = G.top;
  const at = () => pages[pages.length - 1];
  const newPage = () => { pages.push([]); y = G.top; };
  const fresh = () => y <= G.top + 0.5;
  const firstH = it => it.t === 'tbl' ? (it.prows[0]?.h || 0) + (it.prows[0]?.header ? it.prows[1]?.h || 0 : 0) : paraH(it, it.lines.slice(0, it.lines.length <= 3 ? 3 : 2));
  const fullH = it => it.t === 'tbl' ? it.h : paraH(it, it.lines);
  for (let i = 0; i < prep.length; i++) {
    const it = prep[i];
    if (it.t === 'p' && it.pbb && !fresh()) newPage();
    if (it.t === 'p' && !fresh()) y += it.before;
    // „trzymaj z następnym”: łańcuch akapitów + początek pierwszego elementu, który nie jest trzymany
    if (keepOf(it)) {
      let need = fullH(it), j = i;
      while (j + 1 < prep.length && keepOf(prep[j])) { j++; need += (prep[j - 1].after || 0) + (prep[j].before || 0) + (keepOf(prep[j]) ? fullH(prep[j]) : firstH(prep[j])); }
      if (j > i && y + need > bottom && !fresh() && need < bottom - G.top) newPage();
    }
    if (it.t === 'tbl') {
      const head = it.prows.filter(r => r.header);
      it.prows.forEach((r, ri) => {
        if (y + r.h > bottom + 0.5 && !fresh()) {
          newPage();
          if (!r.header) for (const hr of head) { at().push({ row: hr, tbl: it, y }); y += hr.h; }
        }
        at().push({ row: r, tbl: it, y }); y += r.h;
      });
      continue;
    }
    const L = it.lines;
    for (let k = 0; k < L.length; k++) {
      const l = L[k], rest = L.length - k;
      if (y + l.h > bottom + 0.5 && !fresh()) newPage();
      else if (k === 0 && L.length > 1 && y + l.h + L[1].h > bottom + 0.5 && !fresh()) newPage();            // sierotka
      else if (rest === 2 && k > 0 && L.length > 2 && y + l.h + L[k + 1].h > bottom + 0.5 && !fresh()) newPage();   // wdowa
      at().push({ p: it, line: l, x0: G.left, y }); y += l.h;
    }
    y += it.after;
  }
  if (!at().length && pages.length > 1) pages.pop();
  return pages;
}

// ---------- PDF ----------
async function render({ items, G, title, header, footer, author }) {
  const [V, M] = await Promise.all([import('./lib/pdf-vendor.js'), metrics()]);
  const pages = layoutDoc(M, items, G);
  const pdf = await V.PDFDocument.create();
  pdf.setTitle(String(title)); pdf.setAuthor(author || ''); pdf.setCreator('rdp.app'); pdf.setProducer('rdp.app'); pdf.setLanguage('pl-PL');
  const ctx = pdf.context, N = n => V.PDFName.of(n);
  const used = Object.fromEntries(STYLES.map(s => [s, new Map()]));   // gid → kod znaku (ToUnicode)
  const hex = (gl, style) => gl.map(x => { used[style].set(x.g, x.c); return x.g.toString(16).padStart(4, '0'); }).join('');
  const fnt = s => 'F' + STYLES.indexOf(s);
  const n2 = v => (Math.round(v * 100) / 100).toString();
  const Y = top => PH - top;
  // tekst pomocniczy (nagłówek / stopka): x, linia bazowa od góry strony
  const T = { glyphs: (style, s) => glyphs(M, style, s), width: (style, sz, s) => textW(M, style, sz, s),
    text: (ops, s, x, base, { style = 'Regular', sz = 8, color = INK } = {}) => ops.push(`${hexRgb(color)} rg BT /${fnt(style)} ${n2(sz)} Tf 1 0 0 1 ${n2(x)} ${n2(Y(base))} Tm <${hex(glyphs(M, style, s), style)}> Tj ET`),
    line: (ops, x1, y1, x2, w = 0.5, color = 'D6D2CA') => ops.push(`${hexRgb(color)} RG ${n2(w)} w ${n2(x1)} ${n2(Y(y1))} m ${n2(x2)} ${n2(Y(y1))} l S`) };
  const drawLine = (ops, l, xBase, top) => {
    const base = top + l.asc;
    for (const it of l.items) {
      if (!it.word) continue;
      let cx = xBase + it.x;
      for (const part of it.word.parts) {
        ops.push(`${hexRgb(part.color || INK)} rg BT /${fnt(part.style)} ${n2(part.sz)} Tf 1 0 0 1 ${n2(cx)} ${n2(Y(base))} Tm <${hex(part.gl, part.style)}> Tj ET`);
        if (part.u) ops.push(`${n2(cx)} ${n2(Y(base) - part.sz * 0.11)} ${n2(part.w)} ${n2(Math.max(0.5, part.sz * 0.05))} re f`);
        cx += part.w;
      }
    }
  };
  const total = pages.length;
  const streams = pages.map((els, pi) => {
    const ops = [];
    for (const el of els) {
      if (el.line) { drawLine(ops, el.line, el.x0, el.y); continue; }
      const { row, tbl, y } = el;
      for (const c of row.cells) {
        const x = G.left + c.x;
        if (c.fill) ops.push(`${hexRgb(c.fill)} rg ${n2(x)} ${n2(Y(y + row.h))} ${n2(c.w)} ${n2(row.h)} re f`);
        if (tbl.borders) ops.push(`${hexRgb(tbl.bColor)} RG 0.5 w ${n2(x)} ${n2(Y(y + row.h))} ${n2(c.w)} ${n2(row.h)} re S`);
        let cy = y + c.mt;
        c.ps.forEach((p, i) => { if (i) cy += p.before; for (const l of p.lines) { drawLine(ops, l, x + tbl.marL, cy); cy += l.h; } cy += p.after; });
      }
    }
    header?.(ops, T, pi, total);
    footer?.(ops, T, pi, total);
    return ops.join('\n');
  });
  // czcionki: Type0 / CIDFontType2 (Identity-H), podzbiór TTF + ToUnicode
  const fontRefs = {};
  for (const s of STYLES) {
    if (!used[s].size) continue;
    const f = M[s];
    const ttf = new Uint8Array(await (await fetch(`/fonts/pdf/Carlito-${s}.ttf`)).arrayBuffer());
    const file = ctx.register(ctx.flateStream(ttf, { Length1: ttf.length }));
    const name = `RKDP${'ABCD'[STYLES.indexOf(s)]}A+${f.name}`;
    const desc = ctx.register(ctx.obj({ Type: 'FontDescriptor', FontName: name, Flags: 32 + (s.includes('Italic') ? 64 : 0), FontBBox: f.bbox,
      ItalicAngle: f.italic, Ascent: f.asc, Descent: f.desc, CapHeight: f.cap, StemV: s.includes('Bold') ? 120 : 80, FontFile2: file }));
    const cid = ctx.register(ctx.obj({ Type: 'Font', Subtype: 'CIDFontType2', BaseFont: name,
      CIDSystemInfo: ctx.obj({ Registry: V.PDFHexString.of('41646F6265'), Ordering: V.PDFHexString.of('4964656E74697479'), Supplement: 0 }),
      FontDescriptor: desc, DW: 500, W: [0, f.w], CIDToGIDMap: 'Identity' }));
    const ent = [...used[s]].sort((a, b) => a[0] - b[0]);
    let cmap = '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n';
    for (let i = 0; i < ent.length; i += 100) {
      const chunk = ent.slice(i, i + 100);
      cmap += `${chunk.length} beginbfchar\n${chunk.map(([g, c]) => `<${g.toString(16).padStart(4, '0')}> <${c.toString(16).padStart(4, '0')}>`).join('\n')}\nendbfchar\n`;
    }
    cmap += 'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend';
    const tu = ctx.register(ctx.flateStream(cmap));
    fontRefs[s] = ctx.register(ctx.obj({ Type: 'Font', Subtype: 'Type0', BaseFont: name, Encoding: 'Identity-H', DescendantFonts: [cid], ToUnicode: tu }));
  }
  return { pdf, V, streams, fontRefs, N, fnt, ctx };
}
async function finish({ pdf, streams, fontRefs, N, fnt, ctx }, logo) {
  const img = logo?.bytes ? await pdf.embedPng(logo.bytes) : null;
  streams.forEach(str => {
    const page = pdf.addPage([PW, PH]);
    if (img) page.drawImage(img, { x: logo.x, y: PH - logo.top - logo.w * img.height / img.width, width: logo.w, height: logo.w * img.height / img.width });
    for (const s of STYLES) if (fontRefs[s]) page.node.setFontDictionary(N(fnt(s)), fontRefs[s]);
    page.node.addContentStream(ctx.register(ctx.flateStream(str)));
  });
  return await pdf.save();
}
const fetchBytes = url => fetch(url).then(r => r.ok ? r.arrayBuffer() : null).catch(() => null);

// ---------- umowa księgowa RKDP (szablon .docx) ----------
const RKDP_FOOT = 'RKDP spółka doradztwa podatkowego sp. z o.o.  |  ul. Beaty Artemskiej 11/44, 52-234 Wrocław  |  kancelaria@rkdp.pl';
export async function contractPdf(documentXml, title = 'Umowa') {
  const items = docxItems(documentXml, { sz: 11, line: 240, after: 0 });
  const mg = pageMargins(documentXml);
  const G = { top: Math.max(mg.top, 92), left: mg.left, right: mg.right, bottom: mg.bottom };
  const [r, logo] = await Promise.all([render({ items, G, title, author: 'RKDP spółka doradztwa podatkowego sp. z o.o.',
    footer: (ops, T, pi, total) => {
      const w = T.width('Regular', 8, RKDP_FOOT);
      T.text(ops, RKDP_FOOT, (PW - w) / 2, PH - 35.4, { sz: 8, color: '666666' });
      const pn = `${pi + 1} / ${total}`; T.text(ops, pn, PW - G.right - T.width('Regular', 8, pn), PH - 22, { sz: 8, color: '999999' });
    } }), fetchBytes('/logo-rkdp.png')]);
  return finish(r, logo && { bytes: logo, w: 165.6, x: (PW - 165.6) / 2, top: 35.4 });
}

// ---------- zlecenie / umowa doradcza / pismo (bloki z m2/order.js → document.xml) ----------
export async function orderPdf(documentXml, brand, title = 'Dokument') {
  const items = docxItems(documentXml, { sz: 10.5, line: 264, after: 0 });
  const mg = pageMargins(documentXml);
  const LOGO_W = 120.5, logoH = LOGO_W * (brand.ratio || 0.33);
  const hdrTop = 25, hdrBottom = hdrTop + Math.max(logoH, (brand.lines || []).length * 9) + 4.5;
  const G = { top: brand.plain ? mg.top : Math.max(mg.top, hdrBottom + 12), left: mg.left, right: mg.right, bottom: mg.bottom };
  const W = PW - G.left - G.right;
  const foot1 = String(brand.foot1 || '').replace(/ · /g, '  |  ');
  const [r, logo] = await Promise.all([render({ items, G, title, author: brand.firmName || '',
    header: brand.plain ? null : (ops, T) => {
      const ls = brand.lines || [];
      ls.forEach((l, i) => { const w = T.width('Regular', 7, l); T.text(ops, l, PW - G.right - w, hdrBottom - 4.5 - (ls.length - 1 - i) * 9 - 1.5, { sz: 7, color: '5D6068' }); });
      T.line(ops, G.left, hdrBottom, G.left + W, 1.5, 'B08D57');
    },
    footer: (ops, T, pi, total) => {
      const yb2 = PH - 21 - 2, yb1 = yb2 - 9;
      T.line(ops, G.left, yb1 - 11, G.left + W, 0.5, 'D6D2CA');
      T.text(ops, foot1, G.left, yb1, { sz: 7, color: '8A8C92' });
      const pn = `Strona ${pi + 1} z ${total}`; T.text(ops, pn, G.left + W - T.width('Regular', 7, pn), yb1, { sz: 7, color: '8A8C92' });
      if (brand.foot2) T.text(ops, brand.foot2, G.left, yb2, { sz: 7, color: '8A8C92' });
    } }), brand.plain || !brand.logo ? null : fetchBytes(brand.logo)]);
  return finish(r, logo && { bytes: logo, w: LOGO_W, x: G.left, top: hdrBottom - 4.5 - logoH });
}

export function downloadBytesPdf(bytes, filename) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a'); a.href = url; a.download = filename.endsWith('.pdf') ? filename : filename + '.pdf';
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export async function downloadContractPdf(documentXml, filename) {
  downloadBytesPdf(await contractPdf(documentXml, filename.replace(/\.pdf$/i, '').replace(/_/g, ' ')), filename);
}
