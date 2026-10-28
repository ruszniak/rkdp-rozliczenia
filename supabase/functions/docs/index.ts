// Prośby o dokumenty: klient dostaje link (bez logowania) i wgrywa pliki do miesiąca rozliczeniowego.
// Akcje:
//  • info / upload – publiczne, tylko z ważnym tokenem prośby (48 znaków hex, ważny 30 dni)
//  • send – zalogowany członek zespołu, który widzi klienta: e-mail do klienta z konta Google Workspace (Gmail API,
//    konto usługi z delegacją domeny; nadawca w app_settings.mail_sender). Bez konfiguracji – { sent: false } i aplikacja
//    otwiera program pocztowy.
//  • remind – z harmonogramu (nagłówek x-push-secret): po 3 dniach bez plików przypomnienie e-mailem albo powiadomieniem dla zespołu.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const URL_ = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(URL_, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const APP = 'https://rozliczenia.rkdp.pl';
const MAX_FILE = 20 * 1048576, MAX_FILES = 20, MAX_PER_REQUEST = 200;
const OK_TYPES = /^(application\/pdf|image\/(jpeg|png|heic|heif|webp|gif|tiff)|text\/(xml|csv|plain)|application\/(xml|zip|x-zip-compressed|vnd\.openxmlformats-officedocument\.(spreadsheetml\.sheet|wordprocessingml\.document)|vnd\.ms-excel|msword|octet-stream))$/;
const OK_EXT = /\.(pdf|jpe?g|png|heic|heif|webp|gif|tiff?|xml|csv|txt|zip|xlsx?|docx?|jpk|epp)$/i;
const MONTHS = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
const periodLabel = (p: string) => `${MONTHS[+p.slice(5, 7) - 1]} ${p.slice(0, 4)}`;
const safeName = (n: string) => (n || 'plik').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').replace(/[^\w.\-]+/g, '_').slice(-80);
const validToken = (t: unknown) => typeof t === 'string' && /^[0-9a-f]{48}$/.test(t);

async function requestByToken(token: string) {
  const { data } = await admin.from('doc_requests').select('*, clients(name, accountant_id, hr_id)').eq('token', token).maybeSingle();
  if (!data) return { error: 'Link jest nieprawidłowy.' };
  if (data.closed_at) return { error: 'Ta prośba została już zamknięta. W razie pytań skontaktuj się z biurem.' };
  if (new Date(data.expires_at) < new Date()) return { error: 'Link wygasł. Poproś biuro o nowy.' };
  return { req: data };
}

// ---------- Gmail (konto usługi z delegacją domeny) ----------
const b64url = (data: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  let s = ''; bytes.forEach(b => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
async function gmailToken(sender: string) {
  const raw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT') || '';
  const sa = raw ? JSON.parse(raw) : null;
  if (!sa?.client_email || !sa?.private_key) throw new Error('not_configured');
  const now = Math.floor(Date.now() / 1000), aud = sa.token_uri || 'https://oauth2.googleapis.com/token';
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({ iss: sa.client_email, sub: sender, scope: 'https://www.googleapis.com/auth/gmail.send', aud, iat: now, exp: now + 3600 }))}`;
  const der = Uint8Array.from(atob(sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const r = await fetch(aud, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${b64url(sig)}` }) });
  const j = await r.json();
  if (!r.ok) throw new Error('google_token: ' + (j.error_description || j.error || r.status));
  return j.access_token as string;
}
const encWord = (s: string) => `=?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(s)))}?=`;
async function sendMail(cfg: { sub: string; from: string }, to: string, subject: string, text: string) {
  const token = await gmailToken(cfg.sub);
  const body = btoa(String.fromCharCode(...new TextEncoder().encode(text))).replace(/(.{76})/g, '$1\r\n');
  const mime = [`From: ${encWord('RKDP – biuro')} <${cfg.from}>`, `Reply-To: ${cfg.from}`, `To: ${to}`, `Subject: ${encWord(subject)}`, 'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', body].join('\r\n');
  const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/send`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ raw: b64url(mime) }) });
  if (!r.ok) throw new Error('gmail: ' + r.status + ' ' + (await r.text()).slice(0, 200));
}
export function mailText(r: any, reminder = false) {
  const items = (r.items || []).map((i: any) => `• ${i.label}`).join('\n');
  return [
    reminder ? 'Dzień dobry,\n\nuprzejmie przypominamy o dokumentach potrzebnych do rozliczenia.' : 'Dzień dobry,\n\ndo rozliczenia potrzebujemy jeszcze dokumentów.',
    '', `Okres: ${periodLabel(r.period)}`, items ? `\n${items}` : '', r.message ? `\n${r.message}` : '',
    '', 'Pliki (PDF, zdjęcia, XML, Excel) można wgrać bez logowania – także zdjęciem z telefonu:', `${APP}/wgraj.html#${r.token}`,
    '', `Link jest ważny do ${new Date(r.expires_at).toLocaleDateString('pl-PL')}.`, '', 'Dziękujemy,', 'RKDP spółka doradztwa podatkowego sp. z o.o.',
  ].join('\n');
}
// konto Workspace (delegacja) i adres nadawcy – alias, np. kancelaria@rkdp.pl
async function sender() {
  const { data } = await admin.from('app_settings').select('key,value').in('key', ['mail_sender', 'mail_from']);
  const m = Object.fromEntries((data || []).map((x: any) => [x.key, (x.value || '').trim()]));
  return m.mail_sender ? { sub: m.mail_sender, from: m.mail_from || m.mail_sender } : null;
}
async function hookSecret() {
  const { data } = await admin.rpc('push_get_config');
  return data?.push_hook_secret || '';
}
async function notifyTeam(event: string, payload: Record<string, unknown>) {
  try {
    const s = await hookSecret();
    if (!s) return;
    await fetch(`${URL_}/functions/v1/push`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-push-secret': s }, body: JSON.stringify({ event, ...payload }) });
  } catch { /* powiadomienie nie blokuje */ }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Metoda niedozwolona' }, 405);
  try {
    const ct = req.headers.get('content-type') || '';
    // ---------- wgrywanie plików przez klienta (multipart) ----------
    if (ct.startsWith('multipart/form-data')) {
      const form = await req.formData();
      const token = String(form.get('token') || '');
      if (!validToken(token)) return json({ error: 'Link jest nieprawidłowy.' }, 400);
      const { req: r, error } = await requestByToken(token);
      if (error) return json({ error }, 410);
      const files = form.getAll('file').filter((f): f is File => f instanceof File);
      if (!files.length) return json({ error: 'Nie wybrano plików.' }, 400);
      if (files.length > MAX_FILES) return json({ error: `Jednorazowo można wysłać do ${MAX_FILES} plików.` }, 400);
      if (r.files_count + files.length > MAX_PER_REQUEST) return json({ error: 'Osiągnięto limit plików dla tej prośby – skontaktuj się z biurem.' }, 400);
      const per = String(r.period).slice(0, 7);
      const saved: string[] = [], rejected: string[] = [];
      for (const f of files) {
        if (f.size > MAX_FILE) { rejected.push(`${f.name} (ponad 20 MB)`); continue; }
        if (!OK_TYPES.test(f.type || 'application/octet-stream') && !OK_EXT.test(f.name)) { rejected.push(`${f.name} (nieobsługiwany typ)`); continue; }
        const path = `${r.client_id}/${per}/klient-${crypto.randomUUID().slice(0, 8)}-${safeName(f.name)}`;
        const { error: e1 } = await admin.storage.from('rozliczenia').upload(path, f, { contentType: f.type || 'application/octet-stream', upsert: false });
        if (e1) { rejected.push(`${f.name} (błąd zapisu)`); continue; }
        const { error: e2 } = await admin.from('period_files').insert({ client_id: r.client_id, period: r.period, path, name: f.name.slice(0, 200), mime: f.type || null, size: f.size, uploaded_by: null, source: 'klient', request_id: r.id });
        if (e2) { await admin.storage.from('rozliczenia').remove([path]); rejected.push(`${f.name} (błąd zapisu)`); continue; }
        saved.push(f.name);
      }
      if (saved.length) {
        await admin.from('doc_requests').update({ files_count: r.files_count + saved.length, last_upload_at: new Date().toISOString() }).eq('id', r.id);
        // kratki „Brak dokumentów” z prośby wracają do „Do zrobienia”
        const codes = (r.items || []).map((i: any) => i.code).filter(Boolean);
        if (codes.length) await admin.from('checklist_entries').update({ status: 'todo' }).eq('client_id', r.client_id).eq('period', r.period).in('status', ['missing_docs', 'reminded']).in('task_code', codes);
        await notifyTeam('docs_uploaded', { request_id: r.id, count: saved.length });
      }
      return json({ saved, rejected });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');
    if (action === 'info') {
      if (!validToken(body.token)) return json({ error: 'Link jest nieprawidłowy.' }, 400);
      const { req: r, error } = await requestByToken(body.token);
      if (error) return json({ error }, 410);
      return json({ client: r.clients?.name || '', period: String(r.period).slice(0, 7), periodLabel: periodLabel(String(r.period)), items: (r.items || []).map((i: any) => ({ label: i.label })),
        message: r.message || '', expires_at: r.expires_at, files_count: r.files_count });
    }

    if (action === 'remind') {
      const s = await hookSecret();
      const given = req.headers.get('x-push-secret') || '';
      if (!s || given !== s) return json({ error: 'Brak dostępu' }, 401);
      const cutoff = new Date(Date.now() - 3 * 86400000).toISOString();
      const { data: list } = await admin.from('doc_requests').select('*, clients(name, accountant_id)')
        .is('closed_at', null).is('reminded_at', null).eq('files_count', 0).lt('created_at', cutoff).gt('expires_at', new Date().toISOString());
      const from = await sender();
      let mailed = 0, pushed = 0;
      for (const r of list || []) {
        let ok = false;
        if (from && r.email && r.sent_at) { try { await sendMail(from, r.email, `Przypomnienie: dokumenty za ${periodLabel(String(r.period))}`, mailText(r, true)); ok = true; mailed++; } catch (e) { console.error(e); } }
        if (!ok) { await notifyTeam('docs_remind', { request_id: r.id }); pushed++; }
        await admin.from('doc_requests').update({ reminded_at: new Date().toISOString() }).eq('id', r.id);
      }
      return json({ mailed, pushed });
    }

    if (action === 'send') {
      const auth = req.headers.get('Authorization') || '';
      if (!auth.startsWith('Bearer ')) return json({ error: 'Brak dostępu' }, 401);
      const sb = createClient(URL_, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
      // RLS: prośbę zobaczy tylko osoba, która widzi klienta
      const { data: r } = await sb.from('doc_requests').select('*').eq('id', String(body.request_id || '')).maybeSingle();
      if (!r) return json({ error: 'Brak dostępu do tej prośby.' }, 403);
      const from = await sender();
      if (!from) return json({ sent: false, reason: 'not_configured' });
      if (!r.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) return json({ sent: false, reason: 'no_email' });
      try {
        await sendMail(from, r.email, `Dokumenty do rozliczenia – ${periodLabel(String(r.period))}`, mailText(r));
      } catch (e) {
        const msg = String((e as Error).message || e);
        return json({ sent: false, reason: msg.includes('not_configured') ? 'not_configured' : 'gmail_error', detail: msg.slice(0, 200) });
      }
      await admin.from('doc_requests').update({ sent_at: new Date().toISOString(), sent_via: 'gmail' }).eq('id', r.id);
      return json({ sent: true });
    }
    return json({ error: 'Nieznana operacja' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: 'Wystąpił błąd – spróbuj ponownie.' }, 500);
  }
});
