// Formularze urzędowe RKDP wypełniane na oryginalnych wzorach: UPL-1 (US) i PEL (ZUS).
// Współrzędne w punktach PDF (A4, początek w lewym górnym rogu).
import { parseAddress, splitName, parseReps } from '../m2/pps1.js';

// W bazie RKDP osoby (JDG) zapisane są jako „Nazwisko Imię”
export function rkSplit(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  return parts.length < 2 ? { last: parts[0] || '', first: '' } : { last: parts[0], first: parts.slice(1).join(' ') };
}

// adres RKDP do doręczeń (pełnomocnik – doradca podatkowy)
export const RKDP_DELIVERY = { country: 'POLSKA', voiv: 'DOLNOŚLĄSKIE', county: 'M. WROCŁAW', commune: 'M. WROCŁAW', street: 'BEATY ARTEMSKIEJ', house: '11', flat: '44', city: 'WROCŁAW', zip: '52-234', post: 'WROCŁAW' };
export const RKDP_CONTACT = { email: 'kancelaria@rkdp.pl', phone: '' };

const up = v => String(v ?? '').toLocaleUpperCase('pl-PL');
const esc = v => String(v ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const digits = v => String(v ?? '').replace(/\D/g, '');
const dmy = iso => iso ? iso.slice(8, 10) + iso.slice(5, 7) + iso.slice(0, 4) : '';

// grzebień narysowany znakami └────┴────┘ (UPL-1)
function glyphComb(page, x0, x1, top, pattern, chars) {
  const cw = (x1 - x0) / pattern.length, cells = [];
  for (let i = 0; i < pattern.length; i++) if (pattern[i] === '─' && pattern[i - 1] !== '─') cells.push(x0 + (i + 2) * cw);
  return [...chars].slice(0, cells.length).map((ch, i) => ({ page, x: cells[i] - 3, y: top, text: ch, size: 10, w: 6, center: true }));
}
// grzebień z prostokątnych kratek (PEL): edges = krawędzie kratek
function boxComb(page, edges, top, bottom, chars) {
  const h = bottom - top;
  return [...chars].slice(0, edges.length - 1).map((ch, i) => ({ page, x: edges[i], y: top + (h - 11) / 2, text: ch, size: 11, w: edges[i + 1] - edges[i], center: true }));
}
const NIP_COMB = '└' + '────┴'.repeat(10) + '────┘';
const DATE_COMB = '└────┴────┘-└────┴────┘-└────┴────┴────┴────┘';

// ============ UPL-1(6) ============
export function upl1Defaults({ client = {}, reps = '' } = {}) {
  const a = parseAddress(client.address);
  const osoba = client.legal_form === 'jdg' || client.kind === 'osoba';
  const n = rkSplit(client.name);
  return {
    client_nip: digits(client.nip), client_kind: osoba ? 'osoba' : 'firma',
    client_name: osoba ? `${n.last}, ${n.first}` : (client.name || ''),
    ...Object.fromEntries(Object.entries(a).map(([k, v]) => ['c_' + k, v])), c_post: a.city,
    client_phone: client.phone || '', client_email: client.email || '',
    reps: reps || (osoba ? `${n.first} ${n.last}`.trim() : client.contact_person || ''),
    valid_from: '', valid_to: '', date: new Date().toISOString().slice(0, 10),
  };
}

// p = pełnomocnik: { mode: 'doradca'|'pracownik', full_name, nip, ae_address }
export function upl1Items(d, p = {}) {
  const it = [];
  const at = (page, x, y, text, o = {}) => { if (text) it.push({ page, x: x + 3, y: y + 10, text: o.keep ? String(text) : up(text), size: o.size || 8.5, w: o.w }); };
  const check = (page, x0, y0) => it.push({ page, x: x0 + 2.4, y: y0 - 0.2, text: 'X', size: 9.5, bold: true });
  // poz. 1 – NIP mocodawcy (skreślamy „numer PESEL”)
  if (d.client_nip) { it.push(...glyphComb(1, 110.0, 278.1, 51.4, NIP_COMB, d.client_nip)); it.push({ page: 1, x: 139.5, y: 42.6, line: 45.6 }); }
  check(1, 62.4, 233.0); // poz. 4 – naczelnik US
  check(1, d.client_kind === 'osoba' ? 384.2 : 163.2, 344.6);
  at(1, 54.7, 359.3, d.client_name, { w: 500, size: d.client_name?.length > 70 ? 7.5 : 9 });
  at(1, 54.7, 417.3, d.c_country); at(1, 162.7, 417.3, d.c_voiv); at(1, 414.7, 417.3, d.c_county);
  at(1, 54.7, 438.3, d.c_commune); at(1, 184.3, 438.3, d.c_street, { w: 270 }); at(1, 457.9, 438.3, d.c_house); at(1, 515.5, 438.3, d.c_flat);
  at(1, 54.7, 459.3, d.c_city, { w: 220 }); at(1, 277.9, 459.3, d.c_zip); at(1, 393.1, 459.3, d.c_post, { w: 170 });
  at(1, 54.7, 498.5, d.client_phone, { keep: true }); at(1, 54.7, 520.4, d.client_email, { keep: true });
  // C – pełnomocnik
  const sn = splitName(p.full_name);
  if (p.mode === 'doradca') {
    if (p.nip) { it.push(...glyphComb(1, 223.4, 391.5, 605.8, NIP_COMB, digits(p.nip))); it.push({ page: 1, x: 165.2, y: 600.0, line: 45.4 }); }
    at(1, 54.7, 617.9, sn.last); at(1, 313.9, 617.9, sn.first);
    at(1, 319.0, 685.9, p.ae_address, { keep: true, size: 8 });
    const M = RKDP_DELIVERY;
    at(2, 50.4, 62.5, M.country); at(2, 162.0, 62.5, M.voiv); at(2, 392.4, 62.5, M.county);
    at(2, 50.4, 86.5, M.commune); at(2, 187.2, 86.5, M.street); at(2, 453.6, 86.5, M.house); at(2, 511.2, 86.5, M.flat);
    at(2, 50.4, 110.5, M.city); at(2, 273.6, 110.5, M.zip); at(2, 360.0, 110.5, M.post);
    at(2, 50.4, 158.6, RKDP_CONTACT.phone, { keep: true }); at(2, 50.4, 181.7, RKDP_CONTACT.email, { keep: true });
  } else if (p.full_name) {
    at(1, 54.7, 617.9, sn.last); at(1, 313.9, 617.9, sn.first);
  }
  // D – okres
  if (d.valid_from) it.push(...glyphComb(2, 170.0, 302.5, 238.6, DATE_COMB, dmy(d.valid_from)));
  if (d.valid_to) it.push(...glyphComb(2, 429.2, 561.7, 238.6, DATE_COMB, dmy(d.valid_to)));
  // E – podpisujący
  const rows = [[300.6, 322.5], [345.5, 366.6], [389.5, 410.6]];
  parseReps(d.reps).forEach((r, i) => {
    at(2, 50.4, rows[i][0], r.last); at(2, 309.6, rows[i][0], r.first);
    if (d.client_kind !== 'osoba') at(2, 50.4, rows[i][1], r.role, { w: 250 });
  });
  if (d.date) it.push(...glyphComb(2, 239.8, 372.1, 441.8, DATE_COMB, dmy(d.date)));
  return it;
}

// ============ PEL (ZUS) ============
// krawędzie kratek i pól odczytane z formularza (pt)
const PEL = {
  pesel: [238.6, 256.8, 274.6, 292.3, 310.1, 327.8, 346.1, 363.8, 381.6, 399.4, 417.1, 435.4],
  date8: [238.6, 256.8, 274.1, 292.3, 310.1, 327.8, 346.1, 363.8, 381.6],
  nip1: [373.9, 391.7, 409.9, 427.7, 445.4, 463.2, 481.0, 499.2, 517.0, 534.7, 552.5],
  nip2: [185.3, 203.0, 221.3, 239.0, 256.8, 274.6, 292.3, 310.6, 328.3, 346.1, 363.8],
  od: [185.3, 203.0, 220.8, 238.6, 256.3, 274.6, 292.3, 310.1, 327.8],
  do: [363.8, 381.6, 399.4, 417.1, 434.9, 453.1, 470.9, 488.6, 506.4],
  data: [77.8, 96.0, 113.3, 131.5, 149.3, 167.0, 185.3, 203.0, 220.8],
};

export function pelDefaults({ client = {}, reps = '' } = {}) {
  const osoba = client.legal_form === 'jdg' || client.kind === 'osoba';
  const person = osoba ? rkSplit(client.name) : (parseReps(reps || client.contact_person || '')[0] || { first: '', last: '' });
  const a = parseAddress(client.address);
  return {
    g_first: person.first || '', g_last: person.last || '', g_pesel: '',
    g_street: a.street, g_house: a.house, g_flat: a.flat, g_zip: a.zip, g_city: a.city, g_phone: client.phone || '',
    acting: osoba ? 'firma' : 'podmiot', client_nip: digits(client.nip),
    entity: osoba ? '' : [client.name, client.address, client.regon ? `REGON ${client.regon}` : ''].filter(Boolean).join(', '),
    scope_all: true, scope_pit: false, scope_task: '', ezus: true, ezus_role: osoba ? 'platnik' : 'platnik_inny', ezus_corr_only: false, ezla: false,
    valid_from: '', valid_to: '', date: new Date().toISOString().slice(0, 10), p_pesel: '',
  };
}

export function pelItems(d, p = {}) {
  const it = [];
  const box = (page, l, t, r, b, text, o = {}) => { if (text) it.push({ page, x: l + 4, y: t + (b - t - (o.size || 10)) / 2 - 0.5, text: o.keep ? String(text) : up(text), size: o.size || 10, w: r - l - 8 }); };
  const check = (page, l, t) => it.push({ page, x: l + 4.2, y: t + 2.2, text: 'X', size: 12, bold: true });
  // osoba udzielająca (str. 1)
  if (d.g_pesel) it.push(...boxComb(1, PEL.pesel, 403.7, 421.4, digits(d.g_pesel)));
  box(1, 238.6, 498.2, 552.5, 516.0, d.g_first); box(1, 238.6, 523.7, 552.5, 541.9, d.g_last);
  box(1, 238.6, 549.6, 552.5, 567.4, d.g_street); box(1, 238.6, 575.5, 310.1, 593.3, d.g_house); box(1, 399.4, 575.5, 470.9, 593.3, d.g_flat);
  box(1, 238.6, 601.4, 310.1, 619.2, d.g_zip); box(1, 399.4, 601.4, 552.5, 619.2, d.g_city);
  box(1, 238.6, 661.0, 552.5, 679.2, d.g_phone, { keep: true });
  if (d.acting === 'wlasne') check(1, 42.7, 733.0);
  if (d.acting === 'firma') { check(1, 42.7, 758.9); if (d.client_nip) it.push(...boxComb(1, PEL.nip1, 758.9, 776.6, d.client_nip)); }
  if (d.acting === 'podmiot') {
    check(2, 42.7, 95.0);
    if (d.client_nip) it.push(...boxComb(2, PEL.nip2, 112.8, 130.6, d.client_nip));
    if (d.entity) it.push({ page: 2, x: 82, y: 144, text: up(d.entity), size: 9, w: 466, h: 30, wrap: true });
  }
  // pełnomocnik (str. 2)
  const sn = splitName(p.full_name);
  if (p.full_name) { box(2, 238.6, 313.0, 552.5, 330.7, sn.first); box(2, 238.6, 339.8, 552.5, 357.6, sn.last); }
  if (d.p_pesel) it.push(...boxComb(2, PEL.pesel, 215.0, 232.8, digits(d.p_pesel)));
  if (p.mode === 'doradca') {
    const M = RKDP_DELIVERY;
    box(2, 238.6, 366.2, 552.5, 384.0, M.street); box(2, 238.6, 393.1, 310.1, 410.9, M.house); box(2, 399.4, 393.1, 470.9, 410.9, M.flat);
    box(2, 238.6, 420.0, 310.1, 437.8, M.zip); box(2, 399.4, 420.0, 552.5, 437.8, M.city);
    if (RKDP_CONTACT.phone) box(2, 238.6, 482.4, 552.5, 500.2, RKDP_CONTACT.phone, { keep: true });
  }
  // zakres
  if (d.scope_all) check(2, 42.7, 557.8);
  if (d.scope_pit) check(2, 42.7, 637.0);
  if (d.scope_task) { check(2, 42.7, 710.4); it.push({ page: 2, x: 76, y: 742, text: up(d.scope_task), size: 9.5, w: 472, h: 30, wrap: true }); }
  // eZUS (str. 3)
  if (d.ezus) {
    check(3, 42.7, 95.0);
    const R = { ubezpieczony: [328.8, 'ub'], swiadczeniobiorca: [354.7, 'sw'], platnik: [380.6, 'pl'], komornik: [406.6, 'kom'], platnik_inny: [449.3, 'pi'] }[d.ezus_role];
    if (R) {
      check(3, 42.7, R[0]);
      if (d.ezus_corr_only && R[1] !== 'kom') check(3, 310.6, R[0]);
      if (d.ezla && (R[1] === 'pl' || R[1] === 'pi')) check(3, 435.4, R[0]);
    }
  }
  if (d.valid_from) it.push(...boxComb(3, PEL.od, 576.0, 593.8, dmy(d.valid_from)));
  if (d.valid_to) it.push(...boxComb(3, PEL.do, 576.0, 593.8, dmy(d.valid_to)));
  if (d.date) it.push(...boxComb(3, PEL.data, 681.1, 698.9, dmy(d.date)));
  return it;
}

// ============ wspólny wydruk: tło formularza + dane ============
export function overlayHtml(pages, items, title, origin = location.origin) {
  const page = (url, n) => `<div class="pg" style="background-image:url('${origin}${url}')">${items.filter(i => i.page === n).map(i => {
    if (i.line) return `<span class="ln" style="left:${i.x}pt;top:${i.y}pt;width:${i.line}pt"></span>`;
    const st = [`left:${i.x}pt`, `top:${i.y}pt`, `font-size:${i.size}pt`];
    if (i.w) st.push(`width:${i.w}pt`);
    if (i.h) st.push(`height:${i.h}pt`);
    if (i.center) st.push('text-align:center');
    return `<span class="v${i.wrap ? ' wrap' : ''}${i.bold ? ' b' : ''}" style="${st.join(';')}">${esc(i.text)}</span>`;
  }).join('')}</div>`;
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>@page{size:A4;margin:0}html,body{margin:0;padding:0;background:#eee}
.pg{position:relative;width:595.28pt;height:841.89pt;background-size:100% 100%;background-repeat:no-repeat;background-color:#fff;margin:0 auto 12pt;overflow:hidden;break-after:page;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pg:last-child{break-after:auto}
.v{position:absolute;font-family:Arial,Helvetica,sans-serif;color:#0b2a6b;white-space:nowrap;line-height:1.15;overflow:hidden}
.v.wrap{white-space:normal;line-height:1.25}.v.b{font-weight:700}
.ln{position:absolute;border-top:.8pt solid #0b2a6b;height:0}
@media print{body{background:#fff}.pg{margin:0}}</style></head><body>${pages.map((u, i) => page(u, i + 1)).join('')}</body></html>`;
}

export function printOverlay(pages, items, title) {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open(); w.document.write(overlayHtml(pages, items, title)); w.document.close();
  Promise.all(pages.map(u => { const im = new Image(); im.src = location.origin + u; return im.decode().catch(() => {}); }))
    .then(() => setTimeout(() => { w.focus(); w.print(); }, 300));
  return true;
}

export const UPL1_PAGES = ['/rkdp/upl1-1.png', '/rkdp/upl1-2.png'];
export const PEL_PAGES = ['/rkdp/pel-1.png', '/rkdp/pel-2.png', '/rkdp/pel-3.png'];
