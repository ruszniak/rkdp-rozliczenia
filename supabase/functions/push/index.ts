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
const ticketUrl = (t: any) => (t.module === 'm2' ? `/#/doradztwo/zgloszenia/${t.id}` : `/#/zgloszenia/${t.id}`);

// wysyłka do wszystkich urządzeń osoby (z uwzględnieniem jej ustawień); martwe subskrypcje są usuwane
// poza godzinami powiadomień osoby – zapis do kolejki (przyjdzie zbiorczo, gdy zacznie się jej okno)
async function notify(memberIds: (string | null | undefined)[], category: string, msg: { title: string; body: string; url: string; tag?: string }, force = false) {
  let ids = [...new Set(memberIds.filter(Boolean))] as string[];
  if (!ids.length) return 0;
  const { data: subs0 } = await db.from('push_subscriptions').select('id, member_id, endpoint, p256dh, auth, prefs, fail_count').in('member_id', ids);
  const subs = (subs0 || []).filter(s => (s.prefs?.[category] ?? true) !== false);
  if (!force) {
    const { data: pf } = await db.from('member_profiles').select('member_id, notify_window').in('member_id', ids);
    const closed = new Set((pf || []).filter(r => !windowOpen(r.notify_window)).map(r => r.member_id));
    const wait = ids.filter(id => closed.has(id) && subs.some(s => s.member_id === id));
    if (wait.length) await db.from('notify_queue').insert(wait.map(id => ({ member_id: id, channel: 'push', category, title: msg.title, body: msg.body, url: msg.url })));
    ids = ids.filter(id => !closed.has(id));
  }
  let sent = 0;
  await Promise.all(subs.filter(s => ids.includes(s.member_id)).map(async s => {
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

// zlecenia od administratora: nowe / poprawka / odpowiedź / akceptacja → pracownik; pytanie / zgłoszenie → zlecający; komentarz → druga strona
const ZL_TITLE: Record<string, string> = {
  nowe: 'Nowe zadanie', poprawka: 'Zadanie do poprawy', odpowiedz: 'Odpowiedź na pytanie', zaakceptowane: 'Zadanie zaakceptowane ✓',
  pytanie: 'Pytanie do zadania', zgloszone: 'Zadanie wykonane – do sprawdzenia', komentarz: 'Komentarz w zadaniu', dodany: 'Dodano Cię do zadania',
  zamkniete: 'Zadanie zakończone ✓', anulowane: 'Zadanie anulowane',
};
async function onZlecenie(b: any) {
  const { data: z } = await db.from('zlecenia').select('id, no, title, assignee_id, created_by, due_date, helpers').eq('id', b.id).maybeSingle();
  if (!z) return 0;
  const ev = String(b.ev || '');
  let to: (string | null)[] = [];
  if (['nowe', 'poprawka', 'odpowiedz', 'zaakceptowane'].includes(ev)) to = [z.assignee_id];
  else if (['pytanie', 'zgloszone'].includes(ev)) to = [z.created_by];
  else if (ev === 'komentarz' || ev === 'zamkniete' || ev === 'anulowane') to = [z.assignee_id, z.created_by, ...(z.helpers || [])].filter(x => x !== b.actor);
  else if (ev === 'dodany') to = Array.isArray(b.to) ? b.to : [];
  to = to.filter(x => x && x !== b.actor); // bez powiadomień o własnych czynnościach (np. zadanie dla siebie)
  if (!to.length) return 0;
  const { data: a } = b.actor ? await db.from('team_members').select('full_name').eq('id', b.actor).maybeSingle() : { data: null };
  let extra = '';
  if (ev === 'komentarz' && b.wpis) extra = (await db.from('zlecenia_wpisy').select('body').eq('id', b.wpis).maybeSingle()).data?.body || '';
  return notify(to, 'zgloszenia', {
    title: `${ZL_TITLE[ev] || 'Zadanie'} #${z.no}`,
    body: [short(z.title), a?.full_name && ev !== 'nowe' ? (ev === 'dodany' ? 'dodał(a): ' : ev === 'zamkniete' ? 'zamknął(a): ' : ev === 'anulowane' ? 'anulował(a): ' : '') + a.full_name : '', extra ? short(extra, 100) : '', ev === 'nowe' && z.due_date ? `termin ${z.due_date.split('-').reverse().join('.')}` : ''].filter(Boolean).join(' · '),
    url: `/#/zlecenia/${z.id}`, tag: `zl-${z.id}`,
  });
}

// wysyłka zbiorcza: to, co czekało w kolejce, gdy u danej osoby zaczęło się okno powiadomień
async function flush() {
  const { data: q } = await db.from('notify_queue').select('id, member_id, title, body, url, created_at').eq('channel', 'push').is('sent_at', null).order('created_at').limit(2000);
  if (!q?.length) return 0;
  const by = new Map<string, any[]>(); q.forEach(r => by.set(r.member_id, [...(by.get(r.member_id) || []), r]));
  const { data: pf } = await db.from('member_profiles').select('member_id, notify_window').in('member_id', [...by.keys()]);
  const win = new Map((pf || []).map(r => [r.member_id, r.notify_window]));
  let sent = 0;
  for (const [mid, items] of by) {
    if (!windowOpen(win.get(mid))) continue;
    const n = items.length, last = items[n - 1];
    const msg = n === 1 ? { title: last.title, body: last.body || '', url: last.url || '/', tag: 'digest' }
      : { title: `Powiadomienia z przerwy (${n})`, body: items.slice(-3).reverse().map(i => short(i.title, 50)).join(' · ') + (n > 3 ? ` · i ${n - 3} więcej` : ''), url: '/#/moje', tag: 'digest' };
    sent += await notify([mid], 'digest', msg, true);
    await db.from('notify_queue').update({ sent_at: new Date().toISOString() }).in('id', items.map(i => i.id));
  }
  return sent;
}

// poranny przegląd: zgłoszenia na dziś / po terminie oraz terminy spraw M2 na dziś i jutro
async function daily() {
  const d0 = today(), d1 = plusDays(1);
  const [{ data: tickets }, { data: dls }, { data: members }] = await Promise.all([
    db.from('rkdp_tickets').select('id, assignee_id, due_date, status').not('assignee_id', 'is', null).lte('due_date', d0).not('status', 'in', '("zrobione","anulowane")'),
    db.from('m2_deadlines').select('id, assignee_id, due_date, matter_id, title, done').eq('done', false).gte('due_date', d0).lte('due_date', d1),
    db.from('team_members').select('id, active').eq('active', true),
  ]);
  const { data: zl } = await db.from('zlecenia').select('id, assignee_id, due_date, status').in('status', ['nowe', 'w_toku', 'pytanie']).not('due_date', 'is', null).lte('due_date', d1);
  const matterIds = [...new Set((dls || []).map(x => x.matter_id).filter(Boolean))];
  const { data: matters } = matterIds.length ? await db.from('m2_matters').select('id, lead_id, second_id').in('id', matterIds) : { data: [] as any[] };
  const mMap = new Map((matters || []).map(m => [m.id, m]));
  let sent = 0;
  for (const m of members || []) {
    const mine = (tickets || []).filter(t => t.assignee_id === m.id);
    const late = mine.filter(t => t.due_date < d0).length, now = mine.length - late;
    const myDl = (dls || []).filter(x => x.assignee_id === m.id || (!x.assignee_id && [mMap.get(x.matter_id)?.lead_id, mMap.get(x.matter_id)?.second_id].includes(m.id)));
    const dToday = myDl.filter(x => x.due_date === d0).length, dTom = myDl.length - dToday;
    const myZl = (zl || []).filter(x => x.assignee_id === m.id);
    const zlLate = myZl.filter(x => x.due_date < d0).length, zlSoon = myZl.length - zlLate;
    const parts = [zlLate ? `${zlLate} zad. po terminie` : '', zlSoon ? `${zlSoon} zad. z terminem dziś/jutro` : '', now ? `${now} zgłosz. na dziś` : '', late ? `${late} po terminie` : '', dToday ? `${dToday} termin(y) M2 dziś` : '', dTom ? `${dTom} termin(y) M2 jutro` : ''].filter(Boolean);
    if (!parts.length) continue;
    sent += await notify([m.id], 'terminy', { title: 'Plan na dziś', body: parts.join(' · '), url: '/#/pulpit?widok=dzis', tag: `daily-${d0}` });
  }
  return sent;
}

// spotkania: nowe (ze strony albo od kolegi), zmiana terminu, odwołanie
async function onSpotkanie(b: any) {
  const { data: m } = await db.from('meetings').select('id, title, client_name, start_at, source, private, status').eq('id', b.id).maybeSingle();
  if (!m) return 0;
  const ev = String(b.ev || '');
  const { data: mm } = await db.from('meeting_members').select('member_id, active').eq('meeting_id', m.id);
  const act = (mm || []).filter((x: any) => x.active).map((x: any) => x.member_id);
  const when = new Date(m.start_at).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const hour = new Date(m.start_at).toLocaleTimeString('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit' });
  const who = m.private ? (m.title || 'Spotkanie') : (m.client_name || m.title || 'Spotkanie');
  const url = `/#/spotkania/${m.id}`, tag = `mtg-${m.id}`;
  // zmiana osób: nowe osoby – „przejmujesz / dołączasz”, usunięte – „już nie uczestniczysz”
  if (ev === 'osoby') {
    const added = (Array.isArray(b.added) ? b.added : []).filter((x: string) => x !== b.actor);
    const removed = (Array.isArray(b.removed) ? b.removed : []).filter((x: string) => x !== b.actor);
    const by = b.actor ? ((await db.from('team_members').select('full_name').eq('id', b.actor).maybeSingle()).data?.full_name || '').split(' ')[0] : '';
    let n = 0;
    if (added.length) n += await notify(added, 'spotkania', { title: 'Masz spotkanie' + (by ? ` (od: ${by})` : ''), body: `${short(who, 60)} · ${when}`, url, tag });
    if (removed.length) n += await notify(removed, 'spotkania', { title: 'Nie uczestniczysz już w spotkaniu', body: `${short(who, 60)} · ${when}` + (by ? ` · zmienił(a): ${by}` : ''), url, tag });
    return n;
  }
  if (ev === 'oplacone') return act.length ? notify(act, 'spotkania', { title: `Klient zapłacił online${b.amount ? ` – ${Number(b.amount).toLocaleString('pl-PL')} zł` : ''}`, body: `${short(who, 60)} · ${when} · Przelewy24`, url, tag: `pay-${m.id}` }) : 0;
  if (ev === 'podsumowanie') return act.length ? notify(act, 'spotkania', { title: 'Podsumowanie spotkania z Meet', body: `${short(who, 60)} · ${when} – notatki Gemini są w rdp.app`, url, tag: `sum-${m.id}` }) : 0;
  if (ev === 'przypomnienie') return act.length ? notify(act, 'spotkania', { title: `O ${hour}: spotkanie`, body: `${short(who, 60)}` + (act.length > 1 ? ' · uczestniczycie razem' : ''), url, tag }) : 0;
  const all = ev.startsWith('odwolane') ? (mm || []).map((x: any) => x.member_id) : act;
  const to = all.filter((x: string) => x && x !== b.actor);
  if (!to.length) return 0;
  const title = ev === 'nowe' ? (m.source === 'www' ? 'Nowa rezerwacja ze strony' : 'Nowe spotkanie') : ev === 'zmiana' ? 'Zmiana terminu spotkania' : 'Spotkanie odwołane';
  const extra = ev === 'odwolane' ? ' · odwołał klient' : '';
  return notify(to, 'spotkania', { title, body: `${short(who, 60)} · ${when}${extra}`, url, tag });
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
      if (body.event === 'zlecenie') return json({ sent: await onZlecenie(body) });
      if (body.event === 'spotkanie') return json({ sent: await onSpotkanie(body) });
      if (body.event === 'flush') return json({ sent: await flush() });
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
      const sent = await notify([me.id], 'test', { title: 'Powiadomienia działają', body: `Cześć ${me.full_name.split(' ')[0]}! Tak będą wyglądały powiadomienia z rdp.app.`, url: '/#/profil', tag: 'test' }, true);
      return json({ sent });
    }
    return json({ error: 'Nieznane zdarzenie' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: 'Nie udało się wysłać powiadomienia' }, 500);
  }
});
