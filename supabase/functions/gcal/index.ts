// Kalendarz Google M2 TAX: odczyt wydarzeń do kalendarza w aplikacji i zapis terminów z aplikacji do Google.
// Konto usługi Google (GOOGLE_SERVICE_ACCOUNT – JSON klucza, sekret funkcji) musi mieć udostępniony kalendarz M2 TAX
// z uprawnieniem „Wprowadzanie zmian w wydarzeniach”. Wywołać może tylko zalogowany członek zespołu z modułem Doradztwo.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const API = 'https://www.googleapis.com/calendar/v3';
const APP_URL = 'https://rozliczenia.rkdp.pl';

const KIND: Record<string, { label: string; color: string }> = {
  procesowy: { label: 'Termin procesowy', color: '11' },
  organ: { label: 'Termin organu', color: '6' },
  przedawnienie: { label: 'Przedawnienie', color: '3' },
  wewnetrzny: { label: 'Termin wewnętrzny', color: '8' },
  spotkanie: { label: 'Spotkanie', color: '10' },
};

const b64url = (data: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  let s = ''; bytes.forEach(b => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

let cached: { token: string; exp: number } | null = null;
async function googleToken(sa: { client_email: string; private_key: string; token_uri?: string }) {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const aud = sa.token_uri || 'https://oauth2.googleapis.com/token';
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/calendar', aud, iat: now, exp: now + 3600 }))}`;
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const r = await fetch(aud, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${b64url(sig)}` }) });
  const j = await r.json();
  if (!r.ok) throw new Error('Google nie wydał tokenu: ' + (j.error_description || j.error || r.status));
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return cached.token;
}

// identyfikator kalendarza z ustawienia (sam identyfikator albo link do osadzenia ?src=…)
function calendarIdFrom(v: string) {
  const s = (v || '').trim();
  if (!s) return '';
  if (/^https?:/.test(s)) { try { return new URL(s).searchParams.get('src') || ''; } catch { return ''; } }
  return s;
}
const eventId = (deadlineId: string) => deadlineId.replace(/-/g, '').toLowerCase(); // znaki 0-9a-f są dozwolone przez Google

function addDay(date: string) { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); }
function addHour(date: string, time: string) {
  const [h, m] = time.split(':').map(Number);
  const t = h * 60 + m + 60, eh = Math.min(23, Math.floor(t / 60)), em = t >= 24 * 60 ? 59 : t % 60;
  return `${date}T${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}:00`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const auth = req.headers.get('Authorization') || '';
    if (!auth.startsWith('Bearer ')) return json({ error: 'Brak dostępu' }, 401);
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const { data: memberId } = await sb.rpc('current_member_id');
    if (!memberId) return json({ error: 'Brak dostępu' }, 403);
    const { data: m2 } = await sb.rpc('has_module', { m: 'doradztwo' });
    if (!m2) return json({ error: 'Brak dostępu do modułu Doradztwo' }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'status');
    const raw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT') || '';
    let sa: { client_email: string; private_key: string; token_uri?: string } | null = null;
    try { sa = raw ? JSON.parse(raw) : null; } catch { sa = null; }
    const { data: setting } = await sb.from('app_settings').select('value').eq('key', 'm2_google_calendar_src').maybeSingle();
    const calendarId = calendarIdFrom(setting?.value || '');
    if (!sa?.client_email || !sa?.private_key) return json({ configured: false, reason: 'Brak klucza konta usługi Google (sekret GOOGLE_SERVICE_ACCOUNT).', calendarId });
    if (!calendarId) return json({ configured: false, reason: 'Brak identyfikatora kalendarza w Zespół i ustawienia → M2 TAX.', serviceAccount: sa.client_email });

    const token = await googleToken(sa);
    const g = (path: string, init: RequestInit = {}) => fetch(`${API}/calendars/${encodeURIComponent(calendarId)}${path}`,
      { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });

    if (action === 'status') {
      const r = await fetch(`${API}/calendars/${encodeURIComponent(calendarId)}`, { headers: { Authorization: `Bearer ${token}` } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return json({ configured: true, ok: false, serviceAccount: sa.client_email, calendarId,
        error: r.status === 404 ? 'Konto usługi nie widzi kalendarza – udostępnij mu kalendarz („Wprowadzanie zmian w wydarzeniach”).' : (j.error?.message || `Błąd Google (${r.status})`) });
      return json({ configured: true, ok: true, serviceAccount: sa.client_email, calendarId, name: j.summary, timeZone: j.timeZone });
    }

    if (action === 'list') {
      const from = String(body.from || ''), to = String(body.to || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return json({ error: 'Podaj zakres dat.' }, 400);
      const q = new URLSearchParams({ timeMin: `${from}T00:00:00Z`, timeMax: `${addDay(to)}T00:00:00Z`, singleEvents: 'true', orderBy: 'startTime', maxResults: '500', timeZone: 'Europe/Warsaw' });
      const r = await g(`/events?${q}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return json({ error: j.error?.message || `Błąd Google (${r.status})` }, 502);
      const events = (j.items || []).filter((e: any) => e.status !== 'cancelled' && !e.extendedProperties?.private?.m2_deadline).map((e: any) => ({
        id: e.id, title: e.summary || '(bez tytułu)', allDay: !!e.start?.date,
        start: e.start?.date || e.start?.dateTime, end: e.end?.date || e.end?.dateTime,
        location: e.location || null, link: e.htmlLink || null, meet: e.hangoutLink || null,
      }));
      return json({ events });
    }

    if (action === 'sync' || action === 'sync_all') {
      let q = sb.from('m2_deadlines').select('id,title,kind,due_date,due_time,basis,notes,done,matter_id,assignee_id,client_id');
      if (action === 'sync') {
        const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).slice(0, 100);
        if (!ids.length) return json({ synced: 0 });
        q = q.in('id', ids);
      } else {
        const since = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
        q = q.gte('due_date', since).limit(1000);
      }
      const { data: dls, error } = await q;
      if (error) return json({ error: error.message }, 400);
      const matterIds = [...new Set((dls || []).map(d => d.matter_id).filter(Boolean))];
      const clientIds = [...new Set((dls || []).map(d => d.client_id).filter(Boolean))]; // klient sprawy uzupełniany niżej
      const memberIds = [...new Set((dls || []).map(d => d.assignee_id).filter(Boolean))];
      const [{ data: ms }, { data: cs }, { data: tm }] = await Promise.all([
        matterIds.length ? sb.from('m2_matters').select('id,number,title,client_id').in('id', matterIds) : Promise.resolve({ data: [] }),
        clientIds.length ? sb.from('m2_clients').select('id,name').in('id', clientIds) : Promise.resolve({ data: [] }),
        memberIds.length ? sb.from('team_members').select('id,full_name').in('id', memberIds) : Promise.resolve({ data: [] }),
      ]);
      const M = new Map((ms || []).map((x: any) => [x.id, x])), C = new Map((cs || []).map((x: any) => [x.id, x])), T = new Map((tm || []).map((x: any) => [x.id, x]));
      let synced = 0; const errors: string[] = [];
      for (const d of dls || []) {
        const mt: any = d.matter_id ? M.get(d.matter_id) : null;
        const cl: any = C.get(d.client_id || mt?.client_id);
        const k = KIND[d.kind] || KIND.wewnetrzny;
        const ev = {
          id: eventId(d.id),
          status: 'confirmed',
          summary: `${d.done ? '✓ ' : ''}${d.title}${cl?.name ? ` – ${cl.name}` : ''}`,
          description: [k.label + (d.done ? ' (wykonany)' : ''), mt ? `Sprawa: ${mt.number} · ${mt.title}` : null, d.assignee_id && T.get(d.assignee_id) ? `Odpowiada: ${(T.get(d.assignee_id) as any).full_name}` : null,
            d.basis, d.notes, '', `Aplikacja M2 TAX: ${APP_URL}/#/doradztwo/${mt ? `sprawa/${mt.id}` : 'kalendarz'}`].filter(x => x !== null && x !== undefined).join('\n'),
          start: d.due_time ? { dateTime: `${d.due_date}T${String(d.due_time).slice(0, 5)}:00`, timeZone: 'Europe/Warsaw' } : { date: d.due_date },
          end: d.due_time ? { dateTime: addHour(d.due_date, String(d.due_time).slice(0, 5)), timeZone: 'Europe/Warsaw' } : { date: addDay(d.due_date) },
          colorId: k.color,
          transparency: d.kind === 'spotkanie' ? 'opaque' : 'transparent',
          extendedProperties: { private: { m2_deadline: d.id } },
          reminders: { useDefault: true },
        };
        let r = await g('/events', { method: 'POST', body: JSON.stringify(ev) });
        if (r.status === 409) r = await g(`/events/${ev.id}`, { method: 'PUT', body: JSON.stringify(ev) });
        if (r.ok) synced++; else { const j = await r.json().catch(() => ({})); errors.push(`${d.title}: ${j.error?.message || r.status}`); }
      }
      return json({ synced, errors });
    }

    if (action === 'delete') {
      const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).slice(0, 200);
      let deleted = 0;
      for (const id of ids) {
        const r = await g(`/events/${eventId(id)}`, { method: 'DELETE' });
        if (r.ok || r.status === 404 || r.status === 410) deleted++;
      }
      return json({ deleted });
    }

    return json({ error: 'Nieznana akcja.' }, 400);
  } catch (e) {
    return json({ error: 'Błąd kalendarza Google: ' + (e instanceof Error ? e.message : String(e)) }, 500);
  }
});
