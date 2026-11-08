// Umawianie spotkań – strona internetowa (bez logowania) i aplikacja (zespół). Zastępuje Zoho Bookings.
//  Publiczne (okienko rezerwacji na rkdp.pl / m2tax.pl, strona /umow w aplikacji):
//   • config                       – rodzaje spotkań, doradcy, zasady
//   • slots   {type_id, advisor, from, to}           – wolne godziny (grafik − Kalendarz Google − spotkania)
//   • book    {type_id, advisor, start, name, email, phone, topic, consent, hp, ms}
//   • manage  {token} / cancel {token, reason} / reschedule {token, start} – z linku w e-mailu
//  Zespół (zalogowany): create, cancel_staff, reschedule_staff, day (podgląd zajętości), staff_slots
//  Harmonogram bazy (x-push-secret): cron – przypomnienia dzień przed spotkaniem.
// Wydarzenia trafiają do głównych Kalendarzy Google doradców (połączenie z profilu, funkcja „gcal”); e-maile do klientów
// wychodzą z adresu z ustawień (domyślnie app@ruszniak.io, alias konta SMTP_USER) z plikiem .ics.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.9.16';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const SB_URL = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(SB_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') || '';
const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') || '';
const API = 'https://www.googleapis.com/calendar/v3';
const TZ = 'Europe/Warsaw';
const SMTP_USER = (Deno.env.get('SMTP_USER') || '').trim(), SMTP_PASS = (Deno.env.get('SMTP_PASS') || '').replace(/\s+/g, '');
class Http extends Error { constructor(public status: number, msg: string) { super(msg); } }

// ---------- czas (strefa Warszawa) ----------
const fmtParts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
function tzOff(ms: number) {
  const p = Object.fromEntries(fmtParts.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - ms) / 60000;
}
function localToUtc(day: string, hm: string) {
  const [y, m, d] = day.split('-').map(Number), [h, mi] = hm.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let t = guess - tzOff(guess) * 60000;
  const o2 = tzOff(t); t = guess - o2 * 60000;
  return t;
}
const dayOf = (ms: number) => new Date(ms).toLocaleDateString('sv-SE', { timeZone: TZ });
const hmOf = (ms: number) => new Date(ms).toLocaleTimeString('pl-PL', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const addDays = (day: string, n: number) => { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekday = (day: string) => { const w = new Date(day + 'T12:00:00Z').getUTCDay(); return w === 0 ? 7 : w; };
const toMin = (hm: string) => { const [h, m] = hm.split(':').map(Number); return h * 60 + (m || 0); };
const minToHm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const longDate = (ms: number) => new Date(ms).toLocaleDateString('pl-PL', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const shortDate = (ms: number) => new Date(ms).toLocaleDateString('pl-PL', { timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit' });

// polskie święta (dni wolne od pracy)
function holidays(year: number) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  const easter = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const fixed = ['01-01', '01-06', '05-01', '05-03', '08-15', '11-01', '11-11', '12-24', '12-25', '12-26'].map(x => `${year}-${x}`);
  return new Set([...fixed, easter, addDays(easter, 1), addDays(easter, 49), addDays(easter, 60)]);
}
const holCache = new Map<number, Set<string>>();
const isHoliday = (day: string) => { const y = +day.slice(0, 4); if (!holCache.has(y)) holCache.set(y, holidays(y)); return holCache.get(y)!.has(day); };

// ---------- konfiguracja ----------
async function settings() {
  const [{ data: s }, { data: u }] = await Promise.all([
    admin.from('booking_settings').select('*').eq('id', 1).single(),
    admin.from('app_settings').select('value').eq('key', 'app_url').maybeSingle(),
  ]);
  return { ...(s || {}), app_url: (u?.value || 'https://app.ruszniak.io').replace(/\/$/, '') } as any;
}
async function hookSecret() { const { data } = await admin.rpc('push_get_config'); return data?.push_hook_secret || ''; }

// ---------- Google ----------
const tokenCache = new Map<string, { token: string; exp: number }>();
async function gToken(memberId: string): Promise<string | null> {
  if (!CLIENT_ID || !CLIENT_SECRET) return null;
  const c = tokenCache.get(memberId);
  if (c && c.exp > Date.now() + 60_000) return c.token;
  const { data: link } = await admin.from('gcal_links').select('scopes').eq('member_id', memberId).maybeSingle();
  if (!link || !/calendar\.events(\s|$)/.test(link.scopes || '')) return null;
  const { data: rt } = await admin.rpc('gcal_token', { p_member: memberId });
  if (!rt) return null;
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: rt, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'refresh_token' }) });
  const j = await r.json();
  if (!r.ok) { console.error('google token', memberId, j.error); return null; }
  tokenCache.set(memberId, { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 });
  return j.access_token;
}
async function gapi(token: string, method: string, path: string, body?: unknown) {
  const r = await fetch(API + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 204) return { ok: true, status: 204, data: null as any };
  const data = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, data };
}
type Busy = { s: number; e: number; mid?: string; label?: string };
// kalendarze osoby: zapis spotkań (np. kancelaria@m2tax.pl) i sprawdzanie konfliktów (np. prywatny kalendarz)
const calCache = new Map<string, { w: string; b: string[]; at: number }>();
async function cals(memberId: string) {
  const c = calCache.get(memberId);
  if (c && Date.now() - c.at < 60_000) return c;
  const { data } = await admin.from('booking_members').select('write_calendar,busy_calendars').eq('member_id', memberId).maybeSingle();
  const r = { w: data?.write_calendar || 'primary', b: [...new Set([...(data?.busy_calendars || ['primary']), data?.write_calendar || 'primary'])], at: Date.now() };
  calCache.set(memberId, r);
  return r;
}
async function googleBusy(memberId: string, fromMs: number, toMs: number): Promise<Busy[] | null> {
  const t = await gToken(memberId);
  if (!t) return null;
  const { b } = await cals(memberId);
  const r = await gapi(t, 'POST', '/freeBusy', { timeMin: new Date(fromMs).toISOString(), timeMax: new Date(toMs).toISOString(), timeZone: TZ, items: b.map(id => ({ id })) });
  if (!r.ok) { console.error('freebusy', memberId, r.status, r.data?.error?.message); return null; }
  const out: Busy[] = [];
  for (const [id, v] of Object.entries(r.data?.calendars || {})) {
    if ((v as any).errors?.length) console.error('freebusy cal', id, JSON.stringify((v as any).errors));
    for (const x of (v as any).busy || []) out.push({ s: Date.parse(x.start), e: Date.parse(x.end) });
  }
  return out;
}

// ---------- wolne terminy ----------
type Opts = { members: string[]; from: string; to: string; dur: number; staff?: boolean; exclude?: string };
async function computeSlots(S: any, o: Opts) {
  const now = Date.now();
  const earliest = o.staff ? now : now + (S.min_notice_h || 0) * 3600_000;
  const today = dayOf(now);
  let from = o.from < today ? today : o.from;
  let to = o.to;
  if (!o.staff) { const last = addDays(today, S.max_days || 28); if (to > last) to = last; }
  if (to > addDays(from, 62)) to = addDays(from, 62);
  if (to < from) return { slots: [] as any[], busy: new Map<string, Busy[]>(), google: {} as Record<string, boolean> };
  const fromMs = localToUtc(from, '00:00'), toMs = localToUtc(addDays(to, 1), '00:00');
  const [{ data: hours }, { data: days }, { data: mm }] = await Promise.all([
    admin.from('booking_hours').select('member_id,weekday,ranges').in('member_id', o.members),
    admin.from('booking_days').select('member_id,day,ranges').in('member_id', o.members).gte('day', from).lte('day', to),
    admin.from('meeting_members').select('meeting_id,member_id,meetings!inner(start_at,end_at,status)').in('member_id', o.members).eq('active', true)
      .gte('meetings.end_at', new Date(fromMs).toISOString()).lte('meetings.start_at', new Date(toMs).toISOString()),
  ]);
  const busy = new Map<string, Busy[]>(), google: Record<string, boolean> = {};
  const excl = o.exclude ? (mm || []).find((x: any) => x.meeting_id === o.exclude) : null;
  const exS = excl ? Date.parse((excl as any).meetings.start_at) : 0, exE = excl ? Date.parse((excl as any).meetings.end_at) : 0;
  await Promise.all(o.members.map(async m => {
    const own = (mm || []).filter((x: any) => x.member_id === m && x.meeting_id !== o.exclude && x.meetings.status === 'confirmed')
      .map((x: any) => ({ s: Date.parse(x.meetings.start_at), e: Date.parse(x.meetings.end_at), mid: x.meeting_id }));
    const g = await googleBusy(m, fromMs, toMs);
    google[m] = !!g;
    busy.set(m, [...own, ...(g || []).filter(b => !(excl && b.s === exS && b.e === exE))]);
  }));
  const step = Math.max(5, S.step_min || 30), buf = (S.buffer_min || 0) * 60000, dur = o.dur * 60000;
  const out: { day: string; t: string; start: number; members: string[] }[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const holiday = isHoliday(d);
    const byTime = new Map<number, string[]>();
    for (const m of o.members) {
      const ov = (days || []).find((x: any) => x.member_id === m && x.day === d);
      const ranges: string[][] = ov ? ov.ranges : holiday ? [] : ((hours || []).find((x: any) => x.member_id === m && x.weekday === weekday(d))?.ranges || []);
      // na stronie: tylko doradcy z połączonym Kalendarzem Google (inaczej nie znamy ich zajętości)
      if (!o.staff && !google[m]) continue;
      const bz = busy.get(m) || [];
      const count = bz.filter(b => b.mid && dayOf(b.s) === d).length;
      if (!o.staff && count >= (S.max_per_day || 99)) continue;
      for (const [a, b] of ranges) {
        const ra = toMin(a), rb = toMin(b);
        for (let t = ra; t + o.dur <= rb; t += step) {
          const s = localToUtc(d, minToHm(t)), e = s + dur;
          if (s < earliest) continue;
          if (bz.some(x => x.s - buf < e && x.e + buf > s)) continue;
          if (!byTime.has(s)) byTime.set(s, []);
          byTime.get(s)!.push(m);
        }
      }
    }
    for (const [s, ms] of [...byTime.entries()].sort((a, b) => a[0] - b[0])) out.push({ day: d, t: hmOf(s), start: s, members: ms });
  }
  return { slots: out, busy, google };
}

// ---------- e-mail ----------
let smtp: any = null;
const transport = () => smtp || (smtp = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: SMTP_USER, pass: SMTP_PASS } }));
const esc = (t: string) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const icsEsc = (t: string) => String(t ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsT = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
function ics(m: any, summary: string, where: string, desc: string, cancelled = false, seq = 0) {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//RKDP//Spotkania//PL', 'CALSCALE:GREGORIAN', `METHOD:${cancelled ? 'CANCEL' : 'PUBLISH'}`, 'BEGIN:VEVENT',
    `UID:${m.id}@spotkania.rkdp.pl`, `DTSTAMP:${icsT(Date.now())}`, `DTSTART:${icsT(Date.parse(m.start_at))}`, `DTEND:${icsT(Date.parse(m.end_at))}`,
    `SEQUENCE:${seq}`, `SUMMARY:${icsEsc(summary)}`, `LOCATION:${icsEsc(where)}`, `DESCRIPTION:${icsEsc(desc)}`, `STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    ...(cancelled ? [] : ['BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(summary)}`, 'END:VALARM']),
    'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
}
type Ctx = { S: any; m: any; type: any; advisors: any[] };
const CHANNEL: Record<string, string> = { rkdp: 'strona rkdp.pl', m2tax: 'strona m2tax.pl', link: 'link do rezerwacji', app: 'w aplikacji' };
function whereOf(c: Ctx) { return c.m.mode === 'meet' ? (c.m.meet_url ? `Google Meet: ${c.m.meet_url}` : 'Google Meet (link w wiadomości)') : c.m.mode === 'phone' ? 'Rozmowa telefoniczna' : (c.m.place || ''); }
async function mailClient(c: Ctx, kind: 'potwierdzenie' | 'zmiana' | 'odwolanie' | 'przypomnienie') {
  const { S, m, type, advisors } = c;
  if (!m.client_email || !m.notify_client) return false;
  if (!SMTP_USER || !SMTP_PASS) { console.error('brak SMTP – e-mail nie wysłany'); return false; }
  const s = Date.parse(m.start_at), e = Date.parse(m.end_at);
  const when = `${longDate(s)}, ${hmOf(s)}–${hmOf(e)}`;
  const adv = advisors.map(a => a.full_name + (a.job_title ? `, ${a.job_title.toLowerCase()}` : '')).join(' · ') || 'Doradca podatkowy';
  const tname = type?.name || m.title || 'Spotkanie';
  const manage = `${S.app_url}/umow/?t=${m.token}`;
  const first = String(m.client_name || '').trim().split(/\s+/)[0];
  const head = { potwierdzenie: 'Spotkanie potwierdzone', zmiana: 'Zmieniliśmy termin spotkania', odwolanie: 'Spotkanie odwołane', przypomnienie: 'Przypomnienie o jutrzejszym spotkaniu' }[kind];
  const subj = { potwierdzenie: 'Potwierdzenie', zmiana: 'Nowy termin', odwolanie: 'Odwołane', przypomnienie: 'Przypomnienie' }[kind] + `: spotkanie ${shortDate(s)}, ${hmOf(s)}`;
  const intro = {
    potwierdzenie: 'dziękujemy za umówienie spotkania. Poniżej szczegóły – do zobaczenia!',
    zmiana: 'termin spotkania został zmieniony. Aktualne szczegóły poniżej.',
    odwolanie: 'spotkanie zostało odwołane. Jeśli chcesz umówić nowy termin, skorzystaj z przycisku poniżej.',
    przypomnienie: 'przypominamy o spotkaniu. Szczegóły poniżej.',
  }[kind];
  const where = whereOf(c);
  const whereHtml = m.mode === 'meet' && m.meet_url ? `<a href="${esc(m.meet_url)}" style="color:#7A5A28;font-weight:bold;">Dołącz przez Google Meet</a>`
    : m.mode === 'office' ? `${esc(m.place || '')}${type?.map_url ? ` · <a href="${esc(type.map_url)}" style="color:#7A5A28;">mapa</a>` : ''}` : esc(where);
  const row = (k: string, v: string) => `<tr><td style="padding:6px 14px 6px 0;color:#6B6F76;font-size:13px;vertical-align:top;white-space:nowrap;">${k}</td><td style="padding:6px 0;font-size:14px;font-weight:bold;color:#1A1C20;">${v}</td></tr>`;
  const btn = (href: string, label: string, primary: boolean) => `<a href="${esc(href)}" style="display:inline-block;margin:0 8px 8px 0;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:14px;${primary ? 'background:#9A7740;color:#ffffff;' : 'background:#ffffff;color:#1A1C20;border:1px solid #E2DCCF;'}">${label}</a>`;
  const html = `<!doctype html><html><body style="margin:0;background:#F2F0EC;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#1A1C20;">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;">
<div style="background:#1A1C20;padding:18px 24px;color:#ffffff;font-size:17px;font-weight:bold;letter-spacing:.3px;">Spotkanie z Doradcą Podatkowym</div>
<div style="padding:24px;">
<div style="font-size:21px;font-weight:bold;margin:0 0 10px;">${head}</div>
<p style="font-size:14px;line-height:1.6;margin:0 0 16px;">${first ? `Dzień dobry ${esc(first)}, ` : 'Dzień dobry, '}${intro}</p>
<table style="border-collapse:collapse;background:#FBF8F2;border-radius:10px;width:100%;" cellpadding="0" cellspacing="0"><tr><td style="padding:12px 16px;"><table cellpadding="0" cellspacing="0">
${row('Termin', esc(when))}${row('Rodzaj', esc(tname))}${row('Doradca', esc(adv))}${row(m.mode === 'office' ? 'Miejsce' : 'Gdzie', whereHtml)}
</table></td></tr></table>
<div style="margin-top:18px;">${kind === 'odwolanie' ? btn(`${S.app_url}/umow/`, 'Umów nowy termin', true) : btn(manage, 'Zmień termin lub odwołaj', false)}</div>
${kind !== 'odwolanie' ? `<p style="font-size:12.5px;color:#6B6F76;line-height:1.55;margin:12px 0 0;">W załączniku jest plik do dodania spotkania do kalendarza. ${kind === 'potwierdzenie' ? 'Dzień przed spotkaniem wyślemy przypomnienie. ' : ''}Jeśli masz dokumenty dotyczące sprawy, możesz odpowiedzieć na tę wiadomość i je dołączyć.</p>` : ''}
</div>
<div style="border-top:1px solid #EFEAE0;padding:14px 24px;font-size:11.5px;color:#8A8F97;line-height:1.5;">RKDP spółka doradztwa podatkowego sp. z o.o. · M2 TAX Doradcy Podatkowi · tel. 883 643 565<br>Wiadomość wysłana automatycznie po umówieniu spotkania.</div>
</div></body></html>`;
  const text = [`${head}`, '', `${first ? `Dzień dobry ${first}, ` : 'Dzień dobry, '}${intro}`, '', `Termin: ${when}`, `Rodzaj: ${tname}`, `Doradca: ${adv}`, `${m.mode === 'office' ? 'Miejsce' : 'Gdzie'}: ${where}`,
    ...(m.mode === 'office' && type?.map_url ? [`Mapa: ${type.map_url}`] : []), '', kind === 'odwolanie' ? `Nowy termin: ${S.app_url}/umow/` : `Zmiana terminu lub odwołanie: ${manage}`, '', 'tel. 883 643 565'].join('\n');
  const desc = [m.mode === 'meet' && m.meet_url ? `Google Meet: ${m.meet_url}` : '', `Doradca: ${adv}`, `Zmiana lub odwołanie: ${manage}`].filter(Boolean).join('\n');
  const replyTo = advisors[0]?.email || S.from_email;
  await transport().sendMail({
    from: { name: S.from_name || 'Spotkanie z Doradcą Podatkowym', address: S.from_email || SMTP_USER }, replyTo, to: m.client_email, subject: subj, text, html,
    attachments: [{ filename: kind === 'odwolanie' ? 'odwolane.ics' : 'spotkanie.ics', content: ics(m, `Spotkanie z doradcą podatkowym – ${tname}`, where, desc, kind === 'odwolanie', Math.floor(Date.now() / 1000) % 100000), contentType: `text/calendar; charset=utf-8; method=${kind === 'odwolanie' ? 'CANCEL' : 'PUBLISH'}` }],
  });
  return true;
}

// ---------- Kalendarz Google: wydarzenia doradców ----------
function eventBody(c: Ctx, withMeet: boolean, meetUrl: string | null) {
  const { S, m, type } = c;
  const who = m.private ? (m.title || 'Spotkanie') : `${m.client_name || m.title || 'Spotkanie'} – ${type?.name || m.title || 'spotkanie'}`;
  const lines = [m.topic ? `Temat: ${m.topic}` : '', m.client_phone ? `Telefon: ${m.client_phone}` : '', m.client_email ? `E-mail: ${m.client_email}` : '',
    meetUrl && !withMeet ? `Google Meet: ${meetUrl}` : '', '', `W aplikacji: ${S.app_url}/#/spotkania/${m.id}`, m.source === 'www' ? `Umówione: ${CHANNEL[m.channel] || 'link do rezerwacji'}.` : ''].filter((x, i, a) => x || (i && a[i - 1]));
  const ev: any = {
    summary: who, description: lines.join('\n').trim(),
    location: m.mode === 'office' ? (m.place || '') : m.mode === 'phone' ? (m.client_phone ? `Telefon ${m.client_phone}` : 'Telefon') : (meetUrl && !withMeet ? meetUrl : ''),
    start: { dateTime: new Date(Date.parse(m.start_at)).toISOString(), timeZone: TZ }, end: { dateTime: new Date(Date.parse(m.end_at)).toISOString(), timeZone: TZ },
    colorId: m.private ? '8' : '9', visibility: m.private ? 'private' : 'default',
    extendedProperties: { private: { rkdp_meeting: m.id } },
  };
  if (m.client_email && m.notify_client && !m.private) ev.attendees = [{ email: m.client_email, displayName: m.client_name || undefined }];
  if (withMeet) ev.conferenceData = { createRequest: { requestId: m.id.replace(/-/g, ''), conferenceSolutionKey: { type: 'hangoutsMeet' } } };
  return ev;
}
// gcal: { member_id: { c: id kalendarza, e: id wydarzenia } }
async function pushEvents(c: Ctx, memberIds: string[]) {
  const gcal: Record<string, { c: string; e: string }> = { ...(c.m.gcal || {}) };
  let meet: string | null = c.m.meet_url || null;
  for (const mid of memberIds) {
    const t = await gToken(mid);
    if (!t) continue;
    const { w } = await cals(mid);
    const withMeet = c.m.mode === 'meet' && !meet;
    const body = eventBody({ ...c, m: { ...c.m, meet_url: meet } }, withMeet, meet);
    const cur = gcal[mid];
    let r = cur ? await gapi(t, 'PATCH', `/calendars/${encodeURIComponent(cur.c)}/events/${encodeURIComponent(cur.e)}?conferenceDataVersion=1&sendUpdates=none`, body) : null;
    if (!r || (!r.ok && (r.status === 404 || r.status === 410))) r = await gapi(t, 'POST', `/calendars/${encodeURIComponent(w)}/events?conferenceDataVersion=1&sendUpdates=none`, body);
    if (!r.ok) { console.error('google event', mid, r.status, r.data?.error?.message); continue; }
    gcal[mid] = { c: cur && r.data.id === cur.e ? cur.c : w, e: r.data.id };
    if (!meet && c.m.mode === 'meet') meet = r.data.hangoutLink || r.data.conferenceData?.entryPoints?.find((p: any) => p.entryPointType === 'video')?.uri || null;
  }
  return { gcal, meet };
}
async function dropEvents(m: any, memberIds?: string[]) {
  for (const [mid, ev] of Object.entries(m.gcal || {}) as [string, any][]) {
    if (memberIds && !memberIds.includes(mid)) continue;
    const t = await gToken(mid);
    if (!t || !ev?.e) continue;
    const r = await gapi(t, 'DELETE', `/calendars/${encodeURIComponent(ev.c || 'primary')}/events/${encodeURIComponent(ev.e)}?sendUpdates=none`);
    if (!r.ok && r.status !== 410 && r.status !== 404) console.error('google del', r.status);
  }
}

async function notifyTeam(id: string, ev: string, actor?: string | null) {
  try {
    const s = await hookSecret();
    if (!s) return;
    await fetch(`${SB_URL}/functions/v1/push`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-push-secret': s }, body: JSON.stringify({ event: 'spotkanie', id, ev, actor: actor || null }) });
  } catch (e) { console.error('push', e); }
}
async function ctxOf(m: any, S?: any): Promise<Ctx> {
  const [{ data: type }, { data: mm }] = await Promise.all([
    m.type_id ? admin.from('meeting_types').select('*').eq('id', m.type_id).maybeSingle() : Promise.resolve({ data: null }),
    admin.from('meeting_members').select('member_id').eq('meeting_id', m.id),
  ]);
  const ids = (mm || []).map((x: any) => x.member_id);
  const { data: adv } = ids.length ? await admin.from('team_members').select('id,full_name,job_title,email').in('id', ids) : { data: [] };
  const advisors = ids.map((i: string) => (adv || []).find((a: any) => a.id === i)).filter(Boolean);
  return { S: S || await settings(), m, type, advisors };
}

// dopasowanie klienta po e-mailu (karta RKDP albo M2 TAX)
async function matchClient(email: string) {
  const e = email.toLowerCase();
  const [{ data: c }, { data: m2 }] = await Promise.all([
    admin.from('clients').select('id').ilike('email', e).limit(1),
    admin.from('m2_clients').select('id').ilike('email', e).limit(1),
  ]);
  return { client_id: c?.[0]?.id || null, m2_client_id: m2?.[0]?.id || null };
}

// ---------- utworzenie spotkania (strona i aplikacja) ----------
async function createMeeting(S: any, row: any, memberIds: string[], actor: string | null) {
  const { data: m, error } = await admin.from('meetings').insert(row).select('*').single();
  if (error) throw error;
  const during = `[${new Date(Date.parse(m.start_at)).toISOString()},${new Date(Date.parse(m.end_at)).toISOString()})`;
  const { error: e2 } = await admin.from('meeting_members').insert(memberIds.map(mid => ({ meeting_id: m.id, member_id: mid, during })));
  if (e2) {
    await admin.from('meeting_members').delete().eq('meeting_id', m.id);
    await admin.from('meetings').delete().eq('id', m.id);
    if ((e2 as any).code === '23P01') throw new Http(409, 'Ten termin został właśnie zajęty – wybierz inną godzinę.');
    throw e2;
  }
  const c = await ctxOf(m, S);
  const { gcal, meet } = await pushEvents(c, memberIds);
  const { data: m2 } = await admin.from('meetings').update({ gcal, meet_url: meet, updated_at: new Date().toISOString() }).eq('id', m.id).select('*').single();
  c.m = m2;
  let mailed = false;
  try { mailed = await mailClient(c, 'potwierdzenie'); } catch (e) { console.error('mail', e); }
  await notifyTeam(m.id, 'nowe', actor);
  return { meeting: m2, mailed, google: Object.keys(gcal).length };
}
async function cancelMeeting(m: any, reason: string | null, actor: string | null, notifyClient: boolean) {
  if (m.status === 'cancelled') return m;
  await admin.from('meeting_members').update({ active: false }).eq('meeting_id', m.id);
  const { data: m2 } = await admin.from('meetings').update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancel_reason: reason, updated_at: new Date().toISOString() }).eq('id', m.id).select('*').single();
  await dropEvents(m);
  const c = await ctxOf(m2);
  if (notifyClient) { try { await mailClient(c, 'odwolanie'); } catch (e) { console.error('mail', e); } }
  await notifyTeam(m.id, actor ? 'odwolane_zespol' : 'odwolane', actor);
  return m2;
}
async function moveMeeting(m: any, startMs: number, actor: string | null) {
  const dur = Date.parse(m.end_at) - Date.parse(m.start_at), endMs = startMs + dur;
  const during = `[${new Date(startMs).toISOString()},${new Date(endMs).toISOString()})`;
  const { error } = await admin.from('meeting_members').update({ during }).eq('meeting_id', m.id).eq('active', true);
  if (error) { if ((error as any).code === '23P01') throw new Http(409, 'Ten termin został właśnie zajęty – wybierz inną godzinę.'); throw error; }
  const { data: m2 } = await admin.from('meetings').update({ start_at: new Date(startMs).toISOString(), end_at: new Date(endMs).toISOString(), reminder_sent_at: null, updated_at: new Date().toISOString() }).eq('id', m.id).select('*').single();
  const c = await ctxOf(m2);
  const { gcal, meet } = await pushEvents(c, c.advisors.map(a => a.id));
  const { data: m3 } = await admin.from('meetings').update({ gcal, meet_url: meet }).eq('id', m.id).select('*').single();
  c.m = m3;
  try { await mailClient(c, 'zmiana'); } catch (e) { console.error('mail', e); }
  await notifyTeam(m.id, 'zmiana', actor);
  return m3;
}

const emailOk = (e: string) => /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/.test(e);
const clean = (s: unknown, n: number) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const publicMeeting = async (m: any) => {
  const c = await ctxOf(m);
  return { id: m.id, status: m.status, start: m.start_at, end: m.end_at, type_id: m.type_id, type: c.type?.name || m.title, mode: m.mode, place: m.place, meet_url: m.status === 'confirmed' ? m.meet_url : null,
    map_url: c.type?.map_url || null, advisors: c.advisors.map(a => ({ id: a.id, name: a.full_name })), client_name: m.client_name, can_change: m.status === 'confirmed' && Date.parse(m.start_at) > Date.now() + 2 * 3600_000 };
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Metoda niedozwolona' }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');
    const S = await settings();

    // ===== publiczne =====
    if (action === 'config') {
      const { data: types } = await admin.from('meeting_types').select('id,name,duration_min,mode,place,map_url,advisors,description,sort').eq('active', true).eq('public', true).order('sort');
      const ids = [...new Set((types || []).flatMap((t: any) => t.advisors || []))];
      const { data: adv } = ids.length ? await admin.from('team_members').select('id,full_name,job_title,active,avatar').in('id', ids) : { data: [] };
      return json({
        types, max_days: S.max_days, min_notice_h: S.min_notice_h,
        advisors: (adv || []).filter((a: any) => a.active).map((a: any) => ({ id: a.id, name: a.full_name, title: a.job_title || 'Doradca podatkowy', initials: a.full_name.split(/\s+/).map((x: string) => x[0]).join('').slice(0, 2), photo: /^data:image\/(jpeg|png|webp);base64,/.test(a.avatar || '') ? a.avatar : null })),
      });
    }
    if (action === 'slots' || action === 'book' || action === 'reschedule') {
      let type: any, members: string[], excl: string | undefined, mt: any = null;
      if (action === 'reschedule') {
        const { data } = await admin.from('meetings').select('*').eq('token', clean(body.token, 80)).maybeSingle();
        if (!data || data.status !== 'confirmed') throw new Http(404, 'Nie znaleziono aktywnego spotkania.');
        if (Date.parse(data.start_at) < Date.now() + 2 * 3600_000) throw new Http(400, 'Termin można zmienić najpóźniej 2 godziny przed spotkaniem – zadzwoń: 883 643 565.');
        mt = data; excl = data.id;
        const c = await ctxOf(data, S); type = c.type || { duration_min: (Date.parse(data.end_at) - Date.parse(data.start_at)) / 60000, advisors: c.advisors.map(a => a.id) };
        members = c.advisors.map(a => a.id);
      } else {
        const { data } = await admin.from('meeting_types').select('*').eq('id', clean(body.type_id, 40)).eq('active', true).eq('public', true).maybeSingle();
        if (!data) throw new Http(400, 'Wybierz rodzaj spotkania.');
        type = data;
        const adv = clean(body.advisor, 40);
        members = adv && adv !== 'any' ? (type.advisors || []).filter((x: string) => x === adv) : (type.advisors || []);
        if (!members.length) throw new Http(400, 'Wybierz doradcę.');
      }
      if (action === 'slots' || (action === 'reschedule' && !body.start)) {
        const from = /^\d{4}-\d{2}-\d{2}$/.test(body.from) ? body.from : dayOf(Date.now());
        const to = /^\d{4}-\d{2}-\d{2}$/.test(body.to) ? body.to : addDays(from, 34);
        const { slots } = await computeSlots(S, { members, from, to, dur: type.duration_min, exclude: excl });
        const days: Record<string, { t: string; start: string; advisors: string[] }[]> = {};
        for (const s of slots) (days[s.day] ||= []).push({ t: s.t, start: new Date(s.start).toISOString(), advisors: s.members });
        return json({ days, ...(mt ? { meeting: await publicMeeting(mt) } : {}) });
      }
      // rezerwacja albo zmiana terminu – sprawdzamy ponownie, czy godzina jest wolna
      const startMs = Date.parse(String(body.start || ''));
      if (!startMs) throw new Http(400, 'Wybierz godzinę.');
      const day = dayOf(startMs);
      const { slots } = await computeSlots(S, { members, from: day, to: day, dur: type.duration_min, exclude: excl });
      const hit = slots.find(s => s.start === startMs);
      if (!hit) throw new Http(409, 'Ta godzina jest już zajęta – wybierz inną.');
      if (action === 'reschedule') return json({ ok: true, meeting: await publicMeeting(await moveMeeting(mt, startMs, null)) });

      // nowa rezerwacja ze strony
      if (clean(body.hp, 100)) return json({ ok: true });                         // pole-pułapka dla botów
      if (Number(body.ms) > 0 && Number(body.ms) < 2500) throw new Http(400, 'Spróbuj jeszcze raz.');
      const name = clean(body.name, 120), email = clean(body.email, 160).toLowerCase(), phone = clean(body.phone, 40), topic = clean(body.topic, 1500);
      if (name.length < 3) throw new Http(400, 'Podaj imię i nazwisko.');
      if (!emailOk(email)) throw new Http(400, 'Podaj poprawny adres e-mail.');
      if (phone.replace(/\D/g, '').length < 9) throw new Http(400, 'Podaj numer telefonu.');
      if (body.consent !== true) throw new Http(400, 'Zaznacz zgodę na przetwarzanie danych.');
      const { count } = await admin.from('meetings').select('id', { count: 'exact', head: true }).eq('client_email', email).eq('status', 'confirmed').gte('start_at', new Date().toISOString());
      if ((count || 0) >= 3) throw new Http(429, 'Masz już kilka umówionych spotkań – zadzwoń do nas: 883 643 565.');
      // doradca: wybrany albo ten, kto ma tego dnia mniej spotkań
      let who = hit.members[0];
      if (hit.members.length > 1) {
        const { data: cnt } = await admin.from('meeting_members').select('member_id,meetings!inner(start_at)').in('member_id', hit.members).eq('active', true)
          .gte('meetings.start_at', new Date(localToUtc(day, '00:00')).toISOString()).lt('meetings.start_at', new Date(localToUtc(addDays(day, 1), '00:00')).toISOString());
        const n = (id: string) => (cnt || []).filter((x: any) => x.member_id === id).length;
        who = [...hit.members].sort((a, b) => n(a) - n(b) || Math.random() - .5)[0];
      }
      const match = await matchClient(email);
      const r = await createMeeting(S, {
        type_id: type.id, title: type.name, start_at: new Date(startMs).toISOString(), end_at: new Date(startMs + type.duration_min * 60000).toISOString(),
        source: 'www', channel: ['rkdp', 'm2tax', 'link'].includes(String(body.channel)) ? String(body.channel) : 'link', mode: type.mode, place: type.place, client_name: name, client_email: email, client_phone: phone, topic, ...match, notify_client: true,
      }, [who], null);
      return json({ ok: true, mailed: r.mailed, meeting: await publicMeeting(r.meeting) });
    }
    if (action === 'manage' || action === 'cancel') {
      const { data: m } = await admin.from('meetings').select('*').eq('token', clean(body.token, 80)).maybeSingle();
      if (!m) throw new Http(404, 'Nie znaleziono spotkania – link mógł się zmienić.');
      if (action === 'cancel') {
        if (m.status !== 'confirmed') return json({ ok: true, meeting: await publicMeeting(m) });
        if (Date.parse(m.start_at) < Date.now()) throw new Http(400, 'To spotkanie już się odbyło.');
        return json({ ok: true, meeting: await publicMeeting(await cancelMeeting(m, clean(body.reason, 500) || null, null, true)) });
      }
      return json({ meeting: await publicMeeting(m) });
    }

    // ===== harmonogram: przypomnienia =====
    if (action === 'cron') {
      const given = req.headers.get('x-push-secret') || '', s = await hookSecret();
      if (!given || !s || given !== s) return json({ error: 'Brak dostępu' }, 401);
      const now = Date.now();
      const { data: list } = await admin.from('meetings').select('*').eq('status', 'confirmed').eq('notify_client', true).not('client_email', 'is', null).is('reminder_sent_at', null)
        .gte('start_at', new Date(now).toISOString()).lte('start_at', new Date(now + 24 * 3600_000).toISOString());
      let sent = 0;
      for (const m of list || []) {
        const fresh = Date.parse(m.start_at) - Date.parse(m.updated_at || m.created_at) < 26 * 3600_000;   // umówione / zmienione niedawno – potwierdzenie wystarczy
        if (!fresh) { try { if (await mailClient(await ctxOf(m, S), 'przypomnienie')) sent++; } catch (e) { console.error('reminder', e); continue; } }
        await admin.from('meetings').update({ reminder_sent_at: new Date().toISOString() }).eq('id', m.id);
      }
      return json({ ok: true, sent });
    }

    // ===== zespół (zalogowany) =====
    const auth = req.headers.get('Authorization') || '';
    if (!auth.startsWith('Bearer ')) return json({ error: 'Brak dostępu' }, 401);
    const user = createClient(SB_URL, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: me } = await user.rpc('current_member_id');
    if (!me) return json({ error: 'Brak dostępu' }, 403);

    if (action === 'day' || action === 'staff_slots') {
      const members = (Array.isArray(body.members) ? body.members : [me]).map((x: unknown) => clean(x, 40)).filter(Boolean).slice(0, 8);
      const day = /^\d{4}-\d{2}-\d{2}$/.test(body.day) ? body.day : dayOf(Date.now());
      const to = action === 'staff_slots' && /^\d{4}-\d{2}-\d{2}$/.test(body.to) ? body.to : day;
      const dur = Math.max(10, Math.min(480, Number(body.duration) || 60));
      const r = await computeSlots(S, { members, from: day, to, dur, staff: true, exclude: body.exclude ? clean(body.exclude, 40) : undefined });
      // sloty, w których wolni są wszyscy wybrani
      const all = r.slots.filter(s => members.every((m: string) => s.members.includes(m))).map(s => ({ day: s.day, t: s.t, start: new Date(s.start).toISOString() }));
      if (action === 'staff_slots') return json({ slots: all, google: r.google });
      // zajętość dnia: spotkania z aplikacji z tytułem (jeśli widoczne), reszta z Google jako „zajęty”
      const ids = [...new Set([...r.busy.values()].flat().map(b => b.mid).filter(Boolean))] as string[];
      const { data: vis } = ids.length ? await user.from('meetings').select('id,title,client_name,private,type_id').in('id', ids) : { data: [] };
      const [{ data: hours }, { data: ov }] = await Promise.all([
        admin.from('booking_hours').select('member_id,weekday,ranges').in('member_id', members).eq('weekday', weekday(day)),
        admin.from('booking_days').select('member_id,ranges').in('member_id', members).eq('day', day),
      ]);
      const d0 = localToUtc(day, '00:00'), d1 = localToUtc(addDays(day, 1), '00:00');
      return json({
        slots: all, google: r.google,
        members: members.map((m: string) => ({
          id: m, hours: (ov || []).find((x: any) => x.member_id === m)?.ranges ?? (isHoliday(day) ? [] : (hours || []).find((x: any) => x.member_id === m)?.ranges || []),
          busy: (r.busy.get(m) || []).filter(b => b.e > d0 && b.s < d1).map(b => {
            const v = b.mid ? (vis || []).find((x: any) => x.id === b.mid) : null;
            return { s: hmOf(Math.max(b.s, d0)), e: b.e >= d1 ? '24:00' : hmOf(b.e), label: v ? (v.private ? (v.title || 'Prywatne') : (v.client_name || v.title || 'Spotkanie')) : b.mid ? 'Zajęty' : 'Zajęty', app: !!b.mid };
          }).filter((b, i, a) => !(b.label === 'Zajęty' && a.some((x, j) => j !== i && x.app && x.s === b.s && x.e === b.e))),
        })),
      });
    }
    if (action === 'create') {
      const members = [...new Set((Array.isArray(body.members) ? body.members : [me]).map((x: unknown) => clean(x, 40)).filter(Boolean))].slice(0, 8) as string[];
      if (!members.length) throw new Http(400, 'Wybierz osoby.');
      const startMs = Date.parse(String(body.start || ''));
      const dur = Math.max(10, Math.min(480, Number(body.duration) || 60));
      if (!startMs) throw new Http(400, 'Wybierz dzień i godzinę.');
      let type: any = null;
      if (body.type_id) { const { data } = await admin.from('meeting_types').select('*').eq('id', clean(body.type_id, 40)).maybeSingle(); type = data; }
      const priv = !!body.private;
      const email = clean(body.client_email, 160).toLowerCase();
      if (!priv && email && !emailOk(email)) throw new Http(400, 'Nieprawidłowy e-mail klienta.');
      const mode = ['meet', 'office', 'phone'].includes(body.mode) ? body.mode : (type?.mode || 'office');
      const title = clean(body.title, 200) || (priv ? 'Spotkanie' : type?.name || 'Spotkanie');
      let cid = body.client_id ? clean(body.client_id, 40) : null, m2id = body.m2_client_id ? clean(body.m2_client_id, 40) : null;
      if (!priv && email && !cid && !m2id) { const mc = await matchClient(email); cid = mc.client_id; m2id = mc.m2_client_id; }
      const r = await createMeeting(S, {
        type_id: type?.id || null, title, start_at: new Date(startMs).toISOString(), end_at: new Date(startMs + dur * 60000).toISOString(), source: 'app', channel: 'app', private: priv,
        mode, place: mode === 'office' ? (clean(body.place, 300) || type?.place || null) : null,
        client_name: priv ? null : clean(body.client_name, 160) || null, client_email: priv ? null : email || null, client_phone: priv ? null : clean(body.client_phone, 40) || null,
        topic: clean(body.topic, 2000) || null, client_id: priv ? null : cid, m2_client_id: priv ? null : m2id, matter_id: body.matter_id ? clean(body.matter_id, 40) : null,
        notify_client: !priv && !!email && body.notify_client !== false, created_by: me,
      }, members, me);
      return json({ ok: true, ...r });
    }
    if (action === 'cancel_staff' || action === 'reschedule_staff') {
      const { data: m } = await user.from('meetings').select('*').eq('id', clean(body.id, 40)).maybeSingle();   // RLS: tylko widoczne dla tej osoby
      if (!m) throw new Http(404, 'Nie znaleziono spotkania.');
      if (action === 'cancel_staff') return json({ ok: true, meeting: await cancelMeeting(m, clean(body.reason, 500) || null, me, body.notify_client !== false) });
      const startMs = Date.parse(String(body.start || ''));
      if (!startMs) throw new Http(400, 'Wybierz nowy termin.');
      return json({ ok: true, meeting: await moveMeeting(m, startMs, me) });
    }
    return json({ error: 'Nieznana operacja' }, 400);
  } catch (e) {
    if (e instanceof Http) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'Coś poszło nie tak – spróbuj ponownie albo zadzwoń: 883 643 565.', detail: String((e as Error)?.message || e).slice(0, 200) }, 500);
  }
});
