// Wiadomości e-mail do klientów RKDP wysyłane z aplikacji: z adresu biura (app_settings.mail_from, np. kancelaria@rkdp.pl –
// alias konta Workspace z app_settings.mail_sender) przez Gmail API (konto usługi z delegacją domeny, zakres gmail.send).
// Każdy klient dostaje osobną wiadomość (bez ujawniania innych adresatów), podpisaną przez osobę wysyłającą.
// Wywołuje zalogowany członek zespołu z modułem Rozliczenia; klienci filtrowani uprawnieniami (RLS) tej osoby.
//  • { action: 'status' } – czy wysyłka jest skonfigurowana
//  • { action: 'send', kind, period, subject, body, client_ids[], mark_missing?, links? } – {klient}, {okres}, {link} w temacie i treści
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
const KINDS = new Set(['ksef', 'wyciag', 'dokumenty']);
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
async function sendMail(cfg: { sub: string; from: string }, fromName: string, to: string, subject: string, text: string) {
  if (smtpOn()) {
    try { await transport().sendMail({ from: { name: fromName, address: cfg.from }, replyTo: cfg.from, to, subject, text }); return; }
    catch (e) { const m = String((e as Error).message || e); if (/Invalid login|Username and Password|535|534/i.test(m)) throw new Error('not_authorized: SMTP – nieprawidłowe hasło aplikacji (' + m.slice(0, 120) + ')'); throw e; }
  }
  const token = await gmailToken(cfg.sub);
  const mime = [`From: ${encWord(fromName)} <${cfg.from}>`, `Reply-To: ${cfg.from}`, `To: ${to}`, `Subject: ${encWord(subject)}`, 'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(text).replace(/(.{76})/g, '$1\r\n')].join('\r\n');
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ raw: b64url(mime) }) });
  if (!r.ok) throw new Error('gmail ' + r.status + ': ' + (await r.text()).slice(0, 180));
}
async function config() {
  const { data } = await admin.from('app_settings').select('key,value').in('key', ['mail_sender', 'mail_from']);
  const m = Object.fromEntries((data || []).map((x: any) => [x.key, (x.value || '').trim()]));
  return { sub: m.mail_sender || '', from: m.mail_from || m.mail_sender || '' };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Metoda niedozwolona' }, 405);
  try {
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
    const signature = ['', '--', me?.full_name || '', me?.job_title || '', 'RKDP spółka doradztwa podatkowego sp. z o.o.', cfg.from, 'www.rkdp.pl'].filter((x, i) => i < 2 || x).join('\n');
    const fromName = `${me?.full_name || 'RKDP'} – RKDP`;
    const results: any[] = [];
    for (const c of clients || []) {
      const to = String(c.email || '').split(/[;,\s]+/).find(emailOk) || '';
      const link = typeof body.links?.[c.id] === 'string' && body.links[c.id].startsWith('https://rozliczenia.rkdp.pl/wgraj.html#') ? body.links[c.id] : '';
      const fill = (t: string) => t.replaceAll('{klient}', c.name).replaceAll('{okres}', period ? periodLabel(period + '-01') : '').replaceAll('{link}', link);
      const subject = fill(subjectT), text = fill(bodyT) + '\n' + signature;
      if (!to) { results.push({ client_id: c.id, ok: false, error: 'brak adresu e-mail' }); continue; }
      try {
        await sendMail(cfg, fromName, to, subject, text);
        results.push({ client_id: c.id, ok: true, email: to });
        await admin.from('client_messages').insert({ client_id: c.id, kind, period: period ? period + '-01' : null, email: to, subject, status: 'wyslano', sent_by: memberId });
        if (body.mark_missing && period && MARK[kind]) await admin.from('checklist_entries').update({ status: 'reminded' })
          .eq('client_id', c.id).eq('period', period + '-01').in('task_code', MARK[kind]).in('status', ['todo', 'in_progress', 'missing_docs']);
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
