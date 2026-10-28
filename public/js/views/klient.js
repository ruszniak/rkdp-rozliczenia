import { monitorCard } from '../monitoring.js';
import { rememberRecent } from '../cmdk.js';
import { openDocRequest } from '../prosba.js';
import { h, icon, toast, fail, fmtDateTime, periodLabel, shiftPeriod, defaultPeriod } from '../ui.js';
import { sb, state, memberById, canEditClients, isAdmin, activeTasks, hasModule } from '../store.js';
import { LEGAL_FORM, BOOKKEEPING, PIT_FORM, ADVANCES, CIT_ADVANCES, ZUS_TYPE, CIT_TYPE, VAT_STATUS, CLIENT_STATUS,
  STATUS, FIELD_LABELS, isCompany, isPartnership } from '../dict.js';
import { completeness } from './klienci.js';
import { nipLookupBar, mergeNipData } from '../nip.js';
import { dokumentyDialog } from '../rkdp/docs.js';
import { clientTicketsBox } from './zgloszenia.js';
import { amlCard } from '../aml/aml.js';

const YESNO = { true: 'Tak', false: 'Nie' };
const isJdg = c => c.legal_form === 'jdg';
const always = () => true;

// [klucz, etykieta, typ, opcje, kiedy pokazać, szerokie?]
const SECTIONS = [
  { title: 'Dane podstawowe', fields: [
    ['name', 'Nazwa / imię i nazwisko', 'text', null, always, true],
    ['status', 'Status współpracy', 'select', CLIENT_STATUS, always],
    ['legal_form', 'Forma prawna', 'select', LEGAL_FORM, always],
    ['bookkeeping', 'Rodzaj księgowości', 'select', BOOKKEEPING, always],
    ['nip', 'NIP', 'text', null, always],
    ['regon', 'REGON', 'text', null, always],
    ['krs', 'KRS', 'text', null, c => isCompany(c.legal_form) || isPartnership(c.legal_form) || c.legal_form === 'fundacja_stowarzyszenie'],
    ['address', 'Adres siedziby', 'text', null, always, true],
  ] },
  { title: 'Kontakt', fields: [
    ['contact_person', 'Osoba kontaktowa', 'text', null, always],
    ['email', 'E-mail', 'email', null, always],
    ['phone', 'Telefon', 'tel', null, always],
    ['docs_channel', 'Jak przekazuje dokumenty', 'text', null, always],
  ] },
  { title: 'Podatek dochodowy', hint: c => isPartnership(c.legal_form) ? 'Spółka osobowa nie płaci PIT sama — PIT i ZUS wspólników uzupełnij w sekcji „Wspólnicy”.' : !c.legal_form ? 'Wybierz formę prawną, aby zobaczyć właściwe pola.' : null, fields: [
    ['pit_form', 'Forma opodatkowania PIT', 'select', PIT_FORM, isJdg],
    ['ryczalt_rates', 'Stawki ryczałtu', 'text', null, c => isJdg(c) && c.pit_form === 'ryczalt'],
    ['pit_advances', 'Zaliczki PIT', 'select', ADVANCES, isJdg],
    ['cit_type', 'Rodzaj CIT', 'select', CIT_TYPE, c => isCompany(c.legal_form)],
    ['cit_advances', 'Zaliczki CIT', 'select', CIT_ADVANCES, c => isCompany(c.legal_form) && c.cit_type !== 'estonski'],
    ['fiscal_year', 'Rok podatkowy', 'text', null, c => isCompany(c.legal_form)],
  ] },
  { title: 'ZUS i kadry', fields: [
    ['zus_type', 'Składki ZUS właściciela', 'select', ZUS_TYPE, isJdg],
    ['zus_sickness', 'Dobrowolne chorobowe', 'bool', null, c => isJdg(c) && !['ulga_na_start', 'zbieg_etat', 'emeryt_rencista', 'tylko_zdrowotna', 'brak'].includes(c.zus_type)],
    ['has_employees', 'Pracownicy / zleceniobiorcy', 'bool', null, always],
    ['employees_count', 'Liczba osób na liście płac', 'number', null, c => c.has_employees === true],
    ['ppk', 'PPK', 'bool', null, c => c.has_employees === true],
  ] },
  { title: 'VAT', fields: [
    ['vat_status', 'Rozliczenie VAT', 'select', VAT_STATUS, always],
    ['vat_ue', 'Transakcje UE (VAT-UE)', 'bool', null, c => (c.vat_status || '').startsWith('czynny')],
    ['cash_register', 'Kasa fiskalna', 'bool', null, always],
    ['ksef_access', 'Biuro ma uprawnienia w KSeF', 'bool', null, always],
  ] },
  { title: 'Umowa i pełnomocnictwa', fields: [
    ['contract_signed', 'Umowa podpisana', 'bool', null, always],
    ['contract_date', 'Data umowy', 'date', null, c => c.contract_signed === true],
    ['monthly_fee', 'Wynagrodzenie biura (netto / mies.)', 'number', null, () => canEditClients()],
    ['upl1', 'Pełnomocnictwo UPL-1 (US)', 'bool', null, always],
    ['zus_pel', 'Pełnomocnictwo ZUS PEL', 'bool', null, always],
    ['crbr_reported', 'Zgłoszenie do CRBR', 'bool', null, c => isCompany(c.legal_form) || isPartnership(c.legal_form)],
  ] },
];

function inputFor(type, options, value, disabled) {
  if (type === 'select' || type === 'bool') {
    const opts = type === 'bool' ? YESNO : options;
    const s = h('select', { class: 'select', disabled },
      h('option', { value: '' }, '— nie wiadomo —'),
      Object.entries(opts).map(([k, v]) => h('option', { value: k }, v)));
    s.value = value === null || value === undefined ? '' : String(value);
    return s;
  }
  return h('input', { class: 'input', type: type === 'number' ? 'number' : type, step: type === 'number' ? 'any' : null,
    value: value ?? '', disabled });
}
function readInput(type, el) {
  const v = el.value.trim();
  if (v === '') return null;
  if (type === 'bool') return v === 'true';
  if (type === 'number') return Number(v.replace(',', '.'));
  return v;
}

function describeValue(field, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (v === true) return 'tak';
  if (v === false) return 'nie';
  const dicts = { status: { ...CLIENT_STATUS, ...Object.fromEntries(Object.entries(STATUS).map(([k, s]) => [k, s.label])) },
    legal_form: LEGAL_FORM, bookkeeping: BOOKKEEPING, pit_form: PIT_FORM, pit_advances: ADVANCES, cit_advances: CIT_ADVANCES,
    zus_type: ZUS_TYPE, cit_type: CIT_TYPE, vat_status: VAT_STATUS };
  if (field === 'assignee_id') return memberById(v)?.short_name || '?';
  return dicts[field]?.[v] || String(v);
}

export async function renderKlient(main, id) {
  main.replaceChildren(h('div', { class: 'spinner' }, 'Wczytywanie…'));
  const since = shiftPeriod(defaultPeriod(), -11) + '-01';
  const [{ data: c, error }, { data: partners }, { data: assigns }, { data: hist }, { data: audit }] = await Promise.all([
    sb.from('clients').select('*').eq('id', id).maybeSingle(),
    sb.from('client_partners').select('*').eq('client_id', id).order('created_at'),
    sb.from('client_assignments').select('member_id').eq('client_id', id),
    sb.from('checklist_entries').select('period,task_code,status').eq('client_id', id).gte('period', since).order('period', { ascending: false }),
    sb.from('audit_log').select('*').eq('client_id', id).order('at', { ascending: false }).limit(40),
  ]);
  if (error) throw error;
  if (!c) { main.replaceChildren(h('div', { class: 'card empty' }, 'Nie znaleziono klienta albo nie masz do niego dostępu.')); return; }
  rememberRecent({ label: c.name, href: `#/klient/${c.id}`, meta: c.nip ? `NIP ${c.nip}` : '', panel: c.id });

  // pełny dostęp – wszystko; pracownik z ograniczonym dostępem – dane swoich klientów (bez przypisań, pilnuje tego baza)
  const editable = canEditClients() || hasModule('rozliczenia');
  const draft = { ...c };
  let partnerList = (partners || []).map(p => ({ ...p }));
  const removedPartners = [];
  let dirty = false;

  const markDirty = () => { dirty = true; saveBtn.disabled = false; saveInfo.textContent = 'Niezapisane zmiany'; };

  // ---------- sekcje formularza ----------
  const sectionsBox = h('div');
  function renderSections() {
    sectionsBox.replaceChildren(...SECTIONS.map(sec => {
      const visible = sec.fields.filter(f => f[4](draft));
      const hint = sec.hint?.(draft);
      if (!visible.length && !hint) return null;
      return h('section', { class: 'card section' },
        h('div', { class: 'section-head' }, h('h2', {}, sec.title)),
        hint ? h('p', { class: 'hint', style: { marginBottom: visible.length ? '14px' : 0 } }, hint) : null,
        visible.length ? h('div', { class: 'form-grid' }, visible.map(([key, label, type, options, , wide]) => {
          const el = inputFor(type, options, draft[key], !editable);
          el.addEventListener(type === 'select' || type === 'bool' ? 'change' : 'input', () => {
            draft[key] = readInput(type, el); markDirty();
            if (['legal_form', 'pit_form', 'cit_type', 'zus_type', 'has_employees', 'vat_status', 'contract_signed'].includes(key)) {
              renderSections(); renderPartners();
            }
          });
          return h('label', { class: 'field' + (wide ? ' wide' : '') }, h('span', {}, label), el);
        })) : null);
    }).filter(Boolean),
    h('section', { class: 'card section' }, h('div', { class: 'section-head' }, h('h2', {}, 'Notatki stałe')),
      (() => { const ta = h('textarea', { class: 'input', rows: 4, disabled: !editable, placeholder: 'Np. specyfika klienta, ustalenia, na co uważać przy księgowaniu…' }, draft.notes || '');
        ta.addEventListener('input', () => { draft.notes = ta.value.trim() || null; markDirty(); }); return ta; })()));
  }

  // ---------- wspólnicy ----------
  const partnersBox = h('div');
  function renderPartners() {
    if (!isPartnership(draft.legal_form)) { partnersBox.replaceChildren(); return; }
    const pFields = [
      ['full_name', 'Imię i nazwisko', 'text'], ['share_percent', 'Udział %', 'number'],
      ['email', 'E-mail', 'email'], ['phone', 'Telefon', 'tel'],
      ['settled_by_us', 'PIT i ZUS prowadzimy my', 'bool'],
      ['pit_form', 'Forma opodatkowania', 'select', { skala: PIT_FORM.skala, liniowy: PIT_FORM.liniowy, ryczalt: PIT_FORM.ryczalt }],
      ['pit_advances', 'Zaliczki PIT', 'select', ADVANCES], ['zus_type', 'Składki ZUS', 'select', ZUS_TYPE],
    ];
    partnersBox.replaceChildren(h('section', { class: 'card section' },
      h('div', { class: 'section-head' }, h('h2', {}, 'Wspólnicy'),
        editable ? h('button', { class: 'btn btn-outline btn-sm', onclick: () => { partnerList.push({ client_id: id, full_name: '', settled_by_us: true }); markDirty(); renderPartners(); } }, '+ Dodaj wspólnika') : null),
      partnerList.length ? null : h('p', { class: 'hint' }, 'Dodaj wspólników, aby rozliczać ich PIT i ZUS.'),
      partnerList.map((p, idx) => h('div', { class: 'partner' },
        h('div', { class: 'form-grid' }, pFields.map(([key, label, type, opts]) => {
          const el = inputFor(type, opts, p[key], !editable);
          el.addEventListener(type === 'select' || type === 'bool' ? 'change' : 'input', () => { p[key] = readInput(type, el); if (key === 'settled_by_us' && p[key] === null) p[key] = true; markDirty(); });
          return h('label', { class: 'field' }, h('span', {}, label), el);
        })),
        editable ? h('button', { class: 'btn btn-ghost btn-sm', style: { marginTop: '8px', color: 'var(--warn)' }, onclick: () => {
          if (p.id) removedPartners.push(p.id);
          partnerList.splice(idx, 1); markDirty(); renderPartners();
        } }, 'Usuń wspólnika') : null))));
  }

  // ---------- przypisania ----------
  const assigned = new Set((assigns || []).map(a => a.member_id));
  const roleSelect = (field, label) => {
    const sel = h('select', { class: 'select', disabled: !canEditClients() },
      h('option', { value: '' }, '— nie przypisano —'),
      state.members.filter(m => m.active).map(m => h('option', { value: m.id }, m.full_name)));
    sel.value = c[field] || '';
    sel.addEventListener('change', async () => {
      const v = sel.value || null;
      const { error: e } = await sb.from('clients').update({ [field]: v }).eq('id', id);
      if (e) { sel.value = c[field] || ''; return fail(e); }
      c[field] = v; draft[field] = v;
      toast(`${label}: ${v ? memberById(v).short_name : 'brak'}`);
    });
    return h('label', { class: 'field' }, h('span', {}, label), sel);
  };
  const assignBox = h('section', { class: 'card section' },
    h('div', { class: 'section-head' }, h('h2', {}, 'Obsługują')),
    h('div', { class: 'form-grid', style: { marginBottom: '18px' } },
      roleSelect('accountant_id', 'Księgowa'), roleSelect('hr_id', 'Kadrowa')),
    h('p', { class: 'hint', style: { marginBottom: '8px', fontWeight: 600 } }, 'Dodatkowy dostęp'),
    h('p', { class: 'hint', style: { marginBottom: '12px' } }, isAdmin()
      ? 'Księgowa i kadrowa zawsze widzą klienta. Tu możesz dać wgląd dodatkowym osobom z ograniczonym dostępem.'
      : 'Przypisania zmienia administrator.'),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
      state.members.filter(m => m.active).map(m => {
        const cb = h('input', { type: 'checkbox', checked: assigned.has(m.id), disabled: !isAdmin() });
        cb.addEventListener('change', async () => {
          const q = cb.checked
            ? sb.from('client_assignments').insert({ client_id: id, member_id: m.id })
            : sb.from('client_assignments').delete().eq('client_id', id).eq('member_id', m.id);
          const { error: e } = await q;
          if (e) { cb.checked = !cb.checked; return fail(e); }
          toast(cb.checked ? `${m.short_name} obsługuje teraz tego klienta` : `Odpięto: ${m.short_name}`);
        });
        return h('label', { class: 'check' }, cb, m.full_name, h('span', { class: 'muted small' }, m.role === 'limited' ? '(ograniczony dostęp)' : ''));
      })));

  // ---------- historia rozliczeń ----------
  const tasks = activeTasks();
  const byPeriod = new Map();
  (hist || []).forEach(e => { const k = e.period.slice(0, 7); if (!byPeriod.has(k)) byPeriod.set(k, {}); byPeriod.get(k)[e.task_code] = e.status; });
  const histBox = h('section', { class: 'card section' },
    h('div', { class: 'section-head' }, h('h2', {}, 'Ostatnie miesiące')),
    byPeriod.size ? h('div', { class: 'mini' }, [...byPeriod.entries()].map(([p, m]) => {
      const vals = Object.values(m); const ok = vals.every(s => s === 'done' || s === 'na');
      return h('a', { class: 'mini-row', href: `#/rozliczenia?okres=${p}`, style: { textDecoration: 'none', color: 'inherit' } },
        h('span', { class: 'm' }, periodLabel(p).replace(/ \d+$/, '').slice(0, 3) + ' ' + p.slice(2, 4)),
        tasks.map(t => h('span', { class: 'd', title: `${t.label}: ${m[t.code] ? STATUS[m[t.code]].label : '—'}`, style: { background: m[t.code] ? STATUS[m[t.code]].color : 'transparent', border: '1px solid var(--line)' } })),
        h('span', { class: 'small', style: { color: ok ? 'var(--ok)' : 'var(--muted)', fontWeight: 600 } }, ok ? 'rozliczony' : 'w trakcie'));
    })) : h('p', { class: 'hint' }, 'Brak rozliczeń w ostatnich 12 miesiącach.'));

  // ---------- historia zmian ----------
  const auditBox = h('section', { class: 'card section' },
    h('div', { class: 'section-head' }, h('h2', {}, 'Historia zmian')),
    audit?.length ? h('div', { class: 'hist' }, audit.map(a => {
      const who = memberById(state.members.find(m => m.email === a.actor)?.id)?.short_name || a.actor;
      let what;
      if (a.table_name === 'checklist_entries') {
        const t = state.taskTypes.find(x => x.code === a.detail?.task_code)?.label || a.detail?.task_code;
        const ch = Object.entries(a.detail || {}).filter(([k]) => ['status', 'assignee_id'].includes(k))
          .map(([k, v]) => `${describeValue(k, v.z)} → ${describeValue(k, v.na)}`).join(', ');
        what = `${a.period ? periodLabel(a.period.slice(0, 7)) + ' · ' : ''}${t}: ${ch}`;
      } else if (a.table_name === 'period_notes') {
        what = `${a.period ? periodLabel(a.period.slice(0, 7)) + ' · ' : ''}uwagi/pytania zaktualizowane`;
      } else if (a.action === 'update') {
        what = Object.entries(a.detail || {}).map(([k, v]) => `${FIELD_LABELS[k] || k}: ${describeValue(k, v.z)} → ${describeValue(k, v.na)}`).join('; ');
        if (a.table_name === 'client_partners') what = 'Wspólnik · ' + what;
      } else {
        what = (a.table_name === 'client_partners' ? 'Wspólnik ' : 'Klient ') + (a.action === 'insert' ? 'dodany' : 'usunięty') +
          (a.detail?.full_name ? `: ${a.detail.full_name}` : '');
      }
      return h('div', {}, h('div', { class: 'muted' }, `${fmtDateTime(a.at)} · ${who}`), h('div', {}, what));
    })) : h('p', { class: 'hint' }, 'Brak zarejestrowanych zmian.'));

  // ---------- zapis ----------
  const saveInfo = h('span', { class: 'muted small' });
  const saveBtn = h('button', { class: 'btn btn-primary', disabled: true, onclick: save }, 'Zapisz zmiany');
  async function save() {
    if (!draft.name?.trim()) { toast('Nazwa jest wymagana', true); return; }
    saveBtn.disabled = true; saveInfo.textContent = 'Zapisywanie…';
    const patch = {};
    const locked = canEditClients() ? [] : ['accountant_id', 'hr_id'];
    for (const k of Object.keys(draft)) if (!['id', 'created_at', 'updated_at', ...locked].includes(k) && draft[k] !== c[k]) patch[k] = draft[k];
    try {
      if (Object.keys(patch).length) {
        const { data: upd, error: e } = await sb.from('clients').update(patch).eq('id', id).select('id');
        if (e) throw e;
        if (!upd?.length) throw new Error('Brak uprawnień do zmiany danych tego klienta.');
        Object.assign(c, patch);
      }
      for (const pid of removedPartners.splice(0)) {
        const { error: e } = await sb.from('client_partners').delete().eq('id', pid); if (e) throw e;
      }
      for (const p of partnerList) {
        if (!p.full_name?.trim()) continue;
        const row = { client_id: id, full_name: p.full_name.trim(), email: p.email ?? null, phone: p.phone ?? null,
          share_percent: p.share_percent ?? null, settled_by_us: p.settled_by_us ?? true, pit_form: p.pit_form ?? null,
          pit_advances: p.pit_advances ?? null, zus_type: p.zus_type ?? null };
        if (p.id) { const { error: e } = await sb.from('client_partners').update(row).eq('id', p.id); if (e) throw e; }
        else { const { data, error: e } = await sb.from('client_partners').insert(row).select('id').single(); if (e) throw e; p.id = data.id; }
      }
      dirty = false; saveInfo.textContent = 'Zapisano'; toast('Zapisano zmiany');
      titleEl.textContent = draft.name; renderComp();
    } catch (e) {
      saveBtn.disabled = false; saveInfo.textContent = 'Nie zapisano'; fail(e, 'Nie zapisano');
    }
  }

  const titleEl = h('h1', { style: { marginTop: '6px' } }, c.name);
  const compEl = h('p', { class: 'sub' });
  const renderComp = () => {
    const cp = completeness(draft, partnerList.filter(p => p.full_name?.trim()).length);
    compEl.textContent = cp.pct === 100 ? 'Profil kompletny.' : `Profil uzupełniony w ${cp.pct}% (brakuje ${cp.missing} pól).`;
  };
  renderComp();

  const deleteBtn = isAdmin() ? h('button', { class: 'btn btn-danger btn-sm', onclick: async () => {
    if (!confirm(`Usunąć klienta „${c.name}” razem z całą historią rozliczeń? Tego nie da się cofnąć.\n\nJeśli współpraca się skończyła, lepiej zmień status na „Współpraca zakończona”.`)) return;
    const { error: e } = await sb.from('clients').delete().eq('id', id);
    if (e) return fail(e);
    toast('Klient usunięty'); location.hash = '#/klienci';
  } }, 'Usuń klienta') : null;

  renderSections(); renderPartners();
  main.replaceChildren(
    h('a', { href: '#/klienci', class: 'small', style: { fontWeight: 600, textDecoration: 'none' } }, '← Wszyscy klienci'),
    h('div', { class: 'page-head', style: { marginTop: '10px' } },
      h('div', {}, h('p', { class: 'eyebrow' }, 'Karta klienta'), titleEl, compEl),
      h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
        editable ? null : h('span', { class: 'badge' }, 'Tylko podgląd'),
        h('button', { class: 'btn btn-outline btn-sm', onclick: () => openDocRequest(c, defaultPeriod(), []) }, icon('mail'), 'Wyślij wiadomość'),
        h('a', { class: 'btn btn-outline btn-sm', href: `#/oferty/nowa?klient=${c.id}` }, 'Oferta'),
        h('button', { class: 'btn btn-outline btn-sm', onclick: () => dokumentyDialog({ client: { ...c, ...draft } }).catch(e => fail(e)) }, 'Umowy i pełnomocnictwa'))),
    h('div', { class: 'two' },
      h('div', {}, editable ? nipLookupBar(draft.nip, (r) => { mergeNipData(draft, r); markDirty(); renderSections(); }) : null,
        sectionsBox, partnersBox,
        editable ? h('div', { class: 'savebar' }, saveInfo, saveBtn) : null),
      h('div', {}, clientTicketsBox(c), amlCard({ module: 'rkdp', client: c }), monitorCard(c), assignBox, histBox, auditBox, deleteBtn ? h('div', { style: { textAlign: 'right' } }, deleteBtn) : null)));

  const beforeUnload = e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', beforeUnload);
  return () => window.removeEventListener('beforeunload', beforeUnload);
}
