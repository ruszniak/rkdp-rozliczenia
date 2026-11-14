// Umowa (szablon .docx) → prawdziwy PDF z tekstem (jak „Zapisz jako PDF” w Wordzie), a nie obraz strony.
// Czcionka Carlito (metrycznie zgodna z Calibri z szablonu) wbudowana jako podzbiór – polskie znaki, zaznaczanie,
// wyszukiwanie i kopiowanie tekstu działają, a plik nadaje się do podpisu (profil zaufany, PAdES, XAdES).
// Układ wg szablonu: A4, marginesy 2,47 cm, logo w nagłówku, stopka z danymi biura i numerem strony,
// akapity wyjustowane, wcięcia, odstępy, pogrubienia/kursywa/podkreślenia, tabulator do prawej (miejsca na podpisy).
const TW = 1 / 20;                 // twip → pt
const PAGE = { W: 595.28, H: 841.89, ML: 70, MR: 70, TOP: 92, BOTTOM: 70 };
const FOOT = 'RKDP spółka doradztwa podatkowego sp. z o.o.  |  ul. Beaty Artemskiej 11/44, 52-234 Wrocław  |  kancelaria@rkdp.pl';
const STYLES = ['Regular', 'Bold', 'Italic', 'BoldItalic'];
const styleOf = (b, i) => STYLES[(b ? 1 : 0) + (i ? 2 : 0)];
const unXml = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

// ---------- document.xml → akapity ----------
export function docxParas(documentXml) {
  const body = (documentXml.match(/<w:body>([\s\S]*)<\/w:body>/) || [, ''])[1];
  return (body.match(/<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g) || []).map(p => {
    const ppr = (p.match(/<w:pPr>([\s\S]*?)<\/w:pPr>/) || [, ''])[1];
    const num = (re, d) => { const m = ppr.match(re); return m ? Number(m[1]) : d; };
    const jc = (ppr.match(/<w:jc w:val="(\w+)"/) || [])[1];
    const runs = [];
    for (const r of p.match(/<w:r[ >][\s\S]*?<\/w:r>/g) || []) {
      const rpr = (r.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/) || [, ''])[1];
      const on = tag => new RegExp(`<w:${tag}/>|<w:${tag} w:val="(true|1|on)"/>`).test(rpr);
      const st = { b: on('b'), i: on('i'), u: /<w:u w:val="(?!none)[a-z]+"/.test(rpr), sz: Number((rpr.match(/<w:sz w:val="(\d+)"/) || [])[1] || 22) / 2 };
      for (const m of r.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>/g)) {
        const t = m[0] === '<w:tab/>' ? '\t' : m[0] === '<w:br/>' ? '\n' : unXml(m[1]);
        if (t) runs.push({ ...st, t });
      }
    }
    return {
      align: jc === 'both' ? 'justify' : jc === 'center' ? 'center' : jc === 'right' ? 'right' : 'left',
      ind: num(/<w:ind [^>]*w:left="(\d+)"/, 0) * TW, hang: num(/<w:ind [^>]*w:hanging="(\d+)"/, 0) * TW, first: num(/<w:ind [^>]*w:firstLine="(\d+)"/, 0) * TW,
      before: num(/<w:spacing [^>]*w:before="(\d+)"/, 0) * TW, after: num(/<w:spacing [^>]*w:after="(\d+)"/, 0) * TW,
      line: num(/<w:spacing [^>]*w:line="(\d+)"/, 240) / 240,
      tabRight: /<w:tab w:val="right"/.test(ppr), runs,
    };
  });
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

// ---------- łamanie wierszy ----------
// słowo = ciąg fragmentów (różne style) bez spacji; między słowami spacja w stylu poprzedzającego fragmentu
function words(M, runs) {
  const out = []; let cur = null;
  const flush = () => { if (cur && cur.parts.length) out.push(cur); cur = null; };
  for (const r of runs) {
    const style = styleOf(r.b, r.i);
    for (const piece of r.t.split(/( +|\t|\n)/)) {
      if (!piece) continue;
      if (piece === '\t' || piece === '\n') { flush(); out.push({ brk: piece }); continue; }
      if (/^ +$/.test(piece)) { flush(); out.push({ space: true, sz: r.sz, style }); continue; }
      cur ||= { parts: [], w: 0 };
      const gl = glyphs(M, style, piece), w = gl.reduce((s, x) => s + x.w, 0) * r.sz / 1000;
      cur.parts.push({ style, sz: r.sz, u: r.u, gl, w }); cur.w += w;
    }
  }
  flush();
  // spacje zwijamy (jedna szerokość spacji między słowami)
  const res = []; let sp = null;
  for (const t of out) {
    if (t.space) { sp ||= t; continue; }
    if (t.brk) { res.push(t); sp = null; continue; }
    t.spaceBefore = sp ? (M[sp.style].w[M[sp.style].map.get(32)] || 226) * sp.sz / 1000 : 0; sp = null; res.push(t);
  }
  return res;
}
function breakLines(toks, width0, width) {
  const lines = []; let line = { items: [], w: 0 }, avail = width0;
  const push = (last, tab = false) => { line.last = last; line.tabAfter = tab; lines.push(line); line = { items: [], w: 0 }; avail = width; };
  for (const t of toks) {
    if (t.brk === '\n') { push(true); continue; }
    if (t.brk === '\t') { line.items.push({ tab: true }); continue; }
    const gap = line.items.length && !line.items[line.items.length - 1].tab ? t.spaceBefore : 0;
    if (line.items.length && line.w + gap + t.w > avail + 0.01) { push(false); line.items.push({ word: t, gap: 0 }); line.w = t.w; continue; }
    line.items.push({ word: t, gap }); line.w += gap + t.w;
  }
  push(true);
  return lines;
}

// ---------- strony ----------
const LH = 1.221;   // wysokość wiersza Calibri/Carlito (ascent + descent) w em
function layoutPara(M, p, contentW) {
  const toks = words(M, p.runs);
  const left0 = p.ind - p.hang + p.first, left = p.ind;
  const lines = toks.length ? breakLines(toks, contentW - left0, contentW - left) : [{ items: [], w: 0, last: true }];
  const maxSz = Math.max(11, ...p.runs.map(r => r.sz));
  lines.forEach((l, i) => {
    const sz = Math.max(...l.items.filter(x => x.word).flatMap(x => x.word.parts.map(pp => pp.sz)), 0) || maxSz;
    l.x0 = i === 0 ? left0 : left; l.avail = contentW - l.x0;
    l.h = sz * LH * Math.max(1, p.line); l.asc = sz * 0.952 + (l.h - sz * LH) * 0.25;
  });
  return lines;
}
const isHeading = p => p.align === 'center' || (p.runs.length && p.runs.every(r => r.b) && p.runs.reduce((s, r) => s + r.t.length, 0) < 90);
const isEmpty = p => !p.runs.some(r => r.t.trim());

export async function contractPdf(documentXml, title = 'Umowa') {
  const [V, M, logoBytes] = await Promise.all([import('./lib/pdf-vendor.js'), metrics(), fetch('/logo-rkdp.png').then(r => r.ok ? r.arrayBuffer() : null).catch(() => null)]);
  const paras = docxParas(documentXml);
  const contentW = PAGE.W - PAGE.ML - PAGE.MR, bottom = PAGE.H - PAGE.BOTTOM;
  const L = paras.map(p => layoutPara(M, p, contentW));
  const pages = [[]];   // elementy: { p, line, y }
  let y = PAGE.TOP;
  const newPage = () => { pages.push([]); y = PAGE.TOP; };
  const hOf = (i, n = Infinity) => L[i].slice(0, n).reduce((s, l) => s + l.h, 0);
  for (let i = 0; i < paras.length; i++) {
    const p = paras[i], lines = L[i];
    if (y > PAGE.TOP + 0.5) y += p.before;
    // nagłówki, puste odstępy i linie podpisów trzymamy razem z początkiem następnego akapitu
    let need = hOf(i), j = i;
    while (j + 1 < paras.length && (isHeading(paras[j]) || isEmpty(paras[j]) || (paras[j].tabRight && paras[j + 1].tabRight))) {
      j++; need += paras[j - 1].after + paras[j].before + (j + 1 < paras.length && (isHeading(paras[j]) || isEmpty(paras[j]) || paras[j].tabRight) ? hOf(j) : hOf(j, L[j].length <= 3 ? 3 : 2));
    }
    if (j > i && y + need > bottom && y > PAGE.TOP + 0.5) { newPage(); }
    for (let k = 0; k < lines.length; k++) {
      const l = lines[k], rest = lines.length - k;
      if (y + l.h > bottom + 0.5 && y > PAGE.TOP + 0.5) newPage();
      // sierotki i wdowy: nie zostawiamy pojedynczego wiersza akapitu na dole ani na górze strony
      else if (k === 0 && lines.length > 1 && y + l.h + lines[1].h > bottom + 0.5 && y > PAGE.TOP + 0.5) newPage();
      else if (rest === 2 && k > 0 && y + l.h + lines[k + 1].h > bottom + 0.5 && y > PAGE.TOP + 0.5 && lines.length > 2) newPage();
      pages[pages.length - 1].push({ p, line: l, y });
      y += l.h;
    }
    y += p.after;
  }
  if (!pages[pages.length - 1].length && pages.length > 1) pages.pop();

  // ---------- PDF ----------
  const pdf = await V.PDFDocument.create();
  pdf.setTitle(String(title)); pdf.setAuthor('RKDP spółka doradztwa podatkowego sp. z o.o.'); pdf.setCreator('rdp.app'); pdf.setProducer('rdp.app'); pdf.setLanguage('pl-PL');
  const ctx = pdf.context, N = n => V.PDFName.of(n);
  const used = Object.fromEntries(STYLES.map(s => [s, new Map()]));   // gid → kod znaku (do ToUnicode)
  const logo = logoBytes ? await pdf.embedPng(logoBytes) : null;
  const hex = (gl, style) => gl.map(x => { used[style].set(x.g, x.c); return x.g.toString(16).padStart(4, '0'); }).join('');
  const fnt = s => 'F' + STYLES.indexOf(s);
  const num = v => (Math.round(v * 100) / 100).toString();
  const ink = '0.11 0.114 0.129 rg 0.11 0.114 0.129 RG';
  const total = pages.length;
  const streams = pages.map((items, pi) => {
    const ops = [];
    for (const { p, line: l, y: top } of items) {
      const base = PAGE.H - (top + l.asc);
      const words = l.items.filter(x => x.word);
      const natural = l.w;
      let x = PAGE.ML + l.x0, extra = 0;
      const tabIdx = l.items.findIndex(x => x.tab);
      if (tabIdx >= 0 && p.tabRight) {   // tekst po tabulatorze do prawej krawędzi
        const afterW = l.items.slice(tabIdx + 1).reduce((s, it) => s + (it.word ? it.gap + it.word.w : 0), 0);
        let cx = x;
        l.items.forEach((it, idx) => {
          if (it.tab) { cx = PAGE.ML + contentW - afterW; return; }
          if (!it.word) return;
          cx += idx === tabIdx + 1 ? 0 : it.gap; drawWord(ops, it.word, cx, base); cx += it.word.w;
        });
        continue;
      }
      if (p.align === 'center') x += (l.avail - natural) / 2;
      else if (p.align === 'right') x += l.avail - natural;
      else if (p.align === 'justify' && !l.last && words.length > 1) extra = (l.avail - natural) / (words.length - 1);
      let cx = x;
      words.forEach((it, idx) => { if (idx) cx += it.gap + extra; drawWord(ops, it.word, cx, base); cx += it.word.w; });
    }
    // stopka
    const fsz = 8, fgl = glyphs(M, 'Regular', FOOT), fw = fgl.reduce((s, g) => s + g.w, 0) * fsz / 1000;
    ops.push('0.4 0.4 0.4 rg', `BT /F0 ${fsz} Tf 1 0 0 1 ${num((PAGE.W - fw) / 2)} 35.4 Tm <${hex(fgl, 'Regular')}> Tj ET`);
    const pn = `${pi + 1} / ${total}`, pgl = glyphs(M, 'Regular', pn), pw = pgl.reduce((s, g) => s + g.w, 0) * fsz / 1000;
    ops.push('0.6 0.6 0.6 rg', `BT /F0 ${fsz} Tf 1 0 0 1 ${num(PAGE.W - PAGE.MR - pw)} 22 Tm <${hex(pgl, 'Regular')}> Tj ET`);
    return ops.join('\n');
    function drawWord(o, w, x0, b) {
      let cx = x0;
      for (const part of w.parts) {
        o.push(ink, `BT /${fnt(part.style)} ${num(part.sz)} Tf 1 0 0 1 ${num(cx)} ${num(b)} Tm <${hex(part.gl, part.style)}> Tj ET`);
        if (part.u) o.push(`${num(cx)} ${num(b - part.sz * 0.11)} ${num(part.w)} ${num(Math.max(0.5, part.sz * 0.05))} re f`);
        cx += part.w;
      }
    }
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
  if (!fontRefs.Regular) fontRefs.Regular = fontRefs.Bold;
  streams.forEach(str => {
    const page = pdf.addPage([PAGE.W, PAGE.H]);
    if (logo) { const w = 165.6, h = w * logo.height / logo.width; page.drawImage(logo, { x: (PAGE.W - w) / 2, y: PAGE.H - 35.4 - h, width: w, height: h }); }
    for (const s of STYLES) if (fontRefs[s]) page.node.setFontDictionary(N(fnt(s)), fontRefs[s]);
    page.node.addContentStream(ctx.register(ctx.flateStream(str)));
  });
  return await pdf.save();
}

export async function downloadContractPdf(documentXml, filename) {
  const bytes = await contractPdf(documentXml, filename.replace(/\.pdf$/i, '').replace(/_/g, ' '));
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a'); a.href = url; a.download = filename.endsWith('.pdf') ? filename : filename + '.pdf';
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
