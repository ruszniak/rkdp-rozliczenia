// Wyszukiwanie kontrahenta po NIP – Biała lista VAT (Ministerstwo Finansów) oraz odpis z KRS.
// Wywołać może tylko zalogowany, aktywny członek zespołu (sprawdzane w bazie).
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

    const body = await req.json().catch(() => ({}));
    const date = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' });

    // Odpis aktualny z KRS (API Ministerstwa Sprawiedliwości): { krs: '0000812185' }
    if (body.krs !== undefined) {
      const krs = String(body.krs || '').replace(/\D/g, '').padStart(10, '0');
      if (!/^\d{10}$/.test(krs) || krs === '0000000000') return json({ error: 'Nieprawidłowy numer KRS.' }, 400);
      let r = await fetch(`https://api-krs.ms.gov.pl/api/krs/OdpisAktualny/${krs}?rejestr=P&format=json`, { headers: { Accept: 'application/json' } });
      if (r.status === 404) r = await fetch(`https://api-krs.ms.gov.pl/api/krs/OdpisAktualny/${krs}?rejestr=S&format=json`, { headers: { Accept: 'application/json' } });
      if (r.status === 404) return json({ found: false, krs });
      if (!r.ok) return json({ error: `KRS odpowiedział błędem (${r.status}).` }, 502);
      const j = await r.json().catch(() => null);
      const d = j?.odpis?.dane;
      if (!d) return json({ found: false, krs });
      const person = (p: any) => ({
        last: p?.nazwisko?.nazwiskoICzlon || '', first: [p?.imiona?.imie, p?.imiona?.imieDrugie].filter(Boolean).join(' '),
        entity: p?.nazwa || null,
      });
      const d1 = d.dzial1 || {}, d2 = d.dzial2 || {}, d3 = d.dzial3 || {};
      const sp = d1.siedzibaIAdres || {};
      const filings = d3?.wzmiankiOZlozonychDokumentach?.wzmiankaOZlozeniuRocznegoSprawozdaniaFinansowego || [];
      return json({
        found: true, krs, source: 'KRS – odpis aktualny (Ministerstwo Sprawiedliwości)', checkedAt: date,
        stanZDnia: j?.odpis?.naglowekA?.stanZDnia || null,
        name: d1?.danePodmiotu?.nazwa || null, legalForm: d1?.danePodmiotu?.formaPrawna || null,
        nip: d1?.danePodmiotu?.identyfikatory?.nip || null, regon: d1?.danePodmiotu?.identyfikatory?.regon || null,
        seat: sp.siedziba || null, address: sp.adres || null,
        capital: d1?.kapital?.wysokoscKapitaluZakladowego?.wartosc || null,
        shareholders: (d1.wspolnicySpzoo || []).map((w: any) => ({ ...person(w), shares: w.posiadaneUdzialy || '', whole: !!w.czyPosiadaCaloscUdzialow })),
        boardName: d2?.reprezentacja?.nazwaOrganu || null, representation: d2?.reprezentacja?.sposobReprezentacji || null,
        board: (d2?.reprezentacja?.sklad || []).filter((p: any) => !p.czyZawieszona).map((p: any) => ({ ...person(p), role: p.funkcjaWOrganie || '' })),
        supervisory: (d2?.organNadzoru || []).flatMap((o: any) => (o.sklad || []).map((p: any) => ({ ...person(p), role: p.funkcjaWOrganie || 'członek rady nadzorczej' }))),
        filings: filings.map((f: any) => ({ filed: f.dataZlozenia || null, period: f.zaOkresOdDo || null })),
      });
    }

    // Tryb zbiorczy: { nips: [...] } – po 30 NIP-ów w jednym zapytaniu do Białej listy
    if (Array.isArray(body.nips)) {
      const list = [...new Set(body.nips.map((n: unknown) => String(n || '').replace(/\D/g, '')).filter(validNip))].slice(0, 300);
      const results: Record<string, unknown> = {};
      for (let i = 0; i < list.length; i += 30) {
        const chunk = list.slice(i, i + 30);
        const r = await fetch(`https://wl-api.mf.gov.pl/api/search/nips/${chunk.join(',')}?date=${date}`, { headers: { Accept: 'application/json' } });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) return json({ error: j?.message || `Biała lista VAT odpowiedziała błędem (${r.status}).`, partial: results }, 502);
        for (const e of (j?.result?.entries || [])) {
          const s = (e.subjects || [])[0];
          results[e.identifier] = s ? {
            found: true, name: s.name || null, nip: s.nip || e.identifier, regon: s.regon || null, krs: s.krs || null,
            statusVat: s.statusVat || null, address: s.workingAddress || s.residenceAddress || null,
          } : { found: false };
        }
      }
      return json({ checkedAt: date, source: 'Biała lista VAT (Ministerstwo Finansów)', results });
    }

    const { nip } = body;
    const clean = String(nip || '').replace(/\D/g, '');
    if (!validNip(clean)) return json({ error: 'Nieprawidłowy numer NIP (błędna suma kontrolna).' }, 400);

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
