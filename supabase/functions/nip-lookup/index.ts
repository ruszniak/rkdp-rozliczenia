// Wyszukiwanie kontrahenta po NIP – Biała lista VAT (Ministerstwo Finansów).
// Wywołać może tylko zalogowany, aktywny członek zespołu (sprawdzane w bazie).
// Miejsce na GUS BIR: gdy pojawi się sekret GUS_BIR_KEY, można go tu dołożyć.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

function validNip(nip: string) {
  if (!/^\d{10}$/.test(nip)) return false;
  const w = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  const sum = w.reduce((s, x, i) => s + x * Number(nip[i]), 0);
  return sum % 11 === Number(nip[9]);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const auth = req.headers.get('Authorization') || '';
    if (!auth.startsWith('Bearer ')) return json({ error: 'Brak dostępu' }, 401);
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: memberId, error: authErr } = await sb.rpc('current_member_id');
    if (authErr || !memberId) return json({ error: 'Brak dostępu' }, 403);

    const { nip } = await req.json().catch(() => ({}));
    const clean = String(nip || '').replace(/\D/g, '');
    if (!validNip(clean)) return json({ error: 'Nieprawidłowy numer NIP (błędna suma kontrolna).' }, 400);

    const date = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' });
    const r = await fetch(`https://wl-api.mf.gov.pl/api/search/nip/${clean}?date=${date}`, { headers: { Accept: 'application/json' } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return json({ error: j?.message || `Biała lista VAT odpowiedziała błędem (${r.status}).` }, 502);
    const s = j?.result?.subject;
    if (!s) return json({ found: false, nip: clean, checkedAt: date, requestId: j?.result?.requestId || null });

    return json({
      found: true,
      source: 'Biała lista VAT (Ministerstwo Finansów)',
      checkedAt: date,
      requestId: j?.result?.requestId || null,
      name: s.name || null,
      nip: s.nip || clean,
      regon: s.regon || null,
      krs: s.krs || null,
      statusVat: s.statusVat || null,
      address: s.workingAddress || s.residenceAddress || null,
      accounts: s.accountNumbers || [],
      registrationLegalDate: s.registrationLegalDate || null,
      removalDate: s.removalDate || null,
      representatives: (s.representatives || []).map((p: { firstName?: string; lastName?: string; companyName?: string }) =>
        [p.firstName, p.lastName].filter(Boolean).join(' ') || p.companyName).filter(Boolean),
    });
  } catch (e) {
    return json({ error: 'Błąd wyszukiwania: ' + (e instanceof Error ? e.message : String(e)) }, 500);
  }
});
