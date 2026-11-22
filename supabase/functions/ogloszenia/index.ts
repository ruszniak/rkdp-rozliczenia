// „Co nowego” – e-mail do osób z listy ogłoszenia (tabela ogloszenia). Wywoływane z bazy (wyzwalacz po dodaniu) z sekretem x-push-secret.
// Jak przy nowym zadaniu: własny adres do powiadomień z profilu, poza godzinami powiadomień – do kolejki (wysyłka zbiorcza w funkcji mail).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.9.16';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const SMTP_USER = (Deno.env.get('SMTP_USER') || '').trim(), SMTP_PASS = (Deno.env.get('SMTP_PASS') || '').replace(/\s+/g, '');
let smtp: any = null;
const transport = () => smtp || (smtp = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: SMTP_USER, pass: SMTP_PASS } }));
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
const emailOk = (e: string) => /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/.test(e);
const escH = (t: string) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const WD: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const toMin = (s: string) => { const [h, m] = String(s || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
function windowOpen(w: any, at = new Date()): boolean {
  if (!w?.on) return true;
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Warsaw', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at).map(x => [x.type, x.value]));
  const day = WD[p.weekday] || 1, min = (+p.hour % 24) * 60 + +p.minute, days: number[] = Array.isArray(w.days) ? w.days.map(Number) : [];
  const f = toMin(w.from), t = toMin(w.to);
  if (f === t) return days.includes(day);
  if (f < t) return days.includes(day) && min >= f && min < t;
  if (min >= f) return days.includes(day);
  return days.includes(day === 1 ? 7 : day - 1) && min < t;
}

async function send(id: string) {
  const { data: o } = await admin.from('ogloszenia').select('id, title, items, url, audience').eq('id', id).maybeSingle();
  if (!o?.audience?.length) return { sent: 0 };
  const ids = (o.audience as string[]).slice(0, 30);
  const [{ data: ms }, { data: pf }, { data: st }] = await Promise.all([
    admin.from('team_members').select('id, full_name, email, active').in('id', ids),
    admin.from('member_profiles').select('member_id, notify_email, notify_window').in('member_id', ids),
    admin.from('app_settings').select('key,value').in('key', ['mail_from', 'mail_sender', 'app_url', 'app_mail_from']),
  ]);
  const S = Object.fromEntries((st || []).map((x: any) => [x.key, (x.value || '').trim()]));
  const from = S.app_mail_from || S.mail_from || S.mail_sender || SMTP_USER, app = (S.app_url || 'https://app.ruszniak.io').replace(/\/$/, '');
  const P = new Map((pf || []).map((r: any) => [r.member_id, r]));
  const items: string[] = Array.isArray(o.items) ? o.items.map(String) : [];
  const link = `${app}/#/pulpit`;
  const subject = `Co nowego w rdp.app: ${o.title}`.slice(0, 200);
  let sent = 0, queued = 0;
  for (const m of ms || []) {
    if (m.active === false) continue;
    const pr: any = P.get(m.id);
    const addr = pr?.notify_email && emailOk(String(pr.notify_email)) ? String(pr.notify_email) : String(m.email || '');
    if (!emailOk(addr)) continue;
    const hi = `Cześć ${String(m.full_name || '').split(' ')[0]},`;
    const text = [hi, '', o.title, '', ...items.map(t => '• ' + t), '', o.url ? `Więcej: ${o.url}` : '', `Otwórz aplikację: ${link}`, '',
      'Po zalogowaniu zobaczysz to samo w okienku „Co nowego”. Nie odpowiadaj na tego maila.'].filter((x, i, a) => !(x === '' && a[i - 1] === '')).join('\n');
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#1D1A16;max-width:600px">`
      + `<p style="margin:0 0 6px;color:#2D4A8A;font-weight:700;letter-spacing:.06em;text-transform:uppercase;font-size:12px">Co nowego w rdp.app</p>`
      + `<h2 style="margin:0 0 12px;font-size:19px">${escH(o.title)}</h2><p style="margin:0 0 10px">${escH(hi)}</p>`
      + `<ul style="padding-left:20px;margin:0 0 12px">${items.map(t => `<li style="margin:0 0 8px">${escH(t)}</li>`).join('')}</ul>`
      + (o.url ? `<p><a href="${escH(o.url)}" style="color:#2D4A8A;font-weight:700">Więcej</a></p>` : '')
      + `<p style="margin:18px 0"><a href="${link}" style="background:#2D4A8A;color:#fff;text-decoration:none;padding:11px 20px;border-radius:30px;font-weight:700">Otwórz aplikację</a></p>`
      + `<p style="color:#5E564C;font-size:12px">Wiadomość wysłana automatycznie z rdp.app – nie odpowiadaj na nią. Po zalogowaniu zobaczysz to samo w okienku „Co nowego”.</p></div>`;
    if (!windowOpen(pr?.notify_window)) {
      await admin.from('notify_queue').insert({ member_id: m.id, channel: 'mail', category: 'zadania', title: subject, body: text, html, url: link });
      queued++; continue;
    }
    if (!SMTP_USER || !SMTP_PASS) continue;
    try { await transport().sendMail({ from: { name: 'rdp.app – co nowego', address: from }, to: addr, subject, text, html }); sent++; }
    catch (e) { console.error('ogloszenia', e); }
  }
  return { sent, queued };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Metoda niedozwolona' }, 405);
  try {
    const hook = req.headers.get('x-push-secret') || '';
    const { data: pc } = await admin.rpc('push_get_config');
    const sec = pc?.push_hook_secret || '';
    if (!hook || !sec || hook.length !== sec.length || hook !== sec) return json({ error: 'Brak dostępu' }, 401);
    const body = await req.json().catch(() => ({}));
    return json(await send(String(body.id || '')));
  } catch (e) {
    console.error(e);
    return json({ error: 'Błąd' }, 500);
  }
});
