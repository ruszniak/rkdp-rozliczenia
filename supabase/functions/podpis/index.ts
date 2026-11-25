// Podpis dokumentu przez klienta (np. umowy): e-mail z samym linkiem do strony /podpis/?t=…, na której klient
// czyta dokument, może zgłosić uwagi, pobiera PDF, podpisuje (profil zaufany, podpis kwalifikowany, odręcznie) i wgrywa podpisany plik.
//  • send   – zalogowany członek zespołu: { client_id | m2_client_id, order_id?, kind, firm, title, to, subject, body, attachment: { base64 }, doc_html }
//             umowa księgowa i ZUS PEL (klient RKDP), zlecenie / umowa doradcza (klient M2 TAX lub RKDP);
//             zapis PDF (archiwum klienta RKDP albo m2/<klient>/), prośba o podpis, e-mail (SMTP) z linkiem – bez załącznika
//  • info   – publiczne { token }: dane do strony podpisu, treść do podglądu, uwagi + link do pobrania PDF (ważny 1 h)
//  • note   – publiczne { token, text, author }: uwagi klienta do dokumentu → zapis + e-mail do zespołu
//  • upload – publiczne, multipart { token, file }: podpisany plik → archiwum klienta + e-mail do osoby, która wysłała prośbę
//  • cancel – zalogowany: { id } – anulowanie prośby (link przestaje działać)
//  • file   – zalogowany: { id, which: 'original' | 'signed' } – link do pobrania pliku (też dla klientów M2 bez archiwum)
//  • reply  – zalogowany: { id, text, verdicts: [{ id, verdict, points? }], to?, subject?, version?: { attachment: { base64 }, doc_html?, changes } }
//             odpowiedź biura na uwagi klienta (strona podpisu + e-mail) i opcjonalnie nowa wersja dokumentu pod tym samym linkiem;
//             RKDP – odpowiada tylko administrator, M2 TAX – administrator i Marcin
//  • respond – publiczne { token, author, points: [{ note, i, a: 'ok'|'uwaga', x }] }: odpowiedź klienta do każdego punktu stanowiska kancelarii
//             (wszystkie „ok” = akceptacja stanowiska); punkty uwag zapisane w sign_notes.points
//  • accept – publiczne { token, author }: klient akceptuje stanowisko kancelarii → e-mail do zespołu (przygotować umowę do podpisu)
//  • final  – zalogowany: { id, attachment: { base64, name, type } } – egzemplarz podpisany przez obie strony → archiwum + e-mail do klienta z linkiem do pobrania
//  • doc_mail – zalogowany: { client_id | m2_client_id, firm?, to, subject, body, attachment?: { name, base64 }, doc?: { kicker, title, button: { url, label } }, no_email? }
//             no_email: true – bez e-maila, zwraca sam link do pobrania (do skopiowania)
//             e-mail z aplikacji (ZAW-FA, UPL-1, PEL, UKO, instrukcje) – szablon rdp.app z logo kancelarii, odpowiedź wraca do osoby wysyłającej
//             PDF nie jest załącznikiem: zapis w <klient>/wysylka/ + link /pobierz/?t=… ważny 30 dni (tabela doc_links)
//  • file_link – publiczne { token, count? }: dane pliku i krótki link do pobrania (po 30 dniach – wygasł)
//  E-maile do klientów (umowy, odpowiedzi, egzemplarze, dokumenty) wychodzą jako „RKDP | Kancelaria” (kancelaria@rkdp.pl) / „rdp.app · M2 TAX” (appMail).
//  • offer_mail – zalogowany: { offer_id, to, subject, body } – e-mail do klienta z linkiem do oferty (podgląd bez logowania, #/wynik/<token>)
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.9.16';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const URL_ = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(URL_, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const BUCKET = 'klienci';
const MAX_FILE = 25 * 1048576;
const FINAL_TYPES: Record<string, string> = { pdf: 'application/pdf', xml: 'application/xml', xades: 'application/xml', p7s: 'application/pkcs7-signature', p7m: 'application/pkcs7-mime', zip: 'application/zip', asice: 'application/vnd.etsi.asic-e+zip', asics: 'application/vnd.etsi.asic-s+zip' };
const OK_EXT = /\.(pdf|xml|xades|sig|p7s|p7m|zip|asice|asics|jpe?g|png|heic|heif|webp)$/i;
const SMTP_USER = (Deno.env.get('SMTP_USER') || '').trim(), SMTP_PASS = (Deno.env.get('SMTP_PASS') || '').replace(/\s+/g, '');
let smtp: any = null;
const transport = () => smtp || (smtp = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: SMTP_USER, pass: SMTP_PASS } }));
const emailOk = (e: string) => /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/.test(e);
const validToken = (t: unknown) => typeof t === 'string' && /^[0-9a-f]{48}$/.test(t);
const safeName = (n: string) => (n || 'plik').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').replace(/[^\w.\-]+/g, '_').slice(-90);
const escH = (t: string) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const FROM_NAME: Record<string, string> = { rkdp: 'RKDP | Kancelaria', m2: 'M2 TAX Doradcy Podatkowi' };
const KIND_CAT: Record<string, string> = { pel: 'pelnomocnictwo' };
const clientName = (r: any) => r.clients?.name || r.m2_clients?.name || '';
const M2_REPLY = ['c66817f8-61a2-4605-a503-07cbcf9d47d5'];   // Marcin – odpowiada na uwagi klientów M2 TAX (obok administratora)
const VERDICT: Record<string, string> = { przyjete: 'przyjęte', czesciowo: 'częściowo przyjęte', odrzucone: 'nieprzyjęte' };
// punkt uwagi: n – etykieta, t – treść, v/c – ocena i komentarz kancelarii, a/x – odpowiedź klienta, pv/pc – wcześniejsza ocena/komentarz
const cut = (t: unknown, n: number) => String(t ?? '').replace(/\r/g, '').trim().slice(0, n);
function cleanPoints(list: unknown) {
  if (!Array.isArray(list)) return null;
  const out = list.slice(0, 40).map((p: any) => {
    const o: Record<string, string> = {};
    if (!p || typeof p !== 'object') return null;
    o.n = cut(p.n, 80); o.t = cut(p.t, 6000);
    if (VERDICT[p.v]) o.v = p.v;
    if (cut(p.c, 3000)) o.c = cut(p.c, 3000);
    if (p.a === 'ok' || p.a === 'uwaga') o.a = p.a;
    if (cut(p.x, 3000)) o.x = cut(p.x, 3000);
    if (VERDICT[p.pv]) o.pv = p.pv;
    if (cut(p.pc, 3000)) o.pc = cut(p.pc, 3000);
    return o;
  }).filter(Boolean);
  return out.length ? out : null;
}
const m2Sig = (me: any) => ({ sigHtml: '', text: ['', 'Pozdrawiam serdecznie,', me?.full_name || '', 'M2 TAX Doradcy Podatkowi Otręba Ruszniak spółka partnerska', 'ul. Zwycięska 3, 53-033 Wrocław', 'kancelaria@m2tax.pl · tel. 883 643 565 · www.m2tax.pl'].filter(Boolean).join('\n') });

// ---------- e-mail z aplikacji: logo kancelarii, treść, przycisk, stopka rdp.app (bez osobistej stopki) ----------
const APP_FROM: Record<string, string> = { rkdp: 'RKDP | Kancelaria', m2: 'rdp.app · M2 TAX' };
const FIRM_FOOT: Record<string, string> = {
  rkdp: 'RKDP spółka doradztwa podatkowego sp. z o.o. · ul. Czereśniowa 28d, 55-010 Ozorzyce · kancelaria: ul. Beaty Artemskiej 11/44, 52-234 Wrocław · tel. 883 643 565 · kancelaria@rkdp.pl · rkdp.pl',
  m2: 'M2 TAX Doradcy Podatkowi Otręba Ruszniak spółka partnerska · ul. Zwycięska 3, 53-033 Wrocław · tel. 883 643 565 · kancelaria@m2tax.pl · m2tax.pl',
};
const APP_LINE = 'Wiadomość wysłana z rdp.app (app.ruszniak.io) by @RKDP (rkdp.pl)';
type AppMail = { firm: string; kicker?: string; title: string; text: string; button?: { url: string; label: string } | null; attachment?: string | null; download?: { name: string; url: string; until: string } | null };
function appMail(app: string, m: AppMail) {
  const firm = m.firm === 'm2' ? 'm2' : 'rkdp';
  const F = 'font-family:Arial,Helvetica,sans-serif';
  const lnk = (t: string) => escH(t).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#7A5A37;word-break:break-all">$1</a>');
  const btnHtml = m.button ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px"><tr><td style="background:#2E2A25;border-radius:6px"><a href="${escH(m.button.url)}" style="display:inline-block;padding:14px 24px;${F};font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none">${escH(m.button.label)}</a></td></tr></table>` : '';
  // treść: akapity; linia z adresem przycisku (albo {button}) staje się przyciskiem
  let placed = false;
  const paras = m.text.replace(/\r/g, '').split(/\n{2,}/).map(par => {
    const lines = par.split('\n');
    const out: string[] = []; let buf: string[] = [];
    const flush = () => { if (buf.length) out.push(`<p style="margin:0 0 14px;${F};font-size:15px;line-height:1.6;color:#1D1A16">${buf.map(lnk).join('<br>')}</p>`); buf = []; };
    for (const l of lines) {
      if (m.button && !placed && (l.trim() === '{button}' || (m.button.url && l.includes(m.button.url)))) {
        const before = l.replace('{button}', '').split(m.button.url)[0].replace(/[:\s]+$/, '').trim();
        if (before) buf.push(before + ':');
        flush(); out.push(btnHtml); placed = true;
      } else buf.push(l);
    }
    flush(); return out.join('');
  }).join('');
  const logo = firm === 'm2'
    ? `<img src="${app}/m2tax-logo.png" width="200" alt="M2 TAX Doradcy Podatkowi" style="display:block;width:200px;max-width:60%;height:auto;border:0">`
    : `<img src="${app}/logo-rkdp.png" width="190" alt="RKDP spółka doradztwa podatkowego" style="display:block;width:190px;max-width:60%;height:auto;border:0">`;
  const att = m.attachment ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:4px 0 18px;border:1px solid #E6DFD4"><tr><td style="padding:12px 14px;${F};font-size:14px;color:#1D1A16"><span style="display:inline-block;border:1px solid #CDBFAA;color:#7A5A37;font-size:10px;font-weight:bold;padding:6px 5px;margin-right:10px;vertical-align:middle">PDF</span><b style="vertical-align:middle">${escH(m.attachment)}</b> <span style="color:#5F584E;font-size:12px;vertical-align:middle">· w załączniku</span></td></tr></table>` : '';
  // plik do pobrania linkiem (zamiast załącznika) – link ważny 30 dni
  const dl = m.download ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:4px 0 20px;border:1px solid #E6DFD4"><tr><td style="padding:14px 16px;${F};font-size:14px;color:#1D1A16"><span style="display:inline-block;border:1px solid #CDBFAA;color:#7A5A37;font-size:10px;font-weight:bold;padding:6px 5px;margin-right:10px;vertical-align:middle">PDF</span><b style="vertical-align:middle">${escH(m.download.name)}</b><br><span style="display:block;margin:6px 0 12px;color:#5F584E;font-size:12.5px">Plik do pobrania – link ważny do ${escH(m.download.until)}. Plik nie jest dołączony do wiadomości.</span><a href="${escH(m.download.url)}" style="display:inline-block;padding:11px 20px;background:#2E2A25;border-radius:6px;${F};font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none">Pobierz PDF</a></td></tr></table>` : '';
  const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escH(m.title)}</title></head>
<body style="margin:0;padding:0;background:#F4F1EC">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F1EC"><tr><td align="center" style="padding:20px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #E6DFD4">
<tr><td align="center" style="padding:28px 32px 22px;border-bottom:1px solid #E6DFD4">${logo}</td></tr>
<tr><td style="padding:30px 36px 14px">
${m.kicker ? `<p style="margin:0 0 10px;${F};font-size:12px;font-weight:bold;color:#7A5A37">${escH(m.kicker)}</p>` : ''}
<h1 style="margin:0 0 18px;font-family:Georgia,'Times New Roman',serif;font-weight:600;font-size:25px;line-height:1.25;color:#1D1A16">${escH(m.title)}</h1>
${att}${dl}${paras}${m.button && !placed ? btnHtml : ''}
<p style="margin:6px 0 0;${F};font-size:15px;line-height:1.6;color:#1D1A16">Pozdrawiamy,<br><b>Zespół ${firm === 'm2' ? 'M2 TAX' : 'RKDP'}</b></p>
</td></tr>
<tr><td style="padding:22px 36px 26px;background:#FAF8F4;border-top:1px solid #E6DFD4">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td valign="middle" style="padding-right:12px"><div style="width:34px;height:34px;line-height:34px;border-radius:8px;background:#1F2229;color:#ffffff;text-align:center;${F};font-size:13px;font-weight:bold">rdp.</div></td>
<td valign="middle" style="${F};font-size:13px;line-height:1.5;color:#3B362F">Wiadomość wysłana z <a href="https://app.ruszniak.io" style="color:#3B362F;font-weight:bold;text-decoration:none">rdp.app</a> by <a href="https://rkdp.pl" style="color:#7A5A37;font-weight:bold;text-decoration:none">@RKDP</a></td>
</tr></table>
<p style="margin:12px 0 0;${F};font-size:11.5px;line-height:1.55;color:#6B645A">${escH(FIRM_FOOT[firm])}</p>
</td></tr>
</table></td></tr></table></body></html>`;
  const textOut = `${m.download ? `Pobierz ${m.download.name} (link ważny do ${m.download.until}): ${m.download.url}\n\n` : ''}${m.text.replace('{button}', m.button ? m.button.url : '')}${m.button && !m.text.includes(m.button.url) ? `\n\n${m.button.label}: ${m.button.url}` : ''}\n\nPozdrawiamy,\nZespół ${firm === 'm2' ? 'M2 TAX' : 'RKDP'}\n\n--\n${APP_LINE}\n${FIRM_FOOT[firm]}`;
  return { html, text: textOut, from: APP_FROM[firm] };
}
async function sendApp(S: { from: string; appFrom: string; app: string }, me: any, to: string, subject: string, m: AppMail, attachments: any[] = []) {
  const x = appMail(S.app, m);
  const addr = m.firm === 'm2' ? S.appFrom : S.from;
  await transport().sendMail({ from: { name: x.from, address: addr }, replyTo: me?.email && emailOk(me.email) ? { name: me.full_name || x.from, address: me.email } : addr, to, subject, text: x.text, html: x.html, ...(attachments.length ? { attachments } : {}) });
  return x.text;
}

async function settings() {
  const { data } = await admin.from('app_settings').select('key,value').in('key', ['mail_from', 'mail_sender', 'app_url', 'app_mail_from']);
  const m = Object.fromEntries((data || []).map((x: any) => [x.key, (x.value || '').trim()]));
  const from = m.mail_from || m.mail_sender || SMTP_USER;
  // kancelaria@rkdp.pl – klienci RKDP; app@ruszniak.io – klienci M2 TAX i powiadomienia dla zespołu
  return { from, appFrom: m.app_mail_from || from, app: (m.app_url || 'https://app.ruszniak.io').replace(/\/$/, '') };
}

// stopka osoby wysyłającej z rkdp.pl/stopki (jak w funkcji „mail”)
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').toLowerCase().replace(/\s+/g, ' ').trim();
const htmlToText = (h: string) => h.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(div|tr|p|li|h[1-6]|table)>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
async function signatureOf(me: any, from: string) {
  let sigHtml = '';
  try {
    const r = await fetch('https://rkdp.pl/stopki/', { headers: { 'User-Agent': 'rkdp-rozliczenia' } });
    const html = r.ok ? await r.text() : '';
    const map = new Map<string, string>();
    for (const m of html.matchAll(/<section class="person" id="p-([^"]+)">\s*<h2>([^<]+)<\/h2>([\s\S]*?)<\/section>/g)) {
      const full = m[3].match(/<div class="preview" id="sig-[^"]+-full">([\s\S]*?)<\/div>\s*<div class="actions">/);
      if (!full) continue;
      const sig = full[1].replace(/\sdata-abs="[^"]*"/g, '').trim();
      map.set(m[1] === 'kancelaria' ? '__kancelaria' : norm(m[2]), sig);
      for (const e of sig.matchAll(/mailto:([^@"]+)@/g)) if (e[1] !== 'kancelaria' && !map.has('@' + e[1].toLowerCase())) map.set('@' + e[1].toLowerCase(), sig);
    }
    sigHtml = map.get(norm(me?.full_name || '')) || map.get('@' + String(me?.email || '').split('@')[0].toLowerCase()) || map.get('__kancelaria') || '';
  } catch (e) { console.error('stopki', e); }
  const text = sigHtml ? '\n' + htmlToText(sigHtml) : ['', 'Pozdrawiam serdecznie,', me?.full_name || '', 'RKDP spółka doradztwa podatkowego sp. z o.o.', from].filter(Boolean).join('\n');
  return { sigHtml, text };
}
const bodyHtml = (t: string) => `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#1D1A16;">${escH(t).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#2563EB;">$1</a>').replace(/\n/g, '<br>')}</div>`;

async function byToken(token: string) {
  const { data } = await admin.from('sign_requests').select('*, clients(name, accountant_id), m2_clients(name)').eq('token', token).maybeSingle();
  if (!data) return { error: 'Link jest nieprawidłowy.' };
  if (data.status === 'anulowano') return { error: 'Ta prośba o podpis została anulowana. W razie pytań skontaktuj się z kancelarią.' };
  if (data.status !== 'podpisano' && new Date(data.expires_at) < new Date()) return { error: 'Link wygasł. Poproś kancelarię o nowy.' };
  return { r: data };
}

// e-mail do osoby, która wysłała prośbę, i księgowej klienta
async function notifyTeam(r: any, subject: string, head: string, text: string, inner: string, foot: string) {
  try {
    const S = await settings();
    const ids = [...new Set([r.created_by, r.clients?.accountant_id].filter(Boolean))];
    const { data: ms } = ids.length ? await admin.from('team_members').select('email, full_name').in('id', ids) : { data: [] };
    const to = (ms || []).map((m: any) => m.email).filter((e: string) => emailOk(String(e || '')));
    if (!to.length || !SMTP_USER || !SMTP_PASS) return;
    const link = r.order_id ? `${S.app}/#/doradztwo/zlecenie/${r.order_id}` : r.client_id ? `${S.app}/#/klient/${r.client_id}` : `${S.app}/#/doradztwo/klient/${r.m2_client_id}`;
    await transport().sendMail({ from: { name: 'rdp.app – podpisy', address: S.appFrom }, to, subject: subject.slice(0, 200), text,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#111827;max-width:560px"><p style="margin:0 0 6px;color:#2563EB;font-weight:700;letter-spacing:.06em;text-transform:uppercase;font-size:12px">Podpis · <a href="https://app.ruszniak.io" style="color:#2563EB;font-weight:bold;text-decoration:none">rdp.app</a></p><h2 style="margin:0 0 12px;font-size:19px">${escH(head)}</h2>${inner}<p style="margin:18px 0"><a href="${link}" style="background:#2563EB;color:#fff;text-decoration:none;padding:11px 20px;border-radius:10px;font-weight:700">${r.order_id ? 'Otwórz dokument w aplikacji' : 'Otwórz kartę klienta'}</a></p><p style="color:#6B7280;font-size:12px">${escH(foot)}</p></div>` });
  } catch (e) { console.error('mail zespół', e); }
}

async function origFile(r: any): Promise<{ path: string; name: string } | null> {
  if (r.file_id) { const { data: f } = await admin.from('client_files').select('path, name').eq('id', r.file_id).maybeSingle(); if (f) return f; }
  if (r.file_path) return { path: r.file_path, name: `${r.title}.pdf` };
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Metoda niedozwolona' }, 405);
  try {
    const ct = req.headers.get('content-type') || '';
    // ===== klient wgrywa podpisany plik =====
    if (ct.startsWith('multipart/form-data')) {
      const form = await req.formData();
      const token = String(form.get('token') || '');
      if (!validToken(token)) return json({ error: 'Link jest nieprawidłowy.' }, 400);
      const { r, error } = await byToken(token);
      if (error) return json({ error }, 410);
      const f = form.get('file');
      if (!(f instanceof File)) return json({ error: 'Nie wybrano pliku.' }, 400);
      if (f.size > MAX_FILE) return json({ error: 'Plik jest większy niż 25 MB.' }, 400);
      if (!OK_EXT.test(f.name)) return json({ error: 'Wgraj podpisany plik: PDF, plik podpisu (.xml, .xades, .p7s, .asice, .zip) albo zdjęcie / skan.' }, 400);
      const ext = (f.name.match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase();
      const name = `${r.title} – podpisana przez klienta${ext}`.slice(0, 200);
      const path = `${r.client_id || 'm2/' + r.m2_client_id}/podpis-${crypto.randomUUID().slice(0, 8)}-${safeName(f.name)}`;
      const { error: e1 } = await admin.storage.from(BUCKET).upload(path, f, { contentType: f.type || 'application/octet-stream', upsert: false });
      if (e1) return json({ error: 'Nie udało się zapisać pliku – spróbuj ponownie.' }, 500);
      let signedFileId = null;
      if (r.client_id) {
        const { data: cf, error: e2 } = await admin.from('client_files').insert({ client_id: r.client_id, category: KIND_CAT[r.kind] || 'umowa', name, note: `Podpisany plik wgrany przez klienta (${f.name.slice(0, 120)})`, path, mime: f.type || null, size: f.size, uploaded_by: null }).select('id').single();
        if (e2) { await admin.storage.from(BUCKET).remove([path]); return json({ error: 'Nie udało się zapisać pliku – spróbuj ponownie.' }, 500); }
        signedFileId = cf.id;
      }
      await admin.from('sign_requests').update({ status: 'podpisano', signed_at: new Date().toISOString(), signed_file_id: signedFileId, signed_path: path, signed_name: name }).eq('id', r.id);
      if (r.order_id) await admin.from('m2_orders').update({ status: 'podpisane' }).eq('id', r.order_id).neq('status', 'podpisane');
      const where = r.client_id ? 'Plik jest w „Archiwum dokumentów” klienta.' : 'Plik pobierzesz z dokumentu w aplikacji (sekcja „Do podpisu”).';
      await notifyTeam(r, `Klient podpisał: ${r.title} – ${clientName(r)}`, 'Klient podpisał dokument',
        `Klient ${clientName(r)} wgrał podpisany dokument „${r.title}” (${f.name}).\n\n${where}\n\nSprawdź podpis przed dalszymi krokami (np. w weryfikatorze na gov.pl).`,
        `<p><b>${escH(clientName(r))}</b> wgrał(a) podpisany dokument „${escH(r.title)}” (${escH(f.name)}).</p>`,
        `${where} Sprawdź podpis przed dalszymi krokami (np. w weryfikatorze podpisu na gov.pl).`);
      return json({ ok: true });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');

    // ===== strona podpisu =====
    if (action === 'info') {
      if (!validToken(body.token)) return json({ error: 'Link jest nieprawidłowy.' }, 400);
      const { r, error } = await byToken(body.token);
      if (error) return json({ error }, 410);
      if (!r.opened_at) await admin.from('sign_requests').update({ opened_at: new Date().toISOString() }).eq('id', r.id);
      let url = '', fileName = '';
      const orig = await origFile(r);
      if (orig) {
        fileName = orig.name;
        const { data: su } = await admin.storage.from(BUCKET).createSignedUrl(orig.path, 3600, { download: orig.name.endsWith('.pdf') ? orig.name : orig.name + '.pdf' });
        url = su?.signedUrl || '';
      }
      const { data: notes } = await admin.from('sign_notes').select('id, body, author, from_client, created_at, version, verdict, kind, points').eq('request_id', r.id).order('created_at');
      let final = null;
      if (r.final_path) { const { data: fu } = await admin.storage.from(BUCKET).createSignedUrl(r.final_path, 3600, { download: r.final_name || `${r.title} – egzemplarz.pdf` }); final = { name: r.final_name || '', url: fu?.signedUrl || '', at: r.final_at }; }
      let prev = '';
      if ((r.version || 1) > 1) { const { data: pv } = await admin.from('sign_versions').select('doc_html').eq('request_id', r.id).eq('version', r.version - 1).maybeSingle(); prev = pv?.doc_html || ''; }
      return json({ title: r.title, client: clientName(r), firm: r.firm, kind: r.kind, status: r.status, signed_at: r.signed_at, expires_at: r.expires_at, file: { name: fileName, url },
        html: r.doc_html || '', prev_html: prev, version: r.version || 1, changes: r.changes || '', notes: notes || [], accepted_at: r.accepted_at, final });
    }

    // ===== plik wysłany klientowi linkiem (zamiast załącznika) – ważny 30 dni =====
    if (action === 'file_link') {
      if (!validToken(body.token)) return json({ error: 'Link jest nieprawidłowy.' }, 400);
      const { data: l } = await admin.from('doc_links').select('id, path, name, title, firm, expires_at, downloads').eq('token', body.token).maybeSingle();
      if (!l) return json({ error: 'Link jest nieprawidłowy.' }, 404);
      if (new Date(l.expires_at) < new Date()) return json({ error: 'expired', title: l.title, name: l.name, firm: l.firm, expires_at: l.expires_at }, 410);
      const { data: su } = await admin.storage.from(BUCKET).createSignedUrl(l.path, 300, { download: l.name });
      if (!su?.signedUrl) return json({ error: 'Plik jest chwilowo niedostępny – spróbuj za chwilę.' }, 500);
      if (body.count === true) await admin.from('doc_links').update({ downloads: (l.downloads || 0) + 1, last_download_at: new Date().toISOString() }).eq('id', l.id);
      return json({ title: l.title, name: l.name, firm: l.firm, expires_at: l.expires_at, url: su.signedUrl });
    }

    // ===== uwagi klienta do dokumentu =====
    if (action === 'note') {
      if (!validToken(body.token)) return json({ error: 'Link jest nieprawidłowy.' }, 400);
      const { r, error } = await byToken(body.token);
      if (error) return json({ error }, 410);
      const text = String(body.text || '').replace(/\r/g, '').trim().slice(0, 4000);
      const author = String(body.author || '').replace(/\s+/g, ' ').trim().slice(0, 120) || null;
      if (text.length < 2) return json({ error: 'Wpisz treść uwag.' }, 400);
      const { count } = await admin.from('sign_notes').select('id', { count: 'exact', head: true }).eq('request_id', r.id).eq('from_client', true);
      if ((count || 0) >= 30) return json({ error: 'Osiągnięto limit uwag – skontaktuj się z kancelarią telefonicznie lub e-mailem.' }, 429);
      const { error: e1 } = await admin.from('sign_notes').insert({ request_id: r.id, body: text, author, version: r.version || 1 });
      if (e1) return json({ error: 'Nie udało się zapisać uwag – spróbuj ponownie.' }, 500);
      const who = author ? `${author} (${clientName(r) || 'klient'})` : (clientName(r) || 'Klient');
      await notifyTeam(r, `Uwagi do dokumentu: ${r.title} – ${clientName(r)}`, 'Klient zgłosił uwagi do dokumentu',
        `${who} zgłosił(a) uwagi do dokumentu „${r.title}”:\n\n${text}\n\nOdpowiedz w aplikacji: sekcja „Do podpisu” → „Odpowiedz” (możesz od razu dołączyć nową wersję umowy).`,
        `<p><b>${escH(who)}</b> zgłosił(a) uwagi do dokumentu „${escH(r.title)}”:</p><blockquote style="margin:12px 0;padding:10px 14px;background:#F3F4F6;border-left:3px solid #2563EB;border-radius:6px;white-space:pre-wrap">${escH(text)}</blockquote>`,
        `Odpowiedz w aplikacji: sekcja „Do podpisu” → „Odpowiedz”. Klient zobaczy odpowiedź na stronie umowy i dostanie e-mail; możesz od razu dołączyć nową wersję umowy pod tym samym linkiem.`);
      return json({ ok: true });
    }

    // ===== klient odpowiada na stanowisko kancelarii punkt po punkcie =====
    if (action === 'respond') {
      if (!validToken(body.token)) return json({ error: 'Link jest nieprawidłowy.' }, 400);
      const { r, error } = await byToken(body.token);
      if (error) return json({ error }, 410);
      if (r.status !== 'wyslano') return json({ error: 'Dokument jest już podpisany.' }, 400);
      const author = String(body.author || '').replace(/\s+/g, ' ').trim().slice(0, 120) || null;
      const asked = (Array.isArray(body.points) ? body.points : []).slice(0, 60);
      const ids = [...new Set(asked.map((p: any) => String(p?.note || '')))].filter(Boolean);
      const { data: src } = ids.length ? await admin.from('sign_notes').select('id, points').eq('request_id', r.id).eq('from_client', true).in('id', ids) : { data: [] };
      const pts: any[] = [];
      for (const p of asked) {
        const sp = (src || []).find((x: any) => x.id === p?.note)?.points?.[Number(p?.i)];
        if (!sp || (p.a !== 'ok' && p.a !== 'uwaga')) continue;
        const x = cut(p.x, 3000);
        if (p.a === 'uwaga' && x.length < 2) return json({ error: `Wpisz uwagę do: ${sp.n || 'punktu'}.` }, 400);
        pts.push({ n: sp.n || '', t: cut(sp.t, 1500), pv: sp.v, pc: sp.c, a: p.a, ...(p.a === 'uwaga' ? { x } : {}) });
      }
      if (!pts.length) return json({ error: 'Zaznacz odpowiedź przy punktach.' }, 400);
      const points = cleanPoints(pts);
      const allOk = pts.every(p => p.a === 'ok');
      const text = allOk ? 'Akceptuję stanowisko kancelarii. Proszę o przygotowanie umowy do podpisu.'
        : pts.map(p => `${p.n || 'Uwaga'}: ${p.a === 'ok' ? 'akceptuję stanowisko kancelarii.' : p.x}`).join('\n\n');
      const { error: e1 } = await admin.from('sign_notes').insert({ request_id: r.id, body: text.slice(0, 8000), author, version: r.version || 1, kind: allOk ? 'akceptacja' : 'uwaga', points });
      if (e1) { console.error(e1); return json({ error: 'Nie udało się zapisać odpowiedzi – spróbuj ponownie.' }, 500); }
      const who = author ? `${author} (${clientName(r) || 'klient'})` : (clientName(r) || 'Klient');
      if (allOk) {
        await admin.from('sign_requests').update({ accepted_at: new Date().toISOString() }).eq('id', r.id);
        await notifyTeam(r, `Klient zaakceptował – przygotuj umowę do podpisu: ${r.title} – ${clientName(r)}`, 'Klient zaakceptował stanowisko – przygotuj umowę do podpisu',
          `${who} zaakceptował(a) stanowisko kancelarii do każdego punktu dokumentu „${r.title}”.\n\nPrzygotuj umowę do podpisu: w aplikacji sekcja „Do podpisu” → „Wyślij do podpisu”.`,
          `<p><b>${escH(who)}</b> zaakceptował(a) stanowisko kancelarii do każdego punktu dokumentu „${escH(r.title)}”.</p>`,
          'Przygotuj umowę do podpisu: sekcja „Do podpisu” → „Wyślij do podpisu” (nowa wersja z uzgodnionymi zmianami albo bez zmian).');
      } else {
        const n = pts.filter(p => p.a === 'uwaga').length;
        await notifyTeam(r, `Kolejne uwagi do dokumentu: ${r.title} – ${clientName(r)}`, `Klient odpowiedział – uwagi do ${n} ${n === 1 ? 'punktu' : 'punktów'}`,
          `${who} odpowiedział(a) na stanowisko kancelarii do dokumentu „${r.title}”:\n\n${text}\n\nOdpowiedz w aplikacji: sekcja „Do podpisu” → „Odpowiedz”.`,
          `<p><b>${escH(who)}</b> odpowiedział(a) na stanowisko kancelarii do dokumentu „${escH(r.title)}”:</p><blockquote style="margin:12px 0;padding:10px 14px;background:#F3F4F6;border-left:3px solid #2563EB;border-radius:6px;white-space:pre-wrap">${escH(text)}</blockquote>`,
          'Odpowiedz w aplikacji: sekcja „Do podpisu” → „Odpowiedz”. Każdy punkt ocenisz osobno.');
      }
      return json({ ok: true, accepted: allOk, note: { body: text, author, created_at: new Date().toISOString(), version: r.version || 1, from_client: true, kind: allOk ? 'akceptacja' : 'uwaga', points } });
    }

    // ===== klient akceptuje stanowisko kancelarii =====
    if (action === 'accept') {
      if (!validToken(body.token)) return json({ error: 'Link jest nieprawidłowy.' }, 400);
      const { r, error } = await byToken(body.token);
      if (error) return json({ error }, 410);
      if (r.status !== 'wyslano') return json({ error: 'Dokument jest już podpisany.' }, 400);
      const author = String(body.author || '').replace(/\s+/g, ' ').trim().slice(0, 120) || null;
      const text = 'Akceptuję stanowisko kancelarii. Proszę o przygotowanie umowy do podpisu.';
      await admin.from('sign_notes').insert({ request_id: r.id, body: text, author, version: r.version || 1, kind: 'akceptacja' });
      await admin.from('sign_requests').update({ accepted_at: new Date().toISOString() }).eq('id', r.id);
      const who = author ? `${author} (${clientName(r) || 'klient'})` : (clientName(r) || 'Klient');
      await notifyTeam(r, `Klient zaakceptował – przygotuj umowę do podpisu: ${r.title} – ${clientName(r)}`, 'Klient zaakceptował stanowisko – przygotuj umowę do podpisu',
        `${who} zaakceptował(a) stanowisko kancelarii do dokumentu „${r.title}”.\n\nPrzygotuj umowę do podpisu: w aplikacji sekcja „Do podpisu” → „Wyślij do podpisu” (nowa wersja albo bez zmian). Klient dostanie e-mail, że umowa czeka na podpis.`,
        `<p><b>${escH(who)}</b> zaakceptował(a) stanowisko kancelarii do dokumentu „${escH(r.title)}”.</p>`,
        'Przygotuj umowę do podpisu: sekcja „Do podpisu” → „Wyślij do podpisu” (nowa wersja z uzgodnionymi zmianami albo bez zmian). Klient dostanie e-mail, że umowa czeka na podpis.');
      return json({ ok: true });
    }

    // ===== zespół (zalogowany) =====
    const auth = req.headers.get('Authorization') || '';
    if (!auth.startsWith('Bearer ')) return json({ error: 'Brak dostępu' }, 401);
    const sb = createClient(URL_, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const { data: memberId } = await sb.rpc('current_member_id');
    if (!memberId) return json({ error: 'Brak dostępu' }, 403);

    if (action === 'cancel') {
      const { data: r } = await sb.from('sign_requests').select('id').eq('id', String(body.id || '')).maybeSingle();   // RLS
      if (!r) return json({ error: 'Brak dostępu' }, 403);
      await admin.from('sign_requests').update({ status: 'anulowano' }).eq('id', r.id);
      return json({ ok: true });
    }

    if (action === 'file') {
      const { data: r } = await sb.from('sign_requests').select('id, title, file_id, file_path, signed_file_id, signed_path, signed_name').eq('id', String(body.id || '')).maybeSingle();   // RLS
      if (!r) return json({ error: 'Brak dostępu' }, 403);
      let f: { path: string; name: string } | null = null;
      if (body.which === 'final') {
        const { data: x } = await admin.from('sign_requests').select('final_path, final_name').eq('id', r.id).single();
        if (x?.final_path) f = { path: x.final_path, name: x.final_name || `${r.title} – egzemplarz` };
      } else if (body.which === 'signed') {
        if (r.signed_file_id) { const { data } = await admin.from('client_files').select('path, name').eq('id', r.signed_file_id).maybeSingle(); f = data; }
        if (!f && r.signed_path) f = { path: r.signed_path, name: r.signed_name || `${r.title} – podpisana` };
      } else f = await origFile(r);
      if (!f) return json({ error: 'Brak pliku' }, 404);
      const { data: su } = await admin.storage.from(BUCKET).createSignedUrl(f.path, 600, { download: f.name });
      return json({ url: su?.signedUrl || '' });
    }

    if (action === 'reply') {
      const { data: r } = await sb.from('sign_requests').select('id, client_id, m2_client_id, order_id, firm, kind, title, email, status, version, doc_html, file_id, file_path, changes, created_by, expires_at, token').eq('id', String(body.id || '')).maybeSingle();   // RLS
      if (!r) return json({ error: 'Brak dostępu' }, 403);
      const { data: me } = await admin.from('team_members').select('id, full_name, email, role').eq('id', memberId).single();
      const allowed = me?.role === 'admin' || (r.firm === 'm2' && M2_REPLY.includes(memberId));
      if (!allowed) return json({ error: r.firm === 'm2' ? 'Na uwagi klientów M2 TAX odpowiadają Michał i Marcin.' : 'Na uwagi klientów RKDP odpowiada Michał.' }, 403);
      if (r.status !== 'wyslano') return json({ error: r.status === 'podpisano' ? 'Dokument jest już podpisany.' : 'Prośba o podpis została anulowana.' }, 400);
      const final = body.final === true;   // „umowa czeka na podpis” – po akceptacji klienta
      let text = String(body.text || '').replace(/\r/g, '').trim().slice(0, 6000);
      if (!final && text.length < 2) return json({ error: 'Wpisz odpowiedź dla klienta.' }, 400);
      const to = String(body.to || r.email || '').trim().toLowerCase();
      const noMail = body.no_email === true || !to;
      if (!noMail && !emailOk(to)) return json({ error: 'Nieprawidłowy adres e-mail klienta' }, 400);
      if (!noMail && (!SMTP_USER || !SMTP_PASS)) return json({ error: 'not_configured', detail: 'Brak konfiguracji wysyłki e-mail (SMTP).' }, 200);
      const verdicts = (Array.isArray(body.verdicts) ? body.verdicts : []).filter((v: any) => v && typeof v.id === 'string' && VERDICT[v.verdict]).slice(0, 40);
      // nowa wersja dokumentu
      let ver = r.version || 1, newVer = false;
      const v = body.version;
      if (v && typeof v === 'object') {
        const b64 = String(v.attachment?.base64 || '').replace(/\s+/g, '');
        if (!b64 || b64.length > 14_000_000 || !/^[A-Za-z0-9+/=]+$/.test(b64)) return json({ error: 'Brak albo zbyt duży plik PDF nowej wersji' }, 400);
        const changes = String(v.changes || '').replace(/\r/g, '').trim().slice(0, 2000) || null;
        const docHtml = typeof v.doc_html === 'string' && v.doc_html.length <= 1_500_000 ? v.doc_html : null;
        const bytes = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
        const nv = ver + 1;
        const fname = `${r.title} – wersja ${nv}.pdf`.replace(/[\\/:*?"<>|\r\n]+/g, ' ');
        const path = `${r.client_id || 'm2/' + r.m2_client_id}/do-podpisu-v${nv}-${crypto.randomUUID().slice(0, 8)}-${safeName(fname)}`;
        const { error: e1 } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: 'application/pdf', upsert: false });
        if (e1) return json({ error: 'Nie udało się zapisać nowej wersji' }, 500);
        let fileId = null;
        if (r.client_id) {
          const { data: cf, error: e2 } = await admin.from('client_files').insert({ client_id: r.client_id, category: KIND_CAT[r.kind] || 'umowa', name: `${r.title} – wersja ${nv} wysłana do podpisu.pdf`.slice(0, 200), note: (changes ? `Zmiany: ${changes}` : 'Nowa wersja po uwagach klienta').slice(0, 500), path, mime: 'application/pdf', size: bytes.length, uploaded_by: memberId }).select('id').single();
          if (e2) { await admin.storage.from(BUCKET).remove([path]); return json({ error: 'Nie udało się zapisać nowej wersji' }, 500); }
          fileId = cf.id;
        }
        const { error: e3 } = await admin.from('sign_versions').insert({ request_id: r.id, version: ver, doc_html: r.doc_html, file_id: r.file_id, file_path: r.file_path, changes: r.changes, created_by: ver === 1 ? r.created_by : null });
        if (e3) { console.error(e3); return json({ error: 'Nie udało się zapisać poprzedniej wersji' }, 500); }
        const exp = new Date(Math.max(new Date(r.expires_at).getTime(), Date.now() + 14 * 86400000)).toISOString();
        await admin.from('sign_requests').update({ version: nv, doc_html: docHtml, file_id: fileId, file_path: fileId ? null : path, changes, expires_at: exp, accepted_at: null }).eq('id', r.id);
        ver = nv; newVer = true;
      }
      for (const x of verdicts) {
        const pts = cleanPoints(x.points);
        await admin.from('sign_notes').update({ verdict: x.verdict, ...(pts ? { points: pts } : {}) }).eq('id', x.id).eq('request_id', r.id).eq('from_client', true);
      }
      const firmName = r.firm === 'm2' ? 'M2 TAX' : 'RKDP';
      if (final && text.length < 2) text = newVer ? `Przesyłamy wersję ${ver} umowy uwzględniającą uzgodnienia – czeka na Państwa podpis.` : 'Umowa czeka na Państwa podpis.';
      if (final && !newVer) await admin.from('sign_requests').update({ accepted_at: null, expires_at: new Date(Math.max(new Date(r.expires_at).getTime(), Date.now() + 14 * 86400000)).toISOString() }).eq('id', r.id);
      await admin.from('sign_notes').insert({ request_id: r.id, body: text, author: `${me?.full_name || 'Biuro'}, ${firmName}`, from_client: false, author_member: memberId, version: ver, kind: final ? 'do_podpisu' : newVer ? 'wersja' : 'odpowiedz' });
      const S = await settings();
      const link = `${S.app}/podpis/?t=${r.token}`;
      if (noMail) return json({ ok: true, link, version: ver });
      const subject = (String(body.subject || '').trim() || (final ? `Umowa czeka na podpis – ${r.title}${newVer ? ` (wersja ${ver})` : ''}` : `Odnieśliśmy się do Państwa uwag – ${r.title}${newVer ? ` (wersja ${ver})` : ''}`)).slice(0, 200);
      // e-mail: krótka informacja + link; pełne stanowisko klient czyta na stronie dokumentu
      const mailText = final
        ? `Dzień dobry,\n\nzgodnie z uzgodnieniami ${newVer ? `wersja ${ver} dokumentu „${r.title}” (zmiany są zaznaczone w treści)` : `dokument „${r.title}”`} czeka na Państwa podpis. Pod linkiem poniżej można go przeczytać, pobrać i podpisać.`
        : `Dzień dobry,\n\nodnieśliśmy się do Państwa uwag do dokumentu „${r.title}”.${newVer ? ` Przygotowaliśmy też wersję ${ver} dokumentu – zmiany są zaznaczone w treści.` : ''}\n\nSzczegóły – nasze stanowisko do każdej uwagi – znajdą Państwo pod linkiem poniżej. Tam można też odpowiedzieć${newVer ? ' i podpisać nową wersję' : ' i podpisać dokument'}.`;
      let textBody = '';
      try {
        textBody = await sendApp(S, me, to, subject, { firm: r.firm, kicker: final ? 'Dokument do podpisu' : 'Odpowiedź na uwagi', title: newVer ? `${r.title} – wersja ${ver}` : r.title, text: mailText,
          button: { url: link, label: final ? 'Przeczytaj i podpisz' : newVer ? `Otwórz dokument – wersja ${ver}` : 'Otwórz dokument' } });
      } catch (e) {
        return json({ ok: true, link, version: ver, mail_error: String((e as Error).message || e).slice(0, 300) });
      }
      let rk = r.client_id;
      if (!rk && r.m2_client_id) { const { data: m } = await admin.from('m2_clients').select('rkdp_client_id').eq('id', r.m2_client_id).maybeSingle(); rk = m?.rkdp_client_id || null; }
      if (rk) await admin.from('client_messages').insert({ client_id: rk, kind: 'informacja', period: null, email: to, subject, body: `${textBody}\n\n[odpowiedź na stronie dokumentu]\n${text}`, sender_name: me?.full_name || null, status: 'wyslano', sent_by: memberId });
      return json({ ok: true, link, version: ver });
    }

    if (action === 'final') {
      const { data: r } = await sb.from('sign_requests').select('id, client_id, m2_client_id, firm, title, email, status, token').eq('id', String(body.id || '')).maybeSingle();   // RLS
      if (!r) return json({ error: 'Brak dostępu' }, 403);
      if (r.status !== 'podpisano') return json({ error: 'Egzemplarz wgrywasz po podpisaniu dokumentu przez klienta.' }, 400);
      const b64 = String(body.attachment?.base64 || '').replace(/\s+/g, '');
      if (!b64 || b64.length > 14_000_000 || !/^[A-Za-z0-9+/=]+$/.test(b64)) return json({ error: 'Brak albo zbyt duży plik (maks. 10 MB)' }, 400);
      const orig = String(body.attachment?.name || 'umowa.pdf').slice(0, 160);
      const ext = (orig.match(/\.([a-z0-9]+)$/i) || ['', 'pdf'])[1].toLowerCase();
      if (!FINAL_TYPES[ext]) return json({ error: 'Wgraj PDF albo plik podpisu (.xml, .xades, .p7s, .asice, .zip).' }, 400);
      const bytes = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
      const name = `${r.title} – podpisana przez obie strony.${ext}`.replace(/[\\/:*?"<>|\r\n]+/g, ' ').slice(0, 200);
      const path = `${r.client_id || 'm2/' + r.m2_client_id}/egzemplarz-${crypto.randomUUID().slice(0, 8)}-${safeName(name)}`;
      const { error: e1 } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: FINAL_TYPES[ext], upsert: false });
      if (e1) return json({ error: 'Nie udało się zapisać pliku' }, 500);
      let fileId = null;
      if (r.client_id) {
        const { data: cf } = await admin.from('client_files').insert({ client_id: r.client_id, category: 'umowa', name, note: `Egzemplarz podpisany przez obie strony (${orig})`.slice(0, 500), path, mime: FINAL_TYPES[ext], size: bytes.length, uploaded_by: memberId }).select('id').single();
        fileId = cf?.id || null;
      }
      await admin.from('sign_requests').update({ final_path: path, final_name: name, final_file_id: fileId, final_at: new Date().toISOString() }).eq('id', r.id);
      const S = await settings();
      const link = `${S.app}/podpis/?t=${r.token}`;
      const to = String(body.to || r.email || '').trim().toLowerCase();
      if (body.no_email === true || !emailOk(to) || !SMTP_USER || !SMTP_PASS) return json({ ok: true, link, mailed: false });
      const { data: me } = await admin.from('team_members').select('full_name, email').eq('id', memberId).single();
      const subject = `Umowa podpisana – Państwa egzemplarz – ${r.title}`.slice(0, 200);
      const mailText = `Dzień dobry,\n\ndokument „${r.title}” został podpisany przez obie strony. Państwa egzemplarz można pobrać pod linkiem poniżej.\n\n{button}\n\nDziękujemy za współpracę.`;
      let textBody = '';
      try {
        textBody = await sendApp(S, me, to, subject, { firm: r.firm, kicker: 'Umowa podpisana', title: r.title, text: mailText, button: { url: link, label: 'Pobierz swój egzemplarz' } });
      } catch (e) {
        return json({ ok: true, link, mailed: false, mail_error: String((e as Error).message || e).slice(0, 300) });
      }
      let rk = r.client_id;
      if (!rk && r.m2_client_id) { const { data: m } = await admin.from('m2_clients').select('rkdp_client_id').eq('id', r.m2_client_id).maybeSingle(); rk = m?.rkdp_client_id || null; }
      if (rk) await admin.from('client_messages').insert({ client_id: rk, kind: 'informacja', period: null, email: to, subject, body: textBody, sender_name: me?.full_name || null, status: 'wyslano', sent_by: memberId });
      return json({ ok: true, link, mailed: true });
    }

    if (action === 'doc_mail') {
      // no_email: sam link do pobrania PDF (30 dni) – do skopiowania i wysłania klientowi samodzielnie
      const noMail = body.no_email === true;
      const to = String(body.to || '').trim().toLowerCase();
      if ((!noMail || to) && !emailOk(to)) return json({ error: 'Nieprawidłowy adres e-mail' }, 400);
      // klient RKDP (clients) albo klient modułu doradztwa (m2_clients: M2 TAX i umowy doradcze RKDP) – RLS
      const isM2 = !!body.m2_client_id && !body.client_id;
      const { data: c } = isM2 ? await sb.from('m2_clients').select('id, name, rkdp_client_id').eq('id', String(body.m2_client_id)).maybeSingle()
        : await sb.from('clients').select('id, name').eq('id', String(body.client_id || '')).maybeSingle();
      if (!c) return json({ error: 'Brak dostępu do klienta' }, 403);
      const firm = body.firm === 'm2' ? 'm2' : 'rkdp';
      const rkId: string | null = isM2 ? (c as any).rkdp_client_id || null : c.id;   // historia wiadomości – karta klienta RKDP
      const subject = String(body.subject || '').trim().slice(0, 200), text0 = String(body.body || '').replace(/\r/g, '').slice(0, 8000);
      if (!noMail && (!subject || !text0.trim())) return json({ error: 'Pusty temat lub treść' }, 400);
      if (!noMail && (!SMTP_USER || !SMTP_PASS)) return json({ error: 'not_configured', detail: 'Brak konfiguracji wysyłki e-mail (SMTP).' }, 200);
      const att = body.attachment || null;
      if (noMail && !att) return json({ error: 'Brak pliku' }, 400);
      const b64 = att ? String(att.base64 || '').replace(/\s+/g, '') : '';
      if (att && (!b64 || b64.length > 10_000_000 || !/^[A-Za-z0-9+/=]+$/.test(b64))) return json({ error: 'Brak albo zbyt duży załącznik' }, 400);
      const filename = att ? (String(att.name || 'dokument.pdf').replace(/[\\/:*?"<>|\r\n]+/g, ' ').trim().slice(0, 120) || 'dokument.pdf').replace(/(\.pdf)?$/i, '.pdf') : '';
      const d = body.doc || {};
      const bu = d.button && /^https:\/\/[^\s"<>]+$/.test(String(d.button.url || '')) ? { url: String(d.button.url).slice(0, 500), label: String(d.button.label || 'Otwórz').slice(0, 80) } : null;
      const { data: me } = await admin.from('team_members').select('full_name, email').eq('id', memberId).single();
      const S = await settings();
      // plik nie idzie jako załącznik – zapis w archiwum wysyłek i link do pobrania ważny 30 dni (strona /pobierz/)
      let download: { name: string; url: string; until: string } | null = null, linkId: string | null = null;
      if (att) {
        const bytes = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
        const path = `${isM2 ? 'm2/' : ''}${c.id}/wysylka/${crypto.randomUUID().slice(0, 8)}-${safeName(filename)}`;
        const { error: eu } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: 'application/pdf', upsert: false });
        if (eu) return json({ error: 'Nie udało się zapisać pliku do wysłania' }, 500);
        const token = [...crypto.getRandomValues(new Uint8Array(24))].map(b => b.toString(16).padStart(2, '0')).join('');
        const exp = new Date(Date.now() + 30 * 86400000);
        const { data: dlr, error: ed } = await admin.from('doc_links').insert({ token, client_id: isM2 ? null : c.id, m2_client_id: isM2 ? c.id : null, path, name: filename, title: String(d.title || subject || 'Dokument').slice(0, 140), firm, email: to || null, created_by: memberId, expires_at: exp.toISOString() }).select('id').single();
        if (ed) { console.error(ed); await admin.storage.from(BUCKET).remove([path]); return json({ error: 'Nie udało się przygotować linku do pobrania' }, 500); }
        linkId = dlr.id;
        download = { name: filename, url: `${S.app}/pobierz/?t=${token}`, until: exp.toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' }) };
      }
      if (noMail) return json({ ok: true, link: download!.url, until: download!.until });
      let textBody = text0;
      try {
        textBody = await sendApp(S, me, to, subject, { firm, kicker: String(d.kicker || '').slice(0, 60) || undefined, title: String(d.title || subject).slice(0, 140), text: text0, button: bu, download });
      } catch (e) {
        if (linkId) await admin.from('doc_links').update({ expires_at: new Date().toISOString() }).eq('id', linkId);
        const m = String((e as Error).message || e);
        if (rkId) await admin.from('client_messages').insert({ client_id: rkId, kind: 'informacja', period: null, email: to, subject, status: 'blad', error: m.slice(0, 300), sent_by: memberId });
        return json({ error: 'send_failed', detail: m.slice(0, 300) }, 200);
      }
      if (rkId) await admin.from('client_messages').insert({ client_id: rkId, kind: 'informacja', period: null, email: to, subject, body: textBody + (filename ? `\n\n[plik do pobrania przez 30 dni: ${filename}]` : ''), sender_name: me?.full_name || null, status: 'wyslano', sent_by: memberId });
      return json({ ok: true, sent: 1 });
    }

    if (action === 'offer_mail') {
      const { data: of } = await sb.from('offers').select('id, number, brand, client_id, m2_client_id, status, client_name').eq('id', String(body.offer_id || '')).maybeSingle();   // RLS
      if (!of) return json({ error: 'Brak dostępu do oferty' }, 403);
      const to = String(body.to || '').trim().toLowerCase();
      if (!emailOk(to)) return json({ error: 'Nieprawidłowy adres e-mail klienta' }, 400);
      const subject = String(body.subject || '').trim().slice(0, 200), text0 = String(body.body || '').slice(0, 8000);
      if (!subject || !text0.trim()) return json({ error: 'Pusty temat lub treść' }, 400);
      if (!SMTP_USER || !SMTP_PASS) return json({ error: 'not_configured', detail: 'Brak konfiguracji wysyłki e-mail (SMTP).' }, 200);
      const firm = of.brand === 'm2' ? 'm2' : 'rkdp';
      const { data: sd, error: e1 } = await sb.from('shared_docs').insert({ kind: 'oferta', brand: firm, title: `Oferta ${of.number || ''}`.trim(), ref_id: of.id, label: `E-mail do ${to}`.slice(0, 200) }).select('id, token').single();
      if (e1 || !sd) { console.error(e1); return json({ error: 'Nie udało się utworzyć linku do oferty' }, 500); }
      const S = await settings();
      const link = `${S.app}/#/wynik/${sd.token}`;
      const textBody = text0.includes('{link}') ? text0.replaceAll('{link}', link) : text0 + '\n\n' + link;
      const { data: me } = await admin.from('team_members').select('full_name, email').eq('id', memberId).single();
      const sig = firm === 'm2' ? m2Sig(me) : await signatureOf(me, S.from);
      const btn = `<p style="margin:20px 0"><a href="${link}" style="display:inline-block;background:#1C1F26;color:#ffffff;text-decoration:none;padding:13px 22px;border-radius:6px;font-weight:bold;font-family:Arial,Helvetica,sans-serif;font-size:15px">Zobacz ofertę</a></p>`;
      const html = bodyHtml(textBody) + btn + (sig.sigHtml ? '<br>' + sig.sigHtml : bodyHtml(sig.text));
      try {
        await transport().sendMail({ from: { name: FROM_NAME[firm], address: firm === 'm2' ? S.appFrom : S.from }, replyTo: me?.email && emailOk(me.email) ? me.email : S.from, to, subject, text: textBody + '\n' + sig.text, html });
      } catch (e) {
        await admin.from('shared_docs').update({ revoked_at: new Date().toISOString() }).eq('id', sd.id);
        return json({ error: 'send_failed', detail: String((e as Error).message || e).slice(0, 300) }, 200);
      }
      if (of.status === 'projekt') await admin.from('offers').update({ status: 'wyslana' }).eq('id', of.id);
      let rk = of.client_id;
      if (!rk && of.m2_client_id) { const { data: m } = await admin.from('m2_clients').select('rkdp_client_id').eq('id', of.m2_client_id).maybeSingle(); rk = m?.rkdp_client_id || null; }
      if (rk) await admin.from('client_messages').insert({ client_id: rk, kind: 'informacja', period: null, email: to, subject, body: textBody + `\n\n[link do oferty ${of.number || ''}]`, sender_name: me?.full_name || null, status: 'wyslano', sent_by: memberId });
      return json({ ok: true, link });
    }

    if (action === 'send') {
      // klient: RKDP (clients) albo M2 (m2_clients, ewentualnie powiązany z kartą RKDP); dostęp sprawdza RLS
      let c: any = null, m2c: any = null;
      if (body.client_id) { const { data } = await sb.from('clients').select('id, name').eq('id', String(body.client_id)).maybeSingle(); c = data; if (!c) return json({ error: 'Brak dostępu do klienta' }, 403); }
      if (body.m2_client_id) {
        const { data } = await sb.from('m2_clients').select('id, name, rkdp_client_id').eq('id', String(body.m2_client_id)).maybeSingle(); m2c = data;
        if (!m2c) return json({ error: 'Brak dostępu do klienta' }, 403);
        if (!c && m2c.rkdp_client_id) { const { data: rc } = await sb.from('clients').select('id, name').eq('id', m2c.rkdp_client_id).maybeSingle(); c = rc; }
      }
      if (!c && !m2c) return json({ error: 'Brak klienta' }, 400);
      let order: any = null;
      if (body.order_id) {
        const { data } = await sb.from('m2_orders').select('id, client_id, status').eq('id', String(body.order_id)).maybeSingle(); order = data;
        if (!order || (m2c && order.client_id !== m2c.id)) return json({ error: 'Brak dostępu do dokumentu' }, 403);
      }
      const firm = body.firm === 'm2' ? 'm2' : 'rkdp';
      const kind = ['umowa', 'zlecenie', 'umowa_doradcza', 'pel', 'inne'].includes(body.kind) ? body.kind : 'umowa';
      // no_email: tylko link do skopiowania (np. wysłany klientowi innym kanałem) – bez e-maila
      const noMail = body.no_email === true;
      const to = String(body.to || '').trim().toLowerCase();
      if (!noMail && !emailOk(to)) return json({ error: 'Nieprawidłowy adres e-mail klienta' }, 400);
      if (noMail && to && !emailOk(to)) return json({ error: 'Nieprawidłowy adres e-mail klienta' }, 400);
      const title = String(body.title || 'Umowa').trim().slice(0, 160) || 'Umowa';
      const subject = String(body.subject || '').trim().slice(0, 200), text0 = String(body.body || '').slice(0, 8000);
      if (!noMail && (!subject || !text0.trim())) return json({ error: 'Pusty temat lub treść' }, 400);
      const b64 = String(body.attachment?.base64 || '').replace(/\s+/g, '');
      if (!b64 || b64.length > 14_000_000 || !/^[A-Za-z0-9+/=]+$/.test(b64)) return json({ error: 'Brak albo zbyt duży plik PDF' }, 400);
      if (!noMail && (!SMTP_USER || !SMTP_PASS)) return json({ error: 'not_configured', detail: 'Brak konfiguracji wysyłki e-mail (SMTP).' }, 200);
      const bytes = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
      const docHtml = typeof body.doc_html === 'string' && body.doc_html.length <= 1_500_000 ? body.doc_html : null;
      const fname = `${title}.pdf`.replace(/[\\/:*?"<>|\r\n]+/g, ' ');
      const path = `${c ? c.id : 'm2/' + m2c.id}/do-podpisu-${crypto.randomUUID().slice(0, 8)}-${safeName(fname)}`;
      const { error: e1 } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: 'application/pdf', upsert: false });
      if (e1) return json({ error: 'Nie udało się zapisać dokumentu' }, 500);
      let fileId = null;
      if (c) {
        const { data: cf, error: e2 } = await admin.from('client_files').insert({ client_id: c.id, category: KIND_CAT[kind] || 'umowa', name: `${title} – wysłana do podpisu.pdf`.slice(0, 200), note: (noMail ? 'Link do podpisu skopiowany w aplikacji' : `Wysłana do podpisu na ${to}`).slice(0, 500), path, mime: 'application/pdf', size: bytes.length, uploaded_by: memberId }).select('id').single();
        if (e2) { await admin.storage.from(BUCKET).remove([path]); return json({ error: 'Nie udało się zapisać dokumentu' }, 500); }
        fileId = cf.id;
      }
      const token = [...crypto.getRandomValues(new Uint8Array(24))].map(b => b.toString(16).padStart(2, '0')).join('');
      const { data: rq, error: e3 } = await admin.from('sign_requests').insert({ client_id: c?.id || null, m2_client_id: m2c?.id || null, order_id: order?.id || null, firm, kind,
        token, title, email: to || null, file_id: fileId, file_path: fileId ? null : path, created_by: memberId, doc_html: docHtml }).select('id').single();
      if (e3) { console.error(e3); return json({ error: 'Nie udało się utworzyć prośby o podpis' }, 500); }
      const S = await settings();
      const link = `${S.app}/podpis/?t=${token}`;
      if (noMail) {
        if (order && order.status === 'projekt') await admin.from('m2_orders').update({ status: 'wyslane' }).eq('id', order.id);
        return json({ ok: true, id: rq.id, link });
      }
      const { data: me } = await admin.from('team_members').select('full_name, email').eq('id', memberId).single();
      let textBody = text0.replaceAll('{link}', link);
      try {
        textBody = await sendApp(S, me, to, subject, { firm, kicker: kind === 'pel' ? 'Pełnomocnictwo do podpisu' : 'Dokument do podpisu', title, text: text0.replaceAll('{link}', '{button}'), button: { url: link, label: 'Przeczytaj i podpisz' } });
      } catch (e) {
        const m = String((e as Error).message || e);
        await admin.from('sign_requests').update({ status: 'anulowano' }).eq('id', rq.id);
        return json({ error: 'send_failed', detail: m.slice(0, 300) }, 200);
      }
      if (order && order.status === 'projekt') await admin.from('m2_orders').update({ status: 'wyslane' }).eq('id', order.id);
      if (c) await admin.from('client_messages').insert({ client_id: c.id, kind: 'informacja', period: null, email: to, subject, body: textBody + `\n\n[dokument do podpisu online: ${fname}]`, sender_name: me?.full_name || null, status: 'wyslano', sent_by: memberId });
      return json({ ok: true, id: rq.id, link });
    }
    return json({ error: 'Nieznana operacja' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: 'Wystąpił błąd – spróbuj ponownie.' }, 500);
  }
});
