// Wersja demonstracyjna: atrapa bazy danych w przeglądarce (dane z demo-dane.js – wyłącznie fikcyjne)
(function () {
  const D = window.MOCK_DATA;
  const as = 'demo@przyklad.pl';
  const loggedIn = true;
  const me = D.team_members.find(m => m.email === as);
  const full = me && ['admin', 'full'].includes(me.role);
  const visible = cid => full || D.client_assignments.some(a => a.client_id === cid && a.member_id === me.id);
  const uuid = () => crypto.randomUUID();
  window.__calls = { push() {} };
  const per1 = (() => { const d = new Date(); d.setMonth(d.getMonth() - 1, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; })();

  function rows(table) {
    let r = D[table] || [];
    if (table === 'clients') r = r.filter(c => visible(c.id));
    if (['checklist_entries', 'period_notes', 'client_partners', 'audit_log'].includes(table)) r = r.filter(x => visible(x.client_id));
    if (table.startsWith('m2_') && !(me.modules || []).includes('doradztwo')) r = [];
    return r;
  }
  function embed(table, row, sel) {
    const out = { ...row };
    const re = /(\w+)\(([^)]*)\)/g; let m;
    while ((m = re.exec(sel))) {
      const rel = m[1];
      const pick = x => { if (m[2] === '*') return { ...x }; const o = {}; m[2].split(',').forEach(k => o[k.trim()] = x[k.trim()]); return o; };
      if (rel === 'm2_clients' && row.client_id) { const t = (D[rel] || []).find(x => x.id === row.client_id); out[rel] = t ? pick(t) : null; }
      else if (rel === 'm2_orders' && row.order_id) { const t = (D[rel] || []).find(x => x.id === row.order_id); out[rel] = t ? pick(t) : null; }
      else out[rel] = (D[rel] || []).filter(x => x.client_id === row.id).map(pick);
    }
    return out;
  }
  class Q {
    constructor(table) { this.t = table; this.f = []; this.op = 'select'; this.sel = '*'; }
    select(s = '*') { if (this.op === 'select') this.sel = s; this.ret = true; return this; }
    eq(k, v) { this.f.push(r => String(r[k]) === String(v)); return this; }
    gte(k, v) { this.f.push(r => r[k] >= v); return this; }
    lt(k, v) { this.f.push(r => r[k] < v); return this; }
    lte(k, v) { this.f.push(r => r[k] <= v); return this; }
    neq(k, v) { this.f.push(r => String(r[k]) !== String(v)); return this; }
    is(k, v) { this.f.push(r => (r[k] ?? null) === v); return this; }
    not(k, op, v) { this.f.push(r => op === 'is' ? (r[k] ?? null) !== v : op === 'in' ? !String(v).replace(/[()"]/g, '').split(',').includes(String(r[k])) : String(r[k]) !== String(v)); return this; }
    gt(k, v) { this.f.push(r => r[k] > v); return this; }
    in(k, arr) { this.f.push(r => arr.includes(r[k])); return this; }
    or() { return this; }
    ilike(k, p) { const re = new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*'), 'i'); this.f.push(r => re.test(String(r[k] ?? ''))); return this; }
    order(k, o = {}) { this.ord = [k, o.ascending !== false]; return this; }
    range(a, b) { this.rng = [a, b]; return this; }
    limit(n) { this.rng = [0, n - 1]; return this; }
    maybeSingle() { this.one = 'maybe'; return this; }
    single() { this.one = 'single'; return this; }
    update(p) { this.op = 'update'; this.payload = p; return this; }
    insert(p) { this.op = 'insert'; this.payload = p; return this; }
    upsert(p, o) { this.op = 'upsert'; this.payload = p; this.oc = o?.onConflict; return this; }
    delete() { this.op = 'delete'; return this; }
    then(res, rej) { return Promise.resolve(this.run()).then(res, rej); }
    run() {
      window.__calls.push([this.t, this.op, this.payload]);
      const tbl = D[this.t];
      const match = r => this.f.every(fn => fn(r));
      if (this.op === 'select') {
        let r = rows(this.t).filter(match).map(x => embed(this.t, x, this.sel));
        if (this.ord) { const [k, asc] = this.ord; r.sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * (asc ? 1 : -1)); }
        if (this.rng) r = r.slice(this.rng[0], this.rng[1] + 1);
        if (this.one) return { data: r[0] || null, error: null };
        return { data: r, error: null };
      }
      if (this.op === 'update') {
        if (this.t === 'clients' && !full) return { data: null, error: null };
        const hit = (tbl || []).filter(match); hit.forEach(r => Object.assign(r, this.payload, { updated_at: new Date().toISOString() }));
        if (this.t === 'period_comments' && 'resolved_at' in this.payload) hit.forEach(r => { r.resolved_by = this.payload.resolved_at ? me.id : null; });
        return { data: this.one ? hit[0] || null : hit, error: null };
      }
      if (this.op === 'insert' || this.op === 'upsert') {
        if (!tbl) D[this.t] = [];
        const T2 = D[this.t];
        const list = [].concat(this.payload).map(p => ({ id: uuid(), created_at: new Date().toISOString(), ...p }));
        if (this.t === 'shared_docs') list.forEach(p => { p.token = p.token || (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, ''); p.views = 0; p.created_by = me.id; });
        if (this.t === 'period_comments') list.forEach(p => { p.parent_id = p.parent_id || null; p.mentions = p.mentions || []; p.history = []; p.deleted_at = null; p.resolved_at = null; });
        if (this.t === 'period_comments') list.forEach(p => { p.author = p.author || me.id; });
        if (this.t === 'offers') list.forEach(p => { p.number = 'OF/2026/' + String(tbl.filter(x => x.brand === p.brand).length + 1).padStart(3, '0'); p.updated_at = new Date().toISOString(); });
        if (this.t === 'rkdp_tickets') list.forEach(p => { p.module = p.module || 'rkdp'; p.no = tbl.length + 1; p.status = p.status || 'nowe'; p.updated_at = new Date().toISOString(); });
        if (this.t === 'm2_matters') list.forEach(p => { p.number = p.number || 'S/2026/' + String(tbl.length + 1).padStart(3, '0'); });
        if (this.t === 'm2_orders') list.forEach(p => { p.number = p.number || (p.doc_type === 'umowa' ? 'U' : 'Z') + '/2026/' + String(tbl.length + 1).padStart(3, '0'); });
        if (this.t === 'm2_matters') list.forEach(p => { const o = D.m2_orders.find(x => x.id === p.order_id); if (o) p.client_id = o.client_id; });
        list.forEach((p, i) => {
          if (this.op === 'upsert') {
            const keys = (this.oc || (p.key !== undefined ? 'key' : 'id')).split(',');
            const ex = T2.find(r => keys.every(k => r[k] === p[k]));
            if (ex) { const { id, created_at, ...rest } = p; Object.assign(ex, rest); list[i] = ex; return; }
          }
          T2.push(p);
        });
        return { data: this.one ? list[0] : list, error: null };
      }
      if (this.op === 'delete') {
        if (['m2_orders', 'm2_matters'].includes(this.t) && me.role !== 'admin') return { data: null, error: null };
        const gone = (tbl || []).filter(match).map(r => r.id); D[this.t] = (tbl || []).filter(r => !match(r));
        if (this.t === 'm2_orders') D.m2_matters = D.m2_matters.filter(m => !gone.includes(m.order_id));
        return { data: null, error: null };
      }
    }
  }
  const chan = { on() { return chan; }, subscribe() { return chan; } };
  window.supabase = {
    createClient() {
      return {
        from: t => new Q(t),
        rpc: async (fn, args) => {
          window.__calls.push(['rpc', fn, args]);
          const M = window.MOCK_AUTH || {};
          if (fn === 'shared_doc') { const r = (D.shared_docs || []).find(x => x.token === args?.p_token && !x.revoked_at); if (r && r.kind === 'oferta') { const o = (D.offers || []).find(x => x.id === r.ref_id); return { data: o ? { kind: 'oferta', title: r.title, brand: o.brand, blocks: [], offer: o.params, number: o.number, created_at: r.created_at } : null, error: null }; }
            return { data: r ? { title: r.title, brand: r.brand, blocks: r.blocks, created_at: r.created_at || new Date().toISOString(), expires_at: r.expires_at } : null, error: null }; }
          if (fn === 'unread_threads') {
            const since = Date.now() - 14 * 864e5, out = new Map();
            const ev = [...D.period_comments.filter(c => !c.deleted_at && c.author && c.author !== me.id).map(c => ({ cid: c.client_id, at: c.created_at, per: c.period, m: (c.mentions || []).includes(me.id) })),
              ...D.rkdp_ticket_comments.filter(k => k.author_id !== me.id).map(k => { const t = D.rkdp_tickets.find(x => x.id === k.ticket_id); return t?.client_id ? { cid: t.client_id, at: k.created_at, per: t.period, m: false } : null; }).filter(Boolean)];
            ev.forEach(e => { const r = D.thread_reads.find(x => x.client_id === e.cid && x.member_id === me.id); if (Date.parse(e.at) <= (r ? Date.parse(r.read_at) : since)) return;
              const c = D.clients.find(x => x.id === e.cid); if (!c) return; const o = out.get(e.cid) || { client_id: e.cid, name: c.name, n: 0, last_at: e.at, mentioned: false, period: e.per }; o.n++; o.mentioned ||= e.m; if (e.at > o.last_at) { o.last_at = e.at; o.period = e.per; } out.set(e.cid, o); });
            return { data: [...out.values()].sort((a, b) => b.last_at.localeCompare(a.last_at)), error: null };
          }
          if (fn === 'set_my_avatar') { me.avatar = args.p_avatar; return { data: null, error: null }; }
          if (fn === 'login_mode') return M.mode ? { data: 'haslo_kod', error: null } : { data: null, error: { message: 'not found' } };
          if (fn === 'auth_state') return { data: { member: true, verified: true, can_set_password: M.canSet ?? true, password_set: false, idle_minutes: M.idle || 240 }, error: null };
          if (fn === 'auth_password_step') return { data: args.p_device_token ? { verified: true } : { verified: false, nonce: 'N'.repeat(64) }, error: null };
          if (fn === 'auth_code_step' || fn === 'auth_setup_step') return { data: { verified: true, device_token: args.p_remember ? 'T'.repeat(96) : null }, error: null };
          if (fn === 'auth_touch') return { data: true, error: null };
          if (fn === 'auth_logout' || fn === 'admin_revoke_member') return { data: null, error: null };
          if (fn === 'generate_period') {
            let n = 0;
            D.clients.filter(c => c.status === 'aktywny' && visible(c.id)).forEach(c => D.task_types.forEach(t => {
              if (!D.checklist_entries.some(e => e.client_id === c.id && e.period === args.p_period && e.task_code === t.code)) {
                const prev = D.checklist_entries.find(e => e.client_id === c.id && e.period === per1 && e.task_code === t.code);
                D.checklist_entries.push({ id: uuid(), client_id: c.id, period: args.p_period, task_code: t.code, status: prev?.status === 'na' ? 'na' : 'todo', assignee_id: prev?.assignee_id || null }); n++;
              }
            }));
            return { data: n, error: null };
          }
          return { data: null, error: null };
        },
        functions: { invoke: async (name, { body }) => name === 'mail' ? ({ data: body.action === 'status' ? { ready: false } : { sent: body.client_ids.length, results: body.client_ids.map(id => ({ client_id: id, ok: true })) } }) : name === 'docs' ? ({ data: { sent: false, reason: 'not_configured' } }) : name === 'monitor' ? (() => {
          const c = D.clients.find(x => x.id === body.client_id); const ex = D.client_monitor.find(x => x.client_id === body.client_id);
          const snap = { vat: { status: 'Czynny', accounts: ['1'], name: c?.name }, krs: c?.krs ? { found: true, board: ['Jan Nowicki'], owners: ['Jan Nowicki'] } : null };
          if (ex) ex.checked_at = new Date().toISOString(); else D.client_monitor.push({ id: crypto.randomUUID(), module: 'rkdp', client_id: body.client_id, snapshot: snap, checked_at: new Date().toISOString() });
          return { data: { checked: 1, changes: 0, snapshot: snap } };
        })() : name === 'aml' ? (() => {
          const now = new Date().toISOString(); const k = D.aml_cases.find(x => x.id === body.case_id);
          const mk = (kind, result, summary, data = {}, extra = {}) => ({ id: crypto.randomUUID(), case_id: body.case_id, kind, result, summary, data, checked_at: now, checked_by: me.id, ...extra });
          const rows = [mk('vat', 'ok', 'Firma – status VAT: Czynny, rachunki: 1'),
            mk('crbr', 'ok', 'Beneficjenci rzeczywiści: Jan Nowicki, Anna Nowicka', { status: 'IstniejaInformacje', requestId: 'b7c1-2026-10-19-0001', requestedAt: now, providedAt: now, companies: [{ name: 'PRZYKŁADOWA SPÓŁKA Z O.O.', nip: '8990001234', krs: '0000800001', form: 'Spółka z ograniczoną odpowiedzialnością', address: 'Przykładowa 1 50-100 Wrocław', from: '2024-05-10', ref: 'ZB-2024-123', discrepancies: [], beneficiaries: [{ first: 'Jan', last: 'Nowicki', pesel: '80010112345', citizenship: 'polskie', residence: 'Polska', shares: [{ type: 'Bezposrednie', kind: 'Udziały', qty: '60', unit: 'procent' }] }, { first: 'Anna', last: 'Nowicka', pesel: '82020254321', citizenship: 'polskie', residence: 'Polska', shares: [{ type: 'Bezposrednie', kind: 'Udziały', qty: '40', unit: 'procent' }] }], reporters: [{ first: 'Jan', last: 'Nowicki', role: 'Prezes zarządu' }] }] }, { request_id: 'b7c1-2026-10-19-0001', sha256: '3f9a2c71e8b04d5f9a1e6c7b2d8e0f4a5b6c7d8e9f0a1b2c3d4e5f60718293a4' }),
            mk('krs', 'ok', 'PRZYKŁADOWA SPÓŁKA Z O.O. · zarząd: Jan Nowicki · wspólnicy: Jan Nowicki, Anna Nowicka'),
            mk('sankcje', 'ok', 'Brak trafień. Sprawdzono 4 nazw na 3 listach.', { hits: [] })];
          D.aml_checks.push(...rows); k.last_auto_at = now; if (k.status === 'do_uzupelnienia') k.status = 'w_trakcie';
          return { data: { checks: rows, status: k.status } };
        })() : name === 'gcal' ? ({ data: body.action === 'list' ? { events: [{ id: 'g1', title: 'Spotkanie – Kowalski (Zoho)', allDay: false, start: '2026-10-20T10:00:00+02:00', end: '2026-10-20T11:00:00+02:00', link: '#' }, { id: 'g2', title: 'Urlop – Piotr', allDay: true, start: '2026-10-22', end: '2026-10-25' }] } : body.action === 'status' ? { configured: true, ok: true, name: 'M2 TAX', serviceAccount: 'demo@przyklad.pl' } : { synced: 1, errors: [] } }) : body.krs !== undefined ? ({ data: { found: true, krs: '0000900001', stanZDnia: '18.10.2026', checkedAt: '2026-10-18', name: 'PRZYKŁADOWA SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ', nip: '7770001234', regon: '38000000100000', seat: { miejscowosc: 'WROCŁAW', wojewodztwo: 'DOLNOŚLĄSKIE', powiat: 'WROCŁAW', gmina: 'WROCŁAW' }, address: { ulica: 'KWIATOWA', nrDomu: '5', kodPocztowy: '50-100', miejscowosc: 'WROCŁAW' }, capital: '50000,00', shareholders: [{ last: 'N*****', first: 'J**', shares: '100 UDZIAŁÓW O ŁĄCZNEJ WYSOKOŚCI 5.000,00 ZŁOTYCH' }], board: [{ last: 'N*****', first: 'J**', role: 'PREZES ZARZĄDU' }], filings: [{ filed: '30.06.2026', period: 'OD 01.01.2025 DO 31.12.2025' }] } }) : body.nips ? ({ data: { checkedAt: '2026-10-18', results: Object.fromEntries(body.nips.map(n => [n, { found: true, name: 'X', nip: n, regon: '123456789', krs: null, statusVat: 'Czynny', address: 'UL. TESTOWA 1, 50-001 WROCŁAW' }])) } }) : body.nip === '5260250995' ? ({ data: { found: false, checkedAt: '2026-10-17' } })
          : ({ data: { found: true, source: 'Biała lista VAT (Ministerstwo Finansów)', checkedAt: '2026-10-17', requestId: 'Ab12-cd34', name: 'PRZYKŁADOWA SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ', nip: body.nip, regon: '380000001', krs: '0000900001', statusVat: 'Czynny', address: 'UL. KWIATOWA 5, 50-100 WROCŁAW', accounts: ['11111111111111111111111111'], representatives: ['JAN KOWALSKI'] } }) },
        storage: { from: (b) => ({
          upload: async (path, file) => { (window.__files ||= {})[path] = file; return { data: { path }, error: null }; },
          download: async (path) => ({ data: (window.__files || {})[path] || new Blob(['x'], { type: 'text/plain' }), error: null }),
          remove: async (paths) => { paths.forEach(p => delete (window.__files || {})[p]); return { error: null }; },
        }) },
        channel: () => chan, removeChannel() {},
        auth: {
          getSession: async () => ({ data: { session: loggedIn ? { user: { email: as } } : null } }),
          signInWithOtp: async ({ email }) => D.team_members.some(m => m.email === email) ? { error: null } : { error: { message: 'Database error saving new user' } },
          verifyOtp: async ({ token }) => (window.__calls.push(['verifyOtp', token]), token === '123456' ? { error: null } : { error: { message: 'Token has expired or is invalid' } }),
          signInWithPassword: async ({ email, password }) => (window.__calls.push(['signInWithPassword', email]), password === 'dobrehaslo123' ? { error: null } : { error: { message: 'Invalid login credentials', status: 400 } }),
          updateUser: async (p) => (window.__calls.push(['updateUser', !!p.password]), { error: null }),
          signOut: async (o) => (window.__calls.push(['signOut', o?.scope]), {}),
          onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
        },
      };
    },
  };
})();
