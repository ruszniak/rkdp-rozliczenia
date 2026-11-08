// Kalendarz Google – połączenie konta każdej osoby (OAuth) i dwukierunkowa współpraca z aplikacją:
//  • do osobnego kalendarza „RKDP – terminy i zadania” trafiają: terminy spraw doradczych, zadania z terminem,
//    pytania w rozmowach (z przypomnieniami); po zrobieniu znikają,
//  • na Pulpicie widać najbliższe wydarzenia z głównego kalendarza Google (własnego albo udostępnionego, np. Michała).
// Sekrety funkcji: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (ustawiane w panelu Supabase, nigdy w kodzie).
// Token odświeżania Google trzymany jest w Vault (funkcje gcal_store_token / gcal_token – tylko dla roli serwisowej).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const SB_URL = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(SB_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') || '';
const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') || '';
const REDIRECT = `${SB_URL}/functions/v1/gcal/callback`;
// adres aplikacji (app_settings.app_url) – do linków w wydarzeniach i powrotu z Google
let APP_URL = 'https://rozliczenia.rkdp.pl';
async function loadAppUrl() { try { const { data } = await admin.from('app_settings').select('value').eq('key', 'app_url').maybeSingle(); if (data?.value) APP_URL = data.value.replace(/\/$/, ''); } catch { /* */ } }
const API = 'https://www.googleapis.com/calendar/v3';
// calendar.events – zapis spotkań w kalendarzu doradcy; freebusy – zajętość do wolnych terminów; calendarlist – wybór kalendarzy; drive.meet.readonly – notatki Gemini z Meet (tylko pliki utworzone przez Meet)
const SCOPES = 'openid email https://www.googleapis.com/auth/calendar.app.created https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/drive.meet.readonly';
const canBook = (sc: string | null) => /calendar\.events(\s|$)/.test(sc || '');
const CAL_NAME = 'RKDP – terminy i zadania';
const TZ = 'Europe/Warsaw';

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: TZ });
const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const fmt = (iso: string) => iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : '';
const cut = (s: string, n: number) => { const t = (s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
async function sha(s: string) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 32); }
async function hookSecret() { const { data } = await admin.rpc('push_get_config'); return data?.push_hook_secret || ''; }

// ---------- Google: tokeny ----------
async function exchangeCode(code: string) {
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: REDIRECT, grant_type: 'authorization_code' }) });
  const j = await r.json();
  if (!r.ok) throw new Error('Google nie wydał tokenu: ' + (j.error_description || j.error || r.status));
  return j as { access_token: string; refresh_token?: string; id_token?: string; expires_in: number; scope?: string };
}
const tokenCache = new Map<string, { token: string; exp: number }>();
async function accessToken(memberId: string) {
  const c = tokenCache.get(memberId);
  if (c && c.exp > Date.now() + 60_000) return c.token;
  const { data: rt } = await admin.rpc('gcal_token', { p_member: memberId });
  if (!rt) throw new Error('Brak połączenia z Google – połącz konto ponownie w profilu.');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: rt, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'refresh_token' }) });
  const j = await r.json();
  if (!r.ok) {
    if (j.error === 'invalid_grant') throw new Error('Połączenie z Google wygasło albo zostało cofnięte – połącz konto ponownie w profilu.');
    throw new Error('Google: ' + (j.error_description || j.error || r.status));
  }
  tokenCache.set(memberId, { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 });
  return j.access_token as string;
}
async function gapi(token: string, method: string, path: string, body?: unknown) {
  const r = await fetch(API + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 204) return { ok: true, status: 204, data: null };
  const data = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, data };
}

// ---------- kalendarz aplikacji ----------
async function ensureCalendar(memberId: string, token: string, current: string | null) {
  if (current) {
    const g = await gapi(token, 'GET', `/calendars/${encodeURIComponent(current)}`);
    if (g.ok) return current;
  }
  const c = await gapi(token, 'POST', '/calendars', { summary: CAL_NAME, description: 'Terminy spraw, zadania i pytania z aplikacji app.R. Aktualizuje się samo – zmiany wprowadzaj w aplikacji.', timeZone: TZ });
  if (!c.ok) throw new Error('Nie udało się założyć kalendarza w Google: ' + (c.data?.error?.message || c.status));
  await admin.from('gcal_links').update({ calendar_id: c.data.id }).eq('member_id', memberId);
  await admin.from('gcal_items').delete().eq('member_id', memberId);
  return c.data.id as string;
}

// ---------- co trafia do kalendarza danej osoby ----------
type Want = { src: string; ev: Record<string, unknown> };
const DL_KIND: Record<string, { label: string; color: string; rem: number[] }> = {
  procesowy: { label: 'Termin procesowy', color: '11', rem: [3780, 900] },
  przedawnienie: { label: 'Przedawnienie', color: '3', rem: [10980, 3780, 900] },
  organ: { label: 'Termin organu', color: '6', rem: [900] },
  wewnetrzny: { label: 'Termin wewnętrzny', color: '8', rem: [900] },
  spotkanie: { label: 'Spotkanie', color: '10', rem: [900] },
};
function allDay(date: string, summary: string, description: string, colorId: string, reminders: number[], src: string) {
  const t = today();
  return {
    summary, description, colorId,
    start: { date }, end: { date: addDays(date, 1) },
    transparency: 'transparent',
    // przypomnienia: 900 min przed = 9:00 dzień wcześniej; dla dzisiejszych pozycji przypomnienie już minęło, więc go nie dajemy
    reminders: { useDefault: false, overrides: date > t ? reminders.map(m => ({ method: 'popup', minutes: m })) : [] },
    extendedProperties: { private: { rkdp: src } },
  };
}
async function wanted(memberId: string): Promise<Want[]> {
  const t = today();
  const out: Want[] = [];
  // 1) terminy spraw doradczych (osoba odpowiedzialna)
  const { data: dls } = await admin.from('m2_deadlines')
    .select('id,title,due_date,kind,notes,matter_id,m2_matters(number,title,m2_clients(name))')
    .eq('assignee_id', memberId).eq('done', false).gte('due_date', addDays(t, -60)).lte('due_date', addDays(t, 400)).limit(400);
  for (const d of dls || []) {
    const k = DL_KIND[d.kind] || DL_KIND.wewnetrzny;
    const m: any = d.m2_matters;
    const late = d.due_date < t;
    const summary = `${late ? '⚠ PO TERMINIE · ' : ''}⚖ ${d.title}${m?.m2_clients?.name ? ' – ' + m.m2_clients.name : ''}`;
    const desc = [`${k.label}${m?.number ? ` · sprawa ${m.number}${m.title ? ' – ' + m.title : ''}` : ''}`, d.notes ? cut(d.notes, 400) : '',
      d.matter_id ? `${APP_URL}/#/doradztwo/sprawa/${d.matter_id}` : `${APP_URL}/#/doradztwo/sprawy`].filter(Boolean).join('\n\n');
    out.push({ src: 'dl:' + d.id, ev: allDay(d.due_date, summary, desc, k.color, k.rem, 'dl:' + d.id) });
  }
  // 2) zadania z terminem (wykonawca albo osoba „razem z”); po terminie – przesuwane na dziś, żeby były widoczne
  const { data: zl } = await admin.from('zlecenia')
    .select('id,no,title,body,due_date,status,priority,assignee_id,helpers,created_by,client_id,clients(name)')
    .in('status', ['nowe', 'w_toku', 'pytanie', 'zgloszone']).or(`assignee_id.eq.${memberId},helpers.cs.{${memberId}},created_by.eq.${memberId}`).limit(500);
  for (const z of zl || []) {
    const mine = z.assignee_id === memberId || (z.helpers || []).includes(memberId);
    const client = (z as any).clients?.name ? ` – ${(z as any).clients.name}` : '';
    const link = `${APP_URL}/#/pulpit?zl=${z.id}`;
    const hot = z.priority === 'pilne' ? '! ' : '';
    if (mine && ['nowe', 'w_toku', 'pytanie'].includes(z.status) && z.due_date) {
      const late = z.due_date < t;
      const date = late ? t : z.due_date;
      const summary = `${late ? `⚠ po terminie (${fmt(z.due_date)}) · ` : ''}☐ ${hot}${z.title}${client}`;
      out.push({ src: 'zl:' + z.id, ev: allDay(date, summary, [`Zadanie #${z.no}${z.status === 'pytanie' ? ' · czeka na odpowiedź na pytanie' : ''}`, z.body ? cut(z.body, 500) : '', link].filter(Boolean).join('\n\n'), late ? '11' : '9', [900], 'zl:' + z.id) });
    } else if (z.created_by === memberId && !mine && z.status === 'zgloszone') {
      out.push({ src: 'zs:' + z.id, ev: allDay(t, `✔ Do sprawdzenia: ${z.title}${client}`, [`Zadanie #${z.no} zgłoszone jako wykonane – sprawdź i zaakceptuj.`, link].join('\n\n'), '2', [], 'zs:' + z.id) });
    } else if (z.created_by === memberId && !mine && z.status === 'pytanie') {
      out.push({ src: 'zp:' + z.id, ev: allDay(t, `❓ Pytanie w zadaniu: ${z.title}${client}`, [`Wykonawca zadania #${z.no} ma pytanie – odpowiedz w aplikacji.`, link].join('\n\n'), '5', [], 'zp:' + z.id) });
    }
  }
  // 3) pytania w rozmowach, w których ktoś mnie oznaczył (do czasu rozwiązania – na dziś)
  const { data: qs } = await admin.from('period_comments')
    .select('id,body,client_id,period,author,created_at,clients(name)')
    .eq('kind', 'pytanie').is('resolved_at', null).is('deleted_at', null).is('parent_id', null)
    .contains('mentions', [memberId]).neq('author', memberId).gte('created_at', new Date(Date.now() - 120 * 86400000).toISOString()).limit(200);
  for (const q of qs || []) {
    const name = (q as any).clients?.name || 'klient';
    out.push({ src: 'pq:' + q.id, ev: allDay(t, `❓ ${name}: ${cut(q.body, 80)}`, [`Pytanie w rozmowie o kliencie (${fmt(String(q.created_at).slice(0, 10))}):`, cut(q.body, 800), `${APP_URL}/#/watek/${q.client_id}?okres=${String(q.period).slice(0, 7)}`].join('\n\n'), '5', [], 'pq:' + q.id) });
  }
  return out;
}

// ---------- synchronizacja jednej osoby ----------
async function syncMember(memberId: string) {
  const { data: link } = await admin.from('gcal_links').select('*').eq('member_id', memberId).maybeSingle();
  if (!link) return { skipped: true };
  try {
    const token = await accessToken(memberId);
    const cal = await ensureCalendar(memberId, token, link.calendar_id);
    const want = await wanted(memberId);
    const { data: have } = await admin.from('gcal_items').select('src,event_id,hash').eq('member_id', memberId);
    const haveMap = new Map((have || []).map(h => [h.src, h]));
    let added = 0, changed = 0, removed = 0, ops = 0;
    const MAX = 120;
    for (const w of want) {
      if (ops >= MAX) break;
      const hash = await sha(JSON.stringify(w.ev));
      const h = haveMap.get(w.src);
      haveMap.delete(w.src);
      if (h && h.hash === hash) continue;
      ops++;
      if (h) {
        const r = await gapi(token, 'PUT', `/calendars/${encodeURIComponent(cal)}/events/${encodeURIComponent(h.event_id)}`, w.ev);
        if (r.ok) { await admin.from('gcal_items').update({ hash }).eq('member_id', memberId).eq('src', w.src); changed++; continue; }
        if (r.status !== 404 && r.status !== 410) throw new Error('Google: ' + (r.data?.error?.message || r.status));
      }
      const r = await gapi(token, 'POST', `/calendars/${encodeURIComponent(cal)}/events`, w.ev);
      if (!r.ok) throw new Error('Google: ' + (r.data?.error?.message || r.status));
      await admin.from('gcal_items').upsert({ member_id: memberId, src: w.src, event_id: r.data.id, hash });
      added++;
    }
    // to, czego już nie ma (zrobione, usunięte, zamknięte) – usuwamy z kalendarza
    for (const [src, h] of haveMap) {
      if (ops >= MAX) break;
      ops++;
      const r = await gapi(token, 'DELETE', `/calendars/${encodeURIComponent(cal)}/events/${encodeURIComponent(h.event_id)}`);
      if (!r.ok && r.status !== 404 && r.status !== 410) throw new Error('Google: ' + (r.data?.error?.message || r.status));
      await admin.from('gcal_items').delete().eq('member_id', memberId).eq('src', src);
      removed++;
    }
    await admin.from('gcal_links').update({ last_sync_at: new Date().toISOString(), last_error: null }).eq('member_id', memberId);
    return { added, changed, removed, total: want.length, more: ops >= MAX };
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    await admin.from('gcal_links').update({ last_error: msg.slice(0, 300) }).eq('member_id', memberId);
    throw e;
  }
}

// ---------- wydarzenia z głównego kalendarza (na Pulpit) ----------
async function events(memberId: string, days: number) {
  const token = await accessToken(memberId);
  const from = new Date(); from.setHours(0, 0, 0, 0);
  const to = new Date(from.getTime() + Math.min(31, Math.max(1, days)) * 86400000);
  const { data: bm } = await admin.from('booking_members').select('write_calendar,busy_calendars').eq('member_id', memberId).maybeSingle();
  const calIds = [...new Set(['primary', ...(bm?.busy_calendars || []), bm?.write_calendar || 'primary'])].slice(0, 6);
  const q = new URLSearchParams({ timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '60', timeZone: TZ });
  const lists = await Promise.all(calIds.map(async id => {
    const r = await gapi(token, 'GET', `/calendars/${encodeURIComponent(id)}/events?${q}`);
    if (!r.ok) { if (id === 'primary') throw new Error('Google: ' + (r.data?.error?.message || r.status)); return []; }
    return r.data.items || [];
  }));
  const seen = new Set<string>();
  return lists.flat().filter((e: any) => e.status !== 'cancelled' && !seen.has(e.iCalUID || e.id) && seen.add(e.iCalUID || e.id)).map((e: any) => ({
    id: e.id, title: e.summary || '(zajęty)', start: e.start?.dateTime || e.start?.date, end: e.end?.dateTime || e.end?.date,
    allDay: !!e.start?.date, location: e.location || null, link: e.htmlLink || null,
    meet: e.hangoutLink || e.conferenceData?.entryPoints?.find((p: any) => p.entryPointType === 'video')?.uri || null,
  })).sort((a: any, b: any) => String(a.start).localeCompare(String(b.start)));
}

// Supabase nie wyświetla stron HTML z funkcji – po powrocie z Google przekierowujemy do profilu w aplikacji z wynikiem
const page = (title: string, text: string, ok: boolean) => new Response(null, { status: 302, headers: {
  Location: `${APP_URL}/#/profil?google=${ok ? 'ok' : 'blad'}&msg=${encodeURIComponent(ok ? text : `${title}. ${text}`)}` } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = new URL(req.url);
  await loadAppUrl();
  try {
    // powrót z Google po zgodzie użytkownika
    if (req.method === 'GET' && url.pathname.endsWith('/callback')) {
      const err = url.searchParams.get('error');
      if (err) return page('Nie połączono', err === 'access_denied' ? 'Nie wyrażono zgody na dostęp do kalendarza.' : 'Google zwrócił błąd: ' + err, false);
      const code = url.searchParams.get('code') || '', state = url.searchParams.get('state') || '';
      const { data: st } = await admin.from('gcal_states').select('*').eq('state', state).maybeSingle();
      if (!st || Date.now() - new Date(st.created_at).getTime() > 15 * 60_000) return page('Link wygasł', 'Spróbuj jeszcze raz z poziomu profilu w aplikacji.', false);
      await admin.from('gcal_states').delete().eq('state', state);
      const tok = await exchangeCode(code);
      let email: string | null = null;
      try { email = JSON.parse(atob(tok.id_token!.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).email || null; } catch { /* */ }
      await admin.from('gcal_links').upsert({ member_id: st.member_id, google_email: email, connected_at: new Date().toISOString(), last_error: null, scopes: tok.scope || null });
      if (tok.refresh_token) await admin.rpc('gcal_store_token', { p_member: st.member_id, p_token: tok.refresh_token });
      else {
        const { data: old } = await admin.rpc('gcal_token', { p_member: st.member_id });
        if (!old) return page('Brak zgody na dostęp offline', 'Google nie przekazał stałego dostępu. Usuń dostęp aplikacji na stronie myaccount.google.com/permissions i połącz ponownie.', false);
      }
      tokenCache.set(st.member_id, { token: tok.access_token, exp: Date.now() + (tok.expires_in || 3600) * 1000 });
      try { await syncMember(st.member_id); } catch (e) { console.error(e); }
      return page('Kalendarz Google połączony', `Konto ${email || ''} jest połączone. Terminy i zadania pojawią się w kalendarzu „${CAL_NAME}”.`, true);
    }
    if (req.method !== 'POST') return json({ error: 'Metoda niedozwolona' }, 405);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'status');

    // harmonogram bazy: wszystkie połączone konta
    if (action === 'sync_all') {
      const given = req.headers.get('x-push-secret') || '', s = await hookSecret();
      if (!given || !s || given !== s) return json({ error: 'Brak dostępu' }, 401);
      if (!CLIENT_ID || !CLIENT_SECRET) return json({ configured: false });
      const { data: links } = await admin.from('gcal_links').select('member_id');
      const t0 = Date.now(), res: Record<string, unknown> = {};
      for (const l of links || []) {
        if (Date.now() - t0 > 45_000) break;
        try { res[l.member_id] = await syncMember(l.member_id); } catch (e) { res[l.member_id] = { error: String((e as Error).message || e) }; }
      }
      return json({ ok: true, res });
    }

    // pozostałe – zalogowany członek zespołu (sesja potwierdzona hasłem i kodem)
    const auth = req.headers.get('Authorization') || '';
    if (!auth.startsWith('Bearer ')) return json({ error: 'Brak dostępu' }, 401);
    const user = createClient(SB_URL, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: memberId } = await user.rpc('current_member_id');
    if (!memberId) return json({ error: 'Brak dostępu' }, 403);
    const configured = !!(CLIENT_ID && CLIENT_SECRET);

    if (action === 'status') {
      const { data: link } = await admin.from('gcal_links').select('google_email,calendar_id,connected_at,last_sync_at,last_error,scopes').eq('member_id', memberId).maybeSingle();
      const { scopes, ...rest } = (link || {}) as any;
      // kalendarze udostępnione tej osobie przez innych (np. kalendarz Michała dla zespołu RKDP)
      const { data: sh } = await admin.from('calendar_shares').select('owner_id').eq('viewer_id', memberId);
      const owners = (sh || []).map((x: any) => x.owner_id);
      const { data: ol } = owners.length ? await admin.from('gcal_links').select('member_id').in('member_id', owners) : { data: [] };
      const { data: on } = owners.length ? await admin.from('team_members').select('id,full_name').in('id', (ol || []).map((x: any) => x.member_id)) : { data: [] };
      return json({ configured, connected: !!link, ...rest, can_book: !!link && canBook(scopes), can_summary: !!link && /drive\.meet\.readonly/.test(scopes || ''), calendar_name: CAL_NAME, shared: (on || []).map((x: any) => ({ id: x.id, name: x.full_name })) });
    }
    if (!configured) return json({ configured: false, error: 'Połączenie z Google nie jest jeszcze skonfigurowane (brak danych klienta OAuth w ustawieniach serwera).' }, 400);
    if (action === 'connect') {
      const state = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');
      await admin.from('gcal_states').delete().lt('created_at', new Date(Date.now() - 3600_000).toISOString());
      await admin.from('gcal_states').insert({ state, member_id: memberId });
      const q = new URLSearchParams({ client_id: CLIENT_ID, redirect_uri: REDIRECT, response_type: 'code', scope: SCOPES, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state, login_hint: String(body.email || '') });
      return json({ url: 'https://accounts.google.com/o/oauth2/v2/auth?' + q });
    }
    if (action === 'sync') {
      // po zmianie w aplikacji (zadanie, termin, pytanie) – aktualizujemy też kalendarze innych połączonych osób, których to dotyczy
      if (body.all) {
        const { data: links } = await admin.from('gcal_links').select('member_id');
        const t0 = Date.now(); let mine: unknown = { skipped: true };
        for (const l of links || []) {
          if (Date.now() - t0 > 40_000) break;
          try { const r = await syncMember(l.member_id); if (l.member_id === memberId) mine = r; } catch (e) { if (l.member_id === memberId) throw e; }
        }
        return json(mine);
      }
      return json(await syncMember(memberId));
    }
    // kalendarze dostępne na połączonym koncie (do ustawień spotkań) – osoba sama albo administrator dla kogoś
    if (action === 'calendars') {
      let who = memberId;
      if (body.member && body.member !== memberId) { const { data: isAdm } = await user.rpc('is_admin'); if (!isAdm) return json({ error: 'Brak dostępu' }, 403); who = String(body.member); }
      const token = await accessToken(who);
      const r = await gapi(token, 'GET', '/users/me/calendarList?minAccessRole=freeBusyReader&maxResults=100');
      if (!r.ok) return json({ error: r.status === 403 ? 'Połącz konto Google ponownie, aby wybrać kalendarze.' : 'Google: ' + (r.data?.error?.message || r.status) }, 400);
      return json({ items: (r.data.items || []).map((c: any) => ({ id: c.primary ? 'primary' : c.id, email: c.id, name: c.summaryOverride || c.summary, primary: !!c.primary, role: c.accessRole })) });
    }
    if (action === 'events') {
      let who = memberId;
      if (body.member && body.member !== memberId) {
        const { data: isAdm } = await user.rpc('is_admin');
        const { data: sh } = await admin.from('calendar_shares').select('owner_id').eq('owner_id', String(body.member)).eq('viewer_id', memberId).maybeSingle();
        if (!isAdm && !sh) return json({ error: 'Brak dostępu do tego kalendarza' }, 403);
        who = String(body.member);
      }
      return json({ items: await events(who, Number(body.days) || 7) });
    }
    if (action === 'disconnect') {
      const { data: link } = await admin.from('gcal_links').select('calendar_id').eq('member_id', memberId).maybeSingle();
      try {
        const token = await accessToken(memberId);
        if (link?.calendar_id && body.remove_calendar !== false) await gapi(token, 'DELETE', `/calendars/${encodeURIComponent(link.calendar_id)}`);
        const { data: rt } = await admin.rpc('gcal_token', { p_member: memberId });
        if (rt) await fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(rt), { method: 'POST' });
      } catch (e) { console.error(e); }
      tokenCache.delete(memberId);
      await admin.rpc('gcal_forget', { p_member: memberId });
      return json({ ok: true });
    }
    return json({ error: 'Nieznana operacja' }, 400);
  } catch (e) {
    console.error(e);
    if (req.method === 'GET') return page('Coś poszło nie tak', String((e as Error)?.message || e), false);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
