// Podpis dokumentu przez klienta (np. umowy): e-mail z samym linkiem do strony /podpis/?t=…, na której klient
// czyta dokument, może zgłosić uwagi, pobiera PDF, podpisuje (profil zaufany, podpis kwalifikowany, odręcznie) i wgrywa podpisany plik.
//  • send   – zalogowany członek zespołu: { client_id, title, to, subject, body, attachment: { base64 }, doc_html }
//             zapis PDF w archiwum klienta, prośba o podpis, e-mail z kancelaria@rkdp.pl (SMTP) z linkiem (bez załącznika)
//  • info   – publiczne { token }: dane do strony podpisu, treść do podglądu, uwagi + link do pobrania PDF (ważny 1 h)
//  • note   – publiczne { token, text, author }: uwagi klienta do dokumentu → zapis + e-mail do zespołu
//  • upload – publiczne, multipart { token, file }: podpisany plik → archiwum klienta + e-mail do osoby, która wysłała prośbę
//  • cancel – zalogowany: { id } – anulowanie prośby (link przestaje działać)
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
const OK_EXT = /\.(pdf|xml|xades|sig|p7s|p7m|zip|asice|asics|jpe?g|png|heic|heif|webp)$/i;
const SMTP_USER = (Deno.env.get('SMTP_USER') || '').trim(), SMTP_PASS = (Deno.env.get('SMTP_PASS') || '').replace(/\s+/g, '');
let smtp: any = null;
const transport = () => smtp || (smtp = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: SMTP_USER, pass: SMTP_PASS } }));
const emailOk = (e: string) => /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/.test(e);
const validToken = (t: unknown) => typeof t === 'string' && /^[0-9a-f]{48}$/.test(t);
const safeName = (n: string) => (n || 'plik').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').replace(/[^\w.\-]+/g, '_').slice(-90);
const escH = (t: string) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const FROM_NAME = 'RKDP | Kancelaria';

async function settings() {
  const { data } = await admin.from('app_settings').select('key,value').in('key', ['mail_from', 'mail_sender', 'app_url']);
  const m = Object.fromEntries((data || []).map((x: any) => [x.key, (x.value || '').trim()]));
  return { from: m.mail_from || m.mail_sender || SMTP_USER, app: (m.app_url || 'https://app.ruszniak.io').replace(/\/$/, '') };
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
  const { data } = await admin.from('sign_requests').select('*, clients(name, accountant_id)').eq('token', token).maybeSingle();
  if (!data) return { error: 'Link jest nieprawidłowy.' };
  if (data.status === 'anulowano') return { error: 'Ta prośba o podpis została anulowana. W razie pytań skontaktuj się z biurem.' };
  if (data.status !== 'podpisano' && new Date(data.expires_at) < new Date()) return { error: 'Link wygasł. Poproś biuro o nowy.' };
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
    const link = `${S.app}/#/klient/${r.client_id}`;
    await transport().sendMail({ from: { name: 'rdp.app – podpisy', address: S.from }, to, subject: subject.slice(0, 200), text,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#111827;max-width:560px"><p style="margin:0 0 6px;color:#2563EB;font-weight:700;letter-spacing:.06em;text-transform:uppercase;font-size:12px">Podpis · rdp.app</p><h2 style="margin:0 0 12px;font-size:19px">${escH(head)}</h2>${inner}<p style="margin:18px 0"><a href="${link}" style="background:#2563EB;color:#fff;text-decoration:none;padding:11px 20px;border-radius:10px;font-weight:700">Otwórz kartę klienta</a></p><p style="color:#6B7280;font-size:12px">${escH(foot)}</p></div>` });
  } catch (e) { console.error('mail zespół', e); }
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
      const path = `${r.client_id}/podpis-${crypto.randomUUID().slice(0, 8)}-${safeName(f.name)}`;
      const { error: e1 } = await admin.storage.from(BUCKET).upload(path, f, { contentType: f.type || 'application/octet-stream', upsert: false });
      if (e1) return json({ error: 'Nie udało się zapisać pliku – spróbuj ponownie.' }, 500);
      const name = `${r.title} – podpisana przez klienta${(f.name.match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase()}`.slice(0, 200);
      const { data: cf, error: e2 } = await admin.from('client_files').insert({ client_id: r.client_id, category: 'umowa', name, note: `Podpisany plik wgrany przez klienta (${f.name.slice(0, 120)})`, path, mime: f.type || null, size: f.size, uploaded_by: null }).select('id').single();
      if (e2) { await admin.storage.from(BUCKET).remove([path]); return json({ error: 'Nie udało się zapisać pliku – spróbuj ponownie.' }, 500); }
      await admin.from('sign_requests').update({ status: 'podpisano', signed_at: new Date().toISOString(), signed_file_id: cf.id }).eq('id', r.id);
      const link = `${(await settings()).app}/#/klient/${r.client_id}`;
      await notifyTeam(r, `Klient podpisał: ${r.title} – ${r.clients?.name || ''}`, 'Klient podpisał dokument',
        `Klient ${r.clients?.name || ''} wgrał podpisany dokument „${r.title}” (${f.name}).\n\nPlik jest w archiwum dokumentów klienta: ${link}\n\nSprawdź podpis przed dalszymi krokami (np. w weryfikatorze na gov.pl).`,
        `<p><b>${escH(r.clients?.name || '')}</b> wgrał(a) podpisany dokument „${escH(r.title)}” (${escH(f.name)}).</p>`,
        'Plik jest w „Archiwum dokumentów” klienta. Sprawdź podpis przed dalszymi krokami (np. w weryfikatorze podpisu na gov.pl).');
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
      if (r.file_id) {
        const { data: f } = await admin.from('client_files').select('path, name').eq('id', r.file_id).maybeSingle();
        if (f) {
          fileName = f.name;
          const { data: su } = await admin.storage.from(BUCKET).createSignedUrl(f.path, 3600, { download: f.name.endsWith('.pdf') ? f.name : f.name + '.pdf' });
          url = su?.signedUrl || '';
        }
      }
      const { data: notes } = await admin.from('sign_notes').select('body, author, from_client, created_at').eq('request_id', r.id).order('created_at');
      return json({ title: r.title, client: r.clients?.name || '', status: r.status, signed_at: r.signed_at, expires_at: r.expires_at, file: { name: fileName, url },
        html: r.doc_html || '', notes: notes || [] });
    }

    // ===== uwagi klienta do dokumentu =====
    if (action === 'note') {
      if (!validToken(body.token)) return json({ error: 'Link jest nieprawidłowy.' }, 400);
      const { r, error } = await byToken(body.token);
      if (error) return json({ error }, 410);
      const text = String(body.text || '').replace(/\r/g, '').trim().slice(0, 4000);
      const author = String(body.author || '').replace(/\s+/g, ' ').trim().slice(0, 120) || null;
      if (text.length < 2) return json({ error: 'Wpisz treść uwag.' }, 400);
      const { count } = await admin.from('sign_notes').select('id', { count: 'exact', head: true }).eq('request_id', r.id);
      if ((count || 0) >= 30) return json({ error: 'Osiągnięto limit uwag – skontaktuj się z biurem telefonicznie lub e-mailem.' }, 429);
      const { error: e1 } = await admin.from('sign_notes').insert({ request_id: r.id, body: text, author });
      if (e1) return json({ error: 'Nie udało się zapisać uwag – spróbuj ponownie.' }, 500);
      const who = author ? `${author} (${r.clients?.name || 'klient'})` : (r.clients?.name || 'Klient');
      await notifyTeam(r, `Uwagi do dokumentu: ${r.title} – ${r.clients?.name || ''}`, 'Klient zgłosił uwagi do dokumentu',
        `${who} zgłosił(a) uwagi do dokumentu „${r.title}”:\n\n${text}\n\nOdpowiedz klientowi e-mailem lub telefonicznie. W razie zmian w umowie wyślij nową wersję do podpisu.`,
        `<p><b>${escH(who)}</b> zgłosił(a) uwagi do dokumentu „${escH(r.title)}”:</p><blockquote style="margin:12px 0;padding:10px 14px;background:#F3F4F6;border-left:3px solid #2563EB;border-radius:6px;white-space:pre-wrap">${escH(text)}</blockquote>`,
        `Odpowiedz klientowi (${r.email || 'e-mail z prośby'}). Jeśli trzeba zmienić umowę, wyślij nową wersję do podpisu – poprzedni link możesz anulować w archiwum klienta.`);
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

    if (action === 'send') {
      const { data: c } = await sb.from('clients').select('id, name').eq('id', String(body.client_id || '')).maybeSingle();   // RLS: tylko klienci tej osoby
      if (!c) return json({ error: 'Brak dostępu do klienta' }, 403);
      const to = String(body.to || '').trim().toLowerCase();
      if (!emailOk(to)) return json({ error: 'Nieprawidłowy adres e-mail klienta' }, 400);
      const title = String(body.title || 'Umowa').trim().slice(0, 160) || 'Umowa';
      const subject = String(body.subject || '').trim().slice(0, 200), text0 = String(body.body || '').slice(0, 8000);
      if (!subject || !text0.trim()) return json({ error: 'Pusty temat lub treść' }, 400);
      const b64 = String(body.attachment?.base64 || '').replace(/\s+/g, '');
      if (!b64 || b64.length > 14_000_000 || !/^[A-Za-z0-9+/=]+$/.test(b64)) return json({ error: 'Brak albo zbyt duży plik PDF' }, 400);
      if (!SMTP_USER || !SMTP_PASS) return json({ error: 'not_configured', detail: 'Brak konfiguracji wysyłki e-mail (SMTP).' }, 200);
      const bytes = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
      const docHtml = typeof body.doc_html === 'string' && body.doc_html.length <= 1_500_000 ? body.doc_html : null;
      const fname = `${title}.pdf`.replace(/[\\/:*?"<>|\r\n]+/g, ' ');
      const path = `${c.id}/do-podpisu-${crypto.randomUUID().slice(0, 8)}-${safeName(fname)}`;
      const { error: e1 } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: 'application/pdf', upsert: false });
      if (e1) return json({ error: 'Nie udało się zapisać dokumentu' }, 500);
      const { data: cf, error: e2 } = await admin.from('client_files').insert({ client_id: c.id, category: 'umowa', name: `${title} – wysłana do podpisu.pdf`.slice(0, 200), note: `Wysłana do podpisu na ${to}`.slice(0, 500), path, mime: 'application/pdf', size: bytes.length, uploaded_by: memberId }).select('id').single();
      if (e2) { await admin.storage.from(BUCKET).remove([path]); return json({ error: 'Nie udało się zapisać dokumentu' }, 500); }
      const token = [...crypto.getRandomValues(new Uint8Array(24))].map(b => b.toString(16).padStart(2, '0')).join('');
      const { data: rq, error: e3 } = await admin.from('sign_requests').insert({ client_id: c.id, token, title, email: to, file_id: cf.id, created_by: memberId, doc_html: docHtml }).select('id').single();
      if (e3) return json({ error: 'Nie udało się utworzyć prośby o podpis' }, 500);
      const S = await settings();
      const link = `${S.app}/podpis/?t=${token}`;
      const textBody = text0.replaceAll('{link}', link);
      const { data: me } = await admin.from('team_members').select('full_name, email').eq('id', memberId).single();
      const sig = await signatureOf(me, S.from);
      const btn = `<p style="margin:20px 0"><a href="${link}" style="display:inline-block;background:#2563EB;color:#ffffff;text-decoration:none;padding:13px 22px;border-radius:10px;font-weight:bold;font-family:Arial,Helvetica,sans-serif;font-size:15px">Przeczytaj i podpisz online</a></p>`;
      const html = bodyHtml(textBody) + btn + (sig.sigHtml ? '<br>' + sig.sigHtml : bodyHtml(sig.text));
      try {
        await transport().sendMail({ from: { name: FROM_NAME, address: S.from }, replyTo: me?.email && emailOk(me.email) ? me.email : S.from, to, subject, text: textBody + '\n' + sig.text, html });
      } catch (e) {
        const m = String((e as Error).message || e);
        await admin.from('sign_requests').update({ status: 'anulowano' }).eq('id', rq.id);
        return json({ error: 'send_failed', detail: m.slice(0, 300) }, 200);
      }
      await admin.from('client_messages').insert({ client_id: c.id, kind: 'informacja', period: null, email: to, subject, body: textBody + `\n\n[dokument do podpisu online: ${fname}]`, sender_name: me?.full_name || null, status: 'wyslano', sent_by: memberId });
      return json({ ok: true, id: rq.id, link });
    }
    return json({ error: 'Nieznana operacja' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: 'Wystąpił błąd – spróbuj ponownie.' }, 500);
  }
});
