// PPS-1(3) – pełnomocnictwo szczególne. Dane nanoszone na oryginalny formularz MF (tło: /m2/pps1-N.png),
// współrzędne w punktach PDF (A4 595,44 × 841,68 pt, początek w lewym górnym rogu).
import { FIRM, MATTER_TYPE } from './dict.js';

// adres M2 TAX do doręczeń w kraju (C.2)
export const M2_DELIVERY = { country: 'POLSKA', voiv: 'DOLNOŚLĄSKIE', county: 'M. WROCŁAW', commune: 'M. WROCŁAW', street: 'ZWYCIĘSKA', house: '3', flat: '', city: 'WROCŁAW', zip: '53-033' };

// ---- pomocnicze: rozbicie adresu i nazwisk ----
export function parseAddress(s) {
  const out = { country: 'POLSKA', voiv: '', county: '', commune: '', street: '', house: '', flat: '', city: '', zip: '' };
  if (!s) return out;
  const m = s.match(/(\d{2}-\d{3})\s*([^,]+)/);
  if (m) { out.zip = m[1]; out.city = m[2].trim(); }
  const first = s.split(',')[0].trim();
  const st = first.replace(/^(ul\.|ulica|al\.|aleja|pl\.|plac|os\.)\s*/i, '').match(/^(.*?)\s+(\d+[a-zA-Z]?)(?:\s*(?:\/|m\.|lok\.)\s*(\d+[a-zA-Z]?))?$/);
  if (st) { out.street = st[1]; out.house = st[2]; out.flat = st[3] || ''; } else if (!m || !first.includes(m[1])) out.street = first;
  if (out.city && !out.street && !out.house) out.street = '';
  return out;
}
export function splitName(full) {
  const parts = (full || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { last: parts[0] || '', first: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}
export function parseReps(text) {
  return (text || '').split('\n').map(l => l.trim()).filter(Boolean).slice(0, 3).map(l => {
    const [name, ...fn] = l.split(/\s+[–-]\s+/);
    const n = splitName(name);
    return { last: n.last, first: n.first, role: fn.join(' – ') };
  });
}

// treść poz. 71 (zakres) z danych sprawy
export function pps1Scope(p = {}) {
  const lc = x => x && !/^.[A-ZĄĆĘŁŃÓŚŹŻ]/.test(x) ? x.charAt(0).toLowerCase() + x.slice(1) : x;
  const parts = [lc(MATTER_TYPE[p.matter_type]), p.tax ? `podatek: ${p.tax}` : null, p.period ? `okres: ${p.period}` : null, p.ref_no ? `sygn./znak: ${p.ref_no}` : null].filter(Boolean);
  return `Reprezentowanie Mocodawcy${parts.length ? ` w sprawie: ${parts.join('; ')}` : ' w sprawie podatkowej'} – we wszystkich czynnościach w tej sprawie, w tym do składania i odbioru pism, przeglądania akt, składania wyjaśnień, wniosków i środków zaskarżenia.`;
}

// ---- dane domyślne z klienta, sprawy i pełnomocnika ----
export function pps1Defaults({ client, params = {}, signer, scope }) {
  const c = client || {};
  const a = parseAddress(c.address);
  const osoba = c.kind === 'osoba';
  const n = splitName(c.name);
  return {
    organ: params.authority || '',
    box4: [2],            // poz. 4 – zaznaczone kwadraty (1–6)
    client_nip: (c.nip || '').replace(/\D/g, ''),
    client_kind: osoba ? 'osoba' : 'firma',
    client_name: osoba ? `${n.last}, ${n.first}` : (c.name || ''),
    ...Object.fromEntries(Object.entries(a).map(([k, v]) => ['c_' + k, v])),
    client_phone: params.client_phone || c.phone || '',
    client_email: params.client_email || c.email || '',
    client_ae: '',
    signer_id: signer?.id || '',
    delivery: 'tak',
    further: 'tak',
    scope: scope || '',
    reps: osoba ? `${c.name || ''}` : (params.client_reps || ''),
    date: new Date().toISOString().slice(0, 10),
    fee: 'dolaczono',
  };
}

// ---- rysowanie ----
const esc = v => String(v ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const up = v => String(v ?? '').toLocaleUpperCase('pl-PL');

// grzebień z kratkami: rozkłada znaki do komórek na podstawie wzoru └────┴────┘-…
function comb(page, x0, x1, top, pattern, chars) {
  const cw = (x1 - x0) / pattern.length;
  const cells = [];
  for (let i = 0; i < pattern.length; i++) if (pattern[i] === '─' && pattern[i - 1] !== '─') cells.push(x0 + (i + 2) * cw);
  return [...chars].slice(0, cells.length).map((ch, i) => ({ page, x: cells[i] - 3, y: top, text: ch, size: 10, w: 6, center: true }));
}
const NIP_COMB = '└' + '────┴'.repeat(10) + '────┘';
const DATE_COMB = '└────┴────┘-└────┴────┘-└────┴────┴────┴────┘';
const dateDigits = iso => iso ? iso.slice(8, 10) + iso.slice(5, 7) + iso.slice(0, 4) : '';
const check = (page, x0, y0) => ({ page, x: x0 + 3.1, y: y0 + 1.9, text: 'X', size: 9.5, bold: true });
const strike = (page, x0, y0, x1) => ({ page, x: x0, y: y0 + 3.4, line: x1 - x0 });

export const BOX4_LABELS = { 1: 'mocodawca', 2: 'pełnomocnik', 3: 'dalszy pełnomocnik', 4: 'adwokat', 5: 'radca prawny', 6: 'doradca podatkowy' };

export function pps1Items(d, signer) {
  const it = [];
  const txt = (page, x, y, text, o = {}) => { if (text) it.push({ page, x, y, text: o.keep ? String(text) : up(text), size: o.size || 9, w: o.w, wrap: o.wrap }); };
  const at = (page, labelX, labelY, text, o) => txt(page, labelX + 3, labelY + 9.5, text, o);
  const s = signer || {};
  const sn = splitName(s.full_name);

  // poz. 1 – NIP mocodawcy (skreślamy „numer PESEL”)
  if (d.client_nip) { it.push(...comb(1, 205.0, 386.9, 39.2, NIP_COMB, d.client_nip)); it.push(strike(1, 140.5, 30.5, 186.7)); }
  // A
  at(1, 54.1, 202.3, d.organ, { w: 500 });
  const BOX4 = { 1: 59.7, 2: 139.5, 3: 219.9, 4: 324.4, 5: 386.7, 6: 464.6 };
  (d.box4 || []).forEach(n => BOX4[n] && it.push(check(1, BOX4[n], 233.1)));
  // B.1
  it.push(check(1, d.client_kind === 'osoba' ? 382.8 : 161.7, 313.0));
  at(1, 54.1, 330.7, d.client_name, { w: 252, size: d.client_name?.length > 52 ? 7.5 : 9 });
  // B.2
  at(1, 54.1, 472.1, d.c_country); at(1, 195.7, 472.1, d.c_voiv); at(1, 415.5, 472.1, d.c_county);
  at(1, 54.1, 496.1, d.c_commune); at(1, 195.7, 496.1, d.c_street, { w: 215 }); at(1, 415.5, 496.1, d.c_house); at(1, 494.3, 496.1, d.c_flat);
  at(1, 54.1, 520.1, d.c_city, { w: 355 }); at(1, 415.5, 520.1, d.c_zip);
  // B.3
  at(1, 54.1, 565.5, d.client_phone, { keep: true }); at(1, 280.0, 565.5, d.client_email, { keep: true }); at(1, 54.1, 589.5, d.client_ae, { keep: true });
  // C.1 – pełnomocnik
  if (s.nip) { it.push(...comb(1, 69.4, 251.3, 674.6, NIP_COMB, String(s.nip).replace(/\D/g, ''))); it.push(strike(1, 164.8, 665.9, 211.2)); }
  at(1, 280.0, 665.9, s.license_no || '');
  at(1, 53.3, 690.0, sn.last); at(1, 225.8, 690.0, sn.first);
  // C.1 c.d. (str. 2): doręczenia, adres elektroniczny
  if (d.delivery === 'tak') it.push(check(2, 162.6, 60.5));
  at(2, 312.3, 55.6, s.ae_address, { keep: true });
  // C.2 – adres do doręczeń w kraju (POLSKA jest nadrukowane)
  const M = M2_DELIVERY;
  at(2, 195.3, 100.9, M.voiv); at(2, 415.2, 100.9, M.county);
  at(2, 53.8, 125.0, M.commune); at(2, 195.3, 125.0, M.street); at(2, 415.2, 125.0, M.house); at(2, 493.3, 125.0, M.flat);
  at(2, 53.8, 149.1, M.city); at(2, 415.2, 149.1, M.zip);
  // C.3
  at(2, 53.8, 194.6, s.phone || FIRM.phones.split('·')[0].trim(), { keep: true }); at(2, 310.6, 194.6, s.email || FIRM.email, { keep: true });
  // D – zakres
  it.push({ page: 2, x: 57, y: 652, text: up(d.scope), size: 8.6, wrap: true, w: 488, h: 58 });
  // E
  it.push(check(2, d.further === 'nie' ? 288.2 : 248.0, 731.6));
  const reps = parseReps(d.reps);
  const rows = [[2, 753.5, 777.5], [3, 28.7, 52.8], [3, 76.9, 101.0]];
  reps.forEach((r, i) => {
    const [pg, y1, y2] = rows[i];
    at(pg, 53.8, y1, r.last); at(pg, 312.4, y1, r.first);
    if (d.client_kind !== 'osoba') at(pg, 53.8, y2, r.role, { w: 250 });
  });
  if (d.date) it.push(...comb(3, 237.9, 380.4, 133.9, DATE_COMB, dateDigits(d.date)));
  // F
  if (d.fee === 'dolaczono') it.push(check(3, 109.8, 246.9));
  else if (d.fee === 'w3dni') it.push(check(3, 293.6, 246.9));
  return it;
}

export function pps1Html(d, signer, origin = location.origin) {
  const items = pps1Items(d, signer);
  const page = n => `<div class="pg" style="background-image:url('${origin}/m2/pps1-${n}.png')">${items.filter(i => i.page === n).map(i => {
    if (i.line) return `<span class="ln" style="left:${i.x}pt;top:${i.y}pt;width:${i.line}pt"></span>`;
    const st = [`left:${i.x}pt`, `top:${i.y}pt`, `font-size:${i.size}pt`];
    if (i.w) st.push(`width:${i.w}pt`);
    if (i.h) st.push(`height:${i.h}pt`);
    if (i.center) st.push('text-align:center');
    return `<span class="v${i.wrap ? ' wrap' : ''}${i.bold ? ' b' : ''}" style="${st.join(';')}">${esc(i.text)}</span>`;
  }).join('')}</div>`;
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>PPS-1 ${esc(d.client_name || '')}</title>
<style>@page{size:A4;margin:0}html,body{margin:0;padding:0;background:#eee}
.pg{position:relative;width:595.44pt;height:841.68pt;background-size:100% 100%;background-repeat:no-repeat;background-color:#fff;margin:0 auto 12pt;overflow:hidden;break-after:page;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pg:last-child{break-after:auto}
.v{position:absolute;font-family:Arial,Helvetica,sans-serif;color:#0b2a6b;white-space:nowrap;line-height:1.15;overflow:hidden;text-overflow:clip}
.v.wrap{white-space:normal;line-height:1.3}.v.b{font-weight:700}
.ln{position:absolute;border-top:.8pt solid #0b2a6b;height:0}
@media print{body{background:#fff}.pg{margin:0}}</style></head><body>${[1, 2, 3].map(page).join('')}</body></html>`;
}

export function printPps1(d, signer) {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open(); w.document.write(pps1Html(d, signer)); w.document.close();
  const imgs = [1, 2, 3].map(n => { const im = new Image(); im.src = `${location.origin}/m2/pps1-${n}.png`; return im.decode().catch(() => {}); });
  Promise.all(imgs).then(() => setTimeout(() => { w.focus(); w.print(); }, 300));
  return true;
}
