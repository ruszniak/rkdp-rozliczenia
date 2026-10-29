// Powiadomienia push (PWA): wysyłka do urządzeń członków zespołu.
// Wywołania:
//  • z bazy (wyzwalacze i harmonogram) – nagłówek x-push-secret: { event: 'ticket_new' | 'ticket_assigned' | 'comment' | 'daily' | 'docs_uploaded' | 'docs_remind' | 'monitor_alert', id? }
//  • z aplikacji przez zalogowanego użytkownika – { event: 'test' } (powiadomienie testowe na jego urządzenia)
// Treść jest szyfrowana dla każdego urządzenia (Web Push, RFC 8291); w powiadomieniu nie ma danych wrażliwych poza tytułem zgłoszenia.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendPush } from './webpush.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
// klucze VAPID i sekret wywołań z Supabase Vault (funkcja push_get_config – tylko service_role)
const VAPID = { subject: 'mailto:kancelaria@rkdp.pl', publicKey: '', privateJwk: {} as JsonWebKey };
let HOOK_SECRET = '';
let cfgLoaded: Promise<void> | null = null;
const loadConfig = () => cfgLoaded ||= (async () => {
  const { data, error } = await db.rpc('push_get_config');
  if (error || !data) { cfgLoaded = null; throw new Error('Brak konfiguracji powiadomień'); }
  VAPID.publicKey = data.push_vapid_public; VAPID.privateJwk = JSON.parse(data.push_vapid_private_jwk); HOOK_SECRET = data.push_hook_secret;
})();
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' });
const plusDays = (n: number) => { const d = new Date(today() + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const short = (s: string, n = 90) => (s || '').length > n ? s.slice(0, n - 1) + '…' : (s || '');
const ticketUrl = (t: any) => (t.module === 'm2' ? `/#/doradztwo/zgloszenia/${t.id}` : `/#/zgloszenia/${t.id}`);

// wysyłka do wszystkich urządzeń osoby (z uwzględnieniem jej ustawień); martwe subskrypcje są usuwane
async function notify(memberIds: (string | null | undefined)[], category: string, msg: { title: string; body: string; url: string; tag?: string }) {
  const ids = [...new Set(memberIds.filter(Boolean))] as string[];
  if (!ids.length) return 0;
  const { data: subs } = await db.from('push_subscriptions').select('id, member_id, endpoint, p256dh, auth, prefs, fail_count').in('member_id', ids);
  let sent = 0;
  await Promise.all((subs || []).filter(s => (s.prefs?.[category] ?? true) !== false).map(async s => {
    try {
      const st = await sendPush(s, msg, VAPID);
      if (st === 404 || st === 410) await db.from('push_subscriptions').delete().eq('id', s.id);
      else if (st >= 200 && st < 300) { sent++; await db.from('push_subscriptions').update({ last_success: new Date().toISOString(), fail_count: 0 }).eq('id', s.id); }
      else await db.from('push_subscriptions').update({ fail_count: (s.fail_count || 0) + 1 }).eq('id', s.id);
    } catch { /* jedno urządzenie nie blokuje pozostałych */ }
  }));
  return sent;
}

async function clientName(t: any) {
  if (t.module === 'm2' && t.m2_client_id) return (await db.from('m2_clients').select('name').eq('id', t.m2_client_id).maybeSingle()).data?.name || '';
  if (t.client_id) return (await db.from('clients').select('name').eq('id', t.client_id).maybeSingle()).data?.name || '';
  return '';
}

async function onTicket(id: string, assigned: boolean, actor?: string | null) {
  const { data: t } = await db.from('rkdp_tickets').select('*').eq('id', id).maybeSingle();
  // bez powiadomienia, gdy osoba przypisała zgłoszenie sama sobie
  if (!t || !t.assignee_id || t.assignee_id === (actor || t.created_by)) return 0;
  const cl = await clientName(t);
  return notify([t.assignee_id], 'zgloszenia', {
    title: assigned ? `Przypisano Ci zgłoszenie #${t.no}` : `Nowe zgłoszenie #${t.no}`,
    body: [short(t.title), cl, t.due_date ? `termin ${t.due_date.split('-').reverse().join('.')}` : ''].filter(Boolean).join(' · '),
    url: ticketUrl(t), tag: `t-${t.id}`,
  });
}

async function onComment(id: string) {
  const { data: c } = await db.from('rkdp_ticket_comments').select('id, ticket_id, author_id, body, kind').eq('id', id).maybeSingle();
  if (!c) return 0;
  const { data: t } = await db.from('rkdp_tickets').select('id, no, title, module, assignee_id, created_by').eq('id', c.ticket_id).maybeSingle();
  if (!t) return 0;
  const { data: a } = await db.from('team_members').select('full_name').eq('id', c.author_id).maybeSingle();
  return notify([t.assignee_id, t.created_by].filter(x => x && x !== c.author_id), 'komentarze', {
    title: c.kind === 'wykonanie' ? `Wykonano zgłoszenie #${t.no}` : `Komentarz w zgłoszeniu #${t.no}`,
    body: `${a?.full_name || 'Ktoś'}: ${short(c.body, 120)}`,
    url: ticketUrl(t), tag: `t-${t.id}`,
  });
}

// wzmianka (@Imię) w wątku klienta
async function onMention(id: string) {
  const { data: c } = await db.from('period_comments').select('id, client_id, period, author, body, mentions, deleted_at').eq('id', id).maybeSingle();
  if (!c || c.deleted_at) return 0;
  const [{ data: cl }, { data: a }] = await Promise.all([
    db.from('clients').select('name').eq('id', c.client_id).maybeSingle(),
    db.from('team_members').select('full_name').eq('id', c.author).maybeSingle(),
  ]);
  const per = String(c.period).slice(0, 7);
  return notify((c.mentions || []).filter((m: string) => m !== c.author), 'komentarze', {
    title: `${a?.full_name || 'Ktoś'} oznaczył(a) Cię – ${cl?.name || 'klient'}`,
    body: short(c.body, 140), url: `/#/watek/${c.client_id}?okres=${per}`, tag: `w-${c.client_id}`,
  });
}

// klient wgrał pliki z prośby o dokumenty / prośba bez odpowiedzi od 3 dni
async function onDocs(id: string, remind: boolean, count: number) {
  const { data: r } = await db.from('doc_requests').select('id, client_id, period, created_by, clients(name, accountant_id)').eq('id', id).maybeSingle();
  if (!r) return 0;
  const c: any = (r as any).clients || {};
  const per = String(r.period).slice(0, 7);
  return notify([c.accountant_id, r.created_by], 'zgloszenia', remind
    ? { title: 'Klient nie odesłał dokumentów', body: `${c.name || 'Klient'} · ${per} – minęły 3 dni od prośby. Przypomnij klientowi.`, url: `/#/rozliczenia?okres=${per}`, tag: `docs-${r.id}` }
    : { title: `Klient wgrał dokumenty (${count})`, body: `${c.name || 'Klient'} · ${per}`, url: `/#/rozliczenia?okres=${per}`, tag: `docs-${r.id}` });
}

// monitoring klientów: zmiana statusu VAT / danych w KRS
async function onMonitor(b: any) {
  const ids: string[] = [];
  if (b.module === 'rkdp' && b.client_id) {
    const { data: c } = await db.from('clients').select('accountant_id').eq('id', b.client_id).maybeSingle();
    if (c?.accountant_id) ids.push(c.accountant_id);
  }
  const { data: admins } = await db.from('team_members').select('id').eq('role', 'admin').eq('active', true);
  (admins || []).forEach(a => ids.push(a.id));
  return notify(ids, 'terminy', { title: 'Monitoring klienta: zmiana', body: short(String(b.summary || ''), 140), url: b.module === 'm2' ? `/#/doradztwo/klient/${b.m2_client_id}` : `/#/klient/${b.client_id}`, tag: `mon-${b.client_id || b.m2_client_id}` });
}

// poranny przegląd: zgłoszenia na dziś / po terminie oraz terminy spraw M2 na dziś i jutro
async function daily() {
  const d0 = today(), d1 = plusDays(1);
  const [{ data: tickets }, { data: dls }, { data: members }] = await Promise.all([
    db.from('rkdp_tickets').select('id, assignee_id, due_date, status').not('assignee_id', 'is', null).lte('due_date', d0).not('status', 'in', '("zrobione","anulowane")'),
    db.from('m2_deadlines').select('id, assignee_id, due_date, matter_id, title, done').eq('done', false).gte('due_date', d0).lte('due_date', d1),
    db.from('team_members').select('id, active').eq('active', true),
  ]);
  const matterIds = [...new Set((dls || []).map(x => x.matter_id).filter(Boolean))];
  const { data: matters } = matterIds.length ? await db.from('m2_matters').select('id, lead_id, second_id').in('id', matterIds) : { data: [] as any[] };
  const mMap = new Map((matters || []).map(m => [m.id, m]));
  let sent = 0;
  for (const m of members || []) {
    const mine = (tickets || []).filter(t => t.assignee_id === m.id);
    const late = mine.filter(t => t.due_date < d0).length, now = mine.length - late;
    const myDl = (dls || []).filter(x => x.assignee_id === m.id || (!x.assignee_id && [mMap.get(x.matter_id)?.lead_id, mMap.get(x.matter_id)?.second_id].includes(m.id)));
    const dToday = myDl.filter(x => x.due_date === d0).length, dTom = myDl.length - dToday;
    const parts = [now ? `${now} zgłosz. na dziś` : '', late ? `${late} po terminie` : '', dToday ? `${dToday} termin(y) M2 dziś` : '', dTom ? `${dTom} termin(y) M2 jutro` : ''].filter(Boolean);
    if (!parts.length) continue;
    sent += await notify([m.id], 'terminy', { title: 'Plan na dziś', body: parts.join(' · '), url: '/#/pulpit?widok=dzis', tag: `daily-${d0}` });
  }
  return sent;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Metoda niedozwolona' }, 405);
  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: 'Nieprawidłowe dane' }, 400); }
  try {
    await loadConfig();
    const given = req.headers.get('x-push-secret') || '';
    const fromDb = !!HOOK_SECRET && given.length === HOOK_SECRET.length && given === HOOK_SECRET;
    if (fromDb) {
      if (body.event === 'ticket_new') return json({ sent: await onTicket(body.id, false, body.actor) });
      if (body.event === 'ticket_assigned') return json({ sent: await onTicket(body.id, true, body.actor) });
      if (body.event === 'comment') return json({ sent: await onComment(body.id) });
      if (body.event === 'mention') return json({ sent: await onMention(String(body.id || '')) });
      if (body.event === 'daily') return json({ sent: await daily() });
      if (body.event === 'docs_uploaded' || body.event === 'docs_remind') return json({ sent: await onDocs(String(body.request_id || ''), body.event === 'docs_remind', +body.count || 0) });
      if (body.event === 'monitor_alert') return json({ sent: await onMonitor(body) });
      return json({ error: 'Nieznane zdarzenie' }, 400);
    }
    // zalogowany użytkownik: tylko powiadomienie testowe na własne urządzenia
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: u } = await db.auth.getUser(token);
    const email = u?.user?.email?.toLowerCase();
    if (!email) return json({ error: 'Brak dostępu' }, 401);
    const { data: me } = await db.from('team_members').select('id, full_name, active').eq('email', email).maybeSingle();
    if (!me?.active) return json({ error: 'Brak dostępu' }, 403);
    if (body.event === 'test') {
      const sent = await notify([me.id], 'test', { title: 'Powiadomienia działają', body: `Cześć ${me.full_name.split(' ')[0]}! Tak będą wyglądały powiadomienia z aplikacji RKDP.`, url: '/#/profil', tag: 'test' });
      return json({ sent });
    }
    return json({ error: 'Nieznane zdarzenie' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: 'Nie udało się wysłać powiadomienia' }, 500);
  }
});
