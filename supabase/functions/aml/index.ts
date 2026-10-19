// Automatyczna weryfikacja AML klienta: CRBR (API MF), KRS (API MS), Biała lista VAT (MF), listy sankcyjne (UE, ONZ, MSWiA).
// Wywołać może tylko zalogowany członek zespołu, który widzi kartę AML klienta (sprawdzane w bazie – can_see_aml_case).
// Wyniki zapisywane są w niezmienialnym rejestrze aml_checks (z pełną odpowiedzią CRBR i jej skrótem SHA-256).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { XMLParser } from 'npm:fast-xml-parser@4.4.1';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const xml = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, parseTagValue: false, trimValues: true });
const arr = (v: any) => v === undefined || v === null ? [] : Array.isArray(v) ? v : [v];
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' });
const validNip = (nip: string) => /^\d{10}$/.test(nip) && [6, 5, 7, 2, 3, 4, 5, 6, 7].reduce((s, w, i) => s + w * +nip[i], 0) % 11 === +nip[9];
async function sha256(t: string) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function get(url: string, init: RequestInit = {}, ms = 25000) {
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctl.signal }); } finally { clearTimeout(tm); }
}

// ---------------- CRBR ----------------
const CRBR_V = '2022/12/01';
const CRBR_NS = `http://www.mf.gov.pl/uslugiBiznesowe/uslugiESB/AP/ApiPrzegladoweCRBR/${CRBR_V}`;
const CRBR_NS1 = `http://www.mf.gov.pl/schematy/AP/ApiPrzegladoweCRBR/${CRBR_V}`;
async function crbr(nip: string) {
  const body = `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:ns="${CRBR_NS}" xmlns:ns1="${CRBR_NS1}"><soap:Header/><soap:Body><ns:PobierzInformacjeOSpolkachIBeneficjentach><PobierzInformacjeOSpolkachIBeneficjentachDane><ns1:SzczegolyWniosku><ns1:NIP>${nip}</ns1:NIP></ns1:SzczegolyWniosku></PobierzInformacjeOSpolkachIBeneficjentachDane></ns:PobierzInformacjeOSpolkachIBeneficjentach></soap:Body></soap:Envelope>`;
  const r = await get(`https://bramka-crbr.mf.gov.pl:5058/uslugiBiznesowe/uslugiESB/AP/ApiPrzegladoweCRBR/${CRBR_V}`, {
    method: 'POST', headers: { 'Content-Type': `application/soap+xml; charset=utf-8; action="${CRBR_NS}/PobierzInformacjeOSpolkachIBeneficjentach"` }, body,
  }, 30000);
  const raw = await r.text();
  if (!r.ok) throw new Error(`CRBR odpowiedział błędem (${r.status}).`);
  const doc = xml.parse(raw);
  const d = doc?.Envelope?.Body?.PobierzInformacjeOSpolkachIBeneficjentachOdpowiedz?.PobierzInformacjeOSpolkachIBeneficjentachOdpowiedzDane || {};
  const person = (p: any) => ({
    first: [p.PierwszeImie, p.KolejneImiona].filter(Boolean).join(' '), last: p.Nazwisko || '', pesel: p.PESEL || null, birth: p.DataUrodzenia || null,
    citizenship: arr(p.Obywatelstwo).map((o: any) => o?.Nazwa || o?.Kod || o).filter(Boolean).join(', '),
    residence: arr(p.KrajZamieszkania).map((o: any) => o?.Nazwa || o?.Kod || o).filter(Boolean).join(', '),
  });
  const shares = (b: any) => arr(b?.ListaInformacjiOUdzialach?.InformacjaOUdzialach).flatMap((i: any) => ['UprawnieniaWlascicielskieBezposrednie', 'UprawnieniaWlascicielskiePosrednie', 'InneUprawnienia']
    .flatMap(k => arr(i?.[k]).map((u: any) => ({ type: k.replace('UprawnieniaWlascicielskie', '').replace('InneUprawnienia', 'Inne') || k, kind: u?.UprawnieniaWlascicielskie?.Opis || u?.RodzajUprawnienWlascicielskich || u?.Opis || '', unit: u?.JednostkaMiary?.Opis || u?.JednostkaMiary || '', qty: u?.Ilosc || '', privilege: u?.InformacjaOUprzywilejowaniu?.RodzajUprzywilejowania?.Opis || u?.InformacjaOUprzywilejowaniu?.RodzajUprzywilejowania || '' }))));
  const companies = arr(d?.ListaInformacjiOSpolkachIBeneficjentach?.SpolkaIBeneficjenci).map((s: any) => ({
    name: s.Nazwa || '', nip: s.NIP || '', krs: s.KRS || '', form: s.OpisFormyOrganizacyjnej || s.KodFormyOrganizacyjnej || '',
    address: [s.Ulica, s.NrDomu && `${s.NrDomu}${s.NrLokalu ? '/' + s.NrLokalu : ''}`, s.KodPocztowy, s.Miejscowosc].filter(Boolean).join(' '),
    from: s.DataPoczatkuPrezentacjiZgloszenia || null, to: s.DataKoncaPrezentacjiZgloszenia || null, ref: s.NumerReferencyjny || null, corrected: s.Skorygowane || null,
    discrepancies: arr(s?.ListaInformacjiORozbieznosciach?.InformacjaORozbieznosci || s?.ListaInformacjiORozbieznosciach).map((x: any) => x?.InformacjaDlaZainteresowanego || JSON.stringify(x)).filter(Boolean),
    beneficiaries: arr(s?.ListaBeneficjentowRzeczywistych?.BeneficjentRzeczywisty).map((b: any) => ({ ...person(b), shares: shares(b) })),
    reporters: arr(s?.ListaZglaszajacych?.Zglaszajacy || s?.ListaReprezentantow?.Reprezentant).map((z: any) => ({ ...person(z), role: arr(z?.ListaFunkcjiZglaszajacego?.Funkcja).map((f: any) => f?.Opis || f).join(', ') || z?.RodzajReprezentacji || '' })),
  }));
  // aktualne zgłoszenie = bez daty końca prezentacji
  const current = companies.filter((c: any) => !c.to);
  return { raw, status: d.Status || null, requestId: d.IdentyfikatorWniosku || null, requestedAt: d.DataICzasZlozeniaWniosku || null, providedAt: d.DataICzasUdostepnieniaWniosku || null, companies: current.length ? current : companies };
}

// ---------------- KRS ----------------
async function krs(nr: string) {
  const k = nr.replace(/\D/g, '').padStart(10, '0');
  let r = await get(`https://api-krs.ms.gov.pl/api/krs/OdpisAktualny/${k}?rejestr=P&format=json`, { headers: { Accept: 'application/json' } });
  if (r.status === 404) r = await get(`https://api-krs.ms.gov.pl/api/krs/OdpisAktualny/${k}?rejestr=S&format=json`, { headers: { Accept: 'application/json' } });
  if (r.status === 404) return { found: false, krs: k };
  if (!r.ok) throw new Error(`KRS odpowiedział błędem (${r.status}).`);
  const j = await r.json(); const d = j?.odpis?.dane || {};
  const p = (x: any) => ({ last: x?.nazwisko?.nazwiskoICzlon || '', first: [x?.imiona?.imie, x?.imiona?.imieDrugie].filter(Boolean).join(' '), entity: x?.nazwa || null });
  return {
    found: true, krs: k, stanZDnia: j?.odpis?.naglowekA?.stanZDnia || null, name: d?.dzial1?.danePodmiotu?.nazwa || null, form: d?.dzial1?.danePodmiotu?.formaPrawna || null,
    shareholders: arr(d?.dzial1?.wspolnicySpzoo).map((w: any) => ({ ...p(w), shares: w.posiadaneUdzialy || '' })),
    partners: arr(d?.dzial1?.wspolnicySpolkiOsobowej || d?.dzial1?.wspolnicy).map(p),
    board: arr(d?.dzial2?.reprezentacja?.sklad).filter((x: any) => !x.czyZawieszona).map((x: any) => ({ ...p(x), role: x.funkcjaWOrganie || '' })),
    proxies: arr(d?.dzial2?.prokurenci).map((x: any) => ({ ...p(x), role: 'prokurent' })),
    representation: d?.dzial2?.reprezentacja?.sposobReprezentacji || null,
  };
}

// ---------------- Biała lista VAT ----------------
async function vat(nip: string) {
  let date = today();
  let r = await get(`https://wl-api.mf.gov.pl/api/search/nip/${nip}?date=${date}`, { headers: { Accept: 'application/json' } });
  let j = await r.json().catch(() => ({}));
  if (!r.ok && (r.status >= 500 || /aktualizacj/i.test(j?.message || ''))) {
    // baza MF w trakcie aktualizacji – stan na dzień poprzedni
    const x = new Date(date + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() - 1); date = x.toISOString().slice(0, 10);
    r = await get(`https://wl-api.mf.gov.pl/api/search/nip/${nip}?date=${date}`, { headers: { Accept: 'application/json' } });
    j = await r.json().catch(() => ({}));
  }
  if (!r.ok) throw new Error(/aktualizacj/i.test(j?.message || '') ? 'Biała lista MF chwilowo aktualizuje bazę – spróbuj ponownie za kilkanaście minut.' : (j?.message || `Biała lista odpowiedziała błędem (${r.status}).`));
  const s = j?.result?.subject;
  if (!s) return { found: false, requestId: j?.result?.requestId || null };
  return { found: true, asOf: date, requestId: j?.result?.requestId || null, name: s.name, statusVat: s.statusVat, krs: s.krs || null, regon: s.regon || null,
    address: s.workingAddress || s.residenceAddress || null, accounts: s.accountNumbers || [], registered: s.registrationLegalDate || null,
    removed: s.removalDate || null, removalBasis: s.removalBasis || null, representatives: arr(s.representatives).map((x: any) => [x.firstName, x.lastName, x.companyName].filter(Boolean).join(' ')) };
}

// ---------------- listy sankcyjne ----------------
const STOP = new Set(['sp', 'z', 'o', 'oo', 'spolka', 'ograniczona', 'odpowiedzialnoscia', 'akcyjna', 'komandytowa', 'jawna', 'cywilna', 's', 'a', 'sa', 'ltd', 'llc', 'gmbh', 'ooo', 'zao', 'pao', 'oao', 'jsc', 'limited', 'company', 'co', 'inc', 'the', 'and', 'i', 'of', 'ag', 'bv', 'kg']);
const norm = (t: string) => (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').toLowerCase().replace(/[^a-z0-9а-яё]+/g, ' ').trim();
const toks = (t: string) => norm(t).split(' ').filter(w => w.length > 1 && !STOP.has(w));
const SOURCES: Record<string, { label: string; url: string }> = {
  eu: { label: 'Skonsolidowana lista sankcji finansowych UE', url: 'https://webgate.ec.europa.eu/fsd/fsf/public/files/csvFullSanctionsList_1_1/content?token=dG9rZW4tMjAxNw' },
  un: { label: 'Skonsolidowana lista sankcyjna Rady Bezpieczeństwa ONZ', url: 'https://scsanctions.un.org/resources/xml/en/consolidated.xml' },
  pl: { label: 'Lista osób i podmiotów objętych sankcjami (MSWiA)', url: 'https://www.gov.pl/web/mswia/lista-osob-i-podmiotow-objetych-sankcjami' },
};
function splitCsv(line: string, sep: string) {
  const out: string[] = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true; else if (ch === sep) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur); return out;
}
async function fetchList(src: string): Promise<string[]> {
  const r = await get(SOURCES[src].url, { headers: { 'User-Agent': 'Mozilla/5.0 (aplikacja AML RKDP/M2 TAX)' } }, 60000);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const t = await r.text();
  const names = new Set<string>();
  if (src === 'eu') {
    const lines = t.split(/\r?\n/); const sep = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',';
    const head = splitCsv(lines[0], sep).map(h => h.toLowerCase());
    const cols = head.map((h, i) => /wholename/.test(h) ? i : -1).filter(i => i >= 0);
    for (let i = 1; i < lines.length; i++) { const l = lines[i]; if (!l) continue; const c = l.indexOf('"') >= 0 ? splitCsv(l, sep) : l.split(sep); cols.forEach(ix => { const v = (c[ix] || '').trim(); if (v) names.add(v); }); }
  } else if (src === 'un') {
    const d = xml.parse(t)?.CONSOLIDATED_LIST || {};
    for (const p of arr(d?.INDIVIDUALS?.INDIVIDUAL)) {
      names.add([p.FIRST_NAME, p.SECOND_NAME, p.THIRD_NAME, p.FOURTH_NAME].filter(Boolean).join(' '));
      arr(p.INDIVIDUAL_ALIAS).forEach((a: any) => a?.ALIAS_NAME && names.add(a.ALIAS_NAME));
    }
    for (const e of arr(d?.ENTITIES?.ENTITY)) { e.FIRST_NAME && names.add(e.FIRST_NAME); arr(e.ENTITY_ALIAS).forEach((a: any) => a?.ALIAS_NAME && names.add(a.ALIAS_NAME)); }
  } else {
    for (const row of t.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
      const cells = (row.match(/<td[\s\S]*?<\/td>/gi) || []).map(c => c.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim());
      const cand = cells.find(c => /[A-Za-zÀ-žА-я]{3}/.test(c) && !/^\d/.test(c));
      if (cand) cand.split(/\s*(?:\(|;|\bvel\b|\bznany również jako\b)\s*/i).slice(0, 2).forEach(n => n.length > 3 && names.add(n.replace(/\)$/, '')));
    }
  }
  return [...names].filter(n => n && n.length > 2);
}
// odświeżenie jednej listy (osobne wywołanie – limit czasu procesora funkcji); nazwy zapisujemy jako „wyświetlana\tznormalizowana”
async function refreshList(admin: any, s: string) {
  const { data: prev } = await admin.from('sanctions_lists').select('source, fetched_at, entries').eq('source', s).maybeSingle();
  try {
    const names = (await fetchList(s)).map(n => { const t = toks(n); return t.length ? `${n}\t${t.join(' ')}` : null; }).filter(Boolean);
    if (names.length < 20) throw new Error('Pobrano zbyt mało pozycji – źródło mogło zmienić format.');
    await admin.from('sanctions_lists').upsert({ source: s, fetched_at: new Date().toISOString(), entries: names.length, names, error: null });
    return { source: s, entries: names.length };
  } catch (e) {
    await admin.from('sanctions_lists').upsert({ source: s, fetched_at: prev?.fetched_at || new Date(0).toISOString(), entries: prev?.entries || 0, ...(prev ? {} : { names: [] }), error: String(e) });
    return { source: s, error: String(e) };
  }
}
async function loadLists(admin: any) {
  const { data } = await admin.from('sanctions_lists').select('*');
  return data || [];
}
function screen(lists: any[], candidates: string[]) {
  const C = candidates.filter(Boolean).map(c => ({ c, t: toks(c), n: toks(c).join(' ') })).filter(x => x.t.length);
  const hits: any[] = [];
  for (const L of lists) for (const row of (L.names || [])) {
    const tab = row.indexOf('\t'); const name = tab >= 0 ? row.slice(0, tab) : row; const en = tab >= 0 ? row.slice(tab + 1) : toks(row).join(' ');
    if (!en) continue; const et = en.split(' ');
    for (const x of C) {
      const set = new Set(x.t);
      const match = en === x.n || (et.length >= 2 && et.every(w => set.has(w))) || (x.t.length >= 2 && et.length >= 2 && x.t.every(w => et.includes(w)));
      if (match) hits.push({ candidate: x.c, listed: name, source: L.source, sourceLabel: SOURCES[L.source]?.label || L.source });
    }
  }
  const seen = new Set<string>();
  return hits.filter(h => { const k = h.candidate + '|' + h.listed + '|' + h.source; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 50);
}

const OBLIGED = new Set(['spzoo', 'sa', 'psa', 'spk', 'ska', 'spj', 'spp', 'fundacja', 'stowarzyszenie']);
const fullName = (p: any) => p.entity || [p.first, p.last].filter(Boolean).join(' ');

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const auth = req.headers.get('Authorization') || '';
    if (!auth.startsWith('Bearer ')) return json({ error: 'Brak dostępu' }, 401);
    const url = Deno.env.get('SUPABASE_URL')!;
    const sb = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const { data: memberId } = await sb.rpc('current_member_id');
    if (!memberId) return json({ error: 'Brak dostępu' }, 403);
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json().catch(() => ({}));

    if (body.action === 'lists') {
      const { data } = await admin.from('sanctions_lists').select('source, fetched_at, entries, error');
      return json({ lists: (data || []).map((x: any) => ({ ...x, label: SOURCES[x.source]?.label })) });
    }
    if (body.action === 'refresh_lists') {
      const s = String(body.source || '');
      if (!SOURCES[s]) return json({ error: 'Nieznana lista.' }, 400);
      return json(await refreshList(admin, s));
    }
    if (body.action !== 'run') return json({ error: 'Nieznana operacja.' }, 400);

    const caseId = String(body.case_id || '');
    const { data: ok } = await sb.rpc('can_see_aml_case', { c: caseId });
    if (!ok) return json({ error: 'Brak dostępu do tej karty AML.' }, 403);
    const { data: kase } = await admin.from('aml_cases').select('*').eq('id', caseId).single();
    let client: any = {}, people: string[] = [], legal = '';
    if (kase.module === 'rkdp') {
      const { data: c } = await admin.from('clients').select('*').eq('id', kase.client_id).single();
      const { data: ps } = await admin.from('client_partners').select('*').eq('client_id', kase.client_id);
      client = c; legal = c.legal_form || '';
      people = (ps || []).map((p: any) => p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || p.name).filter(Boolean);
      if (c.contact_person) people.push(c.contact_person);
    } else {
      const { data: c } = await admin.from('m2_clients').select('*').eq('id', kase.m2_client_id).single();
      const { data: cs } = await admin.from('m2_contacts').select('full_name').eq('client_id', kase.m2_client_id);
      client = c; legal = c.kind === 'osoba' ? 'osoba' : (/sp\.?\s*z\s*o\.?\s*o|spółka z ograniczoną/i.test(c.name) ? 'spzoo' : /s\.a\.|spółka akcyjna/i.test(c.name) ? 'sa' : /sp\.?\s*k\.|komandytowa/i.test(c.name) ? 'spk' : /sp\.?\s*j\.|jawna/i.test(c.name) ? 'spj' : 'firma');
      people = (cs || []).map((x: any) => x.full_name).filter(Boolean);
      if (c.contact_person) people.push(c.contact_person);
      if (c.beneficial_owner) people.push(...String(c.beneficial_owner).split(/[,;\n]/).map(s => s.trim()).filter(Boolean));
    }
    const nip = String(client.nip || '').replace(/\D/g, '');
    const want = new Set<string>(Array.isArray(body.only) && body.only.length ? body.only : ['vat', 'crbr', 'krs', 'sankcje']);
    const checks: any[] = [];
    // wszystkie wiersze z kompletem kolumn – przy zapisie zbiorczym brakujące pola trafiłyby jako NULL (nie domyślne)
    const add = (c: any) => checks.push({ case_id: caseId, checked_by: memberId, data: {}, raw: null, sha256: null, request_id: null, ...c, ...(c.data == null ? { data: {} } : {}) });
    let krsNo = String(client.krs || '').replace(/\D/g, '');

    if (want.has('vat')) {
      if (!validNip(nip)) add({ kind: 'vat', result: 'info', summary: 'Brak poprawnego NIP – pominięto Białą listę VAT.' });
      else try {
        const v = await vat(nip);
        if (v.krs && !krsNo) krsNo = v.krs;
        add({ kind: 'vat', result: v.found ? (v.statusVat === 'Czynny' ? 'ok' : 'info') : 'info', request_id: v.requestId,
          summary: v.found ? `${v.name} – status VAT: ${v.statusVat}${v.accounts.length ? `, rachunki: ${v.accounts.length}` : ''}` : 'Podmiot nie figuruje w wykazie podatników VAT.', data: v });
      } catch (e) { add({ kind: 'vat', result: 'blad', summary: String(e) }); }
    }
    let crbrData: any = null;
    if (want.has('crbr')) {
      if (!validNip(nip)) add({ kind: 'crbr', result: OBLIGED.has(legal) ? 'uwaga' : 'info', summary: 'Brak poprawnego NIP – nie można sprawdzić CRBR.' });
      else try {
        const c = await crbr(nip);
        crbrData = c;
        const co = c.companies[0];
        const obliged = OBLIGED.has(legal);
        const disc = c.companies.flatMap((x: any) => x.discrepancies || []);
        const result = c.status === 'IstniejaInformacje' ? (disc.length ? 'uwaga' : 'ok') : c.status === 'BrakInformacji' ? (obliged ? 'uwaga' : 'info') : 'blad';
        const summary = c.status === 'IstniejaInformacje'
          ? `Beneficjenci rzeczywiści: ${(co?.beneficiaries || []).map(fullName).join(', ') || '—'}${disc.length ? ' · ROZBIEŻNOŚCI ZGŁOSZONE W CRBR' : ''}`
          : c.status === 'BrakInformacji' ? (obliged ? 'Brak zgłoszenia w CRBR, a podmiot podlega obowiązkowi zgłoszenia.' : 'Brak informacji w CRBR (podmiot zwykle nie podlega zgłoszeniu).') : `Odpowiedź CRBR: ${c.status || 'nieznana'}`;
        const { raw, ...data } = c;
        add({ kind: 'crbr', result, summary, data, raw, sha256: await sha256(raw), request_id: c.requestId });
      } catch (e) { add({ kind: 'crbr', result: 'blad', summary: String(e) }); }
    }
    let krsData: any = null;
    if (want.has('krs')) {
      if (!krsNo) add({ kind: 'krs', result: 'info', summary: 'Klient bez numeru KRS – pominięto.' });
      else try {
        const k = await krs(krsNo); krsData = k;
        let summary = k.found ? `${k.name} · zarząd: ${(k.board || []).map(fullName).join(', ') || '—'}${k.shareholders?.length ? ` · wspólnicy: ${k.shareholders.map(fullName).join(', ')}` : ''}` : `Nie znaleziono w KRS (${krsNo}).`;
        let result = k.found ? 'ok' : 'uwaga';
        // porównanie z CRBR: wspólnik (osoba fizyczna) z KRS nieujawniony jako beneficjent – do sprawdzenia
        if (k.found && crbrData?.companies?.[0]) {
          const bens = new Set(crbrData.companies[0].beneficiaries.map((b: any) => toks(fullName(b)).sort().join(' ')));
          const missing = (k.shareholders || []).filter((s: any) => !s.entity && s.last && !s.last.includes('*')).filter((s: any) => !bens.has(toks(fullName(s)).sort().join(' ')));
          if (missing.length) { summary += ` · Do sprawdzenia: wspólnicy z KRS nieujawnieni w CRBR (${missing.map(fullName).join(', ')}) – oceń udział (>25%) i ewentualną rozbieżność.`; result = 'info'; }
        }
        add({ kind: 'krs', result, summary, data: k });
      } catch (e) { add({ kind: 'krs', result: 'blad', summary: String(e) }); }
    }
    if (want.has('sankcje')) {
      try {
        const lists = await loadLists(admin);
        const cands = [client.name, ...people,
          ...(crbrData?.companies || []).flatMap((c: any) => [...c.beneficiaries, ...c.reporters].map(fullName)),
          ...(krsData?.found ? [...krsData.board, ...krsData.shareholders, ...(krsData.partners || []), ...(krsData.proxies || [])].map(fullName) : [])]
          .filter((v, i, a) => v && !v.includes('*') && a.indexOf(v) === i);
        const hits = screen(lists, cands);
        const srcInfo = lists.map((l: any) => ({ source: l.source, label: SOURCES[l.source]?.label, fetched_at: l.fetched_at, entries: l.entries, error: l.error }));
        const broken = srcInfo.filter(s => !s.entries);
        const stale = srcInfo.filter(s => s.entries && Date.now() - new Date(s.fetched_at).getTime() > 72 * 3600 * 1000);
        add({ kind: 'sankcje', result: hits.length ? 'uwaga' : (broken.length || !srcInfo.length) ? 'blad' : 'ok',
          summary: hits.length ? `MOŻLIWE TRAFIENIE na liście sankcyjnej (${hits.length}) – wymaga ręcznej oceny.` : `Brak trafień. Sprawdzono ${cands.length} nazw na ${srcInfo.filter(s => s.entries).length} listach${broken.length ? ` (niedostępne: ${broken.map(b => b.label).join(', ')})` : ''}${stale.length ? ` (nieaktualne ponad 3 dni: ${stale.map(b => b.label).join(', ')})` : ''}.`,
          data: { candidates: cands, hits, lists: srcInfo } });
      } catch (e) { add({ kind: 'sankcje', result: 'blad', summary: String(e) }); }
    }

    const { data: saved, error } = await admin.from('aml_checks').insert(checks).select('id, kind, result, summary, checked_at, request_id, sha256');
    if (error) throw error;
    const alert = checks.some(c => c.result === 'uwaga');
    const status = alert ? 'wymaga_uwagi' : (kase.status === 'do_uzupelnienia' ? 'w_trakcie' : kase.status);
    await admin.from('aml_cases').update({ last_auto_at: new Date().toISOString(), status }).eq('id', caseId);
    return json({ checks: saved, status });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
