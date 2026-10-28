// Weryfikacja AML klientów – osobno dla RKDP i M2 TAX (każda firma jest odrębną instytucją obowiązaną), wspólna procedura.
import { h, toast, fail, icon, infoTip, modal, printHtml } from '../ui.js';
import { sb, state, memberById, isAdmin } from '../store.js';
import { printableHtml, RKDP_BRAND, M2_BRAND } from '../m2/order.js';

export const AML_STATUS = {
  do_uzupelnienia: { label: 'Do uzupełnienia', cls: 'warn' },
  w_trakcie: { label: 'W trakcie', cls: '' },
  wymaga_uwagi: { label: 'Wymaga uwagi', cls: 'bad' },
  zweryfikowany: { label: 'Zweryfikowany', cls: 'ok' },
  odmowa: { label: 'Odmowa / zakończenie', cls: 'dark' },
};
export const RISK = { niskie: 'Niskie', standardowe: 'Standardowe', podwyzszone: 'Podwyższone' };
const REVIEW_YEARS = { niskie: 3, standardowe: 2, podwyzszone: 1 };
const KIND = { crbr: 'CRBR – beneficjenci rzeczywiści', krs: 'KRS – odpis aktualny', vat: 'Biała lista VAT', sankcje: 'Listy sankcyjne (UE, ONZ, MSWiA)', ryzyko: 'Ocena ryzyka', pep: 'Status PEP', tozsamosc: 'Weryfikacja tożsamości', zatwierdzenie: 'Zatwierdzenie weryfikacji', notatka: 'Notatka' };
const RES = { ok: ['✓', 'ok'], uwaga: ['!', 'bad'], brak: ['–', ''], blad: ['×', 'warn'], info: ['i', ''] };
export const RISK_Q = [
  { k: 'country', q: 'Siedziba lub miejsce zamieszkania klienta albo beneficjenta poza UE/EOG lub w państwie wysokiego ryzyka', w: 3 },
  { k: 'structure', q: 'Złożona lub nieprzejrzysta struktura własności (wielopoziomowa, podmioty zagraniczne, trusty)', w: 2 },
  { k: 'industry', q: 'Branża podwyższonego ryzyka (obrót gotówką, nieruchomości, kryptoaktywa, kantory, gry hazardowe, metale szlachetne, dzieła sztuki, pojazdy)', w: 2 },
  { k: 'cash', q: 'Znaczny udział transakcji gotówkowych lub nietypowe przepływy finansowe', w: 2 },
  { k: 'crbr', q: 'Rozbieżności między CRBR a ustaleniami albo brak wymaganego zgłoszenia do CRBR', w: 2 },
  { k: 'unusual', q: 'Nietypowy charakter zlecenia (brak uzasadnienia gospodarczego, pośpiech, naleganie na poufność)', w: 2 },
  { k: 'remote', q: 'Relacja nawiązana wyłącznie zdalnie, bez weryfikacji tożsamości środkiem identyfikacji elektronicznej', w: 1 },
  { k: 'new', q: 'Podmiot nowo utworzony (do 12 miesięcy) lub częste zmiany wspólników / zarządu', w: 1 },
  { k: 'public', q: 'Czynnik obniżający: spółka publiczna, jednostka sektora finansów publicznych lub podmiot nadzorowany', w: -2 },
];
const ID_METHODS = ['Dokument tożsamości okazany osobiście', 'mObywatel / e-dowód', 'Profil zaufany / podpis kwalifikowany', 'Dane z KRS i dokumenty rejestrowe (osoba prawna)', 'Inne – opis w notatce'];
const HELP = `Procedura AML (ta sama w RKDP i M2 TAX, osobne karty dla każdej firmy):
1. „Sprawdź automatycznie” – aplikacja pobiera dane z CRBR (API Ministerstwa Finansów), KRS i Białej listy VAT oraz sprawdza klienta, beneficjentów, wspólników i zarząd na listach sankcyjnych UE, ONZ i MSWiA. Każde sprawdzenie zapisuje się z datą, godziną i osobą; odpowiedź CRBR – w całości ze skrótem SHA-256.
2. „Ocena ryzyka” – zaznacz czynniki ryzyka; poziom (niskie / standardowe / podwyższone) wylicza się sam, możesz go zmienić z uzasadnieniem.
3. „PEP i tożsamość” – status PEP (na podstawie oświadczenia klienta – wzór do pobrania) i sposób weryfikacji tożsamości.
4. „Zatwierdź weryfikację” – kończy procedurę i ustala termin kolejnego przeglądu: podwyższone – 1 rok, standardowe – 2 lata, niskie – 3 lata.
Trafienie na liście sankcyjnej oznacza MOŻLIWE dopasowanie nazwy – zawsze oceń je ręcznie.`;

const fmtDT = t => t ? new Date(t).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtD = t => t ? new Date(t + (String(t).length === 10 ? 'T00:00:00' : '')).toLocaleDateString('pl-PL') : '—';
const who = id => memberById(id)?.full_name || '—';
const col = m => m === 'rkdp' ? 'client_id' : 'm2_client_id';
const brandOf = m => m === 'rkdp' ? RKDP_BRAND : M2_BRAND;
const addYears = (n) => { const d = new Date(); d.setFullYear(d.getFullYear() + n); return d.toISOString().slice(0, 10); };
export const statusPill = s => { const x = AML_STATUS[s] || AML_STATUS.do_uzupelnienia; return h('span', { class: 'aml-st ' + x.cls }, x.label); };
const fullName = p => p.entity || [p.first, p.last].filter(Boolean).join(' ');

export async function ensureCase(module, clientId) {
  const { data: ex } = await sb.from('aml_cases').select('*').eq(col(module), clientId).maybeSingle();
  if (ex) return ex;
  const { data, error } = await sb.from('aml_cases').insert({ module, [col(module)]: clientId }).select().single();
  if (error) throw error;
  return data;
}
// listy sankcyjne odświeżane raz na dobę – każda osobnym wywołaniem (limit czasu funkcji)
let listsReady = null;
export function ensureLists() {
  if (listsReady) return listsReady;
  listsReady = (async () => {
    const { data } = await sb.functions.invoke('aml', { body: { action: 'lists' } });
    const have = Object.fromEntries((data?.lists || []).map(l => [l.source, l]));
    for (const s of ['eu', 'un', 'pl']) {
      const l = have[s];
      if (!l || !l.entries || Date.now() - new Date(l.fetched_at) > 24 * 3600e3) await sb.functions.invoke('aml', { body: { action: 'refresh_lists', source: s } }).catch(() => {});
    }
  })().catch(() => { listsReady = null; });
  return listsReady;
}
export async function runAuto(caseId, only) {
  await ensureLists();
  const { data, error } = await sb.functions.invoke('aml', { body: { action: 'run', case_id: caseId, only } });
  if (error) { let m = error.message; try { m = (await error.context.json()).error || m; } catch { /* */ } throw new Error(m); }
  if (data?.error) throw new Error(data.error);
  return data;
}
export function scoreRisk(answers, pep, sanctionsHit) {
  const score = RISK_Q.reduce((s, q) => s + (answers?.[q.k] ? q.w : 0), 0);
  let level = score <= 1 ? 'niskie' : score <= 3 ? 'standardowe' : 'podwyzszone';
  if (pep === 'tak' || sanctionsHit || answers?.country) level = 'podwyzszone';
  return { score, level };
}

// ---------------- karta AML na stronie klienta ----------------
export function amlCard({ module, client }) {
  const box = h('section', { class: 'card section aml-card' }, h('div', { class: 'spinner' }, 'Wczytywanie AML…'));
  let kase = null, checks = [];
  async function load() {
    const { data, error } = await sb.from('aml_cases').select('*').eq(col(module), client.id).maybeSingle();
    if (error) { box.replaceChildren(h('div', { class: 'section-head' }, h('h2', {}, 'Weryfikacja AML')), h('p', { class: 'hint' }, 'Moduł AML będzie dostępny po aktualizacji bazy danych.')); return; }
    kase = data;
    checks = [];
    if (kase) { const r = await sb.from('aml_checks').select('id, kind, result, summary, data, checked_at, checked_by, request_id, sha256').eq('case_id', kase.id).order('checked_at', { ascending: false }).limit(60); checks = r.data || []; }
    draw();
  }
  const latest = k => checks.find(c => c.kind === k);
  async function auto(btn) {
    btn.disabled = true; btn.textContent = 'Sprawdzam CRBR, KRS, VAT i listy sankcyjne…';
    try {
      kase = kase || await ensureCase(module, client.id);
      const r = await runAuto(kase.id);
      toast(r.checks.some(c => c.result === 'uwaga') ? 'Sprawdzono – są pozycje wymagające uwagi' : 'Sprawdzono automatycznie', r.checks.some(c => c.result === 'uwaga'));
    } catch (e) { fail(e, 'Weryfikacja automatyczna'); }
    await load();
  }
  function draw() {
    const k = kase || {};
    const row = (l, v) => h('div', { class: 'aml-row' }, h('span', { class: 'muted small' }, l), h('b', {}, v));
    const autoBtn = h('button', { class: 'btn btn-primary btn-sm', onclick: e => auto(e.currentTarget) }, 'Sprawdź automatycznie');
    const crbr = latest('crbr');
    box.replaceChildren(
      h('div', { class: 'section-head' }, h('h2', { style: { display: 'flex', alignItems: 'center' } }, 'Weryfikacja AML', infoTip(HELP, 'Procedura AML')), kase ? statusPill(k.status) : statusPill('do_uzupelnienia')),
      h('div', { class: 'aml-grid' },
        row('Ryzyko', k.risk_level ? RISK[k.risk_level] : '—'), row('PEP', { nie: 'nie', tak: 'TAK', nieustalone: 'nieustalone' }[k.pep || 'nieustalone']),
        row('Tożsamość', k.id_verified || '—'), row('Zatwierdzono', k.verified_at ? `${fmtDT(k.verified_at)} · ${who(k.verified_by)}` : '—'),
        row('Następny przegląd', k.next_review ? fmtD(k.next_review) : '—'), row('Ostatnie sprawdzenie', fmtDT(k.last_auto_at))),
      h('div', { class: 'aml-btns' }, autoBtn,
        h('button', { class: 'btn btn-outline btn-sm', onclick: () => riskDialog() }, 'Ocena ryzyka'),
        h('button', { class: 'btn btn-outline btn-sm', onclick: () => pepDialog() }, 'PEP i tożsamość'),
        h('button', { class: 'btn btn-outline btn-sm', disabled: !kase, onclick: () => approveDialog() }, 'Zatwierdź weryfikację'),
        crbr ? h('button', { class: 'btn btn-ghost btn-sm', onclick: () => crbrPdf(crbr) }, icon('download'), 'Raport CRBR') : null,
        kase ? h('button', { class: 'btn btn-ghost btn-sm', onclick: () => cardPdf() }, icon('download'), 'Karta AML') : null),
      checks.length ? h('div', { class: 'aml-checks' }, ...checks.slice(0, 12).map(c => {
        const [m, cls] = RES[c.result] || RES.info;
        return h('details', { class: 'aml-chk' }, h('summary', {}, h('span', { class: 'aml-res ' + cls }, m), h('span', { class: 'aml-k' }, KIND[c.kind] || c.kind), h('span', { class: 'small muted' }, `${fmtDT(c.checked_at)} · ${who(c.checked_by)}`)),
          h('p', { class: 'small' }, c.summary || ''), c.request_id ? h('p', { class: 'small muted' }, `Identyfikator wniosku: ${c.request_id}`) : null,
          c.kind === 'sankcje' && c.data?.hits?.length ? h('ul', { class: 'small' }, ...c.data.hits.map(x => h('li', {}, `${x.candidate} ↔ ${x.listed} (${x.sourceLabel})`))) : null);
      })) : h('p', { class: 'hint' }, 'Brak sprawdzeń. Kliknij „Sprawdź automatycznie”, aby rozpocząć procedurę.'));
  }

  async function addCheck(kind, result, summary, data = {}) {
    const { error } = await sb.from('aml_checks').insert({ case_id: kase.id, kind, result, summary, data, checked_by: state.me.id });
    if (error) throw error;
  }
  async function riskDialog() {
    try { kase = kase || await ensureCase(module, client.id); } catch (e) { return fail(e); }
    const ans = { ...(kase.risk_answers || {}) };
    const hit = latest('sankcje')?.result === 'uwaga';
    const out = h('p', { class: 'aml-score' });
    let override = kase.risk_level && kase.risk_note ? kase.risk_level : '';
    const sel = h('select', { class: 'select' }, h('option', { value: '' }, 'automatycznie (wg punktacji)'), ...Object.entries(RISK).map(([k, v]) => h('option', { value: k, selected: override === k }, v)));
    const note = h('textarea', { class: 'input', rows: 2, placeholder: 'Uzasadnienie (wymagane przy zmianie poziomu)' }); note.value = kase.risk_note || '';
    const upd = () => { const r = scoreRisk(ans, kase.pep, hit); out.replaceChildren('Punkty: ', h('b', {}, String(r.score)), ' · poziom wyliczony: ', h('b', {}, RISK[r.level]), hit ? ' (możliwe trafienie sankcyjne)' : '', kase.pep === 'tak' ? ' (PEP)' : ''); };
    const list = h('div', { class: 'aml-q' }, ...RISK_Q.map(q => { const cb = h('input', { type: 'checkbox', checked: !!ans[q.k] }); cb.addEventListener('change', () => { ans[q.k] = cb.checked; upd(); }); return h('label', { class: 'check' }, cb, h('span', {}, q.q, h('span', { class: 'muted small' }, ` (${q.w > 0 ? '+' : ''}${q.w})`))); }));
    upd();
    modal('Ocena ryzyka klienta', h('div', {}, h('p', { class: 'hint', style: { marginTop: 0 } }, 'Zaznacz czynniki, które dotyczą klienta. 0–1 pkt – niskie, 2–3 – standardowe, 4 i więcej – podwyższone. Klient PEP, z możliwym trafieniem sankcyjnym albo spoza UE/EOG – zawsze podwyższone.'), list, out,
      h('div', { class: 'form-grid' }, h('label', { class: 'field' }, h('span', {}, 'Poziom ryzyka'), sel), h('label', { class: 'field wide' }, h('span', {}, 'Uzasadnienie / uwagi'), note))),
    close => [h('button', { class: 'btn btn-ghost btn-sm', onclick: close }, 'Anuluj'), h('button', { class: 'btn btn-primary btn-sm', onclick: async () => {
      const r = scoreRisk(ans, kase.pep, hit);
      const level = sel.value || r.level;
      if (sel.value && sel.value !== r.level && !note.value.trim()) return toast('Podaj uzasadnienie zmiany poziomu ryzyka', true);
      const { data, error } = await sb.from('aml_cases').update({ risk_answers: ans, risk_score: r.score, risk_level: level, risk_note: note.value.trim() || null }).eq('id', kase.id).select().single();
      if (error) return fail(error);
      kase = data;
      try { await addCheck('ryzyko', level === 'podwyzszone' ? 'uwaga' : 'ok', `Ryzyko ${RISK[level].toLowerCase()} (punkty: ${r.score})${note.value.trim() ? ' – ' + note.value.trim() : ''}`, { answers: ans, score: r.score, level, computed: r.level }); } catch (e) { fail(e); }
      close(); toast('Zapisano ocenę ryzyka'); load();
    } }, 'Zapisz ocenę')], { wide: true });
  }
  async function pepDialog() {
    try { kase = kase || await ensureCase(module, client.id); } catch (e) { return fail(e); }
    const pep = h('select', { class: 'select' }, ...[['nieustalone', 'nieustalone'], ['nie', 'NIE – klient oświadczył, że nie jest PEP'], ['tak', 'TAK – PEP / członek rodziny / bliski współpracownik']].map(([v, l]) => h('option', { value: v, selected: kase.pep === v }, l)));
    const dt = h('input', { class: 'input', type: 'date', value: kase.pep_statement_at || '' });
    const idm = h('select', { class: 'select' }, h('option', { value: '' }, '— wybierz —'), ...ID_METHODS.map(m => h('option', { value: m, selected: kase.id_verified === m }, m)));
    modal('PEP i weryfikacja tożsamości', h('div', {},
      h('p', { class: 'hint', style: { marginTop: 0 } }, 'Status PEP ustala się na podstawie oświadczenia klienta (osoby fizycznej, a przy podmiotach – beneficjentów i reprezentantów). Wzór oświadczenia pobierzesz przyciskiem poniżej.'),
      h('div', { class: 'form-grid' }, h('label', { class: 'field wide' }, h('span', {}, 'Status PEP'), pep), h('label', { class: 'field' }, h('span', {}, 'Data oświadczenia'), dt),
        h('label', { class: 'field wide' }, h('span', {}, 'Sposób weryfikacji tożsamości'), idm)),
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => pepFormPdf() }, icon('download'), 'Wzór oświadczenia PEP (PDF)')),
    close => [h('button', { class: 'btn btn-ghost btn-sm', onclick: close }, 'Anuluj'), h('button', { class: 'btn btn-primary btn-sm', onclick: async () => {
      const patch = { pep: pep.value, pep_statement_at: dt.value || null, id_verified: idm.value || null };
      const { data, error } = await sb.from('aml_cases').update(patch).eq('id', kase.id).select().single();
      if (error) return fail(error);
      kase = data;
      try {
        await addCheck('pep', pep.value === 'tak' ? 'uwaga' : pep.value === 'nie' ? 'ok' : 'info', `PEP: ${pep.value}${dt.value ? ` (oświadczenie z ${fmtD(dt.value)})` : ''}`, patch);
        if (idm.value) await addCheck('tozsamosc', 'ok', idm.value, { method: idm.value });
      } catch (e) { fail(e); }
      close(); toast('Zapisano'); load();
    } }, 'Zapisz')]);
  }
  function approveDialog() {
    const missing = [];
    if (!kase.risk_level) missing.push('ocena ryzyka');
    if (kase.pep === 'nieustalone') missing.push('status PEP');
    if (!kase.id_verified) missing.push('sposób weryfikacji tożsamości');
    if (!checks.some(c => ['crbr', 'krs', 'vat', 'sankcje'].includes(c.kind))) missing.push('sprawdzenie automatyczne');
    const alerts = ['crbr', 'krs', 'sankcje'].map(latest).filter(c => c?.result === 'uwaga');
    const note = h('textarea', { class: 'input', rows: 3, placeholder: alerts.length ? 'Wymagane: jak oceniono pozycje wymagające uwagi' : 'Notatka (opcjonalnie)' });
    const decision = h('select', { class: 'select' }, h('option', { value: 'zweryfikowany' }, 'Zatwierdzam – można świadczyć usługi'), h('option', { value: 'odmowa' }, 'Odmowa nawiązania / zakończenie stosunków'));
    modal('Zatwierdzenie weryfikacji AML', h('div', {},
      missing.length ? h('div', { class: 'aml-warn' }, 'Brakuje: ', missing.join(', '), '.') : null,
      alerts.length ? h('div', { class: 'aml-warn' }, 'Pozycje wymagające uwagi: ', alerts.map(a => KIND[a.kind]).join(', '), '. Opisz ich ocenę.') : null,
      h('div', { class: 'form-grid' }, h('label', { class: 'field wide' }, h('span', {}, 'Decyzja'), decision), h('label', { class: 'field wide' }, h('span', {}, 'Notatka'), note)),
      h('p', { class: 'hint' }, `Kolejny przegląd: ${kase.risk_level ? `za ${REVIEW_YEARS[kase.risk_level]} ${REVIEW_YEARS[kase.risk_level] === 1 ? 'rok' : 'lata'}` : '—'}. Zatwierdzenie zapisze się z Twoim imieniem i nazwiskiem, datą i godziną.`)),
    close => [h('button', { class: 'btn btn-ghost btn-sm', onclick: close }, 'Anuluj'), h('button', { class: 'btn btn-primary btn-sm', disabled: missing.length > 0, onclick: async () => {
      if (alerts.length && !note.value.trim()) return toast('Opisz ocenę pozycji wymagających uwagi', true);
      const st = decision.value;
      const patch = { status: st, verified_at: new Date().toISOString(), verified_by: state.me.id, next_review: st === 'zweryfikowany' ? addYears(REVIEW_YEARS[kase.risk_level] || 1) : null, notes: note.value.trim() || kase.notes };
      const { data, error } = await sb.from('aml_cases').update(patch).eq('id', kase.id).select().single();
      if (error) return fail(error);
      kase = data;
      try { await addCheck('zatwierdzenie', st === 'zweryfikowany' ? 'ok' : 'uwaga', `${st === 'zweryfikowany' ? 'Zatwierdzono weryfikację' : 'Odmowa / zakończenie stosunków'} – ryzyko ${RISK[kase.risk_level] || '—'}${note.value.trim() ? '. ' + note.value.trim() : ''}`, { decision: st, risk: kase.risk_level, next_review: patch.next_review }); } catch (e) { fail(e); }
      if (module === 'm2') sb.from('m2_clients').update({ aml_verified_at: patch.verified_at.slice(0, 10), aml_risk: kase.risk_level }).eq('id', client.id).then(() => {});
      close(); toast(st === 'zweryfikowany' ? 'Weryfikacja zatwierdzona' : 'Zapisano decyzję'); load();
    } }, 'Zatwierdź')], { wide: true });
  }

  // ---------------- PDF ----------------
  async function fullCheck(id) { const { data } = await sb.from('aml_checks').select('*').eq('id', id).single(); return data; }
  async function crbrPdf(c) {
    const full = await fullCheck(c.id); const d = full.data || {};
    const B = [{ t: 'title', text: 'RAPORT Z CENTRALNEGO REJESTRU BENEFICJENTÓW RZECZYWISTYCH' },
      { t: 'meta', text: `${client.name}${client.nip ? ` · NIP ${client.nip}` : ''}` },
      { t: 'kv', head: ['Dane zapytania', ''], rows: [['Źródło', 'API CRBR Ministerstwa Finansów (ApiPrzegladoweCRBR)'], ['Kryterium wyszukiwania', `NIP ${client.nip || '—'}`], ['Status odpowiedzi', d.status || '—'], ['Identyfikator wniosku CRBR', full.request_id || '—'], ['Data i czas złożenia wniosku', fmtDT(d.requestedAt)], ['Data i czas udostępnienia informacji', fmtDT(d.providedAt)]] }];
    for (const co of d.companies || []) {
      B.push({ t: 'h', text: `${co.name}` });
      B.push({ t: 'kv', head: ['Podmiot', ''], rows: [['NIP / KRS', `${co.nip || '—'} / ${co.krs || '—'}`], ['Forma', co.form || '—'], ['Adres', co.address || '—'], ['Zgłoszenie prezentowane od', co.from || '—'], ['Numer referencyjny zgłoszenia', co.ref || '—'], ['Rozbieżności zgłoszone w CRBR', (co.discrepancies || []).join('; ') || 'brak']] });
      B.push({ t: 'table', head: ['Beneficjent rzeczywisty', 'PESEL / data ur.', 'Obywatelstwo / kraj zamieszkania', 'Uprawnienia'], rows: (co.beneficiaries || []).map(b => [fullName(b), b.pesel || b.birth || '—', [b.citizenship, b.residence].filter(Boolean).join(' / ') || '—', (b.shares || []).map(s => `${s.type ? s.type + ': ' : ''}${s.kind} ${s.qty} ${s.unit}${s.privilege ? ` (${s.privilege})` : ''}`.trim()).join('; ') || '—']) });
      if ((co.reporters || []).length) B.push({ t: 'table', head: ['Zgłaszający / reprezentant', 'Funkcja'], rows: co.reporters.map(r => [fullName(r), r.role || '—']) });
    }
    if (!(d.companies || []).length) B.push({ t: 'p', text: full.summary || 'Brak informacji w CRBR.' });
    B.push({ t: 'h', text: 'Potwierdzenie przeprowadzenia weryfikacji' });
    B.push({ t: 'kv', head: ['Weryfikacja', ''], rows: [['Weryfikację przeprowadził(a)', who(full.checked_by)], ['Data i godzina weryfikacji', fmtDT(full.checked_at)], ['Wynik', full.summary || '—'], ['Skrót SHA-256 odpowiedzi CRBR', full.sha256 || '—']] });
    B.push({ t: 'small', text: 'Raport wygenerowano automatycznie na podstawie odpowiedzi usługi API CRBR Ministerstwa Finansów. Pełna odpowiedź (XML) przechowywana jest w rejestrze weryfikacji AML aplikacji; skrót SHA-256 pozwala wykazać, że nie była zmieniana.' });
    B.push({ t: 'sign', left: { label: 'Data i godzina wydruku', lines: [fmtDT(new Date().toISOString())] }, right: { label: 'Podpis osoby weryfikującej', lines: [who(full.checked_by)] } });
    printHtml(printableHtml(B, `CRBR_${(client.name || '').replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 40)}_${(full.checked_at || '').slice(0, 10)}`, location.origin + brandOf(module).logo, brandOf(module)));
  }
  function pepFormPdf() {
    const firm = brandOf(module).firmName;
    const B = [{ t: 'title', text: 'OŚWIADCZENIE O ZAJMOWANIU EKSPONOWANEGO STANOWISKA POLITYCZNEGO (PEP)' },
      { t: 'meta', text: `dla ${firm}` },
      { t: 'p', text: 'Imię i nazwisko: ……………………………………………………………   PESEL / data urodzenia: ……………………………' },
      { t: 'p', text: `Działając w imieniu własnym / jako reprezentant: ${client.name || '……………………………………'}${client.nip ? ` (NIP ${client.nip})` : ''}` },
      { t: 'p', text: 'Oświadczam, że (zaznaczyć właściwe):' },
      { t: 'pkt', n: '☐', text: 'NIE JESTEM osobą zajmującą eksponowane stanowisko polityczne, członkiem rodziny takiej osoby ani osobą znaną jako jej bliski współpracownik.' },
      { t: 'pkt', n: '☐', text: 'JESTEM osobą zajmującą eksponowane stanowisko polityczne – stanowisko: …………………………………………………………' },
      { t: 'pkt', n: '☐', text: 'JESTEM członkiem rodziny osoby zajmującej eksponowane stanowisko polityczne – imię i nazwisko, stanowisko, pokrewieństwo: ……………………………………' },
      { t: 'pkt', n: '☐', text: 'JESTEM osobą znaną jako bliski współpracownik osoby zajmującej eksponowane stanowisko polityczne – imię i nazwisko, stanowisko, rodzaj powiązań: ……………………………' },
      { t: 'p', text: 'W przypadku odpowiedzi twierdzącej: źródło pochodzenia majątku i środków: …………………………………………………………………………………' },
      { t: 'p', text: 'Zobowiązuję się niezwłocznie poinformować o zmianie danych objętych oświadczeniem. Jestem świadomy(-a) odpowiedzialności karnej za złożenie fałszywego oświadczenia.' },
      { t: 'small', text: 'Definicje osób zajmujących eksponowane stanowiska polityczne, członków ich rodzin i bliskich współpracowników – zgodnie z ustawą z dnia 1 marca 2018 r. o przeciwdziałaniu praniu pieniędzy oraz finansowaniu terroryzmu.' },
      { t: 'sign', left: { label: 'Miejscowość i data', lines: [''] }, right: { label: 'Podpis składającego oświadczenie', lines: [''] } }];
    printHtml(printableHtml(B, `Oswiadczenie_PEP_${(client.name || '').replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 40)}`, location.origin + brandOf(module).logo, brandOf(module)));
  }
  async function cardPdf() {
    const { data: all } = await sb.from('aml_checks').select('*').eq('case_id', kase.id).order('checked_at');
    const k = kase, last = kk => [...(all || [])].reverse().find(c => c.kind === kk);
    const crbr = last('crbr')?.data?.companies?.[0];
    const B = [{ t: 'title', text: 'KARTA WERYFIKACJI AML KLIENTA' }, { t: 'meta', text: `${client.name}${client.nip ? ` · NIP ${client.nip}` : ''} · stan na ${fmtDT(new Date().toISOString())}` },
      { t: 'kv', head: ['Podsumowanie', ''], rows: [['Status', AML_STATUS[k.status]?.label || k.status], ['Poziom ryzyka', RISK[k.risk_level] || '—'], ['Punkty / uzasadnienie', `${k.risk_score ?? '—'}${k.risk_note ? ' – ' + k.risk_note : ''}`], ['Status PEP', `${k.pep}${k.pep_statement_at ? ` (oświadczenie z ${fmtD(k.pep_statement_at)})` : ''}`], ['Weryfikacja tożsamości', k.id_verified || '—'], ['Zatwierdzono', k.verified_at ? `${fmtDT(k.verified_at)} – ${who(k.verified_by)}` : '—'], ['Następny przegląd', fmtD(k.next_review)]] }];
    if (crbr) B.push({ t: 'table', head: ['Beneficjent rzeczywisty (CRBR)', 'Obywatelstwo', 'Uprawnienia'], rows: (crbr.beneficiaries || []).map(b => [fullName(b), b.citizenship || '—', (b.shares || []).map(s => `${s.kind} ${s.qty} ${s.unit}`.trim()).join('; ') || '—']) });
    const r = last('ryzyko');
    if (r?.data?.answers) B.push({ t: 'table', head: ['Czynnik ryzyka', 'Dotyczy'], rows: RISK_Q.map(q => [q.q, r.data.answers[q.k] ? 'TAK' : 'nie']) });
    B.push({ t: 'h', text: 'Rejestr sprawdzeń' });
    B.push({ t: 'table', head: ['Data i godzina', 'Sprawdzenie', 'Wynik', 'Osoba'], rows: (all || []).map(c => [fmtDT(c.checked_at), KIND[c.kind] || c.kind, { text: c.summary || c.result, sub: c.sha256 ? `SHA-256: ${c.sha256}` : (c.request_id ? `Id: ${c.request_id}` : '') }, who(c.checked_by)]) });
    B.push({ t: 'small', text: 'Dokumentację przechowuje się przez okres wymagany przepisami o przeciwdziałaniu praniu pieniędzy oraz finansowaniu terroryzmu.' });
    B.push({ t: 'sign', left: { label: 'Sporządził(a)', lines: [state.me.full_name] }, right: { label: 'Zatwierdził(a)', lines: [k.verified_by ? who(k.verified_by) : ''] } });
    printHtml(printableHtml(B, `Karta_AML_${(client.name || '').replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 40)}`, location.origin + brandOf(module).logo, brandOf(module)));
  }

  load();
  return box;
}

// ---------------- lista AML (kampania dla wszystkich klientów) ----------------
export async function renderAml(main, module) {
  const isM2 = module === 'm2';
  const [{ data: clients, error: e1 }, { data: cases, error: e2 }] = await Promise.all([
    isM2 ? sb.from('m2_clients').select('id,name,nip,status,kind').order('name') : sb.from('clients').select('id,name,nip,status,legal_form').order('name'),
    sb.from('aml_cases').select('*').eq('module', module),
  ]);
  if (e1) throw e1;
  if (e2) { main.replaceChildren(h('div', { class: 'page-head' }, h('h1', {}, 'Weryfikacja AML')), h('p', { class: 'hint' }, 'Moduł AML będzie dostępny po aktualizacji bazy danych (skrypt 019).')); return; }
  const byClient = new Map((cases || []).map(c => [isM2 ? c.m2_client_id : c.client_id, c]));
  const active = (clients || []).filter(c => c.status !== 'zakonczony' && c.status !== 'zakończony' && c.status !== 'nieaktywny');
  const today = new Date().toISOString().slice(0, 10), soon = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const stateOf = c => byClient.get(c.id)?.status || 'do_uzupelnienia';
  const due = c => { const k = byClient.get(c.id); return k?.next_review && k.next_review <= soon; };
  let f = { q: '', st: '' };
  const tbody = h('tbody');
  const base = isM2 ? '#/doradztwo/klient/' : '#/klient/';
  const draw = () => {
    document.querySelectorAll('.aml-tiles [data-st]').forEach(b => { const on = b.dataset.st === f.st; b.classList.toggle('on', on); b.classList.toggle('dark', on); b.setAttribute('aria-pressed', String(on)); });
    const rows = active.filter(c => (!f.q || (c.name + ' ' + (c.nip || '')).toLowerCase().includes(f.q.toLowerCase())) && (!f.st || (f.st === 'przeglad' ? due(c) : stateOf(c) === f.st)));
    tbody.replaceChildren(...(rows.length ? rows.map(c => {
      const k = byClient.get(c.id);
      return h('tr', {}, h('td', { 'data-label': 'Klient' }, h('a', { href: base + c.id }, h('b', {}, c.name)), h('div', { class: 'small muted' }, c.nip ? `NIP ${c.nip}` : 'bez NIP')),
        h('td', { 'data-label': 'Status' }, statusPill(stateOf(c))), h('td', { 'data-label': 'Ryzyko' }, k?.risk_level ? RISK[k.risk_level] : '—'),
        h('td', { 'data-label': 'PEP' }, k?.pep || '—'), h('td', { 'data-label': 'Sprawdzono' }, fmtDT(k?.last_auto_at)),
        h('td', { 'data-label': 'Zatwierdzono' }, k?.verified_at ? fmtD(k.verified_at.slice(0, 10)) : '—'),
        h('td', { 'data-label': 'Przegląd' }, k?.next_review ? h('span', { class: k.next_review < today ? 'aml-late' : '' }, fmtD(k.next_review)) : '—'));
    }) : [h('tr', {}, h('td', { colspan: 7, class: 'empty' }, 'Brak klientów dla wybranych filtrów.'))]));
  };
  const cnt = s => active.filter(c => stateOf(c) === s).length;
  const tile = (n, l, st, dark) => h('button', { type: 'button', class: 'card tile tile-btn' + (dark ? ' alert' : '') + (f.st === st ? ' on dark' : ''), 'aria-pressed': String(f.st === st), 'data-st': st, style: { textAlign: 'left', cursor: 'pointer' }, onclick: () => { f.st = f.st === st ? '' : st; sSel.value = f.st; draw(); } }, h('span', { class: 'lbl' }, l), h('span', { class: 'num' }, String(n)));
  const q = h('input', { class: 'input', placeholder: 'Szukaj klienta lub NIP…', oninput: e => { f.q = e.target.value; draw(); } });
  const sSel = h('select', { class: 'select', style: { width: 'auto' }, onchange: e => { f.st = e.target.value; draw(); } }, h('option', { value: '' }, 'Wszystkie statusy'), ...Object.entries(AML_STATUS).map(([k, v]) => h('option', { value: k }, v.label)), h('option', { value: 'przeglad' }, 'Przegląd w 30 dni / zaległy'));
  const prog = h('span', { class: 'small muted' });
  const runAll = h('button', { class: 'btn btn-primary btn-sm', onclick: async () => {
    const todo = active.filter(c => !['zweryfikowany', 'odmowa'].includes(stateOf(c)) && !(byClient.get(c.id)?.last_auto_at && Date.now() - new Date(byClient.get(c.id).last_auto_at) < 7 * 864e5));
    if (!todo.length) return toast('Wszyscy niezweryfikowani klienci byli sprawdzani w ostatnich 7 dniach.');
    if (!confirm(`Sprawdzić automatycznie ${todo.length} klientów (CRBR, KRS, Biała lista VAT, listy sankcyjne)? Potrwa to około ${Math.ceil(todo.length * 4 / 60)} min. Nie zamykaj strony.`)) return;
    runAll.disabled = true; let i = 0, alerts = 0, errs = 0;
    for (const c of todo) {
      i++; prog.textContent = `Sprawdzam ${i}/${todo.length}: ${c.name}…`;
      try { const k = await ensureCase(module, c.id); byClient.set(c.id, k); const r = await runAuto(k.id); if (r.checks.some(x => x.result === 'uwaga')) alerts++; byClient.set(c.id, { ...k, status: r.status, last_auto_at: new Date().toISOString() }); } catch (e) { errs++; console.error(e); }
      if (i % 5 === 0) draw();
    }
    runAll.disabled = false; prog.textContent = `Gotowe: sprawdzono ${i}, wymaga uwagi: ${alerts}${errs ? `, błędy: ${errs}` : ''}.`; draw();
  } }, 'Sprawdź automatycznie wszystkich');
  draw();
  main.replaceChildren(
    h('div', { class: 'page-head', style: isM2 ? { marginTop: '28px' } : null },
      h('div', {}, h('p', { class: 'eyebrow' }, isM2 ? 'Doradztwo podatkowe · M2 TAX' : 'RKDP · Klienci'),
        h('h1', { style: { marginTop: '6px', display: 'flex', alignItems: 'center' } }, 'Weryfikacja AML', infoTip(HELP, 'Procedura AML')),
        h('p', { class: 'sub' }, `${isM2 ? 'M2 TAX Doradcy Podatkowi' : 'RKDP spółka doradztwa podatkowego'} – osobna instytucja obowiązana. Nowi i dotychczasowi klienci.`)),
      h('div', { class: 'ob-actions' }, prog, runAll)),
    h('div', { class: 'tiles aml-tiles' }, tile(cnt('do_uzupelnienia'), 'Do uzupełnienia', 'do_uzupelnienia', cnt('do_uzupelnienia') > 0), tile(cnt('wymaga_uwagi'), 'Wymaga uwagi', 'wymaga_uwagi'), tile(cnt('w_trakcie'), 'W trakcie', 'w_trakcie'), tile(cnt('zweryfikowany'), 'Zweryfikowani', 'zweryfikowany')),
    h('div', { class: 'toolbar' }, q, sSel, h('span', { class: 'small muted' }, `${active.length} klientów · przegląd w 30 dni lub zaległy: ${active.filter(due).length}`)),
    h('div', { class: 'card list-wrap' }, h('table', { class: 'list' }, h('thead', {}, h('tr', {}, ...['Klient', 'Status', 'Ryzyko', 'PEP', 'Ostatnie sprawdzenie', 'Zatwierdzono', 'Następny przegląd'].map(x => h('th', {}, x)))), tbody)));
}

// mała karta na pulpit
export function amlDashCard(module) {
  const box = h('section', { class: 'card section' }, h('div', { class: 'section-head' }, h('h2', {}, 'AML'), h('a', { class: 'small', href: module === 'm2' ? '#/doradztwo/aml' : '#/aml' }, 'Weryfikacja AML →')));
  (async () => {
    const { data, error } = await sb.from('aml_cases').select('status, next_review').eq('module', module);
    if (error) return box.append(h('p', { class: 'hint' }, 'Moduł AML wymaga aktualizacji bazy danych.'));
    const soon = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
    const n = s => data.filter(x => x.status === s).length;
    box.append(h('div', { class: 'aml-grid' },
      h('div', { class: 'aml-row' }, h('span', { class: 'muted small' }, 'Wymaga uwagi'), h('b', { class: n('wymaga_uwagi') ? 'aml-late' : '' }, String(n('wymaga_uwagi')))),
      h('div', { class: 'aml-row' }, h('span', { class: 'muted small' }, 'Zweryfikowani'), h('b', {}, String(n('zweryfikowany')))),
      h('div', { class: 'aml-row' }, h('span', { class: 'muted small' }, 'Przegląd w 30 dni / zaległy'), h('b', {}, String(data.filter(x => x.next_review && x.next_review <= soon).length)))));
  })();
  return box;
}
