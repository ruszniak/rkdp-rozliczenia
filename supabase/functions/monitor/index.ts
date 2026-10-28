// Monitoring klientów: Biała lista VAT (status VAT, nazwa, adres, rachunki) i KRS (nazwa, siedziba, zarząd, wspólnicy,
// likwidacja / upadłość). Porównuje z poprzednim stanem i przy zmianie tworzy alert (monitor_alerts), wpis do karty AML
// klienta i powiadomienie dla księgowej i administratorów. Pierwsze sprawdzenie zapisuje stan wyjściowy bez alertów.
// Wywołania: z harmonogramu (x-push-secret, { action: 'run_all' }) albo przez zalogowanego członka zespołu ({ action: 'run', client_id }).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const URL_ = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(URL_, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' });
const validNip = (nip: string) => /^\d{10}$/.test(nip) && [6, 5, 7, 2, 3, 4, 5, 6, 7].reduce((s, w, i) => s + w * +nip[i], 0) % 11 === +nip[9];
const arr = (v: any) => v == null ? [] : Array.isArray(v) ? v : [v];
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function get(url: string, ms = 20000) {
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { headers: { Accept: 'application/json' }, signal: ctl.signal }); } finally { clearTimeout(tm); }
}

// Biała lista – do 30 NIP-ów w jednym zapytaniu
async function vatBatch(nips: string[]) {
  const out = new Map<string, any>();
  for (let i = 0; i < nips.length; i += 30) {
    const part = nips.slice(i, i + 30);
    let date = today();
    let r = await get(`https://wl-api.mf.gov.pl/api/search/nips/${part.join(',')}?date=${date}`);
    if (!r.ok && r.status >= 500) { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); date = d.toISOString().slice(0, 10); r = await get(`https://wl-api.mf.gov.pl/api/search/nips/${part.join(',')}?date=${date}`); }
    if (!r.ok) throw new Error(`Biała lista: ${r.status}`);
    const j = await r.json();
    for (const e of arr(j?.result?.entries)) {
      const s = arr(e.subjects)[0];
      out.set(String(e.identifier), s ? {
        status: s.statusVat || null, name: s.name || null, address: s.workingAddress || s.residenceAddress || null,
        accounts: arr(s.accountNumbers).slice().sort(), krs: s.krs || null, removal: s.removalDate || null,
      } : { status: 'Niezarejestrowany', name: null, address: null, accounts: [], krs: null, removal: null });
    }
    if (i + 30 < nips.length) await sleep(400);
  }
  return out;
}

async function krs(nr: string) {
  const k = nr.replace(/\D/g, '').padStart(10, '0');
  let r = await get(`https://api-krs.ms.gov.pl/api/krs/OdpisAktualny/${k}?rejestr=P&format=json`);
  if (r.status === 404) r = await get(`https://api-krs.ms.gov.pl/api/krs/OdpisAktualny/${k}?rejestr=S&format=json`);
  if (r.status === 404) return { found: false };
  if (!r.ok) throw new Error(`KRS: ${r.status}`);
  const j = await r.json(); const d = j?.odpis?.dane || {};
  const nm = (x: any) => x?.nazwa || [x?.imiona?.imie, x?.nazwisko?.nazwiskoICzlon].filter(Boolean).join(' ');
  const adr = d?.dzial1?.siedzibaIAdres?.adres || {};
  const d6 = d?.dzial6 || {};
  return {
    found: true, name: d?.dzial1?.danePodmiotu?.nazwa || null,
    address: [adr.ulica, adr.nrDomu, adr.nrLokalu ? '/' + adr.nrLokalu : '', adr.kodPocztowy, adr.miejscowosc].filter(Boolean).join(' ').replace(' /', '/'),
    board: arr(d?.dzial2?.reprezentacja?.sklad).filter((x: any) => !x.czyZawieszona).map(nm).filter(Boolean).sort(),
    owners: [...arr(d?.dzial1?.wspolnicySpzoo), ...arr(d?.dzial1?.wspolnicySpolkiOsobowej)].map(nm).filter(Boolean).sort(),
    proxies: arr(d?.dzial2?.prokurenci).map(nm).filter(Boolean).sort(),
    liquidation: !!(d6?.likwidacja || arr(d6?.likwidatorzy).length), bankruptcy: !!(d6?.postepowanieUpadlosciowe || d6?.informacjaOOtwarciuPostepowaniaUpadlosciowego),
  };
}

const diffList = (a: string[] = [], b: string[] = []) => ({ added: b.filter(x => !a.includes(x)), removed: a.filter(x => !b.includes(x)) });
function compare(prev: any, cur: any) {
  const out: { kind: string; severity: string; summary: string }[] = [];
  const pv = prev.vat, cv = cur.vat;
  if (pv && cv) {
    if (pv.status !== cv.status) out.push({ kind: 'vat', severity: 'uwaga', summary: `Status VAT na Białej liście: ${pv.status || '—'} → ${cv.status || '—'}${cv.removal ? ` (wykreślenie ${cv.removal})` : ''}` });
    if (pv.name && cv.name && pv.name !== cv.name) out.push({ kind: 'vat', severity: 'info', summary: `Zmiana nazwy (Biała lista): ${cv.name}` });
    if (pv.address && cv.address && pv.address !== cv.address) out.push({ kind: 'vat', severity: 'info', summary: `Zmiana adresu (Biała lista): ${cv.address}` });
    const acc = diffList(pv.accounts, cv.accounts);
    if (acc.added.length || acc.removed.length) out.push({ kind: 'vat', severity: 'info', summary: `Rachunki na Białej liście: ${acc.added.length ? 'nowe ' + acc.added.length : ''}${acc.added.length && acc.removed.length ? ', ' : ''}${acc.removed.length ? 'usunięte ' + acc.removed.length : ''}` });
  }
  const pk = prev.krs, ck = cur.krs;
  if (pk?.found && ck?.found) {
    if (pk.name !== ck.name) out.push({ kind: 'krs', severity: 'info', summary: `KRS – zmiana nazwy: ${ck.name}` });
    if (pk.address !== ck.address) out.push({ kind: 'krs', severity: 'info', summary: `KRS – zmiana siedziby/adresu: ${ck.address}` });
    const b = diffList(pk.board, ck.board);
    if (b.added.length || b.removed.length) out.push({ kind: 'krs', severity: 'uwaga', summary: `KRS – zmiana zarządu${b.added.length ? `: nowi ${b.added.join(', ')}` : ''}${b.removed.length ? `; odwołani ${b.removed.join(', ')}` : ''}` });
    const o = diffList(pk.owners, ck.owners);
    if (o.added.length || o.removed.length) out.push({ kind: 'krs', severity: 'uwaga', summary: `KRS – zmiana wspólników${o.added.length ? `: nowi ${o.added.join(', ')}` : ''}${o.removed.length ? `; wystąpili ${o.removed.join(', ')}` : ''} – sprawdź CRBR` });
    const p = diffList(pk.proxies, ck.proxies);
    if (p.added.length || p.removed.length) out.push({ kind: 'krs', severity: 'info', summary: `KRS – zmiana prokury${p.added.length ? `: ${p.added.join(', ')}` : ''}` });
    if (!pk.liquidation && ck.liquidation) out.push({ kind: 'krs', severity: 'uwaga', summary: 'KRS – otwarto likwidację spółki' });
    if (!pk.bankruptcy && ck.bankruptcy) out.push({ kind: 'krs', severity: 'uwaga', summary: 'KRS – wpis o postępowaniu upadłościowym' });
  } else if (pk?.found && ck && !ck.found) out.push({ kind: 'krs', severity: 'uwaga', summary: 'KRS – podmiot nie występuje w rejestrze (możliwe wykreślenie)' });
  return out;
}

async function hookSecret() { const { data } = await admin.rpc('push_get_config'); return data?.push_hook_secret || ''; }

async function runFor(list: any[], { notify = true } = {}) {
  const nips = list.map(c => String(c.nip || '').replace(/\D/g, '')).filter(validNip);
  const vat = nips.length ? await vatBatch([...new Set(nips)]).catch(e => { console.error(e); return new Map(); }) : new Map();
  const { data: prevRows } = await admin.from('client_monitor').select('*').eq('module', 'rkdp').in('client_id', list.map(c => c.id));
  const prevBy = new Map((prevRows || []).map((r: any) => [r.client_id, r]));
  const secret = notify ? await hookSecret() : '';
  let checked = 0, changes = 0;
  for (const c of list) {
    const nip = String(c.nip || '').replace(/\D/g, '');
    const v = vat.get(nip) || null;
    const krsNo = String(c.krs || v?.krs || '').replace(/\D/g, '');
    let k: any = null;
    if (krsNo) { try { k = await krs(krsNo); } catch (e) { console.error(e); } await sleep(250); }
    if (!v && !k) continue;
    checked++;
    const cur = { vat: v, krs: k };
    const prev = prevBy.get(c.id) as any;
    if (prev) {
      // gdy jedno ze źródeł chwilowo nie odpowiedziało – porównujemy tylko to, co jest
      const merged = { vat: v ?? prev.snapshot?.vat ?? null, krs: k ?? prev.snapshot?.krs ?? null };
      const diffs = compare(prev.snapshot || {}, merged);
      for (const d of diffs) {
        changes++;
        await admin.from('monitor_alerts').insert({ module: 'rkdp', client_id: c.id, kind: d.kind, severity: d.severity, summary: d.summary, details: { before: prev.snapshot, after: merged } });
        // wpis w karcie AML klienta (jeśli jest)
        const { data: kase } = await admin.from('aml_cases').select('id,status').eq('module', 'rkdp').eq('client_id', c.id).maybeSingle();
        if (kase) {
          await admin.from('aml_checks').insert({ case_id: kase.id, kind: d.kind === 'vat' ? 'vat' : 'krs', result: d.severity === 'uwaga' ? 'uwaga' : 'info', summary: 'Monitoring: ' + d.summary, data: {}, raw: null, sha256: null, request_id: null, checked_by: null }).then(() => null, () => null);
          if (d.severity === 'uwaga' && kase.status === 'zweryfikowany') await admin.from('aml_cases').update({ status: 'wymaga_uwagi' }).eq('id', kase.id);
        }
        if (secret && d.severity === 'uwaga') {
          await fetch(`${URL_}/functions/v1/push`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-push-secret': secret },
            body: JSON.stringify({ event: 'monitor_alert', module: 'rkdp', client_id: c.id, summary: `${c.name}: ${d.summary}` }) }).catch(() => null);
        }
      }
      await admin.from('client_monitor').update({ snapshot: merged, nip, checked_at: new Date().toISOString() }).eq('id', prev.id);
    } else {
      await admin.from('client_monitor').insert({ module: 'rkdp', client_id: c.id, nip, snapshot: cur });
    }
  }
  return { checked, changes };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));
    const given = req.headers.get('x-push-secret') || '';
    if (given) {
      const s = await hookSecret();
      if (!s || given !== s) return json({ error: 'Brak dostępu' }, 401);
      if (body.action !== 'run_all') return json({ error: 'Nieznana operacja' }, 400);
      const { data: list } = await admin.from('clients').select('id,name,nip,krs,status').eq('status', 'aktywny');
      return json(await runFor(list || []));
    }
    // ręczne sprawdzenie jednego klienta przez członka zespołu, który go widzi
    const auth = req.headers.get('Authorization') || '';
    if (!auth.startsWith('Bearer ')) return json({ error: 'Brak dostępu' }, 401);
    const sb = createClient(URL_, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const { data: c } = await sb.from('clients').select('id,name,nip,krs,status').eq('id', String(body.client_id || '')).maybeSingle();
    if (!c) return json({ error: 'Brak dostępu do klienta.' }, 403);
    const res = await runFor([c], { notify: false });
    const { data: snap } = await admin.from('client_monitor').select('snapshot,checked_at').eq('module', 'rkdp').eq('client_id', c.id).maybeSingle();
    return json({ ...res, snapshot: snap?.snapshot || null, checked_at: snap?.checked_at || null });
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
