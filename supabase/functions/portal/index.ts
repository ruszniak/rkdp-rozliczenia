// Strona klienta (/klient/#<token>) – jeden stały link dla klienta, bez logowania.
//  • info   { token } – dane klienta i firmy, dokumenty do pobrania (linki 30-dniowe z doc_links), dokumenty do podpisu
//                       (sign_requests), nadchodzące spotkania, możliwość wgrania dokumentów
//  • upload { token } – link do wgrania dokumentów (otwarta prośba doc_requests na bieżący miesiąc albo nowa) → /wgraj.html#…
// Dostęp tylko z tokenem; link można w aplikacji wyłączyć (revoked_at) albo wygenerować nowy.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const validToken = (t: unknown) => typeof t === 'string' && /^[0-9a-f]{48}$/.test(t);
const FIRM = {
  rkdp: { name: 'RKDP spółka doradztwa podatkowego sp. z o.o.', phone: '883 643 565', email: 'kancelaria@rkdp.pl', www: 'rkdp.pl' },
  m2: { name: 'M2 TAX Doradcy Podatkowi Otręba Ruszniak sp. p.', phone: '883 643 565', email: 'kancelaria@m2tax.pl', www: 'm2tax.pl' },
};

async function appUrl() {
  const { data } = await admin.from('app_settings').select('value').eq('key', 'app_url').maybeSingle();
  return (data?.value || 'https://app.ruszniak.io').replace(/\/$/, '');
}
async function portalBy(token: string) {
  const { data: p } = await admin.from('client_portals').select('*').eq('token', token).maybeSingle();
  if (!p || p.revoked_at) return null;
  let rk = p.client_id as string | null, m2: string[] = p.m2_client_id ? [p.m2_client_id] : [];
  if (rk) { const { data } = await admin.from('m2_clients').select('id').eq('rkdp_client_id', rk); m2 = [...new Set([...m2, ...(data || []).map((x: any) => x.id)])]; }
  else if (p.m2_client_id) { const { data } = await admin.from('m2_clients').select('rkdp_client_id').eq('id', p.m2_client_id).maybeSingle(); rk = data?.rkdp_client_id || null; }
  const name = rk ? (await admin.from('clients').select('name').eq('id', rk).maybeSingle()).data?.name
    : (await admin.from('m2_clients').select('name').eq('id', p.m2_client_id).maybeSingle()).data?.name;
  return { p, rk, m2, name: name || '' };
}
const orFilter = (rk: string | null, m2: string[]) => [rk ? `client_id.eq.${rk}` : null, m2.length ? `m2_client_id.in.(${m2.join(',')})` : null].filter(Boolean).join(',');
const monthStart = () => { const d = new Date(); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`; };

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Metoda niedozwolona' }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    if (!validToken(body.token)) return json({ error: 'Link jest nieprawidłowy albo niepełny.' }, 400);
    const ctx = await portalBy(body.token);
    if (!ctx) return json({ error: 'Ten link nie jest już aktywny. Poproś kancelarię o nowy.' }, 410);
    const { p, rk, m2, name } = ctx;
    const app = await appUrl();
    const now = new Date().toISOString();

    if (body.action === 'upload') {
      if (!rk) return json({ error: 'Dokumenty prześlij e-mailem: ' + FIRM[p.firm as 'rkdp' | 'm2'].email }, 400);
      const { data: open } = await admin.from('doc_requests').select('token').eq('client_id', rk).is('closed_at', null).gt('expires_at', now).order('created_at', { ascending: false }).limit(1);
      let token = open?.[0]?.token;
      if (!token) {
        const { data, error } = await admin.from('doc_requests').insert({ client_id: rk, period: monthStart(), items: [{ label: 'Dokumenty do rozliczenia' }],
          message: 'Wgrane ze strony klienta.', created_by: null, reminded_at: now }).select('token').single();
        if (error) { console.error(error); return json({ error: 'Nie udało się przygotować wgrywania – spróbuj za chwilę.' }, 500); }
        token = data.token;
      }
      return json({ url: `${app}/wgraj.html#${token}` });
    }

    // info
    const f = orFilter(rk, m2);
    const [dl, sg, mt] = await Promise.all([
      admin.from('doc_links').select('token, title, name, expires_at, created_at').or(f).gt('expires_at', now).order('created_at', { ascending: false }).limit(30),
      admin.from('sign_requests').select('token, title, status, created_at, signed_at, expires_at, final_path').or(f).neq('status', 'anulowano').order('created_at', { ascending: false }).limit(30),
      admin.from('meetings').select('token, title, start_at, end_at, mode, place, meet_url, status, private').or(f).eq('status', 'confirmed').eq('private', false).gte('end_at', now).order('start_at').limit(10),
    ]);
    await admin.from('client_portals').update({ views: (p.views || 0) + 1, last_view_at: now }).eq('id', p.id);
    const signs = (sg.data || []).filter((r: any) => r.status === 'podpisano' ? true : new Date(r.expires_at) > new Date());
    return json({
      client: name, firm: p.firm, contact: FIRM[p.firm as 'rkdp' | 'm2'], can_upload: !!rk,
      downloads: (dl.data || []).map((r: any) => ({ title: r.title || r.name, name: r.name, until: r.expires_at, url: `${app}/pobierz/?t=${r.token}` })),
      to_sign: signs.filter((r: any) => r.status === 'wyslano').map((r: any) => ({ title: r.title, sent: r.created_at, url: `${app}/podpis/?t=${r.token}` })),
      signed: signs.filter((r: any) => r.status === 'podpisano').slice(0, 10).map((r: any) => ({ title: r.title, signed: r.signed_at, final: !!r.final_path, url: `${app}/podpis/?t=${r.token}` })),
      meetings: (mt.data || []).map((r: any) => ({ title: r.title || 'Spotkanie', start: r.start_at, end: r.end_at, mode: r.mode, place: r.place, meet_url: r.meet_url, url: `${app}/umow/?t=${r.token}` })),
      book_url: `${app}/umow/`,
    });
  } catch (e) {
    console.error(e);
    return json({ error: 'Wystąpił błąd – spróbuj ponownie za chwilę.' }, 500);
  }
});
