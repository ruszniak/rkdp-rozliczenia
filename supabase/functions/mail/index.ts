// Wiadomości e-mail do klientów RKDP wysyłane z aplikacji: z adresu biura (app_settings.mail_from, np. kancelaria@rkdp.pl –
// alias konta Workspace z app_settings.mail_sender) przez Gmail API (konto usługi z delegacją domeny, zakres gmail.send).
// Każdy klient dostaje osobną wiadomość (bez ujawniania innych adresatów), podpisaną przez osobę wysyłającą.
// Wywołuje zalogowany członek zespołu z modułem Rozliczenia; klienci filtrowani uprawnieniami (RLS) tej osoby.
//  • { action: 'status' } – czy wysyłka jest skonfigurowana
//  • { action: 'send', kind, period, subject, body, client_ids[], mark_missing?, links?, mark_done? } – {klient}, {okres}, {link} w temacie i treści; kind 'kwoty' + mark_done: { client_id: [kody] } odhacza kratki
//  • { action: 'broadcast', subject, body, client_ids[], groups?, test?, signature? } – jedna informacja do wielu klientów:
//    Do: adres kancelarii, klienci w UDW (paczki po 90 adresów); test = tylko do osoby wysyłającej
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
const MONTHS = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
const periodLabel = (p: string) => `${MONTHS[+p.slice(5, 7) - 1]} ${p.slice(0, 4)}`;
const KINDS = new Set(['ksef', 'wyciag', 'dokumenty', 'kwoty']);
const DONE_CODES = new Set(['vat', 'pit_cit', 'zus_podany', 'pit4']);
const MARK: Record<string, string[]> = { ksef: ['saldeo'], wyciag: ['wb'] };
const emailOk = (e: string) => /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(e);

const b64url = (data: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  let s = ''; bytes.forEach(b => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64 = (t: string) => { let s = ''; new TextEncoder().encode(t).forEach(b => { s += String.fromCharCode(b); }); return btoa(s); };
const encWord = (s: string) => `=?UTF-8?B?${b64(s)}?=`;

let tok: { v: string; exp: number; sub: string } | null = null;
async function gmailToken(sub: string) {
  if (tok && tok.sub === sub && tok.exp > Date.now() + 60000) return tok.v;
  const raw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT') || '';
  const sa = raw ? JSON.parse(raw) : null;
  if (!sa?.client_email || !sa?.private_key) throw new Error('not_configured: brak klucza konta usługi Google');
  const now = Math.floor(Date.now() / 1000), aud = sa.token_uri || 'https://oauth2.googleapis.com/token';
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({ iss: sa.client_email, sub, scope: 'https://www.googleapis.com/auth/gmail.send', aud, iat: now, exp: now + 3600 }))}`;
  const der = Uint8Array.from(atob(sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const r = await fetch(aud, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${b64url(sig)}` }) });
  const j = await r.json();
  if (!r.ok) throw new Error('not_authorized: ' + (j.error_description || j.error || r.status));
  tok = { v: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000, sub };
  return tok.v;
}
// Sposób 1 (prostszy): SMTP Gmaila z hasłem aplikacji – sekrety SMTP_USER (konto, np. michal@ruszniak.io) i SMTP_PASS
// (hasło aplikacji Google). Nadawca = alias z „Wyślij jako” (kancelaria@rkdp.pl). Port 465 (TLS).
// Sposób 2: Gmail API przez konto usługi z delegacją domeny (GOOGLE_SERVICE_ACCOUNT + zakres gmail.send).
const SMTP_USER = (Deno.env.get('SMTP_USER') || '').trim(), SMTP_PASS = (Deno.env.get('SMTP_PASS') || '').replace(/\s+/g, '');
let smtp: any = null;
const smtpOn = () => !!(SMTP_USER && SMTP_PASS);
const transport = () => smtp || (smtp = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: SMTP_USER, pass: SMTP_PASS } }));
// ---------- stopki mailowe zespołu z rkdp.pl/stopki (strona w repozytorium ruszniak/rkdp) ----------
const FROM_NAME = 'RKDP | Kancelaria';
let sigCache: { at: number; map: Map<string, string> } | null = null;
// klucze: imię i nazwisko z nagłówka sekcji oraz części adresów e-mail ze stopki (np. „weronika.rzepkowska”) – działa też po zmianie nazwiska
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').toLowerCase().replace(/\s+/g, ' ').trim();
async function signatures() {
  if (sigCache && Date.now() - sigCache.at < 10 * 60000) return sigCache.map;
  const map = new Map<string, string>();
  try {
    const r = await fetch('https://rkdp.pl/stopki/', { headers: { 'User-Agent': 'rkdp-rozliczenia' } });
    const html = r.ok ? await r.text() : '';
    for (const m of html.matchAll(/<section class="person" id="p-([^"]+)">\s*<h2>([^<]+)<\/h2>([\s\S]*?)<\/section>/g)) {
      const full = m[3].match(/<div class="preview" id="sig-[^"]+-full">([\s\S]*?)<\/div>\s*<div class="actions">/);
      if (!full) continue;
      const sig = full[1].replace(/\sdata-abs="[^"]*"/g, '').trim();
      if (m[1] === 'kancelaria') { map.set('__kancelaria', sig); continue; }
      map.set(norm(m[2]), sig);
      for (const e of sig.matchAll(/mailto:([^@"]+)@/g)) if (e[1] !== 'kancelaria' && !map.has('@' + e[1].toLowerCase())) map.set('@' + e[1].toLowerCase(), sig);
    }
  } catch (e) { console.error('stopki', e); }
  sigCache = { at: Date.now(), map };
  return map;
}
const htmlToText = (h: string) => h.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(div|tr|p|li|h[1-6]|table)>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
const escH = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const bodyHtml = (t: string) => `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#1D1A16;">${escH(t).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#7A5A37;">$1</a>').replace(/\n/g, '<br>')}</div>`;

async function sendMail(cfg: { sub: string; from: string }, fromName: string, to: string, subject: string, text: string, html?: string, bcc: string[] = []) {
  if (smtpOn()) {
    try { await transport().sendMail({ from: { name: fromName, address: cfg.from }, replyTo: cfg.from, to, ...(bcc.length ? { bcc } : {}), subject, text, ...(html ? { html } : {}) }); return; }
    catch (e) { const m = String((e as Error).message || e); if (/Invalid login|Username and Password|535|534/i.test(m)) throw new Error('not_authorized: SMTP – nieprawidłowe hasło aplikacji (' + m.slice(0, 120) + ')'); throw e; }
  }
  const token = await gmailToken(cfg.sub);
  const part = (type: string, c: string) => [`Content-Type: ${type}; charset=UTF-8`, 'Content-Transfer-Encoding: base64', '', b64(c).replace(/(.{76})/g, '$1\r\n')].join('\r\n');
  const bnd = 'b' + crypto.randomUUID().replace(/-/g, '');
  const head = [`From: ${encWord(fromName)} <${cfg.from}>`, `Reply-To: ${cfg.from}`, `To: ${to}`, ...(bcc.length ? [`Bcc: ${bcc.join(', ')}`] : []), `Subject: ${encWord(subject)}`, 'MIME-Version: 1.0'];
  const mime = html
    ? [...head, `Content-Type: multipart/alternative; boundary="${bnd}"`, '', `--${bnd}`, part('text/plain', text), `--${bnd}`, part('text/html', html), `--${bnd}--`, ''].join('\r\n')
    : [...head, part('text/plain', text)].join('\r\n');
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ raw: b64url(mime) }) });
  if (!r.ok) throw new Error('gmail ' + r.status + ': ' + (await r.text()).slice(0, 180));
}
async function config() {
  const { data } = await admin.from('app_settings').select('key,value').in('key', ['mail_sender', 'mail_from']);
  const m = Object.fromEntries((data || []).map((x: any) => [x.key, (x.value || '').trim()]));
  return { sub: m.mail_sender || '', from: m.mail_from || m.mail_sender || '' };
}

// stopka osoby wysyłającej (HTML z rkdp.pl/stopki) albo tekstowa
async function signatureOf(me: any, cfg: { from: string }) {
  const sigs = await signatures();
  const sigHtml = sigs.get(norm(me?.full_name || '')) || sigs.get('@' + String(me?.email || '').split('@')[0].toLowerCase()) || sigs.get('__kancelaria') || '';
  const text = sigHtml ? '\n' + htmlToText(sigHtml)
    : ['', 'Pozdrawiam serdecznie,', me?.full_name || '', me?.job_title || '', 'RKDP spółka doradztwa podatkowego sp. z o.o.', cfg.from, 'www.rkdp.pl'].filter((x, i) => i < 2 || x).join('\n');
  return { sigHtml, text };
}

// ---------- informacja zbiorcza: adresaci w UDW ----------
// gotowy mail HTML (np. przygotowany wcześniej szablon) – bez skryptów, ramek, formularzy i zdarzeń JS
function cleanHtml(h: string) {
  return h.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|iframe|object|embed|form|noscript|base|meta[^>]*http-equiv)[\s\S]*?(<\/\1>|>)/gi, '')
    .replace(/<\/?(script|iframe|object|embed|form|input|button|textarea|select|link)\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(["'])\s*(javascript|vbscript|data:text)[^"']*\2/gi, '$1="#"');
}
async function broadcast(sb: any, body: any, cfg: { sub: string; from: string }, memberId: string) {
  const subject = String(body.subject || '').trim().slice(0, 200);
  const rich = typeof body.html === 'string' && body.html.trim() ? cleanHtml(String(body.html).slice(0, 400000)) : '';
  const text0 = rich ? htmlToText(rich.replace(/<(style|head|title)[\s\S]*?<\/\1>/gi, '')).replace(/\n{3,}/g, '\n\n').trim().slice(0, 20000) : String(body.body || '').slice(0, 20000);
  if (!subject || !text0.trim()) return json({ error: 'Pusty temat lub treść' }, 400);
  const { data: me } = await admin.from('team_members').select('full_name, job_title, email').eq('id', memberId).single();
  const sig = body.signature === false ? { sigHtml: '', text: '' } : await signatureOf(me, cfg);
  const text = text0 + (sig.text ? '\n' + sig.text : '');
  const sigBlock = sig.sigHtml ? '<br><br>' + sig.sigHtml : sig.text ? '<br>' + bodyHtml(sig.text) : '';
  const html = rich ? (/<\/body>/i.test(rich) ? rich.replace(/<\/body>/i, `<div style="max-width:640px;margin:0 auto;padding:0 16px;">${sigBlock}</div></body>`) : rich + sigBlock)
    : `${bodyHtml(text0)}${sigBlock}`;
  const groups = String(body.groups || '').slice(0, 300) || null;
  if (body.test) {
    const to = String(me?.email || '');
    if (!emailOk(to)) return json({ error: 'Brak Twojego adresu e-mail w zespole' }, 400);
    try { await sendMail(cfg, FROM_NAME, to, '[TEST] ' + subject, text, html); }
    catch (e) { const m = String((e as Error).message || e); return json(/^not_(configured|authorized)/.test(m) ? { error: 'not_configured', detail: m.slice(0, 300) } : { error: m.slice(0, 300) }, 200); }
    await admin.from('mail_broadcasts').insert({ subject, body: text0, html: rich || null, groups, recipients: 1, clients: 0, status: 'test', sent_by: memberId });
    return json({ test: true, email: to });
  }
  const ids = Array.isArray(body.client_ids) ? [...new Set(body.client_ids.map(String))].slice(0, 1000) : [];
  if (!ids.length) return json({ error: 'Nie wybrano klientów' }, 400);
  // tylko klienci widoczni dla osoby wysyłającej (RLS)
  const clients: any[] = [];
  for (let i = 0; i < ids.length; i += 200) { const { data } = await sb.from('clients').select('id,name,email').in('id', ids.slice(i, i + 200)); clients.push(...(data || [])); }
  const owner = new Map<string, string[]>(); // adres → klienci
  const noEmail: string[] = [];
  for (const c of clients) {
    const em = [...new Set(String(c.email || '').split(/[;,\s]+/).map(x => x.trim().toLowerCase()).filter(emailOk))];
    if (!em.length) { noEmail.push(c.name); continue; }
    for (const e of em) owner.set(e, [...(owner.get(e) || []), c.id]);
  }
  const all = [...owner.keys()];
  if (!all.length) return json({ error: 'Żaden z wybranych klientów nie ma adresu e-mail' }, 400);
  const { data: rec } = await admin.from('mail_broadcasts').insert({ subject, body: text0, html: rich || null, groups, recipients: all.length, clients: clients.length - noEmail.length, status: 'wyslano', sent_by: memberId }).select('id').single();
  let ok = 0, failed = 0; const errors: string[] = []; const okClients = new Set<string>();
  for (let i = 0; i < all.length; i += 90) {
    const batch = all.slice(i, i + 90);
    try {
      await sendMail(cfg, FROM_NAME, cfg.from, subject, text, html, batch);
      ok += batch.length; batch.forEach(e => (owner.get(e) || []).forEach(id => okClients.add(id)));
    } catch (e) {
      const m = String((e as Error).message || e);
      if (/^not_(configured|authorized)/.test(m) && !ok) { if (rec) await admin.from('mail_broadcasts').update({ status: 'blad', failed: all.length, error: m.slice(0, 300) }).eq('id', rec.id); return json({ error: 'not_configured', detail: m.slice(0, 300) }, 200); }
      failed += batch.length; errors.push(m.slice(0, 160));
    }
    await new Promise(r => setTimeout(r, 400));
  }
  // ślad w rozmowie każdego klienta
  const rows = clients.filter(c => okClients.has(c.id)).map(c => ({ client_id: c.id, kind: 'informacja', period: null, email: [...owner.entries()].filter(([, v]) => v.includes(c.id)).map(([k]) => k).join(', ').slice(0, 300), subject, body: text, sender_name: me?.full_name || null, status: 'wyslano', sent_by: memberId }));
  for (let i = 0; i < rows.length; i += 200) await admin.from('client_messages').insert(rows.slice(i, i + 200));
  if (rec) await admin.from('mail_broadcasts').update({ failed, status: failed ? (ok ? 'czesciowo' : 'blad') : 'wyslano', error: errors.join(' | ').slice(0, 500) || null }).eq('id', rec.id);
  return json({ sent: ok, failed, clients: okClients.size, no_email: noEmail, errors });
}

// ---------- kwoty do zapłaty: mail w szacie graficznej RKDP (logo, tabela kwot, stopka osoby wysyłającej) ----------
const LOGO = 'https://raw.githubusercontent.com/ruszniak/rkdp/main/img/stopka-logo.png';
const zl = (n: number) => n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\u00a0/g, ' ') + ' zł';
const dPL = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split('-').reverse().join('.') : '';
const accF = (a: string) => a.replace(/\D/g, '').replace(/^(\d{2})(\d{4})(\d{4})(\d{4})(\d{4})(\d{4})(\d{4})$/, '$1 $2 $3 $4 $5 $6 $7');
function kwotyItems(raw: any): any[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 10).map((x: any) => ({
    label: String(x?.label || '').slice(0, 80), amount: Number(x?.amount), due: String(x?.due || '').slice(0, 10),
    account: String(x?.account || '').replace(/\D/g, '').slice(0, 34), zus: x?.acctype === 'zus', title: String(x?.title || '').slice(0, 60),
  })).filter(x => x.label && isFinite(x.amount));
}
function kwotyHtml(period: string, items: any[], _note: string, sigHtml: string) {
  const total = items.reduce((t, i) => t + i.amount, 0);
  const per = period ? periodLabel(period + '-01') : '';
  const row = (i: any) => `<tr><td style="padding:14px 0;border-bottom:1px solid #E8E0D4;vertical-align:top">`
    + `<div style="font-size:15px;font-weight:700;color:#1D1A16">${escH(i.label)}</div>`
    + (i.due ? `<div style="font-size:13px;color:#5E564C;margin-top:3px">termin płatności: <b style="color:#1D1A16">${dPL(i.due)}</b></div>` : '')
    + (i.account ? `<div style="font-size:13px;color:#5E564C;margin-top:3px">${i.zus ? 'rachunek składkowy ZUS' : 'mikrorachunek podatkowy'}: <span style="font-family:Consolas,Menlo,monospace;color:#1D1A16;white-space:nowrap">${accF(i.account)}</span></div>` : '')
    + (i.title ? `<div style="font-size:13px;color:#5E564C;margin-top:3px">tytuł przelewu: <span style="color:#1D1A16">${escH(i.title)}</span></div>` : '')
    + `</td><td style="padding:14px 0 14px 16px;border-bottom:1px solid #E8E0D4;text-align:right;vertical-align:top;white-space:nowrap;font-size:17px;font-weight:700;color:#1D1A16">${zl(i.amount)}</td></tr>`;
  return `<!doctype html><html lang="pl"><body style="margin:0;padding:0;background:#F3EEE6">`
    + `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F3EEE6"><tr><td align="center" style="padding:24px 12px">`
    + `<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#FFFFFF;border-radius:14px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#1D1A16">`
    + `<tr><td style="background:#FFFFFF;padding:20px 28px 16px;border-bottom:3px solid #806341"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>`
    + `<td><a href="https://rkdp.pl" style="text-decoration:none"><img src="${LOGO}" alt="RKDP" height="44" style="display:block;height:44px;border:0"></a></td>`
    + `<td style="text-align:right;color:#806341;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">Kwoty do zapłaty<br><span style="color:#1D1A16;font-size:13px;letter-spacing:.04em">${escH(per)}</span></td>`
    + `</tr></table></td></tr>`
    + `<tr><td style="padding:26px 28px 6px;font-size:15px;line-height:1.55">Dzień dobry,<br><br>przekazujemy kwoty do zapłaty za <b>${escH(per)}</b>:</td></tr>`
    + `<tr><td style="padding:0 28px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${items.map(row).join('')}</table></td></tr>`
    + `<tr><td style="padding:16px 28px 0"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#806341;border-radius:10px"><tr>`
    + `<td style="padding:13px 16px;color:#FFFFFF;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.06em">Razem do zapłaty</td>`
    + `<td style="padding:13px 16px;color:#FFFFFF;font-size:19px;font-weight:700;text-align:right;white-space:nowrap">${zl(total)}</td></tr></table></td></tr>`
    + `<tr><td style="padding:18px 28px 8px;font-size:14px;line-height:1.55;color:#1D1A16">Przypominamy o terminowej płatności. W razie pytań jesteśmy do dyspozycji.</td></tr>`
    + `<tr><td style="padding:8px 28px 26px">${sigHtml || ''}</td></tr>`
    + `</table></td></tr></table></body></html>`;
}

// ---------- godziny powiadomień (Mój profil): poza nimi powiadomienia czekają w kolejce i przychodzą zbiorczo ----------
const WD: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const toMin = (s: string) => { const [h, m] = String(s || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
function windowOpen(w: any, at = new Date()): boolean {
  if (!w?.on) return true;
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Warsaw', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at).map(x => [x.type, x.value]));
  const day = WD[p.weekday] || 1, min = (+p.hour % 24) * 60 + +p.minute, days: number[] = Array.isArray(w.days) ? w.days.map(Number) : [];
  const f = toMin(w.from), t = toMin(w.to);
  if (f === t) return days.includes(day);
  if (f < t) return days.includes(day) && min >= f && min < t;
  // przez północ (np. 22:00–06:00): liczy się dzień rozpoczęcia
  if (min >= f) return days.includes(day);
  return days.includes(day === 1 ? 7 : day - 1) && min < t;
}

// ---------- zlecenia: e-mail do pracownika (nowe, poprawka, odpowiedź, akceptacja) albo do zlecającego (pytanie, wykonanie) ----------
const APP_URL = 'https://rozliczenia.rkdp.pl';
async function zlecenieMail(b: any, cfg: { sub: string; from: string }): Promise<any> {
  // dodanie osób do zadania – osobny e-mail do każdej dodanej osoby
  if (String(b.ev || '') === 'dodany' && !b.toId) {
    const ids = Array.isArray(b.to) ? b.to.map(String).slice(0, 10) : [];
    let sent = 0; for (const id of ids) sent += (await zlecenieMail({ ...b, toId: id }, cfg)).sent || 0;
    return { sent };
  }
  const { data: z } = await admin.from('zlecenia').select('id, no, title, body, assignee_id, created_by, due_date, priority, steps, client_id').eq('id', String(b.id || '')).maybeSingle();
  if (!z) return { sent: 0 };
  const ev = String(b.ev || '');
  // zadanie dodane samemu sobie – bez maila o nowym zadaniu
  if (ev === 'nowe' && z.created_by && z.created_by === z.assignee_id) return { sent: 0, reason: 'self' };
  const toId = ev === 'dodany' ? String(b.toId) : ['pytanie', 'zgloszone'].includes(ev) ? z.created_by : z.assignee_id;
  const ids = [z.assignee_id, z.created_by, ev === 'dodany' ? toId : null].filter(Boolean);
  const { data: ms } = await admin.from('team_members').select('id, full_name, email').in('id', ids);
  const m = new Map((ms || []).map((x: any) => [x.id, x]));
  const to = m.get(toId), from = m.get(ev === 'dodany' ? z.created_by : toId === z.assignee_id ? z.created_by : z.assignee_id);
  // odbiorca może wskazać własny adres do powiadomień (Mój profil)
  const { data: pr } = to ? await admin.from('member_profiles').select('zl_email, notify_email, notify_window').eq('member_id', to.id).maybeSingle() : { data: null };
  const toAddr = pr?.notify_email && emailOk(String(pr.notify_email)) ? String(pr.notify_email) : String(to?.email || '');
  if (!to || !toAddr || !emailOk(toAddr)) return { sent: 0, reason: 'brak adresu' };
  // odbiorca wyłączył e-maile o zleceniach (Mój profil) – wystarczy powiadomienie push, o ile ma choć jedno działające
  if (pr?.zl_email === false) {
    const { data: subs } = await admin.from('push_subscriptions').select('prefs, fail_count').eq('member_id', to.id);
    if ((subs || []).some((x: any) => (x.fail_count || 0) < 3 && (x.prefs?.zgloszenia ?? true) !== false)) return { sent: 0, reason: 'push' };
  }
  const { data: last } = await admin.from('zlecenia_wpisy').select('body, kind').eq('zlecenie_id', z.id).order('created_at', { ascending: false }).limit(1);
  const note = !['nowe', 'dodany'].includes(ev) ? (last?.[0]?.body || '') : '';
  const client = z.client_id ? (await admin.from('clients').select('name').eq('id', z.client_id).maybeSingle()).data?.name || '' : '';
  const due = z.due_date ? z.due_date.split('-').reverse().join('.') : '';
  const HEAD: Record<string, string> = {
    nowe: `${from?.full_name || 'Michał'} zlecił(a) Ci zadanie`, dodany: 'Dodano Cię do zadania – pracujesz nad nim razem z innymi', poprawka: 'Zadanie wróciło do poprawy', odpowiedz: 'Odpowiedź na Twoje pytanie',
    zaakceptowane: 'Zadanie zaakceptowane – dziękuję!', pytanie: `${from?.full_name || 'Pracownik'} ma pytanie do zadania`, zgloszone: `${from?.full_name || 'Pracownik'} zgłosił(a) wykonanie zadania`,
  };
  const subject = ev === 'dodany' ? `Dodano Cię do zadania #${z.no}: ${z.title}`.slice(0, 200) : `${ev === 'nowe' ? (z.priority === 'pilne' ? 'PILNE – zadanie' : 'Zadanie') : (HEAD[ev] || 'Zadanie')} #${z.no}: ${z.title}`.slice(0, 200);
  const steps = Array.isArray(z.steps) ? z.steps.map((s: any) => `${s.done ? '☑' : '☐'} ${s.t}`) : [];
  const link = `${APP_URL}/#/zlecenia/${z.id}`;
  const lines = [
    HEAD[ev] || 'Zadanie', '', `„${z.title}”`, client ? `Klient: ${client}` : '', due ? `Termin: ${due}` : '', z.priority === 'pilne' ? 'Priorytet: PILNE' : '',
    ['nowe', 'dodany'].includes(ev) && z.body ? '\n' + z.body : '', ['nowe', 'dodany'].includes(ev) && steps.length ? '\nKroki:\n' + steps.join('\n') : '',
    note ? `\n${ev === 'poprawka' ? 'Do poprawy' : ev === 'pytanie' ? 'Pytanie' : 'Wiadomość'}: ${note}` : '',
    '', ev === 'zgloszone' ? 'Sprawdź i zaakceptuj albo odeślij do poprawy:' : ev === 'pytanie' ? 'Odpowiedz w aplikacji:' : 'Otwórz zadanie w aplikacji:', link,
    '', 'Nie odpowiadaj na tego maila – odpowiedzi nie trafiają do aplikacji. Odpowiadaj w zadaniu w aplikacji.',
  ].filter((x, i, arr) => !(x === '' && arr[i - 1] === ''));
  const text = lines.join('\n');
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#1D1A16;max-width:560px">`
    + `<p style="margin:0 0 6px;color:#2D4A8A;font-weight:700;letter-spacing:.06em;text-transform:uppercase;font-size:12px">Zadanie #${z.no}</p>`
    + `<h2 style="margin:0 0 12px;font-size:19px">${escH(HEAD[ev] || 'Zadanie')}</h2>`
    + `<p style="margin:0 0 6px;font-size:16px"><b>${escH(z.title)}</b></p>`
    + [client ? `Klient: ${escH(client)}` : '', due ? `Termin: <b>${due}</b>` : '', z.priority === 'pilne' ? '<b style="color:#A4462F">PILNE</b>' : ''].filter(Boolean).map(x => `<div>${x}</div>`).join('')
    + (['nowe', 'dodany'].includes(ev) && z.body ? `<p style="white-space:pre-wrap;background:#F8F5F0;padding:10px 12px;border-radius:8px">${escH(z.body)}</p>` : '')
    + (['nowe', 'dodany'].includes(ev) && steps.length ? `<p style="white-space:pre-wrap">${escH(steps.join('\n'))}</p>` : '')
    + (note ? `<p style="white-space:pre-wrap;background:#F5E7CF;padding:10px 12px;border-radius:8px">${escH(note)}</p>` : '')
    + `<p style="margin:18px 0"><a href="${link}" style="background:#2D4A8A;color:#fff;text-decoration:none;padding:11px 20px;border-radius:30px;font-weight:700">Otwórz zadanie</a></p>`
    + `<p style="color:#5E564C;font-size:12px">Wiadomość wysłana automatycznie z aplikacji RKDP. <b>Nie odpowiadaj na tego maila</b> – odpowiedzi nie trafiają do aplikacji. Pytania, komentarze i zgłoszenie wykonania wpisuj w zadaniu w aplikacji (przycisk wyżej).</p></div>`;
  // poza godzinami powiadomień odbiorcy – do kolejki (przyjdzie zbiorczo)
  if (!windowOpen(pr?.notify_window)) {
    await admin.from('notify_queue').insert({ member_id: to.id, channel: 'mail', category: 'zadania', title: subject, body: text, html, url: link });
    return { sent: 0, queued: 1 };
  }
  try { await sendMail(cfg, 'RKDP | Zadania', toAddr, subject, text, html); return { sent: 1 }; }
  catch (e) { console.error('zlecenie mail', e); return { sent: 0, error: String((e as Error).message || e).slice(0, 200) }; }
}

// wysyłka zbiorcza e-maili, które czekały (poza godzinami powiadomień)
async function flushMail(cfg: { sub: string; from: string }) {
  const { data: q } = await admin.from('notify_queue').select('id, member_id, title, body, html, url, created_at').eq('channel', 'mail').is('sent_at', null).order('created_at').limit(1000);
  if (!q?.length) return { sent: 0 };
  const by = new Map<string, any[]>(); q.forEach((r: any) => by.set(r.member_id, [...(by.get(r.member_id) || []), r]));
  const ids = [...by.keys()];
  const [{ data: pf }, { data: ms }] = await Promise.all([
    admin.from('member_profiles').select('member_id, notify_window, notify_email').in('member_id', ids),
    admin.from('team_members').select('id, email').in('id', ids),
  ]);
  const P = new Map((pf || []).map((r: any) => [r.member_id, r])), E = new Map((ms || []).map((r: any) => [r.id, r.email]));
  let sent = 0;
  for (const [mid, items] of by) {
    const pr: any = P.get(mid);
    if (!windowOpen(pr?.notify_window)) continue;
    const addr = pr?.notify_email && emailOk(String(pr.notify_email)) ? String(pr.notify_email) : String(E.get(mid) || '');
    const done = () => admin.from('notify_queue').update({ sent_at: new Date().toISOString() }).in('id', items.map((i: any) => i.id));
    if (!emailOk(addr)) { await done(); continue; }
    try {
      if (items.length === 1) await sendMail(cfg, 'RKDP | Zadania', addr, items[0].title, items[0].body || '', items[0].html || undefined);
      else {
        const when = (d: string) => new Date(d).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        const subject = `Powiadomienia z aplikacji RKDP (${items.length})`;
        const text = ['Powiadomienia, które przyszły poza Twoimi godzinami powiadomień:', '', ...items.map((i: any) => `• ${when(i.created_at)} – ${i.title}\n  ${i.url || APP_URL}`), '', 'Godziny powiadomień zmienisz w aplikacji: Mój profil.'].join('\n');
        const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#1D1A16;max-width:560px">`
          + `<p style="margin:0 0 6px;color:#2D4A8A;font-weight:700;letter-spacing:.06em;text-transform:uppercase;font-size:12px">Zestawienie powiadomień</p>`
          + `<h2 style="margin:0 0 12px;font-size:19px">Powiadomienia z przerwy (${items.length})</h2>`
          + items.map((i: any) => `<div style="padding:10px 0;border-bottom:1px solid #E5E8EF"><div style="color:#5E6577;font-size:12px">${when(i.created_at)}</div><a href="${i.url || APP_URL}" style="color:#2D4A8A;font-weight:700;text-decoration:none">${escH(i.title)}</a></div>`).join('')
          + `<p style="color:#5E564C;font-size:12px;margin-top:16px">Te powiadomienia przyszły poza Twoimi godzinami powiadomień. Godziny zmienisz w aplikacji: Mój profil.</p></div>`;
        await sendMail(cfg, 'RKDP | Zadania', addr, subject, text, html);
      }
      await done(); sent++;
    } catch (e) { console.error('flush mail', e); }
  }
  return { sent };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Metoda niedozwolona' }, 405);
  try {
    // wywołanie z bazy (harmonogram / wyzwalacze) – sekret z Vault zamiast logowania
    const hook = req.headers.get('x-push-secret') || '';
    if (hook) {
      const { data: pc } = await admin.rpc('push_get_config');
      const sec = pc?.push_hook_secret || '';
      if (!sec || hook.length !== sec.length || hook !== sec) return json({ error: 'Brak dostępu' }, 401);
      const body = await req.json().catch(() => ({}));
      if (body.action === 'zlecenie') return json(await zlecenieMail(body, await config()));
      if (body.action === 'flush') return json(await flushMail(await config()));
      return json({ error: 'Nieznana operacja' }, 400);
    }
    const auth = req.headers.get('Authorization') || '';
    if (!auth.startsWith('Bearer ')) return json({ error: 'Brak dostępu' }, 401);
    const sb = createClient(URL_, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const { data: memberId } = await sb.rpc('current_member_id');
    if (!memberId) return json({ error: 'Brak dostępu' }, 403);
    const { data: hasRk } = await sb.rpc('has_module', { m: 'rozliczenia' });
    if (!hasRk) return json({ error: 'Brak dostępu do modułu Rozliczenia' }, 403);
    const body = await req.json().catch(() => ({}));
    const cfg = await config();

    if (body.action === 'status') {
      if (!cfg.sub || !cfg.from) return json({ ready: false, reason: 'Brak ustawienia nadawcy.' , from: cfg.from });
      if (smtpOn()) {
        try { await transport().verify(); return json({ ready: true, from: cfg.from, via: 'smtp' }); }
        catch (e) { return json({ ready: false, from: cfg.from, via: 'smtp', reason: 'SMTP: ' + String((e as Error).message || e).slice(0, 200) }); }
      }
      try { await gmailToken(cfg.sub); return json({ ready: true, from: cfg.from }); }
      catch (e) { return json({ ready: false, from: cfg.from, reason: String((e as Error).message) }); }
    }
    if (body.action === 'broadcast') return await broadcast(sb, body, cfg, memberId);
    if (body.action === 'preview_kwoty') {
      const { data: me } = await admin.from('team_members').select('full_name, job_title, email').eq('id', memberId).single();
      const { sigHtml } = await signatureOf(me, cfg);
      const per = /^\d{4}-\d{2}$/.test(body.period || '') ? body.period : '';
      return json({ html: kwotyHtml(per, kwotyItems(body.items), String(body.note || '').slice(0, 1500), sigHtml) });
    }
    if (body.action !== 'send') return json({ error: 'Nieznana operacja' }, 400);

    const kind = String(body.kind || '');
    if (!KINDS.has(kind)) return json({ error: 'Nieznany rodzaj wiadomości' }, 400);
    const period = /^\d{4}-\d{2}$/.test(body.period || '') ? body.period : null;
    const subjectT = String(body.subject || '').slice(0, 200), bodyT = String(body.body || '').slice(0, 6000);
    if (!subjectT.trim() || !bodyT.trim()) return json({ error: 'Pusty temat lub treść' }, 400);
    const ids = Array.isArray(body.client_ids) ? body.client_ids.map(String).slice(0, 80) : [];
    if (!ids.length) return json({ error: 'Nie wybrano klientów' }, 400);
    // klienci widoczni dla osoby wysyłającej (RLS) – innych nie da się zaadresować
    const { data: clients } = await sb.from('clients').select('id,name,email').in('id', ids);
    const { data: me } = await admin.from('team_members').select('full_name, job_title, email').eq('id', memberId).single();
    // stopka osoby wysyłającej z rkdp.pl/stopki (po imieniu i nazwisku); brak – stopka ogólna kancelarii, a gdy strona niedostępna – tekstowa
    const { sigHtml, text: signature } = await signatureOf(me, cfg);
    const fromName = FROM_NAME;
    const results: any[] = [];
    for (const c of clients || []) {
      const to = String(c.email || '').split(/[;,\s]+/).find(emailOk) || '';
      const link = typeof body.links?.[c.id] === 'string' && body.links[c.id].startsWith('https://rozliczenia.rkdp.pl/wgraj.html#') ? body.links[c.id] : '';
      const fill = (t: string) => t.replaceAll('{klient}', c.name).replaceAll('{okres}', period ? periodLabel(period + '-01') : '').replaceAll('{link}', link);
      const subject = fill(subjectT), text = fill(bodyT) + '\n' + signature;
      const kItems = kind === 'kwoty' ? kwotyItems(body.items) : [];
      const html = kItems.length ? kwotyHtml(period || '', kItems, String(body.note || '').slice(0, 1500), sigHtml)
        : sigHtml ? `${bodyHtml(fill(bodyT))}<br><br>${sigHtml}` : undefined;
      if (!to) { results.push({ client_id: c.id, ok: false, error: 'brak adresu e-mail' }); continue; }
      try {
        await sendMail(cfg, fromName, to, subject, text, html);
        results.push({ client_id: c.id, ok: true, email: to });
        await admin.from('client_messages').insert({ client_id: c.id, kind, period: period ? period + '-01' : null, email: to, subject, body: text, sender_name: me?.full_name || null, status: 'wyslano', sent_by: memberId });
        if (body.mark_missing && period && MARK[kind]) await admin.from('checklist_entries').update({ status: 'reminded' })
          .eq('client_id', c.id).eq('period', period + '-01').in('task_code', MARK[kind]).in('status', ['todo', 'in_progress', 'missing_docs']);
        // kwoty do zapłaty: wysłane kwoty → kratki „podany” odhaczone (tylko te z listy, tylko tego klienta i miesiąca)
        const codes = kind === 'kwoty' && period && Array.isArray(body.mark_done?.[c.id]) ? body.mark_done[c.id].filter((x: string) => DONE_CODES.has(x)) : [];
        if (codes.length) await sb.from('checklist_entries').update({ status: 'done' }).eq('client_id', c.id).eq('period', period + '-01').in('task_code', codes);
      } catch (e) {
        const msg = String((e as Error).message || e);
        if (/^not_(configured|authorized)/.test(msg)) return json({ error: 'not_configured', detail: msg.slice(0, 300), results }, 200);
        results.push({ client_id: c.id, ok: false, error: msg.slice(0, 160) });
        await admin.from('client_messages').insert({ client_id: c.id, kind, period: period ? period + '-01' : null, email: to, subject, status: 'blad', error: msg.slice(0, 300), sent_by: memberId });
      }
      await new Promise(r => setTimeout(r, 150));
    }
    return json({ results, sent: results.filter(r => r.ok).length });
  } catch (e) {
    console.error(e);
    return json({ error: 'Wystąpił błąd: ' + String((e as Error)?.message || e) }, 500);
  }
});
