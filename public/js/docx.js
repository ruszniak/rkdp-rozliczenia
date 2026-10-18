// Wypełnianie wzorów .docx w przeglądarce: rozpakowanie (deflate), podmiana pól [..], ponowne spakowanie
// oraz zamiana treści na HTML (do podglądu i wydruku PDF na papierze firmowym).
import { zip } from './xlsx.js';

async function inflateRaw(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const out = new Response(new Blob([bytes]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
}

export async function unzip(buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Uszkodzony plik .docx');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const files = [];
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    const lnlen = dv.getUint16(local + 26, true), lelen = dv.getUint16(local + 28, true);
    const start = local + 30 + lnlen + lelen;
    const raw = u8.subarray(start, start + csize);
    files.push({ name, data: method === 8 ? await inflateRaw(raw) : raw.slice() });
    p += 46 + nlen + elen + clen;
  }
  return files;
}

const xmlEsc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// replacements: [['[KWOTA]', '1 000,00'], ...] – każde wystąpienie po kolei (powtarzające się pola wypełniane w kolejności)
export function fillXml(xml, replacements) {
  let out = xml;
  for (const [ph, val] of replacements) {
    const i = out.indexOf(xmlEsc(ph));
    if (i < 0) continue;
    out = out.slice(0, i) + xmlEsc(val) + out.slice(i + xmlEsc(ph).length);
  }
  return out;
}

export async function fillDocx(url, replacements) {
  const buf = await (await fetch(url)).arrayBuffer();
  const files = await unzip(buf);
  const enc = new TextEncoder(), dec = new TextDecoder();
  let documentXml = '';
  for (const f of files) {
    if (f.name === 'word/document.xml') {
      documentXml = fillXml(dec.decode(f.data), replacements);
      f.data = enc.encode(documentXml);
    }
  }
  const media = Object.fromEntries(files.filter(f => f.name.startsWith('word/media/')).map(f => [f.name, f.data]));
  return { bytes: zip(files), documentXml, media };
}

// ---- document.xml → HTML (akapity, wyrównanie, wcięcia, pogrubienia, tabulatory) ----
const htmlEsc = v => String(v ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const unXml = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

export function docxToHtml(documentXml) {
  const body = (documentXml.match(/<w:body>([\s\S]*)<\/w:body>/) || [, ''])[1];
  const paras = body.match(/<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g) || [];
  return paras.map(p => {
    const ppr = (p.match(/<w:pPr>([\s\S]*?)<\/w:pPr>/) || [, ''])[1];
    const jc = (ppr.match(/<w:jc w:val="(\w+)"/) || [])[1];
    const ind = Number((ppr.match(/<w:ind [^>]*w:left="(\d+)"/) || [])[1] || 0) / 20;
    const hang = Number((ppr.match(/<w:ind [^>]*w:hanging="(\d+)"/) || [])[1] || 0) / 20;
    const after = Number((ppr.match(/<w:spacing [^>]*w:after="(\d+)"/) || [])[1] ?? 120) / 20;
    const before = Number((ppr.match(/<w:spacing [^>]*w:before="(\d+)"/) || [])[1] ?? 0) / 20;
    const runs = (p.match(/<w:r[ >][\s\S]*?<\/w:r>/g) || []).map(r => {
      const rpr = (r.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/) || [, ''])[1];
      const bold = /<w:b\/>|<w:b w:val="(true|1)"\/>/.test(rpr);
      const ital = /<w:i\/>|<w:i w:val="(true|1)"\/>/.test(rpr);
      const sz = Number((rpr.match(/<w:sz w:val="(\d+)"/) || [])[1] || 0) / 2;
      let txt = '';
      for (const m of r.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>/g)) {
        if (m[0] === '<w:tab/>') txt += '<span class="tab"></span>';
        else if (m[0] === '<w:br/>') txt += '<br>';
        else txt += htmlEsc(unXml(m[1]));
      }
      if (!txt) return '';
      let inner = txt;
      if (ital) inner = `<i>${inner}</i>`;
      if (bold) inner = `<b>${inner}</b>`;
      return sz ? `<span style="font-size:${sz}pt">${inner}</span>` : inner;
    }).join('');
    const st = [`text-align:${jc === 'both' ? 'justify' : jc === 'center' ? 'center' : jc === 'right' ? 'right' : 'left'}`,
      ind ? `margin-left:${ind}pt` : '', hang ? `text-indent:-${hang}pt` : '', `margin-bottom:${after}pt`, before ? `margin-top:${before}pt` : ''].filter(Boolean).join(';');
    return `<p style="${st}">${runs || '&nbsp;'}</p>`;
  }).join('\n');
}

export function bytesToDataUrl(bytes, mime = 'image/png') {
  let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(s)}`;
}

export function downloadBytes(bytes, filename, mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes], { type: mime })); a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}
