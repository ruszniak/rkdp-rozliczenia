// Oferty na usługi – lista i edytor (RKDP: zakładka Klienci → Oferty, M2 TAX: Zlecenia → Oferty).
import { h, toast, fail, icon, infoTip, printHtml } from '../ui.js';
import { sb, state, isAdmin } from '../store.js';
import { fetchAll } from './rozliczenia.js';
import { lookupNip, validNip } from '../nip.js';
import { OFFER_BRANDS, PEOPLE, BOOK_FORMS, PARTNER_FEATURES, offerDefaults, serviceDefaults, offerHtml, autoTitle, autoIntro, monthlyEstimate, money, activeServices } from '../offers/offer.js';

const CFG = {
  rkdp: { base: '#/oferty', back: ['#/klienci', '← Klienci'], clientTable: 'clients', clientField: 'client_id', eyebrow: 'RKDP · Oferty' },
  m2: { base: '#/doradztwo/oferty', back: ['#/doradztwo/zlecenia', '← Zlecenia i umowy'], clientTable: 'm2_clients', clientField: 'm2_client_id', eyebrow: 'M2 TAX · Oferty' },
};
const STATUS = { projekt: 'Projekt', wyslana: 'Wysłana', zaakceptowana: 'Zaakceptowana', odrzucona: 'Odrzucona' };
const STATUS_CLS = { projekt: 'unk', wyslana: 'wait', zaakceptowana: 'done', odrzucona: 'no' };
const dShort = iso => iso ? iso.slice(0, 10).split('-').reverse().join('.') : '';
const HELP = `Oferta na usługi w PDF – z okładką, zakresem usług, cennikiem i warunkami, w szacie graficznej firmy.

• Klient: wybierz z bazy albo wpisz dane (NIP pobierze dane z Białej listy VAT).
• Usługi: zaznacz doradztwo podatkowe, księgowość (KPiR / ryczałt / księgi rachunkowe) i kadry. Zakres usług podpowiada się z naszych wzorów umów – możesz go zmienić (każdy punkt w osobnej linii).
• Cennik: pozycje z umów; wpisz ceny. Pozycje bez ceny pokażą się jako „do uzgodnienia”. Zaznacz „Σ” przy pozycjach miesięcznych, a oferta policzy szacunkowy koszt miesięczny (dla kadr wpisz liczbę osób).
• Warunki współpracy – każdy punkt w osobnej linii.
• „Podgląd / PDF” otwiera gotowy dokument – w oknie drukowania wybierz „Zapisz jako PDF”.
• Oferty zapisują się z numerem OF/rok/numer; status (wysłana, zaakceptowana…) pomaga śledzić, co się dzieje z ofertą.`;

export async function renderOferty(main, id, brand = 'rkdp') {
  const C = CFG[brand];
  if (id) return renderEditor(main, id === 'nowa' ? null : id, brand);
  const { data: rows, error } = await sb.from('offers').select('id, number, client_name, offer_date, status, params, updated_at').eq('brand', brand).order('offer_date', { ascending: false }).order('number', { ascending: false });
  if (error) throw error;
  main.replaceChildren(
    h('a', { href: C.back[0], class: 'small', style: { fontWeight: 600, textDecoration: 'none', display: 'inline-block', marginTop: brand === 'm2' ? '28px' : 0 } }, C.back[1]),
    h('div', { class: 'page-head', style: { marginTop: '10px' } },
      h('div', {}, h('p', { class: 'eyebrow' }, C.eyebrow),
        h('h1', { style: { marginTop: '6px', display: 'flex', alignItems: 'center' } }, 'Oferty', infoTip(HELP, 'Oferty – instrukcja')),
        h('p', { class: 'sub' }, 'Profesjonalne oferty na doradztwo podatkowe, księgowość i kadry – w PDF, z cennikiem z naszych umów.')),
      h('div', { class: 'row-btns' },
        brand === 'm2' ? h('a', { class: 'btn btn-outline', href: `${C.base}/nowa?typ=partner` }, icon('plus'), 'Oferta dla biura rachunkowego') : null,
        h('a', { class: 'btn btn-primary', href: `${C.base}/nowa` }, icon('plus'), 'Nowa oferta'))),
    h('div', { class: 'list-wrap' }, h('table', { class: 'list' },
      h('thead', {}, h('tr', {}, ...['Numer', 'Klient', 'Usługi', 'Data', 'Koszt mies.', 'Status'].map(x => h('th', {}, x)))),
      h('tbody', {}, ...((rows || []).length ? rows.map(r => {
        const est = monthlyEstimate(r.params || {});
        return h('tr', { class: 'click', onclick: () => { location.hash = `${C.base}/${r.id}`; } },
          h('td', {}, h('b', {}, r.number || '—')), h('td', {}, r.client_name || '—'),
          h('td', { class: 'small' }, (r.params?.title || autoTitle(r.params || {}))),
          h('td', {}, dShort(r.offer_date)), h('td', {}, est !== null ? money(est) : '—'),
          h('td', {}, h('span', { class: 'pill ' + (STATUS_CLS[r.status] || 'unk') }, STATUS[r.status] || r.status)));
      }) : [h('tr', {}, h('td', { colspan: 6, class: 'empty' }, 'Brak ofert. Utwórz pierwszą przyciskiem „Nowa oferta”.'))])))));
}

async function renderEditor(main, id, brand) {
  const C = CFG[brand], B = OFFER_BRANDS[brand];
  const clients = await fetchAll(() => sb.from(C.clientTable).select('*').order('name'));
  let row = null;
  if (id) {
    const { data, error } = await sb.from('offers').select('*').eq('id', id).single();
    if (error) throw error;
    row = data;
  }
  const qp = new URLSearchParams(location.hash.split('?')[1] || '');
  const preClient = !row && qp.get('klient');
  let clientId = row ? (row[C.clientField] || '') : (preClient || '');
  const o = row ? row.params : offerDefaults(brand, clients.find(c => c.id === clientId) || {}, qp.get('typ') || '');
  for (const k of ['ksiegowosc', 'kadry', 'doradztwo', ...(brand === 'm2' ? ['partner'] : [])]) if (!o.services[k]) o.services[k] = { ...serviceDefaults(k, brand), on: false };
  let status = row?.status || 'projekt';
  let dirty = false;
  const info = h('span', { class: 'small muted' }, row ? `${row.number} · zapisano ${dShort(row.updated_at)}` : 'Nowa oferta – niezapisana');
  const mark = () => { dirty = true; info.textContent = 'Niezapisane zmiany'; updEst(); };

  const inp = (obj, key, label, opt = {}) => {
    const el = opt.area ? h('textarea', { class: 'input', rows: opt.rows || 4 }, obj[key] ?? '') : h('input', { class: 'input', type: opt.type || 'text', value: obj[key] ?? '', placeholder: opt.ph || '', inputmode: opt.num ? 'decimal' : null });
    el.addEventListener('input', () => { obj[key] = el.value; mark(); });
    return h('label', { class: 'field' + (opt.wide || opt.area ? ' wide' : '') }, h('span', {}, label), el, opt.hint ? h('small', { class: 'hint' }, opt.hint) : null);
  };
  const chk = (obj, key, label, onChange) => {
    const el = h('input', { type: 'checkbox', checked: !!obj[key] && obj[key] !== false });
    el.addEventListener('change', () => { obj[key] = el.checked; mark(); onChange?.(); });
    return h('label', { class: 'check' }, el, label);
  };

  // ---- klient ----
  const clientBox = h('section', { class: 'card section' });
  function drawClient() {
    const sel = h('select', { class: 'select' }, h('option', { value: '' }, '— nowy klient / wpiszę ręcznie —'), ...clients.map(c => h('option', { value: c.id }, c.name)));
    sel.value = clientId;
    sel.addEventListener('change', () => {
      clientId = sel.value; const c = clients.find(x => x.id === clientId) || {};
      Object.assign(o.client, { name: c.name || '', nip: c.nip || '', address: c.address || '', person: c.contact_person || '', email: c.email || '' });
      mark(); drawClient();
    });
    const nipBtn = h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: async () => {
      if (!validNip(o.client.nip || '')) return toast('Wpisz poprawny NIP', true);
      try { const r = await lookupNip(o.client.nip); if (!r.found) return toast('Nie znaleziono w wykazie VAT', true);
        Object.assign(o.client, { name: r.name || o.client.name, address: r.address || o.client.address }); mark(); drawClient(); toast('Pobrano dane z Białej listy VAT'); } catch (e) { fail(e); }
    } }, 'Pobierz po NIP');
    clientBox.replaceChildren(h('div', { class: 'section-head' }, h('h2', {}, 'Klient')),
      h('div', { class: 'form-grid' },
        h('label', { class: 'field wide' }, h('span', {}, 'Klient z bazy (opcjonalnie)'), sel),
        inp(o.client, 'name', 'Nazwa / imię i nazwisko', { wide: true }),
        h('div', { class: 'field' }, h('span', {}, 'NIP'), h('div', { style: { display: 'flex', gap: '8px' } }, (() => { const e = h('input', { class: 'input', value: o.client.nip || '', style: { flex: 1 } }); e.addEventListener('input', () => { o.client.nip = e.value; mark(); }); return e; })(), nipBtn)),
        inp(o.client, 'person', 'Osoba kontaktowa (opcjonalnie)'),
        inp(o.client, 'address', 'Adres', { wide: true }), inp(o.client, 'email', 'E-mail (opcjonalnie)')));
  }
  drawClient();

  // ---- usługi i cennik ----
  const rowsEditor = (rows) => {
    const box = h('div', { class: 'of-rows' });
    const draw = () => box.replaceChildren(...[
      rows.length ? h('div', { class: 'of-row of-head' }, h('span', {}, 'Opis pozycji'), h('span', {}, 'Cena (zł netto)'), h('span', {}, 'Jednostka'), h('span', { 'data-tip': 'Liczba (np. osób przy kadrach)' }, 'Ilość'), h('span', { 'data-tip': 'Wliczaj do szacunkowego kosztu miesięcznego' }, 'Σ'), h('span', {})) : null,
      ...rows.map((r, i) => {
        const f = (key, ph, cls) => { const e = h('input', { class: 'input ' + (cls || ''), value: r[key] ?? '', placeholder: ph || '' }); e.addEventListener('input', () => { r[key] = e.value; mark(); }); return e; };
        const s = h('input', { type: 'checkbox', checked: !!r.sum }); s.addEventListener('change', () => { r.sum = s.checked; mark(); });
        return h('div', { class: 'of-row' },
          f('label', 'Nazwa pozycji', 'of-lab'),
          h('button', { class: 'icon-btn of-del', type: 'button', 'aria-label': 'Usuń pozycję', onclick: () => { rows.splice(i, 1); mark(); draw(); } }, '✕'),
          f('desc', 'Opis (opcjonalnie)', 'of-desc'),
          f('price', 'np. 450', 'of-num'), f('unit', 'zł netto / mies.'), f('qty', '1', 'of-num'),
          h('label', { class: 'check of-sum', 'data-tip': 'Wliczaj do kosztu miesięcznego' }, s));
      }),
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { rows.push({ label: '', desc: '', price: '', unit: 'zł netto / mies.', qty: 1, sum: false }); mark(); draw(); } }, icon('plus'), 'Dodaj pozycję')].filter(Boolean));
    draw();
    return box;
  };
  const svcBox = h('div');
  const SV = [...(brand === 'm2' ? [['partner', 'Program Partner – doradztwo dla biura rachunkowego']] : []), ['doradztwo', 'Doradztwo podatkowe'], ['ksiegowosc', 'Księgowość'], ['kadry', 'Kadry i płace']];
  // pakiety Programu Partner: nazwa, cena, opis, cechy (tabela porównawcza w ofercie) i pakiet proponowany
  const packagesEditor = s => h('div', { class: 'pk-ed' }, ...(s.packages || []).map(pk => {
    const radio = h('input', { type: 'radio', name: 'pk-chosen', checked: s.chosen === pk.key });
    radio.addEventListener('change', () => { s.chosen = pk.key; mark(); drawServices(); });
    return h('div', { class: 'pk-ed-card' + (s.chosen === pk.key ? ' on' : '') },
      h('label', { class: 'check pk-ed-pick' }, radio, 'Proponujemy ten pakiet'),
      h('div', { class: 'form-grid' }, inp(pk, 'name', 'Nazwa pakietu'), inp(pk, 'price', 'Cena (zł netto, puste = wycena indywidualna)', { num: true }),
        inp(pk, 'unit', 'Jednostka'), inp(pk, 'tagline', 'Dla kogo (jedno zdanie)', { wide: true }),
        ...PARTNER_FEATURES.map(([k, label, type]) => type === 'bool' ? h('div', { class: 'field' }, chk(pk.f, k, label)) : inp(pk.f, k, label))));
  }));
  function drawServices() {
    svcBox.replaceChildren(...SV.map(([k, label]) => {
      const s = o.services[k];
      const head = h('div', { class: 'section-head' }, h('h2', {}, chk(s, 'on', label, drawServices)));
      if (!s.on) return h('section', { class: 'card section of-off' }, head);
      if (k === 'partner') return h('section', { class: 'card section' }, head,
        h('p', { class: 'hint' }, 'Oferta pokaże trzy pakiety obok siebie z tabelą porównawczą; zaznaczony pakiet jest wyróżniony i liczy się do kosztu miesięcznego. W najtańszym pakiecie odpowiedzi są tylko e-mailowe.'),
        h('div', { class: 'form-grid' }, inp(s, 'scope', 'W każdym pakiecie – każdy punkt w osobnej linii', { area: true, rows: 7 })),
        h('p', { class: 'field-label', style: { margin: '14px 0 6px' } }, 'Pakiety'), packagesEditor(s),
        h('p', { class: 'field-label', style: { margin: '14px 0 6px' } }, 'Poza pakietem'), rowsEditor(s.rows));
      const formSel = k === 'ksiegowosc' ? (() => {
        const e = h('select', { class: 'select' }, ...Object.entries(BOOK_FORMS).map(([v, l]) => h('option', { value: v }, l)));
        e.value = s.form || 'kpir';
        e.addEventListener('change', () => { const keepPrices = s.rows.map(r => r.price); Object.assign(s, serviceDefaults('ksiegowosc', brand, { form: e.value })); s.rows.forEach((r, i) => { if (keepPrices[i]) r.price = keepPrices[i]; }); mark(); drawServices(); });
        return h('label', { class: 'field wide' }, h('span', {}, 'Forma księgowości'), e);
      })() : null;
      return h('section', { class: 'card section' }, head,
        h('div', { class: 'form-grid' }, formSel, inp(s, 'scope', 'Zakres usług – każdy punkt w osobnej linii', { area: true, rows: 6 })),
        h('p', { class: 'field-label', style: { margin: '14px 0 6px' } }, 'Cennik'), rowsEditor(s.rows));
    }),
    h('section', { class: 'card section' }, h('div', { class: 'section-head' }, h('h2', {}, 'Dodatkowe pozycje cennika')),
      h('p', { class: 'hint', style: { marginBottom: '8px' } }, 'Np. obsługa VAT-UE, rozliczenie roczne wspólników, przygotowanie umowy spółki.'), rowsEditor(o.extras)));
  }
  drawServices();

  // ---- treść i warunki ----
  const estBox = h('div', { class: 'of-est' });
  function updEst() {
    const e = monthlyEstimate(o);
    estBox.replaceChildren(h('span', {}, 'Szacunkowy koszt miesięczny'), h('b', {}, e !== null ? `${money(e)} netto` : '—'), h('em', {}, e !== null ? `${money(e * 1.23)} brutto` : 'zaznacz „Σ” przy pozycjach miesięcznych i wpisz ceny'));
  }
  updEst();
  const signBox = brand === 'm2' ? h('div', { class: 'field wide' }, h('span', {}, 'Podpisują'),
    h('div', { style: { display: 'flex', gap: '18px', flexWrap: 'wrap' } }, ...B.people.map(k => {
      const e = h('input', { type: 'checkbox', checked: (o.signers || []).includes(k) });
      e.addEventListener('change', () => { o.signers = B.people.filter(p => p === k ? e.checked : (o.signers || []).includes(p)); if (!o.signers.length) { o.signers = [k]; e.checked = true; } mark(); });
      return h('label', { class: 'check' }, e, PEOPLE[k].name);
    }))) : h('p', { class: 'hint wide' }, 'Ofertę podpisuje Michał Ruszniak – Prezes Zarządu, doradca podatkowy.');
  const textBox = h('section', { class: 'card section' }, h('div', { class: 'section-head' }, h('h2', {}, 'Oferta')),
    h('div', { class: 'form-grid' },
      inp(o, 'offer_date', 'Data oferty', { type: 'date' }), inp(o, 'valid_until', 'Ważna do', { type: 'date' }),
      inp(o, 'title', 'Tytuł na okładce (puste = z wybranych usług)', { wide: true, ph: autoTitle(o) }),
      inp(o, 'greeting', 'Powitanie', { ph: 'Szanowni Państwo,' }),
      inp(o, 'intro', 'List przewodni (puste = tekst domyślny)', { area: true, rows: 5, hint: 'Domyślnie: ' + autoIntro(o, brand).slice(0, 140) + '…' }),
      inp(o, 'terms', 'Warunki współpracy – każdy punkt w osobnej linii', { area: true, rows: 6 }),
      signBox,
      h('div', { class: 'wide', style: { display: 'flex', gap: '18px', flexWrap: 'wrap' } }, chk(o, 'show_team', 'pokaż sekcję o doradcach'), chk(o, 'show_why', 'pokaż „Dlaczego my”'), chk(o, 'show_steps', 'pokaż „Jak zaczynamy”'))));

  // ---- zapis i PDF ----
  async function save() {
    if (!o.client.name.trim()) { toast('Wpisz nazwę klienta', true); return false; }
    if (!activeServices(o).length) { toast('Zaznacz co najmniej jedną usługę', true); return false; }
    const rec = { brand, client_name: o.client.name.trim(), offer_date: o.offer_date || null, status, params: o, [C.clientField]: clientId || null };
    const q = row ? sb.from('offers').update(rec).eq('id', row.id).select('*').single() : sb.from('offers').insert({ ...rec, created_by: state.me.id }).select('*').single();
    const { data, error } = await q;
    if (error) { fail(error); return false; }
    const isNew = !row; row = data; dirty = false; info.textContent = `${row.number} · zapisano`;
    if (isNew) history.replaceState(null, '', `${C.base}/${row.id}`);
    numEl.textContent = row.number;
    return true;
  }
  // link do oferty (podgląd bez logowania) + informacja, czy klient ją otworzył
  const linkInfo = h('p', { class: 'small muted of-linkinfo' });
  async function loadLinkInfo() {
    if (!row) return;
    const { data } = await sb.from('shared_docs').select('views,last_view_at,revoked_at').eq('ref_id', row.id);
    const act = (data || []).filter(x => !x.revoked_at), v = act.reduce((a, x) => a + (x.views || 0), 0);
    const last = act.map(x => x.last_view_at).filter(Boolean).sort().pop();
    linkInfo.textContent = !act.length ? '' : v ? `Klient otworzył ofertę ${v} ${v === 1 ? 'raz' : 'razy'} · ostatnio ${new Date(last).toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'Link utworzony – oferta jeszcze nieotwarta';
  }
  async function shareOffer() {
    if (dirty || !row) { if (!(await save())) return; }
    const { shareDialog } = await import('../udostepnij.js');
    shareDialog({ kind: 'oferta', brand, title: `Oferta ${row.number}`, refId: row.id, label: o.client.name || '', validDays: '', onCreate: async () => {
      loadLinkInfo();
      if (status === 'projekt') { status = 'wyslana'; statusSel.value = status; await sb.from('offers').update({ status }).eq('id', row.id); }
    } });
  }
  loadLinkInfo();
  async function pdf() {
    if (dirty || !row) { if (!(await save())) return; }
    printHtml(offerHtml(o, brand, { number: row.number }));
  }
  const statusSel = h('select', { class: 'select' }, ...Object.entries(STATUS).map(([k, v]) => h('option', { value: k }, v)));
  statusSel.value = status;
  statusSel.addEventListener('change', () => { status = statusSel.value; mark(); });
  const numEl = h('span', {}, row?.number || 'nowa');

  main.replaceChildren(
    h('a', { href: C.base, class: 'small', style: { fontWeight: 600, textDecoration: 'none', display: 'inline-block', marginTop: brand === 'm2' ? '28px' : 0 } }, '← Wszystkie oferty'),
    h('div', { class: 'page-head', style: { marginTop: '10px' } },
      h('div', {}, h('p', { class: 'eyebrow' }, C.eyebrow, ' · ', numEl),
        h('h1', { style: { marginTop: '6px', display: 'flex', alignItems: 'center' } }, row ? `Oferta dla: ${o.client.name || '…'}` : 'Nowa oferta', infoTip(HELP, 'Oferty – instrukcja'))),
      h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } }, h('label', { class: 'field' }, h('span', {}, 'Status'), statusSel),
        isAdmin() && row ? h('button', { class: 'btn btn-danger btn-sm', onclick: async () => {
          if (!confirm(`Usunąć ofertę ${row.number}?`)) return;
          const { error } = await sb.from('offers').delete().eq('id', row.id); if (error) return fail(error);
          toast('Usunięto'); location.hash = C.base;
        } }, 'Usuń') : null)),
    h('div', { class: 'two' },
      h('div', {}, clientBox, svcBox, textBox),
      h('div', {}, h('section', { class: 'card section of-side' },
        h('img', { src: B.logo, alt: B.short, class: 'of-logo' }),
        estBox,
        h('button', { class: 'btn btn-primary', style: { width: '100%' }, onclick: () => pdf().catch(e => fail(e)) }, icon('download'), 'Podgląd / PDF'),
        h('button', { class: 'btn btn-outline', style: { width: '100%', marginTop: '8px' }, onclick: () => shareOffer().catch(e => fail(e)), 'data-tip': 'Link do oferty dla klienta – podgląd bez logowania, zawsze aktualna wersja, z licznikiem otwarć' }, '🔗 Link do oferty'),
        linkInfo,
        h('button', { class: 'btn btn-outline', style: { width: '100%', marginTop: '8px' }, onclick: () => save().then(ok => ok && toast('Zapisano ofertę')) }, 'Zapisz'),
        h('p', { class: 'hint', style: { marginTop: '10px' } }, 'W oknie drukowania wybierz „Zapisz jako PDF”. Okładka i tło drukują się w kolorze.')))),
    h('div', { class: 'savebar' }, info,
      h('button', { class: 'btn btn-outline', onclick: () => shareOffer().catch(e => fail(e)) }, '🔗 Link'),
      h('button', { class: 'btn btn-outline', onclick: () => save().then(ok => ok && toast('Zapisano ofertę')) }, 'Zapisz'),
      h('button', { class: 'btn btn-primary', onclick: () => pdf().catch(e => fail(e)) }, icon('download'), 'PDF')));
  const beforeUnload = e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', beforeUnload);
  return () => window.removeEventListener('beforeunload', beforeUnload);
}
