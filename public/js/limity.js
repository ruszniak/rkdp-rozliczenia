// Limity i progi podatkowe: przychody klienta (rok poprzedni + narastająco) → ostrzeżenia w karcie klienta i na Pulpicie.
// Kwoty na dany rok: limity w euro przeliczane po kursie NBP z pierwszego dnia roboczego października roku poprzedniego.
import { h, toast, fail, modal } from './ui.js';
import { sb, state } from './store.js';
// bez „null” w treści: puste elementy (null/false) są pomijane
const put = (el, ...k) => el.replaceChildren(...k.flat().filter(x => x != null && x !== false));

export const LIMITS = {
  2026: { eur: 4.2586, vatZw: 240000, ryczalt: 8517200, malyPod: 8517000, pelneKsiegi: 10646500, mzp: 120000, estEtaty: 3 },
};
const lim = y => LIMITS[y] || LIMITS[Math.max(...Object.keys(LIMITS).map(Number).filter(k => k <= y))] || LIMITS[2026];
const MON = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
export const zl = n => (Math.round(+n || 0)).toLocaleString('pl-PL') + ' zł';
const pct = (a, b) => Math.round((a / b) * 100);
const PERSONAL = ['jdg', 'spolka_cywilna', 'spolka_jawna', 'spolka_partnerska'];

// c = klient, prev = przychód za rok poprzedni (cały), ytd = { amount, through_month } za bieżący rok
export function checkLimits(c, prev, ytd, year = new Date().getFullYear()) {
  const L = lim(year), out = [];
  const P = prev == null ? null : +prev, Y = ytd ? +ytd.amount : null;
  const add = (level, title, text) => out.push({ level, title, text });
  const near = (v, limit) => v != null && v >= 0.8 * limit && v < limit;
  const ytdL = ytd ? `${zl(Y)} (do końca: ${MON[ytd.through_month - 1]})` : '';
  // VAT – zwolnienie podmiotowe
  if (c.vat_status === 'zwolniony_podmiotowo') {
    if (P != null && P > L.vatZw) add('err', `Zwolnienie z VAT – limit ${zl(L.vatZw)}`, `Przychód w ${year - 1} r. ${zl(P)} przekracza limit – klient nie może korzystać ze zwolnienia w ${year} r.`);
    if (Y != null && Y > L.vatZw) add('err', `Zwolnienie z VAT – przekroczony limit ${zl(L.vatZw)}`, `Sprzedaż w ${year} r.: ${ytdL}. Zwolnienie traci moc od czynności, którą przekroczono limit – rejestracja VAT-R i VAT od nadwyżki.`);
    else if (near(Y, L.vatZw)) add('warn', `Zwolnienie z VAT – ${pct(Y, L.vatZw)}% limitu`, `Sprzedaż w ${year} r.: ${ytdL}. Zostało ${zl(L.vatZw - Y)} do limitu ${zl(L.vatZw)}.`);
  }
  // ryczałt od przychodów ewidencjonowanych
  if (c.pit_form === 'ryczalt' || c.bookkeeping === 'ryczalt') {
    if (P != null && P > L.ryczalt) add('err', `Ryczałt – limit 2 mln EUR (${zl(L.ryczalt)})`, `Przychód w ${year - 1} r. ${zl(P)} – w ${year} r. klient nie może być na ryczałcie.`);
    if (Y != null && Y > L.ryczalt) add('warn', 'Ryczałt – przekroczony limit w tym roku', `Przychód w ${year} r.: ${ytdL} – od ${year + 1} r. bez ryczałtu.`);
    else if (near(Y, L.ryczalt)) add('warn', `Ryczałt – ${pct(Y, L.ryczalt)}% limitu`, `Przychód w ${year} r.: ${ytdL}. Przekroczenie = od ${year + 1} r. bez ryczałtu.`);
  }
  // mały podatnik: CIT 9% i VAT kwartalny
  const malyNeeded = c.cit_type === 'maly_podatnik_9' || c.vat_status === 'czynny_kwartalny';
  if (malyNeeded && P != null && P > L.malyPod) add('err', `Mały podatnik – limit 2 mln EUR (${zl(L.malyPod)})`, `Przychód (ze sprzedaży z VAT) w ${year - 1} r. ${zl(P)} – w ${year} r. klient nie jest małym podatnikiem${c.cit_type === 'maly_podatnik_9' ? ': CIT 19% zamiast 9%' : ''}${c.vat_status === 'czynny_kwartalny' ? ', VAT miesięcznie zamiast kwartalnie' : ''}.`);
  if (c.cit_type === 'maly_podatnik_9' && Y != null && Y > L.malyPod) add('err', 'CIT 9% – przekroczony limit w roku podatkowym', `Przychód w ${year} r.: ${ytdL}. Stawka 9% przysługuje, gdy przychód w roku podatkowym nie przekracza 2 mln EUR – sprawdź zaliczki.`);
  else if (malyNeeded && near(Y, L.malyPod)) add('warn', `Mały podatnik – ${pct(Y, L.malyPod)}% limitu`, `Przychód w ${year} r.: ${ytdL}.`);
  // obowiązek pełnych ksiąg (osoby fizyczne i spółki osobowe osób fizycznych na KPiR)
  if (PERSONAL.includes(c.legal_form) && c.bookkeeping === 'kpir') {
    if (P != null && P >= L.pelneKsiegi) add('err', `Pełne księgi – próg 2,5 mln EUR (${zl(L.pelneKsiegi)})`, `Przychód w ${year - 1} r. ${zl(P)} – od ${year} r. obowiązek ksiąg rachunkowych zamiast KPiR.`);
    if (Y != null && Y >= L.pelneKsiegi) add('warn', 'Pełne księgi od przyszłego roku', `Przychód w ${year} r.: ${ytdL} – od ${year + 1} r. księgi rachunkowe.`);
    else if (near(Y, L.pelneKsiegi)) add('warn', `Pełne księgi – ${pct(Y, L.pelneKsiegi)}% progu`, `Przychód w ${year} r.: ${ytdL}.`);
  }
  // Mały ZUS Plus
  if (c.zus_type === 'maly_zus_plus') {
    if (P != null && P > L.mzp) add('err', `Mały ZUS Plus – limit ${zl(L.mzp)}`, `Przychód w ${year - 1} r. ${zl(P)} – w ${year} r. klient nie może opłacać składek od dochodu.`);
    if (Y != null && Y > L.mzp) add('warn', 'Mały ZUS Plus – w przyszłym roku nie przysługuje', `Przychód w ${year} r.: ${ytdL} – przekracza ${zl(L.mzp)}, więc w ${year + 1} r. bez Małego ZUS Plus.`);
    else if (near(Y, L.mzp)) add('warn', `Mały ZUS Plus – ${pct(Y, L.mzp)}% limitu`, `Przychód w ${year} r.: ${ytdL}. Powyżej ${zl(L.mzp)} – w ${year + 1} r. bez ulgi.`);
  } else if (c.legal_form === 'jdg' && c.zus_type === 'pelny' && P != null && P <= L.mzp && P > 0) {
    add('info', 'Mały ZUS Plus – możliwy', `Przychód w ${year - 1} r. ${zl(P)} ≤ ${zl(L.mzp)}. Sprawdź limit 36 miesięcy i zgłoszenie do 31 stycznia.`);
  }
  // estoński CIT
  if (c.cit_type === 'estonski') {
    const n = c.employees_count;
    if (n == null) add('warn', 'Estoński CIT – zatrudnienie', `Uzupełnij liczbę pracowników w karcie. Warunek: min. ${L.estEtaty} etaty (umowy o pracę) przez co najmniej 300 dni w roku, bez wspólników.`);
    else if (n < L.estEtaty) add('err', 'Estoński CIT – za mało etatów', `W karcie: ${n} prac. Warunek: min. ${L.estEtaty} etaty przez 300 dni w roku (umowy o pracę, bez wspólników) albo wariant z umowami cywilnymi z art. 28j ust. 1 pkt 3 lit. b ustawy o CIT – sprawdź, inaczej utrata prawa do ryczałtu.`);
    if (P != null && P > L.malyPod) add('info', 'Estoński CIT – stawka 20%', `Przychód w ${year - 1} r. ${zl(P)} > 2 mln EUR – stawka ryczałtu 20% zamiast 10%.`);
  }
  return out;
}

const RANK = { err: 0, warn: 1, info: 2 };
export const sortAlerts = a => [...a].sort((x, y) => RANK[x.level] - RANK[y.level]);
export const alertList = list => h('div', { class: 'lim-list' }, ...sortAlerts(list).map(a => h('div', { class: 'lim-a lim-' + a.level }, h('b', {}, a.title), h('span', {}, a.text))));

export async function loadRevenue(ids, year = new Date().getFullYear()) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 300) {
    const { data, error } = await sb.from('client_revenue').select('client_id,year,amount,through_month,source,updated_at').in('client_id', ids.slice(i, i + 300)).in('year', [year - 1, year]);
    if (error) throw error;
    (data || []).forEach(r => { const o = out.get(r.client_id) || {}; if (r.year === year) o.ytd = r; else o.prev = r; out.set(r.client_id, o); });
  }
  return out;
}

export async function saveRevenue(clientId, year, amount, through_month = 12, source = 'reczny') {
  return sb.from('client_revenue').upsert({ client_id: clientId, year, amount, through_month, source, updated_by: state.me.id, updated_at: new Date().toISOString() });
}

// karta klienta → „Przychody i limity”
export function revenueCard(c, { editable = true } = {}) {
  const year = new Date().getFullYear();
  const box = h('section', { class: 'card section lim-card' }, h('div', { class: 'section-head' }, h('h2', {}, 'Przychody i limity')), h('p', { class: 'hint' }, 'Wczytywanie…'));
  const num = v => { const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.')); return isFinite(n) ? n : null; };
  async function draw() {
    let r; try { r = (await loadRevenue([c.id], year)).get(c.id) || {}; } catch { put(box, h('div', { class: 'section-head' }, h('h2', {}, 'Przychody i limity')), h('p', { class: 'hint' }, 'Niedostępne.')); return; }
    const al = checkLimits(c, r.prev?.amount ?? null, r.ytd || null, year);
    const prevIn = h('input', { class: 'input', inputmode: 'decimal', placeholder: 'np. 180000', value: r.prev ? String(r.prev.amount).replace('.', ',') : '', disabled: !editable });
    const ytdIn = h('input', { class: 'input', inputmode: 'decimal', placeholder: 'narastająco', value: r.ytd ? String(r.ytd.amount).replace('.', ',') : '', disabled: !editable });
    const monSel = h('select', { class: 'select', disabled: !editable }, ...MON.map((m, i) => h('option', { value: i + 1, selected: (r.ytd?.through_month || Math.max(1, new Date().getMonth())) === i + 1 }, m)));
    const save = h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: async () => {
      const p = prevIn.value.trim() === '' ? null : num(prevIn.value), y = ytdIn.value.trim() === '' ? null : num(ytdIn.value);
      if ((prevIn.value.trim() && p == null) || (ytdIn.value.trim() && y == null)) return toast('Wpisz kwotę liczbą', true);
      save.disabled = true;
      const res = await Promise.all([
        p == null ? (r.prev ? sb.from('client_revenue').delete().eq('client_id', c.id).eq('year', year - 1) : { error: null }) : saveRevenue(c.id, year - 1, p, 12),
        y == null ? (r.ytd ? sb.from('client_revenue').delete().eq('client_id', c.id).eq('year', year) : { error: null }) : saveRevenue(c.id, year, y, +monSel.value),
      ]);
      const e = res.find(x => x.error)?.error; save.disabled = false;
      if (e) return fail(e); toast('Zapisano'); draw();
    } }, 'Zapisz');
    put(box, 
      h('div', { class: 'section-head' }, h('h2', {}, 'Przychody i limity')),
      h('div', { class: 'lim-form' },
        h('label', { class: 'field' }, h('span', {}, `Przychód ${year - 1} (cały rok)`), prevIn),
        h('label', { class: 'field' }, h('span', {}, `Przychód ${year} narastająco`), ytdIn),
        h('label', { class: 'field' }, h('span', {}, 'stan na koniec'), monSel),
        editable ? save : null),
      r.ytd?.source === 'jpk' ? h('p', { class: 'small muted' }, `Przychód ${year} z pliku JPK (${new Date(r.ytd.updated_at).toLocaleDateString('pl-PL')}).`) : null,
      al.length ? alertList(al) : h('p', { class: 'small muted', style: { marginTop: '6px' } }, r.prev || r.ytd ? 'Limity w porządku.' : 'Wpisz przychody – karta sprawdzi limity: zwolnienie z VAT, ryczałt, mały podatnik, pełne księgi, Mały ZUS Plus, estoński CIT. Przychód narastająco można też zapisać jednym kliknięciem przy weryfikacji JPK_PKPIR / JPK_EWP.'));
  }
  draw();
  return box;
}

// Pulpit → „Ostrzeżenia”: limity przychodów i wygasające pełnomocnictwa (pracownik – swoi klienci, administrator – wszyscy)
export function warningsCard() {
  const box = h('section', { class: 'card section lim-dash' });
  (async () => {
    try {
      const { data: cs } = await sb.from('clients').select('id,name,status,legal_form,bookkeeping,pit_form,vat_status,cit_type,zus_type,employees_count,accountant_id,hr_id').eq('status', 'aktywny');
      const admin = state.me?.role === 'admin';
      const mine = (cs || []).filter(c => admin || c.accountant_id === state.me.id || c.hr_id === state.me.id);
      if (!mine.length) { box.remove(); return; }
      const ids = mine.map(c => c.id), byId = new Map(mine.map(c => [c.id, c]));
      const [rev, { data: poa }] = await Promise.all([loadRevenue(ids), sb.from('client_poa').select('*').in('client_id', ids.slice(0, 1000))]);
      const { poaAlerts } = await import('./pelnomocnictwa.js');
      const items = [];
      for (const c of mine) { const r = rev.get(c.id) || {}; checkLimits(c, r.prev?.amount ?? null, r.ytd || null).filter(a => a.level !== 'info').forEach(a => items.push({ ...a, client_id: c.id })); }
      poaAlerts(poa || [], id => byId.get(id)?.name || '').forEach(a => items.push(a));
      const noData = mine.filter(c => !rev.has(c.id)).length;
      if (!items.length) {
        put(box, h('div', { class: 'section-head' }, h('h2', {}, 'Limity i pełnomocnictwa')), h('p', { class: 'small muted' }, `Bez ostrzeżeń.${noData ? ` Przychody nieuzupełnione u ${noData} klientów – limity sprawdzane są tylko tam, gdzie je wpisano.` : ''}`));
        return;
      }
      const sorted = sortAlerts(items);
      put(box, h('div', { class: 'section-head' }, h('h2', {}, `Ostrzeżenia (${items.length})`)),
        h('div', { class: 'lim-list' }, ...sorted.slice(0, 12).map(a => h('a', { class: 'lim-a lim-' + a.level, href: `#/klient/${a.client_id}`, 'data-panel': a.client_id },
          h('b', {}, `${byId.get(a.client_id)?.name || ''} – ${a.title}`), h('span', {}, a.text)))),
        sorted.length > 12 ? h('p', { class: 'small muted' }, `… i ${sorted.length - 12} więcej`) : null,
        noData ? h('p', { class: 'small muted', style: { marginTop: '8px' } }, `Przychody nieuzupełnione u ${noData} klientów.`) : null);
    } catch { box.remove(); }
  })();
  return box;
}
