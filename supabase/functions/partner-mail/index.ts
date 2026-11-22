// E-maile o zadaniach od biur rachunkowych (Program Partner M2 TAX) – wywoływane z bazy (zlecenie_notify) zamiast „mail”
// dla zadań z m2_client_id. Teksty z punktu widzenia biura (pytanie → odpowiedź doradcy) i doradcy (nowe pytanie od biura).
// Wysyłka SMTP z adresu biura aplikacji; nadawca „M2 TAX Doradcy Podatkowi”. Dostęp tylko z sekretem x-push-secret (Vault).
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
const isPartner = (m: any) => (m?.modules || []).includes('partner') && !(m?.modules || []).some((x: string) => x === 'rozliczenia' || x === 'doradztwo');
const first = (n: string) => String(n || '').split(' ')[0];

async function settings() {
  const { data } = await admin.from('app_settings').select('key,value').in('key', ['mail_from', 'mail_sender', 'app_url', 'app_mail_from']);
  const m = Object.fromEntries((data || []).map((x: any) => [x.key, (x.value || '').trim()]));
  // biura partnerskie (klienci M2 TAX) i doradcy – z adresu aplikacji (app@ruszniak.io)
  return { from: m.app_mail_from || m.mail_from || m.mail_sender || SMTP_USER, app: (m.app_url || 'https://app.ruszniak.io').replace(/\/$/, '') };
}

async function send(b: any) {
  const ev = String(b.ev || '');
  const { data: z } = await admin.from('zlecenia').select('id, no, title, body, assignee_id, created_by, helpers, due_date, priority, m2_client_id, m2_clients(name)').eq('id', String(b.id || '')).maybeSingle();
  if (!z?.m2_client_id) return { sent: 0, reason: 'nie zadanie biura' };
  const office = (z as any).m2_clients?.name || 'biuro';
  // odbiorcy: nowe / dodatkowe pytanie / odpowiedź biura → doradca (i drugi doradca przy nowym); odpowiedź doradcy / pytanie doradcy → zlecający z biura;
  // zamknięcie / anulowanie → wszyscy przy zadaniu poza osobą, która to zrobiła
  let ids: string[] = [];
  if (ev === 'nowe') ids = [z.assignee_id, ...(z.helpers || [])];
  else if (['poprawka', 'odpowiedz'].includes(ev)) ids = [z.assignee_id];
  else if (['zgloszone', 'pytanie'].includes(ev)) ids = [z.created_by];
  else if (['zaakceptowane', 'zamkniete', 'anulowane'].includes(ev)) ids = [z.assignee_id, z.created_by, ...(z.helpers || [])];
  else return { sent: 0, reason: 'zdarzenie bez e-maila' };
  ids = [...new Set(ids.filter(x => x && x !== b.actor))].slice(0, 6);
  if (!ids.length || !SMTP_USER || !SMTP_PASS) return { sent: 0 };
  const { data: ms } = await admin.from('team_members').select('id, full_name, email, modules, active').in('id', [...ids, z.created_by, z.assignee_id, b.actor].filter(Boolean));
  const M = new Map((ms || []).map((m: any) => [m.id, m]));
  const { data: last } = await admin.from('zlecenia_wpisy').select('body').eq('zlecenie_id', z.id).order('created_at', { ascending: false }).limit(1);
  const note = ev === 'nowe' ? (z.body || '') : (last?.[0]?.body || '');
  const S = await settings();
  const actor = M.get(b.actor) || M.get(ev === 'nowe' ? z.created_by : z.assignee_id);
  let sent = 0;
  for (const id of ids) {
    const to = M.get(id);
    if (!to?.active || !emailOk(String(to.email || ''))) continue;
    const { data: pr } = await admin.from('member_profiles').select('notify_email').eq('member_id', id).maybeSingle();
    const addr = pr?.notify_email && emailOk(String(pr.notify_email)) ? String(pr.notify_email) : String(to.email);
    const forOffice = isPartner(to);
    const link = `${S.app}/#/${forOffice ? 'zadania' : 'zlecenia'}/${z.id}`;
    const who = actor?.full_name || '';
    const HEAD: Record<string, string> = forOffice ? {
      zgloszone: 'Doradca odpowiedział na Państwa pytanie', pytanie: `${first(who) || 'Doradca'} prosi o doprecyzowanie`,
      zaakceptowane: 'Zadanie zamknięte', zamkniete: 'Zadanie zamknięte przez doradcę', anulowane: 'Zadanie anulowane',
    } : {
      nowe: `Nowe zadanie od biura ${office}`, poprawka: `${office} dopytuje (${first(who)})`, odpowiedz: `${office} odpowiada na Twoje pytanie`,
      zaakceptowane: `${office} zamknęło zadanie – dziękuje za odpowiedź`, zamkniete: 'Zadanie biura zamknięte', anulowane: `${office} anulowało zadanie`,
    };
    const head = HEAD[ev] || 'Zadanie';
    const subject = `${head} – #${z.no}: ${z.title}`.slice(0, 200);
    const LBL: Record<string, string> = { zgloszone: 'Odpowiedź doradcy', pytanie: 'Pytanie doradcy', poprawka: 'Dodatkowe pytanie', odpowiedz: 'Odpowiedź biura', nowe: 'Treść' };
    const cta = forOffice ? (ev === 'pytanie' ? 'Odpowiedz w aplikacji' : 'Otwórz zadanie') : (ev === 'nowe' ? 'Otwórz i włącz licznik czasu' : 'Otwórz zadanie');
    const text = [head, '', `„${z.title}”`, forOffice ? '' : `Biuro: ${office}${who && ev !== 'zamkniete' ? ` · ${who}` : ''}`, z.due_date ? `Odpowiedź potrzebna do: ${z.due_date.split('-').reverse().join('.')}` : '',
      z.priority === 'pilne' ? 'PILNE' : '', note ? `\n${LBL[ev] || 'Wiadomość'}:\n${note}` : '', '', `${cta}: ${link}`, '',
      'Nie odpowiadaj na tego maila – pisz w zadaniu w aplikacji rdp.app.'].filter((x, i, a) => !(x === '' && a[i - 1] === '')).join('\n');
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#1D1A16;max-width:560px">`
      + `<p style="margin:0 0 6px;color:#7A5A37;font-weight:700;letter-spacing:.06em;text-transform:uppercase;font-size:12px">${forOffice ? 'M2 TAX · Program Partner' : 'Zadanie od biura'} · #${z.no}</p>`
      + `<h2 style="margin:0 0 12px;font-size:19px">${escH(head)}</h2>`
      + `<p style="margin:0 0 6px;font-size:16px"><b>${escH(z.title)}</b></p>`
      + (forOffice ? '' : `<div>Biuro: <b>${escH(office)}</b>${who && ev !== 'zamkniete' ? ` · ${escH(who)}` : ''}</div>`)
      + (z.due_date ? `<div>Odpowiedź potrzebna do: <b>${z.due_date.split('-').reverse().join('.')}</b></div>` : '')
      + (z.priority === 'pilne' ? '<div><b style="color:#A4462F">PILNE</b></div>' : '')
      + (note ? `<p style="margin:12px 0 4px;color:#7A5A37;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.05em">${escH(LBL[ev] || 'Wiadomość')}</p><p style="white-space:pre-wrap;background:#F8F5F0;padding:10px 12px;border-radius:8px;margin:0">${escH(note.slice(0, 4000))}</p>` : '')
      + `<p style="margin:18px 0"><a href="${link}" style="background:#7A5A37;color:#fff;text-decoration:none;padding:11px 20px;border-radius:30px;font-weight:700">${escH(cta)}</a></p>`
      + `<p style="color:#8A8C92;font-size:12px">Nie odpowiadaj na tego maila – pisz w zadaniu w aplikacji rdp.app.${forOffice ? '<br>M2 TAX Doradcy Podatkowi Otręba Ruszniak sp. p. · kancelaria@m2tax.pl · 883 643 565' : ''}</p></div>`;
    try {
      await transport().sendMail({ from: { name: forOffice ? 'M2 TAX Doradcy Podatkowi' : 'rdp.app – zadania biur', address: S.from }, to: addr, subject, text, html });
      sent++;
    } catch (e) { console.error('partner-mail', e); }
  }
  return { sent };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Metoda niedozwolona' }, 405);
  try {
    const hook = req.headers.get('x-push-secret') || '';
    const { data: pc } = await admin.rpc('push_get_config');
    const sec = pc?.push_hook_secret || '';
    if (!hook || !sec || hook.length !== sec.length || hook !== sec) return json({ error: 'Brak dostępu' }, 401);
    const body = await req.json().catch(() => ({}));
    return json(await send(body));
  } catch (e) {
    console.error(e);
    return json({ error: 'Błąd' }, 500);
  }
});
