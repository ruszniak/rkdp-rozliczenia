import { h, icon, fail, toast, modal, downloadCsv, initials, defaultPeriod, periodLabel } from '../ui.js';
import { sb, state, memberById, canEditClients } from '../store.js';
import { LEGAL_SHORT, FORM_GROUP, VAT_SHORT, PIT_SHORT, CIT_SHORT, ZUS_SHORT, CLIENT_STATUS, isCompany, isPartnership,
  LEGAL_FORM, BOOKKEEPING, PIT_FORM, ADVANCES, ZUS_TYPE, CIT_TYPE, VAT_STATUS } from '../dict.js';
import { fetchAll } from './rozliczenia.js';
import { lookupNip, validNip, cleanNip } from '../nip.js';
import { dokumentyDialog } from '../rkdp/docs.js';
import { firmSwitch } from '../firma.js';

const OPEN_MATTER = ['nowa', 'w_toku', 'oczekuje_organ', 'oczekuje_klient', 'zawieszona'];

const PREF_KEY = 'rkdp-klienci-filtry';
const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch { return {}; } };
const savePrefs = p => { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* */ } };

// Co powinno być uzupełnione w profilu — zależnie od formy
export function requiredFields(c) {
  const f = ['legal_form', 'bookkeeping', 'nip', 'email', 'phone', 'vat_status', 'has_employees', 'contract_signed', 'upl1'];
  if (c.legal_form === 'jdg') f.push('pit_form', 'pit_advances', 'zus_type');
  if (isCompany(c.legal_form)) f.push('cit_type', 'krs', 'crbr_reported');
  if (isPartnership(c.legal_form)) f.push('partners');
  return f;
}
export function completeness(c, partnersCount = 0) {
  const req = requiredFields(c);
  const done = req.filter(k => k === 'partners' ? partnersCount > 0 : c[k] !== null && c[k] !== undefined && c[k] !== '').length;
  return { pct: Math.round(done / req.length * 100), missing: req.length - done };
}

export function taxSummary(c) {
  const out = [];
  if (c.service_scope === 'doradztwo') out.push('Tylko DP' + (c.has_employees ? ' + kadry' : ''));
  if (c.legal_form === 'jdg' && c.pit_form) out.push(PIT_SHORT[c.pit_form] + (c.pit_advances === 'kwartalne' ? ' (kw.)' : ''));
  if ((isCompany(c.legal_form) || c.legal_form === 'spolka_komandytowa') && c.cit_type) out.push(CIT_SHORT[c.cit_type] + (c.cit_advances === 'kwartalne' ? ' (kw.)' : ''));
  if (c.vat_status) out.push(VAT_SHORT[c.vat_status]);
  if (c.legal_form === 'jdg' && c.zus_type) out.push('ZUS: ' + ZUS_SHORT[c.zus_type]);
  if (c.has_employees) out.push('Pracownicy');
  return out.join(' · ');
}

export async function renderKlienci(main) {
  const prefs = { q: '', status: 'aktywny', group: '', who: '', ...loadPrefs() };
  main.replaceChildren(h('div', { class: 'spinner' }, 'Wczytywanie klientów…'));
  const period = defaultPeriod();
  const [clients, entries, matters] = await Promise.all([
    fetchAll(() => sb.from('clients').select('*, client_assignments(member_id), client_partners(id)').order('name')),
    fetchAll(() => sb.from('checklist_entries').select('client_id,task_code,status').eq('period', period + '-01')).catch(() => []),
    // sprawy doradcze RKDP (otwarte) – znaczek ⚖ przy kliencie
    fetchAll(() => sb.from('m2_matters').select('status,m2_clients!inner(rkdp_client_id)').eq('firm', 'rkdp')).catch(() => []),
  ]);
  const sprawy = new Map();
  matters.forEach(m => { const id = m.m2_clients?.rkdp_client_id; if (id && OPEN_MATTER.includes(m.status)) sprawy.set(id, (sprawy.get(id) || 0) + 1); });
  const sprEl = c => sprawy.get(c.id) ? h('span', { class: 'kl-spr', 'data-tip': 'Otwarte sprawy doradcze' }, '⚖ ' + sprawy.get(c.id)) : null;
  // pasek rozliczeń bieżącego miesiąca: zrobione / do zrobienia (bez „nie dotyczy”); „do uwagi” – braki dokumentów, przypomnienia, po terminie
  const counts = new Set(state.taskTypes.filter(t => t.counts_to_settled !== false).map(t => t.code));
  const prog = new Map();
  for (const e of entries) {
    if (!counts.has(e.task_code) || e.status === 'na') continue;
    const p = prog.get(e.client_id) || { done: 0, all: 0, miss: 0 };
    p.all++; if (e.status === 'done') p.done++; if (['missing_docs', 'reminded'].includes(e.status)) p.miss++;
    prog.set(e.client_id, p);
  }
  const [py, pm] = period.split('-').map(Number);
  const lateDay = new Date(py, pm, 25).toLocaleDateString('sv-SE'); // 25. dzień kolejnego miesiąca – ostatni termin JPK/VAT
  const isLate = new Date().toLocaleDateString('sv-SE') > lateDay;
  const attention = c => { const p = prog.get(c.id); return !!p && c.status === 'aktywny' && (p.miss > 0 || (isLate && p.done < p.all)); };
  const me = state.me.id;
  const isMine = c => c.accountant_id === me || c.hr_id === me || (c.client_assignments || []).some(a => a.member_id === me);

  const search = h('input', { class: 'input grow', type: 'search', placeholder: 'Szukaj po nazwie, NIP, e-mailu, telefonie…', value: prefs.q, 'aria-label': 'Szukaj' });
  const statusSel = h('select', { class: 'select', 'aria-label': 'Status' }, h('option', { value: '' }, 'Wszystkie statusy'),
    Object.entries(CLIENT_STATUS).map(([k, v]) => h('option', { value: k }, v)));
  statusSel.value = prefs.status;
  const groupSel = h('select', { class: 'select', 'aria-label': 'Forma' },
    h('option', { value: '' }, 'Wszystkie formy'), h('option', { value: 'jdg' }, 'JDG'),
    h('option', { value: 'osobowe' }, 'Spółki osobowe'), h('option', { value: 'kapitalowe' }, 'Sp. z o.o. / S.A.'),
    h('option', { value: 'inne' }, 'Pozostałe'), h('option', { value: 'niekompletne' }, 'Profil do uzupełnienia'));
  groupSel.value = prefs.group;

  const tbody = h('tbody');
  const counter = h('span', { class: 'kl-count' });
  const chips = h('div', { class: 'zl-chips kl-chips' });
  const cards = h('div', { class: 'kl-cards' });
  const idx = h('nav', { class: 'kl-idx', 'aria-label': 'Litery' });

  const list = () => {
    const q = prefs.q.trim().toLowerCase();
    return clients.filter(c => {
      if (prefs.status && c.status !== prefs.status) return false;
      if (prefs.who === 'moi' && !isMine(c)) return false;
      if (prefs.who === 'uwaga' && !attention(c)) return false;
      if (prefs.group === 'niekompletne') { if (completeness(c, c.client_partners?.length).pct === 100) return false; }
      else if (prefs.group && (FORM_GROUP[c.legal_form] || 'inne') !== prefs.group) return false;
      if (q && ![c.name, c.nip, c.email, c.phone, c.contact_person].some(v => (v || '').toLowerCase().includes(q))) return false;
      return true;
    });
  };

  const PAL = [['#E1F1F3', '#064B58'], ['#EEEAFB', '#5B3FB0'], ['#FBEFD9', '#A05E00'], ['#E3F5EA', '#1E7A44'], ['#FCE6E3', '#B3261E'], ['#E6ECF7', '#2D4E8A']];
  const tint = name => { let n = 0; for (const ch of name || '') n = (n * 31 + ch.charCodeAt(0)) >>> 0; return PAL[n % PAL.length]; };
  const progEl = c => {
    const p = prog.get(c.id);
    if (!p || !p.all) return h('span', { class: 'kl-pr' });
    if (p.done >= p.all) return h('span', { class: 'kl-pr' }, h('span', { class: 'kl-ok' }, '✓ rozliczony'));
    return h('span', { class: 'kl-pr', title: `${periodLabel(period)}: zrobione ${p.done} z ${p.all}` },
      h('span', { class: 'kl-bar' }, ...Array.from({ length: Math.min(p.all, 8) }, (_, i) => h('i', { class: i < Math.round(p.done / p.all * Math.min(p.all, 8)) ? 'd' : '' }))),
      h('span', { class: 'kl-n' }, `${p.done}/${p.all}`));
  };
  const letter = n => (n || '#').trim().charAt(0).toLocaleUpperCase('pl') || '#';
  const drawChips = () => {
    const base = clients.filter(c => !prefs.status || c.status === prefs.status);
    const chip = (k, l, n, pre) => h('button', { type: 'button', class: 'zl-chip' + (prefs.who === k ? ' on' : ''), onclick: () => { prefs.who = k; savePrefs(prefs); render(); } }, pre || null, l, h('span', {}, String(n)));
    const nAtt = base.filter(attention).length;
    chips.replaceChildren(...[chip('', 'Wszyscy', base.length), chip('moi', 'Moi', base.filter(isMine).length),
      nAtt || prefs.who === 'uwaga' ? chip('uwaga', 'Do uwagi', nAtt, h('b', { class: 'mj-hot' }, '!')) : null,
      h('label', { class: 'kl-sel' }, statusSel), h('label', { class: 'kl-sel' }, groupSel)].filter(Boolean));
    [...chips.childNodes].forEach(n => { if (n.nodeType === 3 && n.textContent === 'null') n.remove(); });
  };
  const render = () => {
    const rows = list();
    counter.textContent = String(rows.length);
    drawChips();
    // telefon: lista alfabetyczna z literami
    const groups = new Map();
    rows.forEach(c => { const l = letter(c.name); if (!groups.has(l)) groups.set(l, []); groups.get(l).push(c); });
    cards.replaceChildren(...(rows.length ? [...groups.entries()].map(([l, cs]) => h('section', { class: 'kl-sec', id: 'kl-l-' + l },
      h('div', { class: 'kl-let' }, l),
      h('div', { class: 'kl-list' }, ...cs.map(c => {
        const [bg, fg] = tint(c.name);
        const meta = [LEGAL_SHORT[c.legal_form], taxSummary(c) || (c.nip ? 'NIP ' + c.nip : '')].filter(Boolean).join(' · ');
        return h('a', { class: 'kl-row', href: `#/klient/${c.id}` },
          h('span', { class: 'kl-ini', style: { background: bg, color: fg } }, initials(c.name).slice(0, 2)),
          h('span', { class: 'kl-t' }, h('b', {}, c.name), h('span', { class: 'kl-m' }, c.status !== 'aktywny' ? CLIENT_STATUS[c.status] + ' · ' + meta : meta, sprEl(c))),
          progEl(c));
      })))) : [h('p', { class: 'hint', style: { padding: '18px 4px' } }, prefs.who === 'uwaga' ? 'Nikt nie wymaga uwagi. 👍' : 'Brak klientów pasujących do filtrów.')]));
    idx.replaceChildren(...[...groups.keys()].map(l => h('button', { type: 'button', onclick: () => document.getElementById('kl-l-' + l)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, l)));
    idx.hidden = groups.size < 6;
    // komputer: tabela
    tbody.replaceChildren(...rows.map(c => {
      const comp = completeness(c, c.client_partners?.length);
      const acc = memberById(c.accountant_id)?.short_name, hr = memberById(c.hr_id)?.short_name;
      const [bg, fg] = tint(c.name);
      return h('tr', { class: 'click', onclick: () => { location.hash = `#/klient/${c.id}`; } },
        h('td', {}, h('span', { class: 'kl-name' }, h('span', { class: 'kl-ini sm', style: { background: bg, color: fg } }, initials(c.name).slice(0, 2)),
          h('span', {}, h('a', { href: `#/klient/${c.id}`, style: { fontWeight: 600, color: 'var(--ink)', textDecoration: 'none' } }, c.name), sprEl(c),
            c.status !== 'aktywny' ? h('div', {}, h('span', { class: 'badge warn' }, CLIENT_STATUS[c.status])) : null))),
        h('td', {}, h('span', { class: 'badge' }, LEGAL_SHORT[c.legal_form] || '?')),
        h('td', { class: 'small' }, taxSummary(c) || h('span', { class: 'muted' }, '—')),
        h('td', {}, progEl(c)),
        h('td', { class: 'small' }, c.phone ? h('a', { href: 'tel:' + c.phone.replace(/\s/g, ''), onclick: e => e.stopPropagation() }, c.phone) : '',
          c.email ? h('div', {}, h('a', { href: 'mailto:' + c.email, onclick: e => e.stopPropagation() }, c.email)) : ''),
        h('td', { class: 'small' }, acc ? h('div', {}, 'Księgowość: ', h('b', {}, acc)) : null, hr ? h('div', {}, 'Kadry: ', h('b', {}, hr)) : null,
          !acc && !hr ? h('span', { class: 'muted' }, '—') : null),
        h('td', {}, h('span', { class: 'pct', title: comp.missing ? `Brakuje ${comp.missing} pól` : 'Profil kompletny' },
          h('span', { class: 'bar' }, h('i', { style: { width: comp.pct + '%' } })), comp.pct + '%')));
    }));
  };

  const onFilter = () => { Object.assign(prefs, { q: search.value, status: statusSel.value, group: groupSel.value }); savePrefs(prefs); render(); };
  search.placeholder = 'Nazwa, NIP, e-mail, telefon…';
  let searchTimer;
  search.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(onFilter, 180); });
  statusSel.addEventListener('change', onFilter);
  groupSel.addEventListener('change', onFilter);

  const exportBtn = h('button', { class: 'btn btn-outline btn-sm', onclick: () => {
    const opt = (d, v) => (v ? d[v] || v : '');
    const yn = v => v === true ? 'tak' : v === false ? 'nie' : '';
    downloadCsv('klienci_rkdp.csv', [
      ['Nazwa', 'Status', 'Forma', 'Księgowość', 'NIP', 'REGON', 'KRS', 'Adres', 'Osoba kontaktowa', 'E-mail', 'Telefon',
        'PIT', 'Zaliczki PIT', 'ZUS', 'CIT', 'VAT', 'VAT-UE', 'Pracownicy', 'Umowa', 'UPL-1', 'Wynagrodzenie netto', 'Księgowa', 'Kadrowa'],
      ...list().map(c => [c.name, CLIENT_STATUS[c.status], opt(LEGAL_FORM, c.legal_form), opt(BOOKKEEPING, c.bookkeeping),
        c.nip, c.regon, c.krs, c.address, c.contact_person, c.email, c.phone, opt(PIT_FORM, c.pit_form), opt(ADVANCES, c.pit_advances),
        opt(ZUS_TYPE, c.zus_type), opt(CIT_TYPE, c.cit_type), opt(VAT_STATUS, c.vat_status), yn(c.vat_ue), yn(c.has_employees),
        yn(c.contract_signed), yn(c.upl1), c.monthly_fee ?? '',
        memberById(c.accountant_id)?.short_name || '', memberById(c.hr_id)?.short_name || '']),
    ]);
  } }, icon('download'), 'Eksport');

  const addBtn = canEditClients()
    ? h('button', { class: 'btn btn-primary', onclick: async () => {
      const val = prompt('Podaj NIP (dane pobiorę z Białej listy VAT) albo nazwę nowego klienta:');
      if (!val?.trim()) return;
      let row = { name: val.trim() };
      if (validNip(val)) {
        try {
          const r = await lookupNip(val);
          if (r.found) row = { name: r.name, nip: r.nip, regon: r.regon, krs: r.krs, address: r.address };
          else { const n = prompt('Nie znaleziono tego NIP w wykazie VAT. Podaj nazwę klienta:'); if (!n?.trim()) return; row = { name: n.trim(), nip: cleanNip(val) }; }
        } catch (e) { return fail(e); }
      }
      const { data, error } = await sb.from('clients').insert(row).select('id').single();
      if (error) return fail(error);
      location.hash = `#/klient/${data.id}`;
    } }, icon('plus'), 'Dodaj klienta')
    : null;

  // ---- masowa aktualizacja z Białej listy VAT ----
  const wlBtn = canEditClients() ? h('button', { class: 'btn btn-outline btn-sm', onclick: async () => {
    const withNip = clients.filter(c => validNip(c.nip || ''));
    if (!withNip.length) return toast('Żaden klient nie ma poprawnego NIP', true);
    wlBtn.disabled = true; wlBtn.textContent = `Sprawdzam ${withNip.length} NIP…`;
    const { data, error } = await sb.functions.invoke('nip-lookup', { body: { nips: withNip.map(c => cleanNip(c.nip)) } });
    wlBtn.disabled = false; wlBtn.replaceChildren(icon('download'), 'Biała lista VAT');
    if (error || data?.error) return fail(data?.error || error, 'Biała lista');
    const res = data.results || {};
    const norm = v => String(v || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const LBL = { name: 'Nazwa', address: 'Adres', regon: 'REGON', krs: 'KRS' };
    const changes = withNip.map(c => {
      const r = res[cleanNip(c.nip)];
      if (!r?.found) return { c, notFound: true, set: {} };
      const set = {};
      // nazwa: dla spółek z rejestru; przy JDG rejestr podaje „IMIĘ NAZWISKO + firma”, więc nie nadpisuję imienia i nazwiska
      if (r.name && c.legal_form !== 'jdg' && norm(c.name) !== norm(r.name)) set.name = r.name;
      for (const k of ['address', 'regon', 'krs']) if (r[k] && norm(c[k]) !== norm(r[k])) set[k] = r[k];
      return { c, r, set };
    });
    const rows = changes.filter(x => Object.keys(x.set).length || x.notFound);
    const nChanges = rows.reduce((a, x) => a + Object.keys(x.set).length, 0);
    const tbody = h('tbody', {}, ...(rows.length ? rows.map(x => {
      x.cbs = {};
      const diff = Object.entries(x.set).map(([k, v]) => {
        const cb = h('input', { type: 'checkbox', checked: true }); x.cbs[k] = cb;
        return h('label', { class: 'small wl-ch' }, cb, h('b', {}, LBL[k] + ': '),
          x.c[k] ? h('span', { class: 'muted', style: { textDecoration: 'line-through' } }, x.c[k] + ' ') : '', v);
      });
      return h('tr', {}, h('td', {}, h('b', {}, x.c.name), h('div', { class: 'small muted' }, 'NIP ' + x.c.nip),
          x.r && x.r.name && !x.set.name ? h('div', { class: 'small muted' }, 'w rejestrze: ' + x.r.name) : null),
        h('td', {}, x.notFound ? h('span', { class: 'badge warn' }, 'brak w wykazie VAT') : diff),
        h('td', { class: 'small' }, x.r?.statusVat || ''));
    }) : [h('tr', {}, h('td', { colspan: 3, class: 'empty' }, 'Wszystkie dane są aktualne.'))]));
    modal(`Biała lista VAT – ${data.checkedAt}`, h('div', {},
      h('p', { class: 'hint', style: { marginBottom: '10px' } }, `Sprawdzono ${withNip.length} klientów, znaleziono ${nChanges} różnic. Zaznaczone pola zostaną zapisane (nazwa, adres, REGON, KRS). Nazw JDG nie zmieniam – rejestr podaje je w innym układzie (imię, nazwisko i nazwa firmy). „Brak w wykazie VAT” oznacza podmiot niezarejestrowany jako podatnik VAT albo wykreślony.`),
      h('div', { class: 'list-wrap', style: { maxHeight: '60vh', overflow: 'auto' } }, h('table', { class: 'list' },
        h('thead', {}, h('tr', {}, ['Klient', 'Zmiana (odznacz, czego nie zapisywać)', 'Status VAT'].map(t => h('th', {}, t)))), tbody))),
    (close) => [
      h('button', { class: 'btn btn-ghost btn-sm', onclick: close }, 'Anuluj'),
      nChanges ? h('button', { class: 'btn btn-primary btn-sm', onclick: async (e) => {
        e.currentTarget.disabled = true;
        let ok = 0, denied = 0;
        for (const x of rows) {
          const set = Object.fromEntries(Object.entries(x.set).filter(([k]) => x.cbs?.[k]?.checked));
          if (!Object.keys(set).length) continue;
          const { data: upd, error: e2 } = await sb.from('clients').update(set).eq('id', x.c.id).select('id');
          if (e2) { fail(e2); break; }
          if (!upd?.length) { denied++; continue; }
          Object.assign(x.c, set); ok++;
        }
        toast(denied ? `Zaktualizowano ${ok} klientów, ${denied} bez uprawnień do zmiany` : `Zaktualizowano ${ok} klientów`, !!denied); close(); render();
      } }, 'Zapisz zaznaczone') : null,
    ], { wide: true });
  } }, icon('download'), 'Biała lista VAT') : null;

  // menu „⋯”: narzędzia przy klientach
  const menu = h('div', { class: 'kl-menu', hidden: true },
    h('a', { href: '#/informacje' }, h('span', {}, '✉'), 'Informacja do klientów'),
    h('a', { href: '#/aml' }, h('span', {}, '⛨'), 'AML'),
    h('a', { href: '#/oferty' }, h('span', {}, '₪'), 'Oferty'),
    h('button', { type: 'button', onclick: () => dokumentyDialog().catch(e => fail(e)) }, h('span', {}, '✎'), 'Umowy i pełnomocnictwa'),
    h('button', { type: 'button', onclick: () => exportBtn.click() }, h('span', {}, '⬇'), 'Eksport (CSV)'),
    wlBtn ? h('button', { type: 'button', onclick: () => wlBtn.click() }, h('span', {}, '⟳'), 'Biała lista VAT – aktualizacja') : null);
  const moreBtn = h('button', { type: 'button', class: 'kl-icon', 'aria-label': 'Więcej', 'aria-haspopup': 'menu',
    onclick: e => { e.stopPropagation(); menu.hidden = !menu.hidden; } }, '⋯');
  const closeMenu = () => { menu.hidden = true; };
  document.addEventListener('click', closeMenu);
  window.addEventListener('hashchange', () => document.removeEventListener('click', closeMenu), { once: true });
  if (addBtn) { addBtn.classList.add('kl-add'); addBtn.setAttribute('aria-label', 'Dodaj klienta'); addBtn.replaceChildren(icon('plus'), h('span', { class: 'kl-add-t' }, 'Dodaj klienta')); }
  // RKDP | M2 TAX – osobne listy klientów (tylko dla osób z dostępem do obu firm)
  const sw = firmSwitch('rkdp', { rkdp: clients.filter(c => c.status === 'aktywny').length });
  if (sw) sb.from('m2_clients').select('id', { count: 'exact', head: true }).eq('firm', 'm2').eq('status', 'aktywny').then(({ count }) => { if (count != null) sw.querySelector('.firm-m2')?.append(h('span', { class: 'firm-seg-n' }, String(count))); }, () => {});
  main.replaceChildren(
    h('div', { class: 'kl-head' }, h('h1', {}, 'Klienci'), counter, sw,
      h('span', { class: 'kl-acts' }, h('span', { class: 'kl-more' }, moreBtn, menu), addBtn)),
    h('label', { class: 'kl-search' }, h('span', { html: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' }), search),
    chips,
    h('div', { class: 'kl-mobile' }, idx, cards),
    h('div', { class: 'list-wrap kl-desk' }, h('table', { class: 'list' },
      h('thead', {}, h('tr', {}, ['Klient', 'Forma', 'Rozliczenia', periodLabel(period), 'Kontakt', 'Księgowa / kadrowa', 'Profil'].map(t => h('th', {}, t)))),
      tbody)));
  render();
  if (!clients.length) tbody.replaceChildren(h('tr', {}, h('td', { colspan: 7, class: 'empty' }, 'Nie masz jeszcze przypisanych klientów.')));
}
