// Sprawozdanie finansowe jednostki mikro (e-SF, wzór SFJMIZ(2)) – z JPK_KR_PD bieżącego roku i ubiegłorocznego sprawozdania.
// Kwoty: JPK_KR_PD (salda zamknięcia → rok bieżący, bilans otwarcia → rok poprzedni) + ubiegłoroczny XML z Repozytorium KRS
// albo sprawozdanie zapisane w aplikacji (RZiS roku poprzedniego, teksty). Wszystko można poprawić ręcznie.
// Plik JPK jest czytany tylko w przeglądarce – nie trafia na serwer. Zapisujemy wyłącznie dane sprawozdania.
import { h, icon, toast, fail, infoTip, printHtml } from '../ui.js';
import { sb, state } from '../store.js';
import { dropZone } from './zgloszenia.js';
import { BILANS, RZIS, PID, FORMY, TEKSTY, emptyData, recompute, fromJpk, fromPriorDoc, check, toXml, fmt, num } from '../esf/mikro.js';

const HELP = `Jak przygotować sprawozdanie mikro:
1. Wybierz spółkę i rok obrotowy. Kliknij „Pobierz z KRS” – uzupełni się pełna nazwa, forma prawna i adres siedziby (województwo, powiat, gmina).
2. Wczytaj plik JPK_KR_PD (JPK_CIT – księgi) za ten rok. Bilans wypełni się z sald zamknięcia (rok bieżący) i bilansu otwarcia (rok poprzedni), rachunek zysków i strat z obrotów kont wynikowych – według znaczników kont.
3. Dane porównawcze RZiS i teksty z zeszłego roku: jeśli sprawozdanie za poprzedni rok zrobiliście w aplikacji – wczytają się same. W przeciwnym razie kliknij „Otwórz Repozytorium KRS”, wyszukaj spółkę (numer KRS jest w schowku), pobierz XML sprawozdania za poprzedni rok i przeciągnij go tutaj.
4. Sprawdź kwoty, zasady rachunkowości i informacje uzupełniające – wszystko można edytować. Sumy (aktywa, pasywa, wynik netto) liczą się same.
5. Gdy kontrola nie pokazuje błędów: „Pobierz XML”. Plik podpisuje kierownik jednostki (cały zarząd) i osoba, której powierzono prowadzenie ksiąg – podpisem kwalifikowanym, zaufanym albo osobistym – i składa się go w eKRS razem z uchwałą zatwierdzającą.
Plik JPK zostaje na Twoim komputerze. Zapisujemy tylko dane sprawozdania (kwoty i teksty) – posłużą jako dane porównawcze za rok.`;

const FORM_CODES = [[/z ograniczoną odpowiedzialnością/i, '17'], [/prosta spółka akcyjna/i, 'PA'], [/komandytowo-akcyjna/i, '21'], [/spółka akcyjna/i, '16'], [/komandytowa/i, '20'], [/jawna/i, '18'], [/partnerska/i, '15'], [/fundacja rodzinna/i, 'FR'], [/fundacja/i, '48'], [/stowarzyszenie/i, '55']];
const title = s => String(s || '').toLowerCase().replace(/(^|[\s\-–(/])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
const today = () => new Date().toLocaleDateString('sv-SE');

export async function renderEsf(main, params) {
  const { data: clients, error } = await sb.from('clients').select('id,name,nip,krs,legal_form,status').order('name');
  if (error) throw error;
  const companies = (clients || []).filter(c => c.krs || ['spzoo', 'spolka_akcyjna', 'psa', 'prosta_spolka_akcyjna', 'fundacja_stowarzyszenie'].includes(c.legal_form));
  let clientId = params.get('klient') || '', year = Number(params.get('rok')) || new Date().getFullYear() - 1;
  let d = null, rowId = null, dirty = false, status = 'projekt';

  const body = h('div', { class: 'esf' });
  const saveBtn = h('button', { class: 'btn btn-primary btn-sm', onclick: () => save() }, 'Zapisz');
  const clientSel = h('select', { class: 'select', 'aria-label': 'Spółka', onchange: () => { clientId = clientSel.value; load(); } },
    h('option', { value: '' }, '— wybierz spółkę —'), ...companies.map(c => h('option', { value: c.id, selected: c.id === clientId }, c.name)));
  const ys = []; for (let y = new Date().getFullYear(); y >= new Date().getFullYear() - 6; y--) ys.push(y);
  const yearSel = h('select', { class: 'select', 'aria-label': 'Rok obrotowy', onchange: () => { year = Number(yearSel.value); load(); } }, ...ys.map(y => h('option', { value: y, selected: y === year }, `rok ${y}`)));

  main.replaceChildren(
    h('a', { href: '#/dokumenty', class: 'small', style: { fontWeight: 600, textDecoration: 'none' } }, '← Generowanie dokumentów'),
    h('div', { class: 'page-head', style: { marginTop: '10px' } },
      h('div', {}, h('p', { class: 'eyebrow' }, 'e-Sprawozdanie · wzór SFJMIZ(2)'),
        h('h1', { style: { marginTop: '6px', display: 'flex', alignItems: 'center' } }, 'Sprawozdanie finansowe – jednostka mikro', infoTip(HELP, 'Sprawozdanie finansowe – instrukcja')),
        h('p', { class: 'sub' }, 'Z JPK_KR_PD i ubiegłorocznego sprawozdania z KRS. Plik XML do podpisania i złożenia w eKRS.')),
      h('div', { class: 'esf-pick' }, clientSel, yearSel)),
    body);

  const markDirty = () => { dirty = true; saveBtn.textContent = 'Zapisz *'; };

  async function load() {
    history.replaceState(null, '', `#/sprawozdanie-finansowe?${new URLSearchParams({ ...(clientId ? { klient: clientId } : {}), rok: year })}`);
    if (!clientId) { body.replaceChildren(h('div', { class: 'card section' }, h('p', { class: 'hint' }, companies.length ? 'Wybierz spółkę i rok obrotowy.' : 'Brak spółek w bazie klientów (forma prawna sp. z o.o. / S.A. albo wpisany numer KRS).'))); return; }
    body.replaceChildren(h('div', { class: 'spinner' }, 'Wczytywanie…'));
    const c = companies.find(x => x.id === clientId);
    const [{ data: cur }, { data: prev }] = await Promise.all([
      sb.from('fin_statements').select('*').eq('client_id', clientId).eq('year', year).eq('wzor', 'mikro').maybeSingle(),
      sb.from('fin_statements').select('data,year').eq('client_id', clientId).eq('year', year - 1).eq('wzor', 'mikro').maybeSingle(),
    ]);
    rowId = cur?.id || null; status = cur?.status || 'projekt';
    d = cur?.data ? { ...emptyData(year), ...cur.data } : emptyData(year);
    if (!cur) {
      Object.assign(d.firma, { nazwa: c?.name || '', nip: (c?.nip || '').replace(/\D/g, ''), krs: (c?.krs || '').replace(/\D/g, '').padStart(c?.krs ? 10 : 0, '0') });
      if (prev?.data) usePrevApp(prev.data);
    }
    dirty = false; saveBtn.textContent = 'Zapisz';
    draw();
  }
  // poprzedni rok zapisany w aplikacji: kwoty „rok bieżący” tamtego sprawozdania → „rok poprzedni”
  function usePrevApp(p) {
    for (const [k] of BILANS) if (p.bil?.[k]) d.bil[k].b = num(p.bil[k].a);
    for (const [k] of RZIS) if (p.rzis?.[k]) d.rzis[k].b = num(p.rzis[k].a);
    for (const k of ['p4', 'p6a', 'p6b', 'p6c', 'p6d']) if (p[k]) d[k] = p[k];
    if (p.info?.length) d.info = [...p.info];
    if (p.firma) for (const k of ['woj', 'powiat', 'gmina', 'ulica', 'nrDomu', 'nrLokalu', 'miejscowosc', 'kod', 'forma']) if (p.firma[k] && !d.firma[k]) d.firma[k] = p.firma[k];
    if (p.cit?.on) { d.cit.on = true; for (const [k] of PID) if (p.cit[k]) d.cit[k].b = num(p.cit[k].a); }
    d.zrodla.poprzednie = { wzor: 'aplikacja', rok: p.year || year - 1, kiedy: new Date().toISOString() };
  }

  async function save(newStatus) {
    if (!d) return;
    recompute(d);
    const row = { client_id: clientId, year, wzor: 'mikro', data: d, status: newStatus || status };
    const q = rowId ? sb.from('fin_statements').update(row).eq('id', rowId).select('id').single() : sb.from('fin_statements').insert(row).select('id').single();
    const { data, error } = await q;
    if (error) return fail(error);
    rowId = data.id; status = row.status; dirty = false; saveBtn.textContent = 'Zapisz';
    toast('Zapisano sprawozdanie');
  }

  // ---------- źródła danych ----------
  async function pullKrs(btn) {
    const krs = d.firma.krs.replace(/\D/g, '');
    if (!krs) return toast('Wpisz numer KRS', true);
    btn.disabled = true;
    try {
      const { data: r, error } = await sb.functions.invoke('nip-lookup', { body: { krs } });
      if (error) throw error; if (r?.error) throw new Error(r.error);
      if (!r?.found) return toast('Nie znaleziono podmiotu o tym numerze KRS', true);
      const s = r.seat || {}, a = r.address || {};
      Object.assign(d.firma, {
        nazwa: r.name || d.firma.nazwa, krs: r.krs || krs, nip: (r.nip || d.firma.nip || '').replace(/\D/g, ''),
        forma: (FORM_CODES.find(([re]) => re.test(r.legalForm || '')) || [])[1] || d.firma.forma,
        woj: title(s.wojewodztwo), powiat: title(s.powiat), gmina: title(s.gmina),
        miejscowosc: title(a.miejscowosc || s.miejscowosc), ulica: title(String(a.ulica || '').replace(/^(UL\.|ULICA)\s*/i, '')),
        nrDomu: a.nrDomu || '', nrLokalu: a.nrLokalu || '', kod: a.kodPocztowy || '',
      });
      const f = (r.filings || [])[0];
      toast(f ? `Pobrano z KRS. Ostatnie sprawozdanie w KRS: ${f.period || ''}` : 'Pobrano dane z KRS');
      markDirty(); draw();
    } catch (e) { fail(e, 'Nie udało się pobrać danych z KRS'); } finally { btn.disabled = false; }
  }
  async function loadJpk(file) {
    try {
      const [{ parseJpk, readText }, fin] = await Promise.all([import('./jpk.js'), import('./jpk-fin.js')]);
      const m = parseJpk(await readText(file), file.name);
      if (m.kind !== 'kr_pd') return toast('To nie jest plik JPK_KR_PD (księgi rachunkowe).', true);
      const prevB = BILANS.map(([k]) => d.bil[k].b);
      const r = fromJpk(d, m, fin);
      // gdy dane porównawcze bilansu już są (z poprzedniego sprawozdania) – zostaw je, różnice pokaż
      if (d.zrodla.poprzednie) BILANS.forEach(([k], i) => { if (prevB[i]) { if (Math.abs(prevB[i] - d.bil[k].b) >= 0.01) jpkDiff.push(k); d.bil[k].b = prevB[i]; } });
      year = d.year; yearSel.value = String(year);
      toast(`Wczytano JPK_KR_PD (${r.variant === 'RK' ? 'RZiS kalkulacyjny – koszty bez podziału na rodzaje' : 'RZiS porównawczy'})`);
      markDirty(); draw();
    } catch (e) { fail(e, 'Nie udało się odczytać pliku JPK'); }
  }
  const jpkDiff = [];
  async function loadPrior(file) {
    try {
      if (/\.zip$/i.test(file.name)) return toast('To archiwum ZIP – rozpakuj je i przeciągnij plik .xml sprawozdania.', true);
      const text = await file.text();
      const doc = new DOMParser().parseFromString(text, 'application/xml');
      if (doc.getElementsByTagName('parsererror').length) return toast('To nie jest poprawny plik XML.', true);
      const r = fromPriorDoc(d, doc);
      if (!r.bil && !r.rzis) return toast('Nie znalazłem w pliku bilansu ani RZiS – czy to e-sprawozdanie finansowe?', true);
      if (r.wzor && !/Mikro/i.test(r.wzor) && r.wzor !== 'Bilans') toast(`Ubiegłoroczne sprawozdanie ma inny wzór (${r.wzor}) – przeniesiono pozycje o tych samych nazwach, sprawdź rok poprzedni.`, true);
      else toast(`Wczytano dane porównawcze: bilans ${r.bil} poz., RZiS ${r.rzis} poz.${r.teksty ? ', teksty' : ''}`);
      markDirty(); draw();
    } catch (e) { fail(e, 'Nie udało się odczytać sprawozdania'); }
  }
  const openRdf = () => {
    const krs = d.firma.krs.replace(/\D/g, '');
    if (krs) navigator.clipboard?.writeText(krs).catch(() => {});
    window.open('https://rdf-przegladarka.ms.gov.pl/', '_blank', 'noopener');
    toast(krs ? `Numer KRS ${krs} skopiowany – wklej go w wyszukiwarce, pobierz XML sprawozdania za ${year - 1} i przeciągnij tutaj.` : 'Wyszukaj spółkę, pobierz XML sprawozdania za poprzedni rok i przeciągnij go tutaj.');
  };

  // ---------- pola ----------
  const txt = (obj, key, label, o = {}) => {
    const el = o.area ? h('textarea', { class: 'input', rows: o.rows || 3 }, obj[key] ?? '') : h('input', { class: 'input', type: o.type || 'text', value: obj[key] ?? '', placeholder: o.ph || '', maxlength: o.max || null });
    el.addEventListener('input', () => { obj[key] = el.value; markDirty(); if (o.live) refresh(); });
    return h('label', { class: 'esf-f' + (o.wide ? ' wide' : '') }, h('span', {}, label), el);
  };
  const sel = (obj, key, label, opts, o = {}) => {
    const el = h('select', { class: 'select' }, ...Object.entries(opts).map(([k, v]) => h('option', { value: k, selected: String(obj[key]) === k }, v)));
    el.addEventListener('change', () => { obj[key] = o.num ? Number(el.value) : el.value; markDirty(); if (o.redraw) draw(); else refresh(); });
    return h('label', { class: 'esf-f' + (o.wide ? ' wide' : '') }, h('span', {}, label), el);
  };
  const money = (obj, k) => {
    const el = h('input', { class: 'input esf-n', inputmode: 'decimal', value: fmt(obj[k]), 'aria-label': k === 'a' ? 'rok bieżący' : 'rok poprzedni' });
    el.addEventListener('focus', () => { el.value = obj[k] ? String(obj[k]).replace('.', ',') : ''; el.select(); });
    el.addEventListener('input', () => { obj[k] = num(el.value); markDirty(); refresh(); });
    el.addEventListener('blur', () => { el.value = fmt(obj[k]); });
    return el;
  };
  const sumCell = (obj, k) => h('span', { class: 'esf-sum', 'data-k': k }, fmt(obj[k]));
  const sums = [];
  const checksBox = h('div', { class: 'esf-checks' });

  function table(rows, src, auto) {
    return h('div', { class: 'list-wrap' }, h('table', { class: 'list esf-t' },
      h('thead', {}, h('tr', {}, h('th', { class: 'l' }, ''), h('th', { class: 'l' }, 'Wyszczególnienie'), h('th', {}, `Rok bieżący (${year})`), h('th', {}, `Rok poprzedni (${year - 1})`))),
      h('tbody', {}, ...rows.map(([k, mark, name, depth]) => {
        const isAuto = auto.includes(k), v = src[k];
        const cells = ['a', 'b'].map(x => h('td', { class: 'r' }, isAuto ? (sums.push([v, x]), sumCell(v, x)) : money(v, x)));
        return h('tr', { class: `esf-d${depth}` + (isAuto ? ' esf-auto' : '') }, h('td', { class: 'l esf-mark' }, mark), h('td', { class: 'l' }, name), ...cells);
      }))));
  }

  function refresh() {
    recompute(d);
    main.querySelectorAll('.esf-sum').forEach((el, i) => { const [v, x] = sums[i] || []; if (v) el.textContent = fmt(v[x]); });
    const { err, warn } = check(d);
    checksBox.replaceChildren(
      err.length || warn.length ? null : h('p', { class: 'esf-ok' }, '✓ Kontrola bez uwag – można pobrać XML.'),
      ...err.map(x => h('p', { class: 'esf-err' }, '✕ ', x)), ...warn.map(x => h('p', { class: 'esf-warn' }, '! ', x)),
      jpkDiff.length ? h('p', { class: 'esf-warn' }, `! Bilans otwarcia w JPK różni się od ubiegłorocznego sprawozdania w pozycjach: ${jpkDiff.map(k => BILANS.find(r => r[0] === k)?.[2]).join(', ')} – zostawiono dane ze sprawozdania.`) : null);
    xmlBtn.disabled = !!err.length;
  }

  const xmlBtn = h('button', { class: 'btn btn-primary btn-sm', onclick: () => downloadXml() }, icon('download'), 'Pobierz XML');
  function downloadXml() {
    const { err } = check(recompute(d));
    if (err.length) return toast('Najpierw popraw błędy z kontroli.', true);
    const blob = new Blob([toXml(d)], { type: 'application/xml' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `SF_mikro_${d.firma.nip}_${year}.xml` }); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    if (status === 'projekt') save('gotowe'); else if (dirty) save();
  }

  function draw() {
    sums.length = 0;
    const f = d.firma;
    const krsBtn = h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: e => pullKrs(e.currentTarget) }, icon('download'), 'Pobierz z KRS');
    const src = h('section', { class: 'card section' },
      h('div', { class: 'section-head' }, h('h2', {}, '1. Źródła danych')),
      h('div', { class: 'esf-src' },
        h('div', {}, h('b', {}, `JPK_KR_PD za ${year}`), h('p', { class: 'small muted' }, d.zrodla.jpk ? `Wczytano: ${d.zrodla.jpk.plik} · ${new Date(d.zrodla.jpk.kiedy).toLocaleString('pl-PL')}` : 'Salda i obroty kont ze znacznikami – bilans i RZiS wypełnią się same.'),
          dropZone(fs => fs[0] && loadJpk(fs[0]), 'plik zostaje na Twoim komputerze')),
        h('div', {}, h('b', {}, `Sprawozdanie za ${year - 1} (dane porównawcze)`),
          h('p', { class: 'small muted' }, d.zrodla.poprzednie ? (d.zrodla.poprzednie.wzor === 'aplikacja' ? `Wczytano ze sprawozdania zapisanego w aplikacji.` : `Wczytano z pliku XML (${d.zrodla.poprzednie.wzor || 'e-sprawozdanie'}).`) : 'XML z Repozytorium Dokumentów Finansowych KRS.'),
          h('div', { class: 'row-btns', style: { marginBottom: '8px' } }, h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: openRdf }, 'Otwórz Repozytorium KRS ↗')),
          dropZone(fs => fs[0] && loadPrior(fs[0]), 'plik .xml pobrany z KRS'))));

    const firm = h('section', { class: 'card section' },
      h('div', { class: 'section-head' }, h('h2', {}, '2. Jednostka i okres'), krsBtn),
      h('div', { class: 'esf-grid' },
        txt(f, 'nazwa', 'Firma (pełna nazwa)', { wide: true, live: true }), txt(f, 'krs', 'Numer KRS', { live: true, max: 10 }), txt(f, 'nip', 'NIP', { live: true, max: 10 }),
        sel(f, 'forma', 'Forma prawna', Object.fromEntries(Object.entries(FORMY).map(([k, v]) => [k, v]))),
        txt(f, 'woj', 'Województwo', { live: true }), txt(f, 'powiat', 'Powiat', { live: true }), txt(f, 'gmina', 'Gmina', { live: true }),
        txt(f, 'miejscowosc', 'Miejscowość', { live: true }), txt(f, 'ulica', 'Ulica'), txt(f, 'nrDomu', 'Nr domu', { live: true }), txt(f, 'nrLokalu', 'Nr lokalu'), txt(f, 'kod', 'Kod pocztowy', { live: true }),
        txt(d, 'od', 'Okres od', { type: 'date', live: true }), txt(d, 'do', 'Okres do', { type: 'date', live: true }), txt(d, 'sporzadzenie', 'Data sporządzenia', { type: 'date', live: true }),
        (() => { const el = h('input', { class: 'input', inputmode: 'decimal', value: String(d.p7).replace('.', ',') }); el.addEventListener('input', () => { d.p7 = num(el.value); markDirty(); }); return h('label', { class: 'esf-f' }, h('span', {}, 'Średnie zatrudnienie (etaty)'), el); })(),
        sel(d, 'p8', 'Badanie przez biegłego rewidenta', { 2: 'nie podlega', 1: 'podlega' }, { num: true })),
      d.sporzadzenie ? null : h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { d.sporzadzenie = today(); markDirty(); draw(); } }, 'Data sporządzenia: dziś'));

    const bil = h('section', { class: 'card section' }, h('div', { class: 'section-head' }, h('h2', {}, '3. Bilans'), h('span', { class: 'small muted' }, 'sumy liczą się same')),
      table(BILANS, d.bil, ['Aktywa', 'Pasywa']));
    const rz = h('section', { class: 'card section' }, h('div', { class: 'section-head' }, h('h2', {}, '4. Rachunek zysków i strat'), h('span', { class: 'small muted' }, 'wynik netto liczy się sam')),
      table(RZIS, d.rzis, ['F']));

    const ogolne = h('section', { class: 'card section' }, h('div', { class: 'section-head' }, h('h2', {}, '5. Informacje ogólne i zasady rachunkowości')),
      h('div', { class: 'esf-grid' },
        sel(d, 'p5a', 'Kontynuacja działalności', { 1: 'sprawozdanie sporządzone przy założeniu kontynuacji', 2: 'bez założenia kontynuacji' }, { num: true, wide: true }),
        sel(d, 'p5b', 'Zagrożenie kontynuacji', { 1: 'brak okoliczności zagrażających', 2: 'wystąpiły okoliczności zagrażające' }, { num: true, wide: true, redraw: true }),
        d.p5b === 2 ? txt(d, 'p5c', 'Opis okoliczności zagrażających kontynuacji', { area: true, wide: true, live: true }) : null,
        (() => { const cb = h('input', { type: 'checkbox', checked: d.p2.ograniczony }); cb.addEventListener('change', () => { d.p2.ograniczony = cb.checked; markDirty(); draw(); });
          return h('label', { class: 'check wide' }, cb, 'Czas trwania działalności jest ograniczony'); })(),
        d.p2.ograniczony ? txt(d.p2, 'od', 'Działalność od', { type: 'date', live: true }) : null, d.p2.ograniczony ? txt(d.p2, 'do', 'Działalność do (puste – nieokreślony)', { type: 'date' }) : null,
        txt(d, 'p4', 'Zasady rachunkowości dla jednostek mikro i wybrane uproszczenia (P_4)', { area: true, rows: 4, wide: true, live: true }),
        txt(d, 'p6a', 'Metody wyceny aktywów i pasywów, w tym amortyzacji (P_6A)', { area: true, rows: 4, wide: true, live: true }),
        txt(d, 'p6b', 'Ustalenie wyniku finansowego (P_6B)', { area: true, wide: true, live: true }),
        txt(d, 'p6c', 'Sposób sporządzenia sprawozdania (P_6C)', { area: true, rows: 2, wide: true, live: true }),
        txt(d, 'p6d', 'Pozostałe zasady (P_6D, opcjonalnie)', { area: true, rows: 2, wide: true })),
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { if (!confirm('Przywrócić domyślne teksty zasad rachunkowości?')) return; Object.assign(d, { p4: TEKSTY.p4, p6a: TEKSTY.p6a, p6b: TEKSTY.p6b, p6c: TEKSTY.p6c }); markDirty(); draw(); } }, 'Przywróć teksty domyślne'));

    const infoList = h('div', { class: 'esf-info' }, ...d.info.map((t, i) => {
      const ta = h('textarea', { class: 'input', rows: 2 }, t);
      ta.addEventListener('input', () => { d.info[i] = ta.value; markDirty(); refresh(); });
      return h('div', { class: 'esf-info-i' }, h('span', { class: 'esf-mark' }, `${i + 1}.`), ta,
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Usuń punkt', onclick: () => { d.info.splice(i, 1); markDirty(); draw(); } }, '×'));
    }));
    const info = h('section', { class: 'card section' }, h('div', { class: 'section-head' }, h('h2', {}, '6. Informacje uzupełniające do bilansu'),
      h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: () => { d.info.push(''); markDirty(); draw(); } }, icon('plus'), 'Dodaj punkt')),
      h('p', { class: 'hint' }, 'Dla jednostki mikro: zobowiązania pozabilansowe, zaliczki i kredyty dla członków organów, udziały własne. Każdy punkt to osobna pozycja w pliku XML.'),
      infoList);

    const citCb = h('input', { type: 'checkbox', checked: d.cit.on });
    citCb.addEventListener('change', () => {
      d.cit.on = citCb.checked;
      if (d.cit.on && !d.cit.P_ID_1.a) { recompute(d); d.cit.P_ID_1.a = num(d.rzis.F.a + d.rzis.E.a); d.cit.P_ID_1.b = num(d.rzis.F.b + d.rzis.E.b); d.cit.P_ID_11.a = d.rzis.E.a; d.cit.P_ID_11.b = d.rzis.E.b; }
      markDirty(); draw();
    });
    const cit = h('section', { class: 'card section' }, h('div', { class: 'section-head' }, h('h2', {}, '7. Rozliczenie podatku dochodowego'), h('label', { class: 'check' }, citCb, 'dołącz do sprawozdania')),
      h('p', { class: 'hint' }, 'Rozliczenie różnicy między podstawą opodatkowania a wynikiem brutto – wypełniają jednostki zobowiązane. Zysk brutto i podatek podpowiadają się z RZiS.'),
      d.cit.on ? table(PID.map(([k, m, n]) => [k, m, n, 1]), d.cit, []) : null);

    const actions = h('section', { class: 'card section esf-actions' },
      h('div', { class: 'section-head' }, h('h2', {}, '8. Kontrola i plik'), h('span', { class: 'badge' }, { projekt: 'projekt', gotowe: 'XML pobrany', zlozone: 'złożone w KRS' }[status])),
      checksBox,
      h('div', { class: 'row-btns' }, saveBtn, xmlBtn,
        h('button', { class: 'btn btn-outline btn-sm', onclick: () => printHtml(previewHtml(d, year), `Sprawozdanie ${d.firma.nazwa} ${year}`) }, 'Podgląd / PDF'),
        status !== 'zlozone' ? h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { if (confirm('Oznaczyć sprawozdanie jako złożone w KRS?')) save('zlozone').then(draw); } }, 'Oznacz jako złożone') : null),
      h('p', { class: 'hint', style: { marginTop: '10px' } }, 'Plik XML podpisują wszyscy członkowie zarządu i osoba prowadząca księgi (podpis kwalifikowany, zaufany albo osobisty, np. w podpis.gov.pl lub eKRS). Złożenie: eKRS → „Złóż dokumenty finansowe” – razem z uchwałą zatwierdzającą i o podziale zysku / pokryciu straty.'));

    body.replaceChildren(src, firm, bil, rz, ogolne, info, cit, actions);
    refresh();
  }

  window.addEventListener('beforeunload', beforeUnload);
  function beforeUnload(e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } }
  await load();
  return () => window.removeEventListener('beforeunload', beforeUnload);
}

// ---------- podgląd do wydruku / PDF (dokument spółki – bez papieru RKDP) ----------
function previewHtml(d, year) {
  recompute(d);
  const e = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f = d.firma;
  const rows = (def, src) => def.map(([k, m, n, dep]) => `<tr class="d${dep}"><td class="m">${e(m)}</td><td>${e(n)}</td><td class="r">${fmt(src[k].a)}</td><td class="r">${fmt(src[k].b)}</td></tr>`).join('');
  const tbl = (def, src) => `<table><thead><tr><th></th><th style="text-align:left">Wyszczególnienie</th><th>${year}</th><th>${year - 1}</th></tr></thead><tbody>${rows(def, src)}</tbody></table>`;
  const adres = [[f.ulica, [f.nrDomu, f.nrLokalu].filter(Boolean).join('/')].filter(Boolean).join(' '), `${f.kod} ${f.miejscowosc}`].filter(Boolean).join(', ');
  const p = t => String(t || '').split(/\n+/).map(x => `<p>${e(x)}</p>`).join('');
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Sprawozdanie finansowe ${e(f.nazwa)} ${year}</title>
<style>@page{size:A4;margin:16mm 15mm}body{font-family:Arial,sans-serif;font-size:10.5px;color:#111;line-height:1.45}
h1{font-size:16px;text-align:center;margin:0 0 4px}h2{font-size:12.5px;margin:18px 0 6px;border-bottom:1px solid #999;padding-bottom:3px}.c{text-align:center}
table{width:100%;border-collapse:collapse;margin-top:4px}th,td{border:1px solid #bbb;padding:4px 6px;vertical-align:top}th{background:#f0f0f0}.r{text-align:right;white-space:nowrap;width:110px}.m{width:28px;text-align:center}
tr.d0 td{font-weight:700;background:#f7f7f7}tr.d1 td{font-weight:600}tr.d2 td:nth-child(2){padding-left:18px}p{margin:3px 0}
.sig{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:40px}.sig div{border-top:1px dotted #333;padding-top:4px;text-align:center;font-size:9.5px}</style></head><body>
<h1>Sprawozdanie finansowe za rok obrotowy ${e(d.od)} – ${e(d.do)}</h1><p class="c">${e(f.nazwa)} · NIP ${e(f.nip)}${f.krs ? ' · KRS ' + e(f.krs) : ''}<br>sporządzone według załącznika nr 4 do ustawy o rachunkowości (jednostka mikro) · w złotych</p>
<h2>Informacje ogólne</h2>
<p><b>Firma i siedziba:</b> ${e(f.nazwa)}, ${e(adres)} (gm. ${e(f.gmina)}, pow. ${e(f.powiat)}, woj. ${e(f.woj)})</p>
<p><b>Forma prawna:</b> ${e(FORMY[f.forma] || f.forma)}</p>
<p><b>Okres sprawozdania:</b> ${e(d.od)} – ${e(d.do)}${d.p2.ograniczony ? ` · <b>czas trwania działalności:</b> ${e(d.p2.od)} – ${e(d.p2.do || 'nieokreślony')}` : ''}</p>
<p><b>Kontynuacja działalności:</b> ${d.p5a === 1 ? 'sprawozdanie sporządzono przy założeniu kontynuowania działalności' : 'sprawozdanie sporządzono bez założenia kontynuowania działalności'}; ${d.p5b === 1 ? 'brak okoliczności wskazujących na zagrożenie kontynuacji.' : 'wystąpiły okoliczności wskazujące na zagrożenie: ' + e(d.p5c)}</p>
<p><b>Średnie zatrudnienie:</b> ${String(d.p7).replace('.', ',')} etatu · <b>badanie biegłego rewidenta:</b> ${d.p8 === 1 ? 'tak' : 'nie'}</p>
<p><b>Zasady rachunkowości i uproszczenia:</b></p>${p(d.p4)}
<p><b>Metody wyceny aktywów i pasywów:</b></p>${p(d.p6a)}<p><b>Ustalenie wyniku finansowego:</b></p>${p(d.p6b)}<p><b>Sposób sporządzenia sprawozdania:</b></p>${p(d.p6c)}${d.p6d ? '<p><b>Pozostałe:</b></p>' + p(d.p6d) : ''}
<h2>Bilans na dzień ${e(d.do)}</h2>${tbl(BILANS, d.bil)}
<h2>Rachunek zysków i strat za okres ${e(d.od)} – ${e(d.do)}</h2>${tbl(RZIS, d.rzis)}
<h2>Informacje uzupełniające do bilansu</h2><ol>${d.info.filter(x => x.trim()).map(x => `<li>${e(x)}</li>`).join('')}</ol>
${d.cit.on ? `<h2>Rozliczenie różnicy pomiędzy podstawą opodatkowania a wynikiem brutto</h2>${tbl(PID.map(([k, m, n]) => [k, m, n, 1]), d.cit)}` : ''}
<p style="margin-top:18px">Data sporządzenia: ${e(d.sporzadzenie)}</p>
<div class="sig"><div>osoba, której powierzono prowadzenie ksiąg rachunkowych</div><div>kierownik jednostki (członkowie zarządu)</div></div>
</body></html>`;
}
