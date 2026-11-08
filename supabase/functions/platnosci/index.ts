// Płatności za konsultacje przez Przelewy24 (konto M2 TAX). Płatność jest dobrowolna – klient może zapłacić od razu po umówieniu,
// z e-maila (potwierdzenie, przypomnienie) albo z linku wysłanego po spotkaniu. Strona płatności: /umow/?t=<token spotkania>.
//  • { action: 'info', token }            – kwota i stan płatności spotkania (publiczne, po tokenie z e-maila)
//  • { action: 'pay', token, accept }     – rejestracja transakcji w Przelewy24 → adres strony płatności
//  • POST /platnosci/status (Przelewy24)  – powiadomienie o wpłacie: sprawdzenie podpisu, weryfikacja transakcji, oznaczenie „opłacone”
// Sekrety funkcji (panel Supabase → Edge Functions → Secrets, nigdy w kodzie): P24_MERCHANT_ID, P24_POS_ID (zwykle = merchant),
// P24_CRC (klucz CRC), P24_API_KEY (klucz do raportów / API), opcjonalnie P24_SANDBOX=1 (środowisko testowe).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const SB_URL = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(SB_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const MERCHANT = Number(Deno.env.get('P24_MERCHANT_ID') || 0);
const POS = Number(Deno.env.get('P24_POS_ID') || 0) || MERCHANT;
const CRC = (Deno.env.get('P24_CRC') || '').trim();
const KEY = (Deno.env.get('P24_API_KEY') || '').trim();
const SANDBOX = /^(1|true|tak)$/i.test(Deno.env.get('P24_SANDBOX') || '');
const HOST = SANDBOX ? 'https://sandbox.przelewy24.pl' : 'https://secure.przelewy24.pl';
const configured = () => !!(MERCHANT && CRC && KEY);
class Http extends Error { constructor(public status: number, msg: string) { super(msg); } }

const sha384 = async (o: Record<string, unknown>) => {
  // Przelewy24: podpis = SHA-384 z JSON-a pól w ustalonej kolejności (bez escapowania „/” i znaków Unicode – tak działa JSON.stringify)
  const b = await crypto.subtle.digest('SHA-384', new TextEncoder().encode(JSON.stringify(o)));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
};
async function p24(method: string, path: string, body?: unknown) {
  const r = await fetch(`${HOST}/api/v1${path}`, {
    method, headers: { Authorization: 'Basic ' + btoa(`${POS}:${KEY}`), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Przelewy24 ${r.status}: ${j?.error || j?.message || JSON.stringify(j).slice(0, 200)}`);
  return j;
}
async function appUrl() {
  const { data } = await admin.from('app_settings').select('value').eq('key', 'app_url').maybeSingle();
  return (data?.value || 'https://app.ruszniak.io').replace(/\/$/, '');
}
async function hookSecret() { const { data } = await admin.rpc('push_get_config'); return data?.push_hook_secret || ''; }
const grosze = (zl: number) => Math.round(Number(zl) * 100);

async function meetingByToken(token: string) {
  const t = String(token || '').slice(0, 80);
  if (!t) throw new Http(400, 'Brak linku do spotkania.');
  const { data: m } = await admin.from('meetings').select('id, token, status, private, price, paid_at, terms_accepted_at, start_at, end_at, client_name, client_email, title, type_id, mode').eq('token', t).maybeSingle();
  if (!m || m.private) throw new Http(404, 'Nie znaleziono spotkania – link mógł się zmienić.');
  return m;
}
const publicInfo = (m: any) => ({
  amount: Number(m.price) || 0, paid: !!m.paid_at, paid_at: m.paid_at, can_pay: configured() && Number(m.price) > 0 && !m.paid_at && m.status === 'confirmed',
  seller: 'M2 TAX Doradcy Podatkowi Otręba Ruszniak sp. p., ul. Zwycięska 3, 53-033 Wrocław, NIP 8993058189',
  terms: 'https://m2tax.pl/regulamin/', privacy: 'https://m2tax.pl/polityka-prywatnosci.html', operator: 'Przelewy24 (PayPro SA)',
});

// wpłata potwierdzona: spotkanie i notatka wewnętrzna „opłacone – Przelewy24”, powiadomienie zespołu
async function markPaid(pay: any, orderId: number, methodId: number) {
  const now = new Date().toISOString();
  await admin.from('meeting_payments').update({ status: 'oplacona', order_id: orderId, method_id: methodId, paid_at: now, error: null }).eq('id', pay.id);
  await admin.from('meetings').update({ paid_at: now, updated_at: now }).eq('id', pay.meeting_id);
  const { data: n } = await admin.from('meeting_notes').select('meeting_id').eq('meeting_id', pay.meeting_id).maybeSingle();
  const row = { paid: true, paid_method: 'p24', fee: pay.amount, updated_at: now };
  if (n) await admin.from('meeting_notes').update(row).eq('meeting_id', pay.meeting_id);
  else await admin.from('meeting_notes').insert({ meeting_id: pay.meeting_id, ...row });
  try {
    const s = await hookSecret();
    if (s) await fetch(`${SB_URL}/functions/v1/push`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-push-secret': s },
      body: JSON.stringify({ event: 'spotkanie', id: pay.meeting_id, ev: 'oplacone', amount: pay.amount }) });
  } catch (e) { console.error('push', e); }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = new URL(req.url);
  try {
    // ===== powiadomienie z Przelewy24 o wpłacie =====
    if (req.method === 'POST' && url.pathname.endsWith('/status')) {
      const b = await req.json().catch(() => ({}));
      if (!configured()) return new Response('not configured', { status: 503 });
      const sign = await sha384({ merchantId: b.merchantId, posId: b.posId, sessionId: b.sessionId, amount: b.amount, originAmount: b.originAmount, currency: b.currency, orderId: b.orderId, methodId: b.methodId, statement: b.statement, crc: CRC });
      if (sign !== b.sign || Number(b.merchantId) !== MERCHANT) { console.error('p24 status: zły podpis', b.sessionId); return new Response('bad sign', { status: 400 }); }
      const { data: pay } = await admin.from('meeting_payments').select('*').eq('session_id', String(b.sessionId)).maybeSingle();
      if (!pay) return new Response('unknown session', { status: 404 });
      if (pay.status === 'oplacona') return new Response('ok');
      if (Number(b.amount) !== grosze(pay.amount) || b.currency !== 'PLN') {
        await admin.from('meeting_payments').update({ status: 'blad', error: `kwota ${b.amount} ${b.currency}` }).eq('id', pay.id);
        return new Response('bad amount', { status: 400 });
      }
      // weryfikacja transakcji – dopiero po niej pieniądze są zaksięgowane po stronie Przelewy24
      const vsign = await sha384({ sessionId: pay.session_id, orderId: Number(b.orderId), amount: grosze(pay.amount), currency: 'PLN', crc: CRC });
      const v = await p24('PUT', '/transaction/verify', { merchantId: MERCHANT, posId: POS, sessionId: pay.session_id, amount: grosze(pay.amount), currency: 'PLN', orderId: Number(b.orderId), sign: vsign });
      if (v?.data?.status !== 'success') {
        await admin.from('meeting_payments').update({ status: 'blad', error: 'weryfikacja: ' + JSON.stringify(v).slice(0, 200) }).eq('id', pay.id);
        return new Response('verify failed', { status: 400 });
      }
      await markPaid(pay, Number(b.orderId), Number(b.methodId) || 0);
      return new Response('ok');
    }
    if (req.method !== 'POST') return json({ error: 'Metoda niedozwolona' }, 405);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');

    if (action === 'info') {
      const m = await meetingByToken(body.token);
      // klient wrócił z Przelewy24, a powiadomienie jeszcze nie dotarło – „w trakcie”
      const { data: last } = await admin.from('meeting_payments').select('status, created_at').eq('meeting_id', m.id).order('created_at', { ascending: false }).limit(1);
      return json({ ...publicInfo(m), pending: !m.paid_at && last?.[0]?.status === 'nowa' && Date.now() - Date.parse(last[0].created_at) < 30 * 60_000 });
    }
    if (action === 'pay') {
      const m = await meetingByToken(body.token);
      if (body.accept !== true) throw new Http(400, 'Zaakceptuj regulamin i politykę prywatności.');
      if (!configured()) throw new Http(503, 'Płatności online są chwilowo niedostępne – zapłać przelewem albo na miejscu.');
      if (m.status !== 'confirmed') throw new Http(400, 'To spotkanie zostało odwołane.');
      if (m.paid_at) throw new Http(400, 'Ta konsultacja jest już opłacona – dziękujemy!');
      const amount = Number(m.price) || 0;
      if (amount <= 0) throw new Http(400, 'To spotkanie jest bezpłatne.');
      const email = String(body.email || m.client_email || '').trim().toLowerCase().slice(0, 160);
      if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/.test(email)) throw new Http(400, 'Podaj adres e-mail do potwierdzenia płatności.');
      const app = await appUrl();
      const sessionId = `mtg-${m.id.slice(0, 8)}-${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      const when = new Date(m.start_at).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      const { data: ty } = m.type_id ? await admin.from('meeting_types').select('name').eq('id', m.type_id).maybeSingle() : { data: null };
      const description = `Konsultacja podatkowa – ${ty?.name || m.title || 'spotkanie'}, ${when}`.slice(0, 1024);
      const sign = await sha384({ sessionId, merchantId: MERCHANT, amount: grosze(amount), currency: 'PLN', crc: CRC });
      await admin.from('meeting_payments').insert({ meeting_id: m.id, amount, session_id: sessionId, email });
      if (!m.terms_accepted_at) await admin.from('meetings').update({ terms_accepted_at: new Date().toISOString() }).eq('id', m.id);
      const r = await p24('POST', '/transaction/register', {
        merchantId: MERCHANT, posId: POS, sessionId, amount: grosze(amount), currency: 'PLN', description, email, client: String(m.client_name || '').slice(0, 40) || undefined,
        country: 'PL', language: 'pl', urlReturn: `${app}/umow/?t=${encodeURIComponent(m.token)}&platnosc=1`, urlStatus: `${SB_URL}/functions/v1/platnosci/status`,
        timeLimit: 30, encoding: 'UTF-8', sign,
      });
      const token = r?.data?.token;
      if (!token) throw new Error('Przelewy24 nie zwróciło tokenu transakcji');
      await admin.from('meeting_payments').update({ p24_token: token }).eq('session_id', sessionId);
      return json({ url: `${HOST}/trnRequest/${token}` });
    }
    // test połączenia z Przelewy24 (administrator – po wpisaniu sekretów)
    if (action === 'test') {
      const auth = req.headers.get('Authorization') || '';
      const user = createClient(SB_URL, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
      const { data: isAdm } = await user.rpc('is_admin');
      if (!isAdm) throw new Http(403, 'Brak dostępu');
      if (!configured()) return json({ ok: false, error: 'Brak sekretów P24_MERCHANT_ID / P24_CRC / P24_API_KEY' });
      try { const t = await p24('GET', '/testAccess'); return json({ ok: t?.data === true, sandbox: SANDBOX, merchant: MERCHANT }); }
      catch (e) { return json({ ok: false, sandbox: SANDBOX, error: String((e as Error).message).slice(0, 300) }); }
    }
    return json({ error: 'Nieznana operacja' }, 400);
  } catch (e) {
    if (e instanceof Http) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'Nie udało się rozpocząć płatności – spróbuj ponownie za chwilę albo zadzwoń: 883 643 565.', detail: String((e as Error)?.message || e).slice(0, 200) }, 500);
  }
});
