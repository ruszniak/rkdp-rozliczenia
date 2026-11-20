// Formularze urzędowe RKDP wypełniane na oryginalnych wzorach: UPL-1 (US), PEL (ZUS) i ZAW-FA (KSeF).
// Współrzędne w punktach PDF (A4, początek w lewym górnym rogu).
import { printHtml } from '../ui.js';
import { parseAddress, splitName, parseReps, isFirstName as isFirst } from '../m2/pps1.js';

// Nazwa klienta-osoby (JDG) bywa zapisana jako „Nazwisko Imię” (zwykle) albo „Imię Nazwisko” (np. z białej listy VAT).
// Rozpoznajemy, który człon jest imieniem; gdy nie wiadomo – przyjmujemy „Nazwisko Imię”.
export function rkSplit(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { last: parts[0] || '', first: '' };
  if (isFirst(parts[0]) && !isFirst(parts[parts.length - 1])) return { first: parts[0], last: parts.slice(1).join(' ') };
  return { last: parts[0], first: parts.slice(1).join(' ') };
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

// adres do doręczeń / kontakt pełnomocnika: doradca → biuro RKDP; pracownik → wg „Mój profil”
export function deliveryOf(p = {}) {
  if (p.mode === 'doradca' || p.delivery === 'biuro') return RKDP_DELIVERY;
  return p.delivery && typeof p.delivery === 'object' ? p.delivery : null;
}
export function contactOf(p = {}) {
  if (p.mode === 'doradca') return RKDP_CONTACT;
  return { phone: p.phone || '', email: p.email || '' };
}

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
  // A – organ: poz. 5 dla Drugiego US Warszawa-Śródmieście, w pozostałych przypadkach poz. 4 (+ nazwa urzędu pod kwadratem)
  if (/drugi\S* urz\S* skarbow\S* warszawa-śr/i.test(d.office || '')) check(1, 62.4, 253.2);
  else { check(1, 62.4, 233.0); if (d.office) at(1, 78, 235.3, d.office, { size: 8.5, w: 480 }); }
  check(1, d.client_kind === 'osoba' ? 384.2 : 163.2, 344.6);
  at(1, 54.7, 359.3, d.client_name, { w: 500, size: d.client_name?.length > 70 ? 7.5 : 9 });
  at(1, 54.7, 417.3, d.c_country); at(1, 162.7, 417.3, d.c_voiv); at(1, 414.7, 417.3, d.c_county);
  at(1, 54.7, 438.3, d.c_commune); at(1, 184.3, 438.3, d.c_street, { w: 270 }); at(1, 457.9, 438.3, d.c_house); at(1, 515.5, 438.3, d.c_flat);
  at(1, 54.7, 459.3, d.c_city, { w: 220 }); at(1, 277.9, 459.3, d.c_zip); at(1, 393.1, 459.3, d.c_post, { w: 170 });
  at(1, 54.7, 498.5, d.client_phone, { keep: true }); at(1, 54.7, 520.4, d.client_email, { keep: true });
  // C – pełnomocnik (doradca: dane z ustawień; pracownik: dane z „Mój profil”)
  const sn = splitName(p.full_name);
  if (p.nip) { it.push(...glyphComb(1, 223.4, 391.5, 605.8, NIP_COMB, digits(p.nip))); it.push({ page: 1, x: 165.2, y: 600.0, line: 45.4 }); }
  else if (p.pesel) { it.push(...glyphComb(1, 223.4, 391.5, 605.8, NIP_COMB, digits(p.pesel))); it.push({ page: 1, x: 146.6, y: 600.0, line: 12.4 }); }
  if (p.full_name) { at(1, 54.7, 617.9, sn.last); at(1, 313.9, 617.9, sn.first); }
  if (p.ae_address) at(1, 319.0, 685.9, p.ae_address, { keep: true, size: 8 });
  const M = deliveryOf(p);
  if (M) {
    at(2, 50.4, 62.5, M.country); at(2, 162.0, 62.5, M.voiv); at(2, 392.4, 62.5, M.county);
    at(2, 50.4, 86.5, M.commune); at(2, 187.2, 86.5, M.street); at(2, 453.6, 86.5, M.house); at(2, 511.2, 86.5, M.flat);
    at(2, 50.4, 110.5, M.city); at(2, 273.6, 110.5, M.zip); at(2, 360.0, 110.5, M.post);
  }
  const C = contactOf(p);
  at(2, 50.4, 158.6, C.phone, { keep: true }); at(2, 50.4, 181.7, C.email, { keep: true });
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
  const pesel = d.p_pesel || p.pesel;
  if (pesel) it.push(...boxComb(2, PEL.pesel, 215.0, 232.8, digits(pesel)));
  const M = deliveryOf(p);
  if (M) {
    box(2, 238.6, 366.2, 552.5, 384.0, M.street); box(2, 238.6, 393.1, 310.1, 410.9, M.house); box(2, 399.4, 393.1, 470.9, 410.9, M.flat);
    box(2, 238.6, 420.0, 310.1, 437.8, M.zip); box(2, 399.4, 420.0, 552.5, 437.8, M.city);
  }
  const C = contactOf(p);
  if (C.phone) box(2, 238.6, 482.4, 552.5, 500.2, C.phone, { keep: true });
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
  // tło jako <img> (nie background-image): generator PDF czeka na załadowanie obrazków – bez tego wzór bywał pusty
  const page = (url, n) => `<div class="pg"><img class="bg" src="${origin}${url}" alt="">${items.filter(i => i.page === n).map(i => {
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
.bg{position:absolute;left:0;top:0;width:100%;height:100%;display:block}
.v{position:absolute;font-family:Arial,Helvetica,sans-serif;color:#0b2a6b;white-space:nowrap;line-height:1.15;overflow:hidden}
.v.wrap{white-space:normal;line-height:1.25}.v.b{font-weight:700}
.ln{position:absolute;border-top:.8pt solid #0b2a6b;height:0}
@media print{body{background:#fff}.pg{margin:0}}</style></head><body>${pages.map((u, i) => page(u, i + 1)).join('')}</body></html>`;
}

export function printOverlay(pages, items, title) {
  return printHtml(overlayHtml(pages, items, title));
}

export const UPL1_PAGES = ['/rkdp/upl1-1.png', '/rkdp/upl1-2.png'];
export const PEL_PAGES = ['/rkdp/pel-1.png', '/rkdp/pel-2.png', '/rkdp/pel-3.png'];

// ============ ZAW-FA(3) – nadanie uprawnień KSeF (składa klient; osoba uprawniona = osoba po stronie klienta) ============
export const ZAW_PAGES = ['/rkdp/zawfa3-1.png', '/rkdp/zawfa3-2.png'];
export function zawDefaults({ client = {}, reps = '' } = {}) {
  const osoba = client.legal_form === 'jdg' || client.kind === 'osoba';
  const n = rkSplit(client.name);
  const repsText = reps || (osoba ? `${n.first} ${n.last}`.trim() : client.contact_person || '');
  const first = parseReps(repsText)[0] || { first: '', last: '' };
  return {
    client_nip: digits(client.nip), office: '', purpose: 'nadanie', client_kind: osoba ? 'osoba' : 'firma',
    client_name: osoba ? `${n.last}, ${n.first}` : (client.name || ''),
    client_phone: client.phone || '', client_email: String(client.email || '').split(/[;,\s]+/).find(x => x.includes('@')) || '',
    u_idtype: 'pesel', u_id: '', u_last: first.last || '', u_first: first.first || '',
    u_phone: client.phone || '', u_email: String(client.email || '').split(/[;,\s]+/).find(x => x.includes('@')) || '',
    reps: repsText,
  };
}
export function zawItems(d) {
  const it = [];
  const at = (page, x, y, text, o = {}) => { if (text) it.push({ page, x, y, text: o.keep ? String(text) : up(text), size: o.size || 9.5, w: o.w || 480 }); };
  const check = (page, bx, by) => it.push({ page, x: bx + 2.6, y: by + 5.8, text: 'X', size: 10, bold: true });
  // 1. NIP podmiotu
  if (d.client_nip) it.push(...glyphComb(1, 58.3, 224.0, 35.6, NIP_COMB, digits(d.client_nip)));
  // A. urząd i cel
  at(1, 56, 222.5, d.office, { w: 500 });
  const P = { nadanie: [54.0, 240.4], odebranie: [157.9, 240.4], wszystkie: [285.5, 240.4] }[d.purpose];
  if (P) check(1, P[0], P[1]);
  // B. podmiot
  if (d.client_kind === 'firma') check(1, 123.1, 329.3);
  at(1, 56, 360.5, d.client_name, { w: 510, size: (d.client_name || '').length > 70 ? 8 : 9.5 });
  at(1, 56, 408, d.client_phone, { keep: true }); at(1, 56, 432.5, d.client_email, { keep: true });
  // C. osoba uprawniona
  if (d.purpose !== 'wszystkie') {
    if (d.u_idtype === 'nip') check(1, 120.9, 495.1); else if (d.u_idtype === 'pesel') check(1, 251.6, 495.1);
    if (d.u_id) it.push(...glyphComb(1, 215.6, 397.5, 521.5, '└' + '────┴'.repeat(10) + '────┘', digits(d.u_id)));
    at(1, 56, 551.5, d.u_last, { w: 180 }); at(1, 250, 551.5, d.u_first, { w: 150 });
    at(1, 56, 647, d.u_phone, { keep: true }); at(1, 56, 671, d.u_email, { keep: true });
  }
  // E. podpisujący (str. 2)
  const rows = [69.5, 117.5, 165.5, 213.5];
  parseReps(d.reps).slice(0, 4).forEach((r, i) => {
    at(2, 56, rows[i], r.last, { w: 270 }); at(2, 337, rows[i], r.first, { w: 220 });
    if (d.client_kind === 'firma') at(2, 56, rows[i] + 24, r.role, { w: 270 });
  });
  return it;
}

// ============ PDF formularza bez renderowania HTML: wzór (PNG) + dane rysowane na płótnie → pdf-lib ============
// Pewniejsze niż zrzut HTML (Safari i wolne łącze potrafiły zgubić tło formularza w załączniku e-maila).
const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Nie udało się wczytać wzoru formularza: ' + src)); i.src = src; });
export async function overlayPdfBytes(pages, items) {
  const { PDFDocument } = await import('../lib/pdf-vendor.js');
  const doc = await PDFDocument.create();
  const W = 595.28, H = 841.89, K = 2.5;   // pt → px (ok. 180 dpi)
  for (let n = 1; n <= pages.length; n++) {
    const img = await loadImg(pages[n - 1]);
    try { await img.decode(); } catch { /* */ }
    const cv = document.createElement('canvas'); cv.width = Math.round(W * K); cv.height = Math.round(H * K);
    const g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
    g.drawImage(img, 0, 0, cv.width, cv.height);
    g.fillStyle = '#0b2a6b'; g.strokeStyle = '#0b2a6b'; g.textBaseline = 'top';
    for (const i of items.filter(x => x.page === n)) {
      if (i.line) { g.lineWidth = 0.8 * K; g.beginPath(); g.moveTo(i.x * K, i.y * K); g.lineTo((i.x + i.line) * K, i.y * K); g.stroke(); continue; }
      const fs = i.size * K;
      g.font = `${i.bold ? '700 ' : ''}${fs}px Arial, Helvetica, sans-serif`;
      const top = i.y * K + fs * 0.075;
      if (i.wrap && i.w) {
        const words = String(i.text).split(/\s+/); let line = '', y = top; const lh = fs * 1.25, maxY = i.h ? (i.y + i.h) * K : Infinity;
        for (const wd of words) {
          const t = line ? line + ' ' + wd : wd;
          if (g.measureText(t).width > i.w * K && line) { if (y + lh > maxY + 1) break; g.fillText(line, i.x * K, y); line = wd; y += lh; } else line = t;
        }
        if (line && y + fs <= maxY + lh) g.fillText(line, i.x * K, y);
        continue;
      }
      let x = i.x * K;
      if (i.center && i.w) x += (i.w * K - g.measureText(String(i.text)).width) / 2;
      g.save();
      if (i.w && !i.center) { g.beginPath(); g.rect(i.x * K, i.y * K - fs, i.w * K, fs * 3); g.clip(); }
      g.fillText(String(i.text), x, top);
      g.restore();
    }
    const jpg = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.9));
    const emb = await doc.embedJpg(new Uint8Array(await jpg.arrayBuffer()));
    doc.addPage([W, H]).drawImage(emb, { x: 0, y: 0, width: W, height: H });
  }
  return doc.save();
}

// ============ Wniosek o przyznanie / odebranie dostępu do konta organizacji w e-Urzędzie Skarbowym (UKO) ============
export const UKO_PAGES = ['/rkdp/uko-1.png'];
export function ukoDefaults({ client = {}, reps = '' } = {}) {
  const a = parseAddress(client.address);
  const repsText = reps || client.contact_person || '';
  const first = parseReps(repsText)[0] || { first: '', last: '' };
  return {
    office: '', purpose: 'przyznanie', access: 'rozszerzony',
    client_nip: digits(client.nip), client_name: client.name || '',
    c_street: a.street, c_house: a.house, c_flat: a.flat, c_zip: a.zip, c_city: a.city, client_phone: client.phone || '',
    u_pesel: '', u_last: first.last || '', u_first: first.first || '', reps: repsText,
  };
}
export function ukoItems(d) {
  const it = [];
  const at = (x, y, text, o = {}) => { if (text) it.push({ page: 1, x, y, text: o.keep ? String(text) : up(text), size: o.size || 9.5, w: o.w || 480 }); };
  const check = (bx, by) => it.push({ page: 1, x: bx + 1.3, y: by + 2.6, text: 'X', size: 9, bold: true });
  at(48, 145, d.office, { w: 500 });
  if (d.purpose === 'przyznanie') check(95.1, 191.1); else if (d.purpose === 'odebranie') check(325.8, 191.1);
  if (d.client_nip) it.push(...glyphComb(1, 44.4, 261.0, 252.2, NIP_COMB, digits(d.client_nip)));
  at(48, 291, d.client_name, { w: 510, size: (d.client_name || '').length > 75 ? 8 : 9.5 });
  at(48, 320, d.c_street, { w: 270 }); at(330, 320, d.c_house, { w: 115 }); at(454, 320, d.c_flat, { w: 100 });
  at(48, 355, d.c_zip, { w: 100 }); at(159, 355, d.c_city, { w: 200 }); at(370, 355, d.client_phone, { keep: true, w: 180 });
  if (d.purpose === 'przyznanie') { if (d.access === 'podstawowy') check(45.4, 398.2); else if (d.access === 'rozszerzony') check(45.4, 415.3); }
  if (d.u_pesel) it.push(...glyphComb(1, 44.4, 282.3, 466.2, '└' + '────┴'.repeat(10) + '────┘', digits(d.u_pesel)));
  at(48, 506, d.u_last, { w: 240 }); at(302, 506, d.u_first, { w: 250 });
  const rows = [572, 636, 701];
  parseReps(d.reps).slice(0, 3).forEach((r, i) => {
    at(72, rows[i], r.last, { w: 280 }); at(370, rows[i], r.first, { w: 190 });
    at(72, rows[i] + 32, r.role, { w: 280 });
  });
  return it;
}
