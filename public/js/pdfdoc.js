// Gotowy plik PDF prosto z przeglądarki (bez okna drukowania): dokument HTML (oferta) renderujemy w ukrytej ramce,
// zamieniamy na obrazy stron A4 i składamy w PDF. Strony dzielimy tylko między wierszami tekstu, kartami i wierszami tabel,
// więc nic nie jest przecinane w połowie. Czcionki są wbudowane (pliki z /fonts/pdf – bez zapytań do Google).
const MM = 96 / 25.4;                       // px na mm (CSS)
const PAGE_W = 210 * MM, PAGE_H = 297 * MM;
const SCALE = 2;                            // rozdzielczość (2× = ostry tekst przy rozsądnym rozmiarze pliku)
const FONTS = [
  ['Montserrat', 400, 'Montserrat-Regular'], ['Montserrat', 500, 'Montserrat-Medium'], ['Montserrat', 600, 'Montserrat-SemiBold'], ['Montserrat', 700, 'Montserrat-Bold'],
  ['Plus Jakarta Sans', 600, 'PlusJakartaSans-SemiBold'], ['Plus Jakarta Sans', 700, 'PlusJakartaSans-Bold'], ['Plus Jakarta Sans', 800, 'PlusJakartaSans-ExtraBold'],
];

let fontCssP = null;
const toDataUrl = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
// @font-face z danymi w środku (do obrazów stron) + rejestracja w dokumencie (do stopki rysowanej na stronie)
function fontCss() {
  return fontCssP ||= (async () => {
    const parts = await Promise.all(FONTS.map(async ([fam, w, file]) => {
      const blob = await (await fetch(`/fonts/pdf/${file}.woff2`)).blob();
      const url = await toDataUrl(blob);
      try { const ff = new FontFace(fam, `url(${url})`, { weight: String(w) }); await ff.load(); document.fonts.add(ff); } catch { /* */ }
      return `@font-face{font-family:'${fam}';font-weight:${w};font-style:normal;src:url(${url}) format('woff2');}`;
    }));
    return parts.join('\n');
  })().catch(e => { fontCssP = null; throw e; });
}

const PDF_CSS = `<style id="pdf-mode">
@media screen{html,body{background:#fff!important}.doc{max-width:none!important;width:210mm!important;margin:0!important;box-shadow:none!important}
.flow{width:176mm!important;margin:0 17mm!important;padding:0!important;border-collapse:collapse!important}
.flow>thead{display:none!important}.flow>tbody>tr>td,.flow>thead>tr>td{padding:0!important}}</style>`;

// fragmenty, których nie wolno przeciąć (wiersz tekstu, karta, wiersz tabeli) – przedziały [góra, dół] w px od początku treści
function blockedRanges(root, maxH) {
  const top0 = root.getBoundingClientRect().top, out = [];
  const w = root.ownerDocument.defaultView;
  for (const e of root.querySelectorAll('*')) {
    const cs = w.getComputedStyle(e);
    if (cs.display === 'none' || cs.display.startsWith('inline') || cs.display === 'contents') continue;
    const r = e.getBoundingClientRect();
    if (r.height < 1) continue;
    const boxed = (cs.backgroundColor && !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor)) || parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0;
    const leaf = ![...e.children].some(c => { const d = w.getComputedStyle(c).display; return !d.startsWith('inline') && d !== 'none'; });
    const atom = ['TR', 'LI', 'IMG', 'SVG', 'H1', 'H2', 'H3', 'H4', 'P'].includes(e.tagName.toUpperCase()) || leaf || boxed;
    if (atom && r.height <= maxH) out.push([r.top - top0, r.bottom - top0]);
    // nagłówek sekcji nie zostaje sam na dole strony
    if (/^H[1-4]$/.test(e.tagName) || cs.breakAfter === 'avoid' || cs.pageBreakAfter === 'avoid') out.push([r.top - top0, r.bottom - top0 + 70]);
    // nagłówek grupy w tabeli (np. „Kadry i płace”) trzyma się pierwszego wiersza pod nim
    if (e.tagName === 'TR' && e.classList.contains('grp') && e.nextElementSibling) out.push([r.top - top0, e.nextElementSibling.getBoundingClientRect().bottom - top0]);
  }
  return out;
}
function nextCut(start, avail, total, ranges) {
  const target = start + avail;
  if (target >= total) return total;
  const inside = y => ranges.some(([a, b]) => y > a + 0.5 && y < b - 0.5);
  const cands = new Set([target]);
  ranges.forEach(([a, b]) => { if (a > start && a <= target) cands.add(a); if (b > start && b <= target) cands.add(b); });
  const ok = [...cands].filter(y => y > start + avail * 0.35 && !inside(y)).sort((x, y) => y - x);
  return ok[0] ?? target;
}

const frameReady = f => new Promise(res => { f.onload = res; });
const wait = ms => new Promise(r => setTimeout(r, ms));

// html – pełny dokument (oferta); filename – nazwa pliku bez „.pdf”; onStep(text) – opcjonalny postęp
export async function downloadPdf(html, filename, onStep = () => {}) {
  onStep('Przygotowuję PDF…');
  const [{ toCanvas, PDFDocument }, fontEmbedCSS] = await Promise.all([import('./lib/pdf-vendor.js'), fontCss()]);
  const foot = ((html.match(/@bottom-left\{content:"([^"]*)"/) || [])[1] || '').replace(/&amp;/g, '&');
  const f = document.createElement('iframe');
  f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
  Object.assign(f.style, { position: 'fixed', left: '-12000px', top: '0', width: Math.ceil(PAGE_W) + 'px', height: Math.ceil(PAGE_H) + 'px', border: '0' });
  const loaded = frameReady(f);
  // te same pliki czcionek do układu strony i do obrazów (bez Google Fonts – identyczne łamanie wierszy)
  const localFonts = FONTS.map(([fam, w, file]) => `@font-face{font-family:'${fam}';font-weight:${w};font-style:normal;src:url(${location.origin}/fonts/pdf/${file}.woff2) format('woff2');}`).join('');
  f.srcdoc = html.replace(/<link[^>]+fonts\.googleapis\.com[^>]*>/g, '').replace('</head>', `<style>${localFonts}</style>${PDF_CSS}</head>`);
  document.body.append(f);
  try {
    await loaded;
    const d = f.contentDocument;
    await Promise.all([...d.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; setTimeout(r, 5000); })));
    try { await Promise.race([d.fonts.ready, wait(3000)]); } catch { /* */ }
    await wait(150);
    const opt = { pixelRatio: SCALE, fontEmbedCSS, backgroundColor: '#ffffff', cacheBust: false };
    const pages = [];
    const cover = d.querySelector('.cover');
    if (cover) { onStep('Okładka…'); pages.push(await toCanvas(cover, { ...opt, width: cover.offsetWidth, height: cover.offsetHeight })); }

    const flow = d.querySelector('.flow > tbody > tr > td') || d.body;
    const run = d.querySelector('.flow .run');
    let runCanvas = null, runH = 0;
    if (run) {
      // nagłówek powtarzany na każdej stronie: tymczasowo pokazujemy go, renderujemy i chowamy
      const th = run.closest('thead'); if (th) th.style.setProperty('display', 'table-header-group', 'important');
      runCanvas = await toCanvas(run, { ...opt, width: run.offsetWidth, height: run.offsetHeight });
      runH = run.offsetHeight + 7 * MM;
      if (th) th.style.setProperty('display', 'none', 'important');
      await wait(50);
    }
    onStep('Treść…');
    const totalH = flow.scrollHeight;
    const flowCanvas = await toCanvas(flow, { ...opt, width: flow.offsetWidth, height: totalH });
    const top = 14 * MM, bottom = 20 * MM, left = 17 * MM, contentW = flow.offsetWidth;
    const avail = PAGE_H - top - runH - bottom;
    const ranges = blockedRanges(flow, avail * 0.9);
    const slices = [];
    for (let s = 0; s < totalH - 2;) { const e = nextCut(s, avail, totalH, ranges); slices.push([s, e]); s = e; }
    const total = pages.length + slices.length, firstNo = pages.length;
    slices.forEach(([s, e], i) => {
      const c = document.createElement('canvas');
      c.width = Math.round(PAGE_W * SCALE); c.height = Math.round(PAGE_H * SCALE);
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.scale(SCALE, SCALE);
      if (runCanvas) g.drawImage(runCanvas, left, top, runCanvas.width / SCALE, runCanvas.height / SCALE);
      g.drawImage(flowCanvas, 0, s * SCALE, flowCanvas.width, (e - s) * SCALE, left, top + runH, contentW, e - s);
      // stopka: linia, dane firmy, numer strony
      const fy = PAGE_H - bottom + 4 * MM;
      g.strokeStyle = '#E3D9CA'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(left, fy); g.lineTo(PAGE_W - left, fy); g.stroke();
      g.fillStyle = '#9A9085'; g.textBaseline = 'top';
      g.font = '500 8.4px Montserrat, Arial, sans-serif';
      if (foot) g.fillText(foot, left, fy + 3.5 * MM, 150 * MM);
      g.font = '500 9px Montserrat, Arial, sans-serif'; g.textAlign = 'right';
      g.fillText(`${firstNo + i + 1} / ${total}`, PAGE_W - left, fy + 3.5 * MM);
      pages.push(c);
    });

    onStep('Zapisuję plik…');
    const pdf = await PDFDocument.create();
    pdf.setTitle(filename); pdf.setCreator('RKDP'); pdf.setProducer('RKDP – aplikacja');
    const A4 = [595.28, 841.89];
    for (const c of pages) {
      const jpg = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
      const img = await pdf.embedJpg(await jpg.arrayBuffer());
      const p = pdf.addPage(A4);
      p.drawImage(img, { x: 0, y: 0, width: A4[0], height: A4[1] });
    }
    const bytes = await pdf.save();
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url; a.download = `${filename.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'dokument'}.pdf`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return true;
  } finally { f.remove(); }
}
