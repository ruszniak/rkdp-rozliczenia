// Zlecenie M2 TAX: treść (wspólna dla podglądu, PDF i Word) + generatory
import { FIRM, fmtDate } from './dict.js';
import { zip } from '../xlsx.js';

const amount = (v) => v === null || v === undefined || v === '' ? null
  : Number(v).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';

// Zwraca listę bloków: { t: 'title'|'meta'|'h'|'p'|'li'|'parties'|'sign', ... }
export function orderBlocks(o, client, signer) {
  const c = client || {};
  const blocks = [];
  blocks.push({ t: 'title', text: 'ZLECENIE' });
  blocks.push({ t: 'meta', text: `nr ${o.number || '(nadany po zapisaniu)'} z dnia ${fmtDate(o.order_date)}` });
  blocks.push({ t: 'parties', left: {
    label: 'Zleceniodawca', lines: [c.name || '…', c.address, c.nip ? `NIP ${c.nip}` : null, c.krs ? `KRS ${c.krs}` : null].filter(Boolean),
  }, right: {
    label: 'Zleceniobiorca', lines: [FIRM.name, FIRM.address, `NIP ${FIRM.nip}`, `KRS ${FIRM.krs}`],
  } });

  let n = 0;
  const sec = (title) => blocks.push({ t: 'h', text: `§ ${++n}. ${title}` });
  const p = (text) => text && blocks.push({ t: 'p', text });
  const li = (text) => text && blocks.push({ t: 'li', text });

  sec('Przedmiot zlecenia');
  p(`Zleceniodawca zleca, a Zleceniobiorca przyjmuje do wykonania: ${(o.subject || '…').trim().replace(/[.\s]+$/, '')}.`);
  const points = (o.scope || '').split('\n').map(s => s.replace(/^\s*[-•*\d.)]+\s*/, '').trim()).filter(Boolean);
  if (points.length) { p('Zakres zlecenia obejmuje w szczególności:'); points.forEach(li); }

  sec('Sposób wykonania');
  p('Zleceniobiorca wykona zlecenie z należytą starannością, wynikającą z zawodowego charakteru prowadzonej działalności, przez doradców podatkowych wpisanych na listę doradców podatkowych, przy czym sprawę prowadzi dwóch doradców podatkowych.');
  p('Zleceniodawca zobowiązuje się przekazywać Zleceniobiorcy niezwłocznie, kompletnie i zgodnie z prawdą wszelkie dokumenty oraz informacje niezbędne do wykonania zlecenia, a także informować o pismach otrzymanych od organów w sprawie objętej zleceniem.');
  p('Jeżeli wykonanie zlecenia wymaga reprezentacji przed organem podatkowym lub sądem administracyjnym, Zleceniodawca udzieli doradcom podatkowym Zleceniobiorcy stosownego pełnomocnictwa.');

  sec('Termin wykonania');
  p(o.term_text ? o.term_text : 'Zlecenie zostanie wykonane w terminie uzgodnionym przez strony, z uwzględnieniem terminów wynikających z przepisów prawa i wezwań organów.');

  sec('Wynagrodzenie');
  const a = amount(o.fee_amount);
  const feeText = {
    godzinowa: `Z tytułu wykonania zlecenia Zleceniobiorcy przysługuje wynagrodzenie w wysokości ${a || '…'} netto za każdą rozpoczętą godzinę pracy, powiększone o należny podatek VAT. Zleceniobiorca przedstawi zestawienie przepracowanych godzin.`,
    ryczalt: `Z tytułu wykonania zlecenia Zleceniobiorcy przysługuje wynagrodzenie ryczałtowe w wysokości ${a || '…'} netto, powiększone o należny podatek VAT.`,
    abonament: `Z tytułu wykonania zlecenia Zleceniobiorcy przysługuje wynagrodzenie abonamentowe w wysokości ${a || '…'} netto miesięcznie, powiększone o należny podatek VAT.`,
    success_fee: `Wynagrodzenie Zleceniobiorcy uzależnione jest od rezultatu sprawy na zasadach określonych poniżej.${a ? ` Wynagrodzenie podstawowe wynosi ${a} netto, powiększone o należny podatek VAT.` : ''}`,
    mieszana: `Wynagrodzenie Zleceniobiorcy ustalane jest na zasadach określonych poniżej.${a ? ` Kwota bazowa wynosi ${a} netto, powiększona o należny podatek VAT.` : ''}`,
  }[o.fee_type] || `Wynagrodzenie Zleceniobiorcy zostanie ustalone przez strony${a ? ` i wynosi ${a} netto, powiększone o należny podatek VAT` : ''}.`;
  p(feeText);
  p(o.fee_notes);
  p(`Wynagrodzenie płatne jest na podstawie faktury w terminie ${o.payment_days || 14} dni od dnia jej doręczenia, na rachunek bankowy wskazany na fakturze.`);
  p('Wynagrodzenie nie obejmuje opłat skarbowych, sądowych i innych kosztów urzędowych, które ponosi Zleceniodawca.');

  sec('Tajemnica zawodowa i dane osobowe');
  p('Zleceniobiorca oraz doradcy podatkowi wykonujący zlecenie są obowiązani do zachowania w tajemnicy faktów i informacji, z którymi zapoznali się w związku z wykonywaniem czynności doradztwa podatkowego (art. 37 ustawy o doradztwie podatkowym).');
  p('Zleceniobiorca przetwarza dane osobowe Zleceniodawcy w zakresie niezbędnym do wykonania zlecenia oraz obowiązków wynikających z przepisów prawa, w tym ustawy o przeciwdziałaniu praniu pieniędzy oraz finansowaniu terroryzmu, w ramach której stosuje środki bezpieczeństwa finansowego.');

  sec('Postanowienia końcowe');
  if (o.extra_terms) o.extra_terms.split('\n').map(s => s.trim()).filter(Boolean).forEach(p);
  p('Zleceniobiorca posiada obowiązkowe ubezpieczenie odpowiedzialności cywilnej doradców podatkowych.');
  p('Zmiany zlecenia wymagają formy dokumentowej. W sprawach nieuregulowanych stosuje się przepisy Kodeksu cywilnego dotyczące umowy zlecenia, stosowane odpowiednio do umów o świadczenie usług (art. 750 k.c.).');
  p('Zlecenie sporządzono w dwóch jednobrzmiących egzemplarzach, po jednym dla każdej ze stron, lub w postaci elektronicznej opatrzonej podpisami elektronicznymi stron.');

  blocks.push({ t: 'sign', left: { label: 'Zleceniodawca', lines: [c.contact_person || c.name || ''] },
    right: { label: 'Zleceniobiorca', lines: signer ? [signer.full_name, `${(signer.title || 'Doradca podatkowy').toLowerCase()}, nr wpisu ${signer.license_no || '…'}`, signer.role_label].filter(Boolean) : ['…'] } });
  return blocks;
}

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

export const ORDER_CSS = `
.order{font-family:'Source Sans 3','Segoe UI',Arial,sans-serif;color:#1c1d21;font-size:11pt;line-height:1.5;max-width:180mm;margin:0 auto}
.order .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #7A5A37;padding-bottom:10px;margin-bottom:18px}
.order .head img{height:52px}
.order .head .firm{text-align:right;font-size:8.5pt;color:#5d6068;line-height:1.45}
.order h1{font-family:Montserrat,Arial,sans-serif;font-size:20pt;letter-spacing:.12em;text-align:center;margin:6px 0 0;color:#16171a}
.order .meta{text-align:center;color:#5d6068;margin:2px 0 18px}
.order .parties{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:12px}
.order .parties .lbl,.order .sign .lbl{font-family:Montserrat,Arial,sans-serif;font-size:8pt;letter-spacing:.14em;text-transform:uppercase;color:#7A5A37;font-weight:700;margin-bottom:3px}
.order h2{font-family:Montserrat,Arial,sans-serif;font-size:11pt;margin:16px 0 4px;color:#16171a}
.order p{margin:0 0 6px;text-align:justify}
.order ol{margin:0 0 6px 18px;padding:0}
.order .sign{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:46px}
.order .sign .line{border-top:1px solid #1c1d21;padding-top:6px;margin-top:46px;font-size:10pt}
.order .foot{margin-top:28px;border-top:1px solid #e3e2de;padding-top:6px;font-size:8pt;color:#8a8c92;text-align:center}
`;

export function orderHtml(blocks, logoUrl) {
  let html = `<div class="order"><div class="head"><img src="${esc(logoUrl)}" alt="M2 TAX"><div class="firm">${esc(FIRM.name)}<br>${esc(FIRM.address)}<br>NIP ${FIRM.nip} · KRS ${FIRM.krs}<br>${esc(FIRM.email)} · ${esc(FIRM.web)}</div></div>`;
  let inList = false;
  for (const b of blocks) {
    if (b.t !== 'li' && inList) { html += '</ol>'; inList = false; }
    if (b.t === 'title') html += `<h1>${esc(b.text)}</h1>`;
    else if (b.t === 'meta') html += `<div class="meta">${esc(b.text)}</div>`;
    else if (b.t === 'parties') html += `<div class="parties">${[b.left, b.right].map(x => `<div><div class="lbl">${esc(x.label)}</div>${x.lines.map(l => esc(l)).join('<br>')}</div>`).join('')}</div>`;
    else if (b.t === 'h') html += `<h2>${esc(b.text)}</h2>`;
    else if (b.t === 'p') html += `<p>${esc(b.text)}</p>`;
    else if (b.t === 'li') { if (!inList) { html += '<ol>'; inList = true; } html += `<li>${esc(b.text)}</li>`; }
    else if (b.t === 'sign') html += `<div class="sign">${[b.left, b.right].map(x => `<div><div class="lbl">${esc(x.label)}</div><div class="line">${x.lines.map(l => esc(l)).join('<br>')}</div></div>`).join('')}</div>`;
  }
  if (inList) html += '</ol>';
  html += `<div class="foot">${esc(FIRM.short)} · ${esc(FIRM.address)} · ${esc(FIRM.phones)} · ${esc(FIRM.email)}</div></div>`;
  return html;
}

export function printOrder(blocks, title) {
  const logo = location.origin + '/m2tax-logo.png';
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open();
  w.document.write(`<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>${esc(title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700&family=Source+Sans+3:wght@400;600;700&display=swap">
<style>@page{size:A4;margin:16mm 16mm 14mm}body{margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}${ORDER_CSS}</style></head>
<body>${orderHtml(blocks, logo)}</body></html>`);
  w.document.close();
  const go = () => { w.focus(); w.print(); };
  const img = w.document.querySelector('img');
  setTimeout(() => (img && !img.complete) ? (img.onload = img.onerror = go) : go(), 400);
  return true;
}

// ---------- Word (.docx) ----------
const x = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const run = (text, o = {}) => `<w:r><w:rPr>${o.font ? `<w:rFonts w:ascii="${o.font}" w:hAnsi="${o.font}" w:cs="${o.font}"/>` : ''}${o.b ? '<w:b/>' : ''}${o.color ? `<w:color w:val="${o.color}"/>` : ''}${o.sz ? `<w:sz w:val="${o.sz}"/><w:szCs w:val="${o.sz}"/>` : ''}${o.spacing ? `<w:spacing w:val="${o.spacing}"/>` : ''}${o.caps ? '<w:caps/>' : ''}</w:rPr><w:t xml:space="preserve">${x(text)}</w:t></w:r>`;
const para = (runs, o = {}) => `<w:p><w:pPr>${o.style ? `<w:pStyle w:val="${o.style}"/>` : ''}${o.num ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : ''}<w:spacing w:before="${o.before ?? 0}" w:after="${o.after ?? 100}"/>${o.jc ? `<w:jc w:val="${o.jc}"/>` : ''}${o.border ? '<w:pBdr><w:bottom w:val="single" w:sz="12" w:space="4" w:color="7A5A37"/></w:pBdr>' : ''}${o.topBorder ? '<w:pBdr><w:top w:val="single" w:sz="6" w:space="4" w:color="1C1D21"/></w:pBdr>' : ''}</w:pPr>${runs}</w:p>`;
const lines = (arr, o) => arr.map((l, i) => run(l, o) + (i < arr.length - 1 ? '<w:r><w:br/></w:r>' : '')).join('');

function twoCols(left, right, { topBorder = false, gapBefore = 0 } = {}) {
  const cell = (c) => `<w:tc><w:tcPr><w:tcW w:w="4500" w:type="dxa"/></w:tcPr>
    ${para(run(c.label, { b: true, color: '7A5A37', sz: 16, spacing: 30, caps: true, font: 'Montserrat' }), { after: 40, before: gapBefore })}
    ${para(lines(c.lines, { sz: 20 }), { topBorder, before: topBorder ? 600 : 0 })}</w:tc>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr>
  <w:tblGrid><w:gridCol w:w="4500"/><w:gridCol w:w="4500"/></w:tblGrid><w:tr>${cell(left)}${cell(right)}</w:tr></w:tbl>`;
}

export async function buildOrderDocx(blocks) {
  let logo = null;
  try { logo = new Uint8Array(await (await fetch('/m2tax-logo.png')).arrayBuffer()); } catch { /* bez logo */ }
  const cx = 1828800, cy = Math.round(cx * 302 / 900); // 5,08 cm szerokości
  const logoXml = logo ? `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1" name="Logo M2 TAX"/>
<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="1" name="logo.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdLogo"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>` : '';

  let body = para(logoXml, { after: 80 })
    + para(run(`${FIRM.name} · ${FIRM.address} · NIP ${FIRM.nip} · KRS ${FIRM.krs}`, { sz: 16, color: '5D6068' }), { border: true, after: 240 });
  for (const b of blocks) {
    if (b.t === 'title') body += para(run(b.text, { b: true, sz: 40, spacing: 60, font: 'Montserrat' }), { jc: 'center', after: 40 });
    else if (b.t === 'meta') body += para(run(b.text, { color: '5D6068', sz: 20 }), { jc: 'center', after: 280 });
    else if (b.t === 'parties') body += twoCols(b.left, b.right) + para('', { after: 120 });
    else if (b.t === 'h') body += para(run(b.text, { b: true, sz: 22, font: 'Montserrat' }), { before: 220, after: 80 });
    else if (b.t === 'p') body += para(run(b.text, { sz: 21 }), { jc: 'both', after: 100 });
    else if (b.t === 'li') body += para(run(b.text, { sz: 21 }), { num: true, after: 60 });
    else if (b.t === 'sign') body += para('', { after: 600 }) + twoCols(b.left, b.right, { topBorder: true });
  }
  body += para(run(`${FIRM.short} · ${FIRM.phones} · ${FIRM.email} · ${FIRM.web}`, { sz: 15, color: '8A8C92' }), { jc: 'center', before: 480 });

  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
<w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1000" w:right="1000" w:bottom="900" w:left="1000" w:header="500" w:footer="500" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Source Sans 3" w:hAnsi="Source Sans 3" w:cs="Arial" w:eastAsia="Arial"/><w:color w:val="1C1D21"/><w:sz w:val="21"/><w:lang w:val="pl-PL"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;
  const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1)"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="567" w:hanging="340"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;
  const files = [
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>` },
    { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>` },
    { name: 'word/_rels/document.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdNum" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>${logo ? '<Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.png"/>' : ''}</Relationships>` },
    { name: 'word/document.xml', data: doc },
    { name: 'word/styles.xml', data: styles },
    { name: 'word/numbering.xml', data: numbering },
    ...(logo ? [{ name: 'word/media/logo.png', data: logo }] : []),
  ];
  return zip(files);
}

export async function downloadOrderDocx(blocks, filename) {
  const bytes = await buildOrderDocx(blocks);
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
