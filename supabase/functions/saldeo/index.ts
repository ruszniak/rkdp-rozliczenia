// SaldeoSMART → automatyczne kratki „Saldeo” i „Rewizor” w rozliczeniach miesięcznych.
// TYLKO ODCZYT: company.list, document.getidlist, document.listbyid. Funkcja nigdy nie woła operacji zmieniających dane
// w Saldeo (document.sync / update / delete / import, *.merge) i nie używa document.list z polityką SALDEO (kolejka wysyłki
// do programu księgowego, z której korzysta e-bit).
//
// Reguły:
//   • „Saldeo”  – w miesiącu jest co najmniej jedna faktura z KSeF zatwierdzona przez klienta
//                 (etap obiegu z ustawienia saldeo_approved_stages albo znacznik APPROVED/VERIFIED).
//   • „Rewizor” – miesiąc ma co najmniej jedną fakturę i wszystkie faktury są przeniesione do programu księgowego
//                 (EXPORTED albo status w programie INTRODUCED/BOOKED).
//   Automat zaznacza tylko kratki „do zrobienia” (todo), których nikt nie odznaczył po automacie; nigdy nie odznacza.
//
// Wywołania:
//   z harmonogramu (x-push-secret)  { action: 'run_all' }
//   członek zespołu (pełny dostęp)  { action: 'run', period, client_id? } · { action: 'status' }
//   administrator                    { action: 'match' } · { action: 'probe', client_id, period }
// Sekrety: SALDEO_USERNAME, SALDEO_TOKEN (opcjonalnie SALDEO_URL).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { XMLParser } from 'npm:fast-xml-parser@4.5.0';
import { crypto } from 'jsr:@std/crypto@1';
import { encodeHex } from 'jsr:@std/encoding@1/hex';
import { encodeBase64 } from 'jsr:@std/encoding@1/base64';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const URL_ = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(URL_, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const BASE = (Deno.env.get('SALDEO_URL') || 'https://saldeo.brainshare.pl').replace(/\/+$/, '');
const USER = Deno.env.get('SALDEO_USERNAME') || '';
const TOKEN = Deno.env.get('SALDEO_TOKEN') || '';
const configured = () => !!(USER && TOKEN);
const NOT_CONFIGURED = { configured: false, reason: 'Brak sekretów SALDEO_USERNAME i SALDEO_TOKEN w Supabase (Edge Functions → Secrets).' };

const BATCH_COMPANIES = 8;      // firm na jedno wywołanie
const REQUEST_BUDGET = 22;      // zapytań do Saldeo na jedno wywołanie (limit Saldeo: 20/min, jedno naraz)
const GAP_MS = 3200;            // odstęp między zapytaniami
const IDS_PER_REQUEST = 100;
const INVOICE_GROUPS = ['INVOICES_COST', 'INVOICES_SALE', 'INVOICES_INTERNAL', 'INVOICES_MATERIAL'];
const ALL_GROUPS = [...INVOICE_GROUPS, 'CONTRACTS', 'ORDERS', 'WRITINGS', 'OTHER_DOCUMENTS'];

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const cleanNip = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const arr = <T = any>(v: T | T[] | null | undefined): T[] => v == null ? [] : Array.isArray(v) ? v : [v];
const txt = (v: unknown) => v == null ? '' : typeof v === 'object' ? String((v as any)['#text'] ?? '') : String(v).trim();
const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: true });

// ---------- klient API Saldeo ----------
// podpis: MD5( URL_ENCODE( posortowane „klucz=wartość” bez separatorów ) + token ), kodowanie jak HttpUtility.UrlEncode
const urlEnc = (s: string) => encodeURIComponent(s).replace(/%20/g, '+')
  .replace(/[!'()~]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
async function md5(s: string) { return encodeHex(await crypto.subtle.digest('MD5', new TextEncoder().encode(s))); }
async function gzipB64(xml: string) {
  const gz = await new Response(new Blob([new TextEncoder().encode(xml)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  return encodeBase64(new Uint8Array(gz));
}

class Saldeo {
  used = 0; last = 0; log: { op: string; ms: number; status: string }[] = [];
  budget: number;
  constructor(budget = REQUEST_BUDGET) { this.budget = budget; }
  left() { return this.budget - this.used; }
  async call(path: string, method: 'GET' | 'POST', extra: Record<string, string> = {}, commandXml?: string) {
    if (this.used >= this.budget) throw new Error('BUDGET');
    const wait = this.last + GAP_MS - Date.now(); if (wait > 0) await sleep(wait);
    const params: Record<string, string> = { username: USER, req_id: String(Date.now()) + Math.floor(Math.random() * 1000), ...extra };
    if (commandXml != null) params.command = await gzipB64(commandXml);
    const base = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('');
    params.req_sig = await md5(urlEnc(base) + TOKEN);
    const body = new URLSearchParams(params);
    this.used++; const t0 = Date.now();
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 45000);
    let raw = '';
    try {
      const r = method === 'GET'
        ? await fetch(`${BASE}${path}?${body}`, { signal: ctl.signal })
        : await fetch(`${BASE}${path}`, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctl.signal });
      raw = await r.text();
      if (!r.ok && !raw.includes('<RESPONSE')) throw new Error(`Saldeo HTTP ${r.status}`);
    } finally { clearTimeout(tm); this.last = Date.now(); }
    const x = parser.parse(raw);
    const resp = x.RESPONSE ?? x;
    const status = txt(resp.STATUS) || 'OK';
    this.log.push({ op: path, ms: Date.now() - t0, status });
    if (status !== 'OK') throw new Error(`Saldeo ${txt(resp.ERROR_CODE)}: ${txt(resp.ERROR_MESSAGE) || 'błąd'}`);
    return { resp, raw };
  }
}

async function listCompanies(s: Saldeo) {
  const { resp } = await s.call('/api/xml/1.18/company/list', 'GET');
  const list = findAll(resp, o => 'COMPANY_ID' in o);
  return list.map(c => ({
    id: txt(c.COMPANY_ID), program_id: txt(c.COMPANY_PROGRAM_ID),
    name: txt(c.SHORT_NAME) || txt(c.FULL_NAME), nip: cleanNip(c.VAT_NUMBER),
  })).filter(c => c.id);
}

// przechodzi po sparsowanym XML i zbiera obiekty spełniające warunek (nie schodzi w znalezione)
function findAll(node: any, pred: (o: any) => boolean, out: any[] = []): any[] {
  if (Array.isArray(node)) { node.forEach(n => findAll(n, pred, out)); return out; }
  if (node && typeof node === 'object') {
    if (pred(node)) { out.push(node); return out; }
    for (const k of Object.keys(node)) findAll(node[k], pred, out);
  }
  return out;
}
// znajduje obiekt-rodzica, który zawiera grupy identyfikatorów (np. INVOICES_COST)
function findGroupParent(node: any, path: string[] = []): { obj: any; path: string[] } | null {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return null;
  if (ALL_GROUPS.some(g => g in node)) return { obj: node, path };
  for (const k of Object.keys(node)) { const r = findGroupParent(node[k], [...path, k]); if (r) return r; }
  return null;
}
const idsIn = (v: any): string[] => findAll(v, o => 'DOCUMENT_ID' in o).flatMap(o => arr(o.DOCUMENT_ID).map(txt)).filter(Boolean)
  .concat(typeof v === 'string' ? [v] : []);

async function monthDocuments(s: Saldeo, programId: string, period: string, { keepRaw = false } = {}) {
  const [y, m] = period.split('-').map(Number);
  const extra = { company_program_id: programId };
  const ids = await s.call('/api/xml/3.0/document/getidlist', 'POST', extra,
    `<?xml version="1.0" encoding="UTF-8"?><ROOT><FOLDER><YEAR>${y}</YEAR><MONTH>${m}</MONTH></FOLDER></ROOT>`);
  const gp = findGroupParent(ids.resp);
  const groups: Record<string, string[]> = {};
  if (gp) for (const g of ALL_GROUPS) { const list = [...new Set(idsIn(gp.obj[g]))]; if (list.length) groups[g] = list; }
  // wrapper z odpowiedzi getidlist (np. DOCUMENT_IDS) wraca w zapytaniu listbyid tak samo
  const wrap = gp?.path.filter(p => p !== 'RESPONSE' && p !== 'ROOT') || [];
  const docs: any[] = []; const raws: string[] = [];
  const queue = Object.entries(groups).flatMap(([g, list]) => list.map(id => [g, id] as const));
  for (let i = 0; i < queue.length; i += IDS_PER_REQUEST) {
    const part = queue.slice(i, i + IDS_PER_REQUEST);
    const by: Record<string, string[]> = {};
    part.forEach(([g, id]) => (by[g] ||= []).push(id));
    let inner = Object.entries(by).map(([g, l]) => `<${g}>${l.map(id => `<DOCUMENT_ID>${id}</DOCUMENT_ID>`).join('')}</${g}>`).join('');
    for (const w of [...wrap].reverse()) inner = `<${w}>${inner}</${w}>`;
    const res = await s.call('/api/xml/3.1/document/listbyid', 'POST', extra, `<?xml version="1.0" encoding="UTF-8"?><ROOT>${inner}</ROOT>`);
    if (keepRaw) raws.push(res.raw.slice(0, 6000));
    const groupOf = new Map(part.map(([g, id]) => [id, g]));
    for (const d of findAll(res.resp, o => 'DOCUMENT_ID' in o && ('NUMBER' in o || 'FOLDER' in o || 'STAGE' in o || 'KSEF' in o)))
      docs.push({ ...d, __group: groupOf.get(txt(d.DOCUMENT_ID)) || '' });
  }
  return { groups, docs, wrap, rawIds: keepRaw ? ids.raw.slice(0, 4000) : undefined, rawDocs: keepRaw ? raws : undefined };
}

// ---------- reguły ----------
const truthy = (v: unknown) => ['true', '1', 'tak', 'yes'].includes(txt(v).toLowerCase());
const isKsef = (d: any) => !!(txt(d?.KSEF?.NUMBER) || txt(d?.KSEF_NUMBER) || /ksef/i.test(txt(d.SOURCE) + ' ' + txt(d.CREATE_SOURCE)));
const syncStatuses = (d: any) => findAll(d.SALDEO_SYNC_DOCUMENTS, o => 'DOCUMENT_STATUS' in o).map(o => txt(o.DOCUMENT_STATUS).toUpperCase());
const isExported = (d: any) => !!txt(d.EXPORTED) || syncStatuses(d).some(s => s === 'INTRODUCED' || s === 'BOOKED');
const isInvoice = (d: any) => INVOICE_GROUPS.includes(d.__group) || (!d.__group && /INVOICE|FAKTUR/i.test(txt(d.DOCUMENT_TYPE) + txt(d.TYPE)));

function evaluate(docs: any[], approvedStages: string[]) {
  const approved = (d: any) => truthy(d.APPROVED) || truthy(d.VERIFIED) || approvedStages.includes(txt(d.STAGE).toLowerCase());
  const inv = docs.filter(isInvoice);
  const ksef = inv.filter(isKsef);
  const ksefApproved = ksef.filter(approved).length;
  const exported = inv.filter(isExported).length;
  return {
    invoices: inv.length, ksef: ksef.length, ksef_approved: ksefApproved, exported,
    saldeo: ksefApproved > 0,
    rewizor: inv.length > 0 && exported === inv.length,
  };
}
const reasonSaldeo = (e: any) => `Saldeo: klient zatwierdził ${e.ksef_approved} z ${e.ksef} faktur z KSeF`;
const reasonRewizor = (e: any) => `Saldeo: wszystkie faktury miesiąca (${e.invoices}) przeniesione do programu księgowego`;

async function approvedStages() {
  const { data } = await admin.from('app_settings').select('value').eq('key', 'saldeo_approved_stages').maybeSingle();
  return String(data?.value || 'Zatwierdzony').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
}

// ---------- przebieg ----------
async function lockRun() {
  const { data } = await admin.from('integration_runs').select('id').eq('source', 'saldeo').is('finished_at', null)
    .gte('started_at', new Date(Date.now() - 4 * 60e3).toISOString()).limit(1);
  return !data?.length;
}

async function candidates(period: string, onlyClient?: string) {
  let q = admin.from('checklist_entries').select('id,client_id,task_code,status,auto_blocked,clients!inner(id,name,status,saldeo_company_id)')
    .eq('period', period).in('task_code', ['saldeo', 'ksiegowanie']).eq('status', 'todo').eq('auto_blocked', false)
    .not('clients.saldeo_company_id', 'is', null).eq('clients.status', 'aktywny');
  if (onlyClient) q = q.eq('client_id', onlyClient);
  const { data, error } = await q;
  if (error) throw error;
  const by = new Map<string, { client: any; entries: any[] }>();
  for (const e of data || []) {
    if (!by.has(e.client_id)) by.set(e.client_id, { client: (e as any).clients, entries: [] });
    by.get(e.client_id)!.entries.push(e);
  }
  const { data: checks } = await admin.from('saldeo_checks').select('client_id,checked_at').eq('period', period).in('client_id', [...by.keys()]);
  const last = new Map((checks || []).map(c => [c.client_id, new Date(c.checked_at).getTime()]));
  return [...by.values()].sort((a, b) => (last.get(a.client.id) || 0) - (last.get(b.client.id) || 0));
}

async function runPeriod(s: Saldeo, period: string, companies: Map<string, any>, stages: string[], opts: { onlyClient?: string; limit: number }) {
  const list = await candidates(period, opts.onlyClient);
  let checked = 0, ticked = 0; const errors: string[] = [];
  for (const { client, entries } of list) {
    if (checked >= opts.limit || s.left() < 2) break;
    const comp = companies.get(String(client.saldeo_company_id));
    if (!comp) { errors.push(`${client.name}: brak firmy ${client.saldeo_company_id} w Saldeo`); continue; }
    if (!comp.program_id) { errors.push(`${client.name}: firma w Saldeo nie ma COMPANY_PROGRAM_ID`); continue; }
    try {
      const { docs } = await monthDocuments(s, comp.program_id, period);
      checked++;
      const ev = evaluate(docs, stages);
      await admin.from('saldeo_checks').upsert({ client_id: client.id, period, checked_at: new Date().toISOString(), summary: ev, error: null });
      const now = new Date().toISOString();
      for (const e of entries) {
        const hit = e.task_code === 'saldeo' ? ev.saldeo : ev.rewizor;
        if (!hit) continue;
        const reason = e.task_code === 'saldeo' ? reasonSaldeo(ev) : reasonRewizor(ev);
        const { data: up } = await admin.from('checklist_entries')
          .update({ status: 'done', auto_source: 'saldeo', auto_at: now, auto_detail: { ...ev, reason }, updated_by: 'auto:saldeo' })
          .eq('id', e.id).eq('status', 'todo').eq('auto_blocked', false).select('id');
        if (up?.length) ticked++;
      }
    } catch (err) {
      const msg = String((err as Error)?.message || err);
      if (msg === 'BUDGET') break;
      errors.push(`${client.name}: ${msg}`);
      await admin.from('saldeo_checks').upsert({ client_id: client.id, period, checked_at: new Date().toISOString(), error: msg });
    }
  }
  return { checked, ticked, errors, remaining: Math.max(0, list.length - checked) };
}

function openPeriods() {
  // miesiąc poprzedni zawsze, dwa miesiące wstecz do 25. dnia (korekty, spóźnione dokumenty)
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Warsaw' }));
  const p = (back: number) => { const d = new Date(now.getFullYear(), now.getMonth() - back, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };
  return now.getDate() <= 25 ? [p(1), p(2)] : [p(1)];
}

async function run(trigger: string, runBy: string | null, periods: string[], onlyClient?: string) {
  if (!(await lockRun())) return { busy: true, companies: 0, ticked: 0, errors: ['Trwa już inne sprawdzanie Saldeo – spróbuj za kilka minut.'] };
  const { data: row } = await admin.from('integration_runs').insert({ source: 'saldeo', trigger, period: periods[0], run_by: runBy }).select('id').single();
  const s = new Saldeo();
  let companies = 0, ticked = 0, remaining = 0; const errors: string[] = [];
  try {
    const list = await listCompanies(s);
    const map = new Map(list.map(c => [c.id, c]));
    const stages = await approvedStages();
    for (const period of periods) {
      const r = await runPeriod(s, period, map, stages, { onlyClient, limit: Math.max(0, BATCH_COMPANIES - companies) });
      companies += r.checked; ticked += r.ticked; remaining += r.remaining; errors.push(...r.errors);
    }
  } catch (e) { errors.push(String((e as Error)?.message || e)); }
  await admin.from('integration_runs').update({ finished_at: new Date().toISOString(), companies, ticked, errors }).eq('id', row!.id);
  return { companies, ticked, remaining, errors };
}

async function status() {
  const s = new Saldeo(1);
  const companies = await listCompanies(s);
  const { data: clients } = await admin.from('clients').select('id,name,nip,status,saldeo_company_id').order('name');
  const ids = new Set(companies.map(c => c.id));
  const matched = (clients || []).filter(c => c.saldeo_company_id && ids.has(String(c.saldeo_company_id))).length;
  const unmatched = (clients || []).filter(c => c.status === 'aktywny' && !(c.saldeo_company_id && ids.has(String(c.saldeo_company_id))))
    .map(c => ({ id: c.id, name: c.name, nip: c.nip }));
  const used = (clients || []).map(c => c.saldeo_company_id).filter(Boolean);
  return { configured: true, companies: companies.map(c => ({ id: c.id, name: c.name, nip: c.nip, has_program_id: !!c.program_id })), matched, unmatched, used, requests: s.log };
}

async function match() {
  const s = new Saldeo(1);
  const companies = await listCompanies(s);
  const byNip = new Map<string, string[]>();
  companies.forEach(c => { if (c.nip) byNip.set(c.nip, [...(byNip.get(c.nip) || []), c.id]); });
  const { data: clients } = await admin.from('clients').select('id,nip,saldeo_company_id');
  const taken = new Set((clients || []).map(c => c.saldeo_company_id).filter(Boolean).map(String));
  let newly = 0;
  for (const c of clients || []) {
    if (c.saldeo_company_id) continue;
    const hits = (byNip.get(cleanNip(c.nip)) || []).filter(id => !taken.has(id));
    if (hits.length !== 1) continue; // brak albo kilka firm z tym NIP-em – do ręcznego wyboru
    const { error } = await admin.from('clients').update({ saldeo_company_id: hits[0] }).eq('id', c.id);
    if (!error) { taken.add(hits[0]); newly++; }
  }
  return { newly, ...(await status()) };
}

// diagnostyka jednej firmy: co Saldeo zwraca (bez zapisu czegokolwiek)
async function probe(clientId: string, period: string) {
  const { data: c } = await admin.from('clients').select('id,name,saldeo_company_id').eq('id', clientId).maybeSingle();
  if (!c?.saldeo_company_id) return { error: 'Klient nie ma przypisanej firmy w Saldeo.' };
  const s = new Saldeo(8);
  const comp = (await listCompanies(s)).find(x => x.id === String(c.saldeo_company_id));
  if (!comp) return { error: 'Firmy nie ma na liście Saldeo.' };
  if (!comp.program_id) return { error: 'Firma w Saldeo nie ma COMPANY_PROGRAM_ID – sprawdź u e-bit / Saldeo.' };
  const r = await monthDocuments(s, comp.program_id, period, { keepRaw: true });
  const stages = await approvedStages();
  const tally = (f: (d: any) => string) => r.docs.reduce((m: Record<string, number>, d) => { const k = f(d) || '(puste)'; m[k] = (m[k] || 0) + 1; return m; }, {});
  return {
    client: c.name, company: comp, groups: Object.fromEntries(Object.entries(r.groups).map(([g, l]) => [g, l.length])), wrap: r.wrap,
    documents: r.docs.length, evaluation: evaluate(r.docs, stages),
    stages: tally(d => txt(d.STAGE)), sources: tally(d => txt(d.SOURCE) + ' / ' + txt(d.CREATE_SOURCE)),
    ksef: tally(d => isKsef(d) ? 'KSeF' : 'inne'), exported: tally(d => isExported(d) ? 'przeniesione' : 'nie'),
    sync_statuses: tally(d => syncStatuses(d).join(',')), approved_flags: tally(d => `APPROVED=${txt(d.APPROVED)} VERIFIED=${txt(d.VERIFIED)}`),
    sample_fields: r.docs[0] ? Object.keys(r.docs[0]) : [], raw_ids: r.rawIds, raw_docs: r.rawDocs?.[0],
  };
}

async function hookSecret() { const { data } = await admin.rpc('push_get_config'); return data?.push_hook_secret || ''; }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));
    const given = req.headers.get('x-push-secret') || '';
    if (given) {
      const sec = await hookSecret();
      if (!sec || given !== sec) return json({ error: 'Brak dostępu' }, 401);
      if (body.action !== 'run_all') return json({ error: 'Nieznana operacja' }, 400);
      if (!configured()) return json(NOT_CONFIGURED);
      // harmonogram (pg_net) nie czeka na wynik – sprawdzanie trwa w tle
      const job = run('harmonogram', null, openPeriods()).catch(e => console.error(e));
      (globalThis as any).EdgeRuntime?.waitUntil?.(job);
      return json({ started: true });
    }
    const auth = req.headers.get('Authorization') || '';
    if (!auth.startsWith('Bearer ')) return json({ error: 'Brak dostępu' }, 401);
    const sb = createClient(URL_, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const { data: me } = await sb.rpc('current_role_name');
    const { data: who } = await sb.from('team_members').select('short_name,email').eq('email', (await sb.auth.getUser()).data.user?.email || '').maybeSingle();
    if (!me || !['admin', 'full'].includes(String(me))) return json({ error: 'Brak uprawnień.' }, 403);
    if (!configured()) return json(NOT_CONFIGURED);
    const period = /^\d{4}-\d{2}-01$/.test(String(body.period || '')) ? String(body.period) : '';
    switch (body.action) {
      case 'status': return json(await status());
      case 'run': {
        if (!period) return json({ error: 'Brak miesiąca.' }, 400);
        if (body.client_id) {
          const { data: c } = await sb.from('clients').select('id').eq('id', String(body.client_id)).maybeSingle();
          if (!c) return json({ error: 'Brak dostępu do klienta.' }, 403);
        }
        return json(await run('ręcznie', who?.short_name || who?.email || null, [period], body.client_id ? String(body.client_id) : undefined));
      }
      case 'match': if (me !== 'admin') return json({ error: 'Tylko administrator.' }, 403); return json(await match());
      case 'probe': if (me !== 'admin') return json({ error: 'Tylko administrator.' }, 403); return json(await probe(String(body.client_id || ''), period || openPeriods()[0]));
      default: return json({ error: 'Nieznana operacja' }, 400);
    }
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
