import { monitorCard } from '../monitoring.js';
import { rememberRecent } from '../cmdk.js';
import { openDocRequest } from '../prosba.js';
import { h, icon, toast, fail, fmtDateTime, periodLabel, shiftPeriod, defaultPeriod, modal, initials } from '../ui.js';
import { sb, state, memberById, canEditClients, isAdmin, activeTasks, hasModule } from '../store.js';
import { LEGAL_FORM, BOOKKEEPING, SERVICE_SCOPE, PIT_FORM, ADVANCES, CIT_ADVANCES, ZUS_TYPE, CIT_TYPE, VAT_STATUS, CLIENT_STATUS,
  STATUS, FIELD_LABELS, isCompany, isPartnership } from '../dict.js';
import { completeness } from './klienci.js';
import { LEGAL_SHORT } from '../dict.js';
import { nipLookupBar, mergeNipData } from '../nip.js';
import { dokumentyDialog } from '../rkdp/docs.js';
import { threadCard } from '../watek.js';
import { zusCard, showsZus } from '../zus.js';
import { doradztwoCard } from '../firma.js';
import { clientMeetingsCard } from '../spotkania.js';
import { poaCard } from '../pelnomocnictwa.js';
import { amlCard } from '../aml/aml.js';
import { archiveCard } from '../archiwum.js';

const YESNO = { true: 'Tak', false: 'Nie' };
const isJdg = c => c.legal_form === 'jdg';
const always = () => true;

// [klucz, etykieta, typ, opcje, kiedy pokazać, szerokie?]
// podatnik CIT: spółki kapitałowe i spółka komandytowa (CIT od 2021 r.)
const citPayer = c => isCompany(c.legal_form) || c.legal_form === 'spolka_komandytowa';
const SECTIONS = [
  { tab: 'dane', title: 'Dane podstawowe', fields: [
    ['name', 'Nazwa / imię i nazwisko', 'text', null, always, true],
    ['status', 'Status współpracy', 'select', CLIENT_STATUS, always],
    ['legal_form', 'Forma prawna', 'select', LEGAL_FORM, always],
    ['service_scope', 'Zakres usług', 'select', SERVICE_SCOPE, always],
    ['bookkeeping', 'Rodzaj księgowości', 'select', BOOKKEEPING, c => c.service_scope !== 'doradztwo'],
    ['nip', 'NIP', 'text', null, always],
    ['regon', 'REGON', 'text', null, always],
    ['krs', 'KRS', 'text', null, c => isCompany(c.legal_form) || isPartnership(c.legal_form) || c.legal_form === 'fundacja_stowarzyszenie'],
    ['address', 'Adres siedziby', 'text', null, always, true],
  ] },
  { tab: 'dane', title: 'Kontakt', fields: [
    ['contact_person', 'Osoba kontaktowa', 'text', null, always],
    ['email', 'E-mail', 'email', null, always],
    ['phone', 'Telefon', 'tel', null, always],
    ['docs_channel', 'Jak przekazuje dokumenty', 'text', null, always],
  ] },
  { tab: 'podatki', title: 'Podatek dochodowy', hint: c => isPartnership(c.legal_form) ? 'Spółka osobowa nie płaci PIT sama — PIT i ZUS wspólników uzupełnij w sekcji „Wspólnicy”.' : !c.legal_form ? 'Wybierz formę prawną, aby zobaczyć właściwe pola.' : null, fields: [
    ['pit_form', 'Forma opodatkowania PIT', 'select', PIT_FORM, isJdg],
    ['ryczalt_rates', 'Stawki ryczałtu', 'text', null, c => isJdg(c) && c.pit_form === 'ryczalt'],
    ['pit_advances', 'Zaliczki PIT', 'select', ADVANCES, isJdg],
    ['cit_type', 'Rodzaj CIT', 'select', CIT_TYPE, citPayer],
    ['cit_advances', 'Zaliczki CIT', 'select', CIT_ADVANCES, c => citPayer(c) && c.cit_type !== 'estonski'],
    ['fiscal_year', 'Rok podatkowy', 'text', null, citPayer],
  ] },
  { tab: 'podatki', title: 'ZUS i kadry', fields: [
    ['zus_type', 'Składki ZUS właściciela', 'select', ZUS_TYPE, isJdg],
    ['zus_sickness', 'Dobrowolne chorobowe', 'bool', null, c => isJdg(c) && !['ulga_na_start', 'zbieg_etat', 'emeryt_rencista', 'tylko_zdrowotna', 'brak'].includes(c.zus_type)],
    ['has_employees', 'Pracownicy / zleceniobiorcy', 'bool', null, always],
    ['employees_count', 'Liczba osób na liście płac', 'number', null, c => c.has_employees === true],
    ['ppk', 'PPK', 'bool', null, c => c.has_employees === true],
  ] },
  { tab: 'podatki', title: 'VAT', fields: [
    ['vat_status', 'Rozliczenie VAT', 'select', VAT_STATUS, always],
    ['vat_ue', 'Transakcje UE (VAT-UE)', 'bool', null, c => (c.vat_status || '').startsWith('czynny')],
    ['cash_register', 'Kasa fiskalna', 'bool', null, always],
    ['ksef_access', 'Biuro ma uprawnienia w KSeF', 'bool', null, always],
  ] },
  { tab: 'dokumenty', title: 'Umowa i pełnomocnictwa', fields: [
    ['contract_signed', 'Umowa podpisana', 'bool', null, always],
    ['contract_date', 'Data umowy', 'date', null, c => c.contract_signed === true],
    ['upl1', 'Pełnomocnictwo UPL-1 (US)', 'bool', null, always],
    ['zus_pel', 'Pełnomocnictwo ZUS PEL', 'bool', null, always],
    ['crbr_reported', 'Zgłoszenie do CRBR', 'bool', null, c => isCompany(c.legal_form) || isPartnership(c.legal_form)],
  ] },
  { tab: 'dane', title: 'Stawki', fields: [
    ['monthly_fee', 'Abonament (zł netto / mies.)', 'number', null, () => canEditClients()],
    ['fee_docs', 'Dokumentów w abonamencie', 'number', null, () => canEditClients()],
    ['fee_extra_doc', 'Dokument nadwyżkowy (zł netto / szt.)', 'number', null, () => canEditClients()],
    ['fee_employee', 'Obsługa pracownika (zł netto / os.)', 'number', null, () => canEditClients()],
    ['fee_extras', 'Usługi dodatkowe', 'text', null, () => canEditClients(), true],
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
    zus_type: ZUS_TYPE, cit_type: CIT_TYPE, vat_status: VAT_STATUS, service_scope: SERVICE_SCOPE };
  if (field === 'assignee_id') return memberById(v)?.short_name || '?';
  return dicts[field]?.[v] || String(v);
}

// krótka nazwa do nagłówka: „ALIBI GROUP SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ” → „Alibi Group sp. z o.o.”
const FORMS = [[/\s*spółka z ograniczoną odpowiedzialnością(?=\s|$)/i, ' sp. z o.o.'], [/\s*spółka komandytowa(?=\s|$)/i, ' sp.k.'], [/\s*spółka jawna(?=\s|$)/i, ' sp.j.'],
  [/\s*spółka akcyjna(?=\s|$)/i, ' S.A.'], [/\s*prosta spółka akcyjna(?=\s|$)/i, ' P.S.A.'], [/\s*spółka cywilna(?=\s|$)/i, ' s.c.'], [/\s*spółka partnerska(?=\s|$)/i, ' sp.p.']];
const KEEP_UP = /^(sp\.|s\.a\.|p\.s\.a\.|s\.c\.|sp\.k\.|sp\.j\.|sp\.p\.|z|o\.o\.|i|w|na|do|od)$/i;
export function shortName(name) {
  let n = String(name || '').trim();
  for (const [re, to] of FORMS) n = n.replace(re, to);
  const letters = n.replace(/[^A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]/g, '');
  if (letters && letters === letters.toUpperCase() && letters.length > 3) {
    n = n.split(/(\s+)/).map(w => /^\s+$/.test(w) || KEEP_UP.test(w) ? (KEEP_UP.test(w) ? w.toLowerCase().replace('s.a.', 'S.A.').replace('p.s.a.', 'P.S.A.') : w)
      : (w.length <= 3 && /^[A-ZĄĆĘŁŃÓŚŹŻ0-9&+]+$/.test(w) ? w : w.charAt(0) + w.slice(1).toLowerCase())).join('');
  }
  return n;
}
const TABS = [['przeglad', 'Przegląd'], ['dane', 'Dane firmy'], ['podatki', 'Podatki, VAT i ZUS'], ['dokumenty', 'Dokumenty i umowy'], ['rozmowa', 'Rozmowa i spotkania'], ['historia', 'Historia']];
const copyBtn = (v, what) => h('button', { type: 'button', class: 'kc-copy', title: `Kopiuj ${what}`, onclick: async e => { e.stopPropagation(); try { await navigator.clipboard.writeText(String(v).replace(/[-\s]/g, '')); toast(`Skopiowano ${what}`); } catch { /* */ } } }, 'kopiuj');
const fmtNip = n => { const d = String(n || '').replace(/\D/g, ''); return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6, 8)}-${d.slice(8)}` : n; };

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
  const editing = new Set();          // sekcje w trybie edycji (tytuły)
  const TAB_KEY = 'kc-tab';
  let tab = (() => { try { return sessionStorage.getItem(TAB_KEY + ':' + id) || 'przeglad'; } catch { return 'przeglad'; } })();
  const markDirty = () => { dirty = true; };

  // ---------- sekcje danych: podgląd jako lista, „Edytuj” w każdej sekcji osobno ----------
  const secBoxes = new Map();   // tytuł → element
  let pendingFocus = null;
  function sectionEl(sec) {
    const visible = sec.fields.filter(f => f[4](draft));
    const hint = sec.hint?.(draft);
    if (!visible.length && !hint) return null;
    const on = editing.has(sec.title);
    const head = h('div', { class: 'section-head' }, h('h2', {}, sec.title),
      editable && visible.length && !on ? h('button', { class: 'btn btn-ghost btn-sm kc-edit', type: 'button', onclick: () => openEdit(sec.title) }, 'Edytuj') : null);
    let content;
    if (on) {
      content = h('div', {},
        sec.title === 'Dane podstawowe' ? nipLookupBar(draft.nip, r => { mergeNipData(draft, r); markDirty(); redraw(); }) : null,
        h('div', { class: 'form-grid' }, visible.map(([key, label, type, options, , wide]) => {
          const el = inputFor(type, options, draft[key], false);
          el.addEventListener(type === 'select' || type === 'bool' ? 'change' : 'input', () => {
            draft[key] = readInput(type, el); markDirty();
            if (['legal_form', 'pit_form', 'cit_type', 'zus_type', 'has_employees', 'vat_status', 'contract_signed', 'service_scope'].includes(key)) redraw();
          });
          if (pendingFocus === key) setTimeout(() => { el.focus(); pendingFocus = null; }, 30);
          return h('label', { class: 'field' + (wide ? ' wide' : ''), 'data-key': key }, h('span', {}, label), el);
        })),
        h('div', { class: 'kc-save' },
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => cancelEdit(sec) }, 'Anuluj'),
          h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: e => save(e.currentTarget, sec.title) }, 'Zapisz')));
    } else {
      content = visible.length ? h('dl', { class: 'kc-dl' }, ...visible.flatMap(([key, label, type, options]) => {
        const v = key === 'service_scope' ? (draft[key] || 'ksiegowosc') : draft[key];
        const empty = v === null || v === undefined || v === '';
        const txt = empty ? null : type === 'bool' ? (v ? 'tak' : 'nie') : type === 'select' ? (options[v] || v) : type === 'date' ? new Date(v).toLocaleDateString('pl-PL') : type === 'number' && /fee/.test(key) ? `${Number(v).toLocaleString('pl-PL')} zł` : String(v);
        return [h('dt', {}, label), h('dd', { class: empty ? 'kc-empty' : null, 'data-key': key },
          empty ? (editable ? h('button', { type: 'button', class: 'kc-add', onclick: () => { pendingFocus = key; openEdit(sec.title); } }, '+ uzupełnij') : h('span', { class: 'muted' }, '—'))
            : key === 'email' ? h('a', { href: 'mailto:' + v }, v) : key === 'phone' ? h('a', { href: 'tel:' + String(v).replace(/\s/g, '') }, v) : txt,
          !empty && ['nip', 'krs', 'regon'].includes(key) ? copyBtn(v, label) : null)];
      })) : null;
    }
    const el = h('section', { class: 'card section kc-sec' + (on ? ' editing' : ''), 'data-sec': sec.title }, head,
      hint ? h('p', { class: 'hint', style: { marginBottom: visible.length ? '12px' : 0 } }, hint) : null, content);
    secBoxes.set(sec.title, el);
    return el;
  }
  function openEdit(title) { editing.add(title); redraw(); secBoxes.get(title)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  function cancelEdit(sec) {
    for (const f of sec.fields) draft[f[0]] = c[f[0]];
    editing.delete(sec.title); dirty = editing.size > 0 || notesDirty || partnersDirty; redraw();
  }
  const sectionsFor = t => SECTIONS.filter(s => s.tab === t).map(sectionEl).filter(Boolean);

  // notatki stałe – osobny zapis
  let notesDirty = false;
  const notesCard = () => {
    const ta = h('textarea', { class: 'input', rows: 4, disabled: !editable, placeholder: 'Np. specyfika klienta, ustalenia, na co uważać przy księgowaniu…' }, draft.notes || '');
    const btn = h('button', { class: 'btn btn-primary btn-sm', type: 'button', hidden: true, onclick: e => save(e.currentTarget, null) }, 'Zapisz notatkę');
    ta.addEventListener('input', () => { draft.notes = ta.value.trim() || null; notesDirty = true; markDirty(); btn.hidden = false; });
    return h('section', { class: 'card section' }, h('div', { class: 'section-head' }, h('h2', {}, 'Notatki stałe')), ta, h('div', { class: 'kc-save' }, btn));
  };

  // ---------- wspólnicy ----------
  let partnersDirty = false;
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
    const pd = () => { partnersDirty = true; markDirty(); saveP.hidden = false; };
    const saveP = h('button', { class: 'btn btn-primary btn-sm', type: 'button', hidden: !partnersDirty, onclick: e => save(e.currentTarget, null) }, 'Zapisz wspólników');
    partnersBox.replaceChildren(h('section', { class: 'card section' },
      h('div', { class: 'section-head' }, h('h2', {}, 'Wspólnicy'),
        editable ? h('button', { class: 'btn btn-outline btn-sm', onclick: () => { partnerList.push({ client_id: id, full_name: '', settled_by_us: true }); pd(); renderPartners(); } }, '+ Dodaj wspólnika') : null),
      partnerList.length ? null : h('p', { class: 'hint' }, 'Dodaj wspólników, aby rozliczać ich PIT i ZUS – każdy wspólnik dostanie w Rozliczeniach własne kratki PIT (Księgowość) i ZUS (Kadry).'),
      partnerList.map((p, idx) => h('div', { class: 'partner' },
        h('div', { class: 'form-grid' }, pFields.map(([key, label, type, opts]) => {
          const el = inputFor(type, opts, p[key], !editable);
          el.addEventListener(type === 'select' || type === 'bool' ? 'change' : 'input', () => { p[key] = readInput(type, el); if (key === 'settled_by_us' && p[key] === null) p[key] = true; pd(); });
          return h('label', { class: 'field' }, h('span', {}, label), el);
        })),
        editable ? h('button', { class: 'btn btn-ghost btn-sm', style: { marginTop: '8px', color: 'var(--warn)' }, onclick: () => {
          if (p.id) removedPartners.push(p.id);
          partnerList.splice(idx, 1); pd(); renderPartners();
        } }, 'Usuń wspólnika') : null)),
      h('div', { class: 'kc-save' }, saveP)));
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
      c[field] = v; draft[field] = v; drawHero();
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
  const auditText = a => {
    if (a.table_name === 'checklist_entries') {
      const t = state.taskTypes.find(x => x.code === a.detail?.task_code)?.label || a.detail?.task_code;
      const ch = Object.entries(a.detail || {}).filter(([k]) => ['status', 'assignee_id'].includes(k))
        .map(([k, v]) => `${describeValue(k, v.z)} → ${describeValue(k, v.na)}`).join(', ');
      return `${a.period ? periodLabel(a.period.slice(0, 7)) + ' · ' : ''}${t}: ${ch}`;
    }
    if (a.table_name === 'period_notes') return `${a.period ? periodLabel(a.period.slice(0, 7)) + ' · ' : ''}uwagi/pytania zaktualizowane`;
    if (a.action === 'update') {
      const w = Object.entries(a.detail || {}).map(([k, v]) => `${FIELD_LABELS[k] || k}: ${describeValue(k, v.z)} → ${describeValue(k, v.na)}`).join('; ');
      return a.table_name === 'client_partners' ? 'Wspólnik · ' + w : w;
    }
    return (a.table_name === 'client_partners' ? 'Wspólnik ' : 'Klient ') + (a.action === 'insert' ? 'dodany' : 'usunięty') + (a.detail?.full_name ? `: ${a.detail.full_name}` : '');
  };
  const whoOf = a => memberById(state.members.find(m => m.email === a.actor)?.id)?.short_name || a.actor;
  const auditBox = h('section', { class: 'card section' },
    h('div', { class: 'section-head' }, h('h2', {}, 'Historia zmian')),
    audit?.length ? h('div', { class: 'hist' }, audit.map(a => h('div', {}, h('div', { class: 'muted' }, `${fmtDateTime(a.at)} · ${whoOf(a)}`), h('div', {}, auditText(a)))))
      : h('p', { class: 'hint' }, 'Brak zarejestrowanych zmian.'));

  // ---------- zapis ----------
  async function save(btn, secTitle) {
    if (!draft.name?.trim()) { toast('Nazwa jest wymagana', true); return; }
    if (btn) btn.disabled = true;
    if (!draft.service_scope) draft.service_scope = 'ksiegowosc';
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
      if (partnerList.length || isPartnership(draft.legal_form)) await sb.rpc('sync_partner_entries', { p_client: id }).then(() => {}, () => {});
      if (secTitle) editing.delete(secTitle); else editing.clear();
      notesDirty = false; partnersDirty = false; dirty = editing.size > 0;
      toast('Zapisano zmiany');
      redraw();
    } catch (e) {
      if (btn) btn.disabled = false; fail(e, 'Nie zapisano');
    }
  }

  // ---------- krok po kroku: uzupełnianie braków w profilu ----------
  const FIELD_DEF = Object.fromEntries(SECTIONS.flatMap(s => s.fields.map(f => [f[0], { f, sec: s }])));
  const LABELS = Object.fromEntries(SECTIONS.flatMap(s => s.fields.map(f => [f[0], f[1]])));
  LABELS.partners = 'Wspólnicy';
  const comp = () => completeness(draft, partnerList.filter(p => p.full_name?.trim()).length);
  function guidedFill() {
    const keys = comp().keys.filter(k => k !== 'partners');
    if (!keys.length) { if (comp().keys.includes('partners')) { setTab('dane'); partnersBox.scrollIntoView({ behavior: 'smooth' }); } return; }
    let i = 0;
    const box = h('div');
    const vals = {};
    modal('Uzupełnij profil klienta', box, close => [
      h('button', { class: 'btn btn-ghost', onclick: close }, 'Zamknij'),
      h('button', { class: 'btn btn-primary', onclick: async e => {
        Object.assign(draft, vals);
        if (!Object.keys(vals).length) { close(); return; }
        await save(e.currentTarget, null); close();
      } }, 'Zapisz uzupełnione'),
    ]);
    const step = () => {
      const k = keys[i]; const { f } = FIELD_DEF[k] || {}; if (!f) { i++; return i < keys.length ? step() : null; }
      const [key, label, type, options] = f;
      const el = inputFor(type, options, vals[key] ?? draft[key], false);
      el.addEventListener(type === 'select' || type === 'bool' ? 'change' : 'input', () => { vals[key] = readInput(type, el); });
      const next = () => { if (i < keys.length - 1) { i++; step(); } else box.replaceChildren(h('p', {}, `Gotowe – uzupełniono ${Object.values(vals).filter(v => v !== null && v !== undefined && v !== '').length} z ${keys.length} pól. Kliknij „Zapisz uzupełnione”.`)); };
      el.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); next(); } });
      box.replaceChildren(
        h('div', { class: 'kc-steps' }, ...keys.map((_, j) => h('i', { class: j < i ? 'd' : j === i ? 'on' : '' }))),
        h('p', { class: 'small muted', style: { margin: '10px 0 4px' } }, `Pole ${i + 1} z ${keys.length} · ${FIELD_DEF[k].sec.title}`),
        h('label', { class: 'field wide' }, h('span', { style: { fontSize: '16px', fontWeight: 700, color: 'var(--ink)' } }, label), el),
        h('div', { style: { display: 'flex', gap: '8px', justifyContent: 'space-between', marginTop: '12px' } },
          h('button', { class: 'btn btn-ghost btn-sm', disabled: i === 0, onclick: () => { i--; step(); } }, '← Wstecz'),
          h('div', { style: { display: 'flex', gap: '8px' } },
            h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { delete vals[key]; next(); } }, 'Pomiń'),
            h('button', { class: 'btn btn-outline btn-sm', onclick: next }, i < keys.length - 1 ? 'Dalej →' : 'Koniec'))));
      setTimeout(() => el.focus(), 30);
    };
    step();
  }

  // ---------- nagłówek ----------
  const hero = h('section', { class: 'card kc-hero' });
  const callBtn = () => draft.phone ? h('a', { class: 'btn btn-outline btn-sm', href: 'tel:' + String(draft.phone).replace(/\s/g, '') }, 'Zadzwoń') : null;
  const moreMenu = h('div', { class: 'kl-menu kc-menu', hidden: true });
  document.addEventListener('click', e => { if (!moreMenu.contains(e.target) && !e.target.closest?.('.kc-more')) moreMenu.hidden = true; });
  function drawHero() {
    const chips = [
      [CLIENT_STATUS[draft.status] || draft.status, draft.status === 'aktywny' ? 'ok' : 'warn'],
      [draft.service_scope === 'doradztwo' ? 'Doradztwo' : 'Księgowość', draft.service_scope === 'doradztwo' ? 'dp' : 'ks'],
      [LEGAL_SHORT[draft.legal_form], ''],
      [draft.service_scope !== 'doradztwo' && draft.bookkeeping ? BOOKKEEPING[draft.bookkeeping] : null, ''],
      [isJdg(draft) && draft.pit_form ? `${PIT_FORM[draft.pit_form]}${draft.pit_advances ? ' · ' + (ADVANCES[draft.pit_advances] || '').toLowerCase() : ''}` : null, ''],
      [citPayer(draft) && draft.cit_type ? `${CIT_TYPE[draft.cit_type]}${draft.cit_advances && draft.cit_type !== 'estonski' ? ' · zaliczki ' + (CIT_ADVANCES[draft.cit_advances] || '').toLowerCase() : ''}` : null, ''],
      [draft.vat_status ? VAT_STATUS[draft.vat_status] : null, ''],
      [draft.has_employees ? 'Pracownicy' + (draft.employees_count ? ` (${draft.employees_count})` : '') : null, ''],
      [draft.docs_channel || null, ''],
    ].filter(([t]) => t);
    const person = (fid, role) => { const m = memberById(draft[fid]); return m ? h('div', { class: 'kc-person', title: `${role}: ${m.full_name}` }, h('span', { class: 'avatar' }, initials(m.full_name)), h('div', {}, h('small', {}, role), h('b', {}, m.short_name))) : null; };
    moreMenu.replaceChildren(
      h('button', { type: 'button', onclick: () => { moreMenu.hidden = true; setTab('historia'); } }, h('span', {}, '↺'), 'Historia zmian'),
      h('button', { type: 'button', onclick: () => { moreMenu.hidden = true; guidedFill(); } }, h('span', {}, '✎'), 'Uzupełnij profil krok po kroku'),
      deleteBtn ? h('button', { type: 'button', style: { color: 'var(--warn)' }, onclick: () => { moreMenu.hidden = true; deleteBtn.click(); } }, h('span', {}, '✕'), 'Usuń klienta') : null);
    const sn = shortName(draft.name);
    hero.replaceChildren(
      h('div', { class: 'kc-hero-top' },
        h('span', { class: 'kc-logo' }, initials(sn).slice(0, 2)),
        h('div', { class: 'kc-hero-t' },
          h('p', { class: 'eyebrow', style: { margin: 0 } }, 'Karta klienta'),
          h('h1', {}, sn),
          h('div', { class: 'kc-full' }, sn !== draft.name ? draft.name : null, draft.nip ? [sn !== draft.name ? ' · ' : '', 'NIP ', fmtNip(draft.nip), copyBtn(draft.nip, 'NIP')] : null,
            draft.krs ? [' · KRS ', draft.krs] : null),
          h('div', { class: 'kc-chips' }, ...chips.map(([t, k]) => h('span', { class: 'kc-chip ' + k }, t)))),
        h('div', { class: 'kc-people' }, person('accountant_id', 'Księgowa'), person('hr_id', 'Kadry'), !editable ? h('span', { class: 'badge' }, 'Tylko podgląd') : null)),
      h('div', { class: 'kc-acts' },
        h('button', { class: 'btn btn-primary btn-sm', onclick: () => openDocRequest(c, defaultPeriod(), []) }, icon('mail'), 'Wyślij wiadomość'),
        h('button', { class: 'btn btn-outline btn-sm', onclick: () => import('../watek.js').then(m => m.openThread({ client: c })) }, 'Rozmowa i zadania'),
        h('button', { class: 'btn btn-outline btn-sm', onclick: () => dokumentyDialog({ client: { ...c, ...draft } }).catch(e => fail(e)) }, 'Umowy i pełnomocnictwa'),
        h('a', { class: 'btn btn-outline btn-sm', href: `#/oferty/nowa?klient=${c.id}` }, 'Oferta'),
        callBtn(),
        h('span', { class: 'kc-more-wrap' }, h('button', { class: 'btn btn-outline btn-sm kc-more', 'aria-label': 'Więcej', onclick: e => { e.stopPropagation(); moreMenu.hidden = !moreMenu.hidden; } }, '⋯'), moreMenu)));
  }

  // ---------- przegląd ----------
  const period = defaultPeriod();
  const monthEntries = byPeriod.get(period) || {};
  const pDate = new Date(+period.slice(0, 4), +period.slice(5, 7), 1);   // miesiąc składania (kolejny)
  const dl = (day) => new Date(pDate.getFullYear(), pDate.getMonth(), day);
  const daysTo = d => Math.ceil((d - new Date(new Date().toDateString())) / 86400000);
  function overview() {
    const cp = comp();
    const shown = tasks.filter(t => monthEntries[t.code] && monthEntries[t.code] !== 'na');
    const monthCard = h('section', { class: 'card section kc-month' },
      h('div', { class: 'section-head' }, h('h2', {}, periodLabel(period)), h('a', { class: 'small', href: `#/rozliczenia?okres=${period}`, style: { fontWeight: 600 } }, 'Otwórz w Rozliczeniach →')),
      shown.length ? h('div', { class: 'kc-tasks' }, ...shown.map(t => {
        const st = monthEntries[t.code]; const cls = st === 'done' ? 'done' : st === 'na' ? 'na' : ['missing_docs', 'reminded'].includes(st) ? 'miss' : 'todo';
        return h('div', { class: 'kc-task ' + cls, title: `${t.label}: ${STATUS[st]?.label || ''}` }, h('i', {}, cls === 'done' ? '✓' : cls === 'na' ? '–' : cls === 'miss' ? (st === 'reminded' ? '@' : '!') : '○'), h('span', {}, t.label));
      })) : h('p', { class: 'hint' }, draft.service_scope === 'doradztwo' ? 'Klient na doradztwie – bez rozliczeń księgowych.' : 'Brak listy rozliczeń za ten miesiąc.'));
    // do zrobienia
    const todo = [];
    const missing = shown.filter(t => ['missing_docs', 'reminded'].includes(monthEntries[t.code]));
    if (missing.length) todo.push(['warn', h('span', {}, h('b', {}, 'Brak dokumentów'), ' – ', missing.map(t => t.label).join(', ')), h('button', { class: 'kc-link', onclick: () => openDocRequest(c, period, missing.map(t => t.code)) }, 'Przypomnij')]);
    if (draft.contract_signed !== true) todo.push(['bad', h('span', {}, h('b', {}, 'Umowa'), ' – nie oznaczono podpisania'), h('button', { class: 'kc-link', onclick: () => dokumentyDialog({ client: { ...c, ...draft } }).catch(e => fail(e)) }, 'Przygotuj')]);
    if (draft.service_scope !== 'doradztwo' && draft.upl1 !== true) todo.push(['bad', h('span', {}, h('b', {}, 'UPL-1'), ' – brak pełnomocnictwa do US'), h('button', { class: 'kc-link', onclick: () => dokumentyDialog({ client: { ...c, ...draft }, type: 'upl1' }).catch(e => fail(e)) }, 'Wyślij do podpisu')]);
    if (draft.zus_pel !== true && (isJdg(draft) || draft.has_employees)) todo.push(['bad', h('span', {}, h('b', {}, 'PEL'), ' – brak pełnomocnictwa do ZUS'), h('button', { class: 'kc-link', onclick: () => dokumentyDialog({ client: { ...c, ...draft }, type: 'pel' }).catch(e => fail(e)) }, 'Wyślij do podpisu')]);
    if (cp.pct < 100) todo.push(['warn', h('span', {}, h('b', {}, `Profil ${cp.pct}%`), ' – brakuje: ', cp.keys.map(k => LABELS[k] || k).join(', ')), editable ? h('button', { class: 'kc-link', onclick: guidedFill }, 'Uzupełnij') : null]);
    const open = shown.filter(t => !['done', 'na'].includes(monthEntries[t.code]));
    const jpk = open.find(t => t.code === 'jpk' || t.code === 'vat');
    if (jpk) { const d = dl(25), n = daysTo(d); todo.push(['info', h('span', {}, h('b', {}, jpk.label), ` – termin ${d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })}`), h('span', { class: 'kc-when' + (n < 0 ? ' late' : '') }, n < 0 ? `${-n} dni po terminie` : n === 0 ? 'dziś' : `za ${n} dni`)]); }
    const zus = open.find(t => /zus/.test(t.code));
    if (zus) { const d = dl(20), n = daysTo(d); todo.push(['info', h('span', {}, h('b', {}, zus.label), ` – termin ${d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })}`), h('span', { class: 'kc-when' + (n < 0 ? ' late' : '') }, n < 0 ? `${-n} dni po terminie` : n === 0 ? 'dziś' : `za ${n} dni`)]); }
    const docRow = (label, val, okText = 'jest') => h('div', { class: 'kc-doc' }, label, h('span', { class: 'kc-st ' + (val === true ? 'ok' : val === false ? 'no' : 'unk') }, val === true ? okText : val === false ? 'brak' : 'nie wiadomo'));
    const side = h('aside', { class: 'kc-side' },
      h('section', { class: 'card section' }, h('div', { class: 'section-head' }, h('h2', {}, 'Do zrobienia')),
        todo.length ? h('div', { class: 'kc-todo' }, ...todo.map(([k, t, a]) => h('div', {}, h('span', { class: 'kc-dot ' + k }), t, a || null))) : h('p', { class: 'hint' }, 'Nic pilnego – wszystko w porządku.'),
        h('h3', { class: 'kc-h3' }, 'Umowy i pełnomocnictwa'),
        h('div', { class: 'kc-docs' }, docRow('Umowa o usługi', draft.contract_signed, draft.contract_date ? 'podpisana ' + new Date(draft.contract_date).toLocaleDateString('pl-PL') : 'podpisana'),
          docRow('UPL-1 (urząd skarbowy)', draft.upl1), docRow('PEL (ZUS)', draft.zus_pel),
          citPayer(draft) || isPartnership(draft.legal_form) ? docRow('CRBR', draft.crbr_reported, 'zgłoszono') : null),
        h('button', { class: 'kc-link', style: { marginTop: '8px' }, onclick: () => setTab('dokumenty') }, 'Archiwum, pełnomocnictwa i AML →')),
      h('section', { class: 'card section kc-prof' }, h('div', { class: 'section-head' }, h('h2', {}, 'Profil klienta')),
        h('div', { class: 'kc-ring' }, (() => { const r = h('span', { class: 'kc-ring-c', style: { '--p': cp.pct } }); r.textContent = cp.pct + '%'; return r; })(),
          h('div', {}, h('b', {}, cp.pct === 100 ? 'Profil kompletny' : `Uzupełniony w ${cp.pct}%`),
            cp.pct < 100 && editable ? h('button', { class: 'kc-link', onclick: guidedFill }, `Uzupełnij ${cp.missing} ${cp.missing === 1 ? 'pole' : cp.missing < 5 ? 'pola' : 'pól'} krok po kroku`) : null))));
    const summary = (title, keys, tabKey) => {
      const rows = keys.map(k => FIELD_DEF[k]?.f).filter(f => f && f[4](draft));
      return h('section', { class: 'card section' }, h('div', { class: 'section-head' }, h('h2', {}, title), h('button', { class: 'btn btn-ghost btn-sm', onclick: () => setTab(tabKey) }, 'Więcej')),
        h('dl', { class: 'kc-dl' }, ...rows.flatMap(([key, label, type, options]) => {
          const v = draft[key]; const empty = v === null || v === undefined || v === '';
          return [h('dt', {}, label), h('dd', { class: empty ? 'kc-empty' : null }, empty ? (editable ? h('button', { class: 'kc-add', onclick: () => { setTab(tabKey); pendingFocus = key; openEdit(FIELD_DEF[key].sec.title); } }, '+ uzupełnij') : '—')
            : key === 'email' ? h('a', { href: 'mailto:' + v }, v) : key === 'phone' ? h('a', { href: 'tel:' + String(v).replace(/\s/g, '') }, v)
            : type === 'bool' ? (v ? 'tak' : 'nie') : type === 'select' ? (options[v] || v) : String(v))];
        })));
    };
    const recent = (audit || []).slice(0, 4);
    const feed = h('section', { class: 'card section' }, h('div', { class: 'section-head' }, h('h2', {}, 'Ostatnio u klienta'), h('button', { class: 'btn btn-ghost btn-sm', onclick: () => setTab('historia') }, 'Cała historia')),
      recent.length ? h('div', { class: 'kc-feed' }, ...recent.map(a => h('div', {}, auditText(a), h('small', {}, `${whoOf(a)} · ${fmtDateTime(a.at)}`)))) : h('p', { class: 'hint' }, 'Brak zmian.'));
    return h('div', { class: 'kc-grid' },
      h('div', { class: 'kc-main' }, monthCard,
        h('div', { class: 'kc-two' }, summary('Kontakt', ['contact_person', 'email', 'phone', 'docs_channel'], 'dane'),
          summary('Podatki i ZUS', ['pit_form', 'pit_advances', 'cit_type', 'cit_advances', 'vat_status', 'zus_type', 'has_employees', 'employees_count'], 'podatki')),
        draft.notes ? h('section', { class: 'card section' }, h('div', { class: 'section-head' }, h('h2', {}, 'Notatki stałe')), h('p', { style: { whiteSpace: 'pre-wrap', margin: 0 } }, draft.notes)) : null,
        feed),
      side);
  }

  const deleteBtn = isAdmin() ? h('button', { class: 'btn btn-danger btn-sm', onclick: async () => {
    if (!confirm(`Usunąć klienta „${c.name}” razem z całą historią rozliczeń? Tego nie da się cofnąć.\n\nJeśli współpraca się skończyła, lepiej zmień status na „Współpraca zakończona”.`)) return;
    const { error: e } = await sb.from('clients').delete().eq('id', id);
    if (e) return fail(e);
    toast('Klient usunięty'); location.hash = '#/klienci';
  } }, 'Usuń klienta') : null;

  // ---------- zakładki ----------
  const tabsBar = h('nav', { class: 'kc-tabs', role: 'tablist' });
  const body = h('div', { class: 'kc-body' });
  // karty z innych modułów tworzymy raz (mają własny stan i zapis)
  const lazyCards = {};
  const once = (k, f) => lazyCards[k] ||= f();
  function drawTabs() {
    const cp = comp();
    const missIn = t => cp.keys.filter(k => k === 'partners' ? t === 'dane' : FIELD_DEF[k]?.sec.tab === t).length;
    tabsBar.replaceChildren(...TABS.map(([k, l]) => h('button', { type: 'button', role: 'tab', class: 'kc-tab' + (tab === k ? ' on' : ''), 'aria-selected': String(tab === k), onclick: () => setTab(k) },
      l, missIn(k) ? h('b', { title: 'Brakujące pola' }, String(missIn(k))) : null)));
  }
  function setTab(k) {
    if (tab === k) return;
    tab = k; try { sessionStorage.setItem(TAB_KEY + ':' + id, k); } catch { /* */ }
    redraw(); tabsBar.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function redraw() {
    drawHero(); drawTabs();
    let content;
    if (tab === 'przeglad') content = [overview()];
    else if (tab === 'dane') { renderPartners(); content = [...sectionsFor('dane'), partnersBox, notesCard(), assignBox, once('mon', () => monitorCard(c))].filter(Boolean); }
    else if (tab === 'podatki') content = [...sectionsFor('podatki'), showsZus(draft) ? once('zus', () => zusCard(c, { editable })) : null].filter(Boolean);
    else if (tab === 'dokumenty') content = [...sectionsFor('dokumenty'), once('poa', () => poaCard(c, { editable })), once('arch', () => archiveCard(c)), once('aml', () => amlCard({ module: 'rkdp', client: c })), once('dp', () => doradztwoCard(c))].filter(Boolean);
    else if (tab === 'rozmowa') content = [once('thread', () => threadCard(c)), once('meet', () => clientMeetingsCard({ client_id: c.id, name: c.name, email: c.email || '', phone: c.phone || '' }))].filter(Boolean);
    else content = [histBox, auditBox, deleteBtn ? h('div', { style: { textAlign: 'right' } }, deleteBtn) : null].filter(Boolean);
    body.className = 'kc-body kc-' + tab;
    body.replaceChildren(...(tab === 'przeglad' ? content : [h('div', { class: 'kc-cols' }, ...content)]));
  }

  // przejście z listy klientów (kliknięcie w procent) – od razu krok po kroku
  try { if (sessionStorage.getItem('kl-braki') === id) { sessionStorage.removeItem('kl-braki'); tab = 'przeglad'; setTimeout(() => editable && guidedFill(), 300); } } catch { /* */ }

  main.replaceChildren(
    h('a', { href: '#/klienci', class: 'small', style: { fontWeight: 600, textDecoration: 'none' } }, '← Wszyscy klienci'),
    h('div', { style: { marginTop: '10px' } }, hero), tabsBar, body);
  redraw();

  const beforeUnload = e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', beforeUnload);
  return () => window.removeEventListener('beforeunload', beforeUnload);
}
