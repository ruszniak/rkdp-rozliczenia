// M2 TAX – zakładka „Dokumenty”: wzory pism procesowych na papierze firmowym, z wyborem pełnomocnika. Pobierane jako Word (do dalszej edycji) albo PDF.
import { h, toast, fail, icon, infoTip, printHtml } from '../ui.js';
import { sb } from '../store.js';
import { fetchAll } from './rozliczenia.js';
import { PISMA, pismoBlocks, pismoBrand } from '../m2/pisma.js';
import { orderHtml, printableHtml, buildOrderDocx, ORDER_CSS } from '../m2/order.js';

const HELP = `Wzory pism procesowych M2 TAX na papierze firmowym:
• Wybierz rodzaj pisma, pełnomocnika (Marcin, Michał albo obaj) i – opcjonalnie – sprawę lub klienta. Dane strony, organ i sygnatura wpiszą się same.
• Wybrany pełnomocnik pojawia się pod danymi strony („reprezentowana przez Doradcę Podatkowego …”) i w podpisie. Nagłówek to papier firmowy M2 TAX.
• Miejsca do uzupełnienia są oznaczone [w nawiasach] – w Wordzie mają żółte wyróżnienie, więc łatwo je znaleźć i dopisać treść.
• „Pobierz Word” – dalsza praca nad pismem poza aplikacją. „PDF” – szybki wydruk.
• Organ podaj tak, jak ma się znaleźć w adresie (np. „Naczelnik Pierwszego Urzędu Skarbowego we Wrocławiu”), a organ, który wydał akt – w dopełniaczu (np. „Naczelnika Pierwszego Urzędu Skarbowego we Wrocławiu”).`;

const today = () => new Date().toISOString().slice(0, 10);
const LBL = { ref: 'Znak sprawy / sygnatura', actOrg: 'Organ, który wydał akt (w dopełniaczu)', actDate: 'Data', actNo: 'Numer', served: 'Data doręczenia', subject: 'Przedmiot', value: 'Kwota (zł)' };

export async function renderM2Dokumenty(main, params) {
  if (!document.getElementById('order-css')) document.head.append(h('style', { id: 'order-css' }, ORDER_CSS));
  const [signers, clients, matters] = await Promise.all([
    fetchAll(() => sb.from('m2_signers').select('*').eq('active', true).order('sort')),
    fetchAll(() => sb.from('m2_clients').select('id,name,address,nip,kind').order('name')),
    fetchAll(() => sb.from('m2_matters').select('id,number,title,client_id,authority,case_ref,tax_kind,tax_period,matter_type').order('opened_at', { ascending: false })),
  ]);
  let type = PISMA[params.get('wzor')] ? params.get('wzor') : 'pismo';
  const d = { date: today(), place: 'Wrocław', poaWhere: 'akta', client: null, who: signers[0] ? [signers[0].id] : [] };
  const chosen = () => signers.filter(s => d.who.includes(s.id));

  const applyMatter = id => {
    const m = matters.find(x => x.id === id);
    d.matter = id || null;
    if (!m) return;
    const c = clients.find(x => x.id === m.client_id);
    if (c) d.client = { ...c };
    if (m.case_ref) d.ref = m.case_ref;
    const subj = [m.tax_kind, m.tax_period ? `za ${m.tax_period}` : ''].filter(Boolean).join(' ');
    if (subj) d.subject = subj;
  };
  if (params.get('sprawa')) applyMatter(params.get('sprawa'));
  else if (params.get('klient')) { const c = clients.find(x => x.id === params.get('klient')); if (c) d.client = { ...c }; }

  const preview = h('div', { class: 'paper' });
  const draw = () => { preview.innerHTML = orderHtml(pismoBlocks(type, d, chosen()), '/m2tax-logo.png', pismoBrand(chosen())); };
  const fileBase = () => `${PISMA[type].label.replace(/[^\p{L}\p{N}]+/gu, '_')}${d.client?.name ? '_' + d.client.name.replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 40) : ''}`;

  // ---- lista wzorów ----
  const list = h('div', { class: 'pz-list' });
  const drawList = () => {
    const groups = [...new Set(Object.values(PISMA).map(p => p.group))];
    list.replaceChildren(...groups.map(g => h('div', { class: 'pz-group' }, h('p', { class: 'eyebrow' }, g),
      ...Object.entries(PISMA).filter(([, p]) => p.group === g).map(([k, p]) => h('button', { type: 'button', class: 'pz-item' + (k === type ? ' on' : ''), onclick: () => {
        type = k; delete d.addr; delete d.via; delete d.actOrg; drawList(); drawForm(); draw();
        history.replaceState(null, '', `#/doradztwo/dokumenty?wzor=${k}${d.matter ? `&sprawa=${d.matter}` : ''}`);
      } }, h('b', {}, p.label), h('span', { class: 'small muted' }, p.desc))))));
  };

  // ---- formularz ----
  const form = h('div');
  const field = (label, el, wide) => h('label', { class: 'field' + (wide ? ' wide' : '') }, h('span', {}, label), el);
  const input = (key, o = {}) => {
    const el = h(o.area ? 'textarea' : 'input', { class: 'input', type: o.type || null, rows: o.area ? 3 : null, placeholder: o.ph || '', value: o.area ? null : (d[key] ?? '') });
    if (o.area) el.value = d[key] ?? '';
    el.addEventListener('input', () => { d[key] = el.value; draw(); });
    return el;
  };
  function drawForm() {
    const T = PISMA[type];
    if (d.addr === undefined) d.addr = T.addr;
    if (d.via === undefined) d.via = T.via || '';
    if (d.actOrg === undefined) d.actOrg = T.actOrgDefault || '';
    const who = h('div', { class: 'pz-who' }, ...signers.map(s => {
      const cb = h('input', { type: 'checkbox', checked: d.who.includes(s.id) });
      cb.addEventListener('change', () => { d.who = cb.checked ? [...new Set([...d.who, s.id])] : d.who.filter(x => x !== s.id); if (!d.who.length) { d.who = [s.id]; cb.checked = true; toast('Wybierz co najmniej jednego pełnomocnika', true); } draw(); });
      return h('label', { class: 'check' }, cb, `${s.full_name} (nr ${s.license_no || '—'})`);
    }));
    const mSel = h('select', { class: 'select' }, h('option', { value: '' }, '— bez sprawy —'), ...matters.map(m => h('option', { value: m.id, selected: d.matter === m.id }, `${m.number} · ${m.title}`)));
    mSel.addEventListener('change', () => { applyMatter(mSel.value); drawForm(); draw(); });
    const cSel = h('select', { class: 'select' }, h('option', { value: '' }, '— wpisz ręcznie —'), ...clients.map(c => h('option', { value: c.id, selected: d.client?.id === c.id }, c.name)));
    cSel.addEventListener('change', () => { const c = clients.find(x => x.id === cSel.value); d.client = c ? { ...c } : { name: '', address: '', nip: '' }; drawForm(); draw(); });
    const cl = d.client || (d.client = { name: '', address: '', nip: '' });
    const cIn = (k, ph) => { const el = h('input', { class: 'input', value: cl[k] || '', placeholder: ph }); el.addEventListener('input', () => { cl[k] = el.value; draw(); }); return el; };
    const poa = h('select', { class: 'select' }, h('option', { value: 'akta', selected: d.poaWhere === 'akta' }, 'w aktach sprawy'), h('option', { value: 'zal', selected: d.poaWhere === 'zal' }, 'w załączeniu (z opłatą skarbową)'));
    poa.addEventListener('change', () => { d.poaWhere = poa.value; draw(); });
    const act = T.actLabel ? ` ${T.actLabel}` : '';
    form.replaceChildren(
      h('h2', { style: { margin: '0 0 4px' } }, T.label), h('p', { class: 'small muted', style: { margin: '0 0 12px' } }, T.desc),
      h('p', { class: 'field-label' }, 'Pełnomocnik'), who,
      h('div', { class: 'form-grid', style: { marginTop: '10px' } },
        field('Sprawa (uzupełni stronę i sygnaturę)', mSel, true),
        field('Klient z bazy', cSel, true),
        field(T.party + ' – imię i nazwisko / nazwa', cIn('name', 'np. ABC sp. z o.o.'), true),
        field('Adres', cIn('address', 'ulica, kod, miejscowość'), true),
        field('NIP', cIn('nip', 'puste = PESEL do uzupełnienia')),
        field('Pełnomocnictwo', poa),
        field('Adresat', input('addr', { area: true }), true),
        T.via ? field('Za pośrednictwem (puste = bez)', input('via', { area: true }), true) : null,
        ...T.fields.map(f => f === 'ref' ? field(T.refLabel || LBL.ref, input('ref'))
          : f === 'actOrg' ? field(LBL.actOrg, input('actOrg'), true)
          : f === 'actDate' ? field(`Data${act}`, input('actDate', { type: 'date' }))
          : f === 'actNo' ? field(`Numer${act}`, input('actNo'))
          : f === 'served' ? field(`Data doręczenia${act}`, input('served', { type: 'date' }))
          : f === 'subject' ? field(T.subjectLabel || LBL.subject, input('subject'), true)
          : f === 'value' ? field(T.valueLabel || LBL.value, input('value', { ph: 'np. 125 400' }))
          : null),
        field('Miejscowość', input('place')), field('Data pisma', input('date', { type: 'date' }))));
  }

  async function word() {
    try {
      const bytes = await buildOrderDocx(pismoBlocks(type, d, chosen()), pismoBrand(chosen()));
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
      a.download = fileBase() + '.docx'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast('Pobrano plik Word');
    } catch (e) { fail(e, 'Nie udało się przygotować pliku Word'); }
  }
  const pdf = () => printHtml(printableHtml(pismoBlocks(type, d, chosen()), fileBase(), location.origin + '/m2tax-logo.png', pismoBrand(chosen())));

  drawList(); drawForm(); draw();
  main.replaceChildren(
    h('div', { class: 'page-head', style: { marginTop: '28px' } },
      h('div', {}, h('p', { class: 'eyebrow' }, 'Doradztwo podatkowe · M2 TAX'),
        h('h1', { style: { marginTop: '6px', display: 'flex', alignItems: 'center' } }, 'Dokumenty – wzory pism', infoTip(HELP, 'Wzory pism – instrukcja')),
        h('p', { class: 'sub' }, 'Pisma procesowe na papierze firmowym M2 TAX – do pobrania w Wordzie i dalszej edycji.')),
      h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
        h('a', { class: 'btn btn-outline btn-sm', href: '#/doradztwo/wzory' }, 'Wzory umów i uchwał'),
        h('a', { class: 'btn btn-outline btn-sm', href: '#/doradztwo/kalkulator' }, 'Kalkulator JDG / spółka'),
        h('a', { class: 'btn btn-outline btn-sm', href: '#/doradztwo/jpk' }, 'Podgląd JPK'),
        h('button', { class: 'btn btn-outline btn-sm', onclick: pdf }, icon('download'), 'PDF'),
        h('button', { class: 'btn btn-primary btn-sm', onclick: word }, icon('download'), 'Pobierz Word'))),
    h('div', { class: 'pz-layout' },
      h('aside', { class: 'card pz-side' }, list),
      h('section', { class: 'card section pz-form' }, form),
      h('div', { class: 'paper-wrap pz-paper' }, preview)));
}
